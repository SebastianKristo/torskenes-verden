// Prompt 41 (SERVER41): Ruter → Min reise (forhåndsruter skole ⇄ Amagerveien), skolesoner og «forlot skolen» (claude-code-ruter-forhandsruter-sebastian.md).
// Montert under /api/ruter (api41.js). Sesjon eller app-token, alt per bruker.
//
// GET  /api/ruter/my-routes → {routes:[route], homeCard, preset:boolean}
// PUT  /api/ruter/my-routes {routes:[route]} → samme      route = {id, name, from, to, via, legs:[{mode:'foot'|'tram'|'bus', from, to, lines?[]}], prefer_lines[], allow_lines[]}
//      Brukerne i kv(OWNER,'ruter41_preset_users') (standard: eieren) får forhåndsrutene Skole ⇄ Amagerveien via Holbergs plass/Frydenlund → Majorstuen → 45 (46).
//      Andre ser ingen ruter før de lagrer egne.
// GET  /api/ruter/my-trip?dir=auto|toHome|toSchool[&delay=10] → {dir, from, to, options:[option], alert?, updatedAt, homeCard, label}
//      option = {id, via, legs:[{mode, line?, from, to, dep, arr, aimed, expected, delayMin, walkMin, meters, label}], dep, arr, minutes, preferred,
//                badges:['Foretrukket'|'Trikk +10 min'], strip:'Gå 6 › Trikk 9 min › Gå 2 › 45', depLabel:'16:34', arrLabel:'→ 17:09 · 37 min', note?}
//      alert  = {text:'Trikken fra Frydenlund er 10 min forsinket', body, short, walk:{minutes, km, catches:'45 HH:MM'}, homeAt, strip:'Gå 17 min › 45'}
//      dir=auto: aktiv «forlot skolen» → toHome, ellers før kl. 12 toSchool og etter toHome. 45 foretrekkes (først hvis maks 3 min senere enn raskeste 46).
//      Entur Journey Planner v3 (ET-Client-Name: kristo-homelab) for holdeplasser, trikkelinjer, gangtid og sanntid; MOCK_DATA=1 gir en fast rutetabell
//      (delay= simulerer forsinket trikk fra Frydenlund, bare med MOCK_DATA).
// GET/POST/DELETE /api/ruter/school-zones[/:id] → {zones:[{id, name, lat, lon, radius_m, label:'Skolen 150 m'}]}  (radius 50–300 m, maks 20, siste kan ikke slettes)
// POST /api/ruter/left-school {at?, zoneId?, arrivedAt?} → {journey}  (hverdager 07–18, ikke innen 10 min etter ankomst; ellers 409 med grunn)
// POST /api/ruter/arrived-school {at?} → {ok}   (ankomst, så korte besøk ikke teller)
// GET  /api/ruter/journey → {journey}   journey = {active, leftSchoolAt, title:'MIN REISE · FORLOT SKOLEN 16:31', expiresAt, endedAt?, endedReason?, hidden, homeCard, trip?}
//      Utløper hjemme (Hjemlys «Jeg er hjemme» / POST /api/ruter/journey/home) eller etter 90 min.
// POST /api/ruter/journey/home · POST /api/ruter/journey/hide · DELETE /api/ruter/journey/hide (Angre) → {journey}
// GET/PUT /api/ruter/settings {homeCard:'over'|'instead'|'off', push:false} → samme
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { authOrToken as authOrToken0 } from './mobile.js';
const authOrToken = (c, next) => authOrToken0(c, next); // sen binding (mobile.js kan være midt i lastingen)

db.exec(`CREATE TABLE IF NOT EXISTS school_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, radius_m INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS school_zones_u ON school_zones(user_id);`);

const q = (s) => db.prepare(s);
const MOCK = () => process.env.MOCK_DATA === '1';
export const ENTUR_CLIENT41 = () => process.env.ENTUR_CLIENT_NAME_41 || 'kristo-homelab';
const JOURNEY_MS = 90 * 60_000, MIN = 60_000;
const HOME_CARDS = ['over', 'instead', 'off'];
const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
const iso = (t) => (t ? new Date(t).toISOString() : null);
const osloParts = (t = Date.now()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return { wd: p.weekday, h: +p.hour, m: +p.minute }; };
const kmText = (m) => `${String(Math.round(m / 100) / 10).replace('.', ',')} km`;

/* ---------------- Forhåndsruter ---------------- */

export const PLACES41 = {
  skole: { name: 'Skole', lat: 59.9318, lon: 10.7348 },
  holbergs: { name: 'Holbergs plass', lat: 59.9180, lon: 10.7364 },
  frydenlund: { name: 'Frydenlund', lat: 59.9235, lon: 10.7348 },
  majorstuen: { name: 'Majorstuen', lat: 59.9296, lon: 10.7146 },
  amagerveien: { name: 'Amagerveien', lat: 59.9447, lon: 10.6905 },
};
const presetUsers = () => { const v = kv.get(OWNER, 'ruter41_preset_users', null); return Array.isArray(v) ? v : [OWNER]; };
export const isPreset41 = (u) => presetUsers().includes(u);
function presetRoutes() {
  const legs = (via) => [{ mode: 'foot', from: 'Skole', to: via }, { mode: 'tram', from: via, to: 'Majorstuen' }, { mode: 'foot', from: 'Majorstuen', to: 'Majorstuen', note: 'bytte' }, { mode: 'bus', from: 'Majorstuen', to: 'Amagerveien', lines: ['45', '46'] }];
  const back = (l) => [...l].reverse().map((x) => ({ ...x, from: x.to, to: x.from }));
  return [
    { id: 'skole-holbergs', name: 'Skole → Amagerveien', from: 'Skole', to: 'Amagerveien', via: 'Holbergs plass', dir: 'toHome', legs: legs('Holbergs plass'), prefer_lines: ['45'], allow_lines: ['45', '46'] },
    { id: 'skole-frydenlund', name: 'Skole → Amagerveien', from: 'Skole', to: 'Amagerveien', via: 'Frydenlund', dir: 'toHome', legs: legs('Frydenlund'), prefer_lines: ['45'], allow_lines: ['45', '46'] },
    { id: 'amager-holbergs', name: 'Amagerveien → Skole', from: 'Amagerveien', to: 'Skole', via: 'Holbergs plass', dir: 'toSchool', legs: back(legs('Holbergs plass')), prefer_lines: ['45'], allow_lines: ['45', '46'] },
    { id: 'amager-frydenlund', name: 'Amagerveien → Skole', from: 'Amagerveien', to: 'Skole', via: 'Frydenlund', dir: 'toSchool', legs: back(legs('Frydenlund')), prefer_lines: ['45'], allow_lines: ['45', '46'] },
  ];
}
export function routesOf41(u) {
  const own = kv.get(u, 'ruter41_routes', null);
  if (Array.isArray(own)) return own;
  return isPreset41(u) ? presetRoutes() : [];
}
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
function cleanRoutes(list) {
  if (!Array.isArray(list) || list.length > 12) throw Object.assign(new Error('routes må være en liste (maks 12)'), { status: 400 });
  return list.map((r, i) => {
    if (!r || typeof r !== 'object' || !clean(r.from, 80) || !clean(r.to, 80)) throw Object.assign(new Error(`Rute ${i + 1} mangler from/to`), { status: 400 });
    const lines = (a) => (Array.isArray(a) ? a.map((x) => clean(x, 8)).filter(Boolean).slice(0, 6) : []);
    return { id: clean(r.id, 40) || `r${i + 1}`, name: clean(r.name, 80) || `${clean(r.from, 80)} → ${clean(r.to, 80)}`, from: clean(r.from, 80), to: clean(r.to, 80), via: clean(r.via, 80) || null,
      dir: ['toHome', 'toSchool'].includes(r.dir) ? r.dir : null,
      legs: (Array.isArray(r.legs) ? r.legs : []).slice(0, 8).map((l) => ({ mode: ['foot', 'tram', 'bus', 'metro', 'rail'].includes(l?.mode) ? l.mode : 'foot', from: clean(l?.from, 80), to: clean(l?.to, 80), ...(lines(l?.lines).length ? { lines: lines(l.lines) } : {}) })),
      prefer_lines: lines(r.prefer_lines), allow_lines: lines(r.allow_lines) };
  });
}
// Prompt 45: recoCount = antall anbefalte reiser på kortet «Anbefalt for min reise» (1–3, standard 2), per bruker.
export const settingsOf41 = (u) => { const s = kv.get(u, 'ruter41_settings', {}) ?? {}; return { homeCard: HOME_CARDS.includes(s.homeCard) ? s.homeCard : 'over', push: s.push === true, recoCount: [1, 2, 3].includes(s.recoCount) ? s.recoCount : 2 }; };

/* ---------------- Skolesoner ---------------- */

const zoneOut = (z) => ({ id: z.id, name: z.name, lat: z.lat, lon: z.lon, radius_m: z.radius_m, label: `${z.name} ${z.radius_m} m` });
export function zonesOf41(u) {
  let rows = q('SELECT * FROM school_zones WHERE user_id=? ORDER BY id').all(u);
  if (!rows.length && isPreset41(u) && !kv.get(u, 'ruter41_zones_seeded', false)) {
    q('INSERT INTO school_zones(user_id,name,lat,lon,radius_m,created) VALUES(?,?,?,?,?,?)').run(u, 'Skolen', PLACES41.skole.lat, PLACES41.skole.lon, 150, Date.now());
    kv.set(u, 'ruter41_zones_seeded', true);
    rows = q('SELECT * FROM school_zones WHERE user_id=? ORDER BY id').all(u);
  }
  return rows.map(zoneOut);
}

/* ---------------- «Forlot skolen» ---------------- */

const jget = (u) => kv.get(u, 'ruter41_journey', null);
export function journeyOf41(u, now = Date.now()) {
  const j = jget(u);
  const s = settingsOf41(u);
  if (!j?.leftSchoolAt) return { active: false, leftSchoolAt: null, title: null, expiresAt: null, hidden: false, homeCard: s.homeCard };
  let ended = j.endedAt ?? null, why = j.endedReason ?? null;
  if (!ended && now >= j.leftSchoolAt + JOURNEY_MS) { ended = j.leftSchoolAt + JOURNEY_MS; why = 'expired'; }
  const active = !ended;
  return { active, leftSchoolAt: iso(j.leftSchoolAt), title: `MIN REISE · FORLOT SKOLEN ${hm(j.leftSchoolAt)}`, label: `Forlot skolen ${hm(j.leftSchoolAt)}`, expiresAt: iso(j.leftSchoolAt + JOURNEY_MS),
    ...(ended ? { endedAt: iso(ended), endedReason: why } : {}), hidden: j.hiddenFor === j.leftSchoolAt, hideKey: String(j.leftSchoolAt), zoneId: j.zoneId ?? null, homeCard: s.homeCard,
    showOnHome: active && s.homeCard !== 'off' && j.hiddenFor !== j.leftSchoolAt };
}
export function leftSchool41(u, { at = null, zoneId = null, arrivedAt = null } = {}, now = Date.now()) {
  const t = at ? Date.parse(at) : now;
  if (!Number.isFinite(t) || t > now + MIN || t < now - 3 * 3600_000) throw Object.assign(new Error('at må være et tidspunkt de siste 3 timene'), { status: 400 });
  const { wd, h } = osloParts(t);
  if (['Sat', 'Sun'].includes(wd) || h < 7 || h >= 18) throw Object.assign(new Error('Teller bare på hverdager 07–18'), { status: 409, reason: 'outside_hours' });
  const arr = arrivedAt ? Date.parse(arrivedAt) : kv.get(u, 'ruter41_arrived', null);
  if (Number.isFinite(arr) && t - arr < 10 * MIN && t >= arr) throw Object.assign(new Error('Du kom for under 10 minutter siden'), { status: 409, reason: 'too_soon' });
  const zones = zonesOf41(u);
  const z = zoneId != null ? zones.find((x) => String(x.id) === String(zoneId)) : zones[0] ?? null;
  kv.set(u, 'ruter41_journey', { leftSchoolAt: t, zoneId: z?.id ?? null });
  return journeyOf41(u, now);
}
/** Hjemme (Hjemlys «Jeg er hjemme», hjemme-geofence/Wi-Fi): Min reise forsvinner. */
export function arrivedHome41(u, now = Date.now()) {
  const j = jget(u);
  if (j?.leftSchoolAt && !j.endedAt && now < j.leftSchoolAt + JOURNEY_MS) kv.set(u, 'ruter41_journey', { ...j, endedAt: now, endedReason: 'home' });
  return journeyOf41(u, now);
}

/* ---------------- Reiseforslag ---------------- */

// Holdeplassene sendes som koordinater til Entur (ingen hardkodede NSR-ID-er; Entur finner nærmeste holdeplass og linjene selv).
// Fast rutetabell for MOCK_DATA (og tester): avgangsminutt hvert N. minutt.
const MOCK_TAB = {
  holbergs: { walk: { min: 6, m: 450 }, tram: { line: '19', every: 10, off: 2, ride: 9 }, back: { walk: { min: 6, m: 450 }, tram: { line: '19', every: 10, off: 4, ride: 9 } } },
  frydenlund: { walk: { min: 4, m: 300 }, tram: { line: '11', every: 10, off: 7, ride: 7 }, back: { walk: { min: 4, m: 300 }, tram: { line: '11', every: 10, off: 1, ride: 7 } }, walkMajorstuen: { min: 17, m: 1400 } },
  bus: { '45': { every: 10, off: 5, ride: 12, backOff: 3 }, '46': { every: 15, off: 1, ride: 13, backOff: 8 } },
  transfer: 2,
};
const nextAt = (t, every, off) => { const m = Math.ceil((t - off * MIN) / (every * MIN)) * every * MIN + off * MIN; return m < t ? m + every * MIN : m; };
const leg = (mode, from, to, dep, arr, extra = {}) => ({ mode, ...(extra.line ? { line: extra.line } : {}), from, to, dep: iso(dep), arr: iso(arr), aimed: iso(extra.aimed ?? dep), expected: iso(dep),
  delayMin: extra.delayMin ?? 0, walkMin: mode === 'foot' ? Math.round((arr - dep) / MIN) : 0, meters: extra.meters ?? 0, label: legLabel(mode, extra.line, Math.round((arr - dep) / MIN)) });
const legLabel = (mode, line, min) => (mode === 'foot' ? `Gå ${min} min` : mode === 'tram' ? `Trikk ${line ?? ''} · ${min} min`.replace('  ', ' ') : `${mode === 'bus' ? 'Buss' : 'T-bane'} ${line ?? ''} · ${min} min`.trim());
/** Etappe-stripen ferdig laget i koden: «Gå 6 › Trikk 9 min › Gå 2 › 45». */
export function strip41(legs) {
  return legs.map((l) => { const m = Math.round((Date.parse(l.arr) - Date.parse(l.dep)) / MIN); return l.mode === 'foot' ? `Gå ${m}` : l.mode === 'tram' ? `Trikk ${m} min` : `${l.line ?? (l.mode === 'bus' ? 'Buss' : 'T-bane')}`; }).join(' › ');
}
function optionOf(id, via, legs, extra = {}) {
  const dep = Date.parse(legs[0].dep), arr = Date.parse(legs.at(-1).arr), minutes = Math.round((arr - dep) / MIN);
  return { id, via, legs, dep: iso(dep), arr: iso(arr), minutes, preferred: false, badges: [], strip: strip41(legs), depLabel: hm(dep), arrLabel: `→ ${hm(arr)} · ${minutes} min`, ...extra };
}
function mockToHome(now, delayFryd) {
  const opts = [];
  for (const key of ['holbergs', 'frydenlund']) {
    const T = MOCK_TAB[key], via = PLACES41[key].name;
    const t1 = now + T.walk.min * MIN;
    const aimed = nextAt(t1, T.tram.every, T.tram.off);
    const delay = key === 'frydenlund' ? delayFryd : 0;
    const dep = aimed + delay * MIN, atMaj = dep + T.tram.ride * MIN, t2 = atMaj + MOCK_TAB.transfer * MIN;
    for (const line of ['45', '46']) {
      const B = MOCK_TAB.bus[line];
      const bd = nextAt(t2, B.every, B.off), ba = bd + B.ride * MIN;
      const legs = [leg('foot', 'Skole', via, now, t1, { meters: T.walk.m }), leg('tram', via, 'Majorstuen', dep, atMaj, { line: T.tram.line, aimed, delayMin: delay }), leg('foot', 'Majorstuen', 'Majorstuen', atMaj, t2, { meters: 150 }), leg('bus', 'Majorstuen', 'Amagerveien', bd, ba, { line })];
      opts.push(optionOf(`${key}-${line}`, via, legs, delay ? { delayMin: delay } : {}));
    }
  }
  return opts;
}
function mockToSchool(now) {
  const opts = [];
  for (const line of ['45', '46']) {
    const B = MOCK_TAB.bus[line];
    const bd = nextAt(now + 3 * MIN, B.every, B.backOff), atMaj = bd + B.ride * MIN, t2 = atMaj + MOCK_TAB.transfer * MIN;
    for (const key of ['holbergs', 'frydenlund']) {
      const T = MOCK_TAB[key].back, via = PLACES41[key].name;
      const td = nextAt(t2, T.tram.every, T.tram.off), ta = td + T.tram.ride * MIN, end = ta + T.walk.min * MIN;
      const legs = [leg('foot', 'Amagerveien', 'Amagerveien', now, bd, { meters: 200 }), leg('bus', 'Amagerveien', 'Majorstuen', bd, atMaj, { line }), leg('foot', 'Majorstuen', 'Majorstuen', atMaj, t2, { meters: 150 }), leg('tram', 'Majorstuen', via, td, ta, { line: T.tram.line }), leg('foot', via, 'Skole', ta, end, { meters: T.walk.m })];
      legs[0] = leg('foot', 'Amagerveien', 'Amagerveien', bd - 3 * MIN, bd, { meters: 200 });
      opts.push(optionOf(`${line}-${key}`, via, legs));
    }
  }
  return opts;
}
const busLine = (o) => o.legs.find((l) => l.mode === 'bus')?.line ?? null;
/** Sortering og merker: tidligste ankomst, men 45 først hvis maks 3 min senere enn raskeste 46; 46 bare når den gir tidligere ankomst. */
export function rank41(opts) {
  const best = new Map();
  for (const o of opts) { const k = `${o.via}|${busLine(o)}`; if (!best.has(k) || Date.parse(o.arr) < Date.parse(best.get(k).arr)) best.set(k, o); }
  let list = [...best.values()];
  const b45 = list.filter((o) => busLine(o) === '45').sort((a, b) => Date.parse(a.arr) - Date.parse(b.arr));
  const first45 = b45[0] ? Date.parse(b45[0].arr) : Infinity;
  list = list.filter((o) => busLine(o) !== '46' || Date.parse(o.arr) < first45); // 46 bare når den kommer tidligere fram enn neste 45
  list.sort((a, b) => Date.parse(a.arr) - Date.parse(b.arr) || a.minutes - b.minutes);
  const fastest46 = list.filter((o) => busLine(o) === '46').map((o) => Date.parse(o.arr)).sort((a, b) => a - b)[0] ?? Infinity;
  if (b45[0] && Date.parse(b45[0].arr) - fastest46 <= 3 * MIN) { list = [b45[0], ...list.filter((o) => o !== b45[0])]; }
  for (const o of list) {
    o.badges = [];
    const tram = o.legs.find((l) => l.mode === 'tram');
    if (tram?.delayMin >= 3) o.badges.push(`Trikk +${tram.delayMin} min`);
  }
  const pref = list.find((o) => busLine(o) === '45');
  if (pref && list[0] === pref) { pref.preferred = true; pref.badges.unshift('Foretrukket'); }
  return list.slice(0, 4);
}
/** Forsinket trikk fra Frydenlund (≥ 3 min, eller 45 rekkes ikke): gå til Majorstuen i stedet når det gir tidligere ankomst eller rekker 45. */
export function walkAlert41(opts, { now = Date.now(), walk = MOCK_TAB.frydenlund.walkMajorstuen, next45 = null } = {}) {
  const fr = opts.filter((o) => o.via === 'Frydenlund');
  const tram = fr[0]?.legs.find((l) => l.mode === 'tram');
  if (!tram || tram.delayMin < 3) return null;
  const atFryd = Date.parse(fr[0].legs[0].arr);
  const atMaj = atFryd + walk.min * MIN;
  const bus45 = next45 ? next45(atMaj) : nextAt(atMaj, MOCK_TAB.bus['45'].every, MOCK_TAB.bus['45'].off);
  const homeWalk = bus45 + MOCK_TAB.bus['45'].ride * MIN;
  const withTram = fr.slice().sort((a, b) => Date.parse(a.arr) - Date.parse(b.arr))[0];
  const tramHome = Date.parse(withTram.arr), tramLine = busLine(withTram);
  const catches = `45 ${hm(bus45)}`;
  if (!(homeWalk < tramHome || (tramLine !== '45' && homeWalk <= tramHome))) return null;
  const km = Math.round(walk.m / 100) / 10;
  return { text: `Trikken fra Frydenlund er ${tram.delayMin} min forsinket`,
    body: `Går du fra Frydenlund til Majorstuen i stedet tar det ${walk.min} min (${kmText(walk.m)}), og du rekker 45 kl. ${hm(bus45)}.${tramLine !== '45' ? ` Med trikken mister du 45 og er hjemme ${hm(tramHome)} med ${tramLine}.` : ` Med trikken er du hjemme ${hm(tramHome)}.`}`,
    short: `Gå til Majorstuen (${walk.min} min) og rekk 45 kl. ${hm(bus45)}.`, walk: { minutes: walk.min, km, meters: walk.m, catches }, homeAt: iso(homeWalk), homeLabel: `→ hjemme ${hm(homeWalk)}`,
    strip: `Gå ${walk.min} min › 45`, missed: tramLine !== '45' ? `45 kl. ${hm(nextAt(Date.parse(tram.arr) - tram.delayMin * MIN + MOCK_TAB.transfer * MIN, MOCK_TAB.bus['45'].every, MOCK_TAB.bus['45'].off))} er gått` : null };
}

/* ---------------- Entur (ekte data) ---------------- */

let F = (u, i) => fetch(u, i);
/** Bare for tester. */
export const _setRuter41Fetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };
const JP = 'https://api.entur.io/journey-planner/v3/graphql';
async function gql(query, variables) {
  const r = await F(JP, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ENTUR_CLIENT41() }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Entur svarte ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(`Entur: ${d.errors[0].message}`);
  return d.data;
}
const TRIP = `query($from:Location!,$to:Location!,$n:Int!,$dt:DateTime,$foot:Boolean!){
  trip(from:$from,to:$to,numTripPatterns:$n,dateTime:$dt,modes:{accessMode:foot,egressMode:foot,directMode:foot,transportModes:[{transportMode:tram},{transportMode:bus},{transportMode:metro}]}) @skip(if:$foot){
    tripPatterns{ expectedStartTime expectedEndTime legs{ mode distance aimedStartTime expectedStartTime expectedEndTime fromPlace{name} toPlace{name} line{publicCode} } } }
  walk: trip(from:$from,to:$to,numTripPatterns:1,modes:{directMode:foot,transportModes:[]}) @include(if:$foot){ tripPatterns{ duration walkDistance } }
}`;
const loc = (p) => (p.nsr ? { place: p.nsr, name: p.name } : { coordinates: { latitude: p.lat, longitude: p.lon }, name: p.name });
const enturLeg = (l) => leg(l.mode === 'foot' ? 'foot' : l.mode, l.fromPlace?.name ?? '', l.toPlace?.name ?? '', Date.parse(l.expectedStartTime), Date.parse(l.expectedEndTime),
  { line: l.line?.publicCode, aimed: Date.parse(l.aimedStartTime), delayMin: Math.max(0, Math.round((Date.parse(l.expectedStartTime) - Date.parse(l.aimedStartTime)) / MIN)), meters: Math.round(l.distance ?? 0) });
async function enturWalk(a, b) {
  const d = await gql(TRIP, { from: loc(a), to: loc(b), n: 1, foot: true });
  const p = d.walk?.tripPatterns?.[0];
  return p ? { min: Math.max(1, Math.round(p.duration / 60)), m: Math.round(p.walkDistance ?? 0) } : null;
}
async function enturOptions(dir, school, now) {
  const opts = [];
  for (const key of ['holbergs', 'frydenlund']) {
    const via = PLACES41[key];
    const [from, to] = dir === 'toHome' ? [via, PLACES41.amagerveien] : [PLACES41.amagerveien, via];
    const walk = dir === 'toHome' ? await enturWalk(school, via) : null;
    const d = await gql(TRIP, { from: loc(from), to: loc(to), n: 6, dt: iso(now + (walk?.min ?? 0) * MIN), foot: false });
    for (const p of d.trip?.tripPatterns ?? []) {
      const legs = p.legs.map(enturLeg);
      const bus = legs.find((l) => l.mode === 'bus' && ['45', '46'].includes(l.line));
      if (!bus || !legs.some((l) => l.mode === 'tram')) continue;
      if (walk) legs.unshift(leg('foot', 'Skole', via.name, Date.parse(legs[0].dep) - walk.min * MIN, Date.parse(legs[0].dep), { meters: walk.m }));
      else { const back = await enturWalk(via, school).catch(() => null); if (back) legs.push(leg('foot', via.name, 'Skole', Date.parse(legs.at(-1).arr), Date.parse(legs.at(-1).arr) + back.min * MIN, { meters: back.m })); }
      opts.push(optionOf(`${key}-${bus.line}-${opts.length}`, via.name, legs));
    }
  }
  return opts;
}

/** Hovedfunksjonen bak GET /api/ruter/my-trip. */
export async function myTrip41(u, { dir = 'auto', delay = null, now = Date.now() } = {}) {
  const j = journeyOf41(u, now);
  const d = dir === 'toHome' || dir === 'toSchool' ? dir : j.active ? 'toHome' : osloParts(now).h < 12 ? 'toSchool' : 'toHome';
  const routes = routesOf41(u);
  const s = settingsOf41(u);
  const base = { dir: d, from: d === 'toHome' ? 'Skole' : 'Amagerveien', to: d === 'toHome' ? 'Amagerveien' : 'Skole', label: d === 'toHome' ? 'Skole → Amagerveien' : 'Amagerveien → Skole', homeCard: s.homeCard, recoCount: s.recoCount, updatedAt: iso(now) };
  if (!routes.length) return { ...base, options: [], empty: true, text: 'Legg inn egne ruter under Innstillinger → Ruter → Mine ruter.' };
  const zone = zonesOf41(u)[0];
  const school = zone ? { name: zone.name, lat: zone.lat, lon: zone.lon } : PLACES41.skole;
  let opts, source = 'Entur', alert = null;
  if (MOCK()) {
    const sim = Number.isFinite(+delay) && delay !== null ? Math.max(0, Math.min(60, Math.round(+delay))) : +(kv.get(u, 'ruter41_sim_delay', 0) || 0);
    opts = d === 'toHome' ? mockToHome(now, sim) : mockToSchool(now);
    source = 'Mock';
    const ranked = rank41(opts);
    if (d === 'toHome') alert = walkAlert41(opts, { now });
    return { ...base, options: ranked, ...(alert ? { alert } : {}), source };
  }
  try {
    opts = await enturOptions(d, school, now);
    const ranked = rank41(opts);
    if (d === 'toHome') {
      const w = await enturWalk(PLACES41.frydenlund, PLACES41.majorstuen).catch(() => null);
      const buses = opts.flatMap((o) => o.legs.filter((l) => l.mode === 'bus' && l.line === '45').map((l) => Date.parse(l.dep))).sort((a, b) => a - b);
      if (w) alert = walkAlert41(opts, { now, walk: w, next45: (t) => buses.find((x) => x >= t) ?? Infinity });
      if (alert && !Number.isFinite(Date.parse(alert.homeAt))) alert = null;
    }
    return { ...base, options: ranked, ...(alert ? { alert } : {}), source };
  } catch (e) {
    return { ...base, options: [], error: `Fikk ikke hentet reiseforslag fra Entur: ${e.message}`, source };
  }
}

/* ---------------- Rutene ---------------- */

export const ruter41Api = new Hono();
ruter41Api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const fail = (c, e) => c.json({ error: e.message, ...(e.reason ? { reason: e.reason } : {}) }, e.status ?? 400);

ruter41Api.get('/my-routes', (c) => { const u = c.get('user'); return c.json({ routes: routesOf41(u), homeCard: settingsOf41(u).homeCard, preset: isPreset41(u) && !Array.isArray(kv.get(u, 'ruter41_routes', null)) }); });
ruter41Api.put('/my-routes', async (c) => {
  const u = c.get('user'), b = await body(c);
  try { if (b.routes === null) kv.del(u, 'ruter41_routes'); else kv.set(u, 'ruter41_routes', cleanRoutes(b.routes)); } catch (e) { return fail(c, e); }
  return c.json({ routes: routesOf41(u), homeCard: settingsOf41(u).homeCard, preset: false });
});
ruter41Api.get('/my-trip', async (c) => {
  const dir = c.req.query('dir') ?? 'auto';
  if (!['auto', 'toHome', 'toSchool'].includes(dir)) return c.json({ error: 'dir må være auto, toHome eller toSchool' }, 400);
  const r = await myTrip41(c.get('user'), { dir, delay: MOCK() ? c.req.query('delay') ?? null : null });
  // Prompt 45: recommended = nøyaktig de N første (færre hvis det ikke finnes flere, ingen plassholdere).
  return c.json({ ...r, recommended: (r.options ?? []).slice(0, r.recoCount ?? 2) }, 200, { 'Cache-Control': 'no-store' });
});
ruter41Api.get('/school-zones', (c) => c.json({ zones: zonesOf41(c.get('user')) }));
ruter41Api.post('/school-zones', async (c) => {
  const u = c.get('user'), b = await body(c);
  const name = clean(b.name, 40), lat = +b.lat, lon = +b.lon, r = Math.round(+(b.radius_m ?? b.radius));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ error: 'Forventet {name, lat, lon, radius_m}' }, 400);
  if (!(r >= 50 && r <= 300)) return c.json({ error: 'Radius må være 50–300 m' }, 400);
  if (zonesOf41(u).length >= 20) return c.json({ error: 'Maks 20 skolesoner' }, 409);
  q('INSERT INTO school_zones(user_id,name,lat,lon,radius_m,created) VALUES(?,?,?,?,?,?)').run(u, name, lat, lon, r, Date.now());
  return c.json({ zones: zonesOf41(u) }, 201);
});
ruter41Api.delete('/school-zones/:id{[0-9]+}', (c) => {
  const u = c.get('user'), zones = zonesOf41(u), id = +c.req.param('id');
  if (!zones.some((z) => z.id === id)) return c.json({ error: 'Fant ikke sonen' }, 404);
  if (zones.length <= 1) return c.json({ error: 'Den siste skolesonen kan ikke slettes' }, 409);
  q('DELETE FROM school_zones WHERE id=? AND user_id=?').run(id, u);
  return c.json({ zones: zonesOf41(u) });
});
ruter41Api.post('/left-school', async (c) => { try { const b = await body(c); return c.json({ journey: leftSchool41(c.get('user'), b) }); } catch (e) { return fail(c, e); } });
ruter41Api.post('/arrived-school', async (c) => {
  const b = await body(c), t = b.at ? Date.parse(b.at) : Date.now();
  if (!Number.isFinite(t)) return c.json({ error: 'Ugyldig at' }, 400);
  kv.set(c.get('user'), 'ruter41_arrived', t);
  return c.json({ ok: true, arrivedAt: iso(t) });
});
ruter41Api.get('/journey', async (c) => {
  const u = c.get('user'), j = journeyOf41(u);
  return c.json({ journey: j.active ? { ...j, trip: await myTrip41(u, { dir: 'toHome' }) } : j }, 200, { 'Cache-Control': 'no-store' });
});
ruter41Api.post('/journey/home', (c) => c.json({ journey: arrivedHome41(c.get('user')) }));
ruter41Api.post('/journey/hide', (c) => { const u = c.get('user'), j = jget(u); if (j?.leftSchoolAt) kv.set(u, 'ruter41_journey', { ...j, hiddenFor: j.leftSchoolAt }); return c.json({ journey: journeyOf41(u), toast: 'Min reise skjult til neste gang du forlater skolen' }); });
ruter41Api.delete('/journey/hide', (c) => { const u = c.get('user'), j = jget(u); if (j?.leftSchoolAt) kv.set(u, 'ruter41_journey', { ...j, hiddenFor: null }); return c.json({ journey: journeyOf41(u) }); });
ruter41Api.get('/settings', (c) => c.json(settingsOf41(c.get('user'))));
ruter41Api.put('/settings', async (c) => {
  const u = c.get('user'), b = await body(c), cur = settingsOf41(u);
  if ('homeCard' in b && !HOME_CARDS.includes(b.homeCard)) return c.json({ error: 'homeCard må være over, instead eller off' }, 400);
  if ('push' in b && typeof b.push !== 'boolean') return c.json({ error: 'push må være true eller false' }, 400);
  if ('recoCount' in b && ![1, 2, 3].includes(b.recoCount)) return c.json({ error: 'recoCount må være 1, 2 eller 3' }, 400);
  kv.set(u, 'ruter41_settings', { ...cur, ...('homeCard' in b ? { homeCard: b.homeCard } : {}), ...('push' in b ? { push: b.push } : {}), ...('recoCount' in b ? { recoCount: b.recoCount } : {}) });
  return c.json(settingsOf41(u));
});
