// Sykluser for abonnementer og faste trekk: den ene tabellen og den ene regelen for neste trekk og omregning per måned
// (BESLUTNINGER.md Q40, F-logikk L2 og §2.5). Fasit: shared/testvektorer/abonnement.json.
//
// Trekkene er anker + k × syklus (k = 0, 1, 2 …). Neste trekk er det første som er lik eller senere enn i dag; ankeret er et kjent
// trekk (første trekk, eller lagret neste trekk), så serien starter der. Grafer for et helt år projiserer også bakover (chargesBetween).
// Månedssykluser: dagen er alltid trekkdagen, men aldri etter siste dag i måneden (31.1 → 28.2 → 31.3, dagen glir ikke).
// Ukesykluser: anker + 7 eller 14 dager.
import { clampDate, addDays, daysBetween, isIsoDate, today as osloToday } from '../dates/oslo.js';

/** Måneder per trekk for månedssyklusene. */
export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12, biennial: 24 };
/** Dager per trekk for ukesyklusene. */
export const CYCLE_DAYS = { weekly: 7, biweekly: 14 };
/** Alle sykluser i visningsrekkefølge. */
export const CYCLES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'halfyearly', 'yearly', 'biennial'];
/** Trekk per år. Uker: 52 og 26 (samme som faste utgifter har brukt), ikke 365/7. */
export const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, halfyearly: 2, yearly: 1, biennial: 0.5 };

export const CYCLE_NAME = { weekly: 'Ukentlig', biweekly: 'Hver 2. uke', monthly: 'Månedlig', quarterly: 'Kvartalsvis', halfyearly: 'Halvårlig', yearly: 'Årlig', biennial: 'Hvert 2. år' };
export const PER_LABEL = { weekly: '/uke', biweekly: '/2 uker', monthly: '/mnd', quarterly: '/kvartal', halfyearly: '/halvår', yearly: '/år', biennial: '/2 år' };
export const PER_TEXT = { weekly: 'per uke', biweekly: 'per 2. uke', monthly: 'per mnd', quarterly: 'per kvartal', halfyearly: 'per halvår', yearly: 'per år', biennial: 'per 2 år' };
/** «Hver måned den 15.», «Hvert kvartal» … (kalenderen). */
export const INTERVAL_TEXT = { weekly: 'Hver uke', biweekly: 'Hver 2. uke', monthly: 'Hver måned', quarterly: 'Hvert kvartal', halfyearly: 'Hvert halvår', yearly: 'Hvert år', biennial: 'Annethvert år' };
export const THEN_TEXT ={ weekly: 'deretter hver uke', biweekly: 'deretter hver 2. uke', monthly: 'deretter hver måned', quarterly: 'deretter hvert kvartal', halfyearly: 'deretter hvert halvår', yearly: 'deretter hvert år', biennial: 'deretter hvert 2. år' };

const ALIAS = {
  monthly: 'monthly', month: 'monthly', mnd: 'monthly', 'måned': 'monthly', 'månedlig': 'monthly', 'månedleg': 'monthly',
  quarterly: 'quarterly', quarter: 'quarterly', kvartal: 'quarterly', kvartalsvis: 'quarterly', kvartalvis: 'quarterly',
  halfyearly: 'halfyearly', halfyear: 'halfyearly', semiannual: 'halfyearly', 'halvår': 'halfyearly', 'halvårlig': 'halfyearly', 'halvårig': 'halfyearly',
  yearly: 'yearly', year: 'yearly', annual: 'yearly', annually: 'yearly', 'år': 'yearly', 'årlig': 'yearly',
  biennial: 'biennial', '2år': 'biennial', '2 år': 'biennial', 'annethvert år': 'biennial', 'hvert 2. år': 'biennial',
  weekly: 'weekly', week: 'weekly', uke: 'weekly', ukentlig: 'weekly',
  biweekly: 'biweekly', fortnightly: 'biweekly', '2uker': 'biweekly', '2 uker': 'biweekly', 'annenhver uke': 'biweekly', 'hver 2. uke': 'biweekly',
};
/** Syklus fra det klienten sender (engelsk nøkkel eller norsk ord), eller null. */
export const cycleIn = (v) => ALIAS[String(v ?? '').trim().toLowerCase()] ?? null;
export const isCycle = (v) => Object.hasOwn(PER_YEAR, v);

/** Beløp per måned for et beløp per trekk (samme enhet inn og ut). Ukjent syklus regnes som månedlig. */
export const perMonth = (amount, cycle) => (amount * (PER_YEAR[cycle] ?? 12)) / 12;
/** Beløp per år for et beløp per trekk. */
export const perYear = (amount, cycle) => amount * (PER_YEAR[cycle] ?? 12);
/** SQL-uttrykk for beløp per måned (kolonnene price og cycle), så SQL-summer bruker samme tabell. */
export const perMonthSql = (price = 'price', cycle = 'cycle') => `(${price} * CASE ${cycle} ${Object.entries(PER_YEAR).map(([k, n]) => `WHEN '${k}' THEN ${n}`).join(' ')} ELSE 12 END / 12.0)`;

/**
 * Serien for et abonnement: {cycle, anchor:'YYYY-MM-DD' (et kjent trekk), day (trekkdag 1–31 for månedssykluser; standard ankerdagen)}.
 * Fra en lagret rad: seriesOf({cycle, next_date, charge_day}).
 */
export function seriesOf(s) {
  const anchor = s?.anchor ?? s?.next_date ?? null;
  if (!isIsoDate(anchor)) return null;
  const cycle = isCycle(s.cycle) ? s.cycle : 'monthly';
  const day = CYCLE_DAYS[cycle] ? null : (s.day ?? s.charge_day ?? +anchor.slice(8, 10));
  return { cycle, anchor, day };
}

/** Trekk nummer k i serien (k kan være negativ). */
export function chargeAt(series, k) {
  const { cycle, anchor, day } = series;
  if (CYCLE_DAYS[cycle]) return addDays(anchor, k * CYCLE_DAYS[cycle]);
  return clampDate(+anchor.slice(0, 4), +anchor.slice(5, 7) + k * CYCLE_MONTHS[cycle], day);
}

/** Første k der trekket er ≥ date. */
function firstIndexFrom(series, date) {
  const { cycle, anchor } = series;
  let k;
  if (CYCLE_DAYS[cycle]) k = Math.ceil(daysBetween(anchor, date) / CYCLE_DAYS[cycle]);
  else k = Math.floor(((+date.slice(0, 4) - +anchor.slice(0, 4)) * 12 + (+date.slice(5, 7) - +anchor.slice(5, 7))) / CYCLE_MONTHS[cycle]);
  while (chargeAt(series, k) < date) k++;
  while (chargeAt(series, k - 1) >= date) k--;
  return k;
}

const asSeries = (s) => (s?.cycle && s?.anchor && 'day' in s ? s : seriesOf(s));

/** Neste trekk (≥ i dag, Oslo, og ≥ ankeret) for en serie eller lagret rad. Et trekk i dag er neste trekk. */
export function nextCharge(s, today = osloToday()) {
  const series = asSeries(s);
  if (!series) return null;
  return chargeAt(series, Math.max(0, firstIndexFrom(series, today)));
}

/**
 * Alle trekk i [from, to] (inklusiv). backward: true tar også med trekk før ankeret (projisert bakover), som årsgrafen gjør;
 * ellers bare ankeret og senere (prognoser og kalender).
 */
export function chargesBetween(s, from, to, { backward = false } = {}) {
  const series = asSeries(s);
  if (!series || from > to) return [];
  const out = [];
  let k = firstIndexFrom(series, from);
  if (!backward) k = Math.max(0, k);
  for (; out.length < 400; k++) { const d = chargeAt(series, k); if (d > to) break; out.push(d); }
  return out;
}

/**
 * Serien for et nytt eller endret abonnement ut fra det klienten sender: {cycle, day?, month?, startDate?}.
 *  - startDate (et kjent trekk, f.eks. første trekk) bestemmer fasen; day overstyrer dagen for månedssykluser.
 *  - Ellers trekkdag + trekkmåned (måned bare for sykluser på 3 måneder eller mer; uten måned: inneværende måned).
 *  - Ukesykluser trenger startDate (eller et lagret trekk).
 * → serie eller null (for lite å regne fra).
 */
export function seriesFrom({ cycle, day = null, month = null, startDate = null, fallbackAnchor = null }, today = osloToday()) {
  const c = isCycle(cycle) ? cycle : 'monthly';
  if (isIsoDate(startDate)) return seriesOf({ cycle: c, anchor: startDate, day: CYCLE_DAYS[c] ? null : (day ?? +startDate.slice(8, 10)) });
  if (CYCLE_DAYS[c]) return isIsoDate(fallbackAnchor) ? seriesOf({ cycle: c, anchor: fallbackAnchor }) : null;
  if (!day) return isIsoDate(fallbackAnchor) ? seriesOf({ cycle: c, anchor: fallbackAnchor }) : null;
  const ty = +today.slice(0, 4), tm = +today.slice(5, 7);
  let m = c === 'monthly' ? tm : month;
  if (!m) m = isIsoDate(fallbackAnchor) ? +fallbackAnchor.slice(5, 7) : tm;
  // Sykluser som går opp i et år: ankeret to år tilbake gir riktig fase. Hvert 2. år: fasen er ukjent uten startdato, så neste gang
  // datoen kommer (i år eller neste år), som før.
  if (c !== 'biennial') return seriesOf({ cycle: c, anchor: clampDate(ty - 2, m, day), day });
  const thisYear = clampDate(ty, m, day);
  return seriesOf({ cycle: c, anchor: thisYear >= today ? thisYear : clampDate(ty + 1, m, day), day });
}
