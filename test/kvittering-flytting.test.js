// Q30: den gamle kvitteringslista (/api/receipts, tabellen receipts) flyttes til Økonomi-kvitteringer bare som en
// admin-handling: forhåndsvisning, bekreftelse med forhåndsvisningens id, kopi av databasen først, og angring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-kvittflytt-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-kvflytt';
process.env.USER_NAME = 'Eier';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('eierpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (headers) => async (path, method = 'GET', body) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
};
const A = client({ cookie: await login('eier', 'eierpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = client({ cookie: await login('ingrid', 'ingridPassord123') });
const tok = (await A('/finans/api/tokens', 'POST', { name: 'Skript', scopes: ['finance:read', 'finance:write'], expiry: '30d' })).body.token;
const T = client({ authorization: `Bearer ${tok}` });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const legacy = (C, { store, amount, category, file = true }) => {
  const fd = new FormData();
  fd.append('store', store); fd.append('date', '2026-03-14'); fd.append('category', category); fd.append('amount', String(amount));
  if (file) fd.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'k.jpg');
  return C('/api/receipts', 'POST', fd);
};
const R = '/finans/api/legacy-receipts/migration';
const migrated = () => db.prepare("SELECT * FROM fh_receipts WHERE source='legacy' ORDER BY legacy_id").all();

test('oppsett: tre kvitteringer i den gamle lista, ingenting flyttes av seg selv', async () => {
  assert.equal((await legacy(A, { store: 'Rema 1000', amount: 123.45, category: 'Mat og dagligvarer' })).status, 200);
  assert.equal((await legacy(A, { store: 'Biltema', amount: 99, category: 'Finnes ikke', file: false })).status, 200);
  assert.equal((await legacy(I, { store: 'Kiwi', amount: 45.5, category: 'Annet' })).status, 200);
  assert.equal(migrated().length, 0);
});

test('bare admin i nettleseren ser forhåndsvisningen', async () => {
  assert.equal((await I(R)).status, 403);
  assert.equal((await T(R)).status, 403, 'et token holder ikke');
  const p = await A(R);
  assert.equal(p.status, 200, p.text);
  assert.equal(p.body.total, 3);
  assert.equal(p.body.nothing, false);
  assert.deepEqual(p.body.users.map((u) => [u.name, u.count, u.amountOre]).sort(), [['Eier', 2, 22245], ['Ingrid', 1, 4550]]);
  assert.deepEqual(p.body.files, { present: 2, missing: 0 });
  assert.ok(!p.text.includes('Rema'), 'forhåndsvisningen viser antall, ikke innhold');
  assert.equal(migrated().length, 0, 'forhåndsvisningen endrer ingenting');
});

let mid = null;
test('bekreftelse kreves, og forhåndsvisningen må være den samme', async () => {
  const p = (await A(R)).body;
  assert.equal((await A(R, 'POST', { previewId: p.previewId })).body.code, 'CONFIRM_REQUIRED');
  assert.equal((await A(R, 'POST', { confirm: true, previewId: 'feil' })).status, 409);
  assert.equal((await I(R, 'POST', { confirm: true, previewId: p.previewId })).status, 403);
  const r = await A(R, 'POST', { confirm: true, previewId: p.previewId });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.counts, { receipts: 3, files: 2, users: 2 });
  assert.match(r.body.backup, /^for-kvitteringsflytting-\d{8}-\d{6}\.db$/);
  assert.ok(existsSync(join(process.env.DATA_DIR, 'backups', r.body.backup)), 'kopi av databasen før endringen');
  mid = r.body.id;

  const rows = migrated();
  assert.equal(rows.length, 3);
  const rema = rows.find((x) => x.merchant === 'Rema 1000');
  assert.deepEqual([rema.status, rema.total, rema.date, rema.user_id], ['booked', 12345, '2026-03-14', 'owner']);
  const cat = db.prepare('SELECT name FROM fh_categories WHERE id=?').pluck().get(rema.category_id);
  assert.equal(cat, 'Mat og dagligvarer');
  assert.equal(rows.find((x) => x.merchant === 'Biltema').category_id, null, 'ukjent kategori → ingen');
  assert.ok(existsSync(join(process.env.DATA_DIR, 'receipts', rema.file)));
  // Den gamle lista står som før.
  assert.equal(db.prepare('SELECT count(*) FROM receipts').pluck().get(), 3);
  assert.equal((await A('/api/receipts')).body.length, 2);
  // Kvitteringene vises i Økonomi for riktig bruker, med bildet.
  assert.equal((await A(`/finans/api/receipts/${rema.id}/file`)).status, 200);
  assert.equal((await I(`/finans/api/receipts/${rema.id}/file`)).status, 404, 'per bruker');
  // Ny forhåndsvisning: ingenting igjen, og samme id kan ikke kjøres to ganger.
  const again = (await A(R)).body;
  assert.equal(again.nothing, true);
  assert.equal(again.already, 3);
  assert.equal((await A(R, 'POST', { confirm: true, previewId: again.previewId })).body.code, 'NOTHING_TO_MIGRATE');
});

test('angre fjerner kopiene og filene, men ikke det som er koblet til en transaksjon', async () => {
  const rows = migrated();
  const kiwi = rows.find((x) => x.merchant === 'Kiwi');
  const tx = db.prepare("INSERT INTO fh_transactions(date, description, amount, user_id, created) VALUES('2026-03-14', 'KIWI', -4550, ?, ?) RETURNING id").pluck().get(kiwi.user_id, Date.now());
  db.prepare('UPDATE fh_receipts SET transaction_id=? WHERE id=?').run(tx, kiwi.id);
  const files = rows.filter((x) => x.id !== kiwi.id && x.file).map((x) => join(process.env.DATA_DIR, 'receipts', x.file));
  const u = await A(`${R}/${mid}/undo`, 'POST', {});
  assert.equal(u.status, 200, u.text);
  assert.deepEqual(u.body.counts, { removed: 2, skipped: 1 });
  assert.deepEqual(migrated().map((x) => x.merchant), ['Kiwi']);
  for (const f of files) assert.ok(!existsSync(f), f);
  assert.equal((await A(`${R}/${mid}/undo`, 'POST', {})).status, 409);
  const h = (await A('/finans/api/legacy-receipts/migrations')).body.items;
  assert.equal(h[0].undoable, false);
  // De to som ble angret, kan flyttes igjen.
  assert.equal((await A(R)).body.total, 2);
  assert.ok(readdirSync(join(process.env.DATA_DIR, 'backups')).some((f) => f.startsWith('for-kvitteringsflytting-')));
});
