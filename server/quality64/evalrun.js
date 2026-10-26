// Prompt 64 (prompt 49 del 7, D7SRV): den nattlige evalen. Kjører eval-riggen (eval/run.mjs, også de lærte testene fra rettelser) som
// barneprosess mot Ollama-adressen serveren allerede bruker. Riggen gir hver case sin egen DATA_DIR – produksjonsbasen leses bare for
// modellrutingen (skrivebeskyttet). Mens den går:
//   - AI-køen holder andre bakgrunnsjobber (holdGate) – nattevalen er bakgrunnsarbeid og skal ikke kappes med dem,
//   - venter/kjører en interaktiv forespørsel lenger enn interactiveWaitSec, avbrytes evalen (Glimt skal ikke bli treg),
//   - tidsgrense maxMinutes, og hoppes over hvis Ollama ikke svarer.
// Etterpå: rapportene (md/json) til DATA_DIR/quality64/reports, sammenligning mot grunnlaget (compare.js), push til admin bare ved
// regresjon, rotasjon (keepDays). Miljøfeil (status «env» fra riggen: ingen OCR, modell ikke installert, andre modeller lastet) er ikke røde.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { OWNER } from '../db.js';
import { gateState, holdGate } from '../ai-gate.js';
import { serverQuality64 } from './settings.js';
import { insertRun64, updateRun64, runRow64, publicRun64, storeReport64, rotate64, baseline64, saveBaseline64, qualityDir64, newRunId64 } from './store.js';
import { compare64 } from './compare.js';
import { pushRegression64 } from './notify64.js';

export const REPO64 = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RUN_MJS64 = join(REPO64, 'eval', 'run.mjs');
export const T64 = { watchMs: 2000, pingMs: 5000, killGraceMs: 5000, caseTimeoutSec: 600 };

let live = null; // {id, progress, abort(reason), done: Promise}
let clock = null, pingImpl = null, gateImpl = null, runnerImpl = null, urlImpl = null, argsImpl = null;
/** Bare for tester. */
export const _setEval64 = ({ clock: c, ping, gate, runner, url, args } = {}) => {
  if (c !== undefined) clock = c; if (ping !== undefined) pingImpl = ping; if (gate !== undefined) gateImpl = gate;
  if (runner !== undefined) runnerImpl = runner; if (url !== undefined) urlImpl = url; if (args !== undefined) argsImpl = args;
};
const now64 = () => clock ?? Date.now();
export const liveRun64 = () => (live ? publicRun64(runRow64(live.id), { progress: live.progress }) : null);
export const isRunning64 = () => !!live;
/** Bare for tester: vent til kjøringen er ferdig. */
export const _waitEval64 = () => live?.done ?? lastDone;
let lastDone = Promise.resolve(null);

const mask = (s) => String(s ?? '').replace(/(sk-)[A-Za-z0-9_\-.]{4,}/g, '$1••••').replace(/\/\/[^/@]+@/, '//••••@');
/** Ollama-adressen appen bruker (AI-kontroll), ellers $OLLAMA_URL. */
export async function ollamaUrl64() {
  if (urlImpl !== null) return typeof urlImpl === 'function' ? urlImpl() : urlImpl;
  try { const { settings } = await import('../finans/db.js'); const u = String(settings(OWNER).ollamaUrl || '').replace(/\/+$/, ''); if (u) return u; } catch { /* */ }
  return String(process.env.OLLAMA_URL || '').replace(/\/+$/, '');
}
async function ping(url) {
  if (pingImpl) return pingImpl(url);
  try { const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(T64.pingMs) }); return r.ok; } catch { return false; }
}
/** Mappene med lærte testtilfeller (repoets eval/learned og DATA_DIR/eval-learned) som finnes og har filer. */
async function learnedDirs() {
  const dirs = [join(REPO64, 'eval', 'learned'), join(config.dataDir, 'eval-learned')];
  try { const { learnedDir61 } = await import('../recipes61/learn.js'); dirs.unshift(learnedDir61()); } catch { /* */ }
  return [...new Set(dirs.map((d) => resolve(d)))].filter((d) => { try { return readdirSync(d).some((f) => f.endsWith('.json')); } catch { return false; } });
}

/** Standard: node eval/run.mjs som egen prosessgruppe (så også workerne kan stoppes). → Promise {code, signal, log} */
function spawnRunner({ args, env, signal, onLine }) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [RUN_MJS64, ...args], { cwd: REPO64, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', tail = [];
    const feed = (d) => {
      buf += d; const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { if (!l.trim()) continue; tail.push(l); if (tail.length > 80) tail = tail.slice(-60); try { onLine?.(l); } catch { /* */ } }
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const kill = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* */ } } };
    const onAbort = () => { kill('SIGTERM'); setTimeout(() => kill('SIGKILL'), T64.killGraceMs).unref?.(); };
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { tail.push(String(e?.message ?? e)); });
    child.on('exit', (code, sig) => { signal.removeEventListener?.('abort', onAbort); if (buf.trim()) tail.push(buf); res({ code, signal: sig, log: tail.slice(-40) }); });
  });
}

/** Ser etter interaktive forespørsler som venter (eller kjører) for lenge. → grunn | null */
function interactiveWait(state, seen, waitMs, t) {
  for (const r of state?.running ?? []) {
    if (r.priority !== 'interactive' || r.internal || r.kind === 'unload') continue;
    if ((r.ms ?? 0) > waitMs) return Math.round(r.ms / 1000);
  }
  const waiting = new Set();
  for (const g of state?.waiting ?? []) {
    if (!(g.interactive > 0)) continue;
    waiting.add(g.model);
    if (!seen.has(g.model)) seen.set(g.model, t);
    if (t - seen.get(g.model) > waitMs) return Math.round((t - seen.get(g.model)) / 1000);
  }
  for (const m of [...seen.keys()]) if (!waiting.has(m)) seen.delete(m);
  return null;
}

/**
 * Starter en kjøring. o = {trigger:'schedule'|'run-now', user, runs}. Returnerer når kjøringen er startet (eller hoppet over);
 * selve evalen går i bakgrunnen. → {run} | {error, status, run}
 */
export async function startEval64({ trigger = 'schedule', user = null, runs = null } = {}) {
  if (live) return { error: 'Nattlig eval kjører allerede', status: 409, run: liveRun64() };
  const set = serverQuality64();
  const runsPerCase = Math.max(1, Math.min(5, Number.isInteger(runs) ? runs : set.runs));
  const extra = argsImpl ?? {};
  const backend = extra.backend ?? 'ollama';
  const t0 = now64();
  const url = backend === 'mock' ? null : await ollamaUrl64();
  const id = newRunId64();
  insertRun64({ id, startedAt: t0, trigger, user, data: { backend, url: url ? mask(url) : null, runsPerCase } });
  const skip = (reason) => { updateRun64(id, { status: 'skipped', finishedAt: now64(), data: { reason } }); return { run: publicRun64(runRow64(id)) }; };
  if (!runnerImpl && !existsSync(RUN_MJS64)) return skip('Eval-riggen (eval/run.mjs) finnes ikke i denne installasjonen');
  if (backend !== 'mock') {
    if (!url) return skip('Ingen Ollama-adresse er satt (AI-kontroll → Tilkobling)');
    if (!(await ping(url))) return skip(`Ollama svarte ikke på ${mask(url)} – hoppet over`);
  }
  if (live) return skip('En annen kjøring startet samtidig');

  const tmp = join(qualityDir64(), 'tmp', id), outDir = join(tmp, 'out');
  mkdirSync(outDir, { recursive: true });
  const dirs = await learnedDirs();
  const args = ['--backend', backend, ...(url ? ['--url', url] : []), '--runs', String(runsPerCase), '--out', outDir, '--timeout', String(extra.caseTimeoutSec ?? T64.caseTimeoutSec),
    '--learned', dirs.length ? dirs.join(',') : 'off', ...(extra.cases ? ['--case', String(extra.cases)] : [])];
  const env = { ...process.env, DATA_DIR: config.dataDir, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
  delete env.NODE_ENV; // eval-riggen styrer selv miljøet til workerne
  const ac = new AbortController();
  let abortReason = null;
  const progress = { done: 0, total: null, current: null };
  const release = holdGate(); // AI-køen: andre bakgrunnsjobber venter mens evalen går
  const seen = new Map();
  const waitMs = set.interactiveWaitSec * 1000, maxMs = set.maxMinutes * 60_000, startedReal = Date.now();
  const abort = (reason) => { if (ac.signal.aborted) return; abortReason = reason; ac.abort(); };
  const watch = setInterval(() => {
    const t = now64();
    if (Date.now() - startedReal > maxMs) return abort(`Tidsgrensen på ${set.maxMinutes} min ble nådd`);
    let st = null;
    try { st = gateImpl ? gateImpl() : gateState(); } catch { /* */ }
    const s = interactiveWait(st, seen, waitMs, t);
    if (s != null) abort(`En interaktiv forespørsel ventet i ${s} s – nattevalen ga plass`);
  }, T64.watchMs);
  const onLine = (l) => {
    const h = /(\d+) kjøring\(er\) × (\d+) caser/.exec(l);
    if (h) progress.total = +h[1] * +h[2];
    const m = /^\s*(OK|FEIL|ENV|RIGG)\s+(\S+) #(\d+)/.exec(l);
    if (m) { progress.done++; progress.current = m[2]; }
  };
  const runner = runnerImpl ?? spawnRunner;
  live = { id, progress, abort };
  updateRun64(id, { data: { progress } });
  live.done = (async () => {
    let res = null;
    try { res = await runner({ args, env, signal: ac.signal, onLine, outDir }); }
    catch (e) { res = { code: -1, log: [String(e?.message ?? e)] }; }
    finally { clearInterval(watch); release(); }
    try { return await finish64(id, { res, outDir, aborted: ac.signal.aborted ? abortReason ?? 'Avbrutt' : null, progress }); }
    catch (e) { updateRun64(id, { status: 'failed', finishedAt: now64(), data: { reason: String(e?.message ?? e).slice(0, 300) } }); return publicRun64(runRow64(id)); }
    finally {
      live = null;
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    }
  })();
  lastDone = live.done;
  return { run: publicRun64(runRow64(id), { progress }) };
}

/** Admin trykket «Avbryt». */
export function abortEval64(reason = 'Avbrutt av administrator') {
  if (!live) return false;
  live.abort(reason);
  return true;
}

/** Leser resultatet, sammenligner, lagrer og varsler. → Run (API-form) */
async function finish64(id, { res, outDir, aborted, progress }) {
  const t = now64();
  if (aborted) {
    updateRun64(id, { status: 'aborted', finishedAt: t, data: { reason: aborted, progress: { ...progress } } });
    rotate64(serverQuality64().keepDays, t);
    return publicRun64(runRow64(id));
  }
  let files = [];
  try { files = readdirSync(outDir).filter((f) => f.endsWith('.json')).map((f) => join(outDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs); } catch { /* */ }
  if (!files.length) {
    const lastLine = (res?.log ?? []).filter((l) => l.trim()).slice(-1)[0] ?? '';
    const status = res?.code === 3 ? 'skipped' : 'failed';
    const reason = res?.code === 3 ? `Eval fikk ikke kontakt med modellen: ${lastLine.slice(0, 200)}` : `Eval avsluttet uten resultat (kode ${res?.code ?? '?'}${res?.signal ? `, ${res.signal}` : ''})${lastLine ? `: ${lastLine.slice(0, 200)}` : ''}`;
    updateRun64(id, { status, finishedAt: t, data: { reason, log: (res?.log ?? []).slice(-20) } });
    return publicRun64(runRow64(id));
  }
  const jsonFile = files[0];
  const result = JSON.parse(readFileSync(jsonFile, 'utf8'));
  const mdFile = jsonFile.replace(/\.json$/, '.md');
  storeReport64(id, { jsonFile, mdFile });
  const base = baseline64();
  const cmp = compare64(result.cases ?? [], base, { runId: id, at: new Date(t).toISOString() });
  saveBaseline64(cmp.next);
  const s = result.summary ?? {};
  const rigg = (result.cases ?? []).reduce((a, c) => a + (c.riggErrors ?? 0), 0);
  const model = result.meta?.routing?.effective?.glimt ?? result.cases?.find((c) => c.models?.length)?.models?.[0] ?? null;
  const data = {
    passed: s.passed ?? null, total: s.total ?? null, greenCases: s.greenCases ?? null, cases: s.cases ?? (result.cases ?? []).length, modelFailures: s.modelFailures ?? null, envFailures: s.envFailures ?? 0,
    p50Ms: s.p50Ms ?? null, p90Ms: s.p90Ms ?? null, replyP50Ms: s.replyP50Ms ?? null, replyP90Ms: s.replyP90Ms ?? null,
    regressions: cmp.regressions, improved: cmp.improved, newCases: cmp.newCases, baselineRunId: base.runId ?? null, perCase: cmp.perCase,
    commit: result.meta?.commit ?? null, model, progress: null,
    reason: rigg ? `Riggfeil i ${rigg} kjøring(er) – se rapporten` : null,
  };
  const status = cmp.regressions.length ? 'regression' : 'ok';
  updateRun64(id, { status, finishedAt: t, data });
  if (cmp.regressions.length) {
    const p = await pushRegression64({ id }, cmp.regressions, t);
    updateRun64(id, { data: { notified: p.sent } });
  }
  rotate64(serverQuality64().keepDays, t);
  return publicRun64(runRow64(id));
}
