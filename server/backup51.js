// Prompt 51 (OPS51): restic-backup med 3-2-1 og ukentlig testet gjenoppretting. Bare admin (rutene ligger i ops51.js).
//
// 3-2-1: tre kopier (dataene + to backuper), to medier (lokal disk + NAS), én utenfor huset (valgfritt: Backblaze B2, S3 eller
// rest-server). Hvert mål er sitt eget restic-repo. restic krypterer alt (AES-256) med repo-passordet, som genereres her første
// gang, lagres forseglet (seal(), samme nøkkel som FinansHub-hemmelighetene) og vises for admin bare på forespørsel med passord.
// Adresser og nøkler for NAS og offsite settes av admin; nøklene lagres forseglet og sendes aldri ut (bare «satt»).
//
// Konsistens: databasene kopieres aldri mens de skrives. Hver SQLite-fil øverst i data-mappen tas med VACUUM INTO til
// data/.ops51-stage/db/ (øktene tømmes i kopien), og restic tar data-mappen UTEN de levende .db/-wal/-shm-filene, uten
// backup-mappene (system-backups/, backups/) og uten staging-kopien til updateren.
//
// Testet gjenoppretting (ukentlig, søndag 04:10, eller «Test nå»): siste snapshot gjenopprettes til en temp-mappe, databasene
// åpnes med integrity_check, og serveren startes mot kopien på egen port (OPS51_SANDBOX_PORT, standard 3902) med
// OPS51_SANDBOX=1 (ingen bakgrunnsjobber, ingen varsler). Røyktest: /healthz, /api/ops51/smoke (bare i sandkassen) og en
// innlogging som skal avvises. Deretter stoppes sandkassen og temp-mappen slettes.
//
// Miljø: RESTIC_BIN (standard «restic»), OPS51_SANDBOX_PORT, OPS51_RESTORE_SCOPE (auto|full|db), OPS51_RESTIC_TIMEOUT_MS.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { seal, unseal } from './finans/db.js';
import { dbFiles51, integrityOf51 } from './dbmaint51.js';

const DATA = resolve(config.dataDir);
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const STAGE = join(DATA, '.ops51-stage');
const CACHE = join(DATA, '.ops51-cache');
const q = (sql) => db.prepare(sql);
const TAG = 'nordlys51', HOST = 'nordlys';
const TIMEOUT = () => Math.max(5_000, Number(process.env.OPS51_RESTIC_TIMEOUT_MS) || 6 * 3600_000);

db.exec(`CREATE TABLE IF NOT EXISTS ops51_backup_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'manual',
  state TEXT NOT NULL DEFAULT 'running',
  started INTEGER NOT NULL,
  finished INTEGER,
  targets TEXT NOT NULL DEFAULT '[]',
  dbs TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  by_user TEXT
);
CREATE TABLE IF NOT EXISTS ops51_restore_tests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'manual',
  state TEXT NOT NULL DEFAULT 'running',
  started INTEGER NOT NULL,
  finished INTEGER,
  target TEXT,
  snapshot TEXT,
  snapshot_at TEXT,
  scope TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  by_user TEXT
);`);

/* ---------------- Innstillinger og hemmeligheter ---------------- */

export const TARGET_IDS = ['local', 'nas', 'offsite'];
const defaultLocal = () => join(resolve(process.env.BACKUP_DIR || join(DATA, 'system-backups')), 'restic51');
const DEFAULTS = () => ({
  enabled: false, time: '02:40', restoreTest: true, keep: { daily: 7, weekly: 4, monthly: 6 },
  targets: { local: { enabled: true, repo: defaultLocal() }, nas: { enabled: false, repo: '' }, offsite: { enabled: false, repo: '', provider: 'b2' } },
});
export function backupSettings51() {
  const d = DEFAULTS(), s = kv.get(OWNER, 'ops51_backup', null) ?? {};
  const t = s.targets ?? {};
  return { ...d, ...s, keep: { ...d.keep, ...(s.keep ?? {}) },
    targets: Object.fromEntries(TARGET_IDS.map((id) => [id, { ...d.targets[id], ...(t[id] ?? {}) }])) };
}
const secrets = () => kv.get(OWNER, 'ops51_backup_secrets', null) ?? {};
const setSecrets = (patch) => kv.set(OWNER, 'ops51_backup_secrets', { ...secrets(), ...patch });
/** Repo-passordet (genereres første gang). Brukes bare i miljøet til restic, aldri i logger eller svar (unntatt revealKey51). */
function repoPassword(create = true) {
  const s = secrets();
  let p = s.password ? unseal(s.password) : '';
  if (!p && create) { p = randomBytes(24).toString('base64url'); setSecrets({ password: seal(p), passwordAt: Date.now(), passwordShown: false }); }
  return p;
}
export function revealKey51() {
  const p = repoPassword(true);
  setSecrets({ passwordShown: true });
  return { repoPassword: p, createdAt: secrets().passwordAt ?? null };
}

/** Adressen til et restic-repo: absolutt sti, rest:, sftp:, b2:, s3:, azure:, gs: eller rclone:. Ingen mellomrom/linjeskift, aldri «-» først. */
export function validRepo51(id, v) {
  const s = String(v ?? '').trim();
  if (!s) return { repo: '' };
  if (s.length > 400 || /[\s\0]/.test(s) || s.startsWith('-')) return { error: 'Ugyldig adresse' };
  if (isAbsolute(s)) {
    const r = resolve(s);
    if (r === DATA || r.startsWith(DATA + sep)) {
      // Lokal backup inne i data-mappen er lov (standard uten BACKUP_DIR), men ikke for NAS/offsite.
      if (id !== 'local') return { error: 'NAS-repoet kan ikke ligge i data-mappen. Monter NAS-en (f.eks. /mnt/nas) og pek dit.' };
    }
    if (id === 'offsite') return { error: 'Offsite må være en skytjeneste (b2:, s3:, rest:), ikke en mappe her.' };
    return { repo: r };
  }
  const m = /^(rest|sftp|b2|s3|azure|gs|swift|rclone):(.+)$/.exec(s);
  if (!m) return { error: 'Bruk en absolutt sti eller restic-adresse (rest:https://…, sftp:bruker@vert:/sti, b2:bøtte:sti, s3:https://…)' };
  if (id === 'local') return { error: 'Lokal backup må være en mappe (absolutt sti).' };
  if (m[1] === 'rest' && !/^https?:\/\/[^\s/]+/.test(m[2])) return { error: 'rest: må etterfølges av http(s)://' };
  if (m[1] === 'rest' && /\/\/[^/@]*:[^/@]*@/.test(m[2])) return { error: 'Ikke legg passordet i adressen – bruk feltene for bruker og passord.' };
  return { repo: s };
}

/** PUT /backup/settings (delvis). → {settings} eller {error, field}. Hemmeligheter: repoPassword (koble til et eksisterende repo),
 *  targets.nas.user/pass (rest-server), targets.offsite.accountId/accountKey (B2/S3-nøkkel). Tom streng fjerner. */
export function saveBackupSettings51(b = {}) {
  const s = backupSettings51();
  if (b.enabled !== undefined) s.enabled = b.enabled === true;
  if (b.restoreTest !== undefined) s.restoreTest = b.restoreTest !== false;
  if (b.time !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time))) return { error: 'Klokkeslett må være TT:MM', field: 'time' }; s.time = String(b.time); }
  if (b.keep && typeof b.keep === 'object') for (const k of ['daily', 'weekly', 'monthly']) if (b.keep[k] !== undefined) {
    const n = Math.round(Number(b.keep[k])); if (!(n >= 0 && n <= 400)) return { error: `Ugyldig antall (${k})`, field: `keep.${k}` }; s.keep[k] = n;
  }
  const sec = {};
  for (const id of TARGET_IDS) {
    const t = b.targets?.[id]; if (!t || typeof t !== 'object') continue;
    if (t.enabled !== undefined) s.targets[id].enabled = t.enabled === true;
    if (t.repo !== undefined) { const r = validRepo51(id, t.repo); if (r.error) return { error: r.error, field: `targets.${id}.repo` }; s.targets[id].repo = r.repo; }
    if (id === 'offsite' && t.provider !== undefined) { if (!['b2', 's3', 'rest'].includes(t.provider)) return { error: 'Ukjent leverandør', field: 'targets.offsite.provider' }; s.targets[id].provider = t.provider; }
    for (const [k, max] of [['user', 200], ['pass', 500], ['accountId', 200], ['accountKey', 500]]) {
      if (t[k] === undefined) continue;
      const v = String(t[k] ?? '');
      if (v.length > max || /[\0\r\n]/.test(v)) return { error: 'Ugyldig verdi', field: `targets.${id}.${k}` };
      sec[`${id}_${k}`] = v ? seal(v) : null;
    }
    if (s.targets[id].enabled && !s.targets[id].repo) return { error: 'Mangler adresse', field: `targets.${id}.repo` };
  }
  if (b.repoPassword !== undefined) {
    const p = String(b.repoPassword ?? '');
    if (p.length < 8 || p.length > 500 || /[\0\r\n]/.test(p)) return { error: 'Repo-passordet må ha minst 8 tegn', field: 'repoPassword' };
    sec.password = seal(p); sec.passwordAt = Date.now(); sec.passwordShown = true;
  }
  kv.set(OWNER, 'ops51_backup', { enabled: s.enabled, time: s.time, restoreTest: s.restoreTest, keep: s.keep, targets: Object.fromEntries(TARGET_IDS.map((id) => [id, { enabled: s.targets[id].enabled, repo: s.targets[id].repo, ...(id === 'offsite' ? { provider: s.targets[id].provider } : {}) }])) });
  if (Object.keys(sec).length) setSecrets(sec);
  if (s.enabled) repoPassword(true);
  return { settings: settingsOut51() };
}

/** Innstillingene slik klienten ser dem: aldri nøkler, bare om de er satt. */
export function settingsOut51() {
  const s = backupSettings51(), sec = secrets();
  const set = (k) => !!(sec[k] && unseal(sec[k]));
  return { ...s, targets: Object.fromEntries(TARGET_IDS.map((id) => [id, { ...s.targets[id],
    ...(id === 'nas' ? { userSet: set('nas_user'), passSet: set('nas_pass') } : {}),
    ...(id === 'offsite' ? { accountIdSet: set('offsite_accountId'), accountKeySet: set('offsite_accountKey') } : {}) }])),
    keySet: !!sec.password, keyShown: !!sec.passwordShown, keyCreatedAt: sec.passwordAt ?? null, restic: resticInfo51(), defaults: { localRepo: defaultLocal() } };
}

/* ---------------- restic ---------------- */

const BIN = () => process.env.RESTIC_BIN || 'restic';
let resticCache = null;
export function resticInfo51(force = false) {
  if (resticCache && !force && Date.now() - resticCache.at < 10 * 60_000) return resticCache.v;
  let v;
  try {
    const r = spawnSync(BIN(), ['version'], { encoding: 'utf8', timeout: 10_000 });
    const m = /restic\s+([0-9][\w.-]*)/.exec(r.stdout ?? '');
    v = r.status === 0 ? { available: true, version: m?.[1] ?? null } : { available: false, version: null, error: 'restic svarte ikke' };
  } catch { v = { available: false, version: null }; }
  if (!v.available) v.error = 'restic er ikke installert i containeren. Oppdater Nordlys (imaget har restic fra 51) eller sett RESTIC_BIN.';
  resticCache = { at: Date.now(), v };
  return v;
}
export const _resetRestic = () => { resticCache = null; };

/** Miljøet til restic for et mål. Bare det restic trenger; hemmeligheter kun her. */
function envFor(id) {
  const s = backupSettings51().targets[id], sec = secrets();
  const u = (k) => (sec[`${id}_${k}`] ? unseal(sec[`${id}_${k}`]) : '');
  const env = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME ?? tmpdir(), TZ: 'Europe/Oslo',
    RESTIC_REPOSITORY: s.repo, RESTIC_PASSWORD: repoPassword(true), RESTIC_CACHE_DIR: CACHE, RESTIC_PROGRESS_FPS: '0.2' };
  if (/^rest:/.test(s.repo) && u('user')) { env.RESTIC_REST_USERNAME = u('user'); env.RESTIC_REST_PASSWORD = u('pass'); }
  if (id === 'offsite') {
    if (/^b2:/.test(s.repo)) { env.B2_ACCOUNT_ID = u('accountId'); env.B2_ACCOUNT_KEY = u('accountKey'); }
    else if (/^s3:/.test(s.repo)) { env.AWS_ACCESS_KEY_ID = u('accountId'); env.AWS_SECRET_ACCESS_KEY = u('accountKey'); }
    else if (/^rest:/.test(s.repo) && u('accountId')) { env.RESTIC_REST_USERNAME = u('accountId'); env.RESTIC_REST_PASSWORD = u('accountKey'); }
  }
  return env;
}
/** Fjerner hemmeligheter og bruker:passord@ fra tekst før den lagres eller vises. */
export function scrub51(text, env = {}) {
  let t = String(text ?? '');
  for (const [k, v] of Object.entries(env)) if (v && v.length >= 4 && /PASSWORD|KEY|SECRET|USERNAME|ACCOUNT_ID/.test(k)) t = t.split(v).join('***');
  return t.replace(/\/\/[^/\s@]+:[^/\s@]+@/g, '//***@').slice(-2000);
}

/** Kjører restic. → {code, stdout, stderr (vasket)}. Avvises aldri med unntak; code -1 = kunne ikke starte. */
export function restic51(id, args, { timeoutMs = TIMEOUT(), env: extra = {} } = {}) {
  const env = { ...envFor(id), ...extra };
  mkdirSync(CACHE, { recursive: true });
  return new Promise((res) => {
    let out = '', err = '', done = false;
    let p;
    try { p = spawn(BIN(), args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { res({ code: -1, stdout: '', stderr: scrub51(e.message, env) }); return; }
    const timer = setTimeout(() => { if (!done) { err += '\nTidsavbrudd – restic ble stoppet.'; try { p.kill('SIGTERM'); } catch { /* */ } setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } }, 10_000).unref?.(); } }, timeoutMs);
    timer.unref?.();
    p.stdout.on('data', (d) => { out += d; if (out.length > 4_000_000) out = out.slice(-2_000_000); });
    p.stderr.on('data', (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    p.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); res({ code: -1, stdout: '', stderr: scrub51(e.message, env) }); });
    p.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); res({ code: code ?? -1, stdout: out, stderr: scrub51(err, env) }); });
  });
}
const jsonLines = (s) => String(s ?? '').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const firstErr = (r) => (r.stderr.split('\n').map((l) => l.trim()).filter((l) => l && !/^(open repository|repository [0-9a-f]+ opened|created restic repository)/i.test(l)).slice(-3).join(' ') || `restic avsluttet med kode ${r.code}`).slice(0, 400);

/** Sørger for at repoet finnes (init første gang). → null eller feiltekst. */
async function ensureRepo(id) {
  const t = backupSettings51().targets[id];
  if (isAbsolute(t.repo)) { try { mkdirSync(t.repo, { recursive: true }); } catch (e) { return `Kan ikke lage ${t.repo}: ${e.code ?? e.message}`; } }
  const c = await restic51(id, ['cat', 'config'], { timeoutMs: 120_000 });
  if (c.code === 0) return null;
  if (c.code === 12 || /wrong password|no key found/i.test(c.stderr)) return 'Feil repo-passord for dette repoet. Legg inn passordet repoet ble laget med.';
  const i = await restic51(id, ['init'], { timeoutMs: 300_000 });
  return i.code === 0 ? null : `Kunne ikke opprette repoet: ${firstErr(i)}`;
}

/* ---------------- Konsistente kopier av databasene ---------------- */

const sqlStr = (p) => `'${String(p).replace(/'/g, "''")}'`;
// Prompt 51: lokale kopier som kan lastes ned på nytt (RCPTSRV51: Enhetsregisteret, 100–150 MB) tas ikke med i backupen.
export const SKIP_DBS = new Set(['brreg51.sqlite', 'brreg51.sqlite-wal', 'brreg51.sqlite-shm']);
/** VACUUM INTO for hver database øverst i data-mappen → [{name, bytes, integrity}]. Øktene tømmes i kopien. */
export function snapshotDatabases51(dest = join(STAGE, 'db')) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const out = [];
  for (const f of dbFiles51().filter((x) => !SKIP_DBS.has(x.split(/[\\/]/).pop()))) {
    const name = f.split(/[\\/]/).pop(), to = join(dest, name);
    if (resolve(f) === resolve(db.name)) db.exec(`VACUUM INTO ${sqlStr(to)}`);
    else { const d = new Database(f, { readonly: true, fileMustExist: true }); try { d.exec(`VACUUM INTO ${sqlStr(to)}`); } finally { d.close(); } }
    const c = new Database(to);
    try {
      const hasSessions = c.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='sessions'").get();
      if (hasSessions) c.exec('DELETE FROM sessions');
      c.pragma('journal_mode = DELETE');
    } finally { c.close(); }
    out.push({ name, bytes: statSync(to).size });
  }
  writeFileSync(join(STAGE, 'manifest51.json'), JSON.stringify({ format: 'nordlys-restic-51', at: Date.now(), dbs: out }, null, 1));
  return out;
}

/** Stier restic hopper over (levende databaser, backup-mapper, cache, sandkasser og lokale repo i data-mappen). */
function excludes() {
  const ex = [`${DATA}/*.db`, `${DATA}/*.db-wal`, `${DATA}/*.db-shm`, `${DATA}/*.db-journal`, `${DATA}/*.sqlite`, `${DATA}/*.sqlite3`, `${DATA}/*.sqlite-wal`, `${DATA}/*.sqlite-shm`,
    join(DATA, 'brreg51.sqlite'), join(DATA, 'brreg51.sqlite-wal'), join(DATA, 'brreg51.sqlite-shm'), join(DATA, 'system-backups'), join(DATA, 'backups'), join(DATA, 'update', 'staging51'), CACHE, join(DATA, '.ops51-restore')];
  const local = backupSettings51().targets.local.repo;
  if (local && (local === DATA || local.startsWith(DATA + sep))) ex.push(local);
  return ex.flatMap((e) => ['--exclude', e]);
}

/* ---------------- Backupkjøring ---------------- */

let running = null;
export const backupRunning51 = () => running;
const newId = (p) => `${p}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
const parse = (s, d = []) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const runOut = (r) => r && ({ id: r.id, kind: r.kind, state: r.state, startedAt: r.started, finishedAt: r.finished, targets: parse(r.targets), dbs: parse(r.dbs), error: r.error, by: r.by_user });
export const backupRuns51 = (limit = 20) => q('SELECT * FROM ops51_backup_runs ORDER BY started DESC LIMIT ?').all(Math.max(1, Math.min(100, limit))).map(runOut);
export const getRun51 = (id) => runOut(q('SELECT * FROM ops51_backup_runs WHERE id=?').get(String(id)));

/** Starter en backup i bakgrunnen. → {id} eller kaster (409 pågår, 400 ikke satt opp). */
export function startBackup51({ kind = 'manual', by = null } = {}) {
  if (running) throw Object.assign(new Error('En backup eller gjenopprettingstest pågår allerede'), { status: 409 });
  const s = backupSettings51();
  const targets = TARGET_IDS.filter((id) => s.targets[id].enabled && s.targets[id].repo);
  if (!targets.length) throw Object.assign(new Error('Ingen backupmål er slått på'), { status: 400 });
  if (!resticInfo51().available) throw Object.assign(new Error(resticInfo51().error), { status: 409 });
  const id = newId('rb');
  q('INSERT INTO ops51_backup_runs(id, kind, state, started, targets, by_user) VALUES(?,?,?,?,?,?)').run(id, kind, 'running', Date.now(), JSON.stringify(targets.map((t) => ({ id: t, state: 'pending' }))), by ? String(by).slice(0, 64) : null);
  running = { id, kind: 'backup', started: Date.now() };
  const p = runBackup(id, targets).catch((e) => {
    q("UPDATE ops51_backup_runs SET state='failed', finished=?, error=? WHERE id=?").run(Date.now(), String(e.message ?? e).slice(0, 500), id);
  }).finally(() => { running = null; });
  return { id, done: p };
}

async function runBackup(id, targets) {
  const res = targets.map((t) => ({ id: t, state: 'pending' }));
  const save = (extra = {}) => q('UPDATE ops51_backup_runs SET targets=?, dbs=COALESCE(?, dbs) WHERE id=?').run(JSON.stringify(res), extra.dbs ? JSON.stringify(extra.dbs) : null, id);
  let dbs;
  try { dbs = snapshotDatabases51(); } catch (e) {
    q("UPDATE ops51_backup_runs SET state='failed', finished=?, error=? WHERE id=?").run(Date.now(), `Kunne ikke ta kopi av databasen: ${String(e.message).slice(0, 300)}`, id);
    return;
  }
  save({ dbs });
  const keep = backupSettings51().keep;
  for (const r of res) {
    const t0 = Date.now();
    r.state = 'running'; save();
    const err = await ensureRepo(r.id);
    if (err) { Object.assign(r, { state: 'failed', error: err, ms: Date.now() - t0, at: Date.now() }); save(); continue; }
    const b = await restic51(r.id, ['backup', '--json', '--tag', TAG, '--host', HOST, ...excludes(), DATA]);
    const sum = jsonLines(b.stdout).reverse().find((x) => x.message_type === 'summary') ?? null;
    if (b.code !== 0 && b.code !== 3) { Object.assign(r, { state: 'failed', error: firstErr(b), ms: Date.now() - t0, at: Date.now() }); save(); continue; }
    Object.assign(r, { snapshot: sum?.snapshot_id ? String(sum.snapshot_id).slice(0, 64) : null, filesNew: sum?.files_new ?? null, filesChanged: sum?.files_changed ?? null,
      bytesAdded: sum?.data_added ?? null, bytesTotal: sum?.total_bytes_processed ?? null, warning: b.code === 3 ? 'Noen filer kunne ikke leses (snapshot er ufullstendig).' : null });
    const f = await restic51(r.id, ['forget', '--tag', TAG, '--host', HOST, '--keep-daily', String(keep.daily), '--keep-weekly', String(keep.weekly), '--keep-monthly', String(keep.monthly), '--prune'], { timeoutMs: TIMEOUT() });
    if (f.code !== 0) r.warning = [r.warning, `Rydding av gamle snapshots feilet: ${firstErr(f)}`].filter(Boolean).join(' ');
    Object.assign(r, { state: 'ok', ms: Date.now() - t0, at: Date.now() }); save();
  }
  rmSync(join(STAGE, 'db'), { recursive: true, force: true });
  const ok = res.filter((r) => r.state === 'ok').length;
  const state = ok === res.length ? 'ok' : ok ? 'partial' : 'failed';
  const error = state === 'ok' ? null : res.filter((r) => r.state !== 'ok').map((r) => `${LABEL[r.id]}: ${r.error}`).join(' · ').slice(0, 800);
  q('UPDATE ops51_backup_runs SET state=?, finished=?, error=?, targets=? WHERE id=?').run(state, Date.now(), error, JSON.stringify(res), id);
  if (state !== 'ok') console.warn(`[ops51] backup ${id}: ${state} – ${error}`);
}
export const LABEL = { local: 'Lokal disk', nas: 'NAS', offsite: 'Offsite' };

/* ---------------- Testet gjenoppretting ---------------- */

const testOut = (r) => r && ({ id: r.id, kind: r.kind, state: r.state, startedAt: r.started, finishedAt: r.finished, target: r.target, snapshot: r.snapshot, snapshotAt: r.snapshot_at,
  scope: r.scope, steps: parse(r.steps), error: r.error, by: r.by_user });
export const restoreTests51 = (limit = 20) => q('SELECT * FROM ops51_restore_tests ORDER BY started DESC LIMIT ?').all(Math.max(1, Math.min(100, limit))).map(testOut);
export const getRestoreTest51 = (id) => testOut(q('SELECT * FROM ops51_restore_tests WHERE id=?').get(String(id)));

/** Målet testen gjenoppretter fra: det første som er slått på og hadde en vellykket backup (lokal → NAS → offsite). */
function restoreSource(prefer = null) {
  const s = backupSettings51();
  const on = TARGET_IDS.filter((id) => s.targets[id].enabled && s.targets[id].repo);
  if (prefer && on.includes(prefer)) return prefer;
  const last = backupRuns51(10);
  return on.find((id) => last.some((r) => r.targets.some((t) => t.id === id && t.state === 'ok'))) ?? on[0] ?? null;
}

export function startRestoreTest51({ kind = 'manual', by = null, target = null } = {}) {
  if (running) throw Object.assign(new Error('En backup eller gjenopprettingstest pågår allerede'), { status: 409 });
  if (!resticInfo51().available) throw Object.assign(new Error(resticInfo51().error), { status: 409 });
  const src = restoreSource(target);
  if (!src) throw Object.assign(new Error('Ingen backupmål er slått på'), { status: 400 });
  const id = newId('rt');
  q('INSERT INTO ops51_restore_tests(id, kind, state, started, target, by_user) VALUES(?,?,?,?,?,?)').run(id, kind, 'running', Date.now(), src, by ? String(by).slice(0, 64) : null);
  running = { id, kind: 'restore-test', started: Date.now() };
  const p = runRestoreTest(id, src).catch((e) => {
    q("UPDATE ops51_restore_tests SET state='failed', finished=?, error=? WHERE id=?").run(Date.now(), String(e.message ?? e).slice(0, 500), id);
  }).finally(() => { running = null; });
  return { id, done: p };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, init = {}, ms = 5000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

async function runRestoreTest(id, src) {
  const steps = [];
  const save = () => q('UPDATE ops51_restore_tests SET steps=? WHERE id=?').run(JSON.stringify(steps), id);
  const step = async (key, label, fn) => {
    const s = { key, label, state: 'running', at: Date.now() }; steps.push(s); save();
    try { const detail = await fn(); Object.assign(s, { state: 'ok', ms: Date.now() - s.at, detail: detail ?? null }); save(); return true; }
    catch (e) { Object.assign(s, { state: 'failed', ms: Date.now() - s.at, error: String(e.message ?? e).slice(0, 400) }); save(); throw e; }
  };
  let tmp = null, child = null;
  try {
    let snap = null;
    await step('snapshot', 'Finner siste snapshot', async () => {
      const r = await restic51(src, ['snapshots', '--json', '--tag', TAG, '--host', HOST], { timeoutMs: 300_000 });
      if (r.code !== 0) throw new Error(firstErr(r));
      const list = parse(r.stdout.trim() || '[]');
      if (!Array.isArray(list) || !list.length) throw new Error('Repoet har ingen snapshots ennå – ta en backup først');
      snap = list.slice().sort((a, b) => String(a.time).localeCompare(String(b.time))).at(-1);
      q('UPDATE ops51_restore_tests SET snapshot=?, snapshot_at=? WHERE id=?').run(String(snap.short_id ?? snap.id ?? '').slice(0, 64), String(snap.time ?? '').slice(0, 40), id);
      return `${String(snap.short_id ?? snap.id ?? '').slice(0, 12)} · ${String(snap.time ?? '').slice(0, 19).replace('T', ' ')}`;
    });
    // Omfang: full gjenoppretting, eller bare databasene (+ restic check av et utvalg data) når snapshotet er stort.
    let scope = process.env.OPS51_RESTORE_SCOPE || 'auto';
    if (scope === 'auto') {
      const big = backupRuns51(5).flatMap((r) => r.targets).find((t) => t.id === src && t.bytesTotal != null)?.bytesTotal ?? 0;
      scope = big > 4 * 1024 ** 3 ? 'db' : 'full';
    }
    q('UPDATE ops51_restore_tests SET scope=? WHERE id=?').run(scope, id);
    tmp = mkdtempSync(join(tmpdir(), 'nordlys-restore51-'));
    await step('restore', scope === 'full' ? 'Gjenoppretter til en temp-mappe' : 'Gjenoppretter databasene til en temp-mappe', async () => {
      const inc = scope === 'full' ? [] : ['--include', join(STAGE, 'db')];
      const r = await restic51(src, ['restore', String(snap.id ?? snap.short_id), '--target', tmp, ...inc]);
      if (r.code !== 0) throw new Error(firstErr(r));
      return scope === 'full' ? 'Hele data-mappen' : 'Bare databasene';
    });
    if (scope !== 'full') {
      await step('check', 'Sjekker et utvalg av dataene i repoet', async () => {
        const r = await restic51(src, ['check', '--read-data-subset=5%']);
        if (r.code !== 0) throw new Error(firstErr(r));
        return '5 % av dataene lest og kontrollert';
      });
    }
    const root = join(tmp, DATA.replace(/^[A-Za-z]:/, ''));
    const dbDir = join(root, '.ops51-stage', 'db');
    let names = [];
    await step('integrity', 'Åpner databasene og sjekker integriteten', async () => {
      if (!existsSync(dbDir)) throw new Error('Fant ikke databasekopiene i snapshotet');
      names = readdirSync(dbDir).filter((f) => /\.(db|sqlite3?)$/i.test(f));
      if (!names.includes('homelab.db')) throw new Error('homelab.db mangler i snapshotet');
      const res = [];
      for (const n of names) {
        const r = integrityOf51(join(dbDir, n));
        if (r !== 'ok') throw new Error(`${n}: ${r.slice(0, 200)}`);
        const d = new Database(join(dbDir, n), { readonly: true });
        try { res.push(`${n}: ok, ${d.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get().n} tabeller`); } finally { d.close(); }
      }
      // Kopiene flyttes på plass i sandkassens data-mappe.
      for (const n of names) renameSync(join(dbDir, n), join(root, n));
      return res.join(' · ');
    });
    const port = Number(process.env.OPS51_SANDBOX_PORT) || 3902;
    let log = '';
    await step('start', `Starter serveren mot kopien (port ${port})`, async () => {
      const env = { ...process.env, DATA_DIR: root, PORT: String(port), OPS51_SANDBOX: '1', NODE_ENV: 'production', BACKUP_DIR: join(root, 'system-backups') };
      delete env.MOCK_DATA;
      // Sandkassen skal aldri nå Docker-proxyen (selvreparasjon/omstart) eller sende push via ntfy.
      Object.assign(env, { DOCKER_HOST: 'tcp://127.0.0.1:9', NTFY_URL: '', NTFY_TOKEN: '' });
      child = spawn(process.execPath, [join(APP_ROOT, 'server', 'index.js')], { cwd: APP_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const add = (d) => { log = (log + d).slice(-4000); };
      child.stdout.on('data', add); child.stderr.on('data', add);
      let exited = null; child.on('exit', (c) => { exited = c ?? -1; });
      const t0 = Date.now(), max = Number(process.env.OPS51_SANDBOX_BOOT_MS) || 60_000;
      while (Date.now() - t0 < max) {
        if (exited !== null) throw new Error(`Serveren stoppet (kode ${exited}): ${scrub51(log.split('\n').filter(Boolean).slice(-3).join(' '))}`);
        try { const r = await get(`http://127.0.0.1:${port}/healthz`, {}, 2000); if (r.ok) return `Svarte etter ${Math.round((Date.now() - t0) / 100) / 10} s`; } catch { /* starter fortsatt */ }
        await sleep(400);
      }
      throw new Error(`Serveren svarte ikke innen ${Math.round(max / 1000)} s`);
    });
    await step('smoke', 'Røyktest mot kopien', async () => {
      const r = await get(`http://127.0.0.1:${port}/api/ops51/smoke`, {}, 30_000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(`Røyktesten feilet: ${j?.error ?? `HTTP ${r.status}`}`);
      const l = await get(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'ops51-roeyktest', password: 'feil-passord-51' }) }, 10_000);
      if (l.status >= 500) throw new Error(`Innloggingen svarte ${l.status}`);
      if (l.ok) throw new Error('Innlogging med feil passord ble godtatt');
      return `${j.tables} tabeller · ${j.users} brukere · integritet ${j.integrity}${j.version ? ` · ${j.version}` : ''}`;
    });
    q("UPDATE ops51_restore_tests SET state='ok', finished=? WHERE id=?").run(Date.now(), id);
  } catch (e) {
    q("UPDATE ops51_restore_tests SET state='failed', finished=?, error=? WHERE id=?").run(Date.now(), String(e.message ?? e).slice(0, 500), id);
    console.warn(`[ops51] gjenopprettingstest ${id} feilet: ${e.message}`);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      for (let i = 0; i < 50 && child.exitCode === null; i++) await sleep(100);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
  }
}

/* ---------------- Status for kortet i System ---------------- */

const DAY = 86400_000;
/** {status: green|yellow|red, title, detail, …}. Grønt: siste backup ok < 26 t på minst to mål, og siste testede gjenoppretting ok < 8 døgn. */
export function backupCard51(now = Date.now()) {
  const s = backupSettings51(), info = resticInfo51();
  const on = TARGET_IDS.filter((id) => s.targets[id].enabled && s.targets[id].repo);
  const runs = backupRuns51(30);
  const lastRun = runs[0] ?? null;
  const perTarget = on.map((id) => {
    const ok = runs.find((r) => r.targets.some((t) => t.id === id && t.state === 'ok'));
    const t = ok?.targets.find((x) => x.id === id);
    const lastT = runs.find((r) => r.targets.some((x) => x.id === id && x.state !== 'pending' && x.state !== 'running'))?.targets.find((x) => x.id === id) ?? null;
    return { id, label: LABEL[id], repo: redactRepo(s.targets[id].repo), lastOkAt: t?.at ?? null, snapshot: t?.snapshot ?? null, lastState: lastT?.state ?? null, lastError: lastT?.state === 'failed' ? lastT.error : null };
  });
  const test = restoreTests51(1)[0] ?? null;
  const fresh = perTarget.filter((t) => t.lastOkAt && now - t.lastOkAt < 26 * 3600_000);
  const issues = [];
  let status = 'green';
  const red = (m) => { status = 'red'; issues.push(m); };
  const yellow = (m) => { if (status === 'green') status = 'yellow'; issues.push(m); };
  if (!info.available) red(info.error);
  if (!s.enabled) red('Automatisk backup er av');
  if (!on.length) red('Ingen backupmål er slått på');
  else if (!fresh.length) red(perTarget.some((t) => t.lastOkAt) ? 'Ingen vellykket backup siste døgn' : 'Ingen backup er tatt ennå');
  for (const t of perTarget) if (t.lastState === 'failed') yellow(`${t.label}: ${t.lastError ?? 'feilet'}`);
  if (on.length && fresh.length < 2) yellow('3-2-1: legg til NAS (og gjerne offsite) – nå finnes bare én backupkopi');
  if (!test) yellow('Gjenoppretting er ikke testet ennå');
  else if (test.state === 'failed') red(`Gjenopprettingstesten feilet: ${test.error ?? ''}`.trim());
  else if (test.state === 'ok' && now - (test.finishedAt ?? test.startedAt) > 8 * DAY) yellow('Gjenopprettingen er ikke testet på over en uke');
  const title = status === 'green' ? 'Backup er i orden' : status === 'yellow' ? 'Backup trenger tilsyn' : 'Backup virker ikke';
  return {
    status, title, issues, enabled: s.enabled, restic: info, running: running ? { ...running } : null,
    lastRun: lastRun ? { id: lastRun.id, state: lastRun.state, at: lastRun.finishedAt ?? lastRun.startedAt, error: lastRun.error } : null,
    lastOkAt: perTarget.reduce((m, t) => Math.max(m, t.lastOkAt ?? 0), 0) || null,
    copies: fresh.length, targets: perTarget, rule321: { copies: 1 + fresh.length, media: new Set(fresh.map((t) => (t.id === 'offsite' ? 'cloud' : t.id))).size, offsite: fresh.some((t) => t.id === 'offsite') },
    restoreTest: test ? { id: test.id, state: test.state, at: test.finishedAt ?? test.startedAt, target: test.target, snapshot: test.snapshot, scope: test.scope, error: test.error, steps: test.steps } : null,
  };
}
/** Adresse uten brukernavn/passord (til visning). */
export const redactRepo = (r) => String(r ?? '').replace(/\/\/[^/@]+@/, '//***@');

export const _test = { setRunning: (v) => { running = v; }, excludes, envFor, restoreSource, DATA };
