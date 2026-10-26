// Prompt 61 (prompt 49 del 1, D1SRV): lagring av oppskrifter (tabell `recipes`), kjøringer (`recipe_runs`) og negative eksempler
// (`recipe_negatives`). Additiv migrering: tabellene opprettes hvis de mangler, og kolonner som mangler legges til (aldri endret/slettet).
// Alt er per bruker og bare lokalt (SQLite); ingenting sendes noe sted.
import { randomBytes } from 'node:crypto';
import { db, kv } from '../db.js';
import { readable61, readableSteps61, varsIn61, writes61 } from './template.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, fail_count INTEGER NOT NULL DEFAULT 0,
  example_query TEXT NOT NULL, query_template TEXT NOT NULL, intent TEXT, plan TEXT NOT NULL, slots TEXT NOT NULL DEFAULT '{}', embedding BLOB,
  status TEXT NOT NULL DEFAULT 'candidate');
CREATE INDEX IF NOT EXISTS recipes_user ON recipes(user_id, status);
CREATE TABLE IF NOT EXISTS recipe_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, recipe_id TEXT, trace_id TEXT, created INTEGER NOT NULL,
  conv_id TEXT, text TEXT NOT NULL, template TEXT, slots TEXT, intent TEXT, plan TEXT, use TEXT NOT NULL DEFAULT 'none', similarity REAL,
  state TEXT NOT NULL DEFAULT 'pending', reason TEXT, msgs_after INTEGER NOT NULL DEFAULT 0, vote TEXT, finished INTEGER, reply TEXT, confirm_token TEXT);
CREATE INDEX IF NOT EXISTS recipe_runs_user ON recipe_runs(user_id, created);
CREATE INDEX IF NOT EXISTS recipe_runs_recipe ON recipe_runs(recipe_id, created);
CREATE INDEX IF NOT EXISTS recipe_runs_trace ON recipe_runs(trace_id);
CREATE TABLE IF NOT EXISTS recipe_negatives (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, recipe_id TEXT, created INTEGER NOT NULL, query TEXT NOT NULL,
  template TEXT NOT NULL, embedding BLOB, embed_model TEXT, wrong_plan TEXT NOT NULL, right_plan TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS recipe_negatives_user ON recipe_negatives(user_id, created);`);
// Tilleggskolonner (additivt, så eldre/kommende versjoner av tabellen virker).
{
  const cols = q('PRAGMA table_info(recipes)').all().map((c) => c.name);
  for (const [c, t] of [['embed_model', 'TEXT'], ['module', 'TEXT'], ['plan_key', 'TEXT'], ['allow_fast_write', 'INTEGER NOT NULL DEFAULT 0'], ['consecutive_fails', 'INTEGER NOT NULL DEFAULT 0'],
    ['source', "TEXT NOT NULL DEFAULT 'learned'"], ['disabled_reason', 'TEXT'], ['updated_at', 'INTEGER']]) if (!cols.includes(c)) db.exec(`ALTER TABLE recipes ADD COLUMN ${c} ${t}`);
}
try { q("DELETE FROM recipe_runs WHERE created < ? AND state != 'pending'").run(Date.now() - 90 * 86400_000); } catch { /* */ }

export const STATUS61 = ['candidate', 'active', 'disabled'];
export const T61 = Object.freeze({ fastSimilarity: 0.92, fastMinSuccess: 5, activeAfter: 2, disableAfterFails: 2, windowMessages: 2, windowMinutes: 5, fewshotMax: 3, fewshotTokens: 600 });
export const MAX_RECIPES61 = 300;
const J = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
export const newId61 = (p) => `${p}${randomBytes(7).toString('hex')}`;
export const toBlob61 = (v) => (v ? Buffer.from(new Float32Array(v).buffer) : null);
export const fromBlob61 = (b) => (b ? Array.from(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4))) : null);

/* ---------------- Oppskrifter ---------------- */

export const rowOf61 = (user, id) => q('SELECT * FROM recipes WHERE id=? AND user_id=?').get(String(id ?? ''), user) ?? null;
export const rowsOf61 = (user) => q('SELECT * FROM recipes WHERE user_id=? ORDER BY COALESCE(last_used_at, created_at) DESC').all(user);

/** De siste 10 kjøringene for en oppskrift. → {success, fail, pending} */
export function last10Of61(recipeId) {
  const rows = q("SELECT state FROM recipe_runs WHERE recipe_id=? AND state IN ('pending','success','fail') ORDER BY created DESC LIMIT 10").all(recipeId);
  return { success: rows.filter((r) => r.state === 'success').length, fail: rows.filter((r) => r.state === 'fail').length, pending: rows.filter((r) => r.state === 'pending').length };
}
/** Kan oppskriften gå hurtigveien (uavhengig av meldingen)? → {eligible, reasons:[norsk tekst]} */
export function fastOf61(row, l10 = last10Of61(row.id)) {
  const reasons = [];
  if (row.status !== 'active') reasons.push(row.status === 'disabled' ? 'Oppskriften er slått av' : 'Oppskriften er ikke aktiv ennå');
  if (row.success_count < T61.fastMinSuccess) reasons.push(`Trenger minst ${T61.fastMinSuccess} vellykkede bruk (har ${row.success_count})`);
  if (l10.fail > 0) reasons.push(`Har ${l10.fail} feil blant de siste 10`);
  const plan = J(row.plan, { calls: [] });
  if (writes61(plan.calls) && !row.allow_fast_write) reasons.push('Endrer data – hurtigvei er av for denne oppskriften');
  return { eligible: !reasons.length, reasons };
}
/** Raden → API-formen (SERVER61-API.md §2). */
export function publicRecipe61(row, { l10 = null, negatives = null } = {}) {
  const plan = J(row.plan, { calls: [] });
  const slots = J(row.slots, {});
  const last10 = l10 ?? last10Of61(row.id);
  return {
    id: row.id, status: row.status, createdAt: new Date(row.created_at).toISOString(), lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    useCount: row.use_count, successCount: row.success_count, failCount: row.fail_count, last10, consecutiveFails: row.consecutive_fails ?? 0,
    exampleQuery: row.example_query, queryTemplate: row.query_template, intent: row.intent ?? null, module: row.module ?? null,
    plan: { calls: plan.calls ?? [] }, slots, variables: [...new Set([...varsIn61(row.query_template), ...varsIn61(plan)])],
    readable: readable61(plan.calls), readableSteps: readableSteps61(plan.calls), writes: writes61(plan.calls), allowFastWrite: !!row.allow_fast_write,
    fast: fastOf61(row, last10), hasEmbedding: !!row.embedding, source: row.source ?? 'learned', disabledReason: row.disabled_reason ?? null,
    negatives: negatives ?? q('SELECT COUNT(*) FROM recipe_negatives WHERE recipe_id=?').pluck().get(row.id),
  };
}

export function insertRecipe61(user, r) {
  const n = q('SELECT COUNT(*) FROM recipes WHERE user_id=?').pluck().get(user);
  // Tak per bruker: de eldste ubrukte kandidatene ryddes først (aktive og avslåtte står til brukeren sletter dem).
  if (n >= MAX_RECIPES61) q("DELETE FROM recipes WHERE id IN (SELECT id FROM recipes WHERE user_id=? AND status='candidate' ORDER BY COALESCE(last_used_at, created_at) ASC LIMIT ?)").run(user, n - MAX_RECIPES61 + 1);
  const id = newId61('r');
  const now = Date.now();
  q(`INSERT INTO recipes(id, user_id, created_at, last_used_at, use_count, success_count, fail_count, example_query, query_template, intent, plan, slots, embedding, status,
    embed_model, module, plan_key, allow_fast_write, consecutive_fails, source, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user, now, r.lastUsedAt ?? null, r.useCount ?? 0, 0, 0, String(r.exampleQuery).slice(0, 1000), String(r.queryTemplate).slice(0, 400), r.intent ?? null, JSON.stringify({ calls: r.calls }),
      JSON.stringify(r.slots ?? {}), r.embedding ?? null, r.status ?? 'candidate', r.embedModel ?? null, r.module ?? null, r.planKey ?? null, r.allowFastWrite ? 1 : 0, 0, r.source ?? 'learned', now);
  return rowOf61(user, id);
}

/* ---------------- Logg (av/på-endringer, avslåtte) ---------------- */

const LOG = 'recipes61_log';
export function log61(user, line) {
  console.log(`[recipes61] ${line.kind}${line.recipeId ? ` ${line.recipeId}` : ''}${line.reason ? ` – ${line.reason}` : ''}`);
  try { kv.set(user, LOG, [{ at: Date.now(), ...line }, ...(kv.get(user, LOG, []) ?? [])].slice(0, 100)); } catch { /* */ }
}
export const logOf61 = (user) => kv.get(user, LOG, []) ?? [];

/* ---------------- Utfall ---------------- */

/** Oppskriften fikk et vellykket utfall: telles, kandidat → aktiv etter 2 (eller med en gang ved tommel opp). */
export function recipeSuccess61(user, recipeId, { vote = false } = {}) {
  const row = rowOf61(user, recipeId);
  if (!row) return null;
  const succ = row.success_count + 1;
  let status = row.status;
  if (status === 'candidate' && (vote || succ >= T61.activeAfter)) { status = 'active'; log61(user, { kind: 'aktiv', recipeId, reason: vote ? 'tommel opp' : `${succ} vellykkede bruk` }); }
  q('UPDATE recipes SET success_count=?, consecutive_fails=0, status=?, updated_at=? WHERE id=?').run(succ, status, Date.now(), recipeId);
  return rowOf61(user, recipeId);
}
/** Oppskriften feilet: aktiv oppskrift som feiler 2 ganger på rad → avslått og logget. */
export function recipeFail61(user, recipeId, reason = 'feil') {
  const row = rowOf61(user, recipeId);
  if (!row) return null;
  const cf = (row.consecutive_fails ?? 0) + 1;
  let status = row.status, why = row.disabled_reason;
  if (status === 'active' && cf >= T61.disableAfterFails) { status = 'disabled'; why = `Feilet ${cf} ganger på rad`; log61(user, { kind: 'slått av', recipeId, reason: `${why} (sist: ${reason})` }); }
  q('UPDATE recipes SET fail_count=fail_count+1, consecutive_fails=?, status=?, disabled_reason=?, updated_at=? WHERE id=?').run(cf, status, why ?? null, Date.now(), recipeId);
  return rowOf61(user, recipeId);
}

/* ---------------- Kjøringer ---------------- */

export function insertRun61(user, r) {
  const id = newId61('k');
  q(`INSERT INTO recipe_runs(id, user_id, recipe_id, trace_id, created, conv_id, text, template, slots, intent, plan, use, similarity, state, reason, reply, confirm_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user, r.recipeId ?? null, r.traceId ?? null, Date.now(), r.convId ?? null, String(r.text ?? '').slice(0, 1000), r.template ?? null, JSON.stringify(r.slots ?? {}), r.intent ?? null,
      r.calls ? JSON.stringify({ calls: r.calls }) : null, r.use ?? 'none', r.similarity ?? null, r.state ?? 'pending', r.reason ?? null, String(r.reply ?? '').slice(0, 400), r.confirmToken ?? null);
  if (r.recipeId) q('UPDATE recipes SET use_count=use_count+1, last_used_at=?, updated_at=? WHERE id=?').run(Date.now(), Date.now(), r.recipeId);
  return id;
}
export const runByConfirm61 = (user, token) => q("SELECT * FROM recipe_runs WHERE confirm_token=? AND user_id=? AND state='confirm'").get(String(token ?? ''), user) ?? null;
export const runOf61 = (user, id) => q('SELECT * FROM recipe_runs WHERE id=? AND user_id=?').get(id, user) ?? null;
export const runByTrace61 = (user, traceId) => q('SELECT * FROM recipe_runs WHERE trace_id=? AND user_id=? ORDER BY created DESC LIMIT 1').get(String(traceId ?? ''), user) ?? null;
export const pendingRuns61 = (user) => q("SELECT * FROM recipe_runs WHERE user_id=? AND state='pending' ORDER BY created ASC").all(user);
/** Avslutt en kjøring (bare fra pending, eller endring etter tommel). → raden etterpå */
export function finishRun61(user, run, state, reason = null) {
  q('UPDATE recipe_runs SET state=?, reason=?, finished=? WHERE id=?').run(state, reason, Date.now(), run.id);
  if (run.recipe_id && run.state === 'pending') {
    if (state === 'success') recipeSuccess61(user, run.recipe_id);
    else if (state === 'fail') recipeFail61(user, run.recipe_id, reason ?? 'feil');
  }
  return runOf61(user, run.id);
}
export const publicRun61 = (r) => ({ id: r.id, at: new Date(r.created).toISOString(), text: r.text, use: r.use, state: r.state === 'confirm' ? 'pending' : r.state, reason: r.reason ?? null, similarity: r.similarity ?? null, traceId: r.trace_id ?? null, vote: r.vote ?? null });

/* ---------------- Negative eksempler ---------------- */

export function insertNegative61(user, n) {
  const id = newId61('n');
  q('INSERT INTO recipe_negatives(id, user_id, recipe_id, created, query, template, embedding, embed_model, wrong_plan, right_plan, reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, user, n.recipeId ?? null, Date.now(), String(n.query).slice(0, 1000), String(n.template ?? '').slice(0, 400), n.embedding ?? null, n.embedModel ?? null,
      JSON.stringify({ calls: n.wrongCalls ?? [] }), n.rightCalls ? JSON.stringify({ calls: n.rightCalls }) : null, n.reason ?? null);
  // Maks 100 per bruker (de eldste ut).
  q('DELETE FROM recipe_negatives WHERE user_id=? AND id NOT IN (SELECT id FROM recipe_negatives WHERE user_id=? ORDER BY created DESC LIMIT 100)').run(user, user);
  return id;
}
export const negativesOf61 = (user) => q('SELECT * FROM recipe_negatives WHERE user_id=? ORDER BY created DESC').all(user);
export function publicNegative61(n) {
  const w = J(n.wrong_plan, { calls: [] }), r = n.right_plan ? J(n.right_plan, { calls: [] }) : null;
  return { id: n.id, at: new Date(n.created).toISOString(), recipeId: n.recipe_id ?? null, query: n.query, wrongPlan: w, rightPlan: r, readableWrong: readable61(w.calls), readableRight: r ? readable61(r.calls) : null };
}
export const parse61 = J;
