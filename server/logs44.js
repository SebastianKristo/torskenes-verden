// Prompt 44 (SERVER44): Innstillinger → Server → Logger – Docker-logger, feil og feilsøking (claude-code-innst-logger-docker.md,
// Logger.dc.html). Kontrakten: loggene er serverinfrastruktur, så ALT her er bare for admin (også lesing). Start/stopp/omstart
// krever {confirm:true}. Hemmeligheter maskeres (token=, password=, Authorization:, API-nøkler, sk-…, Bearer …) før visning,
// nedlasting og Glimt.
//
// Docker Engine API: DOCKER_HOST=tcp://docker-socket-proxy:2375 (anbefalt, tecnativa/docker-socket-proxy, profil «logs» i docker-compose.yml), ellers unix-socketen DOCKER_SOCKET (standard /var/run/docker.sock, montert :ro). Mangler
// begge, svarer rutene 200 {available:false, setup:{…}} (tomtilstand med oppsett). MOCK_DATA=1 gir en innebygd demo.
//
//   GET  /api/system/containers → {available, containers:[Container], summary:{up, total, errors1h, warnings1h, restarts, worst, disk}, setup?}
//        Container: {id, name, image, tag, state:'running'|'restarting'|'exited'|'paused'|'created'|'dead', status, color:'green'|'yellow'|'red',
//                    startedAt, uptime, restarts, health, errors1h, warnings1h, self}
//   GET  /api/system/containers/:id → {container, cpu:{pct, text}, mem:{used, limit, pct, text}} (stats en gang)
//   GET  /api/system/containers/:id/inspect → {id, name, image, created, state, restartPolicy, ports, mounts, env:[«NAVN=••••»], labels}
//   POST /api/system/containers/:id/(restart|stop|start) {confirm:true} → {ok, id, name, action, message}
//   GET  /api/system/logs?ct=&since=15m|1h|24h|7d|<ISO>&level=all|info|warn|error&q=&limit=500
//        → {available, lines:[Line], total, truncated, filter, containers:[navn]}
//        Line: {id, t, ts, level:'error'|'warn'|'info'|'debug', ct, ctId, stream:'stdout'|'stderr', msg}
//   GET  /api/system/logs/stream?ct=&level=&q= (SSE): hendelser «line» (Line) og «ping»
//   GET  /api/system/logs/groups?hours=24&ct= → {groups:[{key, count, ct, level, message, pattern, firstSeen, lastSeen, explain}], hours, total}
//   POST /api/system/logs/explain {line, context?:[tekst], ct?} → {source:'pattern'|'glimt'|'none', pattern?, title, text, steps:[…]}
//   GET  /api/system/logs/download?(samme filter) → text/plain vedlegg (homelab-<ct>-<dato>.log)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { sessionUser, isAdmin, listUsers } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { notifyUser } from './notify.js';
import { maskSecrets } from './ai-gate.js';

const MOCK = () => process.env.MOCK_DATA === '1';

/* ---------------- Maskering ---------------- */

const MASKS = [
  [/((?:^|[?&\s,;{"'])(?:token|access_token|refresh_token|api[_-]?key|apikey|x-api-key|secret|client_secret|password|passwd|pass|pwd|auth|session|sid|cookie)\s*[=:]\s*"?)([^\s&"',;}]+)/gi, '$1••••'],
  [/((?:Authorization|Proxy-Authorization)\s*[:=]\s*(?:Bearer|Basic|Token)?\s*)[^\s"',;}]+/gi, '$1••••'],
  [/(X-(?:Api|Plex|Emby|MediaBrowser)-(?:Key|Token)\s*[:=]\s*)[^\s"',;}]+/gi, '$1••••'],
  [/\b(sk-|sk_live_|sk_test_|ghp_|gho_|github_pat_|xox[bpa]-|fh_pat_|AKIA)[A-Za-z0-9_\-]{6,}/g, '$1••••'],
  [/(\/\/[^:/\s@]+:)[^@\s/]+@/g, '$1••••@'], // https://bruker:passord@vert
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, 'eyJ••••'], // JWT
];
/** Fjerner hemmeligheter fra en logglinje (før visning, nedlasting og Glimt). */
export function maskLog44(text) {
  let s = String(text ?? '');
  for (const [re, to] of MASKS) s = s.replace(re, to);
  return maskSecrets(s);
}

/* ---------------- Nivå og normalisering ---------------- */

const LV = { error: 3, warn: 2, info: 1, debug: 0 };
/** Nivået i en linje: JSON (level), tekst (ERROR/WARN/INFO/DEBUG), linuxserver ([Info]), Postgres (LOG/WARNING/ERROR), zerolog (ERR/WRN/INF). */
export function levelOf44(msg, stream = 'stdout') {
  const s = String(msg ?? '');
  if (/^\s*\{/.test(s)) { try { const j = JSON.parse(s); const l = String(j.level ?? j.lvl ?? j.severity ?? '').toLowerCase(); if (l) return /err|fatal|crit|panic/.test(l) ? 'error' : /warn/.test(l) ? 'warn' : /debug|trace/.test(l) ? 'debug' : 'info'; } catch { /* tekst */ } }
  if (/\b(ERROR|ERR|FATAL|PANIC|CRIT(?:ICAL)?|EMERG)\b|\[(?:Error|Fatal)\]|\|Error\||\blevel=(?:error|fatal)\b|^\s*(?:ERROR|FATAL|PANIC):|Traceback \(most recent|Unhandled|uncaught exception|OOMKilled/i.test(s) && !/\b0 errors?\b/i.test(s)) return 'error';
  if (/\b(WARN(?:ING)?|WRN)\b|\[Warn(?:ing)?\]|\|Warn\||\blevel=warn/i.test(s)) return 'warn';
  if (/\b(DEBUG|DBG|TRACE|TRC)\b|\[Debug\]|\[Trace\]|\blevel=debug/i.test(s)) return 'debug';
  if (/\b(INFO|INF|LOG|NOTICE)\b|\[Info\]|\|Info\||\blevel=info/i.test(s)) return 'info';
  return stream === 'stderr' ? 'warn' : 'info';
}
/** Like feil slås sammen: tall, IP-er, UUID-er, hasher og tider byttes ut før telling. */
export function normalize44(msg) {
  return String(msg ?? '')
    .replace(/^\s*\d{4}-\d\d-\d\d[T ][\d:.,]+Z?\s*/, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b[0-9a-f]{12,64}\b/gi, '<hash>')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ').trim().slice(0, 240);
}

/* ---------------- Docker-transport ---------------- */

const SOCKET = () => process.env.DOCKER_SOCKET || '/var/run/docker.sock';
// Prompt 45 (SERVER45): standard er proxyen i stacken, tcp://homelab-docker:2375 (claude-code-docker-logger-automatisk.md). Har updateren
// gjenbrukt en proxy brukeren la inn selv, står navnet i data/update/docker.json (bare et validert vertsnavn leses). DOCKER_HOST i .env
// overstyrer alt. Svarer ikke proxyen og socketen er montert direkte, brukes socketen (fallback).
const PROXY_HOST = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
let proxyFile = { at: 0, host: null };
function updaterProxy() {
  if (Date.now() - proxyFile.at < 10_000) return proxyFile.host;
  let host = null;
  try { const j = JSON.parse(readFileSync(join(resolve(config.dataDir), 'update', 'docker.json'), 'utf8')); const n = j?.state === 'done' ? String(j?.proxy?.name ?? '') : ''; host = PROXY_HOST.test(n) ? n : null; } catch { host = null; }
  proxyFile = { at: Date.now(), host };
  return host;
}
export const _resetDockerTarget45 = () => { proxyFile = { at: 0, host: null }; };
export function dockerTarget45() {
  const h = String(process.env.DOCKER_HOST ?? '').trim();
  if (/^tcp:\/\//i.test(h)) { const u = new URL(h.replace(/^tcp:/i, 'http:')); return { host: u.hostname, port: +u.port || 2375, source: 'env' }; }
  if (/^unix:\/\//i.test(h)) return { socketPath: h.replace(/^unix:\/\//i, ''), source: 'env' };
  if (process.env.DOCKER_PROXY_DEFAULT === '0') return existsSync(SOCKET()) ? { socketPath: SOCKET(), source: 'socket' } : null;
  const up = updaterProxy();
  return { host: up ?? 'homelab-docker', port: 2375, source: up ? 'updater' : 'default', ...(existsSync(SOCKET()) ? { fallbackSocket: SOCKET() } : {}) };
}
function target() { const t = dockerTarget45(); if (!t) return null; const { source: _s, fallbackSocket: _f, ...r } = t; return t.fallbackSocket && socketPreferred > Date.now() ? { socketPath: t.fallbackSocket } : r; }
let socketPreferred = 0; // proxyen svarte ikke → socketen i 5 min
let fakeDocker = null;
/** Bare for tester: bytt ut Docker-API-et ((method, path) → {status, body:Buffer|string|object} eller kast). */
export const _setDocker44 = (fn) => { fakeDocker = fn; };
export const dockerAvailable44 = () => !!(fakeDocker || MOCK() || target());
class DockerError extends Error { constructor(msg, status = 502) { super(msg); this.status = status; } }

function dockerRaw(method, path, { timeout = 15_000, body } = {}) {
  if (fakeDocker) return Promise.resolve(fakeDocker(method, path, body)).then((r) => ({ status: r.status ?? 200, buf: Buffer.isBuffer(r.body) ? r.body : Buffer.from(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? null)) }));
  const t = target();
  if (!t) return Promise.reject(new DockerError('Docker-socketen er ikke montert', 503));
  return new Promise((resolve, reject) => {
    const req = httpRequest({ ...t, method, path: `/v1.41${path}`, headers: { Host: 'docker', ...(body ? { 'Content-Type': 'application/json' } : {}) }, timeout }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new DockerError('Docker svarte ikke i tide', 504)));
    req.on('error', (e) => {
      // Prompt 45: proxyen finnes ikke (ennå) – prøv socketen hvis den er montert direkte.
      const conn = ['ENOENT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ECONNRESET'].includes(e.code);
      const fb = dockerTarget45()?.fallbackSocket;
      if (conn && t.host && fb && socketPreferred <= Date.now()) { socketPreferred = Date.now() + 5 * 60_000; dockerRaw(method, path, { timeout, body }).then(resolve, reject); return; }
      reject(e instanceof DockerError ? e : new DockerError(conn ? `Fikk ikke kontakt med Docker (${t.host ? `proxyen ${t.host}:${t.port} svarer ikke` : 'socketen mangler'})` : `Docker: ${e.message}`, 503));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
async function dockerJson(method, path, opts) {
  const r = await dockerRaw(method, path, opts);
  if (r.status === 403) throw new DockerError('Docker-proxyen tillater ikke dette (sjekk CONTAINERS=1 og ALLOW_START/ALLOW_STOP/ALLOW_RESTARTS på homelab-docker)', 403);
  if (r.status === 404) throw new DockerError('Fant ikke containeren', 404);
  if (r.status >= 400) { let m = r.buf.toString('utf8').slice(0, 200); try { m = JSON.parse(m).message ?? m; } catch { /* tekst */ } throw new DockerError(`Docker svarte ${r.status}: ${m}`, r.status === 409 ? 409 : 502); }
  const t = r.buf.toString('utf8');
  return t ? JSON.parse(t) : null;
}
/** Docker-loggformatet uten TTY: 8 byte hode (strøm, 0,0,0, lengde) per bit. Med TTY: ren tekst. */
export function demux44(buf) {
  const out = [];
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf ?? ''));
  if (b.length >= 8 && [0, 1, 2].includes(b[0]) && b[1] === 0 && b[2] === 0 && b[3] === 0) {
    let i = 0, rest = { 1: '', 2: '' };
    while (i + 8 <= b.length) {
      const st = b[0 + i] === 2 ? 2 : 1, n = b.readUInt32BE(i + 4);
      const chunk = rest[st] + b.subarray(i + 8, i + 8 + n).toString('utf8');
      const lines = chunk.split('\n'); rest[st] = lines.pop();
      for (const l of lines) if (l.trim()) out.push({ stream: st === 2 ? 'stderr' : 'stdout', raw: l.replace(/\r$/, '') });
      i += 8 + n;
    }
    for (const st of [1, 2]) if (rest[st].trim()) out.push({ stream: st === 2 ? 'stderr' : 'stdout', raw: rest[st] });
    return out;
  }
  return b.toString('utf8').split('\n').filter((l) => l.trim()).map((raw) => ({ stream: 'stdout', raw: raw.replace(/\r$/, '') }));
}

/* ---------------- Demo (MOCK_DATA=1) ---------------- */

const MOCK_CT = [
  ['a1b2c3d4e5f6', 'homelab-os', 'homelab-os:local', 'running', 0],
  ['b2c3d4e5f6a1', 'cloudflared', 'cloudflare/cloudflared:2024.10.0', 'restarting', 7],
  ['c3d4e5f6a1b2', 'sonarr', 'lscr.io/linuxserver/sonarr:4.0.9', 'running', 0],
  ['d4e5f6a1b2c3', 'radarr', 'lscr.io/linuxserver/radarr:5.14.0', 'running', 0],
  ['e5f6a1b2c3d4', 'qbittorrent', 'lscr.io/linuxserver/qbittorrent:5.0.1', 'running', 1],
  ['f6a1b2c3d4e5', 'prowlarr', 'lscr.io/linuxserver/prowlarr:1.24.3', 'running', 0],
  ['a7b8c9d0e1f2', 'jellyfin', 'jellyfin/jellyfin:10.10.0', 'running', 0],
  ['b8c9d0e1f2a7', 'updater', 'homelab-updater:local', 'running', 0],
  ['c9d0e1f2a7b8', 'docker-socket-proxy', 'tecnativa/docker-socket-proxy:0.2.0', 'running', 0],
  ['d0e1f2a7b8c9', 'postgres', 'postgres:16-alpine', 'exited', 0],
];
const mockState = new Map(MOCK_CT.map(([id, , , st]) => [id, { state: st, startedAt: Date.now() - (st === 'running' ? 3 * 86400_000 : 120_000) }]));
const TEMPL = {
  'homelab-os': [['info', 'GET /api/health 200 3ms'], ['info', '[media] status sonarr ok 142 ms'], ['warn', '[kalender] Google svarte 429, prøver igjen om 30 s'], ['info', 'media.search jobId=4f1c indexers=8 ok=7 fail=1 ms=23140'], ['error', '[tracking] PostNord: fetch failed ETIMEDOUT 104.18.2.9:443'], ['info', 'GET /api/system/containers 200 18ms token=abc123secret']],
  cloudflared: [['error', 'ERR  error="Unable to reach the origin service. The service may be down or it may not be responding to traffic from cloudflared: dial tcp 127.0.0.1:8080: connect: connection refused" connIndex=0'], ['info', 'INF Registered tunnel connection connIndex=1 location=osl01'], ['warn', 'WRN Serve tunnel error error="context canceled" connIndex=2']],
  sonarr: [['info', '[Info] RssSyncService: RSS Sync Completed. Reports found: 412, Reports grabbed: 1'], ['warn', '[Warn] IndexerSearch: Unable to connect to indexer NZBgeek, check the log for more details (http://nzbgeek.info/api?t=tvsearch&apikey=0123456789abcdef)'], ['info', '[Info] DownloadedEpisodesImportService: Import completed']],
  radarr: [['info', '[Info] RefreshMovieService: Updating info for Sinners'], ['error', '[Error] DownloadClientCheck: Unable to communicate with qBittorrent. HTTP 401 Unauthorized']],
  qbittorrent: [['info', '(N) 2026-10-21T13:41:02 - Added new torrent. Torrent: "Slow.Horses.S06E03.1080p"'], ['warn', '(W) Tracker error: tracker.example.org: timed out']],
  prowlarr: [['info', '[Info] Application: Synced 11 indexers to Sonarr'], ['error', '[Error] Cardigann: 1337x - Cloudflare protection detected, add FlareSolverr']],
  jellyfin: [['info', '[INF] Playback start: Wicked on Chromecast by petter'], ['warn', '[WRN] Transcoding because of subtitle burn-in']],
  updater: [['info', '[updater] Klar. Prosjekt homelab-os i /opt/homelab-os']],
  'docker-socket-proxy': [['info', 'GET /v1.41/containers/json HTTP/1.1 200']],
  postgres: [['info', 'LOG:  database system is shut down'], ['error', 'FATAL:  could not write to file "pg_wal/xlogtemp.31": No space left on device']],
};
function mockLines(ct, sinceMs, untilMs = Date.now()) {
  const tpl = TEMPL[ct[1]] ?? [['info', 'ok']];
  const out = [];
  const step = ct[1] === 'cloudflared' ? 90_000 : 7 * 60_000;
  const start = Math.max(sinceMs, untilMs - 7 * 86400_000);
  for (let t = Math.floor(untilMs / step) * step, i = 0; t >= start && i < 2500; t -= step, i++) {
    const k = Math.floor(t / step);
    const [lv, msg] = tpl[k % tpl.length];
    out.push({ ts: t, stream: lv === 'error' ? 'stderr' : 'stdout', raw: `${new Date(t).toISOString()} ${msg.replace(/#N/g, String(k % 97))}`, lv });
  }
  return out.reverse();
}

/* ---------------- Containere ---------------- */

const SELF = () => String(process.env.HOSTNAME ?? '').slice(0, 12);
const colorOf = (state, health) => (state === 'running' ? (health === 'unhealthy' ? 'yellow' : 'green') : state === 'restarting' ? 'yellow' : 'red');
const uptimeText = (ms) => (ms < 60_000 ? 'under 1 min' : ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : ms < 86400_000 ? `${Math.floor(ms / 3600_000)} t` : `${Math.floor(ms / 86400_000)} d ${Math.floor((ms % 86400_000) / 3600_000)} t`);
async function rawContainers() {
  if (MOCK() && !fakeDocker) return MOCK_CT.map(([id, name, image, , restarts]) => { const s = mockState.get(id); return { Id: id.padEnd(64, '0'), Names: [`/${name}`], Image: image, State: s.state, Status: s.state === 'running' ? `Up ${uptimeText(Date.now() - s.startedAt)}` : s.state === 'restarting' ? 'Restarting (1) 12 seconds ago' : 'Exited (1) 2 minutes ago', _restarts: restarts, _startedAt: s.startedAt }; });
  return dockerJson('GET', '/containers/json?all=1');
}
const nameOf = (c) => String(c.Names?.[0] ?? c.Name ?? c.Id).replace(/^\//, '');
async function findContainer(idOrName) {
  const list = await rawContainers();
  const k = String(idOrName ?? '').replace(/^\//, '');
  return list.find((c) => c.Id.startsWith(k) || nameOf(c) === k) ?? null;
}
async function inspect(c) {
  if (c._restarts !== undefined) return { RestartCount: c._restarts, State: { StartedAt: new Date(c._startedAt).toISOString(), Status: c.State, Health: null, ExitCode: c.State === 'exited' ? 1 : 0, OOMKilled: false }, Config: { Tty: false, Env: ['TZ=Europe/Oslo', 'PUID=1000', 'API_KEY=hemmelig1234567'] }, HostConfig: { RestartPolicy: { Name: 'unless-stopped' } }, Mounts: [], Created: new Date(c._startedAt - 86400_000).toISOString(), Image: c.Image };
  return dockerJson('GET', `/containers/${c.Id}/json`);
}

/* ---------------- Logger ---------------- */

const SINCE = { '15m': 15 * 60_000, '1t': 3600_000, '1h': 3600_000, '24t': 86400_000, '24h': 86400_000, '1d': 86400_000, '7d': 7 * 86400_000 };
export function sinceMs44(v, now = Date.now()) {
  const s = String(v ?? '').trim();
  if (!s) return now - 3600_000;
  if (SINCE[s]) return now - SINCE[s];
  const m = s.match(/^(\d{1,4})\s*(m|min|t|h|d)$/i);
  if (m) return now - +m[1] * ({ m: 60_000, min: 60_000, t: 3600_000, h: 3600_000, d: 86400_000 }[m[2].toLowerCase()]);
  if (/^\d{9,13}$/.test(s)) return +s < 1e11 ? +s * 1000 : +s;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : now - 3600_000;
}
const tsOf = (raw) => { const m = String(raw).match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s?/); return m ? { ts: Date.parse(m[1]), rest: raw.slice(m[0].length) } : { ts: null, rest: raw }; };
const lineId = (ct, ts, msg) => createHash('sha1').update(`${ct}|${ts}|${msg}`).digest('hex').slice(0, 12);
function toLine(ct, x) {
  const { ts, rest } = tsOf(x.raw);
  const t = ts ?? x.ts ?? Date.now();
  // Demo-linjene har sin egen tid i teksten; Docker-tidsstempelet (timestamps=1) står først.
  const msg0 = x.ts && !ts ? x.raw : rest;
  const msg = maskLog44(msg0.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s/, '')).slice(0, 4000);
  const level = x.lv ?? levelOf44(msg, x.stream);
  return { id: lineId(nameOf(ct), t, msg), t: new Date(t).toISOString(), ts: t, level, ct: nameOf(ct), ctId: ct.Id.slice(0, 12), stream: x.stream, msg };
}
async function linesOf(ct, sinceT, tail = 2000) {
  if (ct._restarts !== undefined) return mockLines([ct.Id.slice(0, 12), nameOf(ct)], sinceT).map((x) => toLine(ct, x));
  const r = await dockerRaw('GET', `/containers/${ct.Id}/logs?stdout=1&stderr=1&timestamps=1&since=${Math.floor(sinceT / 1000)}&tail=${tail}`, { timeout: 20_000 });
  if (r.status >= 400) throw new DockerError(`Docker svarte ${r.status} på loggene til ${nameOf(ct)}`, 502);
  return demux44(r.buf).map((x) => toLine(ct, x));
}
function filterOf(q) {
  const lvRaw = String(q.level ?? 'all').toLowerCase();
  const level = { alle: 'all', all: 'all', 'info+': 'info', info: 'info', advarsler: 'warn', warn: 'warn', warning: 'warn', feil: 'error', error: 'error', debug: 'debug' }[lvRaw] ?? 'all';
  const limit = Math.max(1, Math.min(5000, parseInt(q.limit ?? '500', 10) || 500));
  return { ct: String(q.ct ?? q.container ?? '').trim() || 'all', since: String(q.since ?? '1h'), level, q: String(q.q ?? '').trim().slice(0, 200), limit };
}
const passes = (l, f) => (f.level === 'all' || LV[l.level] >= LV[f.level]) && (!f.q || l.msg.toLowerCase().includes(f.q.toLowerCase()) || l.ct.toLowerCase().includes(f.q.toLowerCase()));
/** Linjene for et filter, eldste først. */
export async function queryLogs44(q, now = Date.now()) {
  const f = filterOf(q);
  const list = await rawContainers();
  const cts = f.ct === 'all' ? list : list.filter((c) => c.Id.startsWith(f.ct) || nameOf(c) === f.ct);
  if (f.ct !== 'all' && !cts.length) throw new DockerError('Fant ikke containeren', 404);
  const sinceT = sinceMs44(f.since, now);
  const all = (await Promise.all(cts.map((c) => linesOf(c, sinceT).catch(() => [])))).flat().filter((l) => l.ts >= sinceT && passes(l, f)).sort((a, b) => a.ts - b.ts);
  const lines = all.slice(-f.limit);
  return { available: true, lines, total: all.length, truncated: all.length > lines.length, filter: f, containers: list.map(nameOf) };
}
export async function containersOut44(now = Date.now()) {
  const list = await rawContainers();
  const hour = await Promise.all(list.map((c) => linesOf(c, now - 3600_000, 1000).catch(() => [])));
  const items = await Promise.all(list.map(async (c, i) => {
    let ins = null; try { ins = await inspect(c); } catch { ins = null; }
    const started = ins?.State?.StartedAt ? Date.parse(ins.State.StartedAt) : null;
    const health = ins?.State?.Health?.Status ?? null;
    const [img, tag] = String(c.Image ?? '').split(/:(?=[^/:]+$)/);
    return { id: c.Id.slice(0, 12), name: nameOf(c), image: img, tag: tag ?? 'latest', state: c.State, status: c.Status, color: colorOf(c.State, health), startedAt: started ? new Date(started).toISOString() : null,
      uptime: c.State === 'running' && started ? uptimeText(now - started) : null, restarts: ins?.RestartCount ?? 0, health, oomKilled: !!ins?.State?.OOMKilled, exitCode: ins?.State?.ExitCode ?? null,
      errors1h: hour[i].filter((l) => l.level === 'error').length, warnings1h: hour[i].filter((l) => l.level === 'warn').length, self: !!SELF() && c.Id.startsWith(SELF()) };
  }));
  const worst = [...items].sort((a, b) => b.restarts - a.restarts)[0];
  return { available: true, containers: items,
    summary: { up: items.filter((x) => x.state === 'running').length, total: items.length, errors1h: items.reduce((a, x) => a + x.errors1h, 0), warnings1h: items.reduce((a, x) => a + x.warnings1h, 0),
      restarts: items.reduce((a, x) => a + x.restarts, 0), worst: worst?.restarts ? { name: worst.name, restarts: worst.restarts } : null, disk: await diskOf().catch(() => null) } };
}
let diskCache = null;
async function diskOf() {
  if (MOCK() && !fakeDocker) return { used: 412 * 1024 ** 3, text: '412 GB', path: '/var/lib/docker' };
  if (diskCache && Date.now() - diskCache.at < 10 * 60_000) return diskCache.v;
  const df = await dockerJson('GET', '/system/df', { timeout: 30_000 });
  const used = (df?.LayersSize ?? 0) + (df?.Volumes ?? []).reduce((a, v) => a + (v.UsageData?.Size > 0 ? v.UsageData.Size : 0), 0);
  const v = { used, text: used >= 1024 ** 3 ? `${Math.round(used / 1024 ** 3)} GB` : `${Math.round(used / 1024 ** 2)} MB`, path: '/var/lib/docker' };
  diskCache = { at: Date.now(), v };
  return v;
}
export async function groups44(q, now = Date.now()) {
  const hours = Math.max(1, Math.min(168, parseInt(q.hours ?? '24', 10) || 24));
  const r = await queryLogs44({ ct: q.ct, since: String(now - hours * 3600_000), level: q.level ?? 'warn', limit: 5000 }, now);
  const map = new Map();
  for (const l of r.lines) {
    const pattern = normalize44(l.msg), key = createHash('sha1').update(`${l.ct}|${pattern}`).digest('hex').slice(0, 12);
    const g = map.get(key) ?? { key, count: 0, ct: l.ct, level: l.level, message: l.msg, pattern, firstSeen: l.t, lastSeen: l.t };
    g.count++; g.lastSeen = l.t; g.message = l.msg; if (LV[l.level] > LV[g.level]) g.level = l.level;
    map.set(key, g);
  }
  const groups = [...map.values()].sort((a, b) => (LV[b.level] - LV[a.level]) || (b.count - a.count)).slice(0, 100)
    .map((g) => ({ ...g, countText: `×${g.count}`, explain: { method: 'POST', path: '/api/system/logs/explain', body: { line: g.message, ct: g.ct } } }));
  return { groups, hours, total: groups.reduce((a, g) => a + g.count, 0) };
}

/* ---------------- Glimt forklarer ---------------- */

const KNOWN = [
  ['connection-refused', /connection refused|ECONNREFUSED/i, (l) => { const p = l.match(/(?:127\.0\.0\.1|localhost|\b[\w.-]+):(\d{2,5})/); const port = p?.[1]; return { title: 'Tjenesten svarer ikke på porten', text: `${port ? `Ingen lytter på port ${port}` : 'Ingen lytter på adressen'} fra denne containeren.${/127\.0\.0\.1|localhost/.test(l) ? ' I Docker peker 127.0.0.1 på containeren selv, ikke på verten eller en annen container.' : ''}`, steps: [/127\.0\.0\.1|localhost/.test(l) ? `Bruk tjenestenavnet i stedet, f.eks. homelab-web:${port ?? '8080'} (navnet fra docker-compose.yml).` : 'Sjekk at tjenesten kjører (grønn prikk) og at porten stemmer.', 'Ligger tjenestene i samme Docker-nettverk? Se «networks» i docker-compose.yml.', 'Start tjenesten på nytt og se om feilen forsvinner.'] }; }],
  ['unauthorized', /\b401\b|unauthori[sz]ed|\b403\b|forbidden|invalid api key|feil api-nøkkel/i, () => ({ title: 'Feil nøkkel eller passord', text: 'Tjenesten avviste innloggingen (401/403). Nøkkelen, tokenet eller passordet stemmer ikke, eller IP-en er sperret.', steps: ['Kopier API-nøkkelen på nytt fra tjenesten (Settings → General → Security).', 'Lim den inn under Innstillinger → Integrasjoner og trykk Test tilkobling.', 'qBittorrent: for mange feil innlogginger sperrer IP-en en stund.'] })],
  ['timeout', /ETIMEDOUT|timed? ?out|tidsavbrudd|deadline exceeded|ESOCKETTIMEDOUT/i, () => ({ title: 'Tidsavbrudd', text: 'Den andre siden svarte ikke i tide. Den kan være nede, treg, eller nettet/DNS-en fungerer ikke fra containeren.', steps: ['Sjekk at tjenesten er oppe og svarer i nettleseren.', 'Prøv igjen om litt – ofte er det midlertidig.', 'Skjer det hele tiden: sjekk brannmur, VPN og DNS i containeren.'] })],
  ['oom', /OOMKilled|out of memory|exit code 137|\b137\b.*exit|Killed process/i, () => ({ title: 'Tom for minne (OOM)', text: 'Containeren ble drept fordi den brukte for mye minne (exit code 137).', steps: ['Se minnebruken under containeren (Minne).', 'Øk mem_limit i docker-compose.yml eller gi verten mer minne.', 'Jellyfin/Plex: slå av omkoding av 4K eller begrens antall samtidige strømmer.'] })],
  ['disk-full', /no space left on device|ENOSPC|disk full/i, () => ({ title: 'Disken er full', text: 'Det er ikke mer plass på disken containeren skriver til.', steps: ['Se diskbruken øverst (/var/lib/docker).', 'Rydd gamle bilder: docker image prune -a (bilder som ikke brukes).', 'Flytt nedlastinger eller media til en større disk.'] })],
  ['dns', /ENOTFOUND|EAI_AGAIN|getaddrinfo|no such host|could not resolve/i, () => ({ title: 'Fant ikke adressen (DNS)', text: 'Navnet på tjenesten kunne ikke slås opp.', steps: ['Sjekk skrivemåten på adressen.', 'Bruk tjenestenavnet fra docker-compose.yml når begge er i samme nettverk.', 'Sjekk DNS-innstillingene på verten (Pi-hole?).'] })],
  ['port-in-use', /EADDRINUSE|address already in use|bind: address/i, () => ({ title: 'Porten er allerede i bruk', text: 'En annen prosess eller container bruker samme port.', steps: ['Finn hvem som bruker porten (docker ps, eller ss -ltnp på verten).', 'Bytt port i docker-compose.yml (venstre side av «ports»).'] })],
  ['permission', /EACCES|permission denied|operation not permitted/i, () => ({ title: 'Mangler tilgang til en fil eller mappe', text: 'Containeren får ikke lese eller skrive en fil (feil eier eller rettigheter).', steps: ['Sjekk PUID/PGID i docker-compose.yml mot eieren av mappen (ls -ln).', 'chown -R 1000:1000 på mappen som er montert.'] })],
  ['db-locked', /database is locked|SQLITE_BUSY/i, () => ({ title: 'Databasen er låst', text: 'To prosesser skrev til samme SQLite-database samtidig.', steps: ['Vent litt – det løser seg ofte selv.', 'Ikke legg databasen på en nettverksdisk (SMB/NFS).'] })],
  ['tls', /certificate|x509|SSL|TLS handshake/i, () => ({ title: 'Problem med sertifikatet (TLS)', text: 'Den sikre tilkoblingen feilet: sertifikatet er utløpt, selvsignert eller passer ikke med navnet.', steps: ['Sjekk datoen og klokka på serveren.', 'Bruk http:// internt i Docker, eller legg til sertifikatet som klarert.'] })],
  ['cloudflare', /cloudflare protection|flaresolverr|cf-chl/i, () => ({ title: 'Cloudflare blokkerer indekseren', text: 'Indekseren ligger bak Cloudflare og krever en nettleser for å slippe inn.', steps: ['Legg til FlareSolverr i Prowlarr (Settings → Indexers → +).', 'Gi indekseren taggen flaresolverr.'] })],
];
/** Kjente mønstre uten LLM. → {pattern, title, text, steps} | null */
export function knownExplain44(line) { for (const [id, re, fn] of KNOWN) if (re.test(line)) return { pattern: id, ...fn(line) }; return null; }
let explainAi = null;
export const _setExplainAi44 = (fn) => { explainAi = fn; };
export async function explain44({ line, context, ct }, user) {
  const l = maskLog44(String(line ?? '').slice(0, 2000));
  if (!l.trim()) throw new DockerError('Mangler linjen', 400);
  const k = knownExplain44(l);
  if (k) return { source: 'pattern', ...k, line: l };
  const ctx = (Array.isArray(context) ? context : []).slice(-20).map((x) => maskLog44(String(typeof x === 'string' ? x : x?.msg ?? '').slice(0, 400)));
  const ai = explainAi ?? (MOCK() ? null : async (prompt) => { const { run } = await import('./ai-run.js'); const out = await run('glimt', { user, prompt, json: true, localOnly: true, numPredict: 300, title: 'Glimt · forklar logglinje' }); return out.data ?? JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}'); });
  if (ai) {
    try {
      const j = await ai(`Du er Glimt og hjelper med feilsøking på en hjemmeserver med Docker. Forklar på norsk bokmål, kort, hva denne logglinjen${ct ? ` fra containeren «${String(ct).slice(0, 40)}»` : ''} betyr og hva man gjør. Svar KUN med JSON {"title":"…","text":"…","steps":["…"]}.\nLinje: ${l}\n${ctx.length ? `Linjer rundt:\n${ctx.join('\n')}` : ''}`);
      if (j?.text) return { source: 'glimt', title: String(j.title ?? 'Glimt forklarer').slice(0, 120), text: String(j.text).slice(0, 1200), steps: (Array.isArray(j.steps) ? j.steps : []).slice(0, 5).map((x) => String(x).slice(0, 300)), line: l };
    } catch { /* faller tilbake */ }
  }
  return { source: 'none', title: 'Ingen kjent forklaring', text: 'Glimt kjenner ikke igjen denne linjen. Se på linjene rundt («Vis i sammenheng») for mer informasjon.', steps: ['Kopier med 20 linjer rundt og lim inn i Chat for en lengre forklaring.'], line: l };
}

/* ---------------- Handlinger ---------------- */

async function action44(id, act) {
  const c = await findContainer(id);
  if (!c) throw new DockerError('Fant ikke containeren', 404);
  if (act === 'stop' && SELF() && c.Id.startsWith(SELF())) throw new DockerError('Homelab kan ikke stoppe seg selv herfra. Bruk Start på nytt, eller docker compose på verten.', 409);
  if (c._restarts !== undefined) { const s = mockState.get(c.Id.slice(0, 12)); s.state = act === 'stop' ? 'exited' : 'running'; s.startedAt = Date.now(); }
  else await dockerJson('POST', `/containers/${c.Id}/${act}${act === 'stop' || act === 'restart' ? '?t=10' : ''}`, { timeout: 40_000 });
  const name = nameOf(c);
  return { ok: true, id: c.Id.slice(0, 12), name, action: act, message: { restart: `${name} starter på nytt`, stop: `${name} er stoppet`, start: `${name} er startet` }[act] };
}
const MASK_ENV = /KEY|TOKEN|SECRET|PASS|PWD|AUTH|COOKIE|CREDENTIAL|PRIVATE/i;
async function inspectOut(id) {
  const c = await findContainer(id);
  if (!c) throw new DockerError('Fant ikke containeren', 404);
  const x = await inspect(c);
  return { id: c.Id.slice(0, 12), name: nameOf(c), image: c.Image, created: x.Created ?? null, state: x.State ? { status: x.State.Status, startedAt: x.State.StartedAt, exitCode: x.State.ExitCode, oomKilled: !!x.State.OOMKilled, health: x.State.Health?.Status ?? null } : null,
    restartPolicy: x.HostConfig?.RestartPolicy?.Name ?? null, restarts: x.RestartCount ?? 0,
    ports: Object.entries(x.NetworkSettings?.Ports ?? {}).map(([k, v]) => `${(v ?? []).map((b) => `${b.HostIp || '0.0.0.0'}:${b.HostPort}`).join(', ') || '–'} → ${k}`),
    mounts: (x.Mounts ?? []).map((m) => ({ source: m.Source, destination: m.Destination, rw: m.RW !== false })),
    env: (x.Config?.Env ?? []).map((e) => { const i = e.indexOf('='); const k = i < 0 ? e : e.slice(0, i); return MASK_ENV.test(k) ? `${k}=••••` : maskLog44(e); }),
    labels: Object.fromEntries(Object.entries(x.Config?.Labels ?? {}).filter(([k]) => /^com\.docker\.compose\.(project|service)$|^org\.opencontainers\.image\.(version|source)$/.test(k))) };
}
async function detailOut(id) {
  const c = await findContainer(id);
  if (!c) throw new DockerError('Fant ikke containeren', 404);
  const list = await containersOut44();
  const item = list.containers.find((x) => x.id === c.Id.slice(0, 12));
  let cpu = null, mem = null;
  if (c._restarts !== undefined) { cpu = { pct: c.State === 'running' ? 3.4 : 0, text: c.State === 'running' ? '3,4 %' : '0 %' }; mem = { used: 312 * 1024 ** 2, limit: 2 * 1024 ** 3, pct: 15, text: '312 MB av 2 GB' }; }
  else if (c.State === 'running') {
    try {
      const s = await dockerJson('GET', `/containers/${c.Id}/stats?stream=false`, { timeout: 10_000 });
      const cd = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0), sd = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
      const n = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
      const pct = sd > 0 ? Math.round((cd / sd) * n * 1000) / 10 : 0;
      cpu = { pct, text: `${String(pct).replace('.', ',')} %` };
      const used = (s.memory_stats?.usage ?? 0) - (s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0), limit = s.memory_stats?.limit ?? 0;
      mem = { used, limit, pct: limit ? Math.round((used / limit) * 100) : null, text: `${Math.round(used / 1024 ** 2)} MB${limit ? ` av ${Math.round(limit / 1024 ** 3)} GB` : ''}` };
    } catch { /* stats er valgfritt */ }
  }
  return { container: item, cpu, mem };
}

/* ---------------- Tomtilstand ---------------- */

export const SETUP44 = {
  title: 'Docker er ikke koblet til',
  text: 'Homelab trenger lesetilgang til Docker for å vise containere og logger. Kjør helst via docker-socket-proxy, så Homelab aldri får full tilgang til Docker.',
  steps: ['docker-socket-proxy ligger i docker-compose.yml (profil «logs»).', 'Legg DOCKER_HOST=tcp://docker-socket-proxy:2375 i .env.', 'Kjør docker compose --profile logs up -d og åpne Logger igjen.'],
  compose: 'docker-socket-proxy:\n  profiles: [logs]\n  image: tecnativa/docker-socket-proxy:0.2.0\n  environment:\n    CONTAINERS: 1\n    INFO: 1\n    SYSTEM: 1\n    POST: 1\n    ALLOW_START: 1\n    ALLOW_STOP: 1\n    ALLOW_RESTARTS: 1\n  volumes:\n    - /var/run/docker.sock:/var/run/docker.sock:ro\n  restart: unless-stopped\n# og på os-tjenesten: environment: DOCKER_HOST: tcp://docker-socket-proxy:2375',
  alt: 'Uten proxy: monter - /var/run/docker.sock:/var/run/docker.sock:ro på os-tjenesten (gir mer tilgang enn nødvendig).',
};
const unavailable = (extra = {}) => ({ available: false, setup: SETUP44, ...extra });

/* ---------------- Varsel: container som starter på nytt hele tiden ---------------- */

const restartSeen = new Map();
export async function restartWatch44(now = Date.now()) {
  if (!dockerAvailable44()) return [];
  const sent = [];
  let out; try { out = await containersOut44(now); } catch { return []; }
  for (const x of out.containers) {
    const h = (restartSeen.get(x.id) ?? []).filter((e) => now - e.at < 10 * 60_000);
    if (!h.length || h[h.length - 1].n !== x.restarts) h.push({ at: now, n: x.restarts });
    restartSeen.set(x.id, h);
    const delta = h[h.length - 1].n - h[0].n;
    if (delta > 3 && !h.some((e) => e.sent)) {
      h[h.length - 1].sent = true;
      for (const u of listUsers().filter((y) => y.role === 'admin')) notifyUser(u.id, { title: `${x.name} starter på nytt hele tiden`, body: `${delta} omstarter de siste 10 minuttene. Se Logger.`, url: '/#/innstillinger/logger', tag: `restart-${x.id}`, category: 'system' }).catch(() => {});
      sent.push(x.name);
    }
  }
  return sent;
}
let watchTimer = null;
export function startLogs44() {
  if (watchTimer || process.env.NODE_ENV === 'test' || MOCK()) return;
  watchTimer = setInterval(() => restartWatch44().catch(() => {}), 60_000);
  watchTimer.unref?.();
}

/* ---------------- Ruter ---------------- */

export const logs44Api = new Hono();
// Bare admin (økt eller admin-app-token). Handlinger krever økt eller token med finance:write.
// Bare egne stier (appen er montert på /api/system, der også /update ligger).
const auth44 = async (c, next) => {
  let u = sessionUser(c), session = !!u;
  const write = c.req.method !== 'GET';
  if (!u && bearerOk(c, write ? 'finance:write' : 'finance:read')) u = c.get('user');
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(u)) return c.json({ error: 'Loggene er serverinfrastruktur og vises bare for administratorer', restricted: true }, 403);
  if (c.get('actor')) return c.json({ error: 'Ikke tilgjengelig mens du er logget inn som en annen bruker' }, 403);
  c.set('user', u); c.set('session', session);
  await next();
};
for (const p of ['/containers', '/containers/*', '/logs', '/logs/*']) logs44Api.use(p, auth44);
const fail = (c, e) => c.json({ error: e.message }, e.status && e.status >= 400 && e.status < 600 ? e.status : 502);
const W = (fn, empty) => async (c) => { if (!dockerAvailable44()) return c.json(unavailable(empty)); try { return c.json(await fn(c)); } catch (e) { if (e.status === 503) return c.json(unavailable({ ...empty, error: e.message })); return fail(c, e); } };

logs44Api.get('/containers', W(() => containersOut44(), { containers: [], summary: null }));
logs44Api.get('/containers/:id', W((c) => detailOut(c.req.param('id')), { container: null }));
logs44Api.get('/containers/:id/inspect', W((c) => inspectOut(c.req.param('id')), {}));
logs44Api.post('/containers/:id/:act{restart|stop|start}', async (c) => {
  if (!dockerAvailable44()) return c.json(unavailable({ error: SETUP44.title }), 503);
  const b = await c.req.json().catch(() => ({}));
  if (b?.confirm !== true) return c.json({ error: 'Bekreft handlingen ({confirm:true})', needsConfirm: true }, 400);
  try { const r = await action44(c.req.param('id'), c.req.param('act')); console.log(`docker.${r.action} container=${r.name} by=${c.get('user')}`); return c.json(r); } catch (e) { return fail(c, e); }
});
logs44Api.get('/logs', W((c) => queryLogs44(c.req.query()), { lines: [], total: 0 }));
logs44Api.get('/logs/groups', W((c) => groups44(c.req.query()), { groups: [], total: 0 }));
logs44Api.post('/logs/explain', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  try { return c.json(await explain44(b ?? {}, c.get('user'))); } catch (e) { return fail(c, e); }
});
logs44Api.get('/logs/download', async (c) => {
  if (!dockerAvailable44()) return c.json(unavailable(), 503);
  try {
    const r = await queryLogs44({ ...c.req.query(), limit: c.req.query('limit') ?? '5000' });
    const body = r.lines.map((l) => `${l.t} ${l.level.toUpperCase().padEnd(5)} ${l.ct} ${l.msg}`).join('\n') + '\n';
    const name = `homelab-${(r.filter.ct === 'all' ? 'alle' : r.filter.ct).replace(/[^\w.-]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.log`;
    return c.body(body, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  } catch (e) { return fail(c, e); }
});
logs44Api.get('/logs/stream', async (c) => {
  if (!dockerAvailable44()) return c.json(unavailable(), 503);
  const f = filterOf(c.req.query());
  let cts;
  try { const list = await rawContainers(); cts = f.ct === 'all' ? list : list.filter((x) => x.Id.startsWith(f.ct) || nameOf(x) === f.ct); } catch (e) { return fail(c, e); }
  return streamSSE(c, async (s) => {
    let open = true;
    const send = (l) => { if (open && passes(l, f)) s.writeSSE({ event: 'line', id: l.id, data: JSON.stringify(l) }).catch(() => { open = false; }); };
    const reqs = [];
    const ping = setInterval(() => s.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => { open = false; }), 15_000);
    if ((MOCK() && !fakeDocker) || fakeDocker) {
      // Demo: en ny linje hvert 2. sekund fra en tilfeldig container.
      const tick = setInterval(() => { const ct = cts[Math.floor(Math.random() * cts.length)]; if (!ct) return; const tpl = TEMPL[nameOf(ct)] ?? [['info', 'ok']]; const [lv, msg] = tpl[Math.floor(Math.random() * tpl.length)]; send(toLine(ct, { ts: Date.now(), stream: lv === 'error' ? 'stderr' : 'stdout', raw: msg, lv })); }, 2000);
      reqs.push({ destroy: () => clearInterval(tick) });
    } else {
      const t = target();
      for (const ct of cts.slice(0, 20)) {
        const req = httpRequest({ ...t, method: 'GET', path: `/v1.41/containers/${ct.Id}/logs?stdout=1&stderr=1&timestamps=1&follow=1&since=${Math.floor(Date.now() / 1000)}`, headers: { Host: 'docker' } }, (res) => {
          res.on('data', (d) => { for (const x of demux44(d)) send(toLine(ct, x)); });
        });
        req.on('error', () => {});
        req.end();
        reqs.push(req);
      }
    }
    await new Promise((resolve) => s.onAbort(resolve));
    open = false; clearInterval(ping);
    for (const r of reqs) { try { r.destroy(); } catch { /* */ } }
  });
});

/* ---------------- Prompt 52 (SRV52): «Start» på Homelab-kortet i briefen ---------------- */
// Bare admin (sjekkes i srv52.js). Samme faste proxy-handling som Start-knappen i Logger (POST /containers/:id/start, ALLOW_START).
export const docker52 = { start: (id) => action44(id, 'start') };

/* ---------------- Prompt 51 (OBS51): drift og selvreparasjon ---------------- */
// Bare lesing (GET) og omstart – samme proxy og samme regler som over. Ingen nye Docker-handlinger.
export const docker51 = {
  list: () => rawContainers(),
  get: (path, opts) => dockerJson('GET', path, opts),
  restart: (id) => action44(id, 'restart'),
  logs: async (id, sinceT, tail = 200) => { const c = await findContainer(id); return c ? linesOf(c, sinceT, tail) : []; },
  nameOf, self: SELF,
};
