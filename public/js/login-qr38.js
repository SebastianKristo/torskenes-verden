// Prompt 38 (WEB38): logg inn med QR-kode fra en mobil som allerede er logget inn (claude-code-qr-innlogging.md, fasit «Logg inn QR.dc.html»).
// 1) POST /api/auth/qr → {sid, nonce, url, deepLink, expiresAt, ttl:60}. QR-en inneholder bare url (https://<host>/l/<sid>.<nonce>),
//    aldri en token. Koden fornyes automatisk når den går ut (og bare mens siden er synlig).
// 2) GET /api/auth/qr/:sid/events (SSE, bundet til denne nettleserens cookie): pending → scanned{user:{name, avatarUrl}, match}
//    → approved{needs2fa} | denied | expired | done.
// 3) Godkjent: POST /api/auth/qr/finish {sid} → økt-cookie, eller {needs2fa:true} + pre-auth → 6 sifferbokser → POST /api/auth/2fa {code}
//    (TOTP eller reservekode; 5 feil = 15 min sperre på serveren).
// Svarer serveren 404 (eldre versjon), vises bare passord-innloggingen.
import { qrPath } from './qr38.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = (n) => (String(n ?? '').match(/\p{L}/gu) ?? ['?']).slice(0, 2).join('').toUpperCase();
const MODE_KEY = 'hl_login_mode';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat modus */ } };

/** «MacBook · Safari» ut fra nettleseren (vises i bekreftelsen). */
export function deviceLabel(ua = navigator.userAgent) {
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows-PC' : /Linux/.test(ua) ? 'Linux' : 'Enhet';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'nettleser';
  return `${os} · ${br}`;
}

const Q = { st: 'off', d: null, es: null, left: 60, tick: 0, user: null, match: '', code: '', backup: false, err: '', shake: 0, busy: false, finishing: false, hooks: null, retry: 0 };
const el = () => document.getElementById('g-qr');

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
function stop() {
  try { Q.es?.close(); } catch { /* */ }
  Q.es = null; clearInterval(Q.tick); Q.tick = 0;
}

/** Ny kode. false når serveren ikke har QR-innlogging (da vises passordet). */
async function fresh() {
  stop();
  Q.user = null; Q.match = ''; Q.code = ''; Q.err = ''; Q.finishing = false; Q.backup = false;
  let r;
  try { r = await post('/api/auth/qr', {}); } catch { r = { ok: false, status: 0 }; }
  if (!r.ok || !r.data?.sid || !(r.data.url || r.data.nonce)) {
    if (r.status === 429) { Q.st = 'wait'; Q.err = r.data?.error || 'For mange forsøk. Vent litt.'; paint(); setTimeout(() => { if (Q.st === 'wait') fresh(); }, 15_000); return true; }
    if (Q.retry++ < 1 && r.status === 0) { setTimeout(fresh, 1500); return true; }
    Q.st = 'off'; return false;
  }
  Q.retry = 0;
  Q.d = r.data;
  Q.d.url ||= `${location.origin}/l/${Q.d.sid}.${Q.d.nonce}`;
  Q.st = 'qr';
  countdown();
  listen();
  paint();
  return true;
}
function countdown() {
  const end = Q.d.expiresAt ? new Date(Q.d.expiresAt).getTime() : Date.now() + (Q.d.ttl ?? 60) * 1000;
  const upd = () => {
    Q.left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const t = el()?.querySelector('[data-qr-ttl]');
    if (t) t.textContent = `Koden fornyes om ${Q.left} s`;
    if (Q.left <= 0 && (Q.st === 'qr')) { clearInterval(Q.tick); if (!document.hidden) fresh(); }
  };
  clearInterval(Q.tick);
  Q.tick = setInterval(upd, 1000);
  upd();
}
function listen() {
  if (!window.EventSource) return;
  const es = new EventSource(`/api/auth/qr/${encodeURIComponent(Q.d.sid)}/events`, { withCredentials: true });
  Q.es = es;
  const on = (type, raw) => {
    let j = {};
    try { j = raw ? JSON.parse(raw) : {}; } catch { j = {}; }
    const st = type !== 'message' ? type : j.state ?? j.status ?? j.type ?? '';
    onState(st, j);
  };
  es.onmessage = (e) => on('message', e.data);
  for (const t of ['pending', 'scanned', 'approved', 'denied', 'expired', 'done']) es.addEventListener(t, (e) => on(t, e.data));
  es.onerror = () => { if (es.readyState === 2 && Q.es === es && Q.st === 'qr') setTimeout(() => { if (Q.es === es && Q.st === 'qr') fresh(); }, 3000); };
}
function onState(st, j) {
  if (st === 'scanned') {
    Q.user = j.user ?? Q.user ?? { name: '' }; Q.match = String(j.match ?? Q.match ?? '');
    if (Q.st === 'qr' || Q.st === 'scanned') { Q.st = 'scanned'; paint(); }
  } else if (st === 'approved') {
    if (j.user) Q.user = j.user;
    finish(!!j.needs2fa);
  } else if (st === 'denied') {
    stop(); Q.st = 'denied'; paint();
  } else if (st === 'expired') {
    if (Q.st === 'qr' || Q.st === 'scanned') { if (Q.st === 'scanned') { stop(); Q.st = 'expired'; paint(); } else fresh(); }
  } else if (st === 'done') {
    if (Q.st !== 'otp' && Q.st !== 'ok') finish(false);
  }
}
async function finish(needs2fa) {
  if (Q.finishing) return;
  Q.finishing = true;
  try { Q.es?.close(); } catch { /* */ }
  Q.es = null; clearInterval(Q.tick);
  const r = await post('/api/auth/qr/finish', { sid: Q.d.sid }).catch(() => ({ ok: false, data: {} }));
  if (r.ok && !(r.data?.needs2fa || r.data?.needsTotp)) return success(r.data?.user);
  if (r.data?.needs2fa || r.data?.needsTotp || needs2fa) { Q.st = 'otp'; Q.code = ''; Q.err = ''; paint(); focusOtp(); return; }
  Q.st = 'denied'; Q.err = r.data?.error || 'Innloggingen kunne ikke fullføres.'; paint();
}
function success(user) {
  if (user) Q.user = { ...(Q.user ?? {}), ...user, name: user.name ?? user.displayName ?? Q.user?.name ?? user.username };
  stop();
  Q.st = 'ok'; paint();
  setTimeout(() => Q.hooks?.done(user ?? Q.user), 1200);
}
async function sendOtp() {
  const code = Q.code.trim();
  if (Q.busy) return;
  if (!Q.backup && code.length !== 6) return;
  if (Q.backup && code.length < 6) { Q.err = 'Skriv inn en reservekode.'; paint(); return; }
  Q.busy = true;
  const r = await post('/api/auth/2fa', { code, sid: Q.d?.sid }).catch(() => ({ ok: false, status: 0, data: {} }));
  Q.busy = false;
  if (r.ok && r.data?.ok !== false) return success(r.data?.user);
  Q.err = r.status === 429 || r.data?.locked ? (r.data?.error || 'For mange feil koder. Prøv igjen om 15 minutter.') : r.status === 0 ? 'Fikk ikke kontakt med serveren.' : (r.data?.error || 'Feil kode. Prøv igjen.');
  if (r.data?.expired || r.status === 410) { Q.err = 'Innloggingen tok for lang tid. Skann en ny kode.'; Q.st = 'expired'; }
  Q.code = ''; Q.shake++;
  paint(); focusOtp();
}
function focusOtp() { setTimeout(() => el()?.querySelector('[data-qr-code]')?.focus({ preventScroll: true }), 30); }

function avatar(sz) {
  const u = Q.user ?? {}, n = u.name || u.username || '';
  return u.avatarUrl && /^(\/|https:)/.test(u.avatarUrl)
    ? `<img class="gq-av" src="${esc(u.avatarUrl)}" alt="" width="${sz}" height="${sz}" style="width:${sz}px;height:${sz}px">`
    : `<span class="gq-av" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.38)}px">${esc(initials(n))}</span>`;
}
function qrBox() {
  const { d, n } = qrPath(Q.d.url), sc = Q.st === 'scanned';
  return `<div class="gq-box${sc ? ' dim' : ''}"><svg viewBox="0 0 ${n} ${n}" width="200" height="200" shape-rendering="crispEdges" role="img" aria-label="QR-kode for innlogging"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#1b1a17"/></svg>
    <span class="gq-logo" aria-hidden="true"><span>✦</span></span>
    ${sc ? `<span class="gq-scan">${avatar(52)}<b>Skannet av ${esc(Q.user?.name || 'mobilen')}</b><span>Godkjenn på mobilen …</span>${Q.match ? `<span class="gq-match" aria-label="Kontrollkode ${esc(Q.match)}">${esc(Q.match)}</span><span class="gq-mt">Samme kode skal stå på mobilen</span>` : ''}</span>` : ''}</div>`;
}
function paint() {
  const root = el();
  if (!root) return;
  root.hidden = Q.st === 'off' || Q.st === 'pw';
  if (root.hidden) return;
  let h = '';
  if (Q.st === 'qr' || Q.st === 'scanned') {
    h = `<span class="gate-lab">LOGG INN MED QR-KODE</span><b class="gate-h">Logg inn på ${esc(Q.hooks?.app?.() || 'Homelab')}</b>
      <div class="gq-main">${qrBox()}
        <span class="gq-ttl" data-qr-ttl>Koden fornyes om ${Q.left} s</span>
        <span class="gq-help">Åpne Homelab på mobilen → <b>Innstillinger → Konto → Logg inn på ny enhet</b>, eller skann med kameraet.</span>
        <button type="button" class="gate-link gq-pw" data-qr-pw>Logg inn med passord i stedet</button></div>`;
  } else if (Q.st === 'otp') {
    const cells = Array.from({ length: 6 }, (_, i) => `<span class="${Q.err ? 'bad' : Q.code.length === i ? 'on' : ''}">${esc(Q.code[i] ?? '')}</span>`).join('');
    h = `<div class="gq-main gq-otp">${avatar(56)}<b class="gq-t">Totrinnsbekreftelse</b>
      <span class="gq-help">Mobilen godkjente innloggingen for <b>${esc(Q.user?.name || 'deg')}</b>. ${Q.backup ? 'Skriv inn en av reservekodene dine.' : 'Skriv inn den 6-sifrede koden fra autentiseringsappen.'}</span>
      ${Q.backup ? '' : `<div class="gate-otp big${Q.err && Q.shake ? ' shake' : ''}" aria-hidden="true">${cells}</div>`}
      <input class="gate-in gate-code${Q.backup ? ' rc' : ''}" data-qr-code value="${esc(Q.code)}" ${Q.backup ? 'inputmode="text" autocomplete="off" placeholder="xxxx-xxxx"' : 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Skriv koden"'} aria-label="${Q.backup ? 'Reservekode' : 'Kode fra autentiseringsappen'}">
      ${Q.err ? `<span class="gate-err" role="alert">${esc(Q.err)}</span>` : ''}
      ${Q.backup ? '<button type="button" class="gate-btn" data-qr-send>Bekreft</button>' : ''}
      <button type="button" class="gate-link gq-pw" data-qr-backup>${Q.backup ? 'Bruk koden fra autentiseringsappen' : 'Bruk en reservekode'}</button></div>`;
  } else if (Q.st === 'ok') {
    h = `<div class="gq-main gq-end"><span class="gq-ok">✓</span><b class="gq-t">Logget inn som ${esc(Q.user?.name || '')}</b><span class="gq-help">${esc(deviceLabel())} er lagt til under Pålitelige enheter.</span></div>`;
  } else if (Q.st === 'denied' || Q.st === 'expired' || Q.st === 'wait') {
    const t = Q.st === 'denied' ? ['×', 'Innloggingen ble avvist', Q.err || 'Avvist på mobilen. Lag en ny kode for å prøve igjen.'] : Q.st === 'expired' ? ['⏱', 'Koden gikk ut', Q.err || 'Godkjenningen tok for lang tid.'] : ['⏱', 'Vent litt', Q.err];
    h = `<div class="gq-main gq-end"><span class="gq-no">${t[0]}</span><b class="gq-t">${esc(t[1])}</b><span class="gq-help">${esc(t[2])}</span>
      ${Q.st === 'wait' ? '' : '<button type="button" class="gate-btn gq-new" data-qr-new>Vis ny kode</button>'}<button type="button" class="gate-link gq-pw" data-qr-pw>Logg inn med passord i stedet</button></div>`;
  }
  root.innerHTML = h;
}

/** Bytter til passord (lagres som valg på enheten) eller tilbake til QR. */
export function showPassword(remember = true) {
  stop();
  Q.st = 'pw';
  if (remember) lsSet(MODE_KEY, 'pw');
  paint();
  Q.hooks?.form(true);
}
export async function showQr() {
  lsSet(MODE_KEY, 'qr');
  Q.hooks?.form(false);
  const ok = await fresh();
  if (!ok) { Q.st = 'pw'; Q.hooks?.form(true); Q.hooks?.noQr?.(); }
}
export const qrActive = () => Q.st !== 'off' && Q.st !== 'pw';

/** hooks: done(user), form(show) viser/skjuler passordskjemaet, app() appnavnet, noQr() når serveren mangler QR. */
export async function initQr(hooks) {
  Q.hooks = hooks;
  const root = el();
  if (!root) return false;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('qrPw' in b.dataset) { showPassword(); return; }
    if ('qrNew' in b.dataset) { fresh(); return; }
    if ('qrBackup' in b.dataset) { Q.backup = !Q.backup; Q.code = ''; Q.err = ''; paint(); focusOtp(); return; }
    if ('qrSend' in b.dataset) sendOtp();
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-qr-code]')) return;
    if (Q.backup) { Q.code = e.target.value; return; }
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (v !== e.target.value) e.target.value = v;
    Q.code = v; Q.err = '';
    root.querySelectorAll('.gate-otp span').forEach((s, i) => { s.textContent = v[i] ?? ''; s.className = v.length === i ? 'on' : ''; });
    if (v.length === 6) sendOtp();
  });
  root.addEventListener('keydown', (e) => { if (e.target.matches('[data-qr-code]') && e.key === 'Enter') { e.preventDefault(); sendOtp(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Q.st === 'qr' && Q.left <= 0) fresh(); });
  window.addEventListener('pagehide', stop);
  if (lsGet(MODE_KEY) === 'pw') {
    // Valgte passord sist: skjemaet først, med lenken «Logg inn med QR-kode fra mobilen» (skjules hvis serveren ikke kan QR).
    Q.st = 'pw'; hooks.form(true);
    return true;
  }
  hooks.form(false);
  const ok = await fresh();
  if (!ok) hooks.form(true);
  return ok;
}
