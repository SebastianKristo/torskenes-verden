// Prompt 61 (prompt 49 del 1, D1SRV): /api/glimt/recipes – innsyn i «Glimt lærer». Se $S/SERVER61-API.md.
//   GET / · GET /stats · GET|PUT /settings · POST /feedback · GET /:id · PATCH /:id · DELETE /:id · POST /:id/test
// Alt per bruker (sesjon eller app-token).
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { runAsUser } from '../settings.js';
import { db } from '../db.js';
import { recipes61, serverRecipes61, userRecipes61, saveRecipes61, anyOn61, LABELS61, HELP61 } from './settings.js';
import { T61, STATUS61, rowOf61, rowsOf61, publicRecipe61, publicRun61, publicNegative61, parse61, log61 } from './store.js';
import { slotsOf61, templateOf61, fillPlan61, sim61, varsIn61, readable61, READ_TOOLS61, VARS61 } from './template.js';
import { vote61 } from './engine61.js';
import { learnedCount61 } from './learn.js';
import { TOOL45 } from '../glimt45/tools.js';
import { INTENTS47, INTENT_TOOLS47 } from '../glimt45/plan47.js';
import { todayOslo45, nowMinOslo45 } from '../glimt45/dates.js';

export const recipesApi61 = new Hono();
recipesApi61.use('*', authOrToken);
const q = (sql) => db.prepare(sql);
const RID = /^r[0-9a-f]{14}$/;
const TID = /^t[0-9a-f]{18}$/;
const settingsOut = (u) => ({ settings: recipes61(u), server: serverRecipes61(), user: userRecipes61(u), admin: isAdmin(u), labels: LABELS61, help: HELP61, thresholds: { ...T61 } });
const ORDER = { active: 0, candidate: 1, disabled: 2 };

recipesApi61.get('/', (c) => {
  const u = c.get('user');
  const st = c.req.query('status') || null;
  if (st && !STATUS61.includes(st)) return c.json({ error: `Ukjent status (${STATUS61.join(', ')})` }, 400);
  const qy = String(c.req.query('q') ?? '').trim().toLowerCase().slice(0, 80);
  const all = rowsOf61(u);
  const counts = { candidate: 0, active: 0, disabled: 0, total: all.length };
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const items = all.filter((r) => (!st || r.status === st) && (!qy || r.example_query.toLowerCase().includes(qy) || r.query_template.toLowerCase().includes(qy)))
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || (b.last_used_at ?? b.created_at) - (a.last_used_at ?? a.created_at)).map((r) => publicRecipe61(r));
  return c.json({ items, counts, settings: recipes61(u), enabled: anyOn61(recipes61(u)) }, 200, { 'Cache-Control': 'no-store' });
});

recipesApi61.get('/settings', (c) => c.json(settingsOut(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
recipesApi61.put('/settings', async (c) => {
  const u = c.get('user');
  const r = saveRecipes61(u, await c.req.json().catch(() => null), { admin: isAdmin(u) });
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(settingsOut(u));
});

recipesApi61.get('/stats', (c) => {
  const u = c.get('user');
  const all = rowsOf61(u);
  const since = Date.now() - 30 * 86400_000;
  const runs = q("SELECT state, use FROM recipe_runs WHERE user_id=? AND created>=? AND state IN ('pending','success','fail')").all(u, since);
  const first = q('SELECT MIN(created_at) FROM recipes WHERE user_id=?').pluck().get(u);
  const by = (f) => runs.filter(f).length;
  return c.json({
    recipes: { total: all.length, active: all.filter((r) => r.status === 'active').length, candidate: all.filter((r) => r.status === 'candidate').length, disabled: all.filter((r) => r.status === 'disabled').length },
    runs: { total: runs.length, success: by((r) => r.state === 'success'), fail: by((r) => r.state === 'fail'), pending: by((r) => r.state === 'pending'), fast: by((r) => r.use === 'fast'), fewshot: by((r) => r.use === 'fewshot') },
    fastShare: runs.length ? Math.round((by((r) => r.use === 'fast') / runs.length) * 100) / 100 : 0,
    corrections: q("SELECT COUNT(*) FROM recipes WHERE user_id=? AND source='correction'").pluck().get(u),
    negatives: q('SELECT COUNT(*) FROM recipe_negatives WHERE user_id=?').pluck().get(u),
    learnedCases: learnedCount61(),
    since: first ? new Date(first).toISOString() : null,
  }, 200, { 'Cache-Control': 'no-store' });
});

recipesApi61.post('/feedback', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {traceId, vote}' }, 400);
  if (typeof b.traceId !== 'string' || !TID.test(b.traceId)) return c.json({ error: 'Ugyldig traceId' }, 400);
  if (b.vote !== 'up' && b.vote !== 'down' && b.vote !== null) return c.json({ error: "vote må være 'up', 'down' eller null" }, 400);
  const r = await vote61(u, b.traceId, b.vote);
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, vote: r.vote, recipe: r.recipe ? publicRecipe61(r.recipe) : null, run: r.run });
});

recipesApi61.get('/:id', (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const row = RID.test(id) ? rowOf61(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppskriften' }, 404);
  const runs = q('SELECT * FROM recipe_runs WHERE recipe_id=? AND user_id=? ORDER BY created DESC LIMIT 20').all(id, u).map(publicRun61);
  const negs = q('SELECT * FROM recipe_negatives WHERE recipe_id=? AND user_id=? ORDER BY created DESC').all(id, u).map(publicNegative61);
  return c.json({ item: publicRecipe61(row), runs, negatives: negs }, 200, { 'Cache-Control': 'no-store' });
});

/** Validerer en redigert plan. → {calls} | {error} */
function checkPlan(plan, intent) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.calls)) return { error: 'plan må være {calls:[{tool, args}]}' };
  if (!plan.calls.length || plan.calls.length > 6) return { error: 'Planen må ha 1–6 kall' };
  const calls = [];
  for (const x of plan.calls) {
    if (!x || typeof x !== 'object' || typeof x.tool !== 'string' || !TOOL45[x.tool]) return { error: `Ukjent verktøy: ${String(x?.tool ?? '').slice(0, 40)}` };
    if (x.args != null && (typeof x.args !== 'object' || Array.isArray(x.args))) return { error: `args for ${x.tool} må være et objekt` };
    if (intent && INTENT_TOOLS47[intent] && !INTENT_TOOLS47[intent].includes(x.tool)) return { error: `${x.tool} hører ikke til intenten ${intent}` };
    calls.push({ tool: x.tool, args: x.args ?? {} });
  }
  if (JSON.stringify(calls).length > 4000) return { error: 'Planen er for lang' };
  const bad = varsIn61({ calls }).filter((v) => !VARS61.includes(v));
  if (bad.length) return { error: `Ukjent variabel: ${bad.map((v) => `{${v}}`).join(', ')} (bruk {person}, {person.aliases}, {place}, {when})` };
  return { calls };
}
recipesApi61.patch('/:id', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const row = RID.test(id) ? rowOf61(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppskriften' }, 404);
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {status?, queryTemplate?, plan?, allowFastWrite?, exampleQuery?}' }, 400);
  const set = {}, now = Date.now();
  let edited = false;
  if (b.status !== undefined) {
    if (!STATUS61.includes(b.status)) return c.json({ error: `Ukjent status (${STATUS61.join(', ')})` }, 400);
    set.status = b.status;
    if (b.status === 'disabled') set.disabled_reason = 'Slått av av deg';
    else { set.disabled_reason = null; if (row.status === 'disabled') set.consecutive_fails = 0; }
  }
  if (b.queryTemplate !== undefined) {
    const t = typeof b.queryTemplate === 'string' ? b.queryTemplate.replace(/\s+/g, ' ').trim() : '';
    if (t.length < 3 || t.length > 200) return c.json({ error: 'Malen må være 3–200 tegn' }, 400);
    const bad = varsIn61(t).filter((v) => !VARS61.includes(v));
    if (bad.length) return c.json({ error: `Ukjent variabel: ${bad.map((v) => `{${v}}`).join(', ')} (bruk {person}, {place}, {when})` }, 400);
    set.query_template = templateOf61(t); edited = true;
  }
  if (b.exampleQuery !== undefined) {
    const t = typeof b.exampleQuery === 'string' ? b.exampleQuery.replace(/\s+/g, ' ').trim() : '';
    if (t.length < 3 || t.length > 1000) return c.json({ error: 'Eksemplet må være 3–1000 tegn' }, 400);
    set.example_query = t; set.embedding = null; set.embed_model = null; edited = true;
  }
  if (b.plan !== undefined) {
    const p = checkPlan(b.plan, row.intent);
    if (p.error) return c.json({ error: p.error }, 400);
    set.plan = JSON.stringify({ calls: p.calls });
    set.plan_key = createHash('sha256').update(`${row.intent ?? ''}|${JSON.stringify(p.calls)}`).digest('hex').slice(0, 24);
    edited = true;
  }
  if (b.allowFastWrite !== undefined) {
    if (typeof b.allowFastWrite !== 'boolean') return c.json({ error: 'allowFastWrite må være true eller false' }, 400);
    set.allow_fast_write = b.allowFastWrite ? 1 : 0;
  }
  if (edited) set.source = 'edited';
  if (!Object.keys(set).length) return c.json({ ok: true, item: publicRecipe61(row) });
  set.updated_at = now;
  const keys = Object.keys(set);
  q(`UPDATE recipes SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=? AND user_id=?`).run(...keys.map((k) => set[k]), id, u);
  if (set.status && set.status !== row.status) log61(u, { kind: set.status === 'disabled' ? 'slått av' : set.status, recipeId: id, reason: 'endret av brukeren' });
  return c.json({ ok: true, item: publicRecipe61(rowOf61(u, id)) });
});

recipesApi61.delete('/:id', (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const row = RID.test(id) ? rowOf61(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppskriften' }, 404);
  db.transaction(() => {
    q('DELETE FROM recipes WHERE id=? AND user_id=?').run(id, u);
    q('DELETE FROM recipe_runs WHERE recipe_id=? AND user_id=?').run(id, u);
    q('DELETE FROM recipe_negatives WHERE recipe_id=? AND user_id=?').run(id, u);
  })();
  log61(u, { kind: 'slettet', recipeId: id });
  return c.json({ ok: true, removed: true });
});

// Test: fyll ut og valider; bare lesende verktøy kjøres. Endrer aldri data og telles ikke som bruk.
recipesApi61.post('/:id/test', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const row = RID.test(id) ? rowOf61(u, id) : null;
  if (!row) return c.json({ error: 'Fant ikke oppskriften' }, 404);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const text = typeof b.text === 'string' && b.text.trim() ? b.text.replace(/\s+/g, ' ').trim() : row.example_query;
  if (text.length > 1000) return c.json({ error: 'Teksten er for lang (maks 1000 tegn)' }, 400);
  const t0 = Date.now();
  const out = await runAsUser(u, async () => {
    const { recallFacts47 } = await import('../glimt45/memory47.js');
    const { facts60 } = await import('../convo60/engine60.js');
    const { convo60 } = await import('../convo60/settings.js');
    const today = todayOslo45(), nowMin = nowMinOslo45();
    let facts = await recallFacts47(u, text, { embed: false }).catch(() => []);
    facts = facts60(u, { set: convo60(u), execText: text, entities: [] }, facts);
    const slots = slotsOf61(text, { facts, today });
    const plan = parse61(row.plan, { calls: [] });
    const vars = [...new Set([...varsIn61(row.query_template), ...varsIn61(plan)])];
    const tmpl = templateOf61(text, slots, vars);
    const similarity = sim61(tmpl, row.query_template);
    const fill = fillPlan61(plan, slots);
    const ctx = { user: u, text, today, nowMin, context: {}, module: row.module ?? 'home', preview: false, facts, webSearch: true, fast: null, onEvent: null, signal: null, c60: null };
    const steps = [];
    let ok = !fill.missing.length;
    if (ok) {
      for (const call of fill.calls) {
        const tool = TOOL45[call.tool];
        let v;
        try { v = await tool.validate(call.args ?? {}, ctx); } catch (e) { v = { error: String(e?.message ?? e).slice(0, 200) }; }
        if (v.ask || v.error) { ok = false; steps.push({ tool: call.tool, ok: false, ran: false, status: v.ask ? 'ask' : 'failed', summary: v.ask?.question ?? null, error: v.error ?? null }); continue; }
        if (!READ_TOOLS61.has(call.tool) || tool.destructive) { steps.push({ tool: call.tool, ok: true, ran: false, status: 'proposed', summary: v.summary ?? 'Ikke kjørt i test (endrer data)', error: null }); continue; }
        if (call.tool === 'chat.answer' || call.tool === 'app.answer') { steps.push({ tool: call.tool, ok: true, ran: false, status: 'proposed', summary: 'Ikke kjørt i test (svarformulering)', error: null }); continue; }
        let r;
        try { r = await tool.run(v.args, ctx); } catch (e) { r = { status: 'failed', error: String(e?.message ?? e).slice(0, 200) }; }
        const n = r.result?.count ?? (Array.isArray(r.cards) ? r.cards.length : null);
        const first = r.cards?.[0];
        if (r.status !== 'done') ok = false;
        steps.push({ tool: call.tool, ok: r.status === 'done', ran: true, status: r.status, summary: r.status === 'done' ? (n != null ? `${n} treff${first ? `: ${first.title}${first.subtitle ? ` ${first.subtitle}` : ''}` : ''}` : 'OK') : null, error: r.status === 'done' ? null : (r.error ?? 'feilet') });
      }
    }
    return { ok, text, similarity, templateMatch: similarity >= T61.fastSimilarity, slots: Object.fromEntries(Object.entries(slots).filter(([k]) => vars.includes(k) || (k === 'person' && vars.includes('person.aliases'))).map(([k, v]) => [k, v.value])),
      missing: fill.missing, plan: { calls: fill.calls }, readable: readable61(fill.calls), steps, fast: publicRecipe61(row).fast };
  });
  return c.json({ ...out, ms: Date.now() - t0 });
});

export { INTENTS47 };
