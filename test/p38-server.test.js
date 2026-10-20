// Prompt 38 (SERVER38): QR-innlogging (+ 2FA), app-økt for Kalender på Mac, logg ut av alle enheter, AI-maskinen
// (Mac mini M4), Finans-modellvalg, nye kort i Now Brief (+ gave, nordlys), kortinnstillinger og Domener med alt lastet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p38-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-38s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of Object.keys(process.env)) if (k.startsWith('AI_HOST_') || k.startsWith('AI_GPU_')) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const totp = await import('../server/totp.js');
const auth = await import('../server/auth.js');
const { _qr38 } = await import('../server/qr38.js');
const b38 = await import('../server/brief38.js');
const hw38 = await import('../server/aihw38.js');
const ai = await import('../server/ai-run.js');

const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
let ipN = 10;
const freshIp = () => `203.0.113.${ipN++}`;

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
const cookieOf = (r, name) => (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith(`${name}=`)) ?? null;
const setCookies = (r) => r.headers.getSetCookie?.() ?? [];
async function login(username, password, ip = freshIp()) {
  const r = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return cookieOf(r, 'hl_sid');
}
const as = (cookie, extra = {}) => (path, method = 'GET', body) => req(path, { method, headers: { cookie, 'user-agent': UA_PHONE, ...extra }, body });
const A = as(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();

/** «Ny enhet» (web): lager QR-kode med egen cookie og UA. */
async function newQr(ua = UA_MAC, ip = freshIp()) {
  const r = await req('/api/auth/qr', { method: 'POST', headers: { 'user-agent': ua, 'x-forwarded-for': ip } });
  assert.equal(r.status, 201, r.text);
  const ck = cookieOf(r, `hlqr_${r.body.sid}`);
  assert.ok(ck, 'binding-cookie satt');
  const web = (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck, 'user-agent': ua, 'x-forwarded-for': ip }, body });
  return { ...r.body, ck, web, ip, setCookie: setCookies(r).find((x) => x.startsWith('hlqr_')) };
}

/* ---------------- QR-innlogging ---------------- */

test('QR: POST /api/auth/qr gir sid+nonce, url og deep link, 60 s, aldri et token; cookien er httpOnly og bundet', async () => {
  const q = await newQr();
  assert.match(q.sid, /^[A-Za-z0-9_-]{16,64}$/);
  assert.match(q.nonce, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(q.ttl, 60);
  assert.equal(q.code, `${q.sid}.${q.nonce}`);
  assert.match(q.url, new RegExp(`^https://[^/]+/l/${q.sid}\\.${q.nonce}$`));
  assert.equal(q.deepLink, `homelab://login?c=${q.sid}.${q.nonce}`);
  assert.ok(Math.abs(Date.parse(q.expiresAt) - Date.now() - 60_000) < 3000);
  assert.ok(!/fh_|hl_sid|ra_/.test(q.url + q.deepLink), 'ingen token i QR-en');
  assert.match(q.setCookie, /HttpOnly/i);
  assert.match(q.setCookie, /SameSite=Strict/i);
  assert.match(q.setCookie, /Path=\/api\/auth\/qr/);
  assert.ok(q.clientKey && !q.url.includes(q.clientKey), 'klientnøkkelen står ikke i QR-en');
  const st = await q.web(`/api/auth/qr/${q.sid}`);
  assert.equal(st.status, 200);
  assert.equal(st.body.state, 'pending'); assert.equal(st.body.status, 'pending'); assert.equal(st.body.type, 'pending');
  assert.equal(st.body.match, undefined, 'matchkoden vises først etter skanning');
  // En annen nettleser (uten cookie / annen UA) får ikke lese eller fullføre.
  assert.equal((await req(`/api/auth/qr/${q.sid}`, { headers: { 'user-agent': UA_MAC } })).status, 403);
  assert.equal((await req(`/api/auth/qr/${q.sid}`, { headers: { cookie: q.ck, 'user-agent': 'Annen nettleser' } })).status, 403);
  assert.equal((await req(`/api/auth/qr/${q.sid}/events`, { headers: { 'user-agent': UA_MAC } })).status, 403);
  // Appene kan sende nøkkelen som header i stedet for cookie.
  assert.equal((await req(`/api/auth/qr/${q.sid}`, { headers: { 'user-agent': UA_MAC, 'x-qr-key': q.clientKey } })).status, 200);
});

test('QR: skann → matchkode og enhetsinfo, engangs, godkjenn krever biometri → finish gir økt og pålitelig enhet + varsel', async () => {
  const q = await newQr();
  assert.equal((await req('/api/auth/qr/scan', { method: 'POST', body: { code: q.code } })).status, 401, 'skanning krever innlogget mobil');
  const s = await A('/api/auth/qr/scan', 'POST', { code: q.deepLink });
  assert.equal(s.status, 200, s.text);
  assert.equal(s.body.sid, q.sid);
  assert.match(s.body.match, /^\d{2}$/);
  assert.equal(s.body.device.os, 'Mac');
  assert.equal(s.body.device.browser, 'Safari');
  assert.equal(s.body.device.name, 'Mac · Safari');
  assert.ok('ip' in s.body.device && 'place' in s.body.device);
  assert.equal(s.body.account.name, 'Sebastian');
  assert.equal((await A('/api/auth/qr/scan', 'POST', { code: q.url })).status, 409, 'engangs');
  const st = await q.web(`/api/auth/qr/${q.sid}`);
  assert.equal(st.body.state, 'scanned');
  assert.equal(st.body.match, s.body.match, 'samme matchkode på web');
  assert.equal(st.body.user.name, 'Sebastian');
  // Finish før godkjenning → 409.
  assert.equal((await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid })).status, 409);
  // En annen bruker kan ikke godkjenne.
  const I = as(await login('ingrid', 'ingridPassord123'));
  assert.equal((await I('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true })).status, 404);
  assert.equal((await A('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true })).status, 400, 'uten biometri');
  assert.equal((await A('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true, match: '00' === s.body.match ? '01' : '00' })).status, 400, 'feil tall');
  const before = db.prepare('SELECT COUNT(*) n FROM devices WHERE user=?').get(sebId).n;
  const ap = await A('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true, match: s.body.match });
  assert.equal(ap.status, 200, ap.text);
  assert.deepEqual([ap.body.state, ap.body.needs2fa], ['approved', false]);
  assert.equal((await q.web(`/api/auth/qr/${q.sid}`)).body.needs2fa, false);
  // Feil nettleser kan ikke fullføre.
  assert.equal((await req('/api/auth/qr/finish', { method: 'POST', headers: { 'user-agent': UA_MAC }, body: { sid: q.sid } })).status, 403);
  const f = await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid });
  assert.equal(f.status, 200, f.text);
  assert.equal(f.body.ok, true);
  assert.equal(f.body.user.id, sebId);
  assert.equal(f.body.trusted, true);
  const sid = cookieOf(f, 'hl_sid');
  assert.ok(sid, 'økt-cookie');
  assert.ok(cookieOf(f, 'hl_dev'), 'pålitelig enhet');
  const W = as(`${sid}; ${cookieOf(f, 'hl_dev')}`, { 'user-agent': UA_MAC });
  assert.equal((await W('/api/users')).status, 200, 'innlogget på ny enhet');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM devices WHERE user=?').get(sebId).n, before + 1);
  assert.ok((await W('/api/devices')).body.devices.some((d) => d.current && /Safari på Mac/.test(d.name)));
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND title='Ny enhet logget inn'").get(sebId), 'admin varslet');
  assert.equal((await q.web(`/api/auth/qr/${q.sid}`)).body.state, 'done');
  assert.equal((await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid })).status, 409, 'kan ikke fullføres to ganger');
  assert.equal((kv.get(sebId, 'auth_log38', []) ?? [])[0].kind, 'qr');
  // Kalender-appen kan hente sitt eget token med økten fra QR-innloggingen.
  const ct = await W('/api/tokens/companion', 'POST', { app: 'kalender', device: 'Mac' });
  assert.equal(ct.status, 201, ct.text);
  assert.match(ct.body.token, /^fh_/);
});

test('QR: SSE pending → scanned → approved → done (event-navn og data.state/status/type)', async () => {
  const q = await newQr();
  const r = await app.request(`/api/auth/qr/${q.sid}/events`, { headers: { cookie: q.ck, 'user-agent': UA_MAC } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const next = async (state) => {
    const t0 = Date.now();
    while (!new RegExp(`event: ${state}\\n`).test(buf)) {
      if (Date.now() - t0 > 3000) throw new Error(`fikk ikke ${state}: ${buf}`);
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
    }
    const m = buf.match(new RegExp(`event: ${state}\\ndata: (.*)\\n`));
    return JSON.parse(m[1]);
  };
  assert.equal((await next('pending')).state, 'pending');
  const s = await A('/api/auth/qr/scan', 'POST', { code: q.code });
  const sc = await next('scanned');
  assert.deepEqual([sc.state, sc.status, sc.type, sc.match, sc.user.name], ['scanned', 'scanned', 'scanned', s.body.match, 'Sebastian']);
  await A('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true });
  assert.equal((await next('approved')).needs2fa, false);
  await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid });
  assert.equal((await next('done')).state, 'done');
  await reader.cancel().catch(() => {});
});

test('QR: avvist og utløpt', async () => {
  const q = await newQr();
  await A('/api/auth/qr/scan', 'POST', { code: q.code });
  assert.equal((await A('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: false })).body.state, 'denied');
  // Uten biometri: engangs re-auth-token i stedet.
  const qr = await newQr();
  await A('/api/auth/qr/scan', 'POST', { code: qr.code });
  assert.equal((await A('/api/auth/qr/approve', 'POST', { sid: qr.sid, approve: true, reauthToken: 'ra_' + 'x'.repeat(43) })).status, 400);
  const ra = await A('/api/auth/reauth', 'POST', { password: 'testpassord1' });
  const okRa = await A('/api/auth/qr/approve', 'POST', { sid: qr.sid, approve: true, reauthToken: ra.body.reauthToken });
  assert.equal(okRa.body.state, 'approved', okRa.text);
  assert.equal((await q.web(`/api/auth/qr/${q.sid}`)).body.state, 'denied');
  const f = await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid });
  assert.equal(f.status, 409); assert.match(f.body.error, /avvist/);
  const q2 = await newQr();
  _qr38.qrs.get(q2.sid).exp = Date.now() - 1;
  _qr38.sweep();
  assert.equal((await q2.web(`/api/auth/qr/${q2.sid}`)).body.state, 'expired');
  assert.equal((await A('/api/auth/qr/scan', 'POST', { code: q2.code })).status, 410);
  // Feil nonce: 404 (og telles mot sperren).
  const q3 = await newQr();
  assert.equal((await A('/api/auth/qr/scan', 'POST', { code: `${q3.sid}.${'x'.repeat(24)}` })).status, 404);
  assert.equal((await A('/api/auth/qr/scan', 'POST', { code: 'tull' })).status, 400);
});

test('QR: rate limit per IP på å lage koder', async () => {
  const ip = freshIp();
  let last;
  for (let i = 0; i < 31; i++) last = await req('/api/auth/qr', { method: 'POST', headers: { 'user-agent': UA_MAC, 'x-forwarded-for': ip } });
  assert.equal(last.status, 429);
  _qr38.createHits.clear();
});

test('QR + 2FA: finish gir bare pre-auth; /api/auth/2fa med TOTP fullfører; 5 feil gir sperre', async () => {
  // Ingrid slår på TOTP (slås av igjen til slutt, også om testen feiler).
  const I = as(await login('ingrid', 'ingridPassord123'));
  const setup = auth.startTotpSetup(ingridId);
  const secret = totp.base32Decode(setup.secret.replace(/\s/g, ''));
  auth.confirmTotpSetup(ingridId, totp.hotp(secret, Math.floor(Date.now() / 30000) - 1));
  try { await qr2fa(I, secret); } finally { auth.updateUser(ingridId, { resetTotp: true }); }
});
async function qr2fa(I, secret) {
  const q = await newQr();
  await I('/api/auth/qr/scan', 'POST', { code: q.code });
  const ap = await I('/api/auth/qr/approve', 'POST', { sid: q.sid, approve: true, biometric: true });
  assert.equal(ap.body.needs2fa, true);
  const f = await q.web('/api/auth/qr/finish', 'POST', { sid: q.sid });
  assert.equal(f.status, 200);
  assert.equal(f.body.needs2fa, true);
  assert.equal(cookieOf(f, 'hl_sid'), null, 'ingen økt før 2FA');
  const pre = cookieOf(f, 'hl_pre');
  assert.ok(pre && f.body.ticket);
  assert.match(setCookies(f).find((x) => x.startsWith('hl_pre=')), /Path=\/api\/auth/);
  const twoFa = (code, ip = q.ip) => req('/api/auth/2fa', { method: 'POST', headers: { cookie: pre, 'user-agent': UA_MAC, 'x-forwarded-for': ip }, body: { code } });
  const bad = await twoFa('000000');
  assert.equal(bad.status, 401);
  const ok = await twoFa(totp.totpNow(secret));
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.user.id, ingridId);
  assert.ok(cookieOf(ok, 'hl_sid') && cookieOf(ok, 'hl_dev'));
  assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND title='Ny enhet logget inn'").get(ingridId));
  assert.equal(kv.get(ingridId, 'auth_log38', [])[0].twoFa, true);
  // 5 feil koder → 15 min sperre for IP-en.
  const q2 = await newQr();
  await I('/api/auth/qr/scan', 'POST', { code: q2.code });
  await I('/api/auth/qr/approve', 'POST', { sid: q2.sid, approve: true, biometric: true });
  const f2 = await q2.web('/api/auth/qr/finish', 'POST', { sid: q2.sid });
  const pre2 = cookieOf(f2, 'hl_pre'), ip2 = freshIp();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await req('/api/auth/2fa', { method: 'POST', headers: { cookie: pre2, 'x-forwarded-for': ip2 }, body: { code: '123456' } })).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401]);
  const after = await req('/api/auth/2fa', { method: 'POST', headers: { cookie: pre2, 'x-forwarded-for': ip2 }, body: { code: totp.totpNow(secret) } });
  assert.equal(after.status, 401, 'billetten er brukt opp etter 5 feil');
  assert.equal((await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': ip2 }, body: { username: 'ingrid', password: 'ingridPassord123' } })).status, 429, '15 min sperre for IP-en');
}

test('GET /l/:code sender videre til appen, ugyldig kode til /login', async () => {
  const q = await newQr();
  const r = await app.request(`/l/${q.code}`, { headers: { 'user-agent': UA_PHONE } });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/finans/#/l/${q.code}`);
  assert.equal((await app.request(`/l/${q.code}`, { headers: { 'user-agent': UA_MAC } })).headers.get('location'), '/login', 'desktop → innlogging');
  assert.equal((await app.request('/l/tull')).headers.get('location'), '/login');
  assert.equal(_qr38.qrs.get(q.sid).state, 'pending', 'GET godkjenner aldri');
});

/* ---------------- App-økt for Kalender på Mac ---------------- */

test('POST /api/auth/app-session: companion-token eller finance:write gir økt-cookie; lese-token og tull avvises; logges', async () => {
  const ct = await A('/api/tokens/companion', 'POST', { app: 'kalender', device: 'Mac' });
  assert.equal(ct.status, 201);
  const ip = freshIp();
  const r = await req('/api/auth/app-session', { method: 'POST', headers: { 'user-agent': 'KalenderMac/1.0', 'x-forwarded-for': ip }, body: { token: ct.body.token } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.user.id, sebId);
  const sid = cookieOf(r, 'hl_sid');
  assert.ok(sid);
  assert.equal((await as(sid)('/api/users')).status, 200);
  assert.equal(kv.get(sebId, 'auth_log38', [])[0].kind, 'app-session');
  // Som Authorization-header (uten JSON-kropp) går også.
  const h = await app.request('/api/auth/app-session', { method: 'POST', headers: { authorization: `Bearer ${ct.body.token}` } });
  assert.equal(h.status, 200);
  // Token med bare finance:read → 401.
  const ro = await A('/finans/api/tokens', 'POST', { name: 'lese', scopes: ['finance:read'] });
  assert.ok([200, 201].includes(ro.status), ro.text);
  const roTok = ro.body.token;
  assert.equal((await req('/api/auth/app-session', { method: 'POST', headers: { 'x-forwarded-for': freshIp() }, body: { token: roTok } })).status, 401);
  assert.equal((await req('/api/auth/app-session', { method: 'POST', headers: { 'x-forwarded-for': freshIp() }, body: { token: 'fh_pat_' + 'x'.repeat(32) } })).status, 401);
  // Skjema fra en annen side (ikke JSON) avvises.
  assert.equal((await app.request('/api/auth/app-session', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: ct.body.token }) })).status, 415);
});

test('cookieSecure: Secure bak https/Cloudflare, ikke på ren http fra lokalt nett', async (t) => {
  const { config } = await import('../server/config.js');
  if (!config.secureCookies) { assert.equal(auth.cookieSecure({ req: { url: 'https://x/', header: () => undefined } }), false); t.skip('COOKIE_SECURE=false'); return; }
  const ctx = (url, headers = {}, ip = '192.168.1.20') => ({ req: { url, header: (k) => headers[k.toLowerCase()] }, env: { incoming: { socket: { remoteAddress: ip } } } });
  assert.equal(auth.cookieSecure(ctx('http://192.168.1.5:3000/api/auth/app-session')), false);
  assert.equal(auth.cookieSecure(ctx('http://192.168.1.5:3000/', { 'x-forwarded-proto': 'https' })), true);
  assert.equal(auth.cookieSecure(ctx('http://x/', { 'cf-connecting-ip': '1.2.3.4' })), true);
  assert.equal(auth.cookieSecure(ctx('http://x/', {}, '8.8.8.8')), true);
  assert.equal(auth.cookieSecure(ctx('https://home.kristo.no/')), true);
});

/* ---------------- Logg ut av alle enheter ---------------- */

test('logout-all krever passord/re-auth, teller og ugyldiggjør økter og app-tokens; /api/me/sessions', async () => {
  await login('ingrid', 'ingridPassord123');
  const I1 = as(await login('ingrid', 'ingridPassord123'));
  const I2 = as(await login('ingrid', 'ingridPassord123'));
  const tok = await req('/finans/api/login', { method: 'POST', headers: { 'x-forwarded-for': freshIp() }, body: { username: 'ingrid', password: 'ingridPassord123', deviceName: 'iPhone' } });
  assert.equal(tok.status, 200);
  const glimtKey = await I1('/api/ai/tokens', 'POST', { name: 'Skript' });
  assert.equal(glimtKey.status, 201);
  const ms = await I1('/api/me/sessions');
  assert.equal(ms.status, 200);
  assert.ok(ms.body.web >= 3 && ms.body.apps >= 1, JSON.stringify(ms.body));
  assert.equal(ms.body.count, ms.body.web + ms.body.apps);
  assert.equal((await I1('/api/auth/logout-all', 'POST', {})).status, 403);
  assert.equal((await I1('/api/auth/logout-all', 'POST', { password: 'feil' })).status, 403);
  const out = await I1('/api/auth/logout-all', 'POST', { password: 'ingridPassord123' });
  assert.equal(out.status, 200, out.text);
  assert.ok(out.body.count >= 4, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  assert.equal((await I1('/api/users')).status, 401);
  assert.equal((await I2('/api/users')).status, 401);
  assert.equal((await req('/api/ai/status', { headers: { authorization: `Bearer ${tok.body.token}` } })).status, 401, 'app-token trukket tilbake');
  assert.equal((await req('/api/glimt', { method: 'POST', headers: { authorization: `Bearer ${glimtKey.body.token}` }, body: { prompt: 'hei' } })).status, 200, 'Glimt-API-nøkler beholdes');
  assert.equal(kv.get(ingridId, 'auth_log38', [])[0].kind, 'logout-all');
  // Re-auth-token + keepCurrent beholder økten som spør.
  const I3 = as(await login('ingrid', 'ingridPassord123'));
  const I4 = as(await login('ingrid', 'ingridPassord123'));
  const ra = await I3('/api/auth/reauth', 'POST', { password: 'ingridPassord123' });
  const k = await I3('/api/auth/logout-all', 'POST', { reauthToken: ra.body.reauthToken, keepCurrent: true });
  assert.equal(k.status, 200);
  assert.equal(k.body.count, 1);
  assert.equal((await I3('/api/users')).status, 200);
  assert.equal((await I4('/api/users')).status, 401);
  assert.equal((await I3('/api/auth/logout-all', 'POST', { reauthToken: ra.body.reauthToken })).status, 403, 'engangs');
});

/* ---------------- AI-maskinen ---------------- */

test('AI-maskin: Mac mini M4 · 16 GB · 2 TB ekstern disk, budsjett 10,7 GB, fit, anbefalinger og tidsavbrudd', async () => {
  const st = await A('/api/ai/status');
  assert.equal(st.status, 200);
  const hw = st.body.server.hw;
  assert.deepEqual([hw.model, hw.chip, hw.memGb, hw.gpuBudgetGb, hw.disk.totalGb, hw.disk.external, hw.disk.mounted, hw.source], ['Mac mini M4', 'Apple M4', 16, 10.7, 2000, true, true, 'standard']);
  assert.equal(hw.label, 'Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk');
  assert.equal(hw.gpu.budgetGb, 10.7);
  assert.ok(!JSON.stringify(st.body).includes('RTX'));
  assert.equal(st.body.server.gpu.vramGb, 10.7);
  const keys = st.body.recommend.map((r) => r.key);
  for (const k of ['maxLoaded', 'numParallel', 'kvCache', 'flashAttention', 'keepAlive', 'pmset']) assert.ok(keys.includes(k), k);
  assert.equal(st.body.recommend.find((r) => r.key === 'maxLoaded').env, 'OLLAMA_MAX_LOADED_MODELS=1');
  assert.equal(st.body.recommend.find((r) => r.key === 'kvCache').env, 'OLLAMA_KV_CACHE_TYPE=q8_0');
  assert.equal(st.body.recommend.find((r) => r.key === 'flashAttention').env, 'OLLAMA_FLASH_ATTENTION=1');
  assert.match(st.body.recommend.find((r) => r.key === 'pmset').cmd, /pmset -a sleep 0 disksleep 0/);
  assert.deepEqual(st.body.timeouts, { coldS: 60, warmS: 30, loadingText: 'Laster modellen fra disk …' });
  // fit
  assert.deepEqual([6, 8, 9.6, 10.5, 10.6, 17].map((x) => hw38.fit38(x, 10.7)), ['PASSER', 'PASSER', 'TRANGT', 'TRANGT', 'FOR STOR', 'FOR STOR']);
  const lib = (await A('/api/ai/library')).body;
  const fit = (id) => lib.items.find((x) => x.id === id)?.fit;
  assert.deepEqual([fit('qwen2.5vl:7b'), fit('gemma3:12b'), fit('gemma4:latest'), fit('gemma3:27b'), fit('mistral-small3.2'), fit('llama3.3:70b')], ['PASSER', 'TRANGT', 'TRANGT', 'FOR STOR', 'FOR STOR', 'FOR STOR']);
  assert.equal(lib.hw.model, 'Mac mini M4');
  // Miljøet overstyrer.
  process.env.AI_HOST_MEM_GB = '24'; process.env.AI_HOST_DISK_GB = '4000'; process.env.AI_HOST_MODEL = 'Mac mini M4 Pro'; process.env.AI_HOST_DISK_MOUNTED = '0';
  try {
    const s2 = (await A('/api/ai/status')).body.server.hw;
    assert.deepEqual([s2.model, s2.memGb, s2.gpuBudgetGb, s2.disk.totalGb, s2.source, s2.disk.mounted], ['Mac mini M4 Pro', 24, 16, 4000, 'env', false]);
    assert.ok(s2.warnings.includes('Ekstern disk mangler · Ollama finner ikke modellene'));
  } finally { for (const k of ['AI_HOST_MEM_GB', 'AI_HOST_DISK_GB', 'AI_HOST_MODEL', 'AI_HOST_DISK_MOUNTED']) delete process.env[k]; }
  // Vertsskriptet (AI_HOST_INFO_URL) brukes når det svarer.
  process.env.AI_HOST_INFO_URL = 'http://192.168.1.30:9100/hw';
  hw38._setHwFetch(async () => new Response(JSON.stringify({ model: 'Mac mini M4', chip: 'Apple M4', memBytes: 17179869184, disk: { name: 'Samsung T7', totalGb: 2000, freeGb: 1712.4, external: true, mounted: true } })));
  try {
    const s3 = await hw38.hostHw({ force: true });
    assert.deepEqual([s3.source, s3.memGb, s3.disk.name, s3.disk.freeGb], ['host', 16, 'Samsung T7', 1712.4]);
  } finally { delete process.env.AI_HOST_INFO_URL; hw38._setHwFetch(null); }
  // Tidsavbrudd: kald modell (ikke brukt innen keep_alive) → 60 s og «Laster modellen fra disk …».
  assert.equal(ai.isCold('qwen2.5vl:7b'), true);
  ai.markWarm('qwen2.5vl:7b', '30m');
  assert.equal(ai.isCold('qwen2.5vl:7b'), false);
  assert.equal(ai.isCold('qwen2.5vl:7b', Date.now() + 31 * 60_000), true);
  ai.markWarm('x', 0); assert.equal(ai.isCold('x'), true);
  assert.equal(ai._aiRunTest.attemptMs, 30_000);
});

test('Finans-modellvalg: GET /api/ai/routing?scope=finans gir alltid 4 rader med standarder, valg og advarsel ved sky + finLocal', async () => {
  const r = await A('/api/ai/routing?scope=finans');
  assert.equal(r.status, 200);
  assert.equal(r.body.scope, 'finans');
  assert.deepEqual(r.body.tasks.map((t) => [t.id, t.name, t.model, t.fallback]), [
    ['rc', 'Kvitteringer (bilde)', 'qwen2.5vl:7b', 'gemini-2.5-flash'],
    ['kat', 'Kategorisering', 'llama3.2:3b', 'llama-3.3-70b-versatile'],
    ['fsok', 'Finans · spør', 'gemma4:latest', 'gemini-2.5-flash'],
    ['bar', 'Strekkoder og pakkelapper', 'roboflow/kvittering/1', 'qwen2.5vl:7b']]);
  for (const t of r.body.tasks) {
    assert.ok(t.options.length > 0, t.id);
    for (const o of t.options) { assert.equal(typeof o.id, 'string'); assert.equal(typeof o.label, 'string'); assert.equal(typeof o.local, 'boolean'); assert.ok(['LOKAL', 'SKY'].includes(o.tag)); }
    assert.ok(t.options.some((o) => o.id === t.model), `${t.id}: valgt modell står i listen`);
    assert.equal(t.isDefault, true);
  }
  assert.ok(r.body.tasks[0].options.find((o) => o.id === 'qwen2.5vl:7b').local);
  assert.ok(!r.body.tasks[0].options.some((o) => o.id === 'qwen3:8b'), 'kvitteringer: bare bildemodeller lokalt');
  assert.equal(r.body.empty, false);
  assert.equal(r.body.finLocal, false);
  assert.equal(r.body.tasks[0].warning, null);
  // «Finansdata forlater aldri huset» + sky-modell → rød advarsel i raden.
  assert.equal((await A('/api/ai/routing', 'PUT', { rules: { finLocal: true }, tasks: { fsok: { model: 'gemini-2.5-flash', fallback: 'qwen3:8b' } } })).status, 200);
  const r2 = (await A('/api/ai/routing?scope=finans')).body;
  const fs = r2.tasks.find((t) => t.id === 'fsok');
  assert.equal(fs.model, 'gemini-2.5-flash');
  assert.equal(fs.isDefault, false);
  assert.match(fs.warning, /Finansdata forlater aldri huset/);
  assert.equal(fs.cloudBlocked, true);
  assert.match(r2.tasks.find((t) => t.id === 'rc').warning, /Reserven gemini-2\.5-flash/);
  await A('/api/ai/routing', 'PUT', { rules: { finLocal: false }, tasks: { fsok: { model: '', fallback: '' } } });
  // Uten scope: som før (alle oppgaver).
  assert.ok((await A('/api/ai/routing')).body.tasks.length > 4);
});

/* ---------------- Brief: nye kort ---------------- */

test('brief: cards i /api/glimt/settings (rekkefølge + av/på), validering, og kortene i /api/brief', async () => {
  const g = (await A('/api/glimt/settings')).body;
  assert.deepEqual(g.cards.map((x) => x.id), ['weather', 'calendar', 'todos', 'dinner', 'trials', 'packages', 'family', 'school', 'birthdays', 'aurora', 'news', 'bible']);
  assert.ok(g.cards.every((x) => x.on === true && x.label));
  assert.equal(g.auroraNotify, true);
  assert.equal((await A('/api/glimt/settings', 'PUT', { cards: [{ id: 'ukjent', on: true }] })).status, 400);
  assert.equal((await A('/api/glimt/settings', 'PUT', { cards: [{ id: 'family', on: 'ja' }] })).status, 400);
  assert.equal((await A('/api/glimt/settings', 'PUT', { auroraNotify: 'ja' })).status, 400);
  const p = await A('/api/glimt/settings', 'PUT', { cards: [{ id: 'aurora', on: true }, { id: 'family', on: false }, 'packages'], auroraNotify: false });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual(p.body.cards.slice(0, 3).map((x) => [x.id, x.on]), [['aurora', true], ['family', false], ['packages', true]]);
  assert.equal(p.body.cards.length, 12, 'manglende kort legges til');
  assert.equal(p.body.auroraNotify, false);
  const b = (await A('/api/brief?kind=evening')).body;
  assert.equal(b.family, null, 'av = null');
  assert.deepEqual(b.cards.slice(0, 2).map((x) => x.id), ['aurora', 'family']);
  // Tilbake til standard.
  await A('/api/glimt/settings', 'PUT', { cards: ['weather', 'calendar', 'todos', 'dinner', 'trials', 'packages', 'family', 'school', 'birthdays', 'aurora', 'news', 'bible'], auroraNotify: true });
  const b2 = (await A('/api/brief?kind=evening')).body;
  assert.ok(b2.weather !== undefined && b2.summary, 'de gamle feltene er der fortsatt');
  // Pakker (egne)
  assert.ok(b2.packages.count >= 1);
  assert.equal(b2.packages.label, `${b2.packages.count} PÅ VEI`);
  const pk = b2.packages.items[0];
  for (const k of ['carrier', 'logo', 'name', 'status', 'due', 'dueRed']) assert.ok(k in pk, k);
  assert.ok(b2.packages.first, 'eldre felt beholdes');
  const ready = b2.packages.items.find((x) => /Klar for henting/.test(x.status ?? ''));
  if (ready) assert.equal(ready.dueRed, true);
  // Familie: bare de som deler (mock: Ingrid og Jonas deler, Mormor har pauset)
  const names = b2.family.items.map((x) => x.name);
  assert.ok(names.includes('Ingrid') && names.includes('Jonas') && !names.includes('Mormor'), names.join());
  for (const k of ['name', 'avatar', 'color', 'state', 'place', 'since']) assert.ok(k in b2.family.items[0], k);
  assert.ok(!b2.family.items.some((x) => x.userId === sebId), 'ikke meg selv');
  // Skole og jobb
  assert.equal(b2.school.label, 'NESTE 7 DAGER');
  for (const s of b2.school.items) { assert.ok(['prove', 'frist', 'mote'].includes(s.kind)); assert.equal(s.red, s.daysLeft <= 4); assert.ok(s.daysLeft >= 0 && s.daysLeft <= 7); }
  // Bursdager og nordlys
  assert.ok(Array.isArray(b2.birthdays.items));
  assert.deepEqual([b2.aurora.show, b2.aurora.kp, b2.aurora.cloud, b2.aurora.best], [true, 4, 15, '22–01']);
  assert.match(b2.aurora.text, /nordover/);
  const m = (await A('/api/brief?kind=morning')).body;
  assert.equal(m.aurora.show, false, 'bare kveld/natt');
});

test('brief: familie for en annen bruker uten deling er tom; bursdager innen 30 dager og POST /api/brief/gift', async () => {
  const I = as(await login('ingrid', 'ingridPassord123'));
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
  const add = (s, n) => { const [y, mo, d] = s.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10); };
  const bd = add(today, 5);
  const c = await I('/api/birthdays', 'POST', { name: 'Pål', month: +bd.slice(5, 7), day: +bd.slice(8, 10), year: +bd.slice(0, 4) - 12 });
  assert.ok([200, 201].includes(c.status), c.text);
  const far = add(today, 60);
  await I('/api/birthdays', 'POST', { name: 'Langt unna', month: +far.slice(5, 7), day: +far.slice(8, 10) });
  const b = (await I('/api/brief?kind=day')).body;
  const pal = b.birthdays.items.find((x) => x.name === 'Pål');
  assert.ok(pal, JSON.stringify(b.birthdays));
  assert.deepEqual([pal.age, pal.date, pal.daysLeft, pal.red], [12, bd, 5, false]);
  assert.match(pal.text, /^Fyller 12 · \S+ \d+\. \S+$/);
  assert.ok(!b.birthdays.items.some((x) => x.name === 'Langt unna'));
  assert.equal(b.aurora.show, false);
  // Gave
  const g = await I('/api/brief/gift', 'POST', { name: 'Pål', date: bd });
  assert.equal(g.status, 201, g.text);
  assert.equal(g.body.item.title, 'Kjøp gave til Pål');
  assert.equal(g.body.item.due, add(bd, -2));
  assert.deepEqual(g.body.item.tags, ['gave']);
  const list = db.prepare('SELECT kind, owner FROM hl_task_lists WHERE id=?').get(g.body.item.list);
  assert.deepEqual([list.kind, list.owner], ['mine', ingridId], 'i «Mine»');
  const again = await I('/api/brief/gift', 'POST', { name: 'Pål', date: bd });
  assert.deepEqual([again.status, again.body.created, again.body.item.id], [200, false, g.body.item.id]);
  const soon = await I('/api/brief/gift', 'POST', { name: 'Kari', date: add(today, 1) });
  assert.equal(soon.body.item.due, today, 'aldri i fortiden');
  assert.equal((await I('/api/brief/gift', 'POST', { name: '', date: bd })).status, 400);
  assert.equal((await I('/api/brief/gift', 'POST', { name: 'X', date: 'i morgen' })).status, 400);
  assert.equal((await req('/api/brief/gift', { method: 'POST', body: { name: 'X', date: bd } })).status, 401);
});

test('nordlys: NOAA Kp + MET skydekke, beste tid, og push kl. 20 ved Kp ≥ 4 og skydekke < 40 % (én gang per dag)', async () => {
  const t = Date.parse('2026-10-20T15:00:00Z'); // 17:00 i Oslo
  const noaa = [['time_tag', 'kp', 'observed', 'noaa_scale'], ['2026-10-20 12:00:00', '2.33', 'predicted', null], ['2026-10-20 18:00:00', '3.67', 'predicted', null], ['2026-10-20 21:00:00', '4.33', 'predicted', 'G1'], ['2026-10-21 12:00:00', '6', 'predicted', null]];
  const ts = []; for (let h = 0; h < 18; h++) { const ms = t + h * 3600_000; const oh = (17 + h) % 24; ts.push({ time: new Date(ms).toISOString(), data: { instant: { details: { cloud_area_fraction: oh === 22 || oh === 23 || oh === 0 ? 10 : 80 } } } }); }
  assert.equal(b38.kpTonight(noaa, t), 4.3);
  assert.deepEqual(b38.cloudTonight({ properties: { timeseries: ts } }, t), { cloud: 10, best: '22–01' });
  b38._setAuroraFetch(async (u) => new Response(JSON.stringify(/swpc/.test(u) ? noaa : { properties: { timeseries: ts } })));
  try {
    const a = await b38.auroraPart(sebId, 'evening', t);
    assert.deepEqual([a.show, a.kp, a.cloud, a.best, a.level, a.label], [true, 4.3, 10, '22–01', 'GODE', 'KP 4,3 · GODE SJANSER']);
    assert.match(a.text, /mellom kl\. 22 og 01/);
  } finally { b38._setAuroraFetch(null); }
  b38._setAuroraMock({ kp: 4.7, cloud: 20, best: '22–01' });
  try {
    kv.del(sebId, 'aurora38_pushed');
    assert.equal(await b38.auroraPushTick(Date.parse('2026-10-20T12:00:00Z')), 0, 'bare 20:00–20:15');
    const n = await b38.auroraPushTick(Date.parse('2026-10-20T18:05:00Z'));
    assert.ok(n >= 1);
    assert.ok(db.prepare("SELECT 1 FROM notify_queue WHERE user_id=? AND title LIKE 'Nordlys i kveld%'").get(sebId));
    assert.equal(await b38.auroraPushTick(Date.parse('2026-10-20T18:06:00Z')), 0, 'én gang per dag');
    b38._setAuroraMock({ kp: 4.7, cloud: 60, best: '22–01' });
    kv.del(sebId, 'aurora38_pushed'); kv.del(ingridId, 'aurora38_pushed');
    assert.equal(await b38.auroraPushTick(Date.parse('2026-10-21T18:05:00Z')), 0, 'for skyet');
    const weak = await b38.auroraPart(sebId, 'night');
    assert.equal(weak.show, true);
    b38._setAuroraMock({ kp: 2, cloud: 5, best: '22–01' });
    assert.equal((await b38.auroraPart(sebId, 'night')).show, false, 'Kp < 3');
  } finally { b38._setAuroraMock(null); }
});

/* ---------------- Domener ---------------- */

test('GET /api/domains/overview?all=1 gir alt for alle domener i ett svar', async () => {
  const r = await A('/api/domains/overview?per=24t&all=1');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.kpi && r.body.series);
  const names = (r.body.domains ?? []).map((d) => d.name);
  assert.deepEqual(Object.keys(r.body.byDomain ?? {}).sort(), [...names].sort());
  for (const n of names) { assert.ok(r.body.byDomain[n].kpi, n); assert.ok('summary' in r.body.byDomain[n]); }
  assert.equal((await A('/api/domains/overview?per=24t')).body.byDomain, undefined, 'bare med all=1');
});

test('/.well-known: assetlinks.json ([] uten fingeravtrykk) og apple-app-site-association (404 uten APPLE_APP_ID), uten innlogging', async () => {
  const a = await app.request('/.well-known/assetlinks.json');
  assert.equal(a.status, 200);
  assert.match(a.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await a.json(), []);
  assert.equal((await app.request('/.well-known/apple-app-site-association')).status, 404);
  const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
  process.env.ANDROID_CERT_SHA256 = fp; process.env.APPLE_APP_ID = 'ABCDE12345.no.kristo.finanshub';
  try {
    const j = await (await app.request('/.well-known/assetlinks.json')).json();
    assert.deepEqual(j[0].target, { namespace: 'android_app', package_name: 'no.kristo.finanshub', sha256_cert_fingerprints: [fp] });
    const r = await app.request('/.well-known/apple-app-site-association');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/json/);
    const d = (await r.json()).applinks.details[0];
    assert.equal(d.appID, 'ABCDE12345.no.kristo.finanshub');
    assert.deepEqual(d.paths, ['/l/*', '/app-auth', '/app-auth/*']); // prompt 41: + /app-auth (Kalender-innlogging)
  } finally { delete process.env.ANDROID_CERT_SHA256; delete process.env.APPLE_APP_ID; }
});
