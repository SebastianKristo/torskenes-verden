// P85 G: Idempotency-Key på opplasting av kvitteringer. En app som laster opp på nytt etter et brutt svar, sender samme nøkkel
// og får det første svaret, uten en kvittering til.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-idem-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-idem';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { q } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const session = await import('../server/auth/session.js');

const tokenFor = async (username, password) => {
  const r = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, device: 'test' }) });
  assert.equal(r.status, 200);
  return (await r.json()).token;
};
const ownerTok = await tokenFor(session.userInfo('owner').username, 'testpassord1');
session.createUser({ username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' });
const ingridTok = await tokenFor('ingrid', 'ingridPassord123');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
async function upload(path, { tok = ownerTok, key, field = 'file' } = {}) {
  const fd = new FormData();
  fd.append(field, new Blob([JPEG], { type: 'image/jpeg' }), 'kvittering.jpg');
  const r = await api.request(path, { method: 'POST', headers: { authorization: `Bearer ${tok}`, ...(key ? { 'idempotency-key': key } : {}) }, body: fd });
  return { status: r.status, body: await r.json().catch(() => null), replayed: r.headers.get('idempotent-replayed') };
}
const count = (u) => q('SELECT count(*) FROM fh_receipts WHERE user_id=?').pluck().get(u);
const ingridId = session.userInfo(q("SELECT id FROM users WHERE username='ingrid'").pluck().get()).id;

test('samme Idempotency-Key to ganger: samme svar, én kvittering', async () => {
  const before = count('owner');
  const a = await upload('/receipts', { key: 'opplasting-0001' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.replayed, null);
  const b = await upload('/receipts', { key: 'opplasting-0001' });
  assert.equal(b.status, 200);
  assert.equal(b.replayed, 'true');
  assert.equal(b.body.id, a.body.id);
  assert.deepEqual(b.body.jobs.map((j) => j.id), a.body.jobs.map((j) => j.id));
  assert.equal(count('owner'), before + 1);
});

test('uten nøkkel, eller med en ny nøkkel, lages en ny kvittering som før', async () => {
  const before = count('owner');
  await upload('/receipts');
  await upload('/receipts');
  await upload('/receipts', { key: 'opplasting-0002' });
  assert.equal(count('owner'), before + 3);
});

test('nøkkelen er per bruker og per rute', async () => {
  const mine = await upload('/receipts', { key: 'felles-nokkel-1' });
  const hers = await upload('/receipts', { tok: ingridTok, key: 'felles-nokkel-1' });
  assert.equal(hers.status, 200);
  assert.equal(hers.replayed, null, 'en annen bruker får aldri den førstes svar');
  assert.notEqual(hers.body.id, mine.body.id);
  assert.equal(count(ingridId), 1);
  const sub = await upload('/subscriptions/receipts', { key: 'felles-nokkel-1' });
  assert.equal(sub.replayed, null, 'samme nøkkel på en annen rute er en ny opplasting');
  assert.equal((await upload('/subscriptions/receipts', { key: 'felles-nokkel-1' })).replayed, 'true');
});

test('ugyldig nøkkel gir 400, og en feilet opplasting kan prøves igjen med samme nøkkel', async () => {
  const bad = await upload('/receipts', { key: 'kort' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'IDEMPOTENCY_KEY_INVALID');
  const before = count('owner');
  const fail = await upload('/receipts', { key: 'prov-igjen-0001', field: 'ikke-fil' });
  assert.equal(fail.status, 400);
  const ok = await upload('/receipts', { key: 'prov-igjen-0001' });
  assert.equal(ok.status, 200);
  assert.equal(ok.replayed, null, 'feil lagres ikke');
  assert.equal(count('owner'), before + 1);
});

test('mens den første kjører, gir samme nøkkel 409', async () => {
  q("INSERT INTO fh_idempotency(user_id, route, key, status, body, created) VALUES('owner', 'POST /receipts', 'pagar-naa-0001', NULL, NULL, ?)").run(Date.now());
  const r = await upload('/receipts', { key: 'pagar-naa-0001' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'IDEMPOTENCY_IN_PROGRESS');
});

test('/receipts/scan (Android og iOS) har samme vern', async () => {
  const a = await upload('/receipts/scan', { key: 'skann-0001', field: 'image' });
  assert.ok(a.status >= 200 && a.status < 300, JSON.stringify(a.body));
  const b = await upload('/receipts/scan', { key: 'skann-0001', field: 'image' });
  assert.equal(b.replayed, 'true');
  assert.equal(b.body.receipt_id, a.body.receipt_id);
});
