// Prompt 33 (SERVER33): server for Kalender-appen (iOS/Android) – samme konto og API som Homelab-appene.
// Alt er per bruker. Sesjon eller app-token (authOrToken: GET krever finance:read, endringer finance:write) med mindre annet står.
//
// ── Kalendere (visningen i appen) ─────────────────────────────────────────────────────────────────────────────────────
// GET    /api/kalender/calendars
//   → {calendars:[{id, key, name, color, textColor, lightColor, visible, builtin, writable:true, backend:'privat'|'familie',
//                  sources:['privat','trials',…], count}], defaultCalendar:'personlig', prefs:{…}, sources:[gamle CALENDARS]}
//   Innebygde (rekkefølge og farger fra fasiten CALS): personlig(p, #b23a2a) · jobb(j, #2b5d8a) · studie(s, #2f7a4f) ·
//   familie(f, #a8661a) · helse(h, #3d7f8a) · bursdager(b, #8a3fa0). Egne: id 'c-<10 hex>' (maks 20).
//   count = antall hendelser de neste 30 dagene (i dag + 29) i kalenderen.
//   Mapping fra eksisterende kilder: timeplan/prover/skole (skolens iCal og Canvas) → studie · familie (Google Familie) → familie ·
//   bursdager → bursdager · privat (Google/lokal) og prøveperioder → personlig, men gjettes fra tittelen for egne hendelser
//   (lege/tannlege/trening… → helse, møte/jobb/vakt… → jobb, frist/eksamen/forelesning… → studie, mormor/hytta… → familie,
//   bursdag → bursdager). Brukerens eget valg per hendelse (appCalendar) vinner alltid.
// POST   /api/kalender/calendars {name, color:'#rrggbb', visible?} → 201 {calendar}
// PATCH  /api/kalender/calendars/:id {name?, color?, visible?} → {calendar}   (innebygde: farge, navn og synlighet)
// DELETE /api/kalender/calendars/:id → {ok}  (bare egne; 403 for innebygde). Hendelsene slettes IKKE, de får standardkalenderen.
// PUT    /api/kalender/calendars/prefs {defaultCalendar?, defaultReminder?:'none'|'10m'|'30m'|'1h'|'1d', weekNumbers?:bool,
//                                      weather?:bool, theme?:'system'|'light'|'dark'} → {prefs}
//
// ── Hendelser ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Alle hendelser fra /api/kalender, /search, /events, /api/assist, widgets osv. har nå også
//   appCalendar:'personlig'|'jobb'|'studie'|'familie'|'helse'|'bursdager'|'c-…'  og  appColor:'#rrggbb'.
// POST  /api/kalender/events {…som før, appCalendar?}  → appCalendar velger lagring (familie → Familie, ellers Privat) og huskes.
// PATCH /api/kalender/events/:id {appCalendar}         → bare flytting i appen (ingen skriving til Google), også skolens hendelser.
// PATCH /api/kalender/events/:id {…felt, appCalendar?} → vanlig endring + flytting.
// Endringer sendes i sanntid på /api/ws: «kalender» {action:'created'|'updated'|'deleted'|'calendars', id?}.
//
// ── Vær ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/kalender/weather?from=YYYY-MM-DD&to=YYYY-MM-DD (standard i dag + 15, maks 16 dager fra i dag)
//   → {place:{name, lat, lon}, source:'met+open-meteo'|'open-meteo'|'mock', credit, updatedAt,
//      days:[{date, icon:'clear'|'partly'|'cloudy'|'fog'|'drizzle'|'rain'|'sleet'|'snow'|'thunder', ic:'☀️', code, text:'Lettskyet',
//             hi, lo, precipProb, precipMm}]}   Sted: brukerens første værsted (Vær-siden), ellers Oslo.
//
// ── Companion-token (Logg inn med Homelab-appen) ────────────────────────────────────────────────────────────────────────
// Krever økt ELLER et fh_-token med finance:write (samme regel som /finans/api/tokens).
// POST   /api/tokens/companion {app:'kalender', device:'iPhone'|'iPad'|'Android'|…}
//   → 201 {token:'fh_pat_…' (vises én gang), id, name:'Kalender (iPhone)', app, device, scopes:[…], created, expires|null,
//          user:{id, username, name}}
//   Bundet til samme bruker. scopes = scopene til tokenet som ber om det (økt: samme som /finans/api/login), aldri bredere.
//   expires: aldri senere enn tokenet som ber om det. Et nytt token for samme app + enhet trekker tilbake det gamle.
// GET    /api/tokens/companion → {tokens:[{id, name, app, device, scopes, created, lastUsed, expires, current}]}
// DELETE /api/tokens/companion/:id → {ok} (trekker tilbake). Tokenet står også i /finans/api/tokens (Innstillinger → API-tokens)
//   og i GET /api/devices som apps:[…] (Innstillinger → Enheter), og kan trekkes tilbake der.
//
// ── Widgets ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/widgets/calendar får i tillegg (de gamle feltene er uendret):
//   next3:[{id, title, date, start, end, allDay, time, s:'HH:MM'|null, e:'HH:MM'|null, room, appCalendar, appColor, color, type,
//           label:'I dag 14:30'|'I morgen'|'tor 21. okt', deepLink:'kalender://hendelse?id=…&date=…&t=…&s=…&e=…'}]
//   month:{year, month (1–12), label:'oktober 2026', today, deepLink:'kalender://dag/<today>',
//          weeks:[{week, days:[{date, d, inMonth, today, sunday, count, dots:['#b23a2a', …≤3], deepLink:'kalender://dag/<date>'}]}]}
//   weather:{place, today:{date, icon, ic, text, hi, lo, precipProb}|null, days:[…7 dager, samme form som /api/kalender/weather]}|null
//   deepLink:'kalender://', links:{today:'kalender://dag/<today>', list:'kalender://liste', new:'kalender://ny'}
//
// ── Glimt i Kalender: POST /api/assist {q, source:'calendar', context?:{eventId}} ──────────────────────────────────────
// Samme jobb (assist_jobs) og realtime («assist») som Homelab. Svar (200-kroppen / answer i GET /api/assist/:id / realtime):
//   {text, bold:[…], steps:['Leser i morgen i kalenderen', 'Finner hull på minst 45 min', 'Foreslår tider'],
//    events:[hendelser ≤ 6, samme form som /api/kalender + appCalendar/appColor],
//    slots:[{date, start:'HH:MM', end:'HH:MM', gapStart, gapEnd, minutes, label:'12:00–13:00'}],
//    created?:{event, undo:{method:'DELETE', url:'/api/kalender/events/<id>'}},
//    error?, fix?, actions?:[{k:'retry'|'ai', label, route?}]  (prompt 34: «Glimt fikk ikke svar fra {modell}: {feil}» står da i text),
//    summary?:{from, to, count, first?, last?, busiest?:{date, count}, deadlines:[…], birthdays:[…], weather:[…]},
//    weather?:[dager], intent:'calendar.free_slots'|'calendar.search'|'calendar.summary'|'calendar.create'|'weather.daily'|'calendar.ask',
//    tools:['calendar.free_slots', …], source:'Kalender', tool:'Kalender', model, engine:'tool'|'ollama'|'none', ms, deepLink:'kalender://liste',
//    chatContext}
//   Tenker-steg: jobbens steps[] bruker etikettene over ({key:'s1', label, state}); realtime «assist» sendes for hvert steg.
//   Ord for ord: når klienten fikk 202, sendes «assist» {jobId, state:'running', partial:'tekst så langt', done:false} i biter før
//   svaret; ellers animerer klienten text selv. Opprettelse (calendar.create) skjer med en gang og kan angres med undo.
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { kv } from './db.js';
import { db as fhDb } from './finans/db.js';
import { authOrToken } from './mobile.js';
import { sessionUser, userInfo } from './auth.js';
import { broadcast } from './realtime.js';
import { runAsUser } from './settings.js';
import { cached } from './cache.js';
import { eventsFor, eventInput, createEvent, normText, setEventDecorator, osloAt } from './calendar.js';
import { askCalendar } from './calendar-glimt.js';
import { weatherFull, wmoText, iconOf, PLACES } from './weather-full.js';
import { aliasesOf, typeOfWord, eventHitsAlias } from './glimt-memory.js';
import { parseQuick, osloTodayISO } from '../public/js/quick-time.js';
import { tokenAccessOf, issueToken, tokensById, revokeTokenOf, TOKEN_SCOPES } from './finans/routes.js';

const MOCK = process.env.MOCK_DATA === '1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (s) => s.split('-').map(Number);
const addDays = (s, n) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wdOf = (s) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const diffDays = (a, b) => { const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000); };
const PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function oslo(t) {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const hm2 = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const boldOf = (t) => [...String(t).matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
const longDate = (d) => { const [, m, dd] = ymd(d); return `${dd}. ${MON[m - 1]}`; };
/** «i dag», «i morgen», «i overmorgen», «på fredag» (< 7 dager), ellers «fredag 30. oktober». */
export function relDay(date, today) {
  const n = diffDays(today, date);
  if (n === 0) return 'i dag';
  if (n === 1) return 'i morgen';
  if (n === 2) return 'i overmorgen';
  if (n === -1) return 'i går';
  if (n > 2 && n < 7) return `på ${WD[wdOf(date)]}`;
  return `${WD[wdOf(date)]} ${longDate(date)}`;
}

/* ═══════════════════════ Kalendere ═══════════════════════ */

export const APP_CALENDARS = [
  { id: 'personlig', key: 'p', name: 'Personlig', color: '#b23a2a', textColor: '#8a2a1d', lightColor: '#f29a8a', backend: 'privat', sources: ['privat', 'trials'] },
  { id: 'jobb', key: 'j', name: 'Jobb', color: '#2b5d8a', textColor: '#1f4568', lightColor: '#9cc2ee', backend: 'privat', sources: [] },
  { id: 'studie', key: 's', name: 'Studie', color: '#2f7a4f', textColor: '#235c3b', lightColor: '#8fd4a8', backend: 'privat', sources: ['timeplan', 'prover', 'skole'] },
  { id: 'familie', key: 'f', name: 'Familie', color: '#a8661a', textColor: '#7a4a12', lightColor: '#ecbb74', backend: 'familie', sources: ['familie'] },
  { id: 'helse', key: 'h', name: 'Helse', color: '#3d7f8a', textColor: '#2a5c64', lightColor: '#8fcdd6', backend: 'privat', sources: [] },
  { id: 'bursdager', key: 'b', name: 'Bursdager', color: '#8a3fa0', textColor: '#6a2f7c', lightColor: '#d6a8e6', backend: 'privat', sources: ['bursdager'] },
];
const BUILTIN = new Map(APP_CALENDARS.map((c) => [c.id, c]));
const CUSTOM_ID = /^c-[0-9a-f]{10}$/;
const MAX_CUSTOM = 20;
const PREF_DEFAULTS = { defaultCalendar: 'personlig', defaultReminder: '1h', weekNumbers: true, weather: true, theme: 'system' };

const store = (user) => { const v = kv.get(user, 'kal33_cals', null); return v && typeof v === 'object' ? { builtin: v.builtin ?? {}, custom: Array.isArray(v.custom) ? v.custom : [], prefs: v.prefs ?? {} } : { builtin: {}, custom: [], prefs: {} }; };
const saveStore = (user, s) => kv.set(user, 'kal33_cals', s);
const evMap = (user) => { const v = kv.get(user, 'kal33_evcal', {}); return v && typeof v === 'object' ? v : {}; };
const prefsOf = (s) => ({ ...PREF_DEFAULTS, ...s.prefs });

/** Kalenderne for user (uten antall). */
export function appCalendarsOf(user) {
  const s = store(user);
  const out = APP_CALENDARS.map((c) => { const o = s.builtin[c.id] ?? {}; return { ...c, name: o.name ?? c.name, color: o.color ?? c.color, visible: o.visible !== false, builtin: true, writable: true }; });
  for (const c of s.custom) out.push({ id: c.id, key: c.id, name: c.name, color: c.color, textColor: c.color, lightColor: c.color, backend: 'privat', sources: [], visible: c.visible !== false, builtin: false, writable: true });
  return out;
}

const RE_GUESS = [
  ['bursdager', /bursdag/],
  ['familie', /mormor|morfar|farmor|farfar|bestemor|bestefar|hytta|familie|mamma|pappa|svigers/],
  ['helse', /lege|tannlege|tannpleier|trening|fysio|psykolog|optiker|vaksin|kiropraktor|massasje|helse|sykehus|legevakt|\bgym\b|yoga|løpetur|svømming/],
  ['studie', /frist|eksamen|forelesning|innlevering|seminar|kollokvie|oblig|\bprøve\b|lesesal|studie/],
  ['jobb', /møte|\bjobb|vakt\b|kunde|kontoret|standup|intervju|arbeid/],
];
/** Gjetter appens kalender fra en tekst (samme ord som QP i fasiten). → id eller null */
export function guessCalendar(text) {
  const n = String(text ?? '').toLowerCase();
  return RE_GUESS.find(([, re]) => re.test(n))?.[0] ?? null;
}
/** Nøkkelen en hendelse huskes på: lokale id-er uten forekomst (~dato), andre uten dato/tid til slutt. */
export const eventKey = (id) => { const s = String(id ?? ''); return s.startsWith('loc-') ? s.split('~')[0] : s.replace(/-\d{8}(T\d{4})?$/, ''); };
function defaultCalendar(e) {
  if (e.type === 'bursdag' || e.calendar === 'bursdager') return 'bursdager';
  if (e.calendar === 'timeplan' || e.calendar === 'prover' || e.calendar === 'skole') return 'studie';
  if (e.calendar === 'familie') return 'familie';
  if (e.source === 'trials') return 'personlig';
  return guessCalendar(`${e.title ?? ''} ${e.room ?? ''}`) ?? 'personlig';
}
/** Setter appCalendar/appColor på hendelsene (registrert i calendar.js eventsFor). */
function decorate(user, events) {
  if (!events.length) return events;
  const cals = new Map(appCalendarsOf(user).map((c) => [c.id, c]));
  const map = evMap(user);
  for (const e of events) {
    const want = map[eventKey(e.id)];
    const id = want && cals.has(want) ? want : defaultCalendar(e);
    e.appCalendar = id;
    e.appColor = cals.get(id)?.color ?? BUILTIN.get('personlig').color;
  }
  return events;
}
setEventDecorator(decorate);

function setEventCalendar(user, id, cal) {
  const map = evMap(user);
  const k = eventKey(id);
  if (cal) map[k] = cal; else delete map[k];
  const keys = Object.keys(map);
  if (keys.length > 5000) for (const x of keys.slice(0, keys.length - 5000)) delete map[x];
  kv.set(user, 'kal33_evcal', map);
}
const validCalendar = (user, id) => typeof id === 'string' && appCalendarsOf(user).some((c) => c.id === id);
const backendOf = (user, id) => appCalendarsOf(user).find((c) => c.id === id)?.backend ?? 'privat';
const changed = (user, action, id) => { try { broadcast('kalender', { action, ...(id ? { id } : {}) }, [user]); } catch { /* sanntid er best effort */ } };

export async function calendarsOut(user, today = osloTodayISO()) {
  const list = appCalendarsOf(user);
  const counts = new Map();
  try {
    const { events } = await runAsUser(user, () => eventsFor(user, today, addDays(today, 29)));
    for (const e of events) counts.set(e.appCalendar, (counts.get(e.appCalendar) ?? 0) + 1);
  } catch (e) { console.warn('[kalender33] antall:', e.message); }
  const s = store(user);
  return { calendars: list.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })), defaultCalendar: prefsOf(s).defaultCalendar, prefs: prefsOf(s) };
}

const bad = (c, error, status = 400) => c.json({ error }, status);
const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

export const calendarsApi = new Hono();
calendarsApi.use('*', authOrToken);
calendarsApi.get('/', async (c) => c.json(await calendarsOut(c.get('user'))));
calendarsApi.put('/prefs', async (c) => {
  const user = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet et objekt');
  const s = store(user), p = { ...s.prefs };
  for (const [k, v] of Object.entries(b)) {
    if (k === 'defaultCalendar') { if (!validCalendar(user, v)) return bad(c, 'Ukjent kalender'); p[k] = v; }
    else if (k === 'defaultReminder') { if (!['none', '10m', '30m', '1h', '1d'].includes(v)) return bad(c, 'defaultReminder må være none, 10m, 30m, 1h eller 1d'); p[k] = v; }
    else if (k === 'weekNumbers' || k === 'weather') { if (typeof v !== 'boolean') return bad(c, `${k} må være true eller false`); p[k] = v; }
    else if (k === 'theme') { if (!['system', 'light', 'dark'].includes(v)) return bad(c, 'theme må være system, light eller dark'); p[k] = v; }
    else return bad(c, `Ukjent nøkkel ${k}`);
  }
  saveStore(user, { ...s, prefs: p });
  changed(user, 'calendars');
  return c.json({ prefs: prefsOf({ prefs: p }) });
});
calendarsApi.post('/', async (c) => {
  const user = c.get('user'), b = await c.req.json().catch(() => null);
  const name = cleanName(b?.name);
  if (!name || name.length > 40) return bad(c, 'Navnet må være 1–40 tegn');
  if (!COLOR.test(String(b?.color ?? ''))) return bad(c, 'Farge må være #rrggbb');
  if (b.visible !== undefined && typeof b.visible !== 'boolean') return bad(c, 'visible må være true eller false');
  const s = store(user);
  if (s.custom.length >= MAX_CUSTOM) return bad(c, `Du kan ha maks ${MAX_CUSTOM} egne kalendere`);
  if (appCalendarsOf(user).some((x) => x.name.toLowerCase() === name.toLowerCase())) return bad(c, 'Du har allerede en kalender med det navnet', 409);
  const cal = { id: `c-${randomBytes(5).toString('hex')}`, name, color: b.color.toLowerCase(), visible: b.visible !== false, created: new Date().toISOString() };
  saveStore(user, { ...s, custom: [...s.custom, cal] });
  changed(user, 'calendars');
  return c.json({ calendar: { ...appCalendarsOf(user).find((x) => x.id === cal.id), count: 0 } }, 201);
});
calendarsApi.patch('/:id', async (c) => {
  const user = c.get('user'), id = c.req.param('id'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet et objekt');
  const s = store(user);
  const builtin = BUILTIN.has(id), idx = s.custom.findIndex((x) => x.id === id);
  if (!builtin && idx < 0) return bad(c, 'Fant ikke kalenderen', 404);
  const patch = {};
  if (b.name !== undefined) { const n = cleanName(b.name); if (!n || n.length > 40) return bad(c, 'Navnet må være 1–40 tegn'); patch.name = n; }
  if (b.color !== undefined) { if (!COLOR.test(String(b.color))) return bad(c, 'Farge må være #rrggbb'); patch.color = b.color.toLowerCase(); }
  if (b.visible !== undefined) { if (typeof b.visible !== 'boolean') return bad(c, 'visible må være true eller false'); patch.visible = b.visible; }
  if (builtin) s.builtin = { ...s.builtin, [id]: { ...(s.builtin[id] ?? {}), ...patch } };
  else s.custom = s.custom.map((x, i) => (i === idx ? { ...x, ...patch } : x));
  saveStore(user, s);
  changed(user, 'calendars');
  return c.json({ calendar: appCalendarsOf(user).find((x) => x.id === id) });
});
calendarsApi.delete('/:id', (c) => {
  const user = c.get('user'), id = c.req.param('id');
  if (BUILTIN.has(id)) return bad(c, 'De innebygde kalenderne kan ikke slettes. Skjul den i stedet.', 403);
  const s = store(user);
  if (!CUSTOM_ID.test(id) || !s.custom.some((x) => x.id === id)) return bad(c, 'Fant ikke kalenderen', 404);
  saveStore(user, { ...s, custom: s.custom.filter((x) => x.id !== id), prefs: s.prefs.defaultCalendar === id ? { ...s.prefs, defaultCalendar: 'personlig' } : s.prefs });
  const map = evMap(user);
  for (const [k, v] of Object.entries(map)) if (v === id) delete map[k];
  kv.set(user, 'kal33_evcal', map);
  changed(user, 'calendars');
  return c.json({ ok: true });
});

/** Mellomvare foran /api/kalender/events*: appCalendar i POST/PATCH, opprydding ved DELETE, sanntid «kalender». */
export async function eventsMiddleware(c, next) {
  const m = c.req.method;
  if (!['POST', 'PATCH', 'DELETE'].includes(m)) return next();
  const path = c.req.path.replace(/\/+$/, '');
  const id = path.match(/\/events\/([^/]+)$/)?.[1] ? decodeURIComponent(path.match(/\/events\/([^/]+)$/)[1]) : null;
  const isCopy = /\/copy$/.test(path);
  return authOrToken(c, async () => {
    const user = c.get('user');
    let want = null;
    if ((m === 'POST' && !id && !isCopy) || m === 'PATCH') {
      const b = await c.req.json().catch(() => null);
      if (b && typeof b === 'object' && b.appCalendar !== undefined) {
        if (!validCalendar(user, b.appCalendar)) { c.res = c.json({ error: 'Ukjent kalender (appCalendar)' }, 400); return; }
        want = b.appCalendar;
        const rest = { ...b };
        delete rest.appCalendar;
        // Bare flytting i appen: ingen skriving til Google eller lokal lagring.
        if (m === 'PATCH' && !Object.keys(rest).length) {
          const { findEvent } = await import('./calendar.js');
          const ev = await findEvent(user, id);
          if (!ev) { c.res = c.json({ error: 'Fant ikke hendelsen' }, 404); return; }
          setEventCalendar(user, ev.id, want);
          decorate(user, [ev]);
          changed(user, 'updated', ev.id);
          c.res = c.json({ ok: true, event: ev });
          return;
        }
        if (rest.calendar === undefined) rest.calendar = backendOf(user, want);
        if (m === 'PATCH') setEventCalendar(user, id, want);
        c.req.bodyCache = { text: Promise.resolve(JSON.stringify(rest)) }; // handleren i calendar.js leser den nye kroppen
      }
    }
    await next();
    if (!c.res || c.res.status >= 300) { if (m === 'PATCH' && want) setEventCalendar(user, id, null); return; }
    if (m === 'DELETE') { setEventCalendar(user, id, null); changed(user, 'deleted', id); return; }
    const j = await c.res.clone().json().catch(() => null);
    const ev = j?.event;
    if (ev?.id) {
      if (want) setEventCalendar(user, ev.id, want);
      decorate(user, [ev]);
      c.res = c.json(j, c.res.status);
    }
    changed(user, m === 'POST' ? 'created' : 'updated', ev?.id ?? id);
  });
}

/* ═══════════════════════ Vær ═══════════════════════ */

const WX_EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', sleet: '🌨️', snow: '❄️', thunder: '⛈️' };
let wxImpl = null;
/** Bare for tester: (place) → {days:[{date, hi, lo, code, precipProb, precipMm}], source}. null = standard. */
export const _setKalWeather = (fn) => { wxImpl = fn; };

function placeOf(user) {
  const list = kv.get(user, 'wx_places', null);
  const own = Array.isArray(list) && list[0]?.lat != null ? list[0] : null;
  return own ? { name: own.name ?? 'Mitt sted', lat: +own.lat, lon: +own.lon } : { name: PLACES.oslo.name, lat: PLACES.oslo.lat, lon: PLACES.oslo.lon, id: 'oslo' };
}
const r0 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
const hashN = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
function mockDay(date, p) {
  const r = hashN(`${date}:${p.lat}`), codes = [0, 1, 2, 3, 3, 45, 61, 63, 80, 2];
  const code = codes[Math.floor(r * codes.length)];
  const base = 8 - Math.min(10, Math.max(0, diffDays('2026-10-01', date)) / 6);
  return { date, hi: Math.round(base + 3 + r * 4), lo: Math.round(base - 3 + r * 2), code, precipProb: code >= 61 ? 60 + Math.round(r * 30) : Math.round(r * 30), precipMm: code >= 61 ? Math.round(r * 80) / 10 : 0 };
}
async function openMeteo16(p) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=Europe%2FOslo&forecast_days=16`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum';
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'homelab-kalender', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Open-Meteo svarte ${r.status}`);
  const j = await r.json(), D = j.daily ?? {};
  return (D.time ?? []).map((date, i) => ({ date, hi: D.temperature_2m_max?.[i], lo: D.temperature_2m_min?.[i], code: D.weather_code?.[i] ?? 0, precipProb: D.precipitation_probability_max?.[i] ?? 0, precipMm: D.precipitation_sum?.[i] ?? 0 }));
}
/** 16 dager for stedet: MET (via weatherFull, de første dagene) + Open-Meteo for resten. */
async function rawDays(p, today) {
  if (wxImpl) return wxImpl(p);
  if (MOCK) { const full = await weatherFull({ lat: p.lat, lon: p.lon, name: p.name }).catch(() => null); const first = new Map((full?.days ?? []).map((d) => [d.date, d]));
    return { days: Array.from({ length: 16 }, (_, i) => { const d = addDays(today, i); const f = first.get(d); return f ? { date: d, hi: f.hi, lo: f.lo, code: f.code, precipProb: f.precipProb, precipMm: f.precipMm ?? f.precip ?? 0 } : mockDay(d, p); }), source: 'mock' }; }
  return cached(`kal33wx:${p.lat},${p.lon}:${today}`, 30 * 60_000, async () => {
    const [full, om] = await Promise.allSettled([weatherFull({ lat: p.lat, lon: p.lon, name: p.name }), openMeteo16(p)]);
    const met = full.status === 'fulfilled' && !full.value.mock ? full.value : null;
    const byDate = new Map((om.status === 'fulfilled' ? om.value : []).map((d) => [d.date, d]));
    for (const d of met?.days ?? []) byDate.set(d.date, { ...(byDate.get(d.date) ?? {}), date: d.date, hi: d.hi, lo: d.lo, code: d.code, precipProb: d.precipProb ?? byDate.get(d.date)?.precipProb ?? 0 });
    if (!byDate.size) throw new Error('Fikk ikke kontakt med MET eller Open-Meteo');
    return { days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), source: met ? 'met+open-meteo' : 'open-meteo' };
  });
}
const dayOut = (d) => { const icon = iconOf(d.code); return { date: d.date, icon, ic: WX_EMOJI[icon] ?? '☁️', code: d.code ?? 0, text: wmoText(d.code ?? 0), hi: r0(d.hi), lo: r0(d.lo), precipProb: r0(d.precipProb) ?? 0, precipMm: d.precipMm == null ? null : Math.round(d.precipMm * 10) / 10 }; };

/** weather.daily: dager mellom from og to (begge med, maks 16 fra i dag). → {place, source, credit, days, updatedAt} */
export async function weatherDaily(user, from, to, today = osloTodayISO()) {
  const p = placeOf(user);
  const last = addDays(today, 15);
  const f = from && from > today ? from : today, t = to && to < last ? to : last;
  const r = await rawDays(p, today);
  const days = (r.days ?? []).filter((d) => d.date >= f && d.date <= t).map(dayOut);
  return { place: { name: p.name, lat: p.lat, lon: p.lon }, source: r.source ?? 'open-meteo', credit: r.source === 'mock' ? 'Eksempeldata' : 'MET Norge (yr.no) · Open-Meteo', days, updatedAt: new Date().toISOString() };
}

export const weatherApi = new Hono();
weatherApi.use('*', authOrToken);
weatherApi.get('/', async (c) => {
  const from = c.req.query('from') || null, to = c.req.query('to') || null;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return bad(c, 'from og to må være datoer (YYYY-MM-DD)');
  if (from && to && to < from) return bad(c, 'to må være etter from');
  try { return c.json(await weatherDaily(c.get('user'), from, to)); } catch (e) { return c.json({ error: String(e.message ?? e).slice(0, 200), days: [] }, 502); }
});

/* ═══════════════════════ Companion-token ═══════════════════════ */

fhDb.exec(`CREATE TABLE IF NOT EXISTS fh_companion_tokens (
  token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  device TEXT NOT NULL,
  parent TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fh_companion_user ON fh_companion_tokens(user_id);`);
const cq = (sql) => fhDb.prepare(sql);
const APPS = { kalender: 'Kalender' };
const MAX_COMPANIONS = 10;
export function deviceName(v) {
  const s = cleanName(v).replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 30);
  const n = s.toLowerCase();
  if (!n) return 'Mobil';
  if (/^(ios|iphone)/.test(n)) return 'iPhone';
  if (/^ipad/.test(n)) return 'iPad';
  if (/^android/.test(n)) return 'Android';
  return s;
}
/** Companion-tokenene til user (bare de som fortsatt finnes). currentId = full id til tokenet som spør. */
export function companionsOf(user, currentId = null) {
  const rows = cq('SELECT * FROM fh_companion_tokens WHERE user_id=? ORDER BY created DESC').all(user);
  const alive = new Map(tokensById(user, rows.map((r) => r.token_id)).map((t) => [t.fullId, t]));
  const gone = rows.filter((r) => !alive.has(r.token_id));
  for (const r of gone) cq('DELETE FROM fh_companion_tokens WHERE token_id=?').run(r.token_id); // trukket tilbake andre steder
  return rows.filter((r) => alive.has(r.token_id)).map((r) => { const t = alive.get(r.token_id);
    return { id: t.id, name: t.name, app: r.app, device: r.device, scopes: t.scopes, created: t.created, lastUsed: t.lastUsed, expires: t.expires, expired: t.expired, current: r.token_id === currentId }; });
}
/** Økt eller fh_-token med finance:write (samme regel som /finans/api/tokens). → {user, scopes[], expires|null, tokenId|null} eller {error,status} */
function requester(c) {
  const sid = sessionUser(c);
  if (sid && userInfo(sid)) return { user: sid, scopes: [...TOKEN_SCOPES], expires: null, tokenId: null };
  const a = tokenAccessOf(c);
  if (!a) return { error: 'Ikke innlogget', status: 401 };
  if (!a.scopes.has('finance:write')) return { error: 'Krever innlogging eller et app-token med finance:write', status: 403 };
  const row = a.tokenId ? tokensById(a.user, [a.tokenId])[0] : null;
  return { user: a.user, scopes: [...a.scopes].filter((s) => TOKEN_SCOPES.includes(s)), expires: row?.expires ?? null, tokenId: a.tokenId ?? null };
}

export const companionApi = new Hono();
companionApi.use('*', async (c, next) => {
  const r = requester(c);
  if (r.error) return c.json({ error: r.error }, r.status);
  c.set('req33', r);
  c.set('user', r.user);
  await next();
});
companionApi.get('/', (c) => c.json({ tokens: companionsOf(c.get('user'), c.get('req33').tokenId) }));
companionApi.post('/', async (c) => {
  const r = c.get('req33'), b = await c.req.json().catch(() => ({})) ?? {};
  const app = String(b.app ?? 'kalender').toLowerCase();
  if (!APPS[app]) return bad(c, 'Ukjent app (bare kalender)');
  const device = deviceName(b.device ?? b.deviceName);
  if (!r.scopes.length) return bad(c, 'Tokenet har ingen tilganger å gi videre', 403);
  if (r.expires && r.expires < Date.now()) return bad(c, 'Tokenet er utløpt', 401);
  // Samme app + enhet: det gamle trekkes tilbake (en ny innlogging fra Homelab-appen erstatter den forrige).
  for (const old of cq('SELECT token_id FROM fh_companion_tokens WHERE user_id=? AND app=? AND device=?').all(r.user, app, device)) {
    if (old.token_id !== r.tokenId) revokeTokenOf(r.user, old.token_id);
    cq('DELETE FROM fh_companion_tokens WHERE token_id=?').run(old.token_id);
  }
  if (companionsOf(r.user).length >= MAX_COMPANIONS) return bad(c, `Maks ${MAX_COMPANIONS} app-tokens. Trekk tilbake et under Innstillinger → Enheter.`, 409);
  const t = issueToken(r.user, { name: `${APPS[app]} (${device})`, scopes: r.scopes, expires: r.expires });
  cq('INSERT INTO fh_companion_tokens(token_id,user_id,app,device,parent,created) VALUES(?,?,?,?,?,?)').run(t.fullId, r.user, app, device, r.tokenId, Date.now());
  const u = userInfo(r.user);
  return c.json({ token: t.token, id: t.id, name: t.name, app, device, scopes: t.scopes, created: t.created, expires: t.expires, user: { id: u.id, username: u.username, name: u.name } }, 201);
});
companionApi.delete('/:id', (c) => {
  const user = c.get('user'), id = c.req.param('id');
  const row = /^[0-9a-f]{12}$/.test(id) ? cq('SELECT token_id FROM fh_companion_tokens WHERE user_id=? AND substr(token_id,1,12)=?').get(user, id) : null;
  if (!row) return bad(c, 'Fant ikke tokenet', 404);
  revokeTokenOf(user, row.token_id);
  cq('DELETE FROM fh_companion_tokens WHERE token_id=?').run(row.token_id);
  return c.json({ ok: true });
});

/* ═══════════════════════ Widgets ═══════════════════════ */

const q1 = (v) => encodeURIComponent(String(v ?? ''));
const startHm = (e) => (e.allDay ? null : oslo(Date.parse(e.start)).hm);
const endHm = (e) => (e.allDay ? null : oslo(Date.parse(e.end)).hm);
/** kalender://hendelse?id=…&date=…&t=…&s=…&e=… (s/e mangler for heldag). */
export const eventDeepLink = (e) => `kalender://hendelse?id=${q1(e.id)}&date=${e.date}&t=${q1(e.title)}${e.allDay ? '' : `&s=${startHm(e)}&e=${endHm(e)}`}`;
const onDay = (e, d) => (e.allDay ? e.date <= d && e.end > d : e.date === d);
function isoWeek(date) {
  const [y, m, d] = ymd(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86_400_000 + 1) / 7);
}
const WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
function nextLabel(e, today) {
  const n = diffDays(today, e.date), t = startHm(e);
  const day = n === 0 ? 'I dag' : n === 1 ? 'I morgen' : `${WD3[wdOf(e.date)]} ${ymd(e.date)[2]}. ${MON[ymd(e.date)[1] - 1].slice(0, 3)}`;
  return t ? `${day} ${t}` : day;
}
const evBrief = (e, today) => ({ id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, allDay: e.allDay, time: e.time, s: startHm(e), e: endHm(e), room: e.room || null,
  appCalendar: e.appCalendar, appColor: e.appColor, color: e.color, type: e.type, label: nextLabel(e, today), deepLink: eventDeepLink(e) });

/** Tilleggsfeltene til /api/widgets/calendar. */
export async function widgetExtra(user, now = Date.now()) {
  const today = oslo(now).date;
  const [y, m] = ymd(today);
  const first = `${y}-${pad(m)}-01`;
  const last = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`, -1);
  const gridFrom = addDays(first, -((wdOf(first) + 6) % 7)), gridTo = addDays(last, (7 - wdOf(last)) % 7);
  const to = addDays(today, 60) > gridTo ? addDays(today, 60) : gridTo;
  const { events } = await runAsUser(user, () => eventsFor(user, gridFrom < today ? gridFrom : today, to));
  const upcoming = events.filter((e) => (e.allDay ? e.end > today : Date.parse(e.end) > now) && e.date <= addDays(today, 60))
    .sort((a, b) => (a.allDay ? osloAt(a.date) : Date.parse(a.start)) - (b.allDay ? osloAt(b.date) : Date.parse(b.start)));
  const next3 = upcoming.filter((e) => !(e.allDay && e.date < today)).slice(0, 3).map((e) => evBrief(e, today));
  const weeks = [];
  for (let d = gridFrom; d <= gridTo; d = addDays(d, 7)) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const x = addDays(d, i), L = events.filter((e) => onDay(e, x));
      days.push({ date: x, d: ymd(x)[2], inMonth: x >= first && x <= last, today: x === today, sunday: wdOf(x) === 0, count: L.length, dots: [...new Set(L.map((e) => e.appColor))].slice(0, 3), deepLink: `kalender://dag/${x}` });
    }
    weeks.push({ week: isoWeek(d), days });
  }
  let weather = null;
  try { const w = await weatherDaily(user, today, addDays(today, 6), today); weather = { place: w.place.name, today: w.days.find((x) => x.date === today) ?? null, days: w.days }; } catch { /* uten vær */ }
  return { next3, month: { year: y, month: m, label: `${MON[m - 1]} ${y}`, today, deepLink: `kalender://dag/${today}`, weeks }, weather,
    deepLink: 'kalender://', links: { today: `kalender://dag/${today}`, list: 'kalender://liste', new: 'kalender://ny' } };
}
/** Mellomvare foran /api/widgets/calendar: legger widgetExtra til svaret fra calendar.js. */
export async function widgetMiddleware(c, next) {
  await next();
  if (c.req.method !== 'GET' || !c.res || c.res.status !== 200 || !c.get('user')) return;
  const j = await c.res.clone().json().catch(() => null);
  if (!j) return;
  const v = c.req.query('now'), t = v ? Date.parse(v) : NaN;
  try { c.res = c.json({ ...j, ...(await widgetExtra(c.get('user'), Number.isFinite(t) ? t : Date.now())) }); } catch (e) { console.warn('[kalender33] widget:', e.message); }
}

/* ═══════════════════════ Glimt i Kalender (/api/assist source:'calendar') ═══════════════════════ */

const QUESTION = /\?\s*$|^(hva|når|hvem|hvor|hvordan|hvilk\w*|finn|oppsummer|har jeg|blir det|kan jeg|er jeg|skal jeg|vis)\b/i;
export const isQuestion = (t) => QUESTION.test(String(t ?? '').trim());
const REM_TEXT = { '15m': '15 min før', '1h': '1 t før', day: '1 dag før' };
const evTime = (e) => (e.allDay ? osloAt(e.date) : Date.parse(e.start));
const sortEv = (a, b) => evTime(a) - evTime(b) || String(a.title).localeCompare(String(b.title), 'nb');

/** Dagen spørsmålet gjelder (fasitens dayOf), eller null. */
export function dayOfQuestion(text, today) {
  const n = ` ${String(text ?? '').toLowerCase().replace(/[?!,]/g, ' ').replace(/\.(?=\s|$)/g, ' ')} `;
  if (/ (i )?overmorgen /.test(n)) return addDays(today, 2);
  if (/ (i morgen|imorgen) /.test(n)) return addDays(today, 1);
  if (/ (i dag|idag|i kveld) /.test(n)) return today;
  const m = n.match(/(neste\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)/);
  if (m) { let df = (WD.indexOf(m[2]) - wdOf(today) + 7) % 7 || 7; if (m[1] && df < 7) df += 7; return addDays(today, df); }
  const m2 = n.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
  if (m2 && +m2[2] >= 1 && +m2[2] <= 12 && +m2[1] >= 1 && +m2[1] <= 31) {
    const [ty] = ymd(today); let yy = m2[3] ? (+m2[3] < 100 ? 2000 + +m2[3] : +m2[3]) : ty;
    let d = `${yy}-${pad(+m2[2])}-${pad(+m2[1])}`;
    if (!m2[3] && d < today) { yy += 1; d = `${yy}-${pad(+m2[2])}-${pad(+m2[1])}`; }
    return d;
  }
  return null;
}

/** calendar.free_slots: hull ≥ minMin minutter mellom 08 og 21 på date. → [{date, start, end, gapStart, gapEnd, minutes, label}] */
export function freeSlots(events, date, { today, nowMin = oslo(Date.now()).min, minMin = 45, from = 480, to = 1260 } = {}) {
  const L = events.filter((e) => !e.allDay && onDay(e, date) || (!e.allDay && e.date < date && oslo(Date.parse(e.end)).date >= date))
    .map((e) => { const s = oslo(Date.parse(e.start)), x = oslo(Date.parse(e.end)); return [s.date < date ? 0 : s.min, x.date > date ? 1440 : x.min]; })
    .sort((a, b) => a[0] - b[0]);
  let t0 = date === today ? Math.max(from, Math.ceil(nowMin / 30) * 30) : from;
  const gaps = [];
  for (const [a, b] of L) { if (Math.min(a, to) - t0 >= minMin) gaps.push([t0, Math.min(a, to)]); t0 = Math.max(t0, b); }
  if (to - t0 >= minMin) gaps.push([t0, to]);
  return gaps.map(([a, b]) => { const e = Math.min(b, a + 60); return { date, start: hm2(a), end: hm2(e), gapStart: hm2(a), gapEnd: hm2(b), minutes: b - a, label: `${hm2(a)}–${hm2(e)}` }; });
}
const joinNo = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} og ${arr[arr.length - 1]}`);
const wxSentence = (w) => (w ? ` Været: ${w.text.toLowerCase()}, ${w.lo}–${w.hi} grader${w.precipProb >= 50 || ['rain', 'drizzle', 'sleet', 'thunder'].includes(w.icon) ? ', så ta med paraply.' : '.'}` : '');
const termsOf = (text) => {
  const stop = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mine', 'har', 'jeg', 'skal', 'må', 'time', 'timen', 'timer', 'hos', 'til', 'på', 'i', 'en', 'et', 'den', 'det', 'avtale', 'avtalen', 'hva', 'meg', 'kommer', 'blir', 'hvilken', 'dag']);
  return String(text).toLowerCase().replace(/[?!.,«»"]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/(timen|timer|time)$/, '')).filter((w) => w.length > 2);
};

/** Tid i fritekst som parseQuick ikke fanget («10-11», «lørdag 18», «kl 9»), varighet og varsel. */
export function extrasOf(text) {
  const n = String(text ?? '').toLowerCase();
  const out = {};
  const rng = n.match(/\b(?:kl\.?\s*)?([01]?\d|2[0-3])(?:[.:]([0-5]\d))?\s*[-–]\s*([01]?\d|2[0-3])(?:[.:]([0-5]\d))?\b(?!\.\d)/);
  if (rng && !/\d\.\d{1,2}\s*[-–]/.test(rng[0].replace(/[.:][0-5]\d/, ''))) { out.start = `${pad(+rng[1])}:${rng[2] ?? '00'}`; out.end = `${pad(+rng[3])}:${rng[4] ?? '00'}`; }
  const kl = n.match(/\bkl\.?\s*([01]?\d|2[0-3])(?:[.:]([0-5]\d))?\b/);
  if (!out.start && kl) out.start = `${pad(+kl[1])}:${kl[2] ?? '00'}`;
  const bare = n.match(/\b(?:i dag|i morgen|overmorgen|i kveld|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+([01]?\d|2[0-3])\b(?![.:]\d)/);
  if (!out.start && bare) out.start = `${pad(+bare[1])}:00`;
  const dur = n.match(/\bi\s+(\d{1,3})\s*(timer|time|t|min|minutter)\b/);
  if (dur) out.duration = /^t/.test(dur[2]) ? +dur[1] * 60 : +dur[1];
  const rem = n.match(/(?:varsle?|påminn(?:\s+meg)?|minn meg på)\s+(\d{1,3})\s*(min|minutter|t|time|timer|dag|dager|døgn)\s+før/);
  if (rem) { const mins = /^(dag|døgn)/.test(rem[2]) ? +rem[1] * 1440 : /^t/.test(rem[2]) ? +rem[1] * 60 : +rem[1]; out.reminder = mins <= 20 ? '15m' : mins < 600 ? '1h' : 'day'; }
  return out;
}
const addMin = (hm, m) => { const [h, mi] = hm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + mi + m); return hm2(t); };

/** calendar.create: lager hendelsen med en gang (Privat/Familie), husker appens kalender og gir angre. */
export async function createFromText(user, text, today, nowMin = oslo(Date.now()).min, wantCal = null) {
  let aliases = [];
  try { aliases = aliasesOf(user); } catch { /* */ }
  const pq = parseQuick(text, today, aliases), x = extrasOf(text);
  let start = pq.start ?? x.start ?? null;
  let end = x.end ?? (start && pq.start && pq.end ? pq.end : null);
  if (start && x.duration) end = addMin(start, x.duration);
  if (start && !end) end = addMin(start, pq.duration && pq.type !== 'annet' ? pq.duration : 60);
  let date = pq.date;
  if (!date && start) { const [h, mi] = start.split(':').map(Number); date = h * 60 + mi <= nowMin ? addDays(today, 1) : today; }
  if (!date) return { error: 'Fant ikke dato eller tid. Skriv f.eks. «tannlege fredag kl 9».' };
  const title = String(pq.title || '').replace(/^(legg til|lag|ny|nytt|sett opp|book)\s+/i, '').replace(/\s+(kl\.?|klokka)\s*$/i, '').trim() || 'Ny hendelse';
  const cal = wantCal ?? guessCalendar(`${text} ${pq.type ?? ''}`) ?? prefsOf(store(user)).defaultCalendar;
  const appCal = validCalendar(user, cal) ? cal : 'personlig';
  const r = eventInput({ title: cap(title), allDay: !start, date, start, end, location: pq.place ?? '', calendar: backendOf(user, appCal), reminder: x.reminder ?? (start ? '1h' : 'none'),
    note: text.length > 80 ? text.slice(0, 2000) : '' });
  if (r.error) return { error: r.error };
  const ev = await createEvent(user, { ...r.value, origin: 'Glimt · Kalender' });
  setEventCalendar(user, ev.id, appCal);
  decorate(user, [ev]);
  changed(user, 'created', ev.id);
  return { event: ev, appCalendar: appCal };
}

const CAL_NAME = (user, id) => appCalendarsOf(user).find((c) => c.id === id)?.name ?? 'Personlig';

/** Glimt-svaret for Kalender-appen. onStep(at, intent, labels) for tenker-stegene. → svarobjektet (se toppen). */
export async function calendarAnswer(user, text, { today = osloTodayISO(), now = Date.now(), onStep = () => {} } = {}) {
  const t0 = Date.now();
  const ql = String(text).toLowerCase();
  const nowMin = oslo(now).min;
  const load = async (a, b) => (await runAsUser(user, () => eventsFor(user, a, b))).events;
  const wx = async (a, b) => { try { return (await weatherDaily(user, a, b, today)).days; } catch { return []; } };
  const place = placeOf(user).name;
  const step = (labels, intent) => onStep(1, intent, labels);
  let r;
  if (/ledig|fri tid|finn tid|når kan jeg|har jeg tid|ledige tider/.test(ql)) {
    const d = dayOfQuestion(text, today) ?? addDays(today, 1);
    const labels = [`Leser ${relDay(d, today)} i kalenderen`, 'Finner hull på minst 45 min', 'Foreslår tider'];
    step(labels, 'calendar.free_slots');
    const ev = await load(d, d);
    const slots = freeSlots(ev, d, { today, nowMin });
    const day = cap(relDay(d, today));
    r = { intent: 'calendar.free_slots', tools: ['calendar.free_slots'], steps: labels, slots: slots.slice(0, 4), events: ev.filter((e) => onDay(e, d) && !e.allDay).sort(sortEv).slice(0, 6),
      text: slots.length ? `${day} er du ledig **${joinNo(slots.map((s) => `${s.gapStart}–${s.gapEnd}`))}**. Trykk på en tid for å booke den.` : `${day} er det fullt mellom 08 og 21.` };
  } else if (/bursdag/.test(ql) && isQuestion(text)) {
    const labels = ['Ser i Bursdager'];
    step(labels, 'calendar.search');
    const L = (await load(today, addDays(today, 365))).filter((e) => e.appCalendar === 'bursdager' || e.type === 'bursdag').sort(sortEv).slice(0, 3);
    r = { intent: 'calendar.search', tools: ['calendar.search'], steps: labels, events: L,
      text: L.length ? `De neste bursdagene: ${joinNo(L.map((e) => `**${e.title.replace(/ har bursdag$/, '')}** ${relDay(e.date, today)}`))}.` : 'Ingen bursdager de neste ukene.' };
  } else if (/frist|eksamen|innlevering|oblig|prøve/.test(ql) && isQuestion(text)) {
    const labels = ['Ser i Studie', 'Sorterer frister'];
    step(labels, 'calendar.search');
    const L = (await load(today, addDays(today, 120))).filter((e) => e.type === 'prove' || e.type === 'innl').filter((e) => !(e.allDay && e.date < today)).sort(sortEv).slice(0, 4);
    const nm = (e) => e.title.replace(/^Frist:\s*/i, '');
    r = { intent: 'calendar.search', tools: ['calendar.search'], steps: labels, events: L,
      text: L.length ? `Neste frist er **${nm(L[0])}** ${relDay(L[0].date, today)}.${L.length > 1 ? ` Etter det: ${L.slice(1).map((e) => `${nm(e)} ${relDay(e.date, today)}`).join(', ')}.` : ''}` : 'Ingen frister fremover.' };
  } else if (/(oppsummer|hva skjer|hva har jeg|program|plan(er|en)?\b|hvordan ser|hva står|dagen min|uka mi)/.test(ql)) {
    if (/uka|uke|denne uken|neste uke/.test(ql)) {
      const d0 = /neste uke/.test(ql) ? addDays(today, 7 - ((wdOf(today) + 6) % 7)) : today, d1 = addDays(d0, 6);
      const labels = ['Leser 7 dager', 'Finner travleste dag', 'Skriver oppsummering'];
      step(labels, 'calendar.summary');
      const [ev, w] = await Promise.all([load(d0, d1), wx(d0, d1)]);
      const days = Array.from({ length: 7 }, (_, i) => addDays(d0, i));
      const L = ev.filter((e) => e.date >= d0 && e.date <= d1).sort(sortEv);
      const busy = days.map((d) => [d, ev.filter((e) => onDay(e, d)).length]).sort((a, b) => b[1] - a[1])[0];
      const deadlines = L.filter((e) => e.type === 'prove' || e.type === 'innl'), birthdays = L.filter((e) => e.appCalendar === 'bursdager');
      r = { intent: 'calendar.summary', tools: ['calendar.summary', 'weather.daily'], steps: labels, events: [...deadlines, ...birthdays, ...L.filter((e) => !deadlines.includes(e) && !birthdays.includes(e))].slice(0, 6), weather: w,
        summary: { from: d0, to: d1, count: L.length, first: L[0] ?? null, last: L[L.length - 1] ?? null, busiest: busy ? { date: busy[0], count: busy[1] } : null, deadlines, birthdays, weather: w },
        text: `Du har **${L.length} hendelser** de neste 7 dagene.${busy && busy[1] ? ` Travlest er ${relDay(busy[0], today)} med ${busy[1]}.` : ''}${deadlines.length ? ` Husk fristen: ${deadlines[0].title.replace(/^Frist:\s*/i, '')}.` : ''}${birthdays.length ? ` Bursdag: ${birthdays[0].title}.` : ''}` };
    } else {
      const d = dayOfQuestion(text, today) ?? today;
      const labels = [`Leser ${relDay(d, today)}`, 'Sjekker været', 'Skriver oppsummering'];
      step(labels, 'calendar.summary');
      const [ev, w] = await Promise.all([load(d, d), wx(d, d)]);
      const L = ev.filter((e) => onDay(e, d)).sort(sortEv), tm = L.filter((e) => !e.allDay);
      const left = d === today ? tm.filter((e) => Date.parse(e.end) > now) : tm;
      const deadlines = L.filter((e) => e.type === 'prove' || e.type === 'innl'), birthdays = L.filter((e) => e.appCalendar === 'bursdager');
      const lastEnd = tm.length ? tm.map((e) => oslo(Date.parse(e.end))).map((x) => (x.date > d ? 1440 : x.min)).reduce((a, b) => Math.max(a, b), 0) : null;
      const day = cap(relDay(d, today));
      let t = L.length ? `${day} har du **${L.length} ${L.length === 1 ? 'hendelse' : 'hendelser'}**.` : `${day} er helt fri.`;
      if (d === today && tm.length && left.length !== tm.length) t += ` ${left.length} igjen.`;
      if (left.length) t += ` Første er ${left[0].title} kl. ${startHm(left[0])}, og dagen er ferdig ${hm2(Math.min(lastEnd, 1439))}.`;
      if (deadlines.length) t += ` Frist: ${deadlines[0].title.replace(/^Frist:\s*/i, '')}.`;
      if (birthdays.length) t += ` ${birthdays[0].title}.`;
      t += wxSentence(w[0]);
      r = { intent: 'calendar.summary', tools: ['calendar.summary', 'weather.daily'], steps: labels, events: L.slice(0, 6), weather: w,
        summary: { from: d, to: d, count: L.length, first: tm[0] ?? L[0] ?? null, last: tm[tm.length - 1] ?? null, remaining: d === today ? left.length : L.length, deadlines, birthdays, weather: w }, text: t };
    }
  } else if (/v(æ|ae)r(et|meldingen)?\b|regn|paraply|snø|grader|temperatur/.test(ql)) {
    const d = dayOfQuestion(text, today) ?? today;
    const labels = [`Henter værvarsel for ${place}`];
    step(labels, 'weather.daily');
    const w = await wx(d, d);
    const x = w[0];
    const rain = x && (x.precipProb >= 50 || ['rain', 'drizzle', 'sleet', 'thunder'].includes(x.icon));
    r = { intent: 'weather.daily', tools: ['weather.daily'], steps: labels, weather: w, events: [],
      text: x ? `${cap(relDay(d, today))}: **${x.text.toLowerCase()}, ${x.lo}–${x.hi} grader**, ${x.precipProb} % sjanse for nedbør.${/regn|paraply/.test(ql) ? (rain ? ' **Ta med paraply.**' : ' Du klarer deg uten paraply.') : ''}` : 'Har ikke værvarsel for den dagen ennå (16 dager frem).' };
  } else if (/neste|når er|når har|når skal|når må/.test(ql)) {
    const terms = termsOf(text);
    const labels = [`Søker etter «${terms.join(' ') || 'neste'}»`];
    step(labels, 'calendar.search');
    const ev = (await load(today, addDays(today, 365))).filter((e) => (e.allDay ? e.end > today : Date.parse(e.end) > now)).sort(sortEv);
    let aliases = [];
    const types = new Set(terms.map(typeOfWord).filter(Boolean));
    try { aliases = types.size ? aliasesOf(user).filter((m) => types.has(m.type)) : []; } catch { /* */ }
    const hit = (e) => terms.some((t) => normText(`${e.title} ${e.room ?? ''} ${CAL_NAME(user, e.appCalendar)}`).includes(normText(t))) || aliases.some((m) => eventHitsAlias(e, m));
    const m = terms.length ? ev.find((e) => !e.allDay && hit(e)) ?? ev.find(hit) : ev.find((e) => !e.allDay);
    if (m) {
      labels.push(`Fant ${m.title}`);
      const n = diffDays(today, m.date);
      const when = `${relDay(m.date, today)}${m.allDay ? '' : ` kl. ${startHm(m)}`}`;
      r = { intent: 'calendar.search', tools: ['calendar.search'], steps: labels, events: [m],
        text: `${terms.length ? `Neste ${terms.join(' ')} er` : `Neste er ${m.title}`} **${when}**${m.room ? `, ${m.room}` : ''}.${n > 1 ? ` Det er om ${n} dager.` : ''}${REM_TEXT[m.reminder] ? ` Du får varsel ${REM_TEXT[m.reminder]}.` : ''}` };
    } else r = { intent: 'calendar.search', tools: ['calendar.search'], steps: labels, events: [], text: `Fant ingen kommende hendelse for «${terms.join(' ')}».` };
  }
  if (!r && !isQuestion(text)) {
    const pq = parseQuick(text, today), x = extrasOf(text);
    const looks = pq.date || pq.start || x.start;
    if (looks && (pq.start || x.start || /\d/.test(text) || text.length > 50 || /^(legg til|lag|ny|nytt|sett opp|book)\b/i.test(text))) {
      const cal = guessCalendar(`${text} ${pq.type ?? ''}`) ?? prefsOf(store(user)).defaultCalendar;
      const labels = ['Leser teksten', 'Finner dato og tid', `Legger inn i ${CAL_NAME(user, cal)}`];
      step(labels, 'calendar.create');
      try {
        const c = await createFromText(user, text, today, nowMin, cal);
        if (c.error) r = { intent: 'calendar.create', tools: ['calendar.create'], steps: labels, events: [], text: c.error };
        else {
          const e = c.event;
          r = { intent: 'calendar.create', tools: ['calendar.create'], steps: labels, events: [e], created: { event: e, undo: { method: 'DELETE', url: `/api/kalender/events/${encodeURIComponent(e.id)}` } },
            text: `Jeg la til **«${e.title}» ${relDay(e.date, today)}${e.allDay ? '' : ` kl. ${startHm(e)}`}** i ${CAL_NAME(user, c.appCalendar)}${e.allDay || !REM_TEXT[e.reminder] ? '.' : `, med varsel ${REM_TEXT[e.reminder]}.`}` };
        }
      } catch (e) {
        r = { intent: 'calendar.create', tools: ['calendar.create'], steps: labels, events: [], text: String(e?.message ?? e).slice(0, 300), ...(e?.reconnect ? { reconnect: true } : {}) };
      }
    }
  }
  if (!r) {
    const labels = ['Leser spørsmålet', 'Ser i kalenderen'];
    step(labels, 'calendar.ask');
    const a = await askCalendar(user, text, today);
    if (a.engine === 'ollama') labels.push('Spør den lokale modellen');
    const evs = (a.items ?? []).slice(0, 6);
    decorate(user, evs);
    r = { intent: 'calendar.ask', tools: ['calendar.search'], steps: labels, events: evs, engine: a.engine === 'ollama' ? 'ollama' : a.kind === 'none' || a.kind === 'error' ? 'none' : 'tool',
      ...(a.kind === 'error' ? { error: a.error, fix: a.fix ?? null, actions: [{ k: 'retry', label: 'Prøv igjen' }, { k: 'ai', label: 'Åpne AI-kontroll', route: 'innstillinger/ai' }] } : {}),
      slots: (a.free ?? []).map((f) => ({ date: a.from ?? today, start: f.from, end: f.to, gapStart: f.from, gapEnd: f.to, minutes: null, label: `${f.from}–${f.to}` })),
      text: a.kind === 'none' ? 'Jeg kan svare på ting som «Hva skjer i morgen?», «Når er neste frisørtime?» og «Finn ledig tid fredag», eller legge inn hendelser du skriver eller limer inn.' : a.text };
  }
  onStep(2, r.intent, r.steps);
  const out = { text: r.text, bold: boldOf(r.text), steps: r.steps, events: r.events ?? [], slots: r.slots ?? [], ...(r.created ? { created: r.created } : {}), ...(r.summary ? { summary: r.summary } : {}),
    ...(r.weather ? { weather: r.weather } : {}), ...(r.reconnect ? { reconnect: true } : {}), ...(r.error ? { error: r.error, fix: r.fix, actions: r.actions } : {}), intent: r.intent, tools: r.tools, source: 'Kalender', tool: 'Kalender',
    model: r.engine === 'ollama' ? 'Glimt · lokal' : 'Glimt · kalender', engine: r.engine ?? 'tool', ms: Date.now() - t0, deepLink: 'kalender://liste' };
  out.chatContext = { q: text, intent: out.intent, messages: [{ role: 'user', content: text }, { role: 'assistant', content: out.text, tool: 'Kalender' }] };
  return out;
}
