// Prompt 63 (prompt 49 del 5, D5SRV): /api/glimt/memory/{pending,conflicts,stale,hygiene} – «minnet holder seg ryddig». Se $S/SERVER63-API.md.
// Montert under /api/glimt/memory FØR «Glimt husker»-rutene (glimt-memory.js), som er uendret. Alt per bruker (sesjon eller app-token).
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { mem63, serverMem63, userMem63, saveMem63, staleDays63, LABELS63, HELP63 } from './settings.js';
import { PID63, CID63, pendingRows63, pendingCounts63, publicPending63, conflictRows63, conflictCounts63, publicConflict63, staleOf63, keepFact63, iso63 } from './store.js';
import { approve63, reject63, edit63, resolve63 } from './review.js';
import { nightly63, ensureSystem63, systemRow63, lastRun63 } from './nightly.js';
import { getMemory } from '../glimt-memory.js';

export const memoryApi63 = new Hono();
memoryApi63.use('*', authOrToken);
const NS = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
let clock = null;
/** Bare for tester: fast «nå» (ms) eller null. */
export const _setClock63 = (ms) => { clock = ms ?? null; };
const now63 = () => clock ?? Date.now();

async function hygieneOut(u) {
  const now = now63();
  const row = (await ensureSystem63(u, now)) ?? systemRow63(u);
  const set = mem63(u);
  return { settings: set, server: serverMem63(), user: userMem63(u), admin: isAdmin(u), labels: LABELS63, help: HELP63, staleDays: staleDays63(u),
    schedule: row ? { id: row.id, status: row.status, nextRunAt: row.status === 'active' ? iso63(row.next_run_at) : null } : null,
    lastRun: lastRun63(u), counts: { pending: pendingCounts63(u).pending, conflicts: conflictCounts63(u).open, stale: set.stale ? staleOf63(u, staleDays63(u), now).length : 0 } };
}

/* ---------------- Forslag ---------------- */

memoryApi63.get('/pending', (c) => {
  const u = c.get('user'), st = c.req.query('status') || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(st)) return c.json({ error: 'Ukjent status (pending, approved, rejected, all)' }, 400);
  return c.json({ items: pendingRows63(u, st).map(publicPending63), counts: pendingCounts63(u), enabled: mem63(u).nightly }, 200, NS);
});
memoryApi63.post('/pending/:id/approve', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!PID63.test(id)) return c.json({ error: 'Fant ikke forslaget' }, 404);
  const b = (await body(c)) ?? {};
  const r = await approve63(u, id, b, { now: now63() });
  if (r.error) return c.json({ error: r.error, ...(r.conflictId ? { conflictId: r.conflictId } : {}) }, r.status ?? 400);
  return c.json({ ok: true, item: publicPending63(r.item), memory: r.memory });
});
memoryApi63.post('/pending/:id/reject', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!PID63.test(id)) return c.json({ error: 'Fant ikke forslaget' }, 404);
  const r = reject63(u, id, now63());
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, item: publicPending63(r.item) });
});
memoryApi63.post('/pending/:id/edit', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!PID63.test(id)) return c.json({ error: 'Fant ikke forslaget' }, 404);
  const b = await body(c);
  if (!b) return c.json({ error: 'Forventet {subject?, object?, aliases?}' }, 400);
  const r = await edit63(u, id, b, now63());
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, item: publicPending63(r.item) });
});

/* ---------------- Motstrid ---------------- */

memoryApi63.get('/conflicts', (c) => {
  const u = c.get('user'), st = c.req.query('status') || 'open';
  if (!['open', 'resolved', 'all'].includes(st)) return c.json({ error: 'Ukjent status (open, resolved, all)' }, 400);
  return c.json({ items: conflictRows63(u, st).map(publicConflict63), counts: conflictCounts63(u), enabled: mem63(u).conflicts }, 200, NS);
});
memoryApi63.post('/conflicts/:id/resolve', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!CID63.test(id)) return c.json({ error: 'Fant ikke motstriden' }, 404);
  const b = await body(c);
  const r = await resolve63(u, id, b?.choice, now63());
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, item: publicConflict63(r.item) });
});

/* ---------------- Ikke brukt på lenge ---------------- */

memoryApi63.get('/stale', (c) => {
  const u = c.get('user'), on = mem63(u).stale, days = staleDays63(u);
  return c.json({ items: on ? staleOf63(u, days, now63()) : [], staleDays: days, enabled: on }, 200, NS);
});
memoryApi63.post('/stale/:id/keep', (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!/^\d{1,12}$/.test(id) || !getMemory(u, id)) return c.json({ error: 'Fant ikke' }, 404);
  const at = now63();
  keepFact63(u, id, at);
  return c.json({ ok: true, id: Number(id), keptAt: iso63(at) });
});

/* ---------------- Innstillinger og «kjør nå» ---------------- */

memoryApi63.get('/hygiene', async (c) => c.json(await hygieneOut(c.get('user')), 200, NS));
memoryApi63.put('/hygiene', async (c) => {
  const u = c.get('user');
  const r = saveMem63(u, await body(c), { admin: isAdmin(u) });
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(await hygieneOut(u));
});
memoryApi63.post('/hygiene/run-now', async (c) => {
  const u = c.get('user');
  const run = await nightly63(u, { now: now63(), trigger: 'run-now' });
  return c.json({ ok: run.status !== 'failed', run });
});
