// Prompt 47 (GLIMT47) Steg D: den felles datoparseren (server/glimt45/dates.js) og værets tidsvinduer. Fryst «nå»: lørdag
// 24. oktober 2026 kl. 10:00 Europe/Oslo. Ren funksjon, ingen server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNorwegianDateTime, parseWindow47, whenOf45, parseDate45, afterChristmas45 } from '../server/glimt45/dates.js';
import { analyzeWeather46, isCompoundWeather46 } from '../server/glimt45/weather46.js';

const NOW = { today: '2026-10-24', nowMin: 600 };
const P = (t, now = NOW) => parseNorwegianDateTime(t, now);

test('oppdragets eksempler: 17.12 17.30, 3/2 kl 0815, fredag kl 18', () => {
  assert.deepEqual([P('Skal se Dune på Colosseum kino 17.12 17.30').date, P('Skal se Dune på Colosseum kino 17.12 17.30').start], ['2026-12-17', '17:30']);
  assert.deepEqual([P('Tannlege 3/2 kl 0815').date, P('Tannlege 3/2 kl 0815').start], ['2027-02-03', '08:15']);
  assert.deepEqual([P('Middag hos mamma på fredag kl 18').date, P('Middag hos mamma på fredag kl 18').start], ['2026-10-30', '18:00']);
});
test('dato uten år = neste forekomst fremover', () => {
  assert.equal(P('17.12').date, '2026-12-17');
  assert.equal(P('17/12').date, '2026-12-17');
  assert.equal(P('17. desember').date, '2026-12-17');
  assert.equal(P('1.10').date, '2027-10-01', 'passert i år → neste år');
  assert.equal(P('24.10 kl 12').date, '2026-10-24', 'i dag teller som fremover');
  assert.equal(P('17.12.26').date, '2026-12-17');
});
test('klokkeslett: 17.30, 17:30, kl 1730, kl. 07.15', () => {
  assert.equal(P('møte 17:30 i morgen').start, '17:30');
  assert.equal(P('kino i morgen 17.30').start, '17:30');
  assert.equal(P('møte kl 1730').start, '17:30');
  assert.equal(P('kl 1730').date, '2026-10-24', 'tid uten dato som ikke er passert = i dag');
  assert.equal(P('kl 0815').date, '2026-10-25', 'tid uten dato som er passert = i morgen');
  assert.equal(P('lege i morgen kl. 07.15').start, '07:15');
});
test('relative dager: i dag, i morgen, i overmorgen, neste uke', () => {
  assert.equal(P('i dag').date, '2026-10-24');
  assert.equal(P('i morgen').date, '2026-10-25');
  assert.equal(P('i overmorgen').date, '2026-10-26');
  assert.equal(P('neste uke').date, '2026-10-26', '«neste uke» alene = mandag neste uke');
});
test('ukedag-regelen: neste forekomst; i dag bare hvis klokkeslettet ikke er passert', () => {
  assert.equal(P('på fredag').date, '2026-10-30');
  assert.equal(P('neste fredag').date, '2026-10-30');
  assert.equal(P('lørdag').date, '2026-10-24', 'samme ukedag uten klokkeslett = i dag');
  assert.equal(P('på lørdag kl 18').date, '2026-10-24', 'kl 18 er ikke passert kl 10');
  assert.equal(P('på lørdag kl 9').date, '2026-10-31', 'kl 09 er passert → om en uke');
  assert.equal(P('neste lørdag').date, '2026-10-31', '«neste» på samme ukedag = om en uke');
  assert.equal(parseDate45('forrige lørdag', '2026-10-24', { prefer: 'past' }).date, '2026-10-17');
});
test('om N timer/minutter, neste time, i kveld, i natt (tidsvinduer)', () => {
  assert.deepEqual([P('om 2 timer').date, P('om 2 timer').start], ['2026-10-24', '12:00']);
  assert.equal(P('om en halvtime').start, '10:30');
  assert.equal(P('om 30 minutter').start, '10:30');
  assert.deepEqual([P('om 15 timer').date, P('om 15 timer').start], ['2026-10-25', '01:00'], 'over midnatt → i morgen');
  const nh = parseWindow47('neste time', NOW.today, NOW.nowMin);
  assert.deepEqual([nh.kind, nh.from, nh.fromMin, nh.toMin, nh.label], ['hour', '2026-10-24', 600, 660, 'neste time']);
  const kv = parseWindow47('i kveld', NOW.today, NOW.nowMin);
  assert.deepEqual([kv.kind, kv.from, kv.fromMin, kv.toMin], ['evening', '2026-10-24', 1080, 1440]);
  const n = parseWindow47('i natt', NOW.today, NOW.nowMin);
  assert.deepEqual([n.kind, n.from, n.to, n.fromMin, n.toMin], ['night', '2026-10-24', '2026-10-25', 1380, 360]);
  assert.equal(P('i kveld').date, '2026-10-24');
  assert.equal(parseWindow47('i morgen', NOW.today, NOW.nowMin), null, 'hel dag er ikke et timevindu');
});
test('etter jul = første hverdag etter nyttår', () => {
  assert.equal(P('etter jul').date, '2027-01-04', '2. januar 2027 er en lørdag → mandag 4.');
  assert.equal(afterChristmas45('2026-12-27'), '2027-01-04');
  assert.equal(afterChristmas45('2027-01-05'), '2028-01-03', 'etter at julen er over: neste jul (2. jan 2028 er søndag → mandag 3.)');
});
test('feil: dato som ikke finnes gir feilmelding, ikke gjetting', () => {
  assert.ok(whenOf45('31.02', NOW.today).errors.length);
  assert.ok(whenOf45('kl 25', NOW.today).errors.length);
});
test('vær: «Oslo neste time og New York i morgen» = to delspørsmål med egne vinduer (feilen i weather46 er rettet)', () => {
  const a = analyzeWeather46('Hvordan er været i Oslo neste time og i New York i morgen?', NOW.today, NOW.nowMin);
  assert.deepEqual(a.requests.map((r) => [r.place, r.when.kind, r.when.from, r.when.label]), [['Oslo', 'hour', '2026-10-24', 'neste time'], ['New York', 'day', '2026-10-25', 'i morgen']]);
  assert.ok(isCompoundWeather46('hvordan er været i oslo neste time og været i new york imorgen', NOW.today, NOW.nowMin));
  // Ledd uten egen tid før et ledd med tid ble droppet før (ws = [null]); nå arver det tiden.
  const b = analyzeWeather46('været i Oslo og i New York i morgen', NOW.today, NOW.nowMin);
  assert.deepEqual(b.requests.map((r) => [r.place, r.when.from]), [['Oslo', '2026-10-25'], ['New York', '2026-10-25']]);
  const c = analyzeWeather46('Regner det i Bergen om 2 timer?', NOW.today, NOW.nowMin);
  assert.deepEqual([c.requests[0].place, c.requests[0].when.kind, c.requests[0].when.fromMin], ['Bergen', 'hour', 690]);
});
