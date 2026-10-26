// Prompt 62 (prompt 49 del 2, D2SRV): gjentakelse i den felles datoparseren. Norsk tekst («hver morgen kl. 7», «hver hverdag»,
// «den 1. hver måned», «annenhver tirsdag», «hver fredag i vinter», «i 2 uker», «fram til 1. desember») → RRULE (RFC 5545) med
// DTSTART;TZID=Europe/Oslo og ev. sluttdato (UNTIL). Neste kjøring regnes i Europe/Oslo med sommertid: lokal veggklokke → UTC via Intl
// (ingen avhengigheter). Ikke-eksisterende tid (02:30 natt til siste søndag i mars) = tiden etter hoppet (RFC 5545: offset før gapet,
// altså 03:30), tvetydig tid (02:30 siste søndag i oktober) = første forekomst.
// Re-eksporteres fra dates.js (felles inngang). Bruker bare dates.js sine funksjoner inne i funksjonene (sirkulær import er trygg).
//
//   parseRecurrence62(text, {today, nowMin, now}) → {ok:true, rule, when:{text,label,rrule,ical,dtstart,tz,until,once,time,explicitTime}}
//                                                  | {ok:false, error, question}
//   parseRRule62('FREQ=…') → rule · ruleToRRule62(rule) → 'FREQ=…' · nextRun62(rule, afterMs) → ms | null · nextRuns62(rule, afterMs, n)
//   osloToUtc62('YYYY-MM-DD', 'HH:MM') → ms · osloParts62(ms) → {date, hm, h, m, wd} · quiet62(ms) / afterQuiet62(ms)
import { parseTime45, parseDate45, addDays45, weekdayOf45, mondayOf45, isIsoDate45, isHm45, MON45, WD45 } from './dates.js';

export const TZ62 = 'Europe/Oslo';
const pad = (n) => String(n).padStart(2, '0');
const low = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const WDC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WD_RE = '(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)';
const WD_NUM = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, søndag: 0 };
const NUMW = { en: 1, ett: 1, én: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, tolv: 12 };
const ORD = { første: 1, andre: 2, tredje: 3, fjerde: 4, femte: 5, siste: -1, nest_siste: -2 };
const numOf = (s) => (/^\d+$/.test(s) ? +s : NUMW[s] ?? null);

/* ---------------- Tidssone (Europe/Oslo) ---------------- */

const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ62, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const WDS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** ms → {date:'YYYY-MM-DD', hm:'HH:MM', h, m, wd} i Oslo. */
export function osloParts62(ms) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, h: +p.hour, m: +p.minute, wd: WDS[p.weekday] };
}
const offMin = (ms) => { const p = osloParts62(ms); const [y, mo, d] = p.date.split('-').map(Number); return Math.round((Date.UTC(y, mo - 1, d, p.h, p.m) - Math.floor(ms / 60_000) * 60_000) / 60_000); };
/** Lokal veggklokke i Oslo → ms (UTC). Gap (vår) → tiden etter hoppet; tvetydig (høst) → første forekomst. */
export function osloToUtc62(date, hm) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const offs = [...new Set([offMin(naive - 12 * 3600_000), offMin(naive + 12 * 3600_000)])];
  const hits = offs.map((o) => naive - o * 60_000).filter((t) => { const p = osloParts62(t); return p.date === date && p.hm === hm; });
  if (hits.length) return Math.min(...hits);
  return naive - Math.min(...offs) * 60_000; // gapet: offset før hoppet (vintertid +1) → 02:30 blir 03:30 sommertid
}
/** Stille timer 23–07 (lokal tid). */
export const quiet62 = (ms) => { const { h } = osloParts62(ms); return h >= 23 || h < 7; };
/** Første tidspunkt utenfor stille timer (07:00 samme eller neste dag). */
export function afterQuiet62(ms) {
  if (!quiet62(ms)) return ms;
  const p = osloParts62(ms);
  return osloToUtc62(p.h >= 23 ? addDays45(p.date, 1) : p.date, '07:00');
}

/* ---------------- RRULE ---------------- */

const D = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const lastDay = (date) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate();

/** rule → 'FREQ=…' (uten DTSTART). UNTIL skrives i UTC (RFC 5545 krever det når DTSTART har TZID). */
export function ruleToRRule62(r) {
  if (!r?.freq) return null;
  const p = [`FREQ=${r.freq}`];
  if (r.interval > 1) p.push(`INTERVAL=${r.interval}`);
  if (r.byday?.length) p.push(`BYDAY=${r.byday.map((x) => (typeof x === 'string' ? x : `${x.n}${x.wd}`)).join(',')}`);
  if (r.bymonthday?.length) p.push(`BYMONTHDAY=${r.bymonthday.join(',')}`);
  if (r.bymonth?.length) p.push(`BYMONTH=${r.bymonth.join(',')}`);
  const [h, m] = r.time.split(':').map(Number);
  p.push(`BYHOUR=${h}`, `BYMINUTE=${m}`);
  if (r.until) { const u = new Date(osloToUtc62(r.until, '23:59') + 59_000); p.push(`UNTIL=${u.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`); }
  return p.join(';');
}
/** iCalendar-blokken (DTSTART;TZID + RRULE). */
export function icalOf62(r) {
  const ds = `DTSTART;TZID=${TZ62}:${r.dtstart.replace(/-/g, '')}T${r.time.replace(':', '')}00`;
  return r.freq ? `${ds}\nRRULE:${ruleToRRule62(r)}` : ds;
}
/**
 * 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;BYHOUR=18;BYMINUTE=0' (+ dtstart 'YYYY-MM-DD' eller 'YYYY-MM-DDTHH:MM') → rule | null.
 * Støtter FREQ DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (med ordinal i MONTHLY), BYMONTHDAY (også negativ), BYMONTH, BYHOUR,
 * BYMINUTE og UNTIL (UTC eller dato). Alt annet → null (aldri en gjetning).
 */
export function parseRRule62(str, dtstart) {
  const s = String(str ?? '').trim().replace(/^RRULE:/i, '');
  if (!s) return null;
  const kv = Object.fromEntries(s.split(';').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i).toUpperCase(), x.slice(i + 1)]; }));
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(kv.FREQ)) return null;
  if (Object.keys(kv).some((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYHOUR', 'BYMINUTE', 'UNTIL', 'WKST'].includes(k))) return null;
  const ds = String(dtstart ?? '');
  const r = { freq: kv.FREQ, interval: Math.max(1, Math.min(99, parseInt(kv.INTERVAL ?? '1', 10) || 1)), byday: [], bymonthday: [], bymonth: [], dtstart: ds.slice(0, 10), time: null, until: null };
  if (!isIsoDate45(r.dtstart)) return null;
  if (kv.BYDAY) for (const x of kv.BYDAY.split(',')) { const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x); if (!m) return null; r.byday.push(m[1] ? { n: +m[1], wd: m[2] } : m[2]); }
  if (kv.BYMONTHDAY) for (const x of kv.BYMONTHDAY.split(',')) { const n = +x; if (!Number.isInteger(n) || n === 0 || n < -31 || n > 31) return null; r.bymonthday.push(n); }
  if (kv.BYMONTH) for (const x of kv.BYMONTH.split(',')) { const n = +x; if (!Number.isInteger(n) || n < 1 || n > 12) return null; r.bymonth.push(n); }
  const h = kv.BYHOUR != null ? +kv.BYHOUR : +(ds.slice(11, 13) || NaN), mi = kv.BYMINUTE != null ? +kv.BYMINUTE : +(ds.slice(14, 16) || 0);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(mi) || mi < 0 || mi > 59) return null;
  r.time = `${pad(h)}:${pad(mi)}`;
  if (kv.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(kv.UNTIL);
    if (!m) return null;
    r.until = m[4] && m[7] ? osloParts62(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).date : `${m[1]}-${m[2]}-${m[3]}`;
  }
  return r;
}
const nthOk = (date, n, wd) => {
  if (weekdayOf45(date) !== WDC.indexOf(wd)) return false;
  const d = +date.slice(8, 10);
  return n > 0 ? Math.ceil(d / 7) === n : Math.ceil((lastDay(date) - d + 1) / 7) === -n;
};
/** Passer datoen regelen? */
export function matches62(r, date) {
  if (date < r.dtstart || (r.until && date > r.until)) return false;
  const mo = +date.slice(5, 7), day = +date.slice(8, 10), wd = WDC[weekdayOf45(date)];
  if (r.bymonth?.length && r.freq !== 'YEARLY' && !r.bymonth.includes(mo)) return false;
  const plainDays = (r.byday ?? []).filter((x) => typeof x === 'string');
  const dayOk = (n) => (n > 0 ? day === n : day === lastDay(date) + n + 1);
  switch (r.freq) {
    case 'DAILY':
      if (plainDays.length && !plainDays.includes(wd)) return false;
      return daysBetween(r.dtstart, date) % r.interval === 0;
    case 'WEEKLY': {
      const days = plainDays.length ? plainDays : [WDC[weekdayOf45(r.dtstart)]];
      if (!days.includes(wd)) return false;
      return (daysBetween(mondayOf45(r.dtstart), mondayOf45(date)) / 7) % r.interval === 0;
    }
    case 'MONTHLY': {
      if (monthsBetween(r.dtstart, date) % r.interval !== 0) return false;
      const ords = (r.byday ?? []).filter((x) => typeof x === 'object');
      if (ords.length) return ords.some((x) => nthOk(date, x.n, x.wd));
      if (plainDays.length) return plainDays.includes(wd);
      return (r.bymonthday?.length ? r.bymonthday : [+r.dtstart.slice(8, 10)]).some(dayOk);
    }
    case 'YEARLY': {
      if ((+date.slice(0, 4) - +r.dtstart.slice(0, 4)) % r.interval !== 0) return false;
      if (!(r.bymonth?.length ? r.bymonth : [+r.dtstart.slice(5, 7)]).includes(mo)) return false;
      return (r.bymonthday?.length ? r.bymonthday : [+r.dtstart.slice(8, 10)]).some(dayOk);
    }
    default: return false;
  }
}
/** Neste kjøring etter afterMs (strengt etter). rule.freq null = én kjøring (dtstart + time). → ms | null */
export function nextRun62(r, afterMs) {
  if (!r?.dtstart || !isHm45(r.time)) return null;
  if (!r.freq) { const t = osloToUtc62(r.dtstart, r.time); return t > afterMs ? t : null; }
  let d = osloParts62(afterMs).date;
  if (d < r.dtstart) d = r.dtstart;
  else d = addDays45(d, -1); // tid like etter midnatt UTC/lokal: se én dag tilbake
  for (let i = 0; i < 3700; i++, d = addDays45(d, 1)) {
    if (r.until && d > r.until) return null;
    if (!matches62(r, d)) continue;
    const t = osloToUtc62(d, r.time);
    if (t > afterMs) return t;
  }
  return null;
}
export function nextRuns62(r, afterMs, n = 3) {
  const out = [];
  let t = afterMs;
  for (let i = 0; i < n; i++) { const x = nextRun62(r, t); if (x == null) break; out.push(x); t = x; }
  return out;
}

/* ---------------- Norsk tekst → regel ---------------- */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dmy = (date, today) => `${+date.slice(8, 10)}. ${MON45[+date.slice(5, 7) - 1]}${date.slice(0, 4) !== String(today).slice(0, 4) ? ` ${date.slice(0, 4)}` : ''}`;
const lastOfMonth = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
const join = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);
const WD_NAME = { MO: 'mandag', TU: 'tirsdag', WE: 'onsdag', TH: 'torsdag', FR: 'fredag', SA: 'lørdag', SU: 'søndag' };
const ORD_NAME = { 1: 'første', 2: 'andre', 3: 'tredje', 4: 'fjerde', 5: 'femte', '-1': 'siste', '-2': 'nest siste' };

/** Norsk etikett for regelen («Hver hverdag kl. 07:00», «Annenhver tirsdag kl. 18:00», «Den 1. hver måned kl. 08:00»). */
export function labelOf62(r, today) {
  const at = `kl. ${r.time}`;
  const every = (n, one, two, many) => (n === 1 ? one : n === 2 ? two : many.replace('{n}', n));
  let s;
  if (!r.freq) s = `${cap(WD45[weekdayOf45(r.dtstart)])} ${dmy(r.dtstart, today)} ${at}`;
  else if (r.freq === 'DAILY') s = `${every(r.interval, 'Hver dag', 'Annenhver dag', 'Hver {n}. dag')} ${at}`;
  else if (r.freq === 'WEEKLY') {
    const days = (r.byday?.length ? r.byday : [WDC[weekdayOf45(r.dtstart)]]).filter((x) => typeof x === 'string');
    const key = days.join(',');
    const what = key === 'MO,TU,WE,TH,FR' ? 'hverdag (man–fre)' : key === 'SA,SU' ? 'helg (lørdag og søndag)' : join(days.map((x) => WD_NAME[x]));
    s = `${r.interval === 1 ? 'Hver' : r.interval === 2 ? 'Annenhver' : `Hver ${r.interval}.`} ${what} ${at}`;
  } else if (r.freq === 'MONTHLY') {
    const ord = (r.byday ?? []).find((x) => typeof x === 'object');
    const md = r.bymonthday?.[0] ?? +r.dtstart.slice(8, 10);
    const per = r.interval === 1 ? 'hver måned' : r.interval === 2 ? 'annenhver måned' : `hver ${r.interval}. måned`;
    s = ord ? `${cap(ORD_NAME[ord.n] ?? `${ord.n}.`)} ${WD_NAME[ord.wd]} i ${per} ${at}` : md === -1 ? `Siste dag i ${per} ${at}` : `Den ${md}. ${per} ${at}`;
  } else {
    const m = (r.bymonth?.[0] ?? +r.dtstart.slice(5, 7)), d = r.bymonthday?.[0] ?? +r.dtstart.slice(8, 10);
    s = `Hvert år ${d}. ${MON45[m - 1]} ${at}`;
  }
  if (r.bymonth?.length && r.freq !== 'YEARLY') s += ` (${join(r.bymonth.map((m) => MON45[m - 1]))})`;
  if (r.until && r.freq) s += ` fram til ${dmy(r.until, today)}`;
  return s;
}

// Sluttdato: «i 2 uker», «i en måned», «i vinter», «ut året», «fram til 1. desember», «til jul».
const DUR_RE = /(?<![a-zæøå])(?:i|de\s+neste|for)\s+(\d{1,3}|en|ett|ei|to|tre|fire|fem|seks|sju|åtte|ni|ti|tolv)\s+(dag|dager|døgn|uke|uker|måned|måneder|år)(?![a-zæøå])/;
const SEASON_RE = /(?<![a-zæøå])(?:i|denne|hele|gjennom|i\s+hele)\s+(vinter|vinteren|sommer|sommeren|høst|høsten|vår|våren)(?![a-zæøå])/;
const UNTIL_RE = /(?<![a-zæøå])(?:fram|frem)?\s*til\s+og\s+med\s+|(?<![a-zæøå])(?:fram|frem)\s+til\s+|(?<![a-zæøå])inntil\s+|(?<![a-zæøå])til\s+(?=(?:\d{1,2}\.|\d{1,2}\/|jul|nyttår|påske|(?:neste\s+)?(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|slutten|utgangen))/;
const FROM_RE = /(?<![a-zæøå])(?:fra\s+og\s+med|fra|f\.o\.m\.|starter|start(?:e)?|begynn(?:er|e)?)\s+(?=(?:\d{1,2}\.|\d{1,2}\/|i\s*morgen|neste|(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|\d{1,2}\s+(?:jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)))/;

/** Sluttdato (inklusiv) i teksten. → {until, raw} | {error} | null */
export function untilOf62(text, today) {
  const t = low(text);
  const y = +today.slice(0, 4), mo = +today.slice(5, 7);
  let m = DUR_RE.exec(t);
  if (m) {
    const n = numOf(m[1]);
    if (!n) return null;
    const u = m[2].startsWith('uke') ? addDays45(today, n * 7) : m[2].startsWith('måned') ? (() => { const x = new Date(Date.UTC(y, mo - 1 + n, +today.slice(8, 10))); return x.toISOString().slice(0, 10); })() : m[2] === 'år' ? `${y + n}-${today.slice(5)}` : addDays45(today, n);
    return { until: u, raw: m[0] };
  }
  m = SEASON_RE.exec(t);
  if (m) {
    const s = m[1].replace(/en$/, '');
    if (s === 'vinter') { const ey = mo >= 3 ? y + 1 : y; return { until: lastOfMonth(ey, 2), raw: m[0], season: 'vinter' }; }
    if (s === 'sommer') return { until: `${mo > 8 ? y + 1 : y}-08-31`, raw: m[0], season: 'sommer' };
    if (s === 'høst') return { until: `${mo > 11 ? y + 1 : y}-11-30`, raw: m[0], season: 'høst' };
    if (s === 'vår') return { until: `${mo > 5 ? y + 1 : y}-05-31`, raw: m[0], season: 'vår' };
  }
  if ((m = /(?<![a-zæøå])ut\s+(?:året|desember)(?![a-zæøå])/.exec(t))) return { until: `${y}-12-31`, raw: m[0] };
  if ((m = /(?<![a-zæøå])ut\s+(?:måneden|denne\s+måneden)(?![a-zæøå])/.exec(t))) return { until: lastOfMonth(y, mo), raw: m[0] };
  if ((m = /(?<![a-zæøå])ut\s+(?:uka|uken|denne\s+uka)(?![a-zæøå])/.exec(t))) return { until: addDays45(mondayOf45(today), 6), raw: m[0] };
  m = UNTIL_RE.exec(t);
  if (m) {
    const rest = t.slice(m.index + m[0].length);
    if (/^jul/.test(rest)) return { until: `${today > `${y}-12-24` ? y + 1 : y}-12-24`, raw: `${m[0]}jul` };
    if (/^nyttår/.test(rest)) return { until: `${y}-12-31`, raw: `${m[0]}nyttår` };
    const d = parseDate45(rest.slice(0, 30), today, { prefer: 'future' });
    if (d?.error) return { error: d.message };
    if (d?.date) return { until: d.date, raw: `${m[0]}${d.raw}` };
  }
  return null;
}

const DEFAULT_TIME = [[/(?<![a-zæøå])(?:hver|alle|hver\s+eneste|om|på)\s+morgen(?:en|er|ene)?(?![a-zæøå])|(?<![a-zæøå])tidlig(?![a-zæøå])/, '07:00'], [/(?<![a-zæøå])formiddag/, '10:00'], [/(?<![a-zæøå])lunsj/, '11:30'],
  [/(?<![a-zæøå])ettermiddag/, '15:00'], [/(?<![a-zæøå])kveld/, '20:00']];
const MORNING_RE = /(?<![a-zæøå])(?:hver|alle|om|på)\s+morgen(?:en|er|ene)?(?![a-zæøå])/;

/** Gjentakelsen i teksten (uten tid og sluttdato). → {freq, interval, byday, bymonthday, bymonth, yearly?} | null */
function freqOf(t, today) {
  let m;
  const inter = (w) => (/annen\s*hver|hver\s+annen|hver\s+andre/.test(w) ? 2 : /hver\s+tredje/.test(w) ? 3 : /hver\s+fjerde/.test(w) ? 4 : 1);
  const IV = '(annen\\s*hver|hver\\s+annen|hver\\s+andre|hver\\s+tredje|hver\\s+fjerde)';
  // Månedlig: «den 1. hver måned», «1. hver måned», «hver måned den 15.», «den første i hver måned», «siste dag i måneden»,
  // «første mandag i hver måned», «hver måned»/«månedlig».
  if ((m = new RegExp(`(?<![a-zæøå])(første|andre|tredje|fjerde|femte|siste)\\s+${WD_RE}(?:en)?\\s+i\\s+(?:hver\\s+|${IV}\\s+)?måned(?:en)?`).exec(t))) {
    const iv = m[3] ? inter(m[3]) : 1;
    return { freq: 'MONTHLY', interval: iv, byday: [{ n: ORD[m[1]], wd: WDC[WD_NUM[m[2]]] }] };
  }
  if ((m = /(?<![a-zæøå])(?:den\s+)?siste\s+(?:dag(?:en)?\s+)?i\s+(?:hver\s+)?måned(?:en)?/.exec(t))) return { freq: 'MONTHLY', interval: 1, bymonthday: [-1] };
  if ((m = new RegExp(`(?<![a-zæøå\\d])(?:den\\s+)?(\\d{1,2})\\.?\\s+(?:(?:dag(?:en)?\\s+)?i\\s+)?(?:hver|${IV})\\s+måned`).exec(t))) { const d = +m[1]; if (d < 1 || d > 31) return { error: `Den ${d}. finnes ikke i en måned` }; return { freq: 'MONTHLY', interval: m[2] ? inter(m[2]) : 1, bymonthday: [d] }; }
  if ((m = /(?<![a-zæøå])(?:den\s+)?første\s+(?:dag(?:en)?\s+)?i\s+(?:hver\s+)?måned(?:en)?/.exec(t))) return { freq: 'MONTHLY', interval: 1, bymonthday: [1] };
  if ((m = new RegExp(`(?<![a-zæøå])(?:hver|${IV})\\s+måned(?:\\s+den\\s+(\\d{1,2})\\.?)?|(?<![a-zæøå])månedlig(?:\\s+den\\s+(\\d{1,2})\\.?)?`).exec(t))) {
    const d = +(m[2] ?? m[3] ?? 1);
    return { freq: 'MONTHLY', interval: m[1] ? inter(m[1]) : 1, bymonthday: [d >= 1 && d <= 31 ? d : 1] };
  }
  // Årlig: «hvert år 17. mai», «årlig den 1. juli», «hver 17. mai».
  if (/(?<![a-zæøå])(hvert\s+år|årlig|en\s+gang\s+i\s+året)(?![a-zæøå])/.test(t) || new RegExp(`(?<![a-zæøå])hver\\s+\\d{1,2}\\.\\s*(?:${MON45.join('|')})`).test(t)) {
    const d = parseDate45(t.replace(/hvert\s+år|årlig|hver(?=\s+\d)/g, ' '), today, { prefer: 'future' });
    if (d?.date && d.kind === 'abs') return { freq: 'YEARLY', interval: 1, bymonth: [+d.date.slice(5, 7)], bymonthday: [+d.date.slice(8, 10)], startDate: d.date };
    return { freq: 'YEARLY', interval: 1, bymonth: [+today.slice(5, 7)], bymonthday: [+today.slice(8, 10)] };
  }
  // Hverdager / helg.
  if (/(?<![a-zæøå])(?:hver\s+hverdag|alle\s+hverdager|på\s+hverdager|hverdager|hver\s+ukedag|alle\s+ukedager|på\s+ukedager|mandag\s+til\s+fredag|man(?:dag)?\s*[-–]\s*fre(?:dag)?)(?![a-zæøå])/.test(t)) return { freq: 'WEEKLY', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] };
  if (/(?<![a-zæøå])(?:hver\s+helg|alle\s+helger|i\s+helgene|helgene|hver\s+lørdag\s+og\s+søndag)(?![a-zæøå])/.test(t)) return { freq: 'WEEKLY', interval: /annen\s*hver\s+helg/.test(t) ? 2 : 1, byday: ['SA', 'SU'] };
  // Ukedager: «hver fredag», «annenhver tirsdag», «hver mandag og torsdag», «på fredager», «fredager».
  const wdList = (s) => [...s.matchAll(new RegExp(`${WD_RE}(?:en|er|ene)?`, 'g'))].map((x) => WDC[WD_NUM[x[1]]]);
  if ((m = new RegExp(`(?<![a-zæøå])(hver|alle|${IV})\\s+(${WD_RE}(?:en|er)?(?:\\s*(?:,|og)\\s*${WD_RE}(?:en|er)?)*)`).exec(t))) {
    return { freq: 'WEEKLY', interval: inter(m[1]), byday: [...new Set(wdList(m[3] ?? m[0]))] };
  }
  if ((m = new RegExp(`(?<![a-zæøå])(?:på\\s+)?(${WD_RE}er(?:\\s*(?:,|og)\\s*${WD_RE}er)*)(?![a-zæøå])`).exec(t))) return { freq: 'WEEKLY', interval: 1, byday: [...new Set(wdList(m[1]))] };
  // Daglig og ukentlig.
  if ((m = new RegExp(`(?<![a-zæøå])${IV}\\s+(dag|uke)(?![a-zæøå])`).exec(t))) return { freq: m[2] === 'dag' ? 'DAILY' : 'WEEKLY', interval: inter(m[1]) };
  if (/(?<![a-zæøå])(?:hver\s+(?:eneste\s+)?(?:dag|morgen|kveld|ettermiddag|formiddag|natt)|alle\s+dager|daglig|hver\s+morgen|om\s+morgenen\s+hver\s+dag|hver\s+dag)(?![a-zæøå])/.test(t)) return { freq: 'DAILY', interval: 1 };
  if (/(?<![a-zæøå])(?:hver\s+uke|ukentlig|en\s+gang\s+i\s+uka|en\s+gang\s+i\s+uken)(?![a-zæøå])/.test(t)) return { freq: 'WEEKLY', interval: 1 };
  if (/(?<![a-zæøå])(?:hver\s+time|hvert\s+kvarter|hvert\s+minutt|hver\s+halvtime)(?![a-zæøå])/.test(t)) return { error: 'Oftere enn én gang om dagen støttes ikke – velg et klokkeslett (f.eks. «hver dag kl. 12»)' };
  return null;
}

/**
 * Når-teksten → regel. opts: {today, nowMin, now (ms, standard Date.now())}. Uten gjentakelse: én kjøring (dato/tid fra teksten).
 * Uten klokkeslett: morgen 07:00, formiddag 10:00, lunsj 11:30, ettermiddag 15:00, kveld 20:00, ellers 08:00 (explicitTime false).
 */
export function parseRecurrence62(text, opts = {}) {
  const raw = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const now = opts.now ?? Date.now();
  const today = opts.today ?? osloParts62(now).date;
  const t = low(raw);
  const fail = (error, question = null) => ({ ok: false, error, question: question ?? `${error}. Når skal jeg gjøre det? (f.eks. «hver morgen kl. 7» eller «hver fredag kl. 16»)` });
  if (!t) return fail('Mangler tidspunkt');
  // Klokkeslett (dates.js). «hver morgen kl. 6» er morgen, ikke 18.
  const tt = t.replace(/(?<![\d])(\d{1,2})\.\s+(?=(?:hver|i\s+hver|annen|dag))/g, ' '); // «den 1. hver måned» er ikke et klokkeslett
  const tm = parseTime45(MORNING_RE.test(t) ? `${tt} om morgenen` : tt);
  if (tm?.error) return fail(tm.message);
  let time = tm?.start ?? null;
  // «kl 06:30», «02:30»: ledende null er 24-timersklokke – aldri gjettet om til ettermiddag.
  if (time && tm.assumedPm && /(?<!\d)0\d(?:[:.]\d{2})?(?!\d)/.test(tm.raw)) time = `${pad(+time.slice(0, 2) - 12)}${time.slice(2)}`;
  const explicitTime = !!time;
  if (!time) time = DEFAULT_TIME.find(([re]) => re.test(t))?.[1] ?? '08:00';
  // Sluttdato og startdato.
  const un = untilOf62(t, today);
  if (un?.error) return fail(un.error);
  let start = today;
  const fm = FROM_RE.exec(t);
  if (fm) { const d = parseDate45(t.slice(fm.index + fm[0].length, fm.index + fm[0].length + 30), today, { prefer: 'future' }); if (d?.date) start = d.date; }
  // Gjentakelsen. Teksten uten sluttdato (så «til fredag» ikke blir «hver fredag»).
  const tf = un?.raw ? t.replace(un.raw, ' ') : t;
  const f = freqOf(tf, today);
  if (f?.error) return fail(f.error, `${f.error}.`);
  let rule;
  if (f) {
    rule = { freq: f.freq, interval: f.interval ?? 1, byday: f.byday ?? [], bymonthday: f.bymonthday ?? [], bymonth: f.bymonth ?? [], dtstart: start, time, until: un?.until ?? null };
  } else {
    // Én kjøring: dato fra teksten (i dag/i morgen hvis bare klokkeslett).
    const masked = tm?.span ? `${tt.slice(0, tm.span[0])}${' '.repeat(tm.span[1] - tm.span[0])}${tt.slice(tm.span[1])}` : tt;
    const d = parseDate45(masked, today, { prefer: 'future' });
    if (d?.error) return fail(d.message);
    if (!d?.date && !explicitTime) return fail('Fant ikke når det skal skje');
    let date = d?.date ?? today;
    if (osloToUtc62(date, time) <= now) { if (!d?.date || d.sameDay) date = addDays45(date, d?.sameDay ? 7 : 1); else return fail(`${cap(dmy(date, today))} kl. ${time} har allerede vært`); }
    rule = { freq: null, interval: 1, byday: [], bymonthday: [], bymonth: [], dtstart: date, time, until: null };
  }
  if (rule.until && rule.until < start) return fail(`Sluttdatoen ${dmy(rule.until, today)} har allerede vært`);
  // DTSTART = første forekomst etter nå (gir fasen for «annenhver»).
  if (rule.freq) {
    // Fasen for «annenhver …» starter ved første passende forekomst (annenhver tirsdag = førstkommende tirsdag, så hver andre).
    const first = nextRun62({ ...rule, interval: 1 }, now);
    if (first == null) return fail('Fant ingen kjøring innenfor sluttdatoen');
    rule.dtstart = osloParts62(first).date;
    if (rule.freq === 'YEARLY' && !f.bymonth?.length) rule.bymonth = [+rule.dtstart.slice(5, 7)];
  }
  const when = {
    text: raw, label: labelOf62(rule, today), rrule: ruleToRRule62(rule), ical: icalOf62(rule), dtstart: `${rule.dtstart}T${rule.time}`, tz: TZ62,
    until: rule.until, once: !rule.freq, time: rule.time, explicitTime, ...(un?.season ? { season: un.season } : {}),
  };
  return { ok: true, rule, when };
}

/** Lagret når (rrule + dtstart + until) → regel. */
export function ruleOfWhen62(w) {
  if (!w?.dtstart) return null;
  if (!w.rrule) { const [d, hm] = String(w.dtstart).split('T'); return isIsoDate45(d) && isHm45(hm) ? { freq: null, interval: 1, byday: [], bymonthday: [], bymonth: [], dtstart: d, time: hm, until: null } : null; }
  const r = parseRRule62(w.rrule, w.dtstart);
  if (r && w.until && !r.until) r.until = w.until;
  return r;
}
