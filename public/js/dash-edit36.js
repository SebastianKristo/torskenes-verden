// Prompt 36: Dashboard på web som rutenett med full wiggle-redigering (fasit Dashboard Rediger Web.dc.html,
// claude-code-web-dashboard-rediger.md inkl. «Oppdatering (2)»).
// - Widgetene ligger i et CSS-rutenett (4 · 6 · 8 · 12 kolonner) med {id, x, y, w, h} i rutenett-enheter og vertikal
//   «tyngdekraft» (som gridstack/react-grid-layout). Høyden følger innholdet til brukeren selv endrer den (auto).
// - Hold inne en widget i 560 ms (beveger man seg mer enn 6 px, avbrytes det), eller «Rediger widgets» i profilmenyen:
//   alle widgets vugger, mørk verktøylinje øverst (＋ Widget · kolonner · rutenett · tilbakestill · Ferdig).
// - Dra for å flytte (stiplet rød ramme der den lander, de andre flytter seg live), håndtak nede til høyre for størrelse,
//   − fjerner, «Rediger widget» gir S/M/L/XL. Tastatur: Tab, piler flytter, shift+piler endrer størrelse, Delete fjerner.
// - Lagres per bruker og enhetsklasse: PUT /api/dashboard/layout {device:'web', cols, gap, snap, items, v} (+ lokal cache
//   hl_web_dash_layout_v1). Tåler 404 (da bare lokalt). Under 900 px: automatisk 4 kolonner (bare visning).
import { api, esc, haptic, isMobile } from './util.js';
import { store } from './store.js';
import { hiddenWidgets, saveLayout } from './profile.js';
import { is2c } from './hltheme.js';

const KEY = 'hl_web_dash_layout_v1';
const GAP = 16, HOLD = 560, V = 1;
const rowH = (cols) => (cols >= 12 ? 56 : cols >= 8 ? 64 : 72);

// Widgetene per tema: [id, navn, standardbredde (av 12), standardkolonne (x av 12), hvilke profil-id-er som skjuler den].
const SETS = {
  '2c': [
    ['p_school', 'I dag på skolen', 4, 0], ['d_cal', 'Skolekalender', 4, 0, ['d_cal']],
    ['p_trips', 'Avganger', 4, 4], ['p_kal', 'Kalender', 4, 4, ['d_kal']], ['p_energy', 'Energi', 4, 4, ['d_energy']], ['p_wx', 'Vær', 4, 4], ['p_pk', 'Pakker', 4, 4],
    ['p_pos', 'Posisjon · familie', 4, 8, ['d_pos']], ['p_bday', 'Bursdager', 4, 8, ['d_bday']], ['p_play', 'Spilles nå', 4, 8], ['p_money', 'Penger', 4, 8, ['d_trading', 'd_eco'], true], ['p_links', 'Snarveier', 4, 8, ['d_links']],
    ['d_upcoming', 'Kommer ut', 4, 0, ['d_upcoming']], ['d_media', 'Media', 4, 4, ['d_media']], ['d_media_hist', 'Mediehistorikk', 8, 0, ['d_media_hist']], ['d_trading', 'Trading 212', 4, 8, ['d_trading']], ['d_eco', 'Økonomi', 4, 8, ['d_eco']],
  ],
  cur: [
    ['d_cal', 'Skolekalender', 4, 0, ['d_cal']], ['d_agenda', 'Agenda', 4, 4, ['d_agenda']], ['d_trading', 'Trading 212', 4, 8, ['d_trading']], ['d_energy', 'Energi', 4, 0, ['d_energy']],
    ['d_eco', 'Økonomi', 4, 4, ['d_eco']], ['d_links', 'Snarveier', 4, 8, ['d_links']], ['d_upcoming', 'Kommer ut', 4, 0, ['d_upcoming']], ['d_media', 'Media', 4, 4, ['d_media']],
    ['d_media_hist', 'Mediehistorikk', 8, 0, ['d_media_hist']], ['d_pos', 'Posisjon · familie', 4, 8, ['d_pos']], ['d_bday', 'Bursdager · neste', 4, 0, ['d_bday']], ['d_kal', 'Kalender', 4, 4, ['d_kal']],
  ],
};
const theme = () => (is2c() ? '2c' : 'cur');
const META = () => Object.fromEntries(SETS[theme()].map(([id, n, w, x, hid, all]) => [id, { n, w, x, hid: hid ?? [], all: !!all }]));

/* ---------------- Rutenett-matte (fra fasiten) ---------------- */
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function compact(items, fixed) {
  const out = [], vis = items.filter((i) => !i.hidden), hid = items.filter((i) => i.hidden);
  if (fixed) out.push({ ...fixed });
  const rest = vis.filter((i) => !fixed || i.id !== fixed.id).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of rest) {
    // Som react-grid-layout: flytt opp så langt det går uten å hoppe over andre, og ned forbi det som kolliderer.
    const c = { ...it };
    while (c.y > 0 && !out.some((o) => hit(o, { ...c, y: c.y - 1 }))) c.y--;
    while (out.some((o) => hit(o, c))) c.y++;
    out.push(c);
  }
  return [...out, ...hid.map((i) => ({ ...i }))];
}
function defaults(cols) {
  // Standardoppsett: spaltene fra papiret (x/12 skalert), høyden følger innholdet (auto).
  const M = META(), out = [];
  const colY = {};
  for (const [id, , w0, x0] of SETS[theme()]) {
    const w = Math.max(Math.min(2, cols), Math.min(cols, Math.round((w0 * cols) / 12))), x = Math.max(0, Math.min(cols - w, Math.round((x0 * cols) / 12)));
    const y = colY[x] ?? 0;
    out.push({ id, x, y, w, h: 4, auto: true, hidden: false });
    for (let k = x; k < x + w; k++) colY[k] = Math.max(colY[k] ?? 0, y + 4);
  }
  void M;
  return compact(out);
}
function scaleCols(items, o, n) {
  return compact(items.map((i) => { const w = Math.max(Math.min(2, n), Math.min(n, Math.round((i.w * n) / o))); const x = Math.max(0, Math.min(n - w, Math.round((i.x * n) / o))); return { ...i, x, w }; }));
}

/* ---------------- Tilstand og lagring ---------------- */
const S = { lay: null, cols: 12, edit: false, grid: true, add: false, menu: '', drag: null, loaded: false, srvAt: 0 };
const lsAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
function sane(items) {
  const M = META(), seen = new Set(), out = [];
  for (const i of Array.isArray(items) ? items : []) {
    if (!i || !M[i.id] || seen.has(i.id)) continue;
    seen.add(i.id);
    out.push({ id: i.id, x: Math.max(0, +i.x || 0), y: Math.max(0, +i.y || 0), w: Math.max(1, +i.w || 4), h: Math.max(1, +i.h || 4), auto: i.auto !== false && i.auto !== 0 ? !!(i.auto ?? false) : false, hidden: !!i.hidden });
  }
  return out;
}
function fromSaved(v) {
  if (!v || !Array.isArray(v.items)) return null;
  const cols = [4, 6, 8, 12].includes(+v.cols) ? +v.cols : 12;
  let items = sane(v.items);
  // Nye widgets som ikke fantes da oppsettet ble lagret, legges nederst.
  const have = new Set(items.map((i) => i.id)), def = defaults(cols);
  const maxY = Math.max(0, ...items.map((i) => i.y + i.h));
  for (const d of def) if (!have.has(d.id)) items.push({ ...d, y: maxY + d.y });
  items = items.map((i) => ({ ...i, w: Math.min(cols, i.w), x: Math.min(i.x, cols - Math.min(cols, i.w)) }));
  return { cols, lay: compact(items) };
}
function loadLocal() {
  const all = lsAll(), v = fromSaved(all[theme()]);
  if (v) { S.cols = v.cols; S.lay = v.lay; } else { S.cols = 12; S.lay = defaults(12); }
}
let saveT = null;
function save() {
  const t = theme(), all = lsAll(), rec = { cols: S.cols, gap: GAP, snap: true, items: S.lay.map(({ id, x, y, w, h, auto, hidden }) => ({ id, x, y, w, h, auto: !!auto, hidden: !!hidden })), v: V, at: Date.now() };
  all[t] = rec;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* privat modus */ }
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const other = all[t === '2c' ? 'cur' : '2c'];
    const body = t === '2c' ? { device: 'web', ...rec, alt: other ? { cur: other } : undefined } : { device: 'web', ...(all['2c'] ?? { cols: 12, gap: GAP, snap: true, items: [], v: V }), alt: { cur: rec } };
    api('/dashboard/layout', { method: 'PUT', json: body }).catch(() => { /* eldre server: bare lokalt */ });
  }, 400);
}
async function loadServer() {
  if (Date.now() - S.srvAt < 60_000) return;
  S.srvAt = Date.now();
  let r = null;
  try { r = await api('/dashboard/layout?device=web'); } catch { return; }
  const rec = theme() === '2c' ? r : r?.alt?.cur;
  if (!rec?.items?.length || S.edit || S.drag) return;
  const loc = lsAll()[theme()];
  if (loc?.at && rec.at && loc.at > rec.at) return; // den lokale er nyere (ikke synket ennå)
  const v = fromSaved(rec);
  if (!v) return;
  const same = JSON.stringify(v.lay) === JSON.stringify(S.lay) && v.cols === S.cols;
  S.cols = v.cols; S.lay = v.lay;
  try { const all = lsAll(); all[theme()] = { ...rec, at: rec.at ?? Date.now() }; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* */ }
  if (!same) apply(true);
}

/* ---------------- Synlighet ---------------- */
const profHidden = (id) => { const m = META()[id], h = hiddenWidgets(); if (!m || !m.hid.length) return false; return m.all ? m.hid.every((k) => h.has(k)) : m.hid.some((k) => h.has(k)); };
const visible = (i) => !i.hidden && !profHidden(i.id);
/** Kolonner som faktisk vises (under 900 px: 4, bare visning). */
const viewCols = () => (window.innerWidth < 900 ? 4 : S.cols);
const viewLay = () => {
  const vis = S.lay.map((i) => (visible(i) ? i : { ...i, hidden: true }));
  return viewCols() === S.cols ? compact(vis) : scaleCols(vis, S.cols, 4);
};

/* ---------------- Tegning ---------------- */
/** Kalles fra dash.js: `bodies` er {id: html}. Gir rutenettet (desktop/nettbrett). */
export function gridHtml(bodies) {
  if (!S.lay || S.th !== theme()) { if (S.edit) endEdit(); S.th = theme(); S.srvAt = 0; loadLocal(); }
  const cols = viewCols(), rh = rowH(cols), lay = viewLay();
  const cells = lay.filter((i) => !i.hidden && bodies[i.id] != null).map((i) => `<div class="dg36-it${is2c() ? ' p-col' : ''}${i.auto ? '' : ' dg36-fix'}" data-dg="${esc(i.id)}" style="grid-column:${i.x + 1} / span ${i.w};grid-row:${i.y + 1} / span ${i.h}"><div class="dg36-wig">${bodies[i.id]}</div></div>`).join('');
  return `<div class="dg36${S.edit ? ' dg36-edit' : ''}${is2c() ? ' dg36-paper' : ''}" id="dg36" style="--dgc:${cols};--dgr:${rh}px;--dgg:${GAP}px">${cells}</div>`;
}

let ro = null, mountedEl = null;
/** Kalles fra app.js etter at Dashboard er tegnet. */
export function mountDash(view) {
  const g = view.querySelector('#dg36');
  if (!g) { mountedEl = null; return; }
  mountedEl = g;
  ro?.disconnect();
  ro = new ResizeObserver(() => { if (!S.drag) measure(); });
  g.querySelectorAll('.dg36-wig').forEach((w) => ro.observe(w.firstElementChild ?? w));
  ro.observe(g);
  bindGrid(g);
  measure();
  if (S.edit) { decorate(); toolbar(); }
  loadServer();
}

// Auto-høyde: høyden i rader følger innholdet til brukeren endrer den selv.
function measure() {
  const g = mountedEl;
  if (!g || !g.isConnected) return;
  const cols = viewCols(), rh = rowH(cols);
  let changed = false;
  const scaled = viewCols() !== S.cols;
  for (const it of S.lay) {
    if (!it.auto) continue;
    const el = g.querySelector(`[data-dg="${CSS.escape(it.id)}"]`);
    const body = el?.querySelector('.dg36-wig')?.firstElementChild;
    if (!body) continue;
    const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const H = body.getBoundingClientRect().height + pad + 6;
    const h = Math.max(1, Math.ceil((H + GAP) / (rh + GAP)));
    if (h !== it.h) { it.h = h; changed = true; }
  }
  if (changed) { if (!scaled) S.lay = compact(S.lay); apply(false); }
}
function cellRects(g) { const m = new Map(); g.querySelectorAll('.dg36-it').forEach((el) => m.set(el.dataset.dg, el.getBoundingClientRect())); return m; }
// Legger cellene på plass. flip=true animerer flyttingen (0,2 s) for de som ikke dras.
function apply(flip, lay = null, skip = null) {
  const g = mountedEl;
  if (!g || !g.isConnected) return;
  const L = lay ?? viewLay(), before = flip ? cellRects(g) : null;
  const cols = viewCols();
  g.style.setProperty('--dgc', cols); g.style.setProperty('--dgr', `${rowH(cols)}px`);
  for (const i of L) {
    const el = g.querySelector(`[data-dg="${CSS.escape(i.id)}"]`);
    if (!el) continue;
    el.hidden = !!i.hidden;
    el.classList.toggle('dg36-fix', !i.auto);
    if (i.hidden) continue;
    if (i.id === skip) continue;
    el.style.gridColumn = `${i.x + 1} / span ${i.w}`; el.style.gridRow = `${i.y + 1} / span ${i.h}`;
    const sz = el.querySelector('.dg36-size'); if (sz) sz.textContent = `${i.w} × ${i.h}`;
  }
  const maxY = Math.max(1, ...L.filter((i) => !i.hidden).map((i) => i.y + i.h));
  g.style.minHeight = S.edit ? `${(maxY + 2) * (rowH(cols) + GAP)}px` : '';
  if (flip && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const after = cellRects(g);
    for (const [id, a] of after) {
      const b = before.get(id); if (!b || id === skip) continue;
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const el = g.querySelector(`[data-dg="${CSS.escape(id)}"]`);
      el.style.transition = 'none'; el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => { el.style.transition = 'transform .2s ease'; el.style.transform = ''; });
    }
  }
  paintGuides();
}

/* ---------------- Redigering ---------------- */
const SVG = {
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  cols: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16"/></svg>',
  grid: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/></svg>',
  reset: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  minus: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  rs: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M20 9v11H9M14 20l6-6"/></svg>',
};
export const editIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/></svg>';
export const canEdit = () => !isMobile() && window.innerWidth >= 900;
export const isEditing = () => S.edit;

/** Starter vuggingen (fra profilmenyen eller hold inne). Går til Dashboard hvis man står et annet sted. */
export function startEdit() {
  if (!canEdit()) return;
  if (S.edit && document.getElementById('dg36-tb')) return;
  S.edit = true; S.add = false; S.menu = '';
  haptic(10);
  const g = document.getElementById('dg36');
  if (!g) return;
  g.classList.add('dg36-edit');
  decorate(); toolbar(); apply(false);
}
export function endEdit() {
  if (!S.edit) return;
  S.edit = false; S.add = false; S.menu = ''; S.drag = null;
  document.getElementById('dg36-tb')?.remove(); document.getElementById('dg36-add')?.remove(); document.getElementById('dg36-hint')?.remove();
  const g = document.getElementById('dg36');
  if (g) {
    g.classList.remove('dg36-edit'); g.style.minHeight = '';
    g.querySelectorAll('.dg36-ctl,.dg36-guides,.dg36-ghost,.dg36-menu').forEach((x) => x.remove());
    g.querySelectorAll('.dg36-it').forEach((el) => { el.removeAttribute('tabindex'); el.removeAttribute('aria-label'); });
  }
  save();
}

function decorate() {
  const g = mountedEl;
  if (!g) return;
  g.querySelectorAll('.dg36-it').forEach((el, ix) => {
    el.style.setProperty('--wg', `${(0.26 + (ix % 3) * 0.03).toFixed(2)}s`);
    el.classList.toggle('dg36-b', ix % 2 === 1);
    if (el.querySelector(':scope > .dg36-ctl')) return;
    const it = S.lay.find((i) => i.id === el.dataset.dg), n = META()[el.dataset.dg]?.n ?? el.dataset.dg;
    el.tabIndex = 0; el.setAttribute('aria-label', `${n}. Piltaster flytter, shift og piltaster endrer størrelse, Delete fjerner.`);
    el.insertAdjacentHTML('beforeend', `<div class="dg36-ctl"><button type="button" class="dg36-rm" data-dg-rm aria-label="Fjern ${esc(n)}">${SVG.minus}</button>
      <div class="dg36-mid"><button type="button" class="dg36-pill" data-dg-menu>Rediger widget<span class="dg36-size">${it ? `${it.w} × ${it.h}` : ''}</span></button></div>
      <span class="dg36-rs" data-dg-rs="both" aria-label="Endre størrelse">${SVG.rs}</span><span class="dg36-rx" data-dg-rs="w"></span><span class="dg36-ry" data-dg-rs="h"></span></div>`);
  });
  paintGuides();
}
function paintGuides() {
  const g = mountedEl;
  if (!g) return;
  let gd = g.querySelector('.dg36-guides');
  if (!S.edit || !S.grid) { gd?.remove(); return; }
  const cols = viewCols();
  if (!gd) { gd = document.createElement('div'); gd.className = 'dg36-guides'; gd.setAttribute('aria-hidden', 'true'); g.prepend(gd); }
  if (+gd.dataset.c !== cols) { gd.dataset.c = cols; gd.innerHTML = Array.from({ length: cols }, () => '<span></span>').join(''); }
}

function toolbar() {
  let tb = document.getElementById('dg36-tb');
  if (!tb) {
    tb = document.createElement('div'); tb.id = 'dg36-tb'; tb.className = 'dg36-tbw';
    document.body.appendChild(tb);
    tb.addEventListener('click', onToolbar);
  }
  tb.innerHTML = `<div class="dg36-tb" role="toolbar" aria-label="Rediger dashboard">
    <button type="button" class="dg36-tadd${S.add ? ' on' : ''}" data-tb="add" aria-expanded="${S.add}">${SVG.plus}Widget</button><span class="dg36-sep"></span>
    <span class="dg36-tic" title="Kolonner">${SVG.cols}</span><div class="dg36-seg" role="radiogroup" aria-label="Kolonner">${[4, 6, 8, 12].map((n) => `<button type="button" role="radio" aria-checked="${S.cols === n}" class="${S.cols === n ? 'on' : ''}" data-tb="cols:${n}">${n}</button>`).join('')}</div><span class="dg36-sep"></span>
    <button type="button" class="dg36-tico${S.grid ? ' on' : ''}" data-tb="grid" title="Vis rutenett" aria-label="Vis rutenett" aria-pressed="${S.grid}">${SVG.grid}</button>
    <button type="button" class="dg36-tico" data-tb="reset" title="Tilbakestill oppsett" aria-label="Tilbakestill oppsett">${SVG.reset}</button>
    <button type="button" class="dg36-done" data-tb="done">Ferdig</button></div>`;
  let ad = document.getElementById('dg36-add');
  if (!S.add) { ad?.remove(); return; }
  if (!ad) { ad = document.createElement('div'); ad.id = 'dg36-add'; ad.className = 'dg36-addp'; document.body.appendChild(ad); ad.addEventListener('click', onToolbar); }
  const M = META(), hid = S.lay.filter((i) => !visible(i));
  ad.innerHTML = `<span class="dg36-k">LEGG TIL WIDGET</span>${hid.length ? '' : '<span class="dg36-empty">Alle widgets er allerede på dashboardet. Fjern en med − for å se den her.</span>'}
    <div class="dg36-addl">${hid.map((i) => `<button type="button" data-tb="add:${esc(i.id)}"><b>+</b>${esc(M[i.id]?.n ?? i.id)}</button>`).join('')}</div>`;
}
async function onToolbar(e) {
  const b = e.target.closest('[data-tb]');
  if (!b) return;
  const [a, v] = b.dataset.tb.split(':');
  if (a === 'done') { endEdit(); return; }
  if (a === 'add' && !v) { S.add = !S.add; toolbar(); return; }
  if (a === 'add') {
    const it = S.lay.find((i) => i.id === v);
    if (!it) return;
    const m = META()[v], w = Math.max(2, Math.min(S.cols, Math.round((m.w * S.cols) / 12)));
    const c = { ...it, hidden: false, x: 0, y: 0, w };
    if (profHidden(v)) { const h = hiddenWidgets(); m.hid.forEach((k) => h.delete(k)); await saveLayout({ hiddenWidgets: [...h] }); document.dispatchEvent(new Event('hl:dash36')); }
    S.lay = compact(S.lay.map((i) => (i.id === v ? c : i)), c); save();
    if (!mountedEl?.querySelector(`[data-dg="${CSS.escape(v)}"]`)) document.dispatchEvent(new Event('hl:dash36'));
    else apply(true);
    toolbar(); return;
  }
  if (a === 'cols') { const n = +v; if (n !== S.cols) { S.lay = scaleCols(S.lay, S.cols, n); S.cols = n; save(); apply(true); measure(); toolbar(); } return; }
  if (a === 'grid') { S.grid = !S.grid; paintGuides(); toolbar(); return; }
  if (a === 'reset') { if (!confirm('Tilbakestille oppsettet for dashboardet?')) return; S.lay = defaults(S.cols); save(); apply(true); measure(); return; }
}

function hint(txt) {
  let h = document.getElementById('dg36-hint');
  if (txt == null) { h?.remove(); return; }
  if (!h) { h = document.createElement('div'); h.id = 'dg36-hint'; h.className = 'dg36-hint'; h.setAttribute('role', 'status'); document.body.appendChild(h); }
  h.textContent = txt;
}
function metrics() {
  const g = mountedEl, cols = viewCols(), rh = rowH(cols), W = g.getBoundingClientRect().width, cw = (W - GAP * (cols - 1)) / cols;
  return { cols, sx: cw + GAP, sy: rh + GAP };
}
function ghost(c) {
  const g = mountedEl;
  let gh = g.querySelector('.dg36-ghost');
  if (!c) { gh?.remove(); return; }
  if (!gh) { gh = document.createElement('div'); gh.className = 'dg36-ghost'; gh.setAttribute('aria-hidden', 'true'); g.appendChild(gh); }
  gh.style.gridColumn = `${c.x + 1} / span ${c.w}`; gh.style.gridRow = `${c.y + 1} / span ${c.h}`; gh.textContent = `${c.w} × ${c.h}`;
}
function begin(e, el, mode) {
  e.preventDefault(); e.stopPropagation();
  const id = el.dataset.dg, it = S.lay.find((i) => i.id === id);
  if (!it) return;
  const M = metrics(), x0 = e.clientX, y0 = e.clientY, cols = M.cols;
  closeMenu();
  S.drag = { id, mode, cand: { ...it }, prev: S.lay };
  el.classList.add('dg36-drag');
  try { el.setPointerCapture?.(e.pointerId); } catch { /* */ }
  const mv = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0, c = { ...it };
    if (mode === 'move') {
      c.x = Math.max(0, Math.min(cols - it.w, Math.round((it.x * M.sx + dx) / M.sx)));
      c.y = Math.max(0, Math.round((it.y * M.sy + dy) / M.sy));
      el.style.transform = `translate(${dx}px,${dy}px) scale(1.03)`;
    } else {
      if (mode !== 'h') c.w = Math.max(Math.min(2, cols), Math.min(cols - it.x, Math.round((it.w * M.sx + dx) / M.sx)));
      if (mode !== 'w') { c.h = Math.max(1, Math.round((it.h * M.sy + dy) / M.sy)); c.auto = false; }
      if (mode === 'w' && it.auto) c.auto = true;
    }
    const cand = S.drag.cand;
    if (cand.x === c.x && cand.y === c.y && cand.w === c.w && cand.h === c.h) return;
    const prev = compact(S.lay, c);
    S.drag = { ...S.drag, cand: c, prev };
    if (mode === 'move') { ghost(c); apply(true, prev, id); hint(`Kolonne ${c.x + 1} · rad ${c.y + 1}`); }
    else { apply(true, prev); hint(`${c.w} × ${c.h}`); }
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const d = S.drag; S.drag = null;
    el.classList.remove('dg36-drag'); el.style.transform = '';
    ghost(null); hint(null);
    if (!d) return;
    S.lay = compact(d.prev); save(); apply(true); measure();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  hint(mode === 'move' ? `Kolonne ${it.x + 1} · rad ${it.y + 1}` : `${it.w} × ${it.h}`);
  if (mode === 'move') ghost(it);
}
function closeMenu() { S.menu = ''; mountedEl?.querySelectorAll('.dg36-menu').forEach((x) => x.remove()); }
function openMenu(el) {
  const id = el.dataset.dg;
  if (S.menu === id) { closeMenu(); return; }
  closeMenu(); S.menu = id;
  const it = S.lay.find((i) => i.id === id), cols = S.cols;
  const P = [['S', Math.max(2, Math.round(cols / 4)), 2], ['M', Math.max(2, Math.round(cols / 3)), 3], ['L', Math.max(2, Math.round(cols / 2)), 4], ['XL', cols, 4]];
  el.insertAdjacentHTML('beforeend', `<div class="dg36-menu" role="dialog" aria-label="Rediger widget"><span class="dg36-k">STØRRELSE</span><div class="dg36-pre">${P.map(([n, w, h]) => `<button type="button" class="${it.w === w && it.h === h ? 'on' : ''}" data-dg-pre="${w}x${h}">${n}</button>`).join('')}</div>
    <button type="button" class="dg36-auto${it.auto ? ' on' : ''}" data-dg-auto>${it.auto ? '✓ ' : ''}Høyde etter innhold</button>
    <button type="button" class="dg36-opt" data-dg-opts>Hva som vises …</button><button type="button" class="dg36-close" data-dg-menu>Lukk</button></div>`);
}

function bindGrid(g) {
  if (g.dataset.dgb) return;
  g.dataset.dgb = '1';
  let lp = null, held = false, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(lp); lp = null; };
  g.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.dg36-it');
    if (!el || (e.button && e.button !== 0)) return;
    if (S.edit) {
      const t = e.target;
      if (t.closest('.dg36-menu,[data-dg-rm],[data-dg-menu]')) return;
      const rs = t.closest('[data-dg-rs]');
      if (rs) return begin(e, el, rs.dataset.dgRs);
      return begin(e, el, 'move');
    }
    if (!canEdit()) return;
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    sx = e.clientX; sy = e.clientY; held = false;
    cancel();
    lp = setTimeout(() => { lp = null; held = true; getSelection()?.removeAllRanges(); startEdit(); }, HOLD);
  });
  g.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) cancel(); });
  g.addEventListener('pointerup', cancel);
  g.addEventListener('pointercancel', cancel);
  g.addEventListener('contextmenu', (e) => { if (held || S.edit) e.preventDefault(); });
  // Klikket etter «hold inne» (og alle klikk inne i widgetene under redigering) skal ikke åpne lenker.
  g.addEventListener('click', (e) => {
    if (held) { e.preventDefault(); e.stopPropagation(); held = false; return; }
    if (!S.edit) return;
    const el = e.target.closest('.dg36-it');
    if (!el) return;
    const id = el.dataset.dg;
    if (e.target.closest('[data-dg-rm]')) { e.preventDefault(); S.lay = compact(S.lay.map((i) => (i.id === id ? { ...i, hidden: true } : i))); save(); apply(true); haptic(8); toolbar(); return; }
    if (e.target.closest('[data-dg-menu]')) { e.preventDefault(); openMenu(el); return; }
    const pre = e.target.closest('[data-dg-pre]');
    if (pre) { const [w, h] = pre.dataset.dgPre.split('x').map(Number); const it = S.lay.find((i) => i.id === id); const c = { ...it, w, h, x: Math.min(it.x, S.cols - w), auto: false }; S.lay = compact(S.lay, c); save(); apply(true); openMenu(el); openMenu(el); return; }
    if (e.target.closest('[data-dg-auto]')) { const it = S.lay.find((i) => i.id === id); it.auto = !it.auto; save(); measure(); openMenu(el); openMenu(el); return; }
    if (e.target.closest('[data-dg-opts]')) { e.preventDefault(); closeMenu(); endEdit(); import('./settings.js').then((m) => m.openSettings('top')).catch(() => {}); return; }
    if (!e.target.closest('.dg36-menu')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  g.addEventListener('keydown', (e) => {
    if (!S.edit) return;
    const el = e.target.closest?.('.dg36-it');
    if (!el || e.target !== el) return;
    const id = el.dataset.dg, it = S.lay.find((i) => i.id === id);
    if (!it) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); S.lay = compact(S.lay.map((i) => (i.id === id ? { ...i, hidden: true } : i))); save(); apply(true); toolbar(); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const c = { ...it };
    if (e.shiftKey) { c.w = Math.max(2, Math.min(S.cols - c.x, c.w + d[0])); if (d[1]) { c.h = Math.max(1, c.h + d[1]); c.auto = false; } }
    else { c.x = Math.max(0, Math.min(S.cols - c.w, c.x + d[0])); c.y = Math.max(0, c.y + d[1]); }
    S.lay = compact(S.lay, c); save(); apply(true);
    hint(e.shiftKey ? `${c.w} × ${c.h}` : `Kolonne ${c.x + 1} · rad ${c.y + 1}`);
    clearTimeout(g._ht); g._ht = setTimeout(() => hint(null), 1200);
    el.focus();
  });
}

// Esc avslutter; ny side avslutter også. Vindusbredde: 4 kolonner under 900 px (bare visning).
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.edit) { if (S.menu) closeMenu(); else endEdit(); } });
window.addEventListener('hashchange', () => { if (S.edit && !/^#\/?(dash)?$/.test(location.hash)) endEdit(); });
let rzT = null, lastVC = null;
window.addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    if (!mountedEl?.isConnected) return;
    if (S.edit && !canEdit()) endEdit();
    if (lastVC !== viewCols()) { lastVC = viewCols(); apply(false); }
    measure();
  }, 120);
});
document.addEventListener('hl:theme', () => { S.lay = null; S.srvAt = 0; endEdit(); });
