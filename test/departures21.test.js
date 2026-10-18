// Prompt 21: avganger med holdeplasser (serviceJourney.estimatedCalls), transportmåte, plattform, forsinkelse,
// status og Ruter-lenke. Entur mockes; sandkassen har ikke nett.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-dep21-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: fin } = await import('../server/finans/routes.js');
const { default: mobile } = await import('../server/mobile.js');
const ext = await import('../server/integrations.js');

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const M = async (path) => { const r = await mobile.request(path, { headers: { authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; };

const T = (h, m) => new Date(Date.UTC(2030, 0, 15, h - 1, m)).toISOString(); // Oslo = UTC+1 i januar
const call = (name, sp, code, t, { arr = t, dep = t } = {}) => ({ quay: { id: `${sp}:Q${code ?? ''}`, name, publicCode: code, stopPlace: { id: sp, name } }, aimedArrivalTime: arr, expectedArrivalTime: arr, aimedDepartureTime: dep, expectedDepartureTime: dep });
const ENTUR = {
  data: { stopPlace: { id: 'NSR:StopPlace:58381', name: 'Amagerveien', estimatedCalls: [{
    aimedDepartureTime: T(19, 1), expectedDepartureTime: T(19, 1), realtime: true, cancellation: false,
    quay: { id: 'NSR:StopPlace:58381:QB', publicCode: 'B', name: 'Amagerveien' }, destinationDisplay: { frontText: 'Grefsen st.' }, situations: [],
    serviceJourney: { line: { publicCode: '17', transportMode: 'tram', presentation: { colour: '0B91EF', textColour: 'FFFFFF' } }, estimatedCalls: [
      call('Rikshospitalet', 'NSR:StopPlace:1', 'A', T(18, 50)), call('Amagerveien', 'NSR:StopPlace:58381', 'B', T(19, 1)),
      call('Grefsenveien', 'NSR:StopPlace:2', null, T(19, 4)), call('Kjelsåsveien', 'NSR:StopPlace:3', null, T(19, 6)),
      call('Grefsen st.', 'NSR:StopPlace:4', null, T(19, 9), { dep: null }),
    ] },
  }, {
    aimedDepartureTime: T(19, 5), expectedDepartureTime: T(19, 8), realtime: true, cancellation: false,
    quay: { id: 'NSR:StopPlace:58381:Q1', publicCode: '1', name: 'Amagerveien' }, destinationDisplay: { frontText: 'Majorstuen' }, situations: [],
    serviceJourney: { line: { publicCode: '20', transportMode: 'bus', presentation: null }, estimatedCalls: [call('Amagerveien', 'NSR:StopPlace:58381', '1', T(19, 8)), call('Majorstuen', 'NSR:StopPlace:5', null, T(19, 20))] },
  }, {
    aimedDepartureTime: T(19, 7), expectedDepartureTime: T(19, 7), cancellation: true, quay: { id: 'x', publicCode: null }, destinationDisplay: { frontText: 'Vestli' },
    serviceJourney: { line: { publicCode: '5', transportMode: 'metro' } },
  }] } },
};

test('stopp fra valgt holdeplass til endestasjonen, med mode, plattform, forsinkelse, status og ruterUrl', () => {
  const r = ext.stopDeparturesOut(ENTUR.data.stopPlace, Date.parse(T(18, 59)));
  const [a, b, c] = r.departures;
  assert.equal(a.line, '17');
  assert.equal(a.mode, 'tram');
  assert.equal(a.modeName, 'Trikk');
  assert.equal(a.platform, 'B');
  assert.equal(a.delayMin, 0);
  assert.equal(a.status, 'i rute');
  assert.equal(a.minutes, 2);
  assert.equal(a.clock, '19:01');
  assert.deepEqual(a.stops.map((s) => [s.name, s.clock]), [['Amagerveien', '19:01'], ['Grefsenveien', '19:04'], ['Kjelsåsveien', '19:06'], ['Grefsen st.', '19:09']]);
  assert.equal(a.stopsCount, 4);
  assert.equal(a.stops[0].platform, 'B');
  for (const k of ['name', 'platform', 'time', 'aimed', 'expected']) assert.ok(k in a.stops[0], k);
  assert.equal(a.stops[3].time, T(19, 9), 'endestasjonen bruker ankomsttiden');
  assert.match(a.ruterUrl, /^https:\/\/reise\.ruter\.no\/\?fromId=__NSR-StopPlace-58381__.*toId=__NSR-StopPlace-4__.*toName=__Grefsen%20st\.__/);
  assert.equal(b.modeName, 'Buss');
  assert.equal(b.delayMin, 3);
  assert.equal(b.status, '3 min forsinket');
  assert.equal(b.stops.length, 2);
  assert.equal(c.status, 'innstilt');
  assert.deepEqual(c.stops, []);
  assert.equal(c.modeName, 'T-bane');
});

test('getStopDepartures spør Entur om serviceJourney.estimatedCalls med ET-Client-Name', async () => {
  const orig = globalThis.fetch;
  let body = null, headers = null;
  globalThis.fetch = async (url, opts) => { body = JSON.parse(opts.body); headers = opts.headers; return new Response(JSON.stringify(ENTUR), { headers: { 'content-type': 'application/json' } }); };
  try {
    const r = await ext.getStopDepartures('NSR:StopPlace:58381', 3);
    assert.match(body.query, /serviceJourney\{[^}]*line\{[\s\S]*estimatedCalls\{ quay\{ id name publicCode stopPlace\{ id name \} \}/);
    assert.ok(headers['ET-Client-Name']);
    assert.equal(r.departures[0].stops.length, 4);
    const w = await ext.getDepartures('58381');
    assert.equal(w.departures[0].stops.length, 4);
    assert.equal(w.departures[0].status, 'i rute');
  } finally { globalThis.fetch = orig; }
});

test('MOCK_DATA: 17 Grefsen st. med fire stopp i /ruter/departures, /widgets/ruter og på forsiden', async () => {
  const d = await M('/ruter/departures?stop=NSR:StopPlace:58381&n=6');
  assert.equal(d.status, 200);
  const g = d.body.departures[0];
  assert.equal(g.line, '17');
  assert.equal(g.to, 'Grefsen st.');
  assert.equal(g.modeName, 'Trikk');
  assert.equal(g.platform, 'B');
  assert.equal(g.status, 'i rute');
  assert.deepEqual(g.stops.map((s) => s.name), ['Amagerveien', 'Grefsenveien', 'Kjelsåsveien', 'Grefsen st.']);
  const mins = g.stops.map((s) => Math.round((Date.parse(s.time) - Date.parse(g.stops[0].time)) / 60000));
  assert.deepEqual(mins, [0, 3, 5, 8]);
  assert.ok(d.body.departures.some((x) => /min forsinket/.test(x.status)));
  assert.ok(d.body.departures.some((x) => x.stops.length > 6), 'noen turer har mer enn 6 stopp');
  const w = await M('/widgets/ruter');
  assert.equal(w.body.departures[0].line, '17');
  assert.equal(w.body.departures[0].stops.length, 4);
  assert.equal(typeof w.body.departures[0].time, 'string');
  const home = await M('/mobile/home');
  assert.ok(home.body.stops[0].departures[0].stops.length >= 2);
});
