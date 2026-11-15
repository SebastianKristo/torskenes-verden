// Tomtilstand (components/ui.css → .ui-empty): «Ingen … ennå» med valgfri forklaring og handling (ferdig knappe-HTML).
import { esc } from './html.js';

export function emptyHtml({ title, text = '', action = '' } = {}) {
  return `<div class="ui-empty" role="status"><p class="ui-empty-t">${esc(title)}</p>${text ? `<p class="ui-empty-x">${esc(text)}</p>` : ''}${action}</div>`;
}
