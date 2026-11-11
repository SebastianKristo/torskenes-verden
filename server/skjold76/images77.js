// Prompt 77 (SKJAISRV): «Finn bilde» i Skjold Lab. Søker via brukerens SearXNG (settings searxng_url, categories=images), med
// Wikimedia Commons som reserve (User-Agent KristoHomelab/1.0, ingen e-post). Klienten får aldri tredjeparts-URL-er: hver kandidat
// har en kryptert, signert og kortlivet id (AES-256-GCM, bundet til brukeren, 1 time), og miniatyrene hentes gjennom serverens proxy
// (/api/skjold/ai/thumb/<id>). Nedlasting går gjennom guardedGet73 (SSRF-vern per hopp, maks 10 MB, bare JPEG/PNG/WebP/GIF) og samme
// bildebehandling som opplasting (saveImage76: skalering, EXIF fjernes).
// MOCK_DATA=1 uten injisert nett: faste kandidater med genererte bilder (for klientagentene og e2e).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { config } from '../config.js';
import { sessionSecret86 } from '../secret86.js'; // prompt 86
import { cfg } from '../settings.js';
import { guardedGet73 } from '../news73.js';
import { sniffImage50, magick50, toJpeg50 } from '../img50.js';

export const UA77 = 'KristoHomelab/1.0 (+https://kristo.no)';
export const MAX_ITEMS77 = 12;
export const MAX_DL77 = 10 * 1024 * 1024;
const MAX_THUMB = 3 * 1024 * 1024;
const TTL_S = 3600;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MOCK = () => process.env.MOCK_DATA === '1';

let F = null; // fetch for søkene (SearXNG/Commons). Nedlasting/miniatyrer går alltid via guardedGet73 (_setNet73 i tester).
let injected = false;
/** Bare for tester: fetch for søkene (null tilbakestiller). */
export const _setSearchFetch77 = (fn) => { F = fn ?? null; injected = !!fn; thumbCache.clear(); };
const fx = (u, i) => (F ?? globalThis.fetch)(u, i);
export const _img77 = { timeoutMs: 8000, guarded: null }; // guarded: injiserbar guardedGet73 (tester)
const gget = (u, o) => (_img77.guarded ?? guardedGet73)(u, o);

/* ---------------- Signerte id-er ---------------- */

const KEY = () => createHash('sha256').update(`skjold77-img|${process.env.SESSION_SECRET || sessionSecret86('skjold77')}`).digest();
/** Kryptert og signert referanse {u, url, thumb, title, src, w, h, exp}. */
export function sealId77(user, o, ttlS = TTL_S) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY(), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...o, u: user, exp: Math.floor(Date.now() / 1000) + ttlS }), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
/** → innholdet hvis id-en er gyldig, ikke utløpt og (med user) tilhører brukeren; ellers null. */
export function openId77(id, user = null) {
  try {
    const b = Buffer.from(String(id ?? ''), 'base64url');
    if (b.length < 29 || b.length > 4096) return null;
    const d = createDecipheriv('aes-256-gcm', KEY(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    if (!o || o.exp * 1000 < Date.now()) return null;
    if (user != null && o.u !== user) return null;
    return o;
  } catch { return null; }
}
/** Brukeren bak en miniatyr-id (proxyen virker uten header i appenes bildelastere: id-en er selv signert og bundet til brukeren). */
export const thumbUser77 = (id) => openId77(id)?.u ?? null;

/* ---------------- Søk ---------------- */

const searxBase = () => { try { return String(cfg('searxng_url') ?? '').trim().replace(/\/+$/, ''); } catch { return ''; } };
export const searxngConfigured77 = () => !!searxBase();
const http = (u) => /^https?:\/\//i.test(String(u ?? ''));
const absUrl = (u, base) => { try { return new URL(String(u), base).href; } catch { return null; } };
const clean = (s, n = 140) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function viaSearxng(q) {
  const base = searxBase();
  if (!base) return { skip: 'SearXNG er ikke satt opp' };
  const r = await fx(`${base}/search?q=${encodeURIComponent(q)}&format=json&categories=images&safesearch=1&language=nb`, { headers: { accept: 'application/json', 'User-Agent': UA77 }, signal: AbortSignal.timeout(_img77.timeoutMs) });
  if (!r.ok) throw new Error(`SearXNG svarte ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const x of Array.isArray(j?.results) ? j.results : []) {
    const img = absUrl(x.img_src, base), th = absUrl(x.thumbnail_src || x.thumbnail || x.img_src, base);
    if (!http(img) || !http(th)) continue;
    const m = String(x.resolution ?? x.img_format ?? '').match(/(\d+)\s*[x×]\s*(\d+)/);
    out.push({ url: img, thumb: th, title: clean(x.title) || hostOf(x.url || img), source: hostOf(x.url || img) || 'SearXNG', w: m ? +m[1] : null, h: m ? +m[2] : null });
  }
  return { items: out };
}
async function viaCommons(q) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=${MAX_ITEMS77}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=320`;
  const r = await fx(u, { headers: { accept: 'application/json', 'User-Agent': UA77, 'Api-User-Agent': UA77 }, signal: AbortSignal.timeout(_img77.timeoutMs) });
  if (!r.ok) throw new Error(`Wikimedia Commons svarte ${r.status}`);
  const j = await r.json();
  const pages = Object.values(j?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !OK_TYPES.includes(String(ii.mime ?? '').toLowerCase()) || !http(ii.url)) continue;
    out.push({ url: ii.url, thumb: http(ii.thumburl) ? ii.thumburl : ii.url, title: clean(String(p.title ?? '').replace(/^File:|\.[a-z]{3,4}$/gi, '')), source: 'Wikimedia Commons', w: ii.width ?? null, h: ii.height ?? null });
  }
  return { items: out };
}

/* ---------------- Mock (genererte bilder) ---------------- */

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
/** Liten PNG (ensfarget med en lys stripe) – mockbildene. */
export function mockPng77(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3, band = Math.abs(y - h / 2) < h / 10;
      raw[o] = band ? 240 : r; raw[o + 1] = band ? 236 : g; raw[o + 2] = band ? 228 : b;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const MOCK_COLORS = [[180, 60, 50], [60, 120, 180], [70, 150, 90], [200, 160, 40], [120, 80, 160], [90, 90, 90]];
const mockItems = (q) => MOCK_COLORS.map((c, i) => ({ url: `mock:${i}:full`, thumb: `mock:${i}:thumb`, title: `${q} · eksempel ${i + 1}`, source: i % 2 ? 'Wikimedia Commons' : 'SearXNG (mock)', w: 800, h: 600 }));
const mockBuf = (url) => { const m = String(url).match(/^mock:(\d+):(full|thumb)$/); if (!m) return null; const c = MOCK_COLORS[+m[1] % MOCK_COLORS.length]; return m[2] === 'full' ? mockPng77(800, 600, c) : mockPng77(160, 120, c); };

/**
 * Bildesøk. → {items:[{id, thumbUrl, previewUrl, title, source, width, height}], provider, message?} | {error, code, status}
 * code: 'off' (innstillingen er av), 'unavailable' (SearXNG mangler/feiler og Commons feiler), 'empty_query'.
 */
export async function searchImages77(user, q, { enabled = true } = {}) {
  const query = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!query) return { error: 'Skriv hva du vil finne bilde av', code: 'empty_query', status: 400 };
  if (!enabled) return { error: '«Finn bilder på nett» er slått av. Slå det på under Innstillinger → Moduler → Skjold Lab.', code: 'off', status: 409 };
  let raw = null, provider = null;
  const errs = [];
  if (MOCK() && !injected) { raw = mockItems(query); provider = 'mock'; }
  else {
    try { const r = await viaSearxng(query); if (r.skip) errs.push(r.skip); else if (r.items.length) { raw = r.items; provider = 'searxng'; } else errs.push('SearXNG fant ingen bilder'); }
    catch (e) { errs.push(e?.name === 'TimeoutError' ? 'SearXNG svarte ikke i tide' : String(e?.message ?? e).slice(0, 120)); }
    if (!raw) {
      try { const r = await viaCommons(query); raw = r.items; provider = 'commons'; }
      catch (e) {
        errs.push(e?.name === 'TimeoutError' ? 'Wikimedia Commons svarte ikke i tide' : String(e?.message ?? e).slice(0, 120));
        const noSx = !searxngConfigured77();
        return { error: `Fant ingen bildetjeneste: ${noSx ? 'SearXNG er ikke satt opp (Innstillinger → AI → SearXNG-adresse)' : errs[0]}, og Wikimedia Commons svarte ikke. Prøv igjen senere, eller last opp et bilde selv.`, code: 'unavailable', status: 502, details: errs };
      }
    }
  }
  const seen = new Set();
  const items = [];
  for (const x of raw) {
    if (seen.has(x.url)) continue;
    seen.add(x.url);
    const id = sealId77(user, { url: x.url, thumb: x.thumb, title: x.title, src: x.source });
    items.push({ id, thumbUrl: `/api/skjold/ai/thumb/${id}`, previewUrl: `/api/skjold/ai/thumb/${id}?size=preview`, title: x.title, source: x.source, width: x.w ?? null, height: x.h ?? null });
    if (items.length >= MAX_ITEMS77) break;
  }
  return { items, provider, ...(items.length ? {} : { message: `Fant ingen bilder av «${query}». Prøv et kortere navn.` }), ...(errs.length && provider === 'commons' ? { notice: errs[0] } : {}) };
}

/* ---------------- Proxy og nedlasting ---------------- */

const thumbCache = new Map(); // url|size → {buf, type, at}
const typeOf = (buf, hdr) => { const s = sniffImage50(buf); return OK_TYPES.includes(s) ? s : null; };
/** Henter et bilde fra tredjepart (SSRF-vern, typesjekk på header og innhold). → {buf, type} | kaster {status, message} */
async function fetchImage(url, maxBytes) {
  if (String(url).startsWith('mock:')) { const b = mockBuf(url); if (!b) throw Object.assign(new Error('Fant ikke bildet'), { status: 404 }); return { buf: b, type: 'image/png' }; }
  let r;
  try { r = await gget(url, { kind: 'img', maxBytes, headers: { 'User-Agent': UA77 } }); }
  catch (e) {
    if (e?.code === 'ESSRF') throw Object.assign(new Error('Bildeadressen er ikke tillatt (intern adresse)'), { status: 400, code: 'ssrf' });
    if (e?.code === 'ESIZE') throw Object.assign(new Error('Bildet er for stort (maks 10 MB)'), { status: 413, code: 'size' });
    if (e?.code === 'ETYPE') throw Object.assign(new Error('Bare JPEG, PNG, WebP og GIF kan brukes'), { status: 415, code: 'type' });
    throw Object.assign(new Error(`Klarte ikke å hente bildet (${String(e?.message ?? e).slice(0, 80)})`), { status: 502, code: 'fetch' });
  }
  const hdr = String(r.type ?? '').split(';')[0].trim();
  const t = typeOf(r.buf);
  if (!OK_TYPES.includes(hdr === 'image/jpg' ? 'image/jpeg' : hdr) || !t) throw Object.assign(new Error('Bare JPEG, PNG, WebP og GIF kan brukes'), { status: 415, code: 'type' });
  return { buf: r.buf, type: t };
}
/** Miniatyr/forhåndsvisning gjennom proxyen. size 'thumb' (≤ 320 px) eller 'preview' (≤ 1024 px). → {buf, type} */
export async function proxyImage77(user, id, size = 'thumb') {
  const o = openId77(id, user);
  if (!o) throw Object.assign(new Error('Bildeutvalget er utløpt – søk på nytt'), { status: 404 });
  const url = size === 'preview' ? o.url : o.thumb;
  const key = `${url}|${size}`;
  const hit = thumbCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit;
  let { buf, type } = await fetchImage(url, size === 'preview' ? MAX_DL77 : MAX_THUMB);
  // Kodes om til JPEG når ImageMagick finnes (ingen metadata, ingen overraskelser i innholdet).
  if (await magick50()) { const j = await toJpeg50(buf, size === 'preview' ? 1024 : 320, 80); if (j?.buf) { buf = j.buf; type = 'image/jpeg'; } }
  const v = { buf, type, at: Date.now() };
  thumbCache.set(key, v);
  if (thumbCache.size > 120) thumbCache.delete(thumbCache.keys().next().value);
  return v;
}
/** Laster ned kandidaten for lagring. GIF gjøres om til JPEG (krever ImageMagick). → {buf, title, source} */
export async function downloadImage77(user, id) {
  const o = openId77(id, user);
  if (!o) throw Object.assign(new Error('Bildeutvalget er utløpt – søk på nytt'), { status: 404, code: 'expired' });
  let { buf, type } = await fetchImage(o.url, MAX_DL77);
  if (type === 'image/gif') {
    const j = (await magick50()) ? await toJpeg50(buf, 1600, 85) : null;
    if (!j?.buf) throw Object.assign(new Error('GIF krever ImageMagick på serveren – velg et annet bilde'), { status: 415, code: 'type' });
    buf = j.buf;
  }
  return { buf, title: o.title ?? null, source: o.src ?? null };
}
