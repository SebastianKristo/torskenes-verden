// Prompt 44 (WEB44): kobler på det nye på web. Kalles fra app.js (initWeb44 ved oppstart, after44 etter hver side).
// - Lys · Mørk · Følg systemet (mode44.js), felles GlimtInput med Tab og forslag (glimt-input44.js),
//   «Logg inn som» (as44.js), og sidevise tillegg: Gjøremål (tasks44.js), Kalender (kal44.js), Media (media44.js).
// - Frem/tilbake i nettleseren: Media bruker pushState (media44.js); Innstillinger og Kalender hadde det fra før.
import { initMode } from './mode44.js';
import { initGlimtInput } from './glimt-input44.js';
import { initAs, asState } from './as44.js';
import { store } from './store.js';

export function initWeb44(layout) {
  initMode(layout);
  initGlimtInput();
  initAs();
  try { if (!asState() && store.me?.me) localStorage.setItem('hl_me_name', JSON.stringify(store.me.me.name || store.me.me.username || '')); } catch { /* */ }
}

const LAZY = {
  huskeliste: () => import('./tasks44.js'), gjoremal: () => import('./tasks44.js'),
  kalender: () => import('./kal44.js'),
  media: () => import('./media44.js'),
};
/** Etter at en side er tegnet. */
export function after44(route, view) {
  const f = LAZY[route];
  if (f) f().then((m) => m.after44?.(view)).catch((e) => console.warn('web44', route, e));
}
