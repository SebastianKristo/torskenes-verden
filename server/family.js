// Familie og kart (prompt 16): posisjon, spor, sensorer, soner med varsler og helsesammendrag for alle brukerne
// på serveren. Personvern håndheves her, ikke i klientene: med «pause» eller «av» lagres ingen nye posisjoner og
// ingen ser hvor du er; med «omtrentlig» får de andre bare posisjonen avrundet til ca. 1 km og ingen fart.
// Posisjoner beholdes i 7 dager, helse i 30. Alle ruter godtar sesjon eller app-token.
import { Hono } from 'hono';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { bodyLimit } from 'hono/body-limit';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
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
// Prompt 21: soner tilhører den som lagde dem og er private til eieren deler dem med familien (shared=1).
if (!db.prepare('PRAGMA table_info(family_zone)').all().some((c) => c.name === 'shared')) db.exec('ALTER TABLE family_zone ADD COLUMN shared INTEGER NOT NULL DEFAULT 0');
db.prepare('UPDATE family_zone SET created_by=? WHERE created_by IS NULL').run(OWNER);
// Prompt 22: ikon per sone (nøkkel). Fargen fantes fra før (color, #rrggbb). Eksisterende soner får ikon etter navnet.
if (!db.prepare('PRAGMA table_info(family_zone)').all().some((c) => c.name === 'icon')) {
  db.exec('ALTER TABLE family_zone ADD COLUMN icon TEXT');
}

const q = (sql) => db.prepare(sql);
const HEALTH_KEYS = ['steps', 'restingHr', 'hr', 'sleep', 'activeKcal', 'week'];
const ACTIVITIES = ['still', 'walking', 'running', 'cycling', 'driving'];
const COLOR = /^#[0-9a-f]{6}$/i;
// Soneikoner (claude-code-familie-design.md): nøkkel → SF Symbol / Material Symbol i appene.
export const ZONE_ICONS = ['home', 'work', 'school', 'heart', 'cabin', 'gym', 'shop', 'ball', 'coffee', 'tree', 'plane', 'star', 'pin'];
// Prompt 42 (WEB42, claude-code-familie-soner-uten-kart.md): 50 innebygde ikoner + Iconify-ikoner («ify:lucide:sailboat») med
// path-data (icp), så sonen ser lik ut uten nett. Ukjente nøkler avvises fortsatt.
const ZONE_ICONS42 = ['car', 'bus', 'train', 'bike', 'boat', 'hospital', 'doctor', 'pill', 'church', 'book', 'music', 'film', 'food', 'cart', 'fuel', 'bolt', 'paw', 'baby', 'swim', 'ski', 'tent', 'mountain', 'beach', 'sun', 'gift', 'cake', 'game', 'laptop', 'tool', 'key', 'bed', 'flag', 'bell', 'camera', 'anchor', 'leaf'];
const IFY_ICON = /^ify:[a-z0-9-]{1,40}:[a-z0-9-]{1,80}$/;
const ICON_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-eE]{1,6000}$/;
const zoneIconOk = (k) => ZONE_ICONS.includes(k) || ZONE_ICONS42.includes(k) || IFY_ICON.test(String(k ?? ''));
if (!db.prepare('PRAGMA table_info(family_zone)').all().some((c) => c.name === 'icon_path')) db.exec('ALTER TABLE family_zone ADD COLUMN icon_path TEXT');
/** Standardikon etter navn: Hjem → home, Jobb → work, Skole → school, Mormor → heart, ellers pin. */
export function defaultZoneIcon(name) {
  const n = String(name ?? '').trim().toLowerCase();
  if (/^hjem|hjemme/.test(n)) return 'home';
  if (/^jobb|kontor/.test(n)) return 'work';
  if (/^skole|skolen|barnehage/.test(n)) return 'school';
  if (/^(mormor|morfar|farmor|farfar|besteforeldre)/.test(n)) return 'heart';
  return 'pin';
}
// Prompt 24: én person = én oppføring. Hver posisjon får enhets-ID (fra appen, ellers avledet av enhetsnavnet) og plattform.
if (!db.prepare('PRAGMA table_info(family_pos)').all().some((c) => c.name === 'device_id')) db.exec('ALTER TABLE family_pos ADD COLUMN device_id TEXT');
if (!db.prepare('PRAGMA table_info(family_pos)').all().some((c) => c.name === 'platform')) db.exec('ALTER TABLE family_pos ADD COLUMN platform TEXT');
db.transaction(() => { for (const z of db.prepare('SELECT id, name FROM family_zone WHERE icon IS NULL').all()) db.prepare('UPDATE family_zone SET icon=? WHERE id=?').run(defaultZoneIcon(z.name), z.id); })();

/* ---------------- Innstillinger per bruker ---------------- */

// Prompt 21: deling er av som standard, og ingen helsetyper deles før brukeren selv slår dem på.
const DEF_PREFS = { sharing: 'off', precision: 'exact', shareHealth: { steps: false, restingHr: false, hr: false, sleep: false, activeKcal: false, week: false } };
// Før prompt 21 var standarden «på» med de fleste helsetypene delt, og PUT /me lagret hele objektet (også standardverdiene)
// selv når brukeren bare byttet farge. Lagret «on» og helsetyper lik den gamle standarden kan derfor ikke skilles fra en kopi
// av standarden, og settes til av (én gang). Eksplisitte valg som avviker fra den gamle standarden (pause, av, omtrentlig,
// puls delt, helsetyper slått av) beholdes.
const OLD_DEF = { sharing: 'on', shareHealth: { steps: true, restingHr: true, hr: false, sleep: true, activeKcal: true, week: true } };
if (!kv.get(OWNER, 'family_prefs_v21', false)) {
  db.transaction(() => {
    for (const row of db.prepare("SELECT user, value FROM kv WHERE key='family_prefs'").all()) {
      let p; try { p = JSON.parse(row.value) ?? {}; } catch { continue; }
      const next = { ...p };
      if (next.sharing === OLD_DEF.sharing || next.sharing == null) next.sharing = 'off';
      next.shareHealth = Object.fromEntries(Object.entries(p.shareHealth ?? {}).filter(([k, v]) => typeof v === 'boolean' && v !== OLD_DEF.shareHealth[k]).map(([k, v]) => [k, v]));
      kv.set(row.user, 'family_prefs', next);
    }
    kv.set(OWNER, 'family_prefs_v21', Date.now());
  })();
}
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
    deviceId: typeof p.deviceId === 'string' && /^[\w.:-]{1,64}$/.test(p.deviceId) ? p.deviceId : null,
    platform: PLATFORMS.includes(p.platform) ? p.platform : null,
  };
}

/* ---------------- Enheter (prompt 24) ---------------- */

const PLATFORMS = ['ios', 'ipados', 'android', 'web', 'watchos', 'wearos'];
const SOURCE_WINDOW = 5 * 60_000;
// Enhets-ID: fra appen (deviceId), ellers avledet av enhetsnavnet, så eldre apper også grupperes riktig.
const devKey = (r) => r.device_id || (r.device ? `n:${String(r.device).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}` : 'ukjent');
// «iPhone · iOS 18.1» → «iPhone», «SM-S921B» beholdes.
const devName = (r) => (r.device ? String(r.device).split(' · ')[0] : 'Ukjent enhet');
const devPlatform = (r) => r.platform ?? (/\biOS\b|iPhone|iPad/i.test(r.device ?? '') ? (/iPad/i.test(r.device ?? '') ? 'ipados' : 'ios') : r.device ? 'android' : null);
/** Siste posisjon per enhet (nyeste først). */
function deviceRows(user) {
  const out = new Map();
  for (const r of q('SELECT * FROM family_pos WHERE user=? AND ts>=? ORDER BY ts DESC LIMIT 5000').all(user, Date.now() - POS_KEEP)) if (!out.has(devKey(r))) out.set(devKey(r), r);
  return [...out.values()];
}
const manualSource = (user) => { const v = kv.get(user, 'family_source', null); return typeof v === 'string' ? v : null; };
/** Kildeenheten: valgt manuelt, ellers lavest accuracy blant enhetene de siste 5 minuttene, ellers den nyeste. */
export function pickSource(rows, manual = null, now = Date.now()) {
  if (!rows.length) return null;
  if (manual) { const m = rows.find((r) => devKey(r) === manual); if (m) return m; }
  const fresh = rows.filter((r) => now - r.ts <= SOURCE_WINDOW);
  if (fresh.length) return [...fresh].sort((a, b) => (a.acc ?? Infinity) - (b.acc ?? Infinity) || b.ts - a.ts)[0];
  return rows.reduce((a, b) => (b.ts > a.ts ? b : a));
}
function devicesOut(rows, src, exact) {
  return rows.map((r) => ({ id: devKey(r), name: devName(r), platform: devPlatform(r), battery: r.battery ?? null, lastSeen: r.ts,
    accuracy: r.acc == null ? null : exact ? r.acc : Math.max(r.acc, 1000), isSource: !!src && devKey(r) === devKey(src) }));
}

const zones = () => q('SELECT * FROM family_zone ORDER BY id').all();
// Soner en person ser: egne og dem andre har delt med familien.
const zonesFor = (viewer) => q('SELECT * FROM family_zone WHERE created_by=? OR shared=1 ORDER BY id').all(viewer);
const zoneVisible = (z, viewer) => !!z && (z.created_by === viewer || !!z.shared);
const zoneOut = (z, viewer) => {
  const n = q('SELECT target, enter, leave FROM family_notify WHERE zone_id=? AND viewer=?').all(z.id, viewer);
  return { id: z.id, name: z.name, lat: z.lat, lon: z.lon, radius: z.radius, color: String(z.color).toLowerCase(), icon: zoneIconOk(z.icon) ? z.icon : defaultZoneIcon(z.name), ...(IFY_ICON.test(String(z.icon ?? '')) && z.icon_path ? { icp: z.icon_path } : {}), createdBy: z.created_by, mine: z.created_by === viewer, shared: !!z.shared,
    notify: Object.fromEntries(n.map((x) => [x.target, { enter: !!x.enter, leave: !!x.leave }]).filter(([t]) => t === viewer || canSee(viewer, t))) };
};
// Deler personen posisjon med deg? «on» gjelder hele familien; en selv ser alltid seg selv.
function canSee(viewer, id) {
  if (id === viewer) return true;
  const m = MOCK && MOCKS.find((x) => x.id === id);
  if (m) return m.sharing === 'on';
  return !!userInfo(id) && prefsOf(id).sharing === 'on';
}
// En hendelse vises bare når personen deler med deg (eller er deg), og sonen er synlig for deg.
const eventVisible = (e, viewer) => canSee(viewer, e.user) && (MOCK && MOCKS.some((m) => m.id === e.user) ? true : zoneVisible(q('SELECT * FROM family_zone WHERE id=?').get(e.zone_id), viewer));
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
  const others = listUsers().map((u) => u.id).filter((id) => id !== user && canSee(id, user));
  if (others.length) broadcast('family', { kind: 'location', userId: user }, others);
  for (const e of events) {
    const z = q('SELECT * FROM family_zone WHERE id=?').get(e.zoneId);
    const viewers = q(`SELECT viewer FROM family_notify WHERE zone_id=? AND target=? AND viewer != ? AND ${e.kind === 'enter' ? 'enter' : 'leave'}=1`)
      .all(e.zoneId, user, user).map((r) => r.viewer).filter((v) => zoneVisible(z, v) && canSee(v, user));
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

const lastPos = (user) => pickSource(deviceRows(user), manualSource(user));
function posOut(r, exact, viewer) {
  if (!r) return null;
  const inZone = (viewer ? zonesFor(viewer) : []).find((z) => dist(r, z) <= z.radius);
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

// Helse for andre: bare når personen deler med familien (sharing «on») og har slått på minst én helsetype selv.
// Aldri når deling er av eller på pause.
function memberOut(u, viewer) {
  const self = u.id === viewer, pr = prefsOf(u.id);
  const visible = self || pr.sharing === 'on';
  const share = self ? Object.fromEntries(HEALTH_KEYS.map((k) => [k, true])) : pr.shareHealth;
  const healthOn = self || (pr.sharing === 'on' && HEALTH_KEYS.some((k) => k !== 'week' && share[k]));
  const exact = self || pr.precision === 'exact';
  const rows = visible ? deviceRows(u.id) : [], src = visible ? pickSource(rows, manualSource(u.id)) : null;
  const devices = devicesOut(rows, src, exact);
  return {
    userId: u.id, name: u.displayName ?? u.name, username: u.username, avatarUrl: u.avatarUrl ?? null, photoUrl: photoUrlFor(viewer, u.id, u.avatarUrl ?? null), photoOverride: hasPhoto(viewer, u.id), self, color: colorOf(u.id),
    sharing: pr.sharing, precision: pr.precision,
    last: visible ? posOut(src, exact, viewer) : null,
    devices, sourceDevice: src ? devKey(src) : null, deviceCount: devices.length, sourceMode: self ? (manualSource(u.id) ? 'manual' : 'auto') : undefined,
    health: healthOn ? healthOut(u.id, share) : null,
  };
}
// Personene du ser i Familie: deg selv og dem som deler med deg (sharing «on»).
const visibleUsers = (viewer) => listUsers().filter((u) => u.id === viewer || prefsOf(u.id).sharing === 'on');

/* ---------------- Mockdata (MOCK_DATA=1) ---------------- */
// Tre familiemedlemmer som beveger seg rundt i Oslo, så kart, spor, soner og hendelser kan vises uten telefoner.

const MOCKS = [
  { id: 'mock-ingrid', username: 'ingrid', name: 'Ingrid', home: [59.9275, 10.7160], route: [[59.9275, 10.7160], [59.9220, 10.7340], [59.9139, 10.7522], [59.9110, 10.7610]], activity: 'driving', speed: 11, battery: 64, charging: false, sharing: 'on', precision: 'exact', color: '#2f5d8a', devices: [['iPhone 15 Pro', 'ios', 64, 40_000], ['Galaxy S24', 'android', 54, 12 * 60_000]] },
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
  const exact = m.precision === 'exact';
  const devs = (m.devices ?? [['iPhone', 'ios']]).map(([name, platform, bat, ago], i) => ({ id: `${m.id}-${i}`, name, platform, battery: bat ?? m.battery, lastSeen: now - (ago ?? 40_000), accuracy: exact ? (i ? 25 : raw.acc) : 1000, isSource: i === 0 }));
  return {
    userId: m.id, name: m.name, username: m.username, avatarUrl: null, photoUrl: photoUrlFor(viewer, m.id, null), photoOverride: hasPhoto(viewer, m.id), self: false, color: m.color, sharing: m.sharing, precision: m.precision, mock: true,
    last: m.sharing === 'on' ? posOut(raw, exact, viewer) : null,
    devices: m.sharing === 'on' ? devs : [], sourceDevice: m.sharing === 'on' ? devs[0].id : null, deviceCount: m.sharing === 'on' ? devs.length : 0,
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
  if (!zonesFor(viewer).length) {
    const ins = q('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, shared, icon) VALUES(?,?,?,?,?,?,?,1,?)');
    ins.run('Hjem', 59.9275, 10.7160, 150, '#2f7a4f', viewer, Date.now(), 'home');
    ins.run('Jobb', 59.9110, 10.7610, 200, '#b23a2a', viewer, Date.now(), 'work');
    ins.run('Skole', 59.9395, 10.7310, 180, '#2f5d8a', viewer, Date.now(), 'school');
  }
  const z = zonesFor(viewer), now = Date.now();
  if (z.length < 3) return; // brukeren har laget egne soner før første visning: ingen eksempelhendelser
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
    id: m.userId, userId: m.userId, navn, name: m.name, farge: m.color, bilde: m.photoUrl ?? m.avatarUrl ?? null, photoUrl: m.photoUrl ?? m.avatarUrl ?? null, initialer: m.self ? 'Du' : initials(m.name),
    sone, aktivitet: akt, sted: status === 'off' ? null : sted, oppdatert: last?.ts ? new Date(last.ts).toISOString() : null, oppdatertMs: last?.ts ?? null,
    status, linje2, self: !!m.self, sharing: m.sharing, ...(m.mock ? { mock: true } : {}),
    devices: m.devices ?? [], sourceDevice: m.sourceDevice ?? null, deviceCount: m.deviceCount ?? 0, enheter: (m.deviceCount ?? 0) > 1 ? `${m.deviceCount} enheter` : null,
  };
}

export async function positions(me) {
  const seen = new Set([me]);
  const self = userInfo(me);
  const list = self ? [memberOut(self, me)] : [];
  for (const u of visibleUsers(me)) { if (seen.has(u.id)) continue; seen.add(u.id); list.push(memberOut(u, me)); }
  if (MOCK) for (const m of MOCKS) if (!seen.has(m.id) && m.sharing === 'on') { seen.add(m.id); list.push(mockMember(m, me)); }
  return Promise.all(list.map((m) => positionRow(m)));
}

/* ---------------- Profilbilde per person (prompt 22) ---------------- */
// Hver seer kan overstyre bildet for en person i Familie, bare for seg selv. Lagres som DATA_DIR/family-photos/<seer>/<person>.<type>
// med versjon i kv (fam_photos: {personId: versjon}). Standard er personens kontobilde (/api/users/:id/avatar).
const PHOTOS = join(config.dataDir, 'family-photos');
const safeId = (id) => String(id).replace(/[^\w-]/g, '').slice(0, 80);
const photoDir = (viewer) => join(PHOTOS, safeId(viewer));
const photoFile = (viewer, target) => join(photoDir(viewer), `${safeId(target)}.img`);
const photoMap = (viewer) => kv.get(viewer, 'fam_photos', {}) ?? {};
const hasPhoto = (viewer, target) => !!(viewer && photoMap(viewer)[target]);
function photoUrlFor(viewer, target, avatarUrl) {
  const v = viewer && photoMap(viewer)[target];
  return v ? `/api/family/photo/${encodeURIComponent(target)}?v=${v}` : avatarUrl;
}
function imageKind(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
// Bredde og høyde fra filhodet (JPEG/PNG/WebP), for å sjekke at bildet er kvadratisk og lite (klientene beskjærer til 160 px).
export function imageSize(b) {
  const k = imageKind(b);
  if (k === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (k === 'image/webp') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (k === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
export const PHOTO_SIZE = 160, PHOTO_MAX_BYTES = 512 * 1024;

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
// Ukjent eller ikke synlig gir samme svar, så man ikke kan finne ut hvem som finnes ved å prøve.
const notVisible = (c) => c.json({ error: 'Ukjent person' }, 404);

// Leaflet leveres fra egen server (ingen CDN, CSP tillater bare 'self' for skript).
const VENDOR = { 'leaflet.js': ['leaflet/dist/leaflet.js', 'text/javascript'], 'leaflet.css': ['leaflet/dist/leaflet.css', 'text/css'] };
api.get('/vendor/:file', async (c) => {
  const v = VENDOR[c.req.param('file')];
  if (!v) return c.notFound();
  return c.body(await readFile(new URL(`../node_modules/${v[0]}`, import.meta.url)), 200, { 'Content-Type': v[1], 'Cache-Control': 'private, max-age=604800' });
});

api.post('/location', async (c) => {
  const me = c.get('user'), b = await body(c), pr = prefsOf(me);
  const top = { device: b.device, deviceId: b.deviceId, platform: b.platform };
  const pts = (Array.isArray(b.points) ? b.points : [b]).slice(0, 500).map((p) => cleanPoint({ ...top, ...p })).filter(Boolean).sort((a, b) => a.ts - b.ts);
  if (!pts.length) return bad(c, 'Ugyldig posisjon (lat/lon mangler eller er utenfor gyldig område)');
  // Pause eller av (standard): ingenting lagres, og ingen hendelser lages.
  if (pr.sharing !== 'on') return c.json({ ok: true, stored: 0, sharing: pr.sharing, events: [] });
  const ins = q('INSERT INTO family_pos(user, ts, lat, lon, acc, speed, heading, alt, battery, charging, activity, device, device_id, platform) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const events = [];
  db.transaction(() => {
    for (const p of pts) {
      ins.run(me, p.ts, p.lat, p.lon, p.acc, p.speed, p.heading, p.alt, p.battery, p.charging, p.activity, p.device, p.deviceId, p.platform);
      events.push(...zoneEvents(me, p));
    }
  })();
  prune();
  notifyLive(me, events);
  return c.json({ ok: true, stored: pts.length, sharing: pr.sharing, events: events.filter((e) => zoneVisible(q('SELECT * FROM family_zone WHERE id=?').get(e.zoneId), me)) });
});

// «Spill av lyd»: ber den andres telefon om å spille en lyd (sanntid på /api/ws, bare til den personen).
api.post('/ping/:userId', (c) => {
  const me = c.get('user'), to = c.req.param('userId');
  if (!isMember(to)) return bad(c, 'Ukjent person', 404);
  if (to === me) return bad(c, 'Du kan ikke pinge deg selv');
  // Bare mellom personer som deler: den andre må dele med deg, og du må dele selv.
  if (!canSee(me, to)) return notVisible(c);
  if (prefsOf(me).sharing !== 'on') return c.json({ error: 'Slå på deling av posisjon for å spille av lyd på andres telefon', code: 'sharing_off' }, 403);
  const reached = broadcast('family', { kind: 'ping', from: me, fromName: userInfo(me)?.displayName ?? me, to }, [to]);
  return c.json({ ok: true, delivered: reached > 0 });
});

api.get('/', (c) => {
  const me = c.get('user');
  seedMock(me);
  const members = visibleUsers(me).map((u) => memberOut(u, me));
  if (MOCK) members.push(...MOCKS.filter((m) => m.sharing === 'on').map((m) => mockMember(m, me)));
  const events = q('SELECT * FROM family_event ORDER BY ts DESC LIMIT 300').all().filter((e) => isMember(e.user) && eventVisible(e, me)).slice(0, 30).map(eventOut);
  return c.json({ me: { userId: me, ...prefsOf(me), color: colorOf(me) }, members, zones: zonesFor(me).map((z) => zoneOut(z, me)), events, updatedAt: Date.now() });
});

api.get('/track/:userId', (c) => {
  const me = c.get('user'), id = c.req.param('userId');
  const hours = Math.min(168, Math.max(1, Number(c.req.query('hours')) || 24));
  if (!isMember(id)) return c.json({ error: 'Ukjent person' }, 404);
  if (!canSee(me, id)) return c.json({ userId: id, sharing: 'off', points: [] });
  const m = MOCK && MOCKS.find((x) => x.id === id);
  const pr = m ? { sharing: m.sharing, precision: m.precision } : prefsOf(id);
  const self = id === me;
  if (!self && pr.sharing !== 'on') return c.json({ userId: id, sharing: pr.sharing, points: [] });
  let pts = m ? mockTrack(m, hours) : q('SELECT ts, lat, lon, speed, device, device_id FROM family_pos WHERE user=? AND ts>=? ORDER BY ts').all(id, Date.now() - hours * 3_600_000);
  // Flere enheter: sporet kommer fra kildeenheten (ellers hopper linjen mellom telefonene).
  if (!m) {
    const src = lastPos(id), keys = new Set(pts.map(devKey));
    if (src && keys.size > 1) pts = pts.filter((p) => devKey(p) === devKey(src));
    pts = pts.map(({ ts, lat, lon, speed }) => ({ ts, lat, lon, speed }));
  }
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
  // Sanntid bare til dem som hadde eller får tilgang (deling «on» før eller etter endringen).
  const others = listUsers().map((u) => u.id).filter((id) => id !== me);
  if ((next.sharing !== cur.sharing || next.precision !== cur.precision) && (next.sharing === 'on' || cur.sharing === 'on')) broadcast('family', { kind: 'sharing', userId: me, sharing: next.sharing }, others);
  if (b.color !== undefined && next.sharing === 'on') broadcast('family', { kind: 'color', userId: me, color: colorOf(me) }, others);
  return c.json({ me: { userId: me, ...prefsOf(me), color: colorOf(me) } });
});

// Kildeenhet (prompt 24): {deviceId} velger enheten posisjonen hentes fra, null = Automatisk.
api.put('/me/source', async (c) => {
  const me = c.get('user'), b = await body(c);
  const id = b.deviceId ?? null;
  if (id !== null && (typeof id !== 'string' || !deviceRows(me).some((r) => devKey(r) === id))) return bad(c, 'Ukjent enhet');
  if (id === null) kv.del(me, 'family_source'); else kv.set(me, 'family_source', id);
  const rows = deviceRows(me), src = pickSource(rows, manualSource(me));
  return c.json({ sourceDevice: src ? devKey(src) : null, sourceMode: id ? 'manual' : 'auto', devices: devicesOut(rows, src, true) });
});

function zoneInput(b, partial = false) {
  const z = {};
  if (b.name !== undefined || !partial) { const n = String(b.name ?? '').trim().slice(0, 60); if (!n) return 'Gi sonen et navn'; z.name = n; }
  if (b.lat !== undefined || !partial) { const v = num(b.lat, -90, 90); if (v == null) return 'Ugyldig breddegrad'; z.lat = v; }
  if (b.lon !== undefined || !partial) { const v = num(b.lon, -180, 180); if (v == null) return 'Ugyldig lengdegrad'; z.lon = v; }
  if (b.radius !== undefined || !partial) { const v = num(Number(b.radius ?? 150), 25, 20_000); if (v == null) return 'Radius må være mellom 25 m og 20 km'; z.radius = Math.round(v); }
  if (b.color !== undefined || !partial) { const v = String(b.color ?? '#b23a2a'); if (!COLOR.test(v)) return 'Ugyldig farge (bruk #rrggbb)'; z.color = v.toLowerCase(); }
  if (b.icon !== undefined && b.icon !== null) {
    if (!zoneIconOk(b.icon)) return `Ukjent ikon (bruk ${ZONE_ICONS.join(', ')} …)`;
    z.icon = b.icon;
    if (IFY_ICON.test(b.icon)) { if (typeof b.icp !== 'string' || !ICON_PATH.test(b.icp)) return 'Ikonet mangler path-data (icp)'; z.icon_path = b.icp; } else z.icon_path = null;
  } else if (!partial) { z.icon = defaultZoneIcon(z.name); z.icon_path = null; }
  if (b.shared !== undefined || !partial) z.shared = b.shared === true || b.shared === 1 ? 1 : 0; // «Del med familien», av som standard
  return z;
}

api.post('/zones', async (c) => {
  const z = zoneInput(await body(c));
  if (typeof z === 'string') return bad(c, z);
  const r = q('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, shared, icon, icon_path) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *').get(z.name, z.lat, z.lon, z.radius, z.color, c.get('user'), Date.now(), z.shared, z.icon, z.icon_path ?? null);
  return c.json(zoneOut(r, c.get('user')), 201);
});
// Sonen må være synlig (ellers 404) og din egen for å endres eller slettes (ellers 403).
function ownZone(c) {
  const id = Number(c.req.param('id')), cur = q('SELECT * FROM family_zone WHERE id=?').get(id);
  if (!zoneVisible(cur, c.get('user'))) return { err: c.json({ error: 'Fant ikke sonen' }, 404) };
  if (cur.created_by !== c.get('user')) return { err: c.json({ error: 'Bare den som lagde sonen kan endre eller slette den', code: 'not_owner' }, 403) };
  return { id, cur };
}
api.patch('/zones/:id', async (c) => {
  const { id, cur, err } = ownZone(c); if (err) return err;
  const zb = await body(c);
  c.set('zoneBody', zb);
  const z = zoneInput(zb, true);
  if (typeof z === 'string') return bad(c, z);
  const n = { ...cur, ...z };
  // icon: null i PATCH = tilbake til standardikonet for navnet.
  const b0 = c.get('zoneBody') ?? {};
  if (b0.icon === null) { n.icon = defaultZoneIcon(n.name); n.icon_path = null; }
  q('UPDATE family_zone SET name=?, lat=?, lon=?, radius=?, color=?, shared=?, icon=?, icon_path=? WHERE id=?').run(n.name, n.lat, n.lon, n.radius, n.color, n.shared ? 1 : 0, zoneIconOk(n.icon) ? n.icon : defaultZoneIcon(n.name), zoneIconOk(n.icon) ? n.icon_path ?? null : null, id);
  if (z.lat != null || z.lon != null || z.radius != null) q('DELETE FROM family_inside WHERE zone_id=?').run(id); // ny form: start på nytt
  // Ikke delt lenger: andres varsler for sonen fjernes.
  if (cur.shared && !n.shared) q('DELETE FROM family_notify WHERE zone_id=? AND viewer<>?').run(id, cur.created_by);
  return c.json(zoneOut(q('SELECT * FROM family_zone WHERE id=?').get(id), c.get('user')));
});
api.delete('/zones/:id', (c) => {
  const { id, err } = ownZone(c); if (err) return err;
  db.transaction(() => { for (const t of ['family_notify', 'family_inside']) q(`DELETE FROM ${t} WHERE zone_id=?`).run(id); q('DELETE FROM family_zone WHERE id=?').run(id); })();
  return c.json({ ok: true });
});
api.put('/zones/:id/notify', async (c) => {
  const id = Number(c.req.param('id')), b = await body(c);
  if (!zoneVisible(q('SELECT * FROM family_zone WHERE id=?').get(id), c.get('user'))) return c.json({ error: 'Fant ikke sonen' }, 404);
  if (!isMember(String(b.userId ?? '')) || !canSee(c.get('user'), String(b.userId))) return bad(c, 'Ukjent person');
  q(`INSERT INTO family_notify(zone_id, viewer, target, enter, leave) VALUES(?,?,?,?,?)
     ON CONFLICT(zone_id, viewer, target) DO UPDATE SET enter=excluded.enter, leave=excluded.leave`).run(id, c.get('user'), String(b.userId), b.enter ? 1 : 0, b.leave ? 1 : 0);
  return c.json(zoneOut(q('SELECT * FROM family_zone WHERE id=?').get(id), c.get('user')));
});

// Helse: bare feltene brukeren deler lagres. Én rad per dato; «week» kan fylle inn de siste dagene.
// Prompt 24: flere enheter (Apple Health og Health Connect) sender hver sin dagssum. Skritt, søvn og aktive kalorier slås
// sammen med høyeste verdi per dag, ikke summen, så de ikke telles dobbelt. Puls er siste verdi.
const hi = (col) => `CASE WHEN excluded.${col} IS NULL THEN ${col} WHEN ${col} IS NULL THEN excluded.${col} ELSE MAX(${col}, excluded.${col}) END`;
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
    ON CONFLICT(user, date) DO UPDATE SET steps=${hi('steps')}, resting_hr=COALESCE(excluded.resting_hr, resting_hr), hr=COALESCE(excluded.hr, hr),
      sleep_min=${hi('sleep_min')}, active_kcal=${hi('active_kcal')}, updated=excluded.updated`);
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
    WHERE e.ts > ? AND e.user != ? AND ((e.kind='enter' AND n.enter=1) OR (e.kind='leave' AND n.leave=1)) ORDER BY e.ts LIMIT 300`).all(me, since, me);
  return c.json({ events: rows.filter((e) => eventVisible(e, me)).slice(0, 100).map(eventOut), now: Date.now() });
});

// Profilbilde per person (prompt 22): PUT multipart (felt «file» eller «photo») eller JSON {image: base64/data-URL}.
// Klientene beskjærer til kvadrat 160 × 160. Serveren har ikke bildebehandling, så den godtar bare et kvadratisk bilde
// på 64–512 px (JPEG/PNG/WebP, maks 512 KB) og lagrer det som det er. Bare for seeren selv; ingen andre ser det.
api.put('/photo/:userId', bodyLimit({ maxSize: PHOTO_MAX_BYTES * 1.4 + 64 * 1024, onError: (c) => c.json({ error: 'Bildet er for stort (maks 512 KB)' }, 413) }), async (c) => {
  const me = c.get('user'), target = c.req.param('userId');
  if (!isMember(target)) return notVisible(c);
  let buf = null;
  const type = c.req.header('content-type') ?? '';
  if (/multipart\/form-data/i.test(type)) {
    const f = await c.req.parseBody().catch(() => ({}));
    const file = f.file ?? f.photo ?? f.image;
    if (file instanceof File) buf = Buffer.from(await file.arrayBuffer());
    else if (typeof file === 'string') buf = Buffer.from(file.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } else if (/^image\//i.test(type)) {
    buf = Buffer.from(await c.req.arrayBuffer());
  } else {
    const b = await body(c);
    const raw = b.image ?? b.photo ?? b.data;
    if (typeof raw === 'string') buf = Buffer.from(raw.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  }
  if (!buf || !buf.length) return bad(c, 'Mangler bilde (multipart «file» eller JSON {image: base64})');
  if (buf.length > PHOTO_MAX_BYTES) return c.json({ error: 'Bildet er for stort (maks 512 KB)' }, 413);
  if (!imageKind(buf)) return bad(c, 'Bruk et JPEG-, PNG- eller WebP-bilde');
  const sz = imageSize(buf);
  if (!sz || Math.abs(sz.w - sz.h) > 2) return bad(c, `Bildet må være kvadratisk (beskjær til ${PHOTO_SIZE} × ${PHOTO_SIZE} px)`);
  if (sz.w < 64 || sz.w > 512) return bad(c, `Bildet må være mellom 64 og 512 px (beskjær til ${PHOTO_SIZE} × ${PHOTO_SIZE} px)`);
  await mkdir(photoDir(me), { recursive: true });
  await writeFile(photoFile(me, target), buf);
  const v = Date.now();
  kv.set(me, 'fam_photos', { ...photoMap(me), [target]: v });
  return c.json({ ok: true, userId: target, photoUrl: photoUrlFor(me, target, null), width: sz.w, height: sz.h });
});
api.delete('/photo/:userId', async (c) => {
  const me = c.get('user'), target = c.req.param('userId');
  const m = photoMap(me);
  if (m[target]) { delete m[target]; kv.set(me, 'fam_photos', m); }
  await unlink(photoFile(me, target)).catch(() => {});
  const u = userInfo(target);
  return c.json({ ok: true, userId: target, photoUrl: u?.avatarUrl ?? null });
});
// Bare seerens egen overstyring. Andre får 404 (de har ikke lagt inn noe bilde for personen).
api.get('/photo/:userId', async (c) => {
  const me = c.get('user'), target = c.req.param('userId');
  if (!hasPhoto(me, target)) return c.json({ error: 'Ingen bilde' }, 404);
  try {
    const b = await readFile(photoFile(me, target));
    return c.body(b, 200, { 'Content-Type': imageKind(b) ?? 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.json({ error: 'Ingen bilde' }, 404); }
});

export default api;

/** Prompt 37 («Hvor er Ingrid?»): alle personer i Familie med siste posisjon etter personvernet (last=null når de ikke deler
 *  med deg). Rå koordinater er med bare når seeren har lov å se dem (samme som GET /api/family). */
export function familyPeople37(me) {
  seedMock(me);
  const out = listUsers().map((u) => ({ ...memberOut(u, me), visible: canSee(me, u.id) }));
  if (MOCK) for (const m of MOCKS) out.push({ ...mockMember(m, me), visible: m.sharing === 'on' });
  return out.map((m) => ({ userId: m.userId, name: m.name, username: m.username, color: m.color, self: !!m.self, sharing: m.sharing, visible: m.visible,
    precision: m.precision, last: m.visible ? m.last : null, photoUrl: m.photoUrl ?? m.avatarUrl ?? null, mock: !!m.mock }));
}
