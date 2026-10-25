// Prompt 52 (WEB52F) – FinansHub PWA:
//  1. Saldokortet: hold inne 0,5 s → arket «Utseende på saldokortet» (Standard · Glass · Kvittering · Fargebunn), fasit
//     Homelab.dc.html (finSal/salSheet). Valget lagres i papir_salsty og synkes som layout-feltet salSty. Kort trykk åpner
//     Kontoer som før; et langt trykk åpner ikke Kontoer og starter ikke wiggle (mobile-paper3.js hopper over data-p52sal).
//  2. Finans → Liste: månedslinja blir en avrundet, flytende pille når den er festet øverst (fasit stickInit/data-fstick).
// Stilene ligger i css/fin52.css.
import { hlApi } from './core.js';
import { m, draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const KEY = 'papir_salsty';
const STY = [['std', 'Standard', 'Hvitt kort med ring i beige felt', 'var(--pp-card,#fff)', 'inset 0 0 0 1px var(--pp-line,#d8d1c2)'],
  ['glass', 'Glass', 'Mørkt glass med uskarphet', 'linear-gradient(160deg,#5d6f7e,#3b4752)', 'inset 0 1px 0 rgba(255,255,255,.4)'],
  ['kvitt', 'Kvittering', 'Perforert skillelinje med hakk', 'var(--pp-card,#fff)', 'inset 0 -14px 0 -12px var(--pp-line,#d8d1c2),inset 0 0 0 1px var(--pp-line,#d8d1c2)'],
  ['farge', 'Fargebunn', 'Nederste del i merkefargen', 'linear-gradient(180deg,var(--pp-card,#fff) 62%,var(--pp-lab,#b23a2a) 62%)', 'inset 0 0 0 1px var(--pp-line,#d8d1c2)']];
const VALID = STY.map(([k]) => k);
const lsGet = () => { try { const v = localStorage.getItem(KEY); return VALID.includes(v) ? v : 'std'; } catch { return 'std'; } };
const lsSet = (v) => { try { localStorage.setItem(KEY, v); } catch { /* privat modus */ } };
const vib = (ms) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

/* ---------- 1. Saldokortet ---------- */
let lp = null, lpFired = 0, sheetEl = null, prevFocus = null;
function pick(k) {
  if (!VALID.includes(k)) return;
  lsSet(k); vib(6); haptic('tap');
  hlApi('/me/layout', { method: 'PUT', json: { salSty: k } }).catch(() => {}); // eldre server: 400 → bare på enheten
  draw();
  renderSheet();
}
function renderSheet() {
  if (!sheetEl) return;
  const cur = lsGet();
  sheetEl.querySelector('.p52-opts').innerHTML = STY.map(([k, n, sub, pv, sh]) => `<button type="button" class="p52-opt" role="radio" aria-checked="${cur === k}" data-p52sty="${k}"><span class="pv" style="background:${pv};box-shadow:${sh}"></span><span class="r"><b>${n}</b><span>${cur === k ? '✓' : ''}</span></span><small>${sub}</small></button>`).join('');
}
function openSheet() {
  if (sheetEl) return;
  prevFocus = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'p52-scrim';
  const el = document.createElement('div');
  el.className = 'p52-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Utseende på saldokortet');
  el.innerHTML = '<span class="p52-grab" aria-hidden="true"></span><div class="p52-sh"><b>Utseende på saldokortet</b><button type="button" class="p52-done" data-p52x>Ferdig</button></div><div class="p52-opts" role="radiogroup" aria-label="Utseende"></div>';
  // Arvet tema: arket ligger utenfor #app, så det henter Papir-fargene fra appens rot.
  const root = document.querySelector('#app > .m');
  if (root) for (const v of ['--pp-bg', '--pp-card', '--pp-ink', '--pp-line', '--pp-lab', '--pp-mut']) { const c = getComputedStyle(root).getPropertyValue(v); if (c) el.style.setProperty(v, c.trim()); }
  scrim.addEventListener('click', closeSheet);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p52sty]');
    if (b) return pick(b.dataset.p52sty);
    if (e.target.closest('[data-p52x]')) closeSheet();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } });
  document.body.append(scrim, el);
  sheetEl = el; sheetEl._scrim = scrim;
  renderSheet();
  el.querySelector('[aria-checked=true]')?.focus({ preventScroll: true });
}
function closeSheet() {
  if (!sheetEl) return;
  sheetEl._scrim.remove(); sheetEl.remove(); sheetEl = null;
  try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* */ }
}
function down(e) {
  if ((e.button ?? 0) > 0) return;
  const c = e.target.closest?.('[data-p52sal]');
  if (!c || c.closest('.pp-ed.on')) return; // i redigering (wiggle) flyttes kortet i stedet
  clear();
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; lpFired = Date.now(); vib(20); haptic('ok'); openSheet(); }, 500) };
}
function move(e) { if (lp && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) clear(); }
function clear() { if (lp) { clearTimeout(lp.t); lp = null; } }
// Et langt trykk skal ikke også åpne Kontoer (eller vise skjulte beløp).
function click(e) {
  if (!lpFired || !e.target.closest?.('[data-p52sal]')) return;
  if (Date.now() - lpFired < 900) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  lpFired = 0;
}
function ctx(e) { if (e.target.closest?.('[data-p52sal]')) e.preventDefault(); }
// Tastatur: kortet er en lenke; Shift+F10 / kontekstmeny-tasten åpner arket.
function key(e) { if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && e.target.closest?.('[data-p52sal]')) { e.preventDefault(); openSheet(); } }

/* ---------- 2. Månedslinja i Liste ---------- */
function stick() {
  const hs = document.querySelectorAll('#app .p43-mh');
  if (!hs.length) return;
  const y = scrollY;
  hs.forEach((h) => {
    const top = parseFloat(getComputedStyle(h).top) || 10;
    const on = y > 4 && h.getBoundingClientRect().top - top <= 2;
    if (on !== h.classList.contains('p52-on')) h.classList.toggle('p52-on', on);
  });
}

let booted = false;
export function boot52() {
  if (booted) return; booted = true;
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, { capture: true, passive: true });
  document.addEventListener('pointerup', clear, true);
  document.addEventListener('pointercancel', clear, true);
  document.addEventListener('click', click, true);
  document.addEventListener('contextmenu', ctx, true);
  document.addEventListener('keydown', key, true);
  addEventListener('scroll', stick, { passive: true });
  addEventListener('hashchange', closeSheet);
  // Valget følger brukeren mellom enheter (layout-feltet salSty), lokal verdi er bare buffer.
  hlApi('/me/layout').then((r) => { const v = r?.salSty; if (VALID.includes(v) && v !== lsGet()) { lsSet(v); if (document.documentElement.dataset.ui === 'mobile') draw(); } }).catch(() => {});
}
export function afterDraw52() {
  if (sheetEl && !document.querySelector('#app [data-p52sal]') && m.screen !== 'hjem') closeSheet();
  stick();
}
export const salSty52 = lsGet;
