// Totrinnsbekreftelse satt opp i appen (prompt 40, claude-code-2fa-i-appen.md, fasit tfVals): gruppen «Tofaktor» i
// Innstillinger → Konto og sikkerhet og arket med de fire stegene (metode, autentiseringsapp, kode, reservekoder), og
// administrasjon når den er på (nye reservekoder, bytt app, passnøkkel, slå av). Skilt ut av mobile-jul-og-totrinn.js, som
// fortsatt tar hendelsene (data-p40="tf…", skjemaene og feltene) og sender dem hit, så ingen andre filer endres.
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

/* =====================================================================
   Totrinnsbekreftelse i appen (GET /api/auth/2fa/status, POST setup/enable/disable/backup/regenerate)
   ===================================================================== */
const TF = { st: null, open: false, step: 0, d: null, code: '', err: '', busy: false, codes: [], saved: false, qr: false, cp: false, cc: false, pw: '', needPw: false, off: false, miss: false };
async function tfLoad() {
  try { TF.st = await hlApi('/auth/2fa/status'); TF.miss = false; }
  catch (e) { if (e.status === 404) TF.miss = true; TF.st = { enabled: !!m.me?.totp, backupLeft: null }; }
}
const tfOn = () => (TF.st ? !!TF.st.enabled : !!m.me?.totp);
/** Gruppen «Tofaktor» i Innstillinger → Konto og sikkerhet (erstatter lenken til web). G = gruppebyggeren i mobile-set.js. */
export function tfaGroup(G) {
  if (!TF.st) tfLoad().then(() => { if (m.screen === 'set') draw(); });
  const on = tfOn(), left = TF.st?.backupLeft;
  const sub = on ? `På · autentiseringsapp${left != null ? ` · ${left} reservekoder igjen` : ''}` : 'Av · sett opp i appen på 1 minutt';
  return G('Tofaktor', [`<button type="button" class="opt-row p40-tfr" data-p40="tfa"><span class="m-grow"><b style="font-weight:500">Totrinnsbekreftelse</b><br><span style="font-size:13px;opacity:.65">${esc(sub)}</span></span><span class="sval" style="opacity:1;color:var(--pp-lab,#f08a76);font-weight:700">${on ? 'Endre ›' : 'Sett opp ›'}</span></button>`],
    'Alt skjer her i appen. Bruk Passord (iOS), Google Authenticator, 1Password eller Aegis.');
}
async function tfSetup() {
  TF.busy = true; TF.err = ''; draw();
  try {
    TF.d = await hlApi('/auth/2fa/setup', { method: 'POST', json: TF.pw ? { password: TF.pw } : {} });
    TF.needPw = false; TF.step = 1;
  } catch (e) {
    if (e.status === 401 || e.status === 403 || /passord|password/i.test(e.message)) { TF.needPw = true; TF.err = TF.pw ? 'Feil passord.' : ''; TF.step = 1; }
    else TF.err = e.status === 404 ? 'Serveren støtter ikke oppsett fra appen ennå. Oppdater Nordlys OS.' : e.message;
  }
  TF.busy = false; draw();
}
async function tfVerify() {
  if (TF.code.length !== 6) { TF.err = 'Skriv alle 6 sifrene.'; draw(); return; }
  TF.busy = true; TF.err = ''; draw();
  try {
    const r = await hlApi('/auth/2fa/enable', { method: 'POST', json: { code: TF.code } });
    TF.codes = Array.isArray(r?.backupCodes) ? r.backupCodes : []; TF.step = 3; TF.saved = false; haptic('ok');
  } catch (e) { haptic('err'); TF.err = e.status === 400 || e.status === 401 || e.status === 422 ? 'Koden stemmer ikke. Prøv den neste som vises.' : e.message; }
  TF.busy = false; draw();
}
async function tfRegen() {
  TF.busy = true; draw();
  try { const r = await hlApi('/auth/2fa/backup/regenerate', { method: 'POST' }); TF.codes = r?.backupCodes ?? r?.codes ?? []; TF.step = 3; TF.saved = false; }
  catch (e) { flash(e.message, 'err'); }
  TF.busy = false; draw();
}
async function tfDisable() {
  if (!TF.pw) { TF.err = 'Skriv passordet ditt for å slå av.'; draw(); return; }
  TF.busy = true; draw();
  try { await hlApi('/auth/2fa/disable', { method: 'POST', json: { password: TF.pw } }); TF.open = false; TF.st = { ...(TF.st ?? {}), enabled: false }; if (m.me) m.me.totp = false; flash('Totrinnsbekreftelse er slått av'); }
  catch (e) { TF.err = e.status === 401 || e.status === 403 ? 'Feil passord.' : e.message; }
  TF.busy = false; draw();
}
function tfOpen() { Object.assign(TF, { open: true, step: tfOn() ? 9 : 0, d: null, code: '', err: '', codes: [], saved: false, qr: false, cp: false, cc: false, pw: '', needPw: false, off: false }); haptic('tap'); draw(); }
const TT = ['Velg metode', 'Koble til autentiseringsappen', 'Skriv inn koden', 'Lagre reservekodene', 'Totrinnsbekreftelse er på'];
const TS = ['Du setter det opp her i appen. Det tar et minutt.', 'Trykk knappen, så legger autentiseringsappen på denne telefonen inn Homelab av seg selv.', 'Skriv de 6 sifrene som vises i autentiseringsappen nå.', 'Bruk en av disse hvis du mister telefonen. Hver kode virker én gang.', 'Kontoen din er nå beskyttet med passord og kode.'];
export function tfLayer() {
  if (!TF.open) return '';
  const st = TF.step, sec = String(TF.d?.secret ?? '').replace(/\s/g, ''), grp = sec.replace(/(.{4})/g, '$1 ').trim();
  const back = st === 0 || st >= 4 ? 'Sikkerhet' : 'Tilbake';
  const title = st === 9 ? 'Totrinnsbekreftelse er på' : TT[st];
  const sub = st === 9 ? `Autentiseringsapp${TF.st?.enabledAt ? ` · lagt til ${new Date(TF.st.enabledAt).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo' })}` : ''}${TF.st?.backupLeft != null ? ` · ${TF.st.backupLeft} reservekoder igjen` : ''}` : TS[st];
  const bars = st < 4 ? `<div class="p40-tfb">${[0, 1, 2, 3].map((i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>` : '';
  let body = '';
  if (st === 0) body = `<div class="p40-tfm">${[['app', 'Autentiseringsapp', 'Passord, Google Authenticator, 1Password', 'A', '#2b5d8a', 'Anbefalt'], ['pk', 'Passnøkkel med Face ID', 'Ingen kode å skrive. Lagres i iCloud-nøkkelring / Google', 'F', '#2f7a4f', 'Raskest']].map(([k, n, s, i, c, tag], j) => `<button type="button" data-p40="tfm" data-k="${k}"><span class="p40-tfi" style="background:${c}">${i}</span><span class="m-grow"><b>${n}</b><span>${s}</span></span><span class="p40-tag${j ? ' g' : ''}">${tag}</span></button>`).join('')}</div>`;
  else if (st === 1 && TF.needPw) body = `<form class="p40-tff" data-p40form="tfpw"><label><span>Bekreft med passordet ditt</span><input type="password" id="p40-tfpw" autocomplete="current-password" data-p40in="pw" value="${esc(TF.pw)}"></label><button type="submit" class="p40-pri"${TF.busy ? ' disabled' : ''}>${TF.busy ? 'Kobler til …' : 'Fortsett'}</button></form>`;
  else if (st === 1) body = `<a class="p40-pri p40-big" href="${esc(TF.d?.otpauth ?? TF.d?.otpauth_uri ?? '#')}" data-p40="tfotp">Åpne i autentiseringsappen</a>
    <div class="p40-tfs"><span class="p40-lab">HEMMELIG NØKKEL</span><code>${esc(grp || '…')}</code><button type="button" data-p40="tfcp">${TF.cp ? '✓ Kopiert' : 'Kopier'}</button></div>
    <button type="button" class="p40-lnk" data-p40="tfqr">${TF.qr ? 'Skjul QR-kode' : 'Vis QR-kode for en annen enhet'}</button>
    ${TF.qr ? `<div class="p40-tfq">${TF.d?.qrSvg ? TF.d.qrSvg : TF.d?.qrPng ? `<img src="${esc(TF.d.qrPng)}" alt="QR-kode for autentiseringsappen" width="200" height="200">` : '<span>Serveren sendte ingen QR-kode. Bruk nøkkelen over.</span>'}</div>` : ''}
    <button type="button" class="p40-sec" data-p40="tfnext">Jeg har lagt den inn ›</button>`;
  else if (st === 2) body = `<form class="p40-tff" data-p40form="tfcode"><input id="p40-tfc" class="p40-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="••••••" value="${esc(TF.code)}" data-p40in="code" aria-label="Sekssifret kode">
    <button type="submit" class="p40-pri" style="opacity:${TF.code.length === 6 ? 1 : 0.45}"${TF.busy ? ' disabled' : ''}>${TF.busy ? 'Sjekker …' : 'Bekreft'}</button></form>`;
  else if (st === 3) body = `<div class="p40-tfk">${(TF.codes.length ? TF.codes : ['–']).map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="p40-two"><button type="button" class="p40-sec" data-p40="tfcc">${TF.cc ? '✓ Kopiert' : 'Kopier alle'}</button><button type="button" class="p40-sec" data-p40="tfshare">Lagre i Passord / Del</button></div>
    <button type="button" class="p40-ck" data-p40="tfsaved" role="checkbox" aria-checked="${TF.saved}"><i>${TF.saved ? '✓' : ''}</i>Jeg har lagret reservekodene</button>
    <button type="button" class="p40-pri" data-p40="tffin" style="opacity:${TF.saved ? 1 : 0.45}">${TF.off ? 'Ferdig' : 'Slå på totrinnsbekreftelse'}</button>`;
  else if (st === 4) body = `<div class="p40-tfok"><span>✓</span><b>Totrinnsbekreftelse er på</b><span>Denne telefonen er merket som pålitelig enhet.</span></div><button type="button" class="p40-pri" data-p40="tfx">Ferdig</button>`;
  else if (st === 9) body = `<div class="p40-tfman">${[['tfregen', 'Nye reservekoder', TF.st?.backupLeft != null ? `${TF.st.backupLeft} igjen` : ''], ['tfswap', 'Bytt autentiseringsapp', ''], ['tfpk', 'Legg til passnøkkel (Face ID)', ''], ['tfoff', 'Slå av totrinnsbekreftelse', '']].map(([k, n, v]) => `<button type="button" data-p40="${k}" class="${k === 'tfoff' ? 'red' : ''}"><span class="m-grow">${n}</span>${v ? `<span>${esc(v)}</span>` : ''}<span>›</span></button>`).join('')}</div>
    ${TF.off ? `<form class="p40-tff" data-p40form="tfoff"><label><span>Skriv passordet ditt for å slå av</span><input type="password" id="p40-tfpw2" autocomplete="current-password" data-p40in="pw" value="${esc(TF.pw)}"></label><button type="submit" class="p40-pri red"${TF.busy ? ' disabled' : ''}>Slå av</button></form>` : ''}`;
  return `<div class="p40-tf" role="dialog" aria-modal="true" aria-label="Totrinnsbekreftelse"><div class="p40-tfin">
    <div class="p40-tfh"><button type="button" class="p40-back" data-p40="tfback">‹ ${back}</button>${st < 4 ? `<span class="p40-lab">STEG ${st + 1} AV 4</span>` : '<span></span>'}</div>
    ${bars}<b class="p40-tft">${esc(title)}</b><span class="p40-tfsub">${esc(sub)}</span>
    ${TF.err ? `<span class="p40-err" role="alert">${esc(TF.err)}</span>` : ''}${body}</div></div>`;
}
async function tfPasskey() {
  try {
    const o = await hlApi('/auth/passkey/register/options', { method: 'POST' });
    if (!window.PublicKeyCredential || !o) throw Object.assign(new Error('Passnøkkel støttes ikke her'), { status: 501 });
    const b64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const pk = { ...(o.publicKey ?? o), challenge: b64((o.publicKey ?? o).challenge), user: { ...(o.publicKey ?? o).user, id: b64((o.publicKey ?? o).user.id) } };
    const cred = await navigator.credentials.create({ publicKey: pk });
    const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await hlApi('/auth/passkey/register/verify', { method: 'POST', json: { id: cred.id, rawId: enc(cred.rawId), type: cred.type, response: { clientDataJSON: enc(cred.response.clientDataJSON), attestationObject: enc(cred.response.attestationObject) } } });
    flash('Passnøkkelen er lagt til', 'ok');
    if (!tfOn()) { TF.step = 3; await tfRegen(); }
  } catch (e) { flash(e.status === 404 || e.status === 501 ? 'Passnøkkel krever en nyere server. Bruk autentiseringsapp.' : e.name === 'NotAllowedError' ? 'Avbrutt' : e.message); }
}

/** Hendelsene fra bind40 for data-p40="tf…". → true når handlingen er tatt (false: la nettleseren gjøre resten). */
export async function tfBind(k, x, e) {
  switch (k) {
    case 'tfa': e.preventDefault(); tfOpen(); return true;
    case 'tfback': if (TF.step === 0 || TF.step >= 4) { TF.open = false; tfLoad().then(draw); } else { TF.step = TF.step === 1 && TF.needPw ? 0 : TF.step - 1; TF.err = ''; } haptic('tap'); draw(); return true;
    case 'tfx': TF.open = false; tfLoad().then(draw); draw(); return true;
    case 'tfm': if (x.dataset.k === 'pk') { await tfPasskey(); return true; } await tfSetup(); return true;
    case 'tfotp': setTimeout(() => { if (TF.open && TF.step === 1) { TF.step = 2; draw(); setTimeout(() => document.getElementById('p40-tfc')?.focus(), 60); } }, 600); return false; // lenken åpner appen
    case 'tfcp': try { await navigator.clipboard?.writeText(String(TF.d?.secret ?? '').replace(/\s/g, '')); } catch {} TF.cp = true; haptic('ok'); draw(); return true;
    case 'tfqr': TF.qr = !TF.qr; draw(); return true;
    case 'tfnext': TF.step = 2; TF.err = ''; draw(); setTimeout(() => document.getElementById('p40-tfc')?.focus(), 60); return true;
    case 'tfcc': try { await navigator.clipboard?.writeText(TF.codes.join('\n')); } catch {} TF.cc = true; haptic('ok'); draw(); return true;
    case 'tfshare': try { await navigator.share?.({ title: 'Homelab reservekoder', text: TF.codes.join('\n') }); } catch {} return true;
    case 'tfsaved': TF.saved = !TF.saved; haptic('tab'); draw(); return true;
    case 'tffin': if (!TF.saved) return true; TF.step = 4; TF.st = { ...(TF.st ?? {}), enabled: true, backupLeft: TF.codes.length || TF.st?.backupLeft }; if (m.me) m.me.totp = true; haptic('ok'); draw(); return true;
    case 'tfregen': await tfRegen(); return true;
    case 'tfswap': TF.pw = ''; await tfSetup(); return true;
    case 'tfpk': await tfPasskey(); return true;
    case 'tfoff': TF.off = !TF.off; TF.err = ''; draw(); setTimeout(() => document.getElementById('p40-tfpw2')?.focus(), 60); return true;
    default: return false;
  }
}
/** Feltene i arket (koden og passordet). → true når feltet hører til totrinnsarket. */
export function tfInput(t, e) {
  if (t.dataset?.p40in === 'code') { TF.code = t.value.replace(/\D/g, '').slice(0, 6); if (t.value !== TF.code) t.value = TF.code; const b = t.form?.querySelector('.p40-pri'); if (b) b.style.opacity = TF.code.length === 6 ? '1' : '.45'; if (TF.code.length === 6 && e.inputType !== 'deleteContentBackward') tfVerify(); return true; }
  if (t.dataset?.p40in === 'pw') { TF.pw = t.value; return true; }
  return false;
}
/** Skjemaene i arket (data-p40form). */
export function tfSubmit(f) {
  if (f === 'tfcode') tfVerify(); else if (f === 'tfpw') tfSetup(); else if (f === 'tfoff') tfDisable();
}
export const tfOpenNow = () => TF.open;
/** Etter tegning: kodefeltet i steg 3 får fokus. */
export function tfAfterDraw() {
  if (TF.open && TF.step === 2) { const c = document.getElementById('p40-tfc'); if (c && document.activeElement !== c && !c.dataset.f) { c.dataset.f = '1'; c.focus({ preventScroll: true }); } }
}
