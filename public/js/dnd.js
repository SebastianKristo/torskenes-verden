// Flyttbare widgets: HTML5 drag-and-drop på desktop, long-press (450 ms) og dra på mobil.
// Rekkefølgen lagres på serveren per side som en liste med opprinnelige indekser.
import { api } from './util.js';
import { store } from './store.js';

const INTERACTIVE = 'input,select,textarea,button,a,label,canvas';

function applyOrder(grid, saved) {
  const kids = [...grid.children];
  kids.forEach((el, i) => {
    el.dataset.i = i;
    const pos = saved ? saved.indexOf(i) : -1;
    el.style.order = pos > -1 ? pos : saved ? saved.length + i : i;
  });
}

const sorted = (grid) => [...grid.children].sort((a, b) => a.style.order - b.style.order);

function persist(grid) {
  const page = grid.dataset.dnd;
  const order = sorted(grid).map((k) => +k.dataset.i);
  store.me.layouts[page] = order;
  api(`/settings/layout_${page}`, { method: 'PUT', json: { value: order } }).catch(() => {});
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

export function setupDnd(root) {
  root.querySelectorAll('[data-dnd]').forEach((grid) => {
    applyOrder(grid, store.me.layouts[grid.dataset.dnd]);
    let dragEl = null;

    for (const el of grid.children) {
      // Desktop
      el.addEventListener('pointerdown', (e) => { el.draggable = e.pointerType === 'mouse' && !e.target.closest(INTERACTIVE); });
      el.addEventListener('dragstart', (e) => { dragEl = el; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); grid.querySelectorAll('.drop-target').forEach((k) => k.classList.remove('drop-target')); dragEl = null; });
      el.addEventListener('dragover', (e) => { if (!dragEl || dragEl === el) return; e.preventDefault(); el.classList.add('drop-target'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop-target'); if (dragEl && move(grid, dragEl, el)) persist(grid); });

      // Mobil
      let timer = null, startX = 0, startY = 0, lifted = false;
      el.addEventListener('touchstart', (e) => {
        if (e.target.closest('input,select,textarea')) return;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        timer = setTimeout(() => { lifted = true; el.classList.add('lifted'); navigator.vibrate?.(20); }, 450);
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (!lifted) { if (Math.hypot(t.clientX - startX, t.clientY - startY) > 8) clearTimeout(timer); return; }
        e.preventDefault();
        const target = sorted(grid).find((k) => { const r = k.getBoundingClientRect(); return t.clientY > r.top && t.clientY < r.bottom; });
        if (target && target !== el) move(grid, el, target);
      }, { passive: false });
      const end = (e) => {
        clearTimeout(timer);
        if (!lifted) return;
        lifted = false; el.classList.remove('lifted'); persist(grid);
        e.preventDefault(); // unngå at lenker åpnes etter dra
      };
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
      el.addEventListener('contextmenu', (e) => { if (lifted) e.preventDefault(); });
    }
  });
}

export async function resetLayouts() {
  await api('/layouts', { method: 'DELETE' });
  store.me.layouts = {};
  document.querySelectorAll('[data-dnd]').forEach((g) => applyOrder(g, null));
}
