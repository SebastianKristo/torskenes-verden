// Prompt 37 (SERVER37): Kalender – fagfarger, prøveperiode ≠ skoleprøve, adresse + kart på hendelser Glimt legger til.
//
// Hendelser (alle kilder, via addEventDecorator i calendar.js) får:
//   kind:'trial' (prøveperioder fra Abonnementer, source 'trials') | 'eksamen' | 'prove' (skoleprøver) | 'frist'
//   subjectKey:'MEK1300'|'Fysikk', subjectColor:'#2f7a4f', subjectTextColor, subjectLightColor  (Studie-hendelser: timeplan, prøver, frister)
//     Nøkkel: emnekode i tittelen (/[A-ZÆØÅ]{2,5}\s?\d{3,4}/, «TRE 1400» → TRE1400), ellers første ord etter
//     «Frist: / Prøve · / Prøve i / Eksamen / Forelesning / Øving / Lab / Seminar», ellers faget calendar.js fant.
//     Farge: brukerens valg i /api/me/layout {subjectColors:{key:'#hex'}} (appene synker dette), ellers fast tildelt fra paletten
//     (8 farger, nye fag får neste ledige, lagret i study_subject_colors per bruker så den aldri endrer seg).
//   address, map:{lat, lon, url, appleUrl, googleUrl, label} når hendelsen har et geokodet sted (Glimt-lagte hendelser geokodes
//     når de lages; andre kan slå opp med GET /api/kalender/geo?q=).
// GET  /api/kalender/subjects → {subjects:[{key, color, textColor, lightColor, own}], palette:[{c, tx, lt}]}
// PUT  /api/kalender/subjects/:key {color|null} → lagrer i layout.subjectColors (samme felt som appene)
// GET  /api/kalender/geo?q=Hoffsveien 4 → {found, address, label, lat, lon, map} (cache permanent, bom prøves igjen etter 1 t)
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { authOrToken, layoutOf } from './mobile.js';
import { addEventDecorator } from './calendar.js';
import { NOMINATIM_UA } from './family.js';

const MOCK = process.env.MOCK_DATA === '1';
const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS study_subject_colors (user_id TEXT NOT NULL, key TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS geo37_cache (q TEXT PRIMARY KEY, result TEXT, fail INTEGER, ts INTEGER NOT NULL);`);

/* ---------------- Fagfarger ---------------- */

export const FAGP = [
  { c: '#2f7a4f', tx: '#235c3b', lt: '#8fd4a8' }, { c: '#2b5d8a', tx: '#1f4466', lt: '#8fb8e0' }, { c: '#a8661a', tx: '#7d4c13', lt: '#e8b878' },
  { c: '#8a3fa0', tx: '#672f78', lt: '#d3a2e3' }, { c: '#3d7f8a', tx: '#2d5f67', lt: '#97ccd4' }, { c: '#c2477a', tx: '#91355b', lt: '#eba3c1' },
  { c: '#5b4fc4', tx: '#433a93', lt: '#aea6ec' }, { c: '#7a8a2a', tx: '#5b671f', lt: '#c6d47e' },
];
const CODE = /\b([A-ZÆØÅ]{2,5})\s?(\d{3,4})\b/;
const PREFIX = /^\s*(?:frist\s*:?|prøve\s*(?:·|i|:|-)?|eksamen\s*(?:·|i|:|-)?|forelesning\s*(?:·|i|:|-)?|øving\s*(?:·|i|:|-)?|lab\s*(?:·|i|:|-)?|seminar\s*(?:·|i|:|-)?|innlevering\s*(?:·|i|:|-)?|heldagsprøve\s*(?:·|i|:|-)?)\s*/i;
/** Fag-nøkkelen for en tittel, eller null. */
export function fagKey(title, subject = null) {
  const t = String(title ?? '');
  const m = t.match(CODE);
  if (m) return `${m[1]}${m[2]}`;
  if (PREFIX.test(t)) { const w = t.replace(PREFIX, '').match(/^[\p{L}][\p{L}\d-]*/u)?.[0]; if (w) return w[0].toUpperCase() + w.slice(1); }
  if (subject) return String(subject).trim().split(/\s+/)[0].slice(0, 40) || null;
  return null;
}
const isStudy = (e) => e.appCalendar === 'studie' || e.appCalendar === 'skole' || ['timeplan', 'prover', 'skole'].includes(e.calendar) || ['time', 'prove', 'innl'].includes(e.type);
/** Fast farge for faget hos brukeren (layout.subjectColors overstyrer). */
export function subjectColor(user, key) {
  const own = layoutOf(user)?.subjectColors?.[key];
  if (own) { const p = FAGP.find((x) => x.c.toLowerCase() === own.toLowerCase()); return { c: own, tx: p?.tx ?? own, lt: p?.lt ?? own, own: true }; }
  let r = q('SELECT color FROM study_subject_colors WHERE user_id=? AND key=?').get(user, key);
  if (!r) {
    const used = q('SELECT color FROM study_subject_colors WHERE user_id=?').pluck().all(user);
    const free = FAGP.find((p) => !used.includes(p.c)) ?? FAGP[used.length % FAGP.length];
    q('INSERT OR IGNORE INTO study_subject_colors(user_id, key, color, created) VALUES(?,?,?,?)').run(user, key, free.c, Date.now());
    r = q('SELECT color FROM study_subject_colors WHERE user_id=? AND key=?').get(user, key);
  }
  const p = FAGP.find((x) => x.c === r.color) ?? FAGP[0];
  return { ...p, own: false };
}

/* ---------------- Adresse og kart ---------------- */

const geoMap = (user) => kv.get(user, 'kal37_geo', {}) ?? {};
const baseId = (id) => String(id ?? '').split('~')[0];
export const mapOf = (g) => (g ? { lat: g.lat, lon: g.lon, label: g.label ?? g.address, url: `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=16/${g.lat}/${g.lon}`,
  appleUrl: `https://maps.apple.com/?ll=${g.lat},${g.lon}&q=${encodeURIComponent(g.label ?? g.address ?? '')}`, googleUrl: `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lon}` } : null);
// Eksempelsteder for MOCK_DATA=1 (ingen nett): kjente steder i Oslo.
const MOCK_GEO = [
  [/hoffsveien\s*4/i, { address: 'Hoffsveien 4, 0275 Oslo', label: 'Hoffsveien 4, Sofienlund', lat: 59.9296, lon: 10.6777 }],
  [/majorstuen legesenter|majorstuen lege/i, { address: 'Kirkeveien 64B, 0364 Oslo', label: 'Kirkeveien 64B, Majorstuen', lat: 59.9307, lon: 10.7146 }],
  [/frisør nina|nina frisør/i, { address: 'Thorvald Meyers gate 40, 0555 Oslo', label: 'Thorvald Meyers gate 40, Grünerløkka', lat: 59.9236, lon: 10.7592 }],
  [/tannlege/i, { address: 'Bogstadveien 27, 0355 Oslo', label: 'Bogstadveien 27, Majorstuen', lat: 59.9268, lon: 10.7224 }],
  [/oslomet|pilestredet/i, { address: 'Pilestredet 46, 0167 Oslo', label: 'Pilestredet 46, St. Hanshaugen', lat: 59.9213, lon: 10.7340 }],
  [/hafjell/i, { address: 'Hafjell, 2636 Øyer', label: 'Hafjell, Øyer', lat: 61.2340, lon: 10.4400 }],
  [/grünerløkka|grunerlokka/i, { address: 'Grünerløkka, Oslo', label: 'Grünerløkka, Oslo', lat: 59.9230, lon: 10.7590 }],
  [/majorstuen/i, { address: 'Majorstuen, Oslo', label: 'Majorstuen, Oslo', lat: 59.9290, lon: 10.7150 }],
  [/bislett/i, { address: 'Bislett, Oslo', label: 'Bislett, Oslo', lat: 59.9250, lon: 10.7330 }],
];
// Gateadresse med postnummer i innlimt SMS/e-post («Thorvald Meyers gate 40, 0555 Oslo»).
const ADDR = /([A-ZÆØÅ][\p{L}.' -]{2,40}?\s\d{1,4}[A-Za-z]?(?:,\s*|\s+)\d{4}\s+[A-ZÆØÅ][\p{L}-]+)/u;
export const addressIn = (text) => String(text ?? '').match(ADDR)?.[1]?.trim() ?? null;
// «hos Frisør Nina fredag kl 14», «på Majorstuen legesenter i morgen» → stedet (uten dag og tid).
const PLACE_IN = /\b(?:hos|på|ved)\s+(.+?)(?=\s+(?:i dag|i morgen|i kveld|overmorgen|neste|på (?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|kl\.?|klokka|om \d|\d{1,2}[.:/]\d)\b|\s*[,.;!?]|\s*$)/i;
export const placeIn = (text) => { const m = String(text ?? '').match(PLACE_IN); const p = m?.[1]?.trim(); return p && p.length >= 3 && !/^(skolen|jobb|jobben|hytta)$/i.test(p) ? p : null; };
let geoImpl = null;
/** Bare for tester: (q) → {address, label, lat, lon} | null */
export const _setGeo37 = (fn) => { geoImpl = fn; };
let lastCall = 0;
async function nominatim(query) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=no&accept-language=nb&q=${encodeURIComponent(query)}`;
  const r = await fetch(u, { headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const x = (await r.json())?.[0];
  if (!x) return null;
  const a = x.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const area = a.suburb ?? a.city_district ?? a.quarter ?? a.neighbourhood ?? a.city ?? a.town ?? a.village ?? '';
  const label = street ? `${street}${area ? `, ${area}` : ''}` : x.name ? `${x.name}${area ? `, ${area}` : ''}` : String(x.display_name).split(',').slice(0, 2).join(',');
  const address = [street || x.name, [a.postcode, a.city ?? a.town ?? a.village].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { address: address || x.display_name, label, lat: +(+x.lat).toFixed(6), lon: +(+x.lon).toFixed(6) };
}
/** Geokoder et sted (cache i databasen; bom prøves igjen etter 1 t). → {address, label, lat, lon} | null */
export async function geocode(place, { city = 'Oslo' } = {}) {
  const p = String(place ?? '').trim().slice(0, 200);
  if (p.length < 3) return null;
  if (geoImpl) return geoImpl(p);
  if (MOCK) return MOCK_GEO.find(([re]) => re.test(p))?.[1] ?? null;
  const key = p.toLowerCase();
  const hit = q('SELECT * FROM geo37_cache WHERE q=?').get(key);
  if (hit?.result) return JSON.parse(hit.result);
  if (hit?.fail && Date.now() - hit.fail < 3_600_000) return null;
  const tries = [p, `${p}, ${city}`, p.includes(',') ? `${p.split(',').slice(1).join(',').trim()}, ${city}` : null, p.split(/\s+/).length > 2 ? p.split(/\s+/).slice(1).join(' ') : null].filter(Boolean);
  for (const t of tries) {
    try { const r = await nominatim(t); if (r) { q('INSERT OR REPLACE INTO geo37_cache(q, result, fail, ts) VALUES(?,?,NULL,?)').run(key, JSON.stringify(r), Date.now()); return r; } }
    catch (e) { console.warn('[kalender] geokoding:', e.message); break; }
  }
  q('INSERT OR REPLACE INTO geo37_cache(q, result, fail, ts) VALUES(?,NULL,?,?)').run(key, Date.now(), Date.now());
  return null;
}
/** Glimt la til hendelsen: finn adressen (fra teksten eller stedet), lagre den og legg address/map på ev. Maks ~2,5 s. */
export async function attachGeo(user, ev, { place = null, text = '' } = {}) {
  if (!ev?.id) return ev;
  const want = addressIn(text) ?? (place || null) ?? (ev.room || ev.location || null) ?? placeIn(text) ?? placeIn(ev.title);
  if (!want) return ev;
  let g = null;
  try { g = await Promise.race([geocode(want), new Promise((r) => setTimeout(() => r(null), 2500))]); } catch { g = null; }
  if (!g) return ev;
  const m = geoMap(user);
  m[baseId(ev.id)] = { ...g, at: Date.now() };
  const keys = Object.keys(m);
  if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete m[k];
  kv.set(user, 'kal37_geo', m);
  ev.address = g.address; ev.map = mapOf(g);
  return ev;
}

/* ---------------- Dekoratøren ---------------- */

addEventDecorator((user, events) => {
  const geo = geoMap(user);
  for (const e of events) {
    if (e.source === 'trials') e.kind = 'trial';
    else if (e.type === 'prove') e.kind = /eksamen/i.test(e.title) ? 'eksamen' : 'prove';
    else if (e.type === 'innl') e.kind = 'frist';
    if (isStudy(e) && e.source !== 'trials') {
      const k = fagKey(e.title, e.subject);
      if (k) { const p = subjectColor(user, k); e.subjectKey = k; e.subjectColor = p.c; e.subjectTextColor = p.tx; e.subjectLightColor = p.lt; }
    }
    const g = geo[baseId(e.id)];
    if (g && !e.map) { e.address = g.address; e.map = mapOf(g); }
  }
});

/* ---------------- Skoleprøve eller prøveperiode (felles intensjon) ---------------- */

const TEST_W = /\b(prøve|prøva|prøven|prøver|eksamen|eksamenen|test(en)?|quiz|midtveis|tentamen|heldagsprøve)\b/i;
const TRIAL_W = /prøveperiode|prøvetid|gratisperiode|\babonnement|\btrial\b|gratis i \d+|-prøven\b/i;
const SCHOOL_W = /\b(skole|skolen|universitet(et)?|uni|uio|ntnu|oslomet|høgskole(n)?|studie(t|ne)?|klassen|fag(et)?|timeplan(en)?)\b/i;
/** → {schoolTest, trial, schoolContext} */
export function parseIntent37(text) {
  const t = String(text ?? '');
  const trial = TRIAL_W.test(t);
  return { trial, schoolTest: !trial && TEST_W.test(t), schoolContext: SCHOOL_W.test(t) };
}
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const hm = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(':', ':');
const dayTxt = (d) => `${WD[new Date(d + 'T00:00:00Z').getUTCDay()]} ${+d.slice(8)}. ${MON[+d.slice(5, 7) - 1]}`;
const diff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
const isTrialEv = (e) => e.source === 'trials' || e.kind === 'trial' || /-prøven slutter/i.test(e.title);
/** Skoleprøver/eksamener (aldri prøveperioder) fra Studie. events = brukerens hendelser fremover. */
export function schoolTests(events, today, now = Date.now()) {
  return events.filter((e) => !isTrialEv(e))
    .filter((e) => e.type === 'prove' || e.kind === 'prove' || e.kind === 'eksamen' || (isStudy(e) && /prøve|eksamen|\btest\b|quiz|midtveis|tentamen/i.test(e.title)))
    .filter((e) => (e.allDay ? e.date >= today : Date.parse(e.end ?? e.start) > now))
    .sort((a, b) => (a.allDay ? Date.parse(a.date) : Date.parse(a.start)) - (b.allDay ? Date.parse(b.date) : Date.parse(b.start)));
}
/** Svaret på «neste prøve på skolen». → {text, events[]} */
export function schoolTestAnswer(events, today, now = Date.now()) {
  const L = schoolTests(events, today, now).slice(0, 3);
  if (!L.length) {
    const fr = events.filter((e) => !isTrialEv(e) && (e.type === 'innl' || e.kind === 'frist') && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    return { text: `Jeg finner ingen prøver eller eksamener i Studie-kalenderen.${fr ? ` Neste frist er **${fr.title.replace(/^Frist:\s*/i, '')}** ${dayTxt(fr.date)}.` : ''}`, events: fr ? [fr] : [] };
  }
  const e = L[0], n = diff(today, e.date);
  const name = /^(prøve|eksamen)/i.test(e.title) ? e.title.replace(/\s*·\s*/, ' i ').replace(/^./, (c) => c.toLowerCase()) : `${e.title}`;
  const when = `${dayTxt(e.date)}${e.allDay ? '' : ` kl. ${hm(e.start)}`}`;
  const rest = L.slice(1).map((x) => `${x.title} ${dayTxt(x.date)}`).join(', ');
  return { text: `Neste prøve på skolen er **${name} ${when}**${e.room ? `, ${e.room}` : ''}. ${n === 0 ? 'Det er i dag.' : n === 1 ? 'Det er i morgen.' : `Det er om ${n} dager.`}${rest ? ` Etter det: ${rest}.` : ''}`, events: L };
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('/subjects', authOrToken);
api.use('/subjects/*', authOrToken);
api.use('/geo', authOrToken);
api.get('/subjects', (c) => {
  const u = c.get('user');
  const keys = [...new Set([...q('SELECT key FROM study_subject_colors WHERE user_id=? ORDER BY created').pluck().all(u), ...Object.keys(layoutOf(u)?.subjectColors ?? {})])];
  return c.json({ subjects: keys.map((k) => { const p = subjectColor(u, k); return { key: k, color: p.c, textColor: p.tx, lightColor: p.lt, own: p.own }; }), palette: FAGP });
});
api.put('/subjects/:key', async (c) => {
  const u = c.get('user'), key = decodeURIComponent(c.req.param('key')).slice(0, 40);
  const b = await c.req.json().catch(() => ({}));
  if (b.color !== null && !/^#[0-9a-f]{6}$/i.test(String(b.color ?? ''))) return c.json({ error: 'color må være #rrggbb eller null' }, 400);
  const l = { ...(layoutOf(u) ?? {}) };
  const sc = { ...(l.subjectColors ?? {}) };
  if (b.color === null) delete sc[key]; else sc[key] = b.color.toLowerCase();
  if (Object.keys(sc).length > 60) return c.json({ error: 'Maks 60 fag' }, 400);
  kv.set(u, 'layout', { ...l, subjectColors: sc });
  const p = subjectColor(u, key);
  return c.json({ key, color: p.c, textColor: p.tx, lightColor: p.lt, own: p.own });
});
api.get('/geo', async (c) => {
  const g = await geocode(c.req.query('q') ?? '');
  return c.json(g ? { found: true, ...g, map: mapOf(g) } : { found: false });
});
export default api;
