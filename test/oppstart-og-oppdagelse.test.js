// GET /api/ready (A-B9) og GET /api/discovery (A §5): offentlige ruter uten innlogging.
// - /api/ready svarer {ok, ready, version} (503 mens serveren starter), så oppstartssiden slipper en 404 per omstart.
// - /api/discovery viser serverens lokale adresse bare til klienter på lokalt nett. Adressen leses fra tilkoblingen, eller fra
//   CF-Connecting-IP når tilkoblingen kommer fra cloudflared på lokalnettet. X-Forwarded-For stoles aldri på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate } from './lib/json-schema.mjs';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-oppdagelse-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ready';
process.env.USER_NAME = 'Eier';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('eierpassord1');
const { default: app } = await import('../server/index.js');
const { kv, OWNER } = await import('../server/db.js');

const peer = (ip) => ({ incoming: { socket: { remoteAddress: ip } } });
async function get(path, { headers = {}, env } = {}) {
  const r = await app.request(path, { headers }, env);
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body, headers: r.headers };
}

test('GET /api/ready: {ok, ready, version} uten innlogging, aldri 404', async () => {
  const r = await get('/api/ready');
  assert.notEqual(r.status, 404);
  assert.ok([200, 503].includes(r.status), String(r.status));
  assert.deepEqual(Object.keys(r.body).sort(), ['ok', 'ready', 'version']);
  assert.equal(r.body.ok, r.status === 200);
  assert.equal(r.body.ok, r.body.ready);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(validate('api/ready.schema.json', r.body), []);
});

test('starting.js spør /api/ready', () => {
  const src = readFileSync(new URL('../public/js/starting.js', import.meta.url), 'utf8');
  assert.match(src, /fetch\('\/api\/ready'/);
});

test('GET /api/discovery: lokal adresse bare til klienter på lokalt nett', async () => {
  kv.set(OWNER, 'server41', { local: ['http://192.168.1.40:3000'], external: 'https://home.example.no' });
  const lan = await get('/api/discovery', { env: peer('192.168.1.20') });
  assert.equal(lan.status, 200);
  assert.deepEqual(lan.body.local, ['http://192.168.1.40:3000']);
  assert.equal(lan.body.external, 'https://home.example.no');
  assert.deepEqual(validate('api/discovery.schema.json', lan.body), []);
  for (const ip of ['10.0.0.5', '172.20.1.2', '127.0.0.1']) assert.equal((await get('/api/discovery', { env: peer(ip) })).body.local.length, 1, ip);

  // Fra internett: samme form, men ingen lokal adresse.
  const ext = await get('/api/discovery', { env: peer('8.8.4.4') });
  assert.deepEqual(Object.keys(ext.body).sort(), ['api', 'app', 'external', 'local', 'name', 'version']);
  assert.deepEqual(ext.body.local, []);
  assert.equal(ext.body.external, 'https://home.example.no');
  assert.deepEqual(validate('api/discovery.schema.json', ext.body), []);

  // Bak Cloudflare (cloudflared på lokalnettet): CF-Connecting-IP avgjør.
  assert.deepEqual((await get('/api/discovery', { env: peer('172.18.0.5'), headers: { 'cf-connecting-ip': '81.2.3.4' } })).body.local, []);
  assert.equal((await get('/api/discovery', { env: peer('172.18.0.5'), headers: { 'cf-connecting-ip': '192.168.1.30' } })).body.local.length, 1);

  // X-Forwarded-For kan klienten sette selv: gir aldri lokal adresse.
  assert.deepEqual((await get('/api/discovery', { env: peer('8.8.4.4'), headers: { 'x-forwarded-for': '192.168.1.20' } })).body.local, []);
  assert.deepEqual((await get('/api/discovery', { headers: { 'x-forwarded-for': '192.168.1.20' } })).body.local, []);
  // En direkte tilkobling fra internett kan ikke late som den kommer fra Cloudflare.
  assert.deepEqual((await get('/api/discovery', { env: peer('8.8.4.4'), headers: { 'cf-connecting-ip': '192.168.1.20' } })).body.local, []);
  kv.set(OWNER, 'server41', {});
});
