// PostNord uten nøkkel (ISO2-tillegg): offentlig sporingslenke og uoffisiell status fra postnord.no sitt JSON-endepunkt,
// med ParcelsApp som reserve når endepunktet svarer HTML, 403 eller 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-iso2-pn-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.POSTNORD_API_KEY;
const C = await import('../server/tracking-carriers.js');
const { updateConfig } = await import('../server/settings.js');
const { kv, OWNER } = await import('../server/db.js');

const NO = '00370726201234567890';
// Slik postnord.no sitt endepunkt svarer (forkortet).
const WEB = {
  shipmentId: NO, status: 'AVAILABLE_FOR_DELIVERY', statusText: { header: 'Klar til henting', body: 'Sendingen kan hentes på Kiwi Pilestredet.' },
  estimatedTimeOfArrival: '2026-10-20T16:00:00', deliveryPoint: { displayName: 'Kiwi Pilestredet', name: 'KIWI PILESTREDET' },
  items: [{ itemId: NO, status: 'AVAILABLE_FOR_DELIVERY', events: [
    { eventTime: '2026-10-16T08:12:00', eventDescription: 'Sendingen er registrert hos PostNord', location: { displayName: 'Sandefjord' }, status: 'INFORMED' },
    { eventTime: '2026-10-17T05:40:00', eventDescription: 'Sendingen er ankommet terminal', location: { displayName: 'Oslo' }, status: 'EN_ROUTE' },
    { eventTime: '2026-10-18T09:05:00', eventDescription: 'Sendingen er klar til henting', location: { displayName: 'Kiwi Pilestredet' }, status: 'AVAILABLE_FOR_DELIVERY' },
  ] }],
};
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
function withFetch(handler) {
  const orig = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return (await handler(String(url), init)) ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

test('offentlig sporingslenke for PostNord', () => {
  assert.equal(C.trackUrl('postnord', NO), `https://www.postnord.no/pakkesporing/?shipmentId=${NO}`);
  assert.match(C.missingKeyText('postnord'), /offentlige sporingsside \(uoffisielt\).*ParcelsApp/);
});

test('statuskoder kartlegges til stegene', () => {
  const exp = { INFORMED: 'registered', EN_ROUTE: 'in_transit', AVAILABLE_FOR_DELIVERY: 'ready_for_pickup', READY_FOR_PICKUP: 'ready_for_pickup', DELIVERED: 'delivered', RETURNED: 'returned' };
  for (const [k, v] of Object.entries(exp)) assert.equal(C.postnordWebStatus(k), v, k);
});

test('uten nøkkel: status fra postnord.no (uoffisielt), med header x-bap-key og cache i 30 min', async () => {
  C._clearPostnordWebCache();
  const f = withFetch((url) => (url.includes('recipientview') ? json(WEB) : null));
  try {
    const r = await C.fetchStatus('postnord', NO);
    assert.equal(r.status, 'ready_for_pickup');
    assert.equal(r.via, 'postnord-web');
    assert.equal(r.unofficial, true);
    assert.equal(r.eta, '2026-10-20');
    assert.equal(r.pickupPoint, 'Kiwi Pilestredet');
    assert.deepEqual(r.pickup, { name: 'Kiwi Pilestredet', deadline: null });
    assert.equal(r.events.length, 3);
    assert.equal(r.events[0].status, 'Sendingen er klar til henting', 'nyeste først');
    assert.equal(r.events[1].location, 'Oslo');
    assert.equal(f.calls[0].init.headers['x-bap-key'], 'web-ncp');
    assert.match(f.calls[0].url, new RegExp(`recipientview\\?id=${NO}&locale=en`));
    await C.fetchStatus('postnord', NO);
    assert.equal(f.calls.length, 1, 'høyst ett oppslag per sending hver 30. minutt');
  } finally { f.restore(); }
});

test('endepunktet svarer HTML eller 403: stille videre til ParcelsApp', async () => {
  updateConfig({ trk_parcelsapp_key: 'pa-key' }, OWNER);
  for (const bad of [() => new Response('<!doctype html><html>Access denied</html>', { status: 200, headers: { 'content-type': 'text/html' } }), () => new Response('Forbidden', { status: 403 })]) {
    C._clearPostnordWebCache();
    kv.del(OWNER, 'parcelsapp_usage');
    const f = withFetch((url, init) => {
      if (url.includes('recipientview')) return bad();
      if (url.startsWith('https://parcelsapp.com') && init.method === 'POST') return json({ done: true, shipments: [{ status: 'delivered', states: [{ date: '2026-10-18T10:00:00Z', status: 'Delivered', location: 'Oslo' }] }] });
      return null;
    });
    try {
      const r = await C.fetchStatus('postnord', NO, { allowParcelsapp: true });
      assert.equal(r.via, 'parcelsapp');
      assert.equal(r.status, 'delivered');
      assert.ok(f.calls.some((c) => c.url.includes('recipientview')), 'prøvde postnord.no først');
    } finally { f.restore(); }
  }
  // Uten ParcelsApp-tillatelse (bakgrunnsjobben) feiler det uten å kaste noe uventet.
  C._clearPostnordWebCache();
  const f = withFetch((url) => (url.includes('recipientview') ? new Response('nei', { status: 403 }) : null));
  try { await assert.rejects(C.fetchStatus('postnord', NO)); } finally { f.restore(); }
  updateConfig({ trk_parcelsapp_key: null }, OWNER);
});

test('med nøkkel brukes det offisielle API-et, ikke nettsiden', async () => {
  updateConfig({ postnordKey: 'pn-key' }, OWNER);
  C._clearPostnordWebCache();
  const f = withFetch((url) => (url.includes('trackandtrace/findByIdentifier') ? json({ TrackingInformationResponse: { shipments: [{ status: 'DELIVERED', items: [{ events: [{ eventTime: '2026-10-18T10:00:00', eventDescription: 'Levert', location: { displayName: 'Oslo' } }] }] }] } }) : null));
  try {
    const r = await C.fetchStatus('postnord', NO);
    assert.equal(r.status, 'delivered');
    assert.ok(!f.calls.some((c) => c.url.includes('recipientview')));
  } finally { f.restore(); updateConfig({ postnordKey: null }, OWNER); }
});
