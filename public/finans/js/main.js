// Velger desktop eller mobil (PWA i Papir-design / brettbar) ut fra skjerm og enhet.
import { S, onChange, loadBoot, loadAi, toast } from './core.js';
import { startVersionCheck } from '../../js/vercheck.js';

const isMobile = () => !new URLSearchParams(location.search).has('desktop') && (matchMedia('(max-width: 899px)').matches || (matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches));
let ui = null;
// Prompt 85: desktop og mobil lastes hver for seg. Før hentet PC-en alle 57 mobilmodulene (1,9 MB) og telefonen alle 26 desktopmodulene
// (0,7 MB) uten å bruke dem. Nedlastingen starter med en gang, parallelt med /bootstrap.
const UI = {};
const loadUi = (mob) => (UI[mob] ??= (mob ? import('./mobile.js') : import('./desktop.js')));
// Prompt 32 (claude-code-innst-web-skjul-scrollbar.md): ingen synlig scrollbar i panelene på FinansHub desktop (siden selv ruller som før).
if (!document.getElementById('fh-ns32')) {
  const st = document.createElement('style'); st.id = 'fh-ns32';
  st.textContent = 'html[data-ui=desktop] body *{scrollbar-width:none}html[data-ui=desktop] body *::-webkit-scrollbar{display:none;width:0;height:0}';
  document.head.appendChild(st);
}

let picking = 0;
async function pick() {
  const mob = isMobile(), n = ++picking;
  let next;
  try { next = await loadUi(mob); } catch (e) { delete UI[mob]; if (!ui) bootFail(e); return; }
  if (n !== picking || next === ui) return; // et nyere valg (resize) har tatt over
  ui = next;
  document.documentElement.dataset.ui = mob ? 'mobile' : 'desktop';
  const old = document.getElementById('app');
  const fresh = old.cloneNode(false); // fjern gamle lyttere
  old.replaceWith(fresh);
  ui.bind();
  ui.route();
}

// Prompt 85: uten nett (eller når serveren er nede) sto det bare «Kunne ikke starte FinansHub: Failed to fetch» i hjørnet.
// Nå: norsk forklaring, «Prøv igjen», og siden laster seg selv når nettet er tilbake.
export const bootFailText = (e, online = true) => (!online || e instanceof TypeError
  ? { title: 'Ingen kontakt med Homelab', text: online ? 'Serveren svarer ikke. Sjekk at du er på riktig nett, og prøv igjen.' : 'Du er uten nett. FinansHub åpner seg igjen når nettet er tilbake.' }
  : { title: 'Kunne ikke starte FinansHub', text: String(e?.message || 'Ukjent feil') });
function bootFail(e) {
  if (e?.auth) return; // innloggingen (core.js authLost) har tatt over skjermen
  const app = document.getElementById('app'), t = bootFailText(e, navigator.onLine !== false);
  app.innerHTML = '<div role="alert" style="min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 24px;box-sizing:border-box;text-align:center;font-family:Manrope,system-ui,sans-serif;background:#f3efe6;color:#1b1a17"><h1 style="margin:0;font:500 26px/1.2 Newsreader,Georgia,serif"></h1><p style="margin:0;max-width:320px;font-size:15px;line-height:1.5;color:#5d584e"></p><button type="button" style="margin-top:10px;min-height:48px;padding:0 26px;border:0;border-radius:24px;background:#1b1a17;color:#f3efe6;font:700 15px Manrope,system-ui,sans-serif;cursor:pointer">Prøv igjen</button></div>';
  app.querySelector('h1').textContent = t.title; app.querySelector('p').textContent = t.text;
  app.querySelector('button').addEventListener('click', () => location.reload());
  window.addEventListener('online', () => location.reload(), { once: true });
}

async function start() {
  loadUi(isMobile()).catch(() => {});
  try { await loadBoot(); } catch (e) { bootFail(e); return; }
  onChange(() => ui?.draw());
  window.addEventListener('hashchange', () => ui?.route());
  window.addEventListener('resize', pick);
  await pick();
  loadAi().then(() => ui?.draw());
  // Prompt 52 (WEB52F): «Nytt i versjon» som lesbart papirkort første gang etter en oppdatering (web og PWA).
  import('./whatsnew52.js').then((x) => x.checkWhatsNew52()).catch(() => {});
  // Prompt 32: på desktop eier vi SW-oppdateringen og versjonsbanneret (mobil/PWA har sin egen i mobile*.js).
  if (isMobile()) { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/finans/sw.js', { scope: '/finans/' }).catch(() => {}); }
  else startVersionCheck({ sw: '/finans/sw.js', scope: '/finans/' });
}
start().catch((e) => toast(e.message));
