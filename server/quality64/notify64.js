// Prompt 64 (prompt 49 del 7, D7SRV): push for «kvalitet over tid» – regresjon i nattevalen (til admin) og ukerapporten (per bruker).
// Lenkene er konstanter her (SERVER64-API.md §4).
import { db } from '../db.js';

export const PUSH_URL64 = Object.freeze({
  run: (id) => `/#/innstillinger/kvalitet/run/${id}`,
  week: (w) => `/#/innstillinger/kvalitet/uke/${w}`,
  deepRun: (id) => `finanshub://kvalitet/run/${id}`,
  deepWeek: (w) => `finanshub://kvalitet/uke/${w}`,
});

let notifyImpl = null;
/** Bare for tester: falsk levering (user, msg) → {pushed}. */
export const _setNotify64 = (fn) => { notifyImpl = fn ?? null; };
export async function push64(user, msg, now = Date.now()) {
  try { return notifyImpl ? await notifyImpl(user, msg) : await (await import('../notify.js')).notifyUser(user, msg, { now }); }
  catch (e) { return { error: String(e?.message ?? e).slice(0, 160) }; }
}
export const adminUsers64 = () => { try { return db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created").pluck().all(); } catch { return []; } };

/** Regresjonsvarselet: hvilken case, kort grunn, lenke til rapporten. → {sent, results} */
export async function pushRegression64(run, regressions, now = Date.now()) {
  const n = regressions.length;
  const first = regressions[0];
  const title = `Glimt-eval: ${n} ${n === 1 ? 'case har' : 'caser har'} blitt rød${n === 1 ? '' : 'e'}`;
  const lines = regressions.slice(0, 3).map((r) => `${r.caseId} ${r.before} → ${r.now}${r.reason ? `: ${r.reason.slice(0, 90)}` : ''}`);
  const body = `${lines.join('\n')}${n > 3 ? `\n… og ${n - 3} til` : ''}`;
  const msg = { title, body, url: PUSH_URL64.run(run.id), tag: 'quality64', category: 'system',
    data: { kind: 'quality.regression', runId: run.id, cases: regressions.map((r) => r.caseId), deepLink: PUSH_URL64.deepRun(run.id), first: first?.caseId ?? null } };
  const results = [];
  for (const u of adminUsers64()) results.push(await push64(u, msg, now));
  return { sent: results.some((r) => r && !r.error), results, msg };
}
