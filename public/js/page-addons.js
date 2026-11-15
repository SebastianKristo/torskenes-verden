// Sidetillegg på web: felles ting som kobles på ved oppstart, og tillegg per side som lastes ved behov etter at siden er tegnet.
// Kalles fra app.js (initPageAddons ved oppstart, afterPageAddons etter hver side). Slått sammen fra web44.js, web45.js og web46.js.
// - Oppstart: Lys · Mørk · Følg systemet (mode.js), felles GlimtInput med Tab og forslag (glimt-input.js), «Logg inn som»
//   (logg-inn-som.js), den felles Glimt-agenten (glimt-agent.js) og Innstillinger → Nyheter (settings-nyheter.js).
// - Per side: Gjøremål (tasks-deloppgaver.js), Kalender (kalender-deltakere.js), Media (media-slett.js), Vær (weather-posisjon.js), Familie (family-soner.js)
//   og Kart (kart.js, skallet tegnes med en gang og kartet monteres etterpå).
// - Frem/tilbake i nettleseren: Media bruker pushState (media44.js); Innstillinger og Kalender hadde det fra før.
import { initMode } from './mode.js';
import { initGlimtInput } from './glimt-input.js';
import { initAs, asState } from './logg-inn-som.js';
import { initAgent45 } from './glimt-agent.js';
import { initSettings46 } from './settings-nyheter.js';
import { store } from './store.js';

export function initPageAddons(layout) {
  initMode(layout);
  initGlimtInput();
  initAs();
  try { if (!asState() && store.me?.me) localStorage.setItem('hl_me_name', JSON.stringify(store.me.me.name || store.me.me.username || '')); } catch { /* */ }
  initAgent45();
  initSettings46();
}

/** Kart-siden: skallet tegnes med en gang, kartet monteres i afterPageAddons. */
export function renderKart() {
  return '<section class="k46" id="k46" aria-label="Kart" aria-busy="true"></section>';
}

const mountKart = (m) => ({ after46: (view) => { const h = view.querySelector('#k46'); if (h) { h.outerHTML = m.render(); m.mount(view); } } });

/** Rute → tillegg i samme rekkefølge som før: [last modulen, navnet på kroken i modulen]. */
const ADDONS = {
  gjoremal: [[() => import('./tasks-deloppgaver.js'), 'after44']],
  kalender: [[() => import('./kalender-deltakere.js'), 'after44']],
  media: [[() => import('./media-slett.js'), 'after45']],
  vaer: [[() => import('./weather-posisjon.js'), 'after45']],
  familie: [[() => import('./family-soner.js'), 'after45']],
  kart: [[() => import('./kart.js').then(mountKart), 'after46']],
};

/** Etter at en side er tegnet. */
export function afterPageAddons(route, view) {
  for (const [load, hook] of ADDONS[route] ?? []) load().then((m) => m[hook]?.(view)).catch((e) => console.warn('sidetillegg', route, e));
}
