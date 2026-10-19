// Kalender v2 (prompt 27, Kalender.dc.html variant «web», claude-code-kalender-v2.md).
// Lav toppstripe (fotovinduet uten tittel), så én flate: måned + år, ‹ ›, Dag · 3 dager · Uke · Måned · Liste, søk,
// I dag og «+ Ny hendelse». Under: NESTE / NÅ-stripen, sidepanel med minikalender og kalenderfilter, og visningen.
// Dag/3 dager/Uke: 00–24-rutenett som ruller til nå, rød nålinje, HELE-rad, overlapp side om side, klikk på tom plass
// = ny hendelse på halvtimen. Måned: 6 uker, timer samlet som «4 timer». Liste: 45 dager.
// Ny/rediger skrives til Google Kalender (POST/PATCH/DELETE /api/kalender/events); skolens hendelser er skrivebeskyttet
// og kan kopieres til Privat. Hurtigtaster: ← → · T · D · 3 · W · M · L · N · / · Esc.
// Widget-forhåndsvisningene nederst er fjernet (prompt 27). Hjem-widgeten KALENDER (d_kal/p_kal) er uendret.
// Data: GET /api/kalender (skolens iCal med RRULE ekspandert, Canvas, Bursdager, Google). Svarer serveren 404 (eldre
// versjon), bygges kalenderen fra /api/school og Bursdager her i nettleseren.
// Valg per bruker i /api/me/layout: kalView, kalFilters, kalReminders, subjectColors (og i nettleseren som reserve).
// Prompt 29: kalenderen fyller hele vinduet under toppmenyen (claude-code-kalender-web-full.md), eller fullskjerm uten
// toppmeny (⤢/⤡, ✕ og Esc; calendar_web_layout = menu | full). Under 820 px er sidepanelet en skuff. Nytt Nå/Neste-kort,
// ukenummer i Måned og minikalender (trykk → Uke), og «✦ Skriv time» (rask time i bakgrunnen, kal-quick.js).
import { api, esc, isMobile } from './util.js';
import { store, widget, refresh, emit, on } from './store.js';
import { openSettings } from './settings.js';
import { loadBirthdays } from './birthdays.js';
import { searchField } from './searchfield.js';
import { t, locale, dayName, monthName, fmtDate } from './i18n.js';
import { addQuick, preview, quickLabel, setQuickHooks } from './kal-quick.js';

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MS = MN.map((m) => m.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const LAB = '#b23a2a';
const TYPES = ['time', 'prove', 'innl', 'bursdag', 'skole', 'fri'];
// Kalenderne (samme rekkefølge og farger som designet). Serveren kan sende sin egen liste (calendars).
const CALS0 = [
  { id: 'timeplan', name: 'Timeplan', color: '#2b5d8a', src: 'Skolens iCal', writable: false },
  { id: 'prover', name: 'Prøver og frister', color: LAB, src: 'Skolens iCal', writable: false },
  { id: 'skole', name: 'Skole', color: '#a8661a', src: 'Skolens iCal', writable: false },
  { id: 'privat', name: 'Privat', color: '#6b4fa0', src: 'Google Kalender', writable: true },
  { id: 'familie', name: 'Familie', color: '#d08a1e', src: 'Google · delt med familien', writable: true },
  { id: 'bursdager', name: 'Bursdager', color: '#3f7a6e', src: 'Bursdager-modulen', writable: false },
];
const KIND_CAL = { time: 'timeplan', prove: 'prover', innl: 'prover', skole: 'skole', fri: 'skole', bursdag: 'bursdager' };
// Fast fagpalett (samme som serveren bruker) når serveren ikke sender farge.
const PALETTE = ['#2b5d8a', '#2e6f75', '#a8661a', '#7a3b6b', '#2f7a4f', '#6b5a3a', '#c0562a', '#3f7a6e', '#5b4b8a', '#8a5a2b'];
const SHORT = { 'Matematikk R2': 'Matte R2', 'Matematikk R1': 'Matte R1', 'Matematikk S2': 'Matte S2', 'Matematikk S1': 'Matte S1', Kroppsøving: 'Gym' };
const REMS = [['none', 'Ingen'], ['15m', '15 min før'], ['1h', '1 time før'], ['day', 'Dagen før']];
const REPS = [['none', 'Ingen'], ['daily', 'Hver dag'], ['weekly', 'Hver uke'], ['monthly', 'Hver måned']];
// Visningene: [lokal id, navn, hurtigtast, serverens kalView]
const VIEWS = [['dag', 'Dag', 'D', 'dag'], ['3d', '3 dager', '3', '3dager'], ['uke', 'Uke', 'W', 'uke'], ['mnd', 'Måned', 'M', 'maaned'], ['liste', 'Liste', 'L', 'liste']];
const VIEW_LOC = { dag: 'dag', '3dager': '3d', '3d': '3d', uke: 'uke', maaned: 'mnd', mnd: 'mnd', liste: 'liste', agenda: 'liste' };
const VIEW_SRV = Object.fromEntries(VIEWS.map((v) => [v[0], v[3]]));
const LKEY = 'hl_kal_v1';
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const K = { data: null, err: '', loading: null, at: 0, fallback: false, prefs: false, range: null,
  view: 'uke', cur: null, filt: {}, rem: {}, subjC: {}, sel: null, form: null, srch: null, miniOff: 0, mini: false, delArm: false, toast: '', busy: false,
  full: false, drawer: false, qa: null };
const QA_CHIPS = ['Frisør', 'Lege', 'Tannlege', 'Fysio'];
// Smalt vindu (under 820 px, men ikke mobil): sidepanelet blir en skuff.
const narrow = () => !isMobile() && matchMedia('(max-width: 819px)').matches;
let tickT = null, toastT = null, keyBound = false, gridKey = '', qaT = 0;
const host = () => document.getElementById('kal');

/* ---------------- Datoer ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mm = (s) => { const [a, b] = String(s).split(':'); return +a * 60 + +b; };
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const d0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hmM = (x) => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
const capf = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const isoW = (d) => { const t0 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t0.getUTCDay() || 7; t0.setUTCDate(t0.getUTCDate() + 4 - dn); const y = new Date(Date.UTC(t0.getUTCFullYear(), 0, 1)); return Math.ceil(((t0 - y) / 864e5 + 1) / 7); };
const parseD = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00') : new Date(v));
const dLong = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
const dur = (x) => (x >= 60 ? `${Math.floor(x / 60)} t ${x % 60} min` : `${x} min`);
const dur2 = (x) => (x < 60 ? `${x} min` : x < 1440 ? `${Math.floor(x / 60)} t${x % 60 ? ` ${x % 60} min` : ''}` : `${Math.round(x / 1440)} d`);
const daysTo = (k, today) => Math.round((new Date(k + 'T12:00') - new Date(key(today) + 'T12:00')) / 864e5);
const fromKey = (k) => new Date(k + 'T12:00');
// Ukedag kort (MAN … SØN) og lang dato med Intl, så engelsk får «Monday 19 October».
const wdShort = (d) => dayName(d.getDay(), 'short').replace('.', '').slice(0, 3).toUpperCase();
const longDate = (d) => capf(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
export const semester = (d = new Date()) => `Skole · ${d.getMonth() >= 6 ? 'høst' : 'vår'} ${d.getFullYear()}`;

/* ---------------- Innstillinger per bruker ---------------- */

function readLocal() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null') ?? {}; } catch { return {}; } }
function writeLocal() { try { localStorage.setItem(LKEY, JSON.stringify({ view: K.view, filt: K.filt, rem: K.rem, subjC: K.subjC, full: K.full })); } catch { /* privat modus */ } }
function applyPrefs(p) {
  if (p.view && VIEW_LOC[p.view]) K.view = VIEW_LOC[p.view];
  if (p.full === 'full' || p.full === 'menu') K.full = p.full === 'full'; else if (typeof p.full === 'boolean') K.full = p.full;
  if (p.filt && typeof p.filt === 'object') K.filt = p.filt;
  if (p.rem && typeof p.rem === 'object') K.rem = p.rem;
  if (p.subjC && typeof p.subjC === 'object') K.subjC = p.subjC;
}
async function loadPrefs() {
  if (K.prefs) return;
  K.prefs = true;
  applyPrefs(readLocal());
  try {
    const l = await api('/me/layout');
    applyPrefs({ view: l.kalView, filt: l.kalFilters, rem: l.kalReminders, subjC: l.subjectColors, full: l.calendar_web_layout ?? l.calendar?.web_layout });
    writeLocal();
  } catch { /* eldre server: bare nettleseren */ }
}
/** Lagrer ett felt i /api/me/layout. En eldre server (ukjent nøkkel) avviser det; da gjelder bare nettleseren. */
function savePref(field, value) {
  writeLocal();
  api('/me/layout', { method: 'PUT', json: { [field]: value } }).catch(() => {});
}
export const subjectColors = () => K.subjC;
/** Oppsettet på web: 'menu' (med toppmeny) eller 'full' (fullskjerm). Brukes også av Innstillinger → Kalendere. */
export const webLayout = () => (K.full ? 'full' : 'menu');
export async function setWebLayout(v) {
  await loadPrefs();
  K.full = v === 'full';
  savePref('calendar_web_layout', K.full ? 'full' : 'menu');
  applyFull();
  paint();
}
export async function setSubjectColor(name, c) {
  await loadPrefs();
  if (c) K.subjC = { ...K.subjC, [name]: c }; else { const x = { ...K.subjC }; delete x[name]; K.subjC = x; }
  savePref('subjectColors', { [name]: c || null }); // serveren fletter per fag, null fjerner
  emit('kalender');
}

/* ---------------- Data ---------------- */

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const palette = (s) => (/studietid|fritime/i.test(s) ? '#7a7468' : PALETTE[hash(s) % PALETTE.length]);
function classify(tt, x) {
  if (/prøve|heldag|muntlig|eksamen|tentamen/i.test(tt)) return 'prove';
  if (/innlever|frist|deadline/i.test(tt) || x.deadline) return 'innl';
  if (x.allDay && /\bfri\b|fridag|planleggingsdag|ferie/i.test(tt)) return 'fri';
  if (x.allDay) return 'skole';
  return 'time';
}
function calOf(x, kind) {
  if (x.calendar) return String(x.calendar);
  if (x.source === 'google' || x.googleId) return /famil/i.test(x.googleCalendarId ?? x.calendarName ?? '') ? 'familie' : 'privat';
  if (x.source === 'local') return 'privat';
  return KIND_CAL[kind] ?? 'skole';
}

/** Gjør svaret fra /api/kalender (eller reserven) om til hendelser per dag. */
function normalize(r) {
  const subjects = r.subjects && typeof r.subjects === 'object' ? r.subjects : {};
  const byDay = new Map();
  const push = (k, e) => { (byDay.get(k) ?? byDay.set(k, []).get(k)).push(e); };
  for (const x of r.events ?? []) {
    if (!x || !x.start) continue;
    const st = parseD(x.start), en = x.end ? parseD(x.end) : st;
    if (Number.isNaN(+st)) continue;
    // Egne hendelser (Google / lokale i Privat og Familie) er «g», uansett hvilken type serveren gjetter.
    const own = x.source === 'google' || x.source === 'local' || x.calendar === 'privat' || x.calendar === 'familie';
    const kind = own ? 'g' : TYPES.includes(x.type) ? x.type : x.type === 'bd' ? 'bursdag' : 'time';
    const cal = calOf(x, kind);
    const base = { id: String(x.id ?? `${x.start}|${x.title}`), oid: String(x.id ?? ''), kind, cal, t: String(x.title ?? ''), short: x.short || '', subj: x.subject || (kind === 'time' ? String(x.title ?? '') : ''),
      r: x.room || x.location || '', teacher: x.teacher || '', n: x.note || '', c: x.color || '', src: x.source || '', url: x.url || '', map: x.mazemap || '',
      editable: !!x.editable, rep: x.repeat || (x.recurrence ? 'rec' : ''), recurrence: x.recurrence || null, srvRem: x.reminder || '', all: !!x.allDay, startRaw: x.start, endRaw: x.end };
    if (x.allDay) {
      // Heldagshendelser over flere dager: én oppføring per dag (slutt er eksklusiv).
      let d = d0(st), n = 0;
      const last = en > st ? add(d0(new Date(en - 1)), 0) : d;
      do { push(key(d), { ...base, id: n ? `${base.id}|${n}` : base.id, k: key(d), s: '', e: kind === 'innl' ? '23:59' : '' }); d = add(d, 1); n++; } while (d <= last && n < 60);
    } else if (kind === 'innl') push(key(st), { ...base, k: key(st), s: '', e: hm(en > st ? en : st) });
    else push(key(st), { ...base, k: key(st), s: hm(st), e: key(en) === key(st) && en > st ? hm(en) : '23:59' });
  }
  // Planleggingsdag/fri fjerner timene, og en prøve med klokkeslett erstatter timene den overlapper.
  for (const [k, L] of byDay) {
    let out = L;
    if (L.some((e) => e.kind === 'fri')) out = out.filter((e) => e.kind !== 'time');
    for (const x of L.filter((e) => e.s && (e.kind === 'prove' || e.kind === 'skole') && e.cal !== 'privat' && e.cal !== 'familie')) {
      const a = mm(x.s), b = mm(x.e);
      out = out.filter((l) => l.kind !== 'time' || mm(l.e) <= a || mm(l.s) >= b);
    }
    byDay.set(k, out.sort((a, b) => (a.s ? mm(a.s) : -1) - (b.s ? mm(b.s) : -1)));
  }
  const byId = new Map();
  for (const L of byDay.values()) for (const e of L) byId.set(e.id, e);
  const src = Array.isArray(r.sources) ? r.sources.filter((x) => x && typeof x === 'object') : [], school = src.filter((x) => x.id === 'ical' || x.id === 'canvas');
  const cals = Array.isArray(r.calendars) && r.calendars.length
    ? r.calendars.filter((c) => c && c.id).map((c) => ({ ...(CALS0.find((x) => x.id === c.id) ?? {}), ...c, src: c.source || c.src || CALS0.find((x) => x.id === c.id)?.src || '' }))
    : CALS0;
  return { byDay, byId, subjects, sources: src, cals, configured: r.configured ?? (school.length ? school.some((x) => x.configured) : true), srvNow: r.now ?? null };
}

async function fallbackData() {
  let school = store.data.school;
  if (!school) { try { school = await api('/school'); store.data.school = school; } catch { school = null; } }
  const evs = (school?.events ?? []).map((x, i) => { const type = classify(x.title ?? '', x); return { id: `s${i}|${x.start}`, title: x.title, subject: type === 'time' ? x.title : '', room: x.location, start: x.start, end: x.end, allDay: x.allDay, type, color: x.color, source: 'ical' }; });
  let bd = store.data.birthdays;
  if (!bd) { try { bd = await loadBirthdays(); } catch { bd = null; } }
  const y = new Date().getFullYear();
  for (const p of bd?.items ?? []) {
    for (const yy of [y - 1, y, y + 1]) {
      const d = new Date(yy, p.month - 1, p.day);
      evs.push({ id: `bd|${p.id}|${yy}`, title: `${p.name} har bursdag`, start: key(d), end: key(add(d, 1)), allDay: true, type: 'bursdag', source: 'birthdays' });
    }
  }
  return normalize({ events: evs, configured: school ? school.configured !== false : false, sources: ['ical', 'birthdays'] });
}

/** Henter [from, to]. Ved bla utenfor det som er hentet, hentes et nytt vindu rundt visningen. */
async function fetchKal(from, to) {
  const tt = d0(new Date());
  from ??= key(add(tt, -42)); to ??= key(add(tt, 120));
  try {
    K.data = normalize(await api(`/kalender?from=${from}&to=${to}`));
    K.range = { from, to };
    K.fallback = false; K.err = '';
  } catch (e) {
    if (e.status === 404) { K.data = await fallbackData(); K.fallback = true; K.err = ''; K.range = { from: key(add(tt, -400)), to: key(add(tt, 400)) }; }
    else K.err = e.message;
  }
  K.at = Date.now();
  store.data.kalender = K.data;
  emit('kalender');
}
/** Henter kalenderen hvis den mangler eller er eldre enn 10 minutter (serveren cacher selv i en time). */
export function ensureKal(force = false) {
  loadPrefs();
  if (K.loading) return K.loading;
  if (!force && K.data && Date.now() - K.at < 10 * 60_000) return Promise.resolve(K.data);
  const r = K.range && K.view ? K.range : null;
  K.loading = fetchKal(r?.from, r?.to).finally(() => { K.loading = null; });
  return K.loading;
}
/** Sørger for at perioden [a, b] (nøkler) er hentet. */
function ensureRange(a, b) {
  if (!K.range || K.fallback || K.loading) return;
  if (a >= K.range.from && b <= K.range.to) return;
  const c = fromKey(a);
  K.loading = fetchKal(key(add(c, -60)), key(add(c, 150))).finally(() => { K.loading = null; });
}

/* ---------------- Hjelpere ---------------- */

const calList = () => K.data?.cals ?? CALS0;
const calById = (id) => calList().find((c) => c.id === id) ?? CALS0.find((c) => c.id === id) ?? { id, name: id, color: '#7a7468', src: '' };
const shownCal = (id) => K.filt[id] !== false && calList().find((c) => c.id === id)?.enabled !== false;
function evOn(d, all = false) {
  const L = K.data?.byDay.get(key(d)) ?? [];
  return all ? L : L.filter((e) => shownCal(e.cal));
}
const subjColor = (e) => K.subjC[e.subj] || K.data?.subjects?.[e.subj] || e.c || palette(e.subj || e.t);
const col = (e) => (e.kind === 'time' ? subjColor(e) : e.kind === 'prove' || e.kind === 'innl' ? LAB : e.c && e.kind === 'g' ? e.c : calById(e.cal).color);
const short = (e) => (e.kind === 'time' ? e.short || SHORT[e.subj] || e.subj || e.t : e.t);
const tmOf = (e) => (e.kind === 'innl' ? (e.e ? `Frist ${e.e}` : 'Frist') : e.s ? `${e.s}–${e.e}` : 'Hele dagen');
const sub2 = (...a) => a.filter(Boolean).join(' · ');
const isLesson = (e) => e.s && (e.kind === 'time' || e.kind === 'prove');
const findEv = (id) => K.data?.byId.get(id) ?? null;
const inTxt = (dd) => (dd === 0 ? 'I dag' : dd === 1 ? 'I morgen' : `${dd} dager`);
const curD = () => (K.cur ? fromKey(K.cur) : d0(new Date()));

function exams(today) {
  const tk = key(today), out = [];
  for (const [k, L] of K.data?.byDay ?? []) if (k >= tk) for (const e of L) if ((e.kind === 'prove' || e.kind === 'innl') && shownCal(e.cal)) out.push(e);
  return out.sort((a, b) => a.k.localeCompare(b.k) || (a.s || a.e || '').localeCompare(b.s || b.e || ''));
}

/** Felles innhold for Hjem-widgeten KALENDER (uendret fra prompt 26). */
function wgModel(now, today) {
  const nm = now.getHours() * 60 + now.getMinutes();
  let wd = today, wl = evOn(today).filter(isLesson), isT = true;
  if (!wl.some((e) => mm(e.e) > nm)) {
    isT = false; wl = [];
    for (let i = 1; i < 21; i++) { const d = add(today, i), L = evOn(d).filter(isLesson); if (L.length) { wd = d; wl = L; break; } }
  }
  const cur = isT ? wl.find((e) => nm >= mm(e.s) && nm < mm(e.e)) : null, nx = cur || (isT ? wl.find((e) => mm(e.s) > nm) : wl[0]) || null;
  const ix = Math.max(0, wl.indexOf(nx)), dS = capf(WD[wd.getDay()]);
  const ex = exams(today).slice(0, 2).map((x) => { const dd = daysTo(x.k, today); return { t: x.t, in: inTxt(dd), soon: dd <= 7 }; });
  let n3 = wl.slice(ix + 1, ix + 4);
  if (!n3.length) n3 = wl.slice(0, 3);
  return {
    k: !nx ? 'FRI' : cur ? 'NÅ' : isT ? 'NESTE TIME' : dS.toUpperCase(), big: nx ? (cur ? cur.e : nx.s) : '–', t: nx ? nx.t : 'Ingen timer', r: nx ? sub2(nx.r, nx.teacher) : '', c: nx ? col(nx) : '#999', e: nx,
    when: !nx ? '' : cur ? `${dur(mm(cur.e) - nm)} igjen` : isT ? `om ${dur(mm(nx.s) - nm)}` : 'første time',
    dayT: `${isT ? 'I dag · ' : ''}${dS} ${wd.getDate()}. ${MS[wd.getMonth()]}`, dayL: `${isT ? 'I dag · ' : ''}${dS} ${wd.getDate()}. ${MN[wd.getMonth()]}`, cnt: `${wl.length} ${wl.length === 1 ? 'time' : 'timer'}`,
    n3: n3.map((e) => ({ s: e.s, t: short(e), r: e.r, c: col(e), e })),
    ex,
  };
}

/* ---------------- NESTE / NÅ ---------------- */

/** Neste (eller pågående) hendelse med klokkeslett de neste tre ukene, uansett kalender – timer først ved lik start. */
function nextModel(now, today) {
  const nm = now.getHours() * 60 + now.getMinutes();
  let nx = null;
  for (let i = 0; i < 21 && !nx; i++) {
    const d = add(today, i);
    const L = evOn(d).filter((e) => e.s && e.e && e.kind !== 'innl').sort((a, b) => mm(a.s) - mm(b.s) || (a.kind === 'time' ? -1 : b.kind === 'time' ? 1 : 0));
    for (const e of L) { const a = mm(e.s) + i * 1440, b = mm(e.e) + i * 1440; if (b > nm) { nx = { e, cur: a <= nm, a, b, i, d }; break; } }
  }
  if (!nx) return { k: '', t: 'Ingen kommende hendelser', c: '#7a7468', sub: K.data && !K.data.configured ? 'Legg inn skolens iCal under Innstillinger → Kalendere' : 'De neste tre ukene', when: '', id: '', tm: '', day: '', pl: '', wB: '', wS: '', prog: false, pct: 0 };
  const e = nx.e, day = nx.i === 0 ? 'I dag' : nx.i === 1 ? 'I morgen' : longDate(nx.d), soon = nx.a - nm < 1440;
  return { k: nx.cur ? 'NÅ' : 'NESTE', t: e.t, c: col(e), sub: sub2(day, `${e.s}–${e.e}`, e.r), id: e.id,
    tm: `${e.s}–${e.e}`, day: nx.i === 0 ? 'i dag' : nx.i === 1 ? 'i morgen' : longDate(nx.d), pl: e.r || '',
    wB: nx.cur ? dur2(nx.b - nm) : soon ? dur2(nx.a - nm) : capf(dayName(nx.d.getDay(), 'short').replace('.', '')).slice(0, 3),
    wS: nx.cur ? 'igjen' : soon ? 'til start' : e.s,
    prog: nx.cur, pct: nx.cur ? Math.max(0, Math.min(100, Math.round((nm - nx.a) / Math.max(1, nx.b - nx.a) * 100))) : 0,
    when: nx.cur ? `${dur2(nx.b - nm)} igjen` : soon ? `om ${dur2(nx.a - nm)}` : capf(dayName(nx.d.getDay(), 'short').replace('.', '')) };
}

/* ---------------- Visningene ---------------- */

/** Overlappende hendelser side om side: kolonne c av n i hver gruppe. */
function lay(L) {
  const T = L.filter((e) => e.s && e.e && e.kind !== 'innl').map((e) => ({ e, a: mm(e.s), b: Math.max(mm(e.e), mm(e.s) + 20) })).sort((x, y) => x.a - y.a || y.b - x.b);
  const out = []; let grp = [], end = -1;
  const flush = () => { const cols = []; grp.forEach((x) => { let c = cols.findIndex((tt) => tt <= x.a); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = x.b; x.c = c; }); grp.forEach((x) => { x.n = cols.length; out.push(x); }); grp = []; };
  T.forEach((x) => { if (grp.length && x.a >= end) { flush(); end = -1; } grp.push(x); end = Math.max(end, x.b); });
  if (grp.length) flush();
  return out;
}

const HH = () => (isMobile() ? 48 : 52);
function gridView(now, today) {
  const V = K.view, cur = curD(), nD = V === 'dag' ? 1 : V === '3d' ? 3 : 7, st0 = V === 'uke' ? add(cur, -((cur.getDay() + 6) % 7)) : cur;
  const H = HH(), nm = now.getHours() * 60 + now.getMinutes(), tk = key(today), mob = isMobile();
  const days = [];
  let hasAll = false;
  for (let i = 0; i < nD; i++) {
    const d = add(st0, i), k = key(d), L = evOn(d), all = L.filter((e) => !e.s || !e.e || e.kind === 'innl');
    if (all.length) hasAll = true;
    days.push({ d, k, L, all, isT: k === tk, we: d.getDay() % 6 === 0 });
  }
  const gcols = `${mob ? 40 : 52}px repeat(${nD},minmax(0,1fr))`;
  const wl = (d) => (nD === 7 && mob ? wdShort(d).slice(0, 1) : wdShort(d));
  const head = `<div class="k2-dh" style="grid-template-columns:${gcols}"><span class="k2-wk">${t('U')}${isoW(st0)}</span>${days.map((x) => `<button type="button" class="k2-dhd${x.isT ? ' on' : x.we ? ' we' : ''}" data-k-day="${x.k}" title="${esc(longDate(x.d))}"><span>${esc(wl(x.d))}</span><b>${x.d.getDate()}</b></button>`).join('')}</div>`;
  const allRow = hasAll ? `<div class="k2-all" style="grid-template-columns:${gcols}"><span class="k2-all-l">HELE</span>${days.map((x) => `<div class="k2-allc">${x.all.map((e) => `<button type="button" class="k2-ae" style="background:${esc(col(e))}" data-k-sel="${esc(e.id)}" data-no-i18n>${esc((e.kind === 'innl' ? '⚑ ' : '') + short(e))}</button>`).join('')}</div>`).join('')}</div>` : '';
  const hours = []; for (let h = 1; h < 24; h++) hours.push(h);
  const lines = hours.map((h) => `<span class="k2-hl" style="top:${h * H}px"></span>`).join('');
  const cols = days.map((x) => `<div class="k2-col${x.isT ? ' today' : x.we ? ' we' : ''}" data-k-tap="${x.k}" style="height:${24 * H}px">${lines}${lay(x.L).map((p) => {
    const e = p.e, c = col(e), solid = e.kind === 'prove', ht = (p.b - p.a) / 60 * H, tall = ht >= 40 && !(nD === 7 && mob && p.n > 1);
    return `<button type="button" class="k2-ev${solid ? ' solid' : ''}${K.sel === e.id ? ' sel' : ''}" style="--c:${esc(c)};top:${p.a / 60 * H}px;height:${Math.max(18, ht - 2)}px;left:calc(${p.c / p.n * 100}% + 1px);width:calc(${100 / p.n}% - 3px)" data-k-sel="${esc(e.id)}"><b data-no-i18n>${esc(short(e))}</b>${tall ? `<span data-no-i18n>${esc(`${e.s}–${e.e}${e.r ? ` · ${e.r}` : ''}`)}</span>` : ''}</button>`;
  }).join('')}${x.isT ? `<span class="k2-now" style="top:${nm / 60 * H}px"></span>` : ''}</div>`).join('');
  const inRange = days.some((x) => x.isT);
  return { st: st0, end: add(st0, nD - 1), inRange, html: `<div class="k2-grid">${head}${allRow}<div class="k2-scroll" data-k-scroll><div class="k2-body" style="grid-template-columns:${gcols}"><div class="k2-hrs" style="height:${24 * H}px">${hours.map((h) => `<span style="top:${h * H}px">${pad(h)}</span>`).join('')}</div>${cols}</div></div></div>` };
}

function monthView(today) {
  const cur = curD(), m0 = new Date(cur.getFullYear(), cur.getMonth(), 1, 12), st = add(m0, -((m0.getDay() + 6) % 7)), tk = key(today), web = !isMobile();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    if (i % 7 === 0) { const wk = isoW(add(st, i)); cells += `<button type="button" class="k2-mwk" data-k-wk="${key(add(st, i))}" aria-label="${esc(t('Uke'))} ${wk}" title="${esc(t('Uke'))} ${wk}">${wk}</button>`; }
    const d = add(st, i), k = key(d), L = evOn(d), inM = d.getMonth() === m0.getMonth(), les = L.filter((e) => e.kind === 'time').length, oth = L.filter((e) => e.kind !== 'time'), mx = web ? 4 : 3, sh = oth.slice(0, les ? mx - 1 : mx);
    const chips = sh.map((e) => { const solid = e.kind === 'prove' || !e.s || e.kind === 'innl'; return `<span class="k2-mch${solid ? ' solid' : ''}" style="--c:${esc(col(e))}" data-no-i18n>${esc((e.s && e.kind !== 'innl' && web ? `${e.s} ` : '') + short(e))}</span>`; });
    if (les) chips.push(`<span class="k2-mch les">${les} ${web ? (les === 1 ? 'time' : 'timer') : 't'}</span>`);
    cells += `<button type="button" class="k2-mc${inM ? '' : ' out'}${k === tk ? ' today' : ''}" data-k-day="${k}" aria-label="${esc(longDate(d))}"><span class="k2-mn">${d.getDate()}</span>${chips.join('')}${oth.length > sh.length ? `<span class="k2-more">+${oth.length - sh.length}</span>` : ''}</button>`;
  }
  const head = `<span>${esc(t('U'))}</span>` + [1, 2, 3, 4, 5, 6, 0].map((i) => `<span>${esc(web ? dayName(i, 'short').replace('.', '').slice(0, 3).toUpperCase() : dayName(i, 'narrow'))}</span>`).join('');
  return { st: m0, end: m0, html: `<div class="k2-month"><div class="k2-mh">${head}</div><div class="k2-mg">${cells}</div></div>` };
}

function listView(today) {
  const cur = curD(), tk = key(today);
  let html = '';
  for (let i = 0; i < 45; i++) {
    const d = add(cur, i), k = key(d), L = evOn(d), isT = k === tk;
    if (!L.length && !isT) continue;
    html += `<div class="k2-lg"><div class="k2-ld${isT ? ' on' : ''}"><span>${esc(wdShort(d))}</span><b>${d.getDate()}</b><span>${esc(monthName(d.getMonth(), 'short').replace('.', '').toUpperCase())}</span></div><div class="k2-li">${L.length ? L.map((e) => {
      const c = col(e), solid = e.kind === 'prove' || e.kind === 'innl';
      return `<button type="button" class="k2-it${solid ? ' solid' : ''}" style="--c:${esc(c)}" data-k-sel="${esc(e.id)}"><span class="k2-grow"><b data-no-i18n>${esc(e.t)}</b><span>${esc(tmOf(e))}<span data-no-i18n>${esc((e.r ? ` · ${e.r}` : '') + (e.kind === 'time' && e.teacher ? ` · ${e.teacher}` : ''))}</span></span></span>${solid ? `<span class="k2-tag">${e.kind === 'prove' ? 'PRØVE' : 'FRIST'}</span>` : ''}</button>`;
    }).join('') : '<span class="k2-none">Ingen hendelser</span>'}</div></div>`;
  }
  return { st: cur, end: add(cur, 44), html: `<div class="k2-list" data-k-list>${html}</div>` };
}

function miniCal(today, vis) {
  const cur = curD(), mB = new Date(cur.getFullYear(), cur.getMonth() + K.miniOff, 1, 12), mSt = add(mB, -((mB.getDay() + 6) % 7)), tk = key(today);
  const inVis = (k) => vis && k >= key(vis.st) && k <= key(vis.end);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    if (i % 7 === 0) { const wk = isoW(add(mSt, i)); cells += `<button type="button" class="k2-mini-wk" data-k-wk="${key(add(mSt, i))}" aria-label="${esc(t('Uke'))} ${wk}">${wk}</button>`; }
    const d = add(mSt, i), k = key(d), L = evOn(d).filter((e) => e.kind !== 'time');
    cells += `<button type="button" class="k2-mini-c${d.getMonth() === mB.getMonth() ? '' : ' out'}${k === tk ? ' today' : inVis(k) ? ' vis' : ''}" data-k-go="${k}">${d.getDate()}<i style="background:${L.length ? esc(k === tk ? '#fff' : col(L[0])) : 'transparent'}"></i></button>`;
  }
  return `<div class="k2-mini"><div class="k2-mini-h"><b>${esc(capf(monthName(mB.getMonth())))} ${mB.getFullYear()}</b><button type="button" data-k-mini="-1" aria-label="Forrige måned">‹</button><button type="button" data-k-mini="1" aria-label="Neste måned">›</button></div>
    <div class="k2-mini-g"><span>${esc(t('U'))}</span>${[1, 2, 3, 4, 5, 6, 0].map((i) => `<span>${esc(dayName(i, 'narrow'))}</span>`).join('')}${cells}</div></div>`;
}
function calFilters(chips = false) {
  return calList().map((c) => {
    const off = !shownCal(c.id);
    return chips
      ? `<button type="button" class="k2-cchip${off ? ' off' : ''}" data-k-cal="${esc(c.id)}" aria-pressed="${!off}"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</button>`
      : `<button type="button" class="k2-cal${off ? ' off' : ''}" data-k-cal="${esc(c.id)}" role="checkbox" aria-checked="${!off}"><span class="k2-cb" style="--c:${esc(c.color)}">✓</span><span class="k2-grow">${esc(c.name)}</span></button>`;
  }).join('');
}

/* ---------------- Ark: detaljer, skjema, søk ---------------- */

const remOf = (e) => K.rem[e.id] ?? K.rem[e.oid] ?? (e.srvRem && e.srvRem !== 'none' ? e.srvRem : e.kind === 'prove' || e.kind === 'innl' ? 'day' : 'none');
function detailSheet() {
  const e = K.sel && findEv(K.sel);
  if (!e) return '';
  const sd = fromKey(e.k), R = remOf(e), cal = calById(e.cal);
  const rows = [e.r && ['Sted', e.r, 1], e.teacher && ['Lærer', e.teacher, 1], ['Kalender', cal.name], e.kind !== 'time' && e.subj && ['Fag', e.subj, 1], e.n && ['Merknad', e.n, 1],
    e.rep && e.rep !== 'none' && ['Gjentas', { daily: 'Hver dag', weekly: 'Hver uke', monthly: 'Hver måned', rec: 'Ja' }[e.rep] ?? e.rep]].filter(Boolean);
  const kk = cal.name.toUpperCase() + (e.kind === 'prove' ? ' · PRØVE' : e.kind === 'innl' ? ' · INNLEVERING' : '');
  const map = e.map || (e.r && /^[A-Z]{1,2}-?\d|aula|hall|gym|bibl|rom\b|sal\b/i.test(e.r) && e.kind !== 'bursdag' ? `https://use.mazemap.com/#v=1&search=${encodeURIComponent(e.r)}` : '');
  const src = e.editable ? `Lagret i Google Kalender (${cal.name}).` : cal.src ? `Fra ${cal.src}. Endres i kilden.` : '';
  return `<div class="k2-sheet-bg" data-k-close><div class="k2-sheet" role="dialog" aria-modal="true" aria-label="${esc(e.t)}" style="--c:${esc(col(e))}">
    <div class="k2-det-h"><span class="k2-strip"></span><div class="k2-grow"><span class="k2-lab">${esc(kk)}</span><b data-no-i18n>${esc(e.t)}</b><span>${esc(`${longDate(sd)} · `)}${esc(tmOf(e))}</span></div><button type="button" class="k2-x" data-k-close aria-label="Lukk">✕</button></div>
    <div class="k2-rows">${rows.map(([a, b, u]) => `<div><span>${esc(a)}</span><b${u ? ' data-no-i18n' : ''}>${esc(b)}</b></div>`).join('')}</div>
    <span class="k2-lab">VARSEL</span><div class="k2-chips">${REMS.map(([v, n]) => `<button type="button" class="k2-chip${R === v ? ' on' : ''}" data-k-rem="${v}" aria-pressed="${R === v}">${n}</button>`).join('')}</div>
    ${src ? `<span class="k2-src">${esc(src)}</span>` : ''}
    ${K.err2 ? `<span class="k2-err">${esc(K.err2)}</span>` : ''}
    <div class="k2-btns">${e.editable ? `<button type="button" class="k2-b ink" data-k-edit>Rediger</button><button type="button" class="k2-b red" data-k-del>${K.delArm ? 'Trykk igjen for å slette' : 'Slett'}</button>` : ''}
      ${map ? `<a class="k2-b line" href="${esc(map)}" target="_blank" rel="noopener">Vis rom på kart ↗</a>` : ''}
      ${/^https:\/\//.test(e.url) ? `<a class="k2-b line" href="${esc(e.url)}" target="_blank" rel="noopener">Åpne ${e.src === 'canvas' ? 'i Canvas' : e.src === 'google' ? 'i Google Kalender' : 'kilden'} ↗</a>` : ''}
      ${!e.editable ? `<button type="button" class="k2-b line" data-k-copy>Kopier til Privat</button>` : ''}</div>
  </div></div>`;
}

function formSheet() {
  const F = K.form;
  if (!F) return '';
  const chip = (on, attr, n, c) => `<button type="button" class="k2-chip${on ? ' on' : ''}" ${attr} aria-pressed="${on}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}</button>`;
  const wcals = calList().filter((c) => c.writable !== false && (c.id === 'privat' || c.id === 'familie'));
  return `<div class="k2-sheet-bg" data-k-fclose><div class="k2-sheet" role="dialog" aria-modal="true" aria-label="${F.id ? 'Rediger hendelse' : 'Ny hendelse'}">
    <div class="k2-det-h"><b class="k2-grow k2-fh">${F.id ? 'Rediger hendelse' : 'Ny hendelse'}</b><button type="button" class="k2-x" data-k-fclose aria-label="Lukk">✕</button></div>
    <form class="k2-form" data-k-form>
      <input class="k2-in k2-big" name="title" value="${esc(F.t)}" placeholder="Tittel" autocomplete="off" required>
      <div class="k2-box">
        <button type="button" class="k2-sw" data-k-fall role="switch" aria-checked="${!!F.all}"><span>Hele dagen</span><i></i></button>
        <label><span>Dato</span><input type="date" name="date" value="${esc(F.k)}" required></label>
        ${F.all ? `<label><span>Til og med</span><input type="date" name="endDate" value="${esc(F.endDate || F.k)}"></label>`
    : `<label><span>Fra</span><input type="time" name="start" step="300" value="${esc(F.s)}"></label><label><span>Til</span><input type="time" name="end" step="300" value="${esc(F.e)}"></label>`}
      </div>
      <input class="k2-in" name="location" value="${esc(F.r)}" placeholder="Sted" autocomplete="off">
      <span class="k2-lab">KALENDER</span><div class="k2-chips">${wcals.map((c) => chip(F.cal === c.id, `data-k-fcal="${esc(c.id)}"`, c.name, c.color)).join('')}</div>
      <span class="k2-lab">GJENTA</span><div class="k2-chips">${REPS.map(([v, n]) => chip(F.rep === v, `data-k-frep="${v}"`, n)).join('')}</div>
      <span class="k2-lab">VARSEL</span><div class="k2-chips">${REMS.map(([v, n]) => chip(F.rem === v, `data-k-frem="${v}"`, n)).join('')}</div>
      <textarea class="k2-in" name="note" rows="2" placeholder="Merknad">${esc(F.n)}</textarea>
      ${F.err ? `<span class="k2-err">${esc(F.err)}${F.reconnect ? ' <button type="button" class="k2-link" data-k-reconnect>Koble til Google på nytt ›</button>' : ''}</span>` : ''}
      <button type="submit" class="k2-b ink"${K.busy ? ' disabled' : ''}>${K.busy ? 'Lagrer …' : 'Lagre'}</button>
      <span class="k2-src">Lagres i Google Kalender.</span>
    </form>
  </div></div>`;
}

/** «Legg til time» (✦ AI · RASK TIME): tekstfelt, chips, live forhåndsvisning med parseQuick. */
function qaSheet() {
  const Q = K.qa;
  if (!Q) return '';
  return `<div class="k2-sheet-bg" data-k-qclose><div class="k2-sheet k2-qa" role="dialog" aria-modal="true" aria-label="Legg til time">
    <span class="k2-grip" aria-hidden="true"></span>
    <div class="k2-qa-h"><div class="k2-grow"><span class="k2-lab">✦ AI · RASK TIME</span><b>Legg til time</b></div><button type="button" class="k2-x sm" data-k-qclose aria-label="Lukk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <form class="k2-form" data-k-qform>
      <textarea class="k2-in k2-qa-in" name="qa" rows="3" data-k-qtxt placeholder="F.eks. «time hos Nina frisør 14.30 25.09» eller lim inn meldingen fra legekontoret">${esc(Q.txt)}</textarea>
      <div class="k2-chips"><button type="button" class="k2-chip sm on" data-k-qpaste><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9zM7 5H5v16h14V5h-2"/></svg>Lim inn melding</button>${QA_CHIPS.map((n) => `<button type="button" class="k2-chip sm" data-k-qchip="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <div data-k-qpv>${qaPreview()}</div>
      ${Q.err ? `<span class="k2-err">${esc(Q.err)}</span>` : ''}
      <button type="submit" class="k2-qa-go"${(Q.txt ?? '').trim() ? '' : ' aria-disabled="true"'}>Legg til i kalenderen</button>
      <button type="button" class="k2-qa-man" data-k-qman>Fyll ut selv</button>
      <span class="k2-qa-foot">Du kan lukke appen. Timen legges til i bakgrunnen.</span>
    </form>
  </div></div>`;
}
function qaPreview() {
  const v = (K.qa?.txt ?? '').trim();
  if (v.length <= 3) return '';
  const p = preview(v);
  if (!p.ok) return `<span class="k2-qa-bad">${esc(p.why || 'Fant ikke dato.')}</span>`;
  const dt = `${quickLabel({ date: p.date })}${p.start ? ` · ${p.start}–${p.end}` : ' · hele dagen'}`;
  return `<div class="k2-qa-pv"><span class="k2-strip" style="background:${esc(calById('privat').color)}"></span><div class="k2-grow"><b data-no-i18n>${esc(p.title)}</b><span>${esc(dt)}</span>${p.place ? `<span data-no-i18n>${esc(p.place)}</span>` : ''}<span class="k2-qa-cal">Privat · varsel 1 time før</span></div></div>`;
}
function paintQa() { const el = host()?.querySelector('[data-k-qpv]'); if (el) el.innerHTML = qaPreview(); const b = host()?.querySelector('.k2-qa-go'); if (b) { if ((K.qa?.txt ?? '').trim()) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); } }
function openQa(txt = '') { K.sel = null; K.form = null; K.srch = null; K.drawer = false; K.qa = { txt, err: '', focus: true }; paint(); }
function submitQa() {
  const v = (K.qa?.txt ?? '').trim();
  if (!v) { if (K.qa) { K.qa.err = 'Skriv hva timen gjelder.'; paint(); } return; }
  // Arket lukkes med en gang; jobben går i bakgrunnen.
  K.qa = null; paint();
  addQuick(v);
}
/** Feilet tolkning: skjemaet ferdig utfylt med det som ble funnet, feilmelding og originalteksten i notat. */
function failForm({ found = {}, text = '', error = '' }) {
  if (document.body.dataset.route !== 'kalender') location.hash = '#/kalender';
  const go = () => {
    openForm({ t: found.title || '', ...(found.date ? { k: found.date } : {}), ...(found.start ? { s: found.start, e: found.end || hmM(Math.min(mm(found.start) + 60, 23 * 60 + 59)) } : {}), r: found.place || '', n: text, rem: '1h' });
    if (K.form) { K.form.err = `${error}${/[.!]$/.test(error) ? '' : '.'} Velg dato og lagre.`; paint(); }
  };
  if (host()) go(); else setTimeout(go, 80);
}

function searchSheet() {
  const S = K.srch;
  if (!S) return '';
  const res = S.res ?? [];
  return `<div class="k2-sheet-bg" data-k-sclose><div class="k2-sheet" role="dialog" aria-modal="true" aria-label="Søk i kalenderen">
    <div class="k2-srow">${searchField({ name: 'kq', value: S.q, placeholder: 'Søk etter timer, prøver, steder', cls: 'k2-sf', attrs: 'data-k-q autofocus' })}<button type="button" class="k2-x" data-k-sclose aria-label="Lukk">✕</button></div>
    <div data-k-sres>${searchRes()}</div>
  </div></div>`;
}
function searchRes() {
  const S = K.srch;
  if (!S) return '';
  const res = S.res ?? [];
  if (S.loading && !res.length) return '<span class="k2-src">Søker …</span>';
  if (res.length) return `<span class="k2-src">${res.length}${res.length >= 40 ? '+' : ''} treff</span><div class="k2-sres">${res.map((e) => `<button type="button" class="k2-sr" data-k-hit="${esc(e.id)}" data-k-hitk="${esc(e.k)}"><span class="k2-strip" style="background:${esc(col(e))}"></span><span class="k2-grow"><b data-no-i18n>${esc(e.t)}</b><span>${esc(`${longDate(fromKey(e.k))} · `)}${esc(tmOf(e))}<span data-no-i18n>${esc(e.r ? ` · ${e.r}` : '')}</span></span></span></button>`).join('')}</div>`;
  if ((S.q ?? '').trim().length >= 2 && !S.loading) return '<span class="k2-src">Ingen treff de neste fire månedene.</span>';
  return '';
}

/* ---------------- Siden ---------------- */

function titleOf(vis) {
  const a = vis.st, b = vis.end;
  if (K.view === 'mnd' || K.view === 'liste' || a.getMonth() === b.getMonth()) return { t: capf(monthName(a.getMonth())), y: String(a.getFullYear()) };
  return { t: `${capf(monthName(a.getMonth(), 'short').replace('.', ''))}–${monthName(b.getMonth(), 'short').replace('.', '')}`, y: String(b.getFullYear()) };
}

function body() {
  if (K.err && !K.data) return `<div class="k2-msg">Kunne ikke hente kalenderen: ${esc(K.err)}<br><button type="button" class="k2-b line" data-k-retry>Prøv igjen</button></div>`;
  if (!K.data) return '<div class="k2-msg">Laster kalenderen …</div>';
  const now = new Date(), today = d0(now), mob = isMobile(), V = K.view;
  const vis = V === 'mnd' ? monthView(today) : V === 'liste' ? listView(today) : gridView(now, today);
  ensureRange(key(add(vis.st, -7)), key(add(vis.end, 7)));
  const nx = nextModel(now, today), tt = titleOf(vis), nar = narrow();
  const tabs = `<div class="k2-tabs" role="tablist">${VIEWS.map(([k, n, kk]) => `<button type="button" role="tab" aria-selected="${V === k}" class="${V === k ? 'on' : ''}" data-k-view="${k}" title="Hurtigtast ${kk}">${n}</button>`).join('')}</div>`;
  const FULL_IC = K.full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', fullL = K.full ? 'Vis med toppmeny' : 'Fullskjerm';
  const top = `<div class="k2-top">
    ${nar ? `<button type="button" class="k2-ic k2-drw" data-k-drawer aria-label="Minikalender og kalendere" aria-expanded="${K.drawer}" title="Minikalender og kalendere"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4M9 10v10"/></svg></button>` : ''}
    <button type="button" class="k2-title" data-k-titl aria-expanded="${K.mini}"><span data-no-i18n>${esc(tt.t)}</span><span class="k2-year">${esc(tt.y)}</span>${mob ? `<span class="k2-arr">${K.mini ? '▲' : '▼'}</span>` : ''}</button>
    <span class="k2-sp"></span>
    ${mob || nar ? '' : `<div class="k2-nav"><button type="button" class="k2-circ" data-k-nav="-1" aria-label="Forrige">‹</button><button type="button" class="k2-circ" data-k-nav="1" aria-label="Neste">›</button></div>${tabs}`}
    <button type="button" class="k2-ic" data-k-search aria-label="Søk i kalenderen" title="Søk ( / )"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg></button>
    <button type="button" class="k2-ic k2-today" data-k-today aria-label="I dag" title="I dag (T)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4"/></svg><span>${today.getDate()}</span></button>
    <button type="button" class="k2-qbtn" data-k-qa title="Skriv time med AI">${mob ? '✦' : '✦ Skriv time'}</button>
    <button type="button" class="k2-new" data-k-new title="Ny hendelse (N)">${mob ? '+' : '<span class="k2-lg">+ Ny hendelse</span><span class="k2-sm">+ Ny</span>'}</button>
    ${mob ? '' : `<button type="button" class="k2-sq" data-k-full aria-label="${fullL}" title="${fullL}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${FULL_IC}"/></svg></button>
    <button type="button" class="k2-sq ink" data-k-closecal aria-label="Lukk kalenderen" title="Lukk${K.full ? ' (Esc)' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`}
  </div>${mob || nar ? `<div class="k2-mtabs"><div class="k2-nav"><button type="button" class="k2-circ" data-k-nav="-1" aria-label="Forrige">‹</button><button type="button" class="k2-circ" data-k-nav="1" aria-label="Neste">›</button></div>${tabs}</div>` : ''}`;
  const drop = mob && K.mini ? `<div class="k2-drop">${miniCal(today, vis)}<div class="k2-cchips">${calFilters(true)}</div></div>` : '';
  // Nå/Neste-kort (prompt 29): lyst kort, ikonflis i fargen, NÅ/NESTE + tid, tittel + rom, stort tall til høyre, fremdrift.
  const strip = `<button type="button" class="k2-now-c${nx.id ? '' : ' empty'}"${nx.id ? ` data-k-sel="${esc(nx.id)}"` : ''} style="--c:${esc(nx.c)}">
    <span class="k2-now-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V12l3 2"/></svg></span>
    <span class="k2-grow k2-now-m">${nx.k ? `<span class="k2-now-k"><span>${nx.k}</span><span>${esc(`${nx.tm} · ${nx.day}`)}</span></span>` : `<span class="k2-now-k"><span>${esc(nx.sub)}</span></span>`}
      <span class="k2-now-t"><b data-no-i18n>${esc(nx.t)}</b>${nx.pl ? `<span class="k2-now-pl" data-no-i18n>${esc(nx.pl)}</span>` : ''}</span></span>
    ${nx.wB ? `<span class="k2-now-r"><b>${esc(nx.wB)}</b><span>${esc(nx.wS)}</span></span>` : ''}
    ${nx.prog ? `<span class="k2-now-p" aria-hidden="true"><i style="width:${nx.pct}%"></i></span>` : ''}</button>`;
  const side = mob ? '' : `${nar && K.drawer ? '<div class="k2-drw-bg" data-k-drawer></div>' : ''}<aside class="k2-side${nar ? ` drawer${K.drawer ? ' open' : ''}` : ''}">${miniCal(today, vis)}<div class="k2-cals"><span class="k2-lab">KALENDERE</span>${calFilters()}<button type="button" class="k2-b line sm" data-k-set>Administrer kalendere ›</button></div>
    <span class="k2-keys">Hurtigtaster: ← → bla · T i dag · D dag · W uke · M måned · L liste · N ny · / søk</span>${K.fallback ? '<span class="k2-keys">Eldre server: bare skolens iCal og Bursdager.</span>' : ''}</aside>`;
  return `${K.toast ? `<div class="k2-toast" role="status">${esc(K.toast)}</div>` : ''}${top}${drop}${strip}<div class="k2-main">${side}<div class="k2-view" data-k-swipe>${vis.html}</div></div>${detailSheet()}${formSheet()}${searchSheet()}${qaSheet()}`;
}

function scrollGrid(h) {
  const sc = h.querySelector('[data-k-scroll]');
  if (!sc) { gridKey = ''; return; }
  const k = `${K.view}|${K.cur ?? ''}|${isMobile()}`;
  if (gridKey === k) return;
  gridKey = k;
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), H = HH();
  const inRange = !!h.querySelector('.k2-col.today');
  sc.scrollTop = Math.max(0, (inRange ? nm / 60 : 7.75) * H - (inRange ? H * 1.5 : 0));
}

function paint() {
  const h = host();
  if (!h) return;
  const sc = h.querySelector('[data-k-scroll]'), y = sc?.scrollTop ?? 0, lst = h.querySelector('[data-k-list]')?.scrollTop ?? 0;
  const ae = document.activeElement, focusQ = ae?.matches?.('[data-k-q]'), selS = focusQ ? ae.selectionStart : 0;
  const focusQa = ae?.matches?.('[data-k-qtxt]'), selQa = focusQa ? ae.selectionStart : 0;
  applyFull();
  h.innerHTML = body();
  fitHeight();
  const sc2 = h.querySelector('[data-k-scroll]');
  if (sc2 && gridKey === `${K.view}|${K.cur ?? ''}|${isMobile()}`) sc2.scrollTop = y; else scrollGrid(h);
  const l2 = h.querySelector('[data-k-list]'); if (l2 && lst) l2.scrollTop = lst;
  if (focusQ || (K.srch && K.srch.focus)) { const q = h.querySelector('[data-k-q]'); if (q) { q.focus(); try { q.setSelectionRange(selS || q.value.length, selS || q.value.length); } catch { /* */ } } if (K.srch) K.srch.focus = false; }
  if (K.form?.focus) { K.form.focus = false; h.querySelector('[data-k-form] [name=title]')?.focus(); }
  if (focusQa || K.qa?.focus) { const q = h.querySelector('[data-k-qtxt]'); if (q) { q.focus(); const n = focusQa ? selQa : q.value.length; try { q.setSelectionRange(n, n); } catch { /* */ } } if (K.qa) K.qa.focus = false; }
}
/** Fullskjerm: kalenderen dekker hele vinduet (position:fixed) og siden bak ruller ikke. */
function applyFull() {
  const h = host(), on = !!h && K.full && !isMobile();
  h?.classList.toggle('k2-fs', on);
  document.body.classList.toggle('kal-fs', on);
}
/** Med toppmeny: høyden er vinduet minus det som ligger over kalenderen (toppmenyen), minst 620 px. */
function fitHeight() {
  const h = host();
  if (!h) return;
  if (h.classList.contains('k2-fs') || isMobile()) { h.style.removeProperty('--k2-top'); return; }
  const top = Math.max(0, Math.round(h.getBoundingClientRect().top + window.scrollY));
  h.style.setProperty('--k2-top', `${top}px`);
}
function closeCal() {
  closeSheets(); K.drawer = false;
  document.body.classList.remove('kal-fs');
  location.hash = '#/dash';
}
function flash(tx) { K.toast = tx; paint(); clearTimeout(toastT); toastT = setTimeout(() => { K.toast = ''; paint(); }, 2600); }

function shift(dir) {
  const c = curD();
  const n = K.view === 'mnd' ? new Date(c.getFullYear(), c.getMonth() + dir, 1, 12) : add(c, dir * ({ dag: 1, '3d': 3, uke: 7, liste: 14 }[K.view] ?? 1));
  K.cur = key(n); K.sel = null; K.miniOff = 0; paint();
}
function setView(v, cur) {
  if (!VIEW_SRV[v]) return;
  K.view = v; K.sel = null; K.mini = false; K.miniOff = 0;
  if (cur !== undefined) K.cur = cur;
  savePref('kalView', VIEW_SRV[v]);
  paint();
}
function goToday() { K.cur = null; K.sel = null; K.mini = false; K.miniOff = 0; gridKey = ''; paint(); }

/* ---------------- Ny / rediger ---------------- */

function openForm(pre = {}) {
  const c = curD(), now = new Date(), st = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  K.sel = null; K.delArm = false; K.err2 = '';
  K.form = { id: null, t: '', k: key(c), s: hmM(Math.min(st, 22 * 60)), e: hmM(Math.min(st + 60, 23 * 60 + 30)), all: false, endDate: '', cal: 'privat', r: '', rep: 'none', rem: '15m', n: '', err: '', focus: true, ...pre };
  paint();
}
function formFromEvent(e) {
  const allD = e.all || !e.s;
  let endDate = '';
  if (allD && e.endRaw && /^\d{4}-\d{2}-\d{2}$/.test(e.endRaw)) endDate = key(add(fromKey(e.endRaw), -1));
  const k0 = e.startRaw && /^\d{4}-\d{2}-\d{2}/.test(e.startRaw) ? (allD ? String(e.startRaw).slice(0, 10) : key(new Date(e.startRaw))) : e.k;
  return { id: e.oid || e.id, t: e.t, k: k0, s: e.s || '09:00', e: e.e && e.e !== '23:59' ? e.e : '10:00', all: allD, endDate, cal: e.cal === 'familie' ? 'familie' : 'privat', r: e.r, rep: ['daily', 'weekly', 'monthly'].includes(e.rep) ? e.rep : 'none', rem: remOf(e), n: e.n, err: '' };
}
function readForm(f) {
  const F = K.form, fd = new FormData(f);
  F.t = String(fd.get('title') ?? '').trim(); F.k = String(fd.get('date') ?? '');
  if (F.all) F.endDate = String(fd.get('endDate') ?? F.k); else { F.s = String(fd.get('start') ?? F.s); F.e = String(fd.get('end') ?? F.e); }
  F.r = String(fd.get('location') ?? '').trim(); F.n = String(fd.get('note') ?? '').trim();
}
/** Svar med feilkode og JSON-kropp (api() i util.js gir bare meldingen). */
async function call(path, method, json) {
  const r = await fetch('/api' + path, { method, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (r.status === 401) location.href = '/login';
  return { ok: r.ok, status: r.status, d };
}
async function saveForm(f) {
  readForm(f);
  const F = K.form;
  if (!F.t) { F.err = 'Skriv en tittel.'; return paint(); }
  if (!F.k) { F.err = 'Velg dato.'; return paint(); }
  if (!F.all && (!F.s || !F.e || mm(F.e) <= mm(F.s))) { F.err = 'Slutt må være etter start.'; return paint(); }
  if (F.all && F.endDate && F.endDate < F.k) { F.err = 'Sluttdato må være samme dag eller senere.'; return paint(); }
  const body2 = { title: F.t, allDay: !!F.all, date: F.k, start: F.all ? '' : F.s, end: F.all ? '' : F.e, ...(F.all && F.endDate && F.endDate !== F.k ? { endDate: F.endDate } : {}), location: F.r, calendar: F.cal, repeat: F.rep, reminder: F.rem, note: F.n };
  K.busy = true; F.err = ''; F.reconnect = false; paint();
  try {
    const r = await call(F.id ? `/kalender/events/${encodeURIComponent(F.id)}` : '/kalender/events', F.id ? 'PATCH' : 'POST', body2);
    if (!r.ok) {
      F.err = r.status === 404 && !r.d?.error ? 'Serveren støtter ikke egne hendelser ennå.' : r.d?.error || `Kunne ikke lagre (feil ${r.status}).`;
      F.reconnect = !!r.d?.reconnect || r.status === 409;
      return;
    }
    const id = r.d?.id ?? r.d?.event?.id;
    if (F.rem && id) { K.rem = { ...K.rem, [id]: F.rem }; savePref('kalReminders', { [id]: F.rem }); }
    K.form = null; K.cur = F.k;
    flash(F.id ? 'Hendelsen er oppdatert' : 'Hendelsen er lagret');
    await ensureKal(true);
  } catch (e) { if (K.form) K.form.err = e.message; } finally { K.busy = false; paint(); }
}
async function delEvent(e) {
  if (!K.delArm) { K.delArm = true; return paint(); }
  K.delArm = false;
  const r = await call(`/kalender/events/${encodeURIComponent(e.oid || e.id)}`, 'DELETE').catch((x) => ({ ok: false, d: { error: x.message } }));
  if (!r.ok) { K.err2 = r.d?.error || 'Kunne ikke slette hendelsen.'; return paint(); }
  K.sel = null; K.err2 = '';
  flash('Hendelsen er slettet');
  ensureKal(true);
}
async function copyEvent(e) {
  const r = await call(`/kalender/events/${encodeURIComponent(e.oid || e.id)}/copy`, 'POST', { calendar: 'privat' }).catch(() => ({ ok: false, status: 0, d: {} }));
  if (r.ok) { K.sel = null; flash('Kopiert til Privat'); ensureKal(true); return; }
  if (r.status === 409 || r.d?.reconnect) { K.err2 = r.d?.error || 'Google Kalender må kobles til på nytt for å kunne skrive.'; return paint(); }
  // Eldre server: åpne skjemaet ferdig utfylt.
  openForm({ t: e.t, k: e.k, s: e.s || '09:00', e: e.e && e.e !== '23:59' ? e.e : '10:00', all: !e.s, cal: 'privat', r: e.r, n: e.n });
}

/* ---------------- Søk ---------------- */

let sTimer = 0, sCtl = null;
function localSearch(q) {
  const n = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/(?![̊̈])[̀-ͯ]/g, '').normalize('NFC');
  const qq = n(q), today = d0(new Date()), res = [];
  for (let i = -7; i < 120 && res.length < 40; i++) {
    for (const e of evOn(add(today, i), true)) if (res.length < 40 && n(`${e.t} ${e.r} ${e.n} ${e.subj} ${e.teacher}`).includes(qq)) res.push(e);
  }
  return res;
}
function runSearch(q) {
  const S = K.srch;
  if (!S) return;
  S.q = q;
  clearTimeout(sTimer); sCtl?.abort();
  if (q.trim().length < 2) { S.res = []; S.loading = false; return paintRes(); }
  S.res = localSearch(q.trim()); S.loading = true; paintRes();
  sTimer = setTimeout(async () => {
    const ctl = sCtl = new AbortController();
    try {
      const r = await fetch(`/api/kalender/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json(), list = Array.isArray(d) ? d : d.events ?? d.items ?? [];
      if (ctl.signal.aborted || K.srch !== S) return;
      const nz = normalize({ events: list, subjects: K.data?.subjects });
      for (const e of nz.byId.values()) if (!K.data.byId.has(e.id)) K.data.byId.set(e.id, e);
      const found = [...nz.byId.values()].filter((e) => !/\|\d+$/.test(e.id)).sort((a, b) => a.k.localeCompare(b.k) || (a.s || '').localeCompare(b.s || '')).slice(0, 60);
      S.res = found.length ? found : S.res;
    } catch (e) { if (e.name === 'AbortError') return; /* serveren mangler søk: lokalt søk står */ }
    S.loading = false; paintRes();
  }, 160);
}
function paintRes() { const el = host()?.querySelector('[data-k-sres]'); if (el) el.innerHTML = searchRes(); }

/* ---------------- Hendelser ---------------- */

function bind(h) {
  if (h.dataset.kBound) return;
  h.dataset.kBound = '1';
  // Sveip bytter periode (mobil).
  let sw = null;
  h.addEventListener('touchstart', (e) => { sw = e.target.closest('[data-k-swipe]') && e.touches.length === 1 && K.view !== 'liste' ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  h.addEventListener('touchend', (e) => {
    if (!sw) return;
    const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y; sw = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
  });
  h.addEventListener('input', (e) => {
    if (e.target.matches('[data-k-q]')) runSearch(e.target.value);
    if (e.target.matches('[data-k-qtxt]') && K.qa) { K.qa.txt = e.target.value; K.qa.err = ''; clearTimeout(qaT); qaT = setTimeout(paintQa, 120); }
  });
  h.addEventListener('keydown', (e) => { if (e.target.matches?.('[data-k-qtxt]') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitQa(); } });
  h.addEventListener('submit', (e) => {
    if (e.target.closest('[data-k-qform]')) { e.preventDefault(); submitQa(); return; }
    const f = e.target.closest('[data-k-form]'); if (f) { e.preventDefault(); saveForm(f); }
  });
  h.addEventListener('click', (e) => {
    const tg = e.target;
    // Klikk på bakgrunnen lukker arkene (ikke klikk inne i arket).
    const bg = tg.closest('.k2-sheet-bg');
    if (bg && tg === bg) { closeSheets(); return; }
    if (tg.closest('.k2-drw-bg')) { K.drawer = false; paint(); return; }
    const b = tg.closest('button,[data-k-tap]');
    if (!b || !h.contains(b)) return;
    const d = b.dataset;
    if ('kClose' in d || 'kSclose' in d || 'kFclose' in d || 'kQclose' in d) { closeSheets(); return; }
    if ('kQa' in d) return openQa();
    if ('kQpaste' in d) { navigator.clipboard?.readText?.().then((v) => { if (v && K.qa) { K.qa.txt = v; K.qa.focus = true; paint(); } }).catch(() => { if (K.qa) { K.qa.err = 'Fikk ikke lese utklippstavlen. Lim inn med ⌘V / Ctrl+V.'; K.qa.focus = true; paint(); } }); return; }
    if (d.kQchip) { if (K.qa) { K.qa.txt = `Time hos ${d.kQchip.toLowerCase()} `; K.qa.focus = true; K.qa.err = ''; paint(); } return; }
    if ('kQman' in d) { const v = (K.qa?.txt ?? '').trim(), p = v ? preview(v) : null; K.qa = null; return openForm(p ? { t: p.title || '', ...(p.date ? { k: p.date } : {}), ...(p.start ? { s: p.start, e: p.end } : {}), r: p.place || '', n: v.length > 60 ? v : '', rem: '1h' } : {}); }
    if ('kFull' in d) return setWebLayout(K.full ? 'menu' : 'full');
    if ('kClosecal' in d) return closeCal();
    if ('kDrawer' in d) { K.drawer = !K.drawer; return paint(); }
    if (d.kWk) { K.drawer = false; K.miniOff = 0; return setView('uke', d.kWk); }
    if ('kRetry' in d) { ensureKal(true); return; }
    if ('kSet' in d) { openSettings('kal'); return; }
    if ('kReconnect' in d) { K.form = null; paint(); openSettings('kal'); return; }
    if (d.kView) return setView(d.kView);
    if (d.kNav) return shift(+d.kNav);
    if ('kToday' in d) return goToday();
    if ('kNew' in d) return openForm();
    if ('kSearch' in d) { K.srch = { q: '', res: [], focus: true }; K.mini = false; return paint(); }
    if ('kTitl' in d) { if (isMobile()) { K.mini = !K.mini; K.miniOff = 0; paint(); } return; }
    if (d.kMini) { K.miniOff += +d.kMini; return paint(); }
    if (d.kGo) { K.cur = d.kGo; K.mini = false; K.drawer = false; K.miniOff = 0; if (K.view === 'mnd' || K.view === 'liste') K.view = K.view; return paint(); }
    if (d.kCal) { K.filt = { ...K.filt, [d.kCal]: !shownCal(d.kCal) }; savePref('kalFilters', K.filt); return paint(); }
    if (d.kDay) return setView('dag', d.kDay);
    if (d.kSel) { K.sel = d.kSel; K.delArm = false; K.err2 = ''; return paint(); }
    if (d.kHit) { const e = findEv(d.kHit); K.srch = null; K.cur = d.kHitk; if (K.view === 'mnd' || K.view === 'liste') K.view = 'dag'; K.sel = e ? e.id : null; gridKey = ''; return paint(); }
    if (d.kRem) { const ev = findEv(K.sel); if (ev) { const id = ev.oid || ev.id; K.rem = { ...K.rem, [id]: d.kRem, [ev.id]: d.kRem }; savePref('kalReminders', { [id]: d.kRem }); } return paint(); }
    if ('kEdit' in d) { const ev = findEv(K.sel); if (ev) { K.sel = null; K.form = { ...formFromEvent(ev), focus: true }; paint(); } return; }
    if ('kDel' in d) { const ev = findEv(K.sel); if (ev) delEvent(ev); return; }
    if ('kCopy' in d) { const ev = findEv(K.sel); if (ev) copyEvent(ev); return; }
    if ('kFall' in d) { readFormSafe(); K.form.all = !K.form.all; return paint(); }
    if (d.kFcal) { readFormSafe(); K.form.cal = d.kFcal; return paint(); }
    if (d.kFrep) { readFormSafe(); K.form.rep = d.kFrep; return paint(); }
    if (d.kFrem) { readFormSafe(); K.form.rem = d.kFrem; return paint(); }
    // Klikk på tom plass i rutenettet: ny hendelse på den halvtimen.
    if (d.kTap && tg === b) {
      const r = b.getBoundingClientRect(), m = Math.max(0, Math.min(23 * 60, Math.floor((e.clientY - r.top) / HH() * 2) * 30));
      openForm({ k: d.kTap, s: hmM(m), e: hmM(Math.min(m + 60, 23 * 60 + 59)) });
    }
  });
}
function readFormSafe() { const f = host()?.querySelector('[data-k-form]'); if (f && K.form) readForm(f); }
function closeSheets() {
  if (!K.sel && !K.form && !K.srch && !K.mini && !K.qa && !K.drawer) return false;
  K.sel = null; K.form = null; K.srch = null; K.mini = false; K.qa = null; K.drawer = false; K.delArm = false; K.err2 = '';
  clearTimeout(sTimer); sCtl?.abort();
  paint();
  return true;
}

function bindKeys() {
  if (keyBound) return;
  keyBound = true;
  window.addEventListener('keydown', (e) => {
    if (!host() || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (document.getElementById('settings') && !document.getElementById('settings').hidden) return;
    const tag = e.target?.tagName ?? '';
    if (e.key === 'Escape') {
      if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.value && e.target.closest('[data-sf]')) return;
      if (closeSheets()) { e.preventDefault(); return; }
      // Esc i fullskjerm = ✕ (lukker kalenderen og går til Dashboard).
      if (K.full && !isMobile()) { e.preventDefault(); closeCal(); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable) return;
    if (K.form || K.srch || K.sel || K.qa) return;
    const k = e.key.toLowerCase(), V = { d: 'dag', 3: '3d', w: 'uke', m: 'mnd', l: 'liste' };
    if (e.key === 'ArrowLeft') shift(-1);
    else if (e.key === 'ArrowRight') shift(1);
    else if (k === 't') goToday();
    else if (V[k]) setView(V[k]);
    else if (k === 'n') openForm();
    else if (e.key === '/') { K.srch = { q: '', res: [], focus: true }; paint(); }
    else return;
    e.preventDefault();
  });
}

function loadFonts() {
  if (document.querySelector('link[data-hl-fonts],link[data-kal-fonts]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; l.dataset.kalFonts = ''; document.head.appendChild(l);
}

function startTick() {
  if (tickT) return;
  // NESTE-stripen og nålinjen oppdateres hvert halve minutt; data hentes på nytt hvert 10. minutt (serveren cacher en time).
  tickT = setInterval(() => {
    if (document.hidden) return;
    const h = host(), w = document.querySelector('[data-w="d_kal"],[data-w="p_kal"]');
    if (!h && !w) return;
    if (Date.now() - K.at > 10 * 60_000) ensureKal();
    if (h && !K.form && !K.srch && !K.qa) paint();
    refresh('d_kal', 'p_kal');
  }, 30_000);
}

export function render() {
  loadFonts();
  bindKeys();
  gridKey = '';
  K.drawer = false;
  setTimeout(() => {
    const h = host();
    if (!h) return;
    bind(h);
    // Tilbake fra Google-innloggingen startet i Innstillinger → Kalendere.
    const qh = new URLSearchParams(location.hash.split('?')[1] ?? ''), qs = new URLSearchParams(location.search);
    const g = qs.get('google') ?? qh.get('google');
    if (qh.has('settings') || g) {
      history.replaceState(null, '', location.pathname + '#/kalender');
      openSettings(qh.get('settings') || 'kal');
      if (g) setTimeout(() => flash(/^(ok|1|true|connected)$/.test(g) ? 'Koblet til Google Kalender' : `Google: ${qs.get('message') || qh.get('message') || 'innloggingen ble avbrutt'}`), 300);
    }
    loadPrefs().then(paint);
    ensureKal();
    startTick();
  });
  return `<div id="kal" class="kal k2${K.full && !isMobile() ? ' k2-fs' : ''}">${body()}</div>`;
}
// Ut av Kalender: fullskjerm-låsen på siden fjernes.
window.addEventListener('hashchange', () => { if (!/^#\/kalender/.test(location.hash)) document.body.classList.remove('kal-fs'); });
// Rask time (kal-quick.js): Vis hopper til dagen, feil åpner skjemaet, ferdig henter kalenderen på nytt.
setQuickHooks({
  show: (k) => { K.cur = k; K.sel = null; gridKey = ''; if (K.view === 'liste') K.view = 'dag'; if (document.body.dataset.route !== 'kalender') location.hash = '#/kalender'; else paint(); },
  fail: failForm,
  changed: () => { K.at = 0; ensureKal(true); },
});

on('kalender', () => { paint(); refresh('d_kal', 'p_kal'); });
// Ny iCal-adresse eller ny timeplan fra skolen: hent kalenderen på nytt.
on('school', () => { if (K.data && !K.loading) ensureKal(true); });
let narrowWas = null;
window.addEventListener('resize', () => {
  if (!host()) return;
  gridKey = '';
  fitHeight();
  const n = narrow();
  if (narrowWas !== null && n !== narrowWas) { K.drawer = false; paint(); }
  narrowWas = n;
});

/* ---------------- Hjem-widget KALENDER (uendret) ---------------- */

function homeWidget() {
  ensureKal(); startTick();
  if (!K.data) return `<a class="kal kal-hw" href="#/kalender" aria-label="Kalender"><span class="kal-hw-h"><span class="kal-hw-k">KALENDER</span><span>›</span></span>${K.err ? `<span class="kal-hw-e">${esc(K.err)}</span>` : '<div class="skeleton" style="min-height:96px"></div>'}</a>`;
  const now = new Date(), w = wgModel(now, d0(now)), ex = w.ex[0];
  return `<a class="kal kal-hw" href="#/kalender" aria-label="Kalender – åpne">
    <span class="kal-hw-h"><span class="kal-hw-k">KALENDER · ${esc(w.k)}</span><span>${esc(w.dayT)} ›</span></span>
    <span class="kal-hw-m"><span class="kal-strip" style="background:${esc(w.c)}"></span><span class="kal-grow"><b>${esc(w.t)}</b><span>${esc(w.r)}</span></span><span class="kal-hw-r"><b>${esc(w.big)}</b><span>${esc(w.when)}</span></span></span>
    ${w.n3.length ? `<span class="kal-hw-n">${w.n3.map((e) => `<span style="border-left-color:${esc(e.c)}"><b>${esc(e.s)}</b><b>${esc(e.t)}</b></span>`).join('')}</span>` : ''}
    ${ex ? `<span class="kal-hw-x"><span>NESTE PRØVE</span><b>${esc(ex.t)}</b><span class="kal-wp${ex.soon ? ' soon' : ''}">${esc(ex.in)}</span></span>` : ''}</a>`;
}
widget('d_kal', { cls: 'card kal-hw-card', render: homeWidget });
widget('p_kal', { cls: 'p-sec', render: homeWidget });
