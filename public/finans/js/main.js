// Velger desktop eller mobil (PWA i Papir-design / brettbar) ut fra skjerm og enhet.
import { S, onChange, loadBoot, loadAi, toast } from './core.js';
import * as desktop from './desktop.js';
import * as mobile from './mobile.js';
import { startVersionCheck } from '../../js/vercheck.js';

const isMobile = () => !new URLSearchParams(location.search).has('desktop') && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
let ui = null;
// Prompt 32 (claude-code-innst-web-skjul-scrollbar.md): ingen synlig scrollbar i panelene på FinansHub desktop (siden selv ruller som før).
if (!document.getElementById('fh-ns32')) {
  const st = document.createElement('style'); st.id = 'fh-ns32';
  st.textContent = 'html[data-ui=desktop] body *{scrollbar-width:none}html[data-ui=desktop] body *::-webkit-scrollbar{display:none;width:0;height:0}';
  document.head.appendChild(st);
}

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
  // Prompt 32: på desktop eier vi SW-oppdateringen og versjonsbanneret (mobil/PWA har sin egen i mobile*.js).
  if (isMobile()) { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/finans/sw.js', { scope: '/finans/' }).catch(() => {}); }
  else startVersionCheck({ sw: '/finans/sw.js', scope: '/finans/' });
}
start().catch((e) => toast(e.message));
