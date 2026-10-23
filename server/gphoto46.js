// Prompt 46 (DATA46): bakgrunn fra et delt Google Photos-album (claude-code-bakgrunn-google-photos-album.md).
//
// Google Photos har ikke åpent API for delte album uten OAuth, men en delt lenke er offentlig: serveren følger redirecten fra
// photos.app.goo.gl til photos.google.com/share/…?key=…, henter HTML-en og plukker bilde-URL-ene (lh3.googleusercontent.com) fra
// albumdataene. Bildene lastes ned og caches lokalt per bruker (ingen hotlinking), i tre størrelser som Google lager selv:
// stor (=w2400-h2400), mobil (=w1200-h1200) og miniatyr (=w48-h48, klientene gjør den uskarp mens stor laster).
//
// SSRF-vern (kontrakten):
//   - Albumlenken: bare https://photos.app.goo.gl/<id> og https://photos.google.com/share/… (ingen port, ingen brukernavn).
//   - Redirect følges manuelt (maks 5) og bare innenfor photos.app.goo.gl / photos.google.com.
//   - Bildefiler bare fra *.googleusercontent.com over https (redirect bare innenfor samme).
//   - DNS-oppslaget sjekkes ved tilkobling (undici-agent med egen lookup): private, lokale og reserverte IP-er avvises.
//   - Maks 15 MB per bilde, 10 MB HTML, 200 bilder, tidsavbrudd på alle kall. Ingen andre verter.
// Lagres per bruker: kv(bruker, 'bg_album') = {url, items[], fetched_at, …}; filer i DATA_DIR/media/bg-gphoto/<bruker-hash>/.
import { Hono } from 'hono';
import { Agent, fetch as undiciFetch } from 'undici';
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { db, kv } from './db.js';
import { userGuard, readJson, bad, MOCK } from './homeos-common.js';

export const GP_MAX_IMAGES = 200, GP_MAX_BYTES = 15 * 1024 * 1024, GP_MAX_HTML = 10 * 1024 * 1024, GP_TIMEOUT = 15_000;
const ALBUM_HOSTS = ['photos.app.goo.gl', 'photos.google.com'];
const DIR = join(config.dataDir, 'media', 'bg-gphoto');
export const INVALID_TEXT = 'Må være en delt album-lenke fra Google Photos';
export const FAIL_TEXT = 'Fikk ikke hentet albumet · trykk for å prøve igjen';
const SIZES = { l: '=w2400-h2400', m: '=w1200-h1200', t: '=w48-h48' };

/* ---------------- SSRF-vern ---------------- */

/** Privat, lokal, delt eller reservert adresse (IPv4 og IPv6, også IPv4-mappet IPv6). */
export function isPrivateIp(ip) {
  const s = String(ip ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  const v = isIP(s);
  if (v === 4) {
    const [a, b, c] = s.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 // «denne», privat, loopback, multicast/reservert
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) // CGNAT, link-local, privat
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113); // IETF/test/benchmark
  }
  if (v === 6) {
    if (s === '::' || s === '::1') return true;
    const m = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    const h = parseInt(s.split(':')[0] || '0', 16);
    return (h & 0xfe00) === 0xfc00 || (h & 0xffc0) === 0xfe80 || (h & 0xff00) === 0xff00 || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true; // ikke en IP-adresse → avvis
}
/** DNS-oppslag som avviser private adresser – brukes ved selve tilkoblingen, så DNS-rebinding ikke slipper gjennom. */
function safeLookup(host, opts, cb) {
  dnsLookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: opts?.family ?? 4 }];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error(`Avvist adresse for ${host}`), { code: 'EBLOCKED' }));
    if (opts?.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}
const agent = new Agent({ connect: { lookup: safeLookup, timeout: GP_TIMEOUT } });
let F = (u, i) => undiciFetch(u, { ...i, dispatcher: agent });
let injected = false;
/** Bare for tester. */
export const _setGphotoFetch46 = (fn) => { F = fn ?? ((u, i) => undiciFetch(u, { ...i, dispatcher: agent })); injected = !!fn; };
const mockMode = () => MOCK && !injected;

/** Godkjent albumlenke → normalisert URL, ellers null. */
export function albumUrl46(input) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (h === 'photos.app.goo.gl' && /^\/[A-Za-z0-9_-]{6,64}\/?$/.test(u.pathname)) return `https://photos.app.goo.gl${u.pathname.replace(/\/$/, '')}`;
  if (h === 'photos.google.com' && /^\/(u\/\d\/)?share\/[A-Za-z0-9_-]{10,200}\/?$/.test(u.pathname)) return `https://photos.google.com${u.pathname.replace(/\/$/, '')}${u.searchParams.get('key') ? `?key=${encodeURIComponent(u.searchParams.get('key'))}` : ''}`;
  return null;
}
const albumHostOk = (u) => u.protocol === 'https:' && !u.port && !u.username && ALBUM_HOSTS.includes(u.hostname.toLowerCase());
const imageHostOk = (u) => u.protocol === 'https:' && !u.port && !u.username && /(^|\.)googleusercontent\.com$/i.test(u.hostname) && !isIP(u.hostname);

/** GET med manuell redirect innenfor tillatte verter og maks størrelse. */
export async function guardedGet46(url, { hostOk, maxBytes, accept = '*/*' }) {
  let cur = new URL(url);
  for (let hop = 0; hop <= 5; hop++) {
    if (!hostOk(cur)) throw Object.assign(new Error(`Vert ikke tillatt: ${cur.hostname}`), { code: 'EHOST' });
    const res = await F(cur.toString(), { redirect: 'manual', headers: { Accept: accept, 'Accept-Language': 'nb-NO,nb;q=0.9,en;q=0.5', 'User-Agent': 'Mozilla/5.0 (homelab-os bakgrunn)' }, signal: AbortSignal.timeout(GP_TIMEOUT) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      try { await res.body?.cancel?.(); } catch { /* */ }
      if (!loc) throw new Error('Redirect uten adresse');
      cur = new URL(loc, cur);
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`Svarte ${res.status}`), { status: res.status });
    const len = +res.headers.get('content-length');
    if (len && len > maxBytes) throw Object.assign(new Error('For stor fil'), { code: 'ESIZE' });
    const chunks = []; let n = 0;
    if (res.body && typeof res.body.getReader === 'function') {
      const rd = res.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > maxBytes) { try { await rd.cancel(); } catch { /* */ } throw Object.assign(new Error('For stor fil'), { code: 'ESIZE' }); } chunks.push(Buffer.from(value)); }
    } else { const b = Buffer.from(await res.arrayBuffer()); if (b.length > maxBytes) throw Object.assign(new Error('For stor fil'), { code: 'ESIZE' }); chunks.push(b); }
    return { buf: Buffer.concat(chunks), type: res.headers.get('content-type') ?? '', finalUrl: cur.toString() };
  }
  throw new Error('For mange redirecter');
}

/* ---------------- Albumdata ---------------- */

/** Bilde-URL-ene i albumsiden: ["https://lh3.googleusercontent.com/…",bredde,høyde,…]. Hopper over avatarer, små bilder og video. */
export function extractImages46(html) {
  const s = String(html ?? '').replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/\\"/g, '"');
  const re = /\["(https:\/\/lh3\.googleusercontent\.com\/[^"\s\\]+)",(\d+),(\d+)/g;
  const out = [], seen = new Set();
  let m;
  while ((m = re.exec(s)) && out.length < GP_MAX_IMAGES) {
    const base = m[1].split('=')[0];
    let p; try { p = new URL(base); } catch { continue; }
    if (/^\/a-?\//.test(p.pathname) || /^\/(ogw|pp)\//.test(p.pathname)) continue; // profilbilder
    const w = +m[2], h = +m[3];
    if (w < 256 || h < 256) continue;
    // Video: albumdataene har et videoblokk (76647426) rett etter elementet. Stillbildet hoppes over.
    const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 700);
    const next = tail.indexOf('["https://lh3.googleusercontent.com/');
    if ((next < 0 ? tail : tail.slice(0, next)).includes('76647426')) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({ base, w, h });
  }
  return out;
}
const idOf = (base) => createHash('sha256').update(base).digest('hex').slice(0, 20);
const userDir = (u) => join(DIR, createHash('sha256').update(`gp:${u}`).digest('hex').slice(0, 24));

/** Lyshet fra en 1×1 PNG (=w1-h1-rp) – 'light' | 'dark' | null. Bare gråtone, RGB, RGBA og palett. */
export function pngLightness46(buf) {
  try {
    if (!buf || buf.readUInt32BE(0) !== 0x89504e47) return null;
    let off = 8, ct = 0, depth = 8, plte = null; const idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
      if (type === 'IHDR') { depth = data[8]; ct = data[9]; }
      else if (type === 'PLTE') plte = data;
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      off += 12 + len;
    }
    if (depth !== 8) return null;
    const raw = inflateSync(Buffer.concat(idat));
    const px = raw.subarray(1); // første (eneste) linje uten filterbyte; for ett piksel gir alle filtre samme verdi
    let r, g, b;
    if (ct === 0 || ct === 4) r = g = b = px[0];
    else if (ct === 2 || ct === 6) [r, g, b] = [px[0], px[1], px[2]];
    else if (ct === 3 && plte) [r, g, b] = [plte[px[0] * 3], plte[px[0] * 3 + 1], plte[px[0] * 3 + 2]];
    else return null;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return { light: l > 0.6 ? 'light' : 'dark', luma: Math.round(l * 100) / 100 };
  } catch { return null; }
}

/* ---------------- Lagring og nedlasting ---------------- */

const KEY = 'bg_album';
const albumOf = (u) => kv.get(u, KEY, null);
const saveAlbum = (u, a) => kv.set(u, KEY, a);
const isJpegOrImg = (b) => b.length > 100 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.slice(8, 12).toString() === 'WEBP');

async function downloadItem(u, item) {
  const dir = userDir(u);
  await mkdir(dir, { recursive: true });
  for (const [k, suf] of Object.entries(SIZES)) {
    const file = join(dir, `${item.id}-${k}.jpg`);
    try { await stat(file); continue; } catch { /* lastes ned */ }
    const { buf } = await guardedGet46(item.base + suf, { hostOk: imageHostOk, maxBytes: GP_MAX_BYTES, accept: 'image/*' });
    if (!isJpegOrImg(buf)) throw new Error('Ikke et bilde');
    await writeFile(file, buf);
  }
  if (item.light === undefined) {
    try { const { buf } = await guardedGet46(`${item.base}=w1-h1-rp`, { hostOk: imageHostOk, maxBytes: 64 * 1024, accept: 'image/png' }); const r = pngLightness46(buf); item.light = r?.light ?? null; item.luma = r?.luma ?? null; }
    catch { item.light = null; }
  }
  item.ok = true;
  return item;
}

/** Hent albumet (følger redirect), plukk bildene. Kaster ved privat/tomt album. */
export async function fetchAlbum46(url) {
  const { buf } = await guardedGet46(url, { hostOk: albumHostOk, maxBytes: GP_MAX_HTML, accept: 'text/html' });
  const items = extractImages46(buf.toString('utf8'));
  if (!items.length) throw Object.assign(new Error('Albumet er tomt eller ikke delt'), { code: 'EEMPTY' });
  return items.map((x) => ({ id: idOf(x.base), base: x.base, w: x.w, h: x.h }));
}

const MOCK_ITEMS = ['oslo', 'weather-clear', 'weather-cloudy', 'weather-snow'].map((n, i) => ({ id: `demo${i}`, mock: `/api/bg/${n}.jpg`, w: 2400, h: 1600, light: i === 3 ? 'light' : 'dark', ok: true }));

const inflight = new Map();
/** Hent (eller oppdater) albumet for brukeren. Feiler det, beholdes siste liste og bilde, og feilen lagres. */
export async function refreshAlbum46(u, url, { first = false } = {}) {
  if (inflight.has(u)) return inflight.get(u);
  const p = (async () => {
    const prev = albumOf(u);
    const keep = prev && prev.url === url ? prev : null;
    try {
      let items;
      if (mockMode()) items = MOCK_ITEMS.map((x) => ({ ...x }));
      else {
        const fresh = await fetchAlbum46(url);
        const old = new Map((keep?.items ?? []).map((x) => [x.id, x]));
        items = fresh.map((x) => ({ ...x, ...(old.get(x.id) ? { light: old.get(x.id).light, luma: old.get(x.id).luma, ok: old.get(x.id).ok } : {}) }));
      }
      const a = { url, items, fetched_at: Date.now(), ok_at: Date.now(), error: null, offset: keep?.offset ?? 0, created_at: keep?.created_at ?? Date.now() };
      saveAlbum(u, a);
      if (!mockMode()) {
        const cur = currentItem(a);
        try { await downloadItem(u, cur); saveAlbum(u, a); } catch (e) { if (first) throw e; }
        prefetch(u);
      }
      return { ok: true, album: a };
    } catch (e) {
      console.warn(`[bg46] Google Photos: ${e.code ?? ''} ${e.message}`);
      if (keep?.items?.length) { saveAlbum(u, { ...keep, fetched_at: Date.now(), error: FAIL_TEXT }); return { ok: false, album: albumOf(u), error: FAIL_TEXT }; }
      if (first) return { ok: false, album: null, error: e.code === 'EEMPTY' ? 'Albumet er tomt eller ikke delt. ' + FAIL_TEXT : FAIL_TEXT };
      saveAlbum(u, { url, items: [], fetched_at: Date.now(), ok_at: null, error: FAIL_TEXT, offset: 0 });
      return { ok: false, album: albumOf(u), error: FAIL_TEXT };
    }
  })().finally(() => inflight.delete(u));
  inflight.set(u, p);
  return p;
}
// Resten av bildene lastes ned i bakgrunnen, to om gangen.
const prefetching = new Set();
function prefetch(u) {
  if (prefetching.has(u)) return;
  prefetching.add(u);
  (async () => {
    const a = albumOf(u);
    const todo = (a?.items ?? []).filter((x) => !x.ok);
    for (let i = 0; i < todo.length; i += 2) {
      await Promise.all(todo.slice(i, i + 2).map((it) => downloadItem(u, it).catch(() => { it.ok = false; })));
      const cur = albumOf(u);
      if (!cur || cur.url !== a.url) return;
      const byId = new Map(todo.map((x) => [x.id, x]));
      saveAlbum(u, { ...cur, items: cur.items.map((x) => (byId.get(x.id)?.ok ? { ...x, ok: true, light: byId.get(x.id).light, luma: byId.get(x.id).luma } : x)) });
    }
  })().catch(() => {}).finally(() => prefetching.delete(u));
}

/* ---------------- Rotasjon og utdata ---------------- */

const HOUR = 3600_000;
/** Nytt bilde hver time, likt på alle enheter: (timer siden epoke + «Neste bilde»-forskyvning) mod antall. */
export const indexAt46 = (n, t = Date.now(), offset = 0) => (n ? (((Math.floor(t / HOUR) + offset) % n) + n) % n : -1);
function currentItem(a, t = Date.now()) { const i = indexAt46(a.items.length, t, a.offset ?? 0); return i < 0 ? null : a.items[i]; }
const img = (it, k) => (it.mock ? it.mock : `/api/bg/gphoto/img/${it.id}-${k}.jpg`);
export function albumOut46(a, t = Date.now()) {
  if (!a) return { configured: false, url: null };
  const it = currentItem(a, t), i = indexAt46(a.items.length, t, a.offset ?? 0);
  const host = (() => { try { const x = new URL(a.url); return `${x.hostname}${x.pathname}`.slice(0, 40); } catch { return ''; } })();
  return {
    configured: true, url: a.url, count: a.items.length, fetchedAt: a.fetched_at ? new Date(a.fetched_at).toISOString() : null, okAt: a.ok_at ? new Date(a.ok_at).toISOString() : null,
    error: a.error ?? null, rowText: a.error ? FAIL_TEXT : `Bytter bilde hver time · ${host.length >= 40 ? host + '…' : host}`,
    current: it ? { index: i, id: it.id, large: img(it, 'l'), mobile: img(it, 'm'), thumb: img(it, 't'), width: it.w, height: it.h, light: it.light ?? null,
      textColor: it.light === 'light' ? 'dark' : 'light', overlay: 'OV' } : null,
    next: a.items.length > 1 ? (() => { const n = a.items[indexAt46(a.items.length, t + HOUR, a.offset ?? 0)]; return { id: n.id, large: img(n, 'l'), mobile: img(n, 'm'), thumb: img(n, 't') }; })() : null,
    nextChangeAt: new Date((Math.floor(t / HOUR) + 1) * HOUR).toISOString(), choice: { mob2a_bg: 'gphoto', papir_bg_gphoto: a.url },
  };
}

/* ---------------- API (/api/bg/gphoto) ---------------- */

export const gphoto46Api = new Hono();
gphoto46Api.use('/gphoto', userGuard);
gphoto46Api.use('/gphoto/*', userGuard);
gphoto46Api.get('/gphoto', (c) => c.json(albumOut46(albumOf(c.get('user')))));
gphoto46Api.post('/gphoto', async (c) => {
  const u = c.get('user'), b = await readJson(c);
  const url = albumUrl46(b.url);
  if (!url) return c.json({ ok: false, error: INVALID_TEXT, code: 'invalid_url' }, 400);
  const r = await refreshAlbum46(u, url, { first: true });
  if (!r.ok && !r.album?.items?.length) return c.json({ ok: false, error: r.error, code: 'fetch_failed', ...albumOut46(albumOf(u)) }, 502);
  return c.json({ ok: r.ok, ...(r.ok ? { message: 'Henter bilder fra albumet …' } : { error: r.error }), ...albumOut46(albumOf(u)) });
});
gphoto46Api.post('/gphoto/refresh', async (c) => {
  const u = c.get('user'), a = albumOf(u);
  if (!a) return bad(c, 'Ingen album valgt', 404);
  const r = await refreshAlbum46(u, a.url);
  return c.json({ ok: r.ok, ...(r.error ? { error: r.error } : {}), ...albumOut46(albumOf(u)) });
});
gphoto46Api.post('/gphoto/next', (c) => {
  const u = c.get('user'), a = albumOf(u);
  if (!a?.items?.length) return bad(c, 'Ingen bilder i albumet', 404);
  a.offset = ((a.offset ?? 0) + 1) % a.items.length;
  saveAlbum(u, a);
  const cur = currentItem(a);
  if (cur && !cur.ok && !mockMode()) downloadItem(u, cur).then(() => saveAlbum(u, { ...albumOf(u), items: albumOf(u).items.map((x) => (x.id === cur.id ? cur : x)) })).catch(() => {});
  return c.json(albumOut46(a));
});
gphoto46Api.delete('/gphoto', async (c) => {
  const u = c.get('user');
  kv.del ? kv.del(u, KEY) : kv.set(u, KEY, null);
  await rm(userDir(u), { recursive: true, force: true }).catch(() => {});
  return c.json({ ok: true, configured: false });
});
const FILE_RE = /^([a-f0-9]{20})-([lmt])\.jpg$/;
gphoto46Api.get('/gphoto/img/:file', async (c) => {
  const u = c.get('user'), m = FILE_RE.exec(c.req.param('file'));
  if (!m) return c.json({ error: 'Ugyldig fil' }, 400);
  const a = albumOf(u), it = a?.items?.find((x) => x.id === m[1]);
  if (!it) return c.json({ error: 'Fant ikke bildet' }, 404); // bare brukerens egne bilder
  const file = join(userDir(u), c.req.param('file'));
  let body;
  try { body = await readFile(file); } catch {
    if (mockMode()) return c.json({ error: 'Fant ikke bildet' }, 404);
    try { await downloadItem(u, it); body = await readFile(file); } catch { return c.json({ error: FAIL_TEXT }, 502); }
  }
  const type = body[0] === 0x89 ? 'image/png' : body.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg';
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
});

/* ---------------- Daglig oppdatering ---------------- */

let timer = null;
export function startGphoto46() {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(async () => {
    for (const { user } of db.prepare('SELECT user FROM kv WHERE key=?').all(KEY)) {
      const a = albumOf(user);
      if (a?.url && Date.now() - (a.fetched_at ?? 0) > 24 * HOUR) await refreshAlbum46(user, a.url).catch(() => {});
    }
  }, HOUR);
  timer.unref?.();
}
