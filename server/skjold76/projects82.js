// Prompt 82 (CHKSRV): Produkter/prosjekter i Skjold Lab – sjekk ut deler til noe man bygger (og sjekk inn igjen).
// Alt per bruker, under /api/skjold med samme auth som resten (montert fra api.js).
//
//   GET    /projects → [{id, name, status, notes, parts, units, cost, updated}]  (aktive først, så ferdige; nyeste endring først)
//   POST   /projects {name, notes?} · PATCH /projects/:id {name?, notes?, status?} · DELETE /projects/:id (409 med aktive utsjekkinger)
//   GET    /projects/:id → prosjekt + items (enkeltlinjer) + grouped (sum per del)
//   POST   /checkout {projectId|projectName, items:[{partId, qty}], note?} → {project, usages, undoToken}  (alt eller ingenting, 409 ved for lite)
//   POST   /checkout/undo {undoToken} (10 min) → legger alt tilbake og sletter usage-radene (og historikken de laget)
//   POST   /usage/:id/return {qty} → sjekker inn (≤ qty − returnedQty)
// Brukt fra andre moduler: usedIn82 (GET /parts/:id), checkout82 (POST /picklist/take med prosjekt), undoCheckout82.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { partRow76, updatePart76, addHistory76, locationOf76, thumbOf76, now76 } from './store.js';
import { signedUrl76 } from './images.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS skj_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, notes TEXT,
  status TEXT NOT NULL DEFAULT 'aktiv', created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS skj_projects_user ON skj_projects(user_id, deleted_at);
CREATE TABLE IF NOT EXISTS skj_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, project_id INTEGER NOT NULL, part_id INTEGER NOT NULL,
  qty REAL NOT NULL, at INTEGER NOT NULL, note TEXT, returned_qty REAL NOT NULL DEFAULT 0, loc TEXT);
CREATE INDEX IF NOT EXISTS skj_usage_project ON skj_usage(user_id, project_id);
CREATE INDEX IF NOT EXISTS skj_usage_part ON skj_usage(user_id, part_id);`);

export const STATUS82 = ['aktiv', 'ferdig'];
export const UNDO_MS82 = 10 * 60_000;
export const MAX_NAME82 = 80;
export const MAX_PROJECTS82 = 500;
export const MAX_ITEMS82 = 200;
const NS = { 'Cache-Control': 'no-store' };
const EPS = 1e-9;
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const r3 = (n) => Math.round(n * 1000) / 1000;
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const longStr = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n) : '');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
const num = (v) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN; return Number.isFinite(n) ? n : null; };
const idOf = (v) => { const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v; return Number.isInteger(n) && n > 0 ? n : null; };
const qtyTxt = (n, unit) => `${String(r3(n)).replace('.', ',')} ${unit || 'stk'}`;

/* ---------------- Rate limit (skrivinger: 60 i minuttet per bruker) ---------------- */

const hits = new Map();
export function rateOk82(user, t = Date.now()) {
  const arr = (hits.get(user) ?? []).filter((x) => t - x < 60_000);
  if (arr.length >= 60) { hits.set(user, arr); return false; }
  arr.push(t); hits.set(user, arr);
  return true;
}
export const _resetRate82 = () => hits.clear();
const limited = (c) => c.json({ error: 'For mange endringer – vent litt og prøv igjen', code: 'rate' }, 429, { 'Retry-After': '10' });

/* ---------------- Prosjekter ---------------- */

export const projectRow82 = (user, id) => q('SELECT * FROM skj_projects WHERE id=? AND user_id=? AND deleted_at IS NULL').get(idOf(id) ?? -1, user) ?? null;
/** Aktivt prosjekt med samme navn uten hensyn til store/små bokstaver (også æøå – SQLites lower() tar bare ASCII). */
const lc = (s) => String(s ?? '').trim().toLocaleLowerCase('nb');
const byName = (user, name) => q("SELECT * FROM skj_projects WHERE user_id=? AND deleted_at IS NULL AND status='aktiv' ORDER BY id").all(user).find((p) => lc(p.name) === lc(name)) ?? null;
function insertProject(user, name, notes = null) {
  const t = now76();
  const id = q('INSERT INTO skj_projects(user_id, name, notes, status, created, updated) VALUES(?,?,?,?,?,?)').run(user, name, notes, 'aktiv', t, t).lastInsertRowid;
  return projectRow82(user, id);
}
const touch = (id) => q('UPDATE skj_projects SET updated=? WHERE id=?').run(now76(), id);

/** Sum per prosjekt: ulike deler (netto > 0), stk og kostnad (null når ingen del har pris). */
function stats(user, projectId) {
  const rows = q('SELECT u.part_id, sum(u.qty - u.returned_qty) AS net, p.price FROM skj_usage u LEFT JOIN skj_parts p ON p.id=u.part_id AND p.user_id=u.user_id WHERE u.user_id=? AND u.project_id=? GROUP BY u.part_id').all(user, projectId);
  const live = rows.filter((r) => r.net > EPS);
  const priced = live.filter((r) => r.price != null);
  return { parts: live.length, units: r3(live.reduce((s, r) => s + r.net, 0)), cost: priced.length ? Math.round(priced.reduce((s, r) => s + r.net * r.price, 0) * 100) / 100 : null };
}
export function projectOut82(user, p) {
  return { id: p.id, name: p.name, status: p.status, notes: p.notes ?? null, ...stats(user, p.id), created: iso(p.created), updated: iso(p.updated) };
}
export function projects82(user) {
  const rows = q("SELECT * FROM skj_projects WHERE user_id=? AND deleted_at IS NULL ORDER BY CASE status WHEN 'aktiv' THEN 0 ELSE 1 END, updated DESC, id DESC LIMIT ?").all(user, MAX_PROJECTS82);
  return rows.map((p) => projectOut82(user, p));
}
/** Netto utsjekket (alle prosjekter) – brukes for «har aktive utsjekkinger». */
const activeIn = (user, projectId) => q('SELECT count(*) FROM skj_usage WHERE user_id=? AND project_id=? AND qty - returned_qty > ?').pluck().get(user, projectId, EPS);

function lineOut(user, u, part) {
  const ph = (() => { try { return JSON.parse(part?.photos ?? '[]'); } catch { return []; } })();
  const net = r3(u.qty - u.returned_qty);
  return { usageId: u.id, partId: u.part_id, name: part?.name ?? 'Slettet del', thumbUrl: part && ph.length ? thumbUrl(thumbOf76(ph[0]), user) : null,
    qty: u.qty, returnedQty: u.returned_qty, net, at: iso(u.at), note: u.note ?? null,
    loc: u.loc || (part ? locationOf76(part).text : null), unit: part?.unit ?? 'stk', price: part?.price ?? null, deleted: !part || !!part.deleted_at };
}
const thumbUrl = (name, user) => signedUrl76(name, user); // signert, som delene (bildelastere i appene)

export function projectFull82(user, p) {
  const us = q('SELECT * FROM skj_usage WHERE user_id=? AND project_id=? ORDER BY at, id').all(user, p.id);
  const parts = new Map();
  for (const u of us) if (!parts.has(u.part_id)) parts.set(u.part_id, partRow76(user, u.part_id, { withDeleted: true }));
  const items = us.map((u) => lineOut(user, u, parts.get(u.part_id)));
  const g = new Map();
  for (const it of items) {
    const cur = g.get(it.partId) ?? { partId: it.partId, name: it.name, thumbUrl: it.thumbUrl, qty: 0, returnedQty: 0, net: 0, unit: it.unit, price: it.price, loc: it.loc, deleted: it.deleted, lines: [] };
    cur.qty = r3(cur.qty + it.qty); cur.returnedQty = r3(cur.returnedQty + it.returnedQty); cur.net = r3(cur.net + it.net); cur.lines.push(it.usageId); cur.loc = it.loc ?? cur.loc;
    g.set(it.partId, cur);
  }
  const grouped = [...g.values()].map((x) => ({ ...x, cost: x.price != null ? Math.round(x.net * x.price * 100) / 100 : null }))
    .sort((a, b) => (b.net > EPS) - (a.net > EPS) || a.name.localeCompare(b.name, 'nb'));
  return { ...projectOut82(user, p), items, grouped, active: items.some((x) => x.net > EPS) };
}

/** Hvor delen er brukt: [{projectId, name, qty, status}] (netto > 0). */
export function usedIn82(user, partId) {
  return q('SELECT u.project_id AS projectId, p.name, p.status, sum(u.qty - u.returned_qty) AS net FROM skj_usage u JOIN skj_projects p ON p.id=u.project_id WHERE u.user_id=? AND u.part_id=? AND p.deleted_at IS NULL GROUP BY u.project_id HAVING net > ? ORDER BY p.status, p.name COLLATE NOCASE')
    .all(user, Number(partId) || -1, EPS).map((r) => ({ projectId: r.projectId, name: r.name, qty: r3(r.net), status: r.status }));
}

/* ---------------- Sjekk ut / angre / sjekk inn ---------------- */

const undos = new Map(); // token → {user, exp, usageIds, historyIds, projectId, created}
function sweep(t = Date.now()) { for (const [k, v] of undos) if (v.exp < t) undos.delete(k); }

/** Body-items → [{partId, qty}] (samme del slås sammen) | {error}. */
export function parseCheckoutItems82(list) {
  if (!Array.isArray(list) || !list.length) return { error: 'items må være en liste med minst én del' };
  if (list.length > MAX_ITEMS82) return { error: `Maks ${MAX_ITEMS82} deler per utsjekking` };
  const m = new Map();
  for (const it of list) {
    const pid = idOf(it && typeof it === 'object' ? it.partId ?? it.id : null);
    if (pid == null) return { error: 'Hver linje må ha partId' };
    const n = num(it.qty ?? it.take);
    if (n == null || n <= 0 || n > 1e6) return { error: 'qty må være et tall større enn 0' };
    m.set(pid, r3((m.get(pid) ?? 0) + n));
  }
  return { items: [...m].map(([partId, qty]) => ({ partId, qty })) };
}

/**
 * Sjekker ut deler til et prosjekt. Alt eller ingenting.
 * → {status, body}  (200: {project, usages, undoToken, parts:[{partId, name, before, after, unit, low}]})
 */
export function checkout82(user, b) {
  const p = parseCheckoutItems82(b?.items);
  if (p.error) return { status: 400, body: { error: p.error } };
  const note = longStr(b.note ?? '', 500) || null;
  let project = null, createName = null;
  if (b.projectId != null && b.projectId !== '') {
    project = projectRow82(user, b.projectId);
    if (!project) return { status: 404, body: { error: 'Fant ikke produktet' } };
  } else {
    const n = str(b.projectName ?? '', MAX_NAME82);
    if (!n) return { status: 400, body: { error: 'Velg et produkt (projectId eller projectName)' } };
    project = byName(user, n);
    if (!project) createName = n;
  }
  const rows = [], short = [], missing = [];
  for (const it of p.items) {
    const cur = partRow76(user, it.partId);
    if (!cur) { missing.push(it.partId); continue; }
    if (cur.qty + EPS < it.qty) short.push({ partId: cur.id, name: cur.name, have: cur.qty, want: it.qty, unit: cur.unit });
    rows.push({ it, cur });
  }
  if (missing.length) return { status: 404, body: { error: missing.length === 1 ? 'Fant ikke delen' : `Fant ikke ${missing.length} deler`, missing } };
  if (short.length) {
    // Hele forklaringen står i error (appene viser bare den): «Ikke nok på lager: «ESP32» (har 1, trenger 3), «LED» (har 0, trenger 2)».
    const n = (x) => String(r3(x)).replace('.', ',');
    const list = short.slice(0, 8).map((x) => `«${x.name}» (har ${n(x.have)}, trenger ${n(x.want)})`).join(', ');
    return { status: 409, body: { error: `Ikke nok på lager: ${list}${short.length > 8 ? ` og ${short.length - 8} til` : ''}`, code: 'short', short } };
  }
  if (createName && q('SELECT count(*) FROM skj_projects WHERE user_id=? AND deleted_at IS NULL').pluck().get(user) >= MAX_PROJECTS82) return { status: 409, body: { error: `Maks ${MAX_PROJECTS82} produkter` } };
  const usageIds = [], historyIds = [], parts = [];
  db.transaction(() => {
    if (createName) project = insertProject(user, createName);
    const t = now76();
    for (const { it, cur } of rows) {
      const next = r3(Math.max(0, cur.qty - it.qty));
      const row = updatePart76(user, cur.id, { qty: next });
      const id = q('INSERT INTO skj_usage(user_id, project_id, part_id, qty, at, note, returned_qty, loc) VALUES(?,?,?,?,?,?,0,?)').run(user, project.id, cur.id, it.qty, t, note, locationOf76(cur).text).lastInsertRowid;
      usageIds.push(Number(id));
      addHistory76(user, cur.id, 'sjekket ut', { qty: cur.qty }, { qty: next, project: project.name, projectId: project.id, usageId: Number(id), text: `Sjekket ut ${qtyTxt(it.qty, cur.unit)} til «${project.name}»` });
      historyIds.push(q('SELECT last_insert_rowid()').pluck().get());
      parts.push({ partId: cur.id, name: cur.name, before: cur.qty, after: row.qty, unit: cur.unit ?? null, low: row.min_qty != null && row.qty <= row.min_qty });
    }
    touch(project.id);
  })();
  sweep();
  const undoToken = randomBytes(18).toString('base64url');
  undos.set(undoToken, { user, exp: Date.now() + UNDO_MS82, usageIds, historyIds, projectId: project.id, created: !!createName });
  const usages = usageIds.map((id) => lineOut(user, q('SELECT * FROM skj_usage WHERE id=?').get(id), partRow76(user, q('SELECT part_id FROM skj_usage WHERE id=?').pluck().get(id))));
  return { status: 200, body: { ok: true, project: projectOut82(user, projectRow82(user, project.id)), created: !!createName, usages, parts, undoToken, undoUntil: iso(Date.now() + UNDO_MS82) } };
}

/** Angre en utsjekking. → {status, body} */
export function undoCheckout82(user, token) {
  sweep();
  const u = typeof token === 'string' ? undos.get(token) : null;
  if (!u || u.user !== user) return { status: 404, body: { error: 'Kan ikke angre lenger (over 10 minutter, eller allerede angret)' } };
  undos.delete(token);
  const parts = [];
  db.transaction(() => {
    for (const id of u.usageIds) {
      const us = q('SELECT * FROM skj_usage WHERE id=? AND user_id=?').get(id, user);
      if (!us) continue;
      const back = r3(us.qty - us.returned_qty);
      const cur = partRow76(user, us.part_id, { withDeleted: true });
      if (cur && back > EPS) { const row = updatePart76(user, cur.id, { qty: r3(cur.qty + back) }); parts.push({ partId: cur.id, name: cur.name, before: cur.qty, after: row.qty, unit: cur.unit ?? null }); }
      q('DELETE FROM skj_usage WHERE id=?').run(id);
    }
    for (const h of u.historyIds) q("DELETE FROM skj_history WHERE id=? AND user_id=? AND action='sjekket ut'").run(h, user);
    // Prosjektet ble laget av denne utsjekkingen og er tomt: borte igjen.
    if (u.created && !q('SELECT 1 FROM skj_usage WHERE user_id=? AND project_id=?').get(user, u.projectId)) q('UPDATE skj_projects SET deleted_at=? WHERE id=? AND user_id=?').run(now76(), u.projectId, user);
    else touch(u.projectId);
  })();
  return { status: 200, body: { ok: true, parts } };
}

export function return82(user, usageId, qtyIn) {
  const us = q('SELECT * FROM skj_usage WHERE id=? AND user_id=?').get(idOf(usageId) ?? -1, user);
  if (!us) return { status: 404, body: { error: 'Fant ikke utsjekkingen' } };
  const left = r3(us.qty - us.returned_qty);
  const n = qtyIn == null || qtyIn === '' ? left : num(qtyIn);
  if (n == null || n <= 0) return { status: 400, body: { error: 'qty må være et tall større enn 0' } };
  if (n > left + EPS) return { status: 409, body: { error: left > EPS ? `Bare ${String(left).replace('.', ',')} igjen å sjekke inn` : 'Alt er allerede sjekket inn', left } };
  const cur = partRow76(user, us.part_id);
  if (!cur) return { status: 409, body: { error: 'Delen er slettet – gjenopprett den først' } };
  const p = q('SELECT * FROM skj_projects WHERE id=? AND user_id=?').get(us.project_id, user);
  let row;
  db.transaction(() => {
    row = updatePart76(user, cur.id, { qty: r3(cur.qty + n) });
    q('UPDATE skj_usage SET returned_qty=? WHERE id=?').run(r3(us.returned_qty + n), us.id);
    addHistory76(user, cur.id, 'sjekket inn', { qty: cur.qty }, { qty: row.qty, project: p?.name ?? null, projectId: us.project_id, usageId: us.id, text: `Sjekket inn ${qtyTxt(n, cur.unit)} fra «${p?.name ?? 'produkt'}»` });
    touch(us.project_id);
  })();
  const after = q('SELECT * FROM skj_usage WHERE id=?').get(us.id);
  return { status: 200, body: { ok: true, usage: lineOut(user, after, row), part: { partId: row.id, name: row.name, before: cur.qty, after: row.qty, unit: row.unit }, project: p && !p.deleted_at ? projectOut82(user, p) : null } };
}

/* ---------------- Ruter ---------------- */

function fields(b, { partial = false } = {}) {
  const f = {};
  if (!partial || has(b, 'name')) {
    if (typeof b.name === 'string' && b.name.trim().length > MAX_NAME82) return { error: `Navnet kan være maks ${MAX_NAME82} tegn` };
    const n = str(b.name, MAX_NAME82); if (!n) return { error: 'Navn mangler' }; f.name = n;
  }
  if (has(b, 'notes')) f.notes = longStr(b.notes ?? '', 2000) || null;
  if (has(b, 'status')) { if (!STATUS82.includes(b.status)) return { error: "status må være 'aktiv' eller 'ferdig'" }; f.status = b.status; }
  return { f };
}
const NOPROJ = { error: 'Fant ikke produktet' };

export function mountProjects82(app) {
  // Rate limit på skrivinger (GET er fri).
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && /\/(projects(\/|$)|checkout(\/|$)|usage\/)/.test(c.req.path) && !rateOk82(c.get('user'))) return limited(c);
    await next();
  });

  app.get('/projects', (c) => c.json(projects82(c.get('user')), 200, NS));
  app.post('/projects', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!b) return c.json({ error: 'Forventet {name, notes?}' }, 400);
    const r = fields(b);
    if (r.error) return c.json({ error: r.error }, 400);
    const dup = byName(u, r.f.name);
    if (dup) return c.json({ error: `Du har allerede et aktivt produkt som heter «${dup.name}»`, project: projectOut82(u, dup) }, 409);
    if (q('SELECT count(*) FROM skj_projects WHERE user_id=? AND deleted_at IS NULL').pluck().get(u) >= MAX_PROJECTS82) return c.json({ error: `Maks ${MAX_PROJECTS82} produkter` }, 409);
    return c.json(projectOut82(u, insertProject(u, r.f.name, r.f.notes ?? null)), 201);
  });
  app.get('/projects/:id{[0-9]+}', (c) => {
    const u = c.get('user'), p = projectRow82(u, c.req.param('id'));
    return p ? c.json(projectFull82(u, p), 200, NS) : c.json(NOPROJ, 404);
  });
  app.patch('/projects/:id{[0-9]+}', async (c) => {
    const u = c.get('user'), p = projectRow82(u, c.req.param('id')), b = await body(c);
    if (!p) return c.json(NOPROJ, 404);
    if (!b) return c.json({ error: 'Forventet {name?, notes?, status?}' }, 400);
    const r = fields(b, { partial: true });
    if (r.error) return c.json({ error: r.error }, 400);
    const status = r.f.status ?? p.status, name = r.f.name ?? p.name;
    if (status === 'aktiv' && (r.f.name || r.f.status)) { const d = byName(u, name); if (d && d.id !== p.id) return c.json({ error: `Du har allerede et aktivt produkt som heter «${d.name}»` }, 409); }
    const cols = Object.keys(r.f);
    if (cols.length) q(`UPDATE skj_projects SET ${cols.map((k) => `${k}=@${k}`).join(', ')}, updated=@t WHERE id=@id AND user_id=@u`).run({ ...r.f, t: now76(), id: p.id, u });
    return c.json(projectFull82(u, projectRow82(u, p.id)));
  });
  app.delete('/projects/:id{[0-9]+}', (c) => {
    const u = c.get('user'), p = projectRow82(u, c.req.param('id'));
    if (!p) return c.json(NOPROJ, 404);
    const n = activeIn(u, p.id);
    if (n) return c.json({ error: `Produktet har ${n} ${n === 1 ? 'aktiv utsjekking' : 'aktive utsjekkinger'} – sjekk inn delene først`, active: n }, 409);
    q('UPDATE skj_projects SET deleted_at=? WHERE id=? AND user_id=?').run(now76(), p.id, u);
    return c.json({ ok: true, id: p.id });
  });

  app.post('/checkout', async (c) => {
    const b = await body(c);
    if (!b) return c.json({ error: 'Forventet {projectId|projectName, items:[{partId, qty}], note?}' }, 400);
    const r = checkout82(c.get('user'), b);
    return c.json(r.body, r.status);
  });
  app.post('/checkout/undo', async (c) => {
    const b = await body(c);
    const r = undoCheckout82(c.get('user'), b?.undoToken);
    return c.json(r.body, r.status);
  });
  app.post('/usage/:id{[0-9]+}/return', async (c) => {
    const b = (await body(c)) ?? {};
    const r = return82(c.get('user'), c.req.param('id'), b.qty);
    return c.json(r.body, r.status);
  });
}
