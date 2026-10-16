// Bakgrunnsbilder med forhåndslasting, lysbildeserie (Oslo) og værbasert bilde.
import { store } from './store.js';
import { cssUrl } from './util.js';

const FP = (f, w = 2400) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=${w}`;
const W = () => (matchMedia('(max-width: 767px)').matches ? 1200 : 2400);

export const PRESETS = {
  mane: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg',
  jorda: 'https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg',
  saturn: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Saturn_during_Equinox.jpg',
};
const OSLO = () => ['Oslo_Opera_House_-_2025.jpg', 'Panorama_taken_from_top_of_the_Oslo_Opera_House_(Operahuset)_(29585739880).jpg',
  'Oslo_Opera_House_seen_from_Langkaia.JPG', 'The_Oslo_Opera_House_(Operahuset)_(29585744210).jpg'].map((f) => FP(f, W()));
const WEATHER = () => ({ sol: FP('Blue-skies-cumulus-clouds.jpg', W()), sky: FP('Cumulus_congestus_cloud_in_sky.jpg', W()), regn: FP('Raindrops_on_a_window.jpg', W()) });

export const OPTIONS = [['mane', 'Måne'], ['jorda', 'Jorda'], ['saturn', 'Saturn'], ['oslo', 'Oslo', true], ['vaer', 'Vær', true], ['egen', 'Eget bilde', true], ['ingen', 'Ingen']];

const file = (n) => (n ? `/api/files/${n}` : null);
const weatherKind = () => store.data.weather?.kind ?? 'sol';

function osloList() {
  const c = store.me.bgCustom.oslo;
  return c?.length ? c.map(file) : OSLO();
}

export function srcFor(key, slide = 0) {
  const c = store.me.bgCustom;
  if (key === 'oslo') { const l = osloList(); return l[slide % l.length]; }
  if (key === 'vaer') { const k = weatherKind(); return file(c['vaer_' + k]) ?? WEATHER()[k]; }
  if (key === 'egen') return file(c.egen);
  return PRESETS[key] ?? null;
}

const preloaded = new Map();
function preload(url) {
  if (!url || preloaded.has(url)) return preloaded.get(url);
  const p = new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(url); i.src = url; });
  preloaded.set(url, p);
  return p;
}

export function preloadAll() {
  [...Object.values(PRESETS), ...osloList(), ...Object.values(WEATHER()), ...Object.values(store.me.bgCustom).flat().map(file)].forEach(preload);
}

let front = 0, current = null, slideTimer = null;

async function show(url) {
  if (url === current) return;
  current = url;
  const layers = document.querySelectorAll('.bg-layer');
  if (!url) { layers.forEach((l) => l.classList.remove('on')); return; }
  await preload(url);
  if (current !== url) return;
  const next = layers[1 - front];
  next.style.backgroundImage = cssUrl(url);
  next.classList.add('on');
  layers[front].classList.remove('on');
  front = 1 - front;
}

export function applyBackground() {
  clearInterval(slideTimer);
  const key = store.me.bg;
  if (key === 'oslo') {
    const tick = () => show(srcFor('oslo', Math.floor(Date.now() / 15000)));
    tick();
    slideTimer = setInterval(tick, 1000);
  } else show(srcFor(key));
}
