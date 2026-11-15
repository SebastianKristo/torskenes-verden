// Prompt 51 (SEC51): passkey-innlogging og «Ny enhet må godkjennes» på innloggingssiden (web/PWA).
// - Passkey: POST /api/auth/passkey/options → navigator.credentials.get → POST /api/auth/passkey/login. Passkeyen er en likeverdig
//   faktor til passordet (krever Face ID / fingeravtrykk / PIN på enheten). Knappen vises bare når serveren har PUBLIC_URL (https)
//   og nettleseren støtter WebAuthn.
// - Godkjenning: svarer serveren 403 {code:'DEVICE_APPROVAL_REQUIRED'} (ny enhet fra internett), venter siden på at innloggingen
//   godkjennes fra en kjent enhet eller av admin (GET …/status hvert 2,5 s), og fullfører med POST …/finish i samme nettleser.
const b64uToBuf = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
const bufToB64u = (buf) => { const u = new Uint8Array(buf); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

export const passkeySupported51 = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.get;

/** WebAuthn-alternativer fra serveren (base64url) → ArrayBuffer der nettleseren vil ha det. */
export function decodeOptions51(pk) {
  const o = { ...pk, challenge: b64uToBuf(pk.challenge) };
  if (pk.user) o.user = { ...pk.user, id: b64uToBuf(pk.user.id) };
  if (pk.allowCredentials) o.allowCredentials = pk.allowCredentials.map((c) => ({ ...c, id: b64uToBuf(c.id) }));
  if (pk.excludeCredentials) o.excludeCredentials = pk.excludeCredentials.map((c) => ({ ...c, id: b64uToBuf(c.id) }));
  return o;
}
/** PublicKeyCredential → JSON (base64url) til serveren. */
export function encodeCredential51(cred) {
  const r = cred.response, out = { id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type, response: { clientDataJSON: bufToB64u(r.clientDataJSON) } };
  if (r.attestationObject) { out.response.attestationObject = bufToB64u(r.attestationObject); out.response.transports = r.getTransports?.() ?? []; }
  if (r.authenticatorData) { out.response.authenticatorData = bufToB64u(r.authenticatorData); out.response.signature = bufToB64u(r.signature); out.response.userHandle = r.userHandle ? bufToB64u(r.userHandle) : null; }
  return out;
}
const post = async (url, body, headers = {}) => {
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
};

/* ---------------- Venter på godkjenning ---------------- */

let waiting = null;
function box(text, sub) {
  let el = document.getElementById('g-sec51');
  if (!el) {
    el = document.createElement('div');
    el.id = 'g-sec51';
    el.setAttribute('role', 'status');
    el.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:14px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.55);font-size:14px;line-height:1.45;margin:4px 0';
    const err = document.getElementById('g-err');
    err?.parentNode?.insertBefore(el, err);
  }
  el.replaceChildren();
  const b = document.createElement('b'); b.textContent = text;
  const s = document.createElement('span'); s.textContent = sub ?? ''; s.style.opacity = '.75';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'gate-link'; cancel.textContent = 'Avbryt';
  cancel.addEventListener('click', () => stopWaiting(true));
  el.append(b, s, cancel);
  el.hidden = false;
  return el;
}
function stopWaiting(hide) {
  if (waiting) { clearInterval(waiting.t); waiting = null; }
  if (hide) { const el = document.getElementById('g-sec51'); if (el) el.hidden = true; }
}
/** data = 403-svaret fra innloggingen. done(user) når godkjent, fail(tekst) ved avvisning/utløp. */
export function waitApproval51(data, { done, fail }) {
  stopWaiting(false);
  box('Venter på godkjenning …', `Dette er en ny enhet (${data.device || 'ukjent enhet'}). Åpne Homelab på en enhet du allerede er logget inn på – Innstillinger → Sikkerhet – og trykk «Godkjenn». En administrator kan også godkjenne.`);
  const hdr = { 'X-Approval-Key': data.pollKey };
  const tick = async () => {
    if (!waiting) return;
    let st = null;
    try { const r = await fetch(data.statusUrl, { credentials: 'same-origin', headers: hdr, cache: 'no-store' }); st = await r.json().catch(() => null); if (!r.ok) st = { state: st?.state ?? 'expired' }; } catch { return; }
    if (!waiting) return;
    if (st?.state === 'approved') {
      stopWaiting(true);
      const f = await post(data.finishUrl, {}, hdr);
      return f.ok ? done(f.data.user) : fail(f.data.error || 'Kunne ikke fullføre innloggingen.');
    }
    if (st?.state === 'denied') { stopWaiting(true); return fail('Innloggingen ble avvist.'); }
    if (st?.state === 'expired' || Date.now() > Date.parse(data.expiresAt)) { stopWaiting(true); return fail('Godkjenningen tok for lang tid. Logg inn på nytt.'); }
  };
  waiting = { t: setInterval(tick, 2500) };
  tick();
  return true;
}

/* ---------------- Passkey-knappen ---------------- */

/** Viser «Logg inn med passkey» når serveren og nettleseren kan. → Promise<boolean> */
export async function initPasskey51({ done, fail, username, button }) {
  if (!passkeySupported51() || !button) return false;
  let st = null;
  try { st = await (await fetch('/api/auth/passkey/status', { credentials: 'same-origin', cache: 'no-store' })).json(); } catch { st = null; }
  if (!st?.available) return false;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const o = await post('/api/auth/passkey/options', { username: username() || undefined });
      if (!o.ok) return fail(o.data.error || 'Passkey er ikke tilgjengelig.');
      let cred;
      try { cred = await navigator.credentials.get({ publicKey: decodeOptions51(o.data.publicKey) }); } catch (e) { return fail(e?.name === 'NotAllowedError' ? 'Avbrutt. Prøv igjen, eller bruk passordet.' : 'Fant ingen passkey for denne serveren på enheten.'); }
      if (!cred) return fail('Fant ingen passkey.');
      const r = await post('/api/auth/passkey/login', { challengeId: o.data.challengeId, credential: encodeCredential51(cred), remember: true });
      if (r.ok) return done(r.data.user);
      if (r.data.pendingApproval) return waitApproval51(r.data, { done, fail });
      return fail(r.data.error || 'Passkeyen ble ikke godtatt.');
    } catch { return fail('Fikk ikke kontakt med serveren.'); } finally { button.disabled = false; }
  });
  return true;
}
