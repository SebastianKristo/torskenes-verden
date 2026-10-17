import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeather, nowcastText, windDirText, uvText, symbolIcon, sunTime, osloOffset } from '../server/weather.js';
import { mockForecast, mockNowcast } from '../server/mock.js';

const NOW = Date.parse('2026-10-17T10:15:00Z');

test('værmeldingen har feltene i kontrakten', () => {
  const w = buildWeather({ forecast: mockForecast(NOW), nowcast: mockNowcast(NOW), place: 'Oslo', now: NOW });
  for (const k of ['feels', 'hi', 'lo', 'symbol', 'windInfo', 'precipNow', 'precip24', 'humidity', 'dew', 'uv', 'pressure', 'pressureTrend', 'visibility', 'sunrise', 'sunset', 'dayLength', 'nowcast', 'hours', 'days']) {
    assert.ok(k in w, `mangler ${k}`);
  }
  assert.equal(typeof w.wind, 'number', 'wind er fortsatt et tall for eldre klienter');
  assert.deepEqual(Object.keys(w.windInfo).sort(), ['dir', 'dirText', 'gust', 'speed']);
  assert.equal(w.hours.length, 8);
  assert.equal(w.hours[0].t, 'Nå');
  assert.equal(w.days.length, 6);
  assert.equal(w.days[0].label, 'I dag');
  assert.ok(w.days.every((d) => d.min <= d.max && typeof d.mm === 'number' && d.icon));
  assert.equal(w.windInfo.dirText, 'Sørvest');
  assert.equal(w.pressureTrend, 'Synkende');
  assert.ok(w.nowcast.text.startsWith('Regnet gir seg rundt'));
});

test('nedbør telles ikke dobbelt når timer og 6-timers steg overlapper', () => {
  const t0 = Date.parse('2026-10-17T00:00:00Z');
  const step = (h, a, b) => ({ time: new Date(t0 + h * 3600_000).toISOString(), data: { instant: { details: { air_temperature: 5, wind_speed: 1 } },
    ...(a != null && { next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: a } } }),
    next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: b } } } });
  const ts = [];
  for (let h = 0; h < 6; h++) ts.push(step(h, 1, 6)); // 6 timer à 1 mm (6-timers summen på 6 skal ikke legges til)
  ts.push(step(6, null, 12), step(12, null, 0), step(18, null, 3)); // deretter bare 6-timers steg
  const w = buildWeather({ forecast: { properties: { timeseries: ts } }, now: t0 });
  assert.equal(w.precip24, 21);
});

test('nowcast-tekst: opphold, regn som starter og som gir seg', () => {
  const nc = (rates) => ({ properties: { timeseries: rates.map((r, i) => ({ time: new Date(NOW + i * 300_000).toISOString(), data: { instant: { details: { precipitation_rate: r } } } })) } });
  assert.equal(nowcastText(nc(Array(19).fill(0)), [], 5), 'Opphold de neste 90 minuttene.');
  assert.match(nowcastText(nc([0, 0, 0, 1, 1]), [], 5), /^Regn fra rundt \d\d:\d\d\.$/);
  assert.match(nowcastText(nc([1, 1, 0, 0]), [], -2), /^Snøen gir seg rundt/);
  assert.equal(nowcastText(nc(Array(19).fill(2)), [], 5), 'Regn de neste 90 minuttene.');
  // Uten Nowcast brukes timene.
  assert.equal(nowcastText(null, [{ t: 'Nå', mm: 0 }, { t: '14', mm: 0.4 }], 5), 'Regn fra rundt 14:00.');
});

test('hjelpere: vindretning, UV, ikoner, sol og tidssone', () => {
  assert.equal(windDirText(0), 'Nord');
  assert.equal(windDirText(225), 'Sørvest');
  assert.equal(windDirText(350), 'Nord');
  assert.equal(uvText(0), 'Lav');
  assert.equal(uvText(7), 'Høy');
  assert.equal(symbolIcon('clearsky_night'), 'moon');
  assert.equal(symbolIcon('partlycloudy_day'), 'part');
  assert.equal(symbolIcon('heavyrainandthunder'), 'thunder');
  assert.equal(symbolIcon('lightsleet'), 'snow');
  const rise = sunTime('2026-10-17', 59.91, 10.75, -0.833, true), set = sunTime('2026-10-17', 59.91, 10.75, -0.833, false);
  const osloH = (d) => +d.toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });
  assert.ok(osloH(rise) >= 7 && osloH(rise) <= 8, 'soloppgang i Oslo midt i oktober er rundt 08');
  assert.ok(osloH(set) >= 17 && osloH(set) <= 18);
  assert.equal(sunTime('2026-12-21', 78.2, 15.6, -0.833, true), null, 'mørketid på Svalbard');
  assert.equal(osloOffset(new Date('2026-07-01T12:00:00Z')), '+02:00');
  assert.equal(osloOffset(new Date('2026-01-15T12:00:00Z')), '+01:00');
});
