// Huskeliste (prompt 17): oppgaver delt med alle brukerne på serveren (familien), sortert i lister
// (Hjem, Handel, Hytta, Jobb + egne). Hver endring sendes ut i sanntid på /api/ws som {type: 'tasks', ...}.
// Alle ruter godtar sesjon eller et gyldig app-token (samme regel som Familie).
import { Hono } from 'hono';
import { db } from './db.js';
import { userInfo, listUsers, sessionUser } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hl_task_lists (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hl_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  list TEXT NOT NULL DEFAULT 'hjem',
  due TEXT,
  assignee TEXT,
  note TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hl_tasks_list ON hl_tasks(list, done);
`);

const q = (sql) => db.prepare(sql);
const DEFAULT_LISTS = [['hjem', 'Hjem', '#2f7a4f'], ['handel', 'Handel', '#b23a2a'], ['hytta', 'Hytta', '#3e6fa8'], ['jobb', 'Jobb', '#8a6d1f']];
if (!q('SELECT 1 FROM hl_task_lists LIMIT 1').get()) {
  const ins = q('INSERT INTO hl_task_lists(id, name, color, sort, created) VALUES(?,?,?,?,?)');
  DEFAULT_LISTS.forEach(([id, name, color], i) => ins.run(id, name, color, i, Date.now()));
}

// Eksempeldata (MOCK_DATA=1): noen oppgaver i hver liste første gang.
if (process.env.MOCK_DATA === '1' && !q('SELECT 1 FROM hl_tasks LIMIT 1').get()) {
  const d = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const ins = q('INSERT INTO hl_tasks(title, list, due, done, done_at, created_at, updated_at) VALUES(?,?,?,?,?,?,?)');
  for (const [title, list, due, done] of [['Kjøp melk og brød', 'handel', 0, 0], ['Bytt filter i ventilasjonen', 'hjem', -1, 0], ['Betal strømregningen', 'hjem', 1, 0],
    ['Ta med ved til hytta', 'hytta', 6, 0], ['Send rapport til Kari', 'jobb', 0, 0], ['Rydd i boden', 'hjem', null, 0], ['Vann blomstene', 'hjem', -2, 1]]) {
    ins.run(title, list, due === null ? null : d(due), done, done ? Date.now() - 3_600_000 : null, Date.now(), Date.now());
  }
}

const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => String(v ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const slug = (s) => str(s, 40).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'liste';

const listOut = (r) => ({ id: r.id, name: r.name, color: r.color });
const itemOut = (r) => ({ id: r.id, title: r.title, list: r.list, due: r.due ?? null, assignee: r.assignee ?? null, note: r.note, done: !!r.done,
  doneAt: r.done_at ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at });
const lists = () => q('SELECT * FROM hl_task_lists ORDER BY sort, created').all().map(listOut);
const members = () => listUsers().map((u) => ({ id: u.id, name: u.displayName, username: u.username, avatarUrl: u.avatarUrl }));
const byId = (id) => q('SELECT * FROM hl_tasks WHERE id=?').get(id);

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
// Ikke-ferdige først (forfalt/i dag, så med dato, så uten dato), deretter ferdige (nyeste først).
function sortItems(items) {
  return items.sort((a, b) => (a.done - b.done)
    || (a.done ? (b.doneAt ?? 0) - (a.doneAt ?? 0) : ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : a.createdAt - b.createdAt)));
}

/** De n neste ikke-ferdige oppgavene (for Hjem og widgets). */
export function nextTasks(n = 3) {
  const rows = q('SELECT * FROM hl_tasks WHERE done=0').all().map(itemOut);
  const t = today();
  return sortItems(rows).slice(0, n).map((x) => ({ ...x, overdue: !!(x.due && x.due < t), today: x.due === t }));
}

function cleanTask(b, partial) {
  const out = {};
  if (!partial || 'title' in b) { const t = str(b.title, 200); if (!t) throw new Error('Skriv hva som skal gjøres'); out.title = t; }
  if ('list' in b) { if (!q('SELECT 1 FROM hl_task_lists WHERE id=?').get(String(b.list))) throw new Error('Ukjent liste'); out.list = String(b.list); }
  if ('due' in b) { if (b.due !== null && b.due !== '' && !DATE.test(String(b.due))) throw new Error('Forfall må være YYYY-MM-DD'); out.due = b.due || null; }
  if ('assignee' in b) { if (b.assignee && !userInfo(b.assignee)) throw new Error('Ukjent person'); out.assignee = b.assignee || null; }
  if ('note' in b) out.note = str(b.note, 1000);
  if ('done' in b) out.done = b.done ? 1 : 0;
  return out;
}

const changed = (action, extra = {}) => broadcast('tasks', { action, ...extra });

/* ---------------- API (/api/tasks) ---------------- */

const api = new Hono();
api.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
});
const bad = (c, msg, status = 400) => c.json({ error: msg }, status);
const body = (c) => c.req.json().catch(() => ({}));

api.get('/', (c) => {
  const list = c.req.query('list');
  const rows = (list && list !== 'alle' ? q('SELECT * FROM hl_tasks WHERE list=?').all(list) : q('SELECT * FROM hl_tasks').all()).map(itemOut);
  return c.json({ lists: lists(), items: sortItems(rows), members: members(), today: today() });
});

api.get('/next', (c) => {
  const n = Math.min(10, Math.max(1, Number(c.req.query('n')) || 3));
  return c.json({ items: nextTasks(n), open: q('SELECT COUNT(*) n FROM hl_tasks WHERE done=0').get().n, lists: lists() });
});

api.post('/', async (c) => {
  let t;
  try { t = cleanTask(await body(c), false); } catch (e) { return bad(c, e.message); }
  const now = Date.now();
  const r = q(`INSERT INTO hl_tasks(title, list, due, assignee, note, done, done_at, created_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .get(t.title, t.list ?? 'hjem', t.due ?? null, t.assignee ?? null, t.note ?? '', t.done ?? 0, t.done ? now : null, c.get('user'), now, now);
  const item = itemOut(r);
  changed('created', { item });
  return c.json({ item }, 201);
});

api.patch('/:id{[0-9]+}', async (c) => {
  const cur = byId(+c.req.param('id'));
  if (!cur) return bad(c, 'Fant ikke oppgaven', 404);
  let t;
  try { t = cleanTask(await body(c), true); } catch (e) { return bad(c, e.message); }
  const keys = Object.keys(t);
  if ('done' in t) { keys.push('done_at'); t.done_at = t.done ? (cur.done ? cur.done_at : Date.now()) : null; }
  if (keys.length) q(`UPDATE hl_tasks SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => t[k]), Date.now(), cur.id);
  const item = itemOut(byId(cur.id));
  changed('updated', { item });
  return c.json({ item });
});

api.delete('/:id{[0-9]+}', (c) => {
  const id = +c.req.param('id');
  if (!q('DELETE FROM hl_tasks WHERE id=?').run(id).changes) return bad(c, 'Fant ikke oppgaven', 404);
  changed('deleted', { id });
  return c.json({ ok: true });
});

// Fjern alle ferdige (valgfritt per liste).
api.post('/clear-done', async (c) => {
  const b = await body(c);
  const n = b.list ? q('DELETE FROM hl_tasks WHERE done=1 AND list=?').run(String(b.list)).changes : q('DELETE FROM hl_tasks WHERE done=1').run().changes;
  changed('cleared', { list: b.list ?? null });
  return c.json({ ok: true, removed: n });
});

/* Lister */
api.get('/lists', (c) => c.json({ lists: lists() }));
api.post('/lists', async (c) => {
  const b = await body(c), name = str(b.name, 40);
  if (!name) return bad(c, 'Gi listen et navn');
  if (b.color && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  let id = slug(name), i = 2;
  while (q('SELECT 1 FROM hl_task_lists WHERE id=?').get(id) || id === 'alle') id = `${slug(name)}-${i++}`;
  const sort = (q('SELECT MAX(sort) m FROM hl_task_lists').get().m ?? 0) + 1;
  q('INSERT INTO hl_task_lists(id, name, color, sort, created) VALUES(?,?,?,?,?)').run(id, name, b.color || '#6b665c', sort, Date.now());
  changed('lists', { lists: lists() });
  return c.json({ list: listOut(q('SELECT * FROM hl_task_lists WHERE id=?').get(id)), lists: lists() }, 201);
});
api.patch('/lists/:id', async (c) => {
  const id = c.req.param('id'), cur = q('SELECT * FROM hl_task_lists WHERE id=?').get(id);
  if (!cur) return bad(c, 'Fant ikke listen', 404);
  const b = await body(c);
  if (b.color !== undefined && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  const name = b.name !== undefined ? str(b.name, 40) : cur.name;
  if (!name) return bad(c, 'Gi listen et navn');
  q('UPDATE hl_task_lists SET name=?, color=?, sort=? WHERE id=?').run(name, b.color ?? cur.color, Number.isInteger(b.sort) ? b.sort : cur.sort, id);
  changed('lists', { lists: lists() });
  return c.json({ lists: lists() });
});
api.delete('/lists/:id', (c) => {
  const id = c.req.param('id');
  if (!q('SELECT 1 FROM hl_task_lists WHERE id=?').get(id)) return bad(c, 'Fant ikke listen', 404);
  if (q('SELECT COUNT(*) n FROM hl_task_lists').get().n <= 1) return bad(c, 'Den siste listen kan ikke slettes');
  // Oppgavene flyttes til den første gjenværende listen i stedet for å slettes.
  const to = q('SELECT id FROM hl_task_lists WHERE id != ? ORDER BY sort, created LIMIT 1').get(id).id;
  db.transaction(() => { q('UPDATE hl_tasks SET list=? WHERE list=?').run(to, id); q('DELETE FROM hl_task_lists WHERE id=?').run(id); })();
  changed('lists', { lists: lists(), movedTo: to });
  return c.json({ ok: true, movedTo: to, lists: lists() });
});

export default api;
