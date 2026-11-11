// Prompt 85 (SRVSEC85): feil i kroppen gir 400 (ikke 500 og krasjrapport), store kropper tas bare imot fra innloggede klienter,
// arvede objektnavn («constructor», «__proto__») er ikke gyldige nøkler, og servernavnet må være tekst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p85sec-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-85s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLITCHTIP_DSN;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const auth = await import('../server/auth.js');
const { ANON_BODY_MAX85 } = await import('../server/anonbody85.js');

const LAN = { incoming: { socket: { remoteAddress: '192.168.1.20' } } };
const raw = (path, method, body, headers = {}) => app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body }, LAN);
async function login(username, password) {
  const r = await raw('/api/login', 'POST', JSON.stringify({ username, password }));
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
}
auth.createUser({ username: 'per85', password: 'passord-per-85', name: 'Per' });
const admin = await login('sebastian', 'testpassord1');
const per = await login('per85', 'passord-per-85');

test('uten innlogging: kroppen «null» og ugyldig JSON til innloggingen gir 400/401, aldri 500', async () => {
  const origErr = console.error; const logged = []; console.error = (...a) => logged.push(a);
  try {
    for (const path of ['/api/login', '/api/auth/login', '/finans/api/login', '/finans/api/auth/token']) {
      for (const body of ['null', '5', '"x"', '{"a":']) {
        const r = await raw(path, 'POST', body);
        assert.ok(r.status >= 400 && r.status < 500, `${path} ${body} → ${r.status}`);
      }
    }
  } finally { console.error = origErr; }
  assert.equal(logged.length, 0, 'feil inndata skal ikke fylle feilloggen');
});

test('innlogget: ugyldig JSON og kropp som ikke er et objekt gir 400 med forklaring', async () => {
  const origErr = console.error; console.error = () => {};
  try {
    let r = await raw('/finans/api/accounts', 'POST', '{"a":', { cookie: per });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /JSON/);
    r = await raw('/finans/api/accounts', 'POST', 'null', { cookie: per });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /JSON-objekt/);
    r = await raw('/api/tasks', 'POST', '"tekst"', { cookie: per });
    assert.equal(r.status, 400);
    r = await raw('/api/me/notify', 'PUT', '5', { cookie: per });
    assert.equal(r.status, 400);
    // En gyldig forespørsel virker som før.
    r = await raw('/finans/api/accounts', 'POST', JSON.stringify({ name: 'P85-konto' }), { cookie: per });
    assert.equal(r.status, 200);
  } finally { console.error = origErr; }
});

test('badInput85: ekte serverfeil er fortsatt 500', async () => {
  const { badInput85 } = await import('../server/badinput85.js');
  const ctx = (method, text, ct = 'application/json') => ({ req: { method, bodyCache: text === undefined ? {} : { text: Promise.resolve(text) }, header: () => ct }, json: (b, s) => ({ b, s }) });
  assert.equal(await badInput85(new TypeError('x is not a function'), ctx('POST', '{"a":1}')), null, 'gyldig objekt + TypeError = serverfeil');
  assert.equal(await badInput85(new Error('db'), ctx('POST', 'null')), null, 'andre feiltyper = serverfeil');
  assert.equal(await badInput85(new TypeError('x'), ctx('GET', 'null')), null);
  assert.equal(await badInput85(new TypeError('x'), ctx('POST', undefined)), null, 'kroppen ble aldri lest');
  assert.equal(await badInput85(new SyntaxError('Unexpected token'), ctx('POST', '{"a":1}')), null, 'gyldig kropp + SyntaxError et annet sted = serverfeil');
  assert.equal((await badInput85(new TypeError("Cannot read properties of null (reading 'name')"), ctx('POST', 'null'))).s, 400);
  assert.equal((await badInput85(new SyntaxError('Unexpected end of JSON input'), ctx('POST', '{"a":'))).s, 400);
});

test('store kropper: uinnlogget stoppes ved 1 MB (også med tullete cookie/token), innlogget slipper gjennom', async () => {
  const big = JSON.stringify({ username: 'x', password: 'A'.repeat(ANON_BODY_MAX85 + 10) });
  const len = String(Buffer.byteLength(big));
  for (const path of ['/api/login', '/api/tasks', '/api/assist', '/api/receipts/scan', '/api/homes/1/expenses', '/finans/api/login', '/api/apps/kalender/log']) {
    let r = await raw(path, 'POST', big, { 'content-length': len });
    assert.equal(r.status, 413, `${path} uten innlogging`);
    r = await raw(path, 'POST', big, { 'content-length': len, cookie: 'hl_sid=tull', authorization: 'Bearer fh_pat_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.equal(r.status, 413, `${path} med ugyldig cookie og token`);
  }
  // Innlogget: grensen gjelder ikke (ruten svarer selv – her 400 fordi tittelen mangler, ikke 413).
  const r = await raw('/api/tasks', 'POST', JSON.stringify({ note: 'A'.repeat(ANON_BODY_MAX85 + 10) }), { cookie: per, 'content-length': String(ANON_BODY_MAX85 + 30) });
  assert.notEqual(r.status, 413);
  // Vanlig, liten forespørsel uten innlogging er urørt.
  const small = JSON.stringify({ events: [{ event: 'p85.test', ms: 5 }] });
  const ok = await raw('/api/apps/kalender/log', 'POST', small);
  assert.equal(ok.status, 200);
  // Uten oppgitt lengde (chunked) telles kroppen mens den leses: liten går gjennom, stor stoppes.
  const chunk = await raw('/api/apps/kalender/log', 'POST', small, { 'transfer-encoding': 'chunked' });
  assert.equal(chunk.status, 200);
  assert.deepEqual(await chunk.json(), { ok: true, n: 1 });
  const bigChunk = await raw('/api/apps/kalender/log', 'POST', big, { 'transfer-encoding': 'chunked' });
  assert.equal(bigChunk.status, 413);
});

test('arvede objektnavn er ikke gyldige nøkler i innstillinger', async () => {
  const origErr = console.error; console.error = () => {};
  try {
    for (const [path, method] of [['/api/ui', 'PUT'], ['/api/me/layout', 'PUT'], ['/api/kalender/calendars/prefs', 'PUT']]) {
      for (const body of ['{"constructor":{"a":1}}', '{"__proto__":{"a":1}}', '{"toString":"x"}']) {
        const r = await raw(path, method, body, { cookie: per });
        assert.equal(r.status, 400, `${method} ${path} ${body} → ${r.status}`);
      }
    }
    const ui = await (await app.request('/api/ui', { headers: { cookie: per } }, LAN)).json();
    assert.ok(!Object.hasOwn(ui, 'constructor') && !Object.hasOwn(ui, 'toString'));
  } finally { console.error = origErr; }
});

test('servernavnet må være tekst', () => {
  assert.throws(() => auth.setServerName({ a: 1 }), /navn/);
  assert.throws(() => auth.setServerName(['x']), /navn/);
  assert.equal(auth.setServerName('  Hjemme  '), 'Hjemme');
  assert.equal(auth.serverName(), 'Hjemme');
});

test('vanlig bruker når ikke serveroppsett, AI-nøkler eller backup', async () => {
  const get = ['/api/backup/list', '/api/system/update', '/api/system/logs', '/api/system/containers', '/api/ops51/summary', '/finans/api/ai/gemini-keys', '/api/integrations/ai', '/api/integrations/ha', '/api/security51/limits'];
  for (const p of get) assert.equal((await app.request(p, { headers: { cookie: per } }, LAN)).status, 403, p);
  for (const p of get) assert.equal((await app.request(p, {}, LAN)).status, 401, `${p} uten innlogging`);
  let r = await raw('/api/ai/keys/gemini', 'PUT', JSON.stringify({ key: 'AIzaP85-ikke-ekte-0123456789' }), { cookie: per });
  assert.equal(r.status, 403);
  r = await raw('/api/config', 'PUT', JSON.stringify({ ha_token: 'x' }), { cookie: per });
  assert.equal(r.status, 403);
  // Nøkler vises aldri i klartekst, heller ikke for admin.
  await raw('/api/ai/keys/gemini', 'PUT', JSON.stringify({ key: 'AIzaP85HEMMELIG0123456789abcdefghij' }), { cookie: admin });
  for (const ck of [admin, per]) for (const p of ['/api/ai/keys', '/api/integrations', '/api/config', '/api/state', '/finans/api/settings']) {
    const t = await (await app.request(p, { headers: { cookie: ck } }, LAN)).text();
    assert.ok(!t.includes('P85HEMMELIG'), `${p} lekker nøkkelen`);
  }
});

test('hjelpeteksten for hemmeligheter peker på riktig tjeneste i docker-compose.yml', () => {
  const src = readFileSync(new URL('../server/sec51.js', import.meta.url), 'utf8');
  const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /^services:\n\s+os:/m);
  assert.ok(!/compose up -d homelab/.test(src));
  assert.match(src, /compose up -d os/);
});
