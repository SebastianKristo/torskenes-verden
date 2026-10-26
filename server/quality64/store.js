// Prompt 64 (prompt 49 del 7, D7SRV): lagring for «kvalitet over tid».
//   quality64_runs      – én rad per nattlig eval-kjøring (status, sammendrag, regresjoner); rapportene (md/json) som filer i
//                         DATA_DIR/quality64/reports/<id>.{md,json} – aldri i repoet – med rotasjon (keepDays, standard 30)
//   baseline.json       – sammenligningsgrunnlaget per case (DATA_DIR/quality64/baseline.json)
//   quality64_requests  – ett lite sammendrag per Glimt-forespørsel (fra sporene i glimt47_trace, som bare lever i 3 dager) til ukerapporten
// Additiv migrering: tabellene opprettes hvis de mangler.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS quality64_runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'schedule', user_id TEXT, data TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS quality64_runs_started ON quality64_runs(started_at);
CREATE TABLE IF NOT EXISTS quality64_requests (trace_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at INTEGER NOT NULL, ms INTEGER, module TEXT, intent TEXT,
  ok INTEGER NOT NULL DEFAULT 1, asked INTEGER NOT NULL DEFAULT 0, fast INTEGER NOT NULL DEFAULT 0, cache INTEGER NOT NULL DEFAULT 0,
  correction_of TEXT, correction_kind TEXT);
CREATE INDEX IF NOT EXISTS quality64_requests_user ON quality64_requests(user_id, at);`);

export const RID64 = /^q[0-9a-f]{14}$/;
export const newRunId64 = () => `q${randomBytes(7).toString('hex')}`;
export const iso64 = (ms) => (ms == null ? null : new Date(ms).toISOString());
const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
const DAY = 86400_000;

export const qualityDir64 = () => join(config.dataDir, 'quality64');
export const reportsDir64 = () => join(qualityDir64(), 'reports');
export const reportPath64 = (id, ext) => join(reportsDir64(), `${id}.${ext}`);
const baselinePath = () => join(qualityDir64(), 'baseline.json');

/* ---------------- Kjøringer ---------------- */

export function insertRun64({ id = newRunId64(), startedAt, status = 'running', trigger = 'schedule', user = null, data = {} }) {
  q('INSERT INTO quality64_runs(id, started_at, finished_at, status, trigger, user_id, data) VALUES(?,?,?,?,?,?,?)').run(id, startedAt, null, status, trigger, user, JSON.stringify(data));
  return id;
}
export function updateRun64(id, { status, finishedAt, data }) {
  const cur = q('SELECT * FROM quality64_runs WHERE id=?').get(id);
  if (!cur) return null;
  const merged = { ...J(cur.data, {}), ...(data ?? {}) };
  q('UPDATE quality64_runs SET status=?, finished_at=?, data=? WHERE id=?').run(status ?? cur.status, finishedAt !== undefined ? finishedAt : cur.finished_at, JSON.stringify(merged), id);
  return q('SELECT * FROM quality64_runs WHERE id=?').get(id);
}
export const runRow64 = (id) => (RID64.test(String(id ?? '')) ? q('SELECT * FROM quality64_runs WHERE id=?').get(id) ?? null : null);
export const runRows64 = (limit = 30) => q('SELECT * FROM quality64_runs ORDER BY started_at DESC, rowid DESC LIMIT ?').all(Math.max(1, Math.min(100, limit)));
export const runsBetween64 = (from, to) => q('SELECT * FROM quality64_runs WHERE started_at>=? AND started_at<? ORDER BY started_at').all(from, to);

/** Raden → API-formen Run (SERVER64-API.md §1). progress kommer fra den levende kjøringen (evalrun.js). */
export function publicRun64(row, { progress = null } = {}) {
  if (!row) return null;
  const d = J(row.data, {});
  return {
    id: row.id, status: row.status, trigger: row.trigger, startedAt: iso64(row.started_at), finishedAt: iso64(row.finished_at),
    ms: row.finished_at != null ? row.finished_at - row.started_at : null, reason: d.reason ?? null,
    backend: d.backend ?? 'ollama', url: d.url ?? null, model: d.model ?? null, commit: d.commit ?? null, runsPerCase: d.runsPerCase ?? null,
    progress: row.status === 'running' ? (progress ?? d.progress ?? null) : null,
    passed: d.passed ?? null, total: d.total ?? null, greenCases: d.greenCases ?? null, cases: d.cases ?? null, modelFailures: d.modelFailures ?? null, envFailures: d.envFailures ?? null,
    p50Ms: d.p50Ms ?? null, p90Ms: d.p90Ms ?? null, replyP50Ms: d.replyP50Ms ?? null, replyP90Ms: d.replyP90Ms ?? null,
    regressions: d.regressions ?? [], improved: d.improved ?? [], newCases: d.newCases ?? 0, baselineRunId: d.baselineRunId ?? null, notified: !!d.notified,
    report: { md: existsSync(reportPath64(row.id, 'md')), json: existsSync(reportPath64(row.id, 'json')) },
  };
}

/** Flytter eval-resultatet (json + md fra run.mjs) inn i rapportmappa. → {json, md} (stier eller null) */
export function storeReport64(id, { jsonFile = null, mdFile = null } = {}) {
  mkdirSync(reportsDir64(), { recursive: true });
  const out = { json: null, md: null };
  for (const [k, f] of [['json', jsonFile], ['md', mdFile]]) {
    if (!f || !existsSync(f)) continue;
    const to = reportPath64(id, k);
    try { renameSync(f, to); } catch { writeFileSync(to, readFileSync(f)); }
    out[k] = to;
  }
  return out;
}
export function readReport64(id, ext) {
  try { return readFileSync(reportPath64(id, ext), 'utf8'); } catch { return null; }
}

/** Rotasjon: rader og rapportfiler eldre enn keepDays (også filer uten rad). → antall slettede kjøringer */
export function rotate64(keepDays, now = Date.now()) {
  const cut = now - keepDays * DAY;
  const old = q("SELECT id FROM quality64_runs WHERE started_at < ? AND status != 'running'").pluck().all(cut);
  for (const id of old) for (const ext of ['md', 'json']) { try { rmSync(reportPath64(id, ext), { force: true }); } catch { /* */ } }
  q("DELETE FROM quality64_runs WHERE started_at < ? AND status != 'running'").run(cut);
  try {
    const keep = new Set(q('SELECT id FROM quality64_runs').pluck().all());
    for (const f of readdirSync(reportsDir64())) {
      const id = f.replace(/\.(md|json)$/, '');
      const p = join(reportsDir64(), f);
      if (!keep.has(id) && statSync(p).mtimeMs < cut) rmSync(p, { force: true });
    }
  } catch { /* ingen mappe */ }
  try { q('DELETE FROM quality64_requests WHERE at < ?').run(now - 400 * DAY); } catch { /* */ }
  return old.length;
}

/* ---------------- Grunnlaget ---------------- */

/** → {cases:{[id]:{passes, runs, envRuns, at, runId, title}}, runId, at} */
export function baseline64() {
  try { const b = JSON.parse(readFileSync(baselinePath(), 'utf8')); if (b && typeof b.cases === 'object') return b; } catch { /* */ }
  return { cases: {}, runId: null, at: null };
}
export function saveBaseline64(b) {
  mkdirSync(qualityDir64(), { recursive: true });
  const tmp = `${baselinePath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(b, null, 2));
  renameSync(tmp, baselinePath());
}

/* ---------------- Forespørsler (til ukerapporten) ---------------- */

export function insertRequest64(r) {
  return q(`INSERT OR IGNORE INTO quality64_requests(trace_id, user_id, at, ms, module, intent, ok, asked, fast, cache, correction_of, correction_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(r.traceId, r.user, r.at, r.ms ?? null, r.module ?? null, r.intent ?? null, r.ok ? 1 : 0, r.asked ? 1 : 0, r.fast ? 1 : 0, r.cache ? 1 : 0, r.correctionOf ?? null, r.correctionKind ?? null).changes;
}
export const requestsBetween64 = (user, from, to) => (user == null
  ? q('SELECT * FROM quality64_requests WHERE at>=? AND at<? ORDER BY at').all(from, to)
  : q('SELECT * FROM quality64_requests WHERE user_id=? AND at>=? AND at<? ORDER BY at').all(user, from, to));
