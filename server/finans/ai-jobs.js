// Prompt 25: lange AI-kall (✦ AI-søk) som jobb. Klienten får 202 {jobId} når svaret tar mer enn ca. 4 s, og følger med på
// GET /finans/api/jobs/:id (poll) eller /jobs/:id/events (SSE). DELETE /jobs/:id avbryter. Jobbene ligger bare i minnet,
// tilhører brukeren som startet dem (andre får 404) og ryddes 10 min etter at de er ferdige.
import { randomUUID } from 'node:crypto';
import { providerName } from './ai.js';

const jobs = new Map();
const KEEP_MS = 10 * 60_000;
export const MAX_RUNNING_PER_USER = 5;
// Tester kan korte ned tiden før 202 (standard 4 s).
export const _jobTest = { afterMs: 4000 };

const secs = (ms) => Math.max(0, Math.floor(ms / 1000));

/** Offentlig visning av jobben (aldri AbortController eller lyttere). */
export function jobView(j) {
  const now = j.finishedAt ?? Date.now();
  const elapsedS = j.engineAt ? secs(now - j.engineAt) : secs(now - j.startedAt);
  let text;
  if (j.status === 'running' && j.progress?.msg) text = j.progress.msg;
  else if (j.status === 'running') text = j.engine ? `✦ ${providerName(j.engine)} tenker … ${elapsedS} s av ${j.limitS} s` : '✦ Søker …';
  else if (j.status === 'done') text = '✦ Ferdig';
  else if (j.status === 'cancelled') text = 'Avbrutt';
  else text = j.error ?? 'AI-søket feilet';
  return {
    id: j.id, jobId: j.id, kind: j.kind, status: j.status, engine: j.engine, engineName: j.engine ? providerName(j.engine) : null,
    elapsedS, totalS: secs(now - j.startedAt), limitS: j.limitS, text, notice: j.notice ?? null,
    ...(j.status === 'done' ? { result: j.result } : {}), ...(j.status === 'error' ? { error: j.error, ...(j.kode ? { kode: j.kode, code: j.kode, httpStatus: j.httpStatus ?? null, melding: j.melding ?? null } : {}) } : {}), // prompt 50: feilkoden
    // Prompt 39: fremdrift for «✦ På nytt» (kvitteringer): {step:'upload'|'ocr'|'llm'|'verify'|'done'|'error', pct, msg}.
    ...(j.progress ? { step: j.progress.step, pct: j.progress.pct, msg: j.progress.msg, ...(j.progress.receiptId ? { receiptId: j.progress.receiptId } : {}) } : {}),
  };
}

const emit = (j) => { const v = jobView(j); for (const fn of j.subs) { try { fn(v); } catch { /* lytteren er borte */ } } };
const finish = (j, patch) => {
  if (j.status !== 'running') return;
  Object.assign(j, patch, { finishedAt: Date.now() });
  const v = jobView(j);
  console.info(`[ai-jobb] ${j.id} status=${j.status} engine=${j.engine ?? '-'} limit_s=${j.limitS ?? '-'} elapsed_s=${((j.finishedAt - j.startedAt) / 1000).toFixed(1)} layer=worker`);
  emit(j);
  j.subs.clear();
  setTimeout(() => jobs.delete(j.id), KEEP_MS).unref?.();
  return v;
};

export const runningFor = (uid) => [...jobs.values()].filter((j) => j.uid === uid && j.status === 'running').length;

/**
 * Starter run({ signal, onEngine, status }) som jobb for brukeren uid. Svarer { job, promise }, der promise løses når jobben er ferdig
 * (aldri avvist). onEngine(engine, limitS) settes når en ny motor starter; status(text) er siste melding (f.eks. tidsavbrudd).
 */
export function startJob(uid, kind, run) {
  const j = { id: randomUUID(), uid, kind, status: 'running', engine: null, limitS: null, engineAt: null, startedAt: Date.now(), finishedAt: null,
    notice: null, result: null, error: null, ctrl: new AbortController(), subs: new Set() };
  jobs.set(j.id, j);
  const onEngine = (engine, limitS) => { Object.assign(j, { engine, limitS, engineAt: Date.now() }); emit(j); };
  const status = (text) => { j.notice = String(text ?? '').slice(0, 300) || null; emit(j); };
  const progress = (p) => { j.progress = { ...(j.progress ?? {}), ...p }; emit(j); };
  const promise = Promise.resolve()
    .then(() => run({ signal: j.ctrl.signal, onEngine, status, progress, job: j }))
    .then((result) => finish(j, { status: 'done', result }), (e) => {
      if (j.ctrl.signal.aborted || e?.cancelled) return finish(j, { status: 'cancelled' });
      console.error('[ai-jobb]', e);
      return finish(j, { status: 'error', error: e?.message ?? String(e), kode: e?.kode ?? null, httpStatus: e?.httpStatus ?? null, melding: e?.melding ?? null });
    })
    .then(() => j);
  return { job: j, promise };
}

/** Jobben hvis den finnes og tilhører brukeren. */
export const getJob = (uid, id) => { const j = jobs.get(String(id ?? '')); return j && j.uid === uid ? j : null; };

export function cancelJob(uid, id) {
  const j = getJob(uid, id);
  if (!j) return null;
  if (j.status === 'running') { j.ctrl.abort(); finish(j, { status: 'cancelled' }); }
  return jobView(j);
}

/** Lytter på endringer. Svarer en funksjon som slutter å lytte. */
export function subscribe(j, fn) { j.subs.add(fn); return () => j.subs.delete(fn); }

export const _resetJobs = () => { for (const j of jobs.values()) j.ctrl.abort(); jobs.clear(); };
