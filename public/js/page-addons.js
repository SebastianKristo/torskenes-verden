// Sidetillegg på web: felles ting som kobles på ved oppstart, og tillegg per side som lastes ved behov etter at siden er tegnet.
// Kalles fra app.js (initPageAddons ved oppstart, afterPageAddons etter hver side). Slått sammen fra web44.js, web45.js og web46.js.
// - Oppstart: Lys · Mørk · Følg systemet (mode44.js), felles GlimtInput med Tab og forslag (glimt-input44.js), «Logg inn som»
//   (as44.js), den felles Glimt-agenten (glimt-agent45.js) og Innstillinger → Nyheter (settings46.js).
// - Per side: Gjøremål (tasks44.js), Kalender (kal44.js), Media (media44.js, media45.js), Vær (weather45.js), Familie (family45.js)
//   og Kart (kart46.js, skallet tegnes med en gang og kartet monteres etterpå).
// - Frem/tilbake i nettleseren: Media bruker pushState (media44.js); Innstillinger og Kalender hadde det fra før.
import { initMode } from './mode44.js';
import { initGlimtInput } from './glimt-input44.js';
import { initAs, asState } from './as44.js';
import { initAgent45 } from './glimt-agent45.js';
import { initSettings46 } from './settings46.js';
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
  huskeliste: [[() => import('./tasks44.js'), 'after44']],
  gjoremal: [[() => import('./tasks44.js'), 'after44']],
  kalender: [[() => import('./kal44.js'), 'after44']],
  media: [[() => import('./media44.js'), 'after44'], [() => import('./media45.js'), 'after45']],
  vaer: [[() => import('./weather45.js'), 'after45']],
  familie: [[() => import('./family45.js'), 'after45']],
  kart: [[() => import('./kart46.js').then(mountKart), 'after46']],
};

/** Etter at en side er tegnet. */
export function afterPageAddons(route, view) {
  for (const [load, hook] of ADDONS[route] ?? []) load().then((m) => m[hook]?.(view)).catch((e) => console.warn('sidetillegg', route, e));
}
