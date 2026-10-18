import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-track-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { kv, OWNER, db } = await import('../server/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const car = await import('../server/tracking-carriers.js');
const trk = await import('../server/tracking.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await trk.default.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

test('gjenkjenner transportør ut fra formatet', () => {
  assert.equal(car.detect('CV704411234NO'), 'posten');
  assert.equal(car.detect('cv 7044 1123 4no'), 'posten');
  assert.equal(car.detect('70123456789012345'), 'bring');
  assert.equal(car.detect('00370726201234567890'), 'postnord');
  assert.equal(car.detect('RR123456789SE'), 'postnord');
  assert.equal(car.detect('JJD000390007882034'), 'dhl');
  assert.equal(car.detect('1Z999AA10123456784'), 'ups');
  assert.equal(car.detect('123456789012'), 'fedex');
  assert.equal(car.detect('12345678901'), 'gls');
  assert.equal(car.detect('HH40211873'), 'helthjem');
  assert.equal(car.detect('XYZ-ukjent'), 'other');
  assert.match(car.trackUrl('posten', 'CV704411234NO'), /^https:\/\/sporing\.posten\.no\/sporing\/CV704411234NO$/);
});

test('finner sporingsnumre i fraktbekreftelser, men ikke i vanlig tekst', () => {
  assert.deepEqual(car.findTrackingNumbers('Pakken din er sendt! Sporingsnummer: 00370726201234567890. Ordrenummer 4471023.'), ['00370726201234567890']);
  assert.deepEqual(car.findTrackingNumbers('Din ordre er på vei med Posten, spor pakken: CV704411234NO'), ['CV704411234NO']);
  assert.deepEqual(car.findTrackingNumbers('Tracking number: 1Z999AA10123456784'), ['1Z999AA10123456784']);
  assert.deepEqual(car.findTrackingNumbers('Faktura CV704411234NO forfaller 20.10'), [], 'uten fraktord ignoreres nummeret');
  assert.deepEqual(car.findTrackingNumbers('Pakken er sendt. Ordrenummer: 4471023, telefon 98765432'), []);
});

test('normaliserer status fra ulike transportører', () => {
  assert.equal(car.normStatus('DELIVERED'), 'delivered');
  assert.equal(car.normStatus('Sendingen er levert til mottaker'), 'delivered');
  assert.equal(car.normStatus('READY_FOR_PICKUP'), 'ready_for_pickup');
  assert.equal(car.normStatus('Pakken kan hentes på Kiwi Pilestredet'), 'ready_for_pickup');
  assert.equal(car.normStatus('Out for delivery'), 'out_for_delivery');
  assert.equal(car.normStatus('Ute for levering'), 'out_for_delivery');
  assert.equal(car.normStatus('IN_TRANSIT'), 'in_transit');
  assert.equal(car.normStatus('Shipment information received'), 'registered');
  assert.equal(car.normStatus('Exception: delayed'), 'delayed');
  assert.equal(car.stepOf('ready_for_pickup'), 3);
  assert.equal(car.stepOf('delivered'), 4);
});

test('legger til manuelt, slår sammen duplikater og avviser samme nummer', async () => {
  const a = await call('/', 'POST', { trackingNo: 'cv704411234no', name: 'iPhone' });
  assert.equal(a.status, 200);
  assert.equal(a.body.item.carrier, 'posten');
  assert.equal(a.body.item.trackingNo, 'CV704411234NO');
  assert.equal(a.body.item.name, 'iPhone');
  assert.match(a.body.item.lastError ?? '', /nøkkel/i, 'uten nøkkel får vi en forklaring');
  const dup = await call('/', 'POST', { trackingNo: 'CV704411234NO' });
  assert.equal(dup.status, 409);
  // E-post med samme nummer slås sammen og beholder navnet du ga
  const { created } = trk.upsertShipment({ trackingNo: 'CV704411234NO', name: 'Fra e-post', shop: 'Apple', source: 'email' });
  assert.equal(created, false);
  const list = await call('/');
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].name, 'iPhone');
  assert.equal(list.body.items[0].shop, 'Apple');
});

test('e-post: henter nummer, butikk og varsel', async () => {
  const n = await trk.fromMail({ subject: 'Ordren din er sendt', from: { value: [{ name: 'Komplett', address: 'ordre@komplett.no' }], text: '' }, text: 'Hei! Pakken er sendt med PostNord. Sporingsnummer: 00370726201234567890', messageId: '<a@b>', date: new Date() });
  assert.equal(n, 1);
  const list = await call('/');
  const s = list.body.items.find((x) => x.trackingNo === '00370726201234567890');
  assert.equal(s.source, 'email');
  assert.equal(s.shop, 'Komplett');
  assert.equal(s.carrier, 'postnord');
  assert.match(s.sourceNote, /Komplett/);
  assert.ok(list.body.notices.some((x) => x.kind === 'found'), 'varsel om nytt nummer');
  // Med kilden slått av hentes ingenting
  await call('/sources', 'PUT', { email: false });
  assert.equal(await trk.fromMail({ subject: 'Sendt', text: 'Sporingsnummer: JJD000390007882034', from: { value: [] } }), 0);
  await call('/sources', 'PUT', { email: true });
});

test('Finn-handel med Fiks ferdig blir utgående sending', async () => {
  try { db.exec("ALTER TABLE fh_finn ADD COLUMN tracking TEXT"); } catch {}
  db.prepare("INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,source,created,tracking) VALUES('sold','PS5','kjøper Jonas','2026-10-16',350000,'[]','t-ps5',?, 'CV704418877NO')").run(Date.now());
  assert.equal(trk.syncFinn(), 1);
  const s = (await call('/')).body.items.find((x) => x.trackingNo === 'CV704418877NO');
  assert.equal(s.source, 'finn');
  assert.equal(s.direction, 'out');
  assert.equal(s.steps[1], 'Levert inn');
  assert.equal(trk.syncFinn(), 0, 'ingen duplikat andre gang');
});

test('status fra Bring-API-et oppdaterer, varsler og fyller widgeten', async () => {
  kv.set(OWNER, 'cfg', { ...kv.get(OWNER, 'cfg', {}), trk_bring_uid: 'meg@example.com', trk_bring_key: 'nokkel' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /api\.bring\.com\/tracking\/api\/v2\/tracking\.json\?q=CV704411234NO/);
    assert.equal(init.headers['X-Mybring-API-Key'], 'nokkel');
    return new Response(JSON.stringify({ consignmentSet: [{ consignment: [{ packageSet: [{ dateOfEstimatedDelivery: '2026-10-20', eventSet: [
      { status: 'READY_FOR_PICKUP', description: 'Sendingen kan hentes', dateIso: '2026-10-17T10:00:00+02:00', city: 'Oslo', unitInformation: { name: 'Coop Extra Bislett' } },
      { status: 'IN_TRANSIT', description: 'Sendingen er på vei', dateIso: '2026-10-16T08:00:00+02:00', city: 'Trondheim' }] }] }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await call('/prefs', 'PUT', { pickup: true });
    const r = await call('/check', 'POST');
    assert.equal(r.status, 200);
    const s = r.body.items.find((x) => x.trackingNo === 'CV704411234NO');
    assert.equal(s.status, 'ready_for_pickup');
    assert.equal(s.pickupPoint, 'Coop Extra Bislett');
    assert.equal(s.step, 3);
    assert.ok(s.events.some((e) => /kan hentes/.test(e.status)));
    assert.ok(r.body.notices.some((n) => n.kind === 'pickup' && /Coop Extra Bislett/.test(n.text)));
    const w = await call('/widget');
    assert.equal(w.body.items[0].trackingNo, 'CV704411234NO', 'klar for henting først');
    assert.equal(w.body.items[0].status, 'ready_for_pickup');
    assert.deepEqual(trk.packagesFor(2, OWNER).map((p) => p.status)[0], 'ready_for_pickup'); // ISO2: per bruker
  } finally { globalThis.fetch = realFetch; }
});

test('arkiver og slett', async () => {
  const s = (await call('/')).body.items[0];
  const a = await call(`/${s.id}`, 'PATCH', { archived: true });
  assert.equal(a.body.item.archived, true);
  await call(`/${s.id}`, 'DELETE');
  assert.ok(!(await call('/')).body.items.some((x) => x.id === s.id));
});

test('varselvalg: «Forsinket» er av som standard', async () => {
  const r = await call('/');
  assert.deepEqual(r.body.prefs, { found: true, out: true, pickup: true, delivered: true, delayed: false });
});

test('statuskoder fra alle transportører gir riktig felles status', () => {
  const cases = {
    DELIVERED: 'delivered', Delivered: 'delivered', COLLECTED: 'delivered', 'Sendingen er utlevert': 'delivered', 'Pakken er levert': 'delivered', // Bring, PostNord, DHL, UPS, 17TRACK
    READY_FOR_PICKUP: 'ready_for_pickup', AvailableForPickup: 'ready_for_pickup', NOTIFICATION_SENT: 'ready_for_pickup',
    OutForDelivery: 'out_for_delivery', TRANSPORT_TO_RECIPIENT: 'out_for_delivery', AVAILABLE_FOR_DELIVERY: 'out_for_delivery',
    EN_ROUTE: 'in_transit', InTransit: 'in_transit', transit: 'in_transit', HANDED_IN: 'picked_up',
    'pre-transit': 'registered', InfoReceived: 'registered', INFORMED: 'registered', PRE_NOTIFIED: 'registered',
    DeliveryFailure: 'delayed', ATTEMPTED_DELIVERY: 'delayed', 'Pakken er ikke levert': 'delayed',
  };
  for (const [s, want] of Object.entries(cases)) assert.equal(car.normStatus(s), want, s);
  // Prompt 22: Posten har manuelt kontrollert logo – ingen tegnet SVG og aldri favicon.
  assert.equal(car.CARRIER.posten.logo, null);
  assert.equal(car.CARRIER.posten.favicon, null);
});

test('Finn-handel som er mottatt gjør pakken levert, også uten nøkkel hos transportøren', () => {
  const now = Date.now();
  const id = db.prepare("INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,created,tracking,stage) VALUES('bought','Lampe','selger Ola','2026-10-10',30000,'[]',?, 'CV111222333NO', 2) RETURNING id").get(now).id;
  trk.syncFinn();
  const get = () => db.prepare("SELECT status FROM hl_shipments WHERE tracking_no='CV111222333NO'").get().status;
  assert.equal(get(), 'in_transit', 'Sendt i handelen → i transport');
  db.prepare('UPDATE fh_finn SET stage=3 WHERE id=?').run(id);
  trk.syncFinn();
  assert.equal(get(), 'delivered', 'Mottatt i handelen → levert');
  db.prepare('UPDATE fh_finn SET stage=2 WHERE id=?').run(id);
  trk.syncFinn();
  assert.equal(get(), 'delivered', 'statusen går aldri bakover');
});

test('e-post med «levert» i emnet flytter en kjent pakke til levert', async () => {
  trk.upsertShipment({ trackingNo: 'CV444555666NO', name: 'Bok', source: 'manual' });
  await trk.fromMail({ subject: 'Pakken din er levert', text: 'Sporingsnummer CV444555666NO. Takk for at du handlet hos oss. Sporing av pakken.', from: { value: [{ name: 'Posten', address: 'noreply@posten.no' }] }, date: new Date() });
  assert.equal(db.prepare("SELECT status FROM hl_shipments WHERE tracking_no='CV444555666NO'").get().status, 'delivered');
});
