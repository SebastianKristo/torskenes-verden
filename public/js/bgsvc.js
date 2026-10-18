// Felles bakgrunn for Homelab web (begge temaene): Vær, Planeter, Oslo, Eget bilde eller Ingen.
// Valget og visningen (uskarphet, mørklegging, animasjon) lagres per bruker i /api/me/layout (bgType, bgPlanet, …) og deles
// med mobilappene. Bildet kommer fra GET /api/background (serveren laster ned, skalerer og cacher). Finnes ikke den
// tjenesten (eldre server), brukes /api/photo-window som reserve. Feiler alle bildene, vises gradienten.
// Bildene er alltid ekte fotografier (Wikimedia Commons / NASA); ingenting tegnes eller genereres i nettleseren.
import { api } from './util.js';

export const BG_TYPES = [
  ['weather', 'Vær', 'Følger været ute, dag og natt'],
  ['planets', 'Planeter', 'Jorda, Månen, Jupiter, Mars og Saturn fra NASA'],
  ['oslo', 'Oslo', 'Byen fra lufta'],
  ['custom', 'Eget bilde', 'Ditt opplastede bilde'],
  ['none', 'Ingen', 'Bare fargeovergang'],
];
export const PLANETS = [['auto', 'Bytt automatisk'], ['earth', 'Jorda'], ['moon', 'Månen'], ['jupiter', 'Jupiter'], ['mars', 'Mars'], ['saturn', 'Saturn']];
const TYPES = BG_TYPES.map((t) => t[0]);
// Reserven når ingen bilder lastes (prompt 21): en rolig gradient, aldri en tegnet planet.
export const FALLBACK_GRAD = 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';

// Standardvalg. 'cur' (eldre «Ingen bilde» i Vindu og papir) leses som 'none'.
const bg = { type: 'oslo', planet: 'auto', rotate: 'daily', blur: 0, dim: 0, animate: true };
export const bgState = () => ({ ...bg });
let known = false; // true når valget er lest fra layout (da brukes ikke det eldre klassiske valget)
export const bgKnown = () => known;

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
const typeOf = (v) => (v === 'cur' ? 'none' : TYPES.includes(v) ? v : null);

/** Leser valget fra layout. bgType vinner; ellers brukes det eldre feltet photo. */
export function setBgFromLayout(l = {}) {
  if (typeOf(l.bgType) || typeOf(l.photo)) known = true;
  bg.type = typeOf(l.bgType) ?? typeOf(l.photo) ?? bg.type;
  if (PLANETS.some((p) => p[0] === l.bgPlanet)) bg.planet = l.bgPlanet;
  if (l.bgRotate === 'daily' || l.bgRotate === 'hourly') bg.rotate = l.bgRotate;
  bg.blur = clamp(l.bgBlur, 0, 20, bg.blur);
  bg.dim = clamp(l.bgDim, 0, 60, bg.dim);
  if (typeof l.bgAnimate === 'boolean') bg.animate = l.bgAnimate;
  applyVars();
}

/** Klassisk tema lagrer i tillegg et eldre valg (store.me.bg); oversett mellom dem. */
export const legacyToType = (k) => ({ mane: ['planets', 'moon'], jorda: ['planets', 'earth'], saturn: ['planets', 'saturn'], oslo: ['oslo'], vaer: ['weather'], egen: ['custom'], ingen: ['none'] }[k] ?? null);
export const typeToLegacy = (t, planet) => (t === 'weather' ? 'vaer' : t === 'planets' ? (planet === 'earth' ? 'jorda' : planet === 'saturn' ? 'saturn' : 'mane') : t === 'oslo' ? 'oslo' : t === 'custom' ? 'egen' : 'ingen');

/** Lagrer endringer (patch med bgType/bgPlanet/…). photo speiles for eldre klienter. */
export async function saveBg(patch) {
  known = true;
  if (patch.type !== undefined) bg.type = typeOf(patch.type) ?? bg.type;
  if (patch.planet !== undefined) bg.planet = patch.planet;
  if (patch.rotate !== undefined) bg.rotate = patch.rotate;
  if (patch.blur !== undefined) bg.blur = clamp(patch.blur, 0, 20, 0);
  if (patch.dim !== undefined) bg.dim = clamp(patch.dim, 0, 60, 0);
  if (patch.animate !== undefined) bg.animate = !!patch.animate;
  applyVars();
  const json = { bgType: bg.type, bgPlanet: bg.planet, bgRotate: bg.rotate, bgBlur: bg.blur, bgDim: bg.dim, bgAnimate: bg.animate, photo: bg.type === 'none' ? 'cur' : bg.type };
  // Eldre servere avviser ukjente felt: prøv da bare photo.
  await api('/me/layout', { method: 'PUT', json }).catch(() => api('/me/layout', { method: 'PUT', json: { photo: json.photo } }).catch(() => {}));
  document.dispatchEvent(new Event('hl:bg'));
}

/** Uskarphet og mørklegging som CSS-variabler på roten; brukes av fotovinduet og den klassiske bakgrunnen. */
function applyVars() {
  const r = document.documentElement.style;
  r.setProperty('--bg-blur', `${bg.blur}px`);
  r.setProperty('--bg-dim', String(bg.dim / 100));
}

/* ---------- Henting ---------- */

const cache = new Map(); // nøkkel → { at, r, url, failed, pending }
const keyOf = (type) => `${type}|${type === 'planets' ? bg.planet : ''}`;

function norm(r, legacy) {
  if (!r) return null;
  if (legacy) {
    return { type: r.kind, image_url: r.url ?? null, fallbacks: r.fallbacks ?? [], credit: r.credit ? { text: r.credit } : null,
      theme_hint: 'dark', gradient: r.gradient || FALLBACK_GRAD, particles: /regn|rain/i.test(r.symbol ?? r.weather?.kind ?? '') ? 'rain' : /snø|snow/i.test(r.symbol ?? '') ? 'snow' : null };
  }
  const credit = typeof r.credit === 'string' ? { text: r.credit } : r.credit ?? null;
  return { ...r, credit, fallbacks: r.fallbacks ?? [], gradient: r.gradient || FALLBACK_GRAD, theme_hint: r.theme_hint === 'light' ? 'light' : 'dark' };
}

function tryLoad(urls) {
  return new Promise((res) => {
    const next = (i) => {
      if (i >= urls.length) return res(null);
      const img = new Image();
      img.onload = () => res(urls[i]);
      img.onerror = () => { console.warn('[bakgrunn] fikk ikke lastet', urls[i]); next(i + 1); };
      img.src = urls[i];
    };
    next(0);
  });
}

const LEGACY_KIND = { weather: 'weather', planets: 'planets', oslo: 'oslo', custom: 'custom' };
let hasService = null; // null = ukjent, false = eldre server uten /api/background

async function fetchBg(type) {
  const w = Math.round(Math.min(2560, (innerWidth || 1440) * (devicePixelRatio || 1)));
  const h = Math.round(Math.min(2560, (innerHeight || 900) * (devicePixelRatio || 1)));
  if (hasService !== false) {
    try {
      const q = new URLSearchParams({ type, w: String(w), h: String(h), dpr: String(devicePixelRatio || 1) });
      if (type === 'planets') q.set('planet', bg.planet);
      const r = await api(`/background?${q}`);
      hasService = true;
      return norm(r, false);
    } catch (e) {
      if (e?.status && e.status !== 404) return null;
      if (!e?.status && hasService === true) return null;
      hasService = false;
    }
  }
  const kind = LEGACY_KIND[type];
  return kind ? norm(await api(`/photo-window?kind=${kind}`).catch(() => null), true) : null;
}

/** Bildet for en type. force henter på nytt; vær og planeter («hver time») byttes også av seg selv. */
export async function resolveBg(type = bg.type, force = false) {
  const key = keyOf(type), hit = cache.get(key);
  const maxAge = type === 'weather' ? 30 * 60_000 : type === 'planets' && bg.rotate === 'hourly' ? 60 * 60_000 : 6 * 3600_000;
  const due = hit?.r?.next ? Date.parse(hit.r.next) <= Date.now() : false;
  if (hit && !force && (hit.pending || (Date.now() - hit.at < maxAge && !due))) return hit.pending ?? hit;
  const ent = { at: Date.now(), r: null, url: null, failed: false };
  ent.pending = (async () => {
    if (type !== 'none') {
      ent.r = await fetchBg(type);
      const urls = [ent.r?.image_url, ...(ent.r?.fallbacks ?? [])].filter(Boolean);
      ent.url = urls.length ? await tryLoad(urls) : null;
      ent.failed = !ent.url && (urls.length > 0 || !ent.r);
    }
    ent.pending = null;
    return ent;
  })();
  cache.set(key, ent);
  return ent.pending;
}
export const cachedBg = (type = bg.type) => cache.get(keyOf(type));
export const forgetBg = (type) => { for (const k of [...cache.keys()]) if (k.startsWith(`${type}|`)) cache.delete(k); };

/** Kreditering som tekst (og lenke). */
export function creditOf(ent) {
  const c = ent?.r?.credit;
  if (!c || ent.failed) return { text: '', url: null };
  const text = c.text || [c.author, c.source].filter(Boolean).join(' · ');
  return { text, url: c.url ?? null };
}

/* ---------- Partikler (regn og snø) ---------- */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const parts = new WeakMap();

/** Tegner diskret regn eller snø i host (et element med position:relative). Fjernes når kind er null. */
export function particles(host, kind) {
  if (!host) return;
  const old = parts.get(host);
  const want = kind && bg.animate && !reduced() ? kind : null;
  if (old?.kind === want) return;
  if (old) { cancelAnimationFrame(old.raf); old.cv.remove(); parts.delete(host); }
  if (!want) return;
  const cv = document.createElement('canvas');
  cv.className = 'bg-particles'; cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  const st = { kind: want, cv, raf: 0, drops: [] };
  parts.set(host, st);
  const size = () => { const r = host.getBoundingClientRect(); cv.width = Math.max(1, r.width); cv.height = Math.max(1, r.height); };
  size();
  const n = want === 'rain' ? 90 : 60;
  for (let i = 0; i < n; i++) st.drops.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, v: want === 'rain' ? 7 + Math.random() * 6 : 0.6 + Math.random() * 1.2, r: want === 'rain' ? 10 + Math.random() * 12 : 1 + Math.random() * 2.2, d: Math.random() * Math.PI * 2 });
  let last = 0;
  const step = (t) => {
    st.raf = requestAnimationFrame(step);
    if (document.hidden || t - last < 33) return; // ca. 30 bilder i sekundet holder
    last = t;
    if (cv.width !== Math.round(host.clientWidth)) size();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    for (const p of st.drops) {
      if (want === 'rain') { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.5, p.y + p.r); ctx.stroke(); p.y += p.v; p.x -= 0.3; }
      else { p.d += 0.02; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.d) * 6, p.y, p.r, 0, Math.PI * 2); ctx.fill(); p.y += p.v; }
      if (p.y > cv.height + 20) { p.y = -20; p.x = Math.random() * cv.width; }
    }
  };
  st.raf = requestAnimationFrame(step);
}
