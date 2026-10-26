// Prompt 62 (prompt 49 del 2, D2SRV): egen scheduler for planlagte oppgaver. Jobbene ligger i databasen (glimt_schedules.next_run_at),
// så den overlever omstart. Tikk hvert minutt (ikke i NODE_ENV=test – testene kaller tick62(now) med fryst klokke).
//   - Forhåndsberegning: query/power-oppgaver beregnes opptil 15 min før (bakgrunnsprioritet), leveres på minuttet.
//   - Tapte kjøringer (serveren var nede): kjøres ÉN gang hvis < 2 t siden, eldre logges som «missed» og hoppes over.
//   - Stille timer 23–07 for oppgaver uten eget klokkeslett (store.nextOf62 flytter til 07:00).
//   - Neste kjøring settes FØR kjøringen (sammenlign-og-bytt på next_run_at), så en jobb aldri kjøres to ganger.
//   - Enkeltkjøringer og regler med passert sluttdato blir «ended».
import { db } from '../db.js';
import { nextOf62, rowOf62, updateSchedule62, ruleOfRow62 } from './store.js';
import { runOnce62, logSkip62, compute62 } from './run.js';
import { sched62, serverSched62 } from './settings.js';
import { nextRun62, osloParts62 } from '../glimt45/dates.js';

export const T62 = Object.freeze({ tickMs: 60_000, prepMs: 15 * 60_000, missMs: 2 * 3600_000, retryMs: 30 * 60_000, retryUntilHour: 21, staleMs: 30 * 60_000, maxMissLogs: 10 });
const q = (sql) => db.prepare(sql);
const prepared = new Map(); // id → {plannedAt, out, at}
const running = new Set();
let clock = null;
/** Bare for tester: fast «nå» (ms) eller null. */
export const _setClock62 = (ms) => { clock = ms ?? null; };
export const now62 = () => clock ?? Date.now();
export const _prepared62 = () => prepared;

/** Neste kjøring etter t for raden (stille timer etter innstillingen). null → ferdig. */
const nextFor = (row, t) => nextOf62(row, t, { quiet: sched62(row.user_id).quiet });

/** Kjører én forfalt oppgave. → {ran, run?, missed} */
async function due(row, now) {
  const planned = row.next_run_at;
  const missed = [];
  let runAt = planned;
  // Tapte kjøringer: alle forekomster fra planned til nå; den siste innenfor 2 t kjøres, eldre logges.
  if (now - planned > T62.missMs) {
    let t = planned;
    runAt = null;
    for (let i = 0; i < 400 && t != null && t <= now; i++) {
      if (now - t <= T62.missMs) { runAt = t; break; }
      if (missed.length < T62.maxMissLogs) missed.push(t);
      t = nextFor(row, t);
    }
  }
  const next = row.retry_of != null && runAt === planned ? nextFor(row, row.retry_of) : nextFor(row, Math.max(now, runAt ?? now));
  const next2 = next != null && next <= now ? nextFor(row, now) : next;
  // Sammenlign-og-bytt: bare én tikk tar jobben.
  const ch = q("UPDATE glimt_schedules SET next_run_at=?, last_planned_at=?, retry_of=NULL, status=CASE WHEN ? IS NULL AND ? THEN 'ended' ELSE status END, updated_at=? WHERE id=? AND next_run_at=? AND status='active'")
    .run(next2, runAt ?? planned, next2, runAt == null ? 1 : 0, now, row.id, planned).changes;
  if (!ch) return { ran: false, missed: 0 };
  for (const t of missed) logSkip62(row, { plannedAt: t, status: 'missed', reason: 'Over 2 timer for sent (serveren var nede) – hoppet over', now });
  if (runAt == null) return { ran: false, missed: missed.length };
  if (!sched62(row.user_id).enabled) { logSkip62(row, { plannedAt: runAt, status: 'skipped', reason: 'Planlagte oppgaver er slått av', now }); finishState(row.id, next2, now); return { ran: false, missed: missed.length }; }
  running.add(row.id);
  try {
    const r = await runOnce62(row, { plannedAt: runAt, trigger: now - runAt > 2 * 60_000 ? 'catchup' : 'schedule', now, prepared: prepared.get(row.id) ?? null });
    prepared.delete(row.id);
    q('UPDATE glimt_schedules SET last_run_at=? WHERE id=?').run(now, row.id);
    // Morgendagens priser ikke publisert ennå (eller værdata mangler): nytt forsøk om 30 min, til kl. 21.
    if (r.retry && osloParts62(now + T62.retryMs).h < T62.retryUntilHour && osloParts62(now + T62.retryMs).date === osloParts62(now).date) {
      const at = now + T62.retryMs;
      if (next2 == null || at < next2) q("UPDATE glimt_schedules SET next_run_at=?, retry_of=?, status='active' WHERE id=?").run(at, runAt, row.id);
    } else finishState(row.id, next2, now);
    return { ran: true, run: r.run, missed: missed.length };
  } finally { running.delete(row.id); }
}
function finishState(id, next, now) { if (next == null) q("UPDATE glimt_schedules SET status='ended', next_run_at=NULL, updated_at=? WHERE id=? AND status='active'").run(now, id); }

/** Forhåndsberegner en oppgave som forfaller innen 15 min (bare power/query uten betingelse). */
async function prepare(row, now) {
  const p = prepared.get(row.id);
  if (p && p.plannedAt === row.next_run_at) return false;
  if (row.condition || row.kind === 'reminder' || !sched62(row.user_id).enabled) return false;
  prepared.set(row.id, { plannedAt: row.next_run_at, out: { status: 'pending' }, at: now });
  const out = await compute62(row, { now });
  prepared.set(row.id, { plannedAt: row.next_run_at, out, at: now });
  return true;
}

let ticking = false;
/** Ett tikk. → {due, ran, prepared, missed} */
export async function tick62(now = now62()) {
  if (ticking) return { busy: true };
  ticking = true;
  const out = { due: 0, ran: 0, prepared: 0, missed: 0, runs: [] };
  try {
    // Kjøringer som sto som «running» ved omstart: avbrutt.
    q("UPDATE glimt_schedule_runs SET status='failed', error='Avbrutt (serveren startet på nytt)', finished_at=? WHERE status='running' AND started_at < ?").run(now, now - T62.staleMs);
    if (!serverSched62().enabled) return out;
    const rows = q("SELECT * FROM glimt_schedules WHERE status='active' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT 50").all(now + T62.prepMs);
    for (const row of rows) {
      if (running.has(row.id)) continue;
      try {
        if (row.next_run_at <= now) {
          out.due++;
          const r = await due(row, now);
          if (r.ran) { out.ran++; out.runs.push(r.run); }
          out.missed += r.missed;
        } else if (await prepare(row, now)) out.prepared++;
      } catch (e) { console.warn('[sched62]', row.id, String(e?.message ?? e).slice(0, 200)); }
    }
  } finally { ticking = false; }
  return out;
}

/** «Kjør nå» (API): kjører med en gang, ignorerer stille timer, endrer ikke planen. */
export async function runNow62(user, id, now = now62()) {
  const row = rowOf62(user, id);
  if (!row) return { error: 'Fant ikke oppgaven', status: 404 };
  if (running.has(id)) return { error: 'Kjører allerede', status: 409 };
  running.add(id);
  try {
    const r = await runOnce62(row, { plannedAt: now, trigger: 'run-now', now });
    q('UPDATE glimt_schedules SET last_run_at=? WHERE id=?').run(now, id);
    return { run: r.run };
  } finally { running.delete(id); }
}

/** Ny plan for raden etter endring (når, status). → next_run_at | null */
export function replan62(row, now = now62()) {
  if (row.status !== 'active') return null;
  return ruleOfRow62(row) ? nextFor(row, now) : null;
}

let timer = null;
/** Starter tikket (index.js). Første tikk etter 20 s (tapte kjøringer etter omstart). */
export function startScheduler62() {
  if (timer || process.env.NODE_ENV === 'test') return false;
  const run = () => { tick62().catch((e) => console.warn('[sched62] tikk:', String(e?.message ?? e).slice(0, 200))); };
  setTimeout(run, 20_000).unref?.();
  timer = setInterval(run, T62.tickMs);
  timer.unref?.();
  return true;
}
export { nextRun62 };
