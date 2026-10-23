// Prompt 46 (WEB46): kobler på det nye på web. Kalles fra app.js (initWeb46 ved oppstart, after46 etter hver side).
// - Kart (kart46.js): eget punkt i menyen etter Familie (#/kart), lastes ved behov.
// - Nyheter: innstillingene ligger i Innstillinger → Nyheter (settings46.js), sammendrag per kategori og «For deg» i news.js.
// - Bakgrunn fra delt Google Photos-album (bg46.js), Sporing-innstillinger, Subscription-logg og Gjøremål er endret i sine moduler.
import { initSettings46 } from './settings46.js';

export function initWeb46() {
  initSettings46();
}

/** Kart-siden: skallet tegnes med en gang, kartet monteres i after46. */
export function renderKart46() {
  return '<section class="k46" id="k46" aria-label="Kart" aria-busy="true"></section>';
}

const LAZY = {
  kart: () => import('./kart46.js').then((m) => ({ after46: (view) => { const h = view.querySelector('#k46'); if (h) { h.outerHTML = m.render(); m.mount(view); } } })),
};
/** Etter at en side er tegnet. */
export function after46(route, view) {
  const f = LAZY[route];
  if (f) f().then((m) => m.after46?.(view)).catch((e) => console.warn('web46', route, e));
}
