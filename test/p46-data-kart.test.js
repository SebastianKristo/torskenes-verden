// Prompt 46 (DATA46): Kart-API – holdeplasser (stopPlacesByBbox, cache 30 s), avganger (estimatedCalls 12 / 2 t), kjøretøy bare for valgte
// soner (sonesenter ± maks(3 × radius, 1200 m), ingen cache), søk (Geocoder venue), ET-Client-Name, demodata ved feil, brukervalg kart_v1,
// og personer/soner etter Familie sine delingsregler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p46k-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-46k';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4262';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const K = await import('../server/kart46.js');

let ipN = 80;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: j, text };
}
async function cookieFor(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipN++}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await cookieFor('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid Ekte' })).status, 200);
const I = as({ cookie: await cookieFor('ingrid', 'ingridPassord123') });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

function entur(handler) {
  const calls = [];
  K._setKartFetch46(async (url, init = {}) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return (await handler(url, init, calls.at(-1).body)) ?? new Response('{}', { status: 500 }); });
  return { calls, restore: () => K._setKartFetch46(null) };
}

test('personer: bare deg selv og dem som deler med deg (pause/av vises ikke), «Du» pulserer, sone de er i', async () => {
  // Ingrid deler ikke (standard av) → usynlig. Med deling på → synlig. Pause → borte igjen.
  const pos = { lat: 59.9276, lon: 10.7161, acc: 10, ts: Date.now() };
  assert.equal((await I('/api/family/location', 'POST', pos)).body.stored, 0, 'av: ingenting lagres');
  let p = (await A('/api/kart')).body.people;
  assert.ok(!p.some((x) => x.fullName === 'Ingrid Ekte'));
  assert.ok(!p.some((x) => x.fullName === 'Mormor'), 'demopersonen på pause vises ikke');
  await I('/api/family/me', 'PUT', { sharing: 'on', precision: 'exact' });
  await I('/api/family/location', 'POST', { ...pos, ts: Date.now() });
  p = (await A('/api/kart')).body.people;
  const ing = p.find((x) => x.fullName === 'Ingrid Ekte');
  assert.ok(ing, JSON.stringify(p));
  assert.ok(Math.abs(ing.lat - 59.9276) < 1e-6);
  assert.equal(ing.self, false);
  await I('/api/family/me', 'PUT', { precision: 'approx' });
  const approx = (await A('/api/kart')).body.people.find((x) => x.fullName === 'Ingrid Ekte');
  assert.equal(approx.approx, true, 'omtrentlig deling gir avrundet posisjon');
  await I('/api/family/me', 'PUT', { sharing: 'paused' });
  assert.ok(!(await A('/api/kart')).body.people.some((x) => x.fullName === 'Ingrid Ekte'), 'pause → ikke på kartet');
  // Du ser alltid deg selv («Du», pulserer) – her Ingrid med sin siste posisjon.
  const me = (await I('/api/kart')).body.people.find((x) => x.self);
  assert.equal(me?.name, 'Du');
  assert.equal(me.pulse, true);
  assert.equal(me.zone, 'Hjem', 'sonen personen er i');
});

test('soner fra Familie: egne og delte; sanntid kan bare slås på for soner du ser; kart_v1 lagres per bruker', async () => {
  const mine = (await I('/api/family/zones', 'POST', { name: 'Ingrids hemmelige', lat: 59.95, lon: 10.75, radius: 200, shared: false })).body;
  const k = (await A('/api/kart')).body;
  assert.equal(k.sourceText, 'DEMO-DATA');
  assert.ok(k.zones.some((z) => z.name === 'Hjem'));
  assert.ok(!k.zones.some((z) => z.id === mine.id), 'andres private sone vises ikke');
  const hjem = k.zones.find((z) => z.name === 'Hjem');
  const put = await A('/api/kart/prefs', 'PUT', { z: 25, c: [59.91, 10.75], show: { stops: false }, md: ['bus', 'fly'], vz: [hjem.id, mine.id] });
  assert.equal(put.status, 200);
  assert.equal(put.body.z, 14, 'ugyldig zoom ignoreres');
  assert.deepEqual(put.body.c, [59.91, 10.75]);
  assert.equal(put.body.show.stops, false);
  assert.deepEqual(put.body.md, ['bus']);
  assert.deepEqual(put.body.vz, [hjem.id], 'bare synlige soner');
  assert.deepEqual((await I('/api/kart/prefs')).body.vz, [], 'per bruker');
  const live = await A('/api/kart/live', 'POST', { zone: 'hjem', on: true });
  assert.equal(live.body.open.page, 'tkart');
  assert.equal((await A('/api/kart')).body.zones.find((z) => z.id === hjem.id).live, true);
});

test('kjøretøy: bare for valgte soner, område = senter ± maks(3 × radius, 1200 m), ET-Client-Name, ingen cache', async () => {
  const hjem = (await A('/api/kart')).body.zones.find((z) => z.name === 'Hjem');
  const box = K.zoneBox46(hjem);
  const R = Math.max(3 * hjem.radius, 1200);
  assert.ok(Math.abs((box.maxLat - hjem.lat) * 111320 - R) < 1);
  assert.ok(Math.abs(K.zoneBox46({ lat: 60, lon: 10, radius: 1000 }).maxLat - 60 - 3000 / 111320) < 1e-9, '3 × radius når større');
  const e = entur((url) => (url === 'https://api.entur.io/realtime/v2/vehicles/graphql'
    ? json({ data: { vehicles: [{ vehicleId: 'RUT:1', mode: 'BUS', bearing: 87, destinationName: 'Snarøya', lastUpdated: '2026-10-23T10:00:00Z', line: { publicCode: '31' }, location: { latitude: 59.928, longitude: 10.717 } },
      { vehicleId: 'RUT:2', mode: 'COACH', bearing: null, line: { publicCode: '250' }, location: { latitude: 59.929, longitude: 10.72 } }] } }) : null));
  try {
    const r = await A('/api/kart/vehicles');
    assert.equal(r.body.source, 'entur');
    assert.equal(r.body.vehicles.length, 2);
    assert.deepEqual(r.body.vehicles.map((v) => v.mode), ['bus', 'bus'], 'coach → buss');
    assert.equal(r.body.vehicles[0].line, '31');
    assert.equal(r.body.vehicles[0].bearing, 87);
    assert.equal(r.body.pollMs, 10_000);
    assert.equal(e.calls[0].init.headers['ET-Client-Name'], 'kristo-homelab');
    assert.match(e.calls[0].body.query, new RegExp(`minLat:${box.minLat.toFixed(5)},minLon:${box.minLon.toFixed(5)},maxLat:${box.maxLat.toFixed(5)},maxLon:${box.maxLon.toFixed(5)}`));
    await A('/api/kart/vehicles');
    assert.equal(e.calls.length, 2, 'ingen cache for kjøretøy');
    const none = await A('/api/kart/vehicles?zones=999999');
    assert.equal(none.body.vehicles.length, 0, 'ukjent/annens sone gir ingen kall');
    assert.equal(e.calls.length, 2);
  } finally { e.restore(); }
});

test('holdeplasser i utsnittet: Entur-form → fem moduser, cache 30 s, for stort utsnitt avvises; Entur nede → demodata', async () => {
  K._clearKart46();
  const e = entur((url, init, body) => (body?.query?.includes('stopPlacesByBbox') ? json({ data: { stopPlacesByBbox: [
    { id: 'NSR:StopPlace:6505', name: 'Bislett', latitude: 59.9255, longitude: 10.732, transportMode: ['tram'] },
    { id: 'NSR:StopPlace:1', name: 'Kaia', latitude: 59.91, longitude: 10.73, transportMode: ['ferry', 'coach'] }] } }) : null));
  try {
    const r = await A('/api/kart/stops?bbox=59.90,10.70,59.94,10.78');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.source, 'entur');
    assert.deepEqual(r.body.stops[1].modes, ['water', 'bus']);
    assert.match(e.calls[0].body.query, /stopPlacesByBbox\(minimumLatitude:59\.90000,maximumLatitude:59\.94000,minimumLongitude:10\.70000,maximumLongitude:10\.78000\)/);
    await A('/api/kart/stops?minLat=59.90&minLon=10.70&maxLat=59.94&maxLon=10.78');
    assert.equal(e.calls.length, 1, 'cache 30 s');
    const big = await A('/api/kart/stops?bbox=59,10,61,12');
    assert.equal(big.body.tooBig, true);
    assert.equal((await A('/api/kart/stops?bbox=a,b,c,d')).status, 400);
  } finally { e.restore(); }
  K._clearKart46();
  const down = entur(() => new Response('nede', { status: 503 }));
  try {
    const r = await A('/api/kart/stops?bbox=59.90,10.70,59.94,10.78');
    assert.equal(r.body.source, 'demo');
    assert.ok(r.body.stops.length > 0);
  } finally { down.restore(); }
});

test('avganger: 12 stk / 2 t med linje, destinasjon, plattform, minutter og forsinkelse; søk med layers=venue', async () => {
  const now = Date.now(), at = (m) => new Date(now + m * 60_000).toISOString();
  const e = entur((url, init, body) => {
    if (url.startsWith('https://api.entur.io/geocoder/v1/autocomplete')) return json({ features: [{ geometry: { coordinates: [10.732, 59.9255] }, properties: { id: 'NSR:StopPlace:6505', name: 'Bislett', label: 'Bislett, Oslo', category: ['onstreetTram'] } }] });
    if (body?.query?.includes('estimatedCalls')) {
      assert.deepEqual(body.variables, { id: 'NSR:StopPlace:6505' });
      assert.match(body.query, /estimatedCalls\(numberOfDepartures:12,timeRange:7200\)/);
      return json({ data: { stopPlace: { id: 'NSR:StopPlace:6505', name: 'Bislett', transportMode: ['tram'], estimatedCalls: [
        { realtime: true, aimedDepartureTime: at(4), expectedDepartureTime: at(7), destinationDisplay: { frontText: 'Ljabru' }, quay: { publicCode: 'A' }, serviceJourney: { line: { publicCode: '19', transportMode: 'tram' } } }] } } });
    }
    return null;
  });
  try {
    const d = await A('/api/kart/stops/NSR:StopPlace:6505/departures');
    assert.equal(d.body.source, 'entur');
    const c0 = d.body.calls[0];
    assert.deepEqual([c0.line, c0.mode, c0.to, c0.platform, c0.delayMin, c0.realtime], ['19', 'tram', 'Ljabru', 'A', 3, true]);
    assert.ok(c0.minutes >= 6 && c0.minutes <= 7);
    assert.equal((await A('/api/kart/stops/DROP%20TABLE/departures')).status, 400);
    const s = await A('/api/kart/search?q=bislett');
    assert.match(e.calls.at(-1).url, /layers=venue/);
    assert.equal(e.calls.at(-1).init.headers['ET-Client-Name'], 'kristo-homelab');
    assert.deepEqual(s.body.results[0].modes, ['tram']);
    assert.equal(s.body.results[0].lat, 59.9255);
  } finally { e.restore(); }
  assert.equal((await req('/api/kart')).status, 401, 'krever innlogging');
});
