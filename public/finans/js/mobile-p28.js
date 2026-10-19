// Prompt 28 (PWA): Mer med hold inne → flytt/skjul (claude-code-mer-rekkefolge.md, fasit Mobil Papir App → Mer),
// Subscription OS i Mer, ingen skanneknapp på Mer, og 8 px luft mellom tastaturet og fanelinja (claude-code-sok-tastatur.md).
// Resten av prompt 28 ligger der koden fra før bor: væranimasjon (/assets/js/weather-fx.js + mobile-wx22.js), stedssøk og
// bunnlinje (mobile-wx22.js), «Legg til abonnement»-arket og skjermbilde-fiksen (mobile-subs.js + sub-shot.js), wiggle-modus
// (mobile-paper3.js edBlocks + mobile-p20.js), Ruter-kortet (mobile-p27.js), Chat (mobile-chat.js), konto-farger (mobile-set.js).
// Lagring: GET/PUT /api/prefs/mer {o:[nøkler], h:[skjulte]} per konto (SERVER28). Mangler endepunktet, brukes localStorage.
import { esc, hlApi } from './core.js';
import { m, draw } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { ICP, MER_IC } from './mobile-p25.js';

/* =====================================================================
   1. Mer: rekkefølge og skjulte moduler
   ===================================================================== */
// Rutenøkkel i PWA-en ↔ nøkkel i /api/prefs/mer (samme som fasiten og de native appene).
const TO = { hl: 'hjem', dom: 'domener', spor: 'sporing', chat: 'chat', kal: 'kalender', bd: 'bursdag', huske: 'huske', fam: 'kart', media: 'media', hjem: 'finans', sub: 'abo', nyheter: 'rss', set: 'innst' };
const FROM = Object.fromEntries(Object.entries(TO).map(([a, b]) => [b, a]));
FROM.abonnementer = 'sub'; FROM.innstillinger = 'set'; FROM.familie = 'fam'; FROM.nyheter = 'nyheter';
const LS = 'papir_mer';
const MER = { p: null, loaded: false, server: null, edit: false, lp: null, lpAt: 0, drag: null };
const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && Array.isArray(v.o) ? v : null; } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };
const toLocal = (r) => ({ o: (r?.o ?? []).map((k) => FROM[k] ?? k), h: (r?.h ?? []).map((k) => FROM[k] ?? k) });
async function merLoad() {
  if (MER.loaded) return; MER.loaded = true;
  MER.p = lsGet() ?? { o: [], h: [] };
  try {
    const r = await hlApi('/prefs/mer');
    MER.server = true;
    if ((r?.o?.length || r?.h?.length)) { MER.p = toLocal(r); lsSet(MER.p); }
    else if (MER.p.o.length || MER.p.h.length) merSave(); // første gang: lokal rekkefølge flyttes til kontoen
    if (m.screen === 'mer' && !MER.drag) draw();
  } catch { MER.server = false; }
}
async function merSave() {
  lsSet(MER.p);
  if (MER.server === false) return;
  try { await hlApi('/prefs/mer', { method: 'PUT', json: { o: MER.p.o.map((k) => TO[k] ?? k), h: MER.p.h.map((k) => TO[k] ?? k) } }); MER.server = true; }
  catch (e) { if (e.status === 404) MER.server = false; }
}
/** Sorterer radene etter lagret rekkefølge; nye moduler legges sist i standardrekkefølge. Innstillinger kan ikke skjules. */
function apply(rows) {
  const P = MER.p ?? lsGet() ?? { o: [], h: [] }, o = P.o ?? [], hd = new Set((P.h ?? []).filter((k) => k !== 'set'));
  const R = rows.map((r, i) => ({ k: r[0], n: r[1], s: r[2], i })).sort((a, b) => { const ia = o.indexOf(a.k), ib = o.indexOf(b.k); return (ia < 0 ? 999 + a.i : ia) - (ib < 0 ? 999 + b.i : ib); });
  return { vis: R.filter((r) => !hd.has(r.k)), hid: R.filter((r) => hd.has(r.k)) };
}
const IC = (d, size = 21) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const LOCK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>';
/** Mer-lista. rows = [[rute, navn, undertekst], …] i standardrekkefølge (Subscription OS står rett etter Finans). */
export function merView(rows) {
  merLoad();
  const { vis, hid } = apply(rows), dark = !m.light, pal = ICP[dark ? 'dark' : 'light'], ed = MER.edit;
  const icon = (r) => `<span class="p25-mic" style="color:${pal[r.i % pal.length]}">${IC(MER_IC[r.k] ?? 'M12 12h.01')}</span>`;
  const text = (r) => `<span class="m-grow"><b class="pp-serif">${esc(r.n)}</b><span class="pp-mut">${esc(r.s)}</span></span>`;
  const row = (r) => ed
    ? `<div class="p28-mr" data-mer28="${r.k}">${r.k === 'set' ? `<span class="p28-lock" title="Kan ikke skjules" aria-label="Innstillinger kan ikke skjules">${LOCK}</span>` : `<button class="p28-mh" data-p28="merhide" data-k="${r.k}" aria-label="Skjul ${esc(r.n)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>`}${icon(r)}${text(r)}<span class="p28-grab" data-mergrab="${r.k}" aria-label="Flytt ${esc(r.n)}" role="button" tabindex="0">${IC('M4 8h16M4 12h16M4 16h16', 20)}</span></div>`
    : `<a href="#/${r.k}" class="p28-mr" data-mer28="${r.k}">${icon(r)}${text(r)}<span class="pp-mut" aria-hidden="true">›</span></a>`;
  const top = ed ? `<div class="p28-mtop"><span class="m-grow"><span class="p28-mlab">REDIGERER MER</span><span class="p28-mtx">Dra ≡ for å flytte. Trykk − for å skjule.</span></span><button class="p28-mdone" data-p28="merdone">Ferdig</button></div>` : '';
  const hidden = hid.length ? `<span class="p28-mhl">SKJULT</span><div class="pp-card pp-list p24-mer p25-mer p28-mer p28-mhid">${hid.map((r) => `<div class="p28-mr"><button class="p28-ms" data-p28="mershow" data-k="${r.k}" aria-label="Vis ${esc(r.n)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><span class="p28-dim">${icon(r)}${text(r)}</span></div>`).join('')}</div>` : '';
  return `<div class="p28-merw${ed ? ' ed' : ''}">${top}<div class="pp-card pp-list p24-mer p25-mer p28-mer" data-merlist>${vis.map(row).join('')}</div>${hidden}${ed ? '' : '<span class="p28-mhint">Hold inne for å endre rekkefølgen eller skjule moduler.</span>'}</div>`;
}
function setOrder(vis, hid) { MER.p = { o: [...vis, ...hid], h: hid }; merSave(); }
const curKeys = () => ({ vis: [...document.querySelectorAll('[data-merlist] [data-mer28]')].map((x) => x.dataset.mer28), hid: [...(MER.p?.h ?? [])].filter((k) => k !== 'set') });

/* Hold inne 0,48 s → redigeringsmodus (avbrytes ved > 8 px bevegelse). ≡ drar raden; naboene glir på plass. */
function merDown(e) {
  if (m.screen !== 'mer' || (e.button ?? 0) > 0) return false;
  const g = e.target.closest?.('[data-mergrab]');
  if (g && MER.edit) {
    const row = g.closest('[data-mer28]'), list = row.parentElement, rows = [...list.querySelectorAll('[data-mer28]')];
    const i = rows.indexOf(row), h = row.offsetHeight;
    MER.drag = { row, rows, i, to: i, h, y: e.clientY, pid: e.pointerId };
    row.classList.add('lift'); haptic('tab');
    try { g.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault(); return true;
  }
  const r = e.target.closest?.('[data-mer28]');
  if (!r || MER.edit || e.target.closest('button')) return false;
  clearTimeout(MER.lp?.t);
  MER.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { MER.lp = null; MER.edit = true; MER.lpAt = Date.now(); haptic('tab'); navigator.vibrate?.(12); draw(); }, 480) };
  return false;
}
function merMove(e) {
  if (MER.lp && (Math.abs(e.clientX - MER.lp.x) > 8 || Math.abs(e.clientY - MER.lp.y) > 8)) { clearTimeout(MER.lp.t); MER.lp = null; }
  const D = MER.drag; if (!D || (D.pid != null && e.pointerId !== D.pid)) return false;
  const dy = e.clientY - D.y, to = Math.max(0, Math.min(D.rows.length - 1, D.i + Math.round(dy / D.h)));
  D.row.style.transform = `translateY(${dy}px) scale(1.02)`;
  if (to !== D.to) { D.to = to; haptic('tab'); }
  D.rows.forEach((x, j) => { if (x === D.row) return; const s = D.i < to ? (j > D.i && j <= to ? -D.h : 0) : (j < D.i && j >= to ? D.h : 0); x.style.transform = s ? `translateY(${s}px)` : ''; });
  if (e.cancelable) e.preventDefault();
  return true;
}
function merUp() {
  if (MER.lp) { clearTimeout(MER.lp.t); MER.lp = null; }
  const D = MER.drag; if (!D) return false;
  MER.drag = null;
  const keys = D.rows.map((x) => x.dataset.mer28), [k] = keys.splice(D.i, 1); keys.splice(D.to, 0, k);
  D.rows.forEach((x) => { x.style.transform = ''; x.classList.remove('lift'); });
  if (D.to !== D.i) { setOrder(keys, curKeys().hid); haptic('ok'); }
  draw(); return true;
}
function merClick(e, t) {
  if (m.screen !== 'mer') return false;
  // Slipp etter et langt trykk åpner ikke modulen.
  if (Date.now() - MER.lpAt < 700 && t.closest?.('[data-mer28]')) { e.preventDefault(); e.stopPropagation(); MER.lpAt = 0; return true; }
  const x = t.closest?.('[data-p28]');
  if (!x) { if (MER.edit && t.closest?.('[data-mer28]')) { e.preventDefault(); return true; } return false; }
  e.preventDefault();
  const a = x.dataset.p28, k = x.dataset.k, { vis, hid } = curKeys();
  if (a === 'merdone') { MER.edit = false; haptic('ok'); }
  else if (a === 'merhide' && k !== 'set') { setOrder(vis.filter((y) => y !== k), [...hid, k]); haptic('tap'); }
  else if (a === 'mershow') { setOrder([...vis, k], hid.filter((y) => y !== k)); haptic('ok'); }
  else return false;
  draw(); return true;
}

/* =====================================================================
   2. 8 px mellom tastaturet og fanelinja (Finans → Søk og alle sider med fanelinje)
   ===================================================================== */
// iOS: fanelinja ligger i layout-viewporten bak tastaturet → flytt den opp med tastaturets høyde + 8 px.
// Android/Chrome krymper vinduet, så fanelinja ligger kant i kant med tastaturet → 8 px luft. FAB følger --pp-navb.
let maxH = innerHeight;
function kbSync() {
  const vv = window.visualViewport, ae = document.activeElement;
  const typing = ae && (/^(TEXTAREA|SELECT)$/.test(ae.tagName) || (ae.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|file|color)$/.test(ae.type)));
  maxH = Math.max(maxH, innerHeight);
  const overlay = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
  const open = typing && (overlay > 120 || maxH - innerHeight > 150);
  const root = document.documentElement;
  root.classList.toggle('p28-kb', !!open);
  root.style.setProperty('--p28-kb', `${open ? Math.round(overlay) : 0}px`);
}
function kbBoot() {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', kbSync); vv?.addEventListener('scroll', kbSync);
  addEventListener('resize', kbSync);
  addEventListener('focusin', () => setTimeout(kbSync, 60)); addEventListener('focusout', () => setTimeout(kbSync, 60));
  addEventListener('orientationchange', () => { maxH = 0; setTimeout(kbSync, 300); });
}

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
// Pillene i wiggle-modus ligger i et eget lag (position:fixed) over lista; de følger innholdskolonnen, også på Fold med sidefelt.
function pillsPlace() {
  for (const el of document.querySelectorAll('.p28-pills')) {
    const host = el.parentElement, r = host?.getBoundingClientRect();
    if (!r || !r.width) continue;
    el.style.left = `${Math.max(8, r.left)}px`; el.style.right = 'auto'; el.style.width = `${Math.min(r.width, innerWidth - 16)}px`; el.style.margin = '0';
  }
}
export function afterDraw28() { pillsPlace(); }
let booted = false;
export function boot28() { if (booted) return; booted = true; kbBoot(); addEventListener('resize', pillsPlace); }
export function leave28(next) { if (next !== 'mer') { MER.edit = false; MER.drag = null; } }
export const down28 = (e) => merDown(e);
export const move28 = (e) => merMove(e);
export const up28 = (e) => merUp(e);
export function bind28(e, t) { return merClick(e, t); }
