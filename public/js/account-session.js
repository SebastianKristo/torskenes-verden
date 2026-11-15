// Økt på web: passordark, «Logg ut av alle enheter» (Konto og sikkerhet → Økt) og hurtigtasten som låser skjermen.
// askPassword og logoutAll brukes av Innstillinger (settings-view.js), bindLockKey av skallet (shell.js).
import { logout } from './usercache.js';
import { esc } from './util.js';

/** Lite passordark. Løser med passordet, eller null ved Avbryt/Esc. */
export function askPassword({ title, text, btn = 'Bekreft', danger = false }) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'w38-pw';
    el.innerHTML = `<form class="w38-pw-c" role="dialog" aria-modal="true" aria-label="${esc(title)}"><b>${esc(title)}</b><span>${esc(text)}</span>
      <input type="password" name="pw" autocomplete="current-password" placeholder="Passord" aria-label="Passord" required>
      <span class="w38-pw-e" role="alert" hidden></span>
      <div class="w38-pw-b"><button type="button" data-w38-no>Avbryt</button><button type="submit" class="${danger ? 'red' : ''}">${esc(btn)}</button></div></form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), inp = f.pw;
    const close = (v) => { el.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', key, true);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-w38-no]')) close(null); });
    f.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value) close(inp.value); });
    el.err = (m) => { const x = f.querySelector('.w38-pw-e'); x.textContent = m; x.hidden = false; };
    setTimeout(() => inp.focus(), 30);
  });
}

/** «Logg ut av alle enheter»: POST /api/auth/logout-all {password} → {ok, count}; deretter ut her også. */
export async function logoutAll() {
  for (let i = 0; i < 3; i++) {
    const pw = await askPassword({ title: 'Logg ut av alle enheter', text: i ? 'Feil passord. Prøv igjen.' : 'Alle økter avsluttes, også apper og nettlesere på andre enheter. Skriv passordet for å bekrefte.', btn: 'Logg ut alle', danger: true });
    if (!pw) return;
    let r;
    try { r = await fetch('/api/auth/logout-all', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }); } catch { alert('Fikk ikke kontakt med serveren.'); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) { alert(`Logget ut av ${j.count ?? 'alle'} ${j.count === 1 ? 'enhet' : 'enheter'}.`); await logout(); return; }
    if (r.status === 404) { alert('Serveren støtter ikke dette ennå. Oppdater Homelab.'); return; }
    if (r.status === 429) { alert(j.error || 'For mange forsøk. Vent litt.'); return; }
    if (r.status !== 401 && r.status !== 403) { alert(j.error || `Kunne ikke logge ut (feil ${r.status}).`); return; }
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
