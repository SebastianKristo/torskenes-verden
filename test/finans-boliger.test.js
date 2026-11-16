import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-bol16-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/auth/password.js');
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

test('bolig «brukt» (Q21): poster til gjennomgang telles ikke, men vises som «venter»; igjen regnes fra det brukte', async () => {
  const f = await call('/folders', 'POST', { name: 'Leiligheten', type: 'Leilighet' });
  const id = f.body.id;
  assert.equal((await call(`/folders/${id}`, 'PATCH', { budget: 10000 })).status, 200);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const a = await call(`/folders/${id}/entries`, 'POST', { description: 'Maling', date: today, amount: 1200 });
  const b = await call(`/folders/${id}/entries`, 'POST', { description: 'AI-forslag', date: today, amount: 800 });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const { db } = await import('../server/finans/db.js');
  const eid = db.prepare("SELECT id FROM fh_folder_entries WHERE folder_id=? AND description='AI-forslag'").get(id).id;
  db.prepare("UPDATE fh_folder_entries SET status='review' WHERE id=?").run(eid);
  assert.equal(b.status, 200);
  const full = (await call(`/folders/${id}`)).body;
  assert.equal(full.yearTotal, 2000, 'summen av alle poster er uendret');
  assert.equal(full.spent, 1200);
  assert.deepEqual(full.pending, { count: 1, amount: 800, text: 'venter: 800 kr' });
  assert.equal(full.kpi.budgetLeft, 8800);
  assert.equal(full.kpi.over, false);
  const m = full.months.find((x) => x.month === today.slice(0, 7));
  assert.deepEqual([m.total, m.spent, m.pending], [2000, 1200, 800]);
  assert.deepEqual(full.kpi.spentByMonth.find((x) => x.month === today.slice(0, 7)), { month: today.slice(0, 7), spent: 1200, pending: 800 });
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
