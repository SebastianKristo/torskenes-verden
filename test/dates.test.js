// server/dates/: «i dag» i Oslo, kalenderhjelpere og POST /api/dates/parse. Fasiten for selve tolkingen står i
// shared/testvektorer/datoer.json (test/testvektorer.test.js); her testes kantene rundt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { osloDate, osloParts, osloToUtc, clampDate, addDays, daysBetween, mondayOf, lastDayOfMonth } from '../server/dates/oslo.js';
import { parseDatesRequest, holidaysRequest } from '../server/dates/api.js';
import { validate } from './lib/json-schema.mjs';
import { holidaysOfYear, easter } from '../server/dates/holidays.js';

test('dates/oslo: osloDate godtar Date, ms og ISO-streng, og gir null for ugyldig', () => {
  assert.equal(osloDate(new Date('2026-11-15T23:30:00Z')), '2026-11-16');
  assert.equal(osloDate(Date.parse('2026-06-30T22:00:00Z')), '2026-07-01');
  assert.equal(osloDate('2026-03-28T22:59:59Z'), '2026-03-28');
  assert.equal(osloDate('tull'), null);
  assert.deepEqual(osloParts('2026-11-16T11:05:00Z'), { year: 2026, month: 11, day: 16, hour: 12, minute: 5, second: 0, weekday: 1, date: '2026-11-16', minutes: 725 });
});

test('dates/oslo: osloToUtc tar hensyn til sommertid', () => {
  assert.equal(osloToUtc('2026-11-16', '09:00').toISOString(), '2026-11-16T08:00:00.000Z');
  assert.equal(osloToUtc('2026-07-01', '09:00').toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(osloToUtc('2026-03-29', '03:00').toISOString(), '2026-03-29T01:00:00.000Z'); // første time i sommertid
  assert.equal(osloToUtc('2026-10-25', '12:00').toISOString(), '2026-10-25T11:00:00.000Z'); // første dag i vintertid
});

test('dates/oslo: kalenderhjelpere (dagen glir ikke, måneden kan gå over året)', () => {
  assert.equal(clampDate(2026, 2, 31), '2026-02-28');
  assert.equal(clampDate(2028, 2, 31), '2028-02-29');
  assert.equal(clampDate(2026, 14, 31), '2027-02-28');
  assert.equal(clampDate(2026, 0, 15), '2025-12-15');
  assert.equal(lastDayOfMonth(2026, 4), 30);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-16', '2026-12-04'), 18);
  assert.equal(mondayOf('2026-11-22'), '2026-11-16');
});

test('«i dag» regnes aldri i UTC eller prosessens tidssone på serveren (Q20)', () => {
  const filer = [];
  const finn = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) finn(p); else if (p.endsWith('.js')) filer.push(p); } };
  finn(fileURLToPath(new URL('../server', import.meta.url)));
  // «Nå» som UTC-dato eller i prosessens tidssone. Bevisst UTC merkes med «// UTC» på linja.
  const FEIL = [/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/, /new Date\(Date\.now\(\)[^;]*\)\.toISOString\(\)\.slice\(0, ?10\)/, /new Date\(\)\.toLocaleDateString\('sv-SE'\)/];
  const funn = [];
  for (const f of filer) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (!l.includes('// UTC') && FEIL.some((re) => re.test(l))) funn.push(`${f.split('/server/')[1]}:${i + 1}`); });
  }
  assert.deepEqual(funn, [], 'bruk osloDate()/today() fra server/dates/oslo.js');
});

test('helligdager og merkedager (Q18): bevegelige datoer, type og fri, samme som appenes innebygde liste', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  const y = holidaysOfYear(2026);
  assert.equal(y.filter((h) => h.type === 'helligdag').length, 12);
  assert.deepEqual(y.filter((h) => h.type === 'merkedag').map((h) => [h.date, h.name, h.fri]), [['2026-03-29', 'Palmesøndag', false], ['2026-12-24', 'Julaften', false], ['2026-12-31', 'Nyttårsaften', false]]);
  assert.ok(y.every((h, i) => i === 0 || y[i - 1].date <= h.date), 'sortert');
  assert.equal(y.find((h) => h.name === 'Arbeidernes dag').date, '2026-05-01');
  const r = holidaysRequest({ year: '2027' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 15);
  assert.deepEqual(holidaysRequest({ from: '2026-12-20', to: '2026-12-31' }).body.items.map((h) => h.name), ['Julaften', 'Første juledag', 'Andre juledag', 'Nyttårsaften']);
  assert.equal(holidaysRequest({ year: 'x' }).body.code, 'INVALID_YEAR');
  assert.equal(holidaysRequest({ from: '2026-12-31', to: '2026-01-01' }).status, 400);
});

test('POST /api/dates/parse: svarform og feil', () => {
  const ok = parseDatesRequest({ text: 'tannlege fredag halv tre', now: '2026-11-16T10:00:00+01:00' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { date: '2026-11-20', time: '14:30', end: null, allDay: false, rest: 'tannlege', label: 'fredag 20. november kl. 14:30', today: '2026-11-16', dateText: 'fredag', timeText: 'halv tre', errors: [] });
  const heleDagen = parseDatesRequest({ text: 'overmorgen', now: Date.parse('2026-11-15T23:30:00Z') }).body; // 00:30 i Oslo
  assert.equal(heleDagen.today, '2026-11-16');
  assert.equal(heleDagen.date, '2026-11-18');
  assert.equal(heleDagen.allDay, true);
  const ingen = parseDatesRequest({ text: 'kjøp melk', now: '2026-11-16T10:00:00+01:00' }).body;
  assert.equal(ingen.date, null);
  assert.equal(ingen.allDay, false);
  assert.equal(ingen.label, null);
  for (const r of [ok, heleDagen, ingen]) assert.deepEqual(validate('api/dates-parse.schema.json', r.body ?? r), []);
  assert.equal(parseDatesRequest({}).body.code, 'TEXT_REQUIRED');
  assert.equal(parseDatesRequest({ text: 'x'.repeat(501) }).body.code, 'TEXT_TOO_LONG');
  assert.equal(parseDatesRequest({ text: 'i dag', now: 'i går' }).status, 400);
});
