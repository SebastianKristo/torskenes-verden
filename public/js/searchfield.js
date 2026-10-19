// Felles søkefelt med ✕ til venstre (prompt 27, claude-code-tom-sok.md). Brukes av web-dashboardet og FinansHub desktop.
// - Tomt felt: forstørrelsesglass til venstre. Med tekst: ✕ på samme plass (26 px sirkel, trykkflate 36 px).
// - ✕ / Esc: tømmer feltet, sender «input» (så ventende søk avbrytes av eieren) og «sf:clear» (lukk forslag og treff).
//   Fokus og tastatur beholdes (pointerdown → preventDefault). aria-label «Tøm søket».
// Bruk: searchField({ name, value, placeholder, cls, attrs }) gir HTML; enhanceSearch(input) gjør et eksisterende felt om.
// Lytterne ligger på document, så felt som tegnes på nytt virker uten egen binding.
const GLASS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>';
const XSVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const CSS = `.sf{position:relative;display:flex;align-items:center;gap:8px;min-width:0}
.sf>input{flex:1;min-width:0}
.sf-ic{flex:none;display:grid;place-items:center;width:26px;height:26px;color:inherit;opacity:.65;pointer-events:none}
[data-sf] button.sf-x.sf-x{flex:none;width:36px;min-width:36px;height:36px;margin:0 -5px;padding:0;border:0;border-radius:18px;background:transparent;color:inherit;box-shadow:none;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sf-x>span{width:26px;height:26px;border-radius:13px;background:rgba(127,127,127,.22);display:grid;place-items:center}
.sf-x:hover>span{background:rgba(127,127,127,.32)}
.sf-x:focus-visible{outline:2px solid currentColor;outline-offset:-4px;border-radius:18px}
[data-sf]:not(.has) button.sf-x.sf-x,[data-sf].has .sf-ic{display:none}
.sf>input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none}`;

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('sf-css')) return;
  const s = document.createElement('style');
  s.id = 'sf-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

export const clearBtn = () => `<button type="button" class="sf-x" data-sf-clear aria-label="Tøm søket"><span>${XSVG}</span></button>`;
export const glassIcon = () => `<span class="sf-ic" aria-hidden="true">${GLASS}</span>`;

/** HTML for et søkefelt. attrs = ekstra attributter på <input> (ferdig escapet tekst). icon:false = bare ✕ (eget ikon). */
export function searchField({ name = 'q', value = '', placeholder = '', cls = '', inputCls = '', attrs = '', label = '', icon = true, type = 'search' } = {}) {
  injectCss(); bindSearchFields();
  const has = String(value ?? '').length > 0;
  return `<div class="sf${cls ? ` ${cls}` : ''}${has ? ' has' : ''}" data-sf>${icon ? glassIcon() : ''}${clearBtn()}<input type="${type}" name="${esc(name)}"${inputCls ? ` class="${esc(inputCls)}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(label || placeholder || 'Søk')}" autocomplete="off" spellcheck="false" enterkeyhint="search" ${attrs}></div>`;
}

/** Gjør et eksisterende <input> om til et SearchField (pakker det inn, legger til ikon og ✕). Trygt å kalle flere ganger. */
export function enhanceSearch(input, { icon = true, cls = '' } = {}) {
  if (!input || input.closest('[data-sf]')) return input?.closest('[data-sf]') ?? null;
  injectCss(); bindSearchFields();
  const w = document.createElement('div');
  w.className = `sf${cls ? ` ${cls}` : ''}${input.value ? ' has' : ''}`;
  w.dataset.sf = '';
  input.replaceWith(w);
  w.innerHTML = (icon ? glassIcon() : '') + clearBtn();
  w.appendChild(input);
  return w;
}
/** Oppdaterer ✕/forstørrelsesglass etter at verdien er satt fra kode. */
export function syncSearch(input) { const w = input?.closest?.('[data-sf]'); if (w) w.classList.toggle('has', !!input.value); }

/** Tømmer feltet som om brukeren trykket ✕. */
export function clearSearch(input) {
  if (!input) return;
  input.value = '';
  syncSearch(input);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new CustomEvent('sf:clear', { bubbles: true }));
}

let bound = false;
export function bindSearchFields() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  injectCss();
  const inputOf = (el) => el?.closest?.('[data-sf]')?.querySelector('input');
  document.addEventListener('input', (e) => { if (e.target.closest?.('[data-sf]')) syncSearch(e.target); }, true);
  // Fokus beholdes: knappen tar aldri fokus fra feltet.
  document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('[data-sf-clear]')) e.preventDefault(); }, true);
  document.addEventListener('mousedown', (e) => { if (e.target.closest?.('[data-sf-clear]')) e.preventDefault(); }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-sf-clear]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const i = inputOf(b);
    clearSearch(i);
    i?.focus();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !e.target.closest?.('[data-sf]') || e.target.tagName !== 'INPUT' || !e.target.value) return;
    e.preventDefault(); e.stopPropagation();
    clearSearch(e.target);
  }, true);
}
