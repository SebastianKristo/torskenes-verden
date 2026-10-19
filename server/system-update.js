// Oppdater systemet fra appen (Innstillinger → System → Oppdatering). Montert under /api/system/update.
//
// Hovedserveren har IKKE Docker-tilgang. Selve jobben gjøres av den lille updater-containeren (deploy/updater), som
// har Docker-socketen. De snakker bare via filer i data/update/:
//   request.json   skrevet her: {id, requestedBy, at}. Ingen repo, branch eller kommando – updateren bestemmer det selv.
//   status.json    skrevet av updateren: {id, state, step, startedAt, finishedAt, error, sha, version}
//   log.txt        updaterens logg for siste kjøring
//   heartbeat      updaterens tidsstempel (sekunder), skrives hvert 5. s
//   installed.json {sha, version, at} etter en vellykket oppdatering
//
// Tilgang: alt krever admin. GET virker også med app-token (appene viser versjonen), men å starte en oppdatering krever
// økt i nettleseren og passordet på nytt. Databasen kopieres til data/backups/pre-update-*.db før forespørselen skrives.
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { sessionUser, isAdmin, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';

const DATA = resolve(config.dataDir);
const UPD = join(DATA, 'update');
const BACKUPS = join(DATA, 'backups');
const KEEP_BACKUPS = 5;
const HEARTBEAT_MAX_MS = 30_000;
const LATEST_TTL = 10 * 60_000;
const RUNNING = new Set(['downloading', 'building', 'restarting']);
// Bare til visning. Updateren leser sine egne UPDATE_REPO/UPDATE_BRANCH og tar aldri imot noe herfra.
const REPO = /^[\w.-]+\/[\w.-]+$/.test(process.env.UPDATE_REPO ?? '') ? process.env.UPDATE_REPO : 'SebastianKristo/torskenes-verden';
const BRANCH = /^[\w./-]+$/.test(process.env.UPDATE_BRANCH ?? '') && !process.env.UPDATE_BRANCH.includes('..') ? process.env.UPDATE_BRANCH : 'main';
const CHANGELOG = resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md');

let fetcher = (...a) => fetch(...a);
/** Bare for tester: bytt ut fetch (GitHub). */
export const _setFetch = (fn) => { fetcher = fn; latest = null; };

/* ---------------- CHANGELOG ---------------- */

export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0), pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}

const clean = (s) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();

/** «## [4.20.0] – 19.10.2026 · tittel» + punktlister → [{version, date, title, items}]. Bare toppnivåpunkter tas med. */
export function parseChangelog(text) {
  const out = [];
  let cur = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = line.match(/^##\s*\[(\d+\.\d+\.\d+)\]\s*(?:[–-]\s*([^·]*?))?\s*(?:·\s*(.*))?$/);
    if (h) { cur = { version: h[1], date: (h[2] ?? '').trim() || null, title: (h[3] ?? '').trim() || null, items: [] }; out.push(cur); continue; }
    if (/^#\s/.test(line)) { cur = null; continue; }
    const it = cur && line.match(/^[-*]\s+(.+)$/);
    if (it && cur.items.length < 40) cur.items.push(clean(it[1]).slice(0, 400));
  }
  return out;
}

export const newerSections = (sections, installed) => sections.filter((s) => !installed || compareVersions(s.version, installed) > 0);

function ownVersion() {
  try { return parseChangelog(readFileSync(CHANGELOG, 'utf8'))[0]?.version ?? null; } catch { return null; }
}

/* ---------------- Filer i data/update ---------------- */

const readJson = (name) => { try { return JSON.parse(readFileSync(join(UPD, name), 'utf8')); } catch { return null; } };

function heartbeatAge() {
  const f = join(UPD, 'heartbeat');
  try {
    const s = Number(String(readFileSync(f, 'utf8')).trim());
    const t = Number.isFinite(s) && s > 0 ? (s < 1e11 ? s * 1000 : s) : statSync(f).mtimeMs;
    return Date.now() - t;
  } catch { return Infinity; }
}
export const updaterAvailable = () => heartbeatAge() < HEARTBEAT_MAX_MS;

export function readStatus() {
  const s = readJson('status.json');
  if (!s || typeof s !== 'object') return { state: 'idle' };
  const str = (v, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : null);
  return { id: str(s.id, 80), state: str(s.state, 20) || 'idle', step: str(s.step, 200), startedAt: Number(s.startedAt) || null,
    finishedAt: Number(s.finishedAt) || null, error: str(s.error), sha: str(s.sha, 40), version: str(s.version, 20) };
}

function readLog(lines) {
  let t;
  try { t = readFileSync(join(UPD, 'log.txt'), 'utf8'); } catch { return ''; }
  return lines ? t.split('\n').slice(-lines - 1).join('\n') : t;
}

// Venter updateren på å plukke opp en forespørsel vi allerede har skrevet? (Den sjekker hvert 5. s.)
function pendingRequest(status) {
  const r = readJson('request.json');
  return !!r?.id && r.id !== status.id && Date.now() - Number(r.at || 0) < 2 * 60_000;
}
const isRunning = (status = readStatus()) => RUNNING.has(status.state) || pendingRequest(status);

function installed() {
  const version = ownVersion();
  const i = readJson('installed.json');
  // installed.json gjelder bare når den hører til versjonen som faktisk kjører (update.sh skriver den ikke).
  const ok = i && (!version || i.version === version);
  return { version, sha: ok && typeof i.sha === 'string' ? i.sha.slice(0, 40) : null, at: ok ? Number(i.at) || null : null };
}

/* ---------------- GitHub ---------------- */

let latest = null; // {at, value, error}
async function gh(url, accept) {
  const r = await fetcher(url, { headers: { 'User-Agent': 'homelab-os', Accept: accept }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`GitHub svarte ${r.status}`);
  return r;
}
async function fetchLatest() {
  try {
    const commit = await (await gh(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`, 'application/vnd.github+json')).json();
    if (!/^[0-9a-f]{40}$/.test(commit?.sha ?? '')) throw new Error('Uventet svar fra GitHub');
    let sections = [];
    try { sections = parseChangelog(await (await gh(`https://raw.githubusercontent.com/${REPO}/${commit.sha}/CHANGELOG.md`, 'text/plain')).text()); } catch { /* uten endringsliste */ }
    const value = { version: sections[0]?.version ?? null, sha: commit.sha, date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null,
      message: String(commit.commit?.message ?? '').split('\n')[0].slice(0, 200), sections };
    latest = { at: Date.now(), ttl: LATEST_TTL, value, error: null };
  } catch (e) {
    latest = { at: Date.now(), ttl: 60_000, value: latest?.value ?? null, error: e.name === 'TimeoutError' ? 'GitHub svarte ikke' : e.message };
  }
  return latest;
}
const getLatest = async (force) => (!force && latest && Date.now() - latest.at < latest.ttl ? latest : fetchLatest()) // feil prøves igjen etter 1 min;

/* ---------------- Backup ---------------- */

export async function preUpdateBackup() {
  mkdirSync(BACKUPS, { recursive: true });
  const name = `pre-update-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  await db.backup(join(BACKUPS, name));
  const old = readdirSync(BACKUPS).filter((f) => /^pre-update-[\w-]+\.db$/.test(f)).sort().reverse().slice(KEEP_BACKUPS);
  for (const f of old) { try { unlinkSync(join(BACKUPS, f)); } catch { /* prøver igjen neste gang */ } }
  return name;
}

/* ---------------- Sanntid ---------------- */

let watch = null, lastSent = '';
function watchStatus() {
  if (watch) return;
  const started = Date.now();
  watch = setInterval(() => {
    const s = readStatus();
    const key = `${s.id}|${s.state}|${s.step}`;
    if (key !== lastSent) { lastSent = key; broadcast('system-update', { status: s }); }
    if ((!isRunning(s) && Date.now() - started > 10_000) || Date.now() - started > 30 * 60_000) { clearInterval(watch); watch = null; }
  }, 2000);
  watch.unref?.();
}
if (process.env.NODE_ENV !== 'test' && isRunning()) watchStatus();

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Samme form som c.get('access') i FinansHub: økt i nettleseren eller app-token (bare lesing).
api.use('*', async (c, next) => {
  let user = sessionUser(c), session = !!user;
  if (!user && bearerOk(c, 'finance:read')) user = c.get('user');
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(user)) return c.json({ error: 'Bare administratorer kan oppdatere systemet' }, 403);
  c.set('user', user);
  c.set('access', { user, session, admin: true });
  await next();
});

async function overview(c, force) {
  const a = c.get('access');
  const status = readStatus();
  const inst = installed();
  const l = await getLatest(force);
  const lv = l.value;
  const available = updaterAvailable();
  const running = isRunning(status);
  const updateAvailable = !!lv && (inst.sha && lv.sha ? inst.sha !== lv.sha : !!lv.version && !!inst.version && compareVersions(lv.version, inst.version) > 0);
  let reason = null;
  if (!available) reason = 'Oppdatering fra appen er ikke satt opp. Kjør update.sh én gang fra Proxmox for å slå det på.';
  else if (running) reason = 'En oppdatering pågår allerede.';
  else if (!a.session) reason = 'Oppdatering må startes fra nettleseren.';
  return c.json({
    available, installed: inst,
    latest: lv ? { version: lv.version, sha: lv.sha, date: lv.date, message: lv.message } : null,
    latestError: l.error, checkedAt: l.at, repo: REPO, branch: BRANCH,
    updateAvailable,
    changes: lv ? newerSections(lv.sections, inst.version).map(({ version, date, title, items }) => ({ version, date, title, items })) : [],
    status, running,
    log: status.state !== 'idle' ? readLog(60) : undefined,
    canStart: !reason, reason,
  });
}

api.get('/', (c) => overview(c, false));
api.post('/check', (c) => overview(c, true));
api.get('/log', (c) => c.text(readLog(0), 200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }));

api.post('/start', async (c) => {
  const a = c.get('access');
  if (!a.session) return c.json({ error: 'Oppdatering må startes fra nettleseren' }, 403);
  // JSON-kropp kreves (en vanlig skjema-POST fra et annet nettsted kan ikke sette den uten CORS-forespørsel).
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  if (!checkPassword(a.user, b?.password)) { loginFailed(ip); return c.json({ error: 'Feil passord' }, 403); }
  loginSucceeded(ip);
  if (!updaterAvailable()) return c.json({ error: 'Oppdatering fra appen er ikke satt opp. Kjør update.sh én gang fra Proxmox for å slå det på.' }, 409);
  if (isRunning()) return c.json({ error: 'En oppdatering pågår allerede' }, 409);
  let backup;
  try { backup = await preUpdateBackup(); } catch (e) {
    console.error('[system-update] backup feilet:', e.message);
    return c.json({ error: `Kunne ikke ta backup av databasen, oppdateringen er ikke startet: ${e.message}` }, 500);
  }
  // Bare id, hvem og når. Alt annet i kroppen ignoreres.
  const req = { id: randomUUID(), requestedBy: String(a.user).slice(0, 64), at: Date.now() };
  mkdirSync(UPD, { recursive: true });
  const tmp = join(UPD, `.request-${req.id}.tmp`);
  writeFileSync(tmp, JSON.stringify(req), { mode: 0o644 });
  renameSync(tmp, join(UPD, 'request.json'));
  console.warn(`[system-update] oppdatering ${req.id} startet av ${req.requestedBy} fra ${ip}, backup ${backup}`);
  watchStatus();
  return c.json({ ok: true, id: req.id, backup });
});

export const _paths = { UPD, BACKUPS };
export const _hasRequest = () => existsSync(join(UPD, 'request.json'));
export default api;
