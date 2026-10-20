// Prompt 38 (WEB38): små ting i skallet.
// - Kalender.app for Mac (/kalender?app=mac, html[data-kal-app]): kalender.js/kal38.js gjør kalenderen. Her: fanetittel «Kalender»,
//   lenker til andre Homelab-sider og eksterne sider åpnes i nettleseren (melding open {url} til appen), og 401 fra API-et
//   gir meldingen logout (appen viser sin egen innlogging) i stedet for å gå til /login inne i vinduet.
import { toNative } from './kal38.js';
import { logout } from './usercache.js';
import { esc } from './util.js';

function kalAppShell() {
  document.body.classList.add('kal-app');
  const t = () => { if (document.title !== 'Kalender') document.title = 'Kalender'; };
  t(); window.addEventListener('hashchange', () => setTimeout(t, 0));
  // Bare kalenderen og Innstillinger hører hjemme i vinduet; alt annet åpnes i nettleseren.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') ?? '';
    if (/^(javascript:|mailto:|tel:)/i.test(href) || href === '#') return;
    let u; try { u = new URL(href, location.href); } catch { return; }
    const same = u.origin === location.origin;
    const inside = same && u.pathname === location.pathname && (/^#\/(kalender|innstillinger)/.test(u.hash) || (!u.hash && u.search === location.search));
    if (inside && a.target !== '_blank') return;
    e.preventDefault();
    if (!toNative({ type: 'open', url: u.href })) window.open(u.href, '_blank', 'noopener');
  }, true);
  // Utløpt økt: appen logger inn på nytt (native innlogging + /api/auth/app-session).
  const f0 = window.fetch.bind(window);
  let told = false;
  window.fetch = async (...args) => {
    const r = await f0(...args);
    if (r.status === 401 && !told) {
      const url = String(args[0]?.url ?? args[0] ?? '');
      if (/\/api\/(state|me|kalender)/.test(url)) { told = true; toNative({ type: 'logout' }); }
    }
    return r;
  };
}

/* ---------- Konto → ØKT (claude-code-konto-profilbilde.md, 2026-10-20) ---------- */

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
function bindLockKey() {
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), code = e.code;
    const lock = (e.ctrlKey && e.altKey && !e.metaKey && (k === 'l' || code === 'KeyL')) || (e.ctrlKey && e.metaKey && (k === 'q' || code === 'KeyQ'));
    if (!lock) return;
    e.preventDefault();
    logout();
  });
}

/* ---------- Hjem web 1c: fartknappen på nyhetslinjen ---------- */
function bindTicker() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('[data-tick-sp]')) return;
    e.preventDefault();
    import('./extras.js').then((m) => m.cycleTick());
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.ticker-label')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('hl:theme', () => import('./extras.js').then((m) => m.renderTicker()));
}

export function initWeb38() {
  if (document.documentElement.dataset.kalApp) { kalAppShell(); return; }
  bindLockKey();
  bindTicker();
}
