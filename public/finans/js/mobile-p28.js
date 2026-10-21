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
const MER = { p: null, loaded: false, server: null, edit: false, add: false, lp: null, lpAt: 0, drag: null };
const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && Array.isArray(v.o) ? v : null; } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };
const toLocal = (r) => ({ o: (r?.o ?? []).map((k) => FROM[k] ?? k), h: (r?.h ?? []).map((k) => FROM[k] ?? k) });
async function merLoad() {
  if (MER.loaded) return; MER.loaded = true;
  MER.p = lsGet() ?? { o: [], h: [] };
  // Prompt 37: Gjøremål skal synes i Mer. Én gangs migrering fjerner «huske» fra skjult-listen (papir_mer_huske_v1).
  let mig = false;
  try { if (!localStorage.getItem('papir_mer_huske_v1')) { localStorage.setItem('papir_mer_huske_v1', '1'); mig = true; if (MER.p.h?.includes('huske')) { MER.p.h = MER.p.h.filter((k) => k !== 'huske'); lsSet(MER.p); } } } catch {}
  // Prompt 43 (claude-code-media-arr.md): den nye Media-siden erstatter «Spilles nå». Var den gamle skjult, vises Media
  // én gang og legges øverst i Mer (papir_mer_media_v2), ellers finner man ikke den nye siden.
  let migM = false;
  const media43 = (P) => { if (!P) return P; const h = (P.h ?? []).filter((k) => k !== 'media'), o = ['media', ...(P.o ?? []).filter((k) => k !== 'media')]; return { ...P, h, o }; };
  try { if (!localStorage.getItem('papir_mer_media_v2')) { localStorage.setItem('papir_mer_media_v2', '1'); migM = true; MER.p = media43(MER.p); lsSet(MER.p); } } catch {}
  try {
    const r = await hlApi('/prefs/mer');
    MER.server = true;
    if ((r?.o?.length || r?.h?.length)) { MER.p = toLocal(r); if (mig && MER.p.h.includes('huske')) { MER.p.h = MER.p.h.filter((k) => k !== 'huske'); merSave(); } if (migM) { MER.p = media43(MER.p); merSave(); } lsSet(MER.p); }
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
  const R = rows.map((r, i) => ({ k: r[0], n: r[1], s: r[2], i })).sort((a, b) => { const ia = o.indexOf(a.k), ib = o.indexOf(b.k); const rk = (r, x) => (x >= 0 ? x : r.k === 'brief' ? -1 : 999 + r.i); return rk(a, ia) - rk(b, ib); }); // prompt 36: Now Brief nytt øverst
  return { vis: R.filter((r) => !hd.has(r.k)), hid: R.filter((r) => hd.has(r.k)) };
}
const IC = (d, size = 21) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const LOCK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>';
/** Mer-lista. rows = [[rute, navn, undertekst], …] i standardrekkefølge (Subscription OS står rett etter Finans).
 *  Prompt 30: redigering med samme WiggleEditor-utseende som Hjem (claude-code-mer-wiggle.md): flytende verktøylinje
 *  (+ antall skjulte · ✓), separate kort som vugger, minus-merke øverst til venstre, lås på Innstillinger, og + viser
 *  «SKJULT · TRYKK + FOR Å VISE» under. */
export function merView(rows) {
  merLoad();
  const { vis, hid } = apply(rows), dark = !m.light, pal = ICP[dark ? 'dark' : 'light'], ed = MER.edit;
  const icon = (r) => `<span class="p25-mic" style="color:${pal[r.i % pal.length]}">${IC(MER_IC[r.k] ?? 'M12 12h.01')}</span>`;
  const text = (r) => `<span class="m-grow"><b class="pp-serif">${esc(r.n)}</b><span class="pp-mut">${esc(r.s)}</span></span>`;
  const badge = (r) => (r.k === 'set'
    ? `<span class="p30-wb lock" title="Kan ikke skjules" aria-label="Innstillinger kan ikke skjules">${LOCK}</span>`
    : `<button class="p30-wb" data-p28="merhide" data-k="${r.k}" aria-label="Skjul ${esc(r.n)}">${MINUS}</button>`);
  const row = (r, i) => ed
    ? `<div class="p28-mr p30-wc${i % 2 ? ' odd' : ''}" data-mer28="${r.k}">${badge(r)}${icon(r)}${text(r)}<span class="p28-grab" data-mergrab="${r.k}" aria-label="Flytt ${esc(r.n)}" role="button" tabindex="0">${IC('M4 8h16M4 12h16M4 16h16', 20)}</span></div>`
    : `<a href="#/${r.k}" class="p28-mr" data-mer28="${r.k}">${icon(r)}${text(r)}<span class="pp-mut" aria-hidden="true">›</span></a>`;
  const pills = ed ? `<div class="p28-pills" role="toolbar" aria-label="Rediger Mer">${hid.length ? `<button class="p28-pill plus${MER.add ? ' on' : ''}" data-p28="meradd" aria-expanded="${!!MER.add}" aria-label="Vis skjulte (${hid.length})">${PLUS}<b>${hid.length}</b></button>` : '<span></span>'}<button class="p28-pill ok" data-p28="merdone" aria-label="Ferdig">${CHECK}</button></div>` : '';
  const hidden = ed && MER.add && hid.length ? `<span class="p28-mhl">SKJULT · TRYKK + FOR Å VISE</span><div class="p30-wlist p30-whid">${hid.map((r) => `<div class="p28-mr p30-wc" data-p28="mershow" data-k="${r.k}" role="button" tabindex="0" aria-label="Vis ${esc(r.n)}"><span class="p30-wb">${PLUS}</span><span class="p28-dim">${icon(r)}${text(r)}</span></div>`).join('')}</div>` : '';
  const list = ed ? `<div class="p30-wlist" data-merlist>${vis.map(row).join('')}</div>` : `<div class="pp-card pp-list p24-mer p25-mer p28-mer" data-merlist>${vis.map(row).join('')}</div>`;
  return `${pills}<div class="p28-merw${ed ? ' ed p28-mer' : ''}">${list}${hidden}${ed ? '' : '<span class="p28-mhint">Hold inne for å endre rekkefølgen eller skjule moduler.</span>'}</div>`;
}
const MINUS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
const PLUS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function setOrder(vis, hid) { MER.p = { o: [...vis, ...hid], h: hid }; merSave(); }
const curKeys = () => ({ vis: [...document.querySelectorAll('[data-merlist] [data-mer28]')].map((x) => x.dataset.mer28), hid: [...(MER.p?.h ?? [])].filter((k) => k !== 'set') });

/* Hold inne 0,48 s → redigeringsmodus (avbrytes ved > 8 px bevegelse). ≡ drar raden; naboene glir på plass. */
function merDown(e) {
  if (m.screen !== 'mer' || (e.button ?? 0) > 0) return false;
  const g = e.target.closest?.('[data-mergrab]');
  if (g && MER.edit) {
    const row = g.closest('[data-mer28]'), list = row.parentElement, rows = [...list.querySelectorAll('[data-mer28]')];
    const i = rows.indexOf(row), h = row.offsetHeight + (parseFloat(getComputedStyle(list).rowGap) || 0);
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
  if (a === 'merdone') { MER.edit = false; MER.add = false; haptic('ok'); }
  else if (a === 'meradd') { MER.add = !MER.add; haptic('tap'); }
  else if (a === 'merhide' && k !== 'set') { setOrder(vis.filter((y) => y !== k), [...hid, k]); haptic('tap'); }
  else if (a === 'mershow') { setOrder([...vis, k], hid.filter((y) => y !== k)); if (hid.length <= 1) MER.add = false; haptic('ok'); }
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
// Prompt 30 (claude-code-wiggle-verktoylinje.md): verktøylinja (+ · ✓) ligger øverst i scroll-innholdet, 8 px under
// toppen, og innholdet får 64 px padding-top (animert 280 ms) så den aldri dekker søkefeltet eller minus-merket.
// Linja flyttes derfor til første barn av .m-scroll uansett hvilken modul som tegnet den (Hjem, Finans, Mat, Mer).
const PL = { on: false, scr: '' };
function pillsPlace() {
  const sc = document.querySelector('#app .m-scroll'), el = sc?.querySelector('.p28-pills');
  if (el && el.parentElement !== sc) sc.prepend(el);
  if (el) {
    // Samme bredde som innholdet under (kortene/flisene), også når kolonnen er midtstilt på Fold/nettbrett.
    const ref = [...sc.children].find((x) => x !== el && x.offsetWidth > 0), cs = getComputedStyle(sc);
    el.style.left = ref ? `${ref.offsetLeft}px` : cs.paddingLeft; el.style.width = ref ? `${ref.offsetWidth}px` : `calc(100% - ${cs.paddingLeft} - ${cs.paddingRight})`; el.style.right = 'auto';
  }
  const on = !!el, same = PL.scr === m.screen;
  if (sc && on !== PL.on && same && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const base = getComputedStyle(sc).paddingTop;
    sc.animate?.([{ paddingTop: on ? '0px' : 'calc(64px + 0px)' }, { paddingTop: base }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (el) el.animate?.([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
  PL.on = on; PL.scr = m.screen;
}
export function afterDraw28() { pillsPlace(); }
let booted = false;
export function boot28() { if (booted) return; booted = true; kbBoot(); addEventListener('resize', pillsPlace); }
export function leave28(next) { if (next !== 'mer') { MER.edit = false; MER.add = false; MER.drag = null; } }
export const merEditing = () => MER.edit;
// Prompt 44 (Mer ny, mobile-p44.js): samme lagring (papir_mer / /api/prefs/mer), skjulte speiles i papir_mer_hid.
export function merSplit(rows) { merLoad(); return apply(rows); }
function hidSave() { try { localStorage.setItem('papir_mer_hid', JSON.stringify(MER.p?.h ?? [])); } catch {} merSave(); }
export function merHide(k) { if (k === 'set') return; const P = MER.p ?? lsGet() ?? { o: [], h: [] }; MER.p = { o: P.o ?? [], h: [...new Set([...(P.h ?? []), k])] }; hidSave(); }
export function merShowAll() { const P = MER.p ?? lsGet() ?? { o: [], h: [] }; MER.p = { o: P.o ?? [], h: [] }; hidSave(); }
export const down28 = (e) => merDown(e);
export const move28 = (e) => merMove(e);
export const up28 = (e) => merUp(e);
export function bind28(e, t) { return merClick(e, t); }
