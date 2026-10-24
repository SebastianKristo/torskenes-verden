// Prompt 50 (SRVMEDIA50): Media – nedlastinger som ikke starter, og plakater som skal vises med en gang.
//   claude-code-media-qbit-starter-ikke.md  → sann status for et søk (sporing), diagnostikk ledd 2–6, start stoppede torrenter
//   claude-code-media-bilder-raskt.md       → /api/media/bilde/… (diskcache, WebP, ETag, immutable med ?v=), ThumbHash i listene
// Rotårsaken og hele kjeden er dokumentert i docs/media-nedlasting-50.md. API-formene står i SERVER50-API.md (scratchpad) og under.
//
//   GET  /api/media/bilde/{serie|film}/{id}/{poster|fanart|banner}?w=160|320|640|1280&v=<versjon>[&uid=&sig=]
//   POST /api/media/track {episodeId|episodeIds|movieId|movieIds, commandId?, grabbed?} → 201 Track     (G)
//   GET  /api/media/track/:id → Track · GET /api/media/track?episodeId=|movieId= → Track (siste for elementet)  (G)
//   POST /api/media/torrents/:hash/start → {ok, torrent, message}  (qBittorrent 5.x /start, reserve /resume for 4.x)  (G)
//   GET  /api/media/diagnostics[?service=sonarr|radarr] · POST {episodeId?|movieId?} → Diagnostikk (bare admin)
//   POST /api/media/command og /api/media/glimt (media43.js) får `track` i svaret (mellomvare her).
// Sikkerhet: tjenestenøkler og passord logges aldri og sendes aldri ut (nedlastingsklienten vises som «passord satt/ikke satt»).
// Bilder: bare id-er fra eget bibliotek, kilden er den konfigurerte Sonarr/Radarr (MediaCover) eller image.tmdb.org – aldri en
// adresse fra klienten (SSRF). Bilder skaleres med ImageMagick; uten ImageMagick sendes originalen (og ingen hash).
import { Hono } from 'hono';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { authOrToken } from './mobile.js';
import { isAdmin, userInfo } from './auth.js';
import * as M from './media43.js';
import { rgbaToThumbHash50, thumbHashB64_50 } from './thumbhash50.js';

const MOCK = () => process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
const SVC_NAME = { sonarr: 'Sonarr', radarr: 'Radarr', qbit: 'qBittorrent', prowlarr: 'Prowlarr' };

/* =====================================================================================================================
   Bilder
   ===================================================================================================================== */

const WIDTHS = { poster: [160, 320, 640], fanart: [640, 1280], banner: [640, 1280] };
const DEF_W = { poster: 320, fanart: 1280, banner: 1280 };
const MAX_SRC = 15 * 1024 * 1024;
const dir = () => join(config.dataDir, 'cache', 'media-bilder');
const snapW = (variant, w) => { const L = WIDTHS[variant]; const n = +w || DEF_W[variant]; return L.find((x) => x >= n) ?? L[L.length - 1]; };
const safe = (s) => String(s ?? '').replace(/[^\w-]/g, '').slice(0, 40) || 'h';

/* ---- ImageMagick (convert/magick), med JS-reserve ---- */
let tool; // undefined = ikke sjekket, null = mangler
let toolOverride = 'auto';
/** Bare for tester: 'auto' | null (oppfør deg som om ImageMagick mangler). */
export const _setImageTool50 = (v) => { toolOverride = v; tool = undefined; };
function run(cmd, args, input, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    let p;
    try { p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const out = [], err = [];
    let size = 0;
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } reject(new Error(`${cmd} brukte for lang tid`)); }, timeout);
    p.stdout.on('data', (d) => { size += d.length; if (size > 40 * 1024 * 1024) { try { p.kill('SIGKILL'); } catch { /* */ } } else out.push(d); });
    p.stderr.on('data', (d) => { if (err.length < 20) err.push(d); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(Buffer.concat(out)); else reject(new Error(`${cmd} avsluttet med ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`)); });
    p.stdin.on('error', () => { /* prosessen avsluttet før all input var skrevet */ });
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
async function im() {
  if (tool !== undefined) return tool;
  if (toolOverride === null || process.env.MEDIA50_NO_MAGICK === '1') return (tool = null);
  for (const cmd of ['magick', 'convert']) {
    try { const v = await run(cmd, ['-version'], null, 5000); if (/ImageMagick/i.test(v.toString())) return (tool = { cmd }); } catch { /* neste */ }
  }
  return (tool = null);
}
/** Bildetype fra de første bytene. Bare JPEG, PNG og WebP slippes inn til ImageMagick (aldri SVG/PS o.l.). */
export function sniff50(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { fmt: 'jpeg', mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { fmt: 'png', mime: 'image/png', ext: 'png' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { fmt: 'webp', mime: 'image/webp', ext: 'webp' };
  return null;
}
/** Bredde × høyde fra JPEG/PNG/WebP-hodet (uten å dekode bildet). */
export function imgSize50(b) {
  const s = sniff50(b);
  try {
    if (s?.fmt === 'png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (s?.fmt === 'webp') {
      const k = b.toString('ascii', 12, 16);
      if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (k === 'VP8L') { const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24]; return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) }; }
    }
    if (s?.fmt === 'jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* ødelagt hode */ }
  return null;
}
async function resize(buf, w) {
  const s = sniff50(buf), t = await im();
  if (!s || !t) return { buf, mime: s?.mime ?? 'application/octet-stream', ext: s?.ext ?? 'bin', resized: false };
  const base = [`${s.fmt}:-`, '-auto-orient', '-strip', '-resize', `${w}x>`];
  try { const out = await run(t.cmd, [...base, '-quality', '75', 'webp:-'], buf); if (sniff50(out)?.fmt === 'webp') return { buf: out, mime: 'image/webp', ext: 'webp', resized: true }; } catch { /* uten WebP-støtte: JPEG */ }
  try { const out = await run(t.cmd, [...base, '-quality', '80', 'jpeg:-'], buf); if (sniff50(out)?.fmt === 'jpeg') return { buf: out, mime: 'image/jpeg', ext: 'jpg', resized: true }; } catch { /* original */ }
  return { buf, mime: s.mime, ext: s.ext, resized: false };
}
/** ThumbHash fra et 32 px RGBA-uttrekk (PAM fra ImageMagick). null uten ImageMagick. */
async function thumb(buf) {
  const s = sniff50(buf), t = await im();
  if (!s || !t) return null;
  const pam = await run(t.cmd, [`${s.fmt}:-`, '-auto-orient', '-resize', '32x32', '-alpha', 'on', '-depth', '8', 'pam:-'], buf);
  const end = pam.indexOf('ENDHDR\n');
  if (end < 0) return null;
  const head = pam.toString('ascii', 0, end);
  const W = +(head.match(/WIDTH (\d+)/)?.[1] ?? 0), H = +(head.match(/HEIGHT (\d+)/)?.[1] ?? 0), D = +(head.match(/DEPTH (\d+)/)?.[1] ?? 0);
  if (!W || !H || D !== 4) return null;
  const data = pam.subarray(end + 7, end + 7 + W * H * 4);
  if (data.length < W * H * 4) return null;
  return thumbHashB64_50(rgbaToThumbHash50(W, H, data));
}

/* ---- Indeks: hash og størrelse per plakat (på disk, så hashene finnes etter omstart) ---- */
let IDX = null, idxT = 0;
const idxKey = (site, type, id, variant) => `${site ?? 'h'}|${type}|${id}|${variant}`;
async function index() {
  if (IDX) return IDX;
  try { IDX = new Map(Object.entries(JSON.parse(await readFile(join(dir(), 'index.json'), 'utf8')))); } catch { IDX = new Map(); }
  return IDX;
}
function saveIndex() {
  clearTimeout(idxT);
  idxT = setTimeout(async () => {
    try { await mkdir(dir(), { recursive: true }); const f = join(dir(), 'index.json'); await writeFile(`${f}.tmp`, JSON.stringify(Object.fromEntries(IDX ?? []))); await rename(`${f}.tmp`, f); } catch (e) { console.warn('[media/bilde] indeks:', e.message); }
  }, 1000);
  idxT.unref?.();
}
const idxGet = (site, type, id, variant) => IDX?.get(idxKey(site, type, id, variant)) ?? null;

/* ---- Kilde: bare biblioteket ---- */
async function libItem(type, id) {
  const svc = type === 'film' ? 'radarr' : 'sonarr';
  const c = M.svcConf43(svc);
  if (!c.on || c.mock) return null;
  const list = await (svc === 'radarr' ? M.movieList43() : M.seriesList43());
  const x = (Array.isArray(list) ? list : []).find((y) => y.id === id);
  return x ? { svc, conf: c, x } : null;
}
function sourceOf(conf, x, variant) {
  const imgs = Array.isArray(x.images) ? x.images : [];
  const p = imgs.find((i) => i.coverType === variant) ?? (variant === 'banner' ? imgs.find((i) => i.coverType === 'fanart') : null);
  if (!p) return null;
  const urls = [];
  const path = String(p.url ?? '').replace(/^.*(\/MediaCover\/)/, '$1').split('?')[0];
  if (/\/MediaCover\//.test(p.url ?? '') && new RegExp(`^/MediaCover/${x.id}/[\\w.-]+\\.(jpg|jpeg|png|webp)$`, 'i').test(path)) urls.push({ url: `${conf.url}${path}`, key: conf.key });
  let tm = null;
  try { tm = p.remoteUrl ? new URL(p.remoteUrl) : null; } catch { tm = null; }
  if (tm && tm.protocol === 'https:' && tm.hostname === 'image.tmdb.org' && /^\/t\/p\/\w+\/[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(tm.pathname)) {
    urls.push({ url: `https://image.tmdb.org${tm.pathname.replace(/^\/t\/p\/\w+\//, `/t/p/${p.coverType === 'poster' ? 'w780' : 'w1280'}/`)}` });
  }
  return urls.length ? { ver: M.bildeVer43(p), urls } : null;
}
async function fetchSrc(urls) {
  let last = null;
  for (const u of urls) {
    try {
      const r = await M.rawFetch43(u.url, { headers: u.key ? { 'X-Api-Key': u.key, Accept: 'image/*' } : { Accept: 'image/*' }, redirect: 'error', timeout: 20_000 });
      if (!r.ok) { last = new Error(`kilden svarte ${r.status}`); continue; }
      const len = +(r.headers.get('content-length') ?? 0);
      if (len > MAX_SRC) { last = new Error('bildet er for stort'); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_SRC || !sniff50(buf)) { last = new Error('ikke et bilde (JPEG/PNG/WebP)'); continue; }
      return buf;
    } catch (e) { last = e; }
  }
  throw last ?? new Error('ingen kilde');
}

const inflight = new Map(), srcInflight = new Map();
export const imgStats50 = { fetched: 0, resized: 0, hits: 0, hashed: 0 };
/** Sørger for at bildet finnes på disk i ønsket bredde. → {file, mime, ext, ver, w} | null (ikke i biblioteket / ingen kilde) */
async function ensure(type, id, variant, w) {
  const lib = await libItem(type, id);
  if (!lib) return null;
  const src = sourceOf(lib.conf, lib.x, variant);
  if (!src) return null;
  const site = M.mediaSite43();
  const base = `${safe(site)}-${type}-${id}-${variant}-${src.ver}`;
  const k = `${base}-${w}`;
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    await mkdir(join(dir(), 'src'), { recursive: true });
    await index();
    for (const ext of ['webp', 'jpg', 'png']) {
      const f = join(dir(), `${k}.${ext}`);
      if (await stat(f).then(() => true, () => false)) {
        imgStats50.hits++;
        if (variant === 'poster' && !idxGet(site, type, id, variant)?.hash && (await im())) hashLater(site, type, id, variant, src.ver, join(dir(), 'src', `${base}.bin`));
        return { file: f, mime: { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[ext], ext, ver: src.ver, w };
      }
    }
    const sf = join(dir(), 'src', `${base}.bin`);
    let orig = await readFile(sf).catch(() => null);
    if (!orig) {
      // Originalen hentes én gang selv om flere bredder lages samtidig (liste + forhåndsgenerering).
      if (!srcInflight.has(sf)) {
        srcInflight.set(sf, (async () => {
          const b = await fetchSrc(src.urls);
          imgStats50.fetched++;
          await writeFile(`${sf}.tmp`, b); await rename(`${sf}.tmp`, sf);
          dropOld(`${safe(site)}-${type}-${id}-${variant}-`, src.ver).catch(() => {});
          return b;
        })().finally(() => setTimeout(() => srcInflight.delete(sf), 0)));
      }
      orig = await srcInflight.get(sf);
    }
    const out = await resize(orig, w);
    if (out.resized) imgStats50.resized++;
    const f = join(dir(), `${k}.${out.ext}`);
    await writeFile(`${f}.tmp`, out.buf); await rename(`${f}.tmp`, f);
    const cur = idxGet(site, type, id, variant);
    if (!cur || cur.ver !== src.ver || (cur.hash == null && (await im()))) {
      const size = imgSize50(orig);
      let hash = null;
      if (variant === 'poster') { try { hash = await thumb(orig); if (hash) imgStats50.hashed++; } catch { hash = null; } }
      IDX.set(idxKey(site, type, id, variant), { ver: src.ver, hash, w: size?.w ?? null, h: size?.h ?? null, at: Date.now() });
      saveIndex();
    }
    return { file: f, mime: out.mime, ext: out.ext, ver: src.ver, w };
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}
function hashLater(site, type, id, variant, ver, sf) {
  setTimeout(async () => {
    try { const orig = await readFile(sf); const hash = await thumb(orig); const size = imgSize50(orig); IDX.set(idxKey(site, type, id, variant), { ver, hash, w: size?.w ?? null, h: size?.h ?? null, at: Date.now() }); saveIndex(); } catch { /* neste gang */ }
  }, 10).unref?.();
}
/** Plakaten er endret i Sonarr/Radarr (ny lastWrite → ny versjon): de gamle filene slettes, så de aldri brukes igjen. */
async function dropOld(prefix, ver) {
  for (const d of [dir(), join(dir(), 'src')]) {
    for (const f of await readdir(d).catch(() => [])) if (f.startsWith(prefix) && !f.startsWith(`${prefix}${ver}`)) await unlink(join(d, f)).catch(() => {});
  }
}

/* ---- Forhåndsgenerering ---- */
const pre = new Map();
let preRunning = false;
/** Legger plakatene (160/320/640) for et element i kø. */
function enqueue(site, type, id) {
  const k = `${site ?? ''}|${type}|${id}`;
  if (pre.has(k)) return;
  pre.set(k, { site, type, id });
  if (!preRunning) setTimeout(drain, 150).unref?.();
}
async function drain() {
  if (preRunning) return;
  preRunning = true;
  try {
    while (pre.size) {
      const batch = [...pre.values()].slice(0, 2);
      for (const b of batch) pre.delete(`${b.site ?? ''}|${b.type}|${b.id}`);
      await Promise.all(batch.map((b) => M.runMediaSite43(b.site, async () => { for (const w of WIDTHS.poster) await ensure(b.type, b.id, 'poster', w).catch(() => null); })));
    }
  } finally { preRunning = false; }
}
/** Alle plakater i biblioteket (oppstart og webhook). Ferdige hoppes over (filen finnes). → antall lagt i kø */
export async function precomputeAll50() {
  let n = 0;
  for (const [svc, type, list] of [['sonarr', 'serie', M.seriesList43], ['radarr', 'film', M.movieList43]]) {
    const c = M.svcConf43(svc);
    if (!c.on || c.mock) continue;
    const L = await list().catch(() => []);
    for (const x of Array.isArray(L) ? L : []) if (x?.id && sourceOf(c, x, 'poster')) { enqueue(null, type, x.id); n++; }
  }
  return n;
}
/** Bare for tester: vent til køen er tom. */
export async function _drain50() { await drain(); while (preRunning || pre.size) { await new Promise((r) => setTimeout(r, 20)); await drain(); } }

/* ---- Signerte adresser (bilder uten header i AsyncImage/Coil/<img>) og plakat-objektet i listene ---- */
const SECRET = config.sessionSecret && config.sessionSecret.length >= 16 ? `bilde50:${config.sessionSecret}` : randomBytes(32).toString('hex');
const sig = (type, id, variant, v, uid) => createHmac('sha256', SECRET).update(`b50|${type}|${id}|${variant}|${v}|${uid}`).digest('base64url').slice(0, 22);
const BILDE_RE = /^\/api\/media\/bilde\/(serie|film)\/(\d+)\/(poster|fanart|banner)\?(.*)$/;
function withW(url, w) { return url.replace(/([?&])w=\d+/, `$1w=${w}`); }
function signUrl(url, uid) {
  const m = String(url).match(BILDE_RE);
  if (!m || !uid || /[?&]sig=/.test(url)) return url;
  const v = new URLSearchParams(m[4]).get('v') ?? '';
  return `${url}&uid=${encodeURIComponent(uid)}&sig=${sig(m[1], m[2], m[3], v, uid)}`;
}
/** posterImg/fanartImg for en bilde-URL fra media43.js. */
function imgObj(url, uid, variant) {
  const m = String(url).match(BILDE_RE);
  if (!m) return null;
  const type = m[1], id = +m[2], v = new URLSearchParams(m[4]).get('v') ?? '';
  const site = M.mediaSite43();
  const ix = idxGet(site, type, id, variant);
  const fresh = ix && ix.ver === v;
  if (!fresh && variant === 'poster') enqueue(site, type, id);
  const ratio = fresh && ix.w && ix.h ? ix.h / ix.w : variant === 'poster' ? 1.5 : 0.5625;
  const L = WIDTHS[variant], def = DEF_W[variant];
  const u = (w) => signUrl(withW(url, w), uid);
  return { url: u(def), hash: fresh ? ix.hash ?? null : null, w: def, h: Math.round(def * ratio), srcset: L.map((w) => `${u(w)} ${w}w`).join(', '), widths: L, version: v };
}
function walk(o, uid, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return o;
  if (Array.isArray(o)) { for (const x of o) walk(x, uid, depth + 1); return o; }
  for (const [k, variant] of [['poster', 'poster'], ['fanart', 'fanart']]) {
    if (typeof o[k] === 'string' && o[k].startsWith('/api/media/bilde/')) {
      const img = imgObj(o[k], uid, variant);
      if (img) { o[`${k}Img`] = img; o[k] = img.url; }
    }
  }
  for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, uid, depth + 1);
  return o;
}
/** Mellomvare foran /api/media/* og /api/widgets/media: bilde-URL-ene signeres, og posterImg {url, hash, w, h, srcset} legges til. */
export const bilde50Mw = async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || c.res?.status !== 200 || !/application\/json/i.test(c.res.headers.get('content-type') ?? '')) return;
  const uid = c.get('user');
  if (!uid) return;
  let text;
  try { text = await c.res.clone().text(); } catch { return; }
  if (!text.includes('/api/media/bilde/')) return;
  await index();
  let j;
  try { j = JSON.parse(text); } catch { return; }
  walk(j, uid);
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify(j), { status: 200, headers });
};
const mediaOk = (u) => !!u && !!userInfo(u) && M.mediaAllowed43(u);
async function bildeAuth(c, next) {
  const q = c.req.query();
  if (q.sig && q.uid && !c.req.header('authorization')) {
    const want = Buffer.from(sig(c.req.param('type'), c.req.param('id'), c.req.param('variant'), q.v ?? '', q.uid)), got = Buffer.from(String(q.sig));
    if (want.length === got.length && timingSafeEqual(want, got) && mediaOk(q.uid)) { c.set('user', q.uid); return next(); }
  }
  return authOrToken(c, () => M.mediaGuard43(c, next));
}
async function bildeRoute(c) {
  const type = c.req.param('type'), id = +c.req.param('id'), variant = c.req.param('variant');
  const w = snapW(variant, c.req.query('w')), v = c.req.query('v') ?? '';
  let r;
  try { r = await ensure(type, id, variant, w); } catch (e) { console.warn(`[media/bilde] ${type}/${id}/${variant}: ${e.message}`); return c.json({ error: 'Fikk ikke hentet bildet fra Sonarr/Radarr', code: 'upstream' }, 502); }
  if (!r) return c.json({ error: 'Fant ikke bildet i biblioteket', code: 'not_found' }, 404);
  const etag = `"b50-${r.ver}-${w}-${r.ext}"`;
  const cc = v && v === r.ver ? 'private, max-age=31536000, immutable' : 'private, max-age=300';
  const inm = c.req.header('if-none-match') ?? '';
  if (inm.split(/\s*,\s*/).includes(etag)) return c.body(null, 304, { ETag: etag, 'Cache-Control': cc });
  const buf = await readFile(r.file).catch(() => null);
  if (!buf) return c.json({ error: 'Bildet forsvant fra cachen, prøv igjen' }, 503);
  return c.body(buf, 200, { 'Content-Type': r.mime, 'Cache-Control': cc, ETag: etag, 'X-Content-Type-Options': 'nosniff', 'X-Bilde-Versjon': r.ver });
}

/* =====================================================================================================================
   Sporing: sann status etter et søk (ikke evig «Søker»)
   ===================================================================================================================== */

const TRACKS = new Map();
const TRACK_TTL = 6 * 3600_000;
const NO_GRAB_MS = 60_000;
let noGrabMs = NO_GRAB_MS;
/** Bare for tester: hvor lenge et søk kan gå uten grab før diagnostikken kjøres (standard 60 s). */
export const _setNoGrabMs50 = (ms) => { noGrabMs = ms ?? NO_GRAB_MS; };
export const _tracks50 = TRACKS;
const ints = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
const osloHm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const short = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const tlog = (t, ledd, msg) => console.log(`media.track id=${t.id.slice(0, 8)} svc=${t.svc} ${t.episodeIds.length ? `episodeIds=${t.episodeIds.slice(0, 5).join(',')}` : `movieIds=${t.movieIds.slice(0, 5).join(',')}`} ledd=${ledd} ${msg}`);

function prune() { const now = Date.now(); for (const [id, t] of TRACKS) if (now - t.startedAt > TRACK_TTL) TRACKS.delete(id); if (TRACKS.size > 500) for (const id of [...TRACKS.keys()].slice(0, TRACKS.size - 500)) TRACKS.delete(id); }
/** Ny sporing. svc utledes fra id-ene. */
export function newTrack50({ user, episodeIds, movieIds, seriesId = null, seasonNumber = null, commandId = null, name = null, grabbed = false }) {
  prune();
  const ep = ints(episodeIds), mv = ints(movieIds);
  if (!ep.length && !mv.length && seriesId == null) throw new M.MediaError('Mangler episodeId, movieId eller seriesId', 400);
  const t = { id: randomUUID(), user, site: M.mediaSite43(), svc: mv.length ? 'radarr' : 'sonarr', episodeIds: ep, movieIds: mv, seriesId, seasonNumber, commandId: commandId != null && Number.isInteger(+commandId) ? +commandId : null, name,
    startedAt: Date.now(), grabbedAt: grabbed ? Date.now() : null, autoStarted: new Set(), cmd: null, rel: null, relP: null, diag: null, diagP: null, last: null, lastAt: 0, hist: null, histAt: 0, logged: '' };
  TRACKS.set(t.id, t);
  tlog(t, 1, `start command=${t.commandId ?? '-'} name=${name ?? '-'}`);
  return t;
}
const REJ = [[/existing file|already|equal or higher|is not an upgrade/i, 'har allerede like god fil'], [/not wanted in profile|quality|cutoff|upgrade/i, 'under kvalitetskrav'], [/seeder|peers/i, 'for få seedere'],
  [/size|larger|smaller|maximum|minimum/i, 'feil størrelse'], [/language/i, 'feil språk'], [/blocklist|blacklist/i, 'svartelistet'], [/must contain|must not contain|restricted|release profile|custom format|score/i, 'stoppet av egne regler'],
  [/delay|not yet|available|aired/i, 'ikke tilgjengelig ennå'], [/match|parse|unknown|series|episode|season|movie/i, 'passet ikke episoden/filmen']];
const rejCat = (s) => REJ.find(([re]) => re.test(s))?.[1] ?? short(s, 60);
/** Oppsummerer /release: {total, accepted, rejected, reason, top:[{label, count}], items:[…5 første]} */
export function releaseSummary50(rows) {
  const L = Array.isArray(rows) ? rows : [];
  const rej = L.filter((r) => r.rejected || (r.rejections ?? []).length);
  const counts = new Map();
  for (const r of rej) { const cats = new Set((r.rejections ?? []).map((x) => rejCat(typeof x === 'string' ? x : x?.reason ?? ''))); for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const reason = !L.length ? 'Indekserne ga ingen treff' : rej.length === L.length ? (top.length === 1 || top[0]?.count === L.length ? `alle ${L.length} ${top[0]?.label ?? 'avvist'}` : `alle ${L.length} avvist: ${top.slice(0, 3).map((x) => `${x.label} (${x.count})`).join(', ')}`) : null;
  return { total: L.length, accepted: L.length - rej.length, rejected: rej.length, reason, top: top.slice(0, 5),
    items: L.slice(0, 5).map((r) => ({ title: r.title, sizeText: M.sizeText43(r.size), seeders: r.seeders ?? null, quality: r.quality?.quality?.name ?? null, indexer: r.indexer ?? '', rejections: (r.rejections ?? []).map((x) => (typeof x === 'string' ? x : x?.reason ?? '')).slice(0, 3) })) };
}
async function rawQueue(svc) {
  return M.cached43(`queue50:${svc}`, 5000, async () => (await M.arr43(svc, 'GET', '/queue', { query: { pageSize: 500, includeUnknownSeriesItems: false, ...(svc === 'sonarr' ? { includeEpisode: false } : {}) } }))?.records ?? []);
}
async function qbList() { return M.cached43('qbit:info', 2000, () => M.qb43('GET', '/torrents/info')); }
const qbErrKind = (e) => (e?.upstream === 401 || /passord|sperret|innlogging/i.test(e?.message ?? '') ? 'auth' : 'down');
const ACT = {
  manual: (t) => ({ id: 'manual', label: 'Velg manuelt', ...(t.movieIds.length ? { movieId: t.movieIds[0] } : t.episodeIds.length ? { episodeId: t.episodeIds[0] } : { seriesId: t.seriesId, seasonNumber: t.seasonNumber }) }),
  start: (hash) => ({ id: 'start', label: 'Start', hash, method: 'POST', path: `/api/media/torrents/${hash}/start` }),
  settings: () => ({ id: 'settings', label: 'Innstillinger → Media', route: 'innstillinger/media', hash: '#/innstillinger/media' }),
  retry: (t) => ({ id: 'retry', label: 'Søk igjen', method: 'POST', path: '/api/media/command', body: t.movieIds.length ? { name: 'MoviesSearch', movieIds: t.movieIds } : { name: 'EpisodeSearch', episodeIds: t.episodeIds } }),
};
const TONE = { searching: 'mut', checking: 'mut', sent: 'dl', downloading: 'dl', starting: 'dl', queued: 'wait', delayed: 'wait', importing: 'ok', done: 'ok', stopped: 'warn', stalled: 'warn', none: 'bad', rejected: 'bad', not_grabbed: 'bad',
  qbit_down: 'bad', qbit_auth: 'bad', client_error: 'bad', missing_torrent: 'bad', error: 'bad', failed: 'bad' };
const FINAL = new Set(['done', 'none', 'rejected', 'failed', 'not_grabbed', 'qbit_down', 'qbit_auth', 'client_error', 'missing_torrent', 'error']);
function torrentState(t, tor, now) {
  const st = M.TSTATE43[tor.state] ?? 'dl', pct = Math.floor((tor.progress ?? 0) * 100), name = tor.name;
  const torrent = { hash: tor.hash, name, state: tor.state, progress: pct, size: tor.size ?? tor.total_size ?? 0, category: tor.category ?? '' };
  if (st === 'seed' || (tor.progress ?? 0) >= 1) return { state: 'importing', text: 'Lastet ned · importeres', torrent };
  if (st === 'pause') return { state: 'stopped', text: 'Lagt til, men stoppet', detail: 'qBittorrent la torrenten til uten å starte den («Start torrent automatically» er av, eller Initial State er Stop/Pause).', torrent, actions: [ACT.start(tor.hash), ACT.settings()] };
  if (st === 'queued') return { state: 'queued', text: 'I kø i qBittorrent', detail: 'Maks aktive nedlastinger er nådd (qBittorrent → Innstillinger → BitTorrent → Torrent-kø).', torrent, actions: [ACT.settings()] };
  if (st === 'stall') return { state: 'stalled', text: `Står fast · ${tor.num_seeds ?? 0} seedere`, detail: (tor.num_seeds ?? 0) === 0 ? 'Ingen seedere. Velg en annen utgivelse, eller sjekk at qBittorrent har nett (VPN).' : null, torrent, actions: [ACT.manual(t), ACT.settings()] };
  if (st === 'error') return { state: 'error', text: tor.state === 'missingFiles' ? 'Feil i qBittorrent: filene mangler' : 'Feil i qBittorrent', detail: 'Ofte en lagringsmappe som ikke finnes eller ikke er skrivbar for containeren (PUID/PGID).', torrent, actions: [ACT.settings()] };
  if (st === 'meta') return { state: 'downloading', text: 'Sendt til qBittorrent · henter metadata …', torrent, progress: pct };
  if (st === 'check') return { state: 'downloading', text: `Sjekker filene … ${pct} %`, torrent, progress: pct };
  const speed = tor.dlspeed ?? 0, eta = M.etaText43(tor.eta);
  return { state: 'downloading', text: `Laster ned ${pct} % · ${M.speedText43(speed)}${eta !== '∞' ? ` · ${eta}` : ''}`, progress: pct, speedText: M.speedText43(speed), etaText: eta, torrent };
}
/** Én vurdering av sporingen (kjeden ledd 2–6). */
async function evaluate(t) {
  const now = Date.now(), svc = t.svc, name = SVC_NAME[svc], age = now - t.startedAt;
  // Ledd 2: kommandoen i Sonarr/Radarr.
  if (t.commandId && !['completed', 'failed', 'aborted', 'cancelled', 'orphaned'].includes(t.cmd?.status)) {
    try { const c = await M.arr43(svc, 'GET', `/command/${t.commandId}`); t.cmd = { status: c?.status ?? null, message: c?.message ?? null, result: c?.result ?? null }; } catch (e) { t.cmd = { ...(t.cmd ?? {}), error: e.message }; }
  }
  // Ledd 4 og 5: køen i Sonarr/Radarr (grab som ligger i nedlastingsklienten, eller venter på forsinkelsesprofil).
  let rec = null, qErr = null;
  try {
    const recs = await rawQueue(svc);
    rec = recs.find((r) => (t.movieIds.length ? t.movieIds.includes(r.movieId) : t.episodeIds.length ? t.episodeIds.includes(r.episodeId) : r.seriesId === t.seriesId && (t.seasonNumber == null || r.seasonNumber === t.seasonNumber || r.episode?.seasonNumber === t.seasonNumber))) ?? null;
  } catch (e) { qErr = e; }
  // Ledd 6: qBittorrent.
  let tors = null, qbErr = null;
  if (M.svcConf43('qbit').on) { try { tors = await qbList(); } catch (e) { qbErr = e; } }
  let hash = rec?.downloadId ? String(rec.downloadId).toLowerCase() : null;
  // Ledd 4: grab i historikken (når køen ikke viser noe).
  if (!rec && (now - t.histAt > 8000 || !t.hist)) {
    t.histAt = now;
    try {
      const recs = [];
      if (svc === 'radarr') for (const id of t.movieIds.slice(0, 3)) { const h = await M.arr43('radarr', 'GET', '/history/movie', { query: { movieId: id, eventType: 1 } }); recs.push(...(Array.isArray(h) ? h : h?.records ?? [])); }
      else for (const id of t.episodeIds.slice(0, 3)) { const h = await M.arr43('sonarr', 'GET', '/history', { query: { episodeId: id, eventType: 1, pageSize: 10, sortKey: 'date', sortDirection: 'descending' } }); recs.push(...(Array.isArray(h) ? h : h?.records ?? [])); }
      t.hist = recs.filter((r) => (r.eventType === 'grabbed' || r.eventType === 1) && Date.parse(r.date) >= t.startedAt - 10_000).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    } catch { t.hist = t.hist ?? []; }
  }
  const grab = t.hist?.[0] ?? null;
  if (!hash && grab?.downloadId) hash = String(grab.downloadId).toLowerCase();
  if ((rec || grab) && !t.grabbedAt) { t.grabbedAt = grab ? Date.parse(grab.date) || now : now; tlog(t, 4, `grab ${short(rec?.title ?? grab?.sourceTitle ?? '', 80)} client=${rec?.downloadClient ?? grab?.data?.downloadClient ?? '-'}`); }
  const tor = hash && tors ? tors.find((x) => String(x.hash).toLowerCase() === hash) : null;
  const out = { command: t.cmd };
  if (tor) {
    Object.assign(out, torrentState(t, tor, now));
    // qBittorrent 5.x med «start automatisk» av (eller Initial State: Stop): appen starter torrenten selv – én gang.
    if (out.state === 'stopped' && !t.autoStarted.has(tor.hash) && (tor.added_on ?? 0) * 1000 >= t.startedAt - 120_000) {
      t.autoStarted.add(tor.hash);
      try { await M.qbVerb43('start', 'resume', tor.hash); M.clearMedia43('qbit:'); tlog(t, 6, `auto-start hash=${tor.hash.slice(0, 8)} state=${tor.state}`); Object.assign(out, { state: 'starting', text: 'Lagt til stoppet · starter den nå', detail: 'qBittorrent la torrenten til stoppet, så Homelab startet den (torrents/start, reserve resume).', actions: [] }); }
      catch (e) { out.detail = `Fikk ikke startet torrenten: ${e.message}`; }
    }
    return out;
  }
  if (rec) {
    const st = String(rec.status ?? '').toLowerCase(), tds = String(rec.trackedDownloadState ?? ''), msgs = (rec.statusMessages ?? []).flatMap((m) => m.messages ?? []).concat(rec.errorMessage ? [rec.errorMessage] : []);
    if (st === 'delay' || st === 'pending') return { ...out, state: 'delayed', text: `Venter på forsinkelsesprofilen i ${name}${rec.estimatedCompletionTime ? ` (til ${osloHm(rec.estimatedCompletionTime)})` : ''}`, detail: 'Utgivelsen er valgt, men sendes først når forsinkelsen (Settings → Profiles → Delay Profiles) er over.' };
    if (st === 'downloadclientunavailable') return { ...out, state: 'client_error', text: `${name} får ikke kontakt med qBittorrent`, detail: short(msgs.join(' · ')) || 'Nedlastingsklienten er utilgjengelig.', actions: [ACT.settings()] };
    if (/import/i.test(tds)) return { ...out, state: 'importing', text: 'Lastet ned · venter på import', detail: short(msgs.join(' · ')) || null };
    if (st === 'failed' || rec.trackedDownloadStatus === 'error') return { ...out, state: 'error', text: `${name}: nedlastingen feilet`, detail: short(msgs.join(' · ')) || null, actions: [ACT.manual(t)] };
    if (qbErr) return { ...out, state: qbErrKind(qbErr) === 'auth' ? 'qbit_auth' : 'qbit_down', text: qbErrKind(qbErr) === 'auth' ? 'Innlogging avvist' : 'qBittorrent svarer ikke', detail: qbErr.message, actions: [ACT.settings()] };
    if (tors && hash && now - (t.grabbedAt ?? now) > 30_000) return { ...out, state: 'missing_torrent', text: 'Sendt til qBittorrent, men torrenten finnes ikke der', detail: `${name} og Homelab ser kanskje på forskjellige qBittorrent (adresse/kategori).`, actions: [ACT.settings()] };
    return { ...out, state: 'sent', text: 'Sendt til qBittorrent', detail: short(rec.title, 120) };
  }
  if (grab) {
    if (qbErr) return { ...out, state: qbErrKind(qbErr) === 'auth' ? 'qbit_auth' : 'qbit_down', text: qbErrKind(qbErr) === 'auth' ? 'Innlogging avvist' : 'qBittorrent svarer ikke', detail: qbErr.message, actions: [ACT.settings()] };
    // Ferdig og importert? (køen er tom igjen)
    const has = await hasFile(t).catch(() => false);
    if (has) return { ...out, state: 'done', text: 'Lastet ned' };
    if (now - (t.grabbedAt ?? now) < 30_000) return { ...out, state: 'sent', text: 'Sendt til qBittorrent', detail: short(grab.sourceTitle, 120) };
    return { ...out, state: 'missing_torrent', text: 'Sendt til qBittorrent, men torrenten finnes ikke der', detail: `${name} fikk ikke lagt den til, eller qBittorrent fjernet den. Sjekk nedlastingsklienten i ${name}.`, actions: [ACT.settings(), ACT.manual(t)] };
  }
  // Ingen grab.
  if (await hasFile(t).catch(() => false) && !t.commandId) return { ...out, state: 'done', text: 'Lastet ned' };
  if (t.cmd?.status === 'failed' || t.cmd?.status === 'aborted') return { ...out, state: 'failed', text: `Søket feilet i ${name}`, detail: short(t.cmd.message ?? t.cmd.result ?? ''), actions: [ACT.retry(t), ACT.manual(t)] };
  const cmdDone = t.cmd?.status === 'completed';
  if (!cmdDone && age < noGrabMs) return { ...out, state: 'searching', text: `Søker i indekserne via ${name} …`, detail: t.cmd?.status === 'queued' ? `Kommandoen venter i køen i ${name}` : null };
  // Søket er ferdig (eller 60 s uten grab): hvorfor? Utgivelsene (ledd 3) og diagnostikken (ledd 2–6) kjøres én gang.
  if (!t.rel && !t.relP && (t.episodeIds.length === 1 || t.movieIds.length === 1)) {
    const q = t.movieIds.length ? { movieId: t.movieIds[0] } : { episodeId: t.episodeIds[0] };
    t.relP = M.runMediaSite43(t.site, () => M.arr43(svc, 'GET', '/release', { query: q, timeout: 180_000 })).then((rows) => { t.rel = releaseSummary50(rows); tlog(t, 3, `releases total=${t.rel.total} accepted=${t.rel.accepted} rejected=${t.rel.rejected}${t.rel.reason ? ` reason="${t.rel.reason}"` : ''}`); },
      (e) => { t.rel = { error: e.message }; }).finally(() => { t.relP = null; });
  }
  if (!t.diag && !t.diagP && age >= noGrabMs) {
    t.diagP = M.runMediaSite43(t.site, () => diagnose50({ service: svc })).then((d) => { t.diag = d; tlog(t, d.failed?.n ?? 0, `diagnostikk ok=${d.ok}${d.failed ? ` feil="${d.failed.title}: ${short(d.failed.text, 80)}"` : ''}`); }, (e) => { t.diag = { ok: false, error: e.message, steps: [] }; }).finally(() => { t.diagP = null; });
  }
  const R = t.rel, D = t.diag;
  if (R && !R.error && R.total === 0) return { ...out, state: 'none', text: 'Fant ingen utgivelser', detail: R.reason, releases: R, actions: [ACT.manual(t), ACT.retry(t)] };
  if (R && !R.error && R.accepted === 0) return { ...out, state: 'rejected', text: 'Fant ingen utgivelser', detail: R.reason, releases: R, actions: [ACT.manual(t)] };
  const bad = D?.steps?.find((s) => s.state === 'fail');
  if (bad) {
    const kind = bad.id === 'qbit' ? (/innlogging|passord|sperret/i.test(bad.text) ? 'qbit_auth' : 'qbit_down') : bad.id.endsWith(':client') ? 'client_error' : null;
    if (kind) return { ...out, state: kind, text: kind === 'qbit_auth' ? 'Innlogging avvist' : kind === 'qbit_down' ? 'qBittorrent svarer ikke' : `${name} får ikke kontakt med qBittorrent`, detail: bad.text, releases: R ?? null, actions: [ACT.settings(), ACT.manual(t)] };
  }
  if (R && !R.error && R.accepted > 0 && (cmdDone || age >= noGrabMs) && D) return { ...out, state: 'not_grabbed', text: `Fant ${R.accepted} utgivelse${R.accepted === 1 ? '' : 'r'}, men ingen ble sendt`, detail: bad ? `${bad.title}: ${bad.text}` : `Sjekk nedlastingsklienten i ${name}.`, releases: R, actions: [ACT.manual(t), ACT.settings()] };
  if (cmdDone && !t.relP && !t.diagP && (R || t.episodeIds.length !== 1) && D && !bad && age >= noGrabMs) return { ...out, state: 'not_grabbed', text: 'Søket ga ingen nedlasting', detail: short(t.cmd?.message ?? ''), releases: R ?? null, actions: [ACT.manual(t), ACT.retry(t)] };
  return { ...out, state: 'checking', text: cmdDone ? 'Søket er ferdig · sjekker hvorfor ingenting ble hentet …' : `Ingen grab etter ${Math.round(age / 1000)} s · sjekker kjeden …`, detail: t.cmd?.message ? short(t.cmd.message) : null };
}
async function hasFile(t) {
  if (t.movieIds.length) { const m = await M.arr43('radarr', 'GET', `/movie/${t.movieIds[0]}`); return !!m?.hasFile; }
  if (t.episodeIds.length) { const e = await M.arr43('sonarr', 'GET', `/episode/${t.episodeIds[0]}`); return !!e?.hasFile; }
  return false;
}
/** Sporingen som JSON. admin = får hint og detaljer fra diagnostikken. */
async function trackOut(t, admin) {
  if (!t.last || Date.now() - t.lastAt > 2500) {
    let r;
    try { r = await M.runMediaSite43(t.site, () => evaluate(t)); } catch (e) { r = { state: 'checking', text: 'Sjekker status …', detail: e.message }; }
    t.last = r; t.lastAt = Date.now();
    if (t.logged !== r.state) { tlog(t, { searching: 2, checking: 3, sent: 5, downloading: 6, starting: 6, stopped: 6, queued: 6, stalled: 6, error: 6, qbit_down: 6, qbit_auth: 6, client_error: 5, missing_torrent: 5, none: 3, rejected: 3, not_grabbed: 4, delayed: 4, importing: 6, done: 6, failed: 2 }[r.state] ?? 0, `state=${r.state} "${short(r.text, 80)}"`); t.logged = r.state; }
  }
  const r = t.last;
  const diag = t.diag ? { ok: !!t.diag.ok, at: t.diag.at ?? null, failed: t.diag.failed ? { id: t.diag.failed.id, n: t.diag.failed.n, title: t.diag.failed.title, text: t.diag.failed.text, ...(admin ? { hint: t.diag.failed.hint ?? null } : {}) } : null,
    steps: (t.diag.steps ?? []).map((s) => ({ id: s.id, n: s.n, title: s.title, state: s.state, text: s.text, ...(admin ? { hint: s.hint ?? null } : {}) })) } : null;
  const final = FINAL.has(r.state);
  return { id: t.id, service: t.svc, episodeIds: t.episodeIds, movieIds: t.movieIds, seriesId: t.seriesId, seasonNumber: t.seasonNumber, commandId: t.commandId, startedAt: new Date(t.startedAt).toISOString(), ageSec: Math.round((Date.now() - t.startedAt) / 1000),
    grabbedAt: t.grabbedAt ? new Date(t.grabbedAt).toISOString() : null, state: r.state, tone: TONE[r.state] ?? 'mut', text: r.text, detail: r.detail ?? null, progress: r.progress ?? null, speedText: r.speedText ?? null, etaText: r.etaText ?? null,
    torrent: r.torrent ?? null, releases: r.releases ?? null, command: r.command ?? null, diagnostics: diag, actions: r.actions ?? [], final, pollMs: final ? 0 : r.state === 'downloading' ? 5000 : 2500, url: `/api/media/track/${t.id}` };
}

/* =====================================================================================================================
   Diagnostikk: ledd 2–6 med grønt/rødt per ledd
   ===================================================================================================================== */

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i;
const step = (id, n, title, state, text, extra = {}) => ({ id, n, title, state, ok: state === 'ok' || state === 'warn' || state === 'skip', text, ...extra });
const fieldOf = (cl, name) => (cl?.fields ?? []).find((f) => f.name === name)?.value;
const gbText = (b) => M.sizeText43(b);
async function timed(fn) { const t0 = Date.now(); try { return { v: await fn(), ms: Date.now() - t0 }; } catch (e) { return { e, ms: Date.now() - t0 }; } }
/** Kjører ledd 2–6 for Sonarr og/eller Radarr + qBittorrent. Ingen nøkler/passord i svaret. */
export async function diagnose50({ service = null, episodeId = null, movieId = null } = {}) {
  const steps = [], cats = new Set();
  const svcs = (service ? [service] : ['sonarr', 'radarr']).filter((s) => M.svcConf43(s).on);
  if (!svcs.length) steps.push(step('arr', 2, 'Sonarr/Radarr', 'fail', 'Verken Sonarr eller Radarr er satt opp.', { hint: 'Innstillinger → Integrasjoner → Media.' }));
  for (const svc of svcs) {
    const N = SVC_NAME[svc];
    // Ledd 2: tjenesten og siste søkekommando.
    const st = await timed(() => M.arr43(svc, 'GET', '/system/status'));
    if (st.e) { steps.push(step(`${svc}:arr`, 2, `${N} og kommandoen`, 'fail', st.e.message, { ms: st.ms, hint: `Sjekk adressen og API-nøkkelen til ${N} (Innstillinger → Integrasjoner → Media).` })); continue; }
    const cmds = await M.arr43(svc, 'GET', '/command').catch(() => []);
    const last = (Array.isArray(cmds) ? cmds : []).filter((c) => /Search$/.test(c.name ?? c.commandName ?? '')).sort((a, b) => Date.parse(b.queued ?? b.started ?? 0) - Date.parse(a.queued ?? a.started ?? 0))[0];
    const cmdTxt = last ? ` · siste søk: ${last.commandName ?? last.name} ${last.status}${last.message ? ` («${short(last.message, 80)}»)` : ''}` : '';
    steps.push(step(`${svc}:arr`, 2, `${N} og kommandoen`, last?.status === 'failed' ? 'warn' : 'ok', `${N} v${String(st.v?.version ?? '?').split('.').slice(0, 2).join('.')} svarer (${st.ms} ms)${cmdTxt}`, { ms: st.ms }));
    // Ledd 3: indeksere (i Sonarr/Radarr og Prowlarr), og utgivelsene for elementet når det er oppgitt.
    const ix = await timed(() => M.arr43(svc, 'GET', '/indexer'));
    const list = Array.isArray(ix.v) ? ix.v : [];
    const auto = list.filter((x) => x.enableAutomaticSearch !== false && x.enable !== false);
    let ixState = ix.e ? 'fail' : auto.length ? 'ok' : 'fail';
    let ixTxt = ix.e ? ix.e.message : auto.length ? `${auto.length} av ${list.length} indeksere brukes i automatisk søk` : list.length ? `Ingen av ${list.length} indeksere har automatisk søk på` : `${N} har ingen indeksere`;
    let ixHint = !auto.length && !ix.e ? `Synk indekserne fra Prowlarr (Prowlarr → Apps → ${N} → Sync), og slå på «Enable Automatic Search».` : null;
    if (M.svcConf43('prowlarr').on) {
      const ps = await M.arr43('prowlarr', 'GET', '/indexerstatus').catch(() => null);
      if (Array.isArray(ps) && ps.length) { ixTxt += ` · Prowlarr: ${ps.length} indekser${ps.length === 1 ? '' : 'e'} midlertidig avslått etter feil`; if (ixState === 'ok') ixState = 'warn'; }
    }
    let rel = null;
    if ((svc === 'sonarr' && episodeId) || (svc === 'radarr' && movieId)) {
      const r = await timed(() => M.arr43(svc, 'GET', '/release', { query: svc === 'radarr' ? { movieId } : { episodeId }, timeout: 180_000 }));
      if (r.e) { ixTxt += ` · søket feilet: ${r.e.message}`; ixState = 'fail'; }
      else { rel = releaseSummary50(r.v); ixTxt += ` · ${rel.total} utgivelser, ${rel.accepted} godtatt${rel.reason ? ` (${rel.reason})` : ''}`; if (rel.total && !rel.accepted && ixState === 'ok') ixState = 'warn'; if (!rel.total && ixState === 'ok') ixState = 'warn'; }
    }
    steps.push(step(`${svc}:indexers`, 3, 'Indeksere og utgivelser', ixState, ixTxt, { ms: ix.ms, ...(ixHint ? { hint: ixHint } : {}), ...(rel ? { releases: rel } : {}) }));
    // Ledd 4: grab i historikken.
    const h = await timed(() => (svc === 'radarr' && movieId ? M.arr43('radarr', 'GET', '/history/movie', { query: { movieId, eventType: 1 } }) : M.arr43(svc, 'GET', '/history', { query: { page: 1, pageSize: 5, sortKey: 'date', sortDirection: 'descending', eventType: 1, ...(svc === 'sonarr' && episodeId ? { episodeId } : {}) } })));
    const recs = (Array.isArray(h.v) ? h.v : h.v?.records ?? []).filter((r) => r.eventType === 'grabbed' || r.eventType === 1).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const g = recs[0];
    const gAge = g ? Date.now() - Date.parse(g.date) : Infinity;
    steps.push(step(`${svc}:grab`, 4, 'Grab', h.e ? 'fail' : !g ? 'warn' : 'ok', h.e ? h.e.message : g ? `Siste grab ${new Intl.DateTimeFormat('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(g.date))}: ${short(g.sourceTitle, 80)}${gAge > 7 * 86400_000 ? ' (over en uke siden)' : ''}` : `Ingen grab i historikken${episodeId || movieId ? ' for denne' : ''} – feilen ligger før qBittorrent`, { ms: h.ms }));
    // Ledd 5: nedlastingsklienten i Sonarr/Radarr.
    const dc = await timed(() => M.arr43(svc, 'GET', '/downloadclient'));
    const clients = (Array.isArray(dc.v) ? dc.v : []).filter((x) => /qbittorrent/i.test(x.implementation ?? x.implementationName ?? ''));
    const on = clients.filter((x) => x.enable !== false);
    if (dc.e) steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', 'fail', dc.e.message, { ms: dc.ms }));
    else if (!on.length) steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', 'fail', clients.length ? `qBittorrent er slått av i ${N}` : `${N} har ingen qBittorrent-klient`, { ms: dc.ms, hint: `${N} → Settings → Download Clients → + → qBittorrent.` }));
    else {
      const tests = await M.arr43(svc, 'POST', '/downloadclient/testall').catch((e) => ({ error: e.message }));
      const health = await M.arr43(svc, 'GET', '/health').catch(() => []);
      const hMsgs = (Array.isArray(health) ? health : []).filter((x) => /DownloadClient/i.test(x.source ?? '')).map((x) => x.message);
      const res = on.map((cl) => {
        const t = Array.isArray(tests) ? tests.find((x) => x.id === cl.id) : null;
        const fails = (t?.validationFailures ?? []).filter((v) => !v.isWarning).map((v) => v.errorMessage);
        const warns = (t?.validationFailures ?? []).filter((v) => v.isWarning).map((v) => v.errorMessage);
        const host = String(fieldOf(cl, 'host') ?? ''), port = fieldOf(cl, 'port'), cat = String(fieldOf(cl, svc === 'radarr' ? 'movieCategory' : 'tvCategory') ?? ''), initial = fieldOf(cl, 'initialState');
        if (cat) cats.add(cat);
        return { id: cl.id, name: cl.name, host, port: port ?? null, useSsl: !!fieldOf(cl, 'useSsl'), urlBase: fieldOf(cl, 'urlBase') || null, category: cat || null, initialState: initial ?? null, password: fieldOf(cl, 'password') ? 'satt' : 'ikke satt',
          ok: t ? t.isValid !== false && !fails.length : !tests?.error, errors: fails, warnings: warns };
      });
      const bad = res.filter((x) => !x.ok);
      const local = res.find((x) => LOCAL.test(x.host));
      const stopped = res.find((x) => x.initialState === 2 || /stop|pause/i.test(String(x.initialState)));
      const msg = bad.length ? `${bad[0].name} (${bad[0].host}:${bad[0].port}): ${bad[0].errors[0] ?? tests?.error ?? 'testen feilet'}` : hMsgs.length ? hMsgs[0] : `${res.map((x) => `${x.name} → ${x.host}:${x.port}${x.category ? ` · kategori ${x.category}` : ''}`).join(' · ')} · testen er grønn`;
      const hint = bad.length && local ? `${N} peker på ${local.host}:${local.port}. I Docker er det ${N}-containeren selv – bruk containernavnet (f.eks. qbittorrent:8080, eller gluetun:8080 når qBittorrent går gjennom VPN-containeren) eller vertens IP.`
        : bad.length ? 'Sjekk adresse, port, brukernavn og passord i nedlastingsklienten. Legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets» i qBittorrent, eller sjekk at IP-en ikke er utestengt.'
          : stopped ? `Initial State er Stop/Pause i ${N} – sett «Initial State: Start».` : null;
      steps.push(step(`${svc}:client`, 5, 'Nedlastingsklient', bad.length ? 'fail' : hMsgs.length || stopped ? 'warn' : 'ok', stopped && !bad.length && !hMsgs.length ? `${msg} · nye torrenter legges til stoppet` : msg, { ms: dc.ms, clients: res, ...(hint ? { hint } : {}) }));
    }
  }
  // Ledd 6: qBittorrent (Homelabs egen tilkobling).
  const qc = M.svcConf43('qbit');
  if (!qc.on) steps.push(step('qbit', 6, 'qBittorrent', 'skip', 'qBittorrent er ikke satt opp i Homelab, så køen kan ikke leses herfra.', { hint: 'Innstillinger → Integrasjoner → Media → qBittorrent.' }));
  else {
    const t = await M.mediaTest43('qbit');
    if (!t.ok) {
      const auth = /passord|sperret/i.test(t.message ?? '');
      steps.push(step('qbit', 6, 'qBittorrent', 'fail', auth ? `Innlogging avvist: ${t.message}` : `qBittorrent svarer ikke: ${t.message}`, { ms: t.ms,
        hint: auth ? 'Riktig brukernavn og passord, eller legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets». For mange feil gir utestengt IP en stund.' : 'Kjører containeren? Går den gjennom VPN-containeren (gluetun), bruk dens navn og port.' }));
    } else {
      const major = +(String(t.version ?? '').match(/^(\d+)/)?.[1] ?? 0);
      const [prefs, info, catsQ, main] = await Promise.all([M.qb43('GET', '/app/preferences').catch(() => ({})), M.qb43('GET', '/transfer/info').catch(() => ({})), M.qb43('GET', '/torrents/categories').catch(() => ({})), M.qb43('GET', '/sync/maindata', { query: { rid: '0' } }).catch(() => null)]);
      const problems = [], warns = [], hints = [];
      const conn = info?.connection_status;
      if (conn === 'disconnected') { problems.push(`ingen nettforbindelse${prefs?.current_network_interface ? ` (bundet til ${prefs.current_network_interface} – VPN nede?)` : ''}`); hints.push('qBittorrent er bundet til VPN-grensesnittet, men VPN er nede. Start VPN-containeren på nytt.'); }
      const addStopped = prefs?.add_stopped_enabled ?? prefs?.start_paused_enabled;
      if (addStopped === true) { warns.push('nye torrenter legges til stoppet («Start torrent automatically» er av)'); hints.push('qBittorrent → Innstillinger → Nedlastinger: slå på «Start torrent automatically». Homelab starter torrenter fra Media selv i mellomtiden.'); }
      if (prefs?.queueing_enabled && (prefs.max_active_downloads === 0 || prefs.max_active_torrents === 0)) { problems.push('maks aktive nedlastinger er 0'); hints.push('qBittorrent → Innstillinger → BitTorrent → Torrent-kø: sett «Maks aktive nedlastinger» til minst 3.'); }
      const free = main?.server_state?.free_space_on_disk;
      if (Number.isFinite(free) && free < 2 * 1024 ** 3) { problems.push(`lite diskplass (${gbText(free)} igjen)`); hints.push('qBittorrent stopper nedlastinger når disken er nesten full. Rydd plass.'); }
      const missingCats = [...cats].filter((c) => catsQ && typeof catsQ === 'object' && !(c in catsQ));
      if (missingCats.length) { warns.push(`kategorien ${missingCats.join(', ')} finnes ikke`); hints.push('Kategorien opprettes vanligvis av Sonarr/Radarr ved første grab. Sjekk lagringsstien (skrivbar for containeren, PUID/PGID).'); }
      const torrents = main?.torrents ? Object.entries(main.torrents).map(([hash, x]) => ({ hash, ...x })) : await M.qb43('GET', '/torrents/info').catch(() => []);
      const inCat = (Array.isArray(torrents) ? torrents : []).filter((x) => !cats.size || cats.has(x.category));
      const stoppedT = inCat.filter((x) => /^(stoppedDL|pausedDL)$/.test(x.state)), errT = inCat.filter((x) => /^(error|missingFiles)$/.test(x.state)), queuedT = inCat.filter((x) => x.state === 'queuedDL'), stalledT = inCat.filter((x) => x.state === 'stalledDL');
      if (errT.length) { problems.push(`${errT.length} torrent${errT.length === 1 ? '' : 'er'} med feil (${errT[0].state})`); hints.push('Ofte en lagringsmappe som ikke finnes eller ikke er skrivbar for containeren.'); }
      if (stoppedT.length) warns.push(`${stoppedT.length} stoppet`);
      if (queuedT.length) warns.push(`${queuedT.length} i kø`);
      if (stalledT.length) warns.push(`${stalledT.length} står fast`);
      const head = `qBittorrent ${t.version ?? ''} svarer (${t.ms} ms)${major >= 5 ? ' · 5.x (stop/start)' : major ? ' · 4.x (pause/resume)' : ''}${conn ? ` · ${conn === 'connected' ? 'tilkoblet' : conn === 'firewalled' ? 'bak brannmur' : 'frakoblet'}` : ''}`;
      steps.push(step('qbit', 6, 'qBittorrent', problems.length ? 'fail' : warns.length ? 'warn' : 'ok', [head, ...problems, ...warns].join(' · '), { ms: t.ms, version: t.version ?? null, ...(hints.length ? { hint: hints.join(' ') } : {}),
        torrents: [...errT, ...stoppedT, ...queuedT, ...stalledT].slice(0, 10).map((x) => ({ hash: x.hash, name: x.name, state: x.state, progress: Math.floor((x.progress ?? 0) * 100), category: x.category ?? '', ...(/^(stoppedDL|pausedDL)$/.test(x.state) ? { action: ACT.start(x.hash) } : {}) })) }));
    }
  }
  const failed = steps.find((s) => s.state === 'fail') ?? null;
  return { ok: !failed, at: new Date().toISOString(), summary: failed ? `Ledd ${failed.n} feiler: ${failed.title} – ${short(failed.text, 120)}` : steps.some((s) => s.state === 'warn') ? 'Kjeden virker, men noe bør sjekkes' : 'Hele kjeden er grønn', failed, steps,
    legend: { 2: 'Sonarr/Radarr og kommandoen', 3: 'Indeksere (Prowlarr) og utgivelser', 4: 'Grab', 5: 'Nedlastingsklient i Sonarr/Radarr', 6: 'qBittorrent' } };
}

/* =====================================================================================================================
   Ruter og mellomvare
   ===================================================================================================================== */

export const media50Api = new Hono();
const H = (fn) => async (c) => { try { const r = await fn(c); return r instanceof Response ? r : c.json(r); } catch (e) { return M.mediaFail43(c, e instanceof M.MediaError ? e : Object.assign(new M.MediaError(e.message, e.status ?? 500))); } };
const G = [authOrToken, M.mediaGuard43], A = [authOrToken, M.mediaGuard43, M.mediaAdmin43];
const own = (c, t) => t && (t.user === c.get('user') || isAdmin(c.get('user')));

media50Api.get('/bilde/:type{serie|film}/:id{[0-9]+}/:variant{poster|fanart|banner}', bildeAuth, bildeRoute);
// Sporing
media50Api.post('/track', ...G, H(async (c) => {
  const b = await M.mediaBody43(c);
  const t = newTrack50({ user: c.get('user'), episodeIds: b.episodeIds ?? b.episodeId, movieIds: b.movieIds ?? b.movieId, seriesId: b.seriesId != null ? +b.seriesId : null, seasonNumber: b.seasonNumber != null ? +b.seasonNumber : null, commandId: b.commandId ?? null, grabbed: !!b.grabbed });
  return c.json(await trackOut(t, isAdmin(c.get('user'))), 201);
}));
media50Api.get('/track/:id', ...G, H(async (c) => {
  const t = TRACKS.get(c.req.param('id'));
  if (!own(c, t)) throw new M.MediaError('Fant ikke sporingen (den varer i 6 timer)', 404);
  return trackOut(t, isAdmin(c.get('user')));
}));
media50Api.get('/track', ...G, H(async (c) => {
  const ep = +c.req.query('episodeId') || null, mv = +c.req.query('movieId') || null;
  if (!ep && !mv) throw new M.MediaError('Bruk episodeId eller movieId', 400);
  const u = c.get('user');
  let t = [...TRACKS.values()].reverse().find((x) => (x.user === u || isAdmin(u)) && (ep ? x.episodeIds.includes(ep) : x.movieIds.includes(mv)));
  if (!t) t = newTrack50({ user: u, episodeIds: ep, movieIds: mv });
  return trackOut(t, isAdmin(u));
}));
// qBittorrent 5.x: start (4.x: resume). Brukes av «Start» på kortet og i diagnostikken.
media50Api.post('/torrents/:hash{[a-fA-F0-9]{40}|[a-fA-F0-9]{64}}/start', ...G, H(async (c) => {
  const h = c.req.param('hash').toLowerCase();
  await M.qbVerb43('start', 'resume', h);
  M.clearMedia43('qbit:'); M.clearMedia43('queue');
  const t = (await qbList().catch(() => [])).find((x) => String(x.hash).toLowerCase() === h) ?? null;
  return { ok: true, hash: h, torrent: t ? { hash: h, name: t.name, state: t.state } : null, message: 'Startet' };
}));
// Diagnostikk (bare admin)
media50Api.get('/diagnostics', ...A, H(async (c) => M.cached43(`diag50:${c.req.query('service') ?? ''}`, 8000, () => diagnose50({ service: ['sonarr', 'radarr'].includes(c.req.query('service')) ? c.req.query('service') : null }))));
media50Api.post('/diagnostics', ...A, H(async (c) => {
  const b = await M.mediaBody43(c);
  const ep = +b.episodeId || null, mv = +b.movieId || null;
  return diagnose50({ service: mv ? 'radarr' : ep ? 'sonarr' : ['sonarr', 'radarr'].includes(b.service) ? b.service : null, episodeId: ep, movieId: mv });
}));

/** Etter POST /api/media/command og /api/media/glimt: legg `track` i svaret (sann status i stedet for «Søker»). */
const trackMw = async (c, next) => {
  await next();
  if (c.req.method !== 'POST' || c.res?.status !== 200) return;
  let j;
  try { j = await c.res.clone().json(); } catch { return; }
  const u = c.get('user');
  if (!u || !j || typeof j !== 'object') return;
  let t = null;
  try {
    if (/\/command$/.test(c.req.path) && j.ok && j.id != null) {
      const b = await c.req.json().catch(() => ({}));
      const name = String(b?.name ?? j.name ?? '');
      if (!/Search$/.test(name)) return;
      t = newTrack50({ user: u, episodeIds: b.episodeIds, movieIds: b.movieIds ?? b.movieId, seriesId: b.seriesId != null ? +b.seriesId : null, seasonNumber: b.seasonNumber != null ? +b.seasonNumber : null, commandId: j.id, name });
    } else if (/\/glimt$/.test(c.req.path) && j.commandId != null && (j.episode?.episodeId ?? j.episode?.id)) {
      t = newTrack50({ user: u, episodeIds: [j.episode.episodeId ?? j.episode.id], commandId: j.commandId, name: 'EpisodeSearch' });
    }
  } catch { return; }
  if (!t) return;
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify({ ...j, track: { id: t.id, url: `/api/media/track/${t.id}`, state: 'searching', text: `Søker i indekserne via ${SVC_NAME[t.svc]} …`, pollMs: 2500 } }), { status: 200, headers });
};
/** Webhook fra Sonarr/Radarr (SeriesAdd, MovieAdded, Grab, Download …): plakatene til nye elementer lages med en gang og igjen etter 1 min. */
let hookT = 0;
const hookMw = async (c, next) => {
  await next();
  if (c.req.method !== 'POST' || c.res?.status !== 200 || !/\/hook\/(sonarr|radarr)$/.test(c.req.path)) return;
  let ev = null;
  try { ev = (await c.res.clone().json())?.event ?? null; } catch { return; }
  if (!ev || ev === 'Test') return;
  clearTimeout(hookT);
  hookT = setTimeout(() => { precomputeAll50().catch(() => {}); setTimeout(() => precomputeAll50().catch(() => {}), 60_000).unref?.(); }, 3000);
  hookT.unref?.();
};

/** index.js: kalles før media44Api/media43Api monteres (etter mediaSiteMw44). */
export function mountMedia50(app) {
  app.use('/api/media/*', bilde50Mw);
  app.use('/api/widgets/media', bilde50Mw);
  app.use('/api/media/command', trackMw);
  app.use('/api/media/glimt', trackMw);
  app.use('/api/media/hook/*', hookMw);
  app.route('/api/media', media50Api);
}
let started = false;
/** Forhåndsgenerer alle plakater i bakgrunnen etter oppstart (ikke i tester). */
export function startMedia50() {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;
  setTimeout(() => { precomputeAll50().then((n) => { if (n) console.log(`[media/bilde] forhåndsgenererer ${n} plakater`); }).catch(() => {}); }, 45_000).unref?.();
}
export const _media50 = { ensure, sig, signUrl, idx: () => IDX, resetIdx: () => { IDX = null; }, createHash };
