// Gjenbrukte Intl.DateTimeFormat-objekter.
//
// Å lage en Intl.DateTimeFormat koster rundt 20–50 µs (ICU laster lokale og tidssone), mens format() på et eksisterende
// objekt koster rundt 1 µs. Mange hjelpere laget et nytt objekt per kall (per pakke i Sporing, per hendelse i kalenderen),
// og i profilen sto sporing/shipments.js alene for 257 ms selvtid over 69 forespørsler. dtf(locale, options) gir samme objekt
// tilbake for samme argumenter. Objektene er uforanderlige, så deling er trygt. Ugyldige argumenter (f.eks. ukjent
// tidssone) kaster som før og caches ikke.
const CACHE = new Map();
const MAX = 500;

/** Som new Intl.DateTimeFormat(locale, options), men gjenbrukt. */
export function dtf(locale, options) {
  const key = `${Array.isArray(locale) ? locale.join(',') : locale ?? ''}|${options ? JSON.stringify(options) : ''}`;
  let f = CACHE.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    if (CACHE.size >= MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, f);
  }
  return f;
}
