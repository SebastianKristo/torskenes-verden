// Prompt 51 (OBS51): spor for trege forespørsler – lettvekts spenn per forespørsel uten nye avhengigheter.
//
// Hver /api- og /finans/api-forespørsel får en AsyncLocalStorage-kontekst. Inne i den måles:
//   db  – better-sqlite3 (Statement.run/get/all, alle databaser): antall, samlet tid og de tregeste spørringene (bare SQL-teksten, aldri verdier)
//   ai  – fetch mot Ollama/Open WebUI (AI-gaten bruker fetch): antall, samlet tid, vert + sti
//   ext – andre fetch-kall ut: vert + sti (uten spørrestreng; lange tokenlignende stibiter maskeres)
// Trege forespørsler (≥ slowMs, standard 800 ms) havner i en ringbuffer (200). Per rute holdes antall og de siste 100 tidene (p50/p95).
// SSE-strømmer og WebSocket telles ikke (varigheten er ikke svartid). Ingenting lagres på disk.
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { maskLog44 } from '../logs44.js';

const als = new AsyncLocalStorage();
export const TRACE51 = { slowMs: Number(process.env.OBS51_SLOW_MS) || 800, ring: 200, perRoute: 100, maxRoutes: 300 };
const ring = [];
const routes = new Map();
let seq = 0;

/** /api/finans/receipts/123/image?x=1 → /api/finans/receipts/:id/image */
export function routeOf51(path) {
  return String(path ?? '').split('?')[0].split('/').map((s) => (
    /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) || /^[0-9a-f]{12,}$/i.test(s) || (s.length > 24 && /^[A-Za-z0-9_\-.=:~]+$/.test(s)) ? ':id' : s
  )).join('/').slice(0, 160);
}
/** Ekstern adresse uten spørrestreng og uten tokenlignende stibiter. */
export function urlOf51(u) {
  try {
    const x = new URL(typeof u === 'string' ? u : u?.url ?? String(u));
    return { host: x.host, path: maskLog44(routeOf51(x.pathname)).slice(0, 120) };
  } catch { return { host: '?', path: '' }; }
}
const AI_PATH = /^\/(api\/(chat|generate|embed|embeddings|show|ps|tags|pull)|v1\/|api\/v1\/|ollama\/)/;
let aiHosts = () => [];
export const setAiHosts51 = (fn) => { aiHosts = fn; };
function kindOf(host, path) {
  if (/:11434$/.test(host) || aiHosts().includes(host)) return 'ai';
  return AI_PATH.test(path) && /ollama|openwebui|open-webui/i.test(host) ? 'ai' : 'ext';
}

function span(st, kind, ms, label, status = null) {
  const s = st[kind];
  s.n++; s.ms += ms;
  if (s.top.length < 5 || ms > s.top[s.top.length - 1].ms) {
    s.top.push({ label, ms: Math.round(ms * 10) / 10, ...(status != null ? { status } : {}) });
    s.top.sort((a, b) => b.ms - a.ms); if (s.top.length > 5) s.top.length = 5;
  }
}
const blank = () => ({ n: 0, ms: 0, top: [] });

/* ---------------- Instrumentering ---------------- */

let installed = false;
/** Kobler på fetch og better-sqlite3 (én gang). db = en åpen better-sqlite3-database. */
export function installTrace51(db) {
  if (installed || process.env.OBS51_TRACE === '0') return false;
  installed = true;
  // better-sqlite3: alle Statement-objekter deler prototypen.
  try {
    const proto = Object.getPrototypeOf(db.prepare('SELECT 1'));
    for (const m of ['run', 'get', 'all']) {
      const orig = proto[m];
      if (typeof orig !== 'function' || orig.__obs51) continue;
      const wrapped = function (...a) {
        const st = als.getStore();
        if (!st) return orig.apply(this, a);
        const t0 = performance.now();
        try { return orig.apply(this, a); } finally { span(st, 'db', performance.now() - t0, String(this.source ?? '').replace(/\s+/g, ' ').slice(0, 140)); }
      };
      wrapped.__obs51 = true;
      proto[m] = wrapped;
    }
  } catch { /* uten db-spenn */ }
  const origFetch = globalThis.fetch;
  if (typeof origFetch === 'function' && !origFetch.__obs51) {
    const f = function fetch(input, init) {
      const st = als.getStore();
      if (!st) return origFetch(input, init);
      const { host, path } = urlOf51(input);
      const kind = kindOf(host, path);
      const t0 = performance.now();
      return origFetch(input, init).then(
        (r) => { span(st, kind, performance.now() - t0, `${host}${path}`, r?.status ?? null); return r; },
        (e) => { span(st, kind, performance.now() - t0, `${host}${path}`, 'feil'); throw e; });
    };
    f.__obs51 = true;
    globalThis.fetch = f;
  }
  return true;
}
export const _traceInstalled51 = () => installed;

/** Tester og andre moduler: mål et eget spenn (f.eks. Docker) i gjeldende forespørsel. */
export async function measure51(kind, label, fn) {
  const st = als.getStore();
  if (!st || !['db', 'ai', 'ext'].includes(kind)) return fn();
  const t0 = performance.now();
  try { return await fn(); } finally { span(st, kind, performance.now() - t0, String(label).slice(0, 140)); }
}

/* ---------------- Mellomvare ---------------- */

const TRACED = /^\/(api|finans\/api|mat\/api|home\/api|domains\/api)\//;
const SKIP = /\/(stream|events|ws|sse)(\/|$)|\/api\/system\/obs51\/traces/;
export async function traceMw51(c, next) {
  const p = c.req.path;
  if (!TRACED.test(p) || SKIP.test(p)) return next();
  const st = { db: blank(), ai: blank(), ext: blank() };
  const t0 = performance.now();
  let err = null;
  try { await als.run(st, next); } catch (e) { err = e; }
  const ms = performance.now() - t0;
  const ct = c.res?.headers?.get?.('content-type') ?? '';
  if (!/text\/event-stream/i.test(ct)) record({ method: c.req.method, route: routeOf51(p), status: err ? 500 : c.res?.status ?? 0, ms, st, user: c.get?.('user') ?? null });
  if (err) throw err;
}

function record({ method, route, status, ms, st, user }) {
  const key = `${method} ${route}`;
  let r = routes.get(key);
  if (!r) {
    if (routes.size >= TRACE51.maxRoutes) { const oldest = [...routes.entries()].sort((a, b) => a[1].last - b[1].last)[0]; routes.delete(oldest[0]); }
    r = { method, route, n: 0, slow: 0, errors: 0, ms: [], last: 0, max: 0 };
    routes.set(key, r);
  }
  r.n++; r.last = Date.now(); r.max = Math.max(r.max, ms);
  if (status >= 500) r.errors++;
  r.ms.push(ms); if (r.ms.length > TRACE51.perRoute) r.ms.shift();
  if (ms < TRACE51.slowMs) return;
  r.slow++;
  const out = (k) => ({ n: st[k].n, ms: Math.round(st[k].ms), top: st[k].top });
  const other = Math.max(0, ms - st.db.ms - st.ai.ms - st.ext.ms);
  const main = [['db', st.db.ms], ['ai', st.ai.ms], ['ext', st.ext.ms], ['app', other]].sort((a, b) => b[1] - a[1])[0][0];
  ring.push({ id: ++seq, at: new Date().toISOString(), method, route, status, ms: Math.round(ms), user: user ? String(user).slice(0, 64) : null,
    spans: { db: out('db'), ai: out('ai'), ext: out('ext'), app: { ms: Math.round(other) } }, main,
    mainText: { db: 'Mest tid i databasen', ai: 'Mest tid hos AI-modellen', ext: 'Mest tid i eksterne kall', app: 'Mest tid i serverkoden' }[main] });
  if (ring.length > TRACE51.ring) ring.shift();
}
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

/** → {slowMs, items:[spor, nyeste først], routes:[{method, route, n, slow, errors, p50, p95, max}]} */
export function traces51({ limit = 50, route = '' } = {}) {
  const items = ring.filter((x) => !route || x.route.includes(route)).slice(-Math.max(1, Math.min(TRACE51.ring, limit))).reverse();
  const rs = [...routes.values()].map((r) => ({ method: r.method, route: r.route, n: r.n, slow: r.slow, errors: r.errors, p50: pct(r.ms, 50), p95: pct(r.ms, 95), max: Math.round(r.max) }))
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 30);
  return { slowMs: TRACE51.slowMs, total: ring.length, items, routes: rs };
}
export const _resetTrace51 = () => { ring.length = 0; routes.clear(); };
