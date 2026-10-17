import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-auth-'));
process.env.SESSION_SECRET = 'testsecret-testsecret-testsecret-12';
process.env.USER_NAME = 'Sebastian';
process.env.APP_PASSWORD_HASH = (await import('../server/password.js')).hashPassword('eierpassord1');
const totp = await import('../server/totp.js');
const auth = await import('../server/auth.js');
const { db } = await import('../server/db.js');

test('HOTP/TOTP stemmer med testvektorene i RFC 6238', () => {
  const key = Buffer.from('12345678901234567890');
  assert.equal(totp.hotp(key, Math.floor(59 / 30), 8), '94287082');
  assert.equal(totp.hotp(key, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(totp.hotp(key, Math.floor(2000000000 / 30), 8), '69279037');
});

test('TOTP godtar ±1 tidsvindu og avviser gjenbruk', () => {
  const key = totp.newSecret(), t = 1_700_000_000_000;
  const now = totp.hotp(key, Math.floor(t / 30000));
  const prev = totp.hotp(key, Math.floor(t / 30000) - 1);
  const old = totp.hotp(key, Math.floor(t / 30000) - 3);
  const step = totp.verifyTotp(key, now, { time: t });
  assert.ok(step > 0);
  assert.ok(totp.verifyTotp(key, prev, { time: t }) > 0);
  assert.equal(totp.verifyTotp(key, old, { time: t }), -1);
  assert.equal(totp.verifyTotp(key, now, { time: t, lastStep: step }), -1);
  assert.equal(totp.verifyTotp(key, 'abc', { time: t }), -1);
});

test('base32 og kryptering av hemmeligheten går tur-retur', () => {
  const key = totp.newSecret();
  assert.deepEqual(totp.base32Decode(totp.base32Encode(key)), key);
  const enc = totp.encryptSecret(key);
  assert.ok(!enc.includes(totp.base32Encode(key)));
  assert.deepEqual(totp.decryptSecret(enc), key);
  assert.throws(() => totp.decryptSecret(enc.slice(0, -4) + 'AAAA'));
});

test('eieren migreres som admin og kan logge inn med eller uten brukernavn', () => {
  const owner = auth.userInfo('owner');
  assert.equal(owner.role, 'admin');
  assert.equal(owner.username, 'sebastian');
  assert.equal(auth.verifyLogin('sebastian', 'eierpassord1', undefined, 'ip-a').ok, true);
  assert.equal(auth.verifyLogin('', 'eierpassord1', undefined, 'ip-a').ok, true);
  const bad = auth.verifyLogin('sebastian', 'feil', undefined, 'ip-a');
  assert.equal(bad.ok, false); assert.equal(bad.status, 401);
});

test('ny bruker med 2FA krever kode, og gjenopprettingskoder virker én gang', () => {
  const u = auth.createUser({ username: 'Ingrid', password: 'ingridpassord', role: 'bruker' });
  assert.equal(u.username, 'ingrid');
  assert.throws(() => auth.createUser({ username: 'ingrid', password: 'xxxxxxxxxx' }), /finnes allerede/);
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', undefined, 'ip-b').ok, true);

  auth.startTotpSetup(u.id);
  const pending = JSON.parse(db.prepare("SELECT value FROM kv WHERE user=? AND key='totp_pending'").get(u.id).value);
  const secret = totp.decryptSecret(pending.enc);
  assert.throws(() => auth.confirmTotpSetup(u.id, '000000'));
  const codes = auth.confirmTotpSetup(u.id, totp.totpNow(secret));
  assert.equal(codes.length, 10);

  const step1 = auth.verifyLogin('ingrid', 'ingridpassord', undefined, 'ip-c');
  assert.equal(step1.needsTotp, true);
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', '123', 'ip-c').ok, false);
  // Samme kode som ble brukt ved aktivering kan ikke brukes igjen (gjenbruk avvises).
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', totp.totpNow(secret), 'ip-c').ok, false);
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', codes[0], 'ip-d').ok, true);
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', codes[0], 'ip-d').ok, false);

  assert.throws(() => auth.disableTotp(u.id, { password: 'feil' }));
  auth.disableTotp(u.id, { password: 'ingridpassord' });
  assert.equal(auth.verifyLogin('ingrid', 'ingridpassord', undefined, 'ip-e').ok, true);
});

test('rate limiting sperrer etter 5 feil fra samme IP', () => {
  for (let i = 0; i < 5; i++) auth.verifyLogin('sebastian', 'feil' + i, undefined, 'ip-x');
  const r = auth.verifyLogin('sebastian', 'eierpassord1', undefined, 'ip-x');
  assert.equal(r.status, 429);
});

test('siste admin og hovedadmin kan ikke fjernes eller degraderes', () => {
  assert.throws(() => auth.deleteUser('owner', 'u_annen'), /Hovedadmin/);
  assert.equal(auth.userInfo('owner').isMainAdmin, true);
  assert.throws(() => auth.updateUser('owner', { role: 'bruker' }));
  const a = auth.createUser({ username: 'admin2', password: 'adminpassord', role: 'admin' });
  auth.deleteUser(a.id, 'owner');
  assert.equal(auth.userInfo(a.id), null);
});

test('brukernavn foreslås fra navnet (æ→ae, ø→o, å→a)', () => {
  assert.equal(auth.slugUsername('Kari Ødegård'), 'kariodegard');
  assert.equal(auth.slugUsername('Ærlige Åse-Marie'), 'aerligeasemarie');
  assert.equal(auth.slugUsername('  '), '');
});

test('førstegangsoppsett virker bare på en tom server, og visningsnavn kan endres', () => {
  assert.equal(auth.needsSetup(), false);
  assert.throws(() => auth.setupServer({ adminName: 'X', username: 'xx', password: 'passord123' }), /allerede satt opp/);
  const u = auth.createUser({ username: 'navnetest', password: 'passord123' });
  assert.equal(auth.updateUser(u.id, { displayName: 'Ny Navnesen' }).name, 'Ny Navnesen');
  assert.throws(() => auth.updateUser(u.id, { displayName: '  ' }), /tomt/);
  auth.deleteUser(u.id, 'owner');
});
