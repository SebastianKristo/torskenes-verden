// Prompt 62 (prompt 49 del 2, D2SRV): tolkning av en planlagt oppgave. Planleggeren gir hva (en vanlig Glimt-forespørsel), når
// (råtekst) og ev. betingelse (råtekst); KODEN tolker når (dates.js → recur62.js) og betingelsen (cond.js). Ingenting gjettes:
// mangler noe, spør Glimt. Brukes av Glimt-verktøyene (tools.js) og API-et (api.js).
import { parseRecurrence62, nextRun62, labelOf62, osloParts62, osloToUtc62, parseTime45, TZ62 } from '../glimt45/dates.js';
import { isPowerQuestion, zoneOf, ZONES } from '../power-price.js';
import { parseCondition62, CONDITION_RE62 } from './cond.js';
import { zone62 } from './settings.js';
import { glimtSettingsOf } from '../glimt35.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clean = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const pad = (n) => String(n).padStart(2, '0');

const REMIND_RE = /(?<![a-zæøå])(minn(?:e)?\s+meg|påminn\w*|husk(?:e)?\s+meg|husk\s+å|ikke\s+glem)(?![a-zæøå])/;
const FIN_RE = /(?<![a-zæøå])(brukt|forbruk\w*|penger|kvittering\w*|transaksjon\w*|budsjett\w*|finans\w*|utgift\w*|abonnement\w*|lønn|konto\w*|saldo)(?![a-zæøå])/;
// Gjentakelse, tid og sluttdato fjernes fra «hva» når planleggeren ikke ga det (lokal plan).
const WHEN_BITS = [
  /(?<![a-zæøå])(?:den\s+)?\d{1,2}\.\s*(?:(?:dag(?:en)?\s+)?i\s+)?(?:hver|annenhver)\s+måned(?:en)?(?![a-zæøå])/g,
  /(?<![a-zæøå])(?:hver|hvert|alle|annen\s*hver|hver\s+annen|hver\s+andre)\s+(?:eneste\s+)?(?:\d{1,2}\.\s*)?(?:dag|morgen|kveld|ettermiddag|formiddag|natt|uke|helg|hverdag|ukedag|måned|år|time|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:en|er|ene)?(?:\s*(?:og|,)\s*(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:er)?)*(?![a-zæøå])/g,
  /(?<![a-zæøå])(?:den\s+)?\d{1,2}\.\s*(?:(?:dag(?:en)?\s+)?i\s+)?hver\s+måned(?:en)?(?![a-zæøå])/g, /(?<![a-zæøå])(?:den\s+)?(?:første|siste)\s+(?:dag(?:en)?\s+)?i\s+(?:hver\s+)?måned(?:en)?/g,
  /(?<![a-zæøå])(?:kl\.?|klokka|klokken)\s*\d{1,2}(?:[:.]\d{2})?/g, /(?<![\d:.])\d{1,2}:\d{2}(?![\d])/g, /(?<![a-zæøå])(?:på\s+)?(?:hverdager|ukedager|helgene)(?![a-zæøå])/g,
  /(?<![a-zæøå])(?:i|denne|hele)\s+(?:vinter|sommer|høst|vår)(?:en)?(?![a-zæøå])/g, /(?<![a-zæøå])i\s+\d+\s+(?:dager|uker|måneder)(?![a-zæøå])/g, /(?<![a-zæøå])(?:fram|frem)\s+til\s+\S+(?:\s+\S+)?/g,
  /(?<![a-zæøå])(?:daglig|ukentlig|månedlig|årlig)(?![a-zæøå])/g,
];
/** «Minn meg på å betale husleia den 1. hver måned» → «betale husleia». */
export function whatOf62(text, { reminder = false } = {}) {
  let s = ` ${clean(text, 400)} `;
  for (const re of WHEN_BITS) s = s.replace(new RegExp(re.source, 'gi'), ' ');
  s = s.replace(/\s*:\s*/g, ' ').replace(/^\s*(?:kan\s+du\s+)?(?:vær\s+så\s+snill\s+og\s+)?/i, ' ');
  if (reminder) s = s.replace(/^\s*(?:minn(?:e)?\s+meg\s+(?:på|om)\s+(?:å\s+)?|påminn\w*\s+(?:meg\s+)?(?:om\s+)?(?:å\s+)?|husk(?:e)?\s+meg\s+på\s+(?:å\s+)?|husk\s+å\s+|ikke\s+glem\s+(?:å\s+)?)/i, ' ');
  else s = s.replace(/^\s*(?:send\s+meg|gi\s+meg|fortell\s+meg|si|les)\s+/i, ' ');
  return s.replace(/\s+/g, ' ').replace(/^[\s,.:–-]+|[\s,.:!?–-]+$/g, '').trim();
}
const titleOf = (kind, what, cond) => {
  if (cond?.source === 'power') return 'Strømprisvarsel';
  if (cond?.source === 'weather') return 'Værvarsel';
  if (kind === 'power') return 'Strømpriser';
  const w = cap(what.replace(/^(?:å|meg|om)\s+/, ''));
  return w.length > 50 ? `${w.slice(0, 48).replace(/\s+\S*$/, '')} …` : w;
};
const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const dayLabel = (d) => (d === 'tomorrow' ? 'i morgen' : 'i dag');

/** Oppsummeringen Glimt bekrefter («Hver dag kl. 07:00 sender jeg deg strømprisene for i dag (NO1).»). */
export function summaryOf62(t) {
  const L = t.label;
  const p = t.params ?? {};
  if (t.condition?.source === 'power') return `${L} sjekker jeg strømprisene for ${dayLabel(p.day)} (${p.zone}) og sier fra hvis ${t.condition.label.replace(/ i (?:dag|morgen) /, ' ')}.`;
  if (t.condition?.source === 'weather') return `${L} sjekker jeg værmeldingen${p.place ? ` for ${p.place}` : ''} og sier fra hvis ${t.condition.label.replace(/ i (?:dag|morgen)(?= |$)/, '')}.`;
  if (t.kind === 'power') return `${L} sender jeg deg strømprisene for ${dayLabel(p.day)} (${p.zone}) med billigste og dyreste time.`;
  if (t.kind === 'reminder') return `${L} minner jeg deg på å ${t.what.replace(/^å\s+/, '')}.`;
  return `${L} gjør jeg dette og sender deg svaret: «${cap(t.what)}».${t.private ? ' Svaret lages lokalt og vises bare i appen.' : ''}`;
}

/** Bygger regelen på nytt med et annet klokkeslett (og ny DTSTART fra nå). */
function withTime(rule, time, now) {
  const r = { ...rule, time };
  if (r.freq) { const f = nextRun62({ ...r, dtstart: osloParts62(now).date }, now); if (f != null) r.dtstart = osloParts62(f).date; }
  return r;
}
const soon = (now) => { const t = now + 5 * 60_000; const p = osloParts62(t); return { date: p.date, time: `${pad(p.h)}:${pad(Math.ceil(p.m / 5) * 5 % 60)}`, bump: Math.ceil(p.m / 5) * 5 >= 60 }; };

/**
 * Planleggerens args + meldingen → oppgaven. o = {user, text, now}. → {task} | {error} | {ask:{question}}
 * task = {title, what, kind, when:{text, rule, explicitTime, label}, condition, params, private, summary}
 */
export function interpret62(args = {}, { user, text = '', now = Date.now(), allowConditions = true } = {}) {
  const msg = clean(text, 600);
  const aWhen = clean(args.when, 200), aWhat = clean(args.what, 300), aCond = clean(args.condition, 200);
  const today = osloParts62(now).date;
  // Betingelsen (kode): fra planleggerens råtekst eller meldingen.
  let cond = null;
  if (aCond || CONDITION_RE62.test(msg.toLowerCase())) {
    cond = parseCondition62(aCond || msg, { zoneOf }) ?? (aCond ? parseCondition62(msg, { zoneOf }) : null);
    if (cond?.error) return { error: cond.error };
    if (!cond && aCond) return { ask: { question: `Jeg forstod ikke betingelsen «${aCond}». Kan du si det som f.eks. «hvis strømprisen går over 2 kr» eller «hvis temperaturen går under -5»?` } };
  }
  if (cond && !allowConditions) return { error: 'Betingede varsler er slått av (Innstillinger → AI-kontroll → Valg)' };
  // Når (kode). Planleggerens råtekst først; har meldingen en gjentakelse eller et klokkeslett som råteksten mangler, vinner meldingen.
  const opt = { now, today };
  const pa = aWhen ? parseRecurrence62(aWhen, opt) : null;
  const pm = msg ? parseRecurrence62(msg.replace(cond?.text && cond.text !== msg ? cond.text : '\u0000', ' '), opt) : null;
  let p = pa?.ok ? pa : pm;
  if (pa?.ok && pm?.ok && ((!pa.rule.freq && pm.rule.freq) || (!pa.when.explicitTime && pm.when.explicitTime && pm.rule.freq === pa.rule.freq))) p = pm;
  if (!p?.ok) {
    if (!cond) return { ask: { question: (pa ?? pm)?.question ?? 'Når skal jeg gjøre det? (f.eks. «hver morgen kl. 7» eller «hver fredag kl. 16»)' } };
    p = { ok: true, rule: { freq: null, interval: 1, byday: [], bymonthday: [], bymonth: [], dtstart: today, time: '13:30', until: null }, when: { text: aWhen || msg, explicitTime: false } };
  }
  let rule = { ...p.rule };
  let explicitTime = !!p.when.explicitTime;
  // Hva og hvilken type.
  const lowMsg = msg.toLowerCase();
  const reminder = !cond && (REMIND_RE.test(lowMsg) || /^(?:å\s+)?(?:betale|huske|ringe|kjøpe|ta|sende|bestille|levere|vanne|mate)\b/i.test(aWhat)) && !isPowerQuestion(aWhat || msg);
  const power = cond?.source === 'power' || (!reminder && (isPowerQuestion(aWhat) || isPowerQuestion(msg) || /strømpris/i.test(aWhat)));
  const kind = power ? 'power' : reminder ? 'reminder' : 'query';
  let what = aWhat ? whatOf62(aWhat, { reminder }) || aWhat : whatOf62(msg, { reminder });
  if (reminder) what = what.replace(/^(?:minn(?:e)?\s+meg\s+(?:på|om)\s+|å\s+)/i, '').trim();
  if (power && !cond) what = 'strømprisene';
  if (cond) what = cond.source === 'power' ? 'strømprisene' : what || 'værmeldingen';
  if (!what || what.length < 2) return { ask: { question: 'Hva skal jeg gjøre til den tiden?' } };
  if (/^(?:strøm|vær|pris)$/i.test(what) && kind === 'query') what = `${what}et`;
  const params = {};
  if (power) params.zone = cond?.zone ?? zoneOf(msg) ?? zone62(user);
  if (!ZONES[params.zone ?? 'NO1']) params.zone = 'NO1';
  // Betingelsen bestemmer når den sjekkes: morgendagens strømpriser publiseres ca. kl. 13 → sjekk kl. 13:30 (eller med en gang).
  if (cond) {
    const day = cond.day ?? (rule.freq ? 'tomorrow' : 'tomorrow');
    cond.day = day;
    params.day = day;
    if (cond.source === 'weather') params.place = cond.place ?? null;
    const at = cond.source === 'power' ? (day === 'tomorrow' ? '13:30' : '07:00') : day === 'tomorrow' ? '18:00' : '07:00';
    if (!rule.freq) {
      const t0 = osloToUtc62(today, at);
      if (t0 > now) rule = { ...rule, dtstart: today, time: at };
      else { const s = soon(now); rule = { ...rule, dtstart: s.bump ? osloParts62(now + 10 * 60_000).date : s.date, time: s.bump ? `${pad((+s.time.slice(0, 2) + 1) % 24)}:00` : s.time }; }
      explicitTime = false;
    } else if (!explicitTime) rule = withTime(rule, at, now);
    cond.label = cond.source === 'power' ? `${cond.op === '>' ? 'høyeste' : 'laveste'} strømpris ${dayLabel(day)} er ${cond.op === '>' ? 'over' : 'under'} ${cond.threshold.toFixed(2).replace('.', ',')} kr/kWh` : cond.label.replace(/ i (?:dag|morgen)/, ` ${dayLabel(day)}`);
  } else if (power) params.day = /i\s*morgen|morgendagens/i.test(aWhat || msg.replace(/hver\s+morgen/gi, '')) || rule.time >= '14:00' ? 'tomorrow' : 'today';
  const label = labelOf62(rule, today);
  const task = { title: titleOf(kind, what, cond), what, kind, when: { text: aWhen || msg, rule, explicitTime, label }, condition: cond, params, private: FIN_RE.test(`${what} ${lowMsg}`), label };
  task.summary = summaryOf62(task);
  return { task };
}

/* ---------------- Briefene (eksisterende innstilling i glimt35) ---------------- */

export const BRIEF62 = { morning: 'Morgenbrief', day: 'Dagsbrief', evening: 'Kveldsbrief', night: 'Nattbrief' };
const BRIEF_WORD = { morgen: 'morning', dags: 'day', dag: 'day', kvelds: 'evening', kveld: 'evening', natt: 'night' };
/** «morgenbriefen», «kveldsbriefen» → kind | null */
export function briefIn62(text) {
  const m = /(?<![a-zæøå])(morgen|dags|dag|kvelds|kveld|natt)[-\s]?brief(?:en|ene)?(?![a-zæøå])/.exec(String(text ?? '').toLowerCase());
  if (m) return BRIEF_WORD[m[1]];
  return /(?<![a-zæøå])brief(?:en)?(?![a-zæøå])/.test(String(text ?? '').toLowerCase()) ? 'morning' : null;
}
/** Briefene som innebygde faste oppgaver (SERVER62-API.md §1 Builtin). */
export function builtinBriefs62(user, now = Date.now()) {
  let s;
  try { s = glimtSettingsOf(user); } catch { return []; }
  const today = osloParts62(now).date;
  return Object.entries(BRIEF62).filter(([k]) => s.briefs?.[k]).map(([k, title]) => {
    const b = s.briefs[k];
    const on = !!b.on && s.brief !== false;
    let next = null;
    if (on) { const t = osloToUtc62(today, b.at); next = t > now ? t : osloToUtc62(osloParts62(now + 86400_000).date, b.at); }
    return { id: `brief:${k}`, kind: 'brief', title, at: b.at, on: !!b.on, active: on, nextRunAt: next ? new Date(next).toISOString() : null, label: `Hver dag kl. ${b.at}`, editable: ['at', 'on'] };
  });
}
/** Nytt klokkeslett fra «til 06:30», «kl 7». → 'HH:MM' | null */
export function timeOf62(text) {
  const t = String(text ?? '').toLowerCase();
  const tm = parseTime45(/morgen/.test(t) ? `${t} om morgenen` : t);
  if (tm?.start) return tm.assumedPm && /(?<!\d)0\d/.test(tm.raw) ? `${pad(+tm.start.slice(0, 2) - 12)}${tm.start.slice(2)}` : tm.start;
  const m = /(?<![\d.:])til\s+(\d{1,2})(?:[.:](\d{2}))?\s*$/.exec(t);
  return m && +m[1] <= 23 ? `${pad(+m[1])}:${m[2] ?? '00'}` : null;
}
export { TZ62 };
