// Prompt 50 (SRVFAM50): Familie i nytt design – data og API for klientene (runde 2). Formene står i SERVER50-API.md (seksjon SRVFAM50).
//   Steder med flere områder (claude-code-steder-flere-omrader-ruter.md): /api/family/places…, geofence-regioner, Ruter leser skolen herfra.
//   Folk (kort per person), «I DAG», Helse per person (7 dager, søvn, hvilepuls, aktive kalorier, deling) og Sjekk inn (§6 i
//   claude-code-familie-nytt-design.md): innsjekk, «Be noen sjekke inn», svar 👍/Ring/Hent, «Hent meg» med høy prioritet, påminnelse,
//   logg «I dag i familien», forslag til sted fra kalender + posisjon, push via notifyUser (kø + Web Push + sanntid).
// Personvern: samme regler som family.js (posisjon og helse bare når personen deler med deg). Sjekk inn deler posisjonen BARE i selve
// innsjekken, og bare med mottakerne (og avsenderen). Ingen kontinuerlig deling. Eldre /api/family-endepunkter er urørt.
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { userInfo, sessionUser } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';
import { notifyUser } from './notify.js';
import { family50 as F, placesChanged50, deletePlace50, placesVersion50, areaOut50, setPlaceEventHook50 } from './family.js';
import { schoolPlaceOf50, ruterPlaceEvents50 } from './ruter41.js';

const q = (sql) => db.prepare(sql);
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const FRESH = 15 * MIN;

// Ruter: «forlot skolen» og ankomst kommer fra stedshendelsene (utenfor alle områdene i 2 min).
setPlaceEventHook50((u, events) => ruterPlaceEvents50(u, events));

/* ---------------- Felles ---------------- */

const fmtInt = (n) => (n == null ? null : new Intl.NumberFormat('nb-NO').format(Math.round(n)).replace(/\s/g, ' '));
const dec1 = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const hm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const ymdOslo = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(t));
/** Midnatt i Oslo (ms) for dagen t ligger i. */
export function osloMidnight50(t = Date.now()) {
  const local = Date.parse(new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(' ', 'T') + 'Z');
  const off = Math.round((local - t) / MIN) * MIN;
  return Date.parse(`${ymdOslo(t)}T00:00:00Z`) - off;
}
/** «Ingrid», «Ingrid og Pål», «Ingrid, Pål og Kari». */
export const joinNames50 = (a) => (a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi) => { const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400, code) => c.json({ error, ...(code ? { code } : {}) }, status);
const COMPASS = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
export const distText50 = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${dec1(m / 1000)} km`);
/** Person som liten visning: {userId, name, initials, color, photoUrl, self}. «Du» for seeren selv i tekster, ikke i name. */
function personOf(v, id) {
  const e = F.everyone(v).find((p) => p.id === id);
  const name = e?.name ?? F.nameOf(id);
  return { userId: id, name, initials: F.initials(name), color: e?.color ?? F.colorOf(id), photoUrl: e?.photoUrl ?? null, self: id === v };
}
const who = (v, id) => (id === v ? 'Du' : personOf(v, id).name);

/* ---------------- Steder ---------------- */

const ICON_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-eE]{1,6000}$/;
const IFY = /^ify:[a-z0-9-]{1,40}:[a-z0-9-]{1,80}$/;
const TYPE_ICON = { hjem: 'home', skole: 'school', jobb: 'work' };
const AREA_MIN = 25, AREA_MAX = 1000, MAX_AREAS = 20, MAX_REGIONS = 20;

function areaInput(a, partial = false) {
  const o = {};
  if (!a || typeof a !== 'object') return 'Område mangler';
  if (a.name !== undefined || !partial) { const n = clean(a.name, 60); if (!n) return 'Gi området et navn'; o.name = n; }
  if (a.lat !== undefined || !partial) { const v = num(a.lat, -90, 90); if (v == null) return 'Ugyldig breddegrad'; o.lat = v; }
  if (a.lon !== undefined || !partial) { const v = num(a.lon, -180, 180); if (v == null) return 'Ugyldig lengdegrad'; o.lon = v; }
  if (a.radius_m !== undefined || a.radius !== undefined || !partial) {
    const v = num(a.radius_m ?? a.radius ?? 150, AREA_MIN, AREA_MAX);
    if (v == null) return `Radius må være mellom ${AREA_MIN} og ${AREA_MAX} m`;
    o.radius = Math.round(v);
  }
  return o;
}
function placeInput(b, partial = false) {
  const p = {};
  if (b.name !== undefined || !partial) { const n = clean(b.name, 60); if (!n) return 'Gi stedet et navn'; p.name = n; }
  if (b.type !== undefined || !partial) { const t = b.type ?? 'annet'; if (!F.PLACE_TYPES.includes(t)) return 'type må være hjem, skole, jobb eller annet'; p.place_type = t; }
  if (b.color !== undefined || !partial) { const c = String(b.color ?? '#2f5d8a'); if (!F.ZONE_COLOR.test(c)) return 'Ugyldig farge (bruk #rrggbb)'; p.color = c.toLowerCase(); }
  if (b.icon !== undefined && b.icon !== null) {
    if (!F.zoneIconOk(b.icon)) return 'Ukjent ikon';
    p.icon = b.icon;
    if (IFY.test(b.icon)) { if (typeof b.icp !== 'string' || !ICON_PATH.test(b.icp)) return 'Ikonet mangler path-data (icp)'; p.icon_path = b.icp; } else p.icon_path = null;
  } else if (!partial || b.icon === null) { p.icon = null; p.icon_path = null; }
  if (b.shared !== undefined || !partial) p.shared = b.shared === true || b.shared === 1 ? 1 : 0;
  return p;
}
const iconFor = (type, name) => TYPE_ICON[type] ?? F.defaultZoneIcon(name);

function notifyText(zo, v) {
  const list = Object.entries(zo.notify ?? {}).filter(([, n]) => n.enter || n.leave);
  if (!list.length) return null;
  const names = list.map(([id]) => who(v, id));
  const both = list.every(([, n]) => n.enter && n.leave), en = list.every(([, n]) => n.enter && !n.leave), le = list.every(([, n]) => !n.enter && n.leave);
  return `Varsler når ${joinNames50(names)} ${both ? 'kommer og drar' : en ? 'kommer' : le ? 'drar' : 'kommer eller drar'}`;
}
/** Er personen (fra F.members) i stedet nå? Nøyaktig posisjon: områdene; omtrentlig: stedsnavnet serveren selv satte. */
function memberIn(m, z) {
  const l = m.last;
  if (!l || m.sharing !== 'on' && !m.self) return false;
  if (Date.now() - l.ts > 2 * HOUR) return false;
  if (l.approx) return l.place === z.name;
  return F.inPlace(l, z);
}
export function placeOut50(z, v, members = F.members(v)) {
  const zo = F.zoneOut(z, v);
  const here = members.filter((m) => memberIn(m, z)).map((m) => ({ userId: m.userId, name: m.name, initials: F.initials(m.name), color: m.color, photoUrl: m.photoUrl ?? m.avatarUrl ?? null, self: !!m.self }));
  const school = schoolPlaceOf50(v);
  const ruter = school?.id === z.id, nt = notifyText(zo, v);
  const usedBy = [...(ruter ? ['ruter'] : []), ...(nt ? ['varsler'] : [])];
  const n = zo.areas.length;
  return {
    ...zo, areaCount: n, areaText: n === 1 ? '1 område' : `${n} områder`, chips: zo.areas.map((a) => a.label).join(' · '),
    here, hereCount: here.length, hereText: here.length ? `${here.length} her nå` : 'Ingen her nå',
    notifyText: nt, usedBy, usedByText: usedBy.length ? `Brukes av ${joinNames50(usedBy.map((u) => (u === 'ruter' ? 'Ruter (Min reise)' : 'varsler')))}` : null,
    canEdit: zo.mine, canRemoveArea: zo.mine && n > 1,
  };
}
function visiblePlace(c) {
  const z = F.zoneById(Number(c.req.param('id')));
  if (!z || !F.zoneVisible(z, c.get('user'))) return { err: c.json({ error: 'Fant ikke stedet' }, 404) };
  return { z };
}
function ownPlace(c) {
  const r = visiblePlace(c);
  if (r.err) return r;
  if (r.z.created_by !== c.get('user')) return { err: c.json({ error: 'Bare den som lagde stedet kan endre det', code: 'not_owner' }, 403) };
  return r;
}
/** Geofence-regioner for enheten: én per område, maks 20 – Hjem og Skole først, så nærmeste. */
export function regions50(v, at = null) {
  const pos = at ?? F.lastRaw(v);
  const all = [];
  for (const z of F.zonesFor(v)) {
    const type = F.PLACE_TYPES.includes(z.place_type) ? z.place_type : F.defaultPlaceType(z.icon, z.name);
    for (const a of F.areasOf(z.id)) all.push({ id: `${z.id}:${a.id}`, placeId: z.id, areaId: a.id, place: z.name, name: a.name, type, lat: a.lat, lon: a.lon, radius_m: Math.round(a.radius), d: pos ? F.dist(pos, a) : null });
  }
  const pri = (r) => (r.type === 'hjem' ? 0 : r.type === 'skole' ? 1 : 2);
  all.sort((a, b) => pri(a) - pri(b) || (a.d ?? Infinity) - (b.d ?? Infinity) || a.placeId - b.placeId || a.areaId - b.areaId);
  return { regions: all.slice(0, MAX_REGIONS).map(({ d, ...r }) => ({ ...r, ...(d != null ? { distance_m: Math.round(d) } : {}) })), total: all.length, max: MAX_REGIONS, version: placesVersion50() };
}

/* ---------------- Folk ---------------- */

const lowBattery = (b) => typeof b === 'number' && b < 25;
function moving(l) {
  const a = F.aktivitet(l);
  return a && a !== 'stille' ? a : null;
}
const kmh = (l) => (typeof l?.speed === 'number' ? l.speed * 3.6 : null);
/** Nærmeste sted (synlig for seeren) innen 2 km, for «38 km/t · nær Mormor». */
function nearPlace(v, l) {
  let best = null;
  for (const z of F.zonesFor(v)) for (const a of F.areasOf(z.id)) { const d = F.dist(l, a); if (d < 2000 && (!best || d < best.d)) best = { d, name: z.name }; }
  return best?.name ?? null;
}
export async function person50(m, v, me, { now = Date.now(), geo = true } = {}) {
  const l = m.last, self = !!m.self;
  const shares = m.sharing === 'on' || self;
  const status = !shares || !l ? 'off' : now - l.ts < FRESH ? 'fresh' : 'stale';
  const zone = status === 'off' ? null : l.place ?? null;
  const act = status === 'fresh' ? moving(l) : null;
  const speed = status === 'fresh' ? kmh(l) : null;
  let place = null, sub = null, line = null;
  const zoneRow = zone ? F.zonesFor(v).find((z) => z.name === zone) : null;
  const since = zoneRow ? F.lastEnter(m.userId, zoneRow.id) : null;
  const left = !zone && status !== 'off' ? F.lastLeave(m.userId) : null;
  const leftTxt = left && now - left.ts < 12 * HOUR && F.zonesFor(v).some((z) => z.id === left.zone_id) ? `forlot ${left.zone_name} ${hm(left.ts)}` : null;
  const sted = status === 'off' || !geo ? null : await F.placeFor(l.lat, l.lon, { waitMs: zone ? 100 : 600 }).catch(() => null);
  if (status === 'off') { place = 'Deler ikke posisjon'; sub = null; line = 'Deler ikke posisjon'; }
  else if (zone && !act) { place = zone; sub = since ? `siden ${hm(since)}` : null; line = since ? `${zone} · siden ${hm(since)}` : zone; }
  else if (act === 'i bil') {
    const near = nearPlace(v, l);
    place = 'I bil'; sub = [speed != null ? `${Math.round(speed)} km/t` : null, near ? `nær ${near}` : sted].filter(Boolean).join(' · ') || null;
    line = ['I bil', speed != null ? `${Math.round(speed)} km/t` : null, leftTxt].filter(Boolean).join(' · ');
  } else if (act) {
    place = zone ?? 'På vei'; sub = [act, speed != null ? `${dec1(speed)} km/t` : null].filter(Boolean).join(' · ');
    line = [`${act[0].toUpperCase()}${act.slice(1)}`, speed != null ? `${dec1(speed)} km/t` : null, leftTxt].filter(Boolean).join(' · ');
  } else {
    place = sted ?? 'Ukjent sted'; sub = status === 'stale' ? `sist sett ${F.clock(l.ts, now)}` : leftTxt;
    line = [place, status === 'stale' ? `sist sett ${F.clock(l.ts, now)}` : null, leftTxt].filter(Boolean).join(' · ');
  }
  const myPos = me?.last && !me.last.approx ? me.last : null;
  const fromMe = !self && myPos && status !== 'off' ? (() => { const d = F.dist(myPos, l); const dir = COMPASS[Math.round(bearing(myPos, l) / 45) % 8]; return { m: Math.round(d), text: distText50(d), dir, bearing: Math.round(bearing(myPos, l)), label: `${m.name} · ${distText50(d)} ${dir}` }; })() : null;
  const battery = shares ? l?.battery ?? null : null;
  return {
    userId: m.userId, name: m.name, self, initials: F.initials(m.name), color: m.color, photoUrl: m.photoUrl ?? m.avatarUrl ?? null, sharing: m.sharing, precision: m.precision ?? 'exact', ...(m.mock ? { mock: true } : {}),
    status, place, sub, statusLine: line, zone, activity: act, speedKmh: speed != null ? Math.round(speed * 10) / 10 : null, since: since ? new Date(since).toISOString() : null,
    battery, charging: shares ? l?.charging ?? null : null, lowBattery: lowBattery(battery),
    lat: status === 'off' ? null : l.lat, lon: status === 'off' ? null : l.lon, acc: status === 'off' ? null : l.acc ?? null, approx: !!l?.approx, updatedAt: l?.ts ? new Date(l.ts).toISOString() : null,
    device: status === 'off' ? null : l.device ?? null, fromMe, healthShared: !!m.health,
  };
}
export async function people50(v, now = Date.now()) {
  const members = F.members(v);
  const me = members.find((m) => m.self) ?? null;
  const people = await Promise.all(members.map((m) => person50(m, v, me, { now })));
  people.sort((a, b) => (b.self ? 1 : 0) - (a.self ? 1 : 0));
  const newest = Math.max(0, ...members.map((m) => m.last?.ts ?? 0));
  const upd = !newest ? 'ingen posisjoner ennå' : now - newest < 2 * MIN ? 'oppdatert nå' : `oppdatert ${F.clock(newest, now)}`;
  return { count: people.length, title: 'Familie', subtitle: `${people.length} ${people.length === 1 ? 'person' : 'personer'} · ${upd}`, people, updatedAt: new Date(now).toISOString() };
}

/* ---------------- Helse ---------------- */

const DAYS = ['sø', 'ma', 'ti', 'on', 'to', 'fr', 'lø'];
const DEFAULT_GOAL = 10_000;
const goalOf = (id) => { const g = Number(kv.get(id, 'family_goal50', DEFAULT_GOAL)); return Number.isFinite(g) && g >= 1000 ? g : DEFAULT_GOAL; };
const sleepText = (min) => (min == null ? null : `${Math.floor(min / 60)} t ${String(Math.round(min % 60)).padStart(2, '0')} m`);
const SHARE_LABEL = { steps: 'skritt', sleep: 'søvn', restingHr: 'hvilepuls', hr: 'puls', activeKcal: 'aktive kalorier' };

function shareOf(v, id) {
  if (id === v) return { shared: true, share: { steps: true, restingHr: true, hr: true, sleep: true, activeKcal: true, week: true } };
  const p = F.everyone(v).find((x) => x.id === id);
  if (p?.mock) return { shared: F.canSee(v, id), share: { steps: true, restingHr: true, hr: true, sleep: true, activeKcal: true, week: true } };
  const pr = F.prefsOf(id);
  const share = pr.shareHealth;
  return { shared: pr.sharing === 'on' && Object.entries(share).some(([k, x]) => k !== 'week' && x), share };
}
function rowsOf(id, mock) {
  if (mock) return (F.mockHealth(id)?.week ?? []).map((d) => ({ date: d.date, steps: d.steps, sleep_min: d.sleepMin, resting_hr: d.restingHr, active_kcal: d.activeKcal, hr: 72, sleep_start: '23:10', sleep_end: '06:58', source: 'Apple Health', updated: Date.now() - 9 * MIN }));
  return F.healthRows(id, 10);
}
export function health50(v, id, { now = Date.now(), members = F.members(v) } = {}) {
  const p = personOf(v, id), ev = F.everyone(v).find((x) => x.id === id);
  const { shared, share } = shareOf(v, id);
  const base = { userId: id, name: p.name, initials: p.initials, color: p.color, photoUrl: p.photoUrl, self: id === v, ...(ev?.mock ? { mock: true } : {}) };
  if (!shared) return { ...base, shared: false, short: 'Ikke delt', text: `${p.name} deler ikke helse med deg`, action: { label: 'Be om deling ›', method: 'POST', url: `/api/family/health50/${encodeURIComponent(id)}/request` } };
  const rows = rowsOf(id, !!ev?.mock);
  const today = ymdOslo(now);
  const by = new Map(rows.map((r) => [r.date, r]));
  const t = by.get(today) ?? null;
  const goal = ev?.mock ? (id.length % 2 ? 8000 : DEFAULT_GOAL) : goalOf(id);
  const pick = (r, key, col) => (share[key] && r && r[col] != null ? r[col] : null);
  const steps = pick(t, 'steps', 'steps');
  const week = share.week || id === v ? Array.from({ length: 7 }, (_, i) => {
    const ts = now - (6 - i) * DAY, d = ymdOslo(ts), r = by.get(d);
    const s = pick(r, 'steps', 'steps');
    return { date: d, day: DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()], today: d === today, steps: s, goalReached: s != null && s >= goal, sleepMin: pick(r, 'sleep', 'sleep_min'), restingHr: pick(r, 'restingHr', 'resting_hr'), activeKcal: pick(r, 'activeKcal', 'active_kcal') };
  }) : [];
  const withSteps = week.filter((d) => d.steps != null);
  const avg = withSteps.length ? withSteps.reduce((s, d) => s + d.steps, 0) / withSteps.length : null;
  const hit = withSteps.filter((d) => d.goalReached).length;
  const m = members.find((x) => x.userId === id);
  const battery = m?.last?.battery ?? null;
  const device = (t?.source ?? null) || m?.last?.device || null;
  const sleepMin = pick(t, 'sleep', 'sleep_min'), bed = pick(t, 'sleep', 'sleep_start'), wake = pick(t, 'sleep', 'sleep_end');
  const sharedKeys = Object.keys(SHARE_LABEL).filter((k) => share[k]);
  const shareText = id === v
    ? (() => { const pr = F.prefsOf(v); const own = Object.keys(SHARE_LABEL).filter((k) => pr.shareHealth[k]); return pr.sharing === 'on' && own.length ? `Du deler ${joinNames50(own.map((k) => SHARE_LABEL[k]))} med familien` : 'Du deler ikke helse med familien'; })()
    : `${p.name} deler ${joinNames50(sharedKeys.map((k) => SHARE_LABEL[k]))} med deg`;
  return {
    ...base, shared: true, shares: share, shareText, shareAction: { label: 'Deling ›', tab: 'innstillinger' },
    date: today, sourceText: ['I dag', device].filter(Boolean).join(' · '), device,
    today: {
      steps, stepsText: steps != null ? fmtInt(steps) : null, goal, goalText: fmtInt(goal), goalReached: steps != null && steps >= goal, remaining: steps != null ? Math.max(0, goal - steps) : null,
      percent: steps != null ? Math.round((steps / goal) * 100) : null, badge: steps != null && steps >= goal ? 'Målet nådd' : steps != null ? `${Math.round((steps / goal) * 100)} % av målet` : null,
      sleepMin, sleepText: sleepText(sleepMin), bedtime: bed, wake, sleepRange: bed && wake ? `${bed}–${wake}` : null,
      restingHr: pick(t, 'restingHr', 'resting_hr'), hr: pick(t, 'hr', 'hr'), activeKcal: pick(t, 'activeKcal', 'active_kcal'), battery, charging: m?.last?.charging ?? null,
    },
    week, weekAvg: avg != null ? Math.round(avg) : null, weekHit: hit, weekText: avg != null ? `Snitt denne uken: ${fmtInt(avg)} · nådd målet ${hit} av 7 dager` : null,
    updatedAt: rows.length ? new Date(Math.max(...rows.map((r) => r.updated ?? 0))).toISOString() : null,
  };
}
/** «Ingrid har nådd målet. Du mangler 1 580 skritt.» – laget av tallene, ikke AI. */
export function healthSummary50(list) {
  const meH = list.find((p) => p.self && p.shared);
  const reached = list.filter((p) => !p.self && p.shared && p.today?.goalReached).map((p) => p.name);
  const meReached = !!meH?.today?.goalReached;
  const parts = [];
  if (meReached) parts.push(reached.length ? `Du og ${joinNames50(reached)} har nådd målet.` : 'Du har nådd målet.');
  else if (reached.length) parts.push(`${joinNames50(reached)} har nådd målet.`);
  if (!meReached && meH?.today?.steps != null) parts.push(`Du mangler ${fmtInt(meH.today.remaining)} skritt.`);
  if (!parts.length) parts.push('Ingen skritt registrert i dag ennå.');
  return parts.join(' ');
}
export function healthAll50(v, now = Date.now()) {
  const members = F.members(v);
  const ids = [v, ...F.everyone(v).map((p) => p.id)];
  const list = [...new Set(ids)].map((id) => health50(v, id, { now, members }));
  return { title: 'Helse', summary: healthSummary50(list), people: list, updatedAt: new Date(now).toISOString() };
}

/* ---------------- Sjekk inn ---------------- */

db.exec(`CREATE TABLE IF NOT EXISTS family_checkin50 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', quick TEXT,
  place_name TEXT, place_detail TEXT, lat REAL, lon REAL, acc REAL, event_title TEXT, created INTEGER NOT NULL,
  remind_at INTEGER, reminded_at INTEGER, request_id INTEGER, parent_id INTEGER
);
CREATE INDEX IF NOT EXISTS family_checkin50_created ON family_checkin50(created);
CREATE TABLE IF NOT EXISTS family_checkin50_to (
  checkin_id INTEGER NOT NULL, user TEXT NOT NULL, seen_at INTEGER, reply TEXT, reply_at INTEGER, answer_id INTEGER,
  PRIMARY KEY (checkin_id, user)
);
CREATE INDEX IF NOT EXISTS family_checkin50_to_user ON family_checkin50_to(user, checkin_id);`);

export const QUICK50 = { party: 'Er på bursdag/fest, alt bra', arrived: 'Er framme', late: 'Blir sent', pickup: 'Hent meg', ok: 'Alt bra' };
const REPLIES = { ok: '👍', call: 'Ring', pickup: 'Hent' };
const KEEP = 30 * DAY;
/** Hurtigvalget tilpasset hendelsen: bursdag → «Er på bursdag, alt bra», fest → «Er på fest, alt bra». */
export function partyText50(title) {
  const t = String(title ?? '');
  if (/bursdag|birthday|\bbday\b/i.test(t)) return 'Er på bursdag, alt bra';
  if (/fest|party|russ|julebord|bryllup/i.test(t)) return 'Er på fest, alt bra';
  if (t.trim()) return `Er på ${t.trim().length > 40 ? `${t.trim().slice(0, 39)}…` : t.trim()}, alt bra`;
  return 'Er på bursdag, alt bra';
}
const quickList = (title) => [
  { id: 'party', text: partyText50(title) }, { id: 'arrived', text: QUICK50.arrived }, { id: 'late', text: QUICK50.late }, { id: 'pickup', text: QUICK50.pickup, priority: 'high' },
];

let _events50 = null; // bare for tester: (user, fromDate, toDate) → {events}
export const _setCalendar50 = (fn) => { _events50 = fn; };
async function calendarNow(v, now) {
  try {
    const fn = _events50 ?? (await import('./calendar.js')).eventsFor;
    const d = ymdOslo(now);
    const r = await Promise.race([fn(v, d, d), new Promise((res) => setTimeout(() => res(null), 2500))]);
    return (r?.events ?? []).filter((e) => {
      if (e.type === 'time') return false; // skoletimer er ikke «hvor er du»
      if (e.allDay) return e.type === 'bursdag' ? false : true;
      const s = Date.parse(e.start), en = Date.parse(e.end);
      return Number.isFinite(s) && now >= s - HOUR && now <= (Number.isFinite(en) ? en : s + 2 * HOUR) + 30 * MIN;
    });
  } catch { return []; }
}
/** Forslag til «Hvor»: kalenderhendelse nå (helst nær posisjonen), stedet du er i, ellers adressen/strøket. */
export async function suggest50(v, { lat = null, lon = null, acc = null } = {}, now = Date.now()) {
  let pos = lat != null && lon != null ? { lat, lon, acc } : null;
  if (!pos) { const r = F.lastRaw(v); if (r && now - r.ts < FRESH) pos = { lat: r.lat, lon: r.lon, acc: r.acc ?? null }; }
  const accTxt = pos?.acc != null ? `± ${Math.round(pos.acc)} m` : null;
  const area = pos ? await F.placeFor(pos.lat, pos.lon, { waitMs: 1500 }).catch(() => null) : null;
  const out = [];
  for (const e of await calendarNow(v, now)) {
    const g = e.geo ?? e.map ?? null;
    const d = g && pos ? F.dist(pos, g) : null;
    if (d != null && d > 1500) continue; // hendelsen er et annet sted enn deg
    const detail = g ? (await F.placeFor(g.lat, g.lon, { waitMs: 800 }).catch(() => null)) ?? (e.room || null) : area ?? (e.room || null);
    out.push({ source: 'calendar', eventId: e.id, title: e.title, detail, score: (d != null ? 3 : 1) + (e.allDay ? 0 : 1), lat: g?.lat ?? pos?.lat ?? null, lon: g?.lon ?? pos?.lon ?? null });
  }
  if (pos) {
    const z = F.zonesFor(v).find((x) => F.inPlace(pos, x));
    if (z) out.push({ source: 'place', placeId: z.id, title: z.name, detail: area, score: 0.5, lat: pos.lat, lon: pos.lon });
    if (area) out.push({ source: 'address', title: area, detail: null, score: 0, lat: pos.lat, lon: pos.lon });
  }
  out.sort((a, b) => b.score - a.score);
  const list = out.slice(0, 4).map(({ score, ...s }) => ({ ...s, acc: pos?.acc ?? null, label: [s.title, s.detail && s.detail !== s.title ? s.detail : null, accTxt].filter(Boolean).join(' · ') }));
  const top = list[0] ?? null;
  return { suggestion: top, suggestions: list, position: pos, quick: quickList(top?.source === 'calendar' ? top.title : null) };
}

const ckGet = (id) => q('SELECT * FROM family_checkin50 WHERE id=?').get(id);
const ckTo = (id) => q('SELECT * FROM family_checkin50_to WHERE checkin_id=? ORDER BY rowid').all(id);
const participants = (r) => [r.from_user, ...ckTo(r.id).map((t) => t.user)];
const canSeeCk = (r, v) => !!r && participants(r).includes(v);
const placeLabel = (r) => [r.place_name, r.place_detail && r.place_detail !== r.place_name ? r.place_detail : null].filter(Boolean).join(' · ') || null;
export function checkinOut50(r, v, now = Date.now()) {
  const to = ckTo(r.id);
  const mine = r.from_user === v;
  const toOut = to.map((t) => ({ ...personOf(v, t.user), seenAt: t.seen_at ? new Date(t.seen_at).toISOString() : null, reply: t.reply ?? null, replyText: t.reply ? REPLIES[t.reply] : null,
    replyAt: t.reply_at ? new Date(t.reply_at).toISOString() : null, answered: r.kind === 'request' ? !!(t.answer_id || t.reply) : undefined, answerId: t.answer_id ?? null }));
  const seen = toOut.filter((t) => t.seenAt || t.reply).map((t) => (t.self ? 'deg' : t.name));
  const names = toOut.map((t) => (t.self ? 'deg' : t.name));
  const pending = r.kind === 'request' && toOut.some((t) => !t.answered);
  const time = hm(r.created);
  const title = r.kind === 'request' ? (mine ? `Ber ${joinNames50(names)} om innsjekk` : `${who(v, r.from_user)} ber deg sjekke inn`)
    : r.kind === 'pickup' ? `${mine ? 'Du' : who(v, r.from_user)} ber om å bli hentet` : mine ? `Sjekket inn ${time}` : `${who(v, r.from_user)} sjekket inn ${time}`;
  return {
    id: r.id, kind: r.kind, priority: r.kind === 'pickup' ? 'high' : 'normal', from: personOf(v, r.from_user), mine, text: r.text, quick: r.quick ?? null,
    place: r.place_name || r.place_detail ? { name: r.place_name ?? null, detail: r.place_detail ?? null, label: placeLabel(r) } : null,
    // Posisjonen er bare med for deltakerne (avsender og mottakere), og bare den som ble sendt med innsjekken.
    position: r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon, acc: r.acc ?? null, appleUrl: `https://maps.apple.com/?ll=${r.lat},${r.lon}`, googleUrl: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}` } : null,
    eventTitle: r.event_title ?? null, createdAt: new Date(r.created).toISOString(), time, title,
    to: toOut, seenText: seen.length ? `Sett av ${joinNames50(seen)}` : `Sendt til ${joinNames50(names)}`,
    status: r.kind === 'request' ? (pending ? 'pending' : 'answered') : 'sent', pending,
    reminder: mine && r.remind_at ? { at: new Date(r.remind_at).toISOString(), time: hm(r.remind_at), done: !!r.reminded_at, text: `Påminnelse ${hm(r.remind_at)}` } : null,
    requestId: r.request_id ?? null, parentId: r.parent_id ?? null,
  };
}
/** Én rad i «I dag i familien». */
export function logItem50(r, v) {
  const c = checkinOut50(r, v);
  const actor = c.kind === 'request' && c.mine ? c.to[0] ?? c.from : c.from;
  const sub = c.kind === 'request'
    ? (c.mine ? `Sendt ${c.time} · ${c.pending ? 'ikke svart' : 'svart'}` : c.text || 'Svar med en innsjekk')
    : [c.text, c.place?.name ?? c.place?.detail].filter(Boolean).join(' · ');
  const title = c.kind === 'checkin' ? `${c.mine ? 'Du' : c.from.name} sjekket inn` : c.title;
  return { id: `c${c.id}`, checkinId: c.id, kind: c.kind, avatar: actor, title, sub, right: c.pending ? 'Venter' : c.time, pending: c.pending, alert: c.pending || c.kind === 'pickup', priority: c.priority, ts: Date.parse(c.createdAt), time: c.time };
}
function logFor(v, since) {
  return q(`SELECT DISTINCT c.* FROM family_checkin50 c LEFT JOIN family_checkin50_to t ON t.checkin_id=c.id
    WHERE c.created >= ? AND (c.from_user=? OR t.user=?) ORDER BY c.created DESC LIMIT 100`).all(since, v, v);
}

function recipients(c, v, list) {
  if (!Array.isArray(list) || !list.length) return { err: bad(c, 'Velg hvem som får beskjed (to: [userId])') };
  const ids = [...new Set(list.map(String))].slice(0, 10);
  const fam = new Set(F.everyone(v).map((p) => p.id));
  if (ids.some((id) => id === v)) return { err: bad(c, 'Du kan ikke sjekke inn til deg selv') };
  if (ids.some((id) => !fam.has(id))) return { err: c.json({ error: 'Ukjent person' }, 404) };
  return { ids };
}
function positionInput(b) {
  const lat = num(b.lat ?? b.position?.lat, -90, 90), lon = num(b.lon ?? b.position?.lon, -180, 180);
  if (lat == null || lon == null) return null;
  return { lat, lon, acc: num(b.acc ?? b.position?.acc, 0, 100_000) };
}
function remindInput(b, now) {
  if (b.remindAt == null && b.remindInMin == null) return null;
  const t = b.remindAt != null ? Date.parse(String(b.remindAt)) : now + Number(b.remindInMin) * MIN;
  if (!Number.isFinite(t) || t < now + MIN || t > now + DAY) return 'error';
  return Math.round(t);
}
async function pushCheckin(r, v) {
  const c = checkinOut50(r, v);
  const fromName = F.nameOf(r.from_user);
  const ids = ckTo(r.id).map((t) => t.user);
  broadcast('family', { kind: 'checkin', id: r.id, action: 'new', checkinKind: r.kind }, [...ids, r.from_user]);
  const where = placeLabel(r);
  const n = r.kind === 'request'
    ? { title: `${fromName} ber deg sjekke inn`, body: r.text || 'Trykk for å sjekke inn', actions: [{ id: 'ok', title: '👍 Alt bra' }, { id: 'checkin', title: 'Sjekk inn' }] }
    : r.kind === 'pickup'
      ? { title: `${fromName}: Hent meg`, body: [where, r.text && r.text !== QUICK50.pickup ? r.text : null].filter(Boolean).join(' · ') || 'Trykk for å se posisjonen', actions: [{ id: 'pickup', title: 'Hent' }, { id: 'call', title: 'Ring' }] }
      : { title: `${fromName} sjekket inn`, body: [r.text, where].filter(Boolean).join(' · '), actions: [{ id: 'ok', title: '👍' }, { id: 'call', title: 'Ring' }, { id: 'pickup', title: 'Hent' }] };
  const res = [];
  for (const to of ids) {
    if (!userInfo(to)) continue; // eksempelpersoner (MOCK_DATA) har ingen telefon
    res.push(await notifyUser(to, { title: n.title, body: n.body, url: `/#/familie/sjekk?id=${r.id}`, tag: `checkin-${r.id}`, category: 'familie',
      data: { kind: `checkin.${r.kind}`, checkinId: r.id, from: r.from_user, fromName, place: where, text: r.text, actions: n.actions, channel: r.kind === 'pickup' ? 'sjekkinn-hast' : 'sjekkinn',
        ...(r.kind === 'pickup' ? { priority: 'high', ...(r.lat != null ? { lat: r.lat, lon: r.lon, acc: r.acc ?? null } : {}) } : {}) } }).catch(() => null));
  }
  return { delivered: res.filter((x) => x && (x.realtime || x.pushed || x.id)).length, notified: ids.length, checkin: c };
}
function insertCheckin({ from, kind, text, quick = null, place = null, pos = null, eventTitle = null, remindAt = null, requestId = null, parentId = null, to }, now = Date.now()) {
  return db.transaction(() => {
    const r = q(`INSERT INTO family_checkin50(from_user, kind, text, quick, place_name, place_detail, lat, lon, acc, event_title, created, remind_at, request_id, parent_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(from, kind, text, quick, place?.name ?? null, place?.detail ?? null, pos?.lat ?? null, pos?.lon ?? null, pos?.acc ?? null, eventTitle, now, remindAt, requestId, parentId);
    for (const u of to) q('INSERT OR IGNORE INTO family_checkin50_to(checkin_id, user) VALUES(?,?)').run(r.id, u);
    if (requestId) q('UPDATE family_checkin50_to SET answer_id=? WHERE checkin_id=? AND user=? AND answer_id IS NULL').run(r.id, requestId, from);
    return r;
  })();
}
/** Påminnelser («Minn meg på å sjekke inn igjen») og opprydding. → antall sendt. */
export async function sweepCheckins50(now = Date.now()) {
  const due = q('SELECT * FROM family_checkin50 WHERE remind_at IS NOT NULL AND reminded_at IS NULL AND remind_at <= ? LIMIT 50').all(now);
  for (const r of due) {
    q('UPDATE family_checkin50 SET reminded_at=? WHERE id=?').run(now, r.id);
    await notifyUser(r.from_user, { title: 'Sjekk inn igjen?', body: `Du sjekket inn ${hm(r.created)}${placeLabel(r) ? ` · ${placeLabel(r)}` : ''}. Trykk for å sjekke inn igjen.`, url: `/#/familie/sjekk?igjen=${r.id}`,
      tag: `checkin-remind-${r.id}`, category: 'familie', data: { kind: 'checkin.reminder', checkinId: r.id, channel: 'sjekkinn' } }).catch(() => null);
  }
  const old = q('SELECT id FROM family_checkin50 WHERE created < ?').all(now - KEEP).map((x) => x.id);
  for (const id of old) { q('DELETE FROM family_checkin50_to WHERE checkin_id=?').run(id); q('DELETE FROM family_checkin50 WHERE id=?').run(id); }
  return due.length;
}
setInterval(() => { sweepCheckins50().catch((e) => console.warn('[sjekk inn] påminnelse:', e.message)); }, 30_000).unref?.();

/* ---------------- I dag ---------------- */

export function today50(v, now = Date.now()) {
  const since = osloMidnight50(now);
  const zone = F.eventsSince(v, since).map((e) => {
    const p = personOf(v, e.userId);
    return { id: `z${e.id}`, kind: e.kind, avatar: p, title: `${p.self ? 'Du' : p.name} ${e.kind === 'enter' ? 'kom til' : 'forlot'} ${e.zone}`, sub: null, right: hm(e.ts), place: e.zone, placeId: e.zoneId, ts: e.ts, time: hm(e.ts), pending: false, alert: false };
  });
  const ck = logFor(v, since).map((r) => logItem50(r, v));
  const items = [...zone, ...ck].sort((a, b) => b.ts - a.ts).slice(0, 60);
  return { title: 'I DAG', items, updatedAt: new Date(now).toISOString() };
}

/* ---------------- Ruter ---------------- */

export const family50Api = new Hono();
family50Api.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
});

// Steder
family50Api.get('/places', (c) => {
  const v = c.get('user');
  F.seedMock(v);
  schoolPlaceOf50(v); // sørger for at Ruter-migreringen har kjørt
  const members = F.members(v);
  return c.json({ places: F.zonesFor(v).map((z) => placeOut50(F.zoneById(z.id), v, members)), types: F.PLACE_TYPES, radius: { min: AREA_MIN, max: AREA_MAX }, maxAreas: MAX_AREAS, version: placesVersion50() });
});
family50Api.get('/places/regions', (c) => {
  const lat = num(c.req.query('lat'), -90, 90), lon = num(c.req.query('lon'), -180, 180);
  return c.json(regions50(c.get('user'), lat != null && lon != null ? { lat, lon } : null), 200, { 'Cache-Control': 'no-store' });
});
family50Api.get('/places/:id{[0-9]+}', (c) => { const { z, err } = visiblePlace(c); if (err) return err; return c.json(placeOut50(z, c.get('user'))); });
family50Api.post('/places', async (c) => {
  const v = c.get('user'), b = await body(c);
  const p = placeInput(b);
  if (typeof p === 'string') return bad(c, p);
  const raw = Array.isArray(b.areas) ? b.areas : [{ name: b.areaName ?? p.name, lat: b.lat, lon: b.lon, radius_m: b.radius_m ?? b.radius }];
  if (!raw.length) return bad(c, 'Et sted må ha minst ett område', 400, 'no_area');
  if (raw.length > MAX_AREAS) return bad(c, `Maks ${MAX_AREAS} områder per sted`, 409, 'too_many_areas');
  const areas = raw.map((a) => areaInput({ ...a, name: a?.name ?? p.name }));
  const e = areas.find((a) => typeof a === 'string');
  if (e) return bad(c, e);
  const icon = p.icon ?? iconFor(p.place_type, p.name);
  const z = db.transaction(() => {
    const r = q('INSERT INTO family_zone(name, lat, lon, radius, color, created_by, created, shared, icon, icon_path, place_type) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .get(p.name, areas[0].lat, areas[0].lon, areas[0].radius, p.color, v, Date.now(), p.shared, icon, p.icon_path ?? null, p.place_type);
    for (const a of areas) q('INSERT INTO family_area50(zone_id, name, lat, lon, radius, created) VALUES(?,?,?,?,?,?)').run(r.id, a.name, a.lat, a.lon, a.radius, Date.now());
    return r;
  })();
  placesChanged50(z.id);
  return c.json(placeOut50(F.zoneById(z.id), v), 201);
});
family50Api.patch('/places/:id{[0-9]+}', async (c) => {
  const { z, err } = ownPlace(c); if (err) return err;
  const b = await body(c), p = placeInput(b, true);
  if (typeof p === 'string') return bad(c, p);
  const n = { ...z, ...p };
  if (p.icon === null || (p.place_type && b.icon === undefined && Object.values(TYPE_ICON).includes(z.icon) && z.icon !== iconFor(p.place_type, n.name))) { n.icon = iconFor(n.place_type, n.name); n.icon_path = null; }
  q('UPDATE family_zone SET name=?, color=?, shared=?, icon=?, icon_path=?, place_type=? WHERE id=?').run(n.name, String(n.color).toLowerCase(), n.shared ? 1 : 0, n.icon, n.icon_path ?? null, n.place_type, z.id);
  if (z.shared && !n.shared) q('DELETE FROM family_notify WHERE zone_id=? AND viewer<>?').run(z.id, z.created_by);
  placesChanged50(z.id, z.shared && !n.shared ? { viewers: [z.created_by, ...F.everyone(z.created_by).map((x) => x.id)].filter((x, i, a) => a.indexOf(x) === i && userInfo(x)) } : {});
  return c.json(placeOut50(F.zoneById(z.id), c.get('user')));
});
family50Api.delete('/places/:id{[0-9]+}', (c) => {
  const { z, err } = ownPlace(c); if (err) return err;
  deletePlace50(z.id);
  return c.json({ ok: true, id: z.id, version: placesVersion50() });
});
family50Api.post('/places/:id{[0-9]+}/areas', async (c) => {
  const { z, err } = ownPlace(c); if (err) return err;
  const a = areaInput(await body(c));
  if (typeof a === 'string') return bad(c, a);
  if (F.areasOf(z.id).length >= MAX_AREAS) return bad(c, `Maks ${MAX_AREAS} områder per sted`, 409, 'too_many_areas');
  const r = q('INSERT INTO family_area50(zone_id, name, lat, lon, radius, created) VALUES(?,?,?,?,?,?) RETURNING *').get(z.id, a.name, a.lat, a.lon, a.radius, Date.now());
  placesChanged50(z.id);
  return c.json({ area: areaOut50(r), place: placeOut50(F.zoneById(z.id), c.get('user')) }, 201);
});
const ownArea = (c, z) => q('SELECT * FROM family_area50 WHERE id=? AND zone_id=?').get(Number(c.req.param('areaId')), z.id);
family50Api.patch('/places/:id{[0-9]+}/areas/:areaId{[0-9]+}', async (c) => {
  const { z, err } = ownPlace(c); if (err) return err;
  const cur = ownArea(c, z);
  if (!cur) return c.json({ error: 'Fant ikke området' }, 404);
  const a = areaInput(await body(c), true);
  if (typeof a === 'string') return bad(c, a);
  const n = { ...cur, ...a };
  q('UPDATE family_area50 SET name=?, lat=?, lon=?, radius=? WHERE id=?').run(n.name, n.lat, n.lon, n.radius, cur.id);
  placesChanged50(z.id);
  return c.json({ area: areaOut50(q('SELECT * FROM family_area50 WHERE id=?').get(cur.id)), place: placeOut50(F.zoneById(z.id), c.get('user')) });
});
family50Api.delete('/places/:id{[0-9]+}/areas/:areaId{[0-9]+}', (c) => {
  const { z, err } = ownPlace(c); if (err) return err;
  const cur = ownArea(c, z);
  if (!cur) return c.json({ error: 'Fant ikke området' }, 404);
  if (F.areasOf(z.id).length <= 1) return bad(c, 'Det siste området kan ikke fjernes. Slett heller stedet.', 409, 'last_area');
  q('DELETE FROM family_area50 WHERE id=?').run(cur.id);
  placesChanged50(z.id);
  return c.json({ ok: true, place: placeOut50(F.zoneById(z.id), c.get('user')) });
});

// Folk og I dag
family50Api.get('/people50', async (c) => c.json(await people50(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
family50Api.get('/people50/:userId', async (c) => {
  const v = c.get('user'), id = c.req.param('userId');
  const members = F.members(v), m = members.find((x) => x.userId === id);
  if (!m) return c.json({ error: 'Ukjent person' }, 404); // ukjent eller deler ikke: samme svar
  const p = await person50(m, v, members.find((x) => x.self));
  return c.json({ ...p, health: health50(v, id, { members }) }, 200, { 'Cache-Control': 'no-store' });
});
family50Api.get('/today50', (c) => c.json(today50(c.get('user')), 200, { 'Cache-Control': 'no-store' }));

// Helse
family50Api.get('/health50', (c) => c.json(healthAll50(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
family50Api.put('/health50/goal', async (c) => {
  const b = await body(c), s = num(b.steps, 1000, 100_000);
  if (s == null) return bad(c, 'steps må være mellom 1 000 og 100 000');
  kv.set(c.get('user'), 'family_goal50', Math.round(s));
  return c.json({ goal: Math.round(s) });
});
family50Api.get('/health50/:userId', (c) => {
  const v = c.get('user'), id = c.req.param('userId');
  if (!F.everyone(v).some((p) => p.id === id)) return c.json({ error: 'Ukjent person' }, 404);
  return c.json(health50(v, id), 200, { 'Cache-Control': 'no-store' });
});
family50Api.post('/health50/:userId/request', async (c) => {
  const v = c.get('user'), id = c.req.param('userId');
  if (!F.everyone(v).some((p) => p.id === id)) return c.json({ error: 'Ukjent person' }, 404);
  if (id === v) return bad(c, 'Du kan ikke be deg selv om deling');
  const key = `family_hreq50_${id}`, last = Number(kv.get(v, key, 0)) || 0;
  if (Date.now() - last < HOUR) return c.json({ ok: true, delivered: false, throttled: true, text: 'Du har allerede spurt den siste timen' });
  kv.set(v, key, Date.now());
  if (!userInfo(id)) return c.json({ ok: true, delivered: false });
  const r = await notifyUser(id, { title: 'Helse i Familie', body: `${F.nameOf(v)} ber deg dele helse i Familie`, url: '/#/familie/helse', tag: `health-req-${v}`, category: 'familie', data: { kind: 'health.request', from: v, fromName: F.nameOf(v) } }).catch(() => null);
  return c.json({ ok: true, delivered: !!(r && (r.id || r.realtime || r.pushed)), text: `Spurte ${F.nameOf(id)}` });
});

// Sjekk inn
const people = (v) => F.everyone(v).filter((p) => p.id !== v).map((p) => ({ userId: p.id, name: p.name, initials: F.initials(p.name), color: p.color, photoUrl: p.photoUrl, ...(p.mock ? { mock: true } : {}) }));
const posQuery = (c) => ({ lat: num(c.req.query('lat'), -90, 90), lon: num(c.req.query('lon'), -180, 180), acc: num(c.req.query('acc'), 0, 100_000) });
family50Api.get('/checkin', async (c) => {
  const v = c.get('user'), now = Date.now(), since = osloMidnight50(now);
  const s = await suggest50(v, posQuery(c), now);
  const rows = logFor(v, since);
  const latest = rows.find((r) => r.from_user === v && r.kind !== 'request') ?? null;
  const waiting = rows.filter((r) => r.kind === 'request' && r.from_user !== v && ckTo(r.id).some((t) => t.user === v && !t.answer_id && !t.reply)).map((r) => checkinOut50(r, v));
  return c.json({ title: 'Sjekk inn', ...s, people: people(v), latest: latest ? checkinOut50(latest, v) : null, requests: waiting, log: { title: 'I DAG I FAMILIEN', items: rows.map((r) => logItem50(r, v)) },
    homeTrip: { label: 'På vei hjem', url: '/api/velfremme/start' } }, 200, { 'Cache-Control': 'no-store' });
});
family50Api.get('/checkin/suggest', async (c) => c.json(await suggest50(c.get('user'), posQuery(c)), 200, { 'Cache-Control': 'no-store' }));
family50Api.get('/checkin/log', (c) => {
  const v = c.get('user');
  return c.json({ title: 'I DAG I FAMILIEN', items: logFor(v, osloMidnight50()).map((r) => logItem50(r, v)) }, 200, { 'Cache-Control': 'no-store' });
});
async function placeFromBody(v, b, pos) {
  const pl = typeof b.place === 'string' ? { name: b.place } : b.place && typeof b.place === 'object' ? b.place : null;
  let name = clean(pl?.name, 80) || null, detail = clean(pl?.detail, 80) || null;
  if (!name && pos) {
    const z = F.zonesFor(v).find((x) => F.inPlace(pos, x));
    name = z?.name ?? (await F.placeFor(pos.lat, pos.lon, { waitMs: 1200 }).catch(() => null));
  }
  return name || detail ? { name, detail } : null;
}
family50Api.post('/checkin', async (c) => {
  const v = c.get('user'), b = await body(c), now = Date.now();
  let to = b.to;
  let req = null;
  if (b.requestId != null) {
    req = ckGet(Number(b.requestId));
    if (!req || req.kind !== 'request' || !ckTo(req.id).some((t) => t.user === v)) return c.json({ error: 'Fant ikke forespørselen' }, 404);
    if (!Array.isArray(to) || !to.length) to = [req.from_user];
  }
  const r0 = recipients(c, v, to); if (r0.err) return r0.err;
  const quick = b.quick != null ? String(b.quick) : null;
  if (quick && !QUICK50[quick]) return bad(c, 'quick må være party, arrived, late, pickup eller ok');
  const text = clean(b.text, 200) || (quick ? QUICK50[quick] : '');
  if (!text) return bad(c, 'Skriv hva du vil si (text) eller velg et hurtigvalg (quick)');
  const remindAt = remindInput(b, now);
  if (remindAt === 'error') return bad(c, 'Påminnelsen må være mellom 1 minutt og 24 timer fram i tid');
  const pos = positionInput(b);
  const place = await placeFromBody(v, b, pos);
  const kind = quick === 'pickup' || b.kind === 'pickup' ? 'pickup' : 'checkin';
  const r = insertCheckin({ from: v, kind, text, quick, place, pos, eventTitle: clean(b.eventTitle, 120) || null, remindAt, requestId: req?.id ?? null, to: r0.ids }, now);
  if (req) broadcast('family', { kind: 'checkin', id: req.id, action: 'answered' }, participants(req));
  const p = await pushCheckin(r, v);
  return c.json({ checkin: checkinOut50(ckGet(r.id), v), delivered: p.delivered }, 201);
});
family50Api.post('/checkin/request', async (c) => {
  const v = c.get('user'), b = await body(c);
  const r0 = recipients(c, v, b.to); if (r0.err) return r0.err;
  const r = insertCheckin({ from: v, kind: 'request', text: clean(b.text, 200), to: r0.ids });
  const p = await pushCheckin(r, v);
  return c.json({ request: checkinOut50(ckGet(r.id), v), delivered: p.delivered }, 201);
});
function visibleCk(c) {
  const r = ckGet(Number(c.req.param('id')));
  if (!canSeeCk(r, c.get('user'))) return { err: c.json({ error: 'Fant ikke innsjekken' }, 404) };
  return { r };
}
family50Api.get('/checkin/:id{[0-9]+}', (c) => { const { r, err } = visibleCk(c); if (err) return err; return c.json({ checkin: checkinOut50(r, c.get('user')) }); });
family50Api.post('/checkin/:id{[0-9]+}/seen', (c) => {
  const { r, err } = visibleCk(c); if (err) return err;
  const v = c.get('user');
  if (r.from_user !== v) {
    const n = q('UPDATE family_checkin50_to SET seen_at=? WHERE checkin_id=? AND user=? AND seen_at IS NULL').run(Date.now(), r.id, v).changes;
    if (n) broadcast('family', { kind: 'checkin', id: r.id, action: 'seen' }, [r.from_user]);
  }
  return c.json({ checkin: checkinOut50(ckGet(r.id), v) });
});
// Svar med ett trykk fra varselet: 👍 (ok), Ring (call), Hent (pickup). På en forespørsel er 👍 = innsjekk «Alt bra» til den som spurte.
family50Api.post('/checkin/:id{[0-9]+}/reply', async (c) => {
  const { r, err } = visibleCk(c); if (err) return err;
  const v = c.get('user'), b = await body(c), reply = String(b.reply ?? '');
  if (r.from_user === v) return bad(c, 'Du kan ikke svare på din egen innsjekk');
  if (!REPLIES[reply]) return bad(c, 'reply må være ok, call eller pickup');
  const now = Date.now();
  q('UPDATE family_checkin50_to SET reply=?, reply_at=?, seen_at=COALESCE(seen_at, ?) WHERE checkin_id=? AND user=?').run(reply, now, now, r.id, v);
  let answer = null;
  if (r.kind === 'request' && reply === 'ok') {
    const pos = positionInput(b);
    const a = insertCheckin({ from: v, kind: 'checkin', text: clean(b.text, 200) || QUICK50.ok, quick: 'ok', place: await placeFromBody(v, b, pos), pos, requestId: r.id, to: [r.from_user] }, now);
    answer = checkinOut50(ckGet(a.id), v);
    await pushCheckin(a, v);
  } else if (userInfo(r.from_user)) {
    const name = F.nameOf(v);
    const body0 = reply === 'ok' ? `${name}: 👍` : reply === 'call' ? `${name} ringer deg` : `${name} kommer og henter deg`;
    await notifyUser(r.from_user, { title: 'Sjekk inn', body: body0, url: `/#/familie/sjekk?id=${r.id}`, tag: `checkin-reply-${r.id}-${v}`, category: 'familie', data: { kind: 'checkin.reply', checkinId: r.id, reply, from: v, fromName: name, channel: 'sjekkinn' } }).catch(() => null);
  }
  broadcast('family', { kind: 'checkin', id: r.id, action: 'reply', reply, from: v }, participants(r));
  return c.json({ checkin: checkinOut50(ckGet(r.id), v), ...(answer ? { answer } : {}), ...(reply === 'call' ? { call: { userId: r.from_user, name: F.nameOf(r.from_user), phone: userInfo(r.from_user)?.phone ?? null } } : {}) });
});
// «Hent meg» fra kortet etter innsjekk: høy prioritet med (ny) posisjon til de samme mottakerne (eller to).
family50Api.post('/checkin/:id{[0-9]+}/pickup', async (c) => {
  const { r, err } = visibleCk(c); if (err) return err;
  const v = c.get('user'), b = await body(c);
  if (r.from_user !== v) return c.json({ error: 'Fant ikke innsjekken' }, 404);
  const r0 = recipients(c, v, Array.isArray(b.to) && b.to.length ? b.to : ckTo(r.id).map((t) => t.user)); if (r0.err) return r0.err;
  const pos = positionInput(b) ?? (r.lat != null ? { lat: r.lat, lon: r.lon, acc: r.acc } : null);
  const place = b.place ? await placeFromBody(v, b, null) : (r.place_name || r.place_detail ? { name: r.place_name, detail: r.place_detail } : await placeFromBody(v, b, pos));
  const n = insertCheckin({ from: v, kind: 'pickup', text: clean(b.text, 200) || QUICK50.pickup, quick: 'pickup', place, pos, parentId: r.id, to: r0.ids });
  const p = await pushCheckin(n, v);
  return c.json({ checkin: checkinOut50(ckGet(n.id), v), delivered: p.delivered }, 201);
});
family50Api.put('/checkin/:id{[0-9]+}/reminder', async (c) => {
  const { r, err } = visibleCk(c); if (err) return err;
  if (r.from_user !== c.get('user')) return c.json({ error: 'Fant ikke innsjekken' }, 404);
  const t = remindInput(await body(c), Date.now());
  if (t == null || t === 'error') return bad(c, 'Oppgi remindAt (ISO) eller remindInMin (1–1440)');
  q('UPDATE family_checkin50 SET remind_at=?, reminded_at=NULL WHERE id=?').run(t, r.id);
  return c.json({ checkin: checkinOut50(ckGet(r.id), c.get('user')) });
});
family50Api.delete('/checkin/:id{[0-9]+}/reminder', (c) => {
  const { r, err } = visibleCk(c); if (err) return err;
  if (r.from_user !== c.get('user')) return c.json({ error: 'Fant ikke innsjekken' }, 404);
  q('UPDATE family_checkin50 SET remind_at=NULL WHERE id=?').run(r.id);
  return c.json({ checkin: checkinOut50(ckGet(r.id), c.get('user')) });
});

/** Monteres i index.js før de eldre /api/family-rutene. */
export function mountFamily50(app) {
  app.route('/api/family', family50Api);
}
