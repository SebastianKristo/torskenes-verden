// Prompt 52 (WEB52H): Hjem i PWA-en (mobil, papirdesign) som 2-kolonners rutenett – fasit Homelab.dc.html (Hjem, edVals PG.hjem)
// og Hjem Widgets Varianter 3a.
//  - Flisstil: 24 px hjørner, 16 px luft, 10 px mono-etikett, større serif-tall, uten «alle ›».
//  - Halve fliser: Avgang (dobbelt høy), Finans, Middag, Familie, Domener, Kalender, Bursdag, Bolig, Prøve og Huskeliste.
//    Hele bredden: Siste nytt, Media og de andre kortene (skole, vær, pakker, penger …). Huskeliste grønn som Familie,
//    Bursdag varm som Middag. Hele Siste nytt-flisen åpner nyhetsleseren med lett haptikk.
//  - Avgang, Finans, Middag, Familie og Domener er egne kort (w52av, w52fin, w52mat, w52fam, w52dom – egne nøkler som ikke
//    kolliderer med dashbordets widget-id-er). Hold inne et kort (560 ms) → redigering: kortene vugger, dra for å flytte,
//    − skjuler, «Legg til» viser de skjulte, «Ferdig» lagrer.
//  - Lagres per bruker i /api/me/layout → pages.pwa52hjem = {order, hidden} (samme form som appenes pages.*), lokal kopi i
//    localStorage hl_home52. Uten lagret rekkefølge står flisene der Avganger-kortet (den samlede plassen i PWA-en) sto, og
//    widgets som var skjult fra før (Kalender, Bursdager, Posisjon …) er skjult også her.
import { api, esc, haptic } from './util.js';
import { store, card } from './store.js';
import { hiddenWidgets, hiddenTabs } from './profile.js';
import { ruterColorA11y } from './dash.js'; // linjemerket med minst 4,5:1 kontrast

const T = { // id → [navn, bredde ('h' halv | 'f' full), høy]
  p_school: ['I dag på skolen', 'f'], d_cal: ['Skolekalender', 'f'],
  w52av: ['Avgang', 'h', 1], w52fin: ['Finans', 'h'], w52mat: ['Middag', 'h'], w52fam: ['Familie', 'h'], w52dom: ['Domener', 'h'],
  w52news: ['Siste nytt', 'f'], w52kal: ['Kalender', 'h'], w52bd: ['Bursdag', 'h'], w52bol: ['Bolig', 'h'], w52pr: ['Prøve', 'h'], w52hus: ['Huskeliste', 'h'],
  d_media: ['Media', 'f'], p_play: ['Spilles nå', 'f'], p_wx: ['Vær', 'f'], p_energy: ['Energi', 'f'], p_pk: ['Pakker', 'f'],
  p_money: ['Penger', 'f'], p_links: ['Snarveier', 'f'], d_upcoming: ['Kommer ut', 'f'], d_media_hist: ['Mediehistorikk', 'f'],
};
export const TILES52 = ['w52av', 'w52fin', 'w52mat', 'w52fam', 'w52dom'];
const DEF_ORDER = ['p_school', 'd_cal', ...TILES52, 'w52news', 'w52kal', 'w52bd', 'w52bol', 'w52pr', 'w52hus', 'd_media', 'p_play', 'p_wx', 'p_energy', 'p_pk', 'p_money', 'p_links', 'd_upcoming', 'd_media_hist'];
// Widgets som var skjult i profilen fra før → tilsvarende kort skjult.
const OLD_HID = { d_cal: ['d_cal'], w52kal: ['d_kal'], w52bd: ['d_bday'], w52fam: ['d_pos'], p_energy: ['d_energy'], p_links: ['d_links'], d_media: ['d_media'], d_upcoming: ['d_upcoming'], d_media_hist: ['d_media_hist'], p_money: ['d_trading', 'd_eco'] };
const LS = 'hl_home52';

const H = { order: null, hidden: null, sz: {}, edit: false, drag: null, addOpen: false, data: {}, at: 0, loading: false };

/* ---------------- Oppsett ---------------- */

function saved() {
  const p = store.me?.layoutAll?.pages?.pwa52hjem;
  if (p && Array.isArray(p.order)) return p;
  try { const l = JSON.parse(localStorage.getItem(LS) || 'null'); if (l && Array.isArray(l.order)) return l; } catch { /* */ }
  return null;
}
function allowed(id) {
  if (id === 'w52dom') return !hiddenTabs().has('domener');
  if (id === 'd_media' || id === 'p_play') return !hiddenTabs().has('media');
  return true;
}
function ensure() {
  if (H.order) return;
  const s = saved();
  if (s) {
    const order = s.order.filter((id) => T[id]);
    // Nye kort som mangler i et lagret oppsett settes inn på standardplassen (flisene samlet).
    for (const id of DEF_ORDER) if (!order.includes(id)) { const i = DEF_ORDER.indexOf(id), prev = DEF_ORDER.slice(0, i).reverse().find((x) => order.includes(x)); order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id); }
    H.order = order; H.hidden = new Set((s.hidden ?? []).filter((id) => T[id]));
    H.sz = Object.fromEntries(Object.entries(s.sz ?? {}).filter(([id, v]) => T[id] && (v === 'half' || v === 'full')));
  } else {
    H.order = [...DEF_ORDER];
    const hw = hiddenWidgets();
    H.hidden = new Set(Object.entries(OLD_HID).filter(([, L]) => L.every((x) => hw.has(x))).map(([id]) => id));
    H.sz = {};
  }
}
async function persist() {
  const v = { order: H.order, hidden: [...H.hidden], sz: { ...H.sz } }; // prompt 70: sz (halv/full) lagres ved siden av order og hidden
  try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* */ }
  try {
    // pages erstattes i sin helhet på serveren: les siste versjon først så andre sider (mer45hl …) beholdes.
    const cur = await api('/me/layout').catch(() => null);
    // Prompt 70: sz slås sammen med det som er lagret (ukjente nøkler beholdes), maks 40 nøkler (cardSizes70 på serveren).
    const sz = Object.fromEntries(Object.entries({ ...(cur?.pages?.pwa52hjem?.sz ?? {}), ...v.sz }).filter(([, x]) => x === 'full' || x === 'half').slice(-40));
    const pages = { ...(cur?.pages ?? {}), pwa52hjem: { ...v, sz } };
    const r = await api('/me/layout', { method: 'PUT', json: { pages } });
    store.me.layoutAll = { ...(store.me.layoutAll ?? {}), pages: r?.pages ?? pages };
  } catch { /* lagres lokalt */ }
}

/* ---------------- Data ---------------- */

const json = (u) => fetch(u, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export function loadHome52(redraw) {
  if (H.loading || Date.now() - H.at < 120_000) return;
  H.loading = true;
  const todayISO = new Date().toLocaleDateString('sv-SE');
  Promise.all([
    json('/api/brief').then((d) => { H.data.brief = d; }),
    json('/api/matplan/week').then((d) => { H.data.mat = d?.days?.find((x) => x.today || x.date === todayISO) ?? null; }),
    json('/finans/api/boliger/oversikt').then((d) => { H.data.bol = d; }),
    json('/finans/api/subscriptions/trials').then((d) => { H.data.tr = d?.items ?? null; }),
    allowed('w52dom') ? json('/domains/api/domains').then((d) => { H.data.dom = Array.isArray(d) ? d : d?.items ?? null; }) : null,
    json('/api/tasks').then((d) => { H.data.tasks = d; }),
  ]).finally(() => { H.loading = false; H.at = Date.now(); redraw?.(); });
}
export function store52Meta() {
  // /api/me/layout har pages; lastes én gang for oppsettet på tvers av enheter.
  if (store.me && !store.me.layoutAll) api('/me/layout').then((l) => { store.me.layoutAll = l; if (l?.pages?.pwa52hjem && !H.edit) { H.order = null; ensure(); repaint(); } }).catch(() => {});
}

/* ---------------- Flisene ---------------- */

const kr = (n) => (Number.isFinite(+n) ? `${Math.round(+n).toLocaleString('nb-NO')} kr` : '–');
const lab = (t, cls = '') => `<span class="t52-k${cls}">${esc(t)}</span>`;
const ini = (n) => (String(n ?? '').match(/\p{L}/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();
const tile = (id, cls, href, inner, extra = '') => `<a class="t52 ${cls}" href="${esc(href)}" draggable="false" data-t52-go="${id}"${extra}>${inner}</a>`;

function avgang() {
  const r = store.data.ruter, now = store.now?.getTime?.() ?? Date.now();
  const trip = r?.trips?.find((t) => t.deps?.some((d) => new Date(d.time) - now > -60_000));
  const deps = (trip?.deps ?? []).filter((d) => new Date(d.time) - now > -60_000);
  const d = deps[0];
  if (!d) return tile('w52av', 't52-av', '#/dash', `${lab('AVGANG')}<b class="t52-mid">${r ? 'Ingen avganger' : 'Henter …'}</b>`);
  const m = Math.max(0, Math.round((new Date(d.time) - now) / 60000)), lc = ruterColorA11y(d);
  const more = deps.slice(1, 3).map((x) => `${Math.max(0, Math.round((new Date(x.time) - now) / 60000))}`).join(', ');
  return `<a class="t52 t52-av" href="${esc(trip.url || 'https://reise.ruter.no/')}" target="_blank" rel="noopener" draggable="false" data-t52-go="w52av">${lab('AVGANG')}<span class="t52-line" style="background:${esc(lc[0])};color:${esc(lc[1])}">${esc(d.line)}</span><span class="t52-dest">${esc(d.to ?? trip.to)}</span><span class="t52-mn"><b>${m === 0 ? 'nå' : m}</b>${m === 0 ? '' : '<span>min</span>'}</span><span class="t52-sub">${esc(`fra ${trip.from}${more ? ` · så ${more} min` : ''}`)}</span></a>`;
}
function finans() {
  const f = store.data.finans;
  return tile('w52fin', 't52-card', '/finans/', `${lab('FINANS')}<b class="t52-v">${f ? kr(f.balance) : '–'}</b><span class="t52-s">${f ? esc(`${kr(f.left)} igjen · ${f.daysLeft ?? '–'} d`) : 'Henter …'}</span>`);
}
function middag() {
  const m = H.data.mat;
  return tile('w52mat', 't52-mat', '#/matplan', `${lab('MIDDAG', ' mat')}<b class="t52-mid">${esc(m?.name || (H.at ? 'Ikke planlagt' : 'Henter …'))}</b>${m?.cook ? `<span class="t52-s mat">${esc(m.cook)} lager</span>` : ''}`);
}
function familie() {
  const f = H.data.brief?.family, L = f?.items ?? [];
  return tile('w52fam', 't52-fam', '#/familie', `${lab('FAMILIE', ' fam')}<span class="t52-ppl">${L.slice(0, 4).map((u) => `<span style="background:${esc(u.color || '#2f6b4a')}">${esc(u.initial || ini(u.name))}</span>`).join('') || '<span class="t52-s fam">Ingen deler posisjon</span>'}</span><span class="t52-s fam">${esc(f?.text || (L.length ? `${L.length} deler posisjon` : ''))}</span>`);
}
function domener() {
  const L = H.data.dom;
  return tile('w52dom', 't52-card', '#/domener', `${lab('DOMENER')}<b class="t52-v">${L ? L.length : '–'}</b><span class="t52-s ok">● ${L ? (L.length === 1 ? '1 domene' : `${L.length} domener`) : 'Henter …'}</span>`);
}
function news() {
  const L = store.data.news?.items ?? [], a = L[0];
  const hm = (d) => { const x = new Date(d); return Number.isNaN(+x) ? '' : `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  return `<button type="button" class="t52 t52-card t52-news" data-t52-news aria-label="Åpne nyhetsleseren"><span class="t52-row">${lab('SISTE NYTT')}${a ? `<span class="t52-k">${esc(a.src)} · ${esc(hm(a.date))}</span>` : ''}</span><b class="t52-nt">${esc(a?.title || 'Ingen nyheter akkurat nå')}</b>${L.length > 1 ? `<span class="t52-nl">${L.slice(1, 4).map((x) => `<span><i>${esc(x.src)}</i>${esc(x.title)}</span>`).join('')}</span>` : ''}</button>`;
}
function kalender() {
  const b = H.data.brief, n = b?.next, e = b?.events?.[0];
  return tile('w52kal', 't52-card', '#/kalender', `${lab('KALENDER')}${n || e ? `<b class="t52-n">${esc(n?.time || e?.time || 'Hele dagen')}</b><span class="t52-t">${esc(n?.title || e?.title)}</span><span class="t52-s">${esc(n?.label ? n.label.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : e?.day || '')}</span>` : `<b class="t52-mid">${b ? 'Ingen avtaler' : 'Henter …'}</b>`}`);
}
function bursdag() {
  const x = H.data.brief?.birthdays?.items?.[0] ?? store.data.birthdays?.items?.[0];
  const dl = x?.daysLeft;
  return tile('w52bd', 't52-mat', '#/bursdager', `${lab('BURSDAG', ' mat')}${x ? `<span class="t52-mn"><b>${dl === 0 ? 'I dag' : esc(dl)}</b>${dl === 0 ? '' : `<span>${dl === 1 ? 'dag' : 'dager'}</span>`}</span><span class="t52-t">${esc(x.name)}</span><span class="t52-s mat">${esc(x.text || x.dateText || '')}</span>` : `<b class="t52-mid">${H.at ? 'Ingen snart' : 'Henter …'}</b>`}`);
}
function bolig() {
  const b = H.data.bol;
  return tile('w52bol', 't52-card', '/finans/#/dir', `${lab('BOLIG')}${b?.count ? `<b class="t52-n">${esc(b.count)}</b><span class="t52-t">${b.count === 1 ? 'bolig' : 'boliger'}</span><span class="t52-s">${esc(`${kr(b.sumYear)} i år`)}</span>` : `<b class="t52-mid">${H.at ? 'Ingen boliger' : 'Henter …'}</b>`}`);
}
function prove() {
  const L = (H.data.tr ?? H.data.brief?.trials ?? []).slice().sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)), t = L[0];
  return tile('w52pr', 't52-av', '/finans/#/sub', `${lab('PRØVE')}${t ? `<span class="t52-mn"><b>${esc(t.daysLeft ?? '–')}</b><span>${t.daysLeft === 1 ? 'dag' : 'dager'}</span></span><span class="t52-t">${esc(t.service || t.name)}</span><span class="t52-sub">${esc(t.priceLabel || t.endsLabel || '')}</span>` : `<b class="t52-mid">Ingen aktive</b><span class="t52-sub">+ Legg til</span>`}`);
}
function huske() {
  const t = H.data.brief?.todos;
  const L = t?.items ?? [];
  return tile('w52hus', 't52-fam', '#/gjoremal', `${lab('HUSKELISTE', ' fam')}${t ? `<span class="t52-mn"><b>${esc(t.count ?? L.length)}</b><span class="fam">åpne</span></span>${L.slice(0, 2).map((x) => `<span class="t52-hl${x.overdue ? ' over' : ''}">${esc(x.title)}</span>`).join('')}` : `<b class="t52-mid">Henter …</b>`}`);
}
const RENDER = { w52av: avgang, w52fin: finans, w52mat: middag, w52fam: familie, w52dom: domener, w52news: news, w52kal: kalender, w52bd: bursdag, w52bol: bolig, w52pr: prove, w52hus: huske };

/* Prompt 70 (claude-code-widget-storrelse-mobil.md): størrelse per kort i redigering – håndtaket ↔ nede til høyre.
   Halv → full: dra mer enn 40 px (uansett retning). Full → halv: dra mer enn 40 px mot venstre. Trykk bytter.
   Snarveier er alltid full (Søk er ikke et kort her). Lagres som pages.pwa52hjem.sz = {id: 'half'|'full'}. */
const FIXED = new Set(['p_links']);
const isHalf = (id) => !FIXED.has(id) && (H.sz[id] ? H.sz[id] === 'half' : T[id][1] === 'h');
const RZ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>';
const rzHtml = (id) => (FIXED.has(id) ? '' : `<div class="h52-rz" data-edc><button type="button" data-h52-rz="${id}" aria-label="Endre størrelse på ${esc(T[id][0])} – dra ut eller inn, eller trykk" title="${isHalf(id) ? 'Halv bredde' : 'Full bredde'}">${RZ}</button></div>`);
const sizeCls = (id) => `${isHalf(id) ? 'half' : 'full'}${T[id][2] && isHalf(id) ? ' tall' : ''}`;
function item(id) {
  const [name] = T[id];
  const body = RENDER[id] ? RENDER[id]() : card(id);
  return `<div class="h52-i ${sizeCls(id)}" data-h52="${id}">${H.edit ? `<button type="button" class="h52-x" data-h52-hide="${id}" aria-label="Skjul ${esc(name)}">−</button>${rzHtml(id)}` : ''}${body}</div>`;
}
function visible() { ensure(); return H.order.filter((id) => allowed(id) && !H.hidden.has(id)); }
function hiddenList() { ensure(); return H.order.filter((id) => allowed(id) && H.hidden.has(id)); }

/** Hele Hjem-rutenettet (mobil). */
export function home52Html() {
  ensure();
  const hid = hiddenList();
  return `<div class="h52${H.edit ? ' edit' : ''}" data-h52-root>${visible().map(item).join('')}</div>
    ${H.edit ? `<div class="h52-bar" role="toolbar" aria-label="Rediger Hjem"><button type="button" class="h52-b" data-h52-add${hid.length ? '' : ' disabled'}>+ Legg til${hid.length ? ` (${hid.length})` : ''}</button><button type="button" class="h52-b ink" data-h52-done>Ferdig</button></div>
    ${H.addOpen && hid.length ? `<div class="h52-add" role="dialog" aria-label="Skjulte kort"><b>Skjulte kort</b>${hid.map((id) => `<button type="button" data-h52-show="${id}"><span>${esc(T[id][0])}</span><span>Vis</span></button>`).join('')}</div>` : ''}` : ''}`;
}

/** Tegner bare rutenettet på nytt (data kom, redigering). */
export function repaint() {
  const r = document.querySelector('[data-h52-root]');
  if (!r) return;
  const wrap = r.parentElement, sc = window.scrollY;
  document.querySelectorAll('.h52-bar,.h52-add').forEach((x) => x.remove());
  r.outerHTML = home52Html();
  portal();
  import('./store.js').then((m) => m.mountAll(wrap)).catch(() => {});
  window.scrollTo(0, sc);
}
/** Oppdaterer bare de egne flisene (uten å røre widgetene) – for nye data. */
export function refreshTiles52() {
  if (H.edit) return;
  document.querySelectorAll('[data-h52]').forEach((el) => { const id = el.dataset.h52; if (RENDER[id]) el.innerHTML = RENDER[id](); });
}

/* ---------------- Redigering: hold inne, dra, skjul ---------------- */

/** Inn i redigering uten å bytte ut elementene (klikket fra «hold inne» skal treffe samme element og stoppes). */
function enterEdit() {
  const r = document.querySelector('[data-h52-root]');
  if (!r) return;
  r.classList.add('edit');
  r.querySelectorAll(':scope > [data-h52]').forEach((el) => { if (!el.querySelector(':scope > .h52-x')) el.insertAdjacentHTML('afterbegin', `<button type="button" class="h52-x" data-h52-hide="${el.dataset.h52}" aria-label="Skjul ${esc(T[el.dataset.h52][0])}">−</button>${rzHtml(el.dataset.h52)}`); });
  const hid = hiddenList().length;
  document.querySelectorAll('.h52-bar,.h52-add').forEach((x) => x.remove());
  r.insertAdjacentHTML('afterend', `<div class="h52-bar" role="toolbar" aria-label="Rediger Hjem"><button type="button" class="h52-b" data-h52-add${hid ? '' : ' disabled'}>+ Legg til${hid ? ` (${hid})` : ''}</button><button type="button" class="h52-b ink" data-h52-done>Ferdig</button></div>`);
  portal();
}
/** Verktøylinjen og listen over skjulte kort flyttes til <body> (papiret er egen stablingskontekst under bunnmenyen). */
function portal() { document.querySelectorAll('[data-h52-root] ~ .h52-bar, [data-h52-root] ~ .h52-add').forEach((x) => document.body.appendChild(x)); }

/** Prompt 71: FLIP for flisene som flytter seg når en flis dras forbi. p0 = posisjonene (offsetLeft/Top) før flyttingen. */
function flip71(els, p0) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // 1) Bare lesing: ny plass og (for glidninger som pågår) hvor flisen er nå.
  const go = [];
  for (const x of els) {
    const [l0, t0] = p0.get(x), dx = l0 - x.offsetLeft, dy = t0 - x.offsetTop;
    if (!dx && !dy) continue;
    const run = x.getAnimations().filter((an) => an.id === 'h52flip');
    let cx = 0, cy = 0;
    if (run.length) { const m = /(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(getComputedStyle(x).translate); if (m) { cx = +m[1]; cy = +(m[2] ?? 0); } }
    go.push([x, dx + cx, dy + cy, run]);
  }
  // 2) Bare skriving: start glidningene (ingen lesing etterpå i samme bilde).
  for (const [x, dx, dy, run] of go) {
    run.forEach((an) => an.cancel());
    const an = x.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    an.id = 'h52flip';
  }
}

let bound = false;
export function bindHome52() {
  if (bound) return;
  bound = true;
  let hold = 0, start = null;
  const root = () => document.querySelector('[data-h52-root]');
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('.h52-x,.h52-bar,.h52-add,.h52-rz')) H.suppress = false;
    const it = e.target.closest?.('[data-h52]');
    if (!it || !root()?.contains(it) || e.target.closest('.h52-x,[data-edc]')) return;
    if (e.target.closest('[data-h52-rz]')) return;
    start = { x: e.clientX, y: e.clientY, id: it.dataset.h52, pid: e.pointerId };
    if (H.edit) { H.drag = { id: it.dataset.h52, moved: false, el: it }; return; }
    clearTimeout(hold);
    hold = setTimeout(() => { start = null; H.edit = true; H.suppress = true; haptic?.(20); enterEdit(); }, 560);
  });
  // Prompt 70: håndtaket ↔ (pointer-lyttere på window under draget, touch-action:none på håndtaket).
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('[data-h52-rz]');
    if (!b || !H.edit || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.h52Rz, el = b.closest('[data-h52]'), x0 = e.clientX, h0 = isHalf(id);
    let cur = h0;
    const set = (half) => { H.sz[id] = half ? 'half' : 'full'; if (el) { el.classList.toggle('half', half); el.classList.toggle('full', !half); el.classList.toggle('tall', half && !!T[id][2]); } b.title = half ? 'Halv bredde' : 'Full bredde'; };
    const mv = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - x0, w = h0 ? !(Math.abs(dx) > 40) : dx < -40;
      if (w !== cur) { cur = w; set(w); haptic?.(8); }
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const dx = (ev.type === 'pointercancel' ? x0 : ev.clientX) - x0;
      if (ev.type !== 'pointercancel' && Math.abs(dx) < 6) { cur = !h0; set(cur); haptic?.(8); }
      H.suppress = true; // klikket etter slipp skal ikke åpne kortet
      persist();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (start && !H.edit && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { clearTimeout(hold); start = null; }
    if (!H.edit || !H.drag) return;
    if (!H.drag.moved && Math.hypot(e.clientX - (start?.x ?? e.clientX), e.clientY - (start?.y ?? e.clientY)) < 6) return;
    if (!H.drag.moved) { H.drag.moved = true; H.drag.el.classList.add('lift'); try { H.drag.el.setPointerCapture(e.pointerId); } catch { /* */ } }
    e.preventDefault();
    H.drag.el.style.translate = `${e.clientX - start.x}px ${e.clientY - start.y}px`;
    // Prompt 71: en flis som fortsatt glir (FLIP), er ikke et mål – ellers bytter den tilbake når den glir inn under fingeren.
    const over = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest?.('[data-h52]')).find((x) => x && x !== H.drag.el && !x.getAnimations?.().some((an) => an.id === 'h52flip' && an.playState === 'running'));
    if (over) {
      const a = H.order.indexOf(H.drag.id), b = H.order.indexOf(over.dataset.h52);
      if (a >= 0 && b >= 0 && a !== b) {
        H.order.splice(a, 1); H.order.splice(b, 0, H.drag.id);
        // Prompt 71 (ANIWEB71): FLIP – les alle posisjoner før flyttingen (layout er ren), flytt, les én gang til (én layout), og la de
        // andre flisene gli fra gammel til ny plass med translate (Web Animations, kompositoren). Ingen lesing midt i skrivingen.
        const sibs = [...H.drag.el.parentElement.children].filter((x) => x !== H.drag.el && x.matches('[data-h52]'));
        const p0 = new Map(sibs.map((x) => [x, [x.offsetLeft, x.offsetTop]]));
        const r0 = [H.drag.el.offsetLeft, H.drag.el.offsetTop];
        if (b > a) over.after(H.drag.el); else over.before(H.drag.el);
        const r1 = [H.drag.el.offsetLeft, H.drag.el.offsetTop];
        flip71(sibs, p0);
        start = { ...start, x: start.x + (r1[0] - r0[0]), y: start.y + (r1[1] - r0[1]) };
        H.drag.el.style.translate = `${e.clientX - start.x}px ${e.clientY - start.y}px`;
        haptic?.(6);
      }
    }
  }, { passive: false });
  const up = () => {
    clearTimeout(hold);
    if (H.drag?.moved) { H.drag.el.classList.remove('lift'); H.drag.el.style.translate = ''; H.suppress = true; }
    H.drag = null; start = null;
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-h52]')) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (e.target.closest?.('[data-h52-root]')) e.preventDefault(); }); // lenkene skal ikke dras som HTML5-dra
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest?.('[data-h52-root],.h52-bar,.h52-add')) return;
    if (H.suppress && !t.closest('.h52-x')) { H.suppress = false; if (t.closest('[data-h52]')) { e.preventDefault(); e.stopPropagation(); return; } }
    const hide = t.closest('[data-h52-hide]');
    if (hide) { e.preventDefault(); H.hidden.add(hide.dataset.h52Hide); haptic?.(8); repaint(); return; }
    const show = t.closest('[data-h52-show]');
    if (show) { e.preventDefault(); H.hidden.delete(show.dataset.h52Show); if (!hiddenList().length) H.addOpen = false; repaint(); return; }
    if (t.closest('[data-h52-add]')) { e.preventDefault(); H.addOpen = !H.addOpen; repaint(); return; }
    if (t.closest('[data-h52-done]')) { e.preventDefault(); H.edit = false; H.addOpen = false; persist(); repaint(); return; }
    if (H.edit && t.closest('[data-h52]')) { e.preventDefault(); e.stopPropagation(); return; } // i redigering åpner ingenting
    if (t.closest('[data-t52-news]')) { e.preventDefault(); e.stopPropagation(); try { navigator.vibrate?.(10); } catch { /* */ } import('./news.js').then((m) => (m.openNews ?? m.default)?.()).catch(() => {}); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && H.edit) { H.edit = false; H.addOpen = false; persist(); repaint(); } });
}
export const home52Editing = () => H.edit;
/** Ut av redigering når siden byttes (lagrer det som er gjort). */
export function leaveHome52() { document.querySelectorAll('.h52-bar,.h52-add').forEach((x) => x.remove()); if (H.edit) { H.edit = false; H.addOpen = false; persist(); } }
