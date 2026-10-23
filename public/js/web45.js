// Prompt 45 (WEB45): kobler på det nye på web. Kalles fra app.js (initWeb45 ved oppstart, after45 etter hver side).
// Sidevise tillegg lastes ved behov: Media (media45.js), Vær (weather45.js), Familie (family45.js).
// Studie, Gjøremål, Kalender, Logger, Domener og AI-kontroll er endret direkte i sine moduler (merket «Prompt 45»).
// Glimt-felt bruker den felles agenten (glimt-agent45.js). Innstillinger-sidene ligger i settings45.js.
import { initAgent45 } from './glimt-agent45.js';

export function initWeb45() {
  initAgent45();
}

const LAZY = {
  media: () => import('./media45.js'),
  vaer: () => import('./weather45.js'),
  familie: () => import('./family45.js'),
};
/** Etter at en side er tegnet. */
export function after45(route, view) {
  const f = LAZY[route];
  if (f) f().then((m) => m.after45?.(view)).catch((e) => console.warn('web45', route, e));
}
