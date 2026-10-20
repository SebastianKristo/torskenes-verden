// Papir (prompt 15): tilpassbare sider (hold inne → vugging, ▲ ▼ og −), fanelinja (fjerde fane, flytende skann og Søk),
// Finans-fanelinja og Mer-rutenettet, Finans → Søk med ✦ AI, transaksjonsdetaljer med original kvittering,
// kvitteringsbanneret, Finn «På vei» og arket «Ny sending» i Sporing. Valgene lagres per bruker i /api/me/layout.
import * as P30B from './mobile-p30b.js';
import { S, api, esc, n0, ini, hlApi, dd, cats, uploadReceipt } from './core.js';
import { m, draw, flash, domOk } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { TR, trkLoad, carOf, normNo, detectLocal } from './mobile-track.js';
import { hlData } from './mobile-hl.js';
import { FCOL, FO, fmSort, fmBar, ppTi, FM_MINUS, FM_PLUS, FM_LOCK } from './mobile-p20.js';
import { dragStart, dragging, dragEnd } from './mobile-p21.js';
import * as P24 from './mobile-p24.js';
import * as P25 from './mobile-p25.js';
import * as P26 from './mobile-p26.js';
import * as P27 from './mobile-p27.js';

/* ---------- Valg (lokal kopi + /api/me/layout) ---------- */

const LS = 'fh_p15';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
/** Leser feltene fra /api/me/layout (pages, finTabs, fourthTab, fab). */
export function take15(r) {
  if (!r) return;
  if (r.pages && typeof r.pages === 'object') { L.pages = { ...(L.pages ?? {}), ...r.pages }; if (!L.h2fix) fixH2(); }
  if (Array.isArray(r.finTabs) && r.finTabs.length) L.finTabs = r.finTabs;
  if (['auto', 'domener', 'sporing'].includes(r.fourthTab)) L.fourthTab = r.fourthTab;
  if (['float', 'inline'].includes(r.fab)) L.fab = r.fab;
  keep();
}
export function save15(patch) {
  Object.assign(L, patch); keep();
  if (patch.finTabs) P24.markCustom({ finTabs: patch.finTabs });
  hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {});
}

/* ---------- Fanelinja ---------- */

// Finans-fanene brukeren kan velge (opptil 4); Mer er alltid siste fane.
export const FT = {
  oversikt: ['hjem', 'Oversikt', '◎'], liste: ['liste', 'Liste', '≡'], finn: ['finn', 'Finn', '⇄'], sok: ['sok', 'Søk', '⌕'], budsjett: ['budsjett', 'Budsjett', '◔'],
  kvitteringer: ['kv', 'Kvitteringer', '▢'], aksjer: ['aks', 'Aksjer', '↗'], abonnementer: ['sub', 'Abonnementer', '↻'], kontoer: ['konto', 'Kontoer', '▤'], boliger: ['dir', 'Boliger', '⌂'], chat: ['chat', 'Chat', '✦'],
};
export const FT_DEF = ['oversikt', 'liste', 'finn', 'sok'];
// Prompt 24: profilene (Finans + Boliger) har fem Finans-faner; ellers fire.
export const finKeys = () => { const v = [...new Set((L.finTabs ?? FT_DEF).filter((k) => FT[k]))]; return (v.length ? v : FT_DEF).slice(0, 5); }; // Prompt 26: maks 5 faner (Mer kommer alltid sist)
/** Setter Finans-fanene (profilvalg). push = lagre i /api/me/layout også. */
export function setFinTabs(list, push = true) { L.finTabs = list.filter((k) => FT[k]); keep(); if (push) hlApi('/me/layout', { method: 'PUT', json: { finTabs: L.finTabs } }).catch(() => {}); }
export const finScreens = () => finKeys().map((k) => FT[k][0]);
export const fabStyle = () => (L.fab === 'inline' ? 'inline' : 'float');
export const fourthPref = () => L.fourthTab ?? 'auto';
// Pakker på vei: hentet, i transport, ute for levering eller klar for henting.
const WAY = ['picked_up', 'in_transit', 'out_for_delivery', 'ready_for_pickup'];
export function onWay() {
  const items = TR.data?.items;
  if (items) return items.filter((p) => !p.archived && WAY.includes(p.status)).length;
  const pk = hlData()?.packages;
  const list = Array.isArray(pk) ? pk : pk?.items ?? [];
  return list.filter((p) => WAY.includes(p.status)).length;
}
/** Fjerde fane: «Automatisk» er Domener, men Sporing når minst én pakke er på vei. */
export const fourth = () => { if (!domOk()) return 'spor'; const f = fourthPref(); return f === 'sporing' ? 'spor' : f === 'domener' ? 'dom' : onWay() > 0 ? 'spor' : 'dom'; };

/* ---------- Tilpass hver side: hold inne → vugging, ▲ ▼ og − ---------- */

const PG = {
  hl: [['h12', 'Glimt-brief'], ['h13', 'Dagens bibelvers'], ['h1', 'Søk'], ['h2', 'Pakker'], ['h15', 'Min reise'], ['h3', 'Avganger'], ['h11', 'Prøveperioder'], ['h10', 'Kalender'], ['h4', 'Snarveier'], ['h5', 'Siste nytt'], ['h6', 'Posisjon'], ['h7', 'Bolig'], ['h8', 'Gjøremål'], ['h9', 'Bursdager'], ['h14', 'Vel fremme']],
  hjem: [['f1', 'Saldo'], ['f2', 'Kvitteringer'], ['f3', 'Siste transaksjoner'], ['f4', 'Budsjett']],
  mat: [['m1', 'Dagens middag'], ['m2', 'Ukeplan'], ['m3', 'Mapper'], ['m4', 'Skann og import']],
  spor: [['t1', 'Faner'], ['t2', 'Pakkelisten'], ['t3', 'Legg til']],
};
const ED = { page: null, vis: {}, add: false };
export const edOn = (page) => ED.page === page; // prompt 36: brief-kortet sveipes ikke i redigeringsmodus
export const editing = (page) => ED.page === page;
export const edReset = () => { ED.page = null; ED.add = false; };
function fixH2() {
  const cur = L.pages?.hl;
  if (!L.h2fix && cur && (cur.hidden ?? []).includes('h2')) {
    L.pages = { ...L.pages, hl: { ...cur, hidden: cur.hidden.filter((k) => k !== 'h2') } };
    hlApi('/me/layout', { method: 'PUT', json: { pages: { hl: L.pages.hl } } }).catch(() => {});
  }
  L.h2fix = 1; keep();
}
function pageCfg(page) {
  const keys = PG[page].map(([k]) => k), cur = L.pages?.[page] ?? {};
  // Prompt 24: en eldre migrering kunne skjule Pakker (h2). Den vises igjen én gang; nye kort legges til etter lagret rekkefølge.
  const saved = (cur.order ?? []).filter((k) => keys.includes(k));
  // Prompt 32: nye kort settes inn etter kortet de står etter i standardrekkefølgen (Prøveperioder under Avganger).
  const order = [...saved];
  keys.forEach((k, i) => { if (order.includes(k)) return; const prev = keys.slice(0, i).reverse().find((x) => order.includes(x)); order.splice(prev ? order.indexOf(prev) + 1 : i === 0 ? 0 : order.length, 0, k); }); // prompt 34: et nytt første kort (Glimt-brief) havner øverst
  return { order, hidden: (cur.hidden ?? []).filter((k) => keys.includes(k)) };
}
function savePage(page, order, hidden) {
  L.pages = { ...(L.pages ?? {}), [page]: { order, hidden } }; keep();
  hlApi('/me/layout', { method: 'PUT', json: { pages: { [page]: { order, hidden } } } }).catch(() => {});
}
/** Setter sammen kortene på en side i lagret rekkefølge, uten skjulte kort. full = kort som går over hele bredden på Fold. */
// Prompt 28 (claude-code-hjem-wiggle.md): redigeringsmodus som iOS-hjemskjermen i alle wiggle-moduser (Hjem, Finans, Mat, Sporing).
// Ingen mørk instruksjonslinje og ingen ▲ ▼ (bortsett fra Sporing, til dra er på plass): to flytende piller utenfor
// scroll-innholdet (＋ antall skjulte → «Legg til widget», ✓ avslutter), minus-sirkel øverst til venstre på hvert kort,
// «✎ Rediger widget» midt på kort med innstillinger (Ruter), og kortene vugger ±0,45°.
const ED_SET = { h3: 'ruter', h2: 'pakker' }; // prompt 37: Pakker har «Vis bare når det er pakker» // kort med egne innstillinger
const MINUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
export function edBlocks(page, blocks, { full = [] } = {}) {
  const { order, hidden } = pageCfg(page), on = ED.page === page, lab = Object.fromEntries(PG[page]);
  const vis = order.filter((k) => !hidden.includes(k) && blocks[k]);
  ED.vis[page] = vis;
  const arrows = page === 'spor';
  const pills = on ? `<div class="p28-pills" role="toolbar" aria-label="Rediger siden">${arrows ? '<span></span>' : `<button class="p28-pill plus" data-ped="add" aria-label="Legg til widget${hidden.length ? ` (${hidden.length} skjult)` : ''}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${hidden.length ? `<b>${hidden.length}</b>` : ''}</button>`}
      <button class="p28-pill ok" data-ped="done" aria-label="Ferdig"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div>` : '';
  const html = vis.map((k, i) => `<div class="pp-ed${on ? ' on p28-wig' : ''}${i % 2 ? ' odd' : ''}${full.includes(k) ? ' full' : ''}" data-edk="${k}" data-edp="${page}">${on ? `<button class="p28-minus" data-ped="hide" data-k="${k}" aria-label="Skjul ${esc(lab[k])}">${MINUS}</button>${arrows ? '' : `<span class="p40-grab" data-p40grab="${k}" role="button" aria-label="Dra ${esc(lab[k])} for å flytte">≡</span>`}${ED_SET[k] && page === 'hl' ? `<button class="p28-edw" data-ped="widget" data-k="${k}">✎ Rediger widget</button>` : ''}${arrows ? `<div class="p28-arr"><button data-ped="mv" data-k="${k}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Flytt ${esc(lab[k])} opp">▲</button><button data-ped="mv" data-k="${k}" data-d="1" ${i === vis.length - 1 ? 'disabled' : ''} aria-label="Flytt ${esc(lab[k])} ned">▼</button></div>` : ''}` : ''}${blocks[k]}</div>`).join('');
  return pills + html + (on ? '' : '<span class="pp-edhint">Hold inne et kort for å flytte eller skjule det</span>') + (on && ED.add ? addSheet(page, hidden.filter((k) => (k !== 'h13' || !!blocks.h13) && k !== 'h15'), lab) : '');
}
function addSheet(page, hidden, lab) {
  return `<div class="p28-scrim" data-ped="addx"></div><div class="p28-sheet" role="dialog" aria-modal="true" aria-label="Legg til widget"><span class="p28-grip" aria-hidden="true"></span>
    <div class="p28-shh"><b>Legg til widget</b><button class="p28-x" data-ped="addx" aria-label="Lukk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    ${hidden.length ? `<div class="p28-wl">${hidden.map((k) => `<button data-ped="show" data-k="${k}"><span class="m-grow">${esc(lab[k])}</span><span class="p28-plus" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span></button>`).join('')}</div>` : '<p class="p28-empty">Alle widgets vises allerede. Trykk − på en widget for å skjule den.</p>'}</div>`;
}
// Prompt 21: hold inne 500 ms virker på hele kortet, også på lenker og knapper, og draget starter med en gang.
// Flyttes fingeren mer enn 8 px før det, avbrytes trykket (vanlig scrolling). I redigeringsmodus drar man kortene
// direkte; ▲ ▼ − virker fortsatt. Rekkefølgen lagres per side (/api/me/layout.pages) når fingeren slippes.
let lp = null, lpFired = false;
const edDrop = (page) => (keys) => {
  const { order, hidden } = pageCfg(page);
  const vis = keys.filter((k) => order.includes(k));
  savePage(page, [...vis, ...order.filter((k) => !vis.includes(k))], hidden); haptic('ok'); draw();
};
const edDrag = (e, el) => dragStart(e, el, { sel: '.pp-ed[data-edk]', attr: 'data-edk', drop: edDrop(el.dataset.edp) });
// Prompt 40 (claude-code-brief-sveip-og-wiggle-scroll.md, fasit edVals `ed.down`/`_edTm`/`_edSc`): den ekte årsaken til
// at man ikke fikk scrollet i redigering var (1) at det lange trykket som startet redigeringen også startet et drag av
// kortet under fingeren (dr satt → touchmove.preventDefault på hele dokumentet til fingeren ble sluppet, og på iOS kom
// slippet ofte ikke fram fordi kortet ble tegnet på nytt under fingeren), og (2) at draget i redigering startet etter
// bare 170 ms: på iOS kommer ingen pointermove mens nettleseren selv begynner å scrolle, så tidtakeren fyrte midt i
// scrollen og låste siden. Nå: langt trykk (500 ms) åpner BARE redigering. I redigering starter draget først når
// fingeren har holdt stille i 320 ms (< 6 px); touchmove > 6 px, scroll og pointercancel avbryter. ≡ drar med en gang.
const ED_HOLD = 320, ED_SLOP = 6;
const dpCancel = () => { if (dp) { clearTimeout(dp.t); dp = null; } };
let edBooted = false;
function edBoot() {
  if (edBooted) return; edBooted = true;
  document.addEventListener('touchmove', (e) => { const t = e.touches?.[0]; if (t && dp && (Math.abs(t.clientX - dp.x) > ED_SLOP || Math.abs(t.clientY - dp.y) > ED_SLOP)) dpCancel(); if (t && lp && (Math.abs(t.clientX - lp.x) > 8 || Math.abs(t.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; } }, { capture: true, passive: true });
  document.addEventListener('scroll', () => { dpCancel(); if (lp) { clearTimeout(lp.t); lp = null; } }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { dpCancel(); if (lp) { clearTimeout(lp.t); lp = null; } }, true);
  // Reserve: draget avsluttes alltid når fingeren slippes, også om slippet havnet på et element som ble tegnet bort.
  const fin = (e) => { dpCancel(); if (dragging()) dragEnd(e?.type?.startsWith('touch') ? undefined : e); };
  document.addEventListener('touchend', (e) => { if (!e.touches?.length) fin(e); }, true);
  document.addEventListener('touchcancel', (e) => { if (!e.touches?.length) fin(e); }, true);
  addEventListener('pointerup', fin, true);
  addEventListener('blur', () => fin());
}
export function edDown(e) {
  edBoot();
  lpFired = false;
  if ((e.button ?? 0) > 0) return;
  // ≡-håndtaket starter draget med en gang.
  const gr = e.target.closest?.('[data-p40grab]');
  if (gr && ED.page) { const b0 = gr.closest('[data-edk]'); if (b0 && !ED.add) { e.preventDefault?.(); navigator.vibrate?.(6); edDrag({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, preventDefault() {} }, b0); } return; }
  const b = e.target.closest?.('[data-edk]');
  if (!b || e.target.closest('input,textarea,select,[data-ped],[data-ppplus],.p28-pills')) return;
  // En pakke i Sporing har sitt eget lange trykk (velg flere).
  if (m.screen === 'spor' && e.target.closest('[data-pk]')) return;
  // Prompt 39 (claude-code-hjem-wiggle-scroll-ark.md): i redigering scroller vanlig sveip siden (touch-action: pan-y).
  // Draget starter først etter et kort hold (170 ms) uten at fingeren flytter seg mer enn 8 px.
  if (ED.page) {
    if (ED.page !== b.dataset.edp || ED.add) return;
    const ev = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    dpCancel();
    dp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { dp = null; if (b.isConnected) { navigator.vibrate?.(6); edDrag({ ...ev, clientX: lastXY.x ?? ev.clientX, clientY: lastXY.y ?? ev.clientY }, b); } }, ED_HOLD) };
    lastXY = {};
    return;
  }
  const page = b.dataset.edp;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    // Bare redigering: ingen kort dras før man trykker på nytt.
    lp = null; lpFired = true; ED.page = page; haptic('ok'); navigator.vibrate?.(15); draw();
  }, 500) };
}
let dp = null, lastXY = {};
export function edMove(e) {
  if (lp && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; }
  if (dp) { lastXY = { x: e.clientX, y: e.clientY }; if (Math.abs(e.clientX - dp.x) > ED_SLOP || Math.abs(e.clientY - dp.y) > ED_SLOP) dpCancel(); }
}
export function edUp() { if (lp) clearTimeout(lp.t); lp = null; if (dp) clearTimeout(dp.t); dp = null; }
/** Klikk: «Ferdig», ▲ ▼ − og «+ skjult kort». Mens siden redigeres, åpner ikke kortene noe. */
export function edClick(e, t) {
  if (lpFired) { lpFired = false; e.preventDefault(); e.stopPropagation(); return true; }
  const x = t.closest?.('[data-ped]');
  if (x) {
    e.preventDefault();
    const page = ED.page, k = x.dataset.k;
    if (!page) return true;
    const { order, hidden } = pageCfg(page);
    if (x.dataset.ped === 'done') { ED.page = null; ED.add = false; haptic('ok'); }
    else if (x.dataset.ped === 'add') { ED.add = true; haptic('tap'); }
    else if (x.dataset.ped === 'addx') { ED.add = false; }
    else if (x.dataset.ped === 'widget') { if (k === 'h3') { P27.hdEdit(); haptic('tap'); return true; } if (k === 'h2') { import('./mobile-p37b.js').then((x) => x.h2Open()); haptic('tap'); return true; } }
    else if (x.dataset.ped === 'hide') { savePage(page, order, [...new Set([...hidden, k])]); haptic('tap'); }
    // Vist igjen: legges sist.
    else if (x.dataset.ped === 'show') { savePage(page, [...order.filter((y) => y !== k), k], hidden.filter((y) => y !== k)); haptic('ok'); if (hidden.length <= 1) ED.add = false; }
    else if (x.dataset.ped === 'mv') {
      const vis = ED.vis[page] ?? order, v = vis.indexOf(k), w = vis[v + +x.dataset.d];
      if (v < 0 || !w) return true;
      const o = [...order], a = o.indexOf(k), b = o.indexOf(w);
      [o[a], o[b]] = [o[b], o[a]]; savePage(page, o, hidden); haptic('tab'); navigator.vibrate?.(8);
    }
    draw(); return true;
  }
  if (ED.page && t.closest?.('[data-edk]')) { e.preventDefault(); e.stopPropagation(); return true; }
  return false;
}

/* ---------- Kvitteringer til gjennomgang (banneret) ---------- */

export const RC = { n: null, t: 0 };
export async function rcCount(force = false) {
  if (!force && Date.now() - RC.t < 20000) return;
  RC.t = Date.now();
  try { const r = await api('/receipts?status=needs_review&count=1'); RC.n = Number.isFinite(+r?.count) ? +r.count : Array.isArray(r) ? r.filter((x) => x.status === 'needs_review').length : null; }
  catch { RC.n = null; }
}
export const rcNum = () => RC.n ?? S.boot?.reviewCount ?? (S.summary?.review ?? []).filter((r) => r.status === 'needs_review').length;
export function rcBanner() {
  const n = rcNum();
  if (!n) return '';
  return `<div class="pp-cta"><a href="#/kv" class="m-grow">${n} kvittering${n === 1 ? '' : 'er'} til gjennomgang</a><button data-pp="scan">Skann ›</button></div>`;
}

/* ---------- Finans: siste 15 transaksjoner ---------- */

export const FX = { recent: null, t: 0 };
export async function recentLoad(force = false) {
  if (!force && FX.recent && Date.now() - FX.t < 30000) return;
  try { const r = await api('/transactions?limit=15'); FX.recent = (r?.items ?? r ?? []).slice(0, 15); FX.t = Date.now(); } catch { FX.recent ??= null; }
}

/* ---------- Finans → Mer: rutenett med live-tall ---------- */

const IC = {
  hl: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  sok: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', liste: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', finn: 'M7 7h10l-3-3M17 17H7l3 3',
  budsjett: 'M12 3v9l6.4 6.4A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z', kv: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M9 8h4l2 2v6H9z',
  fast: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', konto: 'M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  aks: 'M3 20h18M5 16l5-5 3 3 6-7M15 7h4v4', rap: 'M5 20V10M10 20V4M15 20v-7M20 20v-11', sub: 'M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1M18 3v4h-4M6 21v-4h4',
  dir: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6', imp: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};
export const FM = { d: null };
export async function fmerLoad() {
  const ok = (p) => p.catch(() => null);
  const [rec, sub, dirs, stocks] = await Promise.all([ok(api('/recurring')), ok(api('/subscriptions')), ok(api('/folders')), ok(api('/stocks'))]);
  FM.d = { rec, sub, dirs, stocks };
  await rcCount();
}
const monthly = (r) => (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount);
export function finMerGrid() {
  const s = S.summary, D = FM.d ?? {}, inTabs = finScreens(), rv = rcNum();
  const rec = (Array.isArray(D.rec) ? D.rec : D.rec?.items ?? []).filter((r) => r.active !== false);
  const recNext = rec.reduce((a, r) => a + monthly(Math.abs(r.amount ?? 0) ? r : { ...r, amount: 0 }), 0);
  const bal = (S.boot?.accounts ?? []).reduce((a, x) => a + (x.balance ?? 0), 0);
  const st = D.stocks?.summary, chg = st?.changePct ?? st?.dayPct ?? null;
  const dirs = Array.isArray(D.dirs) ? D.dirs : D.dirs?.items ?? null;
  const T = [
    ...(P24.profRoot() ? [['hl', 'Hjem', 'Pakker, avganger og widgets']] : []), // Prompt 24: Hjem som flis i profilene
    ['sok', 'Søk', '✦ Med Glimt'], ['liste', 'Liste', 'Alle transaksjoner'], ['finn', 'Finn', 'Kjøp og salg'],
    ['budsjett', 'Budsjett', s?.budgetTotal ? `${n0(s.left ?? 0)} kr ${(s.left ?? 0) < 0 ? 'over' : 'igjen'}` : 'Ikke satt opp'],
    ['kv', 'Kvitteringer', rv ? `${rv} til gjennomgang` : 'Ingen til gjennomgang', rv],
    ['fast', 'Faste utgifter', D.rec ? `${n0(recNext)} kr/mnd` : 'Neste 30 dager'],
    ['konto', 'Kontoer', `${bal < 0 ? '−' : ''}${n0(bal)} kr`],
    ['aks', 'Aksjer', st ? `${n0(st.value ?? st.total ?? 0)} kr${chg != null ? ` · ${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %` : ''}` : D.stocks?.configured === false ? 'Ikke koblet til' : 'Trading 212'],
    ['rap', 'Rapporter', 'Måned og år'],
    ['sub', 'Subscription OS', D.sub ? `${n0(D.sub.monthly ?? 0)} kr/mnd` : 'Abonnementer'],
    ['dir', 'Boliger', dirs ? `${dirs.length} ${dirs.length === 1 ? 'bolig' : 'boliger'}` : 'Utgifter og prosjekter'],
    ['imp', 'Import', 'Bank, Excel og Finn'], ['set', 'Innstillinger', 'Kategorier og regler'],
  ].filter(([k]) => !inTabs.includes(k));
  // Prompt 20: egen ikonfarge per flis, og rekkefølgen brukeren har valgt (hold inne for å flytte). Linja med
  // Ferdig/Tilbakestill ligger under flisene, så de ikke flytter seg under fingeren når redigeringen starter.
  // Prompt 30: samme WiggleEditor som Hjem: minus-merke (skjul), lås på Innstillinger, + viser skjulte under rutenettet.
  const hidK = T.filter(([k]) => k !== 'set' && FO.hid.includes(k)), visT = T.filter((t) => !hidK.includes(t));
  const tile = ([k, n, v, badge], tag, extra) => `${tag === 'a' ? `<a class="pp-fmt" href="#/${k === 'set' ? 'set' : k}" data-fmk="${k}"` : `<button type="button" class="pp-fmt p30-fmh" data-p20="fmshow" data-k="${k}" aria-label="Vis ${esc(n)}"`} style="--fc:${FCOL[k] ?? 'var(--pp-lab)'}">${extra}<span class="pp-fmi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k]}"/></svg></span>
    ${badge ? `<span class="pp-fmb">${badge}</span>` : ''}<span class="pp-fmn"><b class="pp-serif">${esc(n)}</b><span class="${/▲/.test(v) ? 'pp-pos' : ''}">${esc(v)}</span></span></${tag === 'a' ? 'a' : 'button'}>`;
  const mark = (k, n) => (!FO.edit ? '' : k === 'set' ? `<span class="p30-wb lock" title="Kan ikke skjules" aria-label="Innstillinger kan ikke skjules">${FM_LOCK}</span>` : `<span class="p30-wb" role="button" tabindex="0" data-p20="fmhide" data-k="${k}" aria-label="Skjul ${esc(n)}">${FM_MINUS}</span>`);
  const hidSec = FO.edit && FO.add && hidK.length ? `<div class="p30-fmhh"><span class="p28-mhl">SKJULT · TRYKK + FOR Å VISE</span><button type="button" class="p30-reset" data-p20="fmreset">Tilbakestill rekkefølge</button></div><div class="pp-fmgrid p30-fmhid">${hidK.map((t) => tile(t, 'b', `<span class="p30-wb">${FM_PLUS}</span>`)).join('')}</div>` : '';
  return `${FO.edit ? fmBar(hidK.length) : ''}<div class="pp-fmgrid${FO.edit ? ' edit' : ''}">${fmSort(visT).map((t) => tile(t, 'a', mark(t[0], t[1]))).join('')}</div>${hidSec}${FO.edit ? (!hidK.length ? '<div class="p30-fmhh end"><button type="button" class="p30-reset" data-p20="fmreset">Tilbakestill rekkefølge</button></div>' : '') : '<span class="pp-edhint">Hold inne en flis for å flytte eller skjule den</span>'}`;
}

/* ---------- Finans → Søk med ✦ AI ---------- */

export const FS = { q: '', ai: false, busy: false, r: null, err: '' };
const simple = (q) => q && !/\s/.test(q) && q.length < 20;
// force: trykk på ✦ AI eller Enter med AI på kjører AI-søket med en gang, også for enkle ord.
let fsSeq = 0;
async function fsRun(force = false) {
  const q = FS.q.trim(), my = ++fsSeq;
  if (!q) { FS.r = null; draw(); return; }
  FS.busy = true; FS.err = ''; draw();
  try {
    let r;
    // Prompt 40 (claude-code-finans-sok-glimt-kort.md): standardspørsmål (abonnementer, forbruk i kategori/butikk, faste,
    // kontoer, budsjett) får et ryddig Glimt-svar med nøkkeltall og kort, med og uten ✦ Glimt på.
    const P40 = globalThis.P40;
    if (P40?.stdQ?.(q, FS.ai)) { const g = await P40.searchAsk(q).catch(() => null); if (my !== fsSeq) return; if (g) { FS.r = { ...(await plainSearch(q).catch(() => ({}))), glimt: g, q }; FS.busy = false; draw(); return; } }
    if (FS.ai && (force || !simple(q))) {
      // Prompt 25: ingen fast 25 s-grense. Tar søket lang tid, blir det en jobb på serveren («✦ Ollama tenker … 34 s av
      // 60 s») med fremdrift og Avbryt. Grensen er motorens; serveren går videre til neste motor når den nås.
      P25.cancelAi(); // et nytt søk erstatter et som fortsatt kjører
      try {
        r = await P25.aiJob({ q, force: true }, (J) => { if (!P25.jobTick(J) && m.screen === 'sok') draw(); });
        r = { ...r, ai: !r?.plainFirst && r?.mode !== 'plain', aiDown: r?.aiErrorKind ? r.aiErrorText || r.aiError || 'ukjent feil' : r?.aiError || '' };
      } catch (e) { r = e.name === 'AbortError' ? { ...(await plainSearch(q)), cancelled: true } : { ...(await plainSearch(q)), aiDown: e.message }; }
    } else r = await plainSearch(q);
    if (my !== fsSeq) return; // et nyere søk har tatt over
    FS.r = { ...r, q };
  } catch (e) { if (my !== fsSeq) return; FS.err = e.message; FS.r = null; }
  FS.busy = false; draw();
}
async function plainSearch(q) {
  try { return { ...(await api('/search?q=' + encodeURIComponent(q))), mode: 'plain' }; }
  catch (e) {
    if (!/404|Not Found/i.test(e.message)) throw e;
    const t = await api('/transactions?q=' + encodeURIComponent(q));
    return { mode: 'plain', hits: (t?.items ?? []).slice(0, 40).map((x) => ({ type: 'tx', txId: x.id, description: x.merchant || x.description, date: x.date, amount: x.amount, category: x.category, reason: 'navn' })) };
  }
}
const hitsOf = (r) => (r?.hits ?? r?.items ?? []).filter((h) => h && (h.txId ?? h.id ?? h.description));
export function paperSearch() {
  const r = FS.r, hits = hitsOf(r), q = FS.q.trim(), sum = hits.reduce((a, h) => a + (Number(h.amount) || 0), 0);
  const big = [...hits].sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))[0];
  const aiTxt = r?.cancelled && FS.ai ? 'Du avbrøt Glimt-søket. Her er treffene fra vanlig søk.' : r?.aiDown && FS.ai ? `Glimt svarte ikke: ${r.aiDown}` : r?.ai && (r.answer || r.summary) ? r.answer || r.summary
    : FS.ai && r && hits.length ? `Du har ${hits.length} treff på «${r.q}», til sammen ${n0(sum)} kr ${sum < 0 ? 'brukt' : 'inn'}. Største post er ${big?.description ?? big?.merchant ?? ''}.`
      : FS.ai && r && !hits.length ? `Jeg fant ingen kjøp som passer «${r.q}» i transaksjonene, kvitteringene eller varelinjene.` : '';
  const src = r?.cancelled ? 'Søk på nytt med ✦ Glimt for å prøve igjen.' : r?.aiDown ? 'Viser treffene fra vanlig søk. Sjekk nøkkel og motor under Innstillinger → AI og tolkning.' : r?.ai ? 'Glimt leste transaksjoner, kvitteringer og varelinjer.' : 'Fant vanlige treff først, AI oppsummerte.';
  const sugg = ['abonnementer', 'rema', 'spotify', 'hvor mye brukte jeg på mat?', 'strøm i oktober'];
  const G = r?.glimt;
  return `<form class="pp-search pp-fsq" data-ppfs role="search"><span aria-hidden="true">⌕</span><input class="m-input" id="pp-fsq" name="q" type="search" value="${esc(FS.q)}" enterkeyhint="search" placeholder="${FS.ai ? 'Spør Glimt, f.eks. «hva brukte jeg på kaffe?»' : 'Søk i transaksjoner og kvitteringer'}" aria-label="Søk i Finans" autocomplete="off">
      <button type="button" class="pp-aitog${FS.ai ? ' on' : ''}" data-ppfsk="ai" aria-pressed="${FS.ai}">✦ Glimt</button></form>${P27.sugBox(FS)}
    ${!q && !r ? `<div class="pp-col" style="gap:8px"><span class="pp-lab" style="padding:4px 2px 0">PRØV</span><div class="pp-chips pp-wrap">${sugg.map((n) => `<button class="pp-fchip" data-ppfsk="sugg" data-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <span class="pp-mut" style="line-height:1.45;padding:2px">Enkle ord som «rema» eller «spotify» søkes vanlig først. Med ✦ Glimt kan du spørre fritt, og Glimt leser også varelinjene i kvitteringene.</span></div>` : ''}
    ${FS.busy ? (P25.JOB.cur ? P25.jobCard() : '<div class="m-spin"></div>') : ''}${FS.err ? `<div class="pp-card pp-mut">${esc(FS.err)}</div>` : ''}
    ${!FS.busy && G ? globalThis.P40.glimtCard(G) : ''}
    ${!FS.busy && aiTxt && !G ? `<div class="pp-card pp-aians"><span class="pp-lab">✦ GLIMT</span><span class="pp-serif">${esc(String(aiTxt).replace(/\*\*|__|\[\d+\]/g, ''))}</span><span class="pp-mut">${esc(src)}</span></div>` : ''}
    ${!FS.busy && hits.length && !G?.cards?.length ? `<div class="pp-sec"><span>TREFF · ${hits.length}</span><span>Netto ${sum < 0 ? '−' : '+'}${n0(sum)} kr</span></div>
      <div class="pp-rows">${hits.slice(0, 60).map((h) => { const id = h.txId ?? (h.type === 'tx' ? h.id : null), name = h.description ?? h.merchant ?? h.title ?? 'Treff';
        return `<button class="pp-tx" ${id != null ? `data-tx="${esc(id)}" data-hl="${esc(q)}"` : ''}>${ppTi({ ...h, merchant: name }, ini(name), h.color)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(name)}</b><span class="pp-mut m-ell">${esc([h.date ? dd(h.date) : '', h.reason || h.why || h.category || ''].filter(Boolean).join(' · '))}</span></span><span class="pp-serif ${h.amount > 0 ? 'pp-pos' : ''}">${h.amount != null ? `${h.amount < 0 ? '−' : '+'}${n0(h.amount)}` : ''}</span></button>`; }).join('')}</div>` : ''}
    ${!FS.busy && r && !hits.length && !FS.ai && !G ? '<div class="pp-mut" style="padding:16px 4px;font-size:14px">Ingen treff. Slå på ✦ Glimt for å søke i innholdet i kvitteringene.</div>' : ''}`;
}

/* ---------- Transaksjonsdetaljer med original kvittering ---------- */

export const TX = { d: {}, err: {}, full: null, cat: false, bank: false, rule: true, busy: false };
export async function txLoad(id, force = false, hl = '') {
  if (id == null || (!force && TX.d[id])) return;
  try { TX.d[id] = await api(`/transactions/${id}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`); delete TX.err[id]; } // prompt 30: ?hl= markerer treffet
  catch (e) {
    // Eldre server: bruk raden vi har og /original for kvittering og bankrad.
    const base = [...(S.tx?.items ?? []), ...(FX.recent ?? []), ...(S.summary?.recent ?? [])].find((t) => t.id === id) ?? null;
    const o = await api(`/transactions/${id}/original`).catch(() => null);
    if (base || o) TX.d[id] = { ...(base ?? {}), receipt: o?.receiptUrl ? { status: 'attached', fileUrl: o.receiptUrl, lines: [], total: base ? Math.abs(base.amount) : null } : null, bank: o?.bankRow ?? null };
    else TX.err[id] = e.message;
  }
}
const kr2 = (v) => (Number(v) || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function paperTx(id) {
  const t = TX.d[id];
  if (!t) return TX.err[id] ? `<div class="pp-card pp-mut">${esc(TX.err[id])}</div>` : '<div class="m-spin"></div>';
  const name = t.merchant || t.description || 'Transaksjon', r = t.receipt, amt = Number(t.amount) || 0;
  const st = !r ? 'Mangler' : r.status === 'needs_review' ? 'Til gjennomgang' : 'Vedlagt';
  const dtxt = t.date ? new Date(t.date + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '';
  // Prompt 30: linjene beholder sin opprinnelige indeks, så markeringen (receipt.highlight.lineIndex) treffer riktig linje.
  const hl = P30B.hlInfo(id, t), hix = new Set(hl?.lineIndex ?? []);
  const lines = (r?.lines ?? []).map((l, i) => (l ? { ...l, i } : null)).filter((l) => l && l.name);
  const pdf = /pdf/i.test(r?.mime ?? '') || /\.pdf($|\?)/i.test(r?.fileUrl ?? '');
  const slip = r ? `<button class="pp-slip" data-pptx="full" ${r.fileUrl ? '' : 'disabled'} aria-label="Åpne original kvittering"><span class="pp-slipn">${esc(name.toUpperCase())}</span><span class="pp-slipd">${esc(t.date ? `${dd(t.date)}.${t.date.slice(0, 4)}` : '')} · KVITTERING</span><i></i>
      ${lines.length ? lines.map((l) => (hix.has(l.i) ? `<span class="pp-slipl p30-hl"${l.i === hl.lineIndex[0] ? ' data-p30hl="1"' : ''}><span>${P30B.markWord(l.name, hl.query, hl.matchedText)}</span><span>${l.price != null ? kr2(Math.abs(l.price)) : ''}</span></span>` : `<span class="pp-slipl"><span>${esc(l.name)}</span><span>${l.price != null ? kr2(Math.abs(l.price)) : ''}</span></span>`)).join('') : `<span class="pp-slipl"><span>${r.fileUrl ? 'Trykk for å se originalen' : 'Varelinjene er ikke lest ennå'}</span><span></span></span>`}<i></i>
      <span class="pp-slipl tot"><span>TOTAL</span><span>${kr2(r.total ?? Math.abs(amt))}</span></span>${r.fileUrl ? `<span class="pp-slipo">${pdf ? 'Åpne PDF ↗' : 'Trykk for originalbildet'}</span>` : ''}</button>`
    : `<div class="pp-card pp-col" style="gap:8px"><span class="pp-mut">Ingen kvittering er lagt ved denne transaksjonen.</span><div class="pp-two"><label class="pp-btn ink">Kamera<input class="m-file" type="file" accept="image/*" capture="environment" data-pptxfile></label><label class="pp-btn">Filer<input class="m-file" type="file" accept="application/pdf,image/*,.heic,.heif" data-pptxfile></label></div></div>`;
  const catList = cats(amt > 0 ? 'income' : 'expense');
  const cat = TX.cat ? `<div class="sheet-bg" data-pptx="catx"></div><div class="pp-sheet tall" role="dialog" aria-label="Endre kategori"><span class="pp-grab"></span>
      <div class="pp-row"><div class="pp-sh">Endre kategori</div><button class="pp-x" data-pptx="catx" aria-label="Lukk">×</button></div>
      <div class="pp-chips pp-wrap">${catList.map((c) => `<button class="pp-fchip" data-pptx="setcat" data-id="${c.id}" aria-pressed="${c.id === t.categoryId || c.name === t.category}"><i class="pp-cdot" style="background:${esc(c.color ?? '#8a8478')}"></i>${esc(c.name)}</button>`).join('')}</div>
      <button class="pp-tog" data-pptx="rule" role="switch" aria-checked="${TX.rule}"><span class="m-grow"><b>Lag regel for fremtidige</b><span class="pp-mut">Neste gang «${esc(name)}» kommer, får den samme kategori</span></span><span class="pp-sw${TX.rule ? ' on' : ''}"><i></i></span></button></div>` : '';
  const b = t.bank, bank = TX.bank ? `<div class="sheet-bg" data-pptx="bankx"></div><div class="pp-sheet tall" role="dialog" aria-label="Bankutskrift"><span class="pp-grab"></span>
      <div class="pp-row"><div class="pp-sh">Bankutskrift</div><button class="pp-x" data-pptx="bankx" aria-label="Lukk">×</button></div>
      ${b ? `<div class="pp-card pp-tight">${[['Tekst', b.description], ['KID / melding', b.message], ['Beløp', b.amount != null ? `${kr2(b.amount)} kr` : null], ['Bokført', b.bookingDate ? dd(b.bookingDate) + '.' + String(b.bookingDate).slice(0, 4) : null], ['Rentedato', b.valueDate ? dd(b.valueDate) + '.' + String(b.valueDate).slice(0, 4) : null], ['Konto', b.account], ['Arkivreferanse', b.archiveReference]].filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div class="pp-kv"><span class="pp-mut">${k}</span><span class="pp-mono" style="color:var(--pp-ink);font-size:13px">${esc(v)}</span></div>`).join('')}</div>`
        : '<div class="pp-mut">Ingen bankrad er lagret. Transaksjonen er lagt inn manuelt eller fra en kvittering.</div>'}</div>` : '';
  const full = TX.full ? `<div class="pp-full" role="dialog" aria-label="Original kvittering"><button type="button" class="p30-sb pp-fullx" data-pptx="fullx">Lukk</button><div class="pp-fullsc">${pdf ? `<iframe src="${esc(TX.full)}" title="Kvittering"></iframe>` : `<img src="${esc(TX.full)}" alt="Original kvittering">`}</div></div>` : '';
  return `<div class="pp-card pp-txd"><div class="pp-row" style="align-items:center;justify-content:flex-start;gap:12px"><span class="pp-ti big" style="background:${esc(t.color ?? '#6b665c')}">${esc(ini(name))}</span><div style="min-width:0"><b class="pp-serif m-ell" style="display:block;font-size:22px">${esc(name)}</b><span class="pp-mut">${esc([t.category, dtxt, t.account].filter(Boolean).join(' · '))}</span></div></div>
      <span class="pp-serif pp-txamt ${amt > 0 ? 'pp-pos' : ''}">${amt < 0 ? '−' : '+'}${kr2(Math.abs(amt))} kr</span>${t.aiSummary || r?.aiSummary ? `<span class="pp-lab-c" style="font-size:13px">✦ ${esc(t.aiSummary || r.aiSummary)}</span>` : ''}</div>
    <div class="pp-sec"><span>ORIGINAL KVITTERING</span><span class="${st === 'Vedlagt' ? '' : 'pp-lab-c'}">${st}</span></div>
    ${P30B.hlBanner(id, t)}${P30B.hlImage(id, t)}${slip}
    <div class="pp-two"><button class="pp-btn" data-pptx="cat">Endre kategori</button><button class="pp-btn" data-pptx="bank">Bankutskrift</button></div>
    ${globalThis.P40?.txTools?.(id, t) ?? '' /* prompt 40: Les på nytt, Rediger alt, lagt til */}
    ${cat}${bank}${full}`;
}
export async function txBind15(e, t) {
  if (!m.detail || m.sel == null) return false;
  const id = m.sel, T = TX.d[id];
  if (e.type === 'change' && t.matches?.('[data-pptxfile]')) {
    const f = t.files?.[0]; t.value = ''; if (!f) return true;
    TX.busy = true; flash('Laster opp kvitteringen …');
    try { const r = await uploadReceipt(f, T?.accountId ?? null); if (r?.id) await api(`/transactions/${id}`, { method: 'PATCH', json: { receiptId: r.id } }).catch(() => {}); await txLoad(id, true); flash('Kvitteringen er lagt ved · ✦ AI leser varelinjene'); }
    catch (err) { flash(err.message); }
    TX.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-pptx]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.pptx;
  if (k === 'full') { const u = T?.receipt?.fileUrl; if (!u) return true; if (/pdf/i.test(T.receipt.mime ?? '')) { open(u, '_blank', 'noopener'); return true; } TX.full = u; }
  else if (k === 'fullx') TX.full = null;
  else if (k === 'cat') TX.cat = true;
  else if (k === 'catx') TX.cat = false;
  else if (k === 'bank') TX.bank = true;
  else if (k === 'bankx') TX.bank = false;
  else if (k === 'rule') TX.rule = !TX.rule;
  else if (k === 'setcat') {
    const cid = +x.dataset.id, c = cats().find((y) => y.id === cid);
    try {
      await api(`/transactions/${id}`, { method: 'PATCH', json: { categoryId: cid } });
      if (TX.rule && T) { const pat = String(T.merchant || T.description || '').toUpperCase().slice(0, 40); if (pat) await api('/rules', { method: 'POST', json: { pattern: pat, categoryId: cid } }).catch(() => {}); }
      await txLoad(id, true); TX.cat = false; FX.t = 0; flash(`Kategorien er endret til ${c?.name ?? 'ny kategori'}${TX.rule ? ' · regel lagret' : ''}`);
    } catch (err) { flash(err.message); }
  }
  draw(); return true;
}

/* ---------- Finn: «På vei» ---------- */

const TINT = ['#3A2F4A', '#1E2A3F', '#3B2E22', '#22362C', '#2C2C33', '#2A3540'];
export function finnWay(items) {
  const way = (items ?? []).filter((x) => !x.done && (x.stage ?? 1) >= 2);
  if (!way.length) return '';
  return `<div class="pp-sec"><span>PÅ VEI · ${way.length}</span><button class="pp-link" data-ppfn="seg" data-k="På vei">Vis alle ›</button></div>
    <div class="pp-way">${way.map((x) => { const st = Math.max(0, Math.min(3, (x.stage ?? 1) - 1)), sold = x.role === 'sold';
      return `<button class="pp-wayc" data-ppfn="edit" data-id="${x.id}"><span class="pp-wayi" style="background-color:${TINT[x.id % TINT.length]};${x.image ? `background-image:url('${esc(x.image)}')` : ''}">${x.image ? '' : esc(String(x.item).split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase())}</span>
        <span class="pp-wayb"><b class="m-ell">${esc(x.item)}</b><span class="pp-fbars static">${[0, 1, 2, 3].map((j) => `<i style="background:${j < st ? 'var(--pp-ink)' : j === st ? 'var(--pp-lab)' : 'var(--pp-line)'}"></i>`).join('')}</span>
        <span class="m-ell ${x.needsAction ? 'pp-lab-c' : 'pp-mut'}" style="font-size:11.5px">${sold ? 'Solgt' : 'Kjøpt'} · ${esc(x.next || (sold ? 'Venter på levering' : 'Pakken er på vei'))}</span></span></button>`; }).join('')}</div>`;
}

/* ---------- Sporing: «Ny sending» (den flytende knappen er + på Sporing) ---------- */

export const NS = { open: false, nv: '', busy: false };
export function newShipSheet() {
  if (!NS.open || m.screen !== 'spor') return '';
  const no = normNo(NS.nv), car = no.length >= 6 ? carOf(detectLocal(no)).name : '';
  return `<div class="sheet-bg" data-ppns="x"></div><div class="pp-sheet" role="dialog" aria-label="Ny sending"><span class="pp-grab"></span>
    <div class="pp-row"><b class="pp-sh" style="font-size:24px">Ny sending</b><span class="pp-mut">✦ Transportør gjenkjennes</span></div>
    <form class="pp-col" data-ppnsform style="gap:8px"><input class="pp-in pp-nsno" id="pp-ns-no" value="${esc(NS.nv)}" placeholder="Sporingsnummer" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Sporingsnummer" enterkeyhint="go">
      ${car && !NS.pick ? `<span class="pp-pos" style="font-size:13px;font-weight:600;padding:0 4px">✓ ${esc(car)} gjenkjent</span>` : ''}${P26.addCars(NS.nv, NS.pick, 'data-ppns="car"')}<button class="pp-btn ink" type="submit" ${NS.busy ? 'disabled' : ''}>${NS.busy ? 'Legger til …' : 'Spor sending'}</button></form>
    <div class="pp-two"><label class="pp-btn">Skann strekkode<input class="m-file" type="file" accept="image/*" capture="environment" data-ppnsscan></label><button class="pp-btn" data-ppns="paste">Lim inn</button></div>
    <span class="pp-mut" style="line-height:1.45">Sendinger fra e-post og Finn legges til automatisk.</span></div>`;
}
export function openNewShip() { NS.open = true; draw(); setTimeout(() => document.getElementById('pp-ns-no')?.focus(), 30); }
// Strekkoder: serveren først (Roboflow, POST /scan/barcode → {codes, engine}). Ved 501 (ikke satt opp) eller en eldre
// server leser nettleseren selv med BarcodeDetector der den finnes.
async function readBarcode(file) {
  try {
    const fd = new FormData(); fd.append('file', file, file.name || 'strekkode.jpg');
    const r = await fetch('/finans/api/scan/barcode', { method: 'POST', body: fd });
    if (r.ok) { const j = await r.json().catch(() => null); const v = (j?.codes ?? []).map((c) => c.value ?? c.rawValue ?? c).find((s) => normNo(String(s)).length >= 6); if (v) return String(v); }
    else if (r.status !== 501 && r.status !== 404) { const j = await r.json().catch(() => null); if (!('BarcodeDetector' in window)) throw new Error(j?.error ?? `Feil ${r.status}`); }
  } catch (e) { if (!('BarcodeDetector' in window)) throw e; }
  if (!('BarcodeDetector' in window)) throw new Error('Telefonen kan ikke lese strekkoder her. Skriv inn eller lim inn nummeret.');
  const bmp = await createImageBitmap(file);
  const det = new window.BarcodeDetector();
  const codes = await det.detect(bmp);
  const v = codes.map((c) => c.rawValue).find((s) => normNo(s).length >= 6);
  if (!v) throw new Error('Fant ingen strekkode i bildet');
  return v;
}
export async function nsBind(e, t) {
  if (m.screen !== 'spor' || !NS.open) return false;
  if (e.type === 'input' && t.id === 'pp-ns-no') { const had = normNo(NS.nv).length >= 6; NS.nv = t.value; if (had !== (normNo(t.value).length >= 6)) draw(); else P26.refreshAuto(t.value); return true; }
  if (e.type === 'change' && t.matches?.('[data-ppnsscan]')) {
    const f = t.files?.[0]; t.value = ''; if (!f) return true;
    try { NS.nv = await readBarcode(f); haptic('ok'); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (e.type === 'submit' && t.matches?.('[data-ppnsform]')) {
    e.preventDefault();
    const no = normNo(NS.nv);
    if (no.length < 6) { haptic('err'); flash('Skriv inn et sporingsnummer'); return true; }
    if ((TR.data?.items ?? []).some((p) => normNo(p.trackingNo) === no)) { haptic('err'); flash('Sendingen spores allerede'); return true; }
    NS.busy = true; draw();
    const pk = NS.pick;
    try { const r = await hlApi('/tracking', { method: 'POST', json: P26.addBody(no, pk) }); P26.noteAdded(no, pk); NS.nv = ''; NS.pick = ''; NS.open = false; await trkLoad(); haptic('ok'); flash(`Lagt til · ${pk ? `${P26.carN(pk)} · valgt` : carOf((r?.item ?? r)?.carrier ?? detectLocal(no)).name}`); }
    catch (err) { haptic('err'); flash(err.message); }
    NS.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppns]');
  if (!x) return false;
  e.preventDefault();
  if (x.dataset.ppns === 'x') NS.open = false;
  else if (x.dataset.ppns === 'car') { NS.pick = x.dataset.k; haptic('tab'); }
  else if (x.dataset.ppns === 'paste') { try { NS.nv = (await navigator.clipboard.readText()).trim(); } catch { flash('Fikk ikke lese utklippstavlen'); } }
  draw(); return true;
}

/* ---------- Innstillinger: Fanelinje og Finans-fanelinje ---------- */

export function navSettings() {
  const f4 = fourthPref(), cur = fourth(), n = onWay(), fk = finKeys();
  const row = (attr, t, s, v, cls = '') => `<button class="pp-srow" ${attr}><span class="m-grow"><b>${esc(t)}</b><span class="pp-mut">${esc(s)}</span></span><span class="pp-sv ${cls}">${esc(v)}</span></button>`;
  const fin = Object.entries(FT).map(([k, [, nm]]) => { const i = fk.indexOf(k), on = i >= 0;
    return row(`data-ppset="fin" data-k="${k}"`, nm, on ? `I fanelinjen, plass ${i + 1}${i > 0 ? ' · trykk for å flytte til venstre' : ''}` : 'Ligger i Mer', on ? (i > 0 ? `◂ Fane ${i + 1}` : 'Fane 1') : '+ Legg til', on ? 'pos' : 'lab'); }).join('');
  const last = fk[fk.length - 1];
  return `<span class="pp-lab">FANELINJE</span><div class="pp-card pp-tight">
      ${row('data-ppset="fab"', 'Skanneknapp', fabStyle() === 'float' ? 'Flyter over linjen, søk ligger i linjen' : 'Ligger i linjen som +', fabStyle() === 'float' ? 'Flytende ›' : 'I linjen ›')}
      ${!domOk() ? '' : row('data-ppset="t4"', 'Fjerde fane', f4 === 'auto' ? `Domener, eller Sporing når pakker er på vei (nå: ${cur === 'spor' ? `Sporing, ${n} på vei` : 'Domener'})` : `Alltid ${f4 === 'sporing' ? 'Sporing' : 'Domener'}`, `${f4 === 'auto' ? 'Automatisk' : f4 === 'sporing' ? 'Sporing' : 'Domener'} ›`)}</div>
    <span class="pp-lab">FINANS · FANELINJE OG MER</span><div class="pp-card pp-tight">${fin}
      ${row('data-ppset="finrm"', 'Fjern fra fanelinjen', 'Trykk for å flytte siste fane til Mer', fk.length > 1 ? `Fjern ${FT[last][1]}` : '–', 'lab')}
      ${row('data-ppset="finreset"', 'Tilbakestill', 'Oversikt, Liste, Finn, Søk', 'Nullstill')}</div>`;
}
export function navSetBind(e, t) {
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppset]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.ppset, fk = finKeys();
  if (k === 'fab') save15({ fab: fabStyle() === 'float' ? 'inline' : 'float' });
  else if (k === 't4') { const Lp = ['auto', 'domener', 'sporing']; save15({ fourthTab: Lp[(Lp.indexOf(fourthPref()) + 1) % 3] }); }
  else if (k === 'fin') {
    const id = x.dataset.k, i = fk.indexOf(id);
    if (i < 0) { if (fk.length >= 5) { flash('Maks 5 faner. Fjern en først.'); return true; } save15({ finTabs: [...fk, id] }); }
    else if (i > 0) { const v = [...fk]; [v[i - 1], v[i]] = [v[i], v[i - 1]]; save15({ finTabs: v }); }
  } else if (k === 'finrm') { if (fk.length > 1) save15({ finTabs: fk.slice(0, -1) }); }
  else if (k === 'finreset') save15({ finTabs: [...FT_DEF] });
  haptic('tab'); draw(); return true;
}

/* ---------- Søk i Finans: hendelser ---------- */

export async function fsBind(e, t) {
  if (m.screen !== 'sok') return false;
  if (e.type === 'input' && t.id === 'pp-fsq') { FS.q = t.value; if (!t.value) { FS.r = null; draw(); } return true; }
  if (e.type === 'submit' && t.matches?.('[data-ppfs]')) { e.preventDefault(); FS.q = t.q.value; t.q.blur(); await fsRun(FS.ai); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppfsk]');
  if (!x) return false;
  e.preventDefault();
  if (x.dataset.ppfsk === 'ai') { FS.ai = !FS.ai; haptic('tab'); const v = document.getElementById('pp-fsq')?.value; if (v != null) FS.q = v; if (FS.q.trim()) await fsRun(FS.ai); else draw(); }
  else if (x.dataset.ppfsk === 'sugg') { FS.q = x.dataset.q; FS.ai = /\s/.test(FS.q); await fsRun(); }
  return true;
}
