// Transaksjonslisten: cursor-paginering (?limit&cursor → nextCursor) i tillegg til dagens svarform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-txcur-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.NODE_ENV = 'test';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const { default: fin } = await import('../server/finans/routes.js');
const { encodeTxCursor, decodeTxCursor } = await import('../server/finans/tx-cursor.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const J = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await app.request('/finans/api' + path, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const acc = (await call('/accounts', 'POST', { name: 'Brukskonto', bank: 'DNB', type: 'checking' })).body;
// 25 rader: fem per dag over fem dager, så flere rader deler dato (id avgjør rekkefølgen innen dagen).
for (let i = 0; i < 25; i++) {
  const r = await call('/transactions', 'POST', { date: `2026-10-${String(10 + Math.floor(i / 5)).padStart(2, '0')}`, amount: -(i + 1), description: `Rema 1000 kjøp ${i}`, accountId: acc.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

const walk = async (base) => {
  const seen = []; let cursor = null, pages = 0;
  do {
    const r = await call(`${base}${base.includes('?') ? '&' : '?'}limit=7${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.items.length <= 7);
    seen.push(...r.body.items); cursor = r.body.nextCursor; pages++;
    assert.equal(r.body.count, 25, 'count gjelder hele filteret');
  } while (cursor && pages < 10);
  return { seen, pages };
};

test('cursor: alle rader kommer én gang, i samme rekkefølge som uten cursor', async () => {
  const all = (await call('/transactions')).body;
  assert.equal(all.items.length, 25);
  assert.equal(all.nextCursor, null, 'ingen flere sider');
  assert.equal(typeof all.count, 'number'); assert.equal(typeof all.net, 'number');
  const { seen, pages } = await walk('/transactions');
  assert.equal(pages, 4);
  assert.deepEqual(seen.map((t) => t.id), all.items.map((t) => t.id));
});

test('cursor: virker også med butikkfilteret (finans42) og gir feil for ugyldig cursor', async () => {
  const all = (await call('/transactions?min=0')).body;
  assert.equal(all.items.length, 25, JSON.stringify(Object.keys(all)));
  assert.ok(Array.isArray(all.chips), 'filtrert svar fra finans42');
  const { seen } = await walk('/transactions?min=0');
  assert.deepEqual(seen.map((t) => t.id), all.items.map((t) => t.id));
  const bad = await call('/transactions?cursor=tull');
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error);
});

test('cursor: koding og avkoding', () => {
  const c = encodeTxCursor({ date: '2026-10-12', id: 42 });
  assert.deepEqual(decodeTxCursor(c), { date: '2026-10-12', id: 42 });
  assert.equal(decodeTxCursor(''), null);
  assert.equal(decodeTxCursor(Buffer.from('2026-10-12|x').toString('base64url')), null);
});

test('«Lagt til» har fortsatt navnet på den som la inn raden', async () => {
  const r = (await call('/transactions?limit=3')).body;
  for (const t of r.items) { assert.ok(t.added?.text?.startsWith('Lagt til '), t.added?.text); }
});
