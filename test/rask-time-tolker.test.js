// Prompt 29 (SERVER29): felles tolker for rask time (public/js/quick-time.js).
// Dagens dato i testene: mandag 19. oktober 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, quickLabel, NO_DATE, NO_TIME, osloTodayISO } from '../public/js/quick-time.js';

const T = '2026-10-19'; // mandag
const P = (s, t = T) => parseQuick(s, t);
const pick = (r, ...k) => Object.fromEntries(k.map((x) => [x, r[x]]));

test('fasit-eksempelet: Nina frisør 14.30 25.09', () => {
  const r = P('time hos Nina frisør 14.30 25.09');
  assert.deepEqual(pick(r, 'ok', 'title', 'date', 'start', 'end', 'type', 'isAppointment'),
    { ok: true, title: 'Nina frisør', date: '2027-09-25', start: '14:30', end: '15:15', type: 'frisør', isAppointment: true });
  assert.equal(quickLabel(r), 'lør 25. sep · 14:30');
  // Før datoen i år → samme år
  assert.equal(P('time hos Nina frisør 14.30 25.09', '2026-09-01').date, '2026-09-25');
  assert.equal(quickLabel(P('time hos Nina frisør 14.30 25.09', '2026-09-01')), 'fre 25. sep · 14:30');
});

test('datoformer', () => {
  assert.equal(P('lege 25.09.2026').date, '2026-09-25');
  assert.equal(P('lege 25.09.27').date, '2027-09-25');
  assert.equal(P('lege 3. november').date, '2026-11-03');
  assert.equal(P('lege 3 nov 2027').date, '2027-11-03');
  assert.equal(P('lege 3. januar').date, '2027-01-03'); // passert → neste år
  assert.equal(P('lege i dag kl 10').date, '2026-10-19');
  assert.equal(P('lege i kveld kl 19').date, '2026-10-19');
  assert.equal(P('lege i morgen kl 10').date, '2026-10-20');
  assert.equal(P('lege i overmorgen kl 10').date, '2026-10-21');
  assert.equal(P('dagens dato er i dag 19.10').date, '2026-10-19'); // dato i dag = ikke passert
});

test('ukedager = neste forekomst, «neste uke»', () => {
  assert.equal(P('frisør tirsdag kl 9').date, '2026-10-20');
  assert.equal(P('frisør fredag kl 9').date, '2026-10-23');
  assert.equal(P('frisør søndag kl 9').date, '2026-10-25');
  assert.equal(P('frisør mandag kl 9').date, '2026-10-26'); // i dag er mandag → neste uke
  assert.equal(P('frisør neste fredag kl 9').date, '2026-10-23');
  assert.equal(P('legetime torsdag neste uke 8.15').date, '2026-10-29');
  assert.equal(P('legetime tirsdag neste uke', '2026-10-22').date, '2026-10-27'); // torsdag → tirsdag neste uke
  assert.equal(P('tannlege neste uke').date, '2026-10-26'); // mandag neste uke, hele dagen
  assert.equal(P('tannlege neste uke').allDay, true);
});

test('klokkeslett og intervall', () => {
  assert.equal(P('lege 25.10 14:30').start, '14:30');
  assert.equal(P('lege 25.10 kl 9').start, '09:00');
  assert.equal(P('lege 25.10 kl. 09:15').start, '09:15');
  assert.equal(P('lege 25.10 klokka 8').start, '08:00');
  const r = P('fysio fredag 14.30–15.15');
  assert.deepEqual(pick(r, 'start', 'end', 'date'), { start: '14:30', end: '15:15', date: '2026-10-23' });
  assert.deepEqual(pick(P('møte 25.10 9.00-10.30'), 'start', 'end'), { start: '09:00', end: '10:30' });
  assert.deepEqual(pick(P('møte 25.10 kl 9-11'), 'start', 'end'), { start: '09:00', end: '11:00' });
});

test('tid vs dato-regelen', () => {
  // minutter > 12 → tid
  assert.deepEqual(pick(P('frisør 14.30 i morgen'), 'start', 'date'), { start: '14:30', date: '2026-10-20' });
  // dag > 23 → dato
  assert.deepEqual(pick(P('frisør 25.09 kl 10'), 'start', 'date'), { start: '10:00', date: '2027-09-25' });
  // tvetydig, dato finnes → tid
  assert.deepEqual(pick(P('frisør i morgen 10.05'), 'start', 'date'), { start: '10:05', date: '2026-10-20' });
  // tvetydig, tid finnes → dato
  assert.deepEqual(pick(P('frisør kl 14 10.11'), 'start', 'date'), { start: '14:00', date: '2026-11-10' });
  // to tvetydige: første tid (kolon), andre dato
  assert.deepEqual(pick(P('frisør 10:05 11.11'), 'start', 'date'), { start: '10:05', date: '2026-11-11' });
  // tvetydig alene → dato, hele dagen
  const r = P('frisør 10.05');
  assert.equal(r.date, '2027-05-10');
  assert.equal(r.start, null);
  assert.equal(r.allDay, true);
  assert.equal(r.why, NO_TIME);
  // ugyldig dato
  assert.equal(P('vaksine 31.02').ok, false);
});

test('tittel etter «hos», ellers type', () => {
  assert.equal(P('Time hos fastlege Hansen tirsdag kl 9').title, 'Fastlege Hansen');
  assert.equal(P('time hos Dr. Berg 3. november 10:00').title, 'Dr. Berg');
  assert.equal(P('time hos Dr. Berg 3. november 10:00').type, 'lege');
  assert.equal(P('Avtale hos Nina frisør, fredag 12:00').title, 'Nina frisør');
  assert.equal(P('Tannlege i morgen kl. 09:15').title, 'Tannlege');
  assert.equal(P('legetime 25.10 kl 8').title, 'Lege');
  assert.equal(P('kiropraktor fredag kl 8').title, 'Fysioterapi');
  assert.equal(P('middag hos mormor søndag 15:00').title, 'Middag hos mormor');
  assert.equal(P('Time hos Ola kl 10 fredag frisør').title, 'Frisør · Ola');
  assert.equal(P('Middag med Per fredag kl 18').title, 'Middag med Per');
  assert.equal(P('legg til avtale fredag kl 18').title, 'Avtale');
});

test('sted', () => {
  const msg = 'Påminnelse: Du har time hos Tannklinikken Majorstuen 12.11.2026 kl. 08:30.\nAdresse: Kirkeveien 64, 0364 Oslo\nTa med kort. Avbestilling senest 24 t før.';
  const r = P(msg);
  assert.deepEqual(pick(r, 'ok', 'title', 'date', 'start', 'end', 'place', 'type'),
    { ok: true, title: 'Tannklinikken Majorstuen', date: '2026-11-12', start: '08:30', end: '09:30', place: 'Kirkeveien 64, 0364 Oslo', type: 'tannlege' });
  assert.equal(P('lege fredag kl 9. Sted: Legesenteret Bislett. Hilsen').place, 'Legesenteret Bislett');
  assert.equal(P('lege fredag kl 9; Oppmøte: Ullevål sykehus, bygg 3').place, 'Ullevål sykehus, bygg 3');
  assert.equal(P('klipp på Colosseum Majorstuen fredag kl 13').place, 'Colosseum Majorstuen');
  assert.equal(P('klipp på fredag kl 13').place, null);
});

test('varigheter når slutt mangler', () => {
  const end = (s) => P(s + ' 25.10 kl 10').end;
  assert.equal(end('frisør'), '10:45');
  assert.equal(end('lege'), '10:30');
  assert.equal(end('tannlege'), '11:00');
  assert.equal(end('fysio'), '10:45');
  assert.equal(end('psykolog'), '10:50');
  assert.equal(end('optiker'), '10:30');
  assert.equal(end('vaksine'), '10:15');
  assert.equal(end('møte'), '11:00');
  assert.equal(P('psykolog 25.10 kl 10').type, 'psykolog');
  assert.equal(P('vaksine 25.10 kl 10').type, 'annet');
  assert.equal(P('optiker 25.10 kl 23:30').end, '00:00');
});

test('mangler dato / tom tekst', () => {
  const r = P('time hos Nina frisør 14.30');
  assert.equal(r.ok, false);
  assert.equal(r.why, NO_DATE);
  assert.equal(r.date, null);
  assert.equal(r.start, '14:30');
  assert.equal(r.title, 'Nina frisør');
  assert.equal(r.isAppointment, false);
  assert.equal(P('').ok, false);
  assert.equal(P('   ').why, 'Skriv hva timen gjelder.');
  assert.equal(P(null).ok, false);
});

test('isAppointment = dato + intensjon/type', () => {
  assert.equal(P('time hos Ola fredag kl 9').isAppointment, true);
  assert.equal(P('book bord fredag kl 19').isAppointment, true);
  assert.equal(P('bestill fredag kl 19').isAppointment, true);
  assert.equal(P('frisør fredag').isAppointment, true);
  assert.equal(P('hva skjer fredag').isAppointment, false);
  assert.equal(P('hvordan blir været i morgen').isAppointment, false);
  assert.equal(P('legg til time').isAppointment, false); // ingen dato
  assert.equal(P('timeplan for uka').isAppointment, false);
});

test('sikkerhet og standard dag', () => {
  assert.ok(P('time hos Nina frisør 14.30 25.09').confidence >= 0.9);
  assert.ok(P('frisør fredag').confidence >= 0.6);
  assert.ok(P('møte med Per').confidence < 0.6);
  assert.match(osloTodayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(osloTodayISO(new Date('2026-10-18T22:30:00Z')), '2026-10-19'); // CEST
  assert.equal(parseQuick('lege i morgen kl 9', new Date('2026-10-18T22:30:00Z')).date, '2026-10-20');
  assert.equal(quickLabel({ date: '2026-10-20', start: null }), 'tir 20. okt');
});
