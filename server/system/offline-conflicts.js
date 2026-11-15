// Offline-køen: konfliktvarsel (siste skriving vinner). Før i webx51.js; montert fra system/index.js (mountSystemEarly).
//   GET /api/offline51/versions?tasks=1,2&events=3 → {tasks:{id: updated_at|null}, events:{id: updated|null}} (bare det brukeren ser)
//   Mellomvare: X-Offline51-Base (eller X-Offline51-Queued) på PATCH/DELETE /api/tasks/:id og /api/famcal51/events/:id →
//   X-Offline51-Updated, og X-Offline51-Conflict + X-Offline51-Server-Updated når raden ble endret etter at klienten så den.
import { Hono } from 'hono';
import { q } from '../db.js';
import { authOrToken } from '../mobile.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

const VERSIONED = [
  [/^\/api\/tasks\/(\d+)$/, ['PATCH', 'DELETE'], (id) => q('SELECT updated_at FROM hl_tasks WHERE id=?').pluck().get(Number(id)) ?? null],
  [/^\/api\/famcal51\/events\/(\d+)$/, ['PATCH', 'DELETE'], (id) => (hasTable('famcal51_event') ? q('SELECT updated FROM famcal51_event WHERE id=?').pluck().get(Number(id)) ?? null : null)],
];
const tsOf = (v) => { const s = String(v ?? '').trim(); if (/^\d{10,14}$/.test(s)) return Number(s.length <= 10 ? Number(s) * 1000 : s); const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
export async function offlineMw(c, next) {
  const base = c.req.header('x-offline51-base');
  const queued = c.req.header('x-offline51-queued');
  if (!base && !queued) return next();
  const path = c.req.path;
  const hit = VERSIONED.find(([re, methods]) => re.test(path) && methods.includes(c.req.method));
  let before = null;
  if (hit) { try { before = hit[2](path.match(hit[0])[1]); } catch { before = null; } }
  await next();
  if (!hit || !c.res) return;
  // Uten Base (klienten vet ikke hvilken versjon den så): endret etter at skrivingen ble gjort offline = konflikt.
  const b = tsOf(base) ?? tsOf(queued);
  if (c.res.status < 400) {
    let after = null; try { after = hit[2](path.match(hit[0])[1]); } catch { /* */ }
    if (after != null) c.res.headers.set('X-Offline51-Updated', String(after));
    if (b != null && before != null && before > b + 1000) {
      c.res.headers.set('X-Offline51-Conflict', '1');
      c.res.headers.set('X-Offline51-Server-Updated', String(before));
    }
  }
  c.res.headers.set('Access-Control-Expose-Headers', 'X-Offline51-Conflict, X-Offline51-Server-Updated, X-Offline51-Updated');
}

export const offlineApi = new Hono();
offlineApi.get('/offline51/versions', authOrToken, (c) => {
  const u = c.get('user');
  const ids = (k) => (c.req.query(k) ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  const tasks = {};
  for (const id of ids('tasks')) {
    const t = q('SELECT id, list, created_by, updated_at FROM hl_tasks WHERE id=?').get(id);
    if (!t) { tasks[id] = null; continue; }
    const visible = t.list ? !!q('SELECT 1 FROM hl_task_lists WHERE id=? AND (owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?))').get(t.list, u, u) || (t.created_by === u && !q('SELECT 1 FROM hl_task_lists WHERE id=?').get(t.list)) : t.created_by === u;
    if (visible) tasks[id] = t.updated_at ?? null;
  }
  const events = {};
  if (hasTable('famcal51_event')) for (const id of ids('events')) events[id] = q('SELECT updated FROM famcal51_event WHERE id=?').pluck().get(id) ?? null;
  return c.json({ tasks, events }, 200, NO_STORE);
});
