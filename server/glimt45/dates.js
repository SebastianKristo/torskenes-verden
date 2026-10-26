// Prompt 45 (GLIMT45): deterministisk norsk dato-, tid-, periode- og beløpstolker for Glimt-motoren.
// Modellen tolker språket; denne koden validerer og normaliserer feltene. Ingen DOM, ingen nett, ren funksjon av (tekst, i dag).
//
//   parseDate45(text, today, {prefer:'future'|'past'|'nearest'}) → {date:'YYYY-MM-DD', raw, kind, span} | {error, message, raw} | null
//   parseTime45(text, {evening}) → {start:'HH:MM', end?:'HH:MM', raw, span, assumedPm?} | {error, message, raw} | null
//   parsePeriod45(text, today, {prefer}) → {from, to (inklusiv), label, raw} | null
//   parseAmount45(text) → {amount?, min?, max?, raw} | null
//   whenOf45(text, today, opts) → {date, start, end, period, dateRaw, timeRaw, softTime, errors[], rest}
//
// Datoer regnes som kalenderdatoer (UTC-midnatt internt), «i dag» kommer fra Europe/Oslo.
// Konvensjoner (samme som appen ellers, public/js/quick-time.js): dd.mm uten år = neste gang datoen kommer (prefer future);
// ukedag = neste forekomst (samme ukedag som i dag = om en uke); «neste uke» = mandag–søndag uka etter denne.
// For søk (prefer past): dd.mm uten år = siste gang datoen var, «i oktober» = siste oktober som har begynt.

const pad = (n) => String(n).padStart(2, '0');
export const WD45 = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const MON45 = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MON_KEY = { jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, des: 11 };
const WD_ALIAS = { man: 1, mandag: 1, tir: 2, tirsdag: 2, ons: 3, onsdag: 3, tor: 4, torsdag: 4, fre: 5, fredag: 5, lør: 6, lørdag: 6, søn: 0, søndag: 0 };
const NUMW = { null: 0, en: 1, én: 1, ett: 1, ein: 1, eitt: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
  tretten: 13, fjorten: 14, femten: 15, seksten: 16, sytten: 17, atten: 18, nitten: 19, tjue: 20, tjueen: 21, tjueto: 22, tjuetre: 23 };
const NUMW_RE = Object.keys(NUMW).sort((a, b) => b.length - a.length).join('|');

export function todayOslo45(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function nowMinOslo45(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}
const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays45 = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
export const weekdayOf45 = (s) => D(s).getUTCDay();
const mk = (y, m, d) => { const x = new Date(Date.UTC(y, m, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m && x.getUTCDate() === d ? iso(x) : null; };
export const isIsoDate45 = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && mk(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) === s;
export const isHm45 = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const mondayOf45 = (s) => addDays45(s, -((weekdayOf45(s) + 6) % 7));
const lastOfMonth = (y, m) => iso(new Date(Date.UTC(y, m + 1, 0)));
const low = (t) => String(t ?? '').toLowerCase();
/** «fredag 30. oktober» (med år når det ikke er i år). */
export function longDate45(date, today = todayOslo45()) {
  if (!isIsoDate45(date)) return '';
  const x = D(date);
  return `${WD45[x.getUTCDay()]} ${x.getUTCDate()}. ${MON45[x.getUTCMonth()]}${date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ''}`;
}
/** «i dag», «i morgen», «i går», ellers longDate45. */
export function relDate45(date, today = todayOslo45()) {
  if (date === today) return 'i dag';
  if (date === addDays45(today, 1)) return 'i morgen';
  if (date === addDays45(today, -1)) return 'i går';
  return longDate45(date, today);
}
const err = (raw, message, kind = 'invalid') => ({ error: kind, message, raw });
/** Prompt 47: «etter jul» → 2. januar etter neste jul (mandag hvis 2. januar er lørdag/søndag). */
export function afterChristmas45(today = todayOslo45()) {
  const y = +today.slice(0, 4);
  // Fra 25.12 til og med 2.1 gjelder julen som er nå; ellers neste jul.
  const nyY = today >= `${y}-12-25` ? y + 1 : today <= `${y}-01-02` ? y : y + 1;
  let d = `${nyY}-01-02`;
  const wd = weekdayOf45(d);
  if (wd === 6) d = addDays45(d, 2); else if (wd === 0) d = addDays45(d, 1);
  return d;
}

/* ---------------- Dato ---------------- */

/**
 * Første dato i teksten. prefer: 'future' (opprette: dd.mm uten år → neste gang), 'past' (søk), 'nearest'.
 * → {date, raw, kind:'abs'|'rel'|'weekday'|'week', span:[i,j]} | {error:'invalid', message, raw} | null
 */
export function parseDate45(text, today = todayOslo45(), { prefer = 'future' } = {}) {
  const t = low(text);
  const y0 = +today.slice(0, 4);
  const pickYear = (m, d, raw, span) => {
    const cands = [y0 - 1, y0, y0 + 1].map((y) => mk(y, m, d)).filter(Boolean);
    if (!cands.length) return err(raw, `${d}. ${MON45[m] ?? '?'} finnes ikke`);
    const thisY = mk(y0, m, d);
    let date;
    if (prefer === 'past') date = thisY && thisY <= today ? thisY : mk(y0 - 1, m, d);
    else if (prefer === 'nearest') date = cands.sort((a, b) => Math.abs(D(a) - D(today)) - Math.abs(D(b) - D(today)))[0];
    else date = thisY && thisY >= today ? thisY : mk(y0 + 1, m, d);
    if (!date) return err(raw, `${d}. ${MON45[m]} finnes ikke det året`);
    return { date, raw, kind: 'abs', span };
  };
  // «12. oktober», «3 nov 2026», «12. okt.»
  let m = /(?<![\d.])(\d{1,2})\.?\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\.?(?:\s+(\d{4}))?(?![a-zæøå])/.exec(t);
  if (m) {
    const d = +m[1], mo = MON_KEY[m[2]], span = [m.index, m.index + m[0].length];
    if (m[3]) { const x = mk(+m[3], mo, d); return x ? { date: x, raw: m[0].trim(), kind: 'abs', span } : err(m[0].trim(), `${d}. ${MON45[mo]} ${m[3]} finnes ikke`); }
    return pickYear(mo, d, m[0].trim(), span);
  }
  // dd.mm(.yy|yyyy), dd/mm – ikke klokkeslett (12:15) og ikke beløp. «12.10» er dato når den står alene eller sammen med et klokkeslett.
  const re = /(?<![\d:.,/])(\d{1,2})([./])(\d{1,2})(?:\2(\d{2,4}))?(?![\d:]|[.,]\d)/g;
  for (const x of t.matchAll(re)) {
    const a = +x[1], b = +x[3], yr = x[4];
    const before = t.slice(Math.max(0, x.index - 7), x.index);
    if (/(kl\.?|klokka|klokken)\s*$/.test(before)) continue; // «kl 12.15» er tid
    const after = t.slice(x.index + x[0].length, x.index + x[0].length + 6);
    if (/^\s*(kr|nok|,-|%)/.test(after)) continue;
    // «14.30» uten år: minutter 13–59 eller dag > 31 → klokkeslett, ikke dato.
    if (!yr && x[2] === '.' && (b > 12 || a > 31) && a <= 23 && b <= 59 && x[3].length === 2) continue;
    if (!yr && x[2] === '.' && a <= 23 && x[3].length === 2 && b <= 12 && hasOtherDate(t, x.index)) continue;
    const span = [x.index, x.index + x[0].length];
    if (b < 1 || b > 12) return err(x[0], `Måned ${b} finnes ikke`);
    if (a < 1 || a > 31) return err(x[0], `Dag ${a} finnes ikke`);
    if (yr) { const y = +yr < 100 ? 2000 + +yr : +yr; const d0 = mk(y, b - 1, a); return d0 ? { date: d0, raw: x[0], kind: 'abs', span } : err(x[0], `${a}. ${MON45[b - 1]} ${y} finnes ikke`); }
    return pickYear(b - 1, a, x[0], span);
  }
  // ISO
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return isIsoDate45(m[0]) ? { date: m[0], raw: m[0], kind: 'abs', span: [m.index, m.index + m[0].length] } : err(m[0], `${m[0]} er ikke en gyldig dato`);
  // Relative ord
  const rel = [[/(?<![a-zæøå])i\s*overmorgen(?![a-zæøå])/, 2], [/(?<![a-zæøå])(i\s*morgen|imorgen|i morra|imorra)(?![a-zæøå])/, 1], [/(?<![a-zæøå])i\s*går(?![a-zæøå])/, -1], [/(?<![a-zæøå])i\s*forgårs(?![a-zæøå])/, -2],
    [/(?<![a-zæøå])(i dag|idag|i kveld|ikveld|i ettermiddag|nå i kveld)(?![a-zæøå])/, 0]];
  for (const [r, n] of rel) { const x = r.exec(t); if (x) return { date: addDays45(today, n), raw: x[0], kind: 'rel', span: [x.index, x.index + x[0].length] }; }
  // Prompt 47: «etter jul» = første hverdag etter nyttår (2. januar, eller mandagen etter hvis den er en helgedag) etter neste jul.
  m = /(?<![a-zæøå])etter\s+jul(?:a|en|ehelga|ehelgen|eferien)?(?![a-zæøå])/.exec(t);
  if (m) return { date: afterChristmas45(today), raw: m[0], kind: 'rel', span: [m.index, m.index + m[0].length], approx: true };
  m = /(?<![a-zæøå])om\s+(\d{1,3}|en|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti)\s+(dag|dager|døgn|uke|uker)(?![a-zæøå])/.exec(t);
  if (m) { const n = /^\d/.test(m[1]) ? +m[1] : NUMW[m[1]]; return { date: addDays45(today, /^uke/.test(m[2]) ? n * 7 : n), raw: m[0], kind: 'rel', span: [m.index, m.index + m[0].length] }; }
  // Ukedag: «fredag», «på fredag», «neste fredag», «fredag neste uke», «fredag om en uke»
  m = /(?<![a-zæøå])(?:(neste|kommende|denne|forrige|sist)\s+)?(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:en)?(?![a-zæøå])(\s+(?:neste|om en|denne|forrige)\s+uk(?:en|e|a))?/.exec(t);
  if (m) {
    const wd = WD_ALIAS[m[2]], span = [m.index, m.index + m[0].length], tw = weekdayOf45(today);
    const nextWeek = /neste|om en/.test(m[3] ?? '') || (!m[3] && /(?<![a-zæøå])neste\s+uke/.test(t) && !m[1]);
    const thisWeek = /denne/.test(m[3] ?? '') || m[1] === 'denne';
    const past = m[1] === 'forrige' || m[1] === 'sist' || /forrige/.test(m[3] ?? '') || (prefer === 'past' && !m[1] && !m[3]);
    let date;
    if (nextWeek) date = addDays45(mondayOf45(addDays45(today, 7)), (wd + 6) % 7);
    else if (thisWeek) date = addDays45(mondayOf45(today), (wd + 6) % 7);
    else if (past) { let n = (tw - wd + 7) % 7; if (n === 0) n = 7; date = addDays45(today, -n); if (m[1] === 'forrige' || /forrige/.test(m[3] ?? '')) date = addDays45(mondayOf45(addDays45(today, -7)), (wd + 6) % 7); }
    else {
      // Prompt 47: ukedag = neste forekomst. Er det i dag (og ingen «neste»/«om en uke»), brukes i dag – whenOf45 flytter til om en
      // uke hvis klokkeslettet allerede er passert. «neste fredag» på en fredag = om en uke.
      let n = (wd - tw + 7) % 7;
      if (n === 0 && (m[1] === 'neste' || m[1] === 'kommende')) n = 7;
      if (n === 0) return { date: today, raw: m[0].trim(), kind: 'weekday', span, sameDay: true };
      date = addDays45(today, n);
    }
    return { date, raw: m[0].trim(), kind: 'weekday', span };
  }
  // «neste uke» alene som dato (oppgaver): mandag neste uke
  m = /(?<![a-zæøå])neste\s+uk(?:en|e|a)(?![a-zæøå])/.exec(t);
  if (m) return { date: mondayOf45(addDays45(today, 7)), raw: m[0], kind: 'week', span: [m.index, m.index + m[0].length] };
  return null;
}
// Finnes det en annen, tydelig dato i teksten (månedsnavn, dd.mm.åå, ukedag, i morgen)? Da er «12.15» et klokkeslett.
function hasOtherDate(t, idx) {
  const rest = t.slice(0, idx) + ' '.repeat(5) + t.slice(idx + 5);
  return /\d{1,2}\.?\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)|\d{1,2}[./]\d{1,2}[./]\d{2,4}|(?<![a-zæøå])(i\s*morgen|i dag|i overmorgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?![a-zæøå])/.test(rest)
    && /(?<![\d:.])\d{1,2}[.]\d{2}(?![\d:])/.test(t.slice(idx, idx + 6));
}

/* ---------------- Klokkeslett ---------------- */

const EVENING = /kveld|kino|konsert|teater|middag|fest|kamp|quiz|bursdagsfeiring|forestilling|show|date\b|pub|bar\b/;
const hmOk = (h, mi) => h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
const fmt = (h, mi) => `${pad(h)}:${pad(mi)}`;
const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const addMin45 = (hm, n) => { const t = Math.max(0, Math.min(23 * 60 + 59, toMin(hm) + n)); return fmt(Math.floor(t / 60), t % 60); };
const numOf = (s) => (/^\d+$/.test(s) ? +s : NUMW[s]);
/** Gjør 1–12 om til ettermiddag/kveld når teksten sier det (eller 1–6 uten noe: ingen avtaler kl. 03). */
function pm(h, t, mins = 0) {
  if (h > 12) return { h, assumed: false };
  if (/om morgenen|på morgenen|i morges|tidlig|formiddag|\bam\b/.test(t)) return { h: h === 12 ? 0 : h, assumed: false };
  if (/om kvelden|i kveld|ikveld|på kvelden|ettermiddag|\bpm\b|om natta/.test(t) && h < 12) return { h: h + 12, assumed: false };
  if (EVENING.test(t) && h >= 1 && h <= 11 && !(h >= 10 && mins)) return { h: h + 12, assumed: true };
  if (h >= 1 && h <= 6) return { h: h + 12, assumed: true };
  return { h, assumed: false };
}
/**
 * Første klokkeslett i teksten (og sluttid ved intervall). Datoer («12.10») er ikke tid.
 * → {start, end?, raw, span, assumedPm?} | {error, message, raw} | null
 */
export function parseTime45(text, { evening = null } = {}) {
  const t = low(text);
  const ctx = evening == null ? t : `${t} ${evening ? 'kveld' : ''}`;
  let m;
  // Intervall: 14:30–15:15, kl 9-10, 16-18
  m = /(?:kl\.?\s*|klokka\s*|klokken\s*)?(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|til)\s*(\d{1,2})(?:[:.](\d{2}))?(?![\d.:]|\s*(?:kr|%))/.exec(t);
  if (m && (m[2] || m[4] || /kl|klokk/.test(m[0]) || (+m[1] < +m[3] && +m[3] <= 23 && /\d\s*(?:-|–)\s*\d/.test(m[0])))) {
    const h1 = +m[1], m1 = +(m[2] ?? 0), h2 = +m[3], m2 = +(m[4] ?? 0);
    const dateLike = m[2] && +m[2] <= 12 && h1 <= 31 && !m[0].includes(':') && !/kl|klokk/.test(m[0]) && !m[4];
    if (!dateLike && hmOk(h1, m1) && hmOk(h2, m2)) {
      const a = pm(h1, ctx, m1), b = pm(h2, ctx, m2);
      return { start: fmt(a.h, m1), end: fmt(b.h < a.h ? b.h + (b.h + 12 <= 23 ? 12 : 0) : b.h, m2), raw: m[0].trim(), span: [m.index, m.index + m[0].length], ...(a.assumed ? { assumedPm: true } : {}) };
    }
  }
  // «halv åtte», «kvart over sju», «ti på halv ni», «fem over halv tre»
  m = new RegExp(`(?:kl\\.?\\s*|klokka\\s*|klokken\\s*)?(?:(fem|ti|kvart)\\s+(over|på)\\s+)?(halv)\\s+(${NUMW_RE}|\\d{1,2})(?![a-zæøå\\d])`).exec(t);
  if (m && numOf(m[4]) != null) {
    let h = numOf(m[4]) - 1, mi = 30;
    if (m[1]) { const d = m[1] === 'kvart' ? 15 : m[1] === 'ti' ? 10 : 5; mi += m[2] === 'over' ? d : -d; }
    if (h < 0) h = 23;
    const a = pm(h === 0 ? 12 : h, ctx, mi);
    return { start: fmt(a.h % 24, mi), raw: m[0].trim(), span: [m.index, m.index + m[0].length], ...(a.assumed ? { assumedPm: true } : {}) };
  }
  m = new RegExp(`(?:kl\\.?\\s*|klokka\\s*|klokken\\s*)?(fem|ti|kvart|tjue)\\s+(over|på)\\s+(${NUMW_RE}|\\d{1,2})(?![a-zæøå\\d])`).exec(t);
  if (m && numOf(m[3]) != null) {
    const d = m[1] === 'kvart' ? 15 : m[1] === 'ti' ? 10 : m[1] === 'tjue' ? 20 : 5;
    let h = numOf(m[3]), mi = m[2] === 'over' ? d : 60 - d;
    if (m[2] === 'på') h -= 1;
    const a = pm(h <= 0 ? 12 : h, ctx, mi);
    return { start: fmt(a.h % 24, mi), raw: m[0].trim(), span: [m.index, m.index + m[0].length], ...(a.assumed ? { assumedPm: true } : {}) };
  }
  // kl 16, kl. 16.30, klokka 7, klokka sju, kl1600
  m = new RegExp(`(?<![a-zæøå])(kl\\.?|klokka|klokken)\\s*(${NUMW_RE}|\\d{1,4})(?:[:.](\\d{2}))?(?![\\d])`).exec(t);
  if (m) {
    let h, mi = +(m[3] ?? 0);
    if (/^\d{3,4}$/.test(m[2])) { h = Math.floor(+m[2] / 100); mi = +m[2] % 100; } else h = numOf(m[2]);
    if (h == null || !hmOk(h, mi)) return err(m[0].trim(), `${m[0].trim()} er ikke et gyldig klokkeslett`);
    const a = /^\d{2}$/.test(m[2]) && +m[2] >= 13 ? { h, assumed: false } : pm(h, ctx, mi);
    return { start: fmt(a.h, mi), raw: m[0].trim(), span: [m.index, m.index + m[0].length], ...(a.assumed ? { assumedPm: true } : {}) };
  }
  // 12:15 / 9:05
  m = /(?<![\d.:])(\d{1,2}):(\d{2})(?![\d:])/.exec(t);
  if (m) { const h = +m[1], mi = +m[2]; if (!hmOk(h, mi)) return err(m[0], `${m[0]} er ikke et gyldig klokkeslett`); return { start: fmt(h, mi), raw: m[0], span: [m.index, m.index + m[0].length] }; }
  // 14.30 (ikke dato: minutter > 12, eller det finnes en annen dato)
  for (const x of t.matchAll(/(?<![\d.:,])(\d{1,2})\.(\d{2})(?![\d.:,])/g)) {
    const h = +x[1], mi = +x[2];
    if (!hmOk(h, mi)) continue;
    if (mi > 12 || h > 31 || hasOtherDate(t, x.index)) return { start: fmt(h, mi), raw: x[0], span: [x.index, x.index + x[0].length] };
  }
  // «fredag 18», «i morgen 16»: et frittstående tall 6–23 rett etter et dagord er klokkeslett.
  m = /(?<![a-zæøå])(i dag|i morgen|i overmorgen|i kveld|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+(\d{1,2})(?![\d.:,]|\s*(?:kr|%|stk|dager|timer|min))/.exec(t);
  if (m && +m[2] >= 6 && +m[2] <= 23) { const i = m.index + m[0].length - m[2].length; const a = pm(+m[2], ctx); return { start: fmt(a.h, 0), raw: m[2], span: [i, i + m[2].length], ...(a.assumed ? { assumedPm: true } : {}) }; }
  // 16h, 16t, 1600 (ikke beløp eller årstall)
  m = /(?<![\d.:,])(\d{1,2})\s*(h|t)(?![a-zæøå\d])/.exec(t);
  if (m && +m[1] <= 23 && !/(om|i|på|ca\.?)\s*$/.test(t.slice(0, m.index))) return { start: fmt(+m[1], 0), raw: m[0], span: [m.index, m.index + m[0].length] };
  m = /(?<![\d.:,])([01]\d|2[0-3])([0-5]\d)(?![\d.:,])(?!\s*(kr|nok|,-|%))/.exec(t);
  if (m && !/(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-z]*\.?\s*$/.test(t.slice(0, m.index)) && !/^(19|20)\d\d$/.test(m[0])) return { start: fmt(+m[1], +m[2]), raw: m[0], span: [m.index, m.index + m[0].length] };
  return null;
}
/** Uttrykk som sier noe om tid uten et klokkeslett («etter skolen»): bevares som merknad, aldri gjettet om til tid. */
export const SOFT_TIME45 = /(?<![a-zæøå])((?:rett\s+)?(?:etter|før|under|i)\s+(?:skolen|skoletid|jobb(?:en)?|trening(?:a|en)?|middag(?:en)?|lunsj(?:en)?|frokost(?:en)?|møtet|timen|kampen|helga|helgen)|i\s+lunsjen|på\s+vei\s+hjem|når\s+jeg\s+kommer\s+hjem)(?![a-zæøå])/;

/* ---------------- Periode ---------------- */

/**
 * Periode for søk og oppsummering. → {from, to (inklusiv), label, raw, span} | null
 * prefer 'past' (finans, «i oktober» = siste oktober), 'future' (kalender, «i desember» = neste desember).
 */
export function parsePeriod45(text, today = todayOslo45(), { prefer = 'past' } = {}) {
  const t = low(text);
  const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1;
  const res = (from, to, label, x) => ({ from, to, label, raw: x[0].trim(), span: [x.index, x.index + x[0].length] });
  const month = (yy, mm) => ({ from: `${yy}-${pad(mm + 1)}-01`, to: lastOfMonth(yy, mm) });
  let x;
  if ((x = /(?<![a-zæøå])(forrige|sist|siste)\s+måned(?:en)?(?![a-zæøå])/.exec(t)) && !/siste\s+\d/.test(x[0])) { const pm2 = mo === 0 ? 11 : mo - 1, py = mo === 0 ? y - 1 : y; const r = month(py, pm2); return res(r.from, r.to, `i ${MON45[pm2]}${py !== y ? ` ${py}` : ''}`, x); }
  if ((x = /(?<![a-zæøå])(denne|inneværende)\s+måned(?:en)?|(?<![a-zæøå])i\s+måned(?:en)?|(?<![a-zæøå])hittil\s+(?:denne|i)\s+måned(?:en)?/.exec(t))) { const r = month(y, mo); return res(r.from, prefer === 'past' ? today : r.to, `i ${MON45[mo]}`, x); }
  if ((x = /(?<![a-zæøå])neste\s+måned(?:en)?(?![a-zæøå])/.exec(t))) { const nm = (mo + 1) % 12, ny = mo === 11 ? y + 1 : y; const r = month(ny, nm); return res(r.from, r.to, `i ${MON45[nm]}`, x); }
  if ((x = /(?<![a-zæøå])(forrige|sist|siste)\s+uk(?:en|e|a)(?![a-zæøå])/.exec(t))) { const m0 = mondayOf45(addDays45(today, -7)); return res(m0, addDays45(m0, 6), 'forrige uke', x); }
  if ((x = /(?<![a-zæøå])neste\s+uk(?:en|e|a)(?![a-zæøå])/.exec(t))) { const m0 = mondayOf45(addDays45(today, 7)); return res(m0, addDays45(m0, 6), 'neste uke', x); }
  if ((x = /(?<![a-zæøå])(denne\s+uk(?:en|e|a)|i\s+uk(?:en|e|a)|resten\s+av\s+uka|resten\s+av\s+uken)(?![a-zæøå])/.exec(t))) { const m0 = mondayOf45(today); return res(/resten/.test(x[0]) ? today : m0, addDays45(m0, 6), /resten/.test(x[0]) ? 'resten av uka' : 'denne uka', x); }
  if ((x = /(?<![a-zæøå])uke\s+(\d{1,2})(?![\d])/.exec(t))) {
    const w = +x[1]; if (w < 1 || w > 53) return null;
    const jan4 = `${y}-01-04`, m1 = mondayOf45(jan4), m0 = addDays45(m1, (w - 1) * 7);
    return res(m0, addDays45(m0, 6), `uke ${w}`, x);
  }
  if ((x = /(?<![a-zæøå])(i\s+fjor|forrige\s+år)(?![a-zæøå])/.exec(t))) return res(`${y - 1}-01-01`, `${y - 1}-12-31`, `i ${y - 1}`, x);
  if ((x = /(?<![a-zæøå])(i\s+år|hittil\s+i\s+år|dette\s+året)(?![a-zæøå])/.exec(t))) return res(`${y}-01-01`, prefer === 'past' ? today : `${y}-12-31`, 'i år', x);
  if ((x = /(?<![a-zæøå])(?:siste|de\s+siste)\s+(\d{1,3}|to|tre|fire|fem|seks|sju|åtte|ni|ti|tretti)\s+(dager|døgn|uker|måneder)(?![a-zæøå])/.exec(t))) {
    const n = /^\d/.test(x[1]) ? +x[1] : x[1] === 'tretti' ? 30 : NUMW[x[1]];
    const days = /^uk/.test(x[2]) ? n * 7 : /^mån/.test(x[2]) ? n * 30 : n;
    return res(addDays45(today, -(days - 1)), today, `siste ${n} ${x[2]}`, x);
  }
  if ((x = /(?<![a-zæøå])(?:i\s+|for\s+|fra\s+|om\s+)?(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)(?:\s+(\d{4}))?(?![a-zæøå])/.exec(t)) && !/\d\.?\s*$/.test(t.slice(0, x.index))) {
    const mm = MON45.indexOf(x[1]);
    let yy = x[2] ? +x[2] : y;
    if (!x[2]) { if (prefer === 'past' && mm > mo) yy = y - 1; if (prefer === 'future' && mm < mo) yy = y + 1; }
    const r = month(yy, mm);
    return res(r.from, r.to, `i ${x[1]}${yy !== y ? ` ${yy}` : ''}`, x);
  }
  if ((x = /(?<![a-zæøå])(i\s+helga|i\s+helgen|denne\s+helga|denne\s+helgen)(?![a-zæøå])/.exec(t))) { const m0 = mondayOf45(today); return res(addDays45(m0, 5), addDays45(m0, 6), 'i helga', x); }
  // Én dag gir en periode på én dag.
  const d = parseDate45(t, today, { prefer: prefer === 'past' ? 'past' : 'future' });
  if (d?.date) return { from: d.date, to: d.date, label: relDate45(d.date, today), raw: d.raw, span: d.span, day: true };
  return null;
}

/* ---------------- Beløp ---------------- */

const NUM = (s) => { const v = parseFloat(String(s).replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const AMT = '(\\d{1,3}(?:[ \\u00a0.]\\d{3})+|\\d+)(?:,(\\d{1,2}))?';
/** «849 kroner», «849 kr», «kr 849», «849,-», «over 500 kr», «mellom 200 og 500», «rundt 850». → {amount?, min?, max?, raw} | null */
export function parseAmount45(text) {
  const t = low(text);
  let m = new RegExp(`(?:mellom|fra)\\s+(?:kr\\.?\\s*)?${AMT}\\s*(?:kr|kroner|nok)?\\s*(?:og|til|-|–)\\s*(?:kr\\.?\\s*)?${AMT}\\s*(?:kr|kroner|nok|,-)?`).exec(t);
  if (m) { const a = NUM(`${m[1]}${m[2] ? `,${m[2]}` : ''}`), b = NUM(`${m[3]}${m[4] ? `,${m[4]}` : ''}`); if (a != null && b != null) return { min: Math.min(a, b), max: Math.max(a, b), raw: m[0].trim() }; }
  m = new RegExp(`(over|mer enn|minst|under|mindre enn|maks|opptil|rundt|ca\\.?|cirka|omtrent)\\s+(?:kr\\.?\\s*)?${AMT}\\s*(kr|kroner|nok|,-)?`).exec(t);
  if (m && (m[4] || /kr|kroner/.test(t))) {
    const v = NUM(`${m[2]}${m[3] ? `,${m[3]}` : ''}`);
    if (v != null) {
      if (/over|mer enn|minst/.test(m[1])) return { min: v, raw: m[0].trim() };
      if (/under|mindre enn|maks|opptil/.test(m[1])) return { max: v, raw: m[0].trim() };
      return { min: Math.round(v * 0.9), max: Math.round(v * 1.1), approx: v, raw: m[0].trim() };
    }
  }
  m = new RegExp(`(?:kr\\.?\\s*|nok\\s*)${AMT}(?![\\d])|${AMT}\\s*(?:kr\\b|kroner|kronar|nok\\b|,-)`).exec(t);
  if (m) { const v = m[1] != null ? NUM(`${m[1]}${m[2] ? `,${m[2]}` : ''}`) : NUM(`${m[3]}${m[4] ? `,${m[4]}` : ''}`); if (v != null) return { amount: v, raw: m[0].trim() }; }
  return null;
}

/* ---------------- Samlet ---------------- */

/** Fjerner spennene (dato/tid) fra teksten. */
const cut = (s, spans) => { let out = s; for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) out = `${out.slice(0, a)} ${out.slice(b)}`; return out.replace(/\s+/g, ' ').trim(); };
/**
 * Dato, tid og «myk tid» i én tekst. prefer: se parseDate45. Tid uten dato får i dag (eller i morgen hvis tiden er passert).
 * → {date, start, end, dateRaw, timeRaw, softTime, assumedPm, errors:[{field, message}], rest, dateKind}
 */
export function whenOf45(text, today = todayOslo45(), { prefer = 'future', nowMin = null, timeWithoutDate = 'today' } = {}) {
  const src = String(text ?? '');
  const t = low(src);
  const errors = [];
  const tm = parseTime45(t);
  const spans = [];
  let start = null, end = null, assumedPm = false, timeRaw = null;
  if (tm?.error) errors.push({ field: 'time', message: tm.message });
  else if (tm) { start = tm.start; end = tm.end ?? null; assumedPm = !!tm.assumedPm; timeRaw = tm.raw; spans.push(tm.span); }
  // Datoen letes etter i teksten uten klokkeslettet (så «12:15» aldri blir dato).
  const masked = tm?.span ? `${t.slice(0, tm.span[0])}${' '.repeat(tm.span[1] - tm.span[0])}${t.slice(tm.span[1])}` : t;
  const dt = parseDate45(masked, today, { prefer });
  let date = null, dateRaw = null, dateKind = null;
  if (dt?.error) errors.push({ field: 'date', message: dt.message });
  else if (dt) { date = dt.date; dateRaw = dt.raw; dateKind = dt.kind; spans.push(dt.span); }
  // Prompt 47: ukedag som er i dag («på fredag» en fredag) = i dag, med mindre klokkeslettet allerede er passert (da om en uke).
  if (dt?.sameDay && start && toMin(start) <= (nowMin ?? nowMinOslo45())) date = addDays45(date, 7);
  // Prompt 47: «om 2 timer», «om 30 minutter», «om en time» → klokkeslett regnet fra nå (i dag, eller i morgen over midnatt).
  if (!start && !errors.length) {
    const rel = REL_TIME47.exec(t);
    if (rel) {
      const nm = nowMin ?? nowMinOslo45();
      const at = nm + relMinutes47(rel);
      start = fmt(Math.floor((at % 1440) / 60), at % 60); timeRaw = rel[0]; spans.push([rel.index, rel.index + rel[0].length]);
      if (!date) { date = addDays45(today, Math.floor(at / 1440)); dateKind = 'rel'; dateRaw = rel[0]; }
    }
  }
  if (!date && start && timeWithoutDate === 'today' && !errors.some((e) => e.field === 'date')) {
    const nm = nowMin ?? nowMinOslo45();
    date = toMin(start) <= nm ? addDays45(today, 1) : today;
    dateKind = 'implied';
  }
  const soft = SOFT_TIME45.exec(t);
  if (soft) spans.push([soft.index, soft.index + soft[0].length]);
  return { date, start, end, dateRaw, timeRaw, dateKind, softTime: soft ? soft[0] : null, assumedPm, errors, rest: cut(src, spans) };
}

/* ---------------- Prompt 47: relative klokkeslett og tidsvinduer ---------------- */

const NUMW47 = '\\d{1,3}|en|ei|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti|tolv|femten|tjue|tretti|førti|femti|halvannen|en\\s+halv';
export const REL_TIME47 = new RegExp(`(?<![a-zæøå])om\\s+(${NUMW47})\\s+(time|timer|t|minutt|minutter|min)(?![a-zæøå])|(?<![a-zæøå])om\\s+(en\\s+halvtime|et\\s+kvarter|ett\\s+kvarter|halvtimen|kvarteret)(?![a-zæøå])`);
const NUM47 = { en: 1, ei: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, tolv: 12, femten: 15, tjue: 20, tretti: 30, førti: 40, femti: 50, halvannen: 1.5 };
export function relMinutes47(m) {
  if (m[3]) return /kvarter/.test(m[3]) ? 15 : 30;
  const raw = m[1].replace(/\s+/g, ' ');
  const n = /^\d/.test(raw) ? +raw : raw === 'en halv' ? 0.5 : NUM47[raw] ?? 1;
  return Math.round(/^t|time/.test(m[2]) && !/^min/.test(m[2]) ? n * 60 : n);
}
/**
 * Tidsvindu for spørsmål («neste time», «om 2 timer», «i kveld», «i natt», «i ettermiddag», «i morgen tidlig»). Minutter fra midnatt
 * i Oslo (nowMin) – værverktøyet regner vinduet om til stedets tidssone. → {kind:'hour'|'evening'|'night'|'afternoon'|'morning',
 * from, to (datoer), fromMin, toMin, label, offset (dager fra i dag)} | null
 */
export function parseWindow47(text, today = todayOslo45(), nowMin = nowMinOslo45()) {
  const t = low(text);
  let m;
  const win = (kind, offset, fromMin, toMin, label) => {
    const from = addDays45(today, offset + Math.floor(fromMin / 1440)), to = addDays45(today, offset + Math.floor((toMin - 1) / 1440));
    return { kind, offset, from, to, fromMin: ((fromMin % 1440) + 1440) % 1440, toMin: ((toMin % 1440) + 1440) % 1440 || 1440, label };
  };
  if ((m = /(?<![a-zæøå])(?:den\s+)?neste\s+(?:timen|time)(?![a-zæøå])|(?<![a-zæøå])(?:den\s+)?kommende\s+timen?(?![a-zæøå])/.exec(t))) return win('hour', 0, nowMin, nowMin + 60, 'neste time');
  if ((m = /(?<![a-zæøå])de\s+neste\s+(\d{1,2}|to|tre|fire|fem|seks)\s+timene(?![a-zæøå])/.exec(t))) { const n = /^\d/.test(m[1]) ? +m[1] : NUM47[m[1]]; return win('hour', 0, nowMin, nowMin + n * 60, `de neste ${n} timene`); }
  if ((m = REL_TIME47.exec(t))) { const at = nowMin + relMinutes47(m); return win('hour', 0, at - 30, at + 30, m[0].trim()); }
  if (/(?<![a-zæøå])(i\s*kveld|ikveld|nå\s+i\s+kveld)(?![a-zæøå])/.test(t)) return win('evening', 0, Math.max(18 * 60, Math.min(nowMin, 23 * 60)), 24 * 60, 'i kveld');
  if (/(?<![a-zæøå])(i\s*natt|inatt)(?![a-zæøå])/.test(t)) return win('night', 0, 23 * 60, 30 * 60, 'i natt');
  if (/(?<![a-zæøå])i\s+ettermiddag(?![a-zæøå])/.test(t)) return win('afternoon', 0, 12 * 60, 18 * 60, 'i ettermiddag');
  if (/(?<![a-zæøå])i\s*morgen\s+tidlig(?![a-zæøå])/.test(t)) return win('morning', 1, 6 * 60, 10 * 60, 'i morgen tidlig');
  if (/(?<![a-zæøå])i\s*morgen\s+kveld(?![a-zæøå])/.test(t)) return win('evening', 1, 18 * 60, 24 * 60, 'i morgen kveld');
  return null;
}
/**
 * Prompt 47: den felles inngangen for norske dato-/tidsuttrykk. now = {today, nowMin} (Europe/Oslo), tz er med for tydelighet
 * (datoene er kalenderdatoer i Oslo; værverktøyet regner om til stedets tidssone).
 * → {date, start, end, window, dateRaw, timeRaw, dateKind, assumedPm, errors, rest, tz}
 */
export function parseNorwegianDateTime(text, now = {}, tz = 'Europe/Oslo') {
  const today = now.today ?? todayOslo45(), nowMin = now.nowMin ?? nowMinOslo45();
  const w = whenOf45(text, today, { prefer: now.prefer ?? 'future', nowMin, timeWithoutDate: now.timeWithoutDate ?? 'today' });
  return { ...w, window: parseWindow47(text, today, nowMin), tz };
}

/* ---------------- Prompt 62 (prompt 49 del 2): gjentakelse ---------------- */
// «hver morgen kl. 7», «hver hverdag», «den 1. hver måned», «annenhver tirsdag», «hver fredag i vinter», «i 2 uker» → RRULE (RFC 5545)
// med Europe/Oslo og ev. sluttdato. Ligger i recur62.js (samme felles parser, egen fil for RRULE-beregningen).
export { parseRecurrence62, parseRRule62, ruleToRRule62, icalOf62, nextRun62, nextRuns62, labelOf62, untilOf62, osloToUtc62, osloParts62, quiet62, afterQuiet62, ruleOfWhen62, matches62, TZ62 } from './recur62.js';
