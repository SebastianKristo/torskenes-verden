// Kalender på web: lys/mørk-knappen i verktøylinja (rett før søk).
// Kalenderen har ikke lenger sitt eget tema (html[data-kal-theme], localStorage «kal_theme»). Den følger Homelab-stilen og
// -modusen som resten av appen (BESLUTNINGER Q14): CSS-en bruker html[data-mode], som mode44.js og hl-boot.js setter.
// Knappen er en snarvei til samme valg som Innstillinger → Utseende → Lys og mørk og går i ring Følg systemet → Mørk → Lys.
// Kalender.app for Mac (html[data-kal-app]) har ingen knapp og følger systemet (tokens.css).
import { webMode, setMode } from './mode44.js';

const ORDER = ['system', 'dark', 'light'];
const LBL = { system: 'Lys og mørk: følger systemet', light: 'Lys og mørk: lys', dark: 'Lys og mørk: mørk' };
const IC = {
  system: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  dark: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};

/** Knappen i verktøylinja (bare web; Kalender.app for Mac følger systemet). */
export function themeBtn() {
  const v = webMode();
  return `<button type="button" class="k39-ib" data-k-mode="${v}" aria-label="${LBL[v]}" title="${LBL[v]}">${IC[v]}</button>`;
}

const redraw = () => {
  const b = document.querySelector('[data-k-mode]');
  if (!b) return;
  const had = document.activeElement === b;
  b.outerHTML = themeBtn();
  if (had) document.querySelector('[data-k-mode]')?.focus();
};

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-k-mode]');
  if (!b) return;
  e.preventDefault();
  setMode(ORDER[(ORDER.indexOf(webMode()) + 1) % ORDER.length]);
  redraw();
  document.querySelector('[data-k-mode]')?.focus();
});
// Byttet i Innstillinger, i en annen fane eller av systemet: bare knappen tegnes på nytt (resten bytter farge via CSS).
window.addEventListener('papir-web-mode', redraw);
window.addEventListener('storage', (e) => { if (e.key === 'papir_web_mode') redraw(); });
