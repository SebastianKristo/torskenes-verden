// Prompt 44 (claude-code-web-lys-mork-modus.md): Lys (standard) · Mørk · Følg systemet på web.
// - Valget lagres på brukeren (/api/me/layout · web_theme) og i localStorage «papir_web_mode», så hl-boot.js kan sette
//   html[data-mode="light|dark"] før første tegning (ingen hvit blink).
// - Følg systemet: matchMedia('(prefers-color-scheme: dark)') med change-lytter, bytter med en gang.
// - Bytte sender «papir-web-mode» (window) så åpne komponenter oppdateres; «storage» tar andre faner.
// - Gjelder papirtemaet («Vindu og papir»). «Nåværende» er mørkt glass uansett. Temavalget er uavhengig av lys/mørk.
const KEY = 'papir_web_mode';
const MODES = ['light', 'dark', 'system'];
const mq = (() => { try { return matchMedia('(prefers-color-scheme: dark)'); } catch { return null; } })();
const ls = (v) => { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch { /* privat modus */ } return null; };

export const webMode = () => { const v = ls(); return MODES.includes(v) ? v : 'light'; };
export const effMode = (m = webMode()) => (m === 'dark' || (m === 'system' && mq?.matches) ? 'dark' : 'light');
export const isDark = () => document.documentElement.getAttribute('data-mode') === 'dark';

export function applyMode(m = webMode()) {
  const h = document.documentElement;
  if (h.hasAttribute('data-kal-app')) return;
  const e = effMode(m), was = h.getAttribute('data-mode');
  h.setAttribute('data-mode', e);
  h.setAttribute('data-web-mode', m);
  if (h.dataset.hl === '2c') document.querySelector('meta[name="theme-color"]')?.setAttribute('content', e === 'dark' ? '#16140f' : '#f3efe6');
  if (was !== e) window.dispatchEvent(new CustomEvent('papir-web-mode', { detail: { mode: m, eff: e } }));
}

/** Setter modusen (fra Innstillinger → Utseende). Lagres lokalt med en gang og på brukeren i bakgrunnen. */
export async function setMode(m) {
  if (!MODES.includes(m)) return;
  ls(m); applyMode(m);
  window.dispatchEvent(new CustomEvent('papir-web-mode', { detail: { mode: m, eff: effMode(m) } }));
  try { await fetch('/api/me/layout', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ web_theme: m }) }); } catch { /* frakoblet: lokalt valg gjelder */ }
}

let bound = false;
/** Kalles ved oppstart: lytter på systemet og andre faner, og henter brukerens valg (web_theme). */
export function initMode(layout) {
  if (!bound) {
    bound = true;
    try { mq?.addEventListener('change', () => { if (webMode() === 'system') applyMode(); }); } catch { /* Safari < 14 */ }
    addEventListener('storage', (e) => { if (e.key === KEY) applyMode(); });
    document.addEventListener('hl:theme', () => applyMode());
  }
  const v = layout?.web_theme;
  if (MODES.includes(v) && v !== webMode()) { ls(v); }
  applyMode();
}

export const MODE_CARDS = [['light', 'Lys', 'Standard · lyst papir'], ['dark', 'Mørk', 'Mørkt papir, lys tekst'], ['system', 'Følg systemet', 'Bytter med macOS/Windows']];
