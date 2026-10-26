// Prompt 64 (prompt 49 del 7, D7SRV): /api/glimt/quality – kvalitet over tid. Se $S/SERVER64-API.md.
// Eval (kjøringer, rapporter, «Kjør nå», Avbryt, serverbrytere) er bare for admin (serverinfrastruktur). Ukerapporten er per bruker.
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { quality64, serverQuality64, userQuality64, saveQuality64, LABELS64, HELP64 } from './settings.js';
import { runRow64, runRows64, publicRun64, readReport64, RID64, iso64 } from './store.js';
import { startEval64, abortEval64, liveRun64 } from './evalrun.js';
import { weekly64, weekOf64, WEEK64 } from './weekly.js';
import { ensureSystem64, systemRow64, qualityRow64 } from './system.js';

export const qualityApi64 = new Hono();
qualityApi64.use('*', authOrToken);
const NS = { 'Cache-Control': 'no-store' };
let clock = null;
/** Bare for tester: fast «nå» (ms) eller null. */
export const _setClock64 = (ms) => { clock = ms ?? null; };
const now64 = () => clock ?? Date.now();
const adminOnly = (c) => (isAdmin(c.get('user')) ? null : c.json({ error: 'Bare administrator kan se og kjøre nattlig eval' }, 403));
const J = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const schedOut = (row) => (row ? { id: row.id, status: row.status, nextRunAt: row.status === 'active' ? iso64(row.next_run_at) : null } : null);

async function settingsOut(u) {
  await ensureSystem64(u, now64()).catch(() => {});
  const admin = isAdmin(u);
  return { settings: quality64(u), server: serverQuality64(), user: userQuality64(u), admin, labels: LABELS64, help: HELP64,
    schedules: { nightly: admin ? schedOut(qualityRow64()) : null, weekly: schedOut(systemRow64(u, 'weekly')) }, ...(admin ? { running: liveRun64() } : {}) };
}

/* ---------------- Eval (admin) ---------------- */

qualityApi64.get('/runs', (c) => {
  const no = adminOnly(c); if (no) return no;
  const lim = Math.max(1, Math.min(100, parseInt(c.req.query('limit') ?? '30', 10) || 30));
  const running = liveRun64();
  const items = runRows64(lim).map((r) => (running && r.id === running.id ? running : publicRun64(r)));
  return c.json({ items, running, enabled: serverQuality64().nightly, keepDays: serverQuality64().keepDays }, 200, NS);
});
qualityApi64.get('/runs/:id', (c) => {
  const no = adminOnly(c); if (no) return no;
  const id = c.req.param('id');
  const row = RID64.test(id) ? runRow64(id) : null;
  if (!row) return c.json({ error: 'Fant ikke kjøringen' }, 404);
  const fmt = c.req.query('format');
  if (fmt === 'md' || fmt === 'json') {
    const text = readReport64(id, fmt);
    if (text == null) return c.json({ error: 'Rapporten finnes ikke (kjøringen ble ikke fullført, eller den er rotert bort)' }, 404);
    return c.body(text, 200, { 'Content-Type': fmt === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `inline; filename="glimt-eval-${id}.${fmt}"`, ...NS });
  }
  if (fmt) return c.json({ error: 'format må være md eller json' }, 400);
  const live = liveRun64();
  const run = live && live.id === id ? live : publicRun64(row);
  const per = J(row.data, {}).perCase ?? {};
  const full = J(readReport64(id, 'json'), null);
  const cases = (full?.cases ?? []).map((x) => {
    const eff = Math.max(0, x.runs - (x.envRuns ?? 0));
    const r = (x.results ?? []).find((y) => !y.ok && y.status !== 'env') ?? (x.results ?? []).find((y) => !y.ok);
    return { id: x.id, title: x.title, area: x.area ?? null, intent: x.intent ?? x.intent59 ?? null, passes: x.passes, runs: x.runs, envRuns: x.envRuns ?? 0,
      status: !eff ? 'env' : x.passes >= eff ? 'green' : x.passes <= 0 ? 'red' : 'partial',
      p50Ms: x.p50Ms ?? null, p90Ms: x.p90Ms ?? null, replyMedianMs: x.replyMedianMs ?? null, replyP90Ms: x.replyP90Ms ?? null,
      reason: x.passes < x.runs && r ? String(r.reason ?? '').slice(0, 300) || null : null, envReasons: x.envReasons ?? [],
      baseline: per[x.id]?.baseline ?? null, regression: !!per[x.id]?.regression };
  });
  return c.json({ ...run, cases }, 200, NS);
});
qualityApi64.post('/run-now', async (c) => {
  const no = adminOnly(c); if (no) return no;
  const b = await c.req.json().catch(() => ({})) ?? {};
  if (b.runs !== undefined && (!Number.isInteger(b.runs) || b.runs < 1 || b.runs > 5)) return c.json({ error: 'runs må være et heltall 1–5' }, 400);
  const r = await startEval64({ trigger: 'run-now', user: c.get('user'), runs: b.runs ?? null });
  if (r.error) return c.json({ error: r.error, run: r.run }, r.status ?? 409);
  if (r.run.status !== 'running') return c.json({ ok: false, run: r.run }, 200);
  return c.json({ ok: true, run: r.run }, 202);
});
qualityApi64.post('/abort', (c) => {
  const no = adminOnly(c); if (no) return no;
  const run = liveRun64();
  if (!run || !abortEval64()) return c.json({ error: 'Ingen eval kjører nå' }, 409);
  return c.json({ ok: true, run });
});

/* ---------------- Ukerapport (per bruker) ---------------- */

qualityApi64.get('/weekly', (c) => {
  const u = c.get('user');
  const week = c.req.query('week') || weekOf64(now64());
  if (!WEEK64.test(week)) return c.json({ error: 'Ugyldig uke (forventet f.eks. 2026-W44)' }, 400);
  const out = weekly64(u, week, { admin: isAdmin(u), now: now64() });
  if (!out) return c.json({ error: 'Ugyldig uke' }, 400);
  return c.json(out, 200, NS);
});

/* ---------------- Innstillinger ---------------- */

qualityApi64.get('/settings', async (c) => c.json(await settingsOut(c.get('user')), 200, NS));
qualityApi64.put('/settings', async (c) => {
  const u = c.get('user');
  const r = saveQuality64(u, await c.req.json().catch(() => null), { admin: isAdmin(u) });
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(await settingsOut(u), 200, NS);
});
