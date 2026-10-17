// Velger desktop eller mobil (iOS Liquid Glass / Android M3 Expressive / brettbar) ut fra skjerm og enhet.
import { S, onChange, loadBoot, loadAi, toast } from './core.js';
import * as desktop from './desktop.js';
import * as mobile from './mobile.js';

const isMobile = () => !new URLSearchParams(location.search).has('desktop') && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
let ui = null;

function pick() {
  const next = isMobile() ? mobile : desktop;
  if (next === ui) return;
  ui = next;
  document.documentElement.dataset.ui = ui === mobile ? 'mobile' : 'desktop';
  const old = document.getElementById('app');
  const fresh = old.cloneNode(false); // fjern gamle lyttere
  old.replaceWith(fresh);
  ui.bind();
  ui.route();
}

async function start() {
  try { await loadBoot(); } catch (e) { document.getElementById('app').textContent = 'Kunne ikke starte FinansHub: ' + e.message; return; }
  onChange(() => ui?.draw());
  window.addEventListener('hashchange', () => ui.route());
  window.addEventListener('resize', pick);
  pick();
  loadAi().then(() => ui.draw());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/finans/sw.js', { scope: '/finans/' }).catch(() => {});
}
start().catch((e) => toast(e.message));
