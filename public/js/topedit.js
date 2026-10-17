// Redigeringsmodus for topplinjen: logo, faner, vær og meny kan dras med musa (eller fingeren).
// «Hold alle elementene på samme høyde» (standard) låser y til 0, så delene bare flyttes sideveis.
import { api } from './util.js';
import { store } from './store.js';

const PARTS = ['logo', 'tabs', 'wx', 'menu'];
let editing = false, bar = null;

export const uiDefaults = () => ({ hp: {}, headLock: true, newsSpeed: 5, newsPause: true, domMap: true });
const ui = () => store.me.ui ?? (store.me.ui = uiDefaults());

export function saveUi(changes) {
  Object.assign(ui(), changes);
  return api('/ui', { method: 'PUT', json: changes }).then((r) => { store.me.ui = r; return r; }).catch(() => ui());
}

const el = (k) => document.querySelector(`header.top [data-hp="${k}"]`);

export function applyHead() {
  const { hp, headLock } = ui();
  for (const k of PARTS) {
    const e = el(k), [x, y] = hp[k] ?? [0, 0];
    if (e) e.style.transform = x || (!headLock && y) ? `translate(${x}px,${headLock ? 0 : y}px)` : '';
  }
}

function hint() { return ui().headLock ? 'Dra sideveis – alt holdes på samme høyde' : 'Dra logo, faner, vær og meny dit du vil'; }

export function toggleHeadEdit(on = !editing) {
  editing = on;
  const head = document.querySelector('header.top');
  head.classList.toggle('hp-edit', on);
  for (const k of PARTS) {
    const e = el(k);
    if (!e) continue;
    // HTML5-dra (for å bytte rekkefølge) må være av mens delene flyttes fritt.
    if (on) { e.dataset.wasDrag = e.draggable; e.draggable = false; } else if (e.dataset.wasDrag !== undefined) { e.draggable = e.dataset.wasDrag === 'true'; delete e.dataset.wasDrag; }
    e.querySelector(':scope > .hp-grip')?.remove();
    if (on) {
      const g = document.createElement('div');
      g.className = 'hp-grip';
      g.setAttribute('aria-hidden', 'true');
      g.addEventListener('pointerdown', (ev) => drag(ev, k));
      e.appendChild(g);
    }
  }
  bar?.remove(); bar = null;
  if (on) {
    bar = document.createElement('div');
    bar.className = 'hp-bar';
    bar.innerHTML = `<span data-hp-hint>${hint()}</span><button class="hp-btn" data-hp-reset>Nullstill</button><button class="hp-btn pri" data-hp-done>Ferdig</button>`;
    bar.addEventListener('click', (e) => {
      if (e.target.closest('[data-hp-reset]')) resetHead();
      if (e.target.closest('[data-hp-done]')) toggleHeadEdit(false);
    });
    document.body.appendChild(bar);
  }
}

function drag(e, k) {
  e.preventDefault(); e.stopPropagation();
  const lock = ui().headLock, sx = e.clientX, sy = e.clientY, [ox, oy] = ui().hp[k] ?? [0, 0];
  const target = e.currentTarget;
  target.setPointerCapture?.(e.pointerId);
  const mv = (ev) => {
    ui().hp = { ...ui().hp, [k]: [Math.round(ox + ev.clientX - sx), lock ? 0 : Math.round(oy + ev.clientY - sy)] };
    applyHead();
  };
  const up = () => {
    target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
    saveUi({ hp: ui().hp });
  };
  target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
}

export function resetHead() { ui().hp = {}; applyHead(); saveUi({ hp: {} }); }

export async function setHeadLock(on) {
  await saveUi({ headLock: on });
  applyHead();
  bar?.querySelector('[data-hp-hint]')?.replaceChildren(hint());
}

// Esc avslutter redigeringen.
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editing) toggleHeadEdit(false); });
