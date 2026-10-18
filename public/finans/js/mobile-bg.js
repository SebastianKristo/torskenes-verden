// Dynamiske bakgrunner (prompt 19): Vær, Planeter, Oslo, Eget bilde eller Ingen, fra serverens felles tjeneste
// (GET /api/background). Eldre servere uten tjenesten: /api/photo-window som før. Bildet tegnes som eget lag med
// brukerens uskarphet og mørklegging, en scrim for lesbar tekst, papirtekstur i Papir og diskret regn/snø.
import { esc, hlApi } from './core.js';
import { pref, setPref } from './mobile.js';

export const BG_TYPES = [
  ['weather', 'Vær', 'Følger været der du er (MET)'],
  ['planets', 'Planeter', 'Jorda, Månen, Jupiter, Mars og Saturn (NASA)'],
  ['oslo', 'Oslo', 'Oslo fra luften'],
  ['custom', 'Eget bilde', 'Last opp fra Bilder eller Filer'],
  ['cur', 'Ingen', 'Bare mørk gradient'],
];
export const PLANETS = [['auto', 'Bytt automatisk'], ['earth', 'Jorda'], ['moon', 'Månen'], ['jupiter', 'Jupiter'], ['mars', 'Mars'], ['saturn', 'Saturn']];

export const bgSet = () => ({
  blur: Math.max(0, Math.min(20, +(pref('bgBlur') ?? 0) || 0)),
  dim: Math.max(0, Math.min(60, +(pref('bgDim') ?? 0) || 0)),
  animate: pref('bgAnimate') !== false,
  planet: pref('bgPlanet') || 'auto',
  rotate: pref('bgRotate') || 'daily',
});
/** Lagres lokalt og i /api/me/layout (bgBlur, bgDim, bgAnimate, bgPlanet, bgRotate), så web og appene får samme valg. */
export function saveBg(patch) {
  for (const [k, v] of Object.entries(patch)) setPref(k, v);
  saveBg.q = { ...saveBg.q, ...patch }; clearTimeout(saveBg.t);
  saveBg.t = setTimeout(() => { const q = saveBg.q; saveBg.q = null; hlApi('/me/layout', { method: 'PUT', json: q }).catch(() => {}); }, 400);
}
/** Tar imot valgene fra serveren (kalles fra takeDesign). */
export function takeBg(r) {
  if (!r) return;
  if (Number.isFinite(+r.bgBlur)) setPref('bgBlur', +r.bgBlur);
  if (Number.isFinite(+r.bgDim)) setPref('bgDim', +r.bgDim);
  if (typeof r.bgAnimate === 'boolean') setPref('bgAnimate', r.bgAnimate);
  if (PLANETS.some(([k]) => k === r.bgPlanet)) setPref('bgPlanet', r.bgPlanet);
  if (['daily', 'hourly'].includes(r.bgRotate)) setPref('bgRotate', r.bgRotate);
  // bgType speiler photo; «none» tilsvarer «cur» (gradienten).
  const map = { weather: 'weather', planets: 'planets', oslo: 'oslo', custom: 'custom', none: 'cur', cur: 'cur' };
  if (map[r.bgType] && !map[r.photo]) setPref('photo', map[r.bgType]); // photo vinner når begge finnes (eldre klienter)
}

const creditText = (c) => (typeof c === 'string' ? c : c ? [c.author, c.source].filter(Boolean).join(' · ') || c.text || '' : '');
const creditUrl = (c) => (c && typeof c === 'object' ? c.url ?? null : null);

/** Henter bakgrunnen for typen. Normaliserer til {url, fallbacks, gradient, credit, creditUrl, hint, particles, weather}. */
export async function bgFetch(kind) {
  const s = bgSet(), w = Math.min(1600, Math.round((window.innerWidth || 400) * Math.min(2, window.devicePixelRatio || 1)));
  const type = kind === 'cur' ? 'none' : kind;
  try {
    const q = new URLSearchParams({ type, w: String(w), dpr: '1' });
    if (kind === 'planets' && s.planet !== 'auto') q.set('planet', s.planet);
    const r = await hlApi(`/background?${q}`);
    if (r && ('image_url' in r || r.type)) {
      return { url: r.image_url ?? null, fallbacks: r.fallbacks ?? [], gradient: r.gradient ?? null, credit: creditText(r.credit), creditUrl: creditUrl(r.credit),
        hint: r.theme_hint === 'light' ? 'light' : 'dark', particles: r.particles ?? null, weather: r.weather ?? null, planet: r.planet ?? null, symbol: r.weather?.symbol ?? r.symbol ?? null, next: r.next ?? null };
    }
  } catch { /* eldre server: photo-window */ }
  const r = await hlApi(`/photo-window?kind=${kind}`);
  return { url: r.url ?? null, fallbacks: r.fallbacks ?? [], gradient: r.gradient ?? null, credit: creditText(r.credit), creditUrl: null, hint: 'dark', particles: null, weather: r.weather ?? null, symbol: r.symbol ?? null };
}

/**
 * Lagene i fotovinduet: bilde (eller gradient) med uskarphet og papirfilter, mørklegging, scrim, papirtekstur og partikler.
 * Legges først i <header class="pp-hero"> (posisjonert), innholdet ligger over.
 */
export function bgLayers({ img, gradient, particles, papir, hint }) {
  const s = bgSet();
  const filt = [s.blur ? `blur(${s.blur}px)` : '', papir ? 'saturate(.75) contrast(.96)' : ''].filter(Boolean).join(' ');
  const pic = img ? `background-image:url('${esc(img)}')` : `background-image:${gradient || 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)'}`;
  const scrim = hint === 'light'
    ? 'linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0) 35%,rgba(255,255,255,.4))' // lyst bilde: lys scrim, så mørk tekst holder 4.5:1
    : 'linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 35%,rgba(0,0,0,.45))';
  const part = particles && s.animate ? `<span class="bgx-p ${particles === 'snow' ? 'snow' : 'rain'}" aria-hidden="true"></span>` : '';
  return `<span class="bgx" aria-hidden="true"><span class="bgx-img" style="${pic};${filt ? `filter:${filt};` : ''}${s.blur ? `inset:-${s.blur * 2}px;` : ''}"></span>
    ${s.dim ? `<span class="bgx-dim" style="opacity:${s.dim / 100}"></span>` : ''}<span class="bgx-scrim" style="background:${scrim}"></span>${papir ? '<span class="bgx-paper"></span>' : ''}${part}</span>`;
}

/** Innstillinger → Bakgrunn: planetvalg, bytt automatisk, uskarphet, mørklegging og animasjon. */
export function bgControls(kind) {
  const s = bgSet();
  const chip = (act, v, label, on) => `<button class="p19-chip" data-pp="${act}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  return `<div class="pp-card p19-ctl">
    ${kind === 'planets' ? `<div class="p19-row col"><span class="p19-l">Planet</span><div class="p19-chips">${PLANETS.map(([k, n]) => chip('bgplanet', k, n, s.planet === k)).join('')}</div></div>
      ${s.planet === 'auto' ? `<div class="p19-row col"><span class="p19-l">Bytt</span><div class="p19-chips">${chip('bgrot', 'daily', 'Daglig', s.rotate === 'daily')}${chip('bgrot', 'hourly', 'Hver time', s.rotate === 'hourly')}</div></div>` : ''}` : ''}
    <label class="p19-row col"><span class="p19-l">Uskarphet <b data-bgv="bgBlur">${s.blur} px</b></span><input type="range" min="0" max="20" step="1" value="${s.blur}" data-bgr="bgBlur" aria-label="Uskarphet"></label>
    <label class="p19-row col"><span class="p19-l">Mørklegging <b data-bgv="bgDim">${s.dim} %</b></span><input type="range" min="0" max="60" step="5" value="${s.dim}" data-bgr="bgDim" aria-label="Mørklegging"></label>
    <button class="p19-row tog" data-pp="bganim" aria-pressed="${s.animate}"><span class="p19-l">Animasjon<small>Diskret regn og snø ved slikt vær. Slås av ved «Reduser bevegelse».</small></span><span class="p19-sw"></span></button>
  </div>`;
}
