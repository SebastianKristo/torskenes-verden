// Prompt 31 (SERVER31): felles tolker for gratis prøveperioder (public/js/trial-parse.js). Dagens dato: lørdag 17. oktober 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrial, trialSchedule, trialPreview, trialSentence, trialBadge, trialTitle, cancelUrlFor, isTrialText, endDateOf, priceOf, serviceOf } from '../public/js/trial-parse.js';

const T = '2026-10-17';

test('fasit: «Viaplay gratis i 14 dager, påminn meg om å avslutte»', () => {
  const r = parseTrial('Viaplay gratis i 14 dager, påminn meg om å avslutte', T);
  assert.equal(r.ok, true);
  assert.equal(r.isTrial, true);
  assert.equal(r.service, 'Viaplay');
  assert.equal(r.endsAt, '2026-10-31');
  assert.deepEqual(r.remindOffsetsDays, [1]);
  assert.match(r.cancelUrl, /^https:\/\/viaplay\.no\//);
  assert.equal(trialSentence(r), 'Jeg minner deg på å avslutte Viaplay **fredag 30. oktober kl. 09**, dagen før prøven slutter lørdag 31. oktober.');
});

test('fasit: «Storytel prøve til 25.11, 179 kr»', () => {
  const r = parseTrial('Storytel prøve til 25.11, 179 kr', T);
  assert.deepEqual([r.ok, r.service, r.endsAt, r.priceAfter, r.priceLabel], [true, 'Storytel', '2026-11-25', 179, '179 kr/mnd']);
  assert.deepEqual(trialPreview(r), { when: 'tir 24. nov 09:00', title: 'Storytel-prøven slutter i morgen', body: 'Avslutt før ons 25. nov for å slippe 179 kr/mnd. Trykk for å åpne oppsigelsessiden.' });
});

test('varighet, dato og pris i mange former', () => {
  assert.equal(endDateOf('1 uke', T), '2026-10-24');
  assert.equal(endDateOf('to uker', T), '2026-10-31');
  assert.equal(endDateOf('en måned', T), '2026-11-17');
  assert.equal(endDateOf('30 dagers prøve', T), '2026-11-16');
  assert.equal(endDateOf('til 3. desember', T), '2026-12-03');
  assert.equal(endDateOf('til 3 jan', T), '2027-01-03'); // passert i år → neste år
  assert.equal(endDateOf('slutter 01.11.2026', T), '2026-11-01');
  assert.equal(endDateOf('ingen dato', T), null);
  assert.equal(priceOf('kr 99'), 99);
  assert.equal(priceOf('149,-'), 149);
  assert.equal(priceOf('99,90 kr/mnd'), 99.9);
  assert.equal(priceOf('ingen pris'), null);
  assert.equal(serviceOf('HBO Max gratis'), 'HBO Max');
  assert.equal(serviceOf('prøve på max'), 'Max');
  assert.equal(serviceOf('disney plus prøve'), 'Disney+');
  assert.equal(serviceOf('Fjellsport premium trial'), 'Fjellsport');
  assert.equal(serviceOf('Når er neste prøve?'), '', 'spørreord er ikke en tjeneste');
});

test('mangler noe → kort spørsmål, ingen ok', () => {
  const a = parseTrial('gratis prøve i 2 uker', T);
  assert.equal(a.ok, false);
  assert.deepEqual(a.missing, ['service']);
  assert.match(a.question, /tjeneste/);
  const b = parseTrial('Netflix prøveperiode', T);
  assert.deepEqual(b.missing, ['endsAt']);
  assert.match(b.question, /Når slutter prøven på Netflix/);
  assert.equal(isTrialText('si opp Spotify'), true);
  assert.equal(isTrialText('hva er været'), false);
});

test('varseltider: offset kl. 09, «Minn meg i morgen» og siste varsel 18:00', () => {
  const s = trialSchedule({ endsAt: '2026-11-01', remindOffsetsDays: [7, 1, 0], snoozeUntil: '2026-10-30' });
  assert.deepEqual(s.map((x) => `${x.key} ${x.date} ${x.time}`), ['d7 2026-10-25 09:00', 'd1 2026-10-31 09:00', 's2026-10-30 2026-10-30 09:00', 'd0 2026-11-01 09:00', 'final 2026-11-01 18:00']
    .sort((a, b) => a.split(' ').slice(1).join(' ').localeCompare(b.split(' ').slice(1).join(' '))));
  assert.equal(trialTitle('Viaplay', 0), 'Viaplay-prøven slutter i dag');
  assert.equal(trialTitle('Viaplay', 3), 'Viaplay-prøven slutter om 3 dager');
  assert.equal(trialBadge('2026-10-29', T), 'Prøve · 12 dager igjen');
  assert.equal(trialBadge('2026-10-17', T), 'Prøve · slutter i dag');
  assert.equal(cancelUrlFor('netflix'), 'https://www.netflix.com/cancelplan');
  assert.equal(cancelUrlFor('Ukjent'), null);
});
