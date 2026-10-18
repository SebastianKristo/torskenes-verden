import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-tx-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const J = { ...H, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: body instanceof FormData ? H : J, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const acc = (await call('/accounts', 'POST', { name: 'Brukskonto', bank: 'DNB', type: 'checking' })).body;

test('CSV-import lagrer bankraden uendret, og /original viser den', async () => {
  const fd = new FormData();
  fd.set('accountId', String(acc.id)); fd.set('profile', 'DNB');
  fd.set('file', new File(['Dato;Forklaring;Rentedato;Ut fra konto;Inn på konto;Arkivref\n15.10.2026;VARER 1234 REMA 1000 BISLETT Dato 15.10;16.10.2026;386,50;;12345678\n'], 'konto.csv', { type: 'text/csv' }));
  const r = await call('/import/csv', 'POST', fd);
  assert.equal(r.status, 200); assert.equal(r.body.added, 1);
  const t = db.prepare("SELECT * FROM fh_transactions WHERE source='csv'").get();
  assert.equal(t.merchant, 'Rema 1000 Bislett');
  const o = (await call(`/transactions/${t.id}/original`)).body;
  assert.equal(o.receipt, null);
  assert.equal(o.bankRow.description, 'VARER 1234 REMA 1000 BISLETT Dato 15.10');
  assert.equal(o.bankRow.valueDate, '16.10.2026');
  assert.equal(o.bankRow.archiveReference, '12345678');
  assert.equal(o.bankRow.amount, -386.5);
  assert.equal(o.bankRow.account, 'Brukskonto');
  assert.equal(o.bankRow.bank, 'DNB');
  assert.equal(o.bankRow.source, 'CSV · DNB');
  assert.equal(o.bankRow.raw['Ut fra konto'], '386,50');
  const list = (await call('/transactions')).body.items;
  assert.equal(list.find((x) => x.id === t.id).hasBankRow, true);
});

test('Innlimt tekst lagrer bankraden med kilde', async () => {
  const fd = new FormData();
  fd.set('accountId', String(acc.id));
  fd.set('text', 'Dato\tForklaring\tRentedato\tUt\tInn\n10/14/26\tVisa 100021 Ruterappen\t10/15/26\t238.00\t\n');
  const r = await api.request('/import?commit=1', { method: 'POST', headers: H, body: fd });
  assert.equal((await r.json()).imported, 1);
  const t = db.prepare("SELECT * FROM fh_transactions WHERE source='import'").get();
  assert.equal(t.description, 'Ruterappen');
  const bank = JSON.parse(t.raw_bank_row);
  assert.equal(bank.description, 'Visa 100021 Ruterappen');
  assert.equal(bank.source, 'Innlimt tekst');
  assert.equal(bank.valueDate, '10/15/26');
});

test('Transaksjoner: legg til med type, rediger felt og mappe, slett overalt', async () => {
  const folder = (await call('/folders', 'POST', { name: 'Hytta', type: 'Hytte' })).body;
  const folderId = folder.id ?? folder.folder?.id;
  assert.ok(folderId);
  const add = await call('/transactions', 'POST', { type: 'expense', description: 'Snekker Hansen', amount: 2500, date: '2026-10-10', accountId: acc.id, note: 'Terrasse', folderId });
  assert.equal(add.status, 200);
  const t = add.body;
  assert.equal(t.amount, -2500); assert.equal(t.type, 'expense'); assert.equal(t.note, 'Terrasse'); assert.equal(t.folderId, folderId); assert.equal(t.folder, 'Hytta');
  assert.equal(db.prepare('SELECT amount FROM fh_folder_entries WHERE tx_id=?').get(t.id).amount, 250000);

  const ed = (await call(`/transactions/${t.id}`, 'PATCH', { type: 'income', amount: '1 200,50', description: 'Refusjon snekker', folderId: null })).body;
  assert.equal(ed.amount, 1200.5); assert.equal(ed.type, 'income'); assert.equal(ed.description, 'Refusjon snekker'); assert.equal(ed.folderId, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fh_folder_entries WHERE tx_id=?').get(t.id).n, 0);

  // Bare type: fortegnet snus, beløpet beholdes.
  assert.equal((await call(`/transactions/${t.id}`, 'PATCH', { type: 'expense' })).body.amount, -1200.5);
  assert.equal((await call(`/transactions/${t.id}`, 'PATCH', { folderId: 999999 })).status, 400);
  assert.equal((await call(`/transactions/${t.id}`, 'PATCH', { type: 'tull' })).status, 400);

  await call(`/transactions/${t.id}`, 'PATCH', { folderId });
  assert.equal((await call(`/transactions/${t.id}`, 'DELETE')).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fh_transactions WHERE id=?').get(t.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM fh_folder_entries WHERE tx_id=?').get(t.id).n, 0);
  assert.equal((await call(`/transactions/${t.id}/original`)).status, 404);
});

test('Legg ved kvittering på en transaksjon kobler den til med en gang', async () => {
  const t = (await call('/transactions', 'POST', { type: 'expense', description: 'Biltema', amount: 199, date: '2026-10-12', accountId: acc.id })).body;
  const fd = new FormData();
  fd.set('file', new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'kvittering.png', { type: 'image/png' }));
  const r = await call(`/transactions/${t.id}/receipt`, 'POST', fd);
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT transaction_id FROM fh_receipts WHERE id=?').get(r.body.id).transaction_id, t.id);
  const o = (await call(`/transactions/${t.id}/original`)).body;
  assert.equal(o.receipt.id, r.body.id);
  assert.match(o.receipt.fileUrl, /\/finans\/api\/receipts\/.+\/file$/);
  assert.equal((await call('/transactions/999999/receipt', 'POST', fd)).status, 404);
});

test('AI-søk: tidligere spørsmål lagres per bruker uten duplikater', async () => {
  await call('/search/ai', 'POST', { q: 'Mat i oktober' });
  await call('/search/ai', 'POST', { q: 'kaffe' });
  const r = await call('/search/ai', 'POST', { q: 'mat i oktober' });
  assert.deepEqual(r.body.history, ['mat i oktober', 'kaffe']);
  assert.deepEqual((await call('/search/history')).body, ['mat i oktober', 'kaffe']);
  assert.deepEqual((await call('/search/history?q=kaffe', 'DELETE')).body, ['mat i oktober']);
  assert.deepEqual((await call('/search/history', 'DELETE')).body, []);
});

test('Sidemeny: skjulte punkter, Oversikt og Innstillinger kan ikke skjules, nye sider legges til', async () => {
  const r = (await call('/prefs', 'PUT', { nav: ['inn', 'tx', 'ov'], hidden: ['ov', 'finn', 'imp', 'rap'] })).body;
  // Import er ikke lenger et menypunkt (ligger under Innstillinger → Import), så det faller bort også fra skjulte.
  assert.deepEqual(r.hidden, ['finn', 'rap']);
  assert.deepEqual(r.nav.slice(0, 3), ['inn', 'tx', 'ai']);
  assert.ok(!r.nav.includes('imp') && r.nav.includes('ov') && !r.nav.includes('mat'));
  assert.equal(new Set(r.nav).size, r.nav.length);
});

test('/me har servernavn og profilbilde-felt', async () => {
  const me = (await call('/me')).body;
  assert.equal(typeof me.serverName, 'string');
  assert.ok('avatarUrl' in me);
});
