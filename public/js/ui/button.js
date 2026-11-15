// Knapp (components/ui.css → .ui-btn). Varianter: 'default' (sekundær), 'primary', 'danger', 'quiet'.
import { esc, attrs } from './html.js';

const VARIANTS = new Set(['default', 'primary', 'danger', 'quiet']);

/** HTML for en knapp. attrs = ekstra attributter ({ 'data-x': '1', disabled: true }). */
export function buttonHtml(label, { variant = 'default', type = 'button', attrs: extra = {} } = {}) {
  const v = VARIANTS.has(variant) ? variant : 'default';
  const cls = `ui-btn${v === 'default' ? '' : ` ui-btn--${v}`}`;
  return `<button type="${type === 'submit' ? 'submit' : 'button'}" class="${cls}"${attrs(extra)}>${esc(label)}</button>`;
}
