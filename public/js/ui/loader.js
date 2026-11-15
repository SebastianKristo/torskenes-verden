// Laster (components/ui.css → .ui-loader): spinner med tekst. Står stille ved «Reduser bevegelse».
import { esc } from './html.js';

export function loaderHtml(text = 'Laster …') {
  return `<span class="ui-loader" role="status" aria-live="polite"><i aria-hidden="true"></i>${esc(text)}</span>`;
}
