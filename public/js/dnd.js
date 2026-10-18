// Flyttbare elementer: på desktop hold inne museknappen i 280 ms og dra (ellers kan tekst markeres og kopieres som vanlig),
// på mobil long-press (450 ms) og dra. Mens et skjemafelt i kortet har fokus, kan kortet ikke dras.
// Rekkefølge og kortstørrelser lagres på serveren per gruppe.
// Kortrutenett (alle grupper unntatt header, faner og toppområdet) får masonry og usynlig resize-håndtak.
import { api, isMobile } from './util.js';
import { store } from './store.js';

const INTERACTIVE = 'input,select,textarea,button,a,label,canvas,form,.resize-h';
const FLAT = ['head', 'tabs', 'top'];        // ikke kortrutenett
const ALWAYS = ['head', 'tabs'];             // kan dras selv om elementet er en lenke/knapp
const GAP = 20, ROW = 4, HOLD_MS = 280;

const sorted = (grid) => [...grid.children].filter((k) => k.dataset.i !== undefined).sort((a, b) => a.style.order - b.style.order);

function applyOrder(grid, saved) {
  [...grid.children].forEach((el, i) => {
    if (el.dataset.i === undefined) el.dataset.i = i;
    const idx = +el.dataset.i;
    const pos = saved ? saved.indexOf(idx) : -1;
    el.style.order = pos > -1 ? pos : saved ? saved.length + idx : idx;
  });
}

function persist(grid) {
  const g = grid.dataset.dnd;
  const order = sorted(grid).map((k) => +k.dataset.i);
  store.me.layouts[g] = order;
  api(`/settings/layout_${g}`, { method: 'PUT', json: { value: order } }).catch(() => {});
}

function move(grid, dragged, target) {
  const order = sorted(grid);
  const from = order.indexOf(dragged), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return false;
  order.splice(from, 1);
  order.splice(to, 0, dragged);
  order.forEach((k, j) => { k.style.order = j; });
  return true;
}

/* ---------- Størrelse og masonry ---------- */

const ro = new ResizeObserver((entries) => {
  for (const { target: el } of entries) {
    if (!el.parentElement?.classList.contains('masonry')) continue;
    el.style.gridRowEnd = `span ${Math.ceil((el.getBoundingClientRect().height + GAP) / ROW)}`;
  }
});

function applySize(el, sz) {
  el.style.gridColumn = sz?.s > 1 ? `span ${sz.s}` : '';
  el.style.height = sz?.h ? `${sz.h}px` : '';
  el.classList.toggle('sized', !!sz?.h);
}

function saveSizes(grid) {
  const g = grid.dataset.dnd, sizes = store.me.sizes[g] ?? {};
  api(`/settings/size_${g}`, { method: 'PUT', json: { value: sizes } }).catch(() => {});
}

function setupResize(grid, el) {
  const g = grid.dataset.dnd, i = el.dataset.i;
  applySize(el, store.me.sizes[g]?.[i]);
  ro.observe(el);
  if (el.querySelector(':scope > .resize-h')) return;
  const h = document.createElement('div');
  h.className = 'resize-h';
  h.title = 'Dra for å endre størrelse · dobbeltklikk for å nullstille';
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.draggable = false;
    const r = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ');
    const cw = parseFloat(cols[0]) || 330, max = cols.length;
    let res = null;
    const mv = (ev) => {
      const w = r.width + ev.clientX - x0, hh = Math.max(120, Math.round(r.height + ev.clientY - y0));
      const s = Math.max(1, Math.min(max, Math.round((w + GAP) / (cw + GAP))));
      res = { s, h: hh };
      applySize(el, res);
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (!res) return;
      (store.me.sizes[g] ??= {})[i] = res;
      saveSizes(grid);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  h.addEventListener('dblclick', () => {
    if (store.me.sizes[g]) delete store.me.sizes[g][i];
    applySize(el, null); saveSizes(grid);
  });
  el.style.position = 'relative';
  el.appendChild(h);
}

/* ---------- Oppsett ---------- */

export function setupDnd(root) {
  root.querySelectorAll('[data-dnd]').forEach((grid) => {
    if (grid.dataset.dndReady) return;
    grid.dataset.dndReady = '1';
    const g = grid.dataset.dnd, always = ALWAYS.includes(g);
    applyOrder(grid, store.me.layouts[g]);
    const cards = !FLAT.includes(g) && !isMobile();
    if (cards) { grid.classList.add('masonry'); [...grid.children].forEach((el) => setupResize(grid, el)); }
    let dragEl = null;

    for (const el of grid.children) {
      // Ingen innebygd HTML5-dra (lenker og bilder ville ellers dras med en gang).
      el.draggable = false; el.querySelectorAll('a,img').forEach((x) => { x.draggable = false; });
      // Desktop: hold inne i 280 ms før kortet løftes. Beveger musa seg før det, er det tekstmarkering.
      let holdT = null, held = false, sx = 0, sy = 0, moved = false;
      const focusedField = () => { const a = document.activeElement; return a && el.contains(a) && a.matches('input,select,textarea,[contenteditable]'); };
      const stopHold = () => { clearTimeout(holdT); holdT = null; };
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        if (document.querySelector('header.top.hp-edit') && el.closest('header')) return;
        if ((!always && e.target.closest(INTERACTIVE)) || e.target.closest('input,select,textarea,.resize-h') || focusedField()) return;
        e.stopPropagation(); // nestede grupper (faner inne i header)
        sx = e.clientX; sy = e.clientY; moved = false;
        stopHold();
        holdT = setTimeout(() => {
          holdT = null; held = true; dragEl = el;
          getSelection()?.removeAllRanges();
          el.classList.add('dragging');
          document.body.classList.add('dnd-active');
        }, HOLD_MS);
      });
      el.addEventListener('pointermove', (e) => {
        if (holdT && Math.hypot(e.clientX - sx, e.clientY - sy) > 4) stopHold();
      });
      el.addEventListener('pointerup', stopHold);
      el.addEventListener('pointerleave', () => { if (!held) stopHold(); });
      // Lenker og knapper (faner) skal ikke åpnes når de nettopp ble flyttet.
      el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      el.addEventListener('dragstart', (e) => { if (held || holdT) e.preventDefault(); });
      const onMove = (e) => {
        if (!held || dragEl !== el) return;
        e.preventDefault();
        const target = sorted(grid).find((k) => { const r = k.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; });
        grid.querySelectorAll(':scope > .drop-target').forEach((k) => k !== target && k.classList.remove('drop-target'));
        if (target && target !== el && move(grid, el, target)) { moved = true; target.classList.add('drop-target'); }
      };
      const onUp = () => {
        stopHold();
        if (!held || dragEl !== el) return;
        held = false; dragEl = null;
        el.classList.remove('dragging');
        document.body.classList.remove('dnd-active');
        grid.querySelectorAll(':scope > .drop-target').forEach((k) => k.classList.remove('drop-target'));
        if (moved) persist(grid);
      };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);

      // Mobil
      let timer = null, startX = 0, startY = 0, lifted = false;
      el.addEventListener('touchstart', (e) => {
        if (e.target.closest('input,select,textarea')) return;
        e.stopPropagation();
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        timer = setTimeout(() => { lifted = true; el.classList.add('lifted'); navigator.vibrate?.(20); }, 450);
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (!lifted) { if (Math.hypot(t.clientX - startX, t.clientY - startY) > 8) clearTimeout(timer); return; }
        e.preventDefault(); e.stopPropagation();
        const target = sorted(grid).find((k) => { const r = k.getBoundingClientRect(); return t.clientX > r.left && t.clientX < r.right && t.clientY > r.top && t.clientY < r.bottom; });
        if (target && target !== el) move(grid, el, target);
      }, { passive: false });
      const end = (e) => {
        clearTimeout(timer);
        if (!lifted) return;
        lifted = false; el.classList.remove('lifted'); persist(grid);
        e.preventDefault(); e.stopPropagation(); // unngå at lenker åpnes etter dra
      };
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
      el.addEventListener('contextmenu', (e) => { if (lifted) e.preventDefault(); });
    }
  });
}

/** Gjeldende rekkefølge (indekser) for en gruppe med n elementer, også når lagret rekkefølge mangler noen. */
export function orderOf(g, n) {
  const saved = (store.me.layouts[g] ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
  return [...new Set([...saved, ...Array.from({ length: n }, (_, i) => i)])];
}

/** Lagrer ny rekkefølge for en gruppe (fra Innstillinger → Forside og meny) og bruker den med en gang. */
export function setOrder(g, order) {
  store.me.layouts[g] = order;
  document.querySelectorAll(`[data-dnd="${g}"]`).forEach((grid) => applyOrder(grid, order));
  return api(`/settings/layout_${g}`, { method: 'PUT', json: { value: order } }).catch(() => {});
}

export async function resetLayouts() {
  await api('/layouts', { method: 'DELETE' });
  store.me.layouts = {};
  store.me.sizes = {};
  document.querySelectorAll('[data-dnd]').forEach((g) => {
    applyOrder(g, null);
    [...g.children].forEach((el) => applySize(el, null));
  });
}
