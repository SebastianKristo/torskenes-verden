// Prompt 45 (claude-code-vaer-min-posisjon-popup.md) · Vær på web: «MIN POSISJON» øverst i stedslista.
// Posisjonen kommer fra nettleseren som har siden åpen (Geolocation), ikke fra serveren eller en annen enhet.
//   GET /api/weather/here?lat=&lon=&selLat=&selLon= → {place:{name}, now:{temp, text}, today:{hi, lo}, sameAsSelected, refreshAfterSec}
// Avslått posisjon: «Slå på posisjon for å se været der du er» + Tillat. Samme sted som valgt (innen 2 km): bare ett kort.
// Oppdateres når fanen kommer i forgrunnen, maks hvert 10. minutt. Posisjonen lagres ikke.
import { esc } from './util.js';
import { wxRoute } from './assist.js';

const W = { st: 'idle', d: null, pos: null, at: 0, err: '' };
let obs = null;
const TEN = 10 * 60_000;

async function perm() {
  try { const p = await navigator.permissions?.query({ name: 'geolocation' }); return p?.state ?? 'prompt'; } catch { return 'prompt'; }
}
function locate(ask) {
  if (!('geolocation' in navigator)) { W.st = 'none'; paint(); return; }
  W.st = 'busy'; paint();
  navigator.geolocation.getCurrentPosition((p) => { W.pos = { lat: p.coords.latitude, lon: p.coords.longitude }; fetchHere(); }, (e) => { W.st = e.code === 1 ? 'denied' : 'err'; W.err = e.message; paint(); }, { enableHighAccuracy: false, maximumAge: TEN, timeout: ask ? 20_000 : 10_000 });
}
async function fetchHere() {
  const sel = document.querySelector('.wx36-pc.on')?.dataset.wxLat ? document.querySelector('.wx36-pc.on') : null;
  const q = new URLSearchParams({ lat: W.pos.lat.toFixed(3), lon: W.pos.lon.toFixed(3), ...(sel ? { selLat: sel.dataset.wxLat, selLon: sel.dataset.wxLon } : {}) });
  try {
    const r = await fetch(`/api/weather/here?${q}`, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 404) { W.st = 'missing'; paint(); return; }
    W.d = await r.json(); W.st = r.ok ? 'ok' : 'err'; W.at = Date.now(); W.err = r.ok ? '' : W.d?.error ?? '';
  } catch (e) { W.st = 'err'; W.err = e.message; }
  paint();
}
function html() {
  if (W.st === 'missing' || W.st === 'none' || W.st === 'idle') return '';
  if (W.st === 'denied' || W.st === 'prompt') return `<div class="wx45-here off" data-wx45><span class="wx45-k">${ARROW} MIN POSISJON</span><span class="wx45-t">Slå på posisjon for å se været der du er</span><button type="button" class="wx45-b" data-wx45-allow>${W.st === 'denied' ? 'Slik tillater du' : 'Tillat'}</button></div>`;
  if (W.st === 'busy' && !W.d) return `<div class="wx45-here" data-wx45><span class="wx45-k">${ARROW} MIN POSISJON</span><span class="wx45-t">Finner posisjonen din …</span></div>`;
  if (W.st === 'err' && !W.d) return '';
  const d = W.d;
  if (!d || d.sameAsSelected) return '';
  return `<button type="button" class="wx36-pc wx45-here" data-wx45 data-wx45-open><span class="wx36-pc1"><span class="wx36-pcn"><b>${esc(d.place?.name ?? 'Her')}</b><span class="wx45-k">${ARROW} MIN POSISJON</span></span><span class="wx36-pct">${d.now?.temp != null ? `${Math.round(d.now.temp)}°` : '–'}</span></span><span class="wx36-pc2"><span>${esc(d.now?.text ?? '')}</span><span>${d.today ? `H:${Math.round(d.today.hi)}°  L:${Math.round(d.today.lo)}°` : ''}</span></span></button>`;
}
const ARROW = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3L3 10.5l7.5 2.5L13 21z"/></svg>';
function paint() {
  const list = document.querySelector('.wxp .wx36-pcs');
  if (!list) return;
  const h = html(), cur = list.querySelector('[data-wx45]');
  if (!h) { cur?.remove(); return; }
  const t = document.createElement('template'); t.innerHTML = h;
  const el = t.content.firstElementChild;
  if (cur) cur.replaceWith(el); else list.prepend(el);
}
function onClick(e) {
  if (e.target.closest('[data-wx45-allow]')) {
    e.preventDefault(); e.stopPropagation();
    if (W.st === 'denied') { alert('Posisjon er avslått for denne siden. Tillat posisjon i nettleserens innstillinger for nettstedet (låsikonet ved adressen), og last inn siden på nytt.'); return; }
    locate(true); return;
  }
  if (e.target.closest('[data-wx45-open]') && W.d && W.pos) { e.preventDefault(); e.stopPropagation(); location.hash = wxRoute({ name: W.d.place?.name ?? 'Min posisjon', lat: W.d.place?.lat ?? W.pos.lat, lon: W.d.place?.lon ?? W.pos.lon }); }
}
async function refresh(force) {
  if (!force && W.at && Date.now() - W.at < TEN) { paint(); return; }
  const p = await perm();
  if (p === 'granted') locate(false);
  else { W.st = p === 'denied' ? 'denied' : 'prompt'; paint(); }
}
export function after45(view) {
  const root = view.querySelector('.wxp') ?? view;
  if (!root.dataset.wx45b) { root.dataset.wx45b = '1'; root.addEventListener('click', onClick, true); }
  obs?.disconnect();
  obs = new MutationObserver(() => { const l = document.querySelector('.wxp .wx36-pcs'); if (l && !l.querySelector('[data-wx45]') && html()) paint(); });
  obs.observe(root, { childList: true, subtree: true });
  refresh(false);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && document.querySelector('.wxp .wx36-pcs')) refresh(false); });
