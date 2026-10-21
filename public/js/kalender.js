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
import { api, esc, isMobile, haptic } from './util.js';
import { store, widget, refresh, emit, on } from './store.js';
import { openSettings } from './settings.js';
import { loadBirthdays } from './birthdays.js';
import { searchField } from './searchfield.js';
import { fmtDate } from './i18n.js';
import { addQuick, preview, quickLabel, setQuickHooks } from './kal-quick.js';
import { glimt } from './glimt.js';
import { LEARN_TYPES, typeName, addMemory, applyMemory, nameOfEvent, loadMemory, dinOf } from './glimt-memory.js'; // prompt 33
import { parseDay } from './parse-day35.js'; // prompt 35: felles dag-tolkning
import * as k38 from './kal38.js'; // prompt 38: zoom, Glimt-assistenten, kart, ark/tastatur, app-modus (Mac)
import * as k42 from './kal42.js'; // prompt 42: Abonnementer (trekkdatoer fra Finans)
import * as k39 from './kal39.js'; // prompt 39: hele oppsettet er en kopi av Kalender.app for Mac (fire kalendere)
import * as k44 from './kal44.js'; // prompt 44: deltakere, adresse med forslag, Media-status, I dag-ikon
/** Prompt 31 (Kalender.dc.html): «Pilestredet park 35 U2005 https://link.mazemap.com/…» → «Pilestredet park 35 U2005». */
export const noUrl = (t) => String(t ?? '').replace(/\s*https?:\/\/\S+/g, '').trim();
const urlIn = (t) => String(t ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';

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
const SHORT = { 'Matematikk R2': 'Matte R2', 'Matematikk R1': 'Matte R1', 'Matematikk S2': 'Matte S2', 'Matematikk S1': 'Matte S1', Kroppsøving: 'Gym' };
const REMS = [['none', 'Ingen'], ['15m', '15 min før'], ['1h', '1 time før'], ['day', 'Dagen før']];
const REPS = [['none', 'Ingen'], ['daily', 'Hver dag'], ['weekly', 'Hver uke'], ['monthly', 'Hver måned']];
// Visningene: [lokal id, navn, hurtigtast, serverens kalView]
// Prompt 38: samme rekkefølge som iPhone- og Mac-appen (År/Mnd/Uke/3 d/Dag/Liste). År lagres bare i nettleseren.
const VIEWS = [['ar', 'År', 'Y', null], ['mnd', 'Måned', 'M', 'maaned'], ['uke', 'Uke', 'W', 'uke'], ['3d', '3 dager', '3', '3dager'], ['dag', 'Dag', 'D', 'dag'], ['liste', 'Liste', 'L', 'liste']];
const VIEW_LOC = { dag: 'dag', '3dager': '3d', '3d': '3d', uke: 'uke', maaned: 'mnd', mnd: 'mnd', liste: 'liste', agenda: 'liste', ar: 'ar', aar: 'ar' };
const VIEW_SRV = Object.fromEntries(VIEWS.map((v) => [v[0], v[3]]));
const LKEY = 'hl_kal_v1';
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const K = { data: null, err: '', loading: null, at: 0, fallback: false, prefs: false, range: null,
  view: 'uke', cur: null, filt: {}, rem: {}, subjC: {}, sel: null, form: null, srch: null, miniOff: 0, mini: false, delArm: false, toast: '', busy: false,
  full: true, drawer: false, qa: null }; // prompt 38: fullskjerm er standard (som Mac-vinduet); «Med toppmeny» er et valg
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
const parseD = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00') : new Date(v));
const dLong = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
const dur = (x) => (x >= 60 ? `${Math.floor(x / 60)} t ${x % 60} min` : `${x} min`);
const daysTo = (k, today) => Math.round((new Date(k + 'T12:00') - new Date(key(today) + 'T12:00')) / 864e5);
const fromKey = (k) => new Date(k + 'T12:00');
// Ukedag kort (MAN … SØN) og lang dato med Intl, så engelsk får «Monday 19 October».
const longDate = (d) => capf(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
export const semester = (d = new Date()) => `Skole · ${d.getMonth() >= 6 ? 'høst' : 'vår'} ${d.getFullYear()}`;

/* ---------------- Innstillinger per bruker ---------------- */

function readLocal() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null') ?? {}; } catch { return {}; } }
function writeLocal() { try { localStorage.setItem(LKEY, JSON.stringify({ view: K.view, filt: K.filt, rem: K.rem, subjC: K.subjC, full: K.full })); localStorage.setItem('hl_kal_full', K.full ? '1' : '0'); } catch { /* privat modus */ } }
function applyPrefs(p) {
  if (p.view && VIEW_LOC[p.view]) K.view = VIEW_LOC[p.view];
  // Prompt 38: fullskjerm er standard. «Med toppmeny» gjelder bare når den er valgt her (hl_kal_full = '0', som i designet);
  // serverens gamle standard «menu» overstyrer ikke lenger.
  if (p.full === 'full' || p.full === true) K.full = true;
  let lf = null; try { lf = localStorage.getItem('hl_kal_full'); } catch { /* */ }
  if (lf === '0') K.full = false; else if (lf === '1') K.full = true;
  if (k38.appMode()) K.full = true; // Mac-appen: alltid hele vinduet
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
  if (value == null && field === 'kalView') return; // År finnes ikke på serveren ennå
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
    // Prompt 42: trekk fra Finans → Abonnementer er egne heldagshendelser (kind 'ab'), aldri timer eller prøver.
    const isAb = k42.isSubEvent(x);
    const kind = isAb ? 'ab' : own ? 'g' : TYPES.includes(x.type) ? x.type : x.type === 'bd' ? 'bursdag' : 'time';
    const cal = calOf(x, kind);
    const base = { id: String(x.id ?? `${x.start}|${x.title}`), oid: String(x.id ?? ''), kind, cal, t: String(x.title ?? ''), short: x.short || '', subj: x.subject || (kind === 'time' ? String(x.title ?? '') : ''),
      // Prompt 31: URL-er (f.eks. mazemap-lenker fra timeplan-importen) fjernes fra stedsteksten i alle korte visninger;
      // lenken vises som «Åpne kart ↗» i detaljarket. rRaw beholdes til redigering.
      r: noUrl(x.room || x.location || ''), rRaw: x.room || x.location || '', rUrl: urlIn(x.room || x.location || ''), teacher: x.teacher || '', n: x.note || '', c: x.color || '', sc: x.subjectColor || '', sk: x.subjectKey || '', src: x.source || '', url: x.url || '', map: x.mazemap || '',
      editable: !!x.editable, rep: x.repeat || (x.recurrence ? 'rec' : ''), recurrence: x.recurrence || null, srvRem: x.reminder || '', all: !!x.allDay, startRaw: x.start, endRaw: x.end,
      // Prompt 38: adresse og kart (kal37: address, map:{lat, lon, url, appleUrl, googleUrl, label}) og serverens kind (trial ≠ prøve).
      addr: x.address || '', gmap: x.map && typeof x.map === 'object' ? x.map : null, k37: x.kind || '',
      // Prompt 44: koordinater for stedet, deltakere og Media-status (kalenderen «Media»).
      geo: x.geo && Number.isFinite(+x.geo.lat) ? { lat: +x.geo.lat, lon: +x.geo.lon } : Number.isFinite(+x.lat) && x.lat !== null && x.lat !== '' ? { lat: +x.lat, lon: +x.lon } : null,
      att: Array.isArray(x.attendees) ? x.attendees : [],
      med: x.source === 'media' || x.calendar === 'media' ? { status: x.status ?? '', statusText: x.statusText ?? '', progress: x.progress ?? null, code: x.code ?? '', ep: x.episodeTitle ?? '', href: (() => { const m = String(x.deepLink ?? '').match(/media\/(sonarr|radarr)\/(\w+)/); return m ? `#/media?open=${m[1]}:${m[2]}` : '#/media'; })() } : null,
      // Prompt 39: én av de fire kalenderne (Personlig · Bursdager · Skole · Helligdager) eller en egen, og fagets tekstfarger.
      ac: k39.cal4({ ...x, cal, kind }), stx: x.subjectTextColor || '', slt: x.subjectLightColor || '', ...(isAb ? { ab: k42.subFields(x), editable: false, all: true } : {}) };
    if (x.allDay || isAb) {
      // Heldagshendelser over flere dager: én oppføring per dag (slutt er eksklusiv).
      let d = d0(st), n = 0;
      const last = en > st ? add(d0(new Date(en - 1)), 0) : d;
      do { push(key(d), { ...base, id: n ? `${base.id}|${n}` : base.id, k: key(d), s: '', e: kind === 'innl' ? '23:59' : '' }); d = add(d, 1); n++; } while (d <= last && n < 60);
    } else if (kind === 'innl') push(key(st), { ...base, k: key(st), s: '', e: hm(en > st ? en : st) });
    else push(key(st), { ...base, k: key(st), s: hm(st), e: key(en) === key(st) && en > st ? hm(en) : '23:59' });
  }
  // Prompt 39: Helligdager (innebygd Norge) når serveren ikke sender dem selv.
  if (![...byDay.values()].some((L) => L.some((e) => e.ac === 'helligdager'))) {
    const y0 = new Date().getFullYear();
    for (const y of [y0 - 1, y0, y0 + 1]) for (const h of k39.holidays(y)) push(h.k, { id: `hd|${h.k}`, oid: '', kind: 'fri', cal: 'helligdager', ac: 'helligdager', t: h.t, short: h.t, subj: '', r: '', rRaw: '', rUrl: '', teacher: '', n: '', c: '', sc: '', sk: '', src: 'builtin', url: '', map: '', editable: false, rep: '', recurrence: null, srvRem: '', all: true, startRaw: h.k, endRaw: h.k, addr: '', gmap: null, k37: '', stx: '', slt: '', k: h.k, s: '', e: '' });
  }
  // Planleggingsdag/fri fjerner timene, og en prøve med klokkeslett erstatter timene den overlapper.
  for (const [k, L] of byDay) {
    let out = L;
    if (L.some((e) => e.kind === 'fri' && e.ac !== 'helligdager')) out = out.filter((e) => e.kind !== 'time');
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
    const [r] = await Promise.all([api(`/kalender?from=${from}&to=${to}`).then((x) => k42.addSubs(x, from, to)), k39.loadCals()]);
    k39.localColors();
    K.data = normalize(r);
    K.range = { from, to };
    K.fallback = false; K.err = '';
  } catch (e) {
    if (e.status === 404) { if (!k39.st39.cals) await k39.loadCals(); K.data = await fallbackData(); K.fallback = true; K.err = ''; K.range = { from: key(add(tt, -400)), to: key(add(tt, 400)) }; }
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
  // Prompt 39: vinduet tar alltid med i dag (NESTE-banneret, Glimt · dagen din og minikalenderens prikker trenger det).
  // Serveren gir maks 400 dager; da hentes bare perioden (og i dag) uten ekstra marg.
  const c = fromKey(a), t0 = d0(new Date()), lo = (...x) => x.sort()[0], hi = (...x) => x.sort().pop();
  let f = lo(key(add(c, -60)), key(add(t0, -42))), t = hi(key(add(fromKey(b), 30)), key(add(c, 150)), key(add(t0, 120)));
  if (daysTo(t, fromKey(f)) > 399) { f = lo(a, key(add(t0, -7))); t = hi(b, key(add(t0, 7))); if (daysTo(t, fromKey(f)) > 399) t = key(add(fromKey(f), 399)); }
  K.loading = fetchKal(f, t).finally(() => { K.loading = null; });
}

/* ---------------- Hjelpere ---------------- */

// Prompt 39: kalenderne er de fire (+ egne) fra kal39.js; gamle id-er (privat, timeplan …) slås opp via aliasene der.
const calList = () => k39.cals();
const calById = (id) => { const c = k39.calById(k39.cal4({ calendar: id })); return { ...c, src: c.sourceLabel ?? '', writable: c.id === 'personlig' || !!c.own }; };
const shownCal = (id) => k39.shown(id); // prompt 39: de fire kalenderne (e.ac)
function evOn(d, all = false) {
  const L = K.data?.byDay.get(key(d)) ?? [];
  return all ? L : L.filter((e) => shownCal(e.ac));
}
// Prompt 37: egen farge per fag (serverens subjectColor, stabil per bruker). Prøver og frister får samme fag-farge.
const col = (e) => k39.evTone(e).c; // prompt 39: fagfarge i Skole, ellers kalenderens farge (som Mac)
const short = (e) => (e.kind === 'time' ? e.short || SHORT[e.subj] || e.subj || e.t : e.t);
const tmOf = (e) => (e.kind === 'innl' ? (e.e ? `Frist ${e.e}` : 'Frist') : e.s ? `${e.s}–${e.e}` : 'Hele dagen');
const sub2 = (...a) => a.filter(Boolean).join(' · ');
const isLesson = (e) => e.s && (e.kind === 'time' || e.kind === 'prove');
const findEv = (id) => K.data?.byId.get(id) ?? null;
const inTxt = (dd) => (dd === 0 ? 'I dag' : dd === 1 ? 'I morgen' : `${dd} dager`);
const curD = () => (K.cur ? fromKey(K.cur) : d0(new Date()));

function exams(today) {
  const tk = key(today), out = [];
  for (const [k, L] of K.data?.byDay ?? []) if (k >= tk) for (const e of L) if ((e.kind === 'prove' || e.kind === 'innl') && shownCal(e.ac)) out.push(e);
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

/* Prompt 39: NESTE-banneret, sidemenyen og alle visningene tegnes av kal39.js (kopi av Kalender.app for Mac). */

/* ---------------- Ark: detaljer, skjema, søk ---------------- */

const remOf = (e) => K.rem[e.id] ?? K.rem[e.oid] ?? (e.srvRem && e.srvRem !== 'none' ? e.srvRem : e.kind === 'prove' || e.kind === 'innl' ? 'day' : 'none');
function detailSheet() {
  const e = K.sel && findEv(K.sel);
  if (!e) return '';
  if (e.kind === 'ab') return k42.subSheet(e, { longDate, fromKey }); // prompt 42
  const sd = fromKey(e.k), R = remOf(e), cal = calById(e.ac);
  const rows = [e.r && ['Sted', e.r, 1], e.teacher && ['Lærer', e.teacher, 1], ['Kalender', cal.name], e.kind !== 'time' && e.subj && ['Fag', e.subj, 1], e.n && ['Merknad', e.n, 1],
    e.rep && e.rep !== 'none' && ['Gjentas', { daily: 'Hver dag', weekly: 'Hver uke', monthly: 'Hver måned', rec: 'Ja' }[e.rep] ?? e.rep]].filter(Boolean);
  const kk = cal.name.toUpperCase() + (e.kind === 'prove' ? ' · PRØVE' : e.kind === 'innl' ? ' · INNLEVERING' : '');
  const map = e.rUrl || e.map || (e.r && /^[A-Z]{1,2}-?\d|aula|hall|gym|bibl|rom\b|sal\b/i.test(e.r) && e.kind !== 'bursdag' ? `https://use.mazemap.com/#v=1&search=${encodeURIComponent(e.r)}` : '');
  const src = e.editable ? `Lagret i Google Kalender (${cal.name}).` : cal.src ? `Fra ${cal.src}. Endres i kilden.` : '';
  return `<div class="k2-sheet-bg" data-k-close><div class="k2-sheet" role="dialog" aria-modal="true" aria-label="${esc(e.t)}" style="--c:${esc(col(e))}">
    <span class="k2-grip k38-grip" aria-hidden="true"></span>
    <div class="k2-det-h"><span class="k2-strip"></span><div class="k2-grow"><span class="k2-lab">${esc(kk)}</span><b data-no-i18n>${esc(e.t)}</b><span>${esc(`${longDate(sd)} · `)}${esc(tmOf(e))}</span></div><button type="button" class="k2-x" data-k-close aria-label="Lukk">✕</button></div>
    <div class="k2-rows">${rows.map(([a, b, u]) => `<div><span>${esc(a)}</span><b${u ? ' data-no-i18n' : ''}>${esc(b)}</b></div>`).join('')}</div>
    ${k38.detailMap(e)}
    ${k44.detailExtra(e)}
    <span class="k2-lab">VARSEL</span><div class="k2-chips">${REMS.map(([v, n]) => `<button type="button" class="k2-chip${R === v ? ' on' : ''}" data-k-rem="${v}" aria-pressed="${R === v}">${n}</button>`).join('')}</div>
    ${src ? `<span class="k2-src">${esc(src)}</span>` : ''}
    ${e.editable ? '<button type="button" class="k2-link k2-learn" data-k-learn>Lær Glimt hva dette er…</button>' : ''}
    ${K.err2 ? `<span class="k2-err">${esc(K.err2)}</span>` : ''}
    <div class="k2-btns">${e.editable ? `<button type="button" class="k2-b ink" data-k-edit>Rediger</button><button type="button" class="k2-b red" data-k-del>${K.delArm ? 'Trykk igjen for å slette' : 'Slett'}</button>` : ''}
      ${map ? `<a class="k2-b line" href="${esc(map)}" target="_blank" rel="noopener">${e.rUrl ? 'Åpne kart ↗' : 'Vis rom på kart ↗'}</a>` : ''}
      ${/^https:\/\//.test(e.url) ? `<a class="k2-b line" href="${esc(e.url)}" target="_blank" rel="noopener">Åpne ${e.src === 'canvas' ? 'i Canvas' : e.src === 'google' ? 'i Google Kalender' : 'kilden'} ↗</a>` : ''}
      ${!e.editable ? `<button type="button" class="k2-b line" data-k-copy>Kopier til Personlig</button>` : ''}</div>
  </div></div>`;
}

/* Prompt 33: «Lær Glimt hva dette er…» – velg type (+ navn), lagres som alias i «Glimt husker»; så «Endre tittel på N avtaler?».
   Samme ark brukes når brukeren selv har gitt en rask time ny tittel (forslaget fra PATCH: suggestMemory). */
function learnSheet() {
  const L = K.learn;
  if (!L) return '';
  const chip = (v, n) => `<button type="button" class="k2-chip${L.type === v ? ' on' : ''}" data-k-ltype="${esc(v)}" aria-pressed="${L.type === v}">${esc(n)}</button>`;
  const inner = L.step === 'ask'
    ? `<p class="k2-learn-q">Ok, Glimt husker at <b data-no-i18n>${esc(L.name)}</b> er ${esc(dinOf(L.type))}.</p>
       ${L.count ? `<p class="k2-learn-q">Endre tittel på ${L.count} ${L.count === 1 ? 'avtale' : 'avtaler'} til «<span data-no-i18n>${esc(L.title)}</span>»?</p>
       <div class="k2-btns"><button type="button" class="k2-b ink" data-k-lapply${K.busy ? ' disabled' : ''}>${K.busy ? 'Endrer …' : 'Endre'}</button><button type="button" class="k2-b line" data-k-lclose>Nei takk</button></div>`
    : '<div class="k2-btns"><button type="button" class="k2-b ink" data-k-lclose>Ferdig</button></div>'}`
    : `${L.text ? `<p class="k2-learn-q">${esc(L.text)}</p>` : ''}
      <span class="k2-lab">HVA ER DETTE?</span><div class="k2-chips">${LEARN_TYPES.map(([v, n]) => chip(v, n)).join('')}</div>
      <form class="k2-form" data-k-lform>
        <input class="k2-in" name="name" value="${esc(L.name)}" placeholder="Navn på avsender, f.eks. Påhåret" autocomplete="off" required>
        ${L.type === 'annet' ? `<input class="k2-in" name="title" value="${esc(L.title ?? '')}" placeholder="Tittel, f.eks. Massasje · Spa Nova" autocomplete="off">` : ''}
        ${L.err ? `<span class="k2-err">${esc(L.err)}</span>` : ''}
        <button type="submit" class="k2-b ink"${!L.type || K.busy ? ' disabled' : ''}>${K.busy ? 'Lagrer …' : L.suggest ? 'Husk' : 'Lagre'}</button>
        <span class="k2-src">Glimt bruker dette neste gang en melding fra samme avsender legges inn. Se Innstillinger → AI → Glimt husker.</span>
      </form>`;
  return `<div class="k2-sheet-bg" data-k-lclose><div class="k2-sheet k2-learn-sheet" role="dialog" aria-modal="true" aria-label="Lær Glimt hva dette er">
    <div class="k2-det-h"><div class="k2-grow"><span class="k2-lab">✦ GLIMT HUSKER</span><b>Lær Glimt hva dette er</b></div><button type="button" class="k2-x" data-k-lclose aria-label="Lukk">✕</button></div>
    ${inner}
  </div></div>`;
}
function openLearn(ev, pre = {}) {
  K.learn = { step: 'pick', type: pre.type ?? '', name: pre.name ?? nameOfEvent(ev ?? {}), title: pre.title ?? '', text: pre.text ?? '', suggest: !!pre.suggest, err: '', focus: true };
  paint();
}
async function saveLearn(f) {
  const L = K.learn;
  const fd = new FormData(f);
  L.name = String(fd.get('name') ?? '').trim(); L.title = String(fd.get('title') ?? L.title ?? '').trim();
  if (!L.type) { L.err = 'Velg hva det er.'; return paint(); }
  if (L.name.length < 2) { L.err = 'Skriv navnet på avsenderen.'; return paint(); }
  const lab = typeName(L.type);
  const title = L.type === 'annet' ? L.title || L.name : L.suggest && L.title ? L.title : `${lab} · ${L.name}`;
  K.busy = true; L.err = ''; paint();
  try {
    const d = await addMemory({ match: L.name, type: L.type, title });
    Object.assign(L, { step: 'ask', id: d.item?.id, count: d.matches ?? 0, title: d.item?.title || title });
  } catch (e) { L.err = e.message; } finally { K.busy = false; paint(); }
}
async function runApply() {
  const L = K.learn;
  if (!L?.id) return;
  K.busy = true; paint();
  try {
    const d = await applyMemory(L.id);
    K.learn = null;
    flash(d.count ? `${d.count} ${d.count === 1 ? 'avtale' : 'avtaler'} fikk nytt navn` : 'Ingen avtaler å endre');
    await ensureKal(true);
  } catch (e) { if (K.learn) { K.learn.err = e.message; K.learn.step = 'pick'; } } finally { K.busy = false; paint(); }
}

function formSheet() {
  const F = K.form;
  if (!F) return '';
  const chip = (on, attr, n, c) => `<button type="button" class="k2-chip${on ? ' on' : ''}" ${attr} aria-pressed="${on}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}</button>`;
  // Prompt 39: nye hendelser lagres i primær Google-kalender (Personlig) eller i en egen kalender.
  const wcals = [{ id: 'privat', name: 'Personlig', color: k39.calById('personlig').color }, ...calList().filter((c) => c.own).map((c) => ({ id: c.id, name: c.name, color: c.color }))];
  return `<div class="k2-sheet-bg" data-k-fclose><div class="k2-sheet" role="dialog" aria-modal="true" aria-label="${F.id ? 'Rediger hendelse' : 'Ny hendelse'}">
    <span class="k2-grip k38-grip" aria-hidden="true"></span>
    <div class="k2-det-h"><b class="k2-grow k2-fh">${F.id ? 'Rediger hendelse' : 'Ny hendelse'}</b><button type="button" class="k2-x" data-k-fclose aria-label="Lukk">✕</button></div>
    ${fmAiHtml(F)}
    <form class="k2-form" data-k-form>
      <input class="k2-in k2-big" name="title" value="${esc(F.t)}" placeholder="Tittel" autocomplete="off" required>
      <div class="k2-box">
        <button type="button" class="k2-sw" data-k-fall role="switch" aria-checked="${!!F.all}"><span>Hele dagen</span><i></i></button>
        <label><span>Dato</span><input type="date" name="date" value="${esc(F.k)}" required></label>
        ${F.all ? `<label><span>Til og med</span><input type="date" name="endDate" value="${esc(F.endDate || F.k)}"></label>`
    : `<label><span>Fra</span><input type="time" name="start" step="300" value="${esc(F.s)}"></label><label><span>Til</span><input type="time" name="end" step="300" value="${esc(F.e)}"></label>`}
      </div>
      <input class="k2-in" name="location" value="${esc(F.r)}" placeholder="Sted eller adresse" autocomplete="off" aria-label="Sted eller adresse">
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

/* ---------- Prompt 32: «✦ Beskriv med Glimt» øverst i Ny/Rediger hendelse (claude-code-kalender-ny-hendelse-glimt.md, fmAi) ---------- */
function fmAiHtml(F) {
  const A = F.aiS ?? {}, txt = F.ai ?? '', has = !!txt.trim(), busy = !!A.busy;
  return `<div class="k3-fa"><div class="k3-fa-h"><span class="k3-fa-l">✦ BESKRIV MED GLIMT</span>${A.done ? `<span class="k3-fa-ok">✓ ${esc(A.note || 'Fylte ut')}</span>` : ''}</div>
    <div class="k3-fa-r"><textarea class="k3-fa-in" rows="2" data-k-ai placeholder="F.eks. «Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før» eller lim inn en melding" aria-label="Beskriv hendelsen">${esc(txt)}</textarea>
    <button type="button" class="k3-fa-b${has ? ' on' : ''}" data-k-airun${!has || busy ? ' aria-disabled="true"' : ''}>${glimt(28, busy ? 'tenker' : 'klar')}<span>${busy ? 'Fyller ut …' : 'Fyll ut'}</span></button></div>
    ${A.err ? `<span class="k3-fa-err" role="alert">${esc(A.err)}</span>` : ''}</div>`;
}
const hhmm = (v) => { const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
const remKey = (v) => (typeof v === 'number' ? (v < 0 || v === 0 ? 'none' : v >= 1440 ? 'day' : v >= 60 ? '1h' : '15m') : v);
// Gateadresse i teksten («Bogstadveien 12», «Storgata 3B») når parseren ikke fant sted.
const addrOf = (t) => (String(t).match(/\b[A-ZÆØÅ][a-zæøåé]+(?:veien|vegen|vei|veg|gata|gaten|gate|plass|plassen|allé|alle|torget|bakken|stien)\s+\d+\s?[A-Za-z]?\b/) ?? [''])[0].trim();
const listJoin = (a) => (a.length > 2 ? `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}` : a.join(' og '));
/** Fyller feltene i skjemaet ut fra teksten. Ingenting lagres før man trykker Lagre. */
async function runFmAi() {
  readFormSafe();
  const F = K.form;
  if (!F || F.aiS?.busy) return;
  const txt = String(F.ai ?? '').trim();
  if (!txt) return;
  const t = txt.toLowerCase();
  F.aiS = { busy: true }; paint();
  const apply = (o, src = '') => {
    if (K.form !== F) return;
    const got = [];
    if (o.t) { F.t = o.t; got.push('tittel'); }
    if (o.k) { F.k = o.k; got.push('dato'); }
    if (o.s) { F.all = false; F.s = o.s; F.e = o.e && mm(o.e) > mm(o.s) ? o.e : hmM(Math.min(mm(o.s) + 60, 23 * 60 + 59)); got.push('tid'); } else if (o.all && o.k) F.all = true;
    if (o.r) { F.r = o.r; got.push('sted'); }
    const rp = /hver dag|daglig/.test(t) ? 'daily' : /hver uke|ukentlig|hver (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/.test(t) ? 'weekly' : /hver måned|månedlig/.test(t) ? 'monthly' : o.rep && REPS.some(([v]) => v === o.rep) ? o.rep : null;
    if (rp) { F.rep = rp; got.push('gjentakelse'); }
    const rm = /dagen før/.test(t) ? 'day' : /(1|en) time før|times? før/.test(t) ? '1h' : /15 min|10 min/.test(t) ? '15m' : /ingen varsel|ikke varsle/.test(t) ? 'none' : o.rem && REMS.some(([v]) => v === o.rem) ? o.rem : null;
    if (rm) { F.rem = rm; got.push('varsel'); }
    if (/familie|famil|barna|mamma|pappa/.test(t)) { F.cal = 'familie'; got.push('kalender'); } else if (o.cal === 'familie' || o.cal === 'privat') F.cal = o.cal;
    if (txt.length > 60 && !F.n) F.n = txt;
    return got;
  };
  const p = preview(txt);
  if (p.ok && p.date) {
    await new Promise((r) => setTimeout(r, 350));
    const got = apply({ t: p.title, k: p.date, s: p.start, e: p.end, all: p.allDay, r: p.place || addrOf(txt) });
    if (K.form === F) { F.aiS = { done: true, note: `Fylte ut ${listJoin(got)}` }; paint(); }
    return;
  }
  // Fant ikke dato lokalt: spør serveren (rask time-parseren + lokal modell).
  let o = null, part = null, srvErr = '';
  try {
    const r = await fetch('/api/kalender/describe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) });
    if (r.ok) {
      // SERVER32: {ok, filled, note, error?, event:{title, allDay, date, start, end, location, calendar, repeat, reminder, note}}
      const j = await r.json(), x = j.event ?? j.fields ?? j;
      const k = x.k ?? x.date ?? null, s0 = x.s ?? x.start ?? '', e0 = x.e ?? x.end ?? '';
      const f = { t: x.t ?? x.title ?? '', k: k && /^\d{4}-\d{2}-\d{2}/.test(String(k)) ? String(k).slice(0, 10) : '', s: hhmm(s0), e: hhmm(e0), all: !!(x.all ?? x.allDay) || !s0, r: x.r ?? x.location ?? x.place ?? '', rep: x.rep ?? x.repeat, rem: remKey(x.rem ?? x.reminder), cal: x.cal ?? x.calendar, n: x.n ?? x.note ?? '' };
      if (f.k && j.ok !== false) o = f; else { part = f; srvErr = j.error || ''; }
    }
  } catch { /* uten nett eller eldre server */ }
  if (K.form !== F) return;
  if (o) { const got = apply(o); if (o.n && !F.n) F.n = o.n; F.aiS = { done: true, note: `Fylte ut ${listJoin(got)}` }; }
  else { apply(part ? { ...part, k: '' } : { t: p.title, s: p.start, e: p.end, r: p.place || addrOf(txt) }); F.aiS = { err: srvErr || 'Fant ikke dato. Velg dato under.' }; }
  paint();
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
  return `<div class="k2-qa-pv"><span class="k2-strip" style="background:${esc(calById('personlig').color)}"></span><div class="k2-grow"><b data-no-i18n>${esc(p.title)}</b><span>${esc(dt)}</span>${p.place ? `<span data-no-i18n>${esc(p.place)}</span>` : ''}<span class="k2-qa-cal">Personlig · varsel 1 time før</span></div></div>`;
}
function paintQa() { const el = host()?.querySelector('[data-k-qpv]'); if (el) el.innerHTML = qaPreview(); const b = host()?.querySelector('.k2-qa-go'); if (b) { if ((K.qa?.txt ?? '').trim()) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); } }
function openQa(txt = '') { K.sel = null; K.form = null; K.srch = null; K.drawer = false; K.qa = { txt, err: '', focus: true }; paint(); loadMemory().then(() => { if (K.qa) paintQa(); }); }
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

/* ---------------- Søk med Glimt (prompt 32, claude-code-kalender-sok-glimt.md, fasit sr/srLocal/srCloud) ---------------- */
const SR_SUGG = ['Hva har jeg i morgen?', 'Når er neste prøve?', 'Er jeg ledig fredag ettermiddag?', 'Hva skjer neste uke?'];
const IC_X = (n = 11, w = 3.2) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const srNorm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/(?![̊̈])[̀-ͯ]/g, '').normalize('NFC');
const srFilt = (e) => { const F = K.srch?.f ?? '*'; return F === '*' || e.ac === F; };
const relOf = (i) => (i === 0 ? 'i dag' : i === 1 ? 'i morgen' : i === -1 ? 'i går' : i > 0 ? `om ${i} dager` : `${Math.abs(i)} dager siden`);
function openSearch(q = '') {
  K.srch = { q, f: '*', res: [], ai: null, hi: -1, focus: true }; K.mini = false; K.sel = null; K.form = null; K.qa = null;
  const td = d0(new Date()); ensureRange(key(add(td, -31)), key(add(td, 121)));
  paint(); if (q) runSearch(q);
}
/** Hendelser som matcher q, fra 30 dager bakover til 120 dager fremover: [{e, d, i}]. */
function localSearch(q) {
  const qq = srNorm(q), today = d0(new Date()), res = [];
  for (let i = -30; i < 120 && res.length < 60; i++) {
    const d = add(today, i);
    for (const e of evOn(d, true)) if (res.length < 60 && srFilt(e) && srNorm(`${e.t} ${e.r} ${e.n} ${e.subj} ${e.teacher}`).includes(qq)) res.push({ e, d, i });
  }
  return res;
}
function hlTitle(t, q) {
  const ix = q ? srNorm(t).indexOf(srNorm(q)) : -1;
  return ix < 0 ? esc(t) : `${esc(t.slice(0, ix))}<mark class="k3-hit">${esc(t.slice(ix, ix + q.length))}</mark>${esc(t.slice(ix + q.length))}`;
}
const srRow = (x, inner, strip = true) => `<button type="button" class="k3-row" data-k-hit="${esc(x.e.id)}" data-k-hitk="${esc(key(x.d))}">${strip ? `<span class="k3-strip" style="background:${esc(col(x.e))}"></span>` : ''}${inner}</button>`;
const SR_STOP = new Set(['når', 'er', 'neste', 'min', 'mitt', 'mi', 'mine', 'har', 'jeg', 'skal', 'hva', 'hos', 'den', 'det', 'en', 'et', 'ei', 'på', 'i', 'meg', 'til', 'om', 'av', 'for', 'med', 'og', 'kommer', 'blir', 'neste', 'gang', 'time', 'timen', 'timer', 'avtale', 'avtalen', 'avtaler']);
const SR_SUF = /(timen|time|timer|avtalen|avtale|avtaler|ene|en|et|er|a)$/;
/** Søkeord uten stoppord og endelser: «når er neste frisørtime» → ['frisør']. */
function srWords(n) {
  return srNorm(n).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !SR_STOP.has(w)).map((w) => { const b = w.replace(SR_SUF, ''); return b.length >= 3 ? b : w; }).filter((w) => w.length >= 2);
}
/** Delord begge veier: et ord i teksten og søkeordet deler minst 4 tegn i starten, eller det ene inneholder det andre. */
function srHas(text, w) {
  const T = srNorm(text);
  if (T.includes(w)) return true;
  return T.split(/[^\p{L}\p{N}]+/u).some((t) => t.length >= 4 && w.length >= 4 && (t.startsWith(w.slice(0, Math.max(4, Math.min(w.length, t.length)))) || w.startsWith(t)));
}
/** Lokale svar (raskt, uten nett): dag/periode, ledig tid, prøver/frister, «neste X». null = la AI svare. */
function srLocal(q) {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes(), n = q.toLowerCase().replace(/[?!.,]/g, ' ');
  let from = null, to = null, lbl = '';
  // Prompt 35: felles dag-tolkning (parse-day35.js): «imorgen», «i morra», «tomorrow», ukedager og datoer.
  if (/neste uke|next week/.test(n)) { const m = add(today, 7 - ((today.getDay() + 6) % 7)); from = m; to = add(m, 6); lbl = 'neste uke'; }
  else if (/denne uk|resten av uk|this week/.test(n)) { from = today; to = add(today, 6 - ((today.getDay() + 6) % 7)); lbl = 'resten av uka'; }
  else { const pd = parseDay(n, now); if (pd) { from = to = pd.date; lbl = pd.label; } }
  const span = (a, b) => { const out = []; for (let d = a; d <= b; d = add(d, 1)) evOn(d).forEach((e) => { if (srFilt(e) && (d.getTime() !== today.getTime() || !e.e || mm(e.e) > nm || /ledig/.test(n))) out.push({ e, d }); }); return out; };
  const rel = (d) => relOf(Math.round((d - today) / 864e5));
  if (/ledig|fri tid|tid til|opptatt/.test(n)) {
    const d = from || today, pm = /ettermiddag|kveld/.test(n), am = /formiddag|morgen\b/.test(n) && !/i morgen/.test(n);
    const A0 = pm ? 12 * 60 : 8 * 60, B0 = pm ? 20 * 60 : am ? 12 * 60 : 20 * 60;
    const L = evOn(d).filter((e) => e.s && e.e).map((e) => [mm(e.s), mm(e.e)]).sort((x, y) => x[0] - y[0]);
    let tt = A0; if (d.getTime() === today.getTime()) tt = Math.max(tt, Math.ceil(nm / 15) * 15);
    const fr = [];
    L.forEach(([x, y]) => { if (x > tt && Math.min(x, B0) - tt >= 30) fr.push([tt, Math.min(x, B0)]); tt = Math.max(tt, y); });
    if (B0 - tt >= 30) fr.push([tt, B0]);
    const f = fr.filter(([x, y]) => y - x >= 30 && x < B0);
    return { txt: capf(dLong(d)) + (f.length ? ` er du ledig ${f.map(([x, y]) => `${hmM(x)}–${hmM(y)}`).join(', ')}.` : ` er du opptatt hele ${pm ? 'ettermiddagen' : 'dagen'}.`), items: span(d, d).filter((x) => x.e.s) };
  }
  if (/prøve|prove|eksamen|frist|innlever|oblig/.test(n) && !from) {
    const out = [];
    for (let i = 0; i < 120 && out.length < 6; i++) { const d = add(today, i); evOn(d, true).filter((e) => (e.kind === 'prove' || e.kind === 'innl') && (i > 0 || !e.e || mm(e.e) > nm)).forEach((e) => out.push({ e, d })); }
    if (!out.length) return { txt: 'Ingen prøver eller frister de neste fire månedene.', items: [] };
    const x = out[0];
    return { txt: `Neste er ${short(x.e)} ${dLong(x.d)} (${rel(x.d)})${out.length > 1 ? `. Deretter ${out.length - 1} til.` : '.'}`, items: out };
  }
  if (from) {
    const L = span(from, to);
    if (!L.length) return { txt: `Du har ingenting i kalenderen ${lbl}.`, items: [] };
    const nT = L.filter((x) => x.e.kind === 'time').length;
    return { txt: `${capf(lbl)} har du ${L.length} ting${nT ? `, ${nT} av dem i timeplanen` : ''}. Først ut: ${short(L[0].e)}${L[0].e.s ? ` kl. ${L[0].e.s}` : ''}.`, items: L };
  }
  // «når hadde jeg tannlege sist», «alle prøver i november», «hva skjer i desember»: serveren svarer (calendar-glimt.js).
  if (/\bsist\b|hadde jeg|\bi (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\b/.test(n)) return null;
  if (/neste|når/.test(n)) {
    // Prompt 34: stoppord og endelser bort («frisørtimen» → «frisør»), og delord begge veier med minst 4 tegn felles.
    const kw = srWords(n);
    if (kw.length) {
      for (let i = 0; i < 120; i++) {
        const d = add(today, i), e = evOn(d, true).find((x) => srFilt(x) && (i > 0 || !x.e || mm(x.e) > nm) && kw.every((w) => srHas(`${x.t} ${x.subj ?? ''} ${x.r ?? ''}`, w)));
        if (e) return { txt: `${short(e)} er ${dLong(d)}${e.s ? ` kl. ${e.s}` : ''} (${rel(d)})${e.r ? `, ${noUrl(e.r)}` : ''}.`, items: [{ e, d }] };
      }
    }
  }
  return null;
}
/** Neste 5 hendelser (reservesvar når Glimt ikke forstår spørsmålet lokalt). */
function nextFive() {
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes(), out = [];
  for (let i = 0; i < 60 && out.length < 5; i++) { const d = add(today, i); evOn(d).filter((e) => srFilt(e) && (i > 0 || !e.e || mm(e.e) > nm)).forEach((e) => { if (out.length < 5) out.push({ e, d }); }); }
  return out;
}
const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
/** Prompt 34: serveren svarer – POST /api/glimt {prompt, tool:'calendar'} → {text} og GET /api/kalender/search?ai=1 parallelt (12 s). */
async function askServer(q) {
  const T = withTimeout(12_000), clean = (t) => String(t ?? '').replace(/\*\*/g, '').replace(/\s*\[\d+\]/g, '').trim();
  const viaGlimt = fetch('/api/glimt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: q, tool: 'calendar' }), credentials: 'same-origin', signal: T.signal })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Feil ${r.status}`); const txt = clean(j.text ?? j.answer ?? j.reply); if (!txt) throw new Error(j.error || 'tomt svar'); return { txt, items: [], model: j.model }; });
  const viaSearch = fetch(`/api/kalender/search?q=${encodeURIComponent(q)}&ai=1`, { cache: 'no-store', credentials: 'same-origin', signal: T.signal })
    .then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
      // SERVER32: {answer:{text, kind, items:[…]}, events, total}. Eldre/andre former tåles også.
      const A = j.answer && typeof j.answer === 'object' ? j.answer : j.ai && typeof j.ai === 'object' ? j.ai : j;
      const txt = clean(typeof A.text === 'string' ? A.text : typeof A.answer === 'string' ? A.answer : A.txt);
      if (A.error && !txt) throw new Error(A.error);
      const list = Array.isArray(A.items) ? A.items : Array.isArray(A.events) ? A.events : [];
      const nz = list.length ? normalize({ events: list, subjects: K.data?.subjects }) : null;
      const items = nz ? [...nz.byId.values()].filter((e) => !/\|\d+$/.test(e.id)).map((e) => { if (!K.data.byId.has(e.id)) K.data.byId.set(e.id, e); return { e, d: fromKey(e.k) }; }) : [];
      if (!txt || A.kind === 'none') throw new Error('ingen forståelse');
      return { txt, items };
    });
  try { return await Promise.any([viaSearch, viaGlimt]); }
  catch (e) {
    const errs = (e.errors ?? [e]).map((x) => (x.name === 'AbortError' ? 'tidsavbrudd etter 12 s' : x.message)).filter((m) => m && m !== 'ingen forståelse' && !/^Feil 404$/.test(m));
    return errs.length ? { err: errs[0] } : null;
  } finally { T.done(); }
}
/** Spør Glimt: lokalt først (420 ms «tenker»), ellers reservesvar med de neste hendelsene mens serveren svarer. */
function askGlimt(t) {
  const S = K.srch, q = String(t ?? S?.q ?? '').trim();
  if (!S || !q) return;
  S.q = q; S.hi = -1; S.ai = { q, busy: true }; S.res = localSearch(q);
  if (host()?.querySelector('[data-k-sai]')) paintAi(); else paint();
  const loc = srLocal(q);
  setTimeout(async () => {
    if (K.srch !== S || S.ai?.q !== q) return;
    if (loc) { S.ai = { q, ...loc }; paintAi(); return; }
    S.ai = { q, txt: 'Jeg er ikke sikker på hva du mener, men her er det som skjer fremover …', items: nextFive(), wait: true }; paintAi();
    const ans = await askServer(q);
    if (K.srch !== S || S.ai?.q !== q) return;
    if (ans?.txt) S.ai = { q, txt: ans.txt, items: ans.items?.length ? ans.items : S.ai.items };
    else S.ai = { ...S.ai, wait: false, err: ans?.err ? `Glimt fikk ikke svar: ${ans.err}` : '' };
    paintAi();
  }, 420);
}
function searchSheet() {
  const S = K.srch;
  if (!S) return '';
  const q = S.q ?? '', has = !!q.trim();
  const fl = [['*', 'Alle', ''], ...calList().filter((c) => c.visible !== false).map((c) => [c.id, c.name, c.color])];
  const first = !S.shown; S.shown = true;
  return `<div class="k3-sr-bg${first ? ' k3-anim' : ''}" data-k-sclose><div class="k3-sr" role="dialog" aria-modal="true" aria-label="Søk i kalenderen">
    <form class="k3-sr-f" data-k-srform><div class="k3-sr-in"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
      <input name="kq" value="${esc(q)}" placeholder="Søk, eller spør Glimt …" autocomplete="off" enterkeyhint="search" data-k-q aria-label="Søk i kalenderen">
      <button type="button" class="k3-clr" data-k-sclr aria-label="Tøm søket"${has ? '' : ' hidden'}>${IC_X()}</button>
      <button type="button" class="k3-ask${has ? ' on' : ''}" data-k-askbtn${has ? '' : ' disabled'}>✦ Spør</button></div>
      <button type="button" class="k3-sx" data-k-sclose aria-label="Lukk">${IC_X(13, 2.8)}</button></form>
    <div class="k3-fl">${fl.map(([k, n, c]) => `<button type="button" class="${(S.f ?? '*') === k ? 'on' : ''}" data-k-sf="${esc(k)}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}</button>`).join('')}</div>
    <div class="k3-sb" data-k-sres><div data-k-sai>${aiCard()}</div><div data-k-slist>${searchRes()}</div></div></div></div>`;
}
/* Prompt 34 (flimring): Glimt-merket lages én gang per tilstand og flyttes inn igjen, så animasjonen ikke starter om. */
const GM = {};
function gmNode(st) {
  if (!GM[st]) { const t = document.createElement('template'); t.innerHTML = glimt(30, st); GM[st] = t.content.firstElementChild; }
  return GM[st];
}
function aiBody(A) {
  if (A.busy) return '<span class="k3-busy">Leser kalenderen …</span>';
  const rows = (A.items ?? []).slice(0, 6).map((x) => srRow(x, `<span class="k3-tm">${esc(x.e.s || 'Hele')}</span><span class="k2-grow k3-tx"><b data-no-i18n>${esc(short(x.e))}</b><span data-no-i18n>${esc(capf(dLong(x.d)) + (x.e.r ? ` · ${noUrl(x.e.r)}` : ''))}</span></span>`)).join('');
  const err = A.err ? `<span class="k3-err" role="alert">${esc(A.err)}</span><span class="k3-erra"><button type="button" class="k3-eb" data-k-retry-ai>Prøv igjen</button><button type="button" class="k3-eb" data-k-aictl>Åpne AI-kontroll</button></span>` : '';
  return `<span class="k3-ans" data-no-i18n>${esc(A.txt ?? '')}${A.wait ? ' <span class="k3-wait">Glimt tenker videre …</span>' : ''}</span>${err}${rows ? `<div class="k3-list in">${rows}</div>` : ''}`;
}
/** AI-kortet. Forrige svar blir stående mens man skriver et nytt spørsmål (byttes først ved Enter). */
function aiCard() {
  const A = K.srch?.ai;
  if (!A) return '';
  return `<div class="k3-ai"><div class="k3-ai-h"><span class="k3-gm" data-k-gm>${glimt(30, A.busy ? 'tenker' : 'ferdig')}</span><span class="k2-grow k3-ai-l"><span class="k3-lab">GLIMT</span><span class="k3-q" data-no-i18n>«${esc(A.q)}»</span></span></div><div data-k-abody>${aiBody(A)}</div></div>`;
}
/** Tegner bare AI-kortet på nytt (svaret kom). Merket byttes bare hvis tilstanden endret seg. */
function paintAi() {
  const h = host(), el = h?.querySelector('[data-k-sai]'), A = K.srch?.ai;
  if (!el) return;
  if (!A) { el.innerHTML = ''; paintRes(); return; }
  if (!el.querySelector('.k3-ai')) { el.innerHTML = aiCard(); }
  const st = A.busy ? 'tenker' : 'ferdig', slot = el.querySelector('[data-k-gm]');
  if (slot && slot.firstElementChild?.dataset.st !== st) slot.replaceChildren(gmNode(st));
  const q = el.querySelector('.k3-q'); if (q) q.textContent = `«${A.q}»`;
  el.querySelector('[data-k-abody]').innerHTML = aiBody(A);
  paintRes();
}
function searchRes() {
  const S = K.srch;
  if (!S) return '';
  const now = new Date(), today = d0(now), nm = now.getHours() * 60 + now.getMinutes(), q0 = (S.q ?? '').trim(), A = S.ai;
  let h = '';
  if (A && A.q === q0) return h; // svaret har egne rader
  if (!q0 && !A) {
    const soon = [];
    for (let i = 0; i < 14 && soon.length < 4; i++) { const d = add(today, i); evOn(d).filter((e) => e.s && (i > 0 || mm(e.e) > nm) && srFilt(e)).forEach((e) => { if (soon.length < 4) soon.push({ e, d }); }); }
    h += `<div class="k3-grp"><span class="k3-lab mut">SPØR GLIMT</span><div class="k3-list">${SR_SUGG.map((tx, i) => `<button type="button" class="k3-row k3-sug" data-k-ask="${i}"><span class="k3-sp">✦</span><span class="k2-grow">${esc(tx)}</span><span class="k3-arr">↗</span></button>`).join('')}</div></div>
      <div class="k3-grp"><span class="k3-lab mut">SNART</span><div class="k3-list">${soon.map((x) => srRow(x, `<span class="k3-dd"><span>${esc(WD[x.d.getDay()].slice(0, 3).toUpperCase())}</span><b>${x.d.getDate()}</b></span><span class="k3-strip" style="background:${esc(col(x.e))}"></span><span class="k2-grow k3-tx"><b data-no-i18n>${esc(short(x.e))}</b><span data-no-i18n>${esc(tmOf(x.e) + (x.e.r ? ` · ${noUrl(x.e.r)}` : ''))}</span></span>`, false)).join('') || '<span class="k3-none">Ingenting de neste to ukene.</span>'}</div></div>`;
    return h;
  }
  const res = S.res ?? [];
  if (res.length && q0.length >= 2) {
    const up = res.filter((x) => x.i >= 0), past = res.filter((x) => x.i < 0).reverse(), G = [];
    [...up, ...past].forEach((x) => { const k2 = key(x.d); let g = G.find((y) => y.k === k2); if (!g) { g = { k: k2, d: x.d, i: x.i, rows: [] }; G.push(g); } g.rows.push(x); });
    const F = S.f ?? '*';
    h += `<span class="k3-n">${res.length}${res.length >= 60 ? '+' : ''} treff${F !== '*' ? ` i ${esc(calById(F).name)}` : ''}</span>`;
    h += G.slice(0, 24).map((g) => `<div class="k3-grp"><span class="k3-gh"><b>${esc(capf(dLong(g.d)))}</b><span>${esc(relOf(g.i))}</span></span><div class="k3-list">${g.rows.map((x) => srRow(x, `<span class="k3-tm">${esc(x.e.s || 'Hele')}</span><span class="k2-grow k3-tx"><span class="k3-t" data-no-i18n>${hlTitle(x.e.t, q0)}</span><span data-no-i18n>${esc([noUrl(x.e.r), x.e.n].filter(Boolean).join(' · ') || tmOf(x.e))}</span></span>`)).join('')}</div></div>`).join('');
  } else if (q0.length >= 2 && !A && !S.loading) h += '<span class="k3-none">Ingen treff de neste fire månedene. Trykk «✦ Spør» for å spørre Glimt.</span>';
  else if (S.loading && !A) h += '<span class="k3-none">Søker …</span>';
  return h;
}
/** Oppdaterer bare resultatene (og ✕ / ✦ Spør) mens man skriver, så fokus blir stående i feltet. */
function paintRes() {
  const h = host(), el = h?.querySelector('[data-k-slist]');
  if (!el) return;
  const html = searchRes();
  if (html !== el._h) { el.innerHTML = html; el._h = html; } // uendret liste tegnes ikke på nytt
  const has = !!(K.srch?.q ?? '').trim(), ask = h.querySelector('.k3-ask'), clr = h.querySelector('[data-k-sclr]');
  if (ask) { ask.classList.toggle('on', has); ask.disabled = !has; }
  if (clr) clr.hidden = !has;
  markHi();
}
function markHi() {
  const rows = [...(host()?.querySelectorAll('.k3-sr [data-k-sres] .k3-row') ?? [])], i = K.srch?.hi ?? -1;
  rows.forEach((r, j) => r.classList.toggle('hi', j === i));
  if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
}

/* ---------------- Siden ---------------- */

function body() {
  if (K.err && !K.data) return `<div class="k39-msg">Kunne ikke hente kalenderen: ${esc(K.err)}<br><button type="button" class="k39-pill line" data-k-retry>Prøv igjen</button></div>`;
  if (!K.data) return '<div class="k39-msg">Laster kalenderen …</div>';
  const today = d0(new Date()), V = K.view, nar = narrow() || isMobile();
  const vis = k39.view();
  ensureRange(key(add(vis.st, -7)), key(add(vis.end, 7)));
  // Prompt 39: verktøylinje, «NESTE»-banner, linje, sidemeny (252 px) + visning – samme oppsett som MacRoot.
  const side = K.noSide && !nar ? '' : k39.sidebar(nar);
  return `${K.toast ? `<div class="k39-toast" role="status"><span>${esc(K.toast)}</span></div>` : k39.migrationNote()}${k39.toolbar(!!k38.appMode())}${k39.nextBanner()}<div class="k39-line"></div>
    <div class="k39-main">${side}<div class="k39-vw"><div class="k39-view k2-view k39-v-${V}" data-k-swipe>${vis.html}</div></div></div>
    ${k38.glimtPanel()}${k38.gotoSheet(today)}${detailSheet()}${formSheet()}${searchSheet()}${qaSheet()}${learnSheet()}`;
}

function scrollGrid(h) {
  const sc = h.querySelector('[data-k-scroll]');
  if (!sc) { gridKey = ''; return; }
  const k = `${K.view}|${K.cur ?? ''}|${isMobile()}`;
  if (gridKey === k) return;
  gridKey = k;
  k39.startScroll(h);
}

function paint() {
  const h = host();
  if (!h) return;
  const sc = h.querySelector('[data-k-scroll]'), y = sc?.scrollTop ?? 0, lst = h.querySelector('[data-k-list]')?.scrollTop ?? 0;
  const ae = document.activeElement, focusQ = ae?.matches?.('[data-k-q]'), selS = focusQ ? ae.selectionStart : 0;
  const focusQa = ae?.matches?.('[data-k-qtxt]'), selQa = focusQa ? ae.selectionStart : 0;
  // Prompt 38: Glimt-feltet og -panelet beholder fokus og markør gjennom en ny tegning.
  const focusBar = ae?.matches?.('[data-k38-bar]'), selBar = focusBar ? ae.selectionStart : 0, focusGq = ae?.matches?.('[data-k38-gq]'), selGq = focusGq ? ae.selectionStart : 0;
  const glb = h.querySelector('[data-k38-glb]')?.scrollTop ?? null;
  applyFull();
  h.classList.toggle('k38-nowk', !!K.noWeeks); h.classList.toggle('k38-noside', !!K.noSide);
  h.innerHTML = body();
  fitHeight();
  k39.fitMonth(h);
  k38.applyZoom(h);
  k44.afterPaint(h); // prompt 44
  if (focusBar || k38.G.focusBar) { const q = h.querySelector('[data-k38-bar]'); if (q) { q.focus({ preventScroll: true }); const n = focusBar ? selBar : q.value.length; try { q.setSelectionRange(n, n); } catch { /* */ } } k38.G.focusBar = false; }
  if (focusGq || k38.G.focusGq) { const q = h.querySelector('[data-k38-gq]'); if (q) { q.focus({ preventScroll: true }); const n = focusGq ? selGq : q.value.length; try { q.setSelectionRange(n, n); } catch { /* */ } } k38.G.focusGq = false; }
  const glb2 = h.querySelector('[data-k38-glb]'); if (glb2) glb2.scrollTop = glb == null ? glb2.scrollHeight : glb;
  k38.noteView(K.view, h.querySelector('.k39-title')?.textContent?.trim() ?? '');
  const sc2 = h.querySelector('[data-k-scroll]');
  if (sc2 && gridKey === `${K.view}|${K.cur ?? ''}|${isMobile()}`) sc2.scrollTop = y; else scrollGrid(h);
  const l2 = h.querySelector('[data-k-list]'); if (l2 && lst) l2.scrollTop = lst;
  if (focusQ || (K.srch && K.srch.focus)) { const q = h.querySelector('[data-k-q]'); if (q) { q.focus(); try { q.setSelectionRange(selS || q.value.length, selS || q.value.length); } catch { /* */ } } if (K.srch) K.srch.focus = false; }
  if (K.form?.focus) { K.form.focus = false; h.querySelector('[data-k-form] [name=title]')?.focus(); }
  if (K.learn?.focus) { K.learn.focus = false; h.querySelector('[data-k-lform] [name=name]')?.focus(); }
  if (focusQa || K.qa?.focus) { const q = h.querySelector('[data-k-qtxt]'); if (q) { q.focus(); const n = focusQa ? selQa : q.value.length; try { q.setSelectionRange(n, n); } catch { /* */ } } if (K.qa) K.qa.focus = false; }
}
/** Fullskjerm: kalenderen dekker hele vinduet (position:fixed) og siden bak ruller ikke. */
function applyFull() {
  const h = host(), on = !!h && K.full && !isMobile();
  h?.classList.toggle('k39-fs', on);
  document.body.classList.toggle('kal-fs', on);
}
/** Med toppmeny: høyden er vinduet minus det som ligger over kalenderen (toppmenyen), minst 620 px. */
function fitHeight() {
  const h = host();
  if (!h) return;
  if (h.classList.contains('k39-fs') || isMobile()) { h.style.removeProperty('--k2-top'); return; }
  const top = Math.max(0, Math.round(h.getBoundingClientRect().top + window.scrollY));
  h.style.setProperty('--k2-top', `${top}px`);
}
function closeCal() {
  if (k38.appMode()) return; // Mac-appen: vinduet lukkes med den røde knappen, ikke her
  closeSheets(); K.drawer = false;
  document.body.classList.remove('kal-fs');
  location.hash = '#/dash';
}
function flash(tx) { K.toast = tx; paint(); clearTimeout(toastT); toastT = setTimeout(() => { K.toast = ''; paint(); }, 2600); }

function shift(dir) {
  const c = curD();
  const n = K.view === 'ar' ? new Date(c.getFullYear() + dir, c.getMonth(), 1, 12) : K.view === 'mnd' ? new Date(c.getFullYear(), c.getMonth() + dir, 1, 12) : add(c, dir * ({ dag: 1, '3d': 3, uke: 7, liste: 14 }[K.view] ?? 1));
  K.cur = key(n); K.sel = null; K.miniOff = 0; paint();
}
function setView(v, cur, ev, dir) {
  if (!(v in VIEW_SRV)) return;
  // Prompt 38: zoom-overgang fra pekeren (inn = mer detaljer, ut = oversikt), som i iPhone-appen.
  if (v !== K.view || dir) k38.markZoom(dir || k38.zoomDir(K.view, v), ev);
  // Bytter man visning selv mens adressen er en dag, blir adressen #/kalender igjen.
  if (v !== 'dag' && DAY_RE.test(location.hash)) { dayBack = null; try { history.replaceState(history.state, '', '#/kalender'); } catch { /* */ } }
  K.view = v; K.sel = null; K.mini = false; K.miniOff = 0;
  if (cur !== undefined) K.cur = cur;
  savePref('kalView', VIEW_SRV[v]);
  paint();
}
/* Prompt 30: trykk på en dag (minikalender, månedsrute, dagshode) → Dag-visning for datoen, med adressen
   #/kalender/dag/ÅÅÅÅ-MM-DD, så tilbake-knappen går til forrige visning. */
let dayBack = null; // visningen før dag-klikket: { v, c }
const DAY_RE = /^#\/kalender\/dag\/(\d{4}-\d{2}-\d{2})\/?$/;
function openDay(k) {
  haptic(8);
  if (K.view === 'dag' && DAY_RE.test(location.hash)) { try { history.replaceState(history.state, '', `#/kalender/dag/${k}`); } catch { /* */ } setView('dag', k); return; }
  dayBack = { v: K.view, c: K.cur };
  try { history.pushState({ kalDay: k }, '', `#/kalender/dag/${k}`); } catch { /* */ }
  setView('dag', k, openDay.ev, 'in');
}
/** Leser adressen: #/kalender/dag/<dato> → Dag; tilbake til #/kalender etter et dag-klikk → forrige visning. */
function applyHash() {
  const m = location.hash.match(DAY_RE);
  if (m) { K.view = 'dag'; K.cur = m[1]; K.sel = null; return true; }
  if (dayBack && /^#\/kalender\/?$/.test(location.hash)) {
    const b = dayBack; dayBack = null;
    K.view = b.v; K.cur = b.c; K.sel = null; K.mini = false; K.miniOff = 0;
    savePref('kalView', VIEW_SRV[b.v]);
    return true;
  }
  return false;
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
  return { id: e.oid || e.id, t: e.t, k: k0, s: e.s || '09:00', e: e.e && e.e !== '23:59' ? e.e : '10:00', all: allD, endDate, cal: k39.calById(e.ac).own ? e.ac : 'privat', r: e.rRaw ?? e.r, rep: ['daily', 'weekly', 'monthly'].includes(e.rep) ? e.rep : 'none', rem: remOf(e), n: e.n, err: '', geo: e.geo ?? null, geoLabel: e.geo ? e.rRaw ?? e.r : '' };
}
function readForm(f) {
  const F = K.form, fd = new FormData(f);
  F.t = String(fd.get('title') ?? '').trim(); F.k = String(fd.get('date') ?? '');
  if (F.all) F.endDate = String(fd.get('endDate') ?? F.k); else { F.s = String(fd.get('start') ?? F.s); F.e = String(fd.get('end') ?? F.e); }
  F.r = String(fd.get('location') ?? '').trim(); F.n = String(fd.get('note') ?? '').trim();
  if (F.geo && F.r !== (F.geoLabel ?? '')) F.geo = null; // prompt 44: fri tekst uten koordinater
}
/** Svar med feilkode og JSON-kropp (api() i util.js gir bare meldingen). */
async function call(path, method, json) {
  const r = await fetch('/api' + path, { method, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (r.status === 401) { if (!k38.appMode() || !k38.toNative({ type: 'logout' })) location.href = '/login'; }
  return { ok: r.ok, status: r.status, d };
}
async function saveForm(f) {
  readForm(f);
  const F = K.form;
  if (!F.t) { F.err = 'Skriv en tittel.'; return paint(); }
  if (!F.k) { F.err = 'Velg dato.'; return paint(); }
  if (!F.all && (!F.s || !F.e || mm(F.e) <= mm(F.s))) { F.err = 'Slutt må være etter start.'; return paint(); }
  if (F.all && F.endDate && F.endDate < F.k) { F.err = 'Sluttdato må være samme dag eller senere.'; return paint(); }
  const body2 = { title: F.t, allDay: !!F.all, date: F.k, start: F.all ? '' : F.s, end: F.all ? '' : F.e, ...(F.all && F.endDate && F.endDate !== F.k ? { endDate: F.endDate } : {}), location: F.r, calendar: /^c-/.test(F.cal) || k39.calById(F.cal).own ? 'privat' : F.cal, appCalendar: F.cal === 'privat' ? 'personlig' : F.cal, repeat: F.rep, reminder: F.rem, note: F.n, ...(F.geo ? { geo: F.geo } : F.id ? { geo: null } : {}) };
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
    k38.noteChanged(F.id ? 'updated' : 'created');
    flash(F.id ? 'Hendelsen er oppdatert' : 'Hendelsen er lagret');
    // Prompt 33: ny tittel på en rask time → foreslå å huske avsenderen (lagres bare hvis brukeren trykker Husk).
    const sg = r.d?.suggestMemory;
    if (sg?.name) openLearn(null, { name: sg.name, type: sg.type === 'annet' ? '' : sg.type, title: sg.title, text: sg.text, suggest: true });
    await ensureKal(true);
  } catch (e) { if (K.form) K.form.err = e.message; } finally { K.busy = false; paint(); }
}
async function delEvent(e) {
  if (!K.delArm) { K.delArm = true; return paint(); }
  K.delArm = false;
  const r = await call(`/kalender/events/${encodeURIComponent(e.oid || e.id)}`, 'DELETE').catch((x) => ({ ok: false, d: { error: x.message } }));
  if (!r.ok) { K.err2 = r.d?.error || 'Kunne ikke slette hendelsen.'; return paint(); }
  K.sel = null; K.err2 = '';
  k38.noteChanged('deleted');
  flash('Hendelsen er slettet');
  ensureKal(true);
}
async function copyEvent(e) {
  const r = await call(`/kalender/events/${encodeURIComponent(e.oid || e.id)}/copy`, 'POST', { calendar: 'privat' }).catch(() => ({ ok: false, status: 0, d: {} }));
  if (r.ok) { K.sel = null; k38.noteChanged('created'); flash('Kopiert til Personlig'); ensureKal(true); return; }
  if (r.status === 409 || r.d?.reconnect) { K.err2 = r.d?.error || 'Google Kalender må kobles til på nytt for å kunne skrive.'; return paint(); }
  // Eldre server: åpne skjemaet ferdig utfylt.
  openForm({ t: e.t, k: e.k, s: e.s || '09:00', e: e.e && e.e !== '23:59' ? e.e : '10:00', all: !e.s, cal: 'privat', r: e.rRaw ?? e.r, n: e.n });
}

/* ---------------- Søk ---------------- */

let sTimer = 0, sCtl = null;
function runSearch(q) {
  const S = K.srch;
  if (!S) return;
  S.q = q; S.hi = -1;
  // Prompt 34: forrige AI-svar blir stående mens man skriver (byttes først ved Enter).
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
      const today = d0(new Date()), seen = new Set(S.res.map((x) => `${x.e.id}|${key(x.d)}`));
      for (const e of nz.byId.values()) {
        if (/\|\d+$/.test(e.id) || !srFilt(e)) continue;
        if (!K.data.byId.has(e.id)) K.data.byId.set(e.id, e);
        const d = fromKey(e.k), id = `${e.id}|${e.k}`, i = daysTo(e.k, today);
        if (!seen.has(id) && i >= -30 && i < 120 && S.res.length < 60) { seen.add(id); S.res.push({ e, d: d0(d), i }); }
      }
      S.res.sort((a, b) => a.i - b.i || (a.e.s || '').localeCompare(b.e.s || ''));
    } catch (e) { if (e.name === 'AbortError') return; /* serveren mangler søk: lokalt søk står */ }
    S.loading = false; paintRes();
  }, 160);
}

/* ---------------- Hendelser ---------------- */

function bind(h) {
  if (h.dataset.kBound) return;
  h.dataset.kBound = '1';
  k39.bind39(h); // prompt 39: sidemeny, kalendere, dobbeltklikk = ny hendelse
  h.addEventListener('click', (e) => { k39.migrationClick(e); });
  // Sveip bytter periode (mobil).
  let sw = null;
  h.addEventListener('touchstart', (e) => {
    if (k38.touchStart(e)) { sw = null; return; } // prompt 38: to fingre = zoom
    sw = e.target.closest('[data-k-swipe]') && e.touches.length === 1 && K.view !== 'liste' ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  h.addEventListener('touchmove', k38.touchMove, { passive: true });
  h.addEventListener('wheel', k38.onWheel, { passive: false });
  k38.bindSheetDrag(h, () => { if (!closeSheets()) k38.closeGlimt(); });
  h.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-k38-bar]') && !k38.G.sug) { k38.G.sug = true; k38.paintBar(h); } });
  h.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-k38-bar]')) setTimeout(() => { if (!h.contains(document.activeElement) || !document.activeElement?.closest?.('[data-k38-gbar]')) { k38.G.sug = false; k38.paintBar(host()); } }, 160); });
  h.addEventListener('touchend', (e) => {
    if (k38.touchEnd()) { sw = null; return; }
    if (!sw) return;
    const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y; sw = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
  });
  h.addEventListener('input', (e) => {
    if (k44.input44(e)) return; // prompt 44
    if (e.target.matches('[data-k38-bar]')) { k38.G.bar = e.target.value; k38.paintBar(h); return; }
    if (e.target.matches('[data-k38-gq]')) { k38.G.gq = e.target.value; return; }
    if (e.target.matches('[data-k-q]')) runSearch(e.target.value);
    if (e.target.matches('[data-k-ai]') && K.form) { K.form.ai = e.target.value; if (K.form.aiS && !K.form.aiS.busy) K.form.aiS = {}; const b = host()?.querySelector('[data-k-airun]'); if (b) { const on = !!e.target.value.trim(); b.classList.toggle('on', on); if (on) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); } }
    if (e.target.matches('[data-k-qtxt]') && K.qa) { K.qa.txt = e.target.value; K.qa.err = ''; clearTimeout(qaT); qaT = setTimeout(paintQa, 120); }
  });
  h.addEventListener('keydown', (e) => {
    // Prompt 38: Enter i Glimt-feltet legger til hendelsen eller spør Glimt; Esc tømmer og forlater feltet.
    if (e.target.matches?.('[data-k38-bar]') && !e.isComposing && e.keyCode !== 229) {
      if (e.key === 'Enter') { e.preventDefault(); k38.G.bar = e.target.value; k38.G.focusBar = true; k38.submitBar(e.shiftKey ? 'ask' : ''); return; }
      if (e.key === 'Escape' && k38.G.open) { e.preventDefault(); e.stopPropagation(); k38.closeGlimt(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); k38.G.bar = ''; k38.G.sug = false; e.target.value = ''; k38.paintBar(h); e.target.blur(); return; }
    }
    if (e.target.matches?.('[data-k38-gq]') && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); k38.closeGlimt(); return; }
    if (e.target.matches?.('[data-k-qtxt]') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitQa(); }
    if (e.target.matches?.('[data-k-ai]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); runFmAi(); }
    // Prompt 34: Enter i søkefeltet spør Glimt (eller åpner markert rad), Esc lukker. Ikke via <form onsubmit>.
    if (e.target.matches?.('[data-k-q]') && K.srch && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { closeSheets(); return; }
      K.srch.q = e.target.value;
      const hi = K.srch.hi ?? -1, row = hi >= 0 ? host()?.querySelectorAll('.k3-sr [data-k-sres] .k3-row')[hi] : null;
      if (row) row.click(); else askGlimt(e.target.value);
      return;
    }
    // Søket: ↑/↓ flytter markeringen, Enter åpner raden (eller spør Glimt når ingen rad er markert).
    if (e.target.matches?.('[data-k-q]') && K.srch && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const n = host()?.querySelectorAll('.k3-sr [data-k-sres] .k3-row').length ?? 0;
      if (!n) return;
      e.preventDefault();
      K.srch.hi = e.key === 'ArrowDown' ? Math.min(n - 1, (K.srch.hi ?? -1) + 1) : Math.max(-1, (K.srch.hi ?? -1) - 1);
      markHi();
    }
  });
  h.addEventListener('submit', (e) => {
    if (e.target.matches('[data-k44-mail]')) { k44.submit44(e, K.sel && findEv(K.sel)); return; } // prompt 44
    if (e.target.closest('[data-k38-gtform]')) { e.preventDefault(); const v = e.target.querySelector('input')?.value; k38.G.goto = false; if (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) { K.cur = v; gridKey = ''; if (K.view === 'liste') K.view = 'dag'; } paint(); return; }
    if (e.target.closest('[data-k38-gform]')) { e.preventDefault(); const v = e.target.querySelector('[data-k38-gq]')?.value ?? k38.G.gq; k38.G.focusGq = true; k38.send(v); return; }
    if (e.target.closest('[data-k-qform]')) { e.preventDefault(); submitQa(); return; }
    if (e.target.closest('[data-k-srform]')) {
      e.preventDefault();
      const hi = K.srch?.hi ?? -1, row = hi >= 0 ? host()?.querySelectorAll('.k3-sr [data-k-sres] .k3-row')[hi] : null;
      if (row) row.click(); else askGlimt();
      return;
    }
    const lf = e.target.closest('[data-k-lform]'); if (lf) { e.preventDefault(); saveLearn(lf); return; }
    const f = e.target.closest('[data-k-form]'); if (f) { e.preventDefault(); saveForm(f); }
  });
  h.addEventListener('click', (e) => {
    const tg = e.target;
    if (tg.closest?.('[data-k44-att]')) { k44.click44(e, K.sel && findEv(K.sel)); return; } // prompt 44: deltakere
    // Klikk på bakgrunnen lukker arkene (ikke klikk inne i arket).
    const bg = tg.closest('.k2-sheet-bg');
    if (bg && tg === bg) { closeSheets(); return; }
    if (tg.classList?.contains('k3-sr-bg')) { closeSheets(); return; }
    if (tg.closest('.k2-drw-bg,.k39-drw-bg')) { K.drawer = false; paint(); return; }
    if (tg.closest('[data-k38-gclose]')) { k38.closeGlimt(); return; }
    if (tg.closest('[data-k38-gtclose]') && (tg.matches('.k2-sheet-bg') || tg.closest('button'))) { k38.G.goto = false; paint(); return; }
    if (tg.closest('[data-k38-macset]')) { k38.toNative({ type: 'macSettings' }); return; }
    const b = tg.closest('button,[data-k-tap]');
    if (!b || !h.contains(b)) return;
    const d = b.dataset;
    // Prompt 38: Glimt-feltet, -panelet, År og zoom.
    if ('k38Gopen' in d) return k38.openGlimt();
    if ('k38Bsend' in d) { const v = host()?.querySelector('[data-k38-bar]')?.value ?? k38.G.bar; k38.G.bar = v; return k38.submitBar('ask'); }
    if ('k38Badd' in d) { const v = host()?.querySelector('[data-k38-bar]')?.value ?? k38.G.bar; k38.G.bar = v; return k38.submitBar(); }
    if (d.k38Sug) { k38.G.bar = ''; k38.G.sug = false; return k38.send(k38.SUG[+d.k38Sug]); }
    if (d.k38Slot) { const [k, a, z] = d.k38Slot.split('|'); k38.closeGlimt(); return openForm({ k, s: hmM(+a), e: hmM(+z) }); }
    if (d.kMo) return setView('mnd', d.kMo, e, 'in');
    if ('kTitl' in d) { const z = k38.TITLE_OUT[K.view]; if (z && z !== K.view) setView(z, undefined, e, 'out'); return; }
    if ('kLclose' in d) { K.learn = null; paint(); return; }
    if ('kClose' in d || 'kSclose' in d || 'kFclose' in d || 'kQclose' in d) { closeSheets(); return; }
    if ('kLearn' in d) { const ev = findEv(K.sel); if (ev) { K.sel = null; openLearn(ev); } return; }
    if (d.kLtype) { const f = host()?.querySelector('[data-k-lform]'); if (f && K.learn) { const fd = new FormData(f); K.learn.name = String(fd.get('name') ?? K.learn.name); K.learn.title = String(fd.get('title') ?? K.learn.title ?? ''); } if (K.learn) { K.learn.type = d.kLtype; K.learn.err = ''; paint(); } return; }
    if ('kLapply' in d) { runApply(); return; }
    if ('kQa' in d) return openQa();
    if ('kQpaste' in d) { navigator.clipboard?.readText?.().then((v) => { if (v && K.qa) { K.qa.txt = v; K.qa.focus = true; paint(); } }).catch(() => { if (K.qa) { K.qa.err = 'Fikk ikke lese utklippstavlen. Lim inn med ⌘V / Ctrl+V.'; K.qa.focus = true; paint(); } }); return; }
    if (d.kQchip) { if (K.qa) { K.qa.txt = `Time hos ${d.kQchip.toLowerCase()} `; K.qa.focus = true; K.qa.err = ''; paint(); } return; }
    if ('kQman' in d) { const v = (K.qa?.txt ?? '').trim(), p = v ? preview(v) : null; K.qa = null; return openForm(p ? { t: p.title || '', ...(p.date ? { k: p.date } : {}), ...(p.start ? { s: p.start, e: p.end } : {}), r: p.place || '', n: v.length > 60 ? v : '', rem: '1h' } : {}); }
    if ('kFull' in d) return setWebLayout(K.full ? 'menu' : 'full');
    if ('kClosecal' in d) return closeCal();
    if ('kDrawer' in d) { K.drawer = !K.drawer; return paint(); }
    if (d.kWk) { K.drawer = false; K.miniOff = 0; return setView('uke', d.kWk); }
    if ('kRetry' in d) { ensureKal(true); return; }
    // Prompt 35: farger, vis/skjul, skjul fra menyen, + iCal og + Home Assistant (kal-manage35.js).
    if ('kSet' in d) { import('./kal-manage35.js').then((m) => m.openCalManager({ onChange: () => ensureKal(true).then(paint) })).catch(() => openSettings('kal')); return; }
    if ('kReconnect' in d) { K.form = null; paint(); openSettings('kal'); return; }
    if (d.kView) return setView(d.kView, d.kView === 'liste' ? key(d0(new Date())) : undefined, e);
    if (d.kNav) return shift(+d.kNav);
    if ('kToday' in d) return goToday();
    if ('kNew' in d) return openForm();
    if ('kSearch' in d) return openSearch();
    if ('kAskbtn' in d) { const v = host()?.querySelector('[data-k-q]')?.value ?? K.srch?.q; if (K.srch) K.srch.focus = true; askGlimt(v); host()?.querySelector('[data-k-q]')?.focus(); return; }
    if ('kRetryAi' in d) { const q = K.srch?.ai?.q; if (q) askGlimt(q); return; }
    if ('kAictl' in d) { closeSheets(); openSettings('ai'); return; }
    if ('kSclr' in d) { if (K.srch) { K.srch.q = ''; K.srch.ai = null; K.srch.res = []; K.srch.hi = -1; K.srch.focus = true; } return paint(); }
    if (d.kSf) { if (K.srch) { K.srch.f = d.kSf; K.srch.focus = true; K.srch.res = (K.srch.q ?? '').trim().length >= 2 ? localSearch(K.srch.q.trim()) : []; if (K.srch.ai) { const q = K.srch.ai.q; K.srch.ai = null; paint(); askGlimt(q); return; } } return paint(); }
    if (d.kAsk) { if (K.srch) { K.srch.focus = true; askGlimt(SR_SUGG[+d.kAsk]); } return; }
    if (d.kMini) { K.miniOff += +d.kMini; return paint(); }
    // Minikalender: på web → Dag. Mobil (nedtrekk): Dag/3 dager/Uke beholdes og hopper til datoen; fra Måned/Liste → Dag.
    if (d.kGo) {
      K.mini = false; K.drawer = false; K.miniOff = 0;
      if (!isMobile() || K.view === 'mnd' || K.view === 'liste' || K.view === 'ar') { openDay.ev = e; const r = openDay(d.kGo); openDay.ev = null; return r; }
      haptic(8); K.cur = d.kGo; return paint();
    }
    if (d.kCal) { K.filt = { ...K.filt, [d.kCal]: !shownCal(d.kCal) }; savePref('kalFilters', K.filt); return paint(); }
    if (d.kDay) { openDay.ev = e; const r = openDay(d.kDay); openDay.ev = null; return r; }
    if (d.kSel) {
      K.sel = d.kSel; K.delArm = false; K.err2 = '';
      // Prompt 33: «sist viste hendelse» for Glimt («det var frisør»). Svaret trengs ikke.
      const ev = findEv(d.kSel); if (ev?.editable) fetch(`/api/kalender/events/${encodeURIComponent(ev.oid || ev.id)}`, { cache: 'no-store' }).catch(() => {});
      return paint();
    }
    if (d.kHit) { const e = findEv(d.kHit); K.srch = null; K.cur = d.kHitk; if (K.view === 'mnd' || K.view === 'liste') K.view = 'dag'; K.sel = e ? e.id : null; gridKey = ''; return paint(); }
    if (d.kRem) { const ev = findEv(K.sel); if (ev) { const id = ev.oid || ev.id; K.rem = { ...K.rem, [id]: d.kRem, [ev.id]: d.kRem }; savePref('kalReminders', { [id]: d.kRem }); } return paint(); }
    if ('kEdit' in d) { const ev = findEv(K.sel); if (ev) { K.sel = null; K.form = { ...formFromEvent(ev), focus: true }; paint(); } return; }
    if ('kDel' in d) { const ev = findEv(K.sel); if (ev) delEvent(ev); return; }
    if ('kCopy' in d) { const ev = findEv(K.sel); if (ev) copyEvent(ev); return; }
    if ('kAirun' in d) { runFmAi(); return; }
    if ('kFall' in d) { readFormSafe(); K.form.all = !K.form.all; return paint(); }
    if (d.kFcal) { readFormSafe(); K.form.cal = d.kFcal; return paint(); }
    if (d.kFrep) { readFormSafe(); K.form.rep = d.kFrep; return paint(); }
    if (d.kFrem) { readFormSafe(); K.form.rem = d.kFrem; return paint(); }
  });
}
function readFormSafe() { const f = host()?.querySelector('[data-k-form]'); if (f && K.form) readForm(f); }
function closeSheets() {
  // Prompt 38: arkene ligger over Glimt-panelet; Esc lukker arket først, så panelet.
  if (k38.G.goto) { k38.G.goto = false; paint(); return true; }
  if (!K.sel && !K.form && !K.srch && !K.mini && !K.qa && !K.drawer && !K.learn) return k38.closeGlimt();
  K.sel = null; K.form = null; K.srch = null; K.mini = false; K.qa = null; K.drawer = false; K.delArm = false; K.err2 = ''; K.learn = null;
  clearTimeout(sTimer); sCtl?.abort();
  paint();
  return true;
}

function bindKeys() {
  if (keyBound) return;
  keyBound = true;
  window.addEventListener('keydown', (e) => {
    if (!host() || e.defaultPrevented) return;
    // Cmd/Ctrl+K åpner søket (også fra et felt).
    if (k38.appMode() && e.metaKey) return; // Mac-appen sender ⌘-snarveiene selv (kalApp.cmd)
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k' && !(document.getElementById('settings') && !document.getElementById('settings').hidden)) { e.preventDefault(); closeSheets(); k38.openGlimt(); return; } // prompt 39: ⌘K Glimt (som Mac)
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById('settings') && !document.getElementById('settings').hidden) return;
    const tag = e.target?.tagName ?? '';
    if (e.key === 'Escape') {
      if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.value && e.target.closest('[data-sf]')) return;
      if (closeSheets()) { e.preventDefault(); return; }
      // Esc i fullskjerm = ✕ (lukker kalenderen og går til Dashboard). Ikke i Mac-appen.
      if (K.full && !isMobile() && !k38.appMode()) { e.preventDefault(); closeCal(); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable) return;
    if (K.form || K.srch || K.sel || K.qa || k38.G.open) return;
    const k = e.key.toLowerCase(), V = { d: 'dag', 3: '3d', w: 'uke', m: 'mnd', l: 'liste', y: 'ar', å: 'ar' };
    if (e.key === 'ArrowLeft') shift(-1);
    else if (e.key === 'ArrowRight') shift(1);
    else if (k === 't') goToday();
    else if (V[k]) setView(V[k]);
    else if (k === 'n') openForm();
    else if (e.key === '/') openSearch();
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
    const typing = document.activeElement?.matches?.('[data-k38-bar],[data-k38-gq]');
    if (h && !K.form && !K.srch && !K.qa && !k38.G.open && !typing) paint();
    refresh('d_kal', 'p_kal');
  }, 30_000);
}

/* Prompt 38: kontekst til kal38.js og window.kalApp for Mac-appen (⌘N, ⌘T, ⌘1–5, ⌘F, ⌘,). */
k38.initKal38({ K, evOn, col, short, key, add, d0, mm, hmM, fromKey, curD, calById, noUrl, longDate: dLong,
  paint: () => paint(), openDay, setView, openForm, askServer,
  ensureNow: async () => { const td = d0(new Date()); ensureRange(key(add(td, -31)), key(add(td, 121))); if (K.loading) await K.loading.catch(() => {}); } });
k44.initKal44({ K, paint: () => paint(), ensureKal, flash: (t) => flash(t), host: () => host() });
k44.scheduleMidnight(() => { if (host()) paint(); });
k39.initKal39({ K, evOn, key, add, d0, mm, fromKey, curD, findEv, narrow, savePref, paint: () => paint(), setView, openForm,
  openGlimt: () => k38.openGlimt(), resetScroll: () => { gridKey = ''; }, reload: () => ensureKal(true) });
const APP_VIEWS = { 1: 'dag', 2: 'uke', 3: 'mnd', 4: 'ar', 5: 'liste', aar: 'ar', 'år': 'ar', maaned: 'mnd', maned: 'mnd', '3dager': '3d', agenda: 'liste' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Mac-appen (KAL38): kalApp.cmd('new' | 'new:YYYY-MM-DD' | 'today' | 'search' | 'settings' | 'view:dag|3d|uke|mnd|ar|liste' | 'prev' | 'next'
 *  | 'date:YYYY-MM-DD' | 'event:<id>' | 'glimt' | 'glimt:<spørsmål>' | 'sidebar' | 'goto' | 'newcal' | 'weeks:1|0' | 'close' | 'refresh'). */
function appCmd(c) {
  if (!host()) { location.hash = '#/kalender'; setTimeout(() => appCmd(c), 150); return true; }
  const i = c.indexOf(':'), a = i < 0 ? c : c.slice(0, i), b = i < 0 ? '' : c.slice(i + 1);
  switch (a) {
    case 'new': closeSheets(); k38.closeGlimt(); openForm(ISO.test(b) ? { k: b } : {}); return true;
    case 'today': closeSheets(); goToday(); return true;
    case 'view': { const v = APP_VIEWS[b] ?? b; if (!(v in VIEW_SRV)) return false; closeSheets(); setView(v, v === 'liste' ? key(d0(new Date())) : undefined); return true; }
    case 'date': case 'goto': {
      if (ISO.test(b)) { closeSheets(); K.cur = b; K.sel = null; gridKey = ''; if (K.view === 'liste') K.view = 'dag'; paint(); return true; }
      closeSheets(); k38.G.goto = true; paint(); setTimeout(() => host()?.querySelector('[data-k38-gtform] input')?.focus(), 30); return true;
    }
    case 'event': {
      const e = findEv(b) ?? [...(K.data?.byId.values() ?? [])].find((x) => x.oid === b);
      if (!e) { ensureKal(true).then(() => { const x = findEv(b) ?? [...(K.data?.byId.values() ?? [])].find((y) => y.oid === b); if (x) { K.cur = x.k; K.sel = x.id; gridKey = ''; paint(); } }); return true; }
      closeSheets(); K.cur = e.k; K.sel = e.id; gridKey = ''; paint(); return true;
    }
    case 'search': if (!K.srch) openSearch(); else host()?.querySelector('[data-k-q]')?.focus(); return true;
    case 'settings': closeSheets(); openSettings('kal'); return true;
    case 'glimt': closeSheets(); k38.openGlimt(b || undefined); return true;
    case 'sidebar': K.noSide = !K.noSide; try { localStorage.setItem('kal_side38', K.noSide ? '0' : '1'); } catch { /* */ } paint(); return true;
    case 'weeks': K.noWeeks = b === '0' ? true : b === '1' ? false : !K.noWeeks; try { localStorage.setItem('kal_weeks38', K.noWeeks ? '0' : '1'); } catch { /* */ } paint(); return true;
    case 'newcal': closeSheets(); import('./kal-manage35.js').then((m) => m.openCalManager({ onChange: () => ensureKal(true).then(paint) })).catch(() => openSettings('kal')); return true;
    case 'prev': shift(-1); return true;
    case 'next': shift(1); return true;
    case 'refresh': ensureKal(true); return true;
    case 'close': return closeSheets() || true;
    default: return false;
  }
}
try { K.noSide = localStorage.getItem('kal_side38') === '0'; K.noWeeks = localStorage.getItem('kal_weeks38') === '0'; } catch { /* */ }
if (k38.appMode()) { k38.installApi(appCmd); k38.bindScheme(() => paint()); }

export function render() {
  loadFonts();
  bindKeys();
  k38.bindKeyboard();
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
    applyHash();
    loadPrefs().then(() => { if (DAY_RE.test(location.hash)) applyHash(); paint(); });
    ensureKal();
    startTick();
  });
  return `<div id="kal" class="kal k39${K.full && !isMobile() ? ' k39-fs' : ''}${K.noWeeks ? ' k38-nowk' : ''}${K.noSide ? ' k38-noside' : ''}">${body()}</div>`;
}
// Ut av Kalender: fullskjerm-låsen på siden fjernes.
window.addEventListener('hashchange', () => { if (!/^#\/kalender/.test(location.hash)) document.body.classList.remove('kal-fs'); });
// Rask time (kal-quick.js): Vis hopper til dagen, feil åpner skjemaet, ferdig henter kalenderen på nytt.
setQuickHooks({
  show: (k) => { K.cur = k; K.sel = null; gridKey = ''; if (K.view === 'liste') K.view = 'dag'; if (document.body.dataset.route !== 'kalender') location.hash = '#/kalender'; else paint(); },
  fail: failForm,
  changed: () => { K.at = 0; k38.noteChanged('quick'); ensureKal(true); },
});

on('kalender', () => { paint(); refresh('d_kal', 'p_kal'); });
// Ny iCal-adresse eller ny timeplan fra skolen: hent kalenderen på nytt.
on('school', () => { if (K.data && !K.loading) ensureKal(true); });
let narrowWas = null;
window.addEventListener('resize', () => {
  if (!host()) return;
  gridKey = '';
  fitHeight();
  k39.fitMonth(host());
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
