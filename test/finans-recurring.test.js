// Faste utgifter (/finans/api/recurring): serveren regner ut beløpet per måned (`monthly`), så web og PWA viser det
// serveren sender i stedet for å regne om årlige og ukentlige trekk selv (CLAUDE.md: logikk hører hjemme på serveren).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-recurring-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-rec';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: api } = await import('../server/finans/routes.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('faste utgifter: monthly er beløpet per måned for månedlige, årlige og ukentlige trekk', async () => {
  const m = await call('/recurring', 'POST', { name: 'Husleie', amount: 12000, interval: 'monthly', day: 1 });
  const y = await call('/recurring', 'POST', { name: 'Forsikring', amount: 6000, interval: 'yearly', day: 15, month: 3 });
  const w = await call('/recurring', 'POST', { name: 'Avis', amount: 30, interval: 'weekly', day: 1 });
  for (const r of [m, y, w]) assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(m.body.monthly, 12000);
  assert.equal(y.body.monthly, 500);
  assert.equal(w.body.monthly, 130); // 30 × 52 / 12
  const list = await call('/recurring');
  assert.equal(list.status, 200);
  const by = Object.fromEntries(list.body.map((r) => [r.name, r.monthly]));
  assert.deepEqual(by, { Husleie: 12000, Forsikring: 500, Avis: 130 });
  // Endret intervall gir ny omregning.
  const p = await call(`/recurring/${y.body.id}`, 'PATCH', { interval: 'monthly' });
  assert.equal(p.body.monthly, 6000);
});

test('faste utgifter: monthly avrundes til hele øre', async () => {
  const r = await call('/recurring', 'POST', { name: 'Strøm', amount: 1000, interval: 'yearly', day: 2, month: 1 });
  assert.equal(r.body.monthly, 83.33);
});
