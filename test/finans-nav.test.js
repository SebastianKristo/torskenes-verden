import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-nav-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: api } = await import('../server/finans/routes.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('Sidemenyen har Matplan og Boliger-ID-en dir som standard', async () => {
  const r = (await call('/prefs')).body;
  assert.ok(r.navDefault.includes('mat'));
  assert.ok(r.navDefault.includes('dir'));
  assert.deepEqual(r.labels, {});
});

test('Egne navn lagres, renses og kan tilbakestilles', async () => {
  const long = 'Et veldig langt navn som er over tretti tegn';
  const r = (await call('/prefs', 'PUT', { labels: { dir: '  Boligene  våre ', tx: long, nope: 'x', ov: '   ', inn: 42 } })).body;
  assert.equal(r.labels.dir, 'Boligene våre');
  assert.equal(r.labels.tx, long.slice(0, 30));
  assert.ok(!('nope' in r.labels));
  assert.ok(!('ov' in r.labels));
  assert.ok(!('inn' in r.labels));
  const boot = (await call('/bootstrap')).body;
  assert.equal(boot.navLabels.dir, 'Boligene våre');
  // Rekkefølge og skjulte punkter berøres ikke når bare navnene endres.
  const r2 = (await call('/prefs', 'PUT', { hidden: ['finn'] })).body;
  assert.equal(r2.labels.dir, 'Boligene våre');
  assert.deepEqual(r2.hidden, ['finn']);
  const r3 = (await call('/prefs', 'PUT', { labels: null })).body;
  assert.deepEqual(r3.labels, {});
});
