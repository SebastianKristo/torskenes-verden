// Prompt 91 (TFA91): tofaktor og serverhemmeligheten etter gjenoppretting av en systembackup.
//  - Uleselig 2FA-hemmelighet → klar norsk melding (aldri «Unsupported state …»), ingen innlogging uten 2FA, av med passord virker.
//  - Backup laget med «legacy»-reservenøkkelen, gjenopprettet på en server med egen hemmelighet → 2FA og forseglede verdier
//    krypteres på nytt i samme transaksjon og virker etterpå.
//  - Ukjent gammel nøkkel → secretMismatch i lista/opplastingen, og 2FA slås av for de berørte når det er valgt (standard).
//  - manifest.json (og arkivet) inneholder aldri hemmeligheten; scripts/reset-2fa.js og scripts/rekey-secrets.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const S = 'p91-env-secret-p91-env-secret-p91-env-secret';
const X = 'p91-annen-server-hemmelighet-som-er-ukjent-xx';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p91-'));
process.env.BACKUP_DIR = join(process.env.DATA_DIR, 'sb');
process.env.SESSION_SECRET = S;
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.BACKUP_COMPRESS = 'gz';
process.env.BACKUP_UPLOAD_RATE = '1000';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.TOTP_ENC_KEY;
delete process.env.SECRET_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const { default: app } = await import('../server/index.js');
const sb = await import('../server/system-backup.js');
const { config } = await import('../server/config.js');
const { db, kv, OWNER } = await import('../server/db.js');
const auth = await import('../server/auth/session.js');
const totp = await import('../server/auth/totp.js');
const s91 = await import('../server/auth/secret-rekey.js');
const { seal, unseal } = await import('../server/finans/db.js');
const DATA = process.env.DATA_DIR, BDIR = process.env.BACKUP_DIR;

/** Bytter serverhemmeligheten i prosessen ('' = ingen: reservenøklene i koden, som en eldre installasjon). */
function useSecret(s) {
  config.sessionSecret = s;
  if (s) process.env.SESSION_SECRET = s; else delete process.env.SESSION_SECRET;
}
let ipN = 0;
const ip = () => `192.168.91.${(ipN++ % 250) + 1}`; // lokalt nett: ingen godkjenning av ny enhet (sec51)
const json = (body, h = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip(), ...h }, body: JSON.stringify(body) });
async function login(username, password) {
  const r = await app.request('/api/login', json({ username, password }));
  assert.equal(r.status, 200, `innlogging ${username}`);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, 'cf-connecting-ip': ip(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch { /* binær */ }
  return { status: r.status, body: j, buf, cookie: r.headers.get('set-cookie') };
};
/** Slår på 2FA for den innloggede brukeren. → hemmeligheten (Buffer) */
async function enable2fa(C) {
  const s = await C('/api/auth/totp/setup', 'POST', {});
  assert.equal(s.status, 200);
  const key = totp.base32Decode(s.body.secret);
  const v = await C('/api/auth/totp/verify', 'POST', { code: totp.totpNow(key) });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { key, recovery: v.body.recoveryCodes };
}
const resetStep = (username) => db.prepare('UPDATE users SET totp_last_step=-1 WHERE username=?').run(username);
/** Innlogging i to steg på web. → {status, body, session} */
async function login2fa(username, password, code) {
  const r1 = await app.request('/api/login', json({ username, password }));
  const b1 = await r1.json();
  assert.equal(b1.needsTotp, true, `${username} skal ha 2FA`);
  const r2 = await app.request('/api/auth/totp', json({ ticket: b1.ticket, code }));
  return { status: r2.status, body: await r2.json(), session: /hl_sid=/.test(r2.headers.get('set-cookie') ?? '') };
}
const userRow = (username) => db.prepare('SELECT * FROM users WHERE username=?').get(username);
const waitIdle = async () => { for (let i = 0; i < 1000 && sb.backupRunning(); i++) await new Promise((r) => setTimeout(r, 10)); };

const A = client(await login('sebastian', 'testpassord1'));
for (const [u, n] of [['kari', 'Kari'], ['ola', 'Ola']]) assert.equal((await A('/api/users', 'POST', { username: u, password: `${u}Passord123`, role: 'bruker', name: n })).status, 200);

test('uleselig 2FA-hemmelighet: klar melding, ingen innlogging uten 2FA, av med passord virker', async () => {
  const O = client(await login('ola', 'olaPassord123'));
  const { key, recovery } = await enable2fa(O);
  // Som etter gjenoppretting med en annen serverhemmelighet: hemmeligheten er kryptert med en nøkkel serveren ikke har.
  db.prepare('UPDATE users SET totp_secret_enc=? WHERE username=?').run(totp.encryptSecretWith(key, randomBytes(32)), 'ola');
  assert.throws(() => totp.decryptSecret(userRow('ola').totp_secret_enc), (e) => e.code === 'TOTP_UNREADABLE' && !/Unsupported state/.test(e.message));
  assert.throws(() => auth.checkSecondFactor(userRow('ola').id, totp.totpNow(key)), /serverhemmeligheten er endret/);

  resetStep('ola');
  const l = await login2fa('ola', 'olaPassord123', totp.totpNow(key));
  assert.equal(l.status, 409);
  assert.match(l.body.error, /Tofaktor-nøkkelen .*kan ikke leses fordi serverhemmeligheten er endret/);
  assert.doesNotMatch(l.body.error, /Unsupported state|authenticate data/);
  assert.equal(l.session, false, 'ingen økt uten gyldig 2FA');
  const app1 = auth.verifyLogin('ola', 'olaPassord123', totp.totpNow(key), ip());
  assert.equal(app1.ok, false); assert.equal(app1.status, 409);
  assert.equal(auth.verifyLogin('ola', 'olaPassord123', '', ip()).ok, false, 'uten kode: fortsatt 2FA-steg');
  // Appinnlogging (FinansHub-token) får heller ingen token.
  const tl = await app.request('/finans/api/auth/token', json({ username: 'ola', password: 'olaPassord123', code: totp.totpNow(key) }));
  assert.notEqual(tl.status, 200);

  // Flagg til UI (aldri nøkkelen).
  const me = await O('/api/users');
  assert.equal(me.body.me.totpUnreadable, true);
  assert.ok(!JSON.stringify(me.body).includes(userRow('ola').totp_secret_enc));
  assert.equal((await O('/api/auth/2fa/status')).body.unreadable, true);

  // «Slå av 2FA» med kode: klar melding, ikke rå kryptofeil.
  for (const p of ['/api/auth/totp/disable', '/api/auth/2fa/disable']) {
    const d = await O(p, 'POST', { code: totp.totpNow(key) });
    assert.equal(d.status, 409, p);
    assert.match(d.body.error, /Slå av tofaktor med passordet ditt og sett det opp på nytt/);
    assert.doesNotMatch(d.body.error, /Unsupported state/);
  }
  assert.equal(userRow('ola').totp_enabled, 1);
  // En gjenopprettingskode (HMAC, uendret hemmelighet) er en gyldig andre faktor og virker fortsatt.
  const rc = await login2fa('ola', 'olaPassord123', recovery[0]);
  assert.equal(rc.status, 200); assert.equal(rc.session, true);
  // Feil passord slår ikke av; riktig passord gjør det.
  assert.equal((await O('/api/auth/totp/disable', 'POST', { password: 'feil-passord' })).status, 403);
  assert.equal((await O('/api/auth/totp/disable', 'POST', { password: 'olaPassord123' })).status, 200);
  assert.equal(userRow('ola').totp_enabled, 0);

  // Ventende oppsett som ikke kan leses → klar melding, start på nytt.
  await O('/api/auth/totp/setup', 'POST', {});
  const p = kv.get(userRow('ola').id, 'totp_pending');
  kv.set(userRow('ola').id, 'totp_pending', { ...p, enc: totp.encryptSecretWith(randomBytes(20), randomBytes(32)) });
  const v = await O('/api/auth/totp/verify', 'POST', { code: '123456' });
  assert.equal(v.status, 409);
  assert.match(v.body.error, /serverhemmeligheten er endret.*Start oppsettet på nytt/);
});

test('fingeravtrykk: kilde + HMAC, aldri hemmeligheten', () => {
  const m = s91.manifestSecret91();
  assert.equal(m.source, 'env');
  for (const k of s91.KINDS91) assert.match(m.fp[k], /^[0-9a-f]{32}$/);
  const txt = JSON.stringify(m), ring = s91.currentRing91().ring;
  assert.ok(!txt.includes(S));
  for (const k of ['totp', 'seal', 'settings', 'domains']) { assert.ok(!txt.includes(ring[k].toString('hex'))); assert.ok(!txt.includes(ring[k].toString('base64'))); }
  // Ukjente felt fra et manifest godtas ikke.
  assert.deepEqual(s91.cleanSecret91({ source: 'x', fp: { totp: m.fp.totp, evil: 'a'.repeat(32) }, secret: S }), { source: null, fp: { totp: m.fp.totp } });
  assert.equal(s91.cleanSecret91({ fp: { totp: 'ikke-hex' } }), null);
  assert.equal(s91.compareSecret91(m).same, true);
  // De samme nøklene som modulene: seal() og TOTP-krypteringen.
  assert.equal(s91.rekeyValue91('seal', seal('abc'), { cur: ring, olds: [] }).state, 'ok');
  assert.equal(s91.rekeyValue91('totp', totp.encryptSecret(randomBytes(20)), { cur: ring, olds: [] }).state, 'ok');
  // «enc1:» (settings.js) med legacy-nøkkelen krypteres på nytt med dagens.
  const legacy = s91.ring91((l) => l);
  const old = s91.rekeyValue91('settings', 'enc1:' + gcm('hemmelig-enc1', legacy.settings), { cur: ring, olds: s91.candidates91() });
  assert.equal(old.state, 'rekeyed');
  assert.equal(s91.rekeyValue91('settings', old.v, { cur: ring, olds: [] }).state, 'ok');
  assert.equal(s91.rekeyValue91('settings', 'enc1:' + gcm('x', randomBytes(32)), { cur: ring, olds: s91.candidates91() }).state, 'unreadable');
});
/** AES-256-GCM i formatet iv|tag|data (base64), som seal()/sealSecret(). */
function gcm(text, key) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

/** Kjører en backup av modulene og returnerer id-en. */
async function backup(C, modules = ['innstillinger']) {
  const r = await C('/api/backup/run', 'POST', { scope: 'custom', modules });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  await waitIdle();
  assert.equal(sb._test.getJob(r.body.id).state, 'done', sb._test.getJob(r.body.id).error ?? '');
  return r.body.id;
}
const job = async (id) => (await A('/api/backup/list')).body.find((x) => x.id === id);

test('backup med legacy-nøkkel, gjenopprettet på server med egen hemmelighet: 2FA og nøkler krypteres på nytt', async () => {
  useSecret('');
  try {
    const L = client(await login('sebastian', 'testpassord1'));
    const K = client(await login('kari', 'kariPassord123'));
    const { key } = await enable2fa(K);
    kv.set(OWNER, 'p91_test', { nested: { key: seal('hemmelig-91') }, plain: 'enc:ikke-base64' });
    assert.equal(unseal(kv.get(OWNER, 'p91_test').nested.key), 'hemmelig-91');
    const id = await backup(L);
    var bid = id, kariKey = key;
    const man = JSON.parse(readFileSync(join(BDIR, `${id}.json`), 'utf8'));
    assert.equal(man.secret.source, 'legacy');
    assert.ok(man.secret.fp.totp);
  } finally { useSecret(S); }

  // Manifestet og hele arkivet inneholder aldri hemmeligheten eller nøklene.
  const file = readdirSync(BDIR).find((f) => f.startsWith(bid) && /\.tar\.gz$/.test(f));
  const tar = gunzipSync(readFileSync(join(BDIR, file)));
  const ring = s91.currentRing91().ring, legacy = s91.ring91((l) => l);
  assert.ok(!tar.includes(Buffer.from(S)));
  for (const r of [ring, legacy]) for (const k of ['totp', 'seal', 'settings']) { assert.ok(!tar.includes(r[k])); assert.ok(!tar.includes(Buffer.from(r[k].toString('hex')))); }
  assert.ok(!readFileSync(join(BDIR, `${bid}.json`), 'utf8').includes(S));

  // Nå (egen hemmelighet) kan kari ikke logge inn med kode – klar melding, ingen økt.
  resetStep('kari');
  const before = await login2fa('kari', 'kariPassord123', totp.totpNow(kariKey));
  assert.equal(before.status, 409); assert.equal(before.session, false);

  const j = await job(bid);
  assert.equal(j.secretRekey, true); assert.equal(j.secretMismatch, undefined);
  const r = await A('/api/backup/restore', 'POST', { id: bid, modules: ['innstillinger'], password: 'testpassord1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.secret.rekeyed.totp, 1);
  assert.ok(r.body.secret.rekeyed.values >= 1);
  assert.deepEqual(r.body.secret.disabled2fa, []);
  assert.ok(r.body.messages.some((m) => /Den gamle nøkkelen er kjent/.test(m)), r.body.messages.join('\n'));
  assert.ok(r.body.messages.some((m) => /Tofaktor: 1 hemmelighet er kryptert på nytt/.test(m)));
  assert.ok(r.body.messages.some((m) => /Gjenopprettingskodene for tofaktor \(kari\)/.test(m)));
  assert.equal(userRow('kari').totp_enabled, 1);
  assert.deepEqual(totp.decryptSecret(userRow('kari').totp_secret_enc), kariKey);
  assert.equal(unseal(kv.get(OWNER, 'p91_test').nested.key), 'hemmelig-91');
  assert.equal(kv.get(OWNER, 'p91_test').plain, 'enc:ikke-base64', 'ugyldige verdier røres ikke');
  resetStep('kari');
  const after = await login2fa('kari', 'kariPassord123', totp.totpNow(kariKey));
  assert.equal(after.status, 200, JSON.stringify(after.body)); assert.equal(after.session, true);
  // Feil kode gir fortsatt ikke innlogging.
  assert.equal((await login2fa('kari', 'kariPassord123', '000000')).status, 401);
});

test('ukjent gammel nøkkel: secretMismatch før gjenoppretting, og 2FA slås av for de berørte når valgt', async () => {
  useSecret(X);
  let bid, olaKey;
  try {
    const XA = client(await login('sebastian', 'testpassord1'));
    const O = client(await login('ola', 'olaPassord123'));
    olaKey = (await enable2fa(O)).key;
    bid = await backup(XA);
    assert.equal(JSON.parse(readFileSync(join(BDIR, `${bid}.json`), 'utf8')).secret.source, 'env');
  } finally { useSecret(S); }
  assert.equal((await job(bid)).secretMismatch, true);

  // Samme fil lastet opp fra PC-en: opplastingssvaret har flagget.
  const dl = await A(`/api/backup/${bid}/download`);
  assert.equal(dl.status, 200);
  for (const f of readdirSync(BDIR)) if (f.startsWith(bid)) rmSync(join(BDIR, f));
  db.prepare('DELETE FROM backup_jobs WHERE id=?').run(bid);
  const up = await app.request('/api/backup/upload', { method: 'POST', body: dl.buf, headers: { cookie: (await login('sebastian', 'testpassord1')), 'content-type': 'application/octet-stream', 'x-backup-filename': 'fra-gammel-server.tar.gz', 'x-upload-size': String(dl.buf.length) } });
  const ub = await up.json();
  assert.equal(up.status, 200, JSON.stringify(ub));
  assert.equal(ub.secretMismatch, true);
  assert.equal((await job(ub.id)).secretMismatch, true);

  assert.equal((await A('/api/backup/restore', 'POST', { id: ub.id, password: 'testpassord1', disable2fa: 'ja' })).status, 400);
  // Uten å slå av: ola har 2FA på, men nøkkelen kan ikke leses → klar melding, ingen innlogging.
  const keep = await A('/api/backup/restore', 'POST', { id: ub.id, password: 'testpassord1', disable2fa: false });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));
  assert.deepEqual(keep.body.secret.unreadable.totp, ['ola']);
  assert.ok(keep.body.messages.some((m) => /Den gamle nøkkelen er ukjent/.test(m)));
  assert.ok(keep.body.messages.some((m) => /kan ikke leses for ola \(2FA ble ikke slått av\)/.test(m)));
  assert.equal(userRow('ola').totp_enabled, 1);
  resetStep('ola');
  const no = await login2fa('ola', 'olaPassord123', totp.totpNow(olaKey));
  assert.equal(no.status, 409); assert.equal(no.session, false);
  // kari ble kryptert med dagens nøkkel før backupen og kan fortsatt leses.
  assert.equal(auth.totpReadable(userRow('kari').id), true);

  // Standard (valget på): 2FA slås av for ola, som så logger inn med passord.
  const off = await A('/api/backup/restore', 'POST', { id: ub.id, password: 'testpassord1' });
  assert.equal(off.status, 200);
  assert.deepEqual(off.body.secret.disabled2fa, ['ola']);
  assert.ok(off.body.messages.some((m) => /Tofaktor er slått av for denne brukeren/.test(m)));
  assert.equal(userRow('ola').totp_enabled, 0);
  assert.equal(userRow('ola').totp_secret_enc, null);
  assert.equal(userRow('kari').totp_enabled, 1, 'brukere med lesbar nøkkel beholder 2FA');
  await login('ola', 'olaPassord123');
});

const runScript = (name, args = []) => spawnSync(process.execPath, [join('scripts', name), ...args], {
  env: { ...process.env, DATA_DIR: DATA, BACKUP_DIR: BDIR, NODE_ENV: 'test', SESSION_SECRET: S }, encoding: 'utf8', timeout: 60_000 });

test('scripts/reset-2fa.js slår av 2FA for én bruker (bare på serveren)', async () => {
  const O = client(await login('ola', 'olaPassord123'));
  const { key } = await enable2fa(O);
  db.prepare('UPDATE users SET totp_secret_enc=? WHERE username=?').run(totp.encryptSecretWith(key, randomBytes(32)), 'ola');
  const pw = userRow('ola').pw_hash;
  const r = runScript('reset-2fa.js', ['ola']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tofaktor er slått av for ola \(nøkkelen kunne ikke leses/);
  assert.ok(!r.stdout.includes(S) && !r.stderr.includes(S));
  assert.equal(userRow('ola').totp_enabled, 0);
  assert.equal(userRow('ola').pw_hash, pw, 'passordet endres ikke');
  const miss = runScript('reset-2fa.js', ['finnesikke']);
  assert.equal(miss.status, 1);
  assert.match(miss.stderr, /Fant ikke brukeren/);
  assert.match(readFileSync('package.json', 'utf8'), /"reset-2fa": "node scripts\/reset-2fa\.js"/);
});

test('scripts/rekey-secrets.js krypterer legacy-verdier i databasen på nytt (også --old-secret-file)', async () => {
  const O = client(await login('ola', 'olaPassord123'));
  const { key } = await enable2fa(O);
  const legacy = s91.ring91((l) => l), old = s91.ring91(() => X);
  db.prepare('UPDATE users SET totp_secret_enc=? WHERE username=?').run(totp.encryptSecretWith(key, legacy.totp), 'ola');
  kv.set(OWNER, 'p91_old', { a: 'enc:' + gcm('ukjent', randomBytes(32)), b: 'enc:' + gcm('fra-x', old.seal) });
  assert.equal(auth.totpReadable(userRow('ola').id), false);
  const dry = runScript('rekey-secrets.js', ['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Prøvekjøring/);
  assert.equal(auth.totpReadable(userRow('ola').id), false, 'prøvekjøring endrer ingenting');
  const r = runScript('rekey-secrets.js');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tofaktor: 1 hemmelighet er kryptert på nytt/);
  assert.match(r.stdout, /\d+ (lagret nøkkel|lagrede nøkler) .*kan ikke leses/);
  assert.equal(unseal(kv.get(OWNER, 'p91_old').b), '', 'X er ukjent uten --old-secret-file');
  assert.equal(auth.totpReadable(userRow('ola').id), true);
  assert.deepEqual(totp.decryptSecret(userRow('ola').totp_secret_enc), key);
  // Den gamle serverens session-secret-fil gjør også X-verdier lesbare.
  const f = join(DATA, 'gammel-session-secret');
  (await import('node:fs')).writeFileSync(f, X + '\n', { mode: 0o600 });
  const r2 = runScript('rekey-secrets.js', ['--old-secret-file', f]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(!r2.stdout.includes(X) && !r2.stderr.includes(X), 'hemmeligheten skrives aldri ut');
  assert.equal(unseal(kv.get(OWNER, 'p91_old').b), 'fra-x');
  assert.equal(unseal(kv.get(OWNER, 'p91_old').a), '', 'ukjent nøkkel forblir uleselig');
  assert.equal(runScript('rekey-secrets.js', ['--old-secret-file', join(DATA, 'finnes-ikke')]).status, 1);
});
