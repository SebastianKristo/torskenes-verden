// Prompt 22: Huskeliste ↔ Home Assistant To-do. En liten HA i testen (REST + WebSocket) med todo-entiteter,
// todo/item/list, todo/item/subscribe, servicekall og config flow for «Local To-do».
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p22ha-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
process.env.HA_SYNC_DEBOUNCE_MS = '30';
process.env.HA_SYNC_RETRY_MS = '250';
delete process.env.MOCK_DATA;

/* ---------------- Mock Home Assistant ---------------- */
const HA = {
  up: true, token: 'tok-123', n: 0, calls: [],
  lists: new Map([['todo.handleliste', { name: 'Handleliste', items: [{ uid: 'h-egg', summary: 'Egg', status: 'needs_action' }, { uid: 'h-brod', summary: 'Brød', status: 'completed', due: '2026-10-20' }] }],
    ['todo.ferie', { name: 'Ferie', items: [] }]]),
  subs: new Set(), // { ws, id, entity }
  updated: new Map(),
  emit(entity) {
    this.updated.set(entity, Date.now());
    const items = this.lists.get(entity)?.items ?? [];
    for (const s of this.subs) if (s.entity === entity && s.ws.readyState === 1) s.ws.send(JSON.stringify({ id: s.id, type: 'event', event: { items } }));
    for (const s of this.subs) if (s.entity === '*state' && s.ws.readyState === 1) s.ws.send(JSON.stringify({ id: s.id, type: 'event', event: { event_type: 'state_changed', data: { entity_id: entity } } }));
  },
  items(e) { return this.lists.get(e).items; },
  find(e, summary) { return this.items(e).find((x) => x.summary === summary); },
};
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = createServer(async (req, res) => {
  if (!HA.up) return send(res, 503, { message: 'nede' });
  if (req.headers.authorization !== `Bearer ${HA.token}`) return send(res, 401, { message: 'Unauthorized' });
  let raw = ''; for await (const ch of req) raw += ch;
  const b = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://x');
  HA.calls.push(`${req.method} ${url.pathname}`);
  if (url.pathname === '/api/states') return send(res, 200, [...HA.lists].map(([entity_id, v]) => ({ entity_id, state: String(v.items.filter((i) => i.status === 'needs_action').length), attributes: { friendly_name: v.name }, last_updated: new Date(HA.updated.get(entity_id) ?? 0).toISOString() }))
    .concat([{ entity_id: 'light.stue', state: 'on', attributes: { friendly_name: 'Stue' } }]));
  const st = url.pathname.match(/^\/api\/states\/(.+)$/);
  if (st) return send(res, 200, { entity_id: st[1], last_updated: new Date(HA.updated.get(decodeURIComponent(st[1])) ?? 0).toISOString() });
  const sv = url.pathname.match(/^\/api\/services\/todo\/(\w+)$/);
  if (sv) {
    const L = HA.lists.get(b.entity_id);
    if (!L) return send(res, 400, { message: 'Unknown entity' });
    if (sv[1] === 'add_item') L.items.push({ uid: `h${++HA.n}`, summary: b.item, status: 'needs_action', ...(b.due_date ? { due: b.due_date } : {}), ...(b.description ? { description: b.description } : {}) });
    else if (sv[1] === 'update_item') {
      const it = L.items.find((x) => x.uid === b.item || x.summary === b.item);
      if (!it) return send(res, 400, { message: 'Unable to find to-do list item' });
      if (b.rename !== undefined) it.summary = b.rename;
      if (b.status) it.status = b.status;
      if ('due_date' in b) { if (b.due_date) it.due = b.due_date; else delete it.due; }
      if ('description' in b) { if (b.description) it.description = b.description; else delete it.description; }
    } else if (sv[1] === 'remove_item') L.items = L.items.filter((x) => x.uid !== b.item);
    HA.emit(b.entity_id);
    return send(res, 200, []);
  }
  if (url.pathname === '/api/config/config_entries/flow' && req.method === 'POST') return send(res, 200, { flow_id: 'f1', type: 'form', step_id: 'user' });
  if (url.pathname === '/api/config/config_entries/flow/f1') {
    const id = `todo.${String(b.todo_list_name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    HA.lists.set(id, { name: b.todo_list_name, items: [] });
    return send(res, 200, { type: 'create_entry', title: b.todo_list_name });
  }
  send(res, 404, { message: 'Not found' });
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  if (!HA.up || !req.url.startsWith('/api/websocket')) { sock.destroy(); return; }
  wss.handleUpgrade(req, sock, head, (ws) => {
    let authed = false;
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.type === 'auth') { authed = m.access_token === HA.token; ws.send(JSON.stringify({ type: authed ? 'auth_ok' : 'auth_invalid' })); return; }
      if (!authed) return;
      if (m.type === 'todo/item/list') return ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: { items: HA.items(m.entity_id) } }));
      if (m.type === 'todo/item/subscribe') { HA.subs.add({ ws, id: m.id, entity: m.entity_id }); ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: null })); return; }
      if (m.type === 'subscribe_events') { HA.subs.add({ ws, id: m.id, entity: '*state' }); ws.send(JSON.stringify({ id: m.id, type: 'result', success: true, result: null })); return; }
      ws.send(JSON.stringify({ id: m.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } }));
    });
    ws.on('close', () => { for (const s of HA.subs) if (s.ws === ws) HA.subs.delete(s); });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const haUrl = `http://127.0.0.1:${server.address().port}`;
const haDown = () => { HA.up = false; for (const c of wss.clients) c.terminate(); };

/* ---------------- Appen ---------------- */
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const { updateConfig } = await import('../server/settings.js');
const ha = await import('../server/tasks-ha.js');
const { db } = await import('../server/db.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
};
const A = client(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' })).status, 200);
const B = client(await login('ola', 'olaPassord123'));
updateConfig({ ha_url: haUrl, ha_token: HA.token });
ha.setTransport(null);

const until = async (fn, ms = 2000, msg = 'tidsavbrudd') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) assert.fail(msg); await new Promise((r) => setTimeout(r, 25)); } };
const listsA = (await A('/api/tasks/lists')).body.lists;
const handel = listsA.find((l) => l.name === 'Handel');
const tasksIn = async (C, listId) => (await C(`/api/tasks?list=${listId}`)).body.items;

after(() => { ha.stopHa(); for (const c of wss.clients) c.terminate(); wss.close(); server.closeAllConnections?.(); server.close(); });

test('migrering: huske_ha_map, hl_tasks.ha_uid og updated_at finnes', () => {
  const cols = db.prepare('PRAGMA table_info(huske_ha_map)').all().map((c) => c.name);
  assert.deepEqual(['list_id', 'entity_id', 'user_id'].filter((c) => cols.includes(c)), ['list_id', 'entity_id', 'user_id']);
  const t = db.prepare('PRAGMA table_info(hl_tasks)').all().map((c) => c.name);
  assert.ok(t.includes('ha_uid') && t.includes('updated_at'));
});

test('bare admin: vanlig bruker får 403 på alle HA-rutene', async () => {
  for (const [p, m, b] of [['/api/tasks/ha', 'GET'], ['/api/tasks/ha', 'PUT', { enabled: true }], ['/api/tasks/ha/map', 'PUT', { listId: handel.id, entityId: 'todo.ferie' }], ['/api/tasks/ha/sync', 'POST', {}], ['/api/tasks/ha/create', 'POST', { name: 'X' }]]) {
    assert.equal((await B(p, m, b)).status, 403, `${m} ${p}`);
  }
});

test('GET /api/tasks/ha: av, med todo-entitetene fra HA (ikke andre domener)', async () => {
  const r = await A('/api/tasks/ha');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.status, 'off');
  assert.deepEqual(r.body.entities.map((e) => e.entity_id).sort(), ['todo.ferie', 'todo.handleliste']);
  assert.deepEqual(r.body.entities.find((e) => e.entity_id === 'todo.handleliste'), { entity_id: 'todo.handleliste', name: 'Handleliste' });
  assert.deepEqual(r.body.maps, []);
});

test('admin kan ikke koble en liste hen ikke har tilgang til', async () => {
  const olaList = (await B('/api/tasks/lists')).body.lists[0];
  assert.equal((await A('/api/tasks/ha/map', 'PUT', { listId: olaList.id, entityId: 'todo.ferie' })).status, 404);
  assert.equal((await A('/api/tasks/ha/map', 'PUT', { listId: handel.id, entityId: 'light.stue' })).status, 400);
  assert.equal((await A('/api/tasks/ha/map', 'PUT', { listId: handel.id, entityId: 'todo.finnes_ikke' })).status, 404);
});

test('første kobling slår sammen uten duplikater (samme tekst, uavhengig av store/små bokstaver)', async () => {
  await A('/api/tasks', 'POST', { title: 'Melk', list: handel.id });
  await A('/api/tasks', 'POST', { title: 'egg', list: handel.id });
  const on = await A('/api/tasks/ha', 'PUT', { enabled: true });
  assert.equal(on.status, 200, on.text);
  assert.equal(on.body.enabled, true);
  const m = await A('/api/tasks/ha/map', 'PUT', { listId: handel.id, entityId: 'todo.handleliste' });
  assert.equal(m.status, 200, m.text);
  assert.deepEqual(m.body.maps, [{ listId: handel.id, entityId: 'todo.handleliste' }]);
  assert.equal(m.body.status, 'ok', m.body.error ?? '');
  assert.ok(m.body.syncedAt);
  const local = await tasksIn(A, handel.id);
  assert.deepEqual(local.map((t) => t.title.toLowerCase()).sort(), ['brød', 'egg', 'melk']);
  assert.ok(local.every((t) => t.ha), 'alle er koblet');
  assert.equal(local.find((t) => t.title === 'Brød').done, true);
  assert.equal(local.find((t) => t.title === 'Brød').due, '2026-10-20');
  assert.deepEqual(HA.items('todo.handleliste').map((i) => i.summary.toLowerCase()).sort(), ['brød', 'egg', 'melk']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM huske_ha_map WHERE user_id IS NOT NULL').get().n, 1);
  // Ny synk gir ingen endringer.
  await A('/api/tasks/ha/sync', 'POST', {});
  assert.equal(HA.items('todo.handleliste').length, 3);
  assert.equal((await tasksIn(A, handel.id)).length, 3);
});

test('legg til i appen → i HA innen 2 s (todo.add_item), med frist og «Tildelt:»', async () => {
  const me = (await A('/api/me')).body;
  const r = await A('/api/tasks', 'POST', { title: 'Smør', list: handel.id, due: '2026-10-22', assignee: me.id });
  assert.equal(r.status, 201, r.text);
  const it = await until(() => HA.find('todo.handleliste', 'Smør'));
  assert.equal(it.due, '2026-10-22');
  assert.match(it.description, /^Tildelt: /);
  await until(async () => (await tasksIn(A, handel.id)).find((t) => t.title === 'Smør')?.ha);
});

test('legg til i HA (Assist) → i appen via todo/item/subscribe; kryss av i HA → krysset av i appen', async () => {
  HA.items('todo.handleliste').push({ uid: 'h-ost', summary: 'Ost', status: 'needs_action' });
  HA.emit('todo.handleliste');
  await until(async () => (await tasksIn(A, handel.id)).some((t) => t.title === 'Ost'), 2000, 'Ost kom ikke');
  HA.find('todo.handleliste', 'Melk').status = 'completed';
  HA.emit('todo.handleliste');
  await until(async () => (await tasksIn(A, handel.id)).find((t) => t.title === 'Melk')?.done, 2000, 'Melk ble ikke krysset av');
  // Isolasjon: den andre brukeren ser ingenting fra listen.
  const b = (await B('/api/tasks')).body.items;
  assert.ok(!b.some((t) => ['Ost', 'Melk', 'Smør'].includes(t.title)));
});

test('endre og slett i appen → oppdatert og fjernet i HA; slett i HA → slettet i appen', async () => {
  const smor = (await tasksIn(A, handel.id)).find((t) => t.title === 'Smør');
  await A(`/api/tasks/${smor.id}`, 'PATCH', { done: true, title: 'Smør (usaltet)' });
  await until(() => HA.find('todo.handleliste', 'Smør (usaltet)')?.status === 'completed');
  await A(`/api/tasks/${smor.id}`, 'DELETE');
  await until(() => !HA.find('todo.handleliste', 'Smør (usaltet)'));
  const L = HA.lists.get('todo.handleliste');
  L.items = L.items.filter((i) => i.summary !== 'Ost');
  HA.emit('todo.handleliste');
  await until(async () => !(await tasksIn(A, handel.id)).some((t) => t.title === 'Ost'), 2000, 'Ost ble ikke slettet');
});

test('HA nede → endringen køes i databasen, status error; HA oppe igjen → sendt, status ok', async () => {
  haDown();
  const egg = (await tasksIn(A, handel.id)).find((t) => t.title.toLowerCase() === 'egg');
  await A(`/api/tasks/${egg.id}`, 'PATCH', { title: 'Egg (12 stk)' });
  await A('/api/tasks', 'POST', { title: 'Juice', list: handel.id });
  await until(async () => (await A('/api/tasks/ha')).body.status === 'error', 2000, 'status ble ikke error');
  const s = (await A('/api/tasks/ha')).body;
  assert.ok(s.queue >= 1, 'køen har endringene');
  assert.ok(s.error);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM huske_ha_queue').get().n >= 1);
  HA.up = true;
  await until(async () => (await A('/api/tasks/ha')).body.status === 'ok', 3000, 'kom seg ikke etter at HA var oppe igjen');
  await until(() => HA.find('todo.handleliste', 'Egg (12 stk)') && HA.find('todo.handleliste', 'Juice'));
  assert.equal((await A('/api/tasks/ha')).body.queue, 0);
});

test('konflikt: sist endret vinner (endring i HA etter lokal endring vinner)', async () => {
  const juice = (await tasksIn(A, handel.id)).find((t) => t.title === 'Juice');
  // Lokal endring mens HA er nede, så en nyere endring i HA av samme oppgave.
  haDown();
  await A(`/api/tasks/${juice.id}`, 'PATCH', { title: 'Juice (eple)' });
  await new Promise((r) => setTimeout(r, 30));
  HA.find('todo.handleliste', 'Juice').summary = 'Juice (appelsin)';
  HA.updated.set('todo.handleliste', Date.now());
  HA.up = true;
  await A('/api/tasks/ha/sync', 'POST', {});
  await until(async () => (await tasksIn(A, handel.id)).some((t) => t.title === 'Juice (appelsin)'), 2000, 'HA-endringen vant ikke');
  assert.ok(HA.find('todo.handleliste', 'Juice (appelsin)'));
});

test('lag ny liste i HA (config flow «Local To-do»)', async () => {
  const r = await A('/api/tasks/ha/create', 'POST', { name: 'Hytta' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.created.entity_id, 'todo.hytta');
  assert.ok(r.body.entities.some((e) => e.entity_id === 'todo.hytta'));
  assert.equal((await A('/api/tasks/ha/create', 'POST', { name: '' })).status, 400);
});

test('koble fra: entityId null fjerner koblingen, oppgavene blir', async () => {
  const before = (await tasksIn(A, handel.id)).length;
  const r = await A('/api/tasks/ha/map', 'PUT', { listId: handel.id, entityId: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.maps, []);
  assert.equal((await tasksIn(A, handel.id)).length, before);
  assert.ok((await tasksIn(A, handel.id)).every((t) => !t.ha));
  const off = await A('/api/tasks/ha', 'PUT', { enabled: false });
  assert.equal(off.body.status, 'off');
});
