import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-sfirst-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const { isSimpleQuery } = await import('../server/finans/search.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
await call('/settings', 'PUT', { ollamaUrl: 'http://127.0.0.1:9', provider: 'ollama', fallback: false });
const today = new Date().toLocaleDateString('sv-SE');
db.prepare('INSERT INTO fh_transactions(date, amount, description, merchant, created) VALUES(?,?,?,?,?)').run(today, -34900, 'Biltema Alnabru', 'Biltema Alnabru', Date.now());

test('enkle søk: 1–2 ord uten spørreord og spørsmålstegn', () => {
  assert.equal(isSimpleQuery('biltema'), true);
  assert.equal(isSimpleQuery('rema 1000'), true);
  assert.equal(isSimpleQuery('biltema?'), false);
  assert.equal(isSimpleQuery('hva brukte'), false);
  assert.equal(isSimpleQuery('Hvor mye'), false);
  assert.equal(isSimpleQuery('sist biltema'), false);
  assert.equal(isSimpleQuery('kvitteringer med tomater'), false);
  assert.equal(isSimpleQuery(''), false);
});

test('AI-søk bruker vanlig søk først når det gir treff', async () => {
  const r = await call('/search/ai', 'POST', { q: 'biltema' });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'plain');
  assert.equal(r.body.plainFirst, true);
  assert.match(r.body.notice, /^Fant \d+ treff med vanlig søk, så AI ble ikke brukt$/);
  assert.ok(r.body.hits.length >= 1);
});

test('force og spørsmål går til AI (som her ikke svarer, og faller tilbake uten plainFirst)', async () => {
  for (const body of [{ q: 'biltema', force: true }, { q: 'hva kjøpte jeg på biltema?' }, { q: 'finnesikke' }]) {
    const r = await call('/search/ai', 'POST', body);
    assert.ok(r.body?.plainFirst !== true, JSON.stringify(body));
  }
});
