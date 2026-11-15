// Media: plakater og bakgrunner som vises med en gang (fra prompt 50, SRVMEDIA50; claude-code-media-bilder-raskt.md).
//   GET  /api/media/bilde/{serie|film}/{id}/{poster|fanart|banner}?w=160|320|640|1280&v=<versjon>[&uid=&sig=]
//        diskcache, WebP, ETag, immutable med ?v=; ThumbHash og posterImg/fanartImg i listene (bilde50Mw)
// Sporing etter søk, diagnostikk og start av stoppede torrenter ligger i tracking.js. Rotårsaken og hele kjeden er dokumentert i
// docs/media-nedlasting-50.md.
// Sikkerhet: tjenestenøkler og passord logges aldri og sendes aldri ut (nedlastingsklienten vises som «passord satt/ikke satt»).
// Bilder: bare id-er fra eget bibliotek, kilden er den konfigurerte Sonarr/Radarr (MediaCover) eller image.tmdb.org – aldri en
// adresse fra klienten (SSRF). Bilder skaleres med ImageMagick; uten ImageMagick sendes originalen (og ingen hash).
import { Hono } from 'hono';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { sessionSecret86 } from '../secret86.js'; // prompt 86
import { authOrToken } from '../mobile.js';
import { userInfo } from '../auth.js';
import * as M from './arr.js';
import { rgbaToThumbHash50, thumbHashB64_50 } from './thumbhash.js';

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
const SECRET = sessionSecret86().length >= 16 ? `bilde50:${sessionSecret86()}` : randomBytes(32).toString('hex');
const sig = (type, id, variant, v, uid) => createHmac('sha256', SECRET).update(`b50|${type}|${id}|${variant}|${v}|${uid}`).digest('base64url').slice(0, 22);
const BILDE_RE = /^\/api\/media\/bilde\/(serie|film)\/(\d+)\/(poster|fanart|banner)\?(.*)$/;
function withW(url, w) { return url.replace(/([?&])w=\d+/, `$1w=${w}`); }
function signUrl(url, uid) {
  const m = String(url).match(BILDE_RE);
  if (!m || !uid || /[?&]sig=/.test(url)) return url;
  const v = new URLSearchParams(m[4]).get('v') ?? '';
  return `${url}&uid=${encodeURIComponent(uid)}&sig=${sig(m[1], m[2], m[3], v, uid)}`;
}
/** posterImg/fanartImg for en bilde-URL fra media/arr.js. */
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
   Ruter og mellomvare
   ===================================================================================================================== */

export const imagesApi = new Hono();
imagesApi.get('/bilde/:type{serie|film}/:id{[0-9]+}/:variant{poster|fanart|banner}', bildeAuth, bildeRoute);

/** Webhook fra Sonarr/Radarr (SeriesAdd, MovieAdded, Grab, Download …): plakatene til nye elementer lages med en gang og igjen etter 1 min. */
let hookT = 0;
export const hookMw = async (c, next) => {
  await next();
  if (c.req.method !== 'POST' || c.res?.status !== 200 || !/\/hook\/(sonarr|radarr)$/.test(c.req.path)) return;
  let ev = null;
  try { ev = (await c.res.clone().json())?.event ?? null; } catch { return; }
  if (!ev || ev === 'Test') return;
  clearTimeout(hookT);
  hookT = setTimeout(() => { precomputeAll50().catch(() => {}); setTimeout(() => precomputeAll50().catch(() => {}), 60_000).unref?.(); }, 3000);
  hookT.unref?.();
};

let started = false;
/** Forhåndsgenerer alle plakater i bakgrunnen etter oppstart (ikke i tester). */
export function startMedia50() {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;
  setTimeout(() => { precomputeAll50().then((n) => { if (n) console.log(`[media/bilde] forhåndsgenererer ${n} plakater`); }).catch(() => {}); }, 45_000).unref?.();
}
export const _media50 = { ensure, sig, signUrl, idx: () => IDX, resetIdx: () => { IDX = null; }, createHash };
