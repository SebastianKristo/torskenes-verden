// Prompt 52 (WEB52H): Homelab web og PWA.
//  - Oppstart (claude-code-web-oppstart-animasjon.md): faneoppsettet og logo-teksten caches i localStorage (hl_tabs52) hver gang
//    topplinjen er tegnet, så boot52.js kan vise riktig faneliste fra første frame. Skjelettet fjernes når appen har lest oppsettet.
//    Innholdet glir inn (pgIn, 10 px nedenfra, 280 ms) ved første visning og ved hvert fanebytte; headeren står i ro.
//  - Ruter (claude-code-ruter-avganger-umiddelbart.md): siste svar lagres (papir_av_cache) og vises straks ved oppstart, før
//    nettverkskallet. Gamle avganger filtreres bort når de tegnes (dash.js regner minuttene fra klokka). Feil beholder gamle data.
import { store, on, emit } from './store.js';
import { wx52, wx52Off } from './wx52.js';
import { loadHome52, store52Meta, bindHome52, refreshTiles52, leaveHome52 } from './home52.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const uid = () => { try { return localStorage.getItem('hl_uid'); } catch { return null; } };

/* ---------------- Faneoppsett-cache og skjelett ---------------- */

let snapT = 0;
function snapshotTabs() {
  clearTimeout(snapT);
  snapT = setTimeout(() => {
    try {
      const list = (sel) => [...document.querySelectorAll(`${sel} [data-r]`)].map((a) => ({ r: a.dataset.r, h: a.hidden ? 1 : 0, t: a.textContent.trim() }));
      const top = list('.pillnav');
      if (!top.length) return;
      const logo = document.querySelector('header.top .logo')?.textContent.trim() || '';
      localStorage.setItem('hl_tabs52', JSON.stringify({ uid: uid(), top, bottom: list('.bottomnav'), logo, at: Date.now() }));
    } catch { /* privat modus */ }
  }, 400);
}
function clearSkeleton() {
  document.querySelectorAll('.nav-skel52').forEach((s) => s.remove());
  document.documentElement.classList.remove('boot52-nocache');
  document.getElementById('view')?.removeAttribute('aria-busy');
}

/* ---------------- Sideanimasjon ---------------- */

let lastRoute = null;
function pageEnter(route, view) {
  const changed = route !== lastRoute;
  lastRoute = route;
  if (!changed || reduced()) return;
  view.classList.remove('page-enter');
  void view.offsetWidth; // start animasjonen på nytt
  view.classList.add('page-enter');
  const done = () => view.classList.remove('page-enter'); // ingen transform igjen etterpå (position:fixed inni siden)
  view.addEventListener('animationend', done, { once: true });
  setTimeout(done, 600);
}

/* ---------------- Ruter: buffer ---------------- */

const AV_KEY = 'papir_av_cache';
function primeRuter() {
  if (store.data.ruter) return;
  try {
    const c = JSON.parse(localStorage.getItem(AV_KEY) || 'null');
    if (!c || !c.data?.trips || (c.uid && String(c.uid) !== String(uid()))) return;
    if (Date.now() - (c.at || 0) > 6 * 3600_000) return; // eldre enn 6 t: ikke vis
    const now = Date.now();
    // Avganger mer enn 1 min tilbake filtreres bort; minuttene regnes på nytt fra klokka når de tegnes.
    const trips = c.data.trips.map((t) => ({ ...t, deps: (t.deps ?? []).filter((d) => new Date(d.time).getTime() - now > -60_000) }));
    store.data.ruter = { ...c.data, trips, cached52: true };
  } catch { /* ødelagt cache */ }
}
function saveRuter() {
  const d = store.data.ruter;
  if (!d?.trips || d.cached52 || store.errors.ruter) return;
  try { localStorage.setItem(AV_KEY, JSON.stringify({ uid: uid(), at: Date.now(), data: d })); } catch { /* full eller privat */ }
}

/* ---------------- Inngang ---------------- */

/* ---------------- Hjem: «Siste nytt» åpner hele nyhetsleseren (mobil), med lett haptikk ---------------- */

function bindNews52() {
  document.addEventListener('click', (e) => {
    const tk = e.target.closest?.('#ticker');
    if (!tk || !matchMedia('(max-width: 767px)').matches) return;
    if (e.target.closest('[data-tick-sp],.ticker-speed')) return;
    e.preventDefault(); e.stopPropagation();
    try { navigator.vibrate?.(10); } catch { /* ikke støttet (iOS Safari) */ }
    import('./news.js').then((m) => (m.openNews ?? m.default)?.()).catch(() => {});
  }, true);
}

export function initWeb52() {
  bindNews52();
  bindHome52();
  for (const k of ['ruter', 'finans', 'news', 'birthdays']) on(k, () => { if (document.querySelector('[data-h52-root]')) refreshTiles52(); });
  primeRuter();
  if (store.data.ruter) emit('ruter');
  on('ruter', saveRuter);
  // Hver gang topplinjen endres (skjul/vis fane, nytt navn, ny rekkefølge, appnavn): oppdater cachen.
  const obs = new MutationObserver(snapshotTabs);
  for (const el of [document.querySelector('.pillnav'), document.querySelector('.bottomnav'), document.querySelector('header.top .logo')]) {
    if (el) obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'], characterData: true });
  }
}

export function after52(route, view) {
  clearSkeleton();
  pageEnter(route, view);
  snapshotTabs();
  if (route === 'vaer') wx52(view); else wx52Off(); // Vær: glass-pille med dra, søk rett i stedssøket
  if (!view.querySelector('[data-h52-root]')) leaveHome52();
  if (route === 'dash' && view.querySelector('[data-h52-root]')) { store52Meta(); loadHome52(refreshTiles52); } // Hjem 3a (mobil)
}
