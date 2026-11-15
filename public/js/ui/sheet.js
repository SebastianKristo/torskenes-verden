// Ark / dialog (components/ui.css → .ui-scrim + .ui-sheet): modal dialog med tittel, tekst, innhold og knapper.
// Esc og klikk utenfor lukker. Fokus flyttes inn i arket og tilbake når det lukkes.
import { esc } from './html.js';

/** HTML for selve arket (uten bakgrunn). body og foot er ferdig HTML. */
export function sheetHtml({ title, text = '', body = '', foot = '', tag = 'div' } = {}) {
  const t = tag === 'form' ? 'form' : 'div';
  return `<${t} class="ui-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2 class="ui-sheet-t">${esc(title)}</h2>${text ? `<p class="ui-sheet-x">${esc(text)}</p>` : ''}${body}${foot ? `<div class="ui-sheet-f">${foot}</div>` : ''}</${t}>`;
}

/**
 * Åpner et ark. → { el, sheet, close(v) }. onClose(v) kalles én gang med verdien (null ved Esc/klikk utenfor).
 * Elementer med [data-ui-close] lukker arket.
 */
export function openSheet(opts = {}, onClose = () => {}) {
  const prev = document.activeElement;
  const el = document.createElement('div');
  el.className = 'ui-scrim';
  el.innerHTML = sheetHtml(opts);
  document.body.appendChild(el);
  const sheet = el.firstElementChild;
  let done = false;
  const close = (v = null) => {
    if (done) return;
    done = true;
    el.remove();
    document.removeEventListener('keydown', key, true);
    try { prev?.focus?.(); } catch { /* */ }
    onClose(v);
  };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-ui-close]')) close(null); });
  setTimeout(() => (sheet.querySelector('input,select,textarea,button') ?? sheet).focus?.(), 30);
  return { el, sheet, close };
}
