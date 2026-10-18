// Huskeliste (prompt 17, brukerskille i prompt 21): hver liste har en eier og kan deles med navngitte personer.
// - En bruker ser bare egne lister og lister som er delt med seg (hl_task_list_members).
// - Bare eieren kan dele, gi nytt navn, endre farge eller slette listen. Medlemmer kan legge til, endre og fullføre oppgaver.
// - Oppgaver uten liste (list = '') tilhører den som lagde dem (created_by).
// - Hver endring sendes i sanntid på /api/ws som {type: 'tasks', ...}, men bare til dem som har tilgang til listen.
// Alle ruter godtar sesjon eller et gyldig app-token (samme regel som Familie).
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { userInfo, listUsers, sessionUser, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';
import { initHa, mountHa, onLocal as haLocal, haInfo } from './tasks-ha.js';

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
CREATE TABLE IF NOT EXISTS hl_task_list_members (list_id TEXT NOT NULL, user_id TEXT NOT NULL, added INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (list_id, user_id));
CREATE INDEX IF NOT EXISTS hl_task_list_members_user ON hl_task_list_members(user_id);
`);

const q = (sql) => db.prepare(sql);
const hasCol = (t, col) => q(`PRAGMA table_info(${t})`).all().some((c) => c.name === col);
// Prompt 21: eier per liste. Listene fantes før det fantes eiere, og hadde ingen created_by: de blir hovedadmins
// («husholdningen»). En kolonne created_by på listen (om den finnes fra en eldre variant) brukes hvis den er satt.
if (!hasCol('hl_task_lists', 'owner')) {
  db.exec('ALTER TABLE hl_task_lists ADD COLUMN owner TEXT');
  if (hasCol('hl_task_lists', 'created_by')) q('UPDATE hl_task_lists SET owner=created_by WHERE owner IS NULL AND created_by IS NOT NULL').run();
}
{
  const main = q("SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1").get()?.id
    ?? q("SELECT id FROM users WHERE role='admin' ORDER BY created LIMIT 1").get()?.id ?? OWNER;
  q('UPDATE hl_task_lists SET owner=? WHERE owner IS NULL').run(main);
}

const DEFAULT_LISTS = [['hjem', 'Hjem', '#2f7a4f'], ['handel', 'Handel', '#b23a2a'], ['hytta', 'Hytta', '#3e6fa8'], ['jobb', 'Jobb', '#8a6d1f']];
const DEFAULT_IDS = new Set(DEFAULT_LISTS.map(([id]) => id));
if (!q('SELECT 1 FROM hl_task_lists LIMIT 1').get()) {
  const ins = q('INSERT INTO hl_task_lists(id, name, color, sort, created, owner) VALUES(?,?,?,?,?,?)');
  DEFAULT_LISTS.forEach(([id, name, color], i) => ins.run(id, name, color, i, Date.now(), OWNER));
}

// Eksempeldata (MOCK_DATA=1): noen oppgaver i hver liste første gang.
if (process.env.MOCK_DATA === '1' && !q('SELECT 1 FROM hl_tasks LIMIT 1').get()) {
  const d = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const ins = q('INSERT INTO hl_tasks(title, list, due, done, done_at, created_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for (const [title, list, due, done] of [['Kjøp melk og brød', 'handel', 0, 0], ['Bytt filter i ventilasjonen', 'hjem', -1, 0], ['Betal strømregningen', 'hjem', 1, 0],
    ['Ta med ved til hytta', 'hytta', 6, 0], ['Send rapport til Kari', 'jobb', 0, 0], ['Rydd i boden', 'hjem', null, 0], ['Vann blomstene', 'hjem', -2, 1]]) {
    ins.run(title, list, due === null ? null : d(due), done, done ? Date.now() - 3_600_000 : null, OWNER, Date.now(), Date.now());
  }
}

const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => String(v ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const slug = (s) => str(s, 40).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'liste';
const uniqueId = (name) => { let id = slug(name), i = 2; while (q('SELECT 1 FROM hl_task_lists WHERE id=?').get(id) || id === 'alle') id = `${slug(name)}-${i++}`; return id; };

/* ---------------- Tilgang ---------------- */

const listRow = (id) => q('SELECT * FROM hl_task_lists WHERE id=?').get(String(id ?? ''));
const memberIds = (listId) => q('SELECT user_id FROM hl_task_list_members WHERE list_id=? ORDER BY added, user_id').pluck().all(listId);
const canSeeList = (l, uid) => !!l && (l.owner === uid || !!q('SELECT 1 FROM hl_task_list_members WHERE list_id=? AND user_id=?').get(l.id, uid));
// Lister brukeren eier eller er medlem av (egne først, så delte), i lagret rekkefølge.
const listsOf = (uid) => q(`SELECT * FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?)
  ORDER BY owner<>? , sort, created`).all(uid, uid, uid);
// Hvem som har tilgang til en liste (eier og medlemmer). Oppgave uten liste: bare den som lagde den.
const audienceOfList = (l) => (l ? [l.owner, ...memberIds(l.id)].filter(Boolean) : []);
const audienceOfTask = (t) => { const l = t.list ? listRow(t.list) : null; return l ? audienceOfList(l) : [t.created_by].filter(Boolean); };
const canSeeTask = (t, uid) => { const l = t.list ? listRow(t.list) : null; return l ? canSeeList(l, uid) : t.created_by === uid; };
// Oppgaver brukeren kan se: i synlige lister, og egne oppgaver uten liste (eller i en liste som ikke finnes lenger).
const VISIBLE = `(list IN (SELECT id FROM hl_task_lists WHERE owner=@u OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=@u))
  OR (created_by=@u AND (list='' OR list NOT IN (SELECT id FROM hl_task_lists))))`;

// Nye brukere får sine egne standardlister (Hjem, Handel, Hytta, Jobb) første gang, så appene har noe å legge oppgaver i.
function ensureLists(uid) {
  if (q('SELECT 1 FROM hl_task_lists WHERE owner=? LIMIT 1').get(uid) || kv.get(uid, 'tasks_seeded', false)) return;
  const ins = q('INSERT INTO hl_task_lists(id, name, color, sort, created, owner) VALUES(?,?,?,?,?,?)');
  db.transaction(() => { DEFAULT_LISTS.forEach(([, name, color], i) => ins.run(uniqueId(name), name, color, i, Date.now(), uid)); })();
  kv.set(uid, 'tasks_seeded', true);
}

// Eldre klienter sender standard-ID-ene («hjem») når de ikke har lastet listene; de peker på brukerens egen liste med samme navn.
function resolveList(raw, uid) {
  if (raw === null || raw === '') return { id: '' };
  const l = listRow(raw);
  if (canSeeList(l, uid)) return { id: l.id };
  if (DEFAULT_IDS.has(String(raw))) {
    const name = DEFAULT_LISTS.find(([id]) => id === String(raw))[1];
    const own = q('SELECT id FROM hl_task_lists WHERE owner=? AND lower(name)=lower(?) ORDER BY sort, created LIMIT 1').get(uid, name);
    if (own) return { id: own.id };
  }
  return { error: 'Ukjent liste' };
}
const defaultList = (uid) => q('SELECT id FROM hl_task_lists WHERE owner=? ORDER BY sort, created LIMIT 1').get(uid)?.id ?? listsOf(uid)[0]?.id ?? '';

/* ---------------- Utdata ---------------- */

const person = (id) => { const u = userInfo(id); return u ? { id: u.id, name: u.displayName, avatarUrl: u.avatarUrl } : { id, name: 'Ukjent', avatarUrl: null }; };
const listOut = (r, uid) => {
  const mem = memberIds(r.id);
  const owner = person(r.owner);
  return { id: r.id, name: r.name, color: r.color, owner: r.owner, ownerName: owner.name, mine: r.owner === uid, shared: mem.length > 0,
    members: mem.map(person) };
};
const itemOut = (r) => ({ id: r.id, title: r.title, list: r.list || null, due: r.due ?? null, assignee: r.assignee ?? null, note: r.note, done: !!r.done,
  doneAt: r.done_at ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at, ...haInfo(r) });
const lists = (uid) => listsOf(uid).map((l) => listOut(l, uid));
// Personer man kan dele med og tildele til: id, navn og profilbilde (brukernavn bare for administratorer).
const members = (uid) => { const admin = isAdmin(uid); return listUsers().map((u) => ({ id: u.id, name: u.displayName, avatarUrl: u.avatarUrl, ...(admin ? { username: u.username } : {}) })); };
const byId = (id) => q('SELECT * FROM hl_tasks WHERE id=?').get(id);

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
// Ikke-ferdige først (forfalt/i dag, så med dato, så uten dato), deretter ferdige (nyeste først).
function sortItems(items) {
  return items.sort((a, b) => (a.done - b.done)
    || (a.done ? (b.doneAt ?? 0) - (a.doneAt ?? 0) : ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : a.createdAt - b.createdAt)));
}

/** De n neste ikke-ferdige oppgavene brukeren kan se (for Hjem og widgets). */
export function nextTasks(uid, n = 3) {
  if (typeof uid === 'number') { n = uid; uid = null; } // eldre kall: nextTasks(3) gir ingenting i stedet for alles oppgaver
  if (!uid) return [];
  const rows = q(`SELECT * FROM hl_tasks WHERE done=0 AND ${VISIBLE}`).all({ u: uid }).map(itemOut);
  const t = today();
  return sortItems(rows).slice(0, n).map((x) => ({ ...x, overdue: !!(x.due && x.due < t), today: x.due === t }));
}

function cleanTask(b, partial, uid, listId) {
  const out = {};
  if (!partial || 'title' in b) { const t = str(b.title, 200); if (!t) throw new Error('Skriv hva som skal gjøres'); out.title = t; }
  if ('list' in b) { const r = resolveList(b.list, uid); if (r.error) throw new Error(r.error); out.list = r.id; }
  if ('due' in b) { if (b.due !== null && b.due !== '' && !DATE.test(String(b.due))) throw new Error('Forfall må være YYYY-MM-DD'); out.due = b.due || null; }
  if ('assignee' in b) {
    if (b.assignee && !userInfo(b.assignee)) throw new Error('Ukjent person');
    // Bare personer som har tilgang til listen kan få oppgaven.
    const l = listRow(out.list ?? listId);
    if (b.assignee && (l ? !canSeeList(l, b.assignee) : b.assignee !== uid)) throw new Error('Personen har ikke tilgang til listen');
    out.assignee = b.assignee || null;
  }
  if ('note' in b) out.note = str(b.note, 1000);
  if ('done' in b) out.done = b.done ? 1 : 0;
  return out;
}

const send = (users, action, extra = {}) => { const ids = [...new Set(users.filter(Boolean))]; if (ids.length) broadcast('tasks', { action, ...extra }, ids); };

// Prompt 22: synk med Home Assistant To-do (tasks-ha.js). Får de samme tilgangsreglene og sendingen som resten av Huskeliste.
initHa({ listRow, canSeeList, audienceOfTask, send, itemOut, userInfo, isAdmin });

/* ---------------- API (/api/tasks) ---------------- */

const api = new Hono();
api.use('*', async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  ensureLists(id);
  await next();
});
const bad = (c, msg, status = 400) => c.json({ error: msg }, status);
const body = (c) => c.req.json().catch(() => ({}));

api.get('/', (c) => {
  const u = c.get('user'), list = c.req.query('list');
  let rows;
  if (list && list !== 'alle') {
    const l = listRow(list);
    rows = canSeeList(l, u) ? q('SELECT * FROM hl_tasks WHERE list=?').all(l.id) : [];
  } else rows = q(`SELECT * FROM hl_tasks WHERE ${VISIBLE}`).all({ u });
  return c.json({ lists: lists(u), items: sortItems(rows.map(itemOut)), members: members(u), today: today() });
});

api.get('/next', (c) => {
  const u = c.get('user'), n = Math.min(10, Math.max(1, Number(c.req.query('n')) || 3));
  return c.json({ items: nextTasks(u, n), open: q(`SELECT COUNT(*) n FROM hl_tasks WHERE done=0 AND ${VISIBLE}`).get({ u }).n, lists: lists(u) });
});

api.post('/', async (c) => {
  const u = c.get('user'), b = await body(c);
  let t;
  try { t = cleanTask(b, false, u, 'list' in b ? undefined : defaultList(u)); } catch (e) { return bad(c, e.message); }
  const now = Date.now();
  const r = q(`INSERT INTO hl_tasks(title, list, due, assignee, note, done, done_at, created_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .get(t.title, t.list ?? defaultList(u), t.due ?? null, t.assignee ?? null, t.note ?? '', t.done ?? 0, t.done ? now : null, u, now, now);
  const item = itemOut(r);
  send(audienceOfTask(r), 'created', { item });
  haLocal('created', null, r);
  return c.json({ item }, 201);
});

api.patch('/:id{[0-9]+}', async (c) => {
  const u = c.get('user'), cur = byId(+c.req.param('id'));
  if (!cur || !canSeeTask(cur, u)) return bad(c, 'Fant ikke oppgaven', 404);
  let t;
  try { t = cleanTask(await body(c), true, u, cur.list); } catch (e) { return bad(c, e.message); }
  const before = audienceOfTask(cur);
  const keys = Object.keys(t);
  if ('done' in t) { keys.push('done_at'); t.done_at = t.done ? (cur.done ? cur.done_at : Date.now()) : null; }
  if (keys.length) q(`UPDATE hl_tasks SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => t[k]), Date.now(), cur.id);
  const row = byId(cur.id), item = itemOut(row), after = audienceOfTask(row);
  send(after, 'updated', { item });
  // Flyttet til en annen liste: de som ikke ser den lenger, får bare beskjed om at den er borte.
  send(before.filter((x) => !after.includes(x)), 'deleted', { id: cur.id });
  if (keys.length) haLocal('updated', cur, row);
  return c.json({ item });
});

api.delete('/:id{[0-9]+}', (c) => {
  const u = c.get('user'), cur = byId(+c.req.param('id'));
  if (!cur || !canSeeTask(cur, u)) return bad(c, 'Fant ikke oppgaven', 404);
  const l = cur.list ? listRow(cur.list) : null;
  if (l && l.owner !== u && cur.created_by !== u) return bad(c, 'Bare eieren av listen eller den som lagde oppgaven kan slette den', 403);
  const aud = audienceOfTask(cur);
  q('DELETE FROM hl_tasks WHERE id=?').run(cur.id);
  send(aud, 'deleted', { id: cur.id });
  haLocal('deleted', cur);
  return c.json({ ok: true });
});

// Fjern alle ferdige som brukeren ser (valgfritt per liste). I delte lister fjernes bare egne oppgaver, med mindre man er eier.
api.post('/clear-done', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (b.list) { const l = listRow(b.list); if (!canSeeList(l, u)) return bad(c, 'Fant ikke listen', 404); }
  const rows = q(`SELECT * FROM hl_tasks WHERE done=1 AND ${VISIBLE}${b.list ? ' AND list=@l' : ''}`).all({ u, ...(b.list ? { l: String(b.list) } : {}) })
    .filter((t) => { const l = t.list ? listRow(t.list) : null; return !l || l.owner === u || t.created_by === u; });
  const aud = new Set();
  db.transaction(() => { for (const t of rows) { audienceOfTask(t).forEach((x) => aud.add(x)); q('DELETE FROM hl_tasks WHERE id=?').run(t.id); } })();
  aud.add(u);
  for (const t of rows) haLocal('deleted', t);
  send([...aud], 'cleared', { list: b.list ?? null, ids: rows.map((t) => t.id) });
  return c.json({ ok: true, removed: rows.length });
});

/* Synk med Home Assistant (bare administratorer): GET/PUT /ha, PUT /ha/map, POST /ha/sync, POST /ha/create */
mountHa(api);

/* Lister */
api.get('/lists', (c) => c.json({ lists: lists(c.get('user')), members: members(c.get('user')) }));
api.post('/lists', async (c) => {
  const u = c.get('user'), b = await body(c), name = str(b.name, 40);
  if (!name) return bad(c, 'Gi listen et navn');
  if (b.color && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  const id = uniqueId(name);
  const sort = (q('SELECT MAX(sort) m FROM hl_task_lists WHERE owner=?').get(u).m ?? 0) + 1;
  q('INSERT INTO hl_task_lists(id, name, color, sort, created, owner) VALUES(?,?,?,?,?,?)').run(id, name, b.color || '#6b665c', sort, Date.now(), u);
  send([u], 'lists', { lists: lists(u) });
  return c.json({ list: listOut(listRow(id), u), lists: lists(u) }, 201);
});
const ownerOnly = (c, l) => (l.owner === c.get('user') ? null : bad(c, 'Bare eieren kan endre, dele eller slette listen', 403));
// Sender oppdaterte lister til hver enkelt (svaret er personlig: mine, eier og medlemmer).
const sendLists = (users, extra = {}) => { for (const x of new Set(users.filter(Boolean))) broadcast('tasks', { action: 'lists', lists: lists(x), ...extra }, [x]); };

api.patch('/lists/:id', async (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  const deny = ownerOnly(c, cur); if (deny) return deny;
  const b = await body(c);
  if (b.color !== undefined && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  const name = b.name !== undefined ? str(b.name, 40) : cur.name;
  if (!name) return bad(c, 'Gi listen et navn');
  q('UPDATE hl_task_lists SET name=?, color=?, sort=? WHERE id=?').run(name, b.color ?? cur.color, Number.isInteger(b.sort) ? b.sort : cur.sort, cur.id);
  sendLists(audienceOfList(cur));
  return c.json({ lists: lists(u) });
});

// Del listen: erstatter medlemmene med userIds. Bare eieren. Fjernede medlemmer mister tilgangen med en gang.
api.put('/lists/:id/members', async (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  const deny = ownerOnly(c, cur); if (deny) return deny;
  const b = await body(c);
  if (!Array.isArray(b.userIds)) return bad(c, 'userIds må være en liste');
  const ids = [...new Set(b.userIds.map(String))].filter((x) => x !== cur.owner).slice(0, 50);
  const unknown = ids.find((x) => !userInfo(x));
  if (unknown) return bad(c, 'Ukjent person');
  const before = memberIds(cur.id);
  db.transaction(() => {
    q('DELETE FROM hl_task_list_members WHERE list_id=?').run(cur.id);
    const ins = q('INSERT INTO hl_task_list_members(list_id, user_id, added) VALUES(?,?,?)');
    ids.forEach((x, i) => ins.run(cur.id, x, Date.now() + i));
    // Oppgaver tildelt noen som ikke har tilgang lenger, blir uten ansvarlig.
    const keep = [cur.owner, ...ids];
    q(`UPDATE hl_tasks SET assignee=NULL, updated_at=? WHERE list=? AND assignee IS NOT NULL AND assignee NOT IN (${keep.map(() => '?').join(',')})`).run(Date.now(), cur.id, ...keep);
  })();
  const removed = before.filter((x) => !ids.includes(x));
  sendLists([cur.owner, ...ids, ...removed], { listId: cur.id });
  return c.json({ list: listOut(listRow(cur.id), u), lists: lists(u) });
});

// Et medlem kan forlate en delt liste selv.
api.delete('/lists/:id/members/me', (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  if (cur.owner === u) return bad(c, 'Eieren kan ikke forlate sin egen liste. Slett den i stedet.');
  q('DELETE FROM hl_task_list_members WHERE list_id=? AND user_id=?').run(cur.id, u);
  q('UPDATE hl_tasks SET assignee=NULL, updated_at=? WHERE list=? AND assignee=?').run(Date.now(), cur.id, u);
  sendLists([cur.owner, ...memberIds(cur.id), u], { listId: cur.id });
  return c.json({ ok: true, lists: lists(u) });
});

api.delete('/lists/:id', (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  const deny = ownerOnly(c, cur); if (deny) return deny;
  if (q('SELECT COUNT(*) n FROM hl_task_lists WHERE owner=?').get(u).n <= 1) return bad(c, 'Den siste listen kan ikke slettes');
  const aud = audienceOfList(cur);
  // Eierens oppgaver flyttes til eierens første gjenværende liste. Andres oppgaver blir uten liste og tilhører dem som lagde dem.
  const to = q('SELECT id FROM hl_task_lists WHERE owner=? AND id != ? ORDER BY sort, created LIMIT 1').get(u, cur.id).id;
  haLocal('listDeleted', cur.id); // koblingen til HA fjernes; HA-listen beholdes
  db.transaction(() => {
    q('UPDATE hl_tasks SET list=? WHERE list=? AND (created_by=? OR created_by IS NULL)').run(to, cur.id, u);
    q("UPDATE hl_tasks SET list='', assignee=CASE WHEN assignee=created_by THEN assignee ELSE NULL END WHERE list=?").run(cur.id);
    q('DELETE FROM hl_task_list_members WHERE list_id=?').run(cur.id);
    q('DELETE FROM hl_task_lists WHERE id=?').run(cur.id);
  })();
  sendLists(aud, { movedTo: to, removed: cur.id });
  return c.json({ ok: true, movedTo: to, lists: lists(u) });
});

export default api;
