// Datalaget (Fase 2, ytelse): statement-cache q(sql) i server/db.js og kv-lesing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-dbytelse-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.NODE_ENV = 'test';
const { db, q, kv, withKvMemo, kvMemoReset } = await import('../server/db.js');

test('q(sql) gjenbruker samme setning for samme SQL', () => {
  const a = q('SELECT 1 AS x');
  const b = q('SELECT 1 AS x');
  assert.equal(a, b);
  assert.notEqual(q('SELECT 2 AS x'), a);
});

test('q(sql): pluck/raw fra én bruker smitter ikke over på neste', () => {
  assert.equal(q('SELECT 7 AS x').pluck().get(), 7);
  assert.deepEqual(q('SELECT 7 AS x').get(), { x: 7 });
  assert.deepEqual(q('SELECT 7 AS x').raw().get(), [7]);
  assert.deepEqual(q('SELECT 7 AS x').get(), { x: 7 });
});

test('q(sql) virker for skrivende setninger og etter skjemaendring', () => {
  db.exec('CREATE TABLE IF NOT EXISTS t_ytelse (a INTEGER)');
  q('INSERT INTO t_ytelse(a) VALUES(?)').run(1);
  q('INSERT INTO t_ytelse(a) VALUES(?)').run(2);
  assert.equal(q('SELECT count(*) FROM t_ytelse').pluck().get(), 2);
  db.exec('ALTER TABLE t_ytelse ADD COLUMN b TEXT');
  assert.deepEqual(q('SELECT * FROM t_ytelse ORDER BY a LIMIT 1').get(), { a: 1, b: null });
});

test('kv: get/set/del/delPrefix som før, og hver leser får sitt eget objekt', () => {
  kv.set('u1', 'k', { n: 1 });
  const a = kv.get('u1', 'k');
  a.n = 99;
  assert.deepEqual(kv.get('u1', 'k'), { n: 1 });
  assert.equal(kv.get('u1', 'mangler', 'fallback'), 'fallback');
  kv.del('u1', 'k');
  assert.equal(kv.get('u1', 'k'), null);
  kv.set('u1', 'p_a', 1); kv.set('u1', 'p_b', 2); kv.set('u1', 'q_c', 3);
  kv.delPrefix('u1', 'p_');
  assert.equal(kv.get('u1', 'p_a'), null);
  assert.equal(kv.get('u1', 'q_c'), 3);
});

const countKvReads = (fn) => {
  const st = q('SELECT value FROM kv WHERE user=? AND key=?');
  const get = st.get; let n = 0;
  st.get = function (...a) { n++; return get.apply(this, a); };
  try { fn(); } finally { delete st.get; }
  return n;
};

test('kv-minne: samme nøkkel leses fra databasen én gang per forespørsel', async () => {
  kv.set('u2', 'cfg', { a: 1 });
  const n = await withKvMemo(async () => countKvReads(() => { for (let i = 0; i < 100; i++) kv.get('u2', 'cfg'); kv.get('u2', 'annen'); kv.get('u2', 'annen'); }));
  assert.equal(n, 2);
  assert.equal(countKvReads(() => { kv.get('u2', 'cfg'); kv.get('u2', 'cfg'); }), 2, 'utenfor forespørsel: ingen minne');
});

test('kv-minne: skriving (også fra en annen forespørsel) gir ny verdi', async () => {
  kv.set('u3', 'k', 1);
  let resume; const wait = new Promise((r) => { resume = r; });
  const a = withKvMemo(async () => {
    const first = kv.get('u3', 'k');
    await wait;                         // en annen forespørsel skriver i mellomtiden
    return [first, kv.get('u3', 'k')];
  });
  await withKvMemo(async () => { kv.set('u3', 'k', 2); });
  resume();
  assert.deepEqual(await a, [1, 2]);
  await withKvMemo(async () => {
    assert.equal(kv.get('u3', 'k'), 2);
    kv.del('u3', 'k'); assert.equal(kv.get('u3', 'k'), null);
    kv.set('u3', 'p_x', 1); kv.get('u3', 'p_x'); kv.delPrefix('u3', 'p_'); assert.equal(kv.get('u3', 'p_x'), null);
    q('INSERT INTO kv(user,key,value) VALUES(?,?,?)').run('u3', 'direkte', '5');
    kv.get('u3', 'direkte'); // kan være minnet som null før reset
    kvMemoReset(); assert.equal(kv.get('u3', 'direkte'), 5);
  });
});

test('kv-minne: tilbakerullet transaksjon gir ikke utdatert verdi', async () => {
  kv.set('u4', 'k', 'før');
  await withKvMemo(async () => {
    kv.get('u4', 'k');
    assert.throws(() => db.transaction(() => { kv.set('u4', 'k', 'etter'); assert.equal(kv.get('u4', 'k'), 'etter'); throw new Error('rull tilbake'); })());
    assert.equal(kv.get('u4', 'k'), 'før');
  });
});

test('kv-minne: hver leser får sitt eget objekt', async () => {
  kv.set('u5', 'o', { n: 1 });
  await withKvMemo(async () => { kv.get('u5', 'o').n = 2; assert.deepEqual(kv.get('u5', 'o'), { n: 1 }); });
});
