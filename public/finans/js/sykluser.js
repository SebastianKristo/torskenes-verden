// Abonnementssyklusene slik serveren sender dem (Q40, server/finans/cycles.js): GET /finans/api/subscriptions → cycles: [{id, name, perLabel}],
// og hvert abonnement har cycleName, perLabel, monthly og nextCharge.label. Klienten viser dem som de er og gjør aldri en ukentlig
// pris om til månedlig. Listen under er bare reserve mot eldre servere som ikke sender syklusene.
const RESERVE = [{ id: 'monthly', name: 'Månedlig', perLabel: '/mnd' }, { id: 'yearly', name: 'Årlig', perLabel: '/år' }, { id: 'biennial', name: 'Hvert 2. år', perLabel: '/2 år' }];

/** Syklusene serveren regner med, i visningsrekkefølge (korteste først). d = svaret fra /subscriptions. */
export const sykluser = (d) => (Array.isArray(d?.cycles) && d.cycles.length ? d.cycles : RESERVE);
/** Én syklus ({id, name, perLabel}); ukjent id gir id som navn. */
export const syklus = (d, id) => sykluser(d).find((c) => c.id === id) ?? { id, name: String(id ?? ''), perLabel: '' };
/** Plassen i listen (for sortering etter hvor ofte). */
export const syklusRang = (d, id) => { const i = sykluser(d).findIndex((c) => c.id === id); return i < 0 ? 99 : i; };

/** Ukesyklusene trenger et kjent trekk (startDate); de andre bruker trekkdag og -måned. */
export const erUkesyklus = (id) => id === 'weekly' || id === 'biweekly';
/** Et kjent trekk som ISO-dato fra dag og måned i inneværende år (Oslo). Dagen kappes til månedens lengde.
 *  Serveren regner neste trekk derfra (første trekk når datoen ligger fram i tid). */
export function kjentTrekk(day, mon) {
  const y = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric' }).format(new Date());
  const m = Math.min(12, Math.max(1, +mon || 1)), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), d = Math.min(last, Math.max(1, +day || 1));
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Inneværende måned (1–12) i Oslo. */
export const osloMåned = () => +new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', month: 'numeric' }).format(new Date());
