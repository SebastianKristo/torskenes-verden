// Prompt 46 (SERVER46, koordinator): Vær-kortet på Hjem (/api/mobile/home) og Glimt-briefen («13° i Oslo») brukte alltid serverens
// standardsted. Når klienten står på «Min posisjon» (__gps) sender den enhetens posisjon: ?lat=&lon=[&name=] (eller ?gps=0 for å slå av).
// Posisjonen lagres per bruker (kv here46, 6 t), så også briefen som lages i bakgrunnen/push bruker den. Stedsnavnet kommer fra
// klienten (name) eller fra værdata; ellers «Min posisjon». Posisjonen sendes aldri videre til andre brukere.
import { kv } from './db.js';
import { config } from './config.js';
import { fetchWeather } from './weather.js';

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
