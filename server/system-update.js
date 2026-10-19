// Oppdater systemet fra appen (Innstillinger → System → Oppdatering). Montert under /api/system/update.
//
// Hovedserveren har IKKE Docker-tilgang. Selve jobben gjøres av den lille updater-containeren (deploy/updater), som
// har Docker-socketen. De snakker bare via filer i data/update/:
//   request.json   skrevet her: {id, requestedBy, at} (oppdatering) eller {id, requestedBy, at, action:'rollback'}.
//                  Ingen repo, branch, sha eller kommando – updateren bestemmer det selv.
//   status.json    skrevet av updateren: {id, state, step, action, startedAt, finishedAt, error, sha, version}
//   history.json   skrevet av updateren: {entries:[{sha, version, at}]} (vellykkede installasjoner, nyeste først). Ved rollback
//                  laster updateren ned entries[1].sha. Serveren leser bare versjonene herfra (for «Gjenopprett 2.3.1»).
//   log.txt        updaterens logg for siste kjøring
//   heartbeat      updaterens tidsstempel (sekunder), skrives hvert 5. s
//   installed.json {sha, version, at} etter en vellykket oppdatering
//
// Tilgang: alt krever admin. GET virker også med app-token (appene viser versjonen). Å starte en oppdatering krever
// passordet på nytt, og enten økt i nettleseren eller (prompt 30) et admin-app-token med finance:write eller bredere.
// Samme sperre mot gjentatte forsøk som innloggingen (429). Databasen kopieres til data/backups/pre-update-*.db før
// forespørselen skrives, også ved rollback – men den gjenopprettes ikke automatisk (data-migreringer går bare fremover).
//
// Prompt 30 (SERVER30), claude-code-oppdatering-mobil.md:
//   GET  /api/system/version          → {current, latest, notes[], publishedAt, updateAvailable}
//   GET  /api/system/update/status    → {state, step, action, error, steps:[{key, label, state}], pct, running, id, version}
//        steps: download | backup | install | restart, state: pending | active | done | failed. pct er grove anslag.
//   GET/PUT /api/system/update/settings {auto_update (av), notify_updates (på)} → samme form
//   POST /api/system/update/rollback {password} → {ok, id, backup, target:{version}}  (409 uten tidligere versjon)
//   Bakgrunn: ny versjon sjekkes hver 6. time. Er notify_updates på og versjonen ikke varslet før, sendes realtime
//   «system-update-available» (med title/body for push) til administratorene. auto_update: kl. 03:30–03:40 Europe/Oslo
//   (etter nattlig backup kl. 03:00) skrives en vanlig forespørsel hvis ny versjon finnes og updateren er tilgjengelig.
//
// Prompt 31 (SERVER31), claude-code-system-oppdatering-nordlys.md – Nordlys OS:
//   Brukervalget require_password (av) i /settings. POST /start og /rollback krever fortsatt admin (økt eller admin-token
//   med finance:write), men passord BARE når require_password er på: {password} eller {reauthToken} fra
//   POST /api/auth/reauth (engangstoken, 5 min, bundet til brukeren – for Face ID/fingeravtrykk i appene).
//   Endring av bryteren logges (console + kv update_audit, vises som settingsLog i GET /).
//   GET /api/system/version: + name 'Nordlys OS', codename 'Nordlys', tagline, sizeBytes (release-tarball fra GitHub
//   eller null), notes uten tomme punkter («**Kalender:**» med underpunkter blir «Kalender: a. b.», uten dem hoppes det over).
//   Varsel om ny versjon: «Nordlys 4.22 er klar» (realtime + notifyUser til administratorene: Web Push og kø).
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { sessionUser, isAdmin, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';
import { listUsers } from './auth.js';
import { consumeReauth } from './reauth.js';
import { notifyUser } from './notify.js';

export const OS_NAME = 'Nordlys OS', OS_CODENAME = 'Nordlys', OS_TAGLINE = 'Lys i mørket, kjørt hjemme.';
/** «4.22.0» → «Nordlys 4.22» */
export const shortName = (v) => `${OS_CODENAME}${v ? ' ' + String(v).split('.').slice(0, 2).join('.') : ''}`;

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
// Prompt 31: et toppunkt som bare er en overskrift («**Kalender:**») er tomt alene. Underpunktene slås da sammen inn i det
// («Kalender: Nytt Nå/Neste-kort. Ukenummer i Måned.»); uten underpunkter hoppes det over. Andre underpunkter tas ikke med.
const headingOnly = (t) => /^[^.!?]{1,60}:$/.test(t);
const sentence = (t) => (/[.!?…]$/.test(t) ? t : t + '.');
export function parseChangelog(text) {
  const out = [];
  let cur = null, head = null;
  const flush = () => {
    if (!head) return;
    if (head.subs.length && cur.items.length < 40) cur.items.push(`${head.text} ${head.subs.map(sentence).join(' ')}`.slice(0, 400));
    head = null;
  };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = line.match(/^##\s*\[(\d+\.\d+\.\d+)\]\s*(?:[–-]\s*([^·]*?))?\s*(?:·\s*(.*))?$/);
    if (h) { if (cur) flush(); cur = { version: h[1], date: (h[2] ?? '').trim() || null, title: (h[3] ?? '').trim() || null, items: [] }; out.push(cur); continue; }
    if (/^#\s/.test(line)) { if (cur) flush(); cur = null; continue; }
    if (!cur) continue;
    const it = line.match(/^[-*]\s+(.+)$/);
    if (it) {
      flush();
      const t = clean(it[1]);
      if (!t || /^[-–:.\s]*$/.test(t)) continue; // tomt punkt
      if (headingOnly(t)) { head = { text: t, subs: [] }; continue; }
      if (cur.items.length < 40) cur.items.push(t.slice(0, 400));
      continue;
    }
    const sub = head && line.match(/^\s+[-*]\s+(.+)$/);
    if (sub) { const t = clean(sub[1]); if (t) head.subs.push(t); }
  }
  if (cur) flush();
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
  return { id: str(s.id, 80), state: str(s.state, 20) || 'idle', step: str(s.step, 200), action: s.action === 'rollback' ? 'rollback' : 'update', startedAt: Number(s.startedAt) || null,
    finishedAt: Number(s.finishedAt) || null, error: str(s.error), sha: str(s.sha, 40), version: str(s.version, 20) };
}

// Fremdrift for banneret: fire steg og en grov prosent. Backupen tas av serveren før forespørselen skrives, så den er
// ferdig når updateren begynner å installere.
const STEP_KEYS = [['download', 'Laster ned'], ['backup', 'Tar backup før oppdatering'], ['install', 'Installerer på hjemmeserveren'], ['restart', 'Starter tjenestene på nytt']];
const STATE_AT = { queued: [0, 3], downloading: [0, 15], building: [2, 55], restarting: [3, 85] };
export function progressOf(status, pending = false) {
  let state = status.state;
  if (pending) state = 'queued';
  const done = state === 'done';
  let at = STATE_AT[state]?.[0] ?? (done ? 4 : -1);
  if (state === 'failed') {
    // Hvor stoppet det? Gjettes fra steg-teksten.
    const t = String(status.step ?? '') + ' ' + String(status.error ?? '');
    at = /start/i.test(t) && !/laster|nedlast|github/i.test(t) ? 3 : /bygg|build|kopier|pakke/i.test(t) ? 2 : 0;
  }
  const steps = STEP_KEYS.map(([key, label], i) => ({ key, label,
    state: done || i < at ? 'done' : i === at ? (state === 'failed' ? 'failed' : 'active') : 'pending' }));
  const pct = done ? 100 : state === 'failed' ? (STATE_AT[['downloading', 'downloading', 'building', 'restarting'][at]]?.[1] ?? 0) : STATE_AT[state]?.[1] ?? 0;
  return { steps, pct };
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
export function statusOut(status = readStatus()) {
  const pending = pendingRequest(status);
  const req = pending ? readJson('request.json') : null;
  return { ...status, ...(pending ? { state: 'queued', step: 'Venter på updateren', action: req?.action === 'rollback' ? 'rollback' : 'update', error: null } : {}), ...progressOf(status, pending), running: RUNNING.has(status.state) || pending };
}

// Updaterens historikk: bare versjonene leses (sha sendes aldri videre som instruks).
function rollbackTarget() {
  const h = readJson('history.json');
  const e = Array.isArray(h?.entries) ? h.entries.filter((x) => x && /^[0-9a-f]{40}$/.test(String(x.sha ?? ''))) : [];
  return e.length >= 2 ? { version: typeof e[1].version === 'string' ? e[1].version.slice(0, 20) : null, at: Number(e[1].at) || null } : null;
}

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
// Prompt 31: størrelsen på release-tarballen (GitHub-API, siste release). Egen cache (1 t), null når den ikke finnes.
let release = null; // {at, sizeBytes}
export async function releaseSize(force = false) {
  if (!force && release && Date.now() - release.at < (release.sizeBytes == null ? 10 * 60_000 : 3_600_000)) return release.sizeBytes;
  let sizeBytes = null;
  try {
    const r = await (await gh(`https://api.github.com/repos/${REPO}/releases/latest`, 'application/vnd.github+json')).json();
    const a = (Array.isArray(r?.assets) ? r.assets : []).find((x) => /\.(tar\.gz|tgz)$/i.test(String(x?.name ?? '')));
    sizeBytes = Number.isFinite(Number(a?.size)) && Number(a.size) > 0 ? Number(a.size) : null;
  } catch { sizeBytes = null; }
  release = { at: Date.now(), sizeBytes };
  return sizeBytes;
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
    if (key !== lastSent) { lastSent = key; broadcast('system-update', { status: statusOut(s) }); }
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

function availability(inst, lv) {
  return !!lv && (inst.sha && lv.sha ? inst.sha !== lv.sha : !!lv.version && !!inst.version && compareVersions(lv.version, inst.version) > 0);
}
// Kan denne forespørselen starte en jobb? Økt i nettleseren, eller admin-app-token med finance:write (eller bredere).
const canWrite = (c) => c.get('access').session || bearerOk(c, 'finance:write');

async function overview(c, force) {
  const status = readStatus();
  const inst = installed();
  const l = await getLatest(force);
  const lv = l.value;
  const available = updaterAvailable();
  const running = isRunning(status);
  const updateAvailable = availability(inst, lv);
  let reason = null;
  if (!available) reason = 'Oppdatering fra appen er ikke satt opp. Kjør update.sh én gang fra Proxmox for å slå det på.';
  else if (running) reason = 'En oppdatering pågår allerede.';
  else if (!canWrite(c)) reason = 'Tokenet mangler tilgangen finance:write. Logg inn på nytt i appen, eller oppdater fra nettleseren.';
  const rb = rollbackTarget();
  return c.json({
    available, installed: inst,
    latest: lv ? { version: lv.version, sha: lv.sha, date: lv.date, message: lv.message } : null,
    latestError: l.error, checkedAt: l.at, repo: REPO, branch: BRANCH,
    updateAvailable,
    changes: lv ? newerSections(lv.sections, inst.version).map(({ version, date, title, items }) => ({ version, date, title, items })) : [],
    status: statusOut(status), running,
    log: status.state !== 'idle' ? readLog(60) : undefined,
    canStart: !reason, reason, needsPassword: !!updateSettings().require_password,
    name: OS_NAME, codename: OS_CODENAME, tagline: OS_TAGLINE, settingsLog: updateAudit().slice(0, 10),
    rollback: { available: !!rb && available && !running && canWrite(c), version: rb?.version ?? null },
    settings: updateSettings(),
  });
}

/** GET /api/system/version: kort svar for banneret. */
export async function versionInfo(force = false) {
  const inst = installed();
  const l = await getLatest(force);
  const lv = l.value;
  const notes = lv ? newerSections(lv.sections, inst.version).flatMap((x) => x.items).filter((t) => t && !headingOnly(t)).slice(0, 40) : [];
  const updateAvailable = availability(inst, lv);
  const sizeBytes = updateAvailable ? await releaseSize(force) : null;
  return { current: inst.version, latest: lv?.version ?? null, notes, publishedAt: lv?.date ?? null, updateAvailable,
    name: OS_NAME, codename: OS_CODENAME, tagline: OS_TAGLINE, sizeBytes };
}

/* ---------------- Brukervalg (serveroppsett, bare admin) ---------------- */

const SETTINGS_DEFAULT = { auto_update: false, notify_updates: true, require_password: false };
export const updateSettings = () => ({ ...SETTINGS_DEFAULT, ...(kv.get(OWNER, 'update_settings', {}) ?? {}) });
// Endringer i brukervalgene (hvem, når, hva): nyeste først, maks 50.
export const updateAudit = () => { const v = kv.get(OWNER, 'update_audit', []); return Array.isArray(v) ? v : []; };
function logSettingChange(user, key, from, to, via) {
  const e = { at: Date.now(), user: String(user).slice(0, 64), key, from, to, via };
  kv.set(OWNER, 'update_audit', [e, ...updateAudit()].slice(0, 50));
  console.warn(`[system-update] ${key}: ${from} → ${to} av ${e.user} (${via})`);
}

/* ---------------- Start / rollback ---------------- */

async function startJob(c, action) {
  const a = c.get('access');
  if (!canWrite(c)) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  // JSON-kropp kreves (en vanlig skjema-POST fra et annet nettsted kan ikke sette den uten CORS-forespørsel).
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  // Prompt 31: passord bare når «Krev passord for å oppdatere» er på. Da godtas også et ferskt reauthToken (biometri).
  if (updateSettings().require_password) {
    const viaToken = typeof b?.reauthToken === 'string' && consumeReauth(b.reauthToken, a.user);
    if (!viaToken && !checkPassword(a.user, b?.password)) {
      loginFailed(ip);
      return c.json({ error: b?.reauthToken ? 'Bekreftelsen er utløpt. Prøv igjen.' : 'Feil passord', needsPassword: true }, 403);
    }
    loginSucceeded(ip);
  }
  if (!updaterAvailable()) return c.json({ error: 'Oppdatering fra appen er ikke satt opp. Kjør update.sh én gang fra Proxmox for å slå det på.' }, 409);
  if (isRunning()) return c.json({ error: 'En oppdatering pågår allerede' }, 409);
  const target = action === 'rollback' ? rollbackTarget() : null;
  if (action === 'rollback' && !target) return c.json({ error: 'Fant ingen tidligere versjon å gå tilbake til' }, 409);
  const r = await writeRequest(String(a.user), action, `${a.session ? 'økt' : 'app-token'} fra ${ip}`);
  if (r.error) return c.json({ error: r.error }, 500);
  return c.json({ ok: true, id: r.id, backup: r.backup, ...(target ? { target: { version: target.version } } : {}) });
}

async function writeRequest(by, action, from) {
  let backup;
  try { backup = await preUpdateBackup(); } catch (e) {
    console.error('[system-update] backup feilet:', e.message);
    return { error: `Kunne ikke ta backup av databasen, ${action === 'rollback' ? 'tilbakerullingen' : 'oppdateringen'} er ikke startet: ${e.message}` };
  }
  // Bare id, hvem, når (og action ved rollback). Alt annet i kroppen ignoreres.
  const req = { id: randomUUID(), requestedBy: by.slice(0, 64), at: Date.now(), ...(action === 'rollback' ? { action: 'rollback' } : {}) };
  mkdirSync(UPD, { recursive: true });
  const tmp = join(UPD, `.request-${req.id}.tmp`);
  writeFileSync(tmp, JSON.stringify(req), { mode: 0o644 });
  renameSync(tmp, join(UPD, 'request.json'));
  console.warn(`[system-update] ${action === 'rollback' ? 'tilbakerulling' : 'oppdatering'} ${req.id} startet av ${req.requestedBy} (${from}), backup ${backup}`);
  watchStatus();
  return { id: req.id, backup };
}

/* ---------------- Bakgrunn: sjekk hver 6. time og auto-oppdatering 03:30 ---------------- */

const TZ = 'Europe/Oslo';
function osloParts(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hh: Number(p.hour), mm: Number(p.minute) };
}

/** Sjekker GitHub og varsler administratorene én gang per ny versjon. → true når et varsel ble sendt. */
export async function checkAndNotify() {
  const l = await getLatest(true);
  const inst = installed(), lv = l.value;
  if (!availability(inst, lv)) return false;
  const st = updateSettings();
  const key = lv.sha || lv.version;
  if (!st.notify_updates || kv.get(OWNER, 'update_notified', null) === key) return false;
  kv.set(OWNER, 'update_notified', key);
  const title = `${shortName(lv.version)} er klar`, body = `${OS_NAME} ${lv.version ?? 'ny versjon'} er klar. Du har ${inst.version ?? 'ukjent'}.`;
  broadcast('system-update-available', { title, body, category: 'system',
    current: inst.version, latest: lv.version, publishedAt: lv.date, url: 'finanshub://innstillinger/system' });
  for (const u of listUsers().filter((x) => x.role === 'admin')) {
    notifyUser(u.id, { title, body, url: '/#/innstillinger/system', tag: `update-${lv.version ?? key.slice(0, 12)}`, category: 'system', data: { kind: 'update', version: lv.version, deepLink: 'finanshub://innstillinger/system' } })
      .catch((e) => console.warn('[system-update] varsel:', e.message));
  }
  return true;
}

/** Kalles hvert minutt. Kl. 03:30–03:40 (Oslo) med auto_update på: start en vanlig oppdatering. → id eller null. */
export async function autoUpdateTick(t = Date.now()) {
  const st = updateSettings();
  if (!st.auto_update) return null;
  const o = osloParts(t);
  if (o.hh !== 3 || o.mm < 30 || o.mm >= 40) return null;
  if (kv.get(OWNER, 'update_auto_slot', null) === o.date) return null;
  if (!updaterAvailable() || isRunning()) return null;
  // Venter på en nattlig backup som fortsatt kjører.
  try { if (db.prepare("SELECT 1 FROM backup_jobs WHERE state IN ('queued','running') LIMIT 1").get()) return null; } catch { /* ingen tabell */ }
  kv.set(OWNER, 'update_auto_slot', o.date);
  const l = await getLatest(true);
  if (!availability(installed(), l.value)) return null;
  const r = await writeRequest('auto', 'update', 'automatisk oppdatering');
  return r.id ?? null;
}

let schedTimers = [];
export function startUpdateScheduler() {
  if (schedTimers.length) return;
  const check = () => checkAndNotify().catch((e) => console.warn('[system-update] sjekk:', e.message));
  const first = setTimeout(check, 60_000);
  const six = setInterval(check, 6 * 3_600_000);
  const tick = setInterval(() => autoUpdateTick().catch((e) => console.warn('[system-update] auto:', e.message)), 60_000);
  schedTimers = [first, six, tick];
  for (const x of schedTimers) x.unref?.();
}

/* ---------------- Ruter ---------------- */

api.get('/', (c) => overview(c, false));
api.post('/check', (c) => overview(c, true));
api.get('/log', (c) => c.text(readLog(0), 200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }));
api.get('/status', (c) => c.json({ ...statusOut(), current: installed().version }, 200, { 'Cache-Control': 'no-store' }));
api.get('/version', async (c) => c.json(await versionInfo(c.req.query('force') === '1')));
api.get('/settings', (c) => c.json(updateSettings()));
api.put('/settings', async (c) => {
  if (!canWrite(c)) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {auto_update, notify_updates, require_password}' }, 400);
  const prev = updateSettings(), next = { ...prev };
  for (const k of Object.keys(b)) {
    if (!(k in SETTINGS_DEFAULT)) return c.json({ error: `Ukjent nøkkel ${k}` }, 400);
    if (typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true eller false` }, 400);
    next[k] = b[k];
  }
  kv.set(OWNER, 'update_settings', next);
  const a = c.get('access');
  for (const k of Object.keys(SETTINGS_DEFAULT)) if (prev[k] !== next[k]) logSettingChange(a.user, k, prev[k], next[k], `${a.session ? 'økt' : 'app-token'} fra ${clientIp(c)}`);
  return c.json(next);
});
api.post('/start', (c) => startJob(c, 'update'));
api.post('/rollback', (c) => startJob(c, 'rollback'));

export const _paths = { UPD, BACKUPS };
export const _hasRequest = () => existsSync(join(UPD, 'request.json'));
export default api;
