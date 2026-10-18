// Prompt 23: ↺ i Bokført sender kvitteringen tilbake til gjennomgang (POST /finans/api/receipts/:id/unbook).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-unbook-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/db.js');
const { default: fin } = await import('../server/finans/routes.js');

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const post = (p) => fin.request(p, { method: 'POST', headers: H });
const now = Date.now();

test('angre bokføring fjerner transaksjonen bokføringen lagde, og kvitteringen går til gjennomgang', async () => {
  db.prepare("INSERT INTO fh_receipts(id,mime,status,merchant,date,total,created,user_id) VALUES('u1','image/jpeg','needs_review','Rema 1000','2026-10-17',34250,?,'owner')").run(now);
  const booked = await (await post('/receipts/u1/book')).json();
  assert.equal(booked.status, 'booked');
  const txId = db.prepare("SELECT transaction_id t FROM fh_receipts WHERE id='u1'").get().t;
  assert.ok(db.prepare('SELECT 1 FROM fh_transactions WHERE id=?').get(txId));
  const r = await post('/receipts/u1/unbook');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'needs_review');
  assert.equal(db.prepare('SELECT 1 FROM fh_transactions WHERE id=?').get(txId), undefined);
  assert.equal(db.prepare("SELECT transaction_id t FROM fh_receipts WHERE id='u1'").get().t, null);
  // Kan bokføres på nytt.
  assert.equal((await (await post('/receipts/u1/book')).json()).status, 'booked');
});

test('angre bokføring beholder en banktransaksjon kvitteringen var koblet til', async () => {
  const tx = db.prepare("INSERT INTO fh_transactions(date,amount,description,source,created,user_id) VALUES('2026-10-16',-19900,'KIWI 123','bank',?,'owner') RETURNING id").get(now).id;
  db.prepare("INSERT INTO fh_receipts(id,mime,status,merchant,date,total,transaction_id,created,user_id) VALUES('u2','image/jpeg','booked','Kiwi','2026-10-16',19900,?,?,'owner')").run(tx, now);
  const r = await post('/receipts/u2/unbook');
  assert.equal(r.status, 200);
  assert.ok(db.prepare('SELECT 1 FROM fh_transactions WHERE id=?').get(tx));
  assert.equal(db.prepare("SELECT status FROM fh_receipts WHERE id='u2'").get().status, 'needs_review');
});

test('angre på en kvittering som ikke er bokført gir 400', async () => {
  db.prepare("INSERT INTO fh_receipts(id,mime,status,created,user_id) VALUES('u3','image/jpeg','needs_review',?,'owner')").run(now);
  assert.equal((await post('/receipts/u3/unbook')).status, 400);
});
