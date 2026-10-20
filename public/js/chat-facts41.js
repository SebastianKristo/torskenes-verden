// Prompt 41: små faktakort under Glimt-svaret i Chat (meta.facts fra /api/chat/send, se server/chat-tools41.js).
// «Vær · New York · neste time · vind 6 m/s, kast 9 m/s · Open-Meteo». Papir-stil: tynn linje, mono-etikett, kompakt.
import { esc } from './util.js';

const TOOL = { weather: 'Vær', time: 'Tid', sun: 'Sol' };
/** Én linje som tekst (også brukt til skjermleser og Kopier). */
export const factLine41 = (f) => [TOOL[f.tool] ?? f.tool, f.place, f.when, f.label, f.source].filter(Boolean).join(' · ');
/** Kortene som HTML (tom streng uten fakta). */
export function factsHtml41(facts) {
  const list = Array.isArray(facts) ? facts.filter((f) => f && f.label) : [];
  if (!list.length) return '';
  return `<div class="ch41-facts" role="list" aria-label="Fakta Glimt hentet">${list.map((f) => `<div class="ch41-fact${f.error ? ' err' : ''}" role="listitem" title="${esc(factLine41(f))}">
    <span class="ch41-fh" data-no-i18n>${esc([TOOL[f.tool] ?? f.tool, f.place, f.error ? '' : f.when].filter(Boolean).join(' · '))}</span>
    <span class="ch41-fv" data-no-i18n>${esc(f.label)}</span>${f.source ? `<span class="ch41-fs" data-no-i18n>${esc(f.source)}${f.window && !f.error ? ` · ${esc(f.window)}` : ''}</span>` : ''}</div>`).join('')}</div>`;
}
/** Brukte-pillene uten dem kortene allerede viser. */
export const usedWithoutFacts41 = (used, facts) => (Array.isArray(facts) && facts.length ? (used ?? []).filter((u) => !/^(Vær|Tid|Sol) · /.test(u)) : used ?? []);
