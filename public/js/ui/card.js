// Kort (components/ui.css → .ui-card). body er ferdig HTML (kalleren escaper innholdet sitt); title og sub escapes her.
import { esc } from './html.js';

/** HTML for et kort med valgfri tittel og undertekst. */
export function cardHtml({ title = '', sub = '', body = '', label = '' } = {}) {
  const head = title ? `<h3 class="ui-card-h">${esc(title)}${sub ? ` <span class="ui-card-sub">${esc(sub)}</span>` : ''}</h3>` : '';
  const aria = label || title ? ` aria-label="${esc(label || title)}"` : '';
  return `<section class="ui-card"${aria}>${head}${body}</section>`;
}
