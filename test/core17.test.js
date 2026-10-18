// Prompt 17 (CORE): sanntid på /api/ws, Huskeliste, Sporing (velg flere, Arkiv, ParcelsApp-kvote), varsler med egen lyd,
// appnavn, «Sammenlign Yr og Storm», Boliger-alias og krypterte hemmeligheter i innstillingene.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-c17-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.MOCK_DATA = '1';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app, wsUser } = await import('../server/index.js');
const { default: fin } = await import('../server/finans/routes.js');
const { attachRealtime } = await import('../server/realtime.js');
const { serve } = await import('@hono/node-server');
const { WebSocket } = await import('ws');
const { cfg, updateConfig } = await import('../server/settings.js');
const { kv, OWNER } = await import('../server/db.js');
const C = await import('../server/tracking-carriers.js');

const login = await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body, headers = H) => {
  const r = await app.request(path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), res: r };
};

// Ekte HTTP-server med WebSocket for sanntidstesten.
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
await new Promise((r) => server.once('listening', r));
attachRealtime(server, wsUser);
const port = server.address().port;
after(() => server.close());

function openWs(q = `?token=${token}`) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws${q}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  return { ws, msgs, ready: new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); ws.once('unexpected-response', (_, r) => rej(new Error(`HTTP ${r.statusCode}`))); }) };
}
const waitFor = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } return null; };

test('WebSocket: token godtas, ugyldig avvises, oppgaver sendes ut i sanntid', async () => {
  const bad = openWs('?token=feil');
  await assert.rejects(bad.ready, /401/);
  const w = openWs();
  await w.ready;
  assert.ok(await waitFor(() => w.msgs.find((m) => m.type === 'hello')));
  const r = await call('/api/tasks', 'POST', { title: 'Kjøp kaffe', list: 'handel', due: '2026-10-20' });
  assert.equal(r.status, 201);
  const m = await waitFor(() => w.msgs.find((x) => x.type === 'tasks' && x.action === 'created'));
  assert.ok(m, JSON.stringify(w.msgs));
  assert.equal(m.item.title, 'Kjøp kaffe');
  w.ws.send('ping');
  assert.ok(await waitFor(() => w.msgs.find((x) => x.type === 'pong')));
  w.ws.close();
});

test('Huskeliste: lister, oppgaver, ferdig, neste tre og sletting av liste', async () => {
  const all = await call('/api/tasks');
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.lists.slice(0, 4).map((l) => l.name), ['Hjem', 'Handel', 'Hytta', 'Jobb']);
  assert.ok(all.body.items.length >= 1);
  assert.ok(Array.isArray(all.body.members) && all.body.members.length >= 1);
  // Ikke-ferdige før ferdige
  const firstDone = all.body.items.findIndex((x) => x.done);
  if (firstDone >= 0) assert.ok(all.body.items.slice(firstDone).every((x) => x.done));
  const t = (await call('/api/tasks', 'POST', { title: 'Mal gjerdet', list: 'hytta' })).body.item;
  const d = await call(`/api/tasks/${t.id}`, 'PATCH', { done: true });
  assert.equal(d.body.item.done, true);
  assert.ok(d.body.item.doneAt);
  assert.equal((await call('/api/tasks', 'POST', { title: '' })).status, 400);
  assert.equal((await call('/api/tasks', 'POST', { title: 'x', due: '20.10' })).status, 400);
  const next = await call('/api/tasks/next?n=3');
  assert.equal(next.body.items.length, 3);
  assert.ok(next.body.items.every((x) => !x.done));
  const nl = await call('/api/tasks/lists', 'POST', { name: 'Båten', color: '#123456' });
  assert.equal(nl.status, 201);
  assert.equal(nl.body.list.id, 'baten');
  const moved = (await call('/api/tasks', 'POST', { title: 'Vask dekk', list: 'baten' })).body.item;
  const del = await call('/api/tasks/lists/baten', 'DELETE');
  assert.equal(del.body.movedTo, 'hjem');
  assert.equal((await call('/api/tasks')).body.items.find((x) => x.id === moved.id).list, 'hjem');
  assert.equal((await call(`/api/tasks/${moved.id}`, 'DELETE')).status, 200);
  // Uten innlogging
  assert.equal((await app.request('/api/tasks')).status, 401);
  // Med på mobilforsiden
  const home = await call('/api/mobile/home');
  assert.equal(home.body.tasks.length, 3);
  assert.equal(home.body.app.name, 'Homelab');
});

test('Sporing: velg flere → arkiver, Arkiv-filter, gjenopprett og slett', async () => {
  const a = (await call('/api/tracking', 'POST', { trackingNo: 'CP111222333NO', name: 'Pakke A' })).body.item;
  const b = (await call('/api/tracking', 'POST', { trackingNo: 'CP444555666NO', name: 'Pakke B' })).body.item;
  assert.ok(a?.id && b?.id);
  const ar = await call('/api/tracking/bulk', 'POST', { ids: [a.id, b.id], action: 'archive' });
  assert.equal(ar.status, 200);
  assert.equal(ar.body.changed, 2);
  const arkiv = await call('/api/tracking?archived=1');
  assert.ok(arkiv.body.items.every((x) => x.archived));
  assert.ok([a.id, b.id].every((id) => arkiv.body.items.some((x) => x.id === id)));
  assert.ok((await call('/api/tracking?archived=0')).body.items.every((x) => !x.archived));
  assert.ok(arkiv.body.counts.archived >= 2);
  await call('/api/tracking/bulk', 'POST', { ids: [a.id], action: 'unarchive' });
  assert.equal((await call('/api/tracking?archived=0')).body.items.some((x) => x.id === a.id), true);
  const del = await call('/api/tracking/bulk', 'POST', { ids: [a.id, b.id], action: 'delete' });
  assert.equal(del.body.changed, 2);
  assert.equal((await call('/api/tracking/bulk', 'POST', { ids: [], action: 'delete' })).status, 400);
  assert.equal((await call('/api/tracking/bulk', 'POST', { ids: [1], action: 'knus' })).status, 400);
  assert.deepEqual(Object.keys((await call('/api/tracking')).body.parcelsapp).sort(), ['configured', 'limit', 'month', 'used']);
});

test('ParcelsApp: brukes som siste reserve, teller og stopper etter 3 oppslag i måneden', async () => {
  updateConfig({ trk_parcelsapp_key: 'pa-test-key' });
  // Hemmeligheten lagres kryptert, men leses som klartekst.
  assert.match(kv.get(OWNER, 'cfg', {}).trk_parcelsapp_key, /^enc1:/);
  assert.equal(cfg('trk_parcelsapp_key'), 'pa-test-key');
  kv.del(OWNER, 'parcelsapp_usage');
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push(String(url));
    if (String(url).startsWith('https://parcelsapp.com/api/v3/shipments/tracking') && opts.method === 'POST') return new Response(JSON.stringify({ uuid: 'u1', done: false }));
    if (String(url).includes('uuid=u1')) return new Response(JSON.stringify({ done: true, shipments: [{ status: 'delivered', states: [{ date: '2026-10-17T10:00:00Z', status: 'Delivered', location: 'Oslo' }] }] }));
    return new Response('{}', { status: 404 });
  };
  try {
    // Uten tillatelse (bakgrunnsjobben) brukes den ikke.
    await assert.rejects(C.fetchStatus('other', 'XX123', {}), /17TRACK eller ParcelsApp/);
    assert.equal(C.parcelsappUsage().used, 0);
    const r = await C.fetchStatus('other', 'XX123', { allowParcelsapp: true });
    assert.equal(r.status, 'delivered');
    assert.equal(r.via, 'parcelsapp');
    assert.equal(C.parcelsappUsage().used, 1);
    await C.fetchStatus('other', 'XX124', { allowParcelsapp: true });
    await C.fetchStatus('other', 'XX125', { allowParcelsapp: true });
    assert.equal(C.parcelsappUsage().used, 3);
    const before = calls.length;
    await assert.rejects(C.fetchStatus('other', 'XX126', { allowParcelsapp: true }));
    assert.equal(calls.length, before, 'ingen kall etter at kvoten er brukt opp');
  } finally { globalThis.fetch = orig; updateConfig({ trk_parcelsapp_key: null }); }
});

test('Varsler: valg per bruker, validering, egen lyd og innebygde lyder', async () => {
  const g = await call('/api/me/notify');
  assert.equal(g.body.on, true);
  assert.equal(g.body.quietFrom, '22:00');
  assert.equal(g.body.sounds.length, 7);
  const p = await call('/api/me/notify', 'PUT', { on: false, quietFrom: '23:30', sound: 'pling', volume: 40, groups: { pakker: false } });
  assert.equal(p.status, 200);
  assert.deepEqual([p.body.on, p.body.quietFrom, p.body.sound, p.body.volume, p.body.groups.pakker, p.body.groups.finans], [false, '23:30', 'pling', 40, false, true]);
  assert.equal((await call('/api/me/notify', 'PUT', { quietTo: '25:00' })).status, 400);
  assert.equal((await call('/api/me/notify', 'PUT', { sound: 'egen' })).status, 400);
  // Egen lyd: en liten WAV
  const wav = Buffer.alloc(64); wav.write('RIFF', 0); wav.write('WAVE', 8);
  const fd = new FormData(); fd.append('file', new File([wav], 'pling.wav', { type: 'audio/wav' }));
  const up = await call('/api/me/notify/sound', 'POST', fd, { authorization: H.authorization });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.sound, 'egen');
  assert.ok(up.body.customSound.url);
  const get = await app.request('/api/me/notify/sound', { headers: { authorization: H.authorization } });
  assert.equal(get.headers.get('content-type'), 'audio/wav');
  const fd2 = new FormData(); fd2.append('file', new File([Buffer.from('ikke lyd')], 'x.mp3'));
  assert.equal((await call('/api/me/notify/sound', 'POST', fd2, { authorization: H.authorization })).status, 400);
  const rm = await call('/api/me/notify/sound', 'DELETE');
  assert.equal(rm.body.customSound, null);
  assert.equal(rm.body.sound, 'klokke');
  const pub = await app.request('/assets/sounds/klokke.wav');
  assert.equal(pub.status, 200);
});

test('Appnavn: offentlig lesing, admin kan endre, validering', async () => {
  assert.equal((await app.request('/api/app').then((r) => r.json())).name, 'Homelab');
  const p = await call('/api/app', 'PUT', { name: 'Torskenes Verden', icon: 'monogram' });
  assert.equal(p.status, 200);
  assert.deepEqual([p.body.name, p.body.icon], ['Torskenes Verden', 'monogram']);
  assert.equal((await call('/api/app', 'PUT', { name: '' })).status, 400);
  assert.equal((await call('/api/app', 'PUT', { icon: 'katt' })).status, 400);
  assert.equal((await app.request('/api/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"name":"x"}' })).status, 401);
  assert.equal((await call('/api/mobile/home')).body.app.name, 'Torskenes Verden');
  await call('/api/app', 'PUT', { name: 'Homelab', icon: 'hus' });
});

test('Sammenlign Yr og Storm: 24 timer, 7 dager, avvik og enighet', async () => {
  const r = await call('/api/weather/compare?place=bergen');
  assert.equal(r.status, 200);
  assert.equal(r.body.place.name, 'Bergen');
  assert.equal(r.body.hours.length, 24);
  assert.equal(r.body.days.length, 7);
  const d = r.body.days[0];
  assert.ok(d.yr && d.ecmwf && typeof d.diffHi === 'number');
  assert.ok(d.agree >= 0 && d.agree <= 100);
  assert.ok(r.body.agreement >= 0 && r.body.agreement <= 100);
  assert.ok(r.body.hours.every((h) => 'yr' in h && 'ecmwf' in h));
  assert.match(r.body.sources.ecmwf, /ECMWF/);
});

test('Boliger: /api/homes/:id/expenses legger utgift i boligen', async () => {
  const folders = (await call('/finans/api/folders')).body;
  const list = Array.isArray(folders) ? folders : folders.items ?? folders.folders;
  const f = list?.[0];
  assert.ok(f, JSON.stringify(folders).slice(0, 200));
  const r = await call(`/api/homes/${f.id}/expenses`, 'POST', { description: 'Maling', amount: 450, date: '2026-10-18' });
  assert.ok(r.status < 300, JSON.stringify(r.body).slice(0, 300));
  const full = (await call(`/finans/api/folders/${f.id}`)).body;
  assert.ok(JSON.stringify(full.entries ?? full).includes('Maling'));
});
