// Huskeliste ↔ Home Assistant To-do (prompt 22, claude-code-huske-ha.md).
// - En liste i Huskeliste kan kobles til én todo.*-entitet i HA (huske_ha_map). Bare administratorer kan slå på synken og
//   koble lister, og bare lister de selv eier eller har tilgang til. HA-tilkoblingen (URL + long-lived token) er den samme
//   som ellers (Integrasjoner → Home Assistant).
// - Toveis: HA leses med WebSocket (todo/item/list), endringer fra HA kommer i sanntid via todo/item/subscribe (reserve:
//   subscribe_events/state_changed på entiteten, og listen hentes på nytt). Endringer i appen skrives med servicekallene
//   todo.add_item, todo.update_item og todo.remove_item.
// - Felt: n (tittel) ↔ summary, done ↔ status (needs_action/completed), due ↔ due (dato), who → description («Tildelt: Ingrid»).
// - Konflikt: sist endret vinner (hl_tasks.updated_at mot tidspunktet HA-endringen ble sett). Sletting på én side sletter på
//   den andre. Første kobling slår listene sammen uten duplikater (samme tekst, store og små bokstaver likt).
// - Kø: endringer i appen legges i huske_ha_queue (i databasen) og sendes når HA svarer. Mens HA er nede er status «error».
// - Sanntid til klientene går via tasks.js sin send(), dvs. bare til dem som har tilgang til listen.
// - MOCK_DATA=1 uten HA-token: en innebygd HA i minnet (todo.handleliste, todo.huskeliste), så klientene kan utvikles uten HA.
import WebSocket from 'ws';
import { db, kv, OWNER } from './db.js';
import { cfg } from './settings.js';
import { broadcast } from './realtime.js';

const q = (sql) => db.prepare(sql);
const hasCol = (t, col) => q(`PRAGMA table_info(${t})`).all().some((c) => c.name === col);
const RETRY_MS = Number(process.env.HA_SYNC_RETRY_MS) || 30_000;
const FULL_MS = Number(process.env.HA_SYNC_FULL_MS) || 5 * 60_000;
const DEBOUNCE_MS = Number(process.env.HA_SYNC_DEBOUNCE_MS) || 150;
const TIMEOUT = 8000;
const MOCK = process.env.MOCK_DATA === '1';

let T = null; // hjelpere fra tasks.js (listRow, canSeeList, audienceOfTask, send, itemOut, userInfo, isAdmin)

function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS huske_ha_map (list_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, created INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS huske_ha_seen (entity_id TEXT NOT NULL, uid TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', due TEXT, description TEXT,
    PRIMARY KEY (entity_id, uid));
  CREATE TABLE IF NOT EXISTS huske_ha_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id TEXT NOT NULL, op TEXT NOT NULL, task_id INTEGER, uid TEXT,
    created INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, last_error TEXT);
  `);
  if (!hasCol('hl_tasks', 'ha_uid')) db.exec('ALTER TABLE hl_tasks ADD COLUMN ha_uid TEXT');
  if (!hasCol('hl_tasks', 'ha_synced_at')) db.exec('ALTER TABLE hl_tasks ADD COLUMN ha_synced_at INTEGER');
  if (!hasCol('hl_tasks', 'updated_at')) { db.exec('ALTER TABLE hl_tasks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0'); q('UPDATE hl_tasks SET updated_at=created_at WHERE updated_at=0').run(); }
}

/* ---------------- Tilstand ---------------- */

const conf = () => ({ enabled: false, syncedAt: null, ...kv.get(OWNER, 'huske_ha', {}) });
const setConf = (patch) => kv.set(OWNER, 'huske_ha', { ...conf(), ...patch });
const state = { status: 'off', error: null };
const mapRows = () => q('SELECT * FROM huske_ha_map ORDER BY created').all();
const mapOfList = (listId) => (listId ? q('SELECT * FROM huske_ha_map WHERE list_id=?').get(listId) : null);
const mapOfEntity = (e) => q('SELECT * FROM huske_ha_map WHERE entity_id=?').get(e);
const queueCount = () => q('SELECT COUNT(*) n FROM huske_ha_queue').get().n;
function setStatus(status, error = null) {
  const changed = state.status !== status || state.error !== error;
  state.status = status; state.error = error;
  if (changed) broadcast('tasks', { action: 'ha', status, error, syncedAt: conf().syncedAt }); // bare administratorer
}

/* ---------------- Transport: ekte HA (REST + WebSocket) ---------------- */

class HaError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
const base = () => String(cfg('ha_url') || '').replace(/\/$/, '');
const token = () => cfg('ha_token') || '';

async function rest(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${base()}${path}`, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  } catch (e) { throw new HaError(`Fikk ikke kontakt med Home Assistant (${e.cause?.code ?? e.name ?? e.message})`, 'unreachable'); }
  if (res.status === 401 || res.status === 403) throw new HaError('Home Assistant avviste tokenet (401). Lag et nytt long-lived token.', 'auth');
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new HaError(`Home Assistant svarte ${res.status}${data?.message ? `: ${data.message}` : ''}`, res.status === 404 ? 'not_found' : 'http');
  return data;
}

// Én WebSocket-forbindelse til HA, med kall (id → svar) og abonnementer (id → hendelser).
class HaSocket {
  constructor() { this.ws = null; this.ready = null; this.id = 0; this.pending = new Map(); this.subs = new Map(); this.onClose = null; }
  open() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const url = base().replace(/^http/i, 'ws') + '/api/websocket';
      let ws;
      try { ws = new WebSocket(url, { handshakeTimeout: TIMEOUT }); } catch (e) { this.ready = null; reject(new HaError(`Ugyldig HA-adresse (${e.message})`, 'unreachable')); return; }
      this.ws = ws;
      const fail = (err) => { this.ready = null; reject(err); };
      const timer = setTimeout(() => { fail(new HaError('Home Assistant svarte ikke på WebSocket', 'unreachable')); try { ws.terminate(); } catch { /* */ } }, TIMEOUT);
      ws.on('message', (data) => {
        let m; try { m = JSON.parse(String(data)); } catch { return; }
        if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token() }));
        else if (m.type === 'auth_ok') { clearTimeout(timer); resolve(this); }
        else if (m.type === 'auth_invalid') { clearTimeout(timer); fail(new HaError('Home Assistant avviste tokenet. Lag et nytt long-lived token.', 'auth')); ws.close(); }
        else if (m.type === 'result') { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.success ? p.resolve(m.result) : p.reject(new HaError(m.error?.message ?? 'Feil fra Home Assistant', m.error?.code ?? 'ws')); } }
        else if (m.type === 'event') this.subs.get(m.id)?.(m.event);
      });
      ws.on('error', (e) => { clearTimeout(timer); fail(new HaError(`Fikk ikke kontakt med Home Assistant (${e.code ?? e.message})`, 'unreachable')); });
      ws.on('close', () => {
        clearTimeout(timer);
        for (const p of this.pending.values()) p.reject(new HaError('Forbindelsen til Home Assistant ble brutt', 'unreachable'));
        this.pending.clear(); this.subs.clear(); this.ready = null; this.ws = null;
        this.onClose?.();
      });
    });
    return this.ready;
  }
  async call(msg, onEvent) {
    await this.open();
    const id = ++this.id;
    if (onEvent) this.subs.set(id, onEvent);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { if (this.pending.delete(id)) reject(new HaError('Home Assistant svarte ikke i tide', 'unreachable')); }, TIMEOUT);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); this.subs.delete(id); reject(e); } });
      this.ws.send(JSON.stringify({ id, ...msg }));
    });
  }
  close() { const ws = this.ws; this.onClose = null; this.ready = null; if (ws) try { ws.close(); } catch { /* */ } }
}

function realTransport() {
  const sock = new HaSocket();
  const service = (name, data) => rest(`/api/services/todo/${name}`, { method: 'POST', body: data });
  return {
    kind: 'ha',
    configured: () => !!(base() && token()),
    async entities() {
      const states = await rest('/api/states');
      return (Array.isArray(states) ? states : []).filter((s) => /^todo\./.test(s.entity_id ?? ''))
        .map((s) => ({ entity_id: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id, lastUpdated: Date.parse(s.last_updated ?? '') || null }));
    },
    async lastUpdated(entity) { try { const s = await rest(`/api/states/${encodeURIComponent(entity)}`); return Date.parse(s?.last_updated ?? '') || null; } catch { return null; } },
    async items(entity) { const r = await sock.call({ type: 'todo/item/list', entity_id: entity }); return r?.items ?? []; },
    add: (entity, it) => service('add_item', { entity_id: entity, item: it.summary, ...(it.due ? { due_date: it.due } : {}), ...(it.description ? { description: it.description } : {}) }),
    update: (entity, uid, ch) => service('update_item', { entity_id: entity, item: uid, ...ch }),
    remove: (entity, uid) => service('remove_item', { entity_id: entity, item: uid }),
    // Ny liste: «Local To-do» via config flow (krever admin-token i HA). Gir entity_id, eller en forståelig feil.
    async createList(name) {
      let flow;
      try { flow = await rest('/api/config/config_entries/flow', { method: 'POST', body: { handler: 'local_todo', show_advanced_options: false } }); }
      catch (e) { throw new HaError(`Kunne ikke lage liste i Home Assistant (${e.message}). Lag en «Local To-do»-liste i HA under Innstillinger → Enheter og tjenester → Legg til integrasjon, og koble den her.`, 'create'); }
      let done;
      try { done = await rest(`/api/config/config_entries/flow/${encodeURIComponent(flow.flow_id)}`, { method: 'POST', body: { todo_list_name: name } }); }
      catch (e) { throw new HaError(`Home Assistant godtok ikke navnet «${name}» (${e.message}).`, 'create'); }
      if (done?.type !== 'create_entry') throw new HaError(`Home Assistant laget ikke listen (${done?.errors ? Object.values(done.errors).join(', ') : done?.type ?? 'ukjent svar'}).`, 'create');
      for (let i = 0; i < 5; i++) {
        const ents = await this.entities().catch(() => []);
        const hit = ents.find((x) => x.name === name || x.name === done.title) ?? ents.find((x) => x.entity_id === `todo.${slugHa(name)}`);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 300));
      }
      return { entity_id: `todo.${slugHa(name)}`, name };
    },
    // Sanntid: todo/item/subscribe per entitet. Mangler kommandoen (eldre HA), brukes state_changed og listen hentes på nytt.
    async subscribe(entities, onChange, onDown) {
      sock.onClose = onDown;
      let fallback = false;
      for (const e of entities) {
        try { await sock.call({ type: 'todo/item/subscribe', entity_id: e }, (ev) => onChange(e, Array.isArray(ev?.items) ? ev.items : null)); }
        catch (err) { if (err.code === 'unreachable' || err.code === 'auth') throw err; fallback = true; }
      }
      if (fallback) {
        const set = new Set(entities);
        await sock.call({ type: 'subscribe_events', event_type: 'state_changed' }, (ev) => { const id = ev?.data?.entity_id; if (set.has(id)) onChange(id, null); });
      }
      return { fallback };
    },
    close: () => sock.close(),
  };
}
const slugHa = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/* ---------------- Transport: innebygd HA i minnet (MOCK_DATA=1) ---------------- */

function mockTransport() {
  const store = new Map([['todo.handleliste', { name: 'Handleliste', items: [{ uid: 'm1', summary: 'Egg', status: 'needs_action' }, { uid: 'm2', summary: 'Kaffe', status: 'completed' }] }],
    ['todo.huskeliste', { name: 'Huskeliste', items: [] }]]);
  let n = 10, listener = null;
  const ent = (e) => { const x = store.get(e); if (!x) throw new HaError(`Ukjent entitet ${e}`, 'not_found'); return x; };
  const changed = (e) => setTimeout(() => listener?.(e, ent(e).items.map((x) => ({ ...x }))), 20);
  return {
    kind: 'mock', store,
    configured: () => true,
    entities: async () => [...store].map(([entity_id, v]) => ({ entity_id, name: v.name, lastUpdated: null })),
    lastUpdated: async () => null,
    items: async (e) => ent(e).items.map((x) => ({ ...x })),
    add: async (e, it) => { ent(e).items.push({ uid: `m${++n}`, summary: it.summary, status: 'needs_action', ...(it.due ? { due: it.due } : {}), ...(it.description ? { description: it.description } : {}) }); changed(e); },
    update: async (e, uid, ch) => {
      const x = ent(e).items.find((i) => i.uid === uid); if (!x) throw new HaError('Fant ikke oppgaven i HA', 'not_found');
      if (ch.rename !== undefined) x.summary = ch.rename; if (ch.status) x.status = ch.status;
      if ('due_date' in ch) { if (ch.due_date) x.due = ch.due_date; else delete x.due; }
      if ('description' in ch) { if (ch.description) x.description = ch.description; else delete x.description; }
      changed(e);
    },
    remove: async (e, uid) => { const L = ent(e); L.items = L.items.filter((i) => i.uid !== uid); changed(e); },
    createList: async (name) => { const id = `todo.${slugHa(name) || 'liste'}`; if (store.has(id)) throw new HaError(`Listen ${id} finnes allerede i HA`, 'create'); store.set(id, { name, items: [] }); return { entity_id: id, name }; },
    subscribe: async (entities, onChange) => { listener = (e, items) => { if (entities.includes(e)) onChange(e, items); }; return { fallback: false }; },
    close: () => { listener = null; },
  };
}

let tr = null;
/** Transporten: ekte HA, eller den innebygde i MOCK_DATA=1 når HA ikke er satt opp. Testene kan bytte den. */
export function transport() {
  if (tr) return tr;
  tr = MOCK && !token() ? mockTransport() : realTransport();
  return tr;
}
export function setTransport(t) { try { tr?.close?.(); } catch { /* */ } tr = t; }

/* ---------------- Felt og sammenligning ---------------- */

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const haDue = (d) => (d ? String(d).slice(0, 10) : null);
const fromHa = (h) => ({ title: String(h.summary ?? '').trim().slice(0, 200), done: h.status === 'completed', due: haDue(h.due) });
const fromTask = (t) => ({ title: t.title, done: !!t.done, due: t.due ?? null });
const same = (a, b) => a.title === b.title && a.done === b.done && (a.due ?? null) === (b.due ?? null);
function descOf(t) {
  const u = t.assignee ? T.userInfo(t.assignee) : null;
  // Prompt 44: HA To-do har ikke underpunkter, så deloppgavene sendes som linjer i beskrivelsen («☐ sovepose»).
  let subs = []; try { subs = JSON.parse(t.subs ?? '[]'); } catch { subs = []; }
  const lines = [u ? `Tildelt: ${u.displayName ?? u.name}` : null, ...(Array.isArray(subs) ? subs : []).filter((x) => x?.n).map((x) => `${x.done ? '☑' : '☐'} ${x.n}`)].filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}
const ours = (d) => !d || /^(Tildelt: |☐ |☑ )/.test(d); // beskrivelsen er vår (eller tom), så den kan overskrives

/* ---------------- Synk av én entitet ---------------- */

const locks = new Map();
function locked(entity, fn) {
  const prev = locks.get(entity) ?? Promise.resolve();
  const p = prev.catch(() => {}).then(fn);
  locks.set(entity, p.catch(() => {}));
  return p;
}

function enqueue(entity, op, taskId = null, uid = null) {
  q('INSERT INTO huske_ha_queue(entity_id, op, task_id, uid, created) VALUES(?,?,?,?,?)').run(entity, op, taskId, uid, Date.now());
}

/**
 * Avstemmer én koblet liste mot HA. items: listen fra HA (fra abonnementet), ellers hentes den.
 * haTs: når HA-endringen skjedde (hendelsestidspunkt), brukes ved konflikt.
 */
async function reconcile(entity, items = null, haTs = null) {
  const map = mapOfEntity(entity);
  if (!map) return { skipped: true };
  const list = T.listRow(map.list_id);
  if (!list) return { skipped: true };
  const t0 = Date.now();
  // 1) Køede slettinger først (oppgaver slettet eller flyttet ut av listen i appen).
  const removes = q("SELECT * FROM huske_ha_queue WHERE entity_id=? AND op='remove' ORDER BY id").all(entity);
  for (const r of removes) {
    try { await tr.remove(entity, r.uid); } catch (e) { if (e.code !== 'not_found' && !/not found|finnes ikke|unknown/i.test(e.message)) throw e; }
    q('DELETE FROM huske_ha_queue WHERE id=?').run(r.id);
    q('DELETE FROM huske_ha_seen WHERE entity_id=? AND uid=?').run(entity, r.uid);
  }
  if (removes.length || !items) items = await tr.items(entity);
  haTs ??= (await tr.lastUpdated?.(entity)) ?? t0;
  const removedUids = new Set(removes.map((r) => r.uid));
  items = items.filter((h) => h?.uid && !removedUids.has(h.uid));

  const seen = new Map(q('SELECT * FROM huske_ha_seen WHERE entity_id=?').all(entity).map((s) => [s.uid, s]));
  const locals = q('SELECT * FROM hl_tasks WHERE list=? AND archived_at IS NULL ORDER BY created_at, id').all(list.id);
  const haUids = new Set(items.map((h) => h.uid));
  const byUid = new Map(locals.filter((t) => t.ha_uid && haUids.has(t.ha_uid)).map((t) => [t.ha_uid, t]));
  const out = { created: 0, updated: 0, deleted: 0, pushed: 0, removed: removes.length };
  const changedLocal = [];
  const applyHa = (t, h) => {
    const v = fromHa(h), now = Date.now();
    const doneAt = v.done ? (t.done ? t.done_at : now) : null;
    q('UPDATE hl_tasks SET title=?, done=?, done_at=?, due=?, updated_at=?, ha_synced_at=? WHERE id=?').run(v.title || t.title, v.done ? 1 : 0, doneAt, v.due, now, now, t.id);
    changedLocal.push(t.id); out.updated++;
  };
  const markSynced = (t) => q('UPDATE hl_tasks SET ha_synced_at=? WHERE id=?').run(Math.max(t.updated_at, Date.now()), t.id);
  const pushes = [];

  // 2) Oppgaver som finnes i HA.
  const unlinked = locals.filter((t) => !t.ha_uid || !haUids.has(t.ha_uid));
  for (const h of items) {
    let t = byUid.get(h.uid);
    const s = seen.get(h.uid);
    if (!t) {
      if (s) { pushes.push({ op: 'remove', uid: h.uid }); continue; } // slettet i appen etter forrige synk
      // Ny i HA: slå sammen med en lokal oppgave med samme tekst (første kobling), ellers lag den.
      const k = unlinked.findIndex((x) => norm(x.title) === norm(h.summary));
      if (k >= 0) {
        t = unlinked.splice(k, 1)[0];
        const v = fromHa(h), merged = { done: t.done || v.done, due: t.due ?? v.due };
        q('UPDATE hl_tasks SET ha_uid=?, done=?, done_at=?, due=?, updated_at=?, ha_synced_at=? WHERE id=?')
          .run(h.uid, merged.done ? 1 : 0, merged.done ? t.done_at ?? Date.now() : null, merged.due, Date.now(), Date.now(), t.id);
        t = q('SELECT * FROM hl_tasks WHERE id=?').get(t.id);
        changedLocal.push(t.id);
        if (!same(fromTask(t), v) || (ours(h.description) && (h.description ?? null) !== descOf(t))) pushes.push({ op: 'update', t, h });
        continue;
      }
      const v = fromHa(h), now = Date.now();
      if (!v.title) continue;
      const r = q(`INSERT INTO hl_tasks(title, list, due, assignee, note, done, done_at, created_by, created_at, updated_at, ha_uid, ha_synced_at)
        VALUES(?,?,?,NULL,'',?,?,?,?,?,?,?) RETURNING *`).get(v.title, list.id, v.due, v.done ? 1 : 0, v.done ? now : null, list.owner, now, now, h.uid, now);
      T.send(T.audienceOfTask(r), 'created', { item: T.itemOut(r), source: 'ha' });
      out.created++;
      continue;
    }
    const hv = fromHa(h), lv = fromTask(t);
    const haChanged = !s || !same(hv, fromHa(s));
    const localChanged = (t.updated_at ?? 0) > (t.ha_synced_at ?? 0);
    const wantDesc = descOf(t), descOff = ours(h.description) && (h.description ?? null) !== wantDesc;
    if (same(hv, lv)) { if (descOff && localChanged) pushes.push({ op: 'update', t, h }); else markSynced(t); continue; }
    const winner = haChanged && localChanged ? ((t.updated_at ?? 0) > haTs ? 'local' : 'ha') : haChanged ? 'ha' : 'local';
    if (winner === 'ha') applyHa(t, h); else pushes.push({ op: 'update', t, h });
  }
  // 3) Lokale oppgaver koblet til en uid som ikke finnes i HA lenger.
  for (const t of locals) {
    if (!t.ha_uid || haUids.has(t.ha_uid) || removedUids.has(t.ha_uid)) continue;
    if (seen.has(t.ha_uid)) { // slettet i HA → slett her
      const aud = T.audienceOfTask(t);
      q('DELETE FROM hl_tasks WHERE id=?').run(t.id);
      T.send(aud, 'deleted', { id: t.id, source: 'ha' });
      out.deleted++;
      const i = unlinked.findIndex((x) => x.id === t.id); if (i >= 0) unlinked.splice(i, 1);
    }
  }
  // 4) Lokale oppgaver som ikke er i HA ennå (nye, eller fra før koblingen) → legg til.
  for (const t of unlinked) if (!(t.ha_uid && seen.has(t.ha_uid))) pushes.push({ op: 'add', t });

  // 5) Skriv til HA.
  const added = [];
  for (const p of pushes) {
    if (p.op === 'remove') { await tr.remove(entity, p.uid).catch((e) => { if (e.code !== 'not_found') throw e; }); out.pushed++; continue; }
    const t = q('SELECT * FROM hl_tasks WHERE id=?').get(p.t.id);
    if (!t) continue;
    const desc = descOf(t);
    if (p.op === 'add') {
      await tr.add(entity, { summary: t.title, due: t.due, description: desc });
      added.push(t); out.pushed++;
    } else {
      const ch = { rename: t.title, status: t.done ? 'completed' : 'needs_action', due_date: t.due ?? null };
      if (ours(p.h?.description) && (p.h?.description ?? null) !== desc) ch.description = desc;
      await tr.update(entity, t.ha_uid, ch);
      q('UPDATE hl_tasks SET ha_synced_at=? WHERE id=?').run(Math.max(t.updated_at, Date.now()), t.id);
      out.pushed++;
    }
  }
  // 6) Nye i HA: finn uid-ene (add_item svarer ikke med uid) og send status «fullført» for dem som var ferdige.
  let final = items;
  if (pushes.length) final = await tr.items(entity);
  if (added.length) {
    const known = new Set([...items.map((h) => h.uid), ...seen.keys()]);
    const fresh = final.filter((h) => !known.has(h.uid));
    for (const t of added) {
      const k = fresh.findIndex((h) => norm(h.summary) === norm(t.title));
      if (k < 0) continue;
      const h = fresh.splice(k, 1)[0];
      q('UPDATE hl_tasks SET ha_uid=?, ha_synced_at=? WHERE id=?').run(h.uid, Math.max(t.updated_at, Date.now()), t.id);
      if (t.done) { await tr.update(entity, h.uid, { status: 'completed' }); h.status = 'completed'; }
    }
    if (added.some((t) => t.done)) final = await tr.items(entity);
  }
  // 7) Øyeblikksbildet av HA (for å se hva som endres eller slettes der neste gang), og køen for entiteten er tømt.
  db.transaction(() => {
    q('DELETE FROM huske_ha_seen WHERE entity_id=?').run(entity);
    const ins = q('INSERT OR REPLACE INTO huske_ha_seen(entity_id, uid, summary, status, due, description) VALUES(?,?,?,?,?,?)');
    for (const h of final) if (h?.uid) ins.run(entity, h.uid, String(h.summary ?? ''), String(h.status ?? ''), haDue(h.due), h.description ?? null);
    q("DELETE FROM huske_ha_queue WHERE entity_id=? AND op<>'remove'").run(entity);
  })();
  for (const id of [...new Set(changedLocal)]) { const r = q('SELECT * FROM hl_tasks WHERE id=?').get(id); if (r) T.send(T.audienceOfTask(r), 'updated', { item: T.itemOut(r), source: 'ha' }); }
  return out;
}

/* ---------------- Motor: abonnement, kø og nye forsøk ---------------- */

let timers = { retry: null, full: null, debounce: new Map() }, subscribed = null, connecting = null;

function clearTimers() {
  clearTimeout(timers.retry); clearInterval(timers.full); for (const t of timers.debounce.values()) clearTimeout(t);
  timers = { retry: null, full: null, debounce: new Map() };
}
function retryLater() {
  if (timers.retry || !conf().enabled) return;
  timers.retry = setTimeout(() => { timers.retry = null; syncAll().catch(() => {}); }, RETRY_MS);
  timers.retry.unref?.();
}
const errText = (e) => e?.message ?? String(e);

/** Synk alle koblede lister nå. Kaster ikke; status og feil ligger i tilstanden. */
export async function syncAll() {
  if (!T || !conf().enabled) { setStatus('off'); return { ok: false, status: 'off' }; }
  const t = transport();
  if (!t.configured()) { setStatus('error', 'Home Assistant er ikke satt opp (URL og token under Integrasjoner → Home Assistant).'); return { ok: false }; }
  if (state.status !== 'ok') setStatus('connecting', state.error);
  try {
    await ensureSubscribed();
    const res = {};
    for (const m of mapRows()) res[m.entity_id] = await locked(m.entity_id, () => reconcile(m.entity_id));
    setConf({ syncedAt: Date.now() });
    setStatus('ok');
    return { ok: true, result: res };
  } catch (e) {
    q('UPDATE huske_ha_queue SET tries=tries+1, last_error=?').run(errText(e).slice(0, 200));
    setStatus('error', errText(e));
    subscribed = null; // abonner på nytt neste gang
    retryLater();
    return { ok: false, error: errText(e) };
  }
}

async function syncOne(entity, items = null, haTs = null) {
  if (!conf().enabled) return;
  try {
    await locked(entity, () => reconcile(entity, items, haTs));
    setConf({ syncedAt: Date.now() });
    setStatus('ok');
  } catch (e) { setStatus('error', errText(e)); subscribed = null; retryLater(); }
}

// Abonner på endringer fra HA for alle koblede entiteter (på nytt når koblingene endres eller forbindelsen brytes).
async function ensureSubscribed() {
  const ents = mapRows().map((m) => m.entity_id).sort();
  const key = ents.join(',');
  if (subscribed === key) return;
  if (connecting?.key === key) return connecting.p;
  const t = transport();
  const p = (async () => {
    t.close?.();
    if (!ents.length) { subscribed = key; return; }
    await t.subscribe(ents, (entity, items) => { syncOne(entity, items, Date.now()); }, () => {
      subscribed = null;
      if (conf().enabled) { setStatus('error', 'Forbindelsen til Home Assistant ble brutt · prøver igjen'); retryLater(); }
    });
    subscribed = key;
  })();
  connecting = { key, p };
  try { await p; } finally { connecting = null; }
}

function scheduleEntity(entity) {
  if (!conf().enabled) return;
  clearTimeout(timers.debounce.get(entity));
  const t = setTimeout(() => { timers.debounce.delete(entity); syncOne(entity); }, DEBOUNCE_MS);
  t.unref?.();
  timers.debounce.set(entity, t);
}

/** Starter synken (ved oppstart og når den slås på). */
export function startHa() {
  if (!conf().enabled) { setStatus('off'); return; }
  clearInterval(timers.full);
  timers.full = setInterval(() => { syncAll().catch(() => {}); }, FULL_MS);
  timers.full.unref?.();
  syncAll().catch(() => {});
}
export function stopHa() {
  clearTimers();
  subscribed = null;
  try { tr?.close?.(); } catch { /* */ }
  if (!conf().enabled) setStatus('off');
}

/* ---------------- Kroker fra tasks.js ---------------- */

/** Kalles etter endringer i appen. kind: created | updated | deleted | listDeleted. */
export function onLocal(kind, before, after) {
  if (!T) return;
  if (kind === 'listDeleted') {
    // Listen er borte: koblingen fjernes og oppgavene mister HA-uid (HA-listen beholdes som den er).
    q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE list=?').run(before);
    const m = mapOfList(before);
    if (m) { q('DELETE FROM huske_ha_map WHERE list_id=?').run(before); q('DELETE FROM huske_ha_seen WHERE entity_id=?').run(m.entity_id); subscribed = null; }
    return;
  }
  if (kind === 'deleted') {
    const m = mapOfList(before?.list);
    if (m && before.ha_uid) { enqueue(m.entity_id, 'remove', before.id, before.ha_uid); scheduleEntity(m.entity_id); }
    return;
  }
  const row = after ?? before;
  if (kind === 'updated' && before && after && before.list !== after.list) {
    const old = mapOfList(before.list);
    if (old && before.ha_uid) { enqueue(old.entity_id, 'remove', before.id, before.ha_uid); scheduleEntity(old.entity_id); }
    if (before.ha_uid) q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE id=?').run(after.id);
  }
  const m = mapOfList(row?.list);
  if (m) { enqueue(m.entity_id, kind === 'created' ? 'add' : 'update', row.id); scheduleEntity(m.entity_id); }
}

/* ---------------- API (/api/tasks/ha) ---------------- */

let entCache = { at: 0, list: null, error: null };
async function entities(force = false) {
  const t = transport();
  if (!t.configured()) return { list: [], error: 'Home Assistant er ikke satt opp (URL og token under Integrasjoner → Home Assistant).' };
  if (!force && entCache.list && Date.now() - entCache.at < 30_000) return entCache;
  try { entCache = { at: Date.now(), list: (await t.entities()).map((x) => ({ entity_id: x.entity_id, name: x.name })), error: null }; }
  catch (e) { entCache = { at: Date.now(), list: entCache.list ?? [], error: errText(e) }; }
  return entCache;
}

async function out(uid, force = false) {
  const c = conf(), ents = await entities(force);
  const maps = mapRows().filter((m) => T.canSeeList(T.listRow(m.list_id), uid)).map((m) => ({ listId: m.list_id, entityId: m.entity_id }));
  const status = c.enabled ? state.status === 'off' ? 'connecting' : state.status : 'off';
  return { enabled: !!c.enabled, status, syncedAt: c.syncedAt ? new Date(c.syncedAt).toISOString() : null, error: c.enabled ? state.error ?? ents.error ?? null : null,
    entities: ents.list ?? [], maps, queue: queueCount(), transport: transport().kind };
}

/** Rutene under /api/tasks/ha. Brukeren er satt av tasks.js (c.get('user')). Alt krever administrator. */
export function mountHa(api) {
  const admin = (c) => (T.isAdmin(c.get('user')) ? null : c.json({ error: 'Bare administratorer kan sette opp synk med Home Assistant' }, 403));
  const body = (c) => c.req.json().catch(() => ({}));
  api.get('/ha', async (c) => admin(c) ?? c.json(await out(c.get('user'))));
  api.put('/ha', async (c) => {
    const deny = admin(c); if (deny) return deny;
    const b = await body(c);
    if (typeof b.enabled !== 'boolean') return c.json({ error: 'enabled må være true eller false' }, 400);
    setConf({ enabled: b.enabled });
    if (b.enabled) { startHa(); await syncAll(); } else stopHa();
    return c.json(await out(c.get('user')));
  });
  api.put('/ha/map', async (c) => {
    const deny = admin(c); if (deny) return deny;
    const u = c.get('user'), b = await body(c);
    const l = T.listRow(b.listId);
    if (!T.canSeeList(l, u)) return c.json({ error: 'Fant ikke listen' }, 404);
    const cur = mapOfList(l.id);
    if (b.entityId === null || b.entityId === '') {
      if (cur) {
        db.transaction(() => {
          q('DELETE FROM huske_ha_map WHERE list_id=?').run(l.id);
          q('DELETE FROM huske_ha_seen WHERE entity_id=?').run(cur.entity_id);
          q('DELETE FROM huske_ha_queue WHERE entity_id=?').run(cur.entity_id);
          q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE list=?').run(l.id);
        })();
        subscribed = null;
      }
      return c.json(await out(u));
    }
    const e = String(b.entityId ?? '');
    if (!/^todo\.[a-z0-9_]{1,80}$/.test(e)) return c.json({ error: 'entityId må være en todo.*-entitet' }, 400);
    const ents = await entities(true);
    if (!ents.error && !ents.list.some((x) => x.entity_id === e)) return c.json({ error: `Fant ikke ${e} i Home Assistant` }, 404);
    const other = mapOfEntity(e);
    if (other && other.list_id !== l.id) return c.json({ error: `${e} er allerede koblet til en annen liste` }, 409);
    if (cur?.entity_id !== e) {
      db.transaction(() => {
        if (cur) { q('DELETE FROM huske_ha_seen WHERE entity_id=?').run(cur.entity_id); q('DELETE FROM huske_ha_queue WHERE entity_id=?').run(cur.entity_id); }
        q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE list=?').run(l.id);
        q('INSERT INTO huske_ha_map(list_id, entity_id, user_id, created) VALUES(?,?,?,?) ON CONFLICT(list_id) DO UPDATE SET entity_id=excluded.entity_id, user_id=excluded.user_id, created=excluded.created')
          .run(l.id, e, u, Date.now());
      })();
      subscribed = null;
    }
    // Første kobling: slå sammen med en gang (hvis synken er på).
    if (conf().enabled) await syncAll();
    return c.json(await out(u));
  });
  api.post('/ha/sync', async (c) => {
    const deny = admin(c); if (deny) return deny;
    if (!conf().enabled) return c.json({ ...(await out(c.get('user'))), error: 'Synk med Home Assistant er slått av' }, 409);
    const r = await syncAll();
    return c.json({ ...(await out(c.get('user'), true)), ok: r.ok });
  });
  // Prompt 44: Innstillinger → Gjøremål. Samme lagring som /ha (huske_ha + huske_ha_map), i formen fra designet.
  //   GET /api/tasks/sync → {on, enabled, status, t, syncedAt, error, lists:[{id, name, color, entityId, entityName, connected}], map:{listId: entityId}, entities, queue, canEdit}
  //   PUT /api/tasks/sync {on?, map?:{listId: entityId|null}} (admin) → samme · POST /api/tasks/sync/now (admin) → samme + ok
  const syncOut = async (u, force = false) => {
    const o = await out(u, force), all = q('SELECT * FROM hl_task_lists').all().filter((l) => T.canSeeList(l, u));
    const ents = new Map((o.entities ?? []).map((e) => [e.entity_id, e.name]));
    const lists = all.map((l) => { const m = o.maps.find((x) => x.listId === l.id); return { id: l.id, name: l.name, color: l.color ?? null, entityId: m?.entityId ?? null, entityName: m ? ents.get(m.entityId) ?? m.entityId : null, connected: !!m, text: m ? ents.get(m.entityId) ?? m.entityId : 'Ikke koblet' }; });
    return { on: o.enabled, ...o, t: o.syncedAt, lists, map: Object.fromEntries(o.maps.map((m) => [m.listId, m.entityId])), connectedCount: o.maps.length, canEdit: T.isAdmin(u),
      text: o.enabled ? `Synk med Home Assistant · ${o.syncedAt ? `synket ${new Date(o.syncedAt).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })}` : 'på'}` : 'Synk med Home Assistant · av' };
  };
  api.get('/sync', async (c) => c.json(await syncOut(c.get('user'))));
  api.put('/sync', async (c) => {
    const deny = admin(c); if (deny) return deny;
    const u = c.get('user'), b = await body(c);
    if (b.on !== undefined && typeof b.on !== 'boolean') return c.json({ error: 'on må være true eller false' }, 400);
    if (b.map !== undefined && (!b.map || typeof b.map !== 'object' || Array.isArray(b.map))) return c.json({ error: 'map må være {listId: entityId|null}' }, 400);
    for (const [listId, e] of Object.entries(b.map ?? {})) {
      const l = T.listRow(listId);
      if (!T.canSeeList(l, u)) return c.json({ error: `Fant ikke listen ${listId}` }, 404);
      if (e !== null && e !== '' && !/^todo\.[a-z0-9_]{1,80}$/.test(String(e))) return c.json({ error: 'entityId må være en todo.*-entitet' }, 400);
      const other = e ? mapOfEntity(e) : null;
      if (other && other.list_id !== l.id) return c.json({ error: `${e} er allerede koblet til en annen liste` }, 409);
      const cur = mapOfList(l.id);
      db.transaction(() => {
        if (cur && cur.entity_id !== e) { q('DELETE FROM huske_ha_map WHERE list_id=?').run(l.id); q('DELETE FROM huske_ha_seen WHERE entity_id=?').run(cur.entity_id); q('DELETE FROM huske_ha_queue WHERE entity_id=?').run(cur.entity_id); q('UPDATE hl_tasks SET ha_uid=NULL, ha_synced_at=NULL WHERE list=?').run(l.id); }
        if (e && cur?.entity_id !== e) q('INSERT INTO huske_ha_map(list_id, entity_id, user_id, created) VALUES(?,?,?,?) ON CONFLICT(list_id) DO UPDATE SET entity_id=excluded.entity_id, user_id=excluded.user_id, created=excluded.created').run(l.id, e, u, Date.now());
      })();
      subscribed = null;
    }
    if (b.on !== undefined) { setConf({ enabled: b.on }); if (b.on) startHa(); else stopHa(); }
    if (conf().enabled && (b.on || b.map)) await syncAll().catch(() => {});
    return c.json(await syncOut(u, true));
  });
  api.post('/sync/now', async (c) => {
    const deny = admin(c); if (deny) return deny;
    if (!conf().enabled) return c.json({ ...(await syncOut(c.get('user'))), error: 'Synk med Home Assistant er slått av' }, 409);
    const r = await syncAll();
    return c.json({ ...(await syncOut(c.get('user'), true)), ok: r.ok });
  });
  api.post('/ha/create', async (c) => {
    const deny = admin(c); if (deny) return deny;
    const name = String((await body(c)).name ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
    if (!name) return c.json({ error: 'Gi listen et navn' }, 400);
    const t = transport();
    if (!t.configured()) return c.json({ error: 'Home Assistant er ikke satt opp (URL og token under Integrasjoner → Home Assistant).' }, 409);
    try {
      const ent = await t.createList(name);
      entCache.at = 0;
      return c.json({ ...(await out(c.get('user'), true)), created: { entity_id: ent.entity_id, name: ent.name ?? name } }, 201);
    } catch (e) { return c.json({ error: errText(e) }, 502); }
  });
}

/** Kobler modulen til tasks.js (kalles når tabellene finnes). */
export function initHa(ctx) {
  T = ctx;
  migrate();
  if (conf().enabled && process.env.NODE_ENV !== 'test') setTimeout(() => startHa(), 2000).unref?.();
}

/** Felt til itemOut i tasks.js: om oppgaven er synket med HA. */
export const haInfo = (r) => (r.ha_uid ? { ha: true } : {});
