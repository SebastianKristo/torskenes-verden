// CSV-eksport av transaksjoner (GET /finans/api/transactions.csv): dekker det Android-appen i dag bygger selv
// (AppViewModel.exportCsv: Dato;Beskrivelse;Beløp;Kategori;Konto;Notat), uten appens tak på 2000 rader (/transactions?limit
// er maks 2000), med samme filtre som lista. Fase 5 bytter appen over til serverens fil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TZ = 'Europe/Oslo';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-csv-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-csv1';
process.env.NODE_ENV = 'test';

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: finansApi } = await import('../server/finans/routes.js');
const { db } = await import('../server/finans/db.js');

const login = await finansApi.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'csv' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => { const r = await finansApi.request(path, { method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, text: await r.text() }; };

test('transactions.csv: alle kolonnene Android eksporterer, alle rader og samme filtre som lista', async () => {
  const acc = JSON.parse((await call('/accounts', 'POST', { name: 'Brukskonto', type: 'checking', balance: 0 })).text);
  assert.ok(acc.id, 'konto');
  const user = db.prepare('SELECT user_id FROM fh_accounts WHERE id=?').get(acc.id).user_id;
  const ins = db.prepare('INSERT INTO fh_transactions(account_id, date, description, amount, note, user_id, created) VALUES(?,?,?,?,?,?,?)');
  db.transaction(() => { for (let i = 0; i < 2100; i++) ins.run(acc.id, `2026-${String(1 + (i % 12)).padStart(2, '0')}-15`, `Kjøp ${i}; «test»`, -(1000 + i), i === 0 ? 'notat med "anførsel"' : '', user, Date.now()); })();
  const r = await call('/transactions.csv');
  assert.equal(r.status, 200);
  const lines = r.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  const head = lines[0].split(';');
  for (const k of ['Dato', 'Beskrivelse', 'Beløp', 'Kategori', 'Konto', 'Notat']) assert.ok(head.includes(k), `kolonnen ${k}`);
  assert.equal(lines.length - 1, 2100, 'ingen grense på 2000 rader');
  assert.match(r.text, /"Kjøp 0; «test»"/, 'semikolon i teksten gir anførselstegn');
  assert.match(r.text, /"notat med ""anførsel"""/);
  assert.match(r.text, /;-10,00;/, 'beløp med komma og fortegn');
  const mars = await call('/transactions.csv?from=2026-03-01&to=2026-04-01');
  assert.equal(mars.text.trim().split('\r\n').length - 1, 175, 'samme filtre som /transactions'); // 2100 / 12
});
