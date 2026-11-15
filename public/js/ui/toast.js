// Toast (components/ui.css → .ui-toast): kort melding nederst som forsvinner av seg selv. tone: 'default', 'success', 'danger'.
// Ligger i én felles beholder (.ui-toasts, aria-live), så skjermlesere leser meldingen.

const TONES = new Set(['default', 'success', 'danger']);

function host() {
  let h = document.querySelector('.ui-toasts');
  if (!h) {
    h = document.createElement('div');
    h.className = 'ui-toasts';
    h.setAttribute('role', 'status');
    h.setAttribute('aria-live', 'polite');
    document.body.appendChild(h);
  }
  return h;
}

/** Viser en melding i ms millisekunder. → elementet (kan fjernes tidligere med .remove()). */
export function toast(text, { tone = 'default', ms = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = `ui-toast${TONES.has(tone) && tone !== 'default' ? ` ui-toast--${tone}` : ''}`;
  el.textContent = String(text ?? '');
  host().appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
