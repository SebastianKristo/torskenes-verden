// Kartfliser (prompt 20): proxy og cache for alle klientene, så ingen henter fra tile.openstreetmap.org (som blokkerer apper).
//   GET /tiles/:style/:z/:x/:y.png  (også :y@2x.png)   stiler: topo (Kartverket, standard), voyager, dark, light (CARTO),
//                                                    maptiler og stadia når nøkkelen er satt i Integrasjoner → Kart.
//   GET /api/config/map                             felles kartkonfig for web og apper.
// Flisene hentes med egen User-Agent og caches i DATA_DIR/tiles i 30 dager. Feiler leverandøren, sendes en lagret
// (eldre) flis hvis den finnes, ellers en nøytral grå flis med kort cache – aldri leverandørens feilbilde.
//
// Tilgang: innlogget sesjon (Leaflet på web sender cookien, samme opphav) eller app-token som
//   «Authorization: Bearer fh_…» eller «?token=fh_…» (for kartbiblioteker som ikke kan sette header).
// authOrToken i mobile.js godtar bare header; ?token= gjøres om til header her, bare for flisene.
import { Hono } from 'hono';
import { mkdir, readFile, writeFile, stat, rename } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { config } from './config.js';
import { sessionUser, userInfo } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { cfg } from './settings.js';

export const UA = 'KristoHomelab/1.0 (kontakt@kristo.no)';
const DIR = resolve(config.dataDir, 'tiles');
const MAX_AGE = 30 * 86_400_000;
const LONG = 'public, max-age=2592000', SHORT = 'public, max-age=300';
const CARTO_ATTR = '© OpenStreetMap-bidragsytere © CARTO';

// {s} = subdomene, {r} = «@2x» eller tom. maxZoom per stil.
const STYLES = {
  topo: { url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', max: 18, retina: false, attribution: '© Kartverket' },
  voyager: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', subs: 'abcd', max: 19, retina: true, attribution: CARTO_ATTR },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subs: 'abcd', max: 19, retina: true, attribution: CARTO_ATTR },
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subs: 'abcd', max: 19, retina: true, attribution: CARTO_ATTR },
  maptiler: { url: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key={key}', key: 'maptilerKey', max: 19, retina: true, attribution: '© MapTiler © OpenStreetMap-bidragsytere' },
  stadia: { url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={key}', key: 'stadiaKey', max: 19, retina: true, attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap-bidragsytere' },
};
const keyOf = (s) => (STYLES[s]?.key ? String(cfg(STYLES[s].key) ?? '').trim() : '');
export const availableStyles = () => Object.keys(STYLES).filter((s) => !STYLES[s].key || keyOf(s));

/* ---------------- Grå reserveflis (PNG laget i kode) ---------------- */

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function solidPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bit RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const GRAY = { light: [0xe4, 0xe2, 0xdd], dark: [0x2b, 0x2d, 0x31] };
const grayCache = new Map();
export function grayTile(style = 'voyager', retina = false) {
  const tone = style === 'dark' ? 'dark' : 'light', k = `${tone}${retina ? 2 : 1}`;
  if (!grayCache.has(k)) grayCache.set(k, solidPng(retina ? 512 : 256, GRAY[tone]));
  return grayCache.get(k);
}

/* ---------------- Henting og cache ---------------- */

const isImage = (b) => b.length > 8 && ((b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8) || (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'));
const typeOf = (b) => (b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : 'image/webp');

export function upstreamUrl(style, z, x, y, retina) {
  const s = STYLES[style];
  const sub = s.subs ? s.subs[(x + y) % s.subs.length] : '';
  return s.url.replace('{s}', sub).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', retina && s.retina ? '@2x' : '').replace('{key}', encodeURIComponent(keyOf(style)));
}

const inflight = new Map();
async function fetchTile(style, z, x, y, retina) {
  const r = await fetch(upstreamUrl(style, z, x, y, retina), { headers: { 'User-Agent': UA, Accept: 'image/png,image/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!r.ok) { await r.body?.cancel?.().catch(() => {}); throw new Error(`HTTP ${r.status}`); }
  const ct = r.headers.get('content-type') ?? '';
  const buf = Buffer.from(await r.arrayBuffer());
  // Leverandørens feilbilder («403 Access blocked», tekstsider) slipper ikke gjennom.
  if ((ct && !/^image\//i.test(ct)) || !isImage(buf) || buf.length > 2_000_000) throw new Error('Ikke en kartflis');
  return buf;
}

/** Flisen fra cache eller leverandør. { body, type, cache, source: 'cache'|'net'|'stale'|'fallback' } */
export async function getTile(style, z, x, y, retina) {
  const file = join(DIR, style, String(z), String(x), `${y}${retina ? '@2x' : ''}.png`);
  let stale = null;
  try {
    const s = await stat(file);
    const body = await readFile(file);
    if (Date.now() - s.mtimeMs < MAX_AGE && isImage(body)) return { body, type: typeOf(body), cache: LONG, source: 'cache' };
    if (isImage(body)) stale = body;
  } catch { /* ikke i cache */ }
  const k = file;
  if (!inflight.has(k)) {
    inflight.set(k, (async () => {
      const buf = await fetchTile(style, z, x, y, retina);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, buf); await rename(tmp, file);
      return buf;
    })().finally(() => inflight.delete(k)));
  }
  try {
    const body = await inflight.get(k);
    return { body, type: typeOf(body), cache: LONG, source: 'net' };
  } catch (e) {
    if (stale) return { body: stale, type: typeOf(stale), cache: SHORT, source: 'stale' };
    return { body: grayTile(style, retina), type: 'image/png', cache: SHORT, source: 'fallback', error: e.message };
  }
}

/* ---------------- Tilgang ---------------- */

const TOKEN_Q = /^fh_[A-Za-z0-9_-]{20,}$/;
export const tileAuth = async (c, next) => {
  let id = sessionUser(c);
  if (!id) {
    // ?token= → Authorization-header (bare for disse rutene).
    const t = c.req.query('token');
    if (t && TOKEN_Q.test(t) && !c.req.header('authorization')) c.req.raw.headers.set('authorization', `Bearer ${t}`);
    if (bearerOk(c, 'finance:read')) id = c.get('user');
  }
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Nøytral grå flis til Leaflets errorTileUrl. Uten innlogging: den inneholder ingenting.
api.get('/tiles/:file{blank(?:-dark)?(?:@2x)?\\.png}', (c) => {
  const f = c.req.param('file');
  return c.body(grayTile(f.includes('dark') ? 'dark' : 'light', f.includes('@2x')), 200, { 'Content-Type': 'image/png', 'Cache-Control': LONG });
});

api.get('/tiles/:style/:z/:x/:file', tileAuth, async (c) => {
  const style = c.req.param('style');
  const m = c.req.param('file').match(/^(\d+)(@2x)?\.png$/);
  const z = Number(c.req.param('z')), x = Number(c.req.param('x'));
  if (!STYLES[style] || !m || !/^\d+$/.test(c.req.param('z')) || !/^\d+$/.test(c.req.param('x'))) return c.json({ error: 'Ukjent kartflis' }, 404);
  if (!availableStyles().includes(style)) return c.json({ error: 'Kartstilen krever en nøkkel (Innstillinger → Integrasjoner → Kart)' }, 404);
  const y = Number(m[1]), retina = !!m[2], n = 2 ** z;
  if (z > STYLES[style].max || x >= n || y >= n) {
    return c.body(grayTile(style, retina), 200, { 'Content-Type': 'image/png', 'Cache-Control': LONG, 'X-Tile-Source': 'fallback' });
  }
  const t = await getTile(style, z, x, y, retina);
  if (t.error) console.warn(`[tiles] ${style}/${z}/${x}/${y}: ${t.error}`);
  return c.body(t.body, 200, { 'Content-Type': t.type, 'Cache-Control': t.cache, 'X-Tile-Source': t.source, 'X-Content-Type-Options': 'nosniff' });
});

// Felles kartkonfig (prompt 21): Kartverket topo er standard i alle tema (gratis, ingen nøkkel). Mørkt og Papir-tema er
// også topo, med CSS-filter (darkFilter/paperFilter) på flislaget. CARTO-stilene er fortsatt valgbare, men aldri standard.
// {r} fylles av Leaflet («@2x» på retina med detectRetina); appene kan sette den selv.
export const DARK_FILTER = 'invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.55)';
export const PAPER_FILTER = 'sepia(.25) saturate(.8)';
api.get('/api/config/map', tileAuth, (c) => {
  const styles = availableStyles();
  const tiles = Object.fromEntries(styles.map((s) => [s, `/tiles/${s}/{z}/{x}/{y}{r}.png`]));
  const attributions = Object.fromEntries(styles.map((s) => [s, STYLES[s].attribution]));
  const maxZooms = Object.fromEntries(styles.map((s) => [s, STYLES[s].max]));
  return c.json({
    tiles, attribution: STYLES.topo.attribution, attributions, maxZooms, default: 'topo', dark: 'topo', paper: 'topo', maxZoom: STYLES.topo.max,
    filters: { default: null, dark: DARK_FILTER, paper: PAPER_FILTER }, darkFilter: DARK_FILTER, paperFilter: PAPER_FILTER,
    // Valgbare stiler (Innstillinger). CARTO krever i dag ofte nøkkel og er bare et alternativ.
    styles: styles.map((s) => ({ id: s, name: STYLE_NAME[s] ?? s, attribution: STYLES[s].attribution, maxZoom: STYLES[s].max, retina: !!STYLES[s].retina, default: s === 'topo' })),
    errorTileUrl: '/tiles/blank.png', errorTileUrlDark: '/tiles/blank-dark.png', tileSize: 256,
    auth: { cookie: true, header: 'Authorization: Bearer <token>', query: 'token' },
  }, 200, { 'Cache-Control': 'private, max-age=300' });
});
const STYLE_NAME = { topo: 'Kartverket topo', voyager: 'CARTO Voyager', dark: 'CARTO mørk', light: 'CARTO lys', maptiler: 'MapTiler', stadia: 'Stadia Maps' };

export default api;

/* ---------------- «Test tilkobling» for Kart ---------------- */
export const hasMapTest = (group) => group === 'map' || group === 'Kart';
export async function testMap() {
  const out = [];
  for (const s of ['maptiler', 'stadia']) {
    if (!keyOf(s)) { out.push(`${s}: ingen nøkkel`); continue; }
    try { await fetchTile(s, 10, 542, 297, false); out.push(`${s}: OK`); } catch (e) { out.push(`${s}: ${e.message}`); }
  }
  const ok = !out.some((l) => /HTTP|Ikke/.test(l));
  return { ok, message: `Kartverket topo (standard) trenger ingen nøkkel. ${out.join(' · ')}` };
}
