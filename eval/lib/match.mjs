// Små hjelpere for sjekkene i casene.
export const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export const plain = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/ | /g, ' ');
/** Nevner teksten datoen (YYYY-MM-DD) på en vanlig norsk måte? «3. nov», «3. november», «03.11», «3/11», «tirsdag 3.» */
export function mentionsDate(text, iso) {
  const t = plain(text).toLowerCase();
  const [y, m, d] = iso.split('-').map(Number);
  const mon = MON[m - 1];
  return new RegExp(`(?<!\\d)0?${d}\\.?\\s*(${mon}|${mon.slice(0, 3)}\\.?)(?![a-zæøå])`).test(t)
    || new RegExp(`(?<!\\d)0?${d}[./]0?${m}(?![\\d])`).test(t) || t.includes(iso);
}
/** Nevner teksten klokkeslettet («14:00», «14.00», «kl. 14», «klokka 14»)? */
export function mentionsTime(text, hhmm) {
  const t = plain(text).toLowerCase();
  const [hh, mm] = hhmm.split(':');
  const h = String(+hh);
  if (new RegExp(`(?<!\\d)0?${h}[:.]${mm}(?!\\d)`).test(t)) return true;
  return mm === '00' && new RegExp(`(kl\\.?|klokka|klokken)\\s*0?${h}(?![\\d:.])`).test(t);
}
/** Beløpet (kroner) i teksten, med norske skrivemåter: «2 191,10», «2191.1», «2 191 kr». Avrundet til hele kroner godtas. */
export function mentionsAmount(text, n) {
  const t = plain(text).replace(/(\d)[ .](?=\d{3}(?!\d))/g, '$1'); // tusenskille bort
  const whole = Math.trunc(n), frac = Math.round((n - whole) * 100);
  for (const m of t.matchAll(/(?<![\d,.])(\d+)(?:[,.](\d{1,2}))?(?![\d])/g)) {
    const w = +m[1], f = m[2] ? +m[2].padEnd(2, '0') : null;
    if (w === whole && (f === null || f === frac)) return true;
    if (f === null && w === Math.round(n)) return true;
  }
  return false;
}
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9æøå]+/g, ' ').trim();
/** Kort oppsummering av hva motoren gjorde (for feilgrunnen). */
export function did(step) {
  if (!step) return 'ingen respons';
  const acts = (step.actions ?? []).map((a) => `${a.tool}${a.status && a.status !== 'done' ? `(${a.status})` : ''}${a.args && Object.keys(a.args).length ? ` ${JSON.stringify(a.args).slice(0, 140)}` : ''}`).join('; ') || 'ingen verktøy';
  return `motor=${step.engine ?? '–'} modell=${step.model ?? '–'} intent=${step.intent ?? '–'}${step.legacyIntent ? ` gammel-vei=${step.legacyIntent}` : ''} · ${acts} · svar «${plain(step.reply ?? step.error ?? '').slice(0, 160)}»`;
}
export const newEvents = (before, after) => after.filter((e) => !before.some((b) => b.id === e.id));
