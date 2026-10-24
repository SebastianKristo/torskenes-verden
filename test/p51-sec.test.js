// Prompt 51 (SEC51): sikkerhet – sperrer (eksponentielt, per IP og konto), passordregelen (lokal adresse bare fra tilkoblingen/Cloudflare),
// revisjonslogg, godkjenning av nye enheter, nytt land, passkeys (WebAuthn ES256/RS256, none/packed, sign count), hemmeligheter med alder
// og rotering, loggvakt og logg-skanner, QR- og app-token-sperrer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign as cryptoSign, createHash } from 'node:crypto';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51sec-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PUBLIC_URL = 'https://os.example.no';
process.env.TEST51_API_KEY = 'testnokkel-51-abcdefghijklmnop';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const rl = await import('../server/ratelimit51.js');
const sec = await import('../server/sec51.js');
const wa = await import('../server/webauthn51.js');
const guard = await import('../server/logguard51.js');
const settings = await import('../server/settings.js');

const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const CF = { incoming: { socket: { remoteAddress: '172.18.0.5' } } }; // cloudflared-containeren
const DIRECT = { incoming: { socket: { remoteAddress: '8.8.4.4' } } }; // porten nådd rett fra internett
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
let ipN = 10;
const pubIp = () => `81.2.${Math.floor(ipN / 250)}.${ipN++ % 250}`;

async function req(path, { method = 'GET', headers = {}, body, env } = {}) {
  const r = await app.request(path, { method, headers: { 'user-agent': UA, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
const cookies = (r) => (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).filter((x) => !/=$/.test(x));
const cookieOf = (r, name) => cookies(r).find((x) => x.startsWith(`${name}=`)) ?? null;
const jar = (...list) => list.filter(Boolean).join('; ');
const viaCf = (ip, country = 'NO') => ({ env: CF, headers: { 'cf-connecting-ip': ip, 'cf-ipcountry': country } });

async function lanLogin(username, password) {
  const r = await req('/api/login', { method: 'POST', env: LAN, body: { username, password, remember: true } });
  assert.equal(r.status, 200, r.text);
  return { sid: cookieOf(r, 'hl_sid'), kd: cookieOf(r, 'hl_kd51'), dev: cookieOf(r, 'hl_dev') };
}
const A = await lanLogin('sebastian', 'testpassord1');
const as = (ck, env = LAN) => (path, method = 'GET', body) => req(path, { method, env, headers: { cookie: ck }, body });
const ADM = as(jar(A.sid, A.kd));
assert.equal((await ADM('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const kariId = db.prepare("SELECT id FROM users WHERE username='kari'").pluck().get();
const notes = (u, title) => db.prepare('SELECT COUNT(*) FROM notify_queue WHERE user_id=? AND title=?').pluck().get(u, title);

/* ---------------- Sperrer ---------------- */

test('ratelimit51: sperre etter terskelen, dobles for hver feil, tak og opplåsing', () => {
  const t0 = 1_000_000_000_000;
  for (let i = 0; i < 4; i++) assert.equal(rl.fail51('login', 'ip', 'x51', t0 + i).lockMs, 0);
  assert.equal(rl.blocked51('login', 'ip', 'x51', t0 + 10), 0);
  assert.equal(rl.fail51('login', 'ip', 'x51', t0 + 10).lockMs, 60_000);
  assert.equal(rl.blocked51('login', 'ip', 'x51', t0 + 20), 60);
  assert.equal(rl.fail51('login', 'ip', 'x51', t0 + 70_000).lockMs, 120_000);
  assert.equal(rl.fail51('login', 'ip', 'x51', t0 + 200_000).lockMs, 240_000);
  for (let i = 0; i < 20; i++) rl.fail51('login', 'ip', 'x51', t0 + 300_000 + i);
  assert.equal(rl.fail51('login', 'ip', 'x51', t0 + 400_000).lockMs, rl.POLICY51.ip.max, 'taket');
  // Konto: terskel 10.
  for (let i = 0; i < 9; i++) assert.equal(rl.fail51('login', 'acct', 'u51', t0 + i).lockMs, 0);
  assert.equal(rl.fail51('login', 'acct', 'u51', t0 + 9).lockMs, 60_000);
  rl.clear51('login', 'ip', 'x51'); rl.clear51('login', 'acct', 'u51');
  assert.equal(rl.blocked51('login', 'ip', 'x51', t0 + 400_001), 0);
});

test('passordregelen: CF-Connecting-IP/X-Forwarded-For gjelder ikke når porten nås rett fra internett', async () => {
  const ctx = (headers, env) => ({ req: { header: (n) => headers[n.toLowerCase()], url: 'http://x/' }, env });
  assert.equal(auth.trustIp(ctx({ 'cf-connecting-ip': '192.168.1.5' }, DIRECT)), '8.8.4.4', 'forfalsket header fra internett');
  assert.equal(auth.isLan(auth.trustIp(ctx({ 'cf-connecting-ip': '192.168.1.5' }, DIRECT))), false);
  assert.equal(auth.trustIp(ctx({ 'cf-connecting-ip': '81.1.1.1' }, CF)), '81.1.1.1', 'via cloudflared');
  assert.equal(auth.trustIp(ctx({ 'x-forwarded-for': '192.168.1.5' }, DIRECT)), '8.8.4.4');
  assert.equal(auth.clientIp(ctx({ 'x-forwarded-for': '10.0.0.9', 'cf-connecting-ip': '10.0.0.9' }, DIRECT)), '8.8.4.4', 'sperren kan ikke unngås med headere');
  assert.equal(auth.viaCloudflare(ctx({ 'cf-connecting-ip': '81.1.1.1' }, DIRECT)), false);
  // Pålitelig enhet (hl_dev) + forfalsket lokal adresse fra internett → ingen automatisk innlogging.
  const r = await req('/api/state', { env: DIRECT, headers: { cookie: A.dev, 'cf-connecting-ip': '192.168.1.5', 'x-forwarded-for': '192.168.1.5' } });
  assert.equal(r.status, 401);
  const ok = await req('/api/state', { env: LAN, headers: { cookie: A.dev } });
  assert.equal(ok.status, 200, 'samme cookie fra lokalt nett virker');
});

test('kontosperren gjelder ikke fra lokalt nett (kan ikke stenge eieren ute hjemme)', async () => {
  const ip = pubIp();
  for (let i = 0; i < 10; i++) await req('/api/login', { method: 'POST', ...viaCf(pubIp()), body: { username: 'kari', password: `feil${i}` } });
  const blocked = await req('/api/login', { method: 'POST', ...viaCf(ip), body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(blocked.status, 429);
  const lan = await req('/api/login', { method: 'POST', env: LAN, body: { username: 'kari', password: 'kariPassord123', remember: true } });
  assert.equal(lan.status, 200, lan.text);
  assert.ok(cookieOf(lan, 'hl_kd51'), 'kjent enhet fra lokalt nett');
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='lockout' AND user=?").get(kariId), 'sperren er logget');
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='login_failed' AND user=?").get(kariId));
});

/* ---------------- Nye enheter og nytt land ---------------- */

let kariLan;
test('ny enhet fra internett må godkjennes fra en kjent enhet; ingen økt før det', async () => {
  kariLan = await lanLogin('kari', 'kariPassord123');
  const sessions0 = db.prepare('SELECT COUNT(*) FROM sessions WHERE user=?').pluck().get(kariId);
  const ip = pubIp();
  const r = await req('/api/login', { method: 'POST', ...viaCf(ip, 'NO'), body: { username: 'kari', password: 'kariPassord123', remember: true } });
  assert.equal(r.status, 403, r.text);
  assert.equal(r.body.code, 'DEVICE_APPROVAL_REQUIRED');
  assert.equal(cookieOf(r, 'hl_sid'), null, 'ingen økt-cookie');
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions WHERE user=?').pluck().get(kariId), sessions0, 'økten er fjernet igjen');
  const kd = cookieOf(r, 'hl_kd51'), ap = cookieOf(r, 'hl_ap51');
  assert.ok(kd && ap);
  assert.ok(notes(kariId, 'Ny enhet vil logge inn') >= 1 && notes(OWNER, 'Ny enhet vil logge inn') >= 1, 'brukeren og admin varsles');
  // Før godkjenning: finish → 409.
  const early = await req(r.body.finishUrl, { method: 'POST', ...viaCf(ip), headers: { ...viaCf(ip).headers, cookie: jar(kd, ap) }, body: {} });
  assert.equal(early.status, 409);
  // Godkjenn fra Karis kjente (lokale) økt.
  const K = as(jar(kariLan.sid, kariLan.kd));
  const ov = await K('/api/security51/overview');
  assert.ok(ov.body.pending.some((p) => p.id === r.body.approvalId));
  assert.equal((await K(`/api/security51/approvals/${r.body.approvalId}`, 'POST', { approve: true })).status, 200);
  const st = await req(r.body.statusUrl, { ...viaCf(ip), headers: { ...viaCf(ip).headers, 'x-approval-key': r.body.pollKey } });
  assert.equal(st.body.state, 'approved');
  // Fullfør i samme nettleser → økt.
  const fin = await req(r.body.finishUrl, { method: 'POST', ...viaCf(ip), headers: { ...viaCf(ip).headers, cookie: jar(kd, ap) }, body: {} });
  assert.equal(fin.status, 200, fin.text);
  assert.ok(cookieOf(fin, 'hl_sid'));
  assert.equal((await req(r.body.finishUrl, { method: 'POST', ...viaCf(ip), headers: { ...viaCf(ip).headers, cookie: jar(kd, ap) }, body: {} })).status, 409, 'engangs');
  // Neste innlogging fra samme nettleser (kjent enhet) går rett gjennom.
  const again = await req('/api/login', { method: 'POST', ...viaCf(pubIp(), 'NO'), headers: { ...viaCf(ip).headers, cookie: kd }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(again.status, 200, again.text);
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='device_approved' AND user=?").get(kariId));
  // Annen nettleser, avvist.
  const r2 = await req('/api/login', { method: 'POST', ...viaCf(pubIp()), body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r2.status, 403);
  assert.equal((await ADM(`/api/security51/approvals/${r2.body.approvalId}`, 'POST', { approve: false })).status, 200, 'admin kan avvise');
  const fin2 = await req(r2.body.finishUrl, { method: 'POST', env: CF, headers: { 'x-approval-key': r2.body.pollKey, cookie: cookieOf(r2, 'hl_kd51') }, body: {} });
  assert.equal(fin2.status, 403);
  // En annen bruker kan ikke godkjenne Karis enhet.
  const r3 = await req('/api/login', { method: 'POST', ...viaCf(pubIp()), body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r3.status, 403);
  await ADM('/api/users', 'POST', { username: 'per', password: 'perPassord1234', role: 'bruker', name: 'Per' });
  const P = await lanLogin('per', 'perPassord1234');
  assert.equal((await as(jar(P.sid, P.kd))(`/api/security51/approvals/${r3.body.approvalId}`, 'POST', { approve: true })).status, 404);
});

test('aller første enhet fra internett godkjennes automatisk (og varsles); lokalt nett godkjennes alltid', async () => {
  await ADM('/api/users', 'POST', { username: 'ola', password: 'olaPassord1234', role: 'bruker', name: 'Ola' });
  const olaId = db.prepare("SELECT id FROM users WHERE username='ola'").pluck().get();
  const r = await req('/api/login', { method: 'POST', ...viaCf(pubIp(), 'NO'), body: { username: 'ola', password: 'olaPassord1234' } });
  assert.equal(r.status, 200, r.text);
  assert.ok(cookieOf(r, 'hl_kd51'));
  assert.equal(notes(olaId, 'Første enhet godkjent'), 1);
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='device_auto' AND user=?").get(olaId));
});

test('innlogging fra nytt land varsles (Cloudflare-landet), første land er utgangspunktet', async () => {
  const kd = kariLan.kd;
  const se = await req('/api/login', { method: 'POST', env: CF, headers: { 'cf-connecting-ip': pubIp(), 'cf-ipcountry': 'SE', cookie: kd }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(se.status, 200, se.text);
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='new_country' AND user=? AND country='SE'").get(kariId));
  assert.equal(notes(kariId, 'Innlogging fra nytt land'), 1);
  await req('/api/login', { method: 'POST', env: CF, headers: { 'cf-connecting-ip': pubIp(), 'cf-ipcountry': 'SE', cookie: kd }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(notes(kariId, 'Innlogging fra nytt land'), 1, 'bare første gang');
  // Landet stoles ikke på uten Cloudflare foran.
  const x = await req('/api/login', { method: 'POST', env: DIRECT, headers: { 'cf-ipcountry': 'RU', cookie: kd }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(x.status, 200);
  assert.ok(!db.prepare("SELECT 1 FROM sec51_audit WHERE country='RU'").get());
});

test('revisjonslogg: egen logg for brukeren, alt for admin; vanlig bruker ser ikke andres', async () => {
  const K = as(jar(kariLan.sid, kariLan.kd));
  const mine = await K('/api/security51/audit?limit=200');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.items.length > 3 && mine.body.items.every((e) => e.user === kariId));
  assert.ok(mine.body.items.some((e) => e.kind === 'login' && e.method === 'password' && e.ip));
  const asAll = await K('/api/security51/audit?all=1');
  assert.ok(asAll.body.items.every((e) => e.user === kariId), 'all=1 ignoreres for vanlige brukere');
  const all = await ADM('/api/security51/audit?all=1&limit=500');
  assert.ok(new Set(all.body.items.map((e) => e.user)).size >= 2);
  assert.ok(!/kariPassord123|feil\d/.test(JSON.stringify(all.body)), 'aldri passord i loggen');
});

test('app-innlogging (token) fra ny enhet: ikke noe token før godkjenning; gammel app kan prøve igjen etter godkjenning', async () => {
  const ip = pubIp(), h = { 'cf-connecting-ip': ip, 'user-agent': 'FinansHub/3.1 (iPhone)' };
  const n0 = db.prepare("SELECT COUNT(*) FROM fh_tokens").pluck().get?.() ?? 0;
  void n0;
  const r = await req('/finans/api/auth/token', { method: 'POST', env: CF, headers: h, body: { username: 'kari', password: 'kariPassord123', deviceName: 'iPhone 16' } });
  assert.equal(r.status, 403, r.text);
  assert.equal(r.body.code, 'DEVICE_APPROVAL_REQUIRED');
  assert.ok(!r.body.token);
  const K = as(jar(kariLan.sid, kariLan.kd));
  assert.equal((await K(`/api/security51/approvals/${r.body.approvalId}`, 'POST', { approve: true })).status, 200);
  const retry = await req('/finans/api/auth/token', { method: 'POST', env: CF, headers: h, body: { username: 'kari', password: 'kariPassord123', deviceName: 'iPhone 16' } });
  assert.equal(retry.status, 200, retry.text);
  assert.match(retry.body.token, /^fh_pat_/);
  // Ny app med X-Device-Key: finish gir token og husker enheten.
  const key = 'devkey51-abcdefghijklmnopqrstuv';
  const r2 = await req('/finans/api/auth/token', { method: 'POST', env: CF, headers: { ...h, 'cf-connecting-ip': pubIp(), 'x-device-key': key }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r2.status, 403);
  await K(`/api/security51/approvals/${r2.body.approvalId}`, 'POST', { approve: true });
  const fin = await req(r2.body.finishUrl, { method: 'POST', env: CF, headers: { 'x-approval-key': r2.body.pollKey, 'x-device-key': key }, body: {} });
  assert.equal(fin.status, 200, fin.text);
  assert.match(fin.body.token, /^fh_pat_/);
  const r3 = await req('/finans/api/auth/token', { method: 'POST', env: CF, headers: { ...h, 'cf-connecting-ip': pubIp(), 'x-device-key': key }, body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r3.status, 200, 'kjent app-enhet');
});

/* ---------------- Passkeys ---------------- */

const RP = 'os.example.no', ORIGIN = 'https://os.example.no';
const cd = (type, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
function makeCred(alg = 'ES256') {
  const kp = alg === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = kp.publicKey.export({ format: 'jwk' });
  const cose = alg === 'ES256' ? new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
    : new Map([[1, 3], [3, -257], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]]);
  return { kp, cose, id: Buffer.from(`cred-${alg}-${Math.random()}`) };
}
const flagsByte = ({ up = true, uv = true, at = false, be = false, bs = false } = {}) => (up ? 1 : 0) | (uv ? 4 : 0) | (be ? 8 : 0) | (bs ? 16 : 0) | (at ? 64 : 0);
function authData({ rpId = RP, flags, count = 0, cred = null }) {
  const head = Buffer.alloc(37);
  createHash('sha256').update(rpId).digest().copy(head, 0);
  head[32] = flags; head.writeUInt32BE(count, 33);
  if (!cred) return head;
  const len = Buffer.alloc(2); len.writeUInt16BE(cred.id.length);
  return Buffer.concat([head, Buffer.alloc(16), len, cred.id, wa.cborEncode(cred.cose)]);
}
function registration(cred, challenge, { fmt = 'none', origin = ORIGIN, uv = true, rpId = RP } = {}) {
  const ad = authData({ rpId, flags: flagsByte({ at: true, uv, be: true, bs: true }), cred });
  const cdj = cd('webauthn.create', challenge, origin);
  let attStmt = new Map();
  if (fmt === 'packed') {
    const sig = cryptoSign('sha256', Buffer.concat([ad, createHash('sha256').update(cdj).digest()]), cred.kp.privateKey);
    attStmt = new Map([['alg', cred.cose.get(3)], ['sig', sig]]);
  }
  return { id: cred.id.toString('base64url'), rawId: cred.id.toString('base64url'), type: 'public-key',
    response: { clientDataJSON: cdj.toString('base64url'), attestationObject: wa.cborEncode(new Map([['fmt', fmt], ['attStmt', attStmt], ['authData', ad]])).toString('base64url'), transports: ['internal', 'hybrid'] } };
}
function assertion(cred, challenge, { count = 1, uv = true, origin = ORIGIN, userHandle = null } = {}) {
  const ad = authData({ flags: flagsByte({ uv, be: true, bs: true }), count });
  const cdj = cd('webauthn.get', challenge, origin);
  const sig = cryptoSign('sha256', Buffer.concat([ad, createHash('sha256').update(cdj).digest()]), cred.kp.privateKey);
  return { id: cred.id.toString('base64url'), rawId: cred.id.toString('base64url'), type: 'public-key',
    response: { clientDataJSON: cdj.toString('base64url'), authenticatorData: ad.toString('base64url'), signature: sig.toString('base64url'), userHandle } };
}

test('webauthn51: CBOR, none- og packed-attestasjon (ES256 og RS256), feil opphav/RP/UV avvises', () => {
  assert.deepEqual(wa.cborDecode(wa.cborEncode(new Map([[1, 2], [-3, Buffer.from('ab')], ['x', [true, null, 'ø']]]))), new Map([[1, 2], [-3, Buffer.from('ab')], ['x', [true, null, 'ø']]]));
  const ch = Buffer.from('c'.repeat(32));
  for (const alg of ['ES256', 'RS256']) {
    for (const fmt of ['none', 'packed']) {
      const cred = makeCred(alg);
      const r = wa.verifyRegistration51(registration(cred, ch.toString('base64url'), { fmt }), { challenge: ch, rpId: RP, origins: [ORIGIN] });
      assert.equal(r.alg, alg === 'ES256' ? -7 : -257);
      assert.equal(r.credentialId, cred.id.toString('base64url'));
      assert.equal(r.fmt, fmt);
      const a = wa.verifyAssertion51(assertion(cred, ch.toString('base64url'), { count: 5 }), { jwk: r.jwk, alg: r.alg, signCount: 0 }, { challenge: ch, rpId: RP, origins: [ORIGIN] });
      assert.equal(a.signCount, 5);
      assert.throws(() => wa.verifyAssertion51(assertion(cred, ch.toString('base64url'), { count: 5 }), { jwk: r.jwk, alg: r.alg, signCount: 5 }, { challenge: ch, rpId: RP, origins: [ORIGIN] }), /telleren/i);
    }
  }
  const cred = makeCred();
  const opts = { challenge: ch, rpId: RP, origins: [ORIGIN] };
  assert.throws(() => wa.verifyRegistration51(registration(cred, ch.toString('base64url'), { origin: 'https://evil.example' }), opts), /opphav/);
  assert.throws(() => wa.verifyRegistration51(registration(cred, ch.toString('base64url'), { rpId: 'evil.example' }), opts), /RP-id/);
  assert.throws(() => wa.verifyRegistration51(registration(cred, ch.toString('base64url'), { uv: false }), opts), /bekreftet ikke/);
  assert.throws(() => wa.verifyRegistration51(registration(cred, Buffer.from('x'.repeat(32)).toString('base64url')), opts), /Utfordringen/);
  // Signatur med feil nøkkel.
  const other = makeCred();
  const reg = wa.verifyRegistration51(registration(cred, ch.toString('base64url')), opts);
  assert.throws(() => wa.verifyAssertion51(assertion(other, ch.toString('base64url')), { jwk: reg.jwk, alg: reg.alg, signCount: 0 }, opts), /Signaturen/);
  // Ukjent attestasjonsformat.
  const bad = registration(cred, ch.toString('base64url'));
  const att = wa.cborDecode(Buffer.from(bad.response.attestationObject, 'base64url'));
  att.set('fmt', 'tpm');
  bad.response.attestationObject = wa.cborEncode(att).toString('base64url');
  assert.throws(() => wa.verifyRegistration51(bad, opts), /støttes ikke/);
});

test('passkey: registrering (krever fersk økt/passord) og innlogging som likeverdig faktor; sign count stopper kopier', async () => {
  const K = as(jar(kariLan.sid, kariLan.kd));
  const st = await req('/api/auth/passkey/status');
  assert.deepEqual(st.body, { available: true, rpId: RP });
  const o = await K('/api/security51/passkeys/register/options', 'POST', {});
  assert.equal(o.status, 200, o.text);
  assert.equal(o.body.publicKey.rp.id, RP);
  assert.equal(o.body.publicKey.authenticatorSelection.userVerification, 'required');
  const cred = makeCred();
  const v = await K('/api/security51/passkeys/register/verify', 'POST', { challengeId: o.body.challengeId, credential: registration(cred, o.body.publicKey.challenge), name: 'Karis iPhone' });
  assert.equal(v.status, 200, v.text);
  assert.equal(v.body.passkey.name, 'Karis iPhone');
  assert.equal((await K('/api/security51/passkeys/register/verify', 'POST', { challengeId: o.body.challengeId, credential: registration(cred, o.body.publicKey.challenge) })).status, 400, 'utfordringen er engangs');
  // Innlogging (lokalt nett, ny nettleser).
  const lo = await req('/api/auth/passkey/options', { method: 'POST', env: LAN, body: { username: 'kari' } });
  assert.equal(lo.body.publicKey.allowCredentials.length, 1);
  const li = await req('/api/auth/passkey/login', { method: 'POST', env: LAN, body: { challengeId: lo.body.challengeId, credential: assertion(cred, lo.body.publicKey.challenge, { count: 1, userHandle: Buffer.from(kariId).toString('base64url') }) } });
  assert.equal(li.status, 200, li.text);
  assert.equal(li.body.user.id, kariId);
  assert.ok(cookieOf(li, 'hl_sid'));
  assert.ok(db.prepare("SELECT 1 FROM sec51_audit WHERE kind='login' AND method='passkey' AND user=?").get(kariId));
  // Samme teller igjen → avvist (mulig kopi) og varslet.
  const lo2 = await req('/api/auth/passkey/options', { method: 'POST', env: LAN, body: {} });
  assert.equal(lo2.body.publicKey.allowCredentials.length, 0, 'uten brukernavn: oppdagbar passkey');
  const li2 = await req('/api/auth/passkey/login', { method: 'POST', env: LAN, body: { challengeId: lo2.body.challengeId, credential: assertion(cred, lo2.body.publicKey.challenge, { count: 1 }) } });
  assert.equal(li2.status, 401);
  assert.equal(li2.body.code, 'sign_count');
  assert.equal(notes(kariId, 'Passkey kan være kopiert'), 1);
  // Fra internett på ukjent enhet: venter på godkjenning, som passord.
  const lo3 = await req('/api/auth/passkey/options', { method: 'POST', ...viaCf(pubIp()), body: {} });
  const li3 = await req('/api/auth/passkey/login', { method: 'POST', ...viaCf(pubIp()), body: { challengeId: lo3.body.challengeId, credential: assertion(cred, lo3.body.publicKey.challenge, { count: 9 }) } });
  assert.equal(li3.status, 403);
  assert.equal(li3.body.code, 'DEVICE_APPROVAL_REQUIRED');
  assert.equal(cookieOf(li3, 'hl_sid'), null);
  // Liste, gi nytt navn, fjern.
  const list = await K('/api/security51/passkeys');
  assert.equal(list.body.passkeys.length, 1);
  assert.ok(!/jwk|"x"|"y"/.test(list.text), 'ingen nøkkeldata ut');
  assert.equal((await K(`/api/security51/passkeys/${list.body.passkeys[0].id}`, 'PATCH', { name: 'Ny' })).status, 200);
  assert.equal((await K(`/api/security51/passkeys/${list.body.passkeys[0].id}`, 'DELETE')).status, 200);
  assert.equal((await K('/api/security51/passkeys')).body.passkeys.length, 0);
});

test('passkey-registrering krever passord når økta ikke er fersk', async () => {
  db.prepare('UPDATE sessions SET created=? WHERE user=?').run(Date.now() - 3600_000, kariId);
  const K = as(jar(kariLan.sid, kariLan.kd));
  assert.equal((await K('/api/security51/passkeys/register/options', 'POST', {})).status, 403);
  assert.equal((await K('/api/security51/passkeys/register/options', 'POST', { password: 'feil' })).status, 403);
  assert.equal((await K('/api/security51/passkeys/register/options', 'POST', { password: 'kariPassord123' })).status, 200);
});

/* ---------------- Hemmeligheter, loggvakt og skanner ---------------- */

test('hemmeligheter: alder per nøkkel, påminnelse når de er gamle, rotering uten at verdien sendes ut', async () => {
  settings.updateConfig({ openwebui_key: 'sk-gammelnokkel-1234567890abcdef' }, OWNER, { admin: true });
  const s = await ADM('/api/security51/secrets');
  assert.equal(s.status, 200);
  assert.ok(s.body.secrets.some((x) => x.id === 'env:TEST51_API_KEY' && x.rotate === 'manual' && x.ageDays === 0));
  const ow = s.body.secrets.find((x) => x.id === 'cfg:openwebui_key');
  assert.ok(ow && ow.rotate === 'paste');
  assert.ok(!s.text.includes('sk-gammelnokkel') && !s.text.includes('testnokkel-51'), 'aldri verdier');
  assert.ok(s.body.secrets.some((x) => x.id === 'env:SESSION_SECRET' && x.warning));
  // Kari ser ikke servernøklene.
  const ks = await as(jar(kariLan.sid, kariLan.kd))('/api/security51/secrets');
  assert.ok(ks.body.secrets.every((x) => x.source === 'personal'));
  // Gammel nøkkel → påminnelse til admin (én gang per 30 dager).
  const seen = kv.get(OWNER, 'sec51_secret_seen', {});
  seen['cfg:openwebui_key'].since = Date.now() - 200 * 86400_000;
  kv.set(OWNER, 'sec51_secret_seen', seen);
  assert.equal(sec.remindSecrets51(), 1);
  assert.equal(sec.remindSecrets51(), 0);
  assert.equal(notes(OWNER, 'På tide å rotere nøkler'), 1);
  // Roter: krever passord.
  assert.equal((await ADM('/api/security51/secrets/rotate', 'POST', { id: 'cfg:openwebui_key', value: 'sk-nynokkel-0987654321fedcba' })).status, 403);
  const rot = await ADM('/api/security51/secrets/rotate', 'POST', { id: 'cfg:openwebui_key', value: 'sk-nynokkel-0987654321fedcba', password: 'testpassord1' });
  assert.equal(rot.status, 200, rot.text);
  assert.equal(rot.body.secret.ageDays, 0);
  assert.ok(rot.body.secret.rotatedAt);
  assert.ok(!rot.text.includes('sk-nynokkel'));
  assert.equal(settings.cfg('openwebui_key'), 'sk-nynokkel-0987654321fedcba');
  assert.equal((await ADM('/api/security51/secrets/rotate', 'POST', { id: 'env:TEST51_API_KEY', value: 'x'.repeat(20), password: 'testpassord1' })).status, 400, 'env roteres i .env');
});

test('loggvakt: kjente nøkler og app-tokens maskeres før de skrives; skanneren finner lekkasjer i logg-tabeller', async () => {
  guard._refreshNow51();
  const out = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => { out.push(String(chunk)); return true; };
  try { console.log('kall med nøkkel', 'sk-nynokkel-0987654321fedcba', 'og fh_pat_abcdefghijklmnopqrstuvwxyz012345'); } finally { process.stdout.write = orig; }
  const line = out.join('');
  assert.ok(!line.includes('sk-nynokkel-0987654321fedcba') && !line.includes('fh_pat_abcdefghijklmnop'), line);
  assert.match(line, /••••/);
  // Lekkasje i en logg i databasen.
  kv.set(OWNER, 'test51_log', [{ at: 'nå', text: 'Kalte API med testnokkel-51-abcdefghijklmnop' }]);
  const scan = await ADM('/api/security51/logscan', 'POST', {});
  assert.equal(scan.status, 200);
  assert.ok(scan.body.findings.some((f) => f.secretId === 'env:TEST51_API_KEY' && /kv/.test(f.source)), JSON.stringify(scan.body.findings));
  assert.ok(!scan.text.includes('testnokkel-51-abcdefghijklmnop'), 'funnet vises uten verdien');
  assert.equal(notes(OWNER, 'Nøkkel funnet i loggene'), 1);
  kv.del(OWNER, 'test51_log');
  assert.equal((await as(jar(kariLan.sid, kariLan.kd))('/api/security51/logscan')).status, 403, 'bare admin');
});

/* ---------------- QR og app-token-utveksling ---------------- */

test('QR: ugyldige koder fra samme IP gir sperre; app-token-utveksling sperres etter feil', async () => {
  const ip = pubIp();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await req('/api/auth/qr/scan', { method: 'POST', env: CF, headers: { 'cf-connecting-ip': ip, cookie: jar(A.sid, A.kd) }, body: { code: 'tull' } })).status);
  assert.deepEqual(codes, [400, 400, 400, 400, 400, 429]);
  const ip2 = pubIp(), ex = [];
  for (let i = 0; i < 6; i++) ex.push((await req('/api/auth/device-exchange', { method: 'POST', env: CF, headers: { 'cf-connecting-ip': ip2 }, body: { device_token: `hdt_${'x'.repeat(30)}${i}`, app: 'kalender' } })).status);
  assert.deepEqual(ex, [401, 401, 401, 401, 401, 429]);
  const pk = [];
  const ip3 = pubIp();
  for (let i = 0; i < 6; i++) pk.push((await req('/api/auth/token', { method: 'POST', env: CF, headers: { 'cf-connecting-ip': ip3 }, body: { code: 'feil', code_verifier: 'x' } })).status);
  assert.equal(pk.at(-1), 429);
});

test('Sperrer i System: admin ser og låser opp, andre får 403', async () => {
  const l = await ADM('/api/security51/limits');
  assert.equal(l.status, 200);
  const qr = l.body.limits.find((x) => x.scope === 'qr' && x.locked);
  assert.ok(qr, JSON.stringify(l.body.limits.slice(0, 3)));
  assert.equal((await as(jar(kariLan.sid, kariLan.kd))('/api/security51/limits')).status, 403);
  assert.equal((await ADM(`/api/security51/limits?key=${encodeURIComponent(qr.key)}`, 'DELETE')).status, 200);
  assert.ok(!(await ADM('/api/security51/limits')).body.limits.some((x) => x.key === qr.key));
  const ov = await ADM('/api/security51/overview');
  assert.equal(ov.body.admin, true);
  assert.ok(Array.isArray(ov.body.limits));
  assert.equal(ov.body.passkeys.available, true);
});

test('policy: admin kan slå av enhetsgodkjenning; da slipper ny enhet rett inn', async () => {
  assert.equal((await ADM('/api/security51/policy', 'PUT', { deviceApproval: false })).status, 200);
  const r = await req('/api/login', { method: 'POST', ...viaCf(pubIp()), body: { username: 'kari', password: 'kariPassord123' } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await ADM('/api/security51/policy', 'PUT', { deviceApproval: true, secretMaxAgeDays: 5 })).status, 400);
  await ADM('/api/security51/policy', 'PUT', { deviceApproval: true });
  assert.equal(sec.policy51().deviceApproval, true);
});

test('eksisterende økter blir kjente enheter (oppgradering fra før prompt 51)', async () => {
  // En økt uten hl_kd51 (som før oppgraderingen) får en godkjent enhets-cookie på første GET.
  const r = await req('/api/state', { env: LAN, headers: { cookie: A.sid } });
  assert.equal(r.status, 200);
  const kd = cookieOf(r, 'hl_kd51');
  assert.ok(kd);
  const d = await req('/api/security51/devices', { env: LAN, headers: { cookie: jar(A.sid, kd) } });
  assert.ok(d.body.devices.some((x) => x.current && x.approved));
});
