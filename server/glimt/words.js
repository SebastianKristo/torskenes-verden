// Prompt 47 (GLIMT47): ordgrense-søk for kalender, steder og minne. Treffer HELE ORD, case-insensitivt og æøå-sikkert, så «Oslo»
// ikke treffer «OsloMet» og «Nina» ikke treffer «Ninaveien».
//
// Norsk har sammensatte ord og bøyning: «frisør» skal treffe «Frisørtime» og «frisøren». Derfor godtas termen også med en kort
// liste kjente endelser (bøyning + «time/timen/timer/avtale»). «OsloMet» (= oslo + met) står ikke på lista og treffer ikke.
const fold = (s) => String(s ?? '').normalize('NFC').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const SUFFIX47 = ['en', 'et', 'a', 'er', 'ene', 'ne', 'e', 'n', 's', 'time', 'timen', 'timer', 'avtale', 'avtalen'];
const cache = new Map();
function reOf(term, { suffix = true } = {}) {
  const k = `${suffix ? 1 : 0}|${term}`;
  if (cache.has(k)) return cache.get(k);
  const t = fold(term).trim().replace(/\s+/g, ' ');
  // Mellomrom i termen («colosseum kino») godtar også bindestrek/flere mellomrom; «9-1-1» ≈ «9 1 1» ≈ «911» håndteres i media.
  const body = t.split(' ').map(esc).join('[\\s\\-]+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${suffix ? `(?:${SUFFIX47.join('|')})?` : ''}(?![\\p{L}\\p{N}])`, 'u');
  if (cache.size > 500) cache.clear();
  cache.set(k, re);
  return re;
}
/** Står termen som et helt ord (evt. med kjent norsk endelse) i teksten? */
export function hasWord47(hay, term, opts) {
  const t = fold(term).trim();
  if (t.length < 2) return false;
  return reOf(t, opts).test(fold(hay));
}
/** Treffer minst én av termene (OR)? → den første termen som traff, eller null. */
export function anyWord47(hay, terms, opts) {
  for (const t of terms ?? []) if (hasWord47(hay, t, opts)) return t;
  return null;
}
/** Ordene i en tekst (små bokstaver, bokstaver/tall). */
export const words47 = (s) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** Levenshtein med tak (små stavefeil i navn: «Ninna» ≈ «Nina»). */
export function lev47(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
