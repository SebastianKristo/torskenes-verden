// Økt på web: passordark, «Logg ut av alle enheter» (Konto og sikkerhet → Økt) og hurtigtasten som låser skjermen.
// askPassword og logoutAll brukes av Innstillinger (settings-view.js), bindLockKey av skallet (shell.js).
import { logout } from './usercache.js';
import { openSheet } from './ui/sheet.js';
import { buttonHtml } from './ui/button.js';
import { toast } from './ui/toast.js';

/** Lite passordark (felles ark fra ui/sheet.js). Løser med passordet, eller null ved Avbryt/Esc/klikk utenfor. */
export function askPassword({ title, text, btn = 'Bekreft', danger = false }) {
  return new Promise((res) => {
    const { sheet, close } = openSheet({
      title, text, tag: 'form',
      body: '<input class="ui-field" type="password" name="pw" autocomplete="current-password" placeholder="Passord" aria-label="Passord" required>',
      foot: buttonHtml('Avbryt', { attrs: { 'data-ui-close': '' } }) + buttonHtml(btn, { type: 'submit', variant: danger ? 'danger' : 'primary' }),
    }, res);
    sheet.addEventListener('submit', (e) => { e.preventDefault(); if (sheet.pw.value) close(sheet.pw.value); });
  });
}

/** «Logg ut av alle enheter»: POST /api/auth/logout-all {password} → {ok, count}; deretter ut her også. */
export async function logoutAll() {
  for (let i = 0; i < 3; i++) {
    const pw = await askPassword({ title: 'Logg ut av alle enheter', text: i ? 'Feil passord. Prøv igjen.' : 'Alle økter avsluttes, også apper og nettlesere på andre enheter. Skriv passordet for å bekrefte.', btn: 'Logg ut alle', danger: true });
    if (!pw) return;
    let r;
    try { r = await fetch('/api/auth/logout-all', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }); } catch { toast('Fikk ikke kontakt med serveren.', { tone: 'danger' }); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) { alert(`Logget ut av ${j.count ?? 'alle'} ${j.count === 1 ? 'enhet' : 'enheter'}.`); await logout(); return; }
    if (r.status === 404) { toast('Serveren støtter ikke dette ennå. Oppdater Homelab.', { tone: 'danger' }); return; }
    if (r.status === 429) { toast(j.error || 'For mange forsøk. Vent litt.', { tone: 'danger' }); return; }
    if (r.status !== 401 && r.status !== 403) { toast(j.error || `Kunne ikke logge ut (feil ${r.status}).`, { tone: 'danger' }); return; }
  }
}

/** Ctrl+Alt+L (og ⌃⌘Q som på Mac) låser skjermen. */
export function bindLockKey() {
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), code = e.code;
    const lock = (e.ctrlKey && e.altKey && !e.metaKey && (k === 'l' || code === 'KeyL')) || (e.ctrlKey && e.metaKey && (k === 'q' || code === 'KeyQ'));
    if (!lock) return;
    e.preventDefault();
    logout();
  });
}
