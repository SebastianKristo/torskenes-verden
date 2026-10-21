// Prompt 44 (claude-code-kalender-sted-adresse.md, claude-code-gjoremal-infoside.md): «Sted eller adresse» med forslag.
// - GET /api/geo/address?q= (SERVER44: Kartverket først, så OSM/Nominatim, cache) → [{label, street, postcode, city, lat, lon}].
//   Nettleseren snakker bare med egen server (CSP connect-src 'self').
// - Fra 3 tegn, 280 ms etter siste tastetrykk, opptil 6 forslag. Bare det siste søket vises. Lukkes når feltet mister fokus.
//   Rader minst 48 px, lista krymper aldri (flex:none). Bunntekst «ADRESSER FRA KARTVERKET».
// - miniMap(el, {lat, lon}) tegner et lite kart med nål (Leaflet og kartfliser fra egen server, samme som Familie).
import { esc } from './util.js';

let seq = 0;
const cache = new Map();
export async function geoSearch(q) {
  q = String(q ?? '').trim();
  if (q.length < 3) return [];
  if (cache.has(q.toLowerCase())) return cache.get(q.toLowerCase());
  const r = await fetch(`/api/geo/address?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
  if (!r.ok) throw Object.assign(new Error(`Feil ${r.status}`), { status: r.status });
  const j = await r.json();
  const L = (Array.isArray(j) ? j : j?.items ?? j?.results ?? []).slice(0, 6).map((x) => ({ label: x.label ?? [x.street, [x.postcode, x.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), street: x.street ?? x.name ?? x.label ?? '', postcode: x.postcode ?? '', city: x.city ?? '', lat: +x.lat, lon: +x.lon, src: x.source ?? x.src ?? '' }));
  cache.set(q.toLowerCase(), L);
  return L;
}
const PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

/** Kobler forslag på et felt. onPick({label, lat, lon}) kalles ved valg. Returnerer en funksjon som kobler fra. */
export function attachGeo(input, onPick) {
  if (!input || input.dataset.geo44) return () => {};
  input.dataset.geo44 = '1'; input.setAttribute('autocomplete', 'off'); input.dataset.glimt = 'off';
  let box = null, list = [], hi = 0, t = 0, my = 0, missing = false;
  const close = () => { box?.remove(); box = null; list = []; input.setAttribute('aria-expanded', 'false'); };
  const place = () => { if (!box) return; const r = input.getBoundingClientRect(); Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${Math.max(260, r.width)}px` }); };
  const paint = () => {
    if (!list.length || document.activeElement !== input) return close();
    if (!box) { box = document.createElement('div'); box.className = 'geo44'; box.setAttribute('role', 'listbox'); document.body.appendChild(box); box.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-geo44]'); if (!b) return; e.preventDefault(); pick(list[+b.dataset.geo44]); }); }
    box.innerHTML = list.map((x, i) => `<button type="button" role="option" aria-selected="${i === hi}" class="${i === hi ? 'on' : ''}" data-geo44="${i}"><i>${PIN}</i><span><b>${esc(x.street || x.label)}</b><span>${esc([x.postcode, x.city].filter(Boolean).join(' '))}</span></span></button>`).join('') + `<span class="geo44-foot">${list.some((x) => /osm|nominatim/i.test(x.src)) ? 'ADRESSER FRA KARTVERKET OG OPENSTREETMAP' : 'ADRESSER FRA KARTVERKET'}</span>`;
    input.setAttribute('aria-expanded', 'true');
    place();
  };
  const pick = (x) => { if (!x) return; const label = x.label || x.street; const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); proto.set.call(input, label); input.dispatchEvent(new Event('input', { bubbles: true })); close(); onPick?.({ label, lat: x.lat, lon: x.lon, street: x.street, postcode: x.postcode, city: x.city }); };
  const onInput = () => {
    clearTimeout(t); const q = input.value.trim();
    if (q.length < 3 || missing) return close();
    t = setTimeout(async () => { const me = ++seq; my = me; try { const L = await geoSearch(q); if (my !== seq || input.value.trim() !== q) return; list = L; hi = 0; paint(); } catch (e) { if (e.status === 404) missing = true; close(); } }, 280);
  };
  const onKey = (e) => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); hi = (hi + 1) % list.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); hi = (hi - 1 + list.length) % list.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(list[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const onBlur = () => setTimeout(close, 150);
  input.addEventListener('input', onInput); input.addEventListener('keydown', onKey); input.addEventListener('blur', onBlur);
  addEventListener('scroll', place, true); addEventListener('resize', place);
  return () => { close(); input.removeEventListener('input', onInput); input.removeEventListener('keydown', onKey); input.removeEventListener('blur', onBlur); removeEventListener('scroll', place, true); removeEventListener('resize', place); delete input.dataset.geo44; };
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/api/family/vendor/leaflet.css'; l.dataset.leaflet = '1'; document.head.appendChild(l); }
  return (loadLeaflet.p ??= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/api/family/vendor/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => rej(new Error('Kunne ikke laste kartet')); document.head.appendChild(s); }));
}
/** Lite kart med nål i el. */
export async function miniMap(el, { lat, lon }) {
  if (!el || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return;
  if (el.dataset.at === `${lat},${lon}` && el._map) return;
  el.dataset.at = `${lat},${lon}`;
  try {
    const L = await loadLeaflet();
    if (!el.isConnected) return;
    if (el._map) { el._map.setView([lat, lon], 15); el._mk?.setLatLng([lat, lon]); return; }
    const m = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([lat, lon], 15);
    L.tileLayer('/tiles/topo/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© Kartverket' }).addTo(m);
    el._mk = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#b23a2a', fillOpacity: 1 }).addTo(m);
    el._map = m;
    setTimeout(() => m.invalidateSize(), 60);
  } catch { el.innerHTML = '<span class="geo44-nomap">Kartet kunne ikke lastes.</span>'; }
}
export const mapLinks = ({ lat, lon, label }) => {
  const q = encodeURIComponent(label || `${lat},${lon}`);
  return `<a class="geo44-lk" href="https://maps.apple.com/?q=${q}${Number.isFinite(+lat) ? `&ll=${lat},${lon}` : ''}" target="_blank" rel="noopener">Åpne i Kart</a><a class="geo44-lk" href="https://www.google.com/maps/search/?api=1&query=${Number.isFinite(+lat) ? `${lat},${lon}` : q}" target="_blank" rel="noopener">Google Maps</a>`;
};
