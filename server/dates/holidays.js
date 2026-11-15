// Norske helligdager og merkedager: den ene lista (BESLUTNINGER.md Q18, F-logikk §2.7). Kalenderen («Helligdager») og
// GET /api/dates/holidays bruker denne; appene viser det serveren sender og bruker sin innebygde liste bare uten nett.
//
//   type 'helligdag' = offentlig høytidsdag (fri = true). type 'merkedag' = ikke fridag (Palmesøndag, Julaften, Nyttårsaften).
import { addDays } from './oslo.js';

const pad = (n) => String(n).padStart(2, '0');

/** Første påskedag (gregoriansk, «anonym» algoritme). → 'YYYY-MM-DD' */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

/** Årets helligdager og merkedager, sortert. → [{date, name, type:'helligdag'|'merkedag', fri}] */
export function holidaysOfYear(y) {
  const E = easter(y);
  const fri = (date, name) => ({ date, name, type: 'helligdag', fri: true });
  const merke = (date, name) => ({ date, name, type: 'merkedag', fri: false });
  return [
    fri(`${y}-01-01`, 'Første nyttårsdag'), merke(addDays(E, -7), 'Palmesøndag'), fri(addDays(E, -3), 'Skjærtorsdag'), fri(addDays(E, -2), 'Langfredag'),
    fri(E, 'Første påskedag'), fri(addDays(E, 1), 'Andre påskedag'), fri(`${y}-05-01`, 'Arbeidernes dag'), fri(`${y}-05-17`, 'Grunnlovsdag'),
    fri(addDays(E, 39), 'Kristi himmelfartsdag'), fri(addDays(E, 49), 'Første pinsedag'), fri(addDays(E, 50), 'Andre pinsedag'),
    merke(`${y}-12-24`, 'Julaften'), fri(`${y}-12-25`, 'Første juledag'), fri(`${y}-12-26`, 'Andre juledag'), merke(`${y}-12-31`, 'Nyttårsaften'),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Helligdager og merkedager i [from, to] (YYYY-MM-DD, inklusiv). Maks 10 år. */
export function holidaysBetween(from, to) {
  const y0 = +from.slice(0, 4), y1 = Math.min(+to.slice(0, 4), y0 + 9);
  const out = [];
  for (let y = y0; y <= y1; y++) for (const h of holidaysOfYear(y)) if (h.date >= from && h.date <= to) out.push(h);
  return out;
}

/** Bare de offentlige høytidsdagene (fridager), som før: [{date, name}]. */
export const publicHolidaysOfYear = (y) => holidaysOfYear(y).filter((h) => h.fri).map(({ date, name }) => ({ date, name }));
