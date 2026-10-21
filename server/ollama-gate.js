// Prompt 43: Én sentral Ollama-klient og kø («gaten»). ALLE kall til Ollama (/api/chat, /api/generate, /api/embed, innlasting og
// utlasting) går hit; kø-logikken finnes ikke andre steder.
//
// HVORFOR (den ekte feilen bak «Avbrutt etter 1–3 s» og qwen3/qwen2.5vl som feilet hos brukeren):
//   Mac mini M4 16 GB (~11,8 GB GPU), OLLAMA_NUM_PARALLEL=1, modellene på ekstern disk (2–40 s innlasting), og bare én av
//   qwen3:8b / qwen2.5vl:7b får plass i minnet. Før:
//   - Flere moduler kalte Ollama direkte og gikk utenom køen, og slot() slapp alle interaktive kall forbi (parallel = 2).
//   - ensureLoaded() sendte keep_alive:0 til de andre lastede modellene – også når de var midt i en forespørsel. Den
//     forespørselen ble brutt («Avbrutt etter 1–3 s»).
//   - Vanlige kall brukte stream:false med én total tidsgrense, som slo til midt i et svar som fortsatt ble skrevet.
//   - 400-minnet i ollamaPost() kunne «glemme» think:false, så qwen3 tenkte igjen og brukte opp num_predict.
//   Nå:
//   - Samtidighet: params.ollamaConcurrency (standard 1). Aldri to ulike modeller samtidig; bare samme modell kan kjøre parallelt.
//   - Gruppering per modell: alt som venter på modellen som er lastet nå, kjøres før vi bytter. Rettferdighet: venter andre
//     modeller, byttes det etter maks 6 jobber eller 90 s. Interaktive kall (Glimt/søk/chat/kalender) går foran bakgrunnsjobber,
//     og et interaktivt kall for en annen modell tas som neste etter jobben som kjører.
//   - Ingen tvungen utlasting av en modell som er i bruk. /api/ps (kort cache) viser hva som faktisk er lastet, også modeller
//     Open WebUI har lastet; en modell som ikke står der, regnes som kald.
//   - keep_alive per modell (params.modelKeepAlive). Modeller med 0 får kort keep_alive mens det står noe i kø for dem, og lastes
//     ut eksplisitt når køen for dem er tom – bare når ingen forespørsel mot dem pågår.
//   - Alltid strømming for /api/chat og /api/generate, med to tidsgrenser: tid til første token (kald modell: loadTimeout, 90 s;
//     varm: firstTokenTimeout, 30 s) og tid uten nye tokens (idleTimeout 30 s tekst / idleTimeoutImage 60 s bilde).
//   - think:false på alle korte kall for tenkemodeller; kan ikke slås av av 400-minnet.
//   - Nye forsøk (maks 2, 2 s og 8 s, bakerst i køen) ved forbigående feil; aldri ved vanlige 4xx eller når brukeren avbrøt.
//
// API:
//   gateChat({model, body, priority:'interactive'|'background', short=true, allowThink=false, image, signal, fetch, base,
//             loadMs, warmMs, idleMs, deadlineMs, onQueue, onStart, onChunk, onPhase, label, retries, retryTimeouts})
//     → {text, content, thinking, message, final, telemetry}
//   gateGenerate({...samme, body:{model, prompt, images?}}) · gateEmbed({model, input, ...}) → {embeddings, final, telemetry}
//   gateLoad(model, {keepAlive?, priority, ...}) → {telemetry, already} · gateUnload(model, {...}) → {ok}
//   loadedModels({base, fetch, force}) → [{name, size, size_vram, expires_at}] | null (/api/ps, cache 3 s)
//   once(key, fn) – single-flight: samme nøkkel mens den kjører gir samme promise.
//   gateState() → {current, running:[], waiting:[{model, n, oldestMs, interactive}], loaded:[], paused, hold, concurrency}
//   holdGate() → release · setGatePaused(v)
//   backend: 'ollama' (standard) | 'openwebui' (grensesnitt, ikke laget ennå) – se registerBackend(); køen er felles for alle backends.
//   telemetry = {queueMs, loadMs, promptMs, genMs, totalMs, tokIn, tokOut, thinkChars, attempts, model, keepAlive, cold}
//   GateError {kind:'load_timeout'|'idle_timeout'|'unloaded'|'http'|'nocontact'|'cancelled'|'memory', status?, ollamaError?, transient, telemetry}
import { settings as fhSettings } from './finans/db.js';
import { OWNER } from './db.js';
import { THINK_UNSUPPORTED, isThinkingModel, rememberNoThink, hasNoThink, stripThink, userWantsThink } from './ollama-opts.js';

/* ---------------- Innstillinger ---------------- */

export const DEFAULT_MODEL_KEEP_ALIVE = { 'llama3.2:3b': '1h', 'qwen3:8b': '15m', 'qwen2.5vl:7b': 0 };
export const GATE_DEFAULTS = { ollamaConcurrency: 1, keepAlive: '30m', loadTimeout: 90, firstTokenTimeout: 30, idleTimeout: 30, idleTimeoutImage: 60 };
export const GATE_FAIR = { maxJobs: 6, maxMs: 90_000 };
export const SHORT_KEEP = '2m'; // keep_alive mens det står noe i kø for en modell med keep_alive 0
export const EMBED_MS = 60_000;
/** Tester: kortere backoff og ps-cache. */
export const _gateTest = { backoffMs: [2000, 8000], psTtlMs: 3000, maxRetries: 2, unloadGraceMs: 1500 };

let paramsFn = () => ({});
/** ai-run.js kobler inn rutingen (params) her, så gaten ikke trenger å importere ai-run (sirkulært). */
export const configureGate = ({ params } = {}) => { if (typeof params === 'function') paramsFn = params; };
export function gateParams() {
  let p = {};
  try { p = paramsFn() ?? {}; } catch { /* standard */ }
  const out = { ...GATE_DEFAULTS };
  for (const k of Object.keys(GATE_DEFAULTS)) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  out.modelKeepAlive = p.modelKeepAlive && typeof p.modelKeepAlive === 'object' ? p.modelKeepAlive : DEFAULT_MODEL_KEEP_ALIVE;
  out.ollamaConcurrency = Math.max(1, Math.min(4, Math.round(+out.ollamaConcurrency) || 1));
  return out;
}
const sameModel = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;
/** Den konfigurerte keep_alive for modellen (map per modell, ellers params.keepAlive). */
export function keepAliveFor(model, p = gateParams()) {
  for (const [k, v] of Object.entries(p.modelKeepAlive ?? {})) if (sameModel(k, model) && v !== undefined && v !== null && v !== '') return v;
  return p.keepAlive ?? '30m';
}
const isZeroKeep = (v) => v === 0 || v === '0' || v === '0m' || v === '0s';

/* ---------------- Nett og klokke (injiserbart i tester) ---------------- */

let gateFetch = null;
/** Tester: én fetch for alle Ollama-kall via gaten (vinner over modulenes egne). null = tilbake til modulenes/global fetch. */
export const _setGateFetch = (fn) => { gateFetch = fn ?? null; psCache.clear(); };
const fetchOf = (f) => gateFetch ?? f ?? ((u, i) => globalThis.fetch(u, i));
const REAL_CLOCK = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) };
let clock = REAL_CLOCK;
export const _setGateClock = (c) => { clock = c ? { ...REAL_CLOCK, ...c } : REAL_CLOCK; };
const defaultBase = () => { try { return String(fhSettings(OWNER).ollamaUrl || '').replace(/\/+$/, ''); } catch { return ''; } };
const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) { rej(cancelErr()); return; }
  const t = clock.setTimeout(() => { signal?.removeEventListener?.('abort', on); res(); }, ms);
  const on = () => { clock.clearTimeout(t); rej(cancelErr()); };
  signal?.addEventListener?.('abort', on, { once: true });
});

/* ---------------- Feil ---------------- */

export class GateError extends Error {
  constructor(kind, message, extra = {}) { super(message); this.name = kind === 'load_timeout' || kind === 'idle_timeout' ? 'TimeoutError' : 'GateError'; this.kind = kind; Object.assign(this, extra); }
}
const cancelErr = () => new GateError('cancelled', 'Avbrutt av bruker', { cancelled: true, transient: false });
const MEMORY_RE = /requires more system memory|out of memory|cudaMalloc|insufficient memory|not enough memory|failed to allocate/i;
const UNLOADED_RE = /runner process has terminated|model (?:was )?unloaded|unloaded|runner .*(?:exited|terminated)|signal: killed|EOF$/i;
const BUSY_RE = /server busy|too many requests|maximum pending requests/i;
const secs = (ms) => Math.round(ms / 1000);
/** HTTP-svar (eller {error} i strømmen) → GateError. */
function httpGateError(status, text) {
  let msg = text;
  try { const j = JSON.parse(text); msg = j.error?.message ?? j.error ?? text; } catch { /* tekst */ }
  msg = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (MEMORY_RE.test(msg)) return new GateError('memory', `${status} ${msg}`, { status, ollamaError: msg, transient: false });
  if (UNLOADED_RE.test(msg)) return new GateError('unloaded', 'Modellen ble lastet ut underveis', { status, ollamaError: msg, transient: true });
  const transient = status >= 500 || status === 429 || BUSY_RE.test(msg);
  return new GateError('http', status === 404 || status === 401 || status === 403 ? `${status} ${msg}` : `Ollama HTTP ${status}: ${msg}`, { status, ollamaError: msg, transient });
}
function netGateError(e, base) {
  const code = e?.cause?.code || e?.code || '';
  const transient = /ECONNRESET|UND_ERR_SOCKET|EPIPE|socket hang up|other side closed/i.test(`${code} ${e?.message ?? ''} ${e?.cause?.message ?? ''}`);
  return new GateError('nocontact', `Ollama kan ikke nås${base ? ` på ${base}` : ''} (${code || e?.message || e?.name})`, { net: true, transient, code });
}

/* ---------------- /api/ps (hva er lastet) ---------------- */

const psCache = new Map(); // base → {at, models}
/** Lastede modeller fra /api/ps (cache 3 s). null når Ollama ikke svarer. */
export async function loadedModels({ base = defaultBase(), fetch: f = null, force = false } = {}) {
  if (!base) return null;
  const hit = psCache.get(base);
  if (!force && hit && clock.now() - hit.at < _gateTest.psTtlMs) return hit.models;
  let models = null;
  try {
    const r = await fetchOf(f)(`${base}/api/ps`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) { const j = await r.json().catch(() => null); models = Array.isArray(j?.models) ? j.models : null; }
  } catch { models = null; }
  psCache.set(base, { at: clock.now(), models });
  return models;
}
const invalidatePs = () => psCache.clear();
const isLoadedIn = (ps, model) => !!ps?.some((m) => sameModel(m.name ?? m.model, model));

/* ---------------- Køen ---------------- */

const Q = { seq: 0, waiting: [], running: new Map(), current: null, streakN: 0, streakAt: 0, paused: false, hold: 0, warm: new Map(), wake: null, lastBase: null, unloadTimers: new Map() };
const PRIO = { interactive: 0, background: 1 };
export const holdGate = () => { Q.hold++; let done = false; return () => { if (done) return; done = true; Q.hold = Math.max(0, Q.hold - 1); pump(); }; };
export const setGatePaused = (v) => { Q.paused = !!v; pump(); return Q.paused; };
export const gatePaused = () => Q.paused;

function eligible(j, now) {
  if (j.notBefore && j.notBefore > now) return false;
  if (j.prio === PRIO.background && (Q.paused || Q.hold > 0)) return false;
  return true;
}
const better = (a, b) => (a.prio - b.prio) || (a.seq - b.seq);
const best = (list) => list.slice().sort(better)[0] ?? null;

/**
 * Neste jobb som kan starte nå, eller null. Se reglene øverst i fila.
 * Utlasting (exclusive) starter bare når ingen forespørsel pågår, og ingen ny forespørsel starter før utlastingen er ferdig
 * (ellers kunne keep_alive:0 komme fram etter at et nytt kall startet – den gamle feilen). Utlasting tar under ett sekund.
 */
function pickNext() {
  const now = clock.now(), p = gateParams();
  const runs = [...Q.running.values()];
  const active = runs.filter((r) => !r.exclusive); // ekte forespørsler
  if (runs.some((r) => r.exclusive)) return null;
  const el = Q.waiting.filter((j) => eligible(j, now));
  if (!el.length) return null;
  const ex = el.filter((j) => j.exclusive);
  if (ex.length && !active.length) return best(ex);
  if (active.length >= p.ollamaConcurrency) return null;
  const fresh = el.filter((j) => !j.retry && !j.exclusive);
  const streakOver = Q.streakN >= GATE_FAIR.maxJobs || now - Q.streakAt >= GATE_FAIR.maxMs;
  if (active.length) {
    // Bare samme modell parallelt, og aldri nye forsøk ved siden av en annen forespørsel.
    const m = active[0].model;
    const same = fresh.filter((j) => sameModel(j.model, m));
    if (!same.length) return null;
    const otherWaiting = fresh.some((j) => !sameModel(j.model, m));
    const pick = best(same);
    if (otherWaiting && streakOver) return null;
    if (pick.prio === PRIO.background && fresh.some((j) => j.prio === PRIO.interactive && !sameModel(j.model, m))) return null; // interaktivt kall for en annen modell tas som neste
    return pick;
  }
  // Ledig: interaktive først (helst for modellen som er lastet), så bakgrunn gruppert per modell med rettferdighet.
  if (!fresh.length) return best(el.filter((j) => !j.exclusive)); // bare nye forsøk igjen: køen er ledig
  const inter = fresh.filter((j) => j.prio === PRIO.interactive);
  if (inter.length) return best(inter.filter((j) => sameModel(j.model, Q.current))) ?? best(inter);
  const cur = fresh.filter((j) => sameModel(j.model, Q.current));
  const others = fresh.filter((j) => !sameModel(j.model, Q.current));
  if (cur.length && (!others.length || !streakOver)) return best(cur);
  if (others.length) { const oldest = others.slice().sort((a, b) => a.seq - b.seq)[0]; return best(others.filter((j) => sameModel(j.model, oldest.model))); }
  return best(cur);
}
function pump() {
  for (;;) {
    const j = pickNext();
    if (!j) break;
    startJob(j);
  }
  // Våkne når et nytt forsøk (notBefore) blir klart.
  const next = Q.waiting.filter((j) => j.notBefore && j.notBefore > clock.now()).map((j) => j.notBefore).sort((a, b) => a - b)[0];
  if (Q.wake) { clock.clearTimeout(Q.wake); Q.wake = null; }
  if (next) Q.wake = clock.setTimeout(() => { Q.wake = null; pump(); }, Math.max(1, next - clock.now()));
}
function startJob(j) {
  Q.waiting.splice(Q.waiting.indexOf(j), 1);
  const now = clock.now();
  if (!j.internal && !j.exclusive) {
    if (!sameModel(j.model, Q.current)) { Q.current = j.model; Q.streakN = 0; Q.streakAt = now; }
    Q.streakN++;
  }
  j.startedAt = now;
  Q.running.set(j.id, j);
  j.signal?.removeEventListener?.('abort', j.onAbort);
  Promise.resolve().then(() => j.run(j)).then(j.resolve, j.reject).finally(() => {
    Q.running.delete(j.id);
    afterJob(j);
    pump();
  });
}
/**
 * Etter en jobb: modeller med keep_alive 0 lastes ut når køen for dem er tom og ingen forespørsel mot dem pågår. En kort frist
 * (unloadGraceMs, 1,5 s) gjør at kall som kommer rett etter hverandre ikke laster modellen ut og inn igjen; kommer et nytt kall
 * for modellen innen fristen, avlyses utlastingen.
 */
function afterJob(j) {
  if (j.internal || j.kind === 'unload' || j.kind === 'load') return;
  if (!isZeroKeep(keepAliveFor(j.model)) || !j.didRequest) return;
  if (Q.unloadTimers.has(j.model)) clock.clearTimeout(Q.unloadTimers.get(j.model));
  const t = clock.setTimeout(() => { Q.unloadTimers.delete(j.model); maybeUnload(j); }, _gateTest.unloadGraceMs);
  t?.unref?.();
  Q.unloadTimers.set(j.model, t);
}
function maybeUnload(j) {
  if (!isZeroKeep(keepAliveFor(j.model))) return;
  if (Q.waiting.some((w) => sameModel(w.model, j.model)) || [...Q.running.values()].some((r) => sameModel(r.model, j.model))) return;
  // Som en egen jobb i køen: starter først når ingen forespørsel pågår (aldri midt i et annet svar).
  enqueue({ model: j.model, prio: PRIO.interactive, exclusive: true, kind: 'unload', label: 'Laster ut', auto: true, base: j.base, fetch: j.fetch,
    run: () => doUnload(j.model, j.base, j.fetch) }).catch(() => {});
}
const cancelUnload = (model) => {
  const t = Q.unloadTimers.get(model);
  if (t) { clock.clearTimeout(t); Q.unloadTimers.delete(model); }
  // En automatisk utlasting som ikke har startet ennå, trengs ikke lenger.
  for (const w of Q.waiting.filter((x) => x.auto && sameModel(x.model, model))) { Q.waiting.splice(Q.waiting.indexOf(w), 1); w.resolve({ ok: false, skipped: true }); }
};
async function doUnload(model, base, f) {
  try {
    const r = await fetchOf(f)(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(15_000) });
    await r.text().catch(() => '');
    Q.warm.delete(model);
    console.info(`[ollama-gate] lastet ut ${model} (keep_alive 0, køen er tom)`);
    return r.ok;
  } finally { invalidatePs(); }
}

/** Legger én forespørsel (ett forsøk) i køen. → promise med resultatet av run() */
function enqueue({ model, backend = 'ollama', prio, retry = false, exclusive = false, auto = false, kind, label, signal, run, onQueue, base, fetch: f }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelErr()); return; }
    const j = { id: `g${++Q.seq}`, seq: Q.seq, model, backend, prio, retry, exclusive, auto, kind, label, signal, run, base, fetch: f, enqAt: clock.now(), resolve, reject };
    j.onAbort = () => { const i = Q.waiting.indexOf(j); if (i >= 0) { Q.waiting.splice(i, 1); reject(cancelErr()); pump(); } };
    signal?.addEventListener?.('abort', j.onAbort, { once: true });
    if (kind !== 'unload') cancelUnload(model);
    Q.waiting.push(j);
    pump();
    if (!Q.running.has(j.id)) { try { onQueue?.({ position: Q.waiting.length }); } catch { /* */ } }
  });
}

/* ---------------- Én forespørsel mot Ollama ---------------- */

const ns = (v) => (Number.isFinite(+v) && v ? Math.round(+v / 1e6) : 0);
const THINK_TAG = /<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi;
const thinkInText = (s) => { let n = 0; for (const m of String(s ?? '').matchAll(THINK_TAG)) n += m[1].length; return n; };

/**
 * Ett forsøk (inne i køen). kind: chat | generate | embed | load.
 * Tidsgrenser: første token (kald → loadMs, varm → warmMs), så idleMs uten nye tokens; deadlineMs = valgfri total grense fra start.
 */
async function attempt(o, job) {
  const p = gateParams();
  const base = o.base || defaultBase();
  Q.lastBase = base;
  if (!base) throw new GateError('nocontact', 'Ollama-adressen er ikke satt', { net: true, transient: false });
  const f = fetchOf(o.fetch);
  job.base = base; job.fetch = o.fetch;
  const loadMs = o.loadMs ?? p.loadTimeout * 1000;
  const warmMs = o.warmMs ?? p.firstTokenTimeout * 1000;
  // Kald eller varm? /api/ps (kort cache) – også modeller Open WebUI har lastet. Trengs bare når grensene er ulike.
  const ps = o.kind === 'load' || o.kind === 'embed' || loadMs !== warmMs ? await loadedModels({ base, fetch: o.fetch }) : null;
  const warmKnown = (Q.warm.get(o.model) ?? 0) > clock.now();
  const cold = ps ? !isLoadedIn(ps, o.model) : !warmKnown;
  const conf = keepAliveFor(o.model, p);
  const keepAlive = o.keepAlive !== undefined ? o.keepAlive : isZeroKeep(conf) ? SHORT_KEEP : conf;
  const firstMs = o.kind === 'load' || cold ? loadMs : warmMs;
  const idleMs = o.idleMs ?? (o.image ? p.idleTimeoutImage : p.idleTimeout) * 1000;
  const path = o.kind === 'embed' ? '/api/embed' : o.kind === 'chat' ? '/api/chat' : '/api/generate';
  const body = { ...(o.body ?? {}), model: o.model, keep_alive: keepAlive };
  if (o.kind === 'chat' || o.kind === 'generate' || o.kind === 'load') body.stream = true;
  if (o.kind === 'load') { body.prompt = ''; delete body.think; }
  // think: korte kall for tenkemodeller får alltid think:false (ikke styrt av 400-minnet).
  const thinking = isThinkingModel(o.model);
  if ((o.kind === 'chat' || o.kind === 'generate') && o.short !== false && thinking && !o.allowThink) body.think = false;
  if (!thinking && hasNoThink(o.model)) delete body.think;
  try { o.onStart?.({ cold, keepAlive, attempt: job.attemptNo }); } catch { /* */ }
  try { o.onPhase?.(cold ? { kind: 'load', cold: true } : { kind: 'think', chars: 0 }); } catch { /* */ }
  const ctrl = new AbortController();
  let why = null; // 'first' | 'idle' | 'deadline' | 'user'
  const onUser = () => { why = why ?? 'user'; ctrl.abort(o.signal.reason ?? new Error('Avbrutt')); };
  if (o.signal?.aborted) throw cancelErr();
  o.signal?.addEventListener?.('abort', onUser, { once: true });
  let tFirst = null, tIdle = null, tDead = null, gotFirst = false;
  const fire = (w) => () => { why = why ?? w; ctrl.abort(new Error(w)); };
  const clearAll = () => { clock.clearTimeout(tFirst); clock.clearTimeout(tIdle); clock.clearTimeout(tDead); };
  const armIdle = () => { clock.clearTimeout(tIdle); tIdle = clock.setTimeout(fire('idle'), idleMs); };
  const embedMs = o.kind === 'embed' ? (cold ? Math.max(loadMs, o.timeoutMs ?? EMBED_MS) : o.timeoutMs ?? EMBED_MS) : null;
  tFirst = clock.setTimeout(fire('first'), embedMs ?? firstMs);
  if (o.deadlineMs) tDead = clock.setTimeout(fire('deadline'), o.deadlineMs);
  const timeoutErr = () => {
    if (why === 'user') return cancelErr();
    if (why === 'deadline') return new GateError('idle_timeout', `svarte ikke innen ${secs(o.deadlineMs)} s`, { timeout: true, deadline: true, transient: false });
    if (why === 'first' && o.kind === 'embed') return new GateError(cold ? 'load_timeout' : 'idle_timeout', cold ? `lastet ikke inn på ${secs(embedMs)} s` : `svarte ikke på ${secs(embedMs)} s`, { timeout: true, loadTimeout: cold, transient: cold, beforeFirst: true });
    if (why === 'first' && (cold || o.kind === 'load')) return new GateError('load_timeout', `lastet ikke inn på ${secs(firstMs)} s`, { timeout: true, loadTimeout: true, transient: true, beforeFirst: true, limitMs: firstMs });
    if (why === 'first') return new GateError('idle_timeout', `ingen nye tokens på ${secs(firstMs)} s`, { timeout: true, transient: true, beforeFirst: true, limitMs: firstMs });
    return new GateError('idle_timeout', `ingen nye tokens på ${secs(idleMs)} s`, { timeout: true, transient: false, limitMs: idleMs });
  };
  const t0 = clock.now();
  let firstAt = null, out;
  // Prompt 43: selve kallet går via en backend (standard «ollama»). Køen, grupperingen, tidsgrensene, nye forsøk og telemetrien
  // over er felles; backenden melder hver bit med onToken (som holder tidsgrensene i live).
  const be = getBackend(o.backend);
  const onToken = async (j) => {
    if (!gotFirst) { gotFirst = true; job.gotFirst = true; firstAt = clock.now(); clock.clearTimeout(tFirst); }
    if (o.kind !== 'embed') armIdle();
    if (j && o.onChunk) await o.onChunk(j);
    if (j && o.onPhase && o.kind !== 'embed' && out0.content !== undefined) { try { o.onPhase(stripThink(out0.content) ? { kind: 'answer', chars: stripThink(out0.content).length } : { kind: 'think', chars: out0.thinking.length + thinkInText(out0.content) }); } catch { /* */ } }
  };
  const out0 = { content: '', thinking: '' }; // backenden oppdaterer underveis (fasevisning)
  try {
    out = await be.chatStream({ kind: o.kind, model: o.model, base, path, body, fetch: f, thinking, partial: out0 }, { onToken, signal: ctrl.signal, onRequest: () => { job.didRequest = true; } });
  } catch (e) {
    if (why) throw timeoutErr();
    if (e instanceof GateError) throw e;
    // Strømmen ble brutt midt i et svar: modellen ble lastet ut (eller runneren døde).
    if (!gotFirst) throw netGateError(e, base);
    throw new GateError('unloaded', 'Modellen ble lastet ut underveis', { transient: true });
  } finally {
    clearAll();
    o.signal?.removeEventListener?.('abort', onUser);
  }
  const { content = '', thinking: thinkingText = '', message = null, final = null } = out;
  // Modellen er lastet nå (til keep_alive går ut).
  Q.warm.set(o.model, clock.now() + keepMs(keepAlive));
  invalidatePs();
  const fin = final ?? {};
  const thinkChars = thinkingText.length + thinkInText(content);
  if (thinkChars && o.short !== false && !o.allowThink) console.info(`[ollama-gate] ${o.model} tenkte likevel: ${thinkChars} tegn${out.usage?.tokOut ? ` (${out.usage.tokOut} tokens totalt)` : ''}`);
  return {
    content, thinking: thinkingText, text: out.text ?? stripThink(content), final: fin, message: message ? { ...message, content, ...(thinkingText ? { thinking: thinkingText } : {}) } : { role: 'assistant', content },
    embeddings: out.embeddings ?? fin.embeddings ?? null,
    t: { loadMs: out.timing?.loadMs ?? 0, promptMs: out.timing?.promptMs ?? 0, genMs: out.timing?.genMs ?? 0, tokIn: out.usage?.tokIn ?? 0, tokOut: out.usage?.tokOut ?? 0,
      thinkChars, keepAlive, cold, firstTokenMs: firstAt ? firstAt - t0 : null, runMs: clock.now() - t0 },
  };
}

/* ---------------- Backends ---------------- */
//
// Grensesnitt: backend.chatStream(req, {onToken, signal, onRequest}) → {text, content, thinking, message, final, usage:{tokIn, tokOut}, timing:{loadMs, promptMs, genMs}}
//   req = {kind:'chat'|'generate'|'embed'|'load', model, base, path, body, fetch, thinking, partial}
//   onToken(bit) for hver bit som kommer (holder tidsgrensene i live), onRequest() når forespørselen er sendt.
//   Feil: kast GateError (http/memory/unloaded …) eller en nettverksfeil (gaten klassifiserer den).
// Regelen «aldri to ulike modeller samtidig» gjelder på tvers av alle backends: de deler samme kø (Open WebUI sender alt videre
// til samme Ollama).
const backends = new Map();
export function registerBackend(name, impl) { if (!impl?.chatStream) throw new Error('backend må ha chatStream(req, {onToken, signal})'); backends.set(name, { name, ...impl }); }
export function getBackend(name = 'ollama') { const b = backends.get(name || 'ollama'); if (!b) throw new GateError('http', `Ukjent AI-backend «${name}»`, { status: 400, transient: false }); return b; }
export const backendNames = () => [...backends.keys()];

/** Ollama: /api/chat, /api/generate (NDJSON-strøm) og /api/embed. */
registerBackend('ollama', {
  async chatStream(req, { onToken, signal, onRequest }) {
    const { base, path, body, fetch: f, thinking, model, kind } = req;
    const part = req.partial ?? { content: '', thinking: '' };
    const send = (b) => f(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal });
    let res = await send(body);
    if (res.status === 400 && 'think' in body) {
      const text = await res.text().catch(() => '');
      if (THINK_UNSUPPORTED.test(text)) {
        // Ikke-tenkemodeller huskes; tenkemodeller får think:false igjen neste gang (bare dette kallet går uten).
        if (!thinking) rememberNoThink(model);
        console.warn(`[ollama-gate] ${model} støtter ikke think, prøver uten${thinking ? ' (bare dette kallet)' : ''}`);
        delete body.think;
        res = await send(body);
      } else res = new Response(text, { status: res.status, statusText: res.statusText });
    }
    onRequest?.();
    if (!res.ok) { const text = await res.text().catch(() => ''); throw httpGateError(res.status, text); }
    let final = null, message = null, streamErr = null;
    const onObj = async (j) => {
      if (j.error) { streamErr = httpGateError(500, JSON.stringify({ error: j.error })); return; }
      if (kind === 'embed') { final = j; await onToken(null); return; }
      part.content += j.message?.content ?? j.response ?? '';
      part.thinking += j.message?.thinking ?? j.thinking ?? '';
      if (j.message) message = { role: j.message.role ?? message?.role ?? 'assistant', ...(j.message.tool_calls ? { tool_calls: j.message.tool_calls } : {}) };
      if (j.done) final = j;
      await onToken(j);
    };
    if (res.body?.getReader) {
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        if (value?.length) await onToken(null); // bytes kom: tidsgrensen holdes i live også før en hel linje
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { let j; try { j = JSON.parse(line); } catch { continue; } await onObj(j); if (streamErr) break; } }
        if (streamErr) { try { rd.cancel(); } catch { /* */ } break; }
      }
      buf += dec.decode();
      if (buf.trim() && !streamErr) { let j = null; try { j = JSON.parse(buf.trim()); } catch { /* */ } if (j) await onObj(j); }
    } else {
      const t = await res.text();
      for (const line of t.split('\n')) { if (!line.trim()) continue; let j; try { j = JSON.parse(line); } catch { continue; } await onObj(j); if (streamErr) break; }
    }
    if (streamErr) throw streamErr;
    if (kind !== 'embed' && kind !== 'load' && !final && !part.content && !part.thinking) throw new GateError('unloaded', 'Modellen ble lastet ut underveis', { transient: true });
    if (kind !== 'embed' && kind !== 'load' && final?.done_reason && /unload/i.test(final.done_reason)) throw new GateError('unloaded', 'Modellen ble lastet ut underveis', { transient: true });
    const fin = final ?? {};
    return { text: stripThink(part.content), content: part.content, thinking: part.thinking, message, final: fin, embeddings: fin.embeddings ?? null,
      usage: { tokIn: fin.prompt_eval_count ?? 0, tokOut: fin.eval_count ?? 0 }, timing: { loadMs: ns(fin.load_duration), promptMs: ns(fin.prompt_eval_duration), genMs: ns(fin.eval_duration) } };
  },
});

/**
 * Open WebUI (OpenAI-kompatibel /api/chat/completions med Bearer-nøkkel, SSE-strøm, /api/models). Bare grensesnittet foreløpig:
 * kall med backend:'openwebui' går gjennom samme kø (samme Ollama bak), men selve kallet er ikke laget ennå.
 */
registerBackend('openwebui', {
  async chatStream(req) { throw new GateError('http', `Open WebUI-backenden er ikke laget ennå (${req.model})`, { status: 501, transient: false }); },
});
const keepMs = (v) => (v === -1 || v === '-1' ? 365 * 86400_000 : isZeroKeep(v) ? 0 : (() => { const m = String(v ?? '5m').match(/^(\d+)(s|m|h)$/); return m ? +m[1] * ({ s: 1000, m: 60_000, h: 3600_000 }[m[2]]) : 5 * 60_000; })());

/**
 * En forespørsel med nye forsøk. Hvert forsøk går gjennom køen; nye forsøk venter 2 s / 8 s og legges bakerst.
 * retries: maks antall nye forsøk (standard 2). retryTimeouts:false → tidsavbrudd før første token gir ikke nye forsøk
 * (brukes når ruteren har en reserve å gå til).
 */
async function request(o) {
  const t0 = clock.now();
  const prio = PRIO[o.priority] ?? PRIO.background;
  const maxRetries = o.retries ?? _gateTest.maxRetries;
  let queueMs = 0, attempts = 0;
  const tele = (x = {}) => ({ queueMs, loadMs: x.loadMs ?? 0, promptMs: x.promptMs ?? 0, genMs: x.genMs ?? 0, totalMs: clock.now() - t0, tokIn: x.tokIn ?? 0, tokOut: x.tokOut ?? 0,
    thinkChars: x.thinkChars ?? 0, attempts, model: o.model, keepAlive: x.keepAlive ?? null, cold: x.cold ?? null, firstTokenMs: x.firstTokenMs ?? null });
  for (;;) {
    attempts++;
    const enq = clock.now();
    let startedAt = null, qjob = null;
    try {
      const out = await enqueue({ model: o.model, backend: o.backend ?? 'ollama', prio, retry: attempts > 1, kind: o.kind, label: o.label, signal: o.signal, onQueue: o.onQueue, base: o.base, fetch: o.fetch,
        run: (qj) => { qjob = qj; qj.attemptNo = attempts; startedAt = clock.now(); queueMs += startedAt - enq; return attempt(o, qj); } });
      const { t, ...rest } = out;
      return { ...rest, telemetry: tele(t) };
    } catch (e0) {
      if (startedAt === null) queueMs += clock.now() - enq;
      const e = e0 instanceof GateError ? e0 : Object.assign(new GateError('nocontact', String(e0?.message ?? e0), { transient: false }), { cause: e0 });
      e.telemetry = tele();
      if (o.signal?.aborted || e.kind === 'cancelled') { const c = cancelErr(); c.telemetry = tele(); throw c; }
      const timeoutBlocked = e.beforeFirst && o.retryTimeouts === false;
      // Strømmer kallet videre til en klient (chat) og noe er sendt, kan det ikke tas på nytt (teksten ville kommet to ganger).
      const streamedOut = !!o.onChunk && !!qjob?.gotFirst;
      if (!e.transient || timeoutBlocked || streamedOut || attempts > maxRetries) throw e;
      const wait = _gateTest.backoffMs[Math.min(attempts - 1, _gateTest.backoffMs.length - 1)] ?? 2000;
      console.warn(`[ollama-gate] ${o.model}: ${e.message} · nytt forsøk ${attempts}/${maxRetries} om ${Math.round(wait / 100) / 10} s`);
      try { o.onRetry?.({ attempt: attempts, error: e, waitMs: wait }); } catch { /* */ }
      try { await sleep(wait, o.signal); } catch (c) { c.telemetry = tele(); throw c; }
    }
  }
}

/* ---------------- Offentlige kall ---------------- */

/** /api/chat (alltid strømmet). */
export const gateChat = (o) => request({ ...o, kind: 'chat' });
/** /api/generate (alltid strømmet). */
export const gateGenerate = (o) => request({ ...o, kind: 'generate' });
/** /api/embed (ingen strøm, egen enkel grense). → {embeddings, final, telemetry} */
export const gateEmbed = ({ model, input, ...o }) => request({ ...o, model, body: { input }, kind: 'embed' });
/** Laster modellen (prompt '') med keep_alive for modellen. → {telemetry, already} */
export async function gateLoad(model, o = {}) {
  const ps = await loadedModels({ base: o.base, fetch: o.fetch });
  if (isLoadedIn(ps, model)) return { already: true, telemetry: { queueMs: 0, loadMs: 0, totalMs: 0, attempts: 0, model } };
  return { ...(await request({ ...o, model, kind: 'load', short: false })), already: false };
}
/** Laster ut modellen (keep_alive 0) – venter til ingen forespørsel mot den pågår. */
export function gateUnload(model, o = {}) {
  const base = o.base || defaultBase();
  return enqueue({ model, prio: PRIO.interactive, exclusive: true, kind: 'unload', label: 'Laster ut', signal: o.signal, base, fetch: o.fetch, run: async () => ({ ok: await doUnload(model, base, o.fetch) }) });
}

/**
 * Drop-in for ollamaPost(fetchFn, url, body, init): går gjennom gaten og gir et Response med det samlede (ikke-strømmede)
 * svaret {model, message:{role, content, thinking?}, response, done, prompt_eval_count, eval_count, load_duration, …}.
 * HTTP-feil fra Ollama gis tilbake som Response med samme status; tidsavbrudd kastes med name 'TimeoutError'.
 * gateOpts: {priority, image, short, allowThink, idleMs, loadMs, warmMs, deadlineMs, label}
 */
export async function gatePost(fetchFn, url, body, init = {}, gateOpts = {}) {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host}${u.pathname.replace(/\/api\/(chat|generate|embed)$/, '')}`.replace(/\/+$/, '');
  const kind = /\/api\/embed$/.test(u.pathname) ? 'embed' : /\/api\/chat$/.test(u.pathname) ? 'chat' : 'generate';
  try {
    const out = await request({ ...gateOpts, kind, model: body.model, body, base, fetch: fetchFn, signal: init.signal ?? gateOpts.signal ?? null,
      image: gateOpts.image ?? !!(body.images?.length || body.messages?.some?.((m) => m.images?.length)), short: gateOpts.short ?? true,
      allowThink: gateOpts.allowThink ?? (body.think === true || (!('think' in body) && userWantsThink())) });
    const fin = out.final ?? {};
    const json = kind === 'embed' ? { ...fin }
      : { ...fin, model: body.model, ...(kind === 'chat' ? { message: out.message } : { response: out.content, ...(out.thinking ? { thinking: out.thinking } : {}) }), done: true, _gate: out.telemetry };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    if (e instanceof GateError && (e.kind === 'http' || e.kind === 'memory') && e.status) return new Response(JSON.stringify({ error: e.ollamaError ?? e.message }), { status: e.status, headers: { 'content-type': 'application/json' } });
    throw e;
  }
}

/* ---------------- Single-flight ---------------- */

const flights = new Map();
/** Samme nøkkel mens den kjører → samme promise. */
export function once(key, fn) {
  if (flights.has(key)) return flights.get(key);
  const p = Promise.resolve().then(fn).finally(() => { if (flights.get(key) === p) flights.delete(key); });
  flights.set(key, p);
  return p;
}
export const inFlight = (key) => flights.has(key);

/* ---------------- Status ---------------- */

/** Til AI-kontroll. loaded = siste /api/ps (cache), uten nytt kall. */
export function gateState() {
  const now = clock.now();
  const groups = new Map();
  for (const j of Q.waiting) {
    const g = groups.get(j.model) ?? { model: j.model, n: 0, oldestMs: 0, interactive: 0 };
    g.n++; g.oldestMs = Math.max(g.oldestMs, now - j.enqAt); if (j.prio === PRIO.interactive) g.interactive++;
    groups.set(j.model, g);
  }
  const ps = psCache.get(Q.lastBase ?? defaultBase())?.models ?? null;
  const p = gateParams();
  return {
    current: Q.current, paused: Q.paused, hold: Q.hold, concurrency: p.ollamaConcurrency,
    running: [...Q.running.values()].map((j) => ({ model: j.model, backend: j.backend ?? 'ollama', kind: j.kind ?? null, label: j.label ?? null, priority: j.prio === PRIO.interactive ? 'interactive' : 'background', ms: now - (j.startedAt ?? now), internal: !!j.internal })),
    waiting: [...groups.values()],
    loaded: (ps ?? []).map((m) => ({ name: m.name ?? m.model, sizeGb: m.size ? Math.round(m.size / 1e8) / 10 : null, vramGb: m.size_vram ? Math.round(m.size_vram / 1e8) / 10 : null, expiresAt: m.expires_at ?? null, keepAlive: keepAliveFor(m.name ?? m.model, p) })),
  };
}
/** Tester: tøm køen og minnet. */
export function _resetGate() {
  Q.waiting.length = 0; Q.running.clear(); Q.current = null; Q.streakN = 0; Q.streakAt = 0; Q.paused = false; Q.hold = 0; Q.warm.clear();
  if (Q.wake) clock.clearTimeout(Q.wake);
  Q.wake = null; psCache.clear(); flights.clear();
  for (const t of Q.unloadTimers.values()) clock.clearTimeout(t);
  Q.unloadTimers.clear();
}
