// Prompt 64 (prompt 49 del 7, D7WEB): Innstillinger → Kvalitet (/#/innstillinger/kvalitet, lenkene fra pushene i SERVER64-API.md §4:
// …/kvalitet/run/<id> og …/kvalitet/uke/<uke>). Siden tegnes av quality64.js (mountQuality64) i en [data-mount-host]-plass.
// Selvstendig: flyttes fanen ved omorganiseringen av Innstillinger, er det bare TABS64/ALIAS64/kvalitetView64 som flyttes.
import { TAB_IC } from './settings-search.js';
import { mountQuality64 } from './quality64.js';

const P64 = 'M4 19h16M6 16V10M10 16V6M14 16v-4M18 16V8';
Object.assign(TAB_IC, { kvalitet: ['#2f7d6b', P64] });
/** [id, navn, undertekst, seksjon, ikon] – settes inn i TABS i settings.js (under Glimt, etter Faste oppgaver). */
export const TABS64 = [['kvalitet', 'Kvalitet', 'Ukerapport for Glimt og nattlige eval-kjøringer: bestått, svartid og regresjoner.', 'Glimt', P64]];
export const ALIAS64 = { quality: 'kvalitet', eval: 'kvalitet', ukerapport: 'kvalitet', uke: 'kvalitet', regresjon: 'kvalitet' };

export function kvalitetView64(H) {
  const { group, row } = H;
  return {
    html: '<div class="q64-host" data-mount-host></div>',
    mount: (slot) => mountQuality64(slot),
    search: [group('Kvalitet', [
      row({ t: 'Ukerapport', s: 'Forespørsler, løst på første forsøk, rettelser, nye oppskrifter, hurtigvei og median svartid per uke', go: 'kvalitet', btn: 'Åpne', k: 'ukerapport uke statistikk forespørsler første forsøk rettelser oppskrifter hurtigvei svartid median kvalitet' }),
      row({ t: 'Nattlig eval', s: 'Eval-testene kjøres hver natt kl. 02 – push når noe grønt blir rødt (admin)', go: 'kvalitet', btn: 'Åpne', k: 'nattlig eval test regresjon rød grønn bestått p50 p90 rapport kjør nå kvalitet' }),
    ])],
  };
}
