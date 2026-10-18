// Felles bakgrunnstjeneste (prompt 19, foto fra Wikimedia Commons i prompt 21) for Homelab og FinansHub, web og app.
//
// GET /api/background gir {type, url, image_url, fallbacks, credit, theme_hint, gradient, scrim, …} for brukerens valg
// (Innstillinger → Utseende → Bakgrunn). Toppbildet er alltid et ekte fotografi, aldri en tegning:
// - weather: været nå fra MET (hvert 30. min). Værkoden velger vaer_klart, vaer_sky eller vaer_regn (0–1, 2–50, 51+ for
//   Open-Meteo weather_code; MET symbol_code kartlegges tilsvarende). Unsplash/Pexels når nøkkelen finnes, ellers Wikimedia.
// - planets: Jorda, Månen, Jupiter, Mars og Saturn (NASA m.fl. via Wikimedia Commons). Dagens planet er
//   floor(Date.now()/864e5) % 5, eller planeten brukeren har valgt (bgPlanet).
// - oslo: egne opplastede bilder (DATA_DIR/backgrounds/oslo), så Unsplash/Pexels («Oslo aerial»), så Wikimedia.
// - ruter (bare ?type=ruter): trikkefoto til Ruter-visningen.
// - custom: brukerens eget bilde (/api/me/photo-window). none/cur: bare gradient.
// Wikimedia-fotoene ligger ferdig nedlastet i server/backgrounds/files (fetch-backgrounds.mjs i GitHub Actions). Mangler de,
// lastes de ned ved første bruk via Special:FilePath (width=2000, reserve 1280, 9 s per forsøk) og caches på disk.
// Når ingen foto finnes, er image_url null og klienten viser gradienten linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c).
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { kv, OWNER } from './db.js';
import { cfg } from './settings.js';
import { isAdmin } from './auth.js';
import { authOrToken, designOf, layoutOf } from './mobile.js';
import { CATALOG, PLANETS, PLANET_NAME, PLANET_FILES, KNOWN_CREDITS, bundledPath, filePathUrl, infoUrl, pageUrl, creditFromInfo } from './backgrounds/catalog.js';

const isMock = () => process.env.MOCK_DATA === '1';
const ROOT = join(config.dataDir, 'backgrounds');
const CACHE = join(ROOT, 'cache');
const OSLO = join(ROOT, 'oslo');
await mkdir(CACHE, { recursive: true });
await mkdir(OSLO, { recursive: true });

const UA = () => config.metUserAgent || 'homelab-os (bakgrunn)';
const HOUR = 3600_000, DAY = 86400_000;

/* ---------------- Små hjelpere ---------------- */

const run = (cmd, args, timeout = 30_000) => new Promise((res, rej) => {
  execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (e, out) => (e ? rej(e) : res(out)));
});
let MAGICK;
async function magick() {
  if (MAGICK !== undefined) return MAGICK;
  for (const c of ['magick', 'convert']) { try { await run(c, ['-version'], 5000); return (MAGICK = c); } catch { /* prøv neste */ } }
  return (MAGICK = null);
}
export const _setMagick = (v) => { MAGICK = v; };
const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const imgType = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
  : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
async function getJson(url, headers = {}, timeout = 8000) {
  const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw Object.assign(new Error(`svarte ${r.status}`), { status: r.status });
  return r.json();
}
const dayIndex = (now = Date.now()) => Math.floor((now + 3600_000) / DAY);   // norsk døgn (grovt +1 t)
const hourIndex = (now = Date.now()) => Math.floor(now / HOUR);
const nextMidnight = (now = Date.now()) => new Date((dayIndex(now) + 1) * DAY - 3600_000).toISOString();
const nextHour = (now = Date.now()) => new Date((hourIndex(now) + 1) * HOUR).toISOString();

/* ---------------- Bildelager (metadata i kv, filer på disk) ---------------- */

const META = 'bg_images';
const metaAll = () => kv.get(OWNER, META, {});
const metaGet = (id) => metaAll()[id] ?? null;
function metaSet(id, m) { const a = metaAll(); a[id] = { ...(a[id] ?? {}), ...m }; kv.set(OWNER, META, a); return a[id]; }

// Medfølgende bilder har id «b-<navn>» (f.eks. b-weather-clear).

/** Sørger for at bildet fra url finnes på disk. Gir id-en, eller null når nedlastingen feiler. */
const inflight = new Map();
export async function ensureImage(src, credit = {}, { theme } = {}) {
  const id = sha(src);
  const m = metaGet(id);
  if (m?.file) { try { await stat(join(CACHE, m.file)); return id; } catch { /* filen er borte, last ned på nytt */ } }
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    try {
      const r = await fetch(src, { headers: { 'User-Agent': UA() }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`bildet svarte ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      const t = imgType(b);
      if (!t || b.length > 30 * 1024 * 1024) throw new Error('ikke et gyldig bilde');
      const file = `${id}.${EXT[t]}`;
      await writeFile(join(CACHE, file), b);
      const hint = theme ?? (await luminanceHint(join(CACHE, file)));
      metaSet(id, { file, src, credit, theme: hint, at: Date.now() });
      return id;
    } catch (e) {
      console.warn('[bakgrunn]', src.slice(0, 80), e.message);
      return null;
    } finally { inflight.delete(id); }
  })();
  inflight.set(id, p);
  return p;
}

/** Lyst eller mørkt bilde? Snittlysheten fra ImageMagick (1×1 piksel). null uten ImageMagick. */
async function luminanceHint(path) {
  const mg = await magick();
  if (!mg) return null;
  try {
    const out = await run(mg, [`${path}[0]`, '-resize', '1x1!', '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:'], 15_000);
    const v = parseFloat(out);
    return Number.isFinite(v) ? (v > 0.58 ? 'light' : 'dark') : null;
  } catch { return null; }
}

const BUCKETS = [480, 720, 1080, 1440, 1920, 2560];
const bucketFor = (w) => BUCKETS.find((b) => b >= w) ?? 2560;
/** Bildet i ønsket bredde som WebP (ImageMagick), eller originalen. */
async function sized(srcPath, id, width) {
  const mg = await magick();
  const b = bucketFor(width);
  if (!mg) { const body = await readFile(srcPath); return { body, type: imgType(body) ?? 'image/jpeg', etag: `"${id}-orig"` }; }
  const out = join(CACHE, `${id}-${b}.webp`);
  try { return { body: await readFile(out), type: 'image/webp', etag: `"${id}-${b}"` }; } catch { /* lag den */ }
  try {
    await run(mg, [`${srcPath}[0]`, '-auto-orient', '-strip', '-resize', `${b}x${b}>`, '-quality', '78', `webp:${out}`], 45_000);
    return { body: await readFile(out), type: 'image/webp', etag: `"${id}-${b}"` };
  } catch {
    const body = await readFile(srcPath); return { body, type: imgType(body) ?? 'image/jpeg', etag: `"${id}-orig"` };
  }
}
const imgUrl = (id, w) => `/api/background/img/${id}${w ? `?w=${w}` : ''}`;

/* ---------------- Fotobyråer: Unsplash og Pexels ---------------- */

const searchCache = new Map(); // nøkkel → { at, items }
async function stockSearch(query, { orientation = 'landscape' } = {}) {
  const key = `${query}|${orientation}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.items;
  let items = [];
  const uKey = cfg('unsplash_key'), pKey = cfg('pexels_key');
  if (uKey && !isMock()) {
    try {
      const d = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=20&content_filter=high`, { Authorization: `Client-ID ${uKey}`, 'Accept-Version': 'v1' });
      items = (d.results ?? []).map((p) => ({
        src: `${p.urls?.raw}&w=2560&q=80&fm=jpg&fit=max`, download: p.links?.download_location,
        credit: { text: `Foto: ${p.user?.name ?? 'Ukjent'} på Unsplash`, author: p.user?.name ?? null, url: `${p.links?.html ?? 'https://unsplash.com'}?utm_source=homelab_os&utm_medium=referral`, source: 'Unsplash' },
      })).filter((x) => x.src.startsWith('https://'));
    } catch (e) { console.warn('[bakgrunn] Unsplash:', e.message); }
  }
  if (!items.length && pKey && !isMock()) {
    try {
      const d = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=20`, { Authorization: pKey });
      items = (d.photos ?? []).map((p) => ({
        src: p.src?.large2x || p.src?.original,
        credit: { text: `Foto: ${p.photographer ?? 'Ukjent'} på Pexels`, author: p.photographer ?? null, url: p.url ?? p.photographer_url ?? 'https://www.pexels.com', source: 'Pexels' },
      })).filter((x) => x.src?.startsWith('https://'));
    } catch (e) { console.warn('[bakgrunn] Pexels:', e.message); }
  }
  searchCache.set(key, { at: Date.now(), items });
  return items;
}
export const _clearSearch = () => searchCache.clear();

// Unsplash krever at «download»-endepunktet kalles når et bilde tas i bruk.
const pinged = new Set();
function unsplashPing(item) {
  if (!item?.download || pinged.has(item.download)) return;
  pinged.add(item.download);
  fetch(item.download, { headers: { Authorization: `Client-ID ${cfg('unsplash_key')}` }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}

/** Første bilde fra et søk som lar seg laste ned, valgt etter dagens indeks. */
async function fromStock(query, index) {
  const items = await stockSearch(query);
  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const it = items[(index + i) % items.length];
    const id = await ensureImage(it.src, it.credit);
    if (id) { unsplashPing(it); return { id, credit: it.credit }; }
  }
  return null;
}

/* ---------------- Vær (MET) ---------------- */

const wxCache = new Map(); // "lat,lon" → { at, symbol, temp, isDay }
export function weatherKindOf(symbol = '') {
  const s = String(symbol ?? '');
  if (/thunder/.test(s)) return 'thunder';
  if (/snow|sleet/.test(s)) return 'snow';
  if (/rain|showers|drizzle/.test(s)) return 'rain';
  if (/fog/.test(s)) return 'fog';
  if (/^cloudy/.test(s)) return 'cloudy';
  if (/partlycloudy|^fair/.test(s)) return 'partly';
  if (/clearsky/.test(s)) return 'clear';
  return 'cloudy';
}
const WX_TEXT = { clear: 'Klart', partly: 'Delvis skyet', cloudy: 'Skyet', rain: 'Regn', snow: 'Snø', fog: 'Tåke', thunder: 'Torden' };
const WX_QUERY = {
  clear: ['clear blue sky sun', 'clear night sky stars'], partly: ['partly cloudy sky', 'moon clouds night'], cloudy: ['overcast clouds sky', 'cloudy night sky'],
  rain: ['rain window drops', 'rainy night city lights'], snow: ['snow forest winter', 'snowy night'], fog: ['foggy forest', 'fog night street'], thunder: ['thunderstorm lightning', 'lightning night'],
};
const gradColors = (g) => (String(g).match(/#[0-9a-f]{6}/gi) ?? []).slice(0, 3);

export async function currentWeather(lat, lon, now = Date.now()) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = wxCache.get(key);
  if (hit && now - hit.at < 30 * 60_000) return hit;
  if (isMock()) { const w = { at: now, symbol: 'partlycloudy_day', temp: 9, isDay: true }; wxCache.set(key, w); return w; }
  let symbol = null, temp = null, isDay = null;
  try {
    const d = await getJson(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { 'User-Agent': UA() });
    const ts = (d.properties?.timeseries ?? []).find((t) => Date.parse(t.time) >= now - HOUR) ?? d.properties?.timeseries?.[0];
    symbol = ts?.data?.next_1_hours?.summary?.symbol_code ?? ts?.data?.next_6_hours?.summary?.symbol_code ?? null;
    temp = ts?.data?.instant?.details?.air_temperature ?? null;
  } catch (e) { console.warn('[bakgrunn] MET:', e.message); }
  try {
    const date = new Date(now + HOUR).toISOString().slice(0, 10);
    const s = await getJson(`https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&date=${date}&offset=+01:00`, { 'User-Agent': UA() });
    const up = Date.parse(s.properties?.sunrise?.time ?? ''), down = Date.parse(s.properties?.sunset?.time ?? '');
    if (Number.isFinite(up) && Number.isFinite(down)) isDay = now >= up && now < down;
    else if (s.properties?.sunrise?.time === null) isDay = false; // mørketid
  } catch { /* faller tilbake til symbolet */ }
  if (isDay === null) isDay = symbol ? !/_night|polartwilight/.test(symbol) : (new Date(now).getUTCHours() + 1) % 24 >= 7 && (new Date(now).getUTCHours() + 1) % 24 < 19;
  const w = { at: now, symbol, temp, isDay };
  if (symbol) wxCache.set(key, w);
  return w;
}
export const _clearWeather = () => wxCache.clear();

/* ---------------- Wikimedia Commons (prompt 21) ---------------- */

// Ferdig nedlastede kopier (server/backgrounds/files, følger med i Docker-imaget). BG_FILES_DIR overstyrer (testene).
const FILES = process.env.BG_FILES_DIR || join(dirname(fileURLToPath(import.meta.url)), 'backgrounds', 'files');
const WIKI_UA = 'KristoHomelab/1.0 (https://kristo.no; kontakt@kristo.no)';
export const FALLBACK_GRADIENT = 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';
export const SCRIM = 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,0) 35%, rgba(0,0,0,.45))';
const wmId = (file) => `wm-${sha(`wikimedia:${file}`)}`;
// id → { file, keys } for alle filene i katalogen.
const WM = new Map();
for (const [key, files] of Object.entries(CATALOG)) for (const f of files) { const id = wmId(f); const e = WM.get(id) ?? { file: f, keys: [] }; e.keys.push(key); WM.set(id, e); }

let creditsCache = { m: -1, data: {} };
function bundledCredits() {
  const p = join(FILES, 'credits.json');
  try {
    const m = statSync(p).mtimeMs;
    if (m !== creditsCache.m) creditsCache = { m, data: JSON.parse(readFileSync(p, 'utf8')) };
  } catch { creditsCache = { m: -1, data: {} }; }
  return creditsCache.data;
}
/** Ferdig nedlastet kopi i ønsket størrelse (1080 når det holder, ellers 2000). */
function bundledFor(file, width = 2000) {
  const e = WM.get(wmId(file));
  for (const key of e?.keys ?? []) {
    const sizes = width <= 1080 ? [1080, 2000] : [2000, 1080];
    for (const s of sizes) { const p = bundledPath(FILES, key, file, s); if (existsSync(p)) return { path: p, size: s }; }
  }
  return null;
}
function wikiCredit(file, extra) {
  const b = bundledCredits()[file] ?? {}, m = metaGet(wmId(file))?.credit ?? {};
  const [kAuthor, kLicense] = KNOWN_CREDITS[file] ?? [];
  const author = b.author || m.author || kAuthor || null, license = b.license || m.license || kLicense || null;
  return { text: `${author ? `${author} · ` : ''}Wikimedia Commons`, author, license, licenseUrl: b.licenseUrl || m.licenseUrl || null, url: pageUrl(file), source: 'Wikimedia Commons', file, ...extra };
}

// Nedlasting ved første bruk. Feilet en fil nylig, prøves den ikke igjen på 15 minutter.
const wmInflight = new Map(), wmFailed = new Map();
async function fetchWiki(file) {
  const id = wmId(file);
  for (const w of [2000, 1280]) {
    try {
      const r = await fetch(filePathUrl(file, w), { headers: { 'User-Agent': WIKI_UA, Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
      if (!r.ok) { await r.body?.cancel?.().catch(() => {}); continue; }
      const b = Buffer.from(await r.arrayBuffer());
      const t = imgType(b);
      if (!t || b.length > 30 * 1024 * 1024) continue;
      const name = `${id}.${EXT[t]}`;
      await writeFile(join(CACHE, name), b);
      let credit = {};
      try { credit = creditFromInfo(await getJson(infoUrl(file), { 'User-Agent': WIKI_UA }, 5000)); } catch { /* kreditering fra KNOWN_CREDITS */ }
      metaSet(id, { file: name, src: filePathUrl(file, w), wikimedia: file, credit, theme: (await luminanceHint(join(CACHE, name))) ?? 'dark', at: Date.now() });
      return id;
    } catch (e) { console.warn('[bakgrunn] Wikimedia', file, e.message); }
  }
  wmFailed.set(file, Date.now());
  return null;
}
async function cachedWiki(id) {
  const m = metaGet(id);
  if (!m?.file) return false;
  try { await stat(join(CACHE, m.file)); return true; } catch { return false; }
}
/** Er fotoet tilgjengelig nå (ferdig nedlastet eller i cachen)? */
const wikiReady = async (file) => !!bundledFor(file) || (await cachedWiki(wmId(file)));
function wikiDownload(file) {
  if (isMock()) return Promise.resolve(null); // ingen nett i demo/test
  if (wmInflight.has(file)) return wmInflight.get(file);
  if (Date.now() - (wmFailed.get(file) ?? 0) < 15 * 60_000) return Promise.resolve(null);
  const p = fetchWiki(file).finally(() => wmInflight.delete(file));
  wmInflight.set(file, p);
  return p;
}
export const _clearWiki = () => { wmFailed.clear(); };

/**
 * Første tilgjengelige foto av filene (i rekkefølge). Mangler alle, lastes de ned etter tur, men kallet venter høyst
 * budget ms totalt; nedlastingen fortsetter i bakgrunnen, så neste kall har bildet. Gir { id, file, fallbacks } eller null.
 */
export async function wikiPick(files, { budget = 12_000 } = {}) {
  const ready = [];
  for (const f of files) if (await wikiReady(f)) ready.push(f);
  if (ready.length) return { id: wmId(ready[0]), file: ready[0], fallbacks: ready.slice(1, 3).map(wmId) };
  const end = Date.now() + budget;
  for (const f of files) {
    const left = end - Date.now();
    if (left <= 0) break;
    let timer;
    const id = await Promise.race([wikiDownload(f), new Promise((r) => { timer = setTimeout(() => r(null), left); })]);
    clearTimeout(timer);
    if (id) return { id, file: f, fallbacks: [] };
  }
  return null;
}
/** Rekkefølgen starter på dagens indeks, så hver dag får et nytt bilde når det finnes flere. */
const rotate = (list, i) => list.map((_, k) => list[(i + k) % list.length]);

/** Værkode → nøkkel. Tall: Open-Meteo weather_code (0–1 klart, 2–50 skyet, 51+ regn). Tekst: MET symbol_code. */
export function vaerKey(code) {
  if (code === null || code === undefined || code === '') return 'vaer_sky';
  if (typeof code === 'number' || /^\d+$/.test(String(code))) { const n = +code; return n <= 1 ? 'vaer_klart' : n <= 50 ? 'vaer_sky' : 'vaer_regn'; }
  const k = weatherKindOf(code);
  return k === 'clear' ? 'vaer_klart' : ['rain', 'snow', 'thunder'].includes(k) ? 'vaer_regn' : 'vaer_sky';
}

/* ---------------- Planeter (Wikimedia Commons) ---------------- */

export { PLANETS };
// Dagens planet: floor(Date.now()/864e5) % 5 (Jorda, Månen, Jupiter, Mars, Saturn). «hourly» bytter hver time.
export const planetOfDay = (now = Date.now(), rotateBy = 'daily') => PLANETS[Math.floor(now / (rotateBy === 'hourly' ? HOUR : DAY)) % PLANETS.length];
/** Filene for planeten først, så de andre planetfotoene som reserve. */
const planetFiles = (p) => [...PLANET_FILES[p], ...CATALOG.planet.filter((f) => !PLANET_FILES[p].includes(f))];
const planetOfFile = (file) => PLANETS.find((p) => PLANET_FILES[p].includes(file)) ?? null;

/* ---------------- Oslo: egne bilder ---------------- */

async function osloUploads() {
  try {
    const files = (await readdir(OSLO)).filter((f) => /^[a-f0-9]{16}\.(jpg|png|webp)$/.test(f)).sort();
    return Promise.all(files.map(async (f) => { const s = await stat(join(OSLO, f)); return { id: `o-${f.split('.')[0]}`, file: f, size: s.size, created: s.mtimeMs }; }));
  } catch { return []; }
}

/* ---------------- Innstillinger ---------------- */

export const BG_TYPES = ['weather', 'planets', 'oslo', 'custom', 'none', 'cur'];
const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, Math.round(+v))) : d);
export function bgSettings(userId) {
  const l = layoutOf(userId), d = designOf(userId);
  const photoMap = { cur: 'cur', oslo: 'oslo', weather: 'weather', planets: 'planets', custom: 'custom' };
  return {
    type: BG_TYPES.includes(l.bgType) ? l.bgType : (photoMap[d.photo] ?? 'cur'),
    planet: ['auto', ...PLANETS].includes(l.bgPlanet) ? l.bgPlanet : 'auto',
    planetRotate: l.bgRotate === 'hourly' ? 'hourly' : 'daily',
    blur: clamp(l.bgBlur, 0, 20, 0), dim: clamp(l.bgDim, 0, 60, 0),
    wifiOnly: !!l.bgWifiOnly, animate: l.bgAnimate !== false,
  };
}

/* ---------------- Selve tjenesten ---------------- */

const CUR_GRADIENT = 'linear-gradient(160deg, #1d2a44 0%, #3a3f6b 45%, #c9826b 100%)';
const out = (type, o) => {
  const r = { type, image_url: null, fallbacks: [], credit: null, theme_hint: 'dark', gradient: CUR_GRADIENT, scrim: SCRIM, particles: null, next: null, ...o };
  return { ...r, url: r.image_url, colors: gradColors(r.gradient) };
};
const themeOf = (id, d = 'dark') => metaGet(id)?.theme ?? d;
// Typer i ?type=. «ruter» kan ikke velges som bakgrunn, bare hentes. planet/vaer er aliasene fra designet.
const QUERY_TYPE = { planet: 'planets', vaer: 'weather', ruter: 'ruter' };
// Ingen foto ennå (ikke lastet ned, eller ingen nett): bare navnet, gradienten vises.
const NONE_CREDIT = (what) => ({ text: what, author: null, license: null, url: null, source: null });

/** Wikimedia-foto for en nøkkel (eller en filliste), som felt til out(). null når ingen foto finnes ennå. */
async function wikiOut(files, width, start = 0, extraCredit) {
  const pick = await wikiPick(rotate(files, start));
  if (!pick) return null;
  return { image_url: imgUrl(pick.id, width), fallbacks: pick.fallbacks.map((id) => imgUrl(id, width)), credit: wikiCredit(pick.file, extraCredit), theme_hint: themeOf(pick.id), file: pick.file };
}

/** Bakgrunnen for brukeren. type overstyrer valget (forhåndsvisning). */
export async function backgroundFor(userId, { type, lat, lon, w = 1440, now = Date.now(), planet, code } = {}) {
  const st = bgSettings(userId);
  const qt = QUERY_TYPE[type] ?? type;
  const t = BG_TYPES.includes(qt) || qt === 'ruter' ? qt : st.type;
  const width = Math.min(2560, Math.max(320, Math.round(+w || 1440)));
  const base = { settings: st };

  if (t === 'weather') {
    const la = Number.isFinite(+lat) && +lat !== 0 ? +lat : (parseFloat(cfg('wx_lat')) || config.location.lat);
    const lo = Number.isFinite(+lon) && +lon !== 0 ? +lon : (parseFloat(cfg('wx_lon')) || config.location.lon);
    const wx = await currentWeather(la, lo, now);
    const kind = weatherKindOf(wx.symbol ?? '');
    // ?code= (Open-Meteo weather_code eller MET symbol_code) overstyrer værkoden, f.eks. når klienten har egne værdata.
    const key = vaerKey(code ?? wx.symbol);
    const stock = await fromStock(WX_QUERY[kind][wx.isDay ? 0 : 1], dayIndex(now));
    const wiki = await wikiOut(CATALOG[key], width, Math.floor(now / DAY));
    const text = `${WX_TEXT[kind]}${wx.temp != null ? ` · ${Math.round(wx.temp)}°` : ''}`;
    const img = stock ? { image_url: imgUrl(stock.id, width), fallbacks: wiki ? [wiki.image_url, ...wiki.fallbacks] : [], credit: { ...stock.credit, text: `${text} · ${stock.credit.text}` }, theme_hint: themeOf(stock.id) } : wiki
      ? { ...wiki, credit: { ...wiki.credit, text: `${text} · ${wiki.credit.text}` } } : { credit: { text: `${text} · MET Norge`, author: null, license: null, url: 'https://www.yr.no', source: 'MET Norge' } };
    delete img.file;
    return out('weather', {
      ...base, ...img, key, gradient: FALLBACK_GRADIENT, weather: { symbol: wx.symbol, kind, isDay: wx.isDay, temp: wx.temp },
      particles: kind === 'rain' || kind === 'thunder' ? 'rain' : kind === 'snow' ? 'snow' : null,
      next: new Date(Math.max(now, (wx.at ?? now)) + 30 * 60_000).toISOString(),
    });
  }

  if (t === 'planets') {
    const p = PLANETS.includes(planet) ? planet : st.planet === 'auto' ? planetOfDay(now, st.planetRotate) : st.planet;
    const wiki = await wikiOut(planetFiles(p), width);
    const shown = wiki ? planetOfFile(wiki.file) ?? p : p;
    if (wiki) delete wiki.file;
    return out('planets', {
      ...base, planet: p, planetName: PLANET_NAME[p], shown, key: 'planet', ...(wiki ?? { credit: NONE_CREDIT(PLANET_NAME[p]) }), theme_hint: 'dark', gradient: FALLBACK_GRADIENT,
      next: st.planetRotate === 'hourly' ? nextHour(now) : new Date((Math.floor(now / DAY) + 1) * DAY).toISOString(),
    });
  }

  if (t === 'oslo') {
    const own = await osloUploads();
    const idx = dayIndex(now);
    let img = null;
    if (own.length) { const o = own[idx % own.length]; img = { image_url: imgUrl(o.id, width), credit: { text: 'Oslo · eget bilde', author: null, license: null, url: null, source: 'Eget bilde' }, theme_hint: 'dark' }; }
    if (!img) { const s = (await fromStock('Oslo aerial', idx)) ?? (await fromStock('Oslo drone', idx)); if (s) img = { image_url: imgUrl(s.id, width), credit: s.credit, theme_hint: themeOf(s.id) }; }
    const wiki = await wikiOut(CATALOG.oslo, width, idx);
    if (wiki) delete wiki.file;
    if (img) img.fallbacks = wiki ? [wiki.image_url, ...wiki.fallbacks] : [];
    return out('oslo', { ...base, key: 'oslo', ...(img ?? wiki ?? { credit: NONE_CREDIT('Oslo') }), gradient: FALLBACK_GRADIENT, next: nextMidnight(now) });
  }

  if (t === 'ruter') {
    const wiki = await wikiOut(CATALOG.ruter, width);
    if (wiki) delete wiki.file;
    return out('ruter', { ...base, key: 'ruter', ...(wiki ?? { credit: NONE_CREDIT('Ruter') }), theme_hint: 'dark', gradient: FALLBACK_GRADIENT });
  }

  if (t === 'custom') {
    const v = kv.get(userId, 'photo_v', 0);
    if (v) return out('custom', { ...base, image_url: `/api/me/photo-window?v=${v}`, credit: { text: 'Eget bilde', author: null, license: null, url: null, source: 'Eget bilde' }, theme_hint: 'dark', gradient: FALLBACK_GRADIENT });
    return out('custom', { ...base, credit: { text: 'Last opp et eget bilde under Innstillinger → Utseende → Bakgrunn', author: null, url: null, source: null }, gradient: FALLBACK_GRADIENT });
  }

  return out(t === 'none' ? 'none' : 'cur', { ...base });
}

/* ---------------- Integrasjonstest (Innstillinger → Integrasjoner → Bakgrunner) ---------------- */

export async function testBackgrounds() {
  const parts = [];
  const uKey = cfg('unsplash_key'), pKey = cfg('pexels_key');
  if (!uKey && !pKey) return { ok: false, message: 'Ingen nøkkel lagt inn. Uten Unsplash eller Pexels brukes fotoene fra Wikimedia Commons for Oslo og vær.' };
  let ok = true;
  if (uKey) { try { const d = await getJson('https://api.unsplash.com/search/photos?query=Oslo&per_page=1', { Authorization: `Client-ID ${uKey}` }); parts.push(`Unsplash virker (${d.total ?? 0} treff på «Oslo»)`); } catch (e) { ok = false; parts.push(`Unsplash: ${e.status === 401 ? 'ugyldig nøkkel' : e.message}`); } }
  if (pKey) { try { const d = await getJson('https://api.pexels.com/v1/search?query=Oslo&per_page=1', { Authorization: pKey }); parts.push(`Pexels virker (${d.total_results ?? 0} treff)`); } catch (e) { ok = false; parts.push(`Pexels: ${e.status === 401 ? 'ugyldig nøkkel' : e.message}`); } }
  searchCache.clear();
  return { ok, message: parts.join(' · ') };
}
export const hasBackgroundTest = (g) => g === 'backgrounds' || g === 'Bakgrunner';

/* ---------------- API ---------------- */

const api = new Hono();
api.use('*', authOrToken);

api.get('/', async (c) => {
  const q = c.req.query();
  const w = Math.round((+q.w || 1440) * Math.min(3, Math.max(1, +q.dpr || 1)));
  try { return c.json(await backgroundFor(c.get('user'), { type: q.type, lat: q.lat, lon: q.lon, w, planet: q.planet, code: q.code })); }
  catch (e) { console.warn('[bakgrunn]', e.message); return c.json(out('cur', { settings: bgSettings(c.get('user')), error: e.message })); }
});

// Forhåndsvisning av hver type i innstillingene. Hver type får høyst 6 s; en som ikke blir ferdig, viser gradienten.
// Forhåndsvisning av hver type i innstillingene. Hver type får høyst 6 s; en som ikke blir ferdig, viser gradienten.
api.get('/previews', async (c) => {
  const id = c.get('user'), w = Math.min(960, +c.req.query('w') || 480);
  const one = (t) => Promise.race([backgroundFor(id, { type: t, w }), new Promise((r) => setTimeout(() => r(out(t, { gradient: FALLBACK_GRADIENT })), 6000).unref?.())])
    .then((b) => ({ image_url: b.image_url, url: b.image_url, credit: b.credit, theme_hint: b.theme_hint, gradient: b.gradient, ...(b.planet ? { planet: b.planet } : {}), ...(b.weather ? { weather: b.weather } : {}) }))
    .catch(() => ({ image_url: null, url: null, credit: null, theme_hint: 'dark', gradient: FALLBACK_GRADIENT }));
  const [weather, planets, oslo, custom, ruter] = await Promise.all(['weather', 'planets', 'oslo', 'custom', 'ruter'].map(one));
  return c.json({ weather, planets, oslo, custom, ruter, none: { image_url: null, url: null, credit: null, theme_hint: 'dark', gradient: CUR_GRADIENT } });
});

// Kreditering for alle Wikimedia-fotoene (Innstillinger → Utseende → Bakgrunn).
api.get('/credits', (c) => c.json({ items: [...WM.values()].map((e) => ({ keys: e.keys, ...wikiCredit(e.file), bundled: !!bundledFor(e.file) })) }));

// Selve bildet i ønsket bredde. id er «wm-<hash>» (Wikimedia), «o-<hash>» (eget Oslo-bilde) eller hash fra cachen.
api.get('/img/:id', async (c) => {
  const id = c.req.param('id');
  const w = Math.min(2560, Math.max(320, +c.req.query('w') || 1440));
  let path = null;
  if (/^wm-[a-f0-9]{16}$/.test(id) && WM.has(id)) {
    const b = bundledFor(WM.get(id).file, w);
    if (b) {
      const etag = `"${id}-b${b.size}"`;
      if (c.req.header('if-none-match') === etag) return c.body(null, 304, { ETag: etag });
      try { return c.body(await readFile(b.path), 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=604800', ETag: etag, 'X-Content-Type-Options': 'nosniff' }); } catch { /* prøv cachen */ }
    }
    const m = metaGet(id); if (m?.file) path = join(CACHE, m.file);
  } else if (/^o-[a-f0-9]{16}$/.test(id)) { const f = (await osloUploads()).find((x) => x.id === id); if (f) path = join(OSLO, f.file); }
  else if (/^[a-f0-9]{16}$/.test(id)) { const m = metaGet(id); if (m?.file) path = join(CACHE, m.file); }
  if (!path) return c.json({ error: 'Fant ikke bildet' }, 404);
  try {
    const r = await sized(path, id, w);
    if (c.req.header('if-none-match') === r.etag) return c.body(null, 304, { ETag: r.etag });
    return c.body(r.body, 200, { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=604800', ETag: r.etag, 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.json({ error: 'Fant ikke bildet' }, 404); }
});

// Egne Oslo-bilder: alle innloggede ser listen, bare admin laster opp og sletter.
api.get('/oslo', async (c) => c.json({ items: (await osloUploads()).map((o) => ({ id: o.id, url: imgUrl(o.id, 720), size: o.size, created: o.created })) }));
api.post('/oslo', bodyLimit({ maxSize: 10 * 15 * 1024 * 1024, onError: (c) => c.json({ error: 'For store filer (maks 15 MB per bilde)' }, 413) }), async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan laste opp Oslo-bilder' }, 403);
  const b = await c.req.parseBody({ all: true }).catch(() => ({}));
  const files = [b.file, b.files, b['files[]']].flat().filter((f) => f instanceof File);
  if (!files.length) return c.json({ error: 'Mangler fil' }, 400);
  const added = [], errors = [];
  for (const f of files.slice(0, 10)) {
    const buf = Buffer.from(await f.arrayBuffer());
    const t = imgType(buf);
    if (buf.length > 15 * 1024 * 1024) { errors.push(`${f.name}: for stort (maks 15 MB)`); continue; }
    if (!t) { errors.push(`${f.name}: bruk JPEG, PNG eller WebP`); continue; }
    const name = `${randomBytes(8).toString('hex')}.${EXT[t]}`;
    await writeFile(join(OSLO, name), buf);
    added.push(`o-${name.split('.')[0]}`);
  }
  return c.json({ added, errors, items: (await osloUploads()).map((o) => ({ id: o.id, url: imgUrl(o.id, 720), size: o.size, created: o.created })) }, added.length ? 201 : 400);
});
api.delete('/oslo/:id', async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan slette Oslo-bilder' }, 403);
  const f = (await osloUploads()).find((x) => x.id === c.req.param('id'));
  if (!f) return c.json({ error: 'Fant ikke bildet' }, 404);
  await unlink(join(OSLO, f.file)).catch(() => {});
  for (const x of await readdir(CACHE).catch(() => [])) if (x.startsWith(`${f.id}-`)) await unlink(join(CACHE, x)).catch(() => {});
  return c.json({ items: (await osloUploads()).map((o) => ({ id: o.id, url: imgUrl(o.id, 720), size: o.size, created: o.created })) });
});

export default api;
