// Prompt 46 (SERVER46, koordinator): Vær-kortet på Hjem (/api/mobile/home) og Glimt-briefen («13° i Oslo») brukte alltid serverens
// standardsted. Når klienten står på «Min posisjon» (__gps) sender den enhetens posisjon: ?lat=&lon=[&name=] (eller ?gps=0 for å slå av).
// Posisjonen lagres per bruker (kv here46, 6 t), så også briefen som lages i bakgrunnen/push bruker den. Stedsnavnet kommer fra
// klienten (name) eller fra værdata; ellers «Min posisjon». Posisjonen sendes aldri videre til andre brukere.
//
// Prompt 45 (SERVER45): Vær «Min posisjon» i værappen.
//   GET /api/weather/here?lat=&lon=[&selLat=&selLon=] → {label, place, now, today, sameAsSelected, distanceKm, updatedAt, refreshAfterSec}
//        Posisjonen kommer fra enheten som har appen åpen; den lagres ikke (avrundes til ~100 m før oppslag og cache).
import { Hono } from 'hono';
import { kv } from '../db.js';
import { config } from '../config.js';
import { authOrToken as authOrToken0 } from '../mobile.js';
import { fetchWeather } from './met.js';
import { weatherFull, iconOf, wmoText } from './full.js';

const MAX_AGE = 6 * 3600_000;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 1e4) / 1e4 : null; };
/** Leser ?lat/lon/name/gps fra forespørselen og lagrer. → posisjonen som gjelder nå, eller null */
export function noteHere46(c, user = c.get('user')) {
  if (!user) return null;
  if (c.req.query('gps') === '0') { kv.set(user, 'here46', null); return null; }
  const lat = num(c.req.query('lat'), -90, 90), lon = num(c.req.query('lon'), -180, 180);
  if (lat != null && lon != null) {
    const name = String(c.req.query('name') ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || null;
    const h = { lat, lon, name, at: Date.now() };
    kv.set(user, 'here46', h);
    return h;
  }
  return here46(user);
}
/** Fersk posisjon for brukeren (≤ 6 t), eller null. */
export function here46(user, now = Date.now()) {
  const h = kv.get(user, 'here46', null);
  return h && Number.isFinite(h.lat) && Number.isFinite(h.lon) && now - (h.at ?? 0) <= MAX_AGE ? h : null;
}
const cache = new Map();
let impl = null;
/** Bare for tester: ({lat, lon, place}) → værobjekt (samme form som /api/weather). */
export const _setHereWeather46 = (fn) => { impl = fn; cache.clear(); };
/** Været der enheten er (samme form som integrations.getWeather), cache 10 min per ~1 km. */
export async function hereWeather46(h, fallback = null) {
  const key = `${h.lat.toFixed(2)},${h.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { ...hit.w, place: h.name ?? hit.w.place };
  let w;
  if (impl) w = await impl({ lat: h.lat, lon: h.lon, place: h.name });
  else if (process.env.MOCK_DATA === '1' && fallback) w = { ...(await fallback()) };
  else w = await fetchWeather({ lat: h.lat, lon: h.lon, place: h.name ?? 'Min posisjon', userAgent: config.metUserAgent });
  w = { ...w, lat: h.lat, lon: h.lon, place: h.name ?? (w.place && w.place !== 'Oslo' ? w.place : 'Min posisjon'), source: w.source ?? 'met', here: true };
  cache.set(key, { at: Date.now(), w });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return w;
}

const MOCK = () => process.env.MOCK_DATA === '1';
const authOrToken = (c, next) => authOrToken0(c, next); // sen binding (mobile.js importerer denne fila)

/* ---------------- Vær: Min posisjon ---------------- */

const KNOWN = [['Oslo', 59.9139, 10.7522], ['Majorstuen', 59.9296, 10.7146], ['Grünerløkka', 59.9235, 10.7590], ['Frogner', 59.9201, 10.7067], ['Bergen', 60.3913, 5.3221], ['Trondheim', 63.4305, 10.3951], ['Tromsø', 69.6492, 18.9553], ['Hafjell', 61.2331, 10.4372], ['Stavanger', 58.9700, 5.7331], ['Kristiansand', 58.1467, 7.9956]];
const km = (a, b, c, d) => { const R = 6371, x = ((c - a) * Math.PI) / 180, y = ((d - b) * Math.PI) / 180; const h = Math.sin(x / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const nearestKnown = (lat, lon) => KNOWN.map(([n, a, b]) => [n, km(lat, lon, a, b)]).sort((x, y) => x[1] - y[1])[0];
const geoCache = new Map(); let lastGeo = 0;
let fetchGeo = null;
/** Bare for tester: erstatter omvendt geokoding (lat, lon) → navn. */
export const _setHereGeo45 = (fn) => { fetchGeo = fn; geoCache.clear(); };
async function placeName(lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (geoCache.has(k)) return geoCache.get(k);
  let name = null;
  if (fetchGeo) name = await fetchGeo(lat, lon).catch(() => null);
  else if (!MOCK() && Date.now() - lastGeo > 1100) {
    lastGeo = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=nb&lat=${lat}&lon=${lon}`, { headers: { 'User-Agent': 'homelab-os (vær min posisjon)', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      const a = r.ok ? (await r.json())?.address ?? {} : {};
      name = a.suburb ?? a.city_district ?? a.village ?? a.town ?? a.city ?? a.municipality ?? null;
    } catch { /* faller tilbake */ }
  }
  if (!name) { const [n, d] = nearestKnown(lat, lon); name = d < 15 ? n : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`; }
  if (geoCache.size > 500) geoCache.clear();
  geoCache.set(k, name);
  return name;
}
export async function weatherHere45(lat, lon, sel = null) {
  const la = Math.round(lat * 1000) / 1000, lo = Math.round(lon * 1000) / 1000;
  const [w, name] = await Promise.all([weatherFull({ lat: la, lon: lo, name: 'Min posisjon' }), placeName(la, lo)]);
  const cur = w.current ?? {}, code = cur.code ?? 0;
  const dist = sel ? Math.round(km(la, lo, sel.lat, sel.lon) * 10) / 10 : null;
  return { label: 'MIN POSISJON', place: { name, lat: la, lon: lo }, now: { temp: cur.temp ?? null, text: cur.text ?? wmoText(code), code, icon: iconOf(code), isDay: cur.isDay !== false, wind: cur.wind ?? null },
    today: { hi: w.today?.hi ?? null, lo: w.today?.lo ?? null, precipProb: w.today?.precipProb ?? null }, sameAsSelected: dist != null && dist <= 2, distanceKm: dist,
    source: w.source ?? null, updatedAt: new Date().toISOString(), refreshAfterSec: 600 };
}
export const weather45Api = new Hono();
weather45Api.get('/here', authOrToken, async (c) => {
  const lat = Number(c.req.query('lat')), lon = Number(c.req.query('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || c.req.query('lat') === '' || c.req.query('lon') === '') return c.json({ error: 'Mangler gyldig posisjon (lat, lon)', needsPermission: true, text: 'Slå på posisjon for å se været der du er', button: 'Tillat' }, 400);
  const sl = Number(c.req.query('selLat')), sn = Number(c.req.query('selLon'));
  try { return c.json(await weatherHere45(lat, lon, Number.isFinite(sl) && Number.isFinite(sn) && c.req.query('selLat') ? { lat: sl, lon: sn } : null), 200, { 'Cache-Control': 'private, max-age=300' }); }
  catch (e) { return c.json({ error: `Fikk ikke hentet været: ${e.message}` }, 502); }
});
