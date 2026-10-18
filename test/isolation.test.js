// Prompt 21: brukerskille. To brukere (admin og vanlig bruker) skal ikke se hverandres data, utenom det som deles i
// FinansHub (Boliger) og det brukeren selv har slått på deling for (Familie, huskelister delt med navngitte personer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-iso-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');

// Innlogging med sesjonscookie, som nettleseren.
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const headers = { cookie };
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const r = await app.request(path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text };
};

const A = client(await login('sebastian', 'testpassord1'));
const created = await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' });
assert.equal(created.status, 200, created.text);
const olaId = created.body.id;
const B = client(await login('ola', 'olaPassord123'));
const adminId = (await A('/api/me')).body.id;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const file = (name = 'k.jpg') => { const fd = new FormData(); fd.append('file', new File([jpeg], name, { type: 'image/jpeg' })); return fd; };

test('trading, skolekalender og media: bare admin; vanlig bruker får tomme data uten feil', async () => {
  const t = await A('/api/trading');
  assert.equal(t.status, 200);
  assert.ok(!t.body.restricted);
  for (const p of ['/api/trading', '/api/school', '/api/media/now', '/api/media/recent', '/api/media/history']) {
    const r = await B(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.body.restricted, true, p);
    assert.equal(r.body.configured, false, p);
    assert.ok(!r.text.includes('positions":[{'), p);
  }
  assert.equal((await B('/api/media/poster?src=plex&id=1')).status, 403);
});

test('/api/config: admin ser verdiene, vanlig bruker bare et trygt utvalg uten adresser, koordinater eller e-post', async () => {
  await A('/api/config', 'PUT', { trk_bring_uid: 'post@eksempel.no', ha_url: 'http://10.0.0.5:8123', wx_lat: '59.9301' });
  const a = (await A('/api/config')).text;
  assert.match(a, /post@eksempel\.no/);
  const b = await B('/api/config');
  assert.equal(b.status, 200);
  assert.ok(Array.isArray(b.body));
  for (const s of ['post@eksempel.no', '10.0.0.5', '59.9301', '192.168.', 'http']) assert.ok(!b.text.includes(s), s);
  assert.ok(b.body.every((g) => g.restricted && g.fields.every((f) => f.value === '')));
  assert.equal((await B('/api/config', 'PUT', { wx_place: 'X' })).status, 403);
  assert.equal((await B('/api/state')).body.schoolUrl, '');
  const h = await B('/api/health');
  assert.ok(!/"url"|"host"/.test(h.text));
});

test('/api/users: vanlig bruker ser bare id, navn og bilde om andre', async () => {
  const b = (await B('/api/users')).body;
  const admin = b.users.find((u) => u.id === adminId);
  assert.ok(admin.name);
  for (const k of ['username', 'role', 'totp', 'isMainAdmin', 'email']) assert.ok(!(k in admin), k);
  assert.equal(b.me.username, 'ola');
  const fu = (await B('/finans/api/users')).body.find((u) => u.id === adminId);
  assert.ok(!('username' in fu) && !('role' in fu));
  assert.ok('username' in (await A('/api/users')).body.users.find((u) => u.id === olaId));
});

test('Huskeliste: egne lister, deling med navngitte personer, bare eieren deler eller sletter', async () => {
  const mine = (await A('/api/tasks', 'POST', { title: 'Admins hemmelighet', list: 'handel' })).body.item;
  const bt = await B('/api/tasks');
  assert.ok(!bt.body.items.some((x) => x.id === mine.id));
  assert.ok(bt.body.lists.length >= 4 && bt.body.lists.every((l) => l.mine && l.owner === olaId));
  assert.ok(!bt.text.includes('Admins hemmelighet'));
  // Standard-ID-en «handel» peker på Olas egen Handel-liste.
  const own = (await B('/api/tasks', 'POST', { title: 'Olas melk', list: 'handel' })).body.item;
  assert.notEqual(own.list, 'handel');
  assert.ok(!(await A('/api/tasks')).text.includes('Olas melk'));
  assert.equal((await B(`/api/tasks/${mine.id}`, 'PATCH', { done: true })).status, 404);
  assert.equal((await B(`/api/tasks/${mine.id}`, 'DELETE')).status, 404);
  assert.equal((await B('/api/tasks/clear-done', 'POST', {})).body.removed, 0);
  assert.equal((await B('/api/tasks/lists/handel', 'DELETE')).status, 404);
  assert.ok(!(await B('/api/mobile/home')).body.tasks.some((x) => x.id === mine.id));

  // Admin deler Handel med Ola.
  const sh = await A('/api/tasks/lists/handel/members', 'PUT', { userIds: [olaId] });
  assert.equal(sh.status, 200, sh.text);
  assert.deepEqual(sh.body.list.members.map((m) => m.id), [olaId]);
  const bl = (await B('/api/tasks/lists')).body.lists.find((l) => l.id === 'handel');
  assert.deepEqual([bl.mine, bl.owner, bl.ownerName, bl.shared], [false, adminId, 'Sebastian', true]);
  assert.ok((await B('/api/tasks')).body.items.some((x) => x.id === mine.id));
  assert.equal((await B(`/api/tasks/${mine.id}`, 'PATCH', { done: true })).status, 200);
  assert.ok((await B('/api/tasks', 'POST', { title: 'Ola i delt liste', list: 'handel' })).status === 201);
  assert.equal((await B('/api/tasks/lists/handel/members', 'PUT', { userIds: [] })).status, 403);
  assert.equal((await B('/api/tasks/lists/handel', 'PATCH', { name: 'Mitt' })).status, 403);
  assert.equal((await B('/api/tasks/lists/handel', 'DELETE')).status, 403);
  // Oppgaven kan ikke tildeles noen uten tilgang til listen.
  assert.equal((await A('/api/tasks', 'POST', { title: 'x', list: 'hjem', assignee: olaId })).status, 400);
  // Deling av: Ola ser ikke listen lenger.
  await A('/api/tasks/lists/handel/members', 'PUT', { userIds: [] });
  assert.ok(!(await B('/api/tasks')).body.items.some((x) => x.id === mine.id));
});

test('Familie: av som standard; ingen posisjon, helse, hendelser eller soner uten deling', async () => {
  const me = (await B('/api/family')).body.me;
  assert.equal(me.sharing, 'off');
  assert.equal((await B('/api/family/location', 'POST', { lat: 59.95, lon: 10.70 })).body.stored, 0);
  await B('/api/family/health', 'POST', { date: new Date().toISOString().slice(0, 10), steps: 4321 });
  const fam = await A('/api/family');
  assert.ok(!fam.body.members.some((m) => m.userId === olaId));
  assert.ok(!(await A('/api/family/positions')).body.some((m) => m.userId === olaId));
  assert.equal((await A(`/api/family/track/${olaId}`)).body.points.length, 0);
  assert.equal((await A(`/api/family/ping/${olaId}`, 'POST', {})).status, 404);

  // Sone: privat til eieren, delt med shared:true, men bare eieren kan endre den.
  const z = (await A('/api/family/zones', 'POST', { name: 'Hemmelig sted', lat: 59.9, lon: 10.7, radius: 100 })).body;
  assert.equal(z.shared, false);
  assert.ok(!(await B('/api/family')).text.includes('Hemmelig sted'));
  assert.equal((await B(`/api/family/zones/${z.id}`, 'PATCH', { name: 'x' })).status, 404);
  await A(`/api/family/zones/${z.id}`, 'PATCH', { shared: true });
  assert.ok((await B('/api/family')).body.zones.some((x) => x.id === z.id && !x.mine));
  assert.equal((await B(`/api/family/zones/${z.id}`, 'PATCH', { name: 'x' })).status, 403);
  assert.equal((await B(`/api/family/zones/${z.id}`, 'DELETE')).status, 403);

  // Posisjon på, men ingen helsetyper: posisjon synlig, helse ikke.
  await B('/api/family/me', 'PUT', { sharing: 'on' });
  await B('/api/family/location', 'POST', { lat: 59.95, lon: 10.70 });
  let m = (await A('/api/family')).body.members.find((x) => x.userId === olaId);
  assert.equal(m.last.lat, 59.95);
  assert.equal(m.health, null);
  // Pause: verken posisjon eller helse.
  await B('/api/family/me', 'PUT', { sharing: 'paused', shareHealth: { steps: true } });
  assert.ok(!(await A('/api/family')).body.members.some((x) => x.userId === olaId));
  await B('/api/family/me', 'PUT', { sharing: 'off' });
});

test('FinansHub: Olas boligkvittering vises ikke i admins regnskap, kø eller jobs; kategorier bare for admin', async () => {
  const f = (await B('/finans/api/folders', 'POST', { name: 'Olas hytte', type: 'Hytte' })).body;
  const up = await B(`/finans/api/folders/${f.id}/receipts`, 'POST', file('ola.jpg'));
  assert.equal(up.status, 200, up.text);
  const rid = up.body.id;
  const jobs = (await B('/finans/api/receipts/jobs')).body;
  assert.ok(jobs.some((j) => j.id === rid));
  assert.ok(!(await A('/finans/api/receipts')).body.some((r) => r.id === rid));
  assert.ok(!(await A('/finans/api/receipts?status=queue')).body.some((r) => r.id === rid));
  assert.ok(!(await A('/finans/api/receipts/jobs')).body.some((j) => j.id === rid));
  assert.equal((await A(`/finans/api/receipts/${rid}`)).status, 404);
  assert.equal((await A(`/finans/api/receipts/${rid}/file`)).status, 404);
  assert.ok(!(await A('/finans/api/folders')).body.some((x) => x.id === f.id));
  // Når Ola deler boligen med admin, ser admin kvitteringen.
  await B(`/finans/api/folders/${f.id}/members`, 'POST', { userId: adminId, role: 'viewer' });
  assert.equal((await A(`/finans/api/receipts/${rid}`)).status, 200);
  // Bolig-kategorier og innstillinger: bare admin.
  assert.equal((await B('/finans/api/boliger/categories', 'POST', { name: 'Olas kategori' })).status, 403);
  assert.equal((await B('/finans/api/boliger/settings', 'PUT', { aiNew: false })).status, 403);
  assert.equal((await A('/finans/api/boliger/categories', 'POST', { name: 'Admins kategori' })).status, 200);
  // DELETE /all sletter bare admins egne boliger.
  await A('/finans/api/folders', 'POST', { name: 'Admins bolig' });
  assert.equal((await A('/finans/api/all', 'DELETE', { confirm: 'SLETT' })).status, 200);
  const left = (await B('/finans/api/folders')).body;
  assert.ok(left.some((x) => x.id === f.id), 'Olas bolig er igjen');
  assert.ok(!(await A('/finans/api/folders')).body.some((x) => x.name === 'Admins bolig'));
  assert.equal((await B(`/finans/api/folders/${f.id}/receipts/${rid}/file`)).status, 200);
});

test('/api/files: bare eieren og admin', async () => {
  const fd = new FormData(); fd.append('file', new File([jpeg], 'r.jpg', { type: 'image/jpeg' })); fd.append('store', 'Rema');
  const rc = (await A('/api/receipts', 'POST', fd)).body;
  assert.ok(rc.file);
  assert.equal((await A(`/api/files/${rc.file}`)).status, 200);
  assert.equal((await B(`/api/files/${rc.file}`)).status, 404);
  const bg = (await B('/api/backgrounds/egen', 'POST', file('bg.jpg'))).body.bgCustom.egen;
  assert.equal((await B(`/api/files/${bg}`)).status, 200);
  assert.equal((await A(`/api/files/${bg}`)).status, 200, 'admin får filer for drift');
  assert.equal((await B('/api/files/0123456789abcdef01234567.jpg')).status, 404);
});
