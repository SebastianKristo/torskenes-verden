// Én planlegger for bakgrunnsjobber (Fase 2, AUDIT A §6 B2).
//
// Moduler registrerer jobbene sine når de lastes (registerJob), men ingenting kjører før index.js kaller startJobs(). Den
// starter bare når bakgrunnsjobber er lov: ikke i test (NODE_ENV=test) og ikke i sandkassen (OPS51_SANDBOX=1, testet
// gjenoppretting og staging mot en kopi av databasen). Da sendes ingen varsler, ingen backup tas og ingen eksterne kilder hentes.
//
// Jobbene her har sideeffekter (backup, varsler, henting utenfra). Rene minneopprydninger kan fortsatt bruke egen setInterval.

const jobs = new Map(); // navn → {name, everyMs, firstRunAfterMs, run, note, timer, first, runs, lastRun, lastError, running}
let started = false;

/** Er bakgrunnsjobber lov i denne prosessen? Samme regel som BG51 i index.js. */
export const jobsAllowed = (env = process.env) => env.NODE_ENV !== 'test' && env.OPS51_SANDBOX !== '1';

/**
 * Registrerer en jobb. run() kan være async; feil logges og stopper ikke planleggeren. Samme navn to ganger erstatter den første
 * (f.eks. ved hot reload). Starter jobben med én gang hvis planleggeren allerede går.
 *
 * Første kjøring skjer etter everyMs, som med setInterval. firstRunAfterMs gir en annen første kjøring (f.eks. 5 min etter
 * oppstart for en jobb som ellers går hver 6. time, eller 0 for «med en gang»). everyMs: null med firstRunAfterMs = én kjøring
 * etter oppstart (oppvarming, opprydding etter omstart), som ikke gjentas.
 */
export function registerJob(name, everyMs, run, { note = '', firstRunAfterMs = null } = {}) {
  const once = everyMs == null;
  const delayOk = firstRunAfterMs == null ? !once : Number.isFinite(firstRunAfterMs) && firstRunAfterMs >= 0;
  if (typeof run !== 'function' || !delayOk || (!once && !(everyMs > 0))) {
    throw new TypeError(`registerJob(${name}): trenger everyMs > 0 (eller null med firstRunAfterMs ≥ 0) og en funksjon`);
  }
  const old = jobs.get(name);
  if (old) unschedule(old);
  const job = { name, everyMs: once ? null : everyMs, firstRunAfterMs, run, note, timer: null, first: null, runs: 0, lastRun: null, lastError: null, running: false };
  jobs.set(name, job);
  if (started) schedule(job);
  return job;
}

async function tick(job) {
  if (job.running) return; // forrige runde er ikke ferdig
  job.running = true;
  try { await job.run(); job.lastError = null; } catch (e) { job.lastError = String(e?.message ?? e).slice(0, 200); console.warn(`[jobber] ${job.name}:`, job.lastError); } finally { job.running = false; job.runs++; job.lastRun = Date.now(); }
}
function repeat(job) {
  if (job.everyMs == null) return;
  job.timer = setInterval(() => { tick(job); }, job.everyMs);
  job.timer.unref?.();
}
function schedule(job) {
  if (job.firstRunAfterMs == null) { repeat(job); return; }
  job.first = setTimeout(() => { job.first = null; repeat(job); tick(job); }, job.firstRunAfterMs);
  job.first.unref?.();
}
function unschedule(job) {
  if (job.timer) clearInterval(job.timer);
  if (job.first) clearTimeout(job.first);
  job.timer = null; job.first = null;
}

/** Starter alle registrerte jobber (én gang), når det er lov. → antall startet */
export function startJobs(env = process.env) {
  if (started || !jobsAllowed(env)) return 0;
  started = true;
  for (const job of jobs.values()) schedule(job);
  return jobs.size;
}

/** Stopper alle (tester og ryddig nedstenging). */
export function stopJobs() {
  for (const job of jobs.values()) unschedule(job);
  started = false;
}

/** Kjører én jobb nå (tester og diagnostikk), også når planleggeren ikke går. */
export const runJobNow = async (name) => { const j = jobs.get(name); if (!j) throw new Error(`Ukjent jobb: ${name}`); await tick(j); return j.lastError === null; };

/** Oversikt for admin/diagnostikk. */
export const listJobs = () => [...jobs.values()].map((j) => ({ name: j.name, everyMs: j.everyMs, note: j.note, active: !!(j.timer || j.first), runs: j.runs, lastRun: j.lastRun, lastRunAt: j.lastRun ? new Date(j.lastRun).toISOString() : null, lastError: j.lastError }));
export const jobsStarted = () => started;
