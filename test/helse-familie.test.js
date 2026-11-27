// Helse i Familie (prompt 57): søvn, trening og vekt deles per kategori, av som standard. Andre ser bare det personen selv har
// valgt å dele; personen selv ser alt. Hovedbryteren av (DELETE /api/family/health/me) sletter også Helse-siden.
import './lib/day-clock.mjs'; // klokka holdes mellom 09 og 21 (Oslo), så «i natt» er natten som sluttet i morges
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-helsefam-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-57h';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { osloDate, osloToUtc } = await import('../server/dates/oslo.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const ingridId = (await I('/api/family')).body.me.userId;

const now = Date.now(), today = osloDate(now);
const ingridData = {
  days: [{ date: today, steps: 7000, distanceM: 5200 }],
  sleep: [{ start: +osloToUtc(today, '00:00'), end: +osloToUtc(today, '07:00'), stage: 'core' }, { start: +osloToUtc(today, '00:00') - 1800e3, end: +osloToUtc(today, '00:00'), stage: 'inBed' }],
  workouts: [{ id: 'run-1', type: 'running', start: now - 26 * 3600e3, end: now - 25 * 3600e3, kcal: 500, distanceM: 9000 }],
  weight: [{ at: now - 3600e3, kg: 64.3 }],
};

test('trening og vekt er nye delingskategorier, av som standard (også for den som har slått på helse før)', async () => {
  await I('/api/family/me', 'PUT', { sharing: 'on', shareHealth: { steps: true, sleep: false } });
  const me = (await I('/api/family')).body.me;
  assert.equal(me.shareHealth.workouts, false);
  assert.equal(me.shareHealth.weight, false);
  // Onboardingens «Del helse» slår ikke på trening og vekt.
  await I('/api/me/share51', 'PUT', { location: true, health: true });
  const me2 = (await I('/api/family')).body.me;
  assert.deepEqual([me2.shareHealth.workouts, me2.shareHealth.weight], [false, false]);
});

test('andre ser bare kategoriene personen deler; personen selv ser alt', async () => {
  assert.equal((await I('/api/helse', 'POST', ingridData)).status, 200);
  await I('/api/family/me', 'PUT', { shareHealth: { steps: true, sleep: false, workouts: false, weight: false } });
  let ing = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.equal(ing.shared, true);
  assert.deepEqual([ing.sleepNight, ing.workout, ing.weight, ing.distanceText], [null, null, null, null]);
  // Helse-siden er bare hennes: Sebastian får sin egen (tom).
  assert.equal((await A('/api/helse')).body.empty, true);

  await I('/api/family/me', 'PUT', { shareHealth: { sleep: true, workouts: true, weight: false } });
  ing = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.equal(ing.sleepNight.asleepText, '7 t 00 m');
  assert.equal(ing.workout.label, 'Løping');
  assert.equal(ing.distanceText, '5,2 km');
  assert.equal(ing.weight, null, 'vekt deles ikke');
  assert.match(ing.shareText, /trening/);
  assert.doesNotMatch(ing.shareText, /vekt/);

  await I('/api/family/me', 'PUT', { shareHealth: { weight: true } });
  ing = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.equal(ing.weight.kgText, '64,3 kg');

  // Pause: ingen ser helse.
  await I('/api/family/me', 'PUT', { sharing: 'paused' });
  ing = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.equal(ing.shared, false);
  assert.equal(ing.weight, undefined);
  await I('/api/family/me', 'PUT', { sharing: 'on' });

  const self = (await I(`/api/family/health50/${ingridId}`)).body;
  assert.ok(self.sleepNight && self.workout && self.weight);
});

test('hovedbryteren av i appen sletter også Helse-siden', async () => {
  const r = await I('/api/family/health/me', 'DELETE');
  assert.equal(r.status, 200);
  assert.ok(r.body.deleted >= 4);
  assert.equal((await I('/api/helse')).body.empty, true);
  const ing = (await A(`/api/family/health50/${ingridId}`)).body;
  assert.deepEqual([ing.sleepNight, ing.workout, ing.weight], [null, null, null]);
});
