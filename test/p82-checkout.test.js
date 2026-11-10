// Prompt 82 (CHKSRV): sjekk ut deler til et produkt (og sjekk inn igjen) – server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'hl-p82-'));
process.env.DATA_DIR = DATA;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-p82';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.SKJOLD76_DEMO = '0';
process.env.OCR_FALLBACK = '0';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const auth = await import('../server/auth.js');
const P82 = await import('../server/skjold76/projects82.js');
const G = await import('../server/skjold76/glimt.js');
test.after(() => { try { rmSync(DATA, { recursive: true, force: true }); } catch { /* */ } });

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r0 = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ username, password }) });
  return r0.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const cookie = await login('sebastian', 'testpassord1');
auth.createUser({ username: 'kari82', password: 'karipassord82', role: 'bruker' });
const cookie2 = await login('kari82', 'karipassord82');
const A = (path, method = 'GET', body) => req(`/api/skjold${path}`, { method, headers: { cookie }, body });
const B = (path, method = 'GET', body) => req(`/api/skjold${path}`, { method, headers: { cookie: cookie2 }, body });

const cabId = (await A('/cabinets')).body[0].id;
const mk = async (name, qty, extra = {}) => (await A('/parts', 'POST', { name, qty, cabinetId: cabId, row: 2, col: 3, ...extra })).body;
const qty = async (id) => (await A(`/parts/${id}`)).body.qty;
const esp = await mk('ESP32 DevKitC', 4, { price: 89.5 });
const led = await mk('LED rød 5 mm', 10);
const res = await mk('Motstand 220 Ω', 50, { price: 0.2 });

test('prosjekter: opprett, liste, validering og navn maks 80', async () => {
  P82._resetRate82();
  assert.equal((await A('/projects', 'POST', {})).status, 400);
  assert.equal((await A('/projects', 'POST', { name: 'x'.repeat(81) })).status, 400);
  const p = await A('/projects', 'POST', { name: 'Lysstyring', notes: 'Stue' });
  assert.equal(p.status, 201, p.text);
  assert.deepEqual([p.body.name, p.body.status, p.body.parts, p.body.units, p.body.cost, p.body.notes], ['Lysstyring', 'aktiv', 0, 0, null, 'Stue']);
  assert.equal((await A('/projects', 'POST', { name: 'lysstyring' })).status, 409, 'samme navn (case-uavhengig) blant aktive');
  assert.ok((await A('/projects')).body.some((x) => x.id === p.body.id));
  assert.equal((await A('/projects', 'PATCH', {})).status, 404);
  assert.equal((await A(`/projects/${p.body.id}`, 'PATCH', { status: 'gammel' })).status, 400);
});

test('sjekk ut med projectName oppretter produktet, trekker fra lager og gir historikk og usedIn', async () => {
  P82._resetRate82();
  const r = await A('/checkout', 'POST', { projectName: 'Værstasjon', items: [{ partId: esp.id, qty: 2 }, { partId: res.id, qty: 4 }, { partId: res.id, qty: 1 }], note: 'v1' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.project.name, 'Værstasjon'); assert.equal(r.body.created, true);
  assert.ok(r.body.undoToken);
  assert.equal(r.body.usages.length, 2, 'samme del slås sammen');
  assert.equal(await qty(esp.id), 2); assert.equal(await qty(res.id), 45);
  assert.equal(r.body.project.parts, 2); assert.equal(r.body.project.units, 7); assert.equal(r.body.project.cost, 2 * 89.5 + 5 * 0.2);
  const part = (await A(`/parts/${esp.id}`)).body;
  assert.deepEqual(part.usedIn, [{ projectId: r.body.project.id, name: 'Værstasjon', qty: 2, status: 'aktiv' }]);
  assert.equal(part.history[0].action, 'sjekket ut');
  assert.equal(part.history[0].to.text, 'Sjekket ut 2 stk til «Værstasjon»');
  // Samme navn igjen (annen skrivemåte) → samme produkt
  const r2 = await A('/checkout', 'POST', { projectName: 'VÆRSTASJON', items: [{ partId: led.id, qty: 3 }] });
  assert.equal(r2.status, 200); assert.equal(r2.body.project.id, r.body.project.id); assert.equal(r2.body.created, false);
  const full = (await A(`/projects/${r.body.project.id}`)).body;
  assert.equal(full.items.length, 3);
  const line = full.items.find((x) => x.partId === esp.id);
  assert.deepEqual([line.qty, line.returnedQty, line.unit, line.price, line.name], [2, 0, 'stk', 89.5, 'ESP32 DevKitC']);
  assert.match(line.loc, /Rad 2 · Skuff 3/);
  assert.ok(line.usageId && line.at);
  assert.equal(full.grouped.length, 3); assert.equal(full.active, true);
});

test('alt eller ingenting: for lite på lager → 409 med delene, ingenting endres', async () => {
  P82._resetRate82();
  const before = [await qty(esp.id), await qty(led.id)];
  const r = await A('/checkout', 'POST', { projectName: 'Robot', items: [{ partId: led.id, qty: 1 }, { partId: esp.id, qty: 99 }] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.short.map((x) => [x.partId, x.have, x.want]), [[esp.id, 2, 99]]);
  assert.equal(r.body.error, 'Ikke nok på lager: «ESP32 DevKitC» (har 2, trenger 99)', 'navn og antall i error (Android viser bare den)');
  assert.deepEqual([await qty(esp.id), await qty(led.id)], before);
  assert.ok(!(await A('/projects')).body.some((x) => x.name === 'Robot'), 'produktet ble ikke opprettet');
  assert.equal((await A('/checkout', 'POST', { projectName: 'Robot', items: [{ partId: esp.id, qty: 0 }] })).status, 400);
  assert.equal((await A('/checkout', 'POST', { items: [{ partId: esp.id, qty: 1 }] })).status, 400);
  assert.equal((await A('/checkout', 'POST', { projectId: 999999, items: [{ partId: esp.id, qty: 1 }] })).status, 404);
  assert.equal((await A('/checkout', 'POST', { projectName: 'Robot', items: [{ partId: 999999, qty: 1 }] })).status, 404);
});

test('angre legger alt tilbake og sletter usage-radene (og et nytt tomt produkt)', async () => {
  P82._resetRate82();
  const r = await A('/checkout', 'POST', { projectName: 'Klokke', items: [{ partId: led.id, qty: 2 }, { partId: res.id, qty: 5 }] });
  assert.equal(r.status, 200);
  assert.equal(await qty(led.id), 5); assert.equal(await qty(res.id), 40);
  assert.equal((await B('/checkout/undo', 'POST', { undoToken: r.body.undoToken })).status, 404, 'andre brukere kan ikke angre');
  const u = await A('/checkout/undo', 'POST', { undoToken: r.body.undoToken });
  assert.equal(u.status, 200, u.text);
  assert.equal(await qty(led.id), 7); assert.equal(await qty(res.id), 45);
  assert.equal((await A(`/projects/${r.body.project.id}`)).status, 404);
  assert.ok(!(await A(`/parts/${led.id}`)).body.history.some((h) => h.action === 'sjekket ut' && h.to.project === 'Klokke'));
  assert.equal((await A('/checkout/undo', 'POST', { undoToken: r.body.undoToken })).status, 404, 'bare én gang');
});

test('sjekk inn: legger tilbake, øker returnedQty, maks det som er igjen', async () => {
  P82._resetRate82();
  const pr = (await A('/projects')).body.find((x) => x.name === 'Værstasjon');
  const line = (await A(`/projects/${pr.id}`)).body.items.find((x) => x.partId === esp.id);
  assert.equal((await A(`/usage/${line.usageId}/return`, 'POST', { qty: 3 })).status, 409);
  assert.equal((await A(`/usage/${line.usageId}/return`, 'POST', { qty: 0 })).status, 400);
  assert.equal((await B(`/usage/${line.usageId}/return`, 'POST', { qty: 1 })).status, 404, 'per bruker');
  const r = await A(`/usage/${line.usageId}/return`, 'POST', { qty: 1 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.usage.returnedQty, 1); assert.equal(r.body.usage.net, 1);
  assert.equal(await qty(esp.id), 3);
  const part = (await A(`/parts/${esp.id}`)).body;
  assert.equal(part.history[0].action, 'sjekket inn'); assert.equal(part.history[0].to.text, 'Sjekket inn 1 stk fra «Værstasjon»');
  assert.equal(part.usedIn[0].qty, 1);
  assert.equal((await A(`/usage/${line.usageId}/return`, 'POST', {})).status, 200, 'uten qty = resten');
  assert.equal(await qty(esp.id), 4);
  assert.deepEqual((await A(`/parts/${esp.id}`)).body.usedIn, []);
});

test('sletting med aktive utsjekkinger → 409; ferdig, nytt navn og myk sletting', async () => {
  P82._resetRate82();
  const pr = (await A('/projects')).body.find((x) => x.name === 'Værstasjon');
  const d = await A(`/projects/${pr.id}`, 'DELETE');
  assert.equal(d.status, 409); assert.ok(d.body.active >= 1);
  const f = await A(`/projects/${pr.id}`, 'PATCH', { status: 'ferdig', name: 'Værstasjon v1' });
  assert.equal(f.status, 200); assert.equal(f.body.status, 'ferdig'); assert.equal(f.body.name, 'Værstasjon v1');
  const list = (await A('/projects')).body;
  assert.equal(list.at(-1).id, pr.id, 'ferdige sist');
  for (const it of (await A(`/projects/${pr.id}`)).body.items) if (it.net > 0) assert.equal((await A(`/usage/${it.usageId}/return`, 'POST', {})).status, 200);
  assert.equal((await A(`/projects/${pr.id}`, 'DELETE')).status, 200);
  assert.equal((await A(`/projects/${pr.id}`)).status, 404);
  assert.ok(!(await A('/projects')).body.some((x) => x.id === pr.id));
});

test('per bruker: andre ser ikke prosjektene og kan ikke sjekke ut andres deler', async () => {
  P82._resetRate82();
  const pr = (await A('/projects')).body[0], ledQ = await qty(led.id);
  assert.deepEqual((await B('/projects')).body, []);
  assert.equal((await B(`/projects/${pr.id}`)).status, 404);
  assert.equal((await B(`/projects/${pr.id}`, 'PATCH', { name: 'x' })).status, 404);
  assert.equal((await B(`/projects/${pr.id}`, 'DELETE')).status, 404);
  assert.equal((await B('/checkout', 'POST', { projectId: pr.id, items: [{ partId: led.id, qty: 1 }] })).status, 404);
  assert.equal((await B('/checkout', 'POST', { projectName: 'Mitt', items: [{ partId: led.id, qty: 1 }] })).status, 404);
  assert.equal(await qty(led.id), ledQ);
  assert.deepEqual((await B('/projects')).body, [], 'ingen «Mitt» opprettet');
});

test('plukklista: take med produkt bruker utsjekkingen; uten produkt som før', async () => {
  P82._resetRate82();
  const q0 = await qty(led.id);
  const r = await A('/picklist/take', 'POST', { projectName: 'Plukk-prosjekt', items: [{ partId: led.id, qty: 2 }] });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.project.name, 'Plukk-prosjekt'); assert.ok(r.body.undoToken);
  assert.equal(r.body.parts[0].after, q0 - 2); assert.deepEqual(r.body.undo, [{ partId: led.id, set: q0 }]);
  assert.equal((await A(`/parts/${led.id}`)).body.usedIn.find((x) => x.name === 'Plukk-prosjekt').qty, 2);
  assert.equal((await A('/picklist/take', 'POST', { projectId: r.body.project.id, items: [{ partId: led.id, qty: 50 }] })).status, 409, 'aldri under 0 med produkt');
  const u = await A('/picklist/undo', 'POST', { undoToken: r.body.undoToken });
  assert.equal(u.status, 200); assert.equal(await qty(led.id), q0);
  const plain = await A('/picklist/take', 'POST', { items: [{ partId: led.id, qty: 50 }] });
  assert.equal(plain.status, 200); assert.equal(plain.body.parts[0].after, 0); assert.equal(plain.body.undoToken, undefined);
  await A('/picklist/undo', 'POST', { undo: plain.body.undo });
  assert.equal(await qty(led.id), q0);
});

test('rate limit på skrivinger → 429', async () => {
  P82._resetRate82();
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await A('/checkout', 'POST', {})).status;
  assert.equal(last, 429);
  assert.equal((await A('/projects')).status, 200, 'lesing er fri');
  P82._resetRate82();
});

test('Glimt: «hvor er ESP32-ene brukt?» svarer med produktene', async () => {
  P82._resetRate82();
  const r = await A('/checkout', 'POST', { projectName: 'Værstasjon 2', items: [{ partId: esp.id, qty: 1 }] });
  assert.equal(r.status, 200);
  const tool = G.findTool76;
  const { db } = await import('../server/db.js');
  const user = db.prepare('SELECT user_id FROM skj_projects WHERE id=?').pluck().get(r.body.project.id);
  const v = await tool.validate({ query: 'ESP32-ene brukt' }, { text: 'hvor er ESP32-ene brukt?', user });
  assert.equal(v.args.query, 'esp32');
  const out = await tool.run(v.args, { text: 'hvor er ESP32-ene brukt?', user });
  assert.equal(out.result.used, true);
  assert.equal(out.result.items[0].usedIn[0].name, 'Værstasjon 2');
  const { SENTENCES46 } = await import('../server/glimt45/tools46.js');
  assert.match(SENTENCES46['skjold.find'](v.args, out), /ESP32 DevKitC er brukt i «Værstasjon 2» \(1 stk\)/);
  const plain = await tool.run(v.args, { text: 'hvor er ESP32-ene?', user });
  assert.equal(plain.result.used, undefined);
});
