// Helse (prompt 57): reglene for søvn, trening, vekt og trender (server/helse/regler.js) og rutene /api/helse – per bruker,
// «i natt» i Oslo-tid (Q20), unionen av overlappende målinger, og at helsedata ikke logges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-helse-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const auth = await import('../server/auth/session.js');
const { default: fin } = await import('../server/finans/routes.js');
const R = await import('../server/helse/regler.js');
const H = await import('../server/helse/index.js');
const { osloToUtc: utc0 } = await import('../server/dates/oslo.js');
const osloToUtc = (d, hm) => +utc0(d, hm);

auth.createUser({ username: 'ingrid', password: 'testpassord2', name: 'Ingrid' });
const tok = async (username, password) => (await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, device: 'test' }) })).json()).token;
const A = await tok('sebastian', 'testpassord1'), B = await tok('ingrid', 'testpassord2');
const call = (t) => async (path, method = 'GET', body) => {
  const r = await H.helseApi.request(path, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const a = call(A), b = call(B);
const at = (date, hm) => new Date(osloToUtc(date, hm)).toISOString();

/* ---------------- Reglene ---------------- */

test('natten en måling hører til: kl. 18 dagen før til kl. 18, i Oslo-tid (også rundt sommertid)', () => {
  assert.equal(R.nattFor(osloToUtc('2026-11-27', '06:58')), '2026-11-27');
  assert.equal(R.nattFor(osloToUtc('2026-11-26', '23:59')), '2026-11-27');
  assert.equal(R.nattFor(osloToUtc('2026-11-27', '17:59')), '2026-11-27');
  assert.equal(R.nattFor(osloToUtc('2026-11-27', '18:01')), '2026-11-28');
  // Natt til søndag 29.03.2026 (sommertid kl. 02): fortsatt riktig dato, ikke UTC-datoen.
  assert.equal(R.nattFor(osloToUtc('2026-03-29', '01:30')), '2026-03-29');
  assert.equal(R.nattFor(osloToUtc('2026-03-29', '07:00')), '2026-03-29');
});

test('søvn: overlappende målinger fra klokke og telefon telles én gang; stadier, leggetid, sovnet og våknet', () => {
  const now = osloToUtc('2026-11-27', '12:00');
  const s = R.rensSovn([
    { start: at('2026-11-26', '22:50'), end: at('2026-11-27', '07:05'), stage: 'inBed' },
    { start: at('2026-11-26', '23:10'), end: at('2026-11-27', '01:10'), stage: 'core' },
    { start: at('2026-11-27', '01:10'), end: at('2026-11-27', '02:10'), stage: 'deep' },
    { start: at('2026-11-27', '02:10'), end: at('2026-11-27', '02:30'), stage: 'awake' },
    { start: at('2026-11-27', '02:30'), end: at('2026-11-27', '04:30'), stage: 'rem' },
    { start: at('2026-11-27', '04:30'), end: at('2026-11-27', '06:58'), stage: 'core' },
    // Telefonen: «sover» over samme tid – skal ikke legge til minutter.
    { start: at('2026-11-26', '23:15'), end: at('2026-11-27', '06:50'), stage: 'asleep' },
    { start: 'tull', end: at('2026-11-27', '06:50'), stage: 'asleep' },
    { start: at('2026-11-27', '01:00'), end: at('2026-11-27', '02:00'), stage: 'ukjent' },
  ], now);
  assert.equal(s.length, 7);
  const [n] = R.netter(s);
  assert.equal(n.night, '2026-11-27');
  assert.equal(n.asleepMin, 7 * 60 + 48); // 23:10–06:58
  assert.equal(n.inBedMin, 8 * 60 + 15); // 22:50–07:05
  assert.deepEqual(n.stages, { deep: 60, core: 120 + 148, rem: 120, awake: 20 });
  const o = R.nattUt(n, '2026-11-27');
  assert.deepEqual([o.bedtime, o.asleepAt, o.wakeAt, o.range, o.asleepText, o.dayText], ['22:50', '23:10', '06:58', '23:10–06:58', '7 t 48 m', 'i natt']);
  assert.deepEqual(o.stages.map((x) => x.label), ['Dyp', 'Kjerne', 'REM', 'Våken']);
});

test('Helse-siden: i natt, snitt siste 7 netter, skritt i dag, siste økt, vekt og trender for uke og måned', () => {
  const now = osloToUtc('2026-11-27', '12:00');
  const days = [], nights = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 10, 27 - i)).toISOString().slice(0, 10);
    days.push({ date: d, steps: i < 7 ? 8000 : 4000, distance_m: 5000, active_kcal: 400, exercise_min: 30, resting_hr: 55 });
    nights.push({ night: d, bedMs: osloToUtc(d, '00:00') - 3600e3, asleepMs: osloToUtc(d, '00:00'), wakeMs: osloToUtc(d, '07:00'), inBedMin: 480, asleepMin: i < 7 ? 420 : 360, stages: null });
  }
  const workouts = [{ id: 'w1', type: 'running', start_ms: osloToUtc('2026-11-25', '17:30'), end_ms: osloToUtc('2026-11-25', '18:10'), duration_s: 2400, kcal: 410, distance_m: 6400 },
    { id: 'w2', type: 'tull', start_ms: osloToUtc('2026-10-01', '17:30'), end_ms: osloToUtc('2026-10-01', '18:00'), duration_s: null, kcal: null, distance_m: null }];
  const weights = [{ at_ms: osloToUtc('2026-11-01', '07:00'), kg: 83.4 }, { at_ms: osloToUtc('2026-11-26', '07:00'), kg: 82.6 }];
  const uke = R.helseSide({ days, nights, workouts, weights, updated: now }, { now, periode: 'uke' });
  assert.equal(uke.date, '2026-11-27');
  assert.equal(uke.sleep.tonight.asleepText, '7 t 00 m');
  assert.equal(uke.sleep.avg7Min, 420);
  assert.equal(uke.sleep.avg7Nights, 7);
  assert.equal(uke.today.stepsText, '8 000');
  assert.equal(uke.today.distanceText, '5,0 km');
  assert.deepEqual([uke.workouts.last.label, uke.workouts.last.dayText, uke.workouts.last.durationText, uke.workouts.last.distanceText, uke.workouts.last.kcalText], ['Løping', 'onsdag', '40 min', '6,4 km', '410 kcal']);
  assert.equal(uke.workouts.count, 1);
  const st = uke.trends.find((t) => t.key === 'steps');
  assert.equal(st.serie.length, 7);
  assert.equal(st.avg, 8000);
  assert.equal(st.changePct, 100);
  assert.equal(st.direction, 'opp');
  assert.equal(uke.weight.kgText, '82,6 kg');
  assert.equal(uke.summary, 'Du sov 7 t 00 m i natt og har gått 8 000 skritt i dag.');
  const mnd = R.helseSide({ days, nights, workouts, weights, updated: now }, { now, periode: 'maned' });
  assert.equal(mnd.trends.find((t) => t.key === 'steps').serie.length, 30);
  assert.equal(mnd.weight.change, -0.8);
  assert.equal(mnd.weight.changeText, '−0,8 kg siste 30 dager');
  assert.equal(mnd.weight.direction, 'ned');
  assert.equal(R.oktNavn('tull'), 'Trening');
  // Ingen natt i natt ennå: siste natt vises, «i natt» er null.
  const tidlig = R.helseSide({ days, nights: nights.slice(1), workouts, weights }, { now, periode: 'uke' });
  assert.equal(tidlig.sleep.tonight, null);
  assert.equal(tidlig.sleep.last.night, '2026-11-26');
});

/* ---------------- Rutene ---------------- */

test('krever innlogging, og ugyldig periode gir 400', async () => {
  assert.equal((await H.helseApi.request('/')).status, 401);
  assert.equal((await a('/?periode=år')).status, 400);
  assert.equal((await a('/', 'POST', [1, 2])).status, 400);
});

test('lagres per bruker: Ingrid ser aldri Sebastians helsedata, og ingenting logges', async () => {
  const logs = [];
  const orig = { log: console.log, warn: console.warn, info: console.info, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...x) => { logs.push(x.join(' ')); };
  try {
    const now = Date.now(), d = new Date(now).toISOString();
    const today = (await import('../server/dates/oslo.js')).osloDate(now);
    const r = await a('/', 'POST', {
      source: 'Apple Health · iPhone',
      days: [{ date: today, steps: 9876, distanceM: 7123, activeKcal: 512, exerciseMin: 41, restingHr: 52 }, { date: 'tull', steps: 1 }],
      sleep: [{ start: now - 8 * 3600e3, end: now - 3600e3, stage: 'asleep' }],
      workouts: [{ id: 'ABC-1', type: 'running', start: now - 5 * 3600e3, end: now - 4 * 3600e3, kcal: 600, distanceM: 10000 }, { id: 'bad id!', type: 'running', start: d, end: d }],
      weight: [{ at: now - 3600e3, kg: 81.2 }, { at: now, kg: 9999 }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.stored, { days: 1, nights: 1, workouts: 1, weight: 1 });
    const me = (await a('/')).body;
    assert.equal(me.today.steps, 9876);
    assert.equal(me.workouts.last.label, 'Løping');
    assert.equal(me.weight.kg, 81.2);
    const other = (await b('/')).body;
    assert.equal(other.empty, true);
    assert.equal(other.today.steps, null);
    assert.equal(other.weight, null);
  } finally { Object.assign(console, orig); }
  assert.ok(!logs.some((l) => /9876|81[.,]2|ABC-1/.test(l)), logs.join('\n'));
});

test('to enheter: høyeste dagssum per felt, ikke summen', async () => {
  const { osloDate } = await import('../server/dates/oslo.js');
  const today = osloDate();
  await a('/', 'POST', { days: [{ date: today, steps: 3000, distanceM: 9000 }] });
  const me = (await a('/')).body;
  assert.equal(me.today.steps, 9876);
  assert.equal(me.today.distanceM, 9000);
});

test('Familie: delingHelse gir bare kategoriene personen deler', () => {
  const sebId = auth.listUsers().find((u) => u.username === 'sebastian').id;
  assert.equal(H.delingHelse(sebId, { steps: true, sleep: false, workouts: false, weight: false }), null);
  const kunVekt = H.delingHelse(sebId, { sleep: false, workouts: false, weight: true });
  assert.deepEqual(Object.keys(kunVekt), ['weight']);
  assert.equal(kunVekt.weight.kgText, '81,2 kg');
  const alt = H.delingHelse(sebId, { sleep: true, workouts: true, weight: true });
  assert.ok(alt.workout && alt.distanceText && alt.weight);
});

test('DELETE sletter alle egne helsedata, ikke andres', async () => {
  await b('/', 'POST', { weight: [{ at: Date.now() - 1000, kg: 60 }] });
  const r = await a('/', 'DELETE');
  assert.equal(r.status, 200);
  assert.ok(r.body.deleted >= 4);
  assert.equal((await a('/')).body.empty, true);
  assert.equal((await b('/')).body.weight.kg, 60);
});
