// Prompt 41: /app-auth – godkjenn innlogging i en annen app (Kalender) fra nettleseren.
// Kalender åpner https://<host>/app-auth?client=kalender&redirect=kalender://auth&state=…&cc=<PKCE S256-utfordring>.
// Er Homelab-appen installert, fanger den lenken (universal link / App Link). Ellers havner man her:
//   ikke innlogget → /login?next=… og tilbake hit · innlogget → «Logge inn i Kalender?» med Godkjenn / Avvis.
// Godkjenn → POST /api/auth/app-code {client, redirect, state, code_challenge} → {code} (engangs, ≤ 60 s, bundet til PKCE)
// → redirect?code=…&state=… . Avvis → redirect?error=access_denied&state=… . Serveren hviteliste­r redirect; vi sjekker i tillegg her.

const root = document.getElementById('aa41');
const q = new URLSearchParams(location.search);
const P = { client: q.get('client') ?? '', redirect: q.get('redirect') ?? '', state: q.get('state') ?? '', cc: q.get('cc') ?? q.get('code_challenge') ?? '' };
const APPS = { kalender: 'Kalender' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Bare kalender://auth eller https på samme vert (Kalender på web/Mac). */
function redirectOk(r) {
  if (r === 'kalender://auth') return true;
  try { const u = new URL(r); return u.protocol === 'https:' && u.host === location.host; } catch { return false; }
}
function back(params) {
  const u = P.redirect + (P.redirect.includes('?') ? '&' : '?') + new URLSearchParams({ ...params, state: P.state });
  location.href = u;
}
function card(inner) { root.innerHTML = `<div class="aa41-card">${inner}</div>`; }
function fail(t, sub = '') { card(`<span class="aa41-k">HOMELAB</span><b class="aa41-t">${esc(t)}</b>${sub ? `<span class="aa41-s">${esc(sub)}</span>` : ''}`); }

async function main() {
  const name = APPS[P.client];
  if (!name) return fail('Ukjent app', 'Lenken mangler eller har feil «client».');
  if (!redirectOk(P.redirect)) return fail('Ugyldig retur-adresse', `${name} kan bare sende deg tilbake til kalender://auth.`);
  if (!/^[\w.~-]{8,256}$/.test(P.state) || !/^[A-Za-z0-9_-]{43,128}$/.test(P.cc)) return fail('Lenken er ufullstendig', 'Mangler state eller PKCE-utfordring. Prøv «Logg inn med Homelab-appen» på nytt.');
  let me = null;
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (r.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    if (r.ok) me = await r.json();
  } catch { /* nettverksfeil */ }
  if (!me) return fail('Får ikke kontakt med Homelab', 'Sjekk nettet og prøv igjen.');
  const who = me.me?.name || me.name || me.me?.username || me.username || '';
  const ini = who.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  card(`<span class="aa41-ic" aria-hidden="true"><b>${new Date().getDate()}</b></span>
    <span class="aa41-k">HOMELAB · INNLOGGING</span><b class="aa41-t">Logge inn i ${esc(name)}?</b>
    <span class="aa41-s">${esc(name)} ber om å bruke kontoen din. Den får se kalenderne og innstillingene dine. Du kan logge ut av ${esc(name)} når som helst, og utlogging i Homelab logger ut ${esc(name)} også.</span>
    <span class="aa41-who"><i>${esc(ini)}</i><span><b>${esc(who)}</b><small>${esc(location.host)}</small></span></span>
    <div class="aa41-acts"><button type="button" class="aa41-no" data-aa="no">Avvis</button><button type="button" class="aa41-ok" data-aa="ok">Godkjenn</button></div>
    <span class="aa41-err" role="status"></span>`);
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-aa]');
    if (!b) return;
    if (b.dataset.aa === 'no') { back({ error: 'access_denied' }); return; }
    root.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    b.textContent = 'Godkjenner …';
    try {
      const r = await fetch('/api/auth/app-code', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client: P.client, redirect: P.redirect, state: P.state, code_challenge: P.cc, code_challenge_method: 'S256' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.code) throw new Error(r.status === 404 ? 'Serveren støtter ikke app-innlogging ennå. Oppdater Homelab.' : `${d.error || 'Fikk ikke godkjent'} (HTTP ${r.status})`);
      card(`<span class="aa41-k">HOMELAB</span><b class="aa41-t">✓ Godkjent</b><span class="aa41-s">Sender deg tilbake til ${esc(name)} …</span>`);
      back({ code: d.code });
    } catch (err) {
      root.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      b.textContent = 'Prøv igjen';
      const el = root.querySelector('.aa41-err'); if (el) el.textContent = err.message;
    }
  });
}
main();
