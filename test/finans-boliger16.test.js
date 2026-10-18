import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-bol16-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: api } = await import('../server/finans/routes.js');
const B = await import('../server/finans/boliger.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => { const r = await api.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

test('forfall: ISO, dd.mm og neste år', () => {
  const t = new Date('2026-10-18T12:00');
  assert.equal(B.dueDate('2026-12-01', t), '2026-12-01');
  assert.equal(B.dueDate('15.11', t), '2026-11-15');
  assert.equal(B.dueDate('01.02', t), '2027-02-01');
  assert.equal(B.dueDate('kvartalsvis', t), null);
  const up = B.upcomingOf({ bills: [{ id: 1, category: 'Strøm', name: 'Fjordkraft', freq: 'Månedlig', nextDue: '20.10', last: { amount: 900 }, color: '#F2C14E' }],
    projects: [{ id: 2, name: 'Terrasse', vendor: 'Snekker', color: '#FF7A3D', installments: [{ id: 3, label: 'Avdrag 1', due: '2026-10-25', amount: 5000, paid: false }, { id: 4, label: 'Betalt', due: '2026-10-19', amount: 1, paid: true }] }] }, { today: t });
  assert.deepEqual(up.map((x) => [x.kind, x.date, x.days]), [['bill', '2026-10-20', 2], ['installment', '2026-10-25', 7]]);
});

test('boligen gir kommende forfall og kvitteringsliste; kvitteringsbilde bare for poster i boligen', async () => {
  const f = await call('/folders', 'POST', { name: 'Hytta', type: 'Hytte' });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  const id = f.body.id;
  await call(`/folders/${id}/bills`, 'POST', { name: 'Fjordkraft', category: 'Strøm', freq: 'Månedlig', nextDue: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) });
  const full = await call(`/folders/${id}`);
  assert.ok(Array.isArray(full.body.upcoming));
  assert.equal(full.body.upcoming[0].kind, 'bill');
  assert.ok(Array.isArray(full.body.receipts));
  assert.equal((await call(`/folders/${id}/receipts/999/thumb`)).status, 404);
});
