// Prompt 15 (server): værappen, transaksjonsdetalj med kvittering, kvitteringer til gjennomgang, layout-felt og hilsen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-s15-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile, greetingFor } = await import('../server/mobile.js');
const W = await import('../server/weather-full.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const req = (app) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const M = req(mobile), F = req(fin);

test('hilsen etter tid på døgnet, aldri bare «Hei»', () => {
  assert.deepEqual([4, 5, 9, 10, 11, 12, 17, 18, 22, 23].map(greetingFor),
    ['God natt', 'God morgen', 'God morgen', 'God formiddag', 'God formiddag', 'God ettermiddag', 'God ettermiddag', 'God kveld', 'God kveld', 'God natt']);
});

test('vær: full visning med timer, dager, i går, måne og steder', async () => {
  const r = await M('/weather/full?place=bergen');
  assert.equal(r.status, 200);
  const w = r.body;
  assert.equal(w.place.name, 'Bergen');
  assert.equal(w.hours.length, 48);
  assert.equal(w.days.length, 7);
  assert.ok(w.yesterday && Number.isFinite(w.yesterday.hi));
  assert.ok(typeof w.current.text === 'string' && w.current.text.length > 2);
  assert.ok(['clear', 'cloudy', 'rain', 'snow', 'fog', 'night'].includes(w.kind));
  assert.ok(w.moon.illum >= 0 && w.moon.illum <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(w.moon.nextFull));
  assert.match(w.yrUrl, /yr\.no/);
  const pos = (await M('/weather/full?lat=59.1&lon=10.2&name=Hytta')).body;
  assert.equal(pos.place.name, 'Hytta');
  assert.equal((await M('/weather/full')).body.place.id, 'oslo');
  // Ukjent sted gir Oslo; uten innlogging avvises kallet.
  assert.equal((await mobile.request('/weather/full')).status, 401);
});

test('månefase: kjent fullmåne og nymåne', () => {
  assert.ok(W.moonOf(new Date('2026-10-26T12:00Z')).illum > 95);
  assert.ok(W.moonOf(new Date('2026-10-10T12:00Z')).illum < 5);
  assert.equal(W.wmoText(61), 'Lett regn');
  assert.equal(W.weatherKindOf(0, false), 'night');
});

test('transaksjonsdetalj med kvittering og bankrad, og antall til gjennomgang', async () => {
  const now = Date.now();
  const t = db.prepare("INSERT INTO fh_transactions(date,amount,description,merchant,source,created,raw_bank_row,user_id) VALUES('2026-10-17',-34250,'REMA 1000 MAJORSTUEN','Rema 1000','csv',?,?,'owner') RETURNING id")
    .get(now, JSON.stringify({ bookingDate: '2026-10-17', valueDate: '2026-10-18', description: 'REMA 1000 MAJORSTUEN', message: 'KID 1234' })).id;
  db.prepare("INSERT INTO fh_receipts(id,file,mime,status,merchant,date,total,extraction,transaction_id,created,user_id) VALUES('r1','r1.jpg','image/jpeg','booked','Rema 1000','2026-10-17',34250,?,?,?,'owner')")
    .run(JSON.stringify({ lines: [{ description: 'Kyllingfilet 400g', amount: 89.9 }, { description: 'Melk', amount: 22.5 }] }), t, now);
  db.prepare("INSERT INTO fh_receipts(id,mime,status,created,user_id) VALUES('r2','image/jpeg','needs_review',?,'owner'),('r3','image/jpeg','needs_review',?,'owner')").run(now, now);
  const d = await F(`/transactions/${t}`);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal(d.body.merchant, 'Rema 1000');
  assert.equal(d.body.receipt.status, 'attached');
  assert.equal(d.body.receipt.total, 342.5);
  assert.deepEqual(d.body.receipt.lines[0], { name: 'Kyllingfilet 400g', price: 89.9 });
  assert.equal(d.body.receipt.fileUrl, '/finans/api/receipts/r1/file');
  assert.equal(d.body.bank.message, 'KID 1234');
  assert.equal(d.body.bank.valueDate, '2026-10-18');
  assert.equal((await F('/transactions/999999')).status, 404);
  assert.deepEqual((await F('/receipts?status=needs_review&count=1')).body, { count: 2 });
  assert.equal((await F('/transactions?limit=15')).body.items.length <= 15, true);
});

test('layout: sider, Finans-faner, fjerde fane og skanneknapp', async () => {
  const g = (await M('/me/layout')).body;
  assert.deepEqual(g.finTabs, ['oversikt', 'liste', 'finn', 'sok']);
  assert.deepEqual([g.fourthTab, g.fab], ['auto', 'float']);
  assert.deepEqual(g.pages, {});
  let r = await M('/me/layout', 'PUT', { pages: { hjem: { order: ['nytt', 'sok'], hidden: ['snarveier'] } }, finTabs: ['oversikt', 'kvitteringer'], fourthTab: 'sporing', fab: 'inline' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await M('/me/layout', 'PUT', { pages: { fin: { hidden: ['f4'] } } });
  const g2 = (await M('/me/layout')).body;
  assert.deepEqual(g2.pages, { hjem: { order: ['nytt', 'sok'], hidden: ['snarveier'] }, fin: { hidden: ['f4'] } });
  assert.deepEqual([g2.finTabs, g2.fourthTab, g2.fab], [['oversikt', 'kvitteringer'], 'sporing', 'inline']);
  assert.equal((await M('/me/layout', 'PUT', { finTabs: ['oversikt', 'liste', 'finn', 'sok', 'aksjer'] })).status, 400);
  assert.equal((await M('/me/layout', 'PUT', { finTabs: ['tull'] })).status, 400);
  assert.equal((await M('/me/layout', 'PUT', { fourthTab: 'mat' })).status, 400);
  assert.equal((await M('/me/layout', 'PUT', { pages: { hjem: { sort: [] } } })).status, 400);
});
