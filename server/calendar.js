// Kalender med skoletimeplan (prompt 26). Per bruker: skolens iCal (cal_ics), valgfri Canvas-iCal (canvas_ics), Bursdager og
// Google Kalender (koblingen fra Bursdager). Sesjon eller app-token (authOrToken).
//   GET  /api/kalender?from=YYYY-MM-DD&to=YYYY-MM-DD[&now=ISO]
//        → {from, to, events:[{id, title, short, subject, room, teacher, note, start, end, allDay, date, time, inAllDayRow,
//            type:'time'|'prove'|'innl'|'bursdag'|'skole'|'fri', color, source:'ical'|'canvas'|'birthdays'|'google',
//            reminder, url?, mazemap?}], subjects:{navn: farge}, sources:[…], now:{current?, next?, nextSchoolDay?, nextTest?}}
//   POST /api/kalender/refresh → henter kalenderne på nytt nå (ellers caches de én time per bruker og adresse)
//   GET  /api/widgets/calendar[?now=ISO] → kompakt til widgets og Hjem: {kind, now, next, today, tests, nextSchoolDay, refreshAt}
// Regler (claude-code-kalender.md):
//  - Gjentakelser (RRULE, EXDATE, RECURRENCE-ID) utvides med node-ical, i norsk tid (Europe/Oslo).
//  - Fag fra SUMMARY, rom fra LOCATION, lærer fra DESCRIPTION («Lærer: …») eller ORGANIZER (CN).
//  - Type: «prøve», «heldag», «muntlig», «eksamen» → prove; «innlevering», «frist» → innl (tittel eller CATEGORIES).
//    Heldagshendelser med «fri», «planleggingsdag» eller «ferie» → fri, og timene de dagene fjernes.
//    En prøve med klokkeslett erstatter timer som overlapper den samme dag.
//  - Fagfarger fra en fast palett (Kalender.dc.html), overstyrt av brukerens subjectColors. Prøver og frister er alltid lab-røde.
// MOCK_DATA=1: eieren får en realistisk timeplan (mock.js) når cal_ics/canvas_ics ikke er satt. Feiler en adresse i demo,
// brukes demokalenderen (merket mock). Andre brukere får bare demo når de har lagt inn en adresse selv.
import { Hono } from 'hono';
import ical from 'node-ical';
import { createHash } from 'node:crypto';
import { OWNER } from './db.js';
import { userCfg, userCfgSet } from './settings.js';
import { cached } from './cache.js';
import { authOrToken, layoutOf } from './mobile.js';
import { listFor as birthdaysOf, googleCalendarEvents } from './birthdays.js';

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
export function typeOf({ title = '', categories = [], allDay = false, source = 'ical', recurring = false, subjectKnown = false, durationMs = 0 }) {
  const t = `${title} ${[categories].flat().filter(Boolean).join(' ')}`;
  if (/prøve|heldag|muntlig|eksamen|\btentamen|\bquiz\b|\btest\b/i.test(t)) return 'prove';
  if (/innlever|\bfrist|deadline|\bdue\b/i.test(t)) return 'innl';
  if (allDay && /(^|[\s(–-])(skole)?fri(dag)?\b|planleggingsdag|ferie\b|ferie\s|\bferie|helligdag/i.test(t)) return 'fri';
  if (source === 'canvas') return allDay || durationMs === 0 ? 'innl' : 'skole';
  if (allDay || source === 'google') return 'skole';
  if (recurring || subjectKnown) return 'time';
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
const parse = (text) => {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Adressen svarte, men det er ikke en iCal-kalender.');
  return Object.values(ical.sync.parseICS(text)).filter((x) => x && x.type === 'VEVENT' && x.start);
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

const val = (v) => (v && typeof v === 'object' && 'val' in v ? v.val : v);
const textOf = (v) => String(val(v) ?? '').trim();
function teacherOf(ev, desc) {
  const m = desc.match(/^\s*(?:lærer|faglærer|teacher|underviser)\s*[:–-]\s*(.+)$/im);
  if (m) return m[1].trim().slice(0, 80);
  const o = ev.organizer;
  const cn = o && typeof o === 'object' ? o.params?.CN : null;
  if (cn) return String(cn).replace(/^"|"$/g, '').trim().slice(0, 80);
  const mail = String(val(o) ?? '').replace(/^mailto:/i, '');
  return mail && !/noreply|no-reply/i.test(mail) ? mail.split('@')[0].replace(/[._]/g, ' ').slice(0, 80) : '';
}
const noteOf = (desc) => desc.replace(/^\s*(?:lærer|faglærer|teacher|underviser)\s*[:–-].*$/gim, '').replace(/\n{2,}/g, '\n').trim().slice(0, 500);
const mazemapOf = (room, campus) => {
  if (!room || /^(canvas|teams|zoom|digital|nett)/i.test(room)) return null;
  return `https://use.mazemap.com/#v=1${campus ? `&campusid=${encodeURIComponent(campus)}` : ''}&search=${encodeURIComponent(room)}`;
};

function eventOut({ src, uid, title, subjectHint = '', start, end, allDay, room = '', desc = '', teacher = '', categories = [], recurring = false, url = null }, ctx) {
  const subj = subjectHint && subjectOf(subjectHint, ctx.colors).known ? subjectOf(subjectHint, ctx.colors) : subjectOf(title, ctx.colors);
  const durationMs = allDay ? 0 : end - start;
  const type = src === 'birthdays' ? 'bursdag' : typeOf({ title, categories, allDay, source: src, recurring, subjectKnown: subj.known, durationMs });
  const lesson = type === 'time';
  const subject = lesson || ((type === 'prove' || type === 'innl') && subj.known) ? subj.name : null;
  const color = type === 'prove' || type === 'innl' ? LAB : type === 'bursdag' ? BDAY : type === 'time' ? subj.color : SCHOOL;
  const s = allDay ? null : oslo(start), e = allDay ? null : oslo(end);
  const date = allDay ? localYmd(start) : s.date;
  const endDate = allDay ? localYmd(end) : e.date;
  const key = allDay ? date.replace(/-/g, '') : `${date.replace(/-/g, '')}T${s.hm.replace(':', '')}`;
  const id = `${{ ical: 'ical', canvas: 'cv', birthdays: 'bd', google: 'g' }[src]}-${hashOf(uid).slice(0, 10)}-${key}`;
  const outside = !allDay && (s.min < 8 * 60 || (e.date === s.date ? e.min > 16 * 60 : true) || durationMs === 0);
  const ev = {
    id, title, short: lesson ? subj.short : title.length > 18 ? title.slice(0, 17) + '…' : title, subject, room, teacher, note: noteOf(desc),
    start: allDay ? date : new Date(start).toISOString(), end: allDay ? (endDate > date ? endDate : addDays(date, 1)) : new Date(end).toISOString(),
    allDay, date, time: allDay ? null : durationMs === 0 ? s.hm : `${s.hm}–${e.hm}`, inAllDayRow: allDay || outside,
    type, color, source: src, reminder: ctx.reminders[id] ?? (type === 'prove' || type === 'innl' ? 'day' : 'none'),
  };
  if (url) ev.url = url;
  const mz = (lesson || type === 'prove') && mazemapOf(room, ctx.campus);
  if (mz) ev.mazemap = mz;
  return ev;
}

function expandIcs(items, src, from, to, ctx) {
  const out = [];
  for (const ev of items) {
    let inst;
    try { inst = ical.expandRecurringEvent(ev, { from: new Date(from), to: new Date(to), expandOngoing: true }); } catch { continue; }
    for (const i of inst) {
      const e = i.event ?? ev;
      let title = textOf(e.summary) || textOf(ev.summary) || '(uten tittel)';
      // Canvas legger emnet i klammer bak tittelen («Innlevering historie [Historie 3STA]»): emnet brukes til faget, ikke i tittelen.
      const course = src === 'canvas' ? title.match(/\s*\[([^\]]+)\]\s*$/) : null;
      if (course) title = title.slice(0, course.index).trim() || title;
      const desc = textOf(e.description ?? ev.description);
      const start = i.start.getTime(), end = Math.max(start, (i.end ?? i.start).getTime());
      out.push(eventOut({ src, uid: textOf(ev.uid) || title, title, subjectHint: course?.[1], start, end: i.isFullDay && end === start ? start + DAY : end, allDay: !!i.isFullDay,
        room: textOf(e.location ?? ev.location), desc, teacher: teacherOf(e.organizer ? e : ev, desc), categories: e.categories ?? ev.categories ?? [],
        recurring: !!ev.rrule, url: textOf(e.url ?? ev.url) || null }, ctx));
    }
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
      const ev = eventOut({ src: 'birthdays', uid: `bd${b.id}`, title: `${b.name} har bursdag`, start: s, end: e, allDay: true, desc: age ? `Fyller ${age}` : '', url: b.googleUrl }, ctx);
      out.push(ev);
    }
  }
  return out;
}

function googleOut(items, ctx) {
  return items.map((g) => {
    const allDay = !!g.start?.date;
    const start = allDay ? new Date(`${g.start.date}T00:00:00`) : new Date(g.start?.dateTime ?? g.start);
    const end = allDay ? new Date(`${g.end?.date ?? addDays(g.start.date, 1)}T00:00:00`) : new Date(g.end?.dateTime ?? start);
    return eventOut({ src: 'google', uid: g.id, title: String(g.summary ?? '(uten tittel)'), start: start.getTime(), end: end.getTime(), allDay, room: String(g.location ?? ''),
      desc: String(g.description ?? '').replace(/<[^>]+>/g, ''), teacher: '', url: g.htmlLink ?? null }, ctx);
  }).filter((e) => e.start && !Number.isNaN(Date.parse(e.allDay ? `${e.start}T00:00:00Z` : e.start)));
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
    // Samme hendelse fra to kilder (f.eks. prøven både i skolekalenderen og Canvas): bare den første.
    const k = `${e.title.toLowerCase()}|${e.start}`;
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
    const items = await cached(`kal:${user}:${genOf(user)}:google:${fromDate}:${toDate}`, 15 * 60_000, async () => ({ list: await googleCalendarEvents(user, from, to) }));
    const list = items.list ? googleOut(items.list, ctx) : [];
    events.push(...list);
    sources.push({ id: 'google', name: 'Google Kalender', configured: !!items.list, ok: true, count: list.length });
  } catch (e) { sources.push({ id: 'google', name: 'Google Kalender', configured: true, ok: false, count: 0, error: srcErr(e) }); }
  events = applyRules(events).filter((e) => (e.allDay ? e.end > fromDate && e.date <= toDate : e.date >= fromDate && e.date <= toDate));
  for (const s of sources) if (s.ok) s.count = events.filter((e) => e.source === s.id).length; // antall i perioden, etter reglene
  return { events, sources, ctx };
}

const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));
const durText = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m / 60} t`);
const isLesson = (e) => !e.allDay && (e.type === 'time' || e.type === 'prove');
const startMs = (e) => (e.allDay ? osloAt(e.date) : Date.parse(e.start));
const endMs = (e) => (e.allDay ? osloAt(e.end) : Date.parse(e.end));

/** NÅ / NESTE TIME / NESTE SKOLEDAG / neste prøve ut fra hendelsene (som må dekke i dag og fremover). */
export function nowOf(events, t = Date.now()) {
  const today = oslo(t).date;
  const lessons = events.filter(isLesson);
  const todays = lessons.filter((e) => e.date === today);
  const cur = todays.find((e) => startMs(e) <= t && t < endMs(e));
  const nxt = todays.find((e) => startMs(e) > t);
  const out = {};
  if (cur) { const len = endMs(cur) - startMs(cur); out.current = { ...cur, minutesLeft: minutes(endMs(cur) - t), progress: len ? Math.min(1, Math.max(0, (t - startMs(cur)) / len)) : 1, label: `${durText(minutes(endMs(cur) - t))} igjen` }; }
  if (nxt) out.next = { ...nxt, startsIn: minutes(startMs(nxt) - t), label: `om ${durText(minutes(startMs(nxt) - t))}` };
  const nd = lessons.find((e) => e.date > today);
  if (nd) {
    const list = lessons.filter((e) => e.date === nd.date);
    out.nextSchoolDay = { date: nd.date, label: dayLabel(nd.date), weekday: WEEKDAYS[weekdayOf(nd.date)], daysAway: daysBetween(today, nd.date), first: list[0], events: list, count: list.length };
  }
  const test = events.find((e) => (e.type === 'prove' || e.type === 'innl') && (e.allDay ? e.date >= today : endMs(e) > t));
  if (test) { const n = daysBetween(today, test.date); out.nextTest = { ...test, daysLeft: n, urgent: n <= 7, label: `${test.title} ${n === 0 ? 'i dag' : n === 1 ? 'i morgen' : `om ${n} dager`}` }; }
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
  return { from: fromDate, to: toDate, today, events, subjects, labColor: LAB, sources, now: nowOf(ahead.events, now), updatedAt: new Date().toISOString() };
}

const brief = (e) => e && ({ id: e.id, title: e.title, short: e.short, subject: e.subject, room: e.room, teacher: e.teacher, start: e.start, end: e.end, allDay: e.allDay, date: e.date, time: e.time, type: e.type, color: e.color,
  ...(e.minutesLeft != null ? { minutesLeft: e.minutesLeft, progress: e.progress } : {}), ...(e.startsIn != null ? { startsIn: e.startsIn } : {}), ...(e.daysLeft != null ? { daysLeft: e.daysLeft, urgent: e.urgent } : {}), ...(e.label ? { label: e.label } : {}) });

/** Widget og Hjem: NÅ, NESTE, dagens timer, de to neste prøvene og neste skoledag etter skoletid. */
export async function widgetOut(user, now = Date.now()) {
  const today = oslo(now).date;
  const { events, sources } = await eventsFor(user, today, addDays(today, 120));
  const n = nowOf(events, now);
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
      const items = url ? parse(await fetchText(url)) : parse(await mockText(id));
      res.push(`${name}: ${items.length} ${items.length === 1 ? 'hendelse' : 'hendelser'}${url ? '' : ' (demo)'}`); ok = true;
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
export default api;

export const widgetApi = new Hono();
widgetApi.get('/', authOrToken, async (c) => c.json(await widgetOut(c.get('user'), nowParam(c))));

