import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-bk-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { writeXlsx, readXlsxSheets } = await import('../server/finans/xlsx.js');
const { db, seal, unseal } = await import('../server/finans/db.js');
const { loadDemo } = await import('../server/finans/demo.js');
const backup = await import('../server/finans/backup.js');
const { default: api } = await import('../server/finans/routes.js');
const { parseQuery } = await import('../server/finans/search.js');

test('XLSX: tall som tall, datoer som datoer, flere ark med navn', () => {
  const buf = writeXlsx([{ name: 'Ark A', columns: [{ key: 'd', label: 'Dato', type: 'date' }, { key: 'v', label: 'Beløp', type: 'kr' }, { key: 't', label: 'Tekst' }], rows: [{ d: '2026-10-17', v: -386.5, t: 'Rema & «Co»' }] },
    { name: 'Ark B', columns: [{ key: 'x', label: 'X' }], rows: [] }]);
  const sh = readXlsxSheets(buf);
  assert.deepEqual(Object.keys(sh), ['Ark A', 'Ark B']);
  assert.deepEqual(sh['Ark A'][0], ['Dato', 'Beløp', 'Tekst']);
  assert.equal(typeof sh['Ark A'][1][1], 'number');
  assert.equal(sh['Ark A'][1][1], -386.5);
  assert.equal(sh['Ark A'][1][2], 'Rema & «Co»');
});

test('Hemmeligheter krypteres', () => {
  const s = seal('hemmelig');
  assert.ok(s.startsWith('enc:') && !s.includes('hemmelig'));
  assert.equal(unseal(s), 'hemmelig');
});

test('Søk: måneder og stoppord tolkes', () => {
  const pq = parseQuery('hvor mye brukte jeg på strøm i september?', new Date(2026, 9, 17));
  assert.equal(pq.from, '2026-09-01'); assert.equal(pq.to, '2026-10-01');
  assert.deepEqual(pq.words, ['strøm']);
  assert.equal(parseQuery('desember', new Date(2026, 9, 17)).from, '2025-12-01');
});

test('Backup → tom installasjon gir like mange rader (JSON, Excel og kryptert arkiv)', async () => {
  loadDemo();
  const before = backup.currentCounts();
  const json = backup.exportJson();
  const xlsx = backup.exportXlsx();
  const arc = await backup.buildArchive({ smbDb: true, smbReceipts: true, smbSettings: true, smbEncrypt: true }, 'riktig-passfrase');
  const wipe = () => { db.pragma('foreign_keys = OFF'); for (const t of backup.fhTables()) db.prepare(`DELETE FROM ${t}`).run(); db.pragma('foreign_keys = ON'); };
  for (const [kind, file] of [['json', new File([JSON.stringify(json)], 'b.json')], ['xlsx', new File([xlsx], 'b.xlsx')], ['archive', new File([readFileSync(arc.path)], arc.name)]]) {
    wipe();
    assert.equal(backup.currentCounts().fh_transactions, 0);
    const st = await backup.stage({ file, phrase: 'riktig-passfrase' });
    assert.equal(st.kind, kind);
    await backup.restore(st.stageId);
    assert.deepEqual(backup.currentCounts(), before, kind);
    // Idempotent: samme fil en gang til endrer ingenting.
    const again = await backup.stage({ file, phrase: 'riktig-passfrase' });
    await backup.restore(again.stageId);
    assert.deepEqual(backup.currentCounts(), before, kind + ' (to ganger)');
  }
  await assert.rejects(backup.stage({ file: new File([readFileSync(arc.path)], arc.name), phrase: 'feil-passfrase' }), /passfrase/);
});

test('Abonnement hvert 2. år: 1 200 kr gir 50 kr/mnd og 600 kr/år, og token-innlogging', async () => {
  const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.match(token, /^fh_pat_[A-Za-z0-9_-]{32}$/);
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const r = await api.request('/subscriptions', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Test 2 år', price: 1200, cycle: 'biennial' }) });
  const s = await r.json();
  assert.equal(s.monthly, 50); assert.equal(s.yearly, 600);
  const bad = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'feil' }) });
  assert.equal(bad.status, 401);
});
