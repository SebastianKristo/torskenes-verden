// «I dag» og klokka i Oslo: den ene hjelperen serveren bruker for husstandsdata (BESLUTNINGER.md Q20, F-logikk L3).
//
// Husstanden er i Oslo, så kalender, frister, trekk og bursdager regnes i Europe/Oslo uansett hvilken tidssone prosessen har
// (Dockerfile setter TZ=Europe/Oslo, men dev og CI gjør det ikke alltid). `toISOString().slice(0, 10)` gir UTC-datoen og er feil
// mellom 00 og 01 (vinter) eller 02 (sommer). Bruk osloDate()/today() for «i dag» og lokale datoer.
// UTC er riktig bare for lagringsformat og tidsstempler (ISO 8601 med Z); der beholdes toISOString().
//
// Fasit: shared/testvektorer/idag.json (test/testvektorer.test.js).

export const ZONE = 'Europe/Oslo';

const pad = (n) => String(n).padStart(2, '0');
// Gjenbrukes: å lage Intl.DateTimeFormat er dyrt.
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toDate = (t) => (t instanceof Date ? t : new Date(t ?? Date.now()));

/** Klokka i Oslo for et tidspunkt: {year, month (1–12), day, hour, minute, second, weekday (0 = søndag), date:'YYYY-MM-DD', minutes}. */
export function osloParts(t = Date.now()) {
  const d = toDate(t);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const x of FMT.formatToParts(d)) p[x.type] = x.value;
  const year = +p.year, month = +p.month, day = +p.day, hour = +p.hour % 24, minute = +p.minute, second = +p.second;
  return { year, month, day, hour, minute, second, weekday: WD[p.weekday], date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + minute };
}

/** Oslo-datoen (YYYY-MM-DD) for et tidspunkt (Date, ms eller ISO-streng). Ugyldig tidspunkt gir null. */
export function osloDate(t = Date.now()) {
  return osloParts(t)?.date ?? null;
}

/** «I dag» i Oslo (YYYY-MM-DD). */
export const today = (now = Date.now()) => osloDate(now);

/** Minutter etter midnatt i Oslo nå (0–1439). */
export const nowMinutes = (now = Date.now()) => osloParts(now).minutes;

/** Oslo-måneden (YYYY-MM) for et tidspunkt. */
export const osloMonth = (t = Date.now()) => osloDate(t)?.slice(0, 7) ?? null;

/* ---------------- Kalenderdatoer (YYYY-MM-DD, uten tidssone) ---------------- */

const D = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(D(s)) === s;
export const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
/** Antall dager fra a til b (b − a). */
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
/** Ukedag (0 = søndag) for en kalenderdato. */
export const weekdayOf = (s) => D(s).getUTCDay();
/** Mandagen i ISO-uka datoen ligger i. */
export const mondayOf = (s) => addDays(s, -((weekdayOf(s) + 6) % 7));
/** Siste dag i måneden (month 1–12). */
export const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** YYYY-MM-DD for år, måned (1–12) og dag, der dagen kuttes til siste dag i måneden (31.1 → 28.2). Måneden kan gå over året. */
export function clampDate(year, month, day) {
  const y = year + Math.floor((month - 1) / 12), m = (((month - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, lastDayOfMonth(y, m)))}`;
}

/** UTC-tidspunktet for et klokkeslett i Oslo (dato YYYY-MM-DD, «HH:MM»). Tar hensyn til sommertid. */
export function osloToUtc(date, hm = '00:00') {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = String(hm).split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // To runder: forskyvningen ved gjetningen, så ved resultatet (riktig også rett etter bytte av sommertid).
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = osloParts(t);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    t = guess - (asUtc - t);
  }
  return new Date(t);
}
