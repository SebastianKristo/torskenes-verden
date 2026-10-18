// Bakgrunnen i det klassiske temaet (bak Dashboard): samme valg og bilder som fotovinduet i Vindu og papir og appene
// (bgsvc.js → GET /api/background). Bildene lastes fra serveren, så ingenting hotlinkes fra Wikimedia. To lag gir myk
// overgang; uskarphet og mørklegging kommer fra brukerens valg (--bg-blur / --bg-dim).
import { store } from './store.js';
import { cssUrl } from './util.js';
import { bgState, bgKnown, resolveBg, legacyToType, setBgFromLayout, particles } from './bgsvc.js';

let front = 0, current = null, timer = null;

function preload(url) {
  return new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(url); i.src = url; });
}

async function show(url) {
  if (url === current) return;
  current = url;
  const layers = document.querySelectorAll('.bg-layer');
  if (!url) { layers.forEach((l) => l.classList.remove('on')); return; }
  await preload(url);
  if (current !== url) return;
  const next = layers[1 - front];
  if (!next) return;
  next.style.backgroundImage = cssUrl(url);
  next.classList.add('on');
  layers[front].classList.remove('on');
  front = 1 - front;
}

/** Forhåndslaster ingenting lenger (serveren cacher), men beholdes for eldre kall. */
export function preloadAll() {}

export async function applyBackground(force = false) {
  clearInterval(timer);
  // Eldre klassisk valg (store.me.bg) brukes bare når brukeren ikke har valgt i den nye bakgrunnstjenesten.
  if (!bgKnown()) {
    const m = legacyToType(store.me?.bg);
    if (m) setBgFromLayout({ bgType: m[0], ...(m[1] ? { bgPlanet: m[1] } : {}) });
  }
  const t = bgState().type;
  const host = document.querySelector('.bg');
  if (t === 'none') { show(null); particles(host, null); return; }
  const e = await resolveBg(t, force);
  await show(e.url);
  host?.classList.toggle('bg-light', e.r?.theme_hint === 'light');
  particles(host, e.url ? e.r?.particles ?? null : null);
  // Vær og planeter («hver time») sjekkes hvert 10. minutt.
  timer = setInterval(() => { if (!document.hidden) applyBackground(); }, 10 * 60_000);
}
document.addEventListener('hl:bg', () => applyBackground());
