// Kalender (prompt 26, Kalender.dc.html variant «web», claude-code-kalender.md).
// Nå-kort, Prøver og frister, Kalendere-lenken, kalenderen (Uke · Måned · Agenda med filter og detaljkort) og
// forhåndsvisning av telefon-widgetene. Hold inne et kort (0,55 s) for rediger-modus: ▲ ▼ flytter og − skjuler.
// På web står kalenderen fast i høyre kolonne og Widgets går over hele bredden; på mobil ligger alt i én kolonne.
// Data fra GET /api/kalender (skolens iCal, Canvas, Bursdager og Google, per bruker). Svarer serveren 404 (eldre
// versjon), bygges kalenderen fra /api/school og Bursdager her i nettleseren.
// Valg (rekkefølge, skjulte kort, filter, visning, påminnelser og fagfarger) lagres per bruker i /api/me/layout
// (kalOrder, kalHidden, kalFilters, kalView, kalReminders, subjectColors) og i nettleseren som reserve.
import { api, esc, isMobile } from './util.js';
import { store, widget, refresh, emit, on } from './store.js';
import { openSettings } from './settings.js';
import { loadBirthdays } from './birthdays.js';

const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MS = MN.map((m) => m.slice(0, 3));
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const WS = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];
const LAB = '#b23a2a';
// type → [filter, farge]. Timer får fagfargen.
const KC = { time: ['Timeplan', null], prove: ['Prøver og frister', LAB], innl: ['Prøver og frister', LAB], bursdag: ['Bursdager', '#2b5d8a'], skole: ['Skole', '#a8661a'], fri: ['Skole', '#a8661a'] };
const TYPES = Object.keys(KC);
const CH = [['Timeplan', 'var(--k-ink)', 'timeplan'], ['Prøver og frister', LAB, 'prover'], ['Bursdager', '#2b5d8a', 'bursdager'], ['Skole', '#a8661a', 'skole']];
// Fast fagpalett (samme som serveren bruker) når serveren ikke sender farge.
const PALETTE = ['#2b5d8a', '#2e6f75', '#a8661a', '#7a3b6b', '#2f7a4f', '#6b5a3a', '#c0562a', '#3f7a6e', '#5b4b8a', '#8a5a2b'];
const SHORT = { 'Matematikk R2': 'Matte R2', 'Matematikk R1': 'Matte R1', 'Matematikk S2': 'Matte S2', 'Matematikk S1': 'Matte S1', Kroppsøving: 'Gym' };
// Kortene som kan flyttes og skjules. På web står «calendar» fast i høyre kolonne og «widgets» over hele bredden.
const CARDS = ['now', 'exams', 'cals', 'calendar', 'widgets'];
// På serveren (og i appene) heter kortene A–E som i designet.
const CID = { now: 'A', exams: 'B', cals: 'C', calendar: 'D', widgets: 'E' }, CNAME = Object.fromEntries(Object.entries(CID).map(([a, b]) => [b, a]));
const toNames = (v) => { const l = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).filter((k) => v[k]) : null; return l && l.map((x) => CNAME[x] ?? x).filter((x) => CARDS.includes(x)); };
const toIds = (l) => (l ? l.map((x) => CID[x] ?? x) : null);
const CN = { now: 'Nå-kort', exams: 'Prøver og frister', cals: 'Kalendere', calendar: 'Kalender', widgets: 'Widgets' };
const REMS = [['none', 'Ingen'], ['15m', '15 min før'], ['1h', '1 time før'], ['day', 'Dagen før']];
const VIEW_SRV = { uke: 'uke', mnd: 'maaned', agenda: 'agenda' }, VIEW_LOC = { uke: 'uke', maaned: 'mnd', mnd: 'mnd', agenda: 'agenda' };
const LKEY = 'hl_kal_v1';
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const K = { data: null, err: '', loading: null, at: 0, fallback: false, prefs: false,
  view: 'uke', off: 0, filt: {}, rem: {}, ord: null, hidC: [], subjC: {}, sel: null, day: null, ro: false, toast: '' };
let lp = null, swallow = false, tickT = null, toastT = null;
const host = () => document.getElementById('kal');

/* ---------------- Datoer ---------------- */

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mm = (s) => { const [a, b] = s.split(':'); return +a * 60 + +b; };
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const d0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const capf = (s) => s.replace(/^./, (c) => c.toUpperCase());
const isoW = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const parseD = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00') : new Date(v));
const dLong = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MN[d.getMonth()]}`;
const dur = (x) => (x >= 60 ? `${Math.floor(x / 60)} t ${x % 60} min` : `${x} min`);
const daysTo = (k, today) => Math.round((new Date(k + 'T12:00') - new Date(key(today) + 'T12:00')) / 864e5);
export const semester = (d = new Date()) => `Skole · ${d.getMonth() >= 6 ? 'høst' : 'vår'} ${d.getFullYear()}`;

/* ---------------- Innstillinger per bruker ---------------- */

function readLocal() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null') ?? {}; } catch { return {}; } }
function writeLocal() { try { localStorage.setItem(LKEY, JSON.stringify({ view: K.view, filt: K.filt, rem: K.rem, ord: K.ord, hidC: K.hidC, subjC: K.subjC })); } catch { /* privat modus */ } }
function applyPrefs(p) {
  if (p.view && VIEW_LOC[p.view]) K.view = VIEW_LOC[p.view];
  if (p.filt && typeof p.filt === 'object') K.filt = p.filt;
  if (p.rem && typeof p.rem === 'object') K.rem = p.rem;
  if (Array.isArray(p.ord)) K.ord = p.ord;
  if (Array.isArray(p.hidC)) K.hidC = p.hidC;
  if (p.subjC && typeof p.subjC === 'object') K.subjC = p.subjC;
}
async function loadPrefs() {
  if (K.prefs) return;
  K.prefs = true;
  applyPrefs(readLocal());
  try {
    const l = await api('/me/layout');
    applyPrefs({ view: l.kalView, filt: l.kalFilters, rem: l.kalReminders, ord: toNames(l.kalOrder), hidC: toNames(l.kalHidden), subjC: l.subjectColors });
    writeLocal();
  } catch { /* eldre server: bare nettleseren */ }
}
/** Lagrer ett felt i /api/me/layout. En eldre server (ukjent nøkkel) avviser det; da gjelder bare nettleseren. */
function savePref(field, value) {
  writeLocal();
  api('/me/layout', { method: 'PUT', json: { [field]: value } }).catch(() => {});
}
export const subjectColors = () => K.subjC;
export async function setSubjectColor(name, c) {
  await loadPrefs();
  if (c) K.subjC = { ...K.subjC, [name]: c }; else { const x = { ...K.subjC }; delete x[name]; K.subjC = x; }
  savePref('subjectColors', { [name]: c || null }); // serveren fletter per fag, null fjerner
  emit('kalender');
}

/* ---------------- Data ---------------- */

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const palette = (s) => (/studietid|fritime/i.test(s) ? '#7a7468' : PALETTE[hash(s) % PALETTE.length]);
function classify(t, x) {
  if (/prøve|heldag|muntlig|eksamen|tentamen/i.test(t)) return 'prove';
  if (/innlever|frist|deadline/i.test(t) || x.deadline) return 'innl';
  if (x.allDay && /\bfri\b|fridag|planleggingsdag|ferie/i.test(t)) return 'fri';
  if (x.allDay) return 'skole';
  return 'time';
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
    const kind = TYPES.includes(x.type) ? x.type : x.type === 'bd' ? 'bursdag' : 'time';
    const base = { id: String(x.id ?? `${x.start}|${x.title}`), kind, t: String(x.title ?? ''), short: x.short || '', subj: x.subject || (kind === 'time' ? String(x.title ?? '') : ''),
      r: x.room || x.location || '', teacher: x.teacher || '', n: x.note || '', c: x.color || '', src: x.source || '', url: x.url || '', map: x.mazemap || '' };
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
    for (const x of L.filter((e) => e.s && (e.kind === 'prove' || e.kind === 'skole'))) {
      const a = mm(x.s), b = mm(x.e);
      out = out.filter((l) => l.kind !== 'time' || mm(l.e) <= a || mm(l.s) >= b);
    }
    byDay.set(k, out.sort((a, b) => (a.s ? mm(a.s) : -1) - (b.s ? mm(b.s) : -1)));
  }
  const byId = new Map();
  for (const L of byDay.values()) for (const e of L) byId.set(e.id, e);
  const src = Array.isArray(r.sources) ? r.sources.filter((x) => x && typeof x === 'object') : [], school = src.filter((x) => x.id === 'ical' || x.id === 'canvas');
  return { byDay, byId, subjects, sources: src, configured: r.configured ?? (school.length ? school.some((x) => x.configured) : true), srvNow: r.now ?? null };
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

async function fetchKal() {
  const t = d0(new Date());
  try {
    K.data = normalize(await api(`/kalender?from=${key(add(t, -42))}&to=${key(add(t, 120))}`));
    K.fallback = false; K.err = '';
  } catch (e) {
    if (e.status === 404) { K.data = await fallbackData(); K.fallback = true; K.err = ''; }
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
  K.loading = fetchKal().finally(() => { K.loading = null; });
  return K.loading;
}

/* ---------------- Hjelpere for visningen ---------------- */

const filtOf = (e) => KC[e.kind][0];
const shown = (name) => K.filt[CH.find((c) => c[0] === name)?.[2]] !== false;
function evOn(d, all = false) {
  const L = K.data?.byDay.get(key(d)) ?? [];
  return all ? L : L.filter((e) => shown(filtOf(e)));
}
const subjColor = (e) => K.subjC[e.subj] || K.data?.subjects?.[e.subj] || e.c || palette(e.subj || e.t);
const col = (e) => (e.kind === 'time' ? subjColor(e) : KC[e.kind][1]);
const short = (e) => (e.kind === 'time' ? e.short || SHORT[e.subj] || e.subj || e.t : e.t);
const tmOf = (e) => (e.kind === 'innl' ? (e.e ? `Frist ${e.e}` : 'Frist') : e.s ? `${e.s}–${e.e}` : 'Hele dagen');
const sub2 = (...a) => a.filter(Boolean).join(' · ');
const isLesson = (e) => e.s && (e.kind === 'time' || e.kind === 'prove');
const reg = (e) => esc(e.id);
const findEv = (id) => K.data?.byId.get(id) ?? null;

function exams(today) {
  const tk = key(today), out = [];
  for (const [k, L] of K.data?.byDay ?? []) if (k >= tk) for (const e of L) if ((e.kind === 'prove' || e.kind === 'innl') && shown('Prøver og frister')) out.push(e);
  return out.sort((a, b) => a.k.localeCompare(b.k) || (a.s || a.e || '').localeCompare(b.s || b.e || ''));
}
const inTxt = (dd) => (dd === 0 ? 'I dag' : dd === 1 ? 'I morgen' : `${dd} dager`);

/** Nå-kortet: NÅ, NESTE TIME, NESTE SKOLEDAG eller FRI, pluss neste prøve. */
function nowModel(now, today) {
  const nm = now.getHours() * 60 + now.getMinutes(), tl = evOn(today).filter(isLesson);
  const cur = tl.find((e) => nm >= mm(e.s) && nm < mm(e.e)), nx = tl.find((e) => mm(e.s) > nm);
  let v;
  if (cur) v = { k: 'NÅ', when: `${cur.s}–${cur.e}`, t: cur.t, sub: `${sub2(cur.r, cur.teacher)}${cur.r || cur.teacher ? ' · ' : ''}${mm(cur.e) - nm} min igjen`, c: col(cur), bar: Math.round((nm - mm(cur.s)) / (mm(cur.e) - mm(cur.s)) * 100), e: cur, next: nx ? `Deretter: ${nx.t} ${nx.s}${nx.r ? ` · ${nx.r}` : ''}` : 'Siste time i dag' };
  else if (nx) v = { k: 'NESTE TIME', when: `om ${dur(mm(nx.s) - nm)}`, t: nx.t, sub: sub2(`${nx.s}–${nx.e}`, nx.r, nx.teacher), c: col(nx), bar: null, e: nx, next: '' };
  else {
    let d = add(today, 1), f = null;
    for (let i = 0; i < 21 && !f; i++) { f = evOn(d).find(isLesson); if (!f) d = add(d, 1); }
    v = f ? { k: 'NESTE SKOLEDAG', when: capf(dLong(d)), t: f.t, sub: `${sub2(`${f.s}–${f.e}`, f.r)} · første time`, c: col(f), bar: null, e: f, next: '' }
      : { k: 'FRI', when: '', t: 'Ingen timer', sub: K.data && !K.data.configured ? 'Legg inn skolens iCal under Innstillinger → Kalendere' : 'Ingen timer de neste tre ukene', c: '#7a7468', bar: null, e: null, next: '' };
  }
  const ne = exams(today)[0];
  if (ne) { const dd = daysTo(ne.k, today); v.next = `${v.next ? `${v.next} · ` : ''}${ne.t} ${dd === 0 ? 'i dag' : dd === 1 ? 'i morgen' : `om ${dd} dager`}`; }
  return v;
}

/** Felles innhold for widgetene (telefon-forhåndsvisningene og Hjem-widgeten KALENDER). */
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
    all: wl.slice(0, 6).map((e) => ({ tm: `${e.s}–${e.e}`, t: e.t, r: sub2(e.r, e.teacher), c: col(e), past: isT && mm(e.e) <= nm })),
    ex,
  };
}

/* ---------------- Kortene ---------------- */

function nowCard(now, today) {
  const v = nowModel(now, today);
  return `<button type="button" class="kal-now"${v.e ? ` data-k-sel="${reg(v.e)}"` : ''}>
    <span class="kal-now-k"><span>${esc(v.k)}</span><span>${esc(v.when)}</span></span>
    <span class="kal-now-m"><span class="kal-strip" style="background:${esc(v.c)}"></span><span class="kal-grow"><b>${esc(v.t)}</b><span>${esc(v.sub)}</span></span></span>
    ${v.bar != null ? `<span class="kal-bar"><span style="width:${v.bar}%"></span></span>` : ''}
    ${v.next ? `<span class="kal-now-n">${esc(v.next)}</span>` : ''}</button>`;
}

function examsCard(today) {
  const L = exams(today);
  const rows = L.map((x, i) => {
    const d = new Date(x.k + 'T12:00'), dd = daysTo(x.k, today);
    return `<button type="button" class="kal-ex${i ? ' bt' : ''}" data-k-exam="${reg(x)}"><span class="kal-ex-d"><b>${d.getDate()}</b><span>${MS[d.getMonth()].toUpperCase()}</span></span>
      <span class="kal-grow"><b class="kal-ell">${esc(x.t)}</b><span>${esc(sub2(capf(WD[d.getDay()]), x.kind === 'innl' ? `frist ${x.e || '23:59'}` : x.s ? `${x.s}–${x.e}` : 'hele dagen', x.r))}</span></span>
      <span class="kal-pill${dd <= 7 ? ' soon' : ''}">${inTxt(dd)}</span></button>`;
  }).join('');
  return `<span class="kal-gt"><span>PRØVER OG FRISTER</span><span class="mut">${L.length}</span></span>
    <div class="kal-card kal-list">${rows || '<div class="kal-none">Ingen kommende prøver eller frister.</div>'}</div>`;
}

function calsCard() {
  const src = K.data?.sources ?? [], of = (id) => src.find((x) => x.id === id), on = (id) => of(id)?.configured;
  const parts = src.length ? [on('ical') ? 'Skolens iCal' : 'Skolens iCal mangler', on('canvas') ? 'Canvas' : null, on('google') ? 'Google Kalender' : null, 'Bursdager'].filter(Boolean) : ['Skolens iCal', 'Google Kalender', 'Bursdager'];
  const bad = src.filter((x) => x.ok === false || x.error).map((x) => x.name || x.id);
  if (bad.length) parts.push(`feil: ${bad.join(', ')}`);
  return `<button type="button" class="kal-card kal-link" data-k-set><span class="kal-grow"><b>Kalendere</b><span>${esc(parts.join(' · '))}</span></span><span class="kal-link-r">Innstillinger ›</span></button>`;
}

function weekView(today, now, web) {
  const nm = now.getHours() * 60 + now.getMinutes(), tk = key(today), H = web ? 58 : 48, S0 = 8 * 60, S1 = 16 * 60, HH = (S1 - S0) / 60 * H;
  let b = today; const wd = b.getDay();
  if (K.off === 0 && (wd === 6 || wd === 0)) b = add(b, wd === 6 ? 2 : 1);
  const ws = add(add(b, -((b.getDay() + 6) % 7)), K.off * 7), fri = add(ws, 4);
  const nav = { t: `Uke ${isoW(ws)}`, s: `${ws.getDate()}.${ws.getMonth() !== fri.getMonth() ? ` ${MS[ws.getMonth()]}` : ''}–${fri.getDate()}. ${MN[fri.getMonth()]} ${fri.getFullYear()}`, today: K.off === 0 };
  const hours = []; for (let h = 8; h <= 16; h++) hours.push({ t: pad(h), top: (h * 60 - S0) / 60 * H });
  const days = [];
  let hasAll = false;
  for (let i = 0; i < 5; i++) {
    const d = add(ws, i), k = key(d), L = evOn(d), isT = k === tk;
    const out = (e) => e.s && e.kind !== 'innl' && (mm(e.e) <= S0 || mm(e.s) >= S1);
    const all = L.filter((e) => !e.s || e.kind === 'innl' || out(e));
    if (all.length) hasAll = true;
    days.push({ d, k, isT, all, ev: L.filter((e) => e.s && e.kind !== 'innl' && !out(e)), out });
  }
  const head = `<div class="kal-wk-row"><span></span>${days.map((x, i) => `<button type="button" class="kal-wk-h" data-k-wkday="${x.k}"><span>${WS[i]}</span><span class="kal-dn${x.isT ? ' on' : ''}">${x.d.getDate()}</span></button>`).join('')}</div>`;
  const allRow = hasAll ? `<div class="kal-wk-row"><span class="kal-wk-all">HELE</span>${days.map((x) => `<div class="kal-wk-allc">${x.all.map((e) => `<button type="button" class="kal-wk-ae" style="background:${esc(col(e))}" data-k-sel="${reg(e)}">${esc(e.kind === 'innl' ? `⚑ ${e.t}` : x.out(e) ? `${e.s} ${e.t}` : e.t)}</button>`).join('')}</div>`).join('')}</div>` : '';
  const lines = hours.map((h) => `<span class="kal-hl" style="top:${h.top}px"></span>`).join('');
  const cols = days.map((x) => `<div class="kal-wk-col${x.isT ? ' today' : ''}" style="height:${HH}px">${lines}${x.ev.map((e) => {
    const a = Math.max(S0, mm(e.s)), bb = Math.min(S1, mm(e.e)), pr = e.kind === 'prove', c = col(e), sl = K.sel === e.id;
    return `<button type="button" class="kal-blk${pr ? ' pr' : ''}${sl ? ' sel' : ''}" style="top:${(a - S0) / 60 * H}px;height:${Math.max(22, (bb - a) / 60 * H - 2)}px;--c:${esc(c)}" data-k-sel="${reg(e)}"><b>${esc(short(e))}</b><span>${esc(pr ? sub2(e.r, 'PRØVE') : e.r)}</span></button>`;
  }).join('')}${x.isT && nm >= S0 && nm <= S1 ? `<span class="kal-nowl" style="top:${(nm - S0) / 60 * H}px"></span>` : ''}</div>`).join('');
  return { nav, html: `<div class="kal-card kal-wk">${head}${allRow}<div class="kal-wk-row"><div class="kal-wk-hrs" style="height:${HH}px">${hours.map((h) => `<span style="top:${h.top}px">${h.t}</span>`).join('')}</div>${cols}</div></div>` };
}

const itemRow = (e, i) => `<button type="button" class="kal-it${i ? ' bt' : ''}" data-k-sel="${reg(e)}"><span class="kal-it-tm">${esc(tmOf(e))}</span><span class="kal-it-c" style="background:${esc(col(e))}"></span>
  <span class="kal-grow"><b class="kal-ell">${esc(e.t)}</b><span>${esc(sub2(e.r, e.kind === 'time' ? e.teacher : e.n))}</span></span>${e.kind === 'prove' || e.kind === 'innl' ? `<span class="kal-tag" style="background:${esc(col(e))}">${e.kind === 'prove' ? 'PRØVE' : 'FRIST'}</span>` : ''}</button>`;

function monthView(today, web) {
  const tk = key(today), m0 = new Date(today.getFullYear(), today.getMonth() + K.off, 1);
  const nav = { t: `${capf(MN[m0.getMonth()])} ${m0.getFullYear()}`, s: `Uke ${isoW(m0)}–${isoW(new Date(m0.getFullYear(), m0.getMonth() + 1, 0))}` };
  const st = add(m0, -((m0.getDay() + 6) % 7)), selK = K.day && K.day.slice(0, 7) === key(m0).slice(0, 7) ? K.day : K.off === 0 ? tk : key(m0);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = add(st, i), k = key(d), inM = d.getMonth() === m0.getMonth(), L = evOn(d), isT = k === tk, sl = k === selK, wkd = d.getDay() % 6 !== 0;
    const cs = [...new Set(L.filter((e) => e.kind !== 'time').map(col))].slice(0, 3);
    if (L.some((e) => e.kind === 'time') && cs.length < 3) cs.push('var(--k-line)');
    cells += `<button type="button" class="kal-mc${inM ? '' : ' out'}${sl ? ' sel' : ''}" data-k-day="${k}" style="height:${web ? 64 : 52}px"><span class="kal-dn${isT ? ' on' : ''}${wkd ? '' : ' we'}">${d.getDate()}</span><span class="kal-dots">${cs.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span></button>`;
  }
  const sd = new Date(selK + 'T12:00'), L = evOn(sd);
  nav.today = K.off === 0 && selK === tk;
  return { nav, html: `<div class="kal-card kal-mo"><div class="kal-mo-g">${WS.map((t) => `<span class="kal-mo-h">${t}</span>`).join('')}${cells}</div></div>
    <div class="kal-sec"><span class="kal-gt"><span>${selK === tk ? 'I DAG · ' : ''}${esc(dLong(sd).toUpperCase())}</span></span><div class="kal-card kal-list">${L.map(itemRow).join('') || '<div class="kal-none">Ingenting denne dagen.</div>'}</div></div>` };
}

function agendaView(today) {
  const a0 = add(today, K.off * 7), a1 = add(a0, 20), tk = key(today), tm = key(add(today, 1));
  const nav = { t: `${a0.getDate()}. ${MS[a0.getMonth()]} – ${a1.getDate()}. ${MS[a1.getMonth()]}`, s: 'Tre uker fremover', today: K.off === 0 };
  let html = '';
  for (let i = 0; i < 21; i++) {
    const d = add(a0, i), k = key(d), L = evOn(d);
    if (!L.length) continue;
    html += `<div class="kal-sec"><span class="kal-gt${k === tk ? '' : ' ink'}"><span>${k === tk ? 'I DAG · ' : k === tm ? 'I MORGEN · ' : ''}${esc(dLong(d).toUpperCase())}</span><span class="mut">${L.length}</span></span><div class="kal-card kal-list">${L.map(itemRow).join('')}</div></div>`;
  }
  return { nav, html: `<div class="kal-ag">${html || '<div class="kal-card kal-none">Ingenting de neste tre ukene.</div>'}</div>` };
}

const remOf = (e) => K.rem[e.id] ?? (e.kind === 'prove' || e.kind === 'innl' ? 'day' : 'none');
function detailCard() {
  const e = K.sel && findEv(K.sel);
  if (!e) return '';
  const sd = new Date(e.k + 'T12:00'), c = col(e), R = remOf(e);
  const kk = { time: 'TIME', prove: 'PRØVE', innl: 'INNLEVERING', bursdag: 'BURSDAG' }[e.kind] ?? 'SKOLE';
  const rows = [e.r && ['Rom', e.r], e.teacher && ['Lærer', e.teacher], e.kind !== 'time' && e.subj && ['Fag', e.subj], e.n && ['Merknad', e.n]].filter(Boolean);
  const map = e.map || (e.r && /^[A-Z]{1,2}-?\d|aula|hall|gym|bibl|rom|sal/i.test(e.r) && e.kind !== 'bursdag' ? 'https://use.mazemap.com/' : '');
  return `<div class="kal-det" style="--c:${esc(c)}">
    <div class="kal-det-h"><span class="kal-strip"></span><div class="kal-grow"><span class="kal-det-k">${kk}</span><b>${esc(e.t)}</b><span>${esc(`${capf(dLong(sd))} · ${tmOf(e)}`)}</span></div><button type="button" class="kal-x" data-k-close aria-label="Lukk">×</button></div>
    ${rows.map(([a, b]) => `<div class="kal-det-r"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}
    <span class="kal-lbl">Påminnelse</span><div class="kal-chips">${REMS.map(([v, n]) => `<button type="button" class="kal-chip${R === v ? ' on' : ''}" data-k-rem="${v}" aria-pressed="${R === v}">${n}</button>`).join('')}</div>
    <div class="kal-chips">${map ? `<a class="kal-btn" href="${esc(/^https:\/\//.test(map) ? map : 'https://use.mazemap.com/')}" target="_blank" rel="noopener">Finn rommet i MazeMap ↗</a>` : ''}${/^https:\/\//.test(e.url) ? `<a class="kal-btn" href="${esc(e.url)}" target="_blank" rel="noopener">Åpne ${e.src === 'canvas' ? 'i Canvas' : e.src === 'google' ? 'i Google Kalender' : 'kilden'} ↗</a>` : ''}</div>
  </div>`;
}

function calendarCard(today, now, web) {
  const V = K.view, v = V === 'mnd' ? monthView(today, web) : V === 'agenda' ? agendaView(today) : weekView(today, now, web);
  return `<div class="kal-views" role="tablist">${[['uke', 'Uke'], ['mnd', 'Måned'], ['agenda', 'Agenda']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${V === k}" class="${V === k ? 'on' : ''}" data-k-view="${k}">${n}</button>`).join('')}</div>
    <div class="kal-nav"><button type="button" class="kal-arr" data-k-nav="prev" aria-label="Forrige">‹</button><div class="kal-nav-t"><b>${esc(v.nav.t)}</b><span>${esc(v.nav.s)}</span></div><button type="button" class="kal-arr" data-k-nav="next" aria-label="Neste">›</button><button type="button" class="kal-today${v.nav.today ? '' : ' go'}" data-k-nav="today">I dag</button></div>
    <div class="kal-chips kal-filt">${CH.map(([n, c, k]) => `<button type="button" class="kal-fc${K.filt[k] === false ? ' off' : ''}" data-k-chip="${k}" aria-pressed="${K.filt[k] !== false}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
    ${detailCard()}
    <div class="kal-vw" data-k-swipe>${v.html}</div>
    <span class="kal-note">Timeplanen hentes fra skolens iCal-lenke og oppdateres hver time. Trykk på en time for rom, lærer og påminnelse.</span>`;
}

const PLATS = [
  ['iPhone · WidgetKit', 'ios', ['Liten', 'Medium', 'Stor']],
  ['Android · Material You', 'and', ['2 × 2', '4 × 2', '4 × 4']],
  ['Samsung One UI', 'sam', ['2 × 2', '4 × 2', '4 × 4']],
];
function widgetsCard(w) {
  const pill = (x) => `<span class="kal-wp${x.soon ? ' soon' : ''}">${esc(x.in)}</span>`;
  const small = `<div class="kal-w kal-w-s"><span class="kal-w-k">${esc(w.k)}</span><b class="kal-w-big">${esc(w.big)}</b><span class="kal-w-m"><span class="kal-w-st" style="background:${esc(w.c)}"></span><span class="kal-grow"><b>${esc(w.t)}</b><span>${esc(w.r)}</span></span></span><span class="kal-w-wh">${esc(w.when)}</span></div>`;
  const med = `<div class="kal-w kal-w-m2"><div class="kal-w-l"><span class="kal-w-k">${esc(w.k)}</span><b class="kal-w-big">${esc(w.big)}</b><b class="kal-w-t">${esc(w.t)}</b><span class="kal-w-r">${esc(w.r)}</span><span class="kal-w-wh">${esc(w.when)}</span></div>
    <div class="kal-w-rt"><span class="kal-w-day">${esc(w.dayT)}</span>${w.n3.map((e) => `<span class="kal-w-n"><b class="tn">${esc(e.s)}</b><span class="kal-w-st sm" style="background:${esc(e.c)}"></span><span class="kal-grow"><b>${esc(e.t)}</b><span>${esc(e.r)}</span></span></span>`).join('')}</div></div>`;
  const big = `<div class="kal-w kal-w-l2"><span class="kal-w-lh"><b>${esc(w.dayL)}</b><span>${esc(w.cnt)}</span></span>${w.all.map((e) => `<span class="kal-w-a${e.past ? ' past' : ''}"><span class="tn">${esc(e.tm)}</span><span class="kal-w-st" style="background:${esc(e.c)}"></span><span class="kal-grow"><b>${esc(e.t)}</b><span>${esc(e.r)}</span></span></span>`).join('')}
    <span class="kal-w-hr"></span><span class="kal-w-k">PRØVER OG FRISTER</span>${w.ex.map((x) => `<span class="kal-w-x"><b>${esc(x.t)}</b>${pill(x)}</span>`).join('') || '<span class="kal-w-r">Ingen kommende</span>'}</div>`;
  return `<span class="kal-gt"><span>WIDGETS PÅ TELEFONEN</span></span>
    ${PLATS.map(([n, cls, l]) => `<div class="kal-wplat ${cls}"><span class="kal-wplat-n">${n}</span><div class="kal-wrow">
      <div class="kal-wcol">${small}<span>${l[0]}</span></div><div class="kal-wcol">${med}<span>${l[1]}</span></div><div class="kal-wcol">${big}<span>${l[2]}</span></div></div></div>`).join('')}
    <span class="kal-note">Liten viser neste time, medium også de tre neste, og stor hele dagen og de neste prøvene. Trykk åpner Kalender.</span>`;
}

/* ---------------- Siden ---------------- */

const order = () => { const o = (K.ord ?? []).filter((x) => CARDS.includes(x)); return [...new Set([...o, ...CARDS])]; };
const hidden = () => new Set(K.hidC.filter((x) => CARDS.includes(x)));

function body() {
  if (K.err && !K.data) return `<div class="kal-card kal-none">Kunne ikke hente kalenderen: ${esc(K.err)}<br><button type="button" class="kal-btn" data-k-retry>Prøv igjen</button></div>`;
  if (!K.data) return '<div class="kal-card kal-none">Laster kalenderen …</div>';
  const now = new Date(), today = d0(now), web = !isMobile(), RO = K.ro, ORD = order(), HID = hidden();
  // Web: venstre kolonne (Nå, Prøver, Kalendere) kan flyttes; Kalender står fast til høyre og Widgets over hele bredden.
  const movable = web ? ORD.filter((x) => x !== 'calendar' && x !== 'widgets') : ORD;
  const leftN = Math.max(1, movable.filter((x) => !HID.has(x)).length);
  const inner = { now: () => nowCard(now, today), exams: () => examsCard(today), cals: () => calsCard(), calendar: () => calendarCard(today, now, web), widgets: () => widgetsCard(wgModel(now, today)) };
  const cards = ORD.map((x) => {
    if (HID.has(x)) return '';
    const mi = movable.indexOf(x), ctl = RO ? `<div class="kal-roc" data-roc>${mi >= 0 ? `<button type="button" data-roc data-k-mv="${x}:-1" aria-label="Flytt opp"${mi === 0 ? ' class="dim"' : ''}>▲</button><button type="button" data-roc data-k-mv="${x}:1" aria-label="Flytt ned"${mi === movable.length - 1 ? ' class="dim"' : ''}>▼</button>` : ''}<button type="button" data-roc class="hd" data-k-hide="${x}" aria-label="Skjul kortet">−</button></div>` : '';
    const style = web ? (x === 'calendar' ? `grid-row:1 / span ${leftN + 1}` : x === 'widgets' ? 'order:99' : `order:${mi}`) : `order:${ORD.indexOf(x)}`;
    return `<div class="kal-c kal-c-${x}${RO ? ' ro' : ''}" data-kc="${x}" style="${style}">${ctl}${inner[x]()}</div>`;
  }).join('');
  const hidL = ORD.filter((x) => HID.has(x));
  const pill = RO ? `<div class="kal-pill-ro"><span>Flytt med ▲ ▼ · skjul med −</span><button type="button" data-k-reset>Tilbakestill</button><button type="button" class="done" data-k-done>Ferdig</button></div>
    ${hidL.length ? `<div class="kal-hidl"><span>SKJULT</span>${hidL.map((x) => `<button type="button" data-k-unhide="${x}">+ ${CN[x]}</button>`).join('')}</div>` : ''}` : '';
  return `${K.toast ? `<div class="kal-toast" role="status">${esc(K.toast)}</div>` : ''}${pill}<div class="kal-lay ${web ? 'web' : 'mob'}"${web ? ` style="grid-template-rows:repeat(${leftN},auto) 1fr"` : ''}>${cards}</div>`;
}

function paint() {
  const h = host();
  if (!h) return;
  const y = scrollY;
  h.innerHTML = body();
  if (Math.abs(scrollY - y) > 2) scrollTo(0, y);
}
function flash(t) { K.toast = t; paint(); clearTimeout(toastT); toastT = setTimeout(() => { K.toast = ''; paint(); }, 2200); }

function move(x, dir) {
  const web = !isMobile(), o = order(), list = web ? o.filter((k) => k !== 'calendar' && k !== 'widgets') : o;
  const i = list.indexOf(x), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = o.indexOf(list[i]), b = o.indexOf(list[j]);
  [o[a], o[b]] = [o[b], o[a]];
  K.ord = o; savePref('kalOrder', toIds(o));
  try { navigator.vibrate?.(8); } catch { /* ingen vibrasjon */ }
  paint();
}

function nav(dir) {
  if (dir === 'today') { K.off = 0; K.day = null; K.sel = null; }
  else { K.off += dir === 'prev' ? -1 : 1; K.sel = null; }
  paint();
}

function bind(h) {
  if (h.dataset.kBound) return;
  h.dataset.kBound = '1';
  // Hold inne et kort i 0,55 s for rediger-modus. Trykket som slipper holdet åpner ikke noe.
  h.addEventListener('pointerdown', (e) => {
    if (K.ro || e.button > 0 || !e.target.closest('.kal-c') || e.target.closest('input,select,a,[data-roc]')) return;
    clearTimeout(lp?.t);
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { swallow = true; lp = null; try { navigator.vibrate?.(18); } catch { /* */ } K.ro = true; K.sel = null; paint(); }, 550) };
  });
  h.addEventListener('pointermove', (e) => { if (lp && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; } });
  const up = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  h.addEventListener('contextmenu', (e) => { if (e.target.closest('.kal-c') && (lp || K.ro)) e.preventDefault(); });
  h.addEventListener('click', (e) => {
    if (swallow) { swallow = false; if (!e.target.closest('[data-roc]')) { e.preventDefault(); e.stopPropagation(); return; } }
    if (K.ro && e.target.closest('.kal-c') && !e.target.closest('[data-roc]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Sveip bytter uke eller måned.
  let sw = null;
  h.addEventListener('touchstart', (e) => { const el = e.target.closest('[data-k-swipe]'); sw = el && e.touches.length === 1 && !K.ro && K.view !== 'agenda' ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  h.addEventListener('touchend', (e) => {
    if (!sw) return;
    const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y; sw = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) { swallow = false; nav(dx < 0 ? 'next' : 'prev'); }
  });
  h.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !h.contains(t)) return;
    const d = t.dataset;
    if (d.kMv) { const [x, dir] = d.kMv.split(':'); return move(x, +dir); }
    if (d.kHide) {
      const H = hidden();
      if (CARDS.filter((x) => !H.has(x)).length <= 1) return flash('Minst ett kort må være synlig');
      K.hidC = [...H, d.kHide]; savePref('kalHidden', toIds(K.hidC)); return paint();
    }
    if (d.kUnhide) { K.hidC = K.hidC.filter((x) => x !== d.kUnhide); savePref('kalHidden', toIds(K.hidC)); return paint(); }
    if ('kDone' in d) { K.ro = false; return paint(); }
    if ('kReset' in d) { K.ord = null; K.hidC = []; savePref('kalOrder', null); savePref('kalHidden', null); return paint(); }
    if ('kRetry' in d) { ensureKal(true); return; }
    if ('kSet' in d) return openSettings('kal');
    if ('kClose' in d) { K.sel = null; return paint(); }
    if (d.kView) { K.view = d.kView; K.off = 0; K.sel = null; savePref('kalView', VIEW_SRV[K.view]); return paint(); }
    if (d.kNav) return nav(d.kNav);
    if (d.kChip) { K.filt = { ...K.filt, [d.kChip]: K.filt[d.kChip] === false }; savePref('kalFilters', K.filt); return paint(); }
    if (d.kRem) { const ev = findEv(K.sel); if (ev) { K.rem = { ...K.rem, [ev.id]: d.kRem }; savePref('kalReminders', { [ev.id]: d.kRem }); } return paint(); }
    if (d.kExam) { K.sel = d.kExam; K.view = 'agenda'; K.off = 0; paint(); host()?.querySelector('.kal-det')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (d.kWkday) { const dd = new Date(d.kWkday + 'T12:00'), t0 = new Date(); K.view = 'mnd'; K.day = d.kWkday; K.off = (dd.getFullYear() - t0.getFullYear()) * 12 + dd.getMonth() - t0.getMonth(); K.sel = null; return paint(); }
    if (d.kDay) { K.day = d.kDay; K.sel = null; return paint(); }
    if (d.kSel) {
      const open = K.sel !== d.kSel; K.sel = open ? d.kSel : null; paint();
      if (open) host()?.querySelector('.kal-det')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function loadFonts() {
  if (document.querySelector('link[data-hl-fonts],link[data-kal-fonts]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; l.dataset.kalFonts = ''; document.head.appendChild(l);
}

function startTick() {
  if (tickT) return;
  // Nå-kortet, nå-linjen og widgetene oppdateres hvert minutt; data hentes på nytt hvert 10. minutt (serveren cacher en time).
  tickT = setInterval(() => {
    if (document.hidden) return;
    const h = host(), w = document.querySelector('[data-w="d_kal"],[data-w="p_kal"]');
    if (!h && !w) return;
    if (Date.now() - K.at > 10 * 60_000) ensureKal();
    if (h && !K.ro) paint();
    refresh('d_kal', 'p_kal');
  }, 30_000);
}

export function render() {
  loadFonts();
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
  return `<div class="kal-top"><div class="kal-kick">${esc(semester().toUpperCase())}</div><h1 class="kal-h1">Kalender</h1></div><div id="kal" class="kal">${body()}</div>`;
}

on('kalender', () => { paint(); refresh('d_kal', 'p_kal'); });
// Ny iCal-adresse eller ny timeplan fra skolen: hent kalenderen på nytt.
on('school', () => { if (K.data && !K.loading) ensureKal(true); });

/* ---------------- Hjem-widget KALENDER ---------------- */

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
