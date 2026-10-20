// Prompt 40 (SERVER40): totrinnsbekreftelse (2FA) satt opp i appen (iOS/Android/PWA), ikke i nettleseren.
// Montert under /api/auth/2fa (index.js, via api40.js). Sesjon ELLER app-token (authOrToken), alt for den innloggede brukeren.
// Bygger på auth.js (startTotpSetup/confirmTotpSetup/disableTotp/checkSecondFactor) og totp.js – ingen egen TOTP-kode.
//
// GET  /api/auth/2fa/status                 → {enabled, method:'totp', backupLeft, enabledAt, pending}
// POST /api/auth/2fa/setup {password?|reauthToken?}
//        krever passord, et reauth-token (POST /api/auth/reauth) eller en fersk økt (innlogget for under 10 min)
//        → {secret:'JBSW…', secretGrouped:'JBSW Y3DP …', otpauth:'otpauth://totp/Nordlys%20OS:sebastian?…', otpauth_uri, qrSvg, qrPng:'data:image/svg+xml;base64,…',
//           issuer:'Nordlys OS', account:'sebastian', digits:6, period:30, expiresAt}
// POST /api/auth/2fa/enable {code}  (= /verify) → {ok, backupCodes:[10 × 'XXXXX-XXXXX'], enabledAt}
//        feil kode → 400 {error:'Koden stemmer ikke. Prøv den neste som vises.'} (±1 tidsvindu)
// POST /api/auth/2fa/disable {password|code} (= DELETE /api/auth/2fa) → {ok, enabled:false}
// POST /api/auth/2fa/backup/regenerate {password|code|reauthToken} (= /backup-codes) → {ok, backupCodes:[10], backupLeft:10}
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { userInfo, checkPassword, checkSecondFactor, startTotpSetup, confirmTotpSetup, disableTotp, clientIp, loginBlocked, loginFailed, loginSucceeded, currentSessionId } from './auth.js';
import { newRecoveryCodes, recoveryHash, STEP } from './totp.js';
import { consumeReauth } from './reauth.js';

export const ISSUER40 = 'Nordlys OS';
const FRESH_MS = 10 * 60_000;
const row = (id) => db.prepare('SELECT totp_enabled, recovery_hashes, username FROM users WHERE id=?').get(id);
const backupLeft = (r) => { try { return JSON.parse(r?.recovery_hashes || '[]').length; } catch { return 0; } };

/** {enabled, method, backupLeft, enabledAt, pending} */
export function status40(u) {
  const r = row(u);
  const p = kv.get(u, 'totp_pending', null);
  return { enabled: !!r?.totp_enabled, method: 'totp', backupLeft: r?.totp_enabled ? backupLeft(r) : 0, enabledAt: r?.totp_enabled ? kv.get(u, 'totp_enabled_at40', null) : null,
    pending: !!(p && p.exp > Date.now()) };
}
/** Er økta fersk (innlogget for under 10 min)? App-token regnes ikke som fersk. */
function freshSession(c) {
  const sid = currentSessionId(c);
  if (!sid) return false;
  const s = db.prepare('SELECT created FROM sessions WHERE id=?').get(sid);
  return !!s && Date.now() - s.created < FRESH_MS;
}
/** Passord, reauth-token, 2FA-kode (når på) eller fersk økt. → null | feiltekst */
function reauthOk(c, u, b, { allowCode = true, allowFresh = true } = {}) {
  if (b?.password && checkPassword(u, b.password)) return true;
  if (b?.reauthToken && consumeReauth(b.reauthToken, u)) return true;
  if (allowCode && b?.code && row(u)?.totp_enabled && checkSecondFactor(u, b.code)) return true;
  if (allowFresh && !b?.password && !b?.reauthToken && freshSession(c)) return true;
  return false;
}
const group4 = (s) => String(s).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

export const twofa40Api = new Hono();
twofa40Api.use('*', authOrToken);
const limited = (c) => { const wait = loginBlocked(clientIp(c)); return wait ? c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429) : null; };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' ? b : {}; };

twofa40Api.get('/status', (c) => c.json(status40(c.get('user')), 200, { 'Cache-Control': 'no-store' }));

twofa40Api.post('/setup', async (c) => {
  const u = c.get('user');
  const lim = limited(c); if (lim) return lim;
  const b = await body(c);
  if (status40(u).enabled) return c.json({ error: 'Totrinnsbekreftelse er allerede på. Slå den av først, eller lag nye reservekoder.' }, 409);
  if (!reauthOk(c, u, b, { allowCode: false })) {
    if (b.password || b.reauthToken) loginFailed(clientIp(c));
    return c.json({ error: 'Bekreft passordet ditt først', needsPassword: true }, 403);
  }
  loginSucceeded(clientIp(c));
  const s = startTotpSetup(u, { issuer: ISSUER40 });
  const secret = s.secret.replace(/\s+/g, '');
  const account = userInfo(u)?.username ?? '';
  return c.json({ secret, secretGrouped: group4(secret), otpauth: s.otpauthUrl, otpauth_uri: s.otpauthUrl, qrSvg: s.qrSvg,
    qrPng: `data:image/svg+xml;base64,${Buffer.from(s.qrSvg).toString('base64')}`, issuer: ISSUER40, account, digits: 6, period: STEP,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }, 200, { 'Cache-Control': 'no-store' });
});

const enable = async (c) => {
  const u = c.get('user');
  const lim = limited(c); if (lim) return lim;
  const b = await body(c);
  const code = String(b.code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return c.json({ error: 'Skriv den 6-sifrede koden fra autentiseringsappen' }, 400);
  try {
    const codes = confirmTotpSetup(u, code);
    const at = new Date().toISOString();
    kv.set(u, 'totp_enabled_at40', at);
    loginSucceeded(clientIp(c));
    return c.json({ ok: true, enabled: true, backupCodes: codes, enabledAt: at }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    loginFailed(clientIp(c));
    const msg = /stemmer ikke/.test(e.message) ? 'Koden stemmer ikke. Prøv den neste som vises.' : e.message;
    return c.json({ error: msg }, e.status ?? 400);
  }
};
twofa40Api.post('/enable', enable);
twofa40Api.post('/verify', enable);

const disable = async (c) => {
  const u = c.get('user');
  const lim = limited(c); if (lim) return lim;
  const b = await body(c);
  if (!status40(u).enabled) return c.json({ ok: true, enabled: false });
  try { disableTotp(u, { password: b.password, code: b.code }); } catch (e) { loginFailed(clientIp(c)); return c.json({ error: 'Feil passord eller kode' }, e.status ?? 403); }
  kv.del(u, 'totp_enabled_at40');
  loginSucceeded(clientIp(c));
  return c.json({ ok: true, enabled: false });
};
twofa40Api.post('/disable', disable);
twofa40Api.delete('/', disable);

const regenerate = async (c) => {
  const u = c.get('user');
  const lim = limited(c); if (lim) return lim;
  const b = await body(c);
  if (!status40(u).enabled) return c.json({ error: 'Totrinnsbekreftelse er ikke på' }, 409);
  if (!reauthOk(c, u, b, { allowFresh: false })) { loginFailed(clientIp(c)); return c.json({ error: 'Bekreft med passord eller en kode fra autentiseringsappen', needsPassword: true }, 403); }
  const codes = newRecoveryCodes();
  db.prepare('UPDATE users SET recovery_hashes=? WHERE id=?').run(JSON.stringify(codes.map(recoveryHash)), u);
  loginSucceeded(clientIp(c));
  return c.json({ ok: true, backupCodes: codes, backupLeft: codes.length }, 200, { 'Cache-Control': 'no-store' });
};
twofa40Api.post('/backup/regenerate', regenerate);
twofa40Api.post('/backup-codes', regenerate);
