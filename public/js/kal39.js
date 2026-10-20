// Prompt 39 (WEB39): web-kalenderen er en kopi av Kalender.app for Mac (claude-code-kalender-web-lik-mac.md).
// Fasit: SwiftUI-koden i apps/ios/KalenderMac/Sources (MacRoot → verktøylinje + «NESTE»-banner, MacSidebar/MacCalendars35,
// MacGrid, MacViews) og vedlegg/mac-kalender-fasit*.png. Samme mål (pt = px), fonter, farger, radier og fagfarger som Mac.
// Bare fire kalendere (claude-code-kalendere-fire-google.md): Personlig · Bursdager · Skole · Helligdager + brukerens egne.
// Gamle Jobb/Familie/Helse/Privat-hendelser vises i Personlig, Timeplan/Prøver/Studie i Skole (til serveren har migrert).
// Data, ark (detaljer, ny/rediger, søk, ✦ Skriv time) og Glimt-panelet ligger fortsatt i kalender.js / kal38.js.
import { themeBtn } from './kal-theme40.js';
import { esc, isMobile } from './util.js';
import { AB_CAL, groupSubs, chipInner, listRow, bindLogos } from './kal42.js'; // prompt 42: Abonnementer

let C = null;
/** kalender.js: { K, evOn, key, add, d0, mm, fromKey, curD, paint, setView, openForm, openGlimt, findEv } */
export function initKal39(ctx) { C = ctx; }

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const WDS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const pad = (n) => String(n).padStart(2, '0');
const hmM = (x) => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat modus */ } } };

/* ---------------- Kalenderne (fire + egne) ---------------- */

// KalCore.swift CALS / KalFag37: [farge, tekst (lyst tema), tekst (mørkt tema)].
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) || 0);
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const TONES = { '#b23a2a': ['#8a2a1d', '#f29a8a'], '#2b5d8a': ['#1f4568', '#9cc2ee'], '#2f7a4f': ['#235c3b', '#8fd4a8'], '#a8661a': ['#7a4a12', '#ecbb74'],
  '#3d7f8a': ['#2a5c64', '#8fcdd6'], '#8a3fa0': ['#6a2f7c', '#d6a8e6'], '#c2477a': ['#8f2f58', '#f0a6c4'], '#5b4fc4': ['#40368f', '#b3abf2'], '#7a8a2a': ['#55611c', '#c9d685'] };
export const tone = (hex) => { const h = String(hex || '#b23a2a').toLowerCase(); const t = TONES[h]; return { c: h, tx: t?.[0] ?? mix(h, '#000000', 0.28), lt: t?.[1] ?? mix(h, '#ffffff', 0.45) }; };
/** De tolv kalenderfargene (KalTone35.swatches). */
export const SWATCHES = ['#b23a2a', '#e8794a', '#a8661a', '#c9a227', '#2f7a4f', '#3d7f8a', '#2b5d8a', '#5b4fc4', '#8a3fa0', '#c2477a', '#6b665c', '#1b1a17'];
/** Fagfargene (KalFag37.palette). Nye fag får neste ledige plass og beholder den. */
const FAGP = ['#2f7a4f', '#2b5d8a', '#a8661a', '#8a3fa0', '#3d7f8a', '#c2477a', '#5b4fc4', '#7a8a2a'];

export const CAL4 = [
  { id: 'personlig', key: 'p', name: 'Personlig', color: '#b23a2a', source: 'google', badge: 'GOOGLE', sourceLabel: 'Google' },
  { id: 'bursdager', key: 'b', name: 'Bursdager', color: '#8a3fa0', source: 'google', badge: 'GOOGLE', sourceLabel: 'Google Kontakter' },
  { id: 'skole', key: 's', name: 'Skole', color: '#2f7a4f', source: 'url', badge: 'URL', sourceLabel: 'iCal' },
  { id: 'helligdager', key: 'h', name: 'Helligdager', color: '#a39d90', source: 'builtin', badge: 'INNEBYGD', sourceLabel: 'Norge' },
  AB_CAL, // prompt 42: trekkdatoene fra Finans → Abonnementer (innebygd, kan skjules)
];
// Gamle kalender-id-er (prompt 27/33/35) → de fire. Serverens migrering (SERVER39) gjør det samme med selve hendelsene.
const ALIAS = { p: 'personlig', personlig: 'personlig', privat: 'personlig', jobb: 'personlig', j: 'personlig', familie: 'personlig', f: 'personlig', helse: 'personlig', trials: 'personlig', google: 'personlig', local: 'personlig',
  b: 'bursdager', bursdager: 'bursdager', birthdays: 'bursdager', bursdag: 'bursdager',
  s: 'skole', skole: 'skole', studie: 'skole', study: 'skole', timeplan: 'skole', prover: 'skole', canvas: 'skole', ical: 'skole',
  h: 'helligdager', helligdager: 'helligdager', holidays: 'helligdager',
  ab: 'abonnementer', abonnementer: 'abonnementer', subscriptions: 'abonnementer', abonnement: 'abonnementer', finans: 'abonnementer' };

const S = { cals: null, srv: false, prefs: {}, migration: null, editing: false, pick: '', showHidden: false };
export const st39 = S;

/** Leser GET /api/kalender/calendars (SERVER39: fire kalendere med key p/b/s/h). 404 eller gammel liste → de fire innebygde. */
export async function loadCals() {
  try {
    const r = await fetch('/api/kalender/calendars', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    S.prefs = j.prefs && typeof j.prefs === 'object' ? j.prefs : {};
    S.migration = j.migration ?? null;
    const list = Array.isArray(j.calendars) ? j.calendars.filter((c) => c && c.id) : [];
    const four = list.some((c) => c.key === 's' && /skole/i.test(c.name ?? c.id)) || list.some((c) => c.id === 'skole');
    const out = CAL4.map((d) => {
      const s = list.find((c) => c.id === d.id || (four && c.key === d.key && ALIAS[c.id] === d.id));
      return s ? { ...d, ...s, id: d.id, srvId: s.id } : { ...d };
    });
    // Egne kalendere (ikke de gamle innebygde Jobb/Familie/Helse eller iCal-duplikater av skolen).
    for (const c of list) {
      if (out.some((x) => x.srvId === c.id || x.id === c.id) || ALIAS[c.id]) continue;
      const own = c.source === 'own' || /^c-/.test(c.id);
      if (own || (four && c.source !== 'builtin')) out.push({ ...c, own: true });
    }
    S.cals = out; S.srv = true;
  } catch { S.cals = CAL4.map((c) => ({ ...c })); S.srv = false; }
  return S.cals;
}
export const cals = () => S.cals ?? CAL4;
/** Kalenderen en hendelse hører til (id blant de fire, eller en egen kalender). */
export function cal4(x) {
  const ids = [x.appCalendar, x.calendar, x.cal, x.source].map((v) => (v == null ? '' : String(v)));
  for (const v of ids) if (v && cals().some((c) => c.own && c.id === v)) return v;
  for (const v of ids) { const a = ALIAS[v.toLowerCase()]; if (a) return a; }
  if (x.kind === 'ab') return 'abonnementer';
  if (x.type === 'bursdag' || x.type === 'bd' || x.kind === 'bursdag') return 'bursdager';
  if (['time', 'prove', 'innl', 'skole', 'fri'].includes(x.type ?? x.kind)) return 'skole';
  return 'personlig';
}
export const calById = (id) => cals().find((c) => c.id === id) ?? CAL4[0];
export const shown = (id) => C.K.filt[id] !== false && calById(id).visible !== false;
const inMenu = (c) => !c.hidMenu;

/** PATCH /api/kalender/calendars/:id – tåler 404 (lagres da bare i nettleseren). */
export function patchCal(id, body) {
  const c = calById(id);
  Object.assign(c, body);
  fetch(`/api/kalender/calendars/${encodeURIComponent(c.srvId ?? id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  if (body.color) { const m = JSON.parse(ls.get('kal39_col') || '{}'); m[id] = body.color; ls.set('kal39_col', JSON.stringify(m)); }
}
/** Lokale fargevalg (når serveren ikke har kalender-API-et). */
export function localColors() {
  try { const m = JSON.parse(ls.get('kal39_col') || '{}'); for (const c of cals()) if (m[c.id] && !S.srv) c.color = m[c.id]; } catch { /* */ }
}

/* ---------------- Helligdager (innebygd Norge, bevegelige beregnet) ---------------- */

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da, 12);
}
export function holidays(y) {
  const E = easter(y), at = (n) => { const d = new Date(E); d.setDate(d.getDate() + n); return d; };
  const k = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return [[new Date(y, 0, 1, 12), 'Første nyttårsdag'], [at(-3), 'Skjærtorsdag'], [at(-2), 'Langfredag'], [E, 'Første påskedag'], [at(1), 'Andre påskedag'],
    [new Date(y, 4, 1, 12), 'Offentlig høytidsdag'], [new Date(y, 4, 17, 12), 'Grunnlovsdag'], [at(39), 'Kristi himmelfartsdag'], [at(49), 'Første pinsedag'], [at(50), 'Andre pinsedag'],
    [new Date(y, 11, 25, 12), 'Første juledag'], [new Date(y, 11, 26, 12), 'Andre juledag']].map(([d, t]) => ({ k: k(d), t }));
}

/* ---------------- Farger på hendelser (KalFag37.tint) ---------------- */

function fagKey(t) {
  const m = String(t ?? '').match(/\b([A-ZÆØÅ]{2,5}\s?\d{3,4})\b/);
  if (m) return m[1].replace(' ', '');
  const rest = String(t ?? '').trim().replace(/^(Frist:|Prøve ·|Prøve:|Eksamen|Forelesning|Øving|Lab|Seminar)\s*/, '');
  const w = (rest.split(/[ ·–-]/)[0] ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return w.length >= 2 ? w : '';
}
function fagIdx(k) {
  let m; try { m = JSON.parse(ls.get('kal39_fag') || '{}'); } catch { m = {}; }
  if (m[k] != null) return m[k];
  const used = new Set(Object.values(m).map((v) => v % FAGP.length));
  let n = Object.keys(m).length % FAGP.length;
  for (let i = 0; i < FAGP.length; i++) if (!used.has(i)) { n = i; break; }
  m[k] = n; ls.set('kal39_fag', JSON.stringify(m));
  return n;
}
/** {c, tx, lt} for en hendelse: fagfarge i Skole (timer, prøver, frister), ellers kalenderens farge. */
export function evTone(e) {
  const cal = calById(e.ac);
  if (e.ac === 'skole' && e.kind !== 'fri') {
    const k = e.sk || fagKey(e.t), own = C.K.subjC[k] || C.K.subjC[e.subj];
    if (own) return tone(own);
    if (e.sc) return { c: e.sc, tx: e.stx || tone(e.sc).tx, lt: e.slt || tone(e.sc).lt };
    if (k) return tone(FAGP[fagIdx(k) % FAGP.length]);
  }
  return tone(cal.color);
}
const tStyle = (e) => { const t = evTone(e); return `--c:${t.c};--tx:${t.tx};--lt:${t.lt}`; };

/* ---------------- Datoer ---------------- */

const weekSun = () => (S.prefs.weekStart === 'sun' || ls.get('kal39_ws') === 'sun');
const col = (d) => (weekSun() ? d.getDay() : (d.getDay() + 6) % 7);
export const weekStart = (d) => C.add(C.d0(d), -col(d));
const isoW = (d) => { const t0 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t0.getUTCDay() || 7; t0.setUTCDate(t0.getUTCDate() + 4 - dn); const y = new Date(Date.UTC(t0.getUTCFullYear(), 0, 1)); return Math.ceil(((t0 - y) / 864e5 + 1) / 7); };
const weekNo = (rowStart) => isoW(weekSun() ? C.add(rowStart, 1) : rowStart);
const letters = () => (weekSun() ? ['S', 'M', 'T', 'O', 'T', 'F', 'L'] : ['M', 'T', 'O', 'T', 'F', 'L', 'S']);
const shortNames = () => Array.from({ length: 7 }, (_, i) => WDS[weekSun() ? i : (i + 1) % 7]);
const isSunCol = (i) => (weekSun() ? i === 0 : i === 6);
const range = (a, b) => (a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MS[b.getMonth()]}` : `${a.getDate()}. ${MS[a.getMonth()]} – ${b.getDate()}. ${MS[b.getMonth()]}`);
const fd = (d) => `${WD[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
const dl = (d) => `${cap(WDS[d.getDay()])}. ${d.getDate()}. ${MS[d.getMonth()]}`;
const dur = (x) => { if (x < 60) return `${x} min`; const h = Math.floor(x / 60), m = x % 60; return m ? `${h} t ${m} min` : `${h} t`; };
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const timed = (e) => !!(e.s && e.e && e.kind !== 'innl');
const startM = (e) => C.mm(e.s), endM = (e) => Math.max(C.mm(e.e), C.mm(e.s) + 1);

/* ---------------- Vær per dag (GET /api/kalender/weather) ---------------- */

const W = { days: null, at: 0 };
const WX_KIND = { clear: 'sol', sun: 'sol', partly: 'delvis', cloudy: 'sky', fog: 'sky', drizzle: 'regn', rain: 'regn', sleet: 'sno', snow: 'sno', thunder: 'torden' };
function loadWx() {
  if (Date.now() - W.at < 30 * 60_000) return;
  W.at = Date.now();
  fetch('/api/kalender/weather', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!Array.isArray(j?.days)) return;
    W.days = Object.fromEntries(j.days.filter((d) => d?.date).map((d) => [d.date, { kind: WX_KIND[d.icon] ?? 'sky', hi: Math.round(d.hi ?? d.max ?? 0), lo: Math.round(d.lo ?? d.min ?? 0), text: d.text ?? '' }]));
    C.paint();
  }).catch(() => {});
}
const wx = (k) => W.days?.[k] ?? null;
const WX_TEXT = { sol: 'Sol', delvis: 'Delvis skyet', sky: 'Skyet', regn: 'Regn', sno: 'Snø', torden: 'Torden' };
const CLOUD = 'M7.2 18.5h10.1a3.9 3.9 0 0 0 .6-7.76A5.6 5.6 0 0 0 7.1 9.6a4.45 4.45 0 0 0 .1 8.9z';
const CLOUD_HI = 'M7.2 15h10.1a3.6 3.6 0 0 0 .6-7.16A5.3 5.3 0 0 0 7.3 6.8 4.1 4.1 0 0 0 7.2 15z';
function wxIcon(kind, size = 13) {
  const p = {
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
    delvis: '<path d="M9.2 7.2A3.6 3.6 0 0 1 15.5 8M8.6 3v1.4M3.7 8.1h1.4M5 4.4l1 1"/><path d="M8 20h9.4a3.4 3.4 0 0 0 .5-6.77 4.9 4.9 0 0 0-9.3-.9A3.85 3.85 0 0 0 8 20z"/>',
    regn: `<path d="${CLOUD_HI}"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>`,
    sno: `<path d="${CLOUD_HI}"/><path d="M8.5 19.5h.01M12 18.5h.01M15.5 19.5h.01M10.2 21.5h.01M13.8 21.5h.01" stroke-width="2.6"/>`,
    torden: `<path d="${CLOUD_HI}"/><path d="M12.5 16l-2 3.4h3l-2 3.1"/>`,
  }[kind] ?? `<path d="${CLOUD}"/>`;
  return `<svg class="k39-wxi k39-wx-${kind}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* ---------------- Ikoner (SF Symbols-lignende) ---------------- */

const svg = (d, w = 13, sw = 2.2, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const IC = {
  side: svg('<rect x="2.6" y="4.4" width="18.8" height="15.2" rx="3.2"/><path d="M9.4 4.4v15.2M5.4 8.2h1.6M5.4 11h1.6M5.4 13.8h1.6"/>', 19, 1.6),
  left: svg('<path d="M15 4.5L7.5 12l7.5 7.5"/>', 13, 2.6),
  right: svg('<path d="M9 4.5l7.5 7.5L9 19.5"/>', 13, 2.6),
  search: svg('<circle cx="10.5" cy="10.5" r="6.6"/><path d="M15.4 15.4l5 5"/>', 15, 2.3),
  cal: svg('<rect x="3" y="4.6" width="18" height="16" rx="3.4"/><path d="M3 9.4h18M7.8 2.8v3.4M16.2 2.8v3.4"/>', 21, 1.6),
};
/** Glimt-stjernen med regnbuering (MacSpark). */
export const spark = (n = 16) => `<span class="k39-spark" style="--n:${n}px" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><defs><linearGradient id="k39sg${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb38a"/><stop offset="1" stop-color="#ff5a3c"/></linearGradient></defs><path d="M12 1.5C12.6 6.4 16.6 10.4 21.5 11v2C16.6 13.6 12.6 17.6 12 22.5 11.4 17.6 7.4 13.6 2.5 13v-2C7.4 10.4 11.4 6.4 12 1.5z" fill="url(#k39sg${n})"/></svg></span>`;

/* ---------------- Tittel ---------------- */

export function titles() {
  const A = C.curD(), V = C.K.view;
  if (V === 'ar') return { t: String(A.getFullYear()), s: '' };
  if (V === 'mnd' || V === 'liste') return { t: cap(MONTHS[A.getMonth()]), s: String(A.getFullYear()) };
  const wk = `UKE ${weekNo(weekStart(A))} · ${A.getFullYear()}`;
  if (V === 'uke') { const m = weekStart(A); return { t: range(m, C.add(m, 6)), s: wk }; }
  if (V === '3d') return { t: range(A, C.add(A, 2)), s: wk };
  return { t: cap(fd(A)), s: wk };
}

/* ---------------- Verktøylinja (MacToolbar) ---------------- */

const VIEWS = [['dag', 'Dag', 'D'], ['3d', '3 dager', '3'], ['uke', 'Uke', 'W'], ['mnd', 'Måned', 'M'], ['ar', 'År', 'Y'], ['liste', 'Liste', 'L']];
export function toolbar(app) {
  const K = C.K, V = K.view, tt = titles(), today = new Date(), isToday = isTodayVisible();
  const close = app ? '' : '<button type="button" class="k39-ib k39-close" data-k-closecal aria-label="Lukk kalenderen" title="Lukk (Esc)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  return `<div class="k39-tb">
    ${close}<button type="button" class="k39-ib" data-k39-side aria-label="Vis/skjul sidemeny" title="Vis/skjul sidemeny">${IC.side}</button>
    <button type="button" class="k39-title" data-k-titl title="Zoom ut"><span class="k39-tt" data-no-i18n>${esc(tt.t)}</span>${tt.s ? `<span class="k39-ts">${esc(tt.s)}</span>` : ''}</button>
    <span class="k39-sp"></span>
    <span class="k39-navs"><button type="button" class="k39-ib bd" data-k-nav="-1" aria-label="Forrige" title="Forrige (←)">${IC.left}</button><button type="button" class="k39-ib bd" data-k-nav="1" aria-label="Neste" title="Neste (→)">${IC.right}</button></span>
    <div class="k39-tabs" role="tablist">${VIEWS.map(([k, n, h]) => `<button type="button" role="tab" aria-selected="${V === k}" class="${V === k ? 'on' : ''}" data-k-view="${k}" title="${n} (${h})">${n}</button>`).join('')}</div>
    ${app ? '' : themeBtn()}<button type="button" class="k39-ib" data-k-search aria-label="Søk" title="Søk (/)">${IC.search}</button>
    <button type="button" class="k39-today" data-k-today aria-label="I dag" title="I dag (T)">${IC.cal}<span>${today.getDate()}</span>${isToday ? '' : '<i></i>'}</button>
    <button type="button" class="k39-quick" data-k-qa title="Skriv en hendelse med vanlige ord – Glimt fyller ut"><span class="k39-lg">✦ Skriv time</span><span class="k39-sm">✦</span></button>
    <button type="button" class="k39-new" data-k-new title="Ny hendelse (N)"><span class="k39-lg">+ Ny hendelse</span><span class="k39-sm">+</span></button>
  </div>`;
}
function isTodayVisible() {
  const V = C.K.view, A = C.curD(), t = C.d0(new Date()), tk = C.key(t);
  if (V === 'ar') return A.getFullYear() === t.getFullYear();
  if (V === 'mnd' || V === 'liste') return A.getFullYear() === t.getFullYear() && A.getMonth() === t.getMonth();
  const s = V === 'uke' ? weekStart(A) : A, n = V === 'dag' ? 1 : V === '3d' ? 3 : 7;
  for (let i = 0; i < n; i++) if (C.key(C.add(s, i)) === tk) return true;
  return false;
}

/* ---------------- «NESTE» / «NÅ» (MacNextBanner) ---------------- */

export function nextTimed() {
  const t0 = C.d0(new Date()), nm = nowMin();
  for (let i = 0; i < 60; i++) {
    const d = C.add(t0, i), L = C.evOn(d).filter(timed).sort((a, b) => startM(a) - startM(b));
    for (const e of L) if (i * 1440 + endM(e) > nm) return { e, i, d };
  }
  return null;
}
export function nextBanner() {
  const n = nextTimed();
  if (!n) return '';
  const { e, i, d } = n, nm = nowMin(), a = i * 1440 + startM(e), b = i * 1440 + endM(e), now = a <= nm && b > nm;
  const dayText = i === 0 ? 'i dag' : i === 1 ? 'i morgen' : fd(d);
  let big = cap(WDS[d.getDay()]), small = e.s;
  if (now) { big = dur(b - nm); small = 'igjen'; } else if (a - nm < 1440) { big = dur(a - nm); small = 'til start'; }
  const pct = now ? Math.max(0, Math.min(100, (nm - a) / Math.max(1, b - a) * 100)) : 0;
  return `<div class="k39-nx-w"><button type="button" class="k39-nx" data-k-sel="${esc(e.id)}" data-k39-cur="${esc(e.k)}" style="${tStyle(e)}">
    <span class="k39-nx-bar"></span>
    <span class="k39-nx-m"><span class="k39-nx-k"><span>${now ? 'NÅ' : 'NESTE'}</span><span>${esc(`${e.s}–${e.e} · ${dayText}`)}</span></span>
      <span class="k39-nx-t"><b data-no-i18n>${esc(e.t)}</b>${e.r ? `<span data-no-i18n>${esc(e.r)}</span>` : ''}</span></span>
    <span class="k39-nx-r"><b>${esc(big)}</b><span>${esc(small)}</span></span>
    ${now ? `<span class="k39-nx-p" style="width:${pct.toFixed(1)}%"></span>` : ''}</button></div>`;
}

/* ---------------- Sidemenyen (MacSidebar) ---------------- */

/** Minimåned (MacMiniMonth). compact = År-visningen (uten overskrift). */
function miniMonth(month, { compact = false, sel = '', pick = 'data-k39-go' } = {}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12), start = weekStart(first), lead = col(first);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), n = Math.ceil((lead + dim) / 7), tk = C.key(C.d0(new Date()));
  const showWk = !C.K.noWeeks;
  let rows = '';
  for (let w = 0; w < n; w++) {
    const ws = C.add(start, w * 7);
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = C.add(ws, i), k = C.key(d), inM = d.getMonth() === first.getMonth(), today = k === tk, s = k === sel && !today, has = inM && C.evOn(d).length > 0;
      const cls = today ? ' today' : !inM ? ' out' : d.getDay() === 0 ? ' sun' : '';
      cells += `<button type="button" class="k39-md${cls}${s ? ' sel' : ''}" ${pick}="${k}" aria-label="${esc(`${d.getDate()}. ${MONTHS[d.getMonth()]}`)}"><b>${d.getDate()}</b><i${has ? ' class="on"' : ''}></i></button>`;
    }
    rows += `<div class="k39-mr">${showWk ? `<button type="button" class="k39-mwk" data-k-wk="${C.key(ws)}" title="Uke ${weekNo(ws)}">${weekNo(ws)}</button>` : ''}${cells}</div>`;
  }
  const head = `<div class="k39-mr k39-mh">${showWk ? '<span class="k39-mwk">U</span>' : ''}${letters().map((l, i) => `<span${isSunCol(i) ? ' class="sun"' : ''}>${l}</span>`).join('')}</div>`;
  const top = compact ? '' : `<div class="k39-mt"><b>${cap(MONTHS[first.getMonth()])} ${first.getFullYear()}</b><span class="k39-sp"></span><button type="button" class="k39-ib" data-k-mini="-1" aria-label="Forrige måned">${IC.left}</button><button type="button" class="k39-ib" data-k-mini="1" aria-label="Neste måned">${IC.right}</button></div>`;
  return `<div class="k39-mini${compact ? ' compact' : ''}">${top}<div class="k39-mg">${head}${rows}</div></div>`;
}

/** Antall hendelser de neste 30 dagene per kalender (når serveren ikke sender count). */
function counts() {
  const t0 = C.d0(new Date()), m = {};
  for (let i = 0; i < 30; i++) for (const e of C.evOn(C.add(t0, i), true)) m[e.ac] = (m[e.ac] ?? 0) + 1;
  return m;
}
const BADGE = { GOOGLE: 'Google', URL: 'URL', google: 'Google', url: 'URL', ical: 'URL', Abonnement: 'URL', HA: 'HA', ha: 'HA' };
function calRows() {
  const cnt = counts(), list = cals().filter((c) => S.editing || S.showHidden || inMenu(c));
  const rows = list.map((c) => {
    const on = shown(c.id), n = c.count ?? cnt[c.id] ?? 0, badge = BADGE[c.badge] ?? BADGE[c.source] ?? '', t = tone(c.color);
    const pick = S.pick === c.id ? `<div class="k39-sw" role="dialog" aria-label="Velg farge">${SWATCHES.map((h) => `<button type="button" class="${h === t.c ? 'on' : ''}" style="--c:${h}" data-k39-col="${c.id}|${h}" aria-label="${h}"></button>`).join('')}</div>` : '';
    return `<div class="k39-cr${inMenu(c) ? '' : ' hid'}" style="--c:${t.c}">
      <button type="button" class="k39-dot" data-k39-pick="${esc(c.id)}" aria-label="Velg farge for ${esc(c.name)}" title="Velg farge"><i></i></button>
      <button type="button" class="k39-cb${on ? ' on' : ''}" data-k39-cal="${esc(c.id)}" role="checkbox" aria-checked="${on}"><span class="k39-chk">${on ? '✓' : ''}</span><span class="k39-cn" data-no-i18n>${esc(c.name)}</span>${badge ? `<span class="k39-bdg">${esc(badge)}</span>` : ''}<span class="k39-sp"></span>${!S.editing && n > 0 ? `<span class="k39-cnt">${n}</span>` : ''}</button>
      ${S.editing ? `<button type="button" class="k39-hb" data-k39-hid="${esc(c.id)}" title="${inMenu(c) ? 'Skjul fra menyen' : 'Vis i menyen'}">${inMenu(c) ? 'Skjul' : 'Vis'}</button>${c.own ? `<button type="button" class="k39-rm" data-k39-rm="${esc(c.id)}" title="Fjern kalenderen">×</button>` : ''}` : ''}${pick}</div>`;
  }).join('');
  const nh = cals().filter((c) => !inMenu(c)).length;
  return `<div class="k39-cals"><div class="k39-ch"><span class="k39-lab">KALENDERE</span><button type="button" class="k39-ed" data-k39-edit>${S.editing ? 'Ferdig' : 'Rediger'}</button></div>${rows}
    ${nh && !S.editing ? `<button type="button" class="k39-sh" data-k39-showhid>${S.showHidden ? 'Skjul skjulte' : `Vis skjulte (${nh})`}</button>` : ''}
    <button type="button" class="k39-add" data-k-set>+ Legg til kalender</button></div>`;
}
/** «Glimt · dagen din» (MacDayCard + MacStore.daySummary). */
export function daySummary() {
  const t0 = C.d0(new Date()), tk = C.key(t0), nm = nowMin();
  const left = C.evOn(t0).filter(timed).filter((e) => endM(e) > nm).sort((a, b) => startM(a) - startM(b));
  let t = 'Resten av dagen er fri.';
  if (left.length) t = `Du har ${left.length} igjen i dag. Neste er ${left[0].t} kl. ${left[0].s}.`;
  const w = wx(tk);
  if (w) t += ` ${WX_TEXT[w.kind] ?? 'Skyet'}, ${w.lo}–${w.hi}°.`;
  for (let i = 0; i < 200; i++) {
    const d = C.add(t0, i), f = C.evOn(d).find((e) => e.kind === 'innl');
    if (f) { t += ` Frist: ${String(f.t).replace(/^(Frist:|Innlevering:?)\s*/i, '')} ${dl(d).toLowerCase()}.`; break; }
  }
  return t;
}
export const dayCard = () => `<button type="button" class="k39-dc" data-k39-glimt><span class="k39-dc-h">${spark(16)}<span class="k39-lab acc">GLIMT · DAGEN DIN</span></span><span class="k39-dc-t" data-no-i18n>${esc(daySummary())}</span></button>`;

export function sidebar(narrow) {
  const K = C.K, cur = C.curD(), m = new Date(cur.getFullYear(), cur.getMonth() + K.miniOff, 1, 12);
  const cls = narrow ? ` drawer${K.drawer ? ' open' : ''}` : '';
  return `${narrow && K.drawer ? '<div class="k39-drw-bg" data-k-drawer></div>' : ''}<aside class="k39-side${cls}" aria-label="Minikalender og kalendere"><div class="k39-side-in">
    ${miniMonth(m, { sel: C.key(cur) })}
    ${calRows()}
    ${dayCard()}
    <p class="k39-keys">Hurtigtaster: ← → bla · T i dag · D dag · 3 tre dager · W uke · M måned · Y år · L liste · N ny · / søk · ⌘K Glimt</p>
  </div></aside>`;
}

/* ---------------- Dag / 3 dager / Uke (MacGridView) ---------------- */

/** lay() / MacLayout.lanes: klynger av overlappende hendelser, hver får spor 0…n-1. */
function lanes(list) {
  const T = list.filter(timed).map((e) => ({ e, a: startM(e), b: endM(e) })).sort((x, y) => x.a - y.a || y.b - x.b);
  const out = []; let grp = [], end = -1;
  const flush = () => { const ends = []; for (const x of grp) { let i = ends.findIndex((z) => z <= x.a); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = x.b; x.l = i; } for (const x of grp) { x.n = Math.max(1, ends.length); out.push(x); } grp = []; };
  for (const x of T) { if (grp.length && x.a >= end) { flush(); end = -1; } grp.push(x); end = Math.max(end, x.b); }
  if (grp.length) flush();
  return out;
}
export const hourH = (V = C.K.view) => (isMobile() ? (V === 'uke' ? 44 : 52) : V === 'uke' ? 48 : V === '3d' ? 56 : 64);
const chip = (e) => (e.kind === 'ab' || e.kind === 'abg'
  ? `<button type="button" class="k39-chip all k42-chip"${e.kind === 'ab' ? ` data-k-sel="${esc(e.id)}"` : ''} style="${tStyle(e.kind === 'abg' ? e.items[0] : e)}" title="${esc(e.kind === 'abg' ? e.items.map((x) => x.t).join('\n') : e.t)}">${chipInner(e)}</button>`
  : timed(e)
  ? `<button type="button" class="k39-chip" data-k-sel="${esc(e.id)}" style="${tStyle(e)}" title="${esc(e.t)}"><i></i><span class="k39-chip-t">${esc(e.s)}</span><span class="k39-chip-n" data-no-i18n>${esc(e.t)}</span></button>`
  : `<button type="button" class="k39-chip all" data-k-sel="${esc(e.id)}" style="${tStyle(e)}" title="${esc(e.t)}"><span class="k39-chip-n" data-no-i18n>${esc((e.kind === 'innl' ? 'Frist ' : '') + e.t)}</span></button>`);

function gridView() {
  const K = C.K, V = K.view, n = V === 'dag' ? 1 : V === '3d' ? 3 : 7, A = C.curD(), s0 = V === 'uke' ? weekStart(A) : A, H = hourH(V);
  const tk = C.key(C.d0(new Date())), nm = nowMin();
  const days = Array.from({ length: n }, (_, i) => { const d = C.add(s0, i), k = C.key(d), L = C.evOn(d); return { d, k, L, all: L.filter((e) => !timed(e)), today: k === tk }; });
  const hasAll = days.some((x) => x.all.length);
  const head = `<div class="k39-gh"><span class="k39-gwk">U${weekNo(weekStart(s0))}</span>${days.map((x) => {
    const w = wx(x.k), cls = x.today ? ' today' : x.d.getDay() === 0 ? ' sun' : '';
    return `<button type="button" class="k39-ghc${cls}" data-k39-zin="${x.k}" title="${esc(cap(fd(x.d)))}"><span class="k39-ghw">${WDS[x.d.getDay()].toUpperCase()}</span><b>${x.d.getDate()}</b>${w ? `<span class="k39-ghx">${wxIcon(w.kind, 13)}<span>${w.hi}°</span></span>` : ''}</button>`;
  }).join('')}</div>`;
  const all = hasAll ? `<div class="k39-ga"><span class="k39-gal">HELE<br>DAGEN</span>${days.map((x) => `<div class="k39-gac">${groupSubs(x.all).map(chip).join('')}</div>`).join('')}</div>` : '';
  let hours = '';
  for (let h = 0; h < 24; h++) hours += `<span style="height:${H}px">${h ? `${pad(h)}:00` : ''}</span>`;
  const cols = days.map((x) => `<div class="k39-gc${x.today ? ' today' : ''}" data-k-tap="${x.k}">${lanes(x.L).map((p) => {
    const e = p.e, h = Math.max(18, (p.b - p.a) / 60 * H - 2);
    return `<button type="button" class="k39-ev${C.K.sel === e.id ? ' sel' : ''}" data-k-sel="${esc(e.id)}" title="${esc(`${e.t} · ${e.s}–${e.e}`)}" style="${tStyle(e)};top:${(p.a / 60 * H).toFixed(1)}px;height:${h.toFixed(1)}px;left:calc(2px + (100% - 4px) * ${p.l} / ${p.n});width:calc((100% - 4px) / ${p.n} - 2px)">
      <b class="${h > 34 ? 'l2' : ''}" data-no-i18n>${esc(e.t)}</b>${h > 30 ? `<span class="k39-evt">${esc(`${e.s}–${e.e}`)}</span>` : ''}${h > 52 && e.r ? `<span class="k39-evl" data-no-i18n>${esc(e.r)}</span>` : ''}</button>`;
  }).join('')}${x.today ? `<span class="k39-now" style="top:${(nm / 60 * H - 4.5).toFixed(1)}px"></span>` : ''}</div>`).join('');
  return { st: s0, end: C.add(s0, n - 1), html: `<div class="k39-grid k39-n${n}" style="--hh:${H}px">${head}${all}<div class="k39-gs" data-k-scroll><div class="k39-gb"><div class="k39-hrs">${hours}</div>${cols}</div></div></div>` };
}
/** Tidslinja starter ved nå −2 t (i dag i perioden) eller 07:00 (MacStore.timelineHour). */
export function startScroll(h) {
  const sc = h.querySelector('[data-k-scroll]');
  if (!sc) return;
  const tl = S.prefs.timelineStart, todayIn = !!h.querySelector('.k39-gc.today');
  const hr = tl === '06' ? 6 : tl === '08' ? 8 : todayIn ? Math.max(0, Math.floor(nowMin() / 60) - 2) : 7;
  sc.scrollTop = 8 + hr * hourH(); // ScrollViewReader.scrollTo("h<hr>", anchor: .top) – 8 px toppmarg i rutenettet
}

/* ---------------- Måned (MacMonthView) ---------------- */

function monthView() {
  const A = C.curD(), first = new Date(A.getFullYear(), A.getMonth(), 1, 12), start = weekStart(first), tk = C.key(C.d0(new Date())), showWk = !C.K.noWeeks;
  const head = `<div class="k39-moh">${showWk ? '<span class="k39-mowk">U</span>' : ''}${shortNames().map((n, i) => `<span${isSunCol(i) ? ' class="sun"' : ''}>${n.toUpperCase()}</span>`).join('')}</div>`;
  let rows = '';
  for (let r = 0; r < 6; r++) {
    const ws = C.add(start, r * 7);
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = C.add(ws, i), k = C.key(d), L = C.evOn(d), today = k === tk, inM = d.getMonth() === first.getMonth(), w = wx(k);
      const cls = today ? ' today' : !inM ? ' out' : d.getDay() === 0 ? ' sun' : '';
      cells += `<div class="k39-moc${cls}" data-k39-mday="${k}" role="button" tabindex="-1" aria-label="${esc(cap(fd(d)))}"><div class="k39-mot"><b>${d.getDate()}</b><span class="k39-sp"></span>${w ? `${wxIcon(w.kind, 12)}<span class="k39-mow">${w.hi}°</span>` : ''}</div><div class="k39-mol">${groupSubs(L).map(chip).join('')}</div></div>`;
    }
    rows += `<div class="k39-mor">${showWk ? `<button type="button" class="k39-mowkn" data-k-wk="${C.key(ws)}" title="Uke ${weekNo(ws)}">${weekNo(ws)}</button>` : ''}${cells}</div>`;
  }
  return { st: first, end: new Date(first.getFullYear(), first.getMonth() + 1, 0, 12), html: `<div class="k39-mo">${head}<div class="k39-mog">${rows}</div></div>` };
}
/** Så mange hendelser som får plass i hver rute (MacMonthCellMath.chips), resten som «+N». */
export function fitMonth(h) {
  for (const c of h.querySelectorAll('.k39-moc')) {
    const list = c.querySelector('.k39-mol'), chips = [...list.querySelectorAll('.k39-chip')];
    list.querySelector('.k39-more')?.remove();
    chips.forEach((x) => { x.hidden = false; });
    if (chips.length <= Math.max(1, Math.floor((c.clientHeight - 30) / 19))) continue;
    const max = Math.max(1, Math.min(40, Math.floor((c.clientHeight - 45) / 19))); // plass til «+N» under
    chips.slice(max).forEach((x) => { x.hidden = true; });
    const m = document.createElement('span'); m.className = 'k39-more'; m.textContent = `+${chips.length - max}`; list.appendChild(m);
  }
}

/* ---------------- År (MacYearView) ---------------- */

function yearView() {
  const Y = C.curD().getFullYear(), t = new Date();
  const cards = MONTHS.map((n, i) => {
    const first = new Date(Y, i, 1, 12), isThis = Y === t.getFullYear() && i === t.getMonth();
    return `<div class="k39-ym"><button type="button" class="k39-ymt${isThis ? ' on' : ''}" data-k-mo="${Y}-${pad(i + 1)}-01">${cap(n)}</button>${miniMonth(first, { compact: true, pick: 'data-k-day' })}</div>`;
  }).join('');
  return { st: new Date(Y, 0, 1, 12), end: new Date(Y, 11, 31, 12), html: `<div class="k39-yr" data-k-list><div class="k39-yrg">${cards}</div></div>` };
}

/* ---------------- Liste (MacListView, neste 6 uker) ---------------- */

function listView() {
  const tk = C.key(C.d0(new Date())), A = C.key(C.curD()), s = A < tk ? A : tk, s0 = C.fromKey(s), tomorrow = C.key(C.add(C.d0(new Date()), 1));
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = C.add(s0, i), k = C.key(d), L = C.evOn(d);
    if (col(d) === 0 && k !== tk) html += `<div class="k39-lw">UKE ${weekNo(d)}</div>`;
    if (!L.length && k !== tk) continue;
    const name = k === tk ? 'I dag' : k === tomorrow ? 'I morgen' : cap(WD[d.getDay()]), w = wx(k);
    html += `<div class="k39-ld"><div class="k39-ldh"><b${k === tk ? ' class="acc"' : ''}>${name}</b><span>${d.getDate()}. ${MONTHS[d.getMonth()]}</span>${w ? `<span class="k39-ldw">${wxIcon(w.kind, 12)}${w.lo}–${w.hi}°</span>` : ''}</div>
      <div class="k39-ldl">${L.length ? L.map((e) => {
        if (e.kind === 'ab') return listRow(e, tStyle(e));
        const c = calById(e.ac), sub = e.r ? `${e.r} · ${c.name}` : c.name;
        const tag = e.kind === 'innl' ? 'FRIST' : e.ac === 'bursdager' ? 'BURSDAG' : e.ac === 'helligdager' ? 'FRIDAG' : '';
        return `<button type="button" class="k39-lr" data-k-sel="${esc(e.id)}" style="${tStyle(e)}"><span class="k39-lrt">${timed(e) ? esc(`${e.s}–${e.e}`) : e.kind === 'innl' && e.e ? `Frist ${esc(e.e)}` : 'Hele dagen'}</span><i></i><span class="k39-lrm"><b data-no-i18n>${esc(e.t)}</b><span data-no-i18n>${esc(sub)}</span></span>${tag ? `<span class="k39-tag${tag === 'FRIST' ? ' red' : ''}">${tag}</span>` : ''}</button>`;
      }).join('') : '<span class="k39-none">Ingen hendelser</span>'}</div></div>`;
  }
  return { st: s0, end: C.add(s0, 41), html: `<div class="k39-li" data-k-list><div class="k39-lin">${dayCard()}${html}</div></div>` };
}

export function view() {
  loadWx();
  bindLogos();
  const V = C.K.view;
  return V === 'ar' ? yearView() : V === 'mnd' ? monthView() : V === 'liste' ? listView() : gridView();
}

/* ---------------- Klikk som bare finnes i Mac-oppsettet ---------------- */

export function bind39(h) {
  h.addEventListener('click', (e) => {
    const tg = e.target, K = C.K;
    const b = tg.closest('[data-k39-side],[data-k39-cal],[data-k39-pick],[data-k39-col],[data-k39-edit],[data-k39-hid],[data-k39-rm],[data-k39-showhid],[data-k39-glimt],[data-k39-zin],[data-k39-go],[data-k39-cur]');
    if (!b) {
      // Måned: klikk på en dag zoomer inn til Uke (MacMonthCell.onTapGesture).
      const day = tg.closest('[data-k39-mday]');
      if (day && !tg.closest('[data-k-sel]')) { if (e.detail > 1) return; C.setView('uke', day.dataset.k39Mday, e, 'in'); return; }
      if (S.pick && !tg.closest('.k39-sw')) { S.pick = ''; C.paint(); }
      return;
    }
    const d = b.dataset;
    if ('k39Side' in d) { if (C.narrow() || isMobile()) { K.drawer = !K.drawer; } else { K.noSide = !K.noSide; ls.set('kal_side38', K.noSide ? '0' : '1'); } C.paint(); return; }
    if (d.k39Cal) { K.filt = { ...K.filt, [d.k39Cal]: !shown(d.k39Cal) }; C.savePref('kalFilters', K.filt); patchCal(d.k39Cal, { visible: K.filt[d.k39Cal] }); C.paint(); return; }
    if (d.k39Pick) { S.pick = S.pick === d.k39Pick ? '' : d.k39Pick; C.paint(); return; }
    if (d.k39Col) { const [id, hex] = d.k39Col.split('|'); patchCal(id, { color: hex }); S.pick = ''; C.paint(); return; }
    if ('k39Edit' in d) { S.editing = !S.editing; S.pick = ''; C.paint(); return; }
    if (d.k39Hid) { const c = calById(d.k39Hid); patchCal(c.id, { hidMenu: !c.hidMenu }); C.paint(); return; }
    if (d.k39Rm) { const c = calById(d.k39Rm); if (!confirm(`Fjerne «${c.name}»? Hendelsene flyttes til Personlig.`)) return; fetch(`/api/kalender/calendars/${encodeURIComponent(c.srvId ?? c.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}); S.cals = cals().filter((x) => x.id !== c.id); C.paint(); return; }
    if ('k39Showhid' in d) { S.showHidden = !S.showHidden; C.paint(); return; }
    if ('k39Glimt' in d) { K.drawer = false; C.openGlimt(); return; }
    if (d.k39Zin) { if (K.view === 'uke') C.setView('3d', d.k39Zin, e, 'in'); else if (K.view === '3d') C.setView('dag', d.k39Zin, e, 'in'); return; }
    if (d.k39Go) { K.cur = d.k39Go; K.sel = null; K.drawer = false; K.miniOff = 0; C.resetScroll(); C.paint(); return; }
    if (d.k39Cur) { K.cur = d.k39Cur; C.resetScroll(); }
  }, true);
  // Dobbeltklikk i en tom time (eller en dag i Måned) = ny hendelse der (MacGridColumn / MacMonthCell).
  h.addEventListener('dblclick', (e) => {
    const c = e.target.closest('[data-k-tap]');
    if (c && e.target === c) {
      const r = c.getBoundingClientRect(), m = Math.max(0, Math.min(23 * 60, Math.floor((e.clientY - r.top) / hourH() * 2) * 30));
      C.openForm({ k: c.dataset.kTap, s: hmM(m), e: hmM(Math.min(m + 60, 23 * 60 + 59)) });
      return;
    }
    const day = e.target.closest('[data-k39-mday]');
    if (day && !e.target.closest('[data-k-sel]')) C.openForm({ k: day.dataset.k39Mday });
  });
}

/* ---------------- «Vi ryddet kalenderne: 12 → 4. Angre» ---------------- */

export function migrationNote() {
  const m = S.migration;
  if (!m?.done || !m.undoUntil || Date.now() > Date.parse(m.undoUntil) || ls.get('kal39_mig') === String(m.undoUntil)) return '';
  return `<div class="k39-toast" role="status"><span>Vi ryddet kalenderne: ${m.from ?? 12} → ${m.to ?? 4}.</span><button type="button" data-k39-undo>Angre</button><button type="button" class="x" data-k39-migok aria-label="Lukk">✕</button></div>`;
}
export async function migrationClick(e) {
  const b = e.target.closest('[data-k39-undo],[data-k39-migok]');
  if (!b) return false;
  ls.set('kal39_mig', String(S.migration?.undoUntil ?? ''));
  if ('k39Undo' in b.dataset) {
    await fetch('/api/kalender/calendars/migration/undo', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    S.migration = null; await loadCals(); C.reload();
  }
  C.paint();
  return true;
}
