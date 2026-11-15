// Datalaget (Fase 2, ytelse): statement-cache q(sql) i server/db.js og kv-lesing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-dbytelse-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.NODE_ENV = 'test';
const { db, q, kv } = await import('../server/db.js');

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
