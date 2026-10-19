// Kalender med skoletimeplan (prompt 26). Per bruker: skolens iCal (cal_ics), valgfri Canvas-iCal (canvas_ics), Bursdager og
// Google Kalender (koblingen fra Bursdager). Sesjon eller app-token (authOrToken).
//   GET  /api/kalender?from=YYYY-MM-DD&to=YYYY-MM-DD[&now=ISO]
//        → {from, to, events:[{id, title, short, subject, room, teacher, note, start, end, allDay, date, time, inAllDayRow,
//            type:'time'|'prove'|'innl'|'bursdag'|'skole'|'fri', color, source:'ical'|'canvas'|'birthdays'|'google',
//            reminder, url?, mazemap?}], subjects:{navn: farge}, sources:[…], now:{current?, next?, nextSchoolDay?, nextTest?}}
//   POST /api/kalender/refresh → henter kalenderne på nytt nå (ellers caches de én time per bruker og adresse)
//   GET  /api/widgets/calendar[?now=ISO] → kompakt til widgets og Hjem: {kind, now, next, today, tests, nextSchoolDay, refreshAt}
// Prompt 27 (Kalender v2):
//   Hver hendelse har også calendar:'timeplan'|'prover'|'skole'|'privat'|'familie'|'bursdager', editable (bare Privat/Familie),
//   googleId?, googleCalendarId?, recurrence? ('daily'|'weekly'|'monthly'). Svaret har calendars:[{id, name, color, writable,
//   enabled}] (av/på fra layout-feltet kalFilters). now.next = neste hendelse uansett type (time først ved likt klokkeslett)
//   med inMin; now.current med leftMin. inAllDayRow = heldag eller frist (rutenettet er 00–24).
//   GET    /api/kalender/search?q= → {q, events} (±180 dager, tittel/sted/lærer, uklart: små bokstaver, uten aksenter, Levenshtein ≤ 1)
//   POST   /api/kalender/events {title, allDay, date, start:'HH:MM', end:'HH:MM', endDate?, location, calendar:'privat'|'familie',
//          repeat:'none'|'daily'|'weekly'|'monthly', reminder:'none'|'15m'|'1h'|'day', note} → {event} (201). Skrives til Google
//          Calendar (koblingen fra Bursdager, scope calendar.events); uten skrivetilgang 409 {error, reconnect:true}.
//          MOCK_DATA=1 uten Google-kobling: lagres i kv(user,'kal_local_events').
//   PATCH  /api/kalender/events/:id (samme felt, delvis), DELETE /api/kalender/events/:id – bare editable (ellers 403).
//   POST   /api/kalender/events/:id/copy → kopi i Privat (skolens hendelser er skrivebeskyttet).
// Regler (claude-code-kalender.md):
//  - Gjentakelser (RRULE, RDATE, EXDATE, RECURRENCE-ID) utvides med egen kode (ical-expand.js) i lokal tid (Europe/Oslo).
//    node-ical ble droppet: den slår sammen VEVENT-er med samme UID (skolesystemer gjenbruker UID per fag), så bare
//    den siste hendelsen (ofte eksamen) ble igjen og ingen timer vistes.
//  - Timer som ligger som enkelthendelser (uten RRULE) kjennes igjen på at samme tittel går igjen ≥ 3 ganger, eller «Lærer:».
//  - Fag fra SUMMARY, rom fra LOCATION, lærer fra DESCRIPTION («Lærer: …») eller ORGANIZER (CN).
//  - Type: «prøve», «heldag», «muntlig», «eksamen» → prove; «innlevering», «frist» → innl (tittel eller CATEGORIES).
//    Heldagshendelser med «fri», «planleggingsdag» eller «ferie» → fri, og timene de dagene fjernes.
//    En prøve med klokkeslett erstatter timer som overlapper den samme dag.
//  - Fagfarger fra en fast palett (Kalender.dc.html), overstyrt av brukerens subjectColors. Prøver og frister er alltid lab-røde.
// MOCK_DATA=1: eieren får en realistisk timeplan (mock.js) når cal_ics/canvas_ics ikke er satt. Feiler en adresse i demo,
// brukes demokalenderen (merket mock). Andre brukere får bare demo når de har lagt inn en adresse selv.
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { OWNER, kv } from './db.js';
import { userCfg, userCfgSet } from './settings.js';
import { cached } from './cache.js';
import { authOrToken, layoutOf } from './mobile.js';
import { listFor as birthdaysOf, googleCalendarEvents, googleConnected, googleCalendarIds, googleEventWrite, googleCanWrite } from './birthdays.js';
import { parseIcs, expandIcs as expandCal } from './ical-expand.js';
import { rememberShown, memorySuggestion } from './glimt-memory.js'; // prompt 33: «Glimt husker»
import { trialCalendarItems } from './finans/trials.js'; // prompt 31: gratis prøveperioder som heldagshendelser i Privat

const MOCK = process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
const DAY = 86_400_000;
const HOUR = 3_600_000;
export const LAB = '#b23a2a';
const BDAY = '#2b5d8a';
const SCHOOL = '#a8661a';
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/* ---------------- Fag og farger ---------------- */

// [navn, kortnavn, farge, mønster]. Rekkefølgen betyr noe: R2 før R1 osv.
export const SUBJECTS = [
  ['Matematikk R2', 'Matte R2', '#2b5d8a', /\b(matematikk|matte)\s*r2\b|\br2\b/i],
  ['Matematikk R1', 'Matte R1', '#2b5d8a', /\b(matematikk|matte)\s*r1\b|\br1\b/i],
  ['Matematikk S2', 'Matte S2', '#2b5d8a', /\b(matematikk|matte)\s*s2\b|\bs2\b/i],
  ['Matematikk S1', 'Matte S1', '#2b5d8a', /\b(matematikk|matte)\s*s1\b|\bs1\b/i],
  ['Matematikk', 'Matte', '#2b5d8a', /\bmatematikk|\bmatte\b/i],
  ['Fysikk 2', 'Fysikk 2', '#2e6f75', /\bfysikk\s*2\b|\bfy2\b/i],
  ['Fysikk 1', 'Fysikk 1', '#2e6f75', /\bfysikk(\s*1)?\b|\bfy1\b/i],
  ['Kjemi 2', 'Kjemi 2', '#2f7a4f', /\bkjemi\s*2\b/i],
  ['Kjemi 1', 'Kjemi 1', '#2f7a4f', /\bkjemi(\s*1)?\b/i],
  ['Biologi 2', 'Bio 2', '#4f7a2f', /\bbiologi\s*2\b/i],
  ['Biologi 1', 'Bio 1', '#4f7a2f', /\bbiologi(\s*1)?\b/i],
  ['Norsk', 'Norsk', '#a8661a', /\bnorsk/i],
  ['Engelsk', 'Engelsk', '#7a3b6b', /\bengelsk|\benglish\b/i],
  ['Historie', 'Historie', '#6b5a3a', /\bhistorie/i],
  ['Spansk', 'Spansk', '#c0562a', /\bspansk/i],
  ['Tysk', 'Tysk', '#8a5a2b', /\btysk/i],
  ['Fransk', 'Fransk', '#5a4e8c', /\bfransk/i],
  ['Kroppsøving', 'Gym', '#3f7a6e', /\bkroppsøving|\bgym\b/i],
  ['Samfunnskunnskap', 'Samfunn', '#2b6f8a', /\bsamfunnskunnskap|\bsamf\b/i],
  ['Religion og etikk', 'Religion', '#6b4a6b', /\breligion/i],
  ['Geografi', 'Geografi', '#4a6b3a', /\bgeografi/i],
  ['Naturfag', 'Naturfag', '#2f7a4f', /\bnaturfag/i],
  ['Informasjonsteknologi', 'IT', '#3a4a8a', /\binformasjonsteknologi|\bit\s*[12]\b/i],
  ['Økonomi og ledelse', 'Økonomi', '#5a6b2b', /\bøkonomi/i],
  ['Psykologi', 'Psykologi', '#7a4a5a', /\bpsykologi/i],
  ['Sosiologi', 'Sosiologi', '#5a5a7a', /\bsosiologi/i],
  ['Rettslære', 'Rettslære', '#6b3a3a', /\brettslære/i],
  ['Studietid', 'Studietid', '#7a7468', /\bstudietid|\bstudie\b/i],
];
const PALETTE = ['#2b5d8a', '#2e6f75', '#a8661a', '#7a3b6b', '#2f7a4f', '#6b5a3a', '#c0562a', '#3f7a6e', '#5a4e8c', '#8a5a2b', '#2b6f8a', '#7a7468'];
const hashOf = (s) => createHash('sha1').update(String(s)).digest('hex');
const paletteColor = (name) => PALETTE[parseInt(hashOf(name).slice(0, 6), 16) % PALETTE.length];

/** Fag ut fra tittelen. Brukerens egne fag (subjectColors) først. → {name, short, color, known} */
export function subjectOf(title, own = {}) {
  const t = String(title ?? '');
  for (const name of Object.keys(own)) if (name && t.toLowerCase().includes(name.toLowerCase())) return { name, short: SUBJECTS.find((s) => s[0] === name)?.[1] ?? name, color: own[name], known: true };
  const hit = SUBJECTS.find((s) => s[3].test(t));
  if (hit) return { name: hit[0], short: hit[1], color: own[hit[0]] ?? hit[2], known: true };
  // Ukjent fag: tittelen uten fagkoder i parentes/klammer («Spansk III (3STA)» → «Spansk III»).
  const name = t.replace(/\s*[[(][^\])]*[\])]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, short: name.length > 14 ? name.slice(0, 13) + '…' : name, color: own[name] ?? paletteColor(name), known: false };
}

/** Typen etter reglene i claude-code-kalender.md. */
export function typeOf({ title = '', categories = [], allDay = false, source = 'ical', recurring = false, subjectKnown = false, durationMs = 0, lessonLike = false }) {
  if (source === 'trials') return 'skole'; // prompt 31: «Viaplay-prøven slutter» er ikke en skoleprøve
  const t = `${title} ${[categories].flat().filter(Boolean).join(' ')}`;
  if (/prøve|heldag|muntlig|eksamen|\btentamen|\bquiz\b|\btest\b/i.test(t)) return 'prove';
  if (/innlever|\bfrist|deadline|\bdue\b/i.test(t)) return 'innl';
  if (allDay && /(^|[\s(–-])(skole)?fri(dag)?\b|planleggingsdag|ferie\b|ferie\s|\bferie|helligdag/i.test(t)) return 'fri';
  if (source === 'canvas') return allDay || durationMs === 0 ? 'innl' : 'skole';
  if (allDay || source === 'google' || source === 'local') return 'skole';
  // Timer: gjentakende (RRULE/RDATE), kjent fag, eller tittel som går igjen / har «Lærer:» (timeplan som enkelthendelser).
  if ((recurring || subjectKnown || lessonLike) && durationMs > 0 && durationMs <= 6 * HOUR) return 'time';
  return 'skole';
}

/* ---------------- Norsk tid ---------------- */

const PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function oslo(t) {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hm: `${p.hour}:${p.minute}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (s) => s.split('-').map(Number);
const addDays = (s, n) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayOf = (s) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const daysBetween = (a, b) => { const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY); };
/** Tidspunktet (ms) for dato + klokkeslett i norsk tid (sommer- og vintertid). */
export function osloAt(date, hm = '00:00') {
  const [y, m, d] = ymd(date), [h, mi] = hm.split(':').map(Number);
  for (const off of [1, 2]) { const t = Date.UTC(y, m - 1, d, h - off, mi); const o = oslo(t); if (o.date === date && o.hm === `${pad(h)}:${pad(mi)}`) return t; }
  return Date.UTC(y, m - 1, d, h - 1, mi);
}
const localYmd = (x) => { const d = new Date(x); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }; // heldagsdatoer fra node-ical er lokal midnatt
export const dayLabel = (date) => { const [, m, d] = ymd(date); return `${WEEKDAYS[weekdayOf(date)]} ${d}. ${MONTHS[m - 1]}`; };
const shortDay = (date) => { const [, m, d] = ymd(date); return `${WEEKDAYS[weekdayOf(date)]} ${d}. ${MONTHS[m - 1].slice(0, 3)}`; };

/* ---------------- Henting (cache én time per bruker og adresse) ---------------- */

let fetchImpl = null;
/** Testene kan bytte ut henting: fn(url) → Response eller tekst. */
export const _setCalendarFetch = (fn) => { fetchImpl = fn; };
let mockIcs = null;
const mockText = async (kind) => { mockIcs ??= await import('./mock.js'); return kind === 'canvas' ? mockIcs.mockCanvasIcs() : mockIcs.mockSchoolIcs(); };

async function fetchText(url) {
  const r = fetchImpl ? await fetchImpl(url) : await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'homelab-kalender/1.0', accept: 'text/calendar, */*' } });
  if (typeof r === 'string') return r;
  if (!r.ok) throw new Error(`Kalenderen svarte ${r.status}`);
  return r.text();
}
/** iCal-tekst → kalender (ical-expand.js). Kaster hvis teksten ikke er iCal. */
const parse = (text) => {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Adressen svarte, men det er ikke en iCal-kalender.');
  const cal = parseIcs(text);
  // Timeplaner som enkelthendelser: titler (tidfestet, ikke prøver/frister) som går igjen minst 3 ganger.
  const counts = new Map();
  for (const e of cal.events) {
    const t = String(e.props.get('SUMMARY')?.[0]?.value ?? '').trim().toLowerCase();
    const ds = e.props.get('DTSTART')?.[0];
    if (!t || !ds || !/T\d{4}/.test(ds.value) || e.props.has('RECURRENCE-ID')) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  cal.repeated = new Set([...counts].filter(([, n]) => n >= 3).map(([t]) => t));
  return cal;
};

/** Kilden for user: {url, mock}. url null = ikke satt opp. */
function sourceUrl(user, key) {
  const url = userCfg(user, key) || '';
  if (url) return { url, mock: false };
  if (MOCK && user === OWNER) return { url: null, mock: true };
  return { url: null, mock: false };
}
// Generasjon per bruker i cachenøkkelen: «Oppdater» (POST /refresh) henter brukerens kalendere på nytt uten å røre andres.
const gen = new Map();
const genOf = (user) => gen.get(user) ?? 0;
export function clearCalendarCache(user) { gen.set(user, genOf(user) + 1); }
async function loadIcs(user, kind, key) {
  const { url, mock } = sourceUrl(user, key);
  if (!url && !mock) return { configured: false, items: [] };
  const ck = `kal:${user}:${genOf(user)}:${kind}:${hashOf(url ?? 'mock').slice(0, 12)}`;
  const r = await cached(ck, HOUR, async () => {
    if (!url) return { items: parse(await mockText(kind)), fetchedAt: Date.now(), mock: true };
    try { return { items: parse(await fetchText(url)), fetchedAt: Date.now() }; }
    catch (e) { if (MOCK && !fetchImpl) return { items: parse(await mockText(kind)), fetchedAt: Date.now(), mock: true, error: e.message }; throw e; }
  });
  return { configured: true, ...r };
}

/* ---------------- Tolking ---------------- */

const TEACHER = /^\s*(?:lærer|faglærer|teacher|underviser)\s*[:–-]\s*(.+)$/im;
function teacherOf(org, desc) {
  const m = desc.match(TEACHER);
  if (m) return m[1].trim().slice(0, 80);
  if (org?.cn) return org.cn.slice(0, 80);
  const mail = String(org?.mail ?? '');
  return mail && !/noreply|no-reply/i.test(mail) ? mail.split('@')[0].replace(/[._]/g, ' ').slice(0, 80) : '';
}
const noteOf = (desc) => desc.replace(/^\s*(?:lærer|faglærer|teacher|underviser)\s*[:–-].*$/gim, '').replace(/\n{2,}/g, '\n').trim().slice(0, 500);
const mazemapOf = (room, campus) => {
  if (!room || /^(canvas|teams|zoom|digital|nett)/i.test(room)) return null;
  return `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(room)}`;
};

// Kalenderne i Kalender v2 (rekkefølgen i filteret). writable = man kan legge til hendelser der.
export const CALENDARS = [
  { id: 'timeplan', name: 'Timeplan', color: '#2b5d8a', writable: false },
  { id: 'prover', name: 'Prøver og frister', color: LAB, writable: false },
  { id: 'skole', name: 'Skole (iCal)', color: SCHOOL, writable: false },
  { id: 'privat', name: 'Privat', color: '#2f7a4f', writable: true },
  { id: 'familie', name: 'Familie (Google)', color: '#7a3b6b', writable: true },
  { id: 'bursdager', name: 'Bursdager', color: BDAY, writable: false },
];
const CAL_COLOR = Object.fromEntries(CALENDARS.map((c) => [c.id, c.color]));
const calendarOf = (src, type, cal) => (src === 'birthdays' ? 'bursdager' : cal ? cal : type === 'time' ? 'timeplan' : type === 'prove' || type === 'innl' ? 'prover' : 'skole');

function eventOut({ src, uid, title, subjectHint = '', start, end, allDay, date: dateIn = null, endDate: endIn = null, room = '', desc = '', teacher = '', categories = [], recurring = false, lessonLike = false, url = null, cal = null, editable = false, googleId = null, googleCalendarId = null, recurrence = null, localId = null, reminder = null, origin = null }, ctx) {
  const subj = subjectHint && subjectOf(subjectHint, ctx.colors).known ? subjectOf(subjectHint, ctx.colors) : subjectOf(title, ctx.colors);
  const durationMs = allDay ? 0 : end - start;
  const type = src === 'birthdays' ? 'bursdag' : typeOf({ title, categories, allDay, source: src, recurring, subjectKnown: subj.known, durationMs, lessonLike });
  const lesson = type === 'time';
  const subject = lesson || ((type === 'prove' || type === 'innl') && subj.known) ? subj.name : null;
  const calendar = calendarOf(src, type, cal);
  const color = type === 'prove' || type === 'innl' ? LAB : type === 'bursdag' ? BDAY : type === 'time' ? subj.color : calendar === 'privat' || calendar === 'familie' ? CAL_COLOR[calendar] : SCHOOL;
  const s = allDay ? null : oslo(start), e = allDay ? null : oslo(end);
  const date = allDay ? dateIn ?? localYmd(start) : s.date;
  const endDate = allDay ? endIn ?? localYmd(end) : e.date;
  const key = allDay ? date.replace(/-/g, '') : `${date.replace(/-/g, '')}T${s.hm.replace(':', '')}`;
  const id = localId ? `${localId}${recurrence ? `~${key}` : ''}` : `${{ ical: 'ical', canvas: 'cv', birthdays: 'bd', google: 'g' }[src]}-${hashOf(uid).slice(0, 10)}-${key}`;
  const ev = {
    id, title, short: lesson ? subj.short : title.length > 18 ? title.slice(0, 17) + '…' : title, subject, room, teacher, note: noteOf(desc),
    start: allDay ? date : new Date(start).toISOString(), end: allDay ? (endDate > date ? endDate : addDays(date, 1)) : new Date(end).toISOString(),
    // Rutenettet i Kalender v2 går 00–24: bare heldagshendelser og frister (uten varighet) står i HELE-raden.
    allDay, date, time: allDay ? null : durationMs === 0 ? s.hm : `${s.hm}–${e.hm}`, inAllDayRow: allDay || durationMs === 0,
    type, color, source: src, calendar, editable: !!editable, reminder: ctx.reminders[id] ?? reminder ?? (type === 'prove' || type === 'innl' ? 'day' : 'none'),
  };
  if (url) ev.url = url;
  if (googleId) { ev.googleId = googleId; ev.googleCalendarId = googleCalendarId; }
  if (recurrence) ev.recurrence = recurrence;
  if (origin) ev.origin = String(origin).slice(0, 60); // prompt 29: «AI · rask time»
  const mz = (lesson || type === 'prove') && mazemapOf(room, ctx.campus);
  if (mz) ev.mazemap = mz;
  return ev;
}

function expandIcs(cal, src, from, to, ctx) {
  const out = [];
  for (const i of expandCal(cal, from, to)) {
    let title = i.summary || '(uten tittel)';
    // Canvas legger emnet i klammer bak tittelen («Innlevering historie [Historie 3STA]»): emnet brukes til faget, ikke i tittelen.
    const course = src === 'canvas' ? title.match(/\s*\[([^\]]+)\]\s*$/) : null;
    if (course) title = title.slice(0, course.index).trim() || title;
    const desc = i.description ?? '';
    const lessonLike = cal.repeated?.has(String(i.summary ?? '').trim().toLowerCase()) || (src === 'ical' && TEACHER.test(desc));
    out.push(eventOut({ src, uid: i.uid || title, title, subjectHint: course?.[1], start: i.startMs, end: Math.max(i.startMs, i.endMs), allDay: i.allDay, date: i.date, endDate: i.endDate,
      room: i.location ?? '', desc, teacher: teacherOf(i.organizer, desc), categories: i.categories ?? [], recurring: i.recurring, lessonLike, url: i.url || null }, ctx));
  }
  return out;
}

function birthdayEvents(user, fromDate, toDate, ctx) {
  const out = [];
  const [y1] = ymd(fromDate), [y2] = ymd(toDate);
  for (const b of birthdaysOf(user)) {
    for (let y = y1; y <= y2; y++) {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const date = `${y}-${pad(b.month)}-${pad(b.month === 2 && b.day === 29 && !leap ? 28 : b.day)}`;
      if (date < fromDate || date > toDate) continue;
      const age = b.year ? y - b.year : null;
      const s = new Date(`${date}T00:00:00`), e = new Date(`${addDays(date, 1)}T00:00:00`);
      const ev = eventOut({ src: 'birthdays', uid: `bd${b.id}`, title: `${b.name} har bursdag`, start: s, end: e, allDay: true, date, endDate: addDays(date, 1), desc: age ? `Fyller ${age}` : '', url: b.googleUrl }, ctx);
      out.push(ev);
    }
  }
  return out;
}

// Google: id i svaret → {googleId, calId, calendar} for PATCH/DELETE/kopi (fylles hver gang hendelsene leses).
const gIndex = new Map();
const REMINDER_MIN = { '15m': 15, '1h': 60, day: 1440 };
const reminderOf = (g) => { const m = g.reminders?.overrides?.[0]?.minutes; return m == null ? null : m <= 20 ? '15m' : m <= 90 ? '1h' : 'day'; };
function googleOut(user, items, calendar, calId, ctx) {
  if (!gIndex.has(user)) gIndex.set(user, new Map());
  const idx = gIndex.get(user);
  return items.map((g) => {
    const allDay = !!g.start?.date;
    const start = allDay ? osloAt(g.start.date) : Date.parse(g.start?.dateTime ?? g.start);
    const endDate = allDay ? g.end?.date ?? addDays(g.start.date, 1) : null;
    const end = allDay ? osloAt(endDate) : Date.parse(g.end?.dateTime ?? g.start?.dateTime ?? g.start);
    if (!Number.isFinite(start)) return null;
    const rep = g.extendedProperties?.private?.hl_repeat ?? (g.recurringEventId || g.recurrence ? 'custom' : null);
    const ev = eventOut({ src: 'google', uid: g.id, title: String(g.summary ?? '(uten tittel)'), start, end: Number.isFinite(end) ? end : start, allDay, date: allDay ? g.start.date : null, endDate,
      room: String(g.location ?? ''), desc: String(g.description ?? '').replace(/<[^>]+>/g, ''), teacher: teacherOf(null, String(g.description ?? '').replace(/<[^>]+>/g, '')), url: g.htmlLink ?? null,
      cal: calendar, editable: true, googleId: g.id, googleCalendarId: calId, recurrence: rep, reminder: reminderOf(g), origin: g.extendedProperties?.private?.hl_origin ?? null }, ctx);
    idx.set(ev.id, { googleId: g.id, calId, calendar, instance: !!g.recurringEventId });
    if (idx.size > 5000) idx.delete(idx.keys().next().value);
    return ev;
  }).filter(Boolean);
}

/* Lokale hendelser (MOCK_DATA=1 uten Google): kv(user,'kal_local_events') = [{id, title, allDay, date, start, end, endDate,
   location, calendar, repeat, reminder, note}]. Gjentakelser utvides med samme kode som iCal. */
const localList = (user) => { const v = kv.get(user, 'kal_local_events', []); return Array.isArray(v) ? v : []; };
const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compact = (d, hm) => `${d.replace(/-/g, '')}${hm ? `T${hm.replace(':', '')}00` : ''}`;
function localEvents(user, from, to, ctx) {
  const list = localList(user);
  if (!list.length) return [];
  const body = list.map((e) => {
    const endDate = e.endDate && e.endDate >= e.date ? e.endDate : e.date;
    const dt = e.allDay ? [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(endDate, 1))}`]
      : [`DTSTART;TZID=Europe/Oslo:${compact(e.date, e.start)}`, `DTEND;TZID=Europe/Oslo:${compact(endDate > e.date || (e.end ?? e.start) >= e.start ? endDate : addDays(e.date, 1), e.end ?? e.start)}`];
    const rr = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[e.repeat];
    return ['BEGIN:VEVENT', `UID:${e.id}`, ...dt, ...(rr ? [`RRULE:FREQ=${rr}`] : []), `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.location)}`, `DESCRIPTION:${icsText(e.note)}`, 'END:VEVENT'].join('\r\n');
  }).join('\r\n');
  const cal = parseIcs(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`);
  const by = new Map(list.map((e) => [e.id, e]));
  return expandCal(cal, from, to).map((i) => {
    const e = by.get(i.uid);
    return eventOut({ src: 'local', uid: i.uid, title: i.summary || '(uten tittel)', start: i.startMs, end: i.endMs, allDay: i.allDay, date: i.date, endDate: i.endDate, room: i.location ?? '', desc: i.description ?? '',
      cal: e?.calendar ?? 'privat', editable: true, localId: i.uid, recurrence: e?.repeat && e.repeat !== 'none' ? e.repeat : null, reminder: e?.reminder ?? null, origin: e?.origin ?? null }, ctx);
  });
}

/** Reglene for fri-dager og prøver som erstatter timer. */
export function applyRules(events) {
  const fri = new Set();
  for (const e of events) if (e.type === 'fri') for (let d = e.date; d < e.end && fri.size < 5000; d = addDays(d, 1)) fri.add(d);
  const tests = events.filter((e) => e.type === 'prove' && !e.allDay);
  const seen = new Set();
  return events.filter((e) => {
    if (e.type === 'time' && fri.has(e.date)) return false;
    if (e.type === 'time' && tests.some((t) => t.date === e.date && Date.parse(t.start) < Date.parse(e.end) && Date.parse(t.end) > Date.parse(e.start))) return false;
    // Samme hendelse fra to skolekilder (f.eks. prøven både i skolekalenderen og Canvas): bare den første.
    // Egne kopier (Privat/Familie) av en skolehendelse vises ved siden av.
    const k = `${e.source === 'ical' || e.source === 'canvas' ? 'skole' : `${e.source}:${e.calendar}`}|${e.title.toLowerCase()}|${e.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (a.date === b.date ? (a.allDay === b.allDay ? Date.parse(a.allDay ? `${a.start}T00:00:00Z` : a.start) - Date.parse(b.allDay ? `${b.start}T00:00:00Z` : b.start) || a.title.localeCompare(b.title, 'nb') : a.allDay ? -1 : 1) : a.date < b.date ? -1 : 1));
}

/* ---------------- Samlet ---------------- */

function ctxOf(user) {
  const l = layoutOf(user);
  return { colors: l.subjectColors && typeof l.subjectColors === 'object' ? l.subjectColors : {}, reminders: l.kalReminders && typeof l.kalReminders === 'object' ? l.kalReminders : {}, campus: userCfg(user, 'cal_mazemap') || '' };
}
const srcErr = (e) => String(e?.message ?? e).slice(0, 200);

/** Alle hendelser for user mellom to datoer (YYYY-MM-DD, begge med). */
export async function eventsFor(user, fromDate, toDate) {
  const ctx = ctxOf(user);
  const from = osloAt(addDays(fromDate, -1)), to = osloAt(addDays(toDate, 2));
  const sources = [];
  let events = [];
  for (const [id, key, name] of [['ical', 'cal_ics', 'Skole'], ['canvas', 'canvas_ics', 'Canvas']]) {
    try {
      const r = await loadIcs(user, id, key);
      const list = r.configured ? expandIcs(r.items, id, from, to, ctx) : [];
      events.push(...list);
      sources.push({ id, name, configured: r.configured, ok: true, count: list.length, fetchedAt: r.fetchedAt ? new Date(r.fetchedAt).toISOString() : null, ...(r.mock ? { mock: true } : {}), ...(r.stale ? { stale: true } : {}), ...(r.error ? { error: r.error } : {}) });
    } catch (e) { sources.push({ id, name, configured: true, ok: false, count: 0, error: srcErr(e) }); }
  }
  const bd = birthdayEvents(user, fromDate, toDate, ctx);
  events.push(...bd);
  sources.push({ id: 'birthdays', name: 'Bursdager', configured: true, ok: true, count: bd.length });
  try {
    // Privat = valgt Google-kalender, Familie = familiekalenderen (prompt 27).
    const items = await cached(`kal:${user}:${genOf(user)}:google:${fromDate}:${toDate}`, 15 * 60_000, async () => {
      if (!googleConnected(user)) return { list: null };
      const ids = await googleCalendarIds(user);
      const privat = await googleCalendarEvents(user, from, to, ids.privat);
      const familie = ids.familie && ids.familie !== ids.privat ? await googleCalendarEvents(user, from, to, ids.familie).catch(() => []) : [];
      return { list: privat, familie, ids };
    });
    const list = items.list ? [...googleOut(user, items.list, 'privat', items.ids.privat, ctx), ...googleOut(user, items.familie ?? [], 'familie', items.ids.familie, ctx)] : [];
    events.push(...list);
    sources.push({ id: 'google', name: 'Google Kalender', configured: !!items.list, ok: true, count: list.length });
  } catch (e) { sources.push({ id: 'google', name: 'Google Kalender', configured: true, ok: false, count: 0, error: srcErr(e) }); }
  const loc = localEvents(user, from, to, ctx);
  if (loc.length || MOCK) { events.push(...loc); sources.push({ id: 'local', name: 'Privat (lokalt)', configured: true, ok: true, count: loc.length }); }
  // Prompt 31: aktive prøveperioder (virtuell kilde «trials», bare lesing; endres i Abonnementer).
  try {
    const tr = trialCalendarItems(user, fromDate, toDate).map((t) => eventOut({ src: 'trials', uid: t.id, title: t.title, start: osloAt(t.date), end: osloAt(addDays(t.date, 1)), allDay: true, date: t.date,
      endDate: addDays(t.date, 1), desc: t.note, url: t.url, cal: 'privat', localId: t.id, origin: 'Abonnementer · prøveperiode' }, ctx));
    if (tr.length) { events.push(...tr); sources.push({ id: 'trials', name: 'Prøveperioder', configured: true, ok: true, count: tr.length }); }
  } catch (e) { console.warn('[kalender] prøveperioder:', e.message); }
  events = applyRules(events).filter((e) => (e.allDay ? e.end > fromDate && e.date <= toDate : e.date >= fromDate && e.date <= toDate));
  for (const s of sources) if (s.ok) s.count = events.filter((e) => e.source === s.id).length; // antall i perioden, etter reglene
  if (decorator) { try { decorator(user, events); } catch (e) { console.warn('[kalender] app-kalendere:', e.message); } }
  return { events, sources, ctx };
}
// Prompt 33 (SERVER33): Kalender-appen setter appCalendar/appColor på hver hendelse (server/kalender33.js registrerer seg her).
let decorator = null;
export const setEventDecorator = (fn) => { decorator = fn; };

const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));
const durText = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m / 60} t`);
const isLesson = (e) => !e.allDay && (e.type === 'time' || e.type === 'prove');
const startMs = (e) => (e.allDay ? osloAt(e.date) : Date.parse(e.start));
const endMs = (e) => (e.allDay ? osloAt(e.end) : Date.parse(e.end));

/** NÅ / NESTE TIME / NESTE SKOLEDAG / neste prøve ut fra skoletimene (som må dekke i dag og fremover). Widget og Hjem bruker denne. */
export function lessonNowOf(events, t = Date.now()) {
  const today = oslo(t).date;
  const lessons = events.filter(isLesson);
  const todays = lessons.filter((e) => e.date === today);
  const cur = todays.find((e) => startMs(e) <= t && t < endMs(e));
  const nxt = todays.find((e) => startMs(e) > t);
  const out = {};
  if (cur) out.current = currentOut(cur, t);
  if (nxt) out.next = nextOut(nxt, t);
  const nd = lessons.find((e) => e.date > today);
  if (nd) {
    const list = lessons.filter((e) => e.date === nd.date);
    out.nextSchoolDay = { date: nd.date, label: dayLabel(nd.date), weekday: WEEKDAYS[weekdayOf(nd.date)], daysAway: daysBetween(today, nd.date), first: list[0], events: list, count: list.length };
  }
  const test = events.find((e) => (e.type === 'prove' || e.type === 'innl') && (e.allDay ? e.date >= today : endMs(e) > t));
  if (test) { const n = daysBetween(today, test.date); out.nextTest = { ...test, daysLeft: n, urgent: n <= 7, label: `${test.title} ${n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dager`}` }; }
  return out;
}
function currentOut(cur, t) {
  const len = endMs(cur) - startMs(cur), left = minutes(endMs(cur) - t);
  return { ...cur, minutesLeft: left, leftMin: left, progress: len ? Math.min(1, Math.max(0, (t - startMs(cur)) / len)) : 1, label: `${durText(left)} igjen` };
}
function nextOut(nxt, t) {
  const m = minutes(startMs(nxt) - t), hm = oslo(startMs(nxt)).hm;
  const label = m < 12 * 60 || nxt.date === oslo(t).date ? `om ${durText(m)}` : nxt.date === addDays(oslo(t).date, 1) ? `i morgen ${hm}` : `${shortDay(nxt.date)} ${hm}`;
  return { ...nxt, startsIn: m, inMin: m, label };
}
// Kalender v2: NÅ og NESTE gjelder alle tidfestede hendelser (ikke heldag og frister uten varighet). Ved likt klokkeslett vinner timen.
const timedEvent = (e) => !e.allDay && Date.parse(e.end) > Date.parse(e.start);
const lessonFirst = (a, b) => startMs(a) - startMs(b) || (isLesson(b) ? 1 : 0) - (isLesson(a) ? 1 : 0);

/** NÅ / NESTE (uansett type) / NESTE SKOLEDAG / neste prøve. */
export function nowOf(events, t = Date.now()) {
  const out = lessonNowOf(events, t);
  const timed = events.filter(timedEvent);
  const cur = timed.filter((e) => startMs(e) <= t && t < endMs(e)).sort((a, b) => (isLesson(b) ? 1 : 0) - (isLesson(a) ? 1 : 0) || startMs(b) - startMs(a))[0];
  const nxt = timed.filter((e) => startMs(e) > t).sort(lessonFirst)[0];
  if (cur) out.current = currentOut(cur, t); else delete out.current;
  if (nxt) out.next = nextOut(nxt, t); else delete out.next;
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (v) => { if (!v) return null; if (DATE.test(v)) return v; const t = Date.parse(v); return Number.isFinite(t) ? oslo(t).date : undefined; };
const nowParam = (c) => { const v = c.req.query('now'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : Date.now(); };
// Mandagen i uken (i helgen: neste uke, som uke-visningen).
const mondayOf = (date) => { const wd = weekdayOf(date); return wd === 0 ? addDays(date, 1) : wd === 6 ? addDays(date, 2) : addDays(date, 1 - wd); };

export async function calendarOut(user, { from, to, now = Date.now() } = {}) {
  const today = oslo(now).date;
  const fromDate = from ?? mondayOf(today), toDate = to ?? addDays(fromDate, 41);
  const [{ events, sources, ctx }, ahead] = await Promise.all([eventsFor(user, fromDate, toDate), eventsFor(user, today, addDays(today, 120))]);
  const subjects = {};
  for (const e of [...events, ...ahead.events]) if (e.type === 'time' && e.subject && !subjects[e.subject]) subjects[e.subject] = e.color;
  for (const [n, c] of Object.entries(ctx.colors)) subjects[n] = c;
  return { from: fromDate, to: toDate, today, events, subjects, labColor: LAB, sources, calendars: calendarsOut(user), now: nowOf(ahead.events, now), updatedAt: new Date().toISOString() };
}

/** Skrive til Privat/Familie: Google med skrivetilgang, ellers lokalt i kv(user,'kal_local_events') når Google ikke er koblet til (prompt 29: rask time skal virke uten Google). */
const writeMode = (user) => (googleConnected(user) ? (googleCanWrite(user) ? 'google' : 'reconnect') : 'local');
/** Kalenderne med av/på fra layout-feltet kalFilters ({id: bool} der true = vises, eller en liste med skjulte id-er). */
export function calendarsOut(user) {
  const f = layoutOf(user).kalFilters;
  const enabled = (id) => (Array.isArray(f) ? !f.includes(id) : f && typeof f === 'object' && typeof f[id] === 'boolean' ? f[id] : true);
  const w = writeMode(user) === 'google' || writeMode(user) === 'local';
  return CALENDARS.map((c) => ({ ...c, writable: c.writable && w, enabled: enabled(c.id) }));
}

const brief = (e) => e && ({ id: e.id, title: e.title, short: e.short, subject: e.subject, room: e.room, teacher: e.teacher, start: e.start, end: e.end, allDay: e.allDay, date: e.date, time: e.time, type: e.type, color: e.color,
  ...(e.minutesLeft != null ? { minutesLeft: e.minutesLeft, leftMin: e.minutesLeft, progress: e.progress } : {}), ...(e.startsIn != null ? { startsIn: e.startsIn, inMin: e.startsIn } : {}), ...(e.daysLeft != null ? { daysLeft: e.daysLeft, urgent: e.urgent } : {}), ...(e.label ? { label: e.label } : {}) });

/** Widget og Hjem: NÅ, NESTE, dagens timer, de to neste prøvene og neste skoledag etter skoletid. */
export async function widgetOut(user, now = Date.now()) {
  const today = oslo(now).date;
  const { events, sources } = await eventsFor(user, today, addDays(today, 120));
  const n = lessonNowOf(events, now);
  const lessons = events.filter((e) => isLesson(e) && e.date === today);
  const after = !n.current && !n.next;
  const next = n.current ? lessons.find((e) => startMs(e) >= endMs(n.current)) : n.next;
  const tests = events.filter((e) => (e.type === 'prove' || e.type === 'innl') && (e.allDay ? e.date >= today : endMs(e) > now)).slice(0, 2)
    .map((e) => { const d = daysBetween(today, e.date); return { ...brief(e), daysLeft: d, urgent: d <= 7, label: d === 0 ? 'i dag' : d === 1 ? 'i morgen' : `om ${d} dager` }; });
  // Oppdateringstidspunkter: start og slutt på hver time i dag, og midnatt.
  const marks = [...new Set(lessons.flatMap((e) => [startMs(e), endMs(e)]).filter((x) => x > now))].sort((a, b) => a - b);
  marks.push(osloAt(addDays(today, 1)));
  return {
    kind: n.current ? 'now' : n.next ? 'next' : n.nextSchoolDay ? 'nextDay' : 'free',
    now: brief(n.current) ?? null,
    next: next ? brief(n.current ? { ...next, startsIn: minutes(startMs(next) - now), label: `om ${durText(minutes(startMs(next) - now))}` } : n.next) : null,
    today: { date: today, label: dayLabel(today), short: shortDay(today), count: lessons.length, events: lessons.map((e) => ({ ...brief(e), past: endMs(e) <= now })) },
    tests,
    nextSchoolDay: after && n.nextSchoolDay ? { date: n.nextSchoolDay.date, label: n.nextSchoolDay.label, weekday: n.nextSchoolDay.weekday, daysAway: n.nextSchoolDay.daysAway, first: brief(n.nextSchoolDay.first), events: n.nextSchoolDay.events.map(brief), count: n.nextSchoolDay.count } : null,
    configured: sources.some((s) => (s.id === 'ical' || s.id === 'canvas') && s.configured),
    refreshAt: marks.map((x) => new Date(x).toISOString()), url: 'finanshub://kalender', updatedAt: new Date().toISOString(),
  };
}

/** Test for Integrasjoner → Kalendere: henter skole- og Canvas-kalenderen og teller hendelsene. */
export async function testCalendars(user) {
  const res = [];
  let ok = false, any = false;
  for (const [id, key, name] of [['ical', 'cal_ics', 'Skole-iCal'], ['canvas', 'canvas_ics', 'Canvas-iCal']]) {
    const { url, mock } = sourceUrl(user, key);
    if (!url && !mock) { res.push(`${name}: ikke satt opp`); continue; }
    any = true;
    try {
      const n = (url ? parse(await fetchText(url)) : parse(await mockText(id))).events.filter((e) => !e.props.has('RECURRENCE-ID')).length; // flyttede timer telles ikke
      res.push(`${name}: ${n} ${n === 1 ? 'hendelse' : 'hendelser'}${url ? '' : ' (demo)'}`); ok = true;
    } catch (e) {
      if (MOCK && !fetchImpl) { res.push(`${name}: demodata (MOCK_DATA=1)`); ok = true; } else res.push(`${name}: ${srcErr(e)}`);
    }
  }
  if (!any) return { ok: false, code: 'missing', message: 'Legg inn Skole-iCal eller Canvas-iCal.' };
  return { ok, message: res.join(' · '), ...(MOCK && !fetchImpl ? { mock: true } : {}) };
}
/** true hvis user har lagt inn en kalenderadresse selv. */
export const calendarConfigured = (user) => userCfgSet(user, 'cal_ics') || userCfgSet(user, 'canvas_ics');

/* ---------------- API ---------------- */

const api = new Hono();
api.use('*', authOrToken);
api.get('/', async (c) => {
  const from = dateParam(c.req.query('from')), to = dateParam(c.req.query('to'));
  if (from === undefined || to === undefined) return c.json({ error: 'from og to må være datoer (YYYY-MM-DD)' }, 400);
  if (from && to && (to < from || daysBetween(from, to) > 400)) return c.json({ error: 'Ugyldig periode (maks 400 dager)' }, 400);
  const now = nowParam(c);
  const f = from ?? (to ? addDays(to, -41) : undefined);
  return c.json(await calendarOut(c.get('user'), { from: f, to: to ?? (f ? addDays(f, 41) : undefined), now }));
});
api.post('/refresh', async (c) => {
  const u = c.get('user');
  clearCalendarCache(u); // bare brukerens egne kalendere hentes på nytt
  return c.json(await calendarOut(u, { now: nowParam(c) }));
});

/* ---------------- Prompt 27: søk ---------------- */

/** Små bokstaver uten aksenter, men æøå beholdes (samme normalisering som Finans-forslagene). */
export const normText = (v) => String(v ?? '').toLowerCase().replace(/å/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'å').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
/** 4 = tittelen starter med søket, 3 = et ord starter med det, 2 = inneholder, 1 = skrivefeil (Levenshtein ≤ 1, søk ≥ 4 tegn), 0 = nei. */
export function matchScore(q, ...fields) {
  const qn = normText(q);
  if (!qn) return 0;
  const hay = fields.map(normText).filter(Boolean);
  if (hay[0]?.startsWith(qn)) return 4;
  const words = hay.flatMap((h) => h.split(/[\s,.;:()/–-]+/).filter(Boolean));
  const toks = qn.split(' ');
  if (toks.every((t) => words.some((w) => w.startsWith(t)))) return 3;
  if (hay.some((h) => h.includes(qn))) return 2;
  if (toks.every((t) => words.some((w) => w.startsWith(t) || (t.length >= 4 && (lev(t, w) <= 1 || lev(t, w.slice(0, t.length)) <= 1))))) return 1;
  return 0;
}
api.get('/search', async (c) => {
  const q = String(c.req.query('q') ?? '').trim().slice(0, 100);
  if (!q) return c.json({ q, events: [] });
  const now = nowParam(c), today = oslo(now).date;
  const { events } = await eventsFor(c.get('user'), addDays(today, -180), addDays(today, 180));
  const hits = events.map((e) => ({ e, s: matchScore(q, e.title, e.room, e.teacher, e.subject ?? '') })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || ((a.e.date >= today) === (b.e.date >= today) ? (a.e.date >= today ? (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : 0) : (a.e.date > b.e.date ? -1 : a.e.date < b.e.date ? 1 : 0)) : a.e.date >= today ? -1 : 1));
  return c.json({ q, events: hits.slice(0, 100).map((x) => x.e), total: hits.length });
});

/* ---------------- Prompt 27: egne hendelser (Privat/Familie) ---------------- */

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const REPEATS = ['none', 'daily', 'weekly', 'monthly'], REMINDERS = ['none', '15m', '1h', 'day'], WRITABLE = ['privat', 'familie'];
const addHour = (hm) => { const [h, m] = hm.split(':').map(Number); return `${pad(Math.min(23, h + 1))}:${pad(h + 1 > 23 ? 59 : m)}`; };
/** Validerer {title, allDay, date, start, end, endDate, location, calendar, repeat, reminder, note} (base = eksisterende verdier). */
export function eventInput(b, base = {}) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Forventet et objekt' };
  const v = { title: '', allDay: false, date: null, start: null, end: null, endDate: null, location: '', calendar: 'privat', repeat: 'none', reminder: 'none', note: '', ...base };
  for (const k of Object.keys(v)) if (b[k] !== undefined) v[k] = b[k];
  v.title = String(v.title ?? '').trim().replace(/\s+/g, ' ');
  if (!v.title || v.title.length > 200) return { error: 'Tittelen må være 1–200 tegn' };
  if (typeof v.allDay !== 'boolean') return { error: 'allDay må være true/false' };
  if (!DATE.test(String(v.date ?? ''))) return { error: 'Ugyldig dato (YYYY-MM-DD)' };
  if (v.endDate != null && v.endDate !== '' && (!DATE.test(String(v.endDate)) || v.endDate < v.date)) return { error: 'Ugyldig sluttdato' };
  if (!v.endDate) v.endDate = null;
  if (v.allDay) { v.start = null; v.end = null; }
  else {
    if (!HM.test(String(v.start ?? ''))) return { error: 'Ugyldig starttid (HH:MM)' };
    if (v.end == null || v.end === '') v.end = addHour(v.start);
    if (!HM.test(String(v.end))) return { error: 'Ugyldig sluttid (HH:MM)' };
    if ((v.endDate ?? v.date) === v.date && v.end < v.start) v.endDate = addDays(v.date, 1);
  }
  v.location = String(v.location ?? '').trim().slice(0, 200);
  v.note = String(v.note ?? '').trim().slice(0, 2000);
  if (!WRITABLE.includes(v.calendar)) return { error: 'Kalenderen må være privat eller familie' };
  if (!REPEATS.includes(v.repeat)) return { error: 'repeat må være none, daily, weekly eller monthly' };
  if (!REMINDERS.includes(v.reminder)) return { error: 'reminder må være none, 15m, 1h eller day' };
  return { value: v };
}
function gTime(date, hm) {
  const [y, m, d] = ymd(date), [h, mi] = hm.split(':').map(Number);
  const off = Math.round((Date.UTC(y, m - 1, d, h, mi) - osloAt(date, hm)) / 60_000); // +120 sommertid, +60 vintertid
  return { dateTime: `${date}T${hm}:00${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`, timeZone: TZ };
}
export const googleBody = (v) => ({
  summary: v.title, location: v.location, description: v.note,
  start: v.allDay ? { date: v.date } : gTime(v.date, v.start),
  end: v.allDay ? { date: addDays(v.endDate ?? v.date, 1) } : gTime(v.endDate ?? v.date, v.end),
  recurrence: v.repeat === 'none' ? [] : [`RRULE:FREQ=${{ daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[v.repeat]}`],
  reminders: { useDefault: false, overrides: v.reminder === 'none' ? [] : [{ method: 'popup', minutes: REMINDER_MIN[v.reminder] }] },
  extendedProperties: { private: { hl_kal: '1', hl_repeat: v.repeat, ...(v.origin ? { hl_origin: String(v.origin).slice(0, 60) } : {}) } },
});
/** Verdiene i skjemaet fra en hendelse i svaret. */
const inputOf = (e) => ({ title: e.title, allDay: e.allDay, date: e.date, start: e.allDay ? null : oslo(Date.parse(e.start)).hm, end: e.allDay ? null : oslo(Date.parse(e.end)).hm,
  endDate: e.allDay ? (addDays(e.end, -1) > e.date ? addDays(e.end, -1) : null) : (oslo(Date.parse(e.end)).date > e.date ? oslo(Date.parse(e.end)).date : null),
  location: e.room ?? '', calendar: WRITABLE.includes(e.calendar) ? e.calendar : 'privat', repeat: REPEATS.includes(e.recurrence) ? e.recurrence : 'none', reminder: REMINDERS.includes(e.reminder) ? e.reminder : 'none', note: e.note ?? '' });

/** Hendelsen med id-en (fra svaret), eller null. Id-ene slutter med datoen, så bare den dagen leses. */
export async function findEvent(user, id) {
  const base = String(id).split('~')[0];
  const local = localList(user).find((e) => e.id === base);
  const m = String(id).match(/(?:-|~)(\d{4})(\d{2})(\d{2})(?:T\d{4})?$/);
  const date = m ? `${m[1]}-${m[2]}-${m[3]}` : local?.date;
  if (!date) return null;
  const { events } = await eventsFor(user, addDays(date, -1), addDays(date, 1));
  return events.find((e) => e.id === id) ?? (local ? events.find((e) => String(e.id).split('~')[0] === base) ?? null : null);
}
const fail = (c, e) => (e?.status === 409 ? c.json({ error: e.message, reconnect: true }, 409) : c.json({ error: String(e?.message ?? e).slice(0, 300) }, e?.status && e.status < 500 ? e.status : 502));

/** Lager en hendelse i Privat/Familie (Google når koblet, ellers lokal i MOCK_DATA=1). v fra eventInput (+ origin). Brukes også av rask time (prompt 29). */
export async function createEvent(user, v) {
  const mode = writeMode(user);
  if (mode === 'reconnect' || mode === 'none') throw Object.assign(new Error(mode === 'none' ? 'Logg inn med Google (Innstillinger → Kalendere) for å lagre i Privat eller Familie.' : 'Google-koblingen mangler skrivetilgang til kalenderen. Logg inn med Google på nytt.'), { status: 409, reconnect: true });
  if (mode === 'local') {
    const e = { id: `loc-${randomBytes(5).toString('hex')}`, ...v, created: new Date().toISOString() };
    const list = localList(user);
    if (list.length >= 2000) throw Object.assign(new Error('For mange lokale hendelser'), { status: 400 });
    kv.set(user, 'kal_local_events', [...list, e]);
    clearCalendarCache(user);
    // Filtre (kalFilters) eller fri-regler kan skjule hendelsen i visningen; svar likevel med id-en så rask time kan angre.
    return (await eventsFor(user, v.date, v.date)).events.find((x) => String(x.id).split('~')[0] === e.id) ?? { ...v, id: e.id, source: 'local', editable: true };
  }
  const ids = await googleCalendarIds(user);
  const calId = v.calendar === 'familie' ? ids.familie : ids.privat;
  if (!calId) throw Object.assign(new Error('Fant ingen Familie-kalender i Google. Lag en kalender som heter «Familie» og prøv igjen.'), { status: 400 });
  const g = await googleEventWrite(user, 'POST', calId, null, googleBody(v));
  clearCalendarCache(user);
  return googleOut(user, [g], v.calendar, calId, ctxOf(user))[0] ?? null;
}

api.post('/events', async (c) => {
  const user = c.get('user');
  const r = eventInput(await c.req.json().catch(() => null));
  if (r.error) return c.json({ error: r.error }, 400);
  try { return c.json({ ok: true, event: await createEvent(user, r.value) }, 201); } catch (e) { return fail(c, e); }
});
/** Endrer en egen hendelse (Privat/Familie). patch = felter fra skjemaet. → hendelsen, eller kaster {status}. Brukes også av
 *  «Glimt husker» (POST /api/glimt/memory/:id/apply). */
export async function updateEvent(user, id, patch, ev0 = null) {
  const ev = ev0 ?? await findEvent(user, id);
  if (!ev) throw Object.assign(new Error('Fant ikke hendelsen'), { status: 404 });
  if (!ev.editable) throw Object.assign(new Error('Skolens hendelser kan ikke endres. Kopier til Privat for å lage din egen.'), { status: 403 });
  const r = eventInput(patch, inputOf(ev));
  if (r.error) throw Object.assign(new Error(r.error), { status: 400 });
  const v = r.value;
  if (ev.source === 'local') {
    const base = String(id).split('~')[0];
    kv.set(user, 'kal_local_events', localList(user).map((e) => (e.id === base ? { ...e, ...v, updated: new Date().toISOString() } : e)));
    clearCalendarCache(user);
    return (await eventsFor(user, v.date, v.date)).events.find((x) => String(x.id).split('~')[0] === base) ?? null;
  }
  const ids = await googleCalendarIds(user);
  const target = v.calendar === 'familie' ? ids.familie : ids.privat;
  if (target && target !== ev.googleCalendarId) { // flyttet mellom Privat og Familie: ny i målkalenderen, slett den gamle
    const out = await createEvent(user, v);
    await googleEventWrite(user, 'DELETE', ev.googleCalendarId, ev.googleId);
    clearCalendarCache(user);
    return out;
  }
  const body = googleBody(v);
  // Én forekomst i en serie (eller en serie laget utenfor appen): gjentakelsen sendes ikke.
  if (gIndex.get(user)?.get(id)?.instance || (ev.recurrence === 'custom' && v.repeat === 'none')) delete body.recurrence;
  const g = await googleEventWrite(user, 'PATCH', ev.googleCalendarId, ev.googleId, body);
  clearCalendarCache(user);
  return googleOut(user, [g], ev.calendar, ev.googleCalendarId, ctxOf(user))[0] ?? null;
}
// Prompt 33: én hendelse (detaljarket). Lagrer den som «sist viste hendelse» for Glimt («det var frisør»).
api.get('/events/:id', async (c) => {
  const user = c.get('user');
  const ev = await findEvent(user, c.req.param('id'));
  if (!ev) return c.json({ error: 'Fant ikke hendelsen' }, 404);
  rememberShown(user, ev);
  return c.json({ event: ev });
});
api.patch('/events/:id', async (c) => {
  const user = c.get('user'), id = c.req.param('id');
  const ev = await findEvent(user, id);
  if (!ev) return c.json({ error: 'Fant ikke hendelsen' }, 404);
  if (!ev.editable) return c.json({ error: 'Skolens hendelser kan ikke endres. Kopier til Privat for å lage din egen.' }, 403);
  const b = await c.req.json().catch(() => null);
  const r = eventInput(b, inputOf(ev));
  if (r.error) return c.json({ error: r.error }, 400);
  try {
    const out = await updateEvent(user, id, b, ev);
    // Prompt 33: brukeren endret selv tittelen på en rask time → foreslå et alias (lagres ikke automatisk).
    const suggestMemory = r.value.title !== ev.title ? memorySuggestion(user, ev, r.value.title) : null;
    return c.json({ ok: true, event: out, ...(suggestMemory ? { suggestMemory } : {}) });
  } catch (e) { return fail(c, e); }
});
api.delete('/events/:id', async (c) => {
  const user = c.get('user'), id = c.req.param('id');
  const ev = await findEvent(user, id);
  if (!ev) return c.json({ error: 'Fant ikke hendelsen' }, 404);
  if (!ev.editable) return c.json({ error: 'Skolens hendelser kan ikke slettes.' }, 403);
  try {
    if (ev.source === 'local') { const base = String(id).split('~')[0]; kv.set(user, 'kal_local_events', localList(user).filter((e) => e.id !== base)); }
    else await googleEventWrite(user, 'DELETE', ev.googleCalendarId, ev.googleId);
    clearCalendarCache(user);
    return c.json({ ok: true });
  } catch (e) { return fail(c, e); }
});
/** Prompt 29 (angre rask time): sletter en egen hendelse. → {ok} eller kaster {status}. */
export async function deleteEvent(user, id) {
  const base0 = String(id).split('~')[0];
  if (/^loc-[0-9a-f]{10}$/.test(base0) && localList(user).some((e) => e.id === base0)) {
    kv.set(user, 'kal_local_events', localList(user).filter((e) => e.id !== base0));
    clearCalendarCache(user);
    return { ok: true };
  }
  const ev = await findEvent(user, id);
  if (!ev) throw Object.assign(new Error('Fant ikke hendelsen'), { status: 404 });
  if (!ev.editable) throw Object.assign(new Error('Skolens hendelser kan ikke slettes.'), { status: 403 });
  if (ev.source === 'local') { const base = String(id).split('~')[0]; kv.set(user, 'kal_local_events', localList(user).filter((e) => e.id !== base)); }
  else await googleEventWrite(user, 'DELETE', ev.googleCalendarId, ev.googleId);
  clearCalendarCache(user);
  return { ok: true };
}
// Kopier til Privat: skolens hendelse (eller en annen) blir en egen hendelse man kan endre.
api.post('/events/:id/copy', async (c) => {
  const user = c.get('user');
  const ev = await findEvent(user, c.req.param('id'));
  if (!ev) return c.json({ error: 'Fant ikke hendelsen' }, 404);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const base = inputOf(ev);
  const note = [ev.note, ev.teacher ? `Lærer: ${ev.teacher}` : ''].filter(Boolean).join('\n');
  const r = eventInput({ ...base, calendar: WRITABLE.includes(b.calendar) ? b.calendar : 'privat', repeat: 'none', reminder: REMINDERS.includes(b.reminder) ? b.reminder : ev.reminder && REMINDERS.includes(ev.reminder) ? ev.reminder : 'none', note });
  if (r.error) return c.json({ error: r.error }, 400);
  try { return c.json({ ok: true, event: await createEvent(user, r.value) }, 201); } catch (e) { return fail(c, e); }
});
export default api;

export const widgetApi = new Hono();
widgetApi.get('/', authOrToken, async (c) => c.json(await widgetOut(c.get('user'), nowParam(c))));

