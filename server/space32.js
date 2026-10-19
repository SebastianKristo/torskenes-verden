// Prompt 32 (SERVER32): Rom – dagens rombilde (NASA APOD), Mars-rovere og alle satellitter (claude-code-rom-ny.md).
// Montert på /api/rom. Sesjon eller app-token (finance:read). NASA-nøkkelen er en server-hemmelighet (NASA_API_KEY /
// Integrasjoner → NASA, standard DEMO_KEY) og sendes aldri til klienten. MOCK_DATA=1: innebygde eksempeldata, ingen nett.
// Posisjoner regnes med full SGP4 (satellite.js, som allerede er en avhengighet og også brukes av klienten via /vendor/satellite/).
//
//   GET /api/rom/apod          → {source:'NASA APOD', today:item, days:[item ×7, nyeste først], cachedAt, mock?}
//        item = {date, title, explanation, copyright|null, mediaType:'image'|'video', url, hdurl|null, thumb}
//   GET /api/rom/mars          → {checkedAt, rovers:[{id:'perseverance'|'curiosity', name, status:'aktiv', sol, earthDate, newPhotos,
//                                  cameras:[{name, fullName, count}], photos:[{id, url, camera, sol, earthDate}] (≤ 6), archive:boolean,
//                                  source:'NASA Mars Rover Photos'|'fra NASA-arkivet', label:'Sol 1650 · 17. okt · 32 nye bilder'}], mock?}
//   GET /api/rom/satellites?city=oslo|bergen|trondheim|tromso[&tle=1]
//        → {count, fetchedAt, group:'active'|…, city:{id, name, lat, lon}, now,
//           categories:[{id, name, color, count}],
//           iss:{name, lat, lon, altKm, speedKmS, elevationDeg, azimuthDeg, dir:'NØ', visible, track:[{t, lat, lon}] (±45 min, hvert 3. min)},
//           overhead:[{name, cat, altKm, elevationDeg, azimuthDeg, dir}] (> 10° over horisonten, romstasjoner først, så etter høyde over horisonten; ≤ 40),
//           sats?:[{name, cat, l1, l2}] (bare med tle=1, for satellite.js i klienten)}
//   GET /api/rom/tle           → text/plain TLE (alle aktive; cache 2 t)
//   GET/PUT /api/rom/settings  {marsNotify:true} – varsel «Perseverance · Sol 1650: 32 nye bilder» (sjekkes hver 6. time)
import { Hono } from 'hono';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as sat from 'satellite.js';
import { kv, OWNER } from './db.js';
import { config } from './config.js';
import { cfg } from './settings.js';
import { authOrToken } from './mobile.js';
import { listUsers } from './auth.js';
import { notifyUser } from './notify.js';

const MOCK = process.env.MOCK_DATA === '1';
const CACHE_DIR = join(config.dataDir, 'cache');
let fetchImpl = null;
/** Bare for tester: erstatter fetch mot NASA og CelesTrak. */
export const _setSpaceFetch = (fn) => { fetchImpl = fn; mem.clear(); };
const useMock = () => MOCK && !fetchImpl;
const f = (url, init = {}) => (fetchImpl ?? fetch)(url, { ...init, headers: { 'User-Agent': config.metUserAgent, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
const nasaKey = () => String(cfg('nasa_key') || config.nasaKey || 'DEMO_KEY');

const mem = new Map();
async function cache(key, ttl, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v;
  try { const v = await fn(); mem.set(key, { at: Date.now(), v }); return v; } catch (e) { if (hit) return hit.v; throw e; }
}
const isoDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const shortD = (s) => `${+s.slice(8, 10)}. ${MON[+s.slice(5, 7) - 1]}`;

/* ---------------- APOD ---------------- */

const apodItem = (a) => ({ date: a.date, title: String(a.title ?? ''), explanation: String(a.explanation ?? ''), copyright: a.copyright ? String(a.copyright).replace(/\s+/g, ' ').trim() : null,
  mediaType: a.media_type === 'video' ? 'video' : 'image', url: a.url ?? null, hdurl: a.hdurl ?? null, thumb: a.media_type === 'video' ? (a.thumbnail_url ?? null) : (a.url ?? null) });
function mockApod(today) {
  const T = [['Spiralgalaksen NGC 1232', 'ESO'], ['Nordlys over Lofoten', 'Ola Nordmann'], ['Månen og Venus i skumringen', null], ['Orion-tåken i infrarødt', 'NASA, ESA, CSA'], ['Saturns ringer fra Cassini', 'NASA/JPL'], ['Melkeveien over Atacama', 'ESO'], ['Pilarer i Ørnetåken', 'NASA, ESA']];
  return Array.from({ length: 7 }, (_, i) => { const date = addDays(today, -i), [title, c] = T[i];
    return { date, title, explanation: `${title}. Eksempeltekst fra Rom (MOCK_DATA=1): med ekte NASA-nøkkel vises dagens forklaring fra Astronomy Picture of the Day her.`, copyright: c, mediaType: 'image',
      url: `/assets/bg/planets-${(i % 3) + 1}.jpg`, hdurl: null, thumb: `/assets/bg/planets-${(i % 3) + 1}.jpg` }; });
}
const LIB_Q = ['nebula', 'galaxy', 'hubble', 'webb telescope', 'aurora from space', 'planet'];
/** Reserve for APOD: 7 bilder fra images-api.nasa.gov (søkeordet roteres per dag), nyeste først. */
async function imageLibraryWeek(today) {
  const y = +today.slice(0, 4), q = LIB_Q[Math.floor(Date.parse(today) / 864e5) % LIB_Q.length];
  const r = await f(`https://images-api.nasa.gov/search?media_type=image&year_start=${y - 2}&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`NASA Image Library svarte ${r.status}`);
  const items = ((await r.json())?.collection?.items ?? []).map((it) => ({ d: it.data?.[0] ?? {}, img: it.links?.find((l) => l.render === 'image' || /\.(jpe?g|png)$/i.test(l.href))?.href ?? it.links?.[0]?.href }))
    .filter((x) => x.img && x.d.nasa_id).sort((a, b) => String(b.d.date_created ?? '').localeCompare(String(a.d.date_created ?? ''))).slice(0, 7);
  return items.map((x, i) => ({ date: addDays(today, -i), title: String(x.d.title ?? 'NASA'), explanation: String(x.d.description ?? '').replace(/<[^>]+>/g, '').slice(0, 900), copyright: null,
    mediaType: 'image', url: x.img.replace('~thumb', '~medium'), hdurl: null, thumb: x.img, link: `https://images.nasa.gov/details/${encodeURIComponent(x.d.nasa_id)}`, source: 'NASA' }));
}
export async function apodWeek() {
  const today = isoDay();
  return cache(`apod:${today}`, 24 * 3600_000, async () => {
    if (useMock()) { const days = mockApod(today); return { source: 'NASA APOD', today: days[0], days, cachedAt: new Date().toISOString(), mock: true }; }
    // Prompt 34 (WEB34, claude-code-rom-nasa-bilder-bla.md): DEMO_KEY er begrenset til 30 kall i timen og feilet ofte, og da
    // viste nettsiden falske eksempelbilder. Feiler APOD, brukes NASA Image Library (ingen nøkkel).
    try {
      const r = await f(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(nasaKey())}&start_date=${addDays(today, -6)}&thumbs=true`);
      if (!r.ok) throw new Error(`NASA svarte ${r.status}`);
      const list = (await r.json()).map(apodItem).filter((a) => a.url || a.thumb).sort((a, b) => (a.date < b.date ? 1 : -1));
      if (!list.length) throw new Error('APOD uten bilder');
      return { source: 'NASA APOD', today: list[0] ?? null, days: list.slice(0, 7), cachedAt: new Date().toISOString() };
    } catch (e) {
      const days = await imageLibraryWeek(today).catch(() => null);
      if (!days?.length) throw e;
      return { source: 'NASA', today: days[0], days, cachedAt: new Date().toISOString(), fallback: true };
    }
  });
}

/* ---------------- Mars ---------------- */

const ROVERS = [['perseverance', 'Perseverance'], ['curiosity', 'Curiosity']];
function roverOut(id, name, photos, { archive = false } = {}) {
  const sol = photos[0]?.sol ?? null, earthDate = photos[0]?.earth_date ?? photos[0]?.earthDate ?? null;
  const cams = new Map();
  for (const p of photos) { const k = p.camera?.name ?? p.camera ?? 'Kamera'; const c = cams.get(k) ?? { name: k, fullName: p.camera?.full_name ?? k, count: 0 }; c.count++; cams.set(k, c); }
  const n = photos.length;
  return { id, name, status: 'aktiv', sol, earthDate, newPhotos: n, cameras: [...cams.values()].sort((a, b) => b.count - a.count),
    photos: photos.slice(0, 6).map((p) => ({ id: p.id, url: String(p.img_src ?? p.url ?? '').replace(/^http:/, 'https:'), camera: p.camera?.name ?? p.camera ?? null, sol: p.sol ?? sol, earthDate: p.earth_date ?? earthDate })),
    archive, source: archive ? 'fra NASA-arkivet' : 'NASA Mars Rover Photos', label: archive ? 'Fra NASA-arkivet' : `Sol ${sol} · ${earthDate ? shortD(earthDate) : '–'} · ${n} nye bilder` };
}
function mockRover(id, name) {
  const today = isoDay(), sol = id === 'perseverance' ? 1650 + Math.floor((Date.now() / 86400_000 - 20380) * 0.973) : 4700 + Math.floor((Date.now() / 86400_000 - 20380) * 0.973);
  const cams = id === 'perseverance' ? [['NAVCAM_LEFT', 'Navigation Camera - Left'], ['MCZ_RIGHT', 'Mast Camera Zoom - Right'], ['FRONT_HAZCAM_LEFT_A', 'Front Hazard Avoidance Camera - Left']] : [['MAST', 'Mast Camera'], ['NAVCAM', 'Navigation Camera'], ['FHAZ', 'Front Hazard Avoidance Camera']];
  const n = id === 'perseverance' ? 32 : 18;
  const photos = Array.from({ length: n }, (_, i) => ({ id: i + 1, sol, earth_date: addDays(today, -1), camera: { name: cams[i % 3][0], full_name: cams[i % 3][1] }, img_src: `/assets/bg/planets-${(i % 3) + 1}.jpg` }));
  return roverOut(id, name, photos);
}
async function roverLatest(id, name) {
  try {
    const r = await f(`https://api.nasa.gov/mars-photos/api/v1/rovers/${id}/latest_photos?api_key=${encodeURIComponent(nasaKey())}`);
    if (!r.ok) throw new Error(`NASA svarte ${r.status}`);
    const photos = (await r.json())?.latest_photos ?? [];
    if (!photos.length) throw new Error('ingen bilder');
    return roverOut(id, name, photos.sort((a, b) => b.id - a.id));
  } catch {
    // Reserve: images.nasa.gov (merket «fra NASA-arkivet»).
    const r = await f(`https://images-api.nasa.gov/search?media_type=image&q=${encodeURIComponent(`${name} rover mars`)}`);
    if (!r.ok) throw new Error(`NASA-arkivet svarte ${r.status}`);
    const items = ((await r.json())?.collection?.items ?? []).filter((i) => i.links?.[0]?.href).slice(0, 6);
    return roverOut(id, name, items.map((i, k) => ({ id: k + 1, sol: null, earth_date: i.data?.[0]?.date_created?.slice(0, 10) ?? null, camera: { name: 'Arkiv', full_name: 'NASA Image Library' }, img_src: i.links[0].href })), { archive: true });
  }
}
export async function marsRovers() {
  return cache('mars', 6 * 3600_000, async () => {
    if (useMock()) return { checkedAt: new Date().toISOString(), rovers: ROVERS.map(([id, n]) => mockRover(id, n)), mock: true };
    return { checkedAt: new Date().toISOString(), rovers: await Promise.all(ROVERS.map(([id, n]) => roverLatest(id, n).catch((e) => ({ id, name: n, status: 'aktiv', error: e.message, photos: [], cameras: [] })))) };
  });
}
/** Hver 6. time: ny sol → varsel til brukere som har det på. */
export async function checkMars() {
  mem.delete('mars');
  const m = await marsRovers();
  const seen = kv.get(OWNER, 'rom_mars_seen', {}) ?? {};
  const fresh = m.rovers.filter((r) => r.sol != null && !r.archive && (seen[r.id] ?? 0) < r.sol);
  if (!fresh.length) return [];
  kv.set(OWNER, 'rom_mars_seen', { ...seen, ...Object.fromEntries(fresh.map((r) => [r.id, r.sol])) });
  if (!Object.keys(seen).length) return []; // første kjøring: bare husk solene
  for (const u of listUsers()) {
    if ((kv.get(u.id, 'rom', {}) ?? {}).marsNotify === false) continue;
    for (const r of fresh) notifyUser(u.id, { title: `${r.name} · Sol ${r.sol}`, body: `${r.newPhotos} nye bilder`, url: '/#/rom', tag: `mars-${r.id}-${r.sol}`, category: 'system', data: { kind: 'mars', rover: r.id, sol: r.sol } }).catch(() => {});
  }
  return fresh;
}

/* ---------------- Satellitter ---------------- */

export const CATS = [
  ['stations', 'Romstasjoner', '#b23a2a', /\b(ISS|ZARYA|TIANGONG|CSS|TIANHE|WENTIAN|MENGTIAN)\b/i],
  ['starlink', 'Starlink', '#6b7cff', /^STARLINK/i],
  ['oneweb', 'OneWeb', '#7a5ad6', /^ONEWEB/i],
  ['nav', 'Navigasjon', '#2f7a4f', /\b(GPS|NAVSTAR|GALILEO|GSAT0|GLONASS|COSMOS 2[45]\d\d|BEIDOU|QZS|IRNSS)\b/i],
  ['earth', 'Vær og jordobservasjon', '#1f7a6e', /\b(NOAA|METEOSAT|MSG|GOES|SENTINEL|LANDSAT|FLOCK|DOVE|PLANET|SKYSAT|METOP|FENGYUN|FY-|HIMAWARI|TERRA|AQUA|SUOMI|JPSS|WORLDVIEW|SPOT|PLEIADES|ICEYE|CAPELLA)\b/i],
  ['comms', 'Kommunikasjon', '#a8661a', /\b(IRIDIUM|INTELSAT|SES|EUTELSAT|INMARSAT|KUIPER|ORBCOMM|GLOBALSTAR|ASTRA|HISPASAT|THOR|TELKOM|VIASAT|ECHOSTAR|O3B|TDRS)\b/i],
  ['other', 'Annet', '#8f897c', /./],
];
export const catOf = (name) => CATS.find(([, , , re]) => re.test(name))[0];
export const CITIES = { oslo: ['Oslo', 59.9139, 10.7522], bergen: ['Bergen', 60.3913, 5.3221], trondheim: ['Trondheim', 63.4305, 10.3951], tromso: ['Tromsø', 69.6492, 18.9553] };

/** Bygger en gyldig TLE (med sjekksum) – brukes for eksempeldata. */
const ck = (l) => { let s = 0; for (const ch of l) { if (ch >= '0' && ch <= '9') s += +ch; else if (ch === '-') s += 1; } return s % 10; };
export function makeTle(num, { inc, raan, ecc, argp, ma, mm }, epoch = new Date()) {
  const y = epoch.getUTCFullYear() % 100, start = Date.UTC(epoch.getUTCFullYear(), 0, 0), doy = (epoch.getTime() - start) / 86400_000;
  const n = String(num).padStart(5, '0');
  const l1 = `1 ${n}U 00000A   ${String(y).padStart(2, '0')}${doy.toFixed(8).padStart(12, '0')}  .00000000  00000-0  00000-0 0  999`;
  const fx = (v, w, d) => v.toFixed(d).padStart(w, ' ');
  const l2 = `2 ${n} ${fx(inc, 8, 4)} ${fx(raan, 8, 4)} ${String(Math.round(ecc * 1e7)).padStart(7, '0')} ${fx(argp, 8, 4)} ${fx(ma, 8, 4)} ${fx(mm, 11, 8)}00010`;
  return [l1 + ck(l1), l2 + ck(l2)];
}
function mockTle() {
  const out = [], ep = new Date(Date.now() - 3600_000);
  let num = 40000;
  const add = (name, el) => { const [l1, l2] = makeTle(num++, el, ep); out.push(name, l1, l2); };
  add('ISS (ZARYA)', { inc: 51.64, raan: 208.9, ecc: 0.0006, argp: 70, ma: 25, mm: 15.4956 });
  add('CSS (TIANHE)', { inc: 41.47, raan: 120.2, ecc: 0.0005, argp: 30, ma: 200, mm: 15.6012 });
  for (let i = 0; i < 720; i++) add(`STARLINK-${1000 + i}`, { inc: 53.05, raan: (i * 5) % 360, ecc: 0.0001, argp: 90, ma: (i * 37) % 360, mm: 15.0626 });
  for (let i = 0; i < 72; i++) add(`ONEWEB-${String(i + 1).padStart(4, '0')}`, { inc: 87.9, raan: (i % 12) * 15, ecc: 0.0002, argp: 90, ma: (i * 30) % 360, mm: 13.1 });
  for (let i = 0; i < 31; i++) add(`GPS BIIF-${i + 1} (PRN ${i + 1})`, { inc: 55, raan: (i % 6) * 60, ecc: 0.005, argp: 30, ma: (i * 52) % 360, mm: 2.0056 });
  for (let i = 0; i < 24; i++) add(`GSAT0${200 + i} (GALILEO ${i + 1})`, { inc: 56, raan: (i % 3) * 120, ecc: 0.0003, argp: 0, ma: (i * 45) % 360, mm: 1.7048 });
  for (let i = 0; i < 24; i++) add(`COSMOS 25${String(i).padStart(2, '0')} (GLONASS)`, { inc: 64.8, raan: (i % 3) * 120, ecc: 0.001, argp: 0, ma: (i * 45) % 360, mm: 2.1314 });
  for (let i = 0; i < 30; i++) add(`BEIDOU-3 M${i + 1}`, { inc: 55, raan: (i % 3) * 120, ecc: 0.0005, argp: 0, ma: (i * 36) % 360, mm: 1.8623 });
  for (const [k, n] of [['NOAA', 6], ['SENTINEL', 10], ['LANDSAT', 2], ['METOP', 3], ['FLOCK', 40]]) for (let i = 0; i < n; i++) add(`${k} ${i + 1}`, { inc: 98.2, raan: (i * 29) % 360, ecc: 0.001, argp: 90, ma: (i * 67) % 360, mm: 14.2 + (i % 3) * 0.4 });
  for (let i = 0; i < 66; i++) add(`IRIDIUM ${100 + i}`, { inc: 86.4, raan: (i % 6) * 30, ecc: 0.0002, argp: 90, ma: (i * 33) % 360, mm: 14.342 });
  for (const [k, n] of [['INTELSAT', 20], ['SES', 15], ['EUTELSAT', 15], ['INMARSAT', 8], ['THOR', 3]]) for (let i = 0; i < n; i++) add(`${k} ${i + 1}`, { inc: 0.05, raan: 80, ecc: 0.0002, argp: 0, ma: (i * 23 + k.length * 40) % 360, mm: 1.0027 });
  for (let i = 0; i < 60; i++) add(`OBJEKT ${i + 1}`, { inc: 30 + (i % 70), raan: (i * 47) % 360, ecc: 0.002, argp: 0, ma: (i * 61) % 360, mm: 12 + (i % 4) });
  return out.join('\n') + '\n';
}
const GROUPS = ['active', 'stations', 'starlink', 'gnss', 'weather', 'resource'];
const tleFile = join(CACHE_DIR, 'tle-active.txt');
export async function tleText() {
  return cache('tle', 2 * 3600_000, async () => {
    if (useMock()) return { text: mockTle(), group: 'mock', fetchedAt: new Date().toISOString(), mock: true };
    const get = async (g) => { const r = await f(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`); if (!r.ok) throw new Error(`CelesTrak svarte ${r.status}`); const t = await r.text(); if (!/^1 /m.test(t)) throw new Error('Uventet svar fra CelesTrak'); return t; };
    try {
      const text = await get('active');
      try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(tleFile, text); } catch { /* bare cache */ }
      return { text, group: 'active', fetchedAt: new Date().toISOString() };
    } catch (e) {
      const parts = [];
      for (const g of GROUPS.slice(1)) { try { parts.push(await get(g)); } catch { /* neste */ } }
      if (parts.length) return { text: parts.join('\n'), group: GROUPS.slice(1).join(','), fetchedAt: new Date().toISOString() };
      try { return { text: readFileSync(tleFile, 'utf8'), group: 'active', fetchedAt: null, stale: true }; } catch { throw e; }
    }
  });
}
function parseTle(text) {
  const L = String(text).split(/\r?\n/).map((s) => s.trimEnd()).filter(Boolean), out = [], seen = new Set();
  for (let i = 0; i + 2 < L.length + 1; i++) {
    if (L[i + 1]?.startsWith('1 ') && L[i + 2]?.startsWith('2 ')) {
      const name = L[i].replace(/^0 /, '').trim(), id = L[i + 1].slice(2, 7);
      if (!seen.has(id)) { seen.add(id); out.push({ name, cat: catOf(name), l1: L[i + 1], l2: L[i + 2] }); }
      i += 2;
    }
  }
  return out;
}
const DIRS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
const dirOf = (az) => DIRS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const deg = (r) => (r * 180) / Math.PI;
function posOf(rec, t, obs) {
  const pv = sat.propagate(rec, t);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const gmst = sat.gstime(t), g = sat.eciToGeodetic(pv.position, gmst);
  const o = { lat: sat.degreesLat(g.latitude), lon: sat.degreesLong(g.longitude), altKm: g.height, speedKmS: pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null };
  if (obs) { const la = sat.ecfToLookAngles(obs, sat.eciToEcf(pv.position, gmst)); o.elevationDeg = deg(la.elevation); o.azimuthDeg = deg(la.azimuth); }
  return Number.isFinite(o.lat) ? o : null;
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const recCache = new Map();
export async function satellites(cityId = 'oslo', { withTle = false, now = new Date() } = {}) {
  const t = await tleText();
  let parsed = recCache.get(t.text);
  if (!parsed) { recCache.clear(); parsed = parseTle(t.text).map((s) => { try { return { ...s, rec: sat.twoline2satrec(s.l1, s.l2) }; } catch { return null; } }).filter((s) => s && !s.rec.error); recCache.set(t.text, parsed); }
  const [cname, lat, lon] = CITIES[cityId] ?? CITIES.oslo;
  const obs = { latitude: (lat * Math.PI) / 180, longitude: (lon * Math.PI) / 180, height: 0.05 };
  const counts = Object.fromEntries(CATS.map(([id]) => [id, 0]));
  for (const s of parsed) counts[s.cat]++;
  const key = `ovh:${cityId}:${Math.floor(now.getTime() / 30_000)}:${parsed.length}`;
  const view = await cache(key, 30_000, async () => {
    const over = [];
    for (const s of parsed) { const p = posOf(s.rec, now, obs); if (p && p.elevationDeg > 10) over.push({ name: s.name, cat: s.cat, altKm: Math.round(p.altKm), elevationDeg: r1(p.elevationDeg), azimuthDeg: Math.round(p.azimuthDeg), dir: dirOf(p.azimuthDeg) }); }
    over.sort((a, b) => (a.cat === 'stations') !== (b.cat === 'stations') ? (a.cat === 'stations' ? -1 : 1) : b.elevationDeg - a.elevationDeg);
    const issRec = parsed.find((s) => /\bISS\b|ZARYA/i.test(s.name));
    let iss = null;
    if (issRec) {
      const p = posOf(issRec.rec, now, obs);
      if (p) {
        const track = [];
        for (let m = -45; m <= 45; m += 3) { const q = posOf(issRec.rec, new Date(now.getTime() + m * 60_000)); if (q) track.push({ t: new Date(now.getTime() + m * 60_000).toISOString(), lat: r1(q.lat), lon: r1(q.lon) }); }
        iss = { name: issRec.name, lat: r1(p.lat), lon: r1(p.lon), altKm: Math.round(p.altKm), speedKmS: r1(p.speedKmS), elevationDeg: r1(p.elevationDeg), azimuthDeg: Math.round(p.azimuthDeg), dir: dirOf(p.azimuthDeg), visible: p.elevationDeg > 10, track };
      }
    }
    return { over: over.slice(0, 40), iss };
  });
  return { count: parsed.length, fetchedAt: t.fetchedAt, group: t.group, ...(t.mock ? { mock: true } : {}), ...(t.stale ? { stale: true } : {}), city: { id: CITIES[cityId] ? cityId : 'oslo', name: cname, lat, lon }, now: now.toISOString(),
    categories: CATS.map(([id, name, color]) => ({ id, name, color, count: counts[id] })), iss: view.iss, overhead: view.over,
    ...(withTle ? { sats: parsed.map(({ name, cat, l1, l2 }) => ({ name, cat, l1, l2 })) } : {}) };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', (c, next) => authOrToken(c, next));
const fail = (c, e) => c.json({ error: String(e?.message ?? e).slice(0, 200) }, 502);
api.get('/apod', async (c) => { try { return c.json(await apodWeek(), 200, { 'Cache-Control': 'private, max-age=3600' }); } catch (e) { return fail(c, e); } });
api.get('/mars', async (c) => { try { return c.json(await marsRovers(), 200, { 'Cache-Control': 'private, max-age=1800' }); } catch (e) { return fail(c, e); } });
api.get('/satellites', async (c) => {
  try { return c.json(await satellites(String(c.req.query('city') ?? 'oslo').toLowerCase().replace('ø', 'o'), { withTle: c.req.query('tle') === '1' })); } catch (e) { return fail(c, e); }
});
api.get('/tle', async (c) => { try { const t = await tleText(); return c.body(t.text, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=3600' }); } catch (e) { return fail(c, e); } });
api.get('/settings', (c) => c.json({ marsNotify: (kv.get(c.get('user'), 'rom', {}) ?? {}).marsNotify !== false }));
api.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (typeof b?.marsNotify !== 'boolean') return c.json({ error: 'Forventet {marsNotify: true|false}' }, 400);
  kv.set(c.get('user'), 'rom', { ...(kv.get(c.get('user'), 'rom', {}) ?? {}), marsNotify: b.marsNotify });
  return c.json({ marsNotify: b.marsNotify });
});

/* ---------------- /api/space/* (formene WEB32A bygger mot) ----------------
   GET /api/space/tle?group=active → {text, group, mock?, fetchedAt}
   GET /api/space/apod?days=7      → {items:[{title, date, url, media_type, thumbnail_url, explanation, copyright}]} (nyeste først)
                                     (uten days: det gamle svaret fra /api/space/apod, ett APOD-objekt)
   GET /api/space/mars             → {rovers:[{key, name, status:'active', sol, earthDate, count, cameras:[navn], photos:[{img, camera, url}], archive?, label}], checkedAt, mock?} */
async function tleGroup(group) {
  if (group === 'active' || useMock()) return tleText();
  if (!/^[a-z0-9-]{1,30}$/i.test(group)) throw new Error('Ugyldig gruppe');
  return cache(`tle:${group}`, 2 * 3600_000, async () => {
    const r = await f(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`);
    if (!r.ok) throw new Error(`CelesTrak svarte ${r.status}`);
    const text = await r.text();
    if (!/^1 /m.test(text)) throw new Error('Uventet svar fra CelesTrak');
    return { text, group, fetchedAt: new Date().toISOString() };
  });
}
export const spaceApi = new Hono();
spaceApi.use('*', (c, next) => authOrToken(c, next));
spaceApi.get('/tle', async (c) => {
  try { const t = await tleGroup(String(c.req.query('group') ?? 'active').toLowerCase()); return c.json({ text: t.text, group: t.group, fetchedAt: t.fetchedAt, fetched: t.fetchedAt, ...(t.mock ? { mock: true } : {}) }); } catch (e) { return fail(c, e); }
});
spaceApi.get('/apod', async (c, next) => {
  if (c.req.query('days') === undefined) return next();
  try {
    const n = Math.min(7, Math.max(1, parseInt(c.req.query('days'), 10) || 7));
    const w = await apodWeek();
    return c.json({ items: w.days.slice(0, n).map((d) => ({ title: d.title, date: d.date, url: d.url, media_type: d.mediaType, thumbnail_url: d.thumb, explanation: d.explanation, copyright: d.copyright, ...(d.link ? { link: d.link, source: d.source } : {}) })), source: w.source, ...(w.mock ? { mock: true } : {}) });
  } catch (e) { return fail(c, e); }
});
spaceApi.get('/mars', async (c) => {
  try {
    const m = await marsRovers();
    return c.json({ checkedAt: m.checkedAt, ...(m.mock ? { mock: true } : {}), rovers: m.rovers.map((r) => ({ key: r.id, name: r.name, status: 'active', sol: r.sol ?? null, earthDate: r.earthDate ?? null, count: r.newPhotos ?? 0,
      cameras: (r.cameras ?? []).map((x) => x.name), photos: (r.photos ?? []).map((p) => ({ img: p.url, camera: p.camera, url: p.url })), ...(r.archive ? { archive: true } : {}), label: r.label ?? null, ...(r.error ? { error: r.error } : {}) })) });
  } catch (e) { return fail(c, e); }
});

let timer = null;
export function startSpaceScheduler() {
  if (timer) return;
  timer = setInterval(() => checkMars().catch((e) => console.warn('[rom] mars:', e.message)), 6 * 3600_000);
  timer.unref?.();
  setTimeout(() => checkMars().catch(() => {}), 60_000).unref?.();
}

export default api;
