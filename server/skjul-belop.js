// Personvernmodus («Skjul beløp», F 12 / L10) for tekster serveren lager selv: push-varsler og ferdige etiketter i widgetdata.
// Appene skjuler beløpene de formaterer selv (n0/n2 med Privacy), men en tekst som «Deretter 149 kr/mnd» kommer ferdig fra
// serveren og ble vist som den var. Valget er per bruker i /api/me/notify (hideAmounts); widgetene godtar også ?hideAmounts=1
// fra en enhet der «Skjul beløp» er på.
export const MASK = '•••';

// Et tall med eller uten tusenskille (mellomrom, hardt/smalt mellomrom eller punktum) og øre (komma).
const NUM = String.raw`[−\-+]?\d{1,3}(?:[   .]\d{3})+(?:,\d{1,2})?|[−\-+]?\d+(?:[,.]\d{1,2})?`;
const AFTER = new RegExp(`(?:${NUM})(?=\\s?(?:kroner\\b|kr\\b|NOK\\b|,-))`, 'gi'); // «149 kr», «1 234,50 kroner», «349,-»
const BEFORE = new RegExp(`(\\b(?:kr|NOK)\\.?\\s?)(?:${NUM})`, 'gi'); // «kr 2 499», «NOK 99,00»

/** Bytter beløp i kroner med «•••». Tall uten valuta (dager, klokkeslett, Kp) står. */
export function maskAmounts(text) {
  if (text == null) return '';
  return String(text).replace(BEFORE, `$1${MASK}`).replace(AFTER, MASK);
}

/** Skal beløpene skjules for denne forespørselen? ?hideAmounts=1 (enheten) eller brukerens valg. */
export const hideAmountsFor = (c, userHide) => c.req.query('hideAmounts') === '1' || c.req.query('hideAmounts') === 'true' || !!userHide;

/** maskAmounts på alle tekstene i et svar (lister og objekter), for widgetdata som har ferdige setninger med beløp i. Tall står:
 *  appene skjuler dem selv når hideAmounts er på. */
export const maskDeep = (v) => (typeof v === 'string' ? maskAmounts(v) : Array.isArray(v) ? v.map(maskDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskDeep(x)])) : v);
