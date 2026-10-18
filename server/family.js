// Familie og kart (prompt 16): posisjon, spor, sensorer, soner med varsler og helsesammendrag for alle brukerne
// på serveren. Personvern håndheves her, ikke i klientene: med «pause» eller «av» lagres ingen nye posisjoner og
// ingen ser hvor du er; med «omtrentlig» får de andre bare posisjonen avrundet til ca. 1 km og ingen fart.
// Posisjoner beholdes i 7 dager, helse i 30. Alle ruter godtar sesjon eller app-token.
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { db, kv } from './db.js';
import { userInfo, listUsers, sessionUser } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';

const MOCK = process.env.MOCK_DATA === '1';
const DAY = 86_400_000;
const POS_KEEP = 7 * DAY, HEALTH_KEEP_DAYS = 30;

db.exec(`
CREATE TABLE IF NOT EXISTS family_pos (
  user TEXT NOT NULL, ts INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  acc REAL, speed REAL, heading REAL, alt REAL, battery REAL, charging INTEGER, activity TEXT
);
CREATE INDEX IF NOT EXISTS family_pos_user_ts ON family_pos(user, ts);
CREATE TABLE IF NOT EXISTS family_zone (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  radius REAL NOT NULL, color TEXT NOT NULL, created_by TEXT, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS family_notify (
  zone_id INTEGER NOT NULL, viewer TEXT NOT NULL, target TEXT NOT NULL, enter INTEGER NOT NULL DEFAULT 0, leave INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (zone_id, viewer, target)
);
CREATE TABLE IF NOT EXISTS family_inside (user TEXT NOT NULL, zone_id INTEGER NOT NULL, inside INTEGER NOT NULL, PRIMARY KEY (user, zone_id));
CREATE TABLE IF NOT EXISTS family_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, zone_id INTEGER NOT NULL, zone_name TEXT NOT NULL, kind TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS family_event_ts ON family_event(ts);
CREATE TABLE IF NOT EXISTS family_geo (key TEXT PRIMARY KEY, place TEXT, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS family_health (
  user TEXT NOT NULL, date TEXT NOT NULL, steps INTEGER, resting_hr REAL, hr REAL, sleep_min INTEGER, active_kcal INTEGER, updated INTEGER NOT NULL,
  PRIMARY KEY (user, date)
);
`);

// Prompt 17: enhetsnavn («iPhone 15») per posisjon.
if (!db.prepare('PRAGMA table_info(family_pos)').all().some((c) => c.name === 'device')) db.exec('ALTER TABLE family_pos ADD COLUMN device TEXT');

const q = (sql) => db.prepare(sql);
const HEALTH_KEYS = ['steps', 'restingHr', 'hr', 'sleep', 'activeKcal', 'week'];
const ACTIVITIES = ['still', 'walking', 'running', 'cycling', 'driving'];
const COLOR = /^#[0-9a-f]{6}$/i;

/* ---------------- Innstillinger per bruker ---------------- */

const DEF_PREFS = { sharing: 'on', precision: 'exact', shareHealth: { steps: true, restingHr: true, hr: false, sleep: true, activeKcal: true, week: true } };
export function prefsOf(id) {
  const p = kv.get(id, 'family_prefs', {}) ?? {};
  return {
    sharing: ['on', 'paused', 'off'].includes(p.sharing) ? p.sharing : DEF_PREFS.sharing,
    precision: p.precision === 'approx' ? 'approx' : 'exact',
    shareHealth: Object.fromEntries(HEALTH_KEYS.map((k) => [k, typeof p.shareHealth?.[k] === 'boolean' ? p.shareHealth[k] : DEF_PREFS.shareHealth[k]])),
    color: COLOR.test(p.color ?? '') ? p.color.toLowerCase() : null,
  };
}

// Prompt 20: hver person har sin egen farge. Valgt farge (PUT /me {color}), ellers en stabil farge fra paletten.
export const PALETTE = ['#b23a2a', '#2f5d8a', '#2f7a4f', '#c27a1a', '#6a4a8a', '#2a7a7a', '#a8456b', '#5a6b2a', '#8a5a2f', '#3f4f8f'];
export function colorOf(id) {
  const own = prefsOf(id).color;
  if (own) return own;
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/* ---------------- Hjelpere ---------------- */

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
// Avstand i meter (haversine).
export function dist(a, b) {
  const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Omtrentlig: avrund til 0,01° (ca. 1,1 km nord–sør), så nøyaktig adresse ikke kan leses ut.
const rough = (v) => Math.round(v * 100) / 100;

// Batteri i prosent (0–100). iOS sender 0–1 (UIDevice.batteryLevel), så brøker under 1 regnes om.
function battery(v) {
  const b = num(v, 0, 100);
  return b == null ? null : b < 1 && !Number.isInteger(b) ? Math.round(b * 100) : Math.round(b);
}

function cleanPoint(p, now = Date.now()) {
  const lat = num(p?.lat, -90, 90), lon = num(p?.lon, -180, 180);
  if (lat == null || lon == null) return null;
  let ts = typeof p.ts === 'number' ? p.ts : Date.parse(p.ts ?? '');
  if (!Number.isFinite(ts)) ts = now;
  if (ts < 1e12) ts *= 1000; // sekunder → ms
  if (ts > now + 5 * 60_000 || ts < now - POS_KEEP) return null;
  return {
    ts: Math.round(ts), lat, lon,
    acc: num(p.acc, 0, 100_000), speed: num(p.speed, 0, 400), heading: num(p.heading, 0, 360), alt: num(p.alt, -500, 10_000),
    battery: battery(p.battery),
    charging: typeof p.charging === 'boolean' ? (p.charging ? 1 : 0) : null,
    activity: ACTIVITIES.includes(p.activity) ? p.activity : null,
    device: typeof p.device === 'string' && p.device.trim() ? p.device.trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) : null,
  };
}

const zones = () => q('SELECT * FROM family_zone ORDER BY id').all();
const zoneOut = (z, viewer) => {
  const n = q('SELECT target, enter, leave FROM family_notify WHERE zone_id=? AND viewer=?').all(z.id, viewer);
  return { id: z.id, name: z.name, lat: z.lat, lon: z.lon, radius: z.radius, color: z.color, createdBy: z.created_by, notify: Object.fromEntries(n.map((x) => [x.target, { enter: !!x.enter, leave: !!x.leave }])) };
};
const eventOut = (e) => ({ id: e.id, userId: e.user, name: userInfo(e.user)?.displayName ?? mockName(e.user) ?? e.user, zoneId: e.zone_id, zone: e.zone_name, kind: e.kind, ts: e.ts });

// Inn/ut av soner: sammenligner med forrige tilstand og lagrer en hendelse ved endring. Litt hysterese
// (ut først 15 % utenfor radius) så GPS-støy ved kanten ikke gir mange hendelser.
function zoneEvents(user, p) {
  const out = [];
  for (const z of zones()) {
    const d = dist(p, z), prev = q('SELECT inside FROM family_inside WHERE user=? AND zone_id=?').get(user, z.id);
    const was = prev ? !!prev.inside : null;
    const inside = was ? d <= z.radius * 1.15 : d <= z.radius;
    if (was === inside) continue;
    q('INSERT INTO family_inside(user, zone_id, inside) VALUES(?,?,?) ON CONFLICT(user, zone_id) DO UPDATE SET inside=excluded.inside').run(user, z.id, inside ? 1 : 0);
    if (was === null && !inside) continue; // første punkt utenfor: ingen «forlot»
    const r = q('INSERT INTO family_event(user, zone_id, zone_name, kind, ts) VALUES(?,?,?,?,?) RETURNING *').get(user, z.id, z.name, inside ? 'enter' : 'leave', p.ts);
    out.push(eventOut(r));
  }
  return out;
}

// Sanntid (WebSocket): de andre får vite at personen har flyttet seg (uten koordinater, de hentes med GET /api/family
// og følger personvernet der). Hendelser går bare til seere som har varsel på for den sonen og personen.
function notifyLive(user, events) {
  const others = listUsers().map((u) => u.id).filter((id) => id !== user);
  if (others.length) broadcast('family', { kind: 'location', userId: user }, others);
  for (const e of events) {
    const viewers = q(`SELECT viewer FROM family_notify WHERE zone_id=? AND target=? AND viewer != ? AND ${e.kind === 'enter' ? 'enter' : 'leave'}=1`)
      .all(e.zoneId, user, user).map((r) => r.viewer);
    if (viewers.length) broadcast('family', { kind: 'event', event: e }, viewers);
  }
}

let lastPrune = 0;
function prune() {
  if (Date.now() - lastPrune < 3_600_000) return;
  lastPrune = Date.now();
  q('DELETE FROM family_pos WHERE ts < ?').run(Date.now() - POS_KEEP);
  q('DELETE FROM family_event WHERE ts < ?').run(Date.now() - 30 * DAY);
  const cut = new Date(Date.now() - HEALTH_KEEP_DAYS * DAY).toISOString().slice(0, 10);
  q('DELETE FROM family_health WHERE date < ?').run(cut);
}

/* ---------------- Utdata med personvern ---------------- */

const lastPos = (user) => q('SELECT * FROM family_pos WHERE user=? ORDER BY ts DESC LIMIT 1').get(user);
function posOut(r, exact) {
  if (!r) return null;
  const inZone = zones().find((z) => dist(r, z) <= z.radius);
  const base = { ts: r.ts, battery: r.battery, charging: r.charging == null ? null : !!r.charging, activity: r.activity, place: inZone?.name ?? null, device: r.device ?? null };
  if (exact) return { ...base, lat: r.lat, lon: r.lon, acc: r.acc, speed: r.speed, heading: r.heading, alt: r.alt };
  return { ...base, lat: rough(r.lat), lon: rough(r.lon), acc: Math.max(r.acc ?? 0, 1000), speed: null, heading: null, alt: null, approx: true };
}

function healthOut(user, share) {
  const rows = q('SELECT * FROM family_health WHERE user=? ORDER BY date DESC LIMIT 7').all(user);
  if (!rows.length) return null;
  const pick = (r) => ({
    date: r.date,
    ...(share.steps ? { steps: r.steps } : {}), ...(share.restingHr ? { restingHr: r.resting_hr } : {}), ...(share.hr ? { hr: r.hr } : {}),
    ...(share.sleep ? { sleepMin: r.sleep_min } : {}), ...(share.activeKcal ? { activeKcal: r.active_kcal } : {}),
  });
  return { today: pick(rows[0]), week: share.week ? rows.slice().reverse().map(pick) : [], updatedAt: Math.max(...rows.map((r) => r.updated)) };
}

function memberOut(u, viewer) {
  const self = u.id === viewer, pr = prefsOf(u.id);
  const visible = self || pr.sharing === 'on';
  const share = self ? Object.fromEntries(HEALTH_KEYS.map((k) => [k, true])) : pr.shareHealth;
  return {
    userId: u.id, name: u.displayName ?? u.name, username: u.username, avatarUrl: u.avatarUrl ?? null, self, color: colorOf(u.id),
    sharing: pr.sharing, precision: pr.precision,
    last: visible ? posOut(lastPos(u.id), self || pr.precision === 'exact') : null,
    health: healthOut(u.id, share),
  };
}

/* ---------------- Mockdata (MOCK_DATA=1) ---------------- */
// Tre familiemedlemmer som beveger seg rundt i Oslo, så kart, spor, soner og hendelser kan vises uten telefoner.

const MOCKS = [
  { id: 'mock-ingrid', username: 'ingrid', name: 'Ingrid', home: [59.9275, 10.7160], route: [[59.9275, 10.7160], [59.9220, 10.7340], [59.9139, 10.7522], [59.9110, 10.7610]], activity: 'driving', speed: 11, battery: 64, charging: false, sharing: 'on', precision: 'exact', color: '#2f5d8a' },
  { id: 'mock-jonas', username: 'jonas', name: 'Jonas', home: [59.9275, 10.7160], route: [[59.9330, 10.7110], [59.9360, 10.7230], [59.9395, 10.7310]], activity: 'cycling', speed: 5.2, battery: 22, charging: false, sharing: 'on', precision: 'approx', color: '#2f7a4f' },
  { id: 'mock-mormor', username: 'mormor', name: 'Mormor', home: [59.9500, 10.7650], route: [[59.9500, 10.7650]], activity: 'still', speed: 0, battery: 91, charging: true, sharing: 'paused', precision: 'exact', color: '#a8456b' },
];
const mockName = (id) => MOCKS.find((m) => m.id === id)?.name ?? null;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function mockAt(m, ts) {
  const r = m.route;
  if (r.length === 1) return r[0];
  const cycle = 40 * 60_000, t = ((ts % cycle) / cycle) * 2; // fram og tilbake på 40 min
  const f = t <= 1 ? t : 2 - t, seg = Math.min(r.length - 2, Math.floor(f * (r.length - 1)));
  return lerp(r[seg], r[seg + 1], f * (r.length - 1) - seg);
}
function mockMember(m, viewer) {
  const now = Date.now(), [lat, lon] = mockAt(m, now);
  const raw = { ts: now - 40_000, lat, lon, acc: m.activity === 'still' ? 12 : 8, speed: m.speed, heading: 75, alt: 40, battery: m.battery, charging: m.charging ? 1 : 0, activity: m.activity };
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * DAY).toISOString().slice(0, 10); return { date: d, steps: 4200 + ((i * 1777 + m.id.length * 991) % 7400), sleepMin: 380 + ((i * 37) % 90), activeKcal: 260 + ((i * 53) % 340), restingHr: 56 + (i % 5) }; });
  return {
    userId: m.id, name: m.name, username: m.username, avatarUrl: null, self: false, color: m.color, sharing: m.sharing, precision: m.precision, mock: true,
    last: m.sharing === 'on' ? posOut(raw, m.precision === 'exact') : null,
    health: { today: { ...days[6], hr: 72 }, week: days, updatedAt: now - 9 * 60_000 },
  };
}
function mockTrack(m, hours) {
  const now = Date.now(), out = [];
  for (let ts = now - hours * 3_600_000; ts <= now; ts += 2 * 60_000) { const [lat, lon] = mockAt(m, ts); out.push({ ts, lat, lon, speed: m.speed }); }
  return out;
}
function seedMock(viewer) {
  if (!MOCK || kv.get(viewer, 'family_mock_seeded')) return;
  kv.set(viewer, 'family_mock_seeded', true);
  if (!zones().length) {
    const ins = q('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created) VALUES(?,?,?,?,?,?,?)');
    ins.run('Hjem', 59.9275, 10.7160, 150, '#2f7a4f', viewer, Date.now());
    ins.run('Jobb', 59.9110, 10.7610, 200, '#b23a2a', viewer, Date.now());
    ins.run('Skole', 59.9395, 10.7310, 180, '#2f5d8a', viewer, Date.now());
  }
  const z = zones(), now = Date.now();
  const ev = q('INSERT INTO family_event(user, zone_id, zone_name, kind, ts) VALUES(?,?,?,?,?)');
  ev.run('mock-ingrid', z[0].id, z[0].name, 'leave', now - 95 * 60_000);
  ev.run('mock-jonas', z[2].id, z[2].name, 'enter', now - 70 * 60_000);
  ev.run('mock-ingrid', z[1].id, z[1].name, 'enter', now - 50 * 60_000);
  ev.run('mock-mormor', z[0].id, z[0].name, 'leave', now - 30 * 60_000);
  for (const m of MOCKS) q('INSERT OR IGNORE INTO family_notify(zone_id, viewer, target, enter, leave) VALUES(?,?,?,1,1)').run(z[0].id, viewer, m.id);
}

/* ---------------- Posisjonskortet (prompt 20) ---------------- */
// GET /api/family/positions: deg selv først («Du», bare én gang), så familien i rekkefølgen fra Familie → Personer.
// Hver rad har ferdig linje 2 (sone, «Går · Bislett», strøk/by, «Sist sett 14:32» eller «Deler ikke posisjon»).

const FRESH = 15 * 60_000, GEO_KEEP = DAY;
export const NOMINATIM_UA = 'KristoHomelab/1.0 (kontakt@kristo.no)';
const AKT = { walking: 'går', running: 'går', cycling: 'sykler', driving: 'i bil', still: 'stille' };
function aktivitet(p) {
  if (!p) return null;
  if (p.activity && AKT[p.activity]) return AKT[p.activity];
  if (typeof p.speed === 'number') return p.speed < 0.6 ? 'stille' : p.speed < 2.8 ? 'går' : p.speed < 8 ? 'sykler' : 'i bil';
  return null;
}
export function initials(name) {
  const w = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  const ch = [...w];
  if (!ch.length) return '?';
  return (ch[0].toUpperCase() + (ch[1] ?? '').toLowerCase());
}
function clock(ts, now = Date.now()) {
  const tz = 'Europe/Oslo';
  const p = Object.fromEntries(new Intl.DateTimeFormat('nb-NO', { timeZone: tz, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const day = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date(t));
  return day(ts) === day(now) ? `${p.hour}:${p.minute}` : `${p.day}.${p.month}. ${p.hour}:${p.minute}`;
}

// Strøk i Oslo for mockdata (og som svar uten nett i MOCK_DATA). Nærmeste sentrum innen 2,5 km.
const MOCK_PLACES = [['Grünerløkka', 59.9230, 10.7590], ['Majorstuen', 59.9290, 10.7150], ['Bislett', 59.9250, 10.7330], ['Sentrum', 59.9127, 10.7461],
  ['St. Hanshaugen', 59.9270, 10.7400], ['Frogner', 59.9200, 10.7050], ['Tøyen', 59.9150, 10.7720], ['Sagene', 59.9380, 10.7560], ['Ullevål', 59.9400, 10.7300],
  ['Torshov', 59.9340, 10.7650], ['Grønland', 59.9120, 10.7620], ['Bjølsen', 59.9420, 10.7470], ['Nydalen', 59.9500, 10.7650], ['Blindern', 59.9400, 10.7200]];
function mockPlace(lat, lon) {
  let best = null;
  for (const [name, a, b] of MOCK_PLACES) { const d = dist({ lat, lon }, { lat: a, lon: b }); if (!best || d < best.d) best = { name, d }; }
  return best && best.d < 2500 ? best.name : 'Oslo';
}

// Omvendt geokoding via Nominatim (med User-Agent, maks ett kall i sekundet), cache 24 t i databasen per ~100 m.
let geoChain = Promise.resolve(), lastGeo = 0;
const geoInflight = new Map();
function nominatim(lat, lon) {
  const run = async () => {
    const wait = lastGeo + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeo = Date.now();
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=nb&lat=${lat}&lon=${lon}`;
    const r = await fetch(u, { headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    const a = (await r.json())?.address ?? {};
    return a.neighbourhood && a.suburb ? a.suburb : a.suburb ?? a.quarter ?? a.neighbourhood ?? a.city_district ?? a.village ?? a.town ?? a.city ?? a.municipality ?? null;
  };
  const p = geoChain.then(run, run);
  geoChain = p.catch(() => {});
  return p;
}
export async function placeFor(lat, lon, { waitMs = 2500 } = {}) {
  if (lat == null || lon == null) return null;
  if (MOCK) return mockPlace(lat, lon);
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = q('SELECT place, ts FROM family_geo WHERE key=?').get(key);
  if (hit && Date.now() - hit.ts < GEO_KEEP) return hit.place;
  if (!geoInflight.has(key)) {
    geoInflight.set(key, nominatim(+lat.toFixed(3), +lon.toFixed(3))
      .then((place) => { q('INSERT INTO family_geo(key, place, ts) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET place=excluded.place, ts=excluded.ts').run(key, place, Date.now()); return place; })
      .catch((e) => { console.warn('[family] geokoding:', e.message); return hit?.place ?? null; })
      .finally(() => geoInflight.delete(key)));
  }
  // Ikke la kortet vente lenge: svaret caches og kommer med neste gang.
  return Promise.race([geoInflight.get(key), new Promise((r) => setTimeout(() => r(hit?.place ?? null), waitMs))]);
}

async function positionRow(m, now = Date.now()) {
  const last = m.last;
  const status = m.sharing !== 'on' || !last ? 'off' : now - last.ts < FRESH ? 'fresh' : 'stale';
  const sone = status === 'off' ? null : last.place ?? null;
  const akt = status === 'fresh' ? aktivitet(last) : null;
  // Inne i en sone trengs stedet bare som tillegg, så kortet venter kortere på geokodingen.
  const sted = status === 'off' ? null : await placeFor(last.lat, last.lon, { waitMs: sone ? 300 : 2500 });
  const moving = akt && akt !== 'stille';
  let linje2;
  if (status === 'off') linje2 = 'Deler ikke posisjon';
  else if (status === 'stale' && now - last.ts > 2 * 3_600_000) linje2 = `Sist sett ${clock(last.ts, now)}`;
  else if (sone) linje2 = sone;
  else if (moving) linje2 = sted ? `${akt[0].toUpperCase()}${akt.slice(1)} · ${sted}` : `${akt[0].toUpperCase()}${akt.slice(1)}`;
  else linje2 = sted ?? `Sist sett ${clock(last.ts, now)}`;
  const navn = m.self ? 'Du' : m.name;
  return {
    id: m.userId, userId: m.userId, navn, name: m.name, farge: m.color, bilde: m.avatarUrl ?? null, initialer: m.self ? 'Du' : initials(m.name),
    sone, aktivitet: akt, sted: status === 'off' ? null : sted, oppdatert: last?.ts ? new Date(last.ts).toISOString() : null, oppdatertMs: last?.ts ?? null,
    status, linje2, self: !!m.self, sharing: m.sharing, ...(m.mock ? { mock: true } : {}),
  };
}

export async function positions(me) {
  const seen = new Set([me]);
  const self = userInfo(me);
  const list = self ? [memberOut(self, me)] : [];
  for (const u of listUsers()) { if (seen.has(u.id)) continue; seen.add(u.id); list.push(memberOut(u, me)); }
  if (MOCK) for (const m of MOCKS) if (!seen.has(m.id)) { seen.add(m.id); list.push(mockMember(m, me)); }
  return Promise.all(list.map((m) => positionRow(m)));
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
// Sesjon eller hvilket som helst gyldig app-token. Vanlige brukere får bare finance:read ved innlogging i appen,
// men skal likevel kunne dele sin egen posisjon og helse; alt her gjelder brukerens egne data eller familien.
api.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
});
const bad = (c, msg, status = 400) => c.json({ error: msg }, status);
const body = (c) => c.req.json().catch(() => ({}));
const isMember = (id) => !!userInfo(id) || (MOCK && MOCKS.some((m) => m.id === id));

// Leaflet leveres fra egen server (ingen CDN, CSP tillater bare 'self' for skript).
const VENDOR = { 'leaflet.js': ['leaflet/dist/leaflet.js', 'text/javascript'], 'leaflet.css': ['leaflet/dist/leaflet.css', 'text/css'] };
api.get('/vendor/:file', async (c) => {
  const v = VENDOR[c.req.param('file')];
  if (!v) return c.notFound();
  return c.body(await readFile(new URL(`../node_modules/${v[0]}`, import.meta.url)), 200, { 'Content-Type': v[1], 'Cache-Control': 'private, max-age=604800' });
});

api.post('/location', async (c) => {
  const me = c.get('user'), b = await body(c), pr = prefsOf(me);
  const pts = (Array.isArray(b.points) ? b.points : [b]).slice(0, 500).map((p) => cleanPoint(p)).filter(Boolean).sort((a, b) => a.ts - b.ts);
  if (!pts.length) return bad(c, 'Ugyldig posisjon (lat/lon mangler eller er utenfor gyldig område)');
  // Pause eller av: ingenting lagres, og ingen hendelser lages.
  if (pr.sharing !== 'on') return c.json({ ok: true, stored: 0, sharing: pr.sharing, events: [] });
  const ins = q('INSERT INTO family_pos(user, ts, lat, lon, acc, speed, heading, alt, battery, charging, activity, device) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const events = [];
  db.transaction(() => {
    for (const p of pts) {
      ins.run(me, p.ts, p.lat, p.lon, p.acc, p.speed, p.heading, p.alt, p.battery, p.charging, p.activity, p.device);
      events.push(...zoneEvents(me, p));
    }
  })();
  prune();
  notifyLive(me, events);
  return c.json({ ok: true, stored: pts.length, sharing: pr.sharing, events });
});

// «Spill av lyd»: ber den andres telefon om å spille en lyd (sanntid på /api/ws, bare til den personen).
api.post('/ping/:userId', (c) => {
  const me = c.get('user'), to = c.req.param('userId');
  if (!isMember(to)) return bad(c, 'Ukjent person', 404);
  if (to === me) return bad(c, 'Du kan ikke pinge deg selv');
  const reached = broadcast('family', { kind: 'ping', from: me, fromName: userInfo(me)?.displayName ?? me, to }, [to]);
  return c.json({ ok: true, delivered: reached > 0 });
});

api.get('/', (c) => {
  const me = c.get('user');
  seedMock(me);
  const members = listUsers().map((u) => memberOut(u, me));
  if (MOCK) members.push(...MOCKS.map((m) => mockMember(m, me)));
  const events = q('SELECT * FROM family_event ORDER BY ts DESC LIMIT 30').all().filter((e) => isMember(e.user)).map(eventOut);
  return c.json({ me: { userId: me, ...prefsOf(me), color: colorOf(me) }, members, zones: zones().map((z) => zoneOut(z, me)), events, updatedAt: Date.now() });
});

api.get('/track/:userId', (c) => {
  const me = c.get('user'), id = c.req.param('userId');
  const hours = Math.min(168, Math.max(1, Number(c.req.query('hours')) || 24));
  if (!isMember(id)) return c.json({ error: 'Ukjent person' }, 404);
  const m = MOCK && MOCKS.find((x) => x.id === id);
  const pr = m ? { sharing: m.sharing, precision: m.precision } : prefsOf(id);
  const self = id === me;
  if (!self && pr.sharing !== 'on') return c.json({ userId: id, sharing: pr.sharing, points: [] });
  let pts = m ? mockTrack(m, hours) : q('SELECT ts, lat, lon, speed FROM family_pos WHERE user=? AND ts>=? ORDER BY ts').all(id, Date.now() - hours * 3_600_000);
  if (!self && pr.precision === 'approx') {
    // Grove punkter: avrundet, uten fart, og bare ett punkt per rute på ~1 km.
    const seen = new Set();
    pts = pts.map((p) => ({ ts: p.ts, lat: rough(p.lat), lon: rough(p.lon), speed: null })).filter((p) => { const k = `${p.lat},${p.lon}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Maks 2000 punkter: tynn ut jevnt.
  if (pts.length > 2000) { const step = pts.length / 2000; pts = Array.from({ length: 2000 }, (_, i) => pts[Math.floor(i * step)]); }
  return c.json({ userId: id, sharing: pr.sharing, precision: self ? 'exact' : pr.precision, points: pts });
});

api.put('/me', async (c) => {
  const me = c.get('user'), b = await body(c), cur = prefsOf(me);
  if (b.sharing !== undefined && !['on', 'paused', 'off'].includes(b.sharing)) return bad(c, 'sharing må være on, paused eller off');
  if (b.precision !== undefined && !['exact', 'approx'].includes(b.precision)) return bad(c, 'precision må være exact eller approx');
  if (b.color !== undefined && b.color !== null && !COLOR.test(String(b.color))) return bad(c, 'Ugyldig farge (bruk #rrggbb)');
  const next = { ...cur, ...(b.sharing ? { sharing: b.sharing } : {}), ...(b.precision ? { precision: b.precision } : {}) };
  if (b.color !== undefined) next.color = b.color ? String(b.color).toLowerCase() : null; // null = tilbake til palettfargen
  if (b.shareHealth && typeof b.shareHealth === 'object') for (const k of HEALTH_KEYS) if (typeof b.shareHealth[k] === 'boolean') next.shareHealth[k] = b.shareHealth[k];
  kv.set(me, 'family_prefs', next);
  // «Av»: slett lagrede posisjoner, så ingenting ligger igjen.
  if (next.sharing === 'off' && cur.sharing !== 'off') { q('DELETE FROM family_pos WHERE user=?').run(me); q('DELETE FROM family_inside WHERE user=?').run(me); }
  if (next.sharing !== cur.sharing || next.precision !== cur.precision) broadcast('family', { kind: 'sharing', userId: me, sharing: next.sharing });
  if (b.color !== undefined) broadcast('family', { kind: 'color', userId: me, color: colorOf(me) });
  return c.json({ me: { userId: me, ...prefsOf(me), color: colorOf(me) } });
});

function zoneInput(b, partial = false) {
  const z = {};
  if (b.name !== undefined || !partial) { const n = String(b.name ?? '').trim().slice(0, 60); if (!n) return 'Gi sonen et navn'; z.name = n; }
  if (b.lat !== undefined || !partial) { const v = num(b.lat, -90, 90); if (v == null) return 'Ugyldig breddegrad'; z.lat = v; }
  if (b.lon !== undefined || !partial) { const v = num(b.lon, -180, 180); if (v == null) return 'Ugyldig lengdegrad'; z.lon = v; }
  if (b.radius !== undefined || !partial) { const v = num(Number(b.radius ?? 150), 25, 20_000); if (v == null) return 'Radius må være mellom 25 m og 20 km'; z.radius = Math.round(v); }
  if (b.color !== undefined || !partial) { const v = String(b.color ?? '#b23a2a'); if (!COLOR.test(v)) return 'Ugyldig farge'; z.color = v; }
  return z;
}

api.post('/zones', async (c) => {
  const z = zoneInput(await body(c));
  if (typeof z === 'string') return bad(c, z);
  const r = q('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created) VALUES(?,?,?,?,?,?,?) RETURNING *').get(z.name, z.lat, z.lon, z.radius, z.color, c.get('user'), Date.now());
  return c.json(zoneOut(r, c.get('user')), 201);
});
api.patch('/zones/:id', async (c) => {
  const id = Number(c.req.param('id')), cur = q('SELECT * FROM family_zone WHERE id=?').get(id);
  if (!cur) return c.json({ error: 'Fant ikke sonen' }, 404);
  const z = zoneInput(await body(c), true);
  if (typeof z === 'string') return bad(c, z);
  const n = { ...cur, ...z };
  q('UPDATE family_zone SET name=?, lat=?, lon=?, radius=?, color=? WHERE id=?').run(n.name, n.lat, n.lon, n.radius, n.color, id);
  if (z.lat != null || z.lon != null || z.radius != null) q('DELETE FROM family_inside WHERE zone_id=?').run(id); // ny form: start på nytt
  return c.json(zoneOut(q('SELECT * FROM family_zone WHERE id=?').get(id), c.get('user')));
});
api.delete('/zones/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!q('SELECT 1 FROM family_zone WHERE id=?').get(id)) return c.json({ error: 'Fant ikke sonen' }, 404);
  db.transaction(() => { for (const t of ['family_notify', 'family_inside']) q(`DELETE FROM ${t} WHERE zone_id=?`).run(id); q('DELETE FROM family_zone WHERE id=?').run(id); })();
  return c.json({ ok: true });
});
api.put('/zones/:id/notify', async (c) => {
  const id = Number(c.req.param('id')), b = await body(c);
  if (!q('SELECT 1 FROM family_zone WHERE id=?').get(id)) return c.json({ error: 'Fant ikke sonen' }, 404);
  if (!isMember(String(b.userId ?? ''))) return bad(c, 'Ukjent person');
  q(`INSERT INTO family_notify(zone_id, viewer, target, enter, leave) VALUES(?,?,?,?,?)
     ON CONFLICT(zone_id, viewer, target) DO UPDATE SET enter=excluded.enter, leave=excluded.leave`).run(id, c.get('user'), String(b.userId), b.enter ? 1 : 0, b.leave ? 1 : 0);
  return c.json(zoneOut(q('SELECT * FROM family_zone WHERE id=?').get(id), c.get('user')));
});

// Helse: bare feltene brukeren deler lagres. Én rad per dato; «week» kan fylle inn de siste dagene.
api.post('/health', async (c) => {
  const me = c.get('user'), b = await body(c), share = prefsOf(me).shareHealth;
  const day = (r) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r?.date ?? '')) ? r.date : null;
    if (!date) return null;
    return {
      date,
      steps: share.steps ? num(r.steps, 0, 200_000) : null, resting_hr: share.restingHr ? num(r.restingHr, 20, 250) : null,
      hr: share.hr ? num(r.hr, 20, 250) : null, sleep_min: share.sleep ? num(r.sleepMin, 0, 1440) : null,
      active_kcal: share.activeKcal ? num(r.activeKcal, 0, 20_000) : null,
    };
  };
  const rows = [day(b), ...(share.week && Array.isArray(b.week) ? b.week.slice(0, 31).map(day) : [])].filter(Boolean);
  if (!rows.length) return bad(c, 'Mangler dato (YYYY-MM-DD)');
  const ins = q(`INSERT INTO family_health(user, date, steps, resting_hr, hr, sleep_min, active_kcal, updated) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user, date) DO UPDATE SET steps=COALESCE(excluded.steps, steps), resting_hr=COALESCE(excluded.resting_hr, resting_hr), hr=COALESCE(excluded.hr, hr),
      sleep_min=COALESCE(excluded.sleep_min, sleep_min), active_kcal=COALESCE(excluded.active_kcal, active_kcal), updated=excluded.updated`);
  db.transaction(() => { for (const r of rows) ins.run(me, r.date, r.steps, r.resting_hr, r.hr, r.sleep_min, r.active_kcal, Date.now()); })();
  // Felt brukeren ikke deler lenger, fjernes fra lagrede dager.
  const off = [['steps', 'steps'], ['restingHr', 'resting_hr'], ['hr', 'hr'], ['sleep', 'sleep_min'], ['activeKcal', 'active_kcal']].filter(([k]) => !share[k]).map(([, col]) => `${col}=NULL`);
  if (off.length) q(`UPDATE family_health SET ${off.join(', ')} WHERE user=?`).run(me);
  prune();
  return c.json({ ok: true, stored: rows.length, health: healthOut(me, Object.fromEntries(HEALTH_KEYS.map((k) => [k, true]))) });
});

// Hovedbryteren for helse slått av i appen: slett alle egne helsedata.
api.delete('/health/me', (c) => {
  const n = q('DELETE FROM family_health WHERE user=?').run(c.get('user')).changes;
  return c.json({ ok: true, deleted: n });
});

api.get('/positions', async (c) => {
  const me = c.get('user');
  seedMock(me);
  return c.json(await positions(me));
});

// Varsler: hendelser for soner der seeren har slått på varsel for personen (inn og/eller ut). Egne hendelser utelates.
api.get('/events', (c) => {
  const me = c.get('user'), since = Number(c.req.query('since')) || Date.now() - DAY;
  const rows = q(`SELECT e.* FROM family_event e JOIN family_notify n ON n.zone_id=e.zone_id AND n.target=e.user AND n.viewer=?
    WHERE e.ts > ? AND e.user != ? AND ((e.kind='enter' AND n.enter=1) OR (e.kind='leave' AND n.leave=1)) ORDER BY e.ts LIMIT 100`).all(me, since, me);
  return c.json({ events: rows.map(eventOut), now: Date.now() });
});

export default api;
