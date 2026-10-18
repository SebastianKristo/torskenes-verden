// Felles bakgrunnstjeneste (prompt 19) for Homelab og FinansHub, web og app.
//
// GET /api/background gir {type, image_url, credit, theme_hint, …} for brukerens valg (Innstillinger → Utseende → Bakgrunn):
// - weather: været nå fra MET Locationforecast 2.0 (hvert 30. min) og dag/natt fra MET Sunrise 3.0. Bildet hentes fra
//   Unsplash eller Pexels (når nøkkelen finnes), ellers brukes de medfølgende værbildene.
// - planets: Jorda, Månen, Jupiter og Mars fra NASA Image and Video Library (fritt å bruke, NASA krediteres).
// - oslo: egne opplastede bilder (DATA_DIR/backgrounds/oslo), ellers Unsplash/Pexels («Oslo aerial»), ellers det medfølgende.
//   Getty Images er lisensbelagt og brukes ikke.
// - custom: brukerens eget bilde (/api/me/photo-window). none/cur: bare gradient.
// Alle bilder lastes ned én gang, caches på disk og skaleres til WebP med ImageMagick når den finnes.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { kv, OWNER } from './db.js';
import { cfg } from './settings.js';
import { isAdmin } from './auth.js';
import { authOrToken, designOf, layoutOf } from './mobile.js';

const isMock = () => process.env.MOCK_DATA === '1';
const BUNDLED = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'bg');
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
const BUNDLED_NAMES = ['oslo', 'planets-1', 'planets-2', 'planets-3', 'weather-clear', 'weather-cloudy', 'weather-fog', 'weather-night', 'weather-rain', 'weather-snow'];
const bundledId = (n) => `b-${n}`;

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
const WX_BUNDLED = { clear: 'weather-clear', partly: 'weather-cloudy', cloudy: 'weather-cloudy', rain: 'weather-rain', snow: 'weather-snow', fog: 'weather-fog', thunder: 'weather-rain' };
function wxGradient(kind, isDay) {
  if (!isDay) return kind === 'clear' || kind === 'partly' ? 'linear-gradient(170deg, #0b1026 0%, #1b2350 55%, #3c3a6e 100%)' : 'linear-gradient(170deg, #10151f 0%, #24303f 60%, #3c4a5a 100%)';
  return {
    clear: 'linear-gradient(170deg, #3d7cc9 0%, #7fb2e5 55%, #f4d9a6 100%)', partly: 'linear-gradient(170deg, #5b8bc4 0%, #9fbfdf 60%, #e8ddc8 100%)',
    cloudy: 'linear-gradient(170deg, #6f7f90 0%, #a9b5c0 60%, #d5dbe0 100%)', rain: 'linear-gradient(170deg, #4a5a6c 0%, #7d8b99 55%, #b7c0c8 100%)',
    snow: 'linear-gradient(170deg, #9fb3c8 0%, #d7e1ea 60%, #f3f5f7 100%)', fog: 'linear-gradient(170deg, #8d949a 0%, #b9bec2 60%, #dcdedf 100%)',
    thunder: 'linear-gradient(170deg, #1f2230 0%, #3b3f55 55%, #6b6a7a 100%)',
  }[kind];
}
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

/* ---------------- Planeter (NASA Image and Video Library) ---------------- */

export const PLANETS = ['earth', 'moon', 'jupiter', 'mars'];
const PLANET_NAME = { earth: 'Jorda', moon: 'Månen', jupiter: 'Jupiter', mars: 'Mars' };
const PLANET_QUERY = { earth: 'Earth Blue Marble', moon: 'full moon', jupiter: 'Jupiter Juno', mars: 'Mars globe' };
async function planetCandidates(planet) {
  const key = `nasa_${planet}`;
  const c = kv.get(OWNER, key, null);
  if (c && Date.now() - c.at < 7 * DAY && c.items?.length) return c.items;
  if (isMock()) return [];
  try {
    const d = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(PLANET_QUERY[planet])}&media_type=image&page_size=30`);
    const items = (d.collection?.items ?? []).map((it) => {
      const m = it.data?.[0] ?? {}, href = it.links?.find((l) => l.render === 'image' || /thumb/.test(l.href ?? ''))?.href ?? it.links?.[0]?.href;
      return href ? { src: href.replace(/~thumb\.(jpg|png)$/i, '~large.$1'), thumb: href, nasaId: m.nasa_id, title: m.title ?? PLANET_NAME[planet] } : null;
    }).filter((x) => x && /^https:\/\//.test(x.src)).slice(0, 8);
    if (items.length) kv.set(OWNER, key, { at: Date.now(), items });
    return items.length ? items : (c?.items ?? []);
  } catch (e) { console.warn('[bakgrunn] NASA:', e.message); return c?.items ?? []; }
}
async function planetImage(planet, index) {
  const items = await planetCandidates(planet);
  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const it = items[(index + i) % items.length];
    const credit = { text: `NASA · ${it.title}`, author: 'NASA', url: `https://images.nasa.gov/details/${encodeURIComponent(it.nasaId ?? '')}`, source: 'NASA Image and Video Library' };
    // «~large» finnes ikke alltid; da prøves miniatyren.
    const id = (await ensureImage(it.src, credit, { theme: 'dark' })) ?? (it.thumb !== it.src ? await ensureImage(it.thumb, credit, { theme: 'dark' }) : null);
    if (id) return { id, credit };
  }
  return null;
}

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
const SPACE_GRADIENT = 'linear-gradient(170deg, #05060d 0%, #141a33 100%)';
const OSLO_GRADIENT = 'linear-gradient(170deg, #f2b36b 0%, #d7766a 45%, #4a3a5e 100%)';
const out = (type, o) => ({ type, image_url: null, fallbacks: [], credit: null, theme_hint: 'dark', gradient: CUR_GRADIENT, particles: null, next: null, ...o, colors: gradColors(o.gradient ?? CUR_GRADIENT) });
const themeOf = (id, d = 'dark') => metaGet(id)?.theme ?? d;

/** Bakgrunnen for brukeren. type overstyrer valget (forhåndsvisning). */
export async function backgroundFor(userId, { type, lat, lon, w = 1440, now = Date.now(), planet } = {}) {
  const st = bgSettings(userId);
  const t = BG_TYPES.includes(type) ? type : st.type;
  const width = Math.min(2560, Math.max(320, Math.round(+w || 1440)));
  const base = { settings: st };

  if (t === 'weather') {
    const la = Number.isFinite(+lat) && +lat !== 0 ? +lat : (parseFloat(cfg('wx_lat')) || config.location.lat);
    const lo = Number.isFinite(+lon) && +lon !== 0 ? +lon : (parseFloat(cfg('wx_lon')) || config.location.lon);
    const wx = await currentWeather(la, lo, now);
    const kind = weatherKindOf(wx.symbol ?? '');
    const gradient = wxGradient(kind, wx.isDay);
    const bundled = bundledId(wx.isDay ? WX_BUNDLED[kind] : 'weather-night');
    const stock = await fromStock(WX_QUERY[kind][wx.isDay ? 0 : 1], dayIndex(now));
    const id = stock?.id ?? bundled;
    const text = `${WX_TEXT[kind]}${wx.temp != null ? ` · ${Math.round(wx.temp)}°` : ''}`;
    return out('weather', {
      ...base, image_url: imgUrl(id, width), fallbacks: stock ? [imgUrl(bundled, width)] : [],
      credit: stock?.credit ? { ...stock.credit, text: `${text} · ${stock.credit.text}` } : { text: `${text} · MET Norge`, url: 'https://www.yr.no', author: null, source: 'MET Norge' },
      theme_hint: stock ? themeOf(id, wx.isDay && ['snow', 'fog', 'cloudy'].includes(kind) ? 'light' : 'dark') : (wx.isDay && ['snow', 'fog'].includes(kind) ? 'light' : 'dark'),
      gradient, weather: { symbol: wx.symbol, kind, isDay: wx.isDay, temp: wx.temp },
      particles: kind === 'rain' || kind === 'thunder' ? 'rain' : kind === 'snow' ? 'snow' : null,
      next: new Date(Math.max(now, (wx.at ?? now)) + 30 * 60_000).toISOString(),
    });
  }

  if (t === 'planets') {
    const idx = st.planetRotate === 'hourly' ? hourIndex(now) : dayIndex(now);
    const p = PLANETS.includes(planet) ? planet : st.planet === 'auto' ? PLANETS[idx % PLANETS.length] : st.planet;
    const img = await planetImage(p, Math.floor(idx / PLANETS.length));
    const bundled = bundledId(`planets-${(idx % 3) + 1}`);
    return out('planets', {
      ...base, planet: p, image_url: imgUrl(img?.id ?? bundled, width), fallbacks: img ? [imgUrl(bundled, width)] : [],
      credit: img?.credit ?? { text: `${PLANET_NAME[p]} · illustrasjon`, author: null, url: null, source: 'Homelab' },
      theme_hint: 'dark', gradient: SPACE_GRADIENT,
      next: st.planetRotate === 'hourly' ? nextHour(now) : nextMidnight(now),
    });
  }

  if (t === 'oslo') {
    const own = await osloUploads();
    const idx = dayIndex(now);
    let id = null, credit = null;
    if (own.length) { const o = own[idx % own.length]; id = o.id; credit = { text: 'Oslo · eget bilde', author: null, url: null, source: 'Eget bilde' }; }
    else {
      const s = (await fromStock('Oslo aerial', idx)) ?? (await fromStock('Oslo drone', idx));
      if (s) ({ id, credit } = s);
    }
    const bundled = bundledId('oslo');
    return out('oslo', {
      ...base, image_url: imgUrl(id ?? bundled, width), fallbacks: id ? [imgUrl(bundled, width)] : [],
      credit: credit ?? { text: 'Oslo · illustrasjon. Legg inn en Unsplash- eller Pexels-nøkkel for ekte bilder.', author: null, url: null, source: 'Homelab' },
      theme_hint: id && !id.startsWith('o-') ? themeOf(id) : 'dark', gradient: OSLO_GRADIENT, next: nextMidnight(now),
    });
  }

  if (t === 'custom') {
    const v = kv.get(userId, 'photo_v', 0);
    if (v) return out('custom', { ...base, image_url: `/api/me/photo-window?v=${v}`, fallbacks: [imgUrl(bundledId('oslo'), width)], credit: { text: 'Eget bilde', author: null, url: null, source: 'Eget bilde' }, theme_hint: 'dark' });
    return out('custom', { ...base, credit: { text: 'Last opp et eget bilde under Innstillinger → Utseende → Bakgrunn', author: null, url: null, source: null } });
  }

  return out(t === 'none' ? 'none' : 'cur', { ...base });
}

/* ---------------- Integrasjonstest (Innstillinger → Integrasjoner → Bakgrunner) ---------------- */

export async function testBackgrounds() {
  const parts = [];
  const uKey = cfg('unsplash_key'), pKey = cfg('pexels_key');
  if (!uKey && !pKey) return { ok: false, message: 'Ingen nøkkel lagt inn. Uten Unsplash eller Pexels brukes de medfølgende illustrasjonene for Oslo og vær.' };
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
  try { return c.json(await backgroundFor(c.get('user'), { type: q.type, lat: q.lat, lon: q.lon, w, planet: q.planet })); }
  catch (e) { console.warn('[bakgrunn]', e.message); return c.json(out('cur', { settings: bgSettings(c.get('user')), error: e.message })); }
});

// Forhåndsvisning av hver type i innstillingene. Hver type får høyst 6 s; en som ikke blir ferdig, viser gradienten.
api.get('/previews', async (c) => {
  const id = c.get('user'), w = Math.min(960, +c.req.query('w') || 480);
  const one = (t) => Promise.race([backgroundFor(id, { type: t, w }), new Promise((r) => setTimeout(() => r(out(t, {})), 6000).unref?.())])
    .then((b) => ({ image_url: b.image_url, credit: b.credit, theme_hint: b.theme_hint, gradient: b.gradient, ...(b.planet ? { planet: b.planet } : {}), ...(b.weather ? { weather: b.weather } : {}) }))
    .catch(() => ({ image_url: null, credit: null, theme_hint: 'dark', gradient: CUR_GRADIENT }));
  const [weather, planets, oslo, custom] = await Promise.all(['weather', 'planets', 'oslo', 'custom'].map(one));
  return c.json({ weather, planets, oslo, custom, none: { image_url: null, credit: null, theme_hint: 'dark', gradient: CUR_GRADIENT } });
});

// Selve bildet i ønsket bredde. id er «b-<navn>» (medfølgende), «o-<hash>» (eget Oslo-bilde) eller hash fra cachen.
api.get('/img/:id', async (c) => {
  const id = c.req.param('id');
  let path = null;
  if (/^b-[a-z0-9-]{2,40}$/.test(id) && BUNDLED_NAMES.includes(id.slice(2))) path = join(BUNDLED, `${id.slice(2)}.jpg`);
  else if (/^o-[a-f0-9]{16}$/.test(id)) { const f = (await osloUploads()).find((x) => x.id === id); if (f) path = join(OSLO, f.file); }
  else if (/^[a-f0-9]{16}$/.test(id)) { const m = metaGet(id); if (m?.file) path = join(CACHE, m.file); }
  if (!path) return c.json({ error: 'Fant ikke bildet' }, 404);
  try {
    const r = await sized(path, id, Math.min(2560, Math.max(320, +c.req.query('w') || 1440)));
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
