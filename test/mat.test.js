import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-mat-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MAT_AI_TIMEOUT_MS = '200';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { kv, OWNER } = await import('../server/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const mat = await import('../server/mat.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await mat.matApi.request(path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text(), headers: r.headers };
};
const today = new Date().toLocaleDateString('sv-SE');
const mondayOf = (s) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('sv-SE'); };
const start = mondayOf(today);
const plus = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

test('ukevisningen har 7 dager, kokken fra eieren og eldre felter', async () => {
  const r = await call(`/week?start=${today}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.start, start);
  assert.equal(r.body.days.length, 7);
  assert.deepEqual(r.body.cooks, ['Sebastian']);
  assert.ok(Array.isArray(r.body.library) && Array.isArray(r.body.hellofresh) && Array.isArray(r.body.shopping));
  assert.ok(r.body.calendarUrl.startsWith('/mat/calendar.ics?key='));
});

let fisk, taco;
test('retter med ingredienser, unike navn og redigering', async () => {
  const a = await call('/dishes', 'POST', { name: 'Fiskesuppe', ing: '600 g torsk\n2 gulrøtter\n\n1 purre', steps: ['Kok opp.', 'Ha i fisken.'] });
  assert.equal(a.status, 201);
  fisk = a.body.dish;
  assert.deepEqual(fisk.ing, ['600 g torsk', '2 gulrøtter', '1 purre']);
  assert.equal((await call('/dishes', 'POST', { name: 'fiskesuppe' })).status, 409);
  taco = (await call('/dishes', 'POST', { name: 'Taco', ing: ['Kjøttdeig', 'Lefser', '2 gulrøtter'] })).body.dish;
  const e = await call(`/dishes/${taco.id}`, 'PATCH', { name: 'Fredagstaco', src: 'hellofresh' });
  assert.equal(e.body.dish.name, 'Fredagstaco');
  assert.equal(e.body.dish.src, 'hellofresh');
  assert.equal((await call(`/dishes/${taco.id}`, 'PATCH', { name: 'Fiskesuppe' })).status, 409);
});

test('kokk med «best på» settes automatisk når retten legges på en dag', async () => {
  assert.equal((await call('/cooks', 'POST', { name: 'Ingrid' })).status, 201);
  assert.equal((await call('/cooks', 'POST', { name: 'ingrid' })).status, 409);
  await call('/cooks/Ingrid/best', 'PUT', { best: [fisk.id] });
  const r = await call(`/day/${plus(start, 1)}`, 'PATCH', { dishId: fisk.id });
  const tue = r.body.days[1];
  assert.equal(tue.name, 'Fiskesuppe');
  assert.equal(tue.cook, 'Ingrid');
  assert.equal(tue.tag, 'best');
  assert.equal(tue.bestCook, 'Ingrid');
  assert.deepEqual(r.body.dishes.find((d) => d.id === fisk.id).days, [1]);
  // En rett har én beste kokk: Sebastian tar over.
  const s = await call('/cooks/Sebastian/best', 'PUT', { best: [fisk.id] });
  assert.deepEqual(s.body.chefs.find((c) => c.name === 'Ingrid').best, []);
});

test('fast rett gjentas neste uke, og bytte mellom dager flytter rett og kokk', async () => {
  const fri = plus(start, 4);
  await call(`/day/${fri}`, 'PATCH', { dishId: taco.id });
  await call(`/day/${fri}`, 'PATCH', { cook: 'Ingrid' });
  const f = await call(`/day/${fri}`, 'PATCH', { fixed: true });
  assert.equal(f.body.days[4].fixed, true);
  const next = await call(`/week?start=${plus(start, 7)}`);
  assert.equal(next.body.days[4].name, 'Fredagstaco');
  assert.equal(next.body.days[4].cook, 'Ingrid');
  assert.equal(next.body.days[4].fixed, true);
  const sw = await call('/swap', 'POST', { a: plus(start, 1), b: fri });
  assert.equal(sw.body.days[1].name, 'Fredagstaco');
  assert.equal(sw.body.days[4].name, 'Fiskesuppe');
  assert.equal(sw.body.days[1].cook, 'Ingrid');
  // Fredag er fortsatt fast, nå med fiskesuppe.
  assert.equal(sw.body.days[4].fixed, true);
  const unfix = await call(`/day/${fri}`, 'PATCH', { fixed: false });
  assert.equal(unfix.body.days[4].fixed, false);
  assert.equal(unfix.body.days[4].name, 'Fiskesuppe');
  assert.equal((await call(`/week?start=${plus(start, 7)}`)).body.days[4].name, null);
});

test('«Lag ny for uka» fyller ikke-faste dager uten duplikater, AI faller tilbake raskt', async () => {
  for (const n of ['Pizza', 'Lasagne', 'Kyllingwok', 'Laks', 'Fiskeboller']) await call('/dishes', 'POST', { name: n });
  await call(`/day/${plus(start, 6)}`, 'PATCH', { fixed: false });
  await call(`/day/${plus(start, 1)}`, 'PATCH', { fixed: true });
  const r = await call('/plan', 'POST', { scope: 'week', date: start, mode: 'shuffle' });
  assert.equal(r.status, 200);
  assert.equal(r.body.filled, 6);
  const names = r.body.days.map((d) => d.name);
  assert.ok(names.every(Boolean));
  assert.equal(new Set(names).size, 7);
  assert.equal(r.body.days[1].name, 'Fredagstaco');
  const t0 = Date.now();
  const ai = await call('/plan', 'POST', { scope: 'week', date: start, mode: 'ai' });
  assert.ok(Date.now() - t0 < 5000);
  assert.match(ai.body.status, /dager har fått nye retter/);
  const day = await call('/plan', 'POST', { scope: 'day', date: plus(start, 3) });
  assert.ok(day.body.days[3].name);
});

test('handlelisten bygges fra ingrediensene, og avkrysning lagres per uke', async () => {
  await call(`/day/${plus(start, 2)}`, 'PATCH', { dishId: fisk.id });
  let w = (await call(`/week?start=${start}`)).body;
  const gul = w.shopping.find((x) => x.text === '2 gulrøtter');
  assert.ok(gul && gul.auto);
  const t = await call(`/shopping/${gul.id}/toggle`, 'POST', { start });
  assert.equal(t.body.done, true);
  w = (await call(`/week?start=${start}`)).body;
  assert.equal(w.shopping.find((x) => x.id === gul.id).done, true);
  const add = await call('/shopping', 'POST', { text: 'Melk', start });
  assert.ok(add.body.shopping.some((x) => x.text === 'Melk' && !x.auto));
});

test('HelloFresh-import legger til nye retter og hopper over kjente', async () => {
  const r = await call('/hellofresh', 'POST', { text: '1. Teriyakilaks med sesamris – 25 min – 169 kr\n• Halloumiburger\nPizza\nhttps://hellofresh.no/x', start });
  assert.equal(r.body.added, 2);
  const t = r.body.dishes.find((d) => d.name === 'Teriyakilaks med sesamris');
  assert.equal(t.src, 'hellofresh');
  assert.equal(t.cost, 169);
  assert.ok(r.body.hellofresh.some((x) => x.name === 'Halloumiburger'));
});

test('ICS for uka og abonnert feed', async () => {
  const r = await call(`/week.ics?start=${start}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /matplan-uke-\d+\.ics/);
  assert.match(r.body, /BEGIN:VCALENDAR[\s\S]*DTSTART;TZID=Europe\/Oslo:\d{8}T170000[\s\S]*Kokk: /);
  const key = (await call('/week')).body.calendarUrl.split('key=')[1];
  const ok = mat.matCalendar({ req: { query: () => key }, text: (t, s) => ({ t, s }), body: (b, s) => ({ b, s }) });
  assert.equal(ok.s, 200);
  assert.match(ok.b, /SUMMARY:Fredagstaco/);
  const bad = mat.matCalendar({ req: { query: () => 'feil' }, text: (t, s) => ({ t, s }), body: (b, s) => ({ b, s }) });
  assert.equal(bad.s, 403);
});

test('sletting fjerner retten fra plan, faste dager og kokker', async () => {
  await call('/cooks/Ingrid/best', 'PUT', { best: [taco.id] });
  const r = await call(`/dishes/${taco.id}?start=${start}`, 'DELETE');
  assert.equal(r.status, 200);
  assert.ok(!r.body.days.some((d) => d.dishId === taco.id));
  assert.ok(!r.body.fixed.some((f) => f.dishId === taco.id));
  assert.deepEqual(r.body.chefs.find((c) => c.name === 'Ingrid').best, []);
  const rm = await call(`/cooks/Ingrid?start=${start}`, 'DELETE');
  assert.ok(!rm.body.cooks.includes('Ingrid'));
  assert.ok(!rm.body.days.some((d) => d.cook === 'Ingrid'));
});

test('eldre klienter: PATCH med navn lager rett, og v1-data migreres', async () => {
  const r = await call(`/day/${plus(start, 5)}`, 'PATCH', { name: 'Restemiddag' });
  assert.equal(r.body.days[5].name, 'Restemiddag');
  assert.ok(r.body.dishes.some((d) => d.name === 'Restemiddag'));
  const v1 = {
    people: ['Sebastian', 'Pål'], auto: true, calKey: 'k',
    plan: { [start]: { name: 'Taco', cost: 134, source: 'fixed', cook: 'Pål', ingredients: ['Lefser'] }, [plus(start, 1)]: { name: 'Gemini-wok', cost: 99, source: 'gemini', cook: 'Sebastian' } },
    fixed: { 0: { name: 'Taco', cost: 134 } }, lib: [{ id: 'a', name: 'Lasagne', cost: 145 }], hf: [{ id: 'h', name: 'Teriyakilaks', meta: '25 min', cost: 169 }],
    shopping: { [start]: [{ id: 's1', text: 'Melk', price: 20, done: true }] },
  };
  const m = mat.migrate(v1);
  assert.equal(m.v, 2);
  assert.deepEqual(m.dishes.map((d) => d.name).sort(), ['Gemini-wok', 'Lasagne', 'Taco', 'Teriyakilaks']);
  assert.equal(m.dishes.find((d) => d.name === 'Teriyakilaks').src, 'hellofresh');
  assert.deepEqual(m.dishes.find((d) => d.name === 'Taco').ing, ['Lefser']);
  assert.equal(m.plan[start].cook, 'Pål');
  assert.equal(m.plan[plus(start, 1)].by, 'ai');
  assert.equal(m.dishes.find((d) => d.id === m.fixed[0].dish).name, 'Taco');
  assert.deepEqual(m.cooks.map((c) => c.name), ['Sebastian', 'Pål']);
  assert.equal(m.shop[start].extra[0].done, true);
  kv.set(OWNER, 'mat', v1);
  const w = (await call(`/week?start=${start}`)).body;
  assert.equal(w.days[0].name, 'Taco');
  assert.equal(w.days[0].fixed, true);
  assert.equal(w.days[1].source, 'gemini');
  assert.equal(kv.get(OWNER, 'mat').v, 2);
});
