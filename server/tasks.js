// Huskeliste (prompt 17, brukerskille i prompt 21): hver liste har en eier og kan deles med navngitte personer.
// - En bruker ser bare egne lister og lister som er delt med seg (hl_task_list_members).
// - Bare eieren kan dele, gi nytt navn, endre farge eller slette listen. Medlemmer kan legge til, endre og fullføre oppgaver.
// - Oppgaver uten liste (list = '') tilhører den som lagde dem (created_by).
// - Hver endring sendes i sanntid på /api/ws som {type: 'tasks', ...}, men bare til dem som har tilgang til listen.
// Alle ruter godtar sesjon eller et gyldig app-token (samme regel som Familie).
//
// Prompt 37 (SERVER37): «Gjøremål» (tidligere Huskeliste, intern nøkkel fortsatt huske/tasks).
//   Liste: {id, name, color, ownerId, owner, ownerName, mine, members:[{id, userId, name, color, role:'owner'|'member', avatarUrl}],
//           shared, private, household, kind:'mine'|null}
//   - Hver bruker har en privat liste «Mine» (kind 'mine'). Husstandens felles lister fra før (Hjem, Handel, Hytta) ble ved
//     oppgraderingen delte lister med alle i husstanden (household=1); nye brukere blir medlem av dem, og kan forlate dem.
//   - GET/POST/PATCH/DELETE /api/tasks/lists (POST/PATCH tar members:[userId]; DELETE ?deleteTasks=1 sletter oppgavene),
//     POST /api/tasks/lists/:id/leave, GET/PUT /api/tasks/settings {defaultList}.
//   Oppgave: {id, n, title, notes, note, l, list, due, time, urgent, rep, early, prio, flag, tags[], who, assignee, subs:[{n, done}],
//             done, doneAt, arch, archived, by, createdBy, place, glimt, …}
//     rep: none|daily|weekdays|weekly|biweekly|monthly|yearly (fullført → neste forekomst lages, svaret har next)
//     early: none|5m|15m|30m|1h|1d|2d|1w · prio 0–3 · place: store|home|leave|work|cabin|null
//   Sanntid: {type:'todo:changed', action, …} i tillegg til {type:'tasks', …} (bare til dem med tilgang).
//   Glimt (11 funksjoner): se tasks-glimt37.js.
import { extraOut40 } from './tasks-glimt40.js'; // prompt 40
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { userInfo, listUsers, sessionUser, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';
import { initHa, mountHa, onLocal as haLocal, haInfo } from './tasks-ha.js';
import { mountGlimt37 } from './tasks-glimt37.js'; // prompt 37: Glimt i Gjøremål
import { mountGlimt41, origin41 } from './tasks-glimt41.js'; // prompt 41: Glimt deler opp i bakgrunnen, «Laget med Glimt»

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
const HAD_LISTS = !!q('SELECT 1 FROM hl_task_lists LIMIT 1').get(); // prompt 37: fantes det lister før denne oppstarten?
if (!HAD_LISTS) {
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

// Prompt 32 (SERVER32): arkiv. archived_at settes ved arkivering (manuelt, «Arkiver alle», eller automatisk 7 dager etter fullført).
//   GET   /api/tasks?archived=1           → {items:[arkiverte, nyeste først], archivedCount, lists, members, today}
//   GET   /api/tasks                      → som før, uten arkiverte (+ archivedCount)
//   PATCH /api/tasks/:id {archived:true|false[, done:false]} → {item} (item.archived, item.archivedAt)
//   POST  /api/tasks/archive-done {list?} → {ok, archived:n}   («Arkiver alle» i FERDIG)
//   DELETE /api/tasks/archived?list=…     → {ok, removed:n}    («Tøm arkivet»)
//   Home Assistant: arkivering = todo.remove_item, gjenoppretting legger den inn igjen. Arkiverte telles ikke i lister, widgets eller Hjem.
if (!hasCol('hl_tasks', 'archived_at')) db.exec('ALTER TABLE hl_tasks ADD COLUMN archived_at INTEGER');
const ARCHIVE_AFTER_MS = 7 * 86_400_000;

// Prompt 37: felt fra detaljarket (additivt, ingen data endres) og husstandslister.
for (const [col, def] of [['time', 'TEXT'], ['urgent', 'INTEGER NOT NULL DEFAULT 0'], ['rep', "TEXT NOT NULL DEFAULT 'none'"], ['early', "TEXT NOT NULL DEFAULT 'none'"],
  ['prio', 'INTEGER NOT NULL DEFAULT 0'], ['flag', 'INTEGER NOT NULL DEFAULT 0'], ['tags', "TEXT NOT NULL DEFAULT '[]'"], ['subs', "TEXT NOT NULL DEFAULT '[]'"],
  ['place', 'TEXT'], ['glimt', 'INTEGER NOT NULL DEFAULT 0'], ['done_by', 'TEXT']]) if (!hasCol('hl_tasks', col)) db.exec(`ALTER TABLE hl_tasks ADD COLUMN ${col} ${def}`);
if (!hasCol('hl_task_lists', 'household')) db.exec('ALTER TABLE hl_task_lists ADD COLUMN household INTEGER NOT NULL DEFAULT 0');
if (!hasCol('hl_task_lists', 'kind')) db.exec('ALTER TABLE hl_task_lists ADD COLUMN kind TEXT');
// Engangsmigrering: husstandens felles lister fra før prompt 21 (Hjem, Handel, Hytta hos hovedadmin) blir delte lister med alle
// brukerne som finnes nå. Bare på servere som hadde lister før denne oppgraderingen (ikke på en ny database).
if (!kv.get(OWNER, 'tasks37_v1', false)) {
  if (HAD_LISTS) {
    const main = q("SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1").get()?.id ?? q("SELECT id FROM users WHERE role='admin' ORDER BY created LIMIT 1").get()?.id ?? OWNER;
    const rows = q("SELECT * FROM hl_task_lists WHERE id IN ('hjem','handel','hytta') AND owner=?").all(main);
    const users = q('SELECT id FROM users').pluck().all().filter((u) => u !== main);
    db.transaction(() => {
      for (const l of rows) {
        q('UPDATE hl_task_lists SET household=1 WHERE id=?').run(l.id);
        for (const u of users) q('INSERT OR IGNORE INTO hl_task_list_members(list_id, user_id, added) VALUES(?,?,?)').run(l.id, u, Date.now());
      }
    })();
    if (rows.length) console.log(`[gjøremål] prompt 37: ${rows.map((l) => l.name).join(', ')} er nå delt med husstanden (${users.length} brukere lagt til)`);
  }
  kv.set(OWNER, 'tasks37_v1', Date.now());
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
// Prompt 37: alle får sin private liste «Mine», og nye brukere blir medlem av husstandens delte lister (med mindre de har forlatt dem).
// Finnes ingen husstandslister (ny server), får nye brukere som før egne Hjem/Handel/Hytta/Jobb.
function ensureLists(uid) {
  const household = q('SELECT * FROM hl_task_lists WHERE household=1').all();
  if (!q('SELECT 1 FROM hl_task_lists WHERE owner=? LIMIT 1').get(uid) && !kv.get(uid, 'tasks_seeded', false)) {
    const ins = q('INSERT INTO hl_task_lists(id, name, color, sort, created, owner) VALUES(?,?,?,?,?,?)');
    if (!household.length) db.transaction(() => { DEFAULT_LISTS.forEach(([, name, color], i) => ins.run(uniqueId(name), name, color, i, Date.now(), uid)); })();
    kv.set(uid, 'tasks_seeded', true);
  }
  if (!kv.get(uid, 'tasks37_household', false)) {
    const left = new Set(kv.get(uid, 'tasks37_left', []) ?? []);
    for (const l of household) if (l.owner !== uid && !left.has(l.id)) q('INSERT OR IGNORE INTO hl_task_list_members(list_id, user_id, added) VALUES(?,?,?)').run(l.id, uid, Date.now());
    kv.set(uid, 'tasks37_household', true);
  }
  if (!q("SELECT 1 FROM hl_task_lists WHERE owner=? AND kind='mine'").get(uid)) {
    const sort = (q('SELECT MAX(sort) m FROM hl_task_lists WHERE owner=?').get(uid).m ?? -1) + 1;
    q("INSERT INTO hl_task_lists(id, name, color, sort, created, owner, kind) VALUES(?,?,?,?,?,?,'mine')").run(uniqueId('Mine'), 'Mine', '#2b5d8a', sort, Date.now(), uid);
  }
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
// Prompt 37: standardlisten for nye oppgaver: valgt i Innstillinger → Gjøremål (kv tasks_default_list), ellers «Mine».
const mineOf = (uid) => q("SELECT id FROM hl_task_lists WHERE owner=? AND kind='mine' ORDER BY created LIMIT 1").get(uid)?.id ?? null;
/** Prompt 38: brukerens private liste «Mine» (lages om den mangler), for «+ Gave til … i Gjøremål» i briefen. */
export const mineListOf = (uid) => { ensureLists(uid); return mineOf(uid); };
const defaultList = (uid) => {
  const want = kv.get(uid, 'tasks_default_list', null);
  if (want && canSeeList(listRow(want), uid)) return want;
  return mineOf(uid) ?? q('SELECT id FROM hl_task_lists WHERE owner=? ORDER BY sort, created LIMIT 1').get(uid)?.id ?? listsOf(uid)[0]?.id ?? '';
};

/* ---------------- Utdata ---------------- */

const person = (id) => { const u = userInfo(id); return u ? { id: u.id, name: u.displayName, avatarUrl: u.avatarUrl } : { id, name: 'Ukjent', avatarUrl: null }; };
// Prompt 37: brukerfarge (samme som Familie) for avatarene på liste-chipsene.
let colorOfUser = () => null;
export const _setTaskColors = (fn) => { colorOfUser = fn; };
const memberOut = (id, role) => { const p = person(id); return { ...p, userId: p.id, color: colorOfUser(id), role }; };
const listOut = (r, uid) => {
  const mem = memberIds(r.id);
  const owner = person(r.owner);
  return { id: r.id, name: r.name, color: r.color, owner: r.owner, ownerId: r.owner, ownerName: owner.name, mine: r.owner === uid, shared: mem.length > 0, private: mem.length === 0,
    household: !!r.household, kind: r.kind ?? null, members: [memberOut(r.owner, 'owner'), ...mem.map((m) => memberOut(m, 'member'))] };
};
const parseArr = (v) => { try { const a = JSON.parse(v ?? '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const itemOut = (r) => {
  const tags = parseArr(r.tags).map(String), subs = parseArr(r.subs).map((x) => ({ n: String(x?.n ?? ''), done: !!x?.done }));
  return { id: r.id, title: r.title, n: r.title, list: r.list || null, l: r.list || null, due: r.due ?? null, time: r.time ?? null, assignee: r.assignee ?? null, who: r.assignee ?? null,
    note: r.note, notes: r.note, done: !!r.done, doneAt: r.done_at ?? null, archived: !!r.archived_at, arch: !!r.archived_at, archivedAt: r.archived_at ?? null,
    urgent: !!r.urgent, rep: r.rep ?? 'none', early: r.early ?? 'none', prio: r.prio ?? 0, flag: !!r.flag, tags, subs, subsDone: subs.filter((x) => x.done).length,
    place: r.place ?? null, glimt: !!r.glimt, doneBy: r.done_by ?? null, createdBy: r.created_by ?? null, by: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at, ...haInfo(r),
    ...extraOut40(r), ...origin41(r) }; // prompt 40: placeName, after, mentions · prompt 41: origin {id, text, at, engine}
};
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
  const rows = q(`SELECT * FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${VISIBLE}`).all({ u: uid }).map(itemOut);
  const t = today();
  return sortItems(rows).slice(0, n).map((x) => ({ ...x, overdue: !!(x.due && x.due < t), today: x.due === t }));
}

export const REPS = ['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'];
export const EARLY = ['none', '5m', '15m', '30m', '1h', '1d', '2d', '1w'];
export const PLACES = ['store', 'home', 'leave', 'work', 'cabin'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Prompt 37: korte navn fra designet (n, notes, l, who, arch) betyr det samme som de lange.
function aliases(b0) {
  const b = { ...(b0 ?? {}) };
  for (const [s, l] of [['n', 'title'], ['notes', 'note'], ['l', 'list'], ['who', 'assignee'], ['arch', 'archived']]) if (s in b && !(l in b)) b[l] = b[s];
  return b;
}
function cleanTask(b0, partial, uid, listId) {
  const b = aliases(b0);
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
  if ('note' in b) out.note = String(b.note ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 2000); // flere linjer (notater og lenke)
  if ('done' in b) out.done = b.done ? 1 : 0;
  if ('archived' in b) out.archived_at = b.archived ? Date.now() : null;
  if ('time' in b) { if (b.time && !TIME.test(String(b.time))) throw new Error('Tid må være HH:MM'); out.time = b.time || null; }
  if ('urgent' in b) out.urgent = b.urgent ? 1 : 0;
  if ('rep' in b) { const v = b.rep || 'none'; if (!REPS.includes(v)) throw new Error(`Gjenta må være ${REPS.join(', ')}`); out.rep = v; }
  if ('early' in b) { const v = b.early || 'none'; if (!EARLY.includes(v)) throw new Error(`Tidlig påminnelse må være ${EARLY.join(', ')}`); out.early = v; }
  if ('prio' in b) { const v = Number(b.prio ?? 0); if (!Number.isInteger(v) || v < 0 || v > 3) throw new Error('Prioritet må være 0–3'); out.prio = v; }
  if ('flag' in b) out.flag = b.flag ? 1 : 0;
  if ('tags' in b) {
    if (!Array.isArray(b.tags)) throw new Error('tags må være en liste');
    out.tags = JSON.stringify([...new Set(b.tags.map((t) => str(t, 30).replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 20));
  }
  if ('subs' in b) {
    if (!Array.isArray(b.subs)) throw new Error('subs må være en liste');
    out.subs = JSON.stringify(b.subs.slice(0, 50).map((x) => ({ n: str(typeof x === 'string' ? x : x?.n, 200), done: !!x?.done })).filter((x) => x.n));
  }
  if ('place' in b) { if (b.place && !PLACES.includes(b.place)) throw new Error(`Sted må være ${PLACES.join(', ')}`); out.place = b.place || null; }
  if ('glimt' in b) out.glimt = b.glimt ? 1 : 0;
  // Tid uten dato: dato slås på automatisk (i dag).
  if (out.time && !('due' in out) && !partial) out.due = today();
  return out;
}

/** Neste dato for en gjentagende oppgave. */
export function nextDue(due, rep) {
  if (!due || !rep || rep === 'none') return null;
  const [y, m, d] = due.split('-').map(Number);
  const at = (Y, M, D) => new Date(Date.UTC(Y, M, D)).toISOString().slice(0, 10);
  if (rep === 'daily') return at(y, m - 1, d + 1);
  if (rep === 'weekly') return at(y, m - 1, d + 7);
  if (rep === 'biweekly') return at(y, m - 1, d + 14);
  if (rep === 'weekdays') { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return at(y, m - 1, d + (wd === 5 ? 3 : wd === 6 ? 2 : 1)); }
  const addM = (n) => { const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); return at(y, m - 1 + n, Math.min(d, last)); };
  if (rep === 'monthly') return addM(1);
  if (rep === 'yearly') return addM(12);
  return null;
}

const send = (users, action, extra = {}) => {
  const ids = [...new Set(users.filter(Boolean))];
  if (!ids.length) return;
  broadcast('tasks', { action, ...extra }, ids);
  broadcast('todo:changed', { action, ...extra }, ids); // prompt 37: samme hendelse under det nye navnet
};

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

/** Fullførte oppgaver arkiveres automatisk etter 7 dager (fjernes fra Home Assistant). */
function autoArchive(now = Date.now()) {
  const rows = q('SELECT * FROM hl_tasks WHERE done=1 AND archived_at IS NULL AND done_at IS NOT NULL AND done_at<?').all(now - ARCHIVE_AFTER_MS);
  for (const r of rows) archiveRow(r, true, now);
}
function archiveRow(cur, on, now = Date.now()) {
  q('UPDATE hl_tasks SET archived_at=?, updated_at=? WHERE id=?').run(on ? now : null, now, cur.id);
  if (on) { haLocal('deleted', cur); q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE id=?').run(cur.id); }
  else haLocal('created', null, byId(cur.id));
  const row = byId(cur.id);
  send(audienceOfTask(row), 'updated', { item: itemOut(row) });
  return row;
}
const archivedCount = (u) => q(`SELECT COUNT(*) n FROM hl_tasks WHERE archived_at IS NOT NULL AND ${VISIBLE}`).get({ u }).n;
api.get('/', (c) => {
  const u = c.get('user'), list = c.req.query('list'), arch = c.req.query('archived') === '1';
  try { autoArchive(); } catch (e) { console.warn('[huskeliste] arkiv:', e.message); }
  let rows;
  if (list && list !== 'alle') {
    const l = listRow(list);
    rows = canSeeList(l, u) ? q('SELECT * FROM hl_tasks WHERE list=?').all(l.id) : [];
  } else rows = q(`SELECT * FROM hl_tasks WHERE ${VISIBLE}`).all({ u });
  rows = rows.filter((r) => (arch ? r.archived_at != null : r.archived_at == null));
  const items = arch ? rows.map(itemOut).sort((a, b) => b.archivedAt - a.archivedAt) : sortItems(rows.map(itemOut));
  return c.json({ lists: lists(u), items, archivedCount: archivedCount(u), members: members(u), today: today() });
});
api.post('/archive-done', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (b.list) { const l = listRow(b.list); if (!canSeeList(l, u)) return bad(c, 'Fant ikke listen', 404); }
  const rows = q(`SELECT * FROM hl_tasks WHERE done=1 AND archived_at IS NULL AND ${VISIBLE}${b.list ? ' AND list=@l' : ''}`).all({ u, ...(b.list ? { l: String(b.list) } : {}) });
  const now = Date.now();
  for (const r of rows) archiveRow(r, true, now);
  return c.json({ ok: true, archived: rows.length });
});
api.delete('/archived', (c) => {
  const u = c.get('user'), list = c.req.query('list');
  const rows = q(`SELECT * FROM hl_tasks WHERE archived_at IS NOT NULL AND ${VISIBLE}${list ? ' AND list=@l' : ''}`).all({ u, ...(list ? { l: String(list) } : {}) })
    .filter((t) => { const l = t.list ? listRow(t.list) : null; return !l || l.owner === u || t.created_by === u; });
  const aud = new Set([u]);
  db.transaction(() => { for (const t of rows) { audienceOfTask(t).forEach((x) => aud.add(x)); q('DELETE FROM hl_tasks WHERE id=?').run(t.id); } })();
  send([...aud], 'cleared', { list: list ?? null, ids: rows.map((t) => t.id), archived: true });
  return c.json({ ok: true, removed: rows.length });
});

api.get('/next', (c) => {
  const u = c.get('user'), n = Math.min(10, Math.max(1, Number(c.req.query('n')) || 3));
  return c.json({ items: nextTasks(u, n), open: q(`SELECT COUNT(*) n FROM hl_tasks WHERE done=0 AND archived_at IS NULL AND ${VISIBLE}`).get({ u }).n, lists: lists(u) });
});

api.post('/', async (c) => {
  const u = c.get('user'), b = await body(c);
  let t;
  try { t = cleanTask(b, false, u, 'list' in b ? undefined : defaultList(u)); } catch (e) { return bad(c, e.message); }
  const r = insertTask(u, t);
  return c.json({ item: itemOut(r) }, 201);
});
/** Lager en oppgave (t fra cleanTask) for u, sender sanntid og synker til HA. → raden */
export function insertTask(u, t) {
  const now = Date.now();
  const r = q(`INSERT INTO hl_tasks(title, list, due, assignee, note, done, done_at, created_by, created_at, updated_at, time, urgent, rep, early, prio, flag, tags, subs, place, glimt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .get(t.title, t.list ?? defaultList(u), t.due ?? null, t.assignee ?? null, t.note ?? '', t.done ?? 0, t.done ? now : null, u, now, now,
      t.time ?? null, t.urgent ?? 0, t.rep ?? 'none', t.early ?? 'none', t.prio ?? 0, t.flag ?? 0, t.tags ?? '[]', t.subs ?? '[]', t.place ?? null, t.glimt ?? 0);
  send(audienceOfTask(r), 'created', { item: itemOut(r) });
  haLocal('created', null, r);
  return r;
}

api.patch('/:id{[0-9]+}', async (c) => {
  const u = c.get('user'), cur = byId(+c.req.param('id'));
  if (!cur || !canSeeTask(cur, u)) return bad(c, 'Fant ikke oppgaven', 404);
  let t;
  try { t = cleanTask(await body(c), true, u, cur.list); } catch (e) { return bad(c, e.message); }
  const before = audienceOfTask(cur);
  const arch = 'archived_at' in t ? t.archived_at : undefined;
  delete t.archived_at;
  const keys = Object.keys(t);
  if ('done' in t) { keys.push('done_at', 'done_by'); t.done_at = t.done ? (cur.done ? cur.done_at : Date.now()) : null; t.done_by = t.done ? (cur.done ? cur.done_by ?? null : u) : null; }
  if (keys.length) q(`UPDATE hl_tasks SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => t[k]), Date.now(), cur.id);
  const row = byId(cur.id), item = itemOut(row), after = audienceOfTask(row);
  send(after, 'updated', { item });
  // Prompt 37: gjentagende oppgave fullført → neste forekomst (samme felter, deloppgaver nullstilt).
  let next = null;
  if (t.done === 1 && !cur.done && row.rep && row.rep !== 'none' && row.due) {
    const nd = nextDue(row.due, row.rep);
    if (nd) next = itemOut(insertTask(u, { title: row.title, list: row.list, due: nd, assignee: row.assignee, note: row.note, time: row.time, urgent: row.urgent, rep: row.rep,
      early: row.early, prio: row.prio, flag: row.flag, tags: row.tags, subs: JSON.stringify(parseArr(row.subs).map((x) => ({ n: x.n, done: false }))), place: row.place }));
  }
  // Flyttet til en annen liste: de som ikke ser den lenger, får bare beskjed om at den er borte.
  send(before.filter((x) => !after.includes(x)), 'deleted', { id: cur.id });
  if (keys.length && !row.archived_at) haLocal('updated', cur, row);
  // Prompt 32: arkivering/gjenoppretting (etter de andre feltene, så {archived:false, done:false} gir en åpen oppgave).
  if (arch !== undefined && (arch != null) !== (row.archived_at != null)) return c.json({ item: itemOut(archiveRow(row, arch != null)), ...(next ? { next } : {}) });
  return c.json({ item, ...(next ? { next } : {}) });
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
  const rows = q(`SELECT * FROM hl_tasks WHERE done=1 AND archived_at IS NULL AND ${VISIBLE}${b.list ? ' AND list=@l' : ''}`).all({ u, ...(b.list ? { l: String(b.list) } : {}) })
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

/* Prompt 37: Innstillinger → Gjøremål → Standardliste */
api.get('/settings', (c) => { const u = c.get('user'); return c.json({ defaultList: defaultList(u), lists: lists(u) }); });
api.put('/settings', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (b.defaultList !== undefined) {
    if (b.defaultList === null) kv.del(u, 'tasks_default_list');
    else { const l = listRow(b.defaultList); if (!canSeeList(l, u)) return bad(c, 'Fant ikke listen', 404); kv.set(u, 'tasks_default_list', l.id); }
  }
  return c.json({ defaultList: defaultList(u) });
});

/* Prompt 37: Glimt i Gjøremål (POST /glimt, /glimt/undo, GET /glimt/cards, POST /:id/split, POST /:id/suggest, …) */
mountGlimt41(api, { q, listRow, canSeeList, listsOf, itemOut, byId, cleanTask, insertTask, send, audienceOfTask, defaultList, today }); // prompt 41: før prompt 37-rutene
mountGlimt37(api, { q, db, listRow, canSeeList, canSeeTask, listsOf, lists, listOut, itemOut, byId, cleanTask, insertTask, send, audienceOfTask, defaultList, mineOf, VISIBLE, today, haLocal, parseArr, members });

/* Lister */
api.get('/lists', (c) => c.json({ lists: lists(c.get('user')), members: members(c.get('user')) }));
api.post('/lists', async (c) => {
  const u = c.get('user'), b = await body(c), name = str(b.name, 40);
  if (b.members === undefined && Array.isArray(b.userIds)) b.members = b.userIds; // prompt 37: appene sender begge
  if (!name) return bad(c, 'Gi listen et navn');
  if (b.color && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  const id = uniqueId(name);
  const sort = (q('SELECT MAX(sort) m FROM hl_task_lists WHERE owner=?').get(u).m ?? 0) + 1;
  if (b.members !== undefined && (!Array.isArray(b.members) || b.members.some((x) => !userInfo(String(x))))) return bad(c, 'Ukjent person');
  q('INSERT INTO hl_task_lists(id, name, color, sort, created, owner) VALUES(?,?,?,?,?,?)').run(id, name, b.color || '#6b665c', sort, Date.now(), u);
  if (Array.isArray(b.members) && b.members.length) setMembers(listRow(id), b.members);
  else send([u], 'lists', { lists: lists(u) });
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
  if (b.members === undefined && Array.isArray(b.userIds)) b.members = b.userIds;
  if (b.color !== undefined && !COLOR.test(b.color)) return bad(c, 'Farge må være #rrggbb');
  const name = b.name !== undefined ? str(b.name, 40) : cur.name;
  if (!name) return bad(c, 'Gi listen et navn');
  if (b.members !== undefined && (!Array.isArray(b.members) || b.members.some((x) => !userInfo(String(x))))) return bad(c, 'Ukjent person');
  q('UPDATE hl_task_lists SET name=?, color=?, sort=? WHERE id=?').run(name, b.color ?? cur.color, Number.isInteger(b.sort) ? b.sort : cur.sort, cur.id);
  if (Array.isArray(b.members)) setMembers(listRow(cur.id), b.members);
  else sendLists(audienceOfList(cur));
  return c.json({ list: listOut(listRow(cur.id), u), lists: lists(u) });
});

// Del listen: erstatter medlemmene med userIds. Bare eieren. Fjernede medlemmer mister tilgangen med en gang.
api.put('/lists/:id/members', async (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  const deny = ownerOnly(c, cur); if (deny) return deny;
  const b = await body(c);
  if (!Array.isArray(b.userIds)) return bad(c, 'userIds må være en liste');
  if (b.userIds.some((x) => !userInfo(String(x)))) return bad(c, 'Ukjent person');
  setMembers(cur, b.userIds);
  return c.json({ list: listOut(listRow(cur.id), u), lists: lists(u) });
});
/** Erstatter medlemmene (eieren er alltid med). Fjernede medlemmer mister tilgangen og ansvaret med en gang. */
function setMembers(cur, userIds) {
  const ids = [...new Set(userIds.map(String))].filter((x) => x !== cur.owner && userInfo(x)).slice(0, 50);
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
}

// Et medlem kan forlate en delt liste selv (prompt 37: også POST /lists/:id/leave).
const leave = (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  if (cur.owner === u) return bad(c, 'Eieren kan ikke forlate sin egen liste. Slett den i stedet.');
  q('DELETE FROM hl_task_list_members WHERE list_id=? AND user_id=?').run(cur.id, u);
  q('UPDATE hl_tasks SET assignee=NULL, updated_at=? WHERE list=? AND assignee=?').run(Date.now(), cur.id, u);
  if (cur.household) kv.set(u, 'tasks37_left', [...new Set([...(kv.get(u, 'tasks37_left', []) ?? []), cur.id])]);
  if (kv.get(u, 'tasks_default_list', null) === cur.id) kv.del(u, 'tasks_default_list');
  sendLists([cur.owner, ...memberIds(cur.id), u], { listId: cur.id });
  return c.json({ ok: true, lists: lists(u) });
};
api.delete('/lists/:id/members/me', leave);
api.post('/lists/:id/leave', leave);

api.delete('/lists/:id', (c) => {
  const u = c.get('user'), cur = listRow(c.req.param('id'));
  if (!canSeeList(cur, u)) return bad(c, 'Fant ikke listen', 404);
  const deny = ownerOnly(c, cur); if (deny) return deny;
  if (q('SELECT COUNT(*) n FROM hl_task_lists WHERE owner=?').get(u).n <= 1) return bad(c, 'Den siste listen kan ikke slettes');
  const aud = audienceOfList(cur);
  // Eierens oppgaver flyttes til eierens første gjenværende liste. Andres oppgaver blir uten liste og tilhører dem som lagde dem.
  const to = q('SELECT id FROM hl_task_lists WHERE owner=? AND id != ? ORDER BY sort, created LIMIT 1').get(u, cur.id).id;
  haLocal('listDeleted', cur.id); // koblingen til HA fjernes; HA-listen beholdes
  // Prompt 37: «Slett listen» i listearket sletter oppgavene (?deleteTasks=1, etter bekreftelse i klienten).
  if (c.req.query('deleteTasks') === '1') {
    const ids = q('SELECT id FROM hl_tasks WHERE list=?').pluck().all(cur.id);
    db.transaction(() => {
      q('DELETE FROM hl_tasks WHERE list=?').run(cur.id);
      q('DELETE FROM hl_task_list_members WHERE list_id=?').run(cur.id);
      q('DELETE FROM hl_task_lists WHERE id=?').run(cur.id);
    })();
    send(aud, 'cleared', { list: cur.id, ids });
    sendLists(aud, { removed: cur.id });
    return c.json({ ok: true, deleted: ids.length, lists: lists(u) });
  }
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
