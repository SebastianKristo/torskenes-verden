import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-matfix-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MAT_AI_TIMEOUT_MS = '200';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { kv, OWNER, db } = await import('../server/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const mat = await import('../server/mat.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await mat.matApi.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const today = new Date().toLocaleDateString('sv-SE');
const mondayOf = (s) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('sv-SE'); };
const plus = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const start = mondayOf(today), next = plus(start, 7);

let taco, fisk, pizza;
test('oppsett: tre retter', async () => {
  taco = (await call('/dishes', 'POST', { name: 'Taco', cost: 130 })).body.dish;
  fisk = (await call('/dishes', 'POST', { name: 'Fiskesuppe', cost: 150 })).body.dish;
  pizza = (await call('/dishes', 'POST', { name: 'Pizza', cost: 110 })).body.dish;
  assert.ok(taco?.id && fisk?.id && pizza?.id);
});

test('«Alltid på»: en rett kan være fast på flere dager, lagres i matplan_fixed', async () => {
  const r = await call(`/dishes/${fisk.id}/fixed`, 'PUT', { days: [0, 3], start });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.fixedDays, [0, 3]);
  await call(`/dishes/${taco.id}/fixed`, 'PUT', { days: [4], start });
  const rows = db.prepare('SELECT weekday, dish_id FROM matplan_fixed ORDER BY weekday').all();
  assert.deepEqual(rows.map((x) => [x.weekday, x.dish_id]), [[0, fisk.id], [3, fisk.id], [4, taco.id]]);
  assert.deepEqual(kv.get(OWNER, 'mat').fixed, {}, 'faste retter ligger ikke lenger i kv');
  const w = (await call(`/week?start=${next}`)).body;
  assert.equal(w.days[0].name, 'Fiskesuppe'); assert.equal(w.days[3].name, 'Fiskesuppe'); assert.equal(w.days[4].name, 'Taco');
  assert.ok(w.days[0].fixed && w.days[4].fixed && !w.days[1].fixed);
  assert.deepEqual(w.dishes.find((d) => d.id === fisk.id).fixedDays, [0, 3]);
  assert.deepEqual(w.fixed.map((f) => f.index), [0, 3, 4]);
});

test('hver ukedag har høyst én fast rett: ny rett på samme dag erstatter den gamle', async () => {
  const r = await call(`/dishes/${pizza.id}/fixed`, 'PUT', { days: [3], start });
  assert.match(r.body.status, /Erstattet Fiskesuppe \(torsdag\)/);
  const w = (await call(`/week?start=${next}`)).body;
  assert.equal(w.days[3].name, 'Pizza');
  assert.deepEqual(w.dishes.find((d) => d.id === fisk.id).fixedDays, [0]);
});

test('faste dager går foran gammel plan og endres ikke av «Lag ny for uka» eller ✦', async () => {
  await call(`/day/${plus(next, 4)}`, 'PATCH', { dishId: fisk.id }); // flytter fast rett fredag → fiskesuppe
  await call(`/dishes/${taco.id}/fixed`, 'PUT', { days: [4], start }); // taco fast igjen
  const g = (await call('/plan', 'POST', { scope: 'week', mode: 'shuffle', date: next })).body;
  assert.equal(g.days[4].name, 'Taco'); assert.equal(g.days[0].name, 'Fiskesuppe'); assert.equal(g.days[3].name, 'Pizza');
  const d = (await call('/plan', 'POST', { scope: 'day', date: plus(next, 4) })).body;
  assert.match(d.status, /er fast/);
  assert.equal(d.days[4].name, 'Taco');
});

test('kokk per fast dag og fjerning av «Alltid på»', async () => {
  await call('/cooks', 'POST', { name: 'Ingrid' });
  await call(`/dishes/${taco.id}/fixed`, 'PUT', { days: [4], cooks: { 4: 'Ingrid' }, start });
  let w = (await call(`/week?start=${next}`)).body;
  assert.equal(w.days[4].cook, 'Ingrid');
  assert.equal(db.prepare('SELECT cook_id FROM matplan_fixed WHERE weekday=4').get().cook_id, 'Ingrid');
  await call(`/dishes/${taco.id}/fixed`, 'PUT', { days: [], start });
  w = (await call(`/week?start=${plus(next, 7)}`)).body;
  assert.ok(!w.days[4].fixed);
});

test('eldre klienter: PATCH fixed på en dag virker fortsatt', async () => {
  const d = plus(next, 2);
  await call(`/day/${d}`, 'PATCH', { dishId: taco.id });
  await call(`/day/${d}`, 'PATCH', { fixed: true });
  const w = (await call(`/week?start=${plus(next, 7)}`)).body;
  assert.equal(w.days[2].name, 'Taco'); assert.ok(w.days[2].fixed);
});

test('ukekostnaden trekkes fra «Mat og dagligvarer» på serveren', async () => {
  const w = (await call(`/week?start=${start}`)).body;
  assert.ok(w.food, 'food-feltet finnes');
  assert.equal(w.food.category, 'Mat og dagligvarer');
  assert.ok(Number.isFinite(w.food.planned));
  if (w.food.budget != null) assert.equal(w.food.left, Math.round(w.food.budget - w.food.used - w.food.planned));
});

test('migrering: faste retter i kv flyttes til tabellen én gang', async () => {
  const s = kv.get(OWNER, 'mat');
  db.prepare('DELETE FROM matplan_fixed').run();
  kv.set(OWNER, 'mat', { ...s, fixedDb: false, fixed: { 6: { dish: pizza.id, cook: null } } });
  const st = mat.state();
  assert.deepEqual(Object.keys(st.fixed), ['6']);
  assert.equal(db.prepare('SELECT dish_id FROM matplan_fixed WHERE weekday=6').get().dish_id, pizza.id);
});
