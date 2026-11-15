// Reise på web (Fase 6, Q8): kollektivmodulen med fanene Avganger (#/reise) og Kart (#/reise/kart). Begge er de eksisterende
// komponentene: avgangene fra Oversikt (dash.js renderTrips, data fra GET /api/ruter som app.js henter mens siden vises) og
// kartet (kart.js, holdeplasser, sanntid og soner). #/kart, #/avganger og #/ruter videresendes hit (aliasene i modullisten).
// Strekningene settes opp under Innstillinger → Moduler → Reise.
import { store } from './store.js';
import { renderTrips } from './dash.js';
import { subtabs } from './moduler.js';
import { is2c } from './hltheme.js';

/** Avganger: strekningene fra brukerens oppsett med sanntid (samme beholder som på Oversikt: p-trips i Papir, trips i Glass). */
export function render() {
  const none = store.data.ruter && !store.data.ruter.trips?.length;
  return `<div class="rs">${subtabs('reise', 'avganger')}
    <section class="rs-sec" aria-label="Avganger">
      ${none ? '<p class="rs-empty">Ingen strekninger ennå. Legg dem til under <a href="#/innstillinger/reise">Innstillinger → Reise</a>.</p>' : `<div class="${is2c() ? 'p-trips' : 'trips'}" id="trips">${renderTrips()}</div>`}
    </section></div>`;
}

/** Fanelinja over kartet (#/reise/kart), så man kommer tilbake til avgangene. */
export const kartTabs = () => subtabs('reise', 'kart');
