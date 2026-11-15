// Kontrakttest (Fase 2): henter svarene fra serveren med eksempeldata (MOCK_DATA=1, samme app som test/e2e51/server.mjs) og
// validerer dem mot skjemaene i shared/schemas. Endepunktene står i shared/schemas/endpoints.json.
import './lib/day-clock.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate, loadSchema, SCHEMA_DIR } from './lib/json-schema.mjs';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-kontrakt-schema-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-schemas';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const INDEX = JSON.parse(readFileSync(join(SCHEMA_DIR, 'endpoints.json'), 'utf8'));
const CREDS = { username: 'sebastian', password: 'testpassord1' };

let ipN = 1;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `203.0.113.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, body: json, text, headers: r.headers };
}
const login = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.251' }, body: JSON.stringify(CREDS) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const token = (await req('/finans/api/login', { method: 'POST', body: { ...CREDS, deviceName: 'Kontrakttest' } })).body.token;

test('alle skjemaene er gyldig JSON med $schema 2020-12, $id og tittel, og alle $ref finnes', () => {
  const files = [];
  const walk = (d, rel = '') => { for (const n of readdirSync(join(SCHEMA_DIR, rel))) { const r = rel ? `${rel}/${n}` : n; if (!n.includes('.')) walk(d, r); else if (n.endsWith('.schema.json')) files.push(r); } };
  walk(SCHEMA_DIR);
  assert.ok(files.length >= 15, `fant ${files.length} skjemaer`);
  for (const f of files) {
    const { schema } = loadSchema(f);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', f);
    assert.ok(schema.$id && schema.title, `${f}: mangler $id/title`);
    // Alle $ref løses (validering av en tom verdi går gjennom alle grener uten å kaste).
    const refs = JSON.stringify(schema).match(/"\$ref":"[^"]+"/g) ?? [];
    for (const r of refs) { const ref = JSON.parse(`{${r}}`).$ref; assert.doesNotThrow(() => validate(f, { probe: ref }), `${f}: ${ref}`); }
  }
  for (const e of INDEX.endpoints) assert.ok(files.includes(e.schema), `endpoints.json: ${e.schema} finnes ikke`);
});

for (const e of INDEX.endpoints) {
  for (const via of e.auth === 'none' ? ['ingen'] : ['økt', 'token']) {
    test(`${e.method} ${e.path} (${via}) følger ${e.schema}`, async () => {
      const headers = via === 'økt' ? { cookie } : via === 'token' ? { authorization: `Bearer ${token}` } : {};
      const body = e.method === 'POST' && e.path === '/finans/api/login' ? { ...CREDS, deviceName: 'Kontrakttest 2' } : undefined;
      const r = await req(e.path, { method: e.method, headers, body });
      assert.equal(r.status, 200, `${e.path}: ${r.text.slice(0, 200)}`);
      const errs = validate(e.schema, r.body);
      assert.deepEqual(errs, [], `${e.path} avviker fra ${e.schema}`);
    });
  }
}

test('feilsvar følger common/error.schema.json (404, 401, utløpt token, mislykket innlogging)', async () => {
  const cases = [
    ['/api/finnesikke', { cookie }, 404, 'NOT_FOUND'],
    ['/finans/api/finnesikke', { cookie }, 404, 'NOT_FOUND'],
    ['/finans/api/transactions/999999', { cookie }, 404, null],
    ['/api/tasks/999999', { cookie }, 404, null],
    ['/api/finnesikke', { authorization: `Bearer ${token}` }, 404, 'NOT_FOUND'],
    ['/api/me', {}, 401, 'HOMELAB_AUTH'],
    ['/finans/api/summary', {}, 401, 'HOMELAB_AUTH'],
    ['/api/kalender', { authorization: 'Bearer fh_pat_ugyldigugyldigugyldigugyldig' }, 401, 'HOMELAB_AUTH'],
  ];
  for (const [path, headers, status, code] of cases) {
    const r = await req(path, { headers });
    assert.equal(r.status, status, `${path}: ${r.text.slice(0, 120)}`);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/, path);
    assert.deepEqual(validate('common/error.schema.json', r.body), [], `${path}: ${r.text}`);
    if (code) assert.equal(r.body.code, code, path);
  }
  const bad = await req('/finans/api/login', { method: 'POST', body: { username: 'sebastian', password: 'feil' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'LOGIN_FAILED');
  assert.deepEqual(validate('common/error.schema.json', bad.body), []);
});

test('Penger og Tidspunkt: amountOre = amount × 100, ISO-feltene er de samme tidspunktene som ms-feltene', async () => {
  const tx = (await req('/finans/api/transactions?limit=50', { headers: { cookie } })).body.items;
  assert.ok(tx.length > 0);
  for (const t of tx) { assert.ok(Number.isInteger(t.amountOre)); assert.equal(t.amountOre, Math.round(t.amount * 100)); }
  const subs = (await req('/finans/api/subscriptions', { headers: { cookie } })).body.items;
  assert.ok(subs.length > 0);
  for (const s of subs) assert.equal(s.priceOre, Math.round(s.price * 100));
  const tasks = (await req('/api/tasks', { headers: { cookie } })).body.items;
  assert.ok(tasks.length > 0);
  for (const t of tasks) if (t.updatedAt) assert.equal(new Date(t.updatedAtIso).getTime(), t.updatedAt);
  const toks = (await req('/finans/api/tokens', { headers: { cookie } })).body;
  for (const t of toks) if (t.expires) assert.equal(new Date(t.expiresAt).getTime(), t.expires);
});

test('felles typer: dato, tidspunkt, penger og side', () => {
  const t = (def, x) => validate('common/types.schema.json', x, `#/$defs/${def}`);
  assert.deepEqual(t('date', '2026-11-15'), []);
  assert.notDeepEqual(t('date', '15.11.2026'), []);
  assert.notDeepEqual(t('date', '2026-13-01'), []);
  assert.deepEqual(t('month', '2026-11'), []);
  assert.deepEqual(t('timestamp', '2026-11-15T09:30:00.000Z'), []);
  assert.deepEqual(t('timestamp', '2026-11-15T10:30:00+01:00'), []);
  assert.notDeepEqual(t('timestamp', '2026-11-15T10:30:00'), [], 'uten sone er ikke gyldig');
  assert.deepEqual(t('money', { ore: -128450, kroner: -1284.5 }), []);
  assert.notDeepEqual(t('money', { ore: 12.5, kroner: 0.125 }), [], 'øre er heltall');
  assert.deepEqual(t('page', { items: [1, 2], nextCursor: null }), []);
  assert.deepEqual(t('page', { items: [], nextCursor: 'abc' }), []);
  assert.notDeepEqual(t('page', { items: [] }), []);
  assert.deepEqual(validate('common/error.schema.json', { error: 'Intern feil', code: 'INTERNAL_ERROR' }, '#/$defs/internal'), []);
  assert.notDeepEqual(validate('common/error.schema.json', { error: 'Ikke innlogget', code: 'HOMELAB_AUTH' }), [], '401 uten reason');
});
