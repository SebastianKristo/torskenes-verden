// Delt tilstand og widget-hjelpere.
import { api } from './util.js';

export const store = {
  me: null,          // fra /api/state
  data: {},          // ruter, weather, school, trading, energy, health ...
  errors: {},
  receipts: null,
  grades: null,
  tests: null,
  now: new Date(),
};

const listeners = new Map();
export function on(key, fn) { (listeners.get(key) ?? listeners.set(key, new Set()).get(key)).add(fn); }
export function emit(key) { listeners.get(key)?.forEach((fn) => fn()); listeners.get('*')?.forEach((fn) => fn(key)); }

// Henter en integrasjon og varsler lytterne. Feil lagres per nøkkel.
export async function load(key, path = '/' + key) {
  try { store.data[key] = await api(path); delete store.errors[key]; }
  catch (e) { store.errors[key] = e.message; }
  emit(key);
  return store.data[key];
}

// Widgets: kort med stabil id som kan tegnes på nytt uten å miste drag-and-drop.
export const widgets = new Map();
export function widget(id, def) { widgets.set(id, def); return id; }

export function card(id) {
  const w = widgets.get(id);
  const cls = typeof w.cls === 'function' ? w.cls() : w.cls;
  return `<section class="${cls ?? 'card'}" data-w="${id}">${safe(w)}</section>`;
}

function safe(w) {
  try { return w.render(); } catch (e) { console.error(e); return `<div class="err">Feil i visningen: ${e.message}</div>`; }
}

export function refresh(...ids) {
  for (const id of ids) {
    const w = widgets.get(id);
    document.querySelectorAll(`[data-w="${id}"]`).forEach((el) => {
      // Ikke tegn på nytt mens brukeren skriver i et felt i kortet.
      if (el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      el.innerHTML = safe(w);
      w.mounted?.(el);
    });
  }
}

export function mountAll(root) {
  root.querySelectorAll('[data-w]').forEach((el) => widgets.get(el.dataset.w)?.mounted?.(el));
}

export const errBox = (key, label) => store.errors[key] ? `<div class="err">${label}: ${store.errors[key].replace(/[<>&]/g, '')}</div>` : '';
