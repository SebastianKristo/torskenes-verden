// Prompt 46 (PWA46): mobilpunktene i design_handoff_homelab/prompts/prompt-46-pakke/ (kontrakt CONTRACT46.md).
//   1. Kart (Mer → Kart, #/tkart) – mobile-p46k.js.
//   2. Innstillinger → Nyheter (#/set/nyheter): innstillingene er flyttet fra Nyheter-siden; «…» på Nyheter har en snarvei.
//      Kategori per kilde som nedtrekksmeny, favicon, «Sammendrag per kategori» og egne kategorier / «For deg» når serveren har det.
//   3. Glimt-sammendrag øverst i hver kategori (GET /api/rss/digest?cat=, tåler 404 → bare «Siste» har sammendrag som før).
//   4. Vær: modusvelgeren (Temperatur / Nedbør / Vind) med Liquid Glass-dråpe som glir og kan dras (fasit Vaer.dc.html `seg`).
//   5. Ruter: posisjonsvarsel «Slå på ›» på Min reise-kortet (innstillingene på kortet i wiggle ligger i mobile-p41b.js).
// Resten av prompt 46 i PWA-en ligger i de eksisterende filene (Vær Min posisjon i mobile-wx.js, Gjøremål i mobile-p44.js,
// Bibel på brett i mobile-p37b.js, prøveperioder i mobile-p32.js/-p37b.js/-subs.js, profilring i mobile.css).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { WX } from './mobile-wx.js';
import { newsSetBody, newsLoad, paperState as P } from './mobile-paper.js';
import * as KART from './mobile-p46k.js';

const NEWER = 'Krever en nyere Homelab-server';
const errMsg = (e) => (e?.status === 404 || e?.status === 405 ? NEWER : e?.message || 'Noe gikk galt');
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* =====================================================================
   Nyheter: «…»-meny, Innstillinger → Nyheter, sammendrag per kategori, egne kategorier
   ===================================================================== */
const NW = { menu: false, dg: {}, dgBusy: {}, dgMiss: false, newCat: null, interest: '' };
function newsMenu() {
  return `<span class="p46-nmw"><button type="button" class="pp-gear p46-nmb" data-p46="nmenu" aria-haspopup="menu" aria-expanded="${NW.menu}" aria-label="Flere valg"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>${NW.menu ? `<span class="p46-nmenu" role="menu"><a role="menuitem" href="#/set/nyheter" data-p46="nset">Nyhetsinnstillinger</a></span>` : ''}</span>`;
}
const settings = () => P.news?.settings ?? {};
const perCatOn = () => settings().catSummary !== false;
/** Sammendraget for valgt kategori (ikke «Siste», som beholder det felles). Skjules ved feil, < 3 saker eller uten data. */
function digestOf(cat) {
  if (!cat || cat === 'siste' || !perCatOn() || NW.dgMiss || settings().aiSummary === false) return null;
  const D = NW.dg[cat];
  if (!D && !NW.dgBusy[cat]) digestLoad(cat);
  return D ?? (NW.dgBusy[cat] ? 'busy' : null);
}
async function digestLoad(cat, force = false) {
  if (NW.dgMiss || NW.dgBusy[cat]) return;
  NW.dgBusy[cat] = true;
  try {
    // Felles form (SERVER46-API.md, WEB46): GET /api/rss/summary?cat= → {points:[{text, id|url}], updatedAt, count} | {text} | {empty:true}
    const r = await hlApi(`/rss/summary?cat=${encodeURIComponent(cat)}${force ? '&refresh=1' : ''}`);
    NW.dg[cat] = r && !r.empty && (r.text || r.points?.length) && (r.count ?? 3) >= 3 ? r : { none: true };
  } catch (e) { if (e.status === 404 || e.status === 405) NW.dgMiss = true; NW.dg[cat] = { none: true }; }
  NW.dgBusy[cat] = false;
  if (m.screen === 'nyheter') draw();
}
function newsCatDigest(Pn, cats) {
  const cat = Pn.cat, D = digestOf(cat);
  if (!D) return '';
  const name = cats.find(([k]) => k === cat)?.[1] ?? cat;
  if (D === 'busy') return `<div class="pp-lead p46-dg sk" aria-busy="true"><span class="pp-lab">✦ GLIMT · ${esc(String(name).toUpperCase())}</span><i></i><i></i><i class="s"></i></div>`;
  if (D.none) return '';
  const at = D.updatedAt ?? D.generatedAt, upd = at ? new Date(at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';
  const pts = Array.isArray(D.points) ? D.points.slice(0, 5) : [];
  return `<div class="pp-lead p46-dg"><span class="pp-lab">✦ GLIMT · ${esc(String(name).toUpperCase())}${upd ? ` · OPPDATERT KL. ${esc(upd)}` : ''}</span>
    ${pts.length ? `<ul>${pts.map((p) => { const t = typeof p === 'string' ? p : p.text ?? '', u = typeof p === 'string' ? null : p.url ?? p.link ?? null; return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}</li>`; }).join('')}</ul>` : `<p>${esc(D.text)}</p>`}</div>`;
}
const newsCatDigestOn = (Pn) => { const D = digestOf(Pn.cat); return !!D && D !== 'busy' && !D.none; };
/** Ekstra bryter i Innstillinger → Nyheter. */
function newsTogExtra(st, tog) { return tog('catSummary', '✦ Sammendrag per kategori', 'Eget Glimt-sammendrag øverst i hver kategori. «Siste» har det felles.', st.catSummary !== false); }
/** KATEGORIER: egne kategorier (navn + nøkkelord) og interesser for «For deg» – vises når serveren sender dem. */
function newsCatSection(cats) {
  const N = P.news; if (!N) return '';
  // Felles form: GET /api/rss → customCategories:[{id,name,keywords[],icon,order}], interests:["Oslo", …]. Vises når serveren har det.
  const own = Array.isArray(N.customCategories) ? N.customCategories : (N.categories ?? []).filter((c) => c.custom);
  const ints = Array.isArray(N.interests) ? N.interests : null;
  if (!Array.isArray(N.customCategories) && !ints) return '';
  return `<div class="pp-row"><span class="pp-lab">KATEGORIER</span></div>
    <div class="pp-card pp-tight p46-ncat">${own.map((c) => `<div class="pp-feed"><span class="m-grow"><b>${esc(c.name)}</b>${c.keywords?.length ? `<span class="pp-mut m-ell">${esc(c.keywords.join(', '))}</span>` : ''}</span><button class="pp-x" data-p46="ncatdel" data-id="${esc(c.id)}" aria-label="Slett ${esc(c.name)}">×</button></div>`).join('')}
      ${NW.newCat ? `<form class="pp-col p46-ncf" data-p46f="ncat"><input class="pp-in" id="p46-ncn" name="n" value="${esc(NW.newCat.n)}" placeholder="Navn, f.eks. Elbil" maxlength="30" autocomplete="off" required><input class="pp-in" name="k" value="${esc(NW.newCat.k)}" placeholder="Nøkkelord (valgfritt, kommaseparert)" autocomplete="off"><span class="p46-two"><button type="button" class="pp-btn" data-p46="ncatx">Avbryt</button><button type="submit" class="pp-btn ink">Lagre kategori</button></span></form>` : '<button type="button" class="p46-nadd" data-p46="ncatnew">+ Ny kategori</button>'}</div>
    ${ints ? `<div class="pp-row"><span class="pp-lab">✦ FOR DEG · INTERESSER</span></div><div class="pp-card p46-ints">${ints.map((w) => { const t = typeof w === 'string' ? w : w.word; return `<span class="p46-int">${esc(t)}<button type="button" data-p46="intdel" data-w="${esc(t)}" aria-label="Fjern ${esc(t)}">×</button></span>`; }).join('')}<form data-p46f="int" class="p46-intf"><input class="pp-in" name="w" value="${esc(NW.interest)}" placeholder="Legg til interesse" autocomplete="off" maxlength="30"></form></div>` : ''}`;
}

/* =====================================================================
   Vær: Liquid Glass-velgeren (Temperatur / Nedbør / Vind)
   ===================================================================== */
const SEG = { last: null, d: null, moved: false };
const MODES = ['temp', 'rain', 'wind'];
const segX = (i) => 3 + i * 46;
function segAfter() {
  const el = document.querySelector('.vx .vx-modes'); if (!el || el.dataset.p46) return;
  el.dataset.p46 = '1'; el.classList.add('p46-seg');
  const drop = document.createElement('span'); drop.className = 'p46-drop'; drop.setAttribute('aria-hidden', 'true');
  el.prepend(drop);
  const idx = Math.max(0, MODES.indexOf(WX.mode));
  const from = SEG.last != null && SEG.last !== idx && !reduce() ? SEG.last : idx;
  drop.style.transition = 'none'; drop.style.transform = `translateX(${segX(from)}px)`;
  if (from !== idx) { void drop.offsetWidth; drop.style.transition = ''; drop.style.transform = `translateX(${segX(idx)}px)`; } else requestAnimationFrame(() => { drop.style.transition = ''; });
  SEG.last = idx;
  const btns = [...el.querySelectorAll('button[data-wx="mode"]')];
  el.addEventListener('pointerdown', (e) => { SEG.d = { x0: e.clientX, b: segX(Math.max(0, MODES.indexOf(WX.mode))), t: performance.now(), l: e.clientX, i: null, id: e.pointerId }; SEG.moved = false; });
  el.addEventListener('pointermove', (e) => {
    const d = SEG.d; if (!d) return;
    const dx = e.clientX - d.x0; if (!SEG.moved && Math.abs(dx) < 5) return;
    if (!SEG.moved) { SEG.moved = true; try { el.setPointerCapture(d.id); } catch {} }
    const now = performance.now(), vel = (e.clientX - d.l) / Math.max(1, now - d.t); d.t = now; d.l = e.clientX;
    const nx = Math.max(1, Math.min(segX(2) + 2, d.b + dx)), ni = Math.round((nx - 3) / 46);
    if (ni !== d.i) { d.i = ni; haptic('tick'); btns.forEach((b, j) => b.classList.toggle('p46-big', j === ni && !reduce())); }
    const v = Math.min(1, Math.abs(vel) / 1.2);
    drop.style.transition = 'transform .06s linear';
    drop.style.transform = reduce() ? `translateX(${nx}px)` : `translateX(${nx}px) scale(${(1.14 + v * 0.18).toFixed(3)},${(0.94 - v * 0.08).toFixed(3)})`;
  });
  const up = (e) => {
    const d = SEG.d; SEG.d = null; if (!d || !SEG.moved) return;
    btns.forEach((b) => b.classList.remove('p46-big'));
    const cur = new DOMMatrix(getComputedStyle(drop).transform).m41 || d.b, ni = Math.max(0, Math.min(2, Math.round((cur - 3) / 46)));
    drop.style.transition = ''; drop.style.transform = `translateX(${segX(ni)}px)`;
    if (e.type !== 'pointercancel' && MODES[ni] !== WX.mode) { SEG.last = ni; setTimeout(() => { WX.mode = MODES[ni]; draw(); }, reduce() ? 0 : 380); }
    setTimeout(() => { SEG.moved = false; }, 60);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // Ingen klikk etter et drag.
  el.addEventListener('click', (e) => { if (SEG.moved) { e.stopPropagation(); e.preventDefault(); } }, true);
}

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
export function view46(scr, sub) {
  if (scr === 'tkart') return KART.kartView();
  if (scr === 'set' && sub === 'nyheter') return newsSetBody();
  return null;
}
export function layer46() { return ''; }
export function afterDraw46() {
  KART.afterKart();
  if (m.screen === 'vaer') segAfter();
  if (m.screen !== 'nyheter') NW.menu = false;
  const root = document.querySelector('#app > .m');
  root?.classList.toggle('p46-kart', m.screen === 'tkart');
}
export function load46(scr, sub) {
  if (scr === 'tkart') return KART.loadKart(sub);
  if (scr === 'set' && sub === 'nyheter') return newsLoad();
  return null;
}
async function intsPut(words) {
  try { const r = await hlApi('/rss/interests', { method: 'PUT', json: { words: words.map((v) => (typeof v === 'string' ? v : v.word)).slice(0, 40) } }); if (P.news) P.news.interests = r?.interests ?? words; } catch (e) { flash(errMsg(e)); }
  draw();
}
async function catSave(body) {
  try { await hlApi('/rss/categories', { method: 'POST', json: body }); NW.newCat = null; await newsLoad(); flash(`${body.name} er lagt til ✓`); }
  catch (e) { flash(errMsg(e)); }
  draw();
}
export async function bind46(e, t) {
  if (await KART.bindKart(e, t)) return true;
  const x = t.closest?.('[data-p46]');
  if (!x) { if (NW.menu && !t.closest?.('.p46-nmw')) { NW.menu = false; draw(); } return false; }
  const a = x.dataset.p46;
  if (a === 'nset') { NW.menu = false; return false; } // vanlig lenke
  e.preventDefault();
  switch (a) {
    case 'nmenu': NW.menu = !NW.menu; haptic('tap'); draw(); return true;
    case 'trgeo': haptic('tap'); navigator.geolocation?.getCurrentPosition(() => draw(), () => flash('Gi appen tilgang til posisjon «Alltid» i innstillingene på telefonen.'), { timeout: 10000 }); return true;
    case 'ncatnew': NW.newCat = { n: '', k: '' }; draw(); setTimeout(() => document.getElementById('p46-ncn')?.focus(), 40); return true;
    case 'ncatx': NW.newCat = null; draw(); return true;
    case 'ncatdel': try { await hlApi(`/rss/categories/${encodeURIComponent(x.dataset.id)}`, { method: 'DELETE' }); await newsLoad(); flash('Kategorien er slettet. Kildene står nå på Auto.'); } catch (err) { flash(errMsg(err)); } draw(); return true;
    case 'intdel': await intsPut((P.news?.interests ?? []).filter((w) => (typeof w === 'string' ? w : w.word) !== x.dataset.w)); return true;
    default: return false;
  }
}
export function input46(e, t) {
  if (KART.inputKart(e, t)) return true;
  if (t.closest?.('[data-p46f="ncat"]') && NW.newCat) { NW.newCat[t.name === 'k' ? 'k' : 'n'] = t.value; return true; }
  if (t.closest?.('[data-p46f="int"]')) { NW.interest = t.value; return true; }
  return false;
}
export async function change46(e, t) {
  if (t.matches?.('select[data-p46feedcat]')) {
    const id = t.dataset.p46feedcat, v = t.value;
    haptic('tab');
    try { await hlApi(`/rss/feeds/${encodeURIComponent(id)}`, { method: 'PATCH', json: { category: v } }); await newsLoad(); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  return false;
}
export async function submit46(e, f) {
  if (f.matches?.('[data-p46f="ncat"]')) {
    e.preventDefault();
    const n = String(f.n?.value ?? '').trim(), k = String(f.k?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    if (!n) return true;
    const cats = [...(P.news?.categories ?? []), ...(P.news?.customCategories ?? [])].map((c) => String(c.name).toLowerCase());
    if (cats.includes(n.toLowerCase())) { flash('Det finnes allerede en kategori med det navnet'); return true; }
    await catSave({ name: n, keywords: k, icon: 'lucide:tag' }); return true;
  }
  if (f.matches?.('[data-p46f="int"]')) {
    e.preventDefault(); const w = String(f.w?.value ?? '').trim(); if (!w) return true;
    const L = (P.news?.interests ?? []).map((v) => (typeof v === 'string' ? v : v.word));
    if (!L.some((v) => v.toLowerCase() === w.toLowerCase())) { NW.interest = ''; await intsPut([...L, w]); }
    return true;
  }
  return false;
}

export function boot46() {
  globalThis.P46 = { ...globalThis.P46, newsMenu, newsCatDigest, newsCatDigestOn, newsTogExtra, newsCatSection, kart: KART };
  // Bytte kategori i Nyheter: sammendraget for den nye kategorien hentes (cache per kategori på serveren).
  addEventListener('hashchange', () => { if (m.screen !== 'tkart') KART.leaveKart(); });
}
