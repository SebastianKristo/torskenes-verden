// Tailscale (prompt 57): statistikken i SQLite – oppetid 24 t / 7 d / 30 d, median og p95, direkte mot DERP, trafikk som delta
// mellom prøvene (også når telleren starter på nytt), oppetidsstripen per Oslo-dag, nye enheter, sletting etter 90 dager og
// vedlikeholdslistene. Klokka settes i testen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-ts-stat-'));
process.env.DATA_DIR = DATA;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-ts57';
test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

const S = await import('../server/tailscale/statistikk.js');
const { db } = await import('../server/db.js');
const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
const NOW = Date.parse('2026-11-27T11:00:00Z'); // kl. 12:00 i Oslo
const dev = (id, o = {}) => ({ id, name: id, online: true, latencyMs: null, tunnel: 'direkte', rx: 0, tx: 0, ...o });

test('persentil og deltaSum (rene hjelpere)', () => {
  assert.equal(S.persentil([], 50), null);
  assert.equal(S.persentil([5], 95), 5);
  assert.equal(S.persentil([1, 2, 3, 4], 50), 2.5);
  assert.equal(S.persentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100], 95), 23.1);
  assert.equal(S.persentil([3, null, 1, NaN, 2], 50), 2, 'ukjente verdier hoppes over');
  assert.equal(S.deltaSum([100, 150, 400]), 300);
  assert.equal(S.deltaSum([100, 150, 20, 60]), 50 + 20 + 40, 'telleren startet på nytt: den nye verdien telles');
  assert.equal(S.deltaSum([7]), 0);
});

test('første runde og nye enheter', () => {
  assert.equal(S.forsteRunde(), true);
  const r1 = S.lagreProver([dev('a'), dev('b')], NOW - 10 * DAY);
  assert.deepEqual(r1.nye.sort(), ['a', 'b']);
  assert.equal(S.forsteRunde(), false);
  const r2 = S.lagreProver([dev('a'), dev('b'), dev('c')], NOW - 2 * DAY);
  assert.deepEqual(r2.nye, ['c']);
  assert.deepEqual(S.nyeSiste7d(NOW).map((x) => x.id), ['c']);
  assert.equal(S.forstSett('c'), new Date(NOW - 2 * DAY).toISOString());
  db.exec('DELETE FROM tailscale_samples');
});

test('oppetid, latens, tunnel og trafikk for én enhet', () => {
  // 24 t med prøver hvert 5. minutt: online de første 18 timene, så offline. Latens 2–4 ms, DERP en fjerdedel av tiden.
  for (let t = NOW - DAY + 5 * MIN, i = 0; t <= NOW; t += 5 * MIN, i++) {
    const on = t <= NOW - 6 * H;
    S.lagreProver([dev('srv', { online: on, latencyMs: on ? [2, 3, 4][i % 3] : null, tunnel: on ? (i % 4 === 0 ? 'derp:osl' : 'direkte') : null, rx: i * 1000, tx: i * 10 })], t);
  }
  const u = S.oppetid('srv', NOW);
  assert.equal(u['24h'], 0.75);
  assert.equal(u['7d'], 0.75, 'bare de prøvene som finnes, teller');
  const l = S.latens('srv', NOW);
  assert.equal(l.median, 3);
  assert.equal(l.p95, 4);
  assert.equal(l.spark.length, 24);
  assert.equal(l.spark[0], 3);
  assert.equal(l.spark[23], null, 'ingen målinger mens den var offline');
  const tn = S.tunnelAndel('srv', NOW);
  assert.equal(tn.relay, 'osl');
  assert.equal(tn.direkte, 0.75);
  assert.equal(tn.derp, 0.25);
  const tr = S.trafikk('srv', NOW - DAY, NOW);
  assert.equal(tr.rx, 287 * 1000);
  assert.equal(tr.tx, 287 * 10);
  // Enhet uten prøver.
  assert.deepEqual(S.oppetid('ukjent', NOW), { '24h': null, '7d': null, '30d': null });
  assert.deepEqual(S.tunnelAndel('ukjent', NOW), { direkte: null, derp: null, relay: null });
});

test('trafikk i dag (fra midnatt i Oslo), per dag og tailnet-latens', () => {
  const td = S.trafikkIDag(NOW);
  // Midnatt i Oslo er 23:00 UTC dagen før; prøvene fra da av er de 12 siste timene.
  assert.equal(td.per[0].id, 'srv');
  assert.equal(td.rx, 144 * 1000, '145 prøver fra og med midnatt gir 144 økninger');
  const pd = S.perDag(NOW, 7);
  assert.equal(pd.length, 7);
  assert.equal(pd[6].date, '2026-11-27');
  assert.equal(pd[6].rx, td.rx);
  assert.equal(pd[0].rx, 0);
  const tl = S.tailnetLatens(NOW);
  assert.equal(tl.median, 3);
  assert.equal(tl.direkte, 0.75);
});

test('oppetidsstripe for 30 Oslo-dager', () => {
  const s = S.stripe30('srv', NOW);
  assert.equal(s.length, 30);
  assert.equal(s[29].date, '2026-11-27');
  assert.equal(s[0].date, '2026-10-29');
  assert.equal(s[29].state, 'delvis', 'i dag (fra midnatt) var den online 6 av 12 timer');
  assert.equal(s[0].state, null);
  // 26. november: online hele døgnet etter kl. 12 Oslo-tid.
  assert.equal(s[28].state, 'oppe');
});

test('nattlig sletting etter 90 dager', () => {
  S.lagreProver([dev('gammel')], NOW - 91 * DAY);
  S.lagreProver([dev('gammel')], NOW - 89 * DAY);
  const n = S.slettGamle(NOW);
  assert.equal(n, 1);
  assert.equal(db.prepare("SELECT count(*) FROM tailscale_samples WHERE device_id='gammel'").pluck().get(), 1);
});

test('vedlikehold: utløpende nøkler, oppdateringer, avvikende versjon, exit-node og frakoblet over 30 d', () => {
  const list = [
    { id: '1', name: 'unraid', online: true, expiresInDays: 4, keyExpiry: '2026-12-01T10:00:00.000Z', clientVersion: '1.74.1', updateAvailable: true, exitNode: false, lastSeen: null },
    { id: '2', name: 'mac', online: true, expiresInDays: 60, clientVersion: '1.76.6', updateAvailable: false, exitNode: true, lastSeen: null },
    { id: '3', name: 'ipad', online: false, expiresInDays: null, clientVersion: null, updateAvailable: null, exitNode: false, lastSeen: new Date(NOW - 45 * DAY).toISOString() },
    { id: '4', name: 'hytta', online: false, expiresInDays: 14, clientVersion: '1.76.6', exitNode: false, lastSeen: new Date(NOW - 3 * DAY).toISOString() },
  ];
  const v = S.vedlikehold(list, '1.76.6', NOW);
  assert.deepEqual(v.expiring.map((x) => [x.name, x.expiresInDays]), [['unraid', 4], ['hytta', 14]]);
  assert.deepEqual(v.updates.map((x) => x.name), ['unraid']);
  assert.deepEqual(v.versionMismatch.map((x) => [x.name, x.expected]), [['unraid', '1.76.6']]);
  assert.deepEqual(v.exitNode.map((x) => x.name), ['mac']);
  assert.deepEqual(v.offline30.map((x) => x.name), ['ipad']);
  assert.equal(v.count, 2 + 1 + 1 + 1 + 1);
  // Uten self (API-kilden): den vanligste versjonen er referansen.
  assert.equal(S.vedlikehold(list, null, NOW).referenceVersion, '1.76.6');
});
