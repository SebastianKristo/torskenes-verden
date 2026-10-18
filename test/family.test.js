// Prompt 16: Familie og kart – posisjon, personvern (pause/av/omtrentlig), soner med varsler, hendelser og helse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-fam-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const auth = await import('../server/auth.js');
const { default: fin } = await import('../server/finans/routes.js');
const { default: fam, dist } = await import('../server/family.js');

auth.createUser({ username: 'ingrid', password: 'testpassord2', name: 'Ingrid' });
const tok = async (username, password) => (await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, device: 'test' }) })).json()).token;
const A = await tok('sebastian', 'testpassord1'), B = await tok('ingrid', 'testpassord2');
const call = (t) => async (path, method = 'GET', body) => {
  const r = await fam.request(path, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const a = call(A), b = call(B);
const HOME = { lat: 59.9275, lon: 10.7160 };
const ingridId = auth.listUsers().find((u) => u.username === 'ingrid').id;
const sebId = auth.listUsers().find((u) => u.username === 'sebastian').id;

test('prompt 21: deling er av som standard; ingenting lagres og ingen ser deg før du slår det på', async () => {
  const me = (await b('/')).body.me;
  assert.equal(me.sharing, 'off');
  assert.ok(Object.values(me.shareHealth).every((v) => v === false));
  assert.equal((await b('/location', 'POST', { lat: 59.95, lon: 10.70 })).body.stored, 0);
  assert.ok(!(await a('/')).body.members.some((x) => x.userId === ingridId));
  await a('/me', 'PUT', { sharing: 'on' });
  await b('/me', 'PUT', { sharing: 'on', shareHealth: { steps: true, restingHr: true, sleep: true, activeKcal: true, week: true } });
});

test('krever innlogging, også vanlig bruker med bare finance:read kan dele', async () => {
  assert.equal((await fam.request('/')).status, 401);
  const r = await b('/location', 'POST', { lat: 59.95, lon: 10.70, acc: 9, speed: 3, battery: 0.64, charging: false, activity: 'walking' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stored, 1);
  assert.equal((await b('/location', 'POST', { lat: 120, lon: 10 })).status, 400);
});

test('nøyaktig posisjon ses av de andre med sensorer; batteri i prosent', async () => {
  const m = (await a('/')).body.members.find((x) => x.userId === ingridId);
  assert.equal(m.sharing, 'on');
  assert.deepEqual([m.last.lat, m.last.lon, m.last.speed, m.last.battery, m.last.charging, m.last.activity], [59.95, 10.70, 3, 64, false, 'walking']);
});

test('omtrentlig: avrundet posisjon og spor uten fart for de andre, nøyaktig for en selv', async () => {
  await b('/me', 'PUT', { precision: 'approx' });
  await b('/location', 'POST', { points: [{ lat: 59.95123, lon: 10.70456, speed: 4, ts: Date.now() - 1000 }, { lat: 59.95131, lon: 10.70466, speed: 4 }] });
  const m = (await a('/')).body.members.find((x) => x.userId === ingridId);
  assert.deepEqual([m.last.lat, m.last.lon, m.last.speed, m.last.approx], [59.95, 10.70, null, true]);
  assert.ok(m.last.acc >= 1000);
  const self = (await b('/')).body.members.find((x) => x.self);
  assert.equal(self.last.lat, 59.95131);
  const t = (await a(`/track/${ingridId}`)).body;
  assert.ok(t.points.every((p) => p.speed === null && Math.round(p.lat * 100) === p.lat * 100));
  assert.ok(t.points.length < 3, 'grove punkter slås sammen');
  await b('/me', 'PUT', { precision: 'exact' });
});

test('pause: ingenting lagres og ingen posisjon vises, bare status; av sletter sporet', async () => {
  await b('/me', 'PUT', { sharing: 'paused' });
  const r = await b('/location', 'POST', { lat: 59.90, lon: 10.75 });
  assert.equal(r.body.stored, 0);
  // Prompt 21: den som har pause, vises ikke for de andre.
  assert.ok(!(await a('/')).body.members.some((x) => x.userId === ingridId));
  assert.deepEqual((await a(`/track/${ingridId}`)).body.points, []);
  await b('/me', 'PUT', { sharing: 'off' });
  await b('/me', 'PUT', { sharing: 'on' });
  assert.equal((await b(`/track/${ingridId}`)).body.points.length, 0, 'av sletter lagrede posisjoner');
  assert.equal((await b('/me', 'PUT', { sharing: 'kanskje' })).status, 400);
});

test('soner: inn og ut gir hendelser, og varsel bare der seeren har slått det på', async () => {
  const z = (await a('/zones', 'POST', { name: 'Hjem', ...HOME, radius: 150, color: '#2f7a4f', shared: true })).body;
  assert.equal(z.shared, true);
  assert.equal(z.name, 'Hjem');
  assert.equal((await a('/zones', 'POST', { name: '', ...HOME })).status, 400);
  const since = Date.now() - 1;
  // Uten varsel: hendelsen lagres, men kommer ikke i varslene.
  await b('/location', 'POST', { lat: 59.94, lon: 10.70 });
  const inn = await b('/location', 'POST', { lat: HOME.lat + 0.0003, lon: HOME.lon });
  assert.deepEqual(inn.body.events.map((e) => [e.kind, e.zone]), [['enter', 'Hjem']]);
  assert.equal((await a(`/events?since=${since}`)).body.events.length, 0);
  // Med varsel for «forlot»:
  await a(`/zones/${z.id}/notify`, 'PUT', { userId: ingridId, enter: false, leave: true });
  // GPS-støy rett utenfor kanten gir ingen ny hendelse (hysterese).
  const noise = await b('/location', 'POST', { lat: HOME.lat + 0.0014, lon: HOME.lon });
  assert.equal(noise.body.events.length, 0, `${dist(HOME, { lat: HOME.lat + 0.0014, lon: HOME.lon })} m`);
  await b('/location', 'POST', { lat: 59.94, lon: 10.70 });
  const ev = (await a(`/events?since=${since}`)).body.events;
  assert.deepEqual(ev.map((e) => [e.kind, e.name]), [['leave', 'Ingrid']]);
  assert.equal((await b(`/events?since=${since}`)).body.events.length, 0, 'egne hendelser varsles ikke');
  const g = (await a('/')).body;
  assert.ok(g.events.some((e) => e.kind === 'enter'));
  assert.deepEqual(g.zones.find((x) => x.id === z.id).notify[ingridId], { enter: false, leave: true });
  assert.equal((await a(`/zones/${z.id}`, 'PATCH', { radius: 300 })).body.radius, 300);
  assert.equal((await a(`/zones/${z.id}`, 'DELETE')).status, 200);
  assert.equal((await a('/')).body.zones.length, 0);
});

test('helse: bare delte felt lagres og vises; uke-sammendrag', async () => {
  await b('/me', 'PUT', { shareHealth: { hr: false, sleep: false } });
  const today = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const r = await b('/health', 'POST', { date: today, steps: 8123, restingHr: 54, hr: 88, sleepMin: 431, activeKcal: 512, week: [{ date: y, steps: 6000, sleepMin: 400 }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const h = (await a('/')).body.members.find((x) => x.userId === ingridId).health;
  assert.equal(h.today.steps, 8123);
  assert.equal(h.today.restingHr, 54);
  assert.ok(!('hr' in h.today) && !('sleepMin' in h.today));
  assert.equal(h.week.length, 2);
  assert.equal((await b('/health', 'POST', { steps: 3 })).status, 400);
  // Seb deler ikke helse ennå: ingen data.
  await a('/me', 'PUT', { sharing: 'on' });
  assert.equal((await b('/')).body.members.find((x) => x.userId === sebId).health, null);
});

test('Leaflet leveres fra egen server', async () => {
  const r = await fam.request('/vendor/leaflet.js', { headers: { authorization: `Bearer ${A}` } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.equal((await fam.request('/vendor/annet.js', { headers: { authorization: `Bearer ${A}` } })).status, 404);
});
