// Fase 2b (auth): låser svarform og statuskoder for innloggings- og sikkerhetsrutene før filene flyttes til server/auth/.
// Bare stier, statuser og felt – ikke verdier som endrer seg (tokens, tider). Skal gå grønt både før og etter omstruktureringen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-authk-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-2b';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.ANDROID_CERT_SHA256;
delete process.env.APPLE_APP_ID;
delete process.env.APPLE_TEAM_ID;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('eierpassord1');
const { default: app } = await import('../server/index.js');

let ipN = 1;
const ip = () => `198.51.100.${(ipN++ % 250) + 1}`;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': ip(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers, cookies: (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]) };
}
const keys = (o) => Object.keys(o ?? {}).sort();
const hasKeys = (o, ks, msg) => { for (const k of ks) assert.ok(o && k in o, `${msg ?? ''} mangler ${k} i ${JSON.stringify(o)}`); };

let owner = null; // cookie
let user = null;  // vanlig bruker (cookie)

test('uinnlogget: offentlige ruter og avvisninger', async () => {
  let r = await req('/api/setup/status');
  assert.equal(r.status, 200); assert.deepEqual(r.body, { needsSetup: false });

  r = await req('/api/discovery');
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['api', 'app', 'external', 'local', 'name', 'version']);
  assert.equal(r.body.app, 'homelab'); assert.equal(r.body.api, 41);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');

  r = await req('/api/login', { method: 'POST', body: { username: 'sebastian', password: 'feil-passord' } });
  assert.equal(r.status, 401); assert.deepEqual(keys(r.body), ['code', 'error']);
  r = await req('/api/auth/login', { method: 'POST', body: { username: 'finnesikke', password: 'feil-passord' } });
  assert.equal(r.status, 401); assert.equal(r.body.error, 'Feil brukernavn eller passord');

  for (const [m, p] of [['GET', '/api/me/server'], ['POST', '/api/auth/device-token'], ['POST', '/api/auth/app-code']]) {
    r = await req(p, { method: m, body: m === 'POST' ? {} : undefined });
    assert.equal(r.status, 401, p); assert.equal(r.body.error, 'Ikke innlogget', p);
  }
  for (const p of ['/api/auth/2fa/status', '/api/me/sessions', '/api/security51/overview', '/api/users', '/api/devices']) {
    r = await req(p);
    assert.equal(r.status, 401, p);
  }
  r = await req('/api/auth/reauth', { method: 'POST', body: { password: 'x' } });
  assert.equal(r.status, 401);
  r = await req('/api/state');
  assert.equal(r.status, 401); assert.equal(r.body.code, 'HOMELAB_AUTH');

  r = await req('/api/auth/refresh', { method: 'POST', body: { refresh: 'hlr_feil' } });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'invalid_grant'); hasKeys(r.body, ['message']);
  r = await req('/api/auth/token', { method: 'POST', body: { code: 'feil', code_verifier: 'x' } });
  assert.equal(r.status, 400); assert.equal(r.body.code, 'invalid_grant');
  r = await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: 'hdt_feil', app: 'kalender' } });
  assert.equal(r.status, 401); hasKeys(r.body, ['error']);

  r = await req('/api/auth/passkey/status');
  assert.equal(r.status, 200); assert.deepEqual(keys(r.body), ['available', 'rpId']);

  r = await req('/api/auth/qr/session', { method: 'POST', body: { app: 'kalender', platform: 'mac' } });
  assert.equal(r.status, 201);
  hasKeys(r.body, ['sessionId', 'code', 'expiresAt', 'ttl', 'qr', 'server', 'clientKey', 'app', 'platform', 'hint']);
  const s = await req(`/api/auth/qr/session/${r.body.sessionId}`, { headers: { authorization: `Bearer ${r.body.clientKey}` } });
  assert.ok([200, 403].includes(s.status), String(s.status));

  r = await req('/.well-known/assetlinks.json');
  assert.equal(r.status, 200); assert.deepEqual(r.body, []);
  r = await req('/.well-known/apple-app-site-association');
  assert.equal(r.status, 404);
  r = await req('/l/kort');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/login');

  r = await req('/api/apps/kalender/log', { method: 'POST', body: { event: 'kal.start', ms: 12 } });
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, n: 1 });

  r = await req('/api/onboard51/preview', { method: 'POST', body: { id: 'inv51_finnesikke', code: 'AAAA-BBBB' } });
  assert.equal(r.status, 404); assert.equal(r.body.code, 'invalid');

  r = await req('/api/logout', { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });

  r = await req('/api/setup', { method: 'POST', body: {} });
  assert.equal(r.status, 409);
});

test('innlogging: økt, brukerliste og egne ruter', async () => {
  let r = await req('/api/login', { method: 'POST', body: { username: 'sebastian', password: 'eierpassord1', remember: true } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.ok, true);
  hasKeys(r.body.user, ['id', 'username', 'role', 'name', 'displayName', 'totp', 'isMainAdmin', 'avatarUrl']);
  owner = r.cookies.filter((x) => /^hl_(sid|dev|kd51)=/.test(x)).join('; ');
  assert.match(owner, /hl_sid=/); assert.match(owner, /hl_dev=/);
  const h = { cookie: owner };

  r = await req('/api/users', { headers: h });
  assert.equal(r.status, 200); hasKeys(r.body, ['me', 'users']);
  r = await req('/api/users', { method: 'POST', headers: h, body: { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.body.role, 'bruker');

  r = await req('/api/devices', { headers: h });
  assert.equal(r.status, 200); hasKeys(r.body, ['lan', 'trusted', 'devices', 'apps']);

  r = await req('/api/me/sessions', { headers: h });
  assert.equal(r.status, 200); assert.deepEqual(keys(r.body), ['apps', 'count', 'current', 'devices', 'recent', 'web']);

  r = await req('/api/me/server', { headers: h });
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['auto', 'defaults', 'discovered', 'external', 'isDefault', 'local', 'updatedAt', 'updatedBy']);
  r = await req('/api/me/server', { method: 'PUT', headers: h, body: { local: 'ftp://x' } });
  assert.equal(r.status, 400); hasKeys(r.body, ['error']);

  r = await req('/api/auth/2fa/status', { headers: h });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { enabled: false, method: 'totp', backupLeft: 0, enabledAt: null, pending: false });

  r = await req('/api/auth/reauth', { method: 'POST', headers: h, body: { password: 'feil' } });
  assert.equal(r.status, 403); assert.equal(r.body.error, 'Feil passord');
  r = await req('/api/auth/reauth', { method: 'POST', headers: h, body: { password: 'eierpassord1' } });
  assert.equal(r.status, 200); hasKeys(r.body, ['reauthToken']);

  r = await req('/api/security51/overview', { headers: h });
  assert.equal(r.status, 200);
  r = await req('/api/security51/limits', { headers: h });
  assert.equal(r.status, 200); hasKeys(r.body, ['limits', 'policy']);
  r = await req('/api/security51/policy', { headers: h });
  assert.equal(r.status, 200);

  // Vanlig bruker: ingen admin-ruter.
  r = await req('/api/login', { method: 'POST', body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r.status, 200, r.text);
  user = r.cookies.filter((x) => /^hl_(sid|kd51)=/.test(x)).join('; ');
  for (const [m, p, b] of [['GET', '/api/security51/limits'], ['PUT', '/api/security51/policy', {}], ['GET', '/api/onboard51/invites'], ['POST', '/api/users', { username: 'ola', password: 'olaPassord123' }], ['PUT', '/api/server', { name: 'x' }]]) {
    r = await req(p, { method: m, headers: { cookie: user }, body: b });
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  r = await req('/api/users', { headers: { cookie: user } });
  assert.equal(r.status, 200);
  const other = r.body.users.find((u) => u.username === undefined);
  assert.ok(other, 'andre brukere vises uten brukernavn');
  assert.deepEqual(keys(other), ['avatarUrl', 'displayName', 'id', 'name']);
  r = await req(`/api/users/${r.body.users.find((u) => u.id !== r.body.me.id).id}`, { method: 'PATCH', headers: { cookie: user }, body: { name: 'Hacker' } });
  assert.equal(r.status, 403);
});

test('2FA-oppsett i appen og Kalender-innlogging med refresh', async () => {
  const h = { cookie: owner };
  let r = await req('/api/auth/2fa/setup', { method: 'POST', headers: h, body: {} });
  assert.equal(r.status, 200, r.text); // fersk økt
  hasKeys(r.body, ['secret', 'secretGrouped', 'otpauth', 'otpauth_uri', 'qrSvg', 'qrPng', 'issuer', 'account', 'digits', 'period', 'expiresAt']);
  r = await req('/api/auth/2fa/enable', { method: 'POST', headers: h, body: { code: '000000' } });
  assert.equal(r.status, 400); hasKeys(r.body, ['error']);
  r = await req('/api/auth/2fa/enable', { method: 'POST', headers: h, body: { code: 'abc' } });
  assert.equal(r.status, 400);

  r = await req('/api/auth/device-token', { method: 'POST', headers: h, body: { app: 'kalender' } });
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['app', 'device_token', 'expiresAt', 'expiresIn']);
  assert.equal(r.body.expiresIn, 900);
  r = await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: r.body.device_token, app: 'kalender', device: 'Mac' } });
  assert.equal(r.status, 200, r.text);
  hasKeys(r.body, ['token', 'refresh', 'refreshExpires', 'id', 'app', 'device', 'scopes', 'expires', 'user']);
  const tok = r.body.token, refresh = r.body.refresh;
  r = await req('/api/me', { headers: { authorization: `Bearer ${tok}` } });
  assert.equal(r.status, 200);

  r = await req('/api/auth/refresh', { method: 'POST', body: { refresh } });
  assert.equal(r.status, 200);
  assert.deepEqual(keys(r.body), ['app', 'device', 'expires', 'refresh', 'refreshExpires', 'scopes', 'token', 'user']);
  const again = await req('/api/auth/refresh', { method: 'POST', body: { refresh } });
  assert.equal(again.status, 200); assert.equal(again.body.token, r.body.token, 'samme svar i grace-vinduet');
  r = await req('/api/me', { headers: { authorization: `Bearer ${tok}` } });
  assert.equal(r.status, 401, 'det gamle tilgangstokenet er trukket tilbake');

  // PKCE-flyten
  r = await req('/api/auth/app-code', { method: 'POST', headers: h, body: { client: 'kalender', redirect: 'kalender://auth', state: 'state-12345', code_challenge: 'a'.repeat(43) } });
  assert.equal(r.status, 200); assert.deepEqual(keys(r.body), ['code', 'expiresIn', 'redirectUrl']);
  r = await req('/api/auth/app-code', { method: 'POST', headers: h, body: { client: 'kalender', redirect: 'https://ond.example/', state: 'state-12345', code_challenge: 'a'.repeat(43) } });
  assert.equal(r.status, 400);
});

test('utlogging tilbakekaller Kalender-tokenene fra økta', async () => {
  let r = await req('/api/login', { method: 'POST', body: { username: 'sebastian', password: 'eierpassord1' } });
  assert.equal(r.status, 200);
  const sid = r.cookies.filter((x) => /^hl_(sid|kd51)=/.test(x)).join('; ');
  r = await req('/api/auth/device-token', { method: 'POST', headers: { cookie: sid }, body: {} });
  r = await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: r.body.device_token, app: 'kalender', device: 'iPad' } });
  assert.equal(r.status, 200);
  const tok = r.body.token;
  assert.equal((await req('/api/me', { headers: { authorization: `Bearer ${tok}` } })).status, 200);
  r = await req('/api/logout', { method: 'POST', headers: { cookie: sid }, body: {} });
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  assert.equal((await req('/api/state', { headers: { cookie: sid } })).status, 401, 'økta er borte');
  assert.equal((await req('/api/me', { headers: { authorization: `Bearer ${tok}` } })).status, 401, 'Kalender-tokenet er trukket tilbake');
});

test('pålitelig enhet: bare med enhetscookie og lokal adresse fra tilkoblingen eller CF-Connecting-IP', async () => {
  const dev = owner.split('; ').find((x) => x.startsWith('hl_dev='));
  const kd = owner.split('; ').find((x) => x.startsWith('hl_kd51='));
  const jar = [dev, kd].filter(Boolean).join('; ');
  const state = (headers) => app.request('/api/state', { headers: { cookie: jar, ...headers } }).then((r) => r.status);
  assert.equal(await state({ 'x-forwarded-for': '192.168.1.5' }), 401, 'X-Forwarded-For teller ikke');
  assert.equal(await state({ 'cf-connecting-ip': '81.2.3.4' }), 401, 'offentlig adresse');
  assert.equal(await state({ 'cf-connecting-ip': '192.168.1.5' }), 200, 'lokal adresse via Cloudflare/cloudflared');
  const direct = { incoming: { socket: { remoteAddress: '8.8.4.4' } } };
  const r = await app.request('/api/state', { headers: { cookie: jar, 'cf-connecting-ip': '192.168.1.5' } }, direct);
  assert.equal(r.status, 401, 'forfalsket CF-Connecting-IP direkte fra internett');
});
