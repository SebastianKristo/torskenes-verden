// Prompt 29 (SERVER29): systembackup (Innstillinger → Backup). Montert under /api/backup. Serveroppsett: bare admin.
//
// Tilgang (samme mønster som system-update.js):
//   - Alle ruter krever admin. GET virker med app-token (finance:read).
//   - Endringer, kjøring, nøkkel og gjenoppretting: økt i nettleseren ELLER app-token med finance:write fra en admin.
//     Med økt kreves JSON-kropp (en vanlig skjema-POST fra et annet nettsted kan ikke sette den).
//   - Gjenoppretting krever passordet på nytt og tar alltid en full sikkerhetskopi først.
//   - Nedlasting krever økt i nettleseren.
//   - Id-er er strenge (bk-YYYYMMDD-HHMMSS-xxxxxx) og filnavnet hentes fra tabellen, aldri fra forespørselen.
//
// Ruter:
//   GET  /settings  → {auto, schedule, keep, notifyFail, scope, modules, target:{local:true, path, smb:{enabled, share, path, label,
//                      lastUpload, lastError, unencrypted}}, cloud:{…}, encrypt, keySet,
//                      moduleList:[{id, name, desc}], format}
//   PUT  /settings  (delvis) → samme form
//   POST /key       {rotate?, password?} → {key, keyId} bare første gang / ved ny nøkkel (rotate krever passord)
//   POST /run       {scope?, modules?} → 202 {id}
//   GET  /status    → {last, running, next, summary}
//   GET  /list      → [{id, at, size, scope, modules, ok, error?, encrypted, cloud?, smb?:{ok, at, path, error?}, kind}]
//   (prompt 30) PUT /settings {target:{smb:{enabled, share, path}}}; oppsettet gjøres med veiviseren under /api/smb.
//   POST /restore   {id, modules[], password, key?} → {ok, safetyId, modules, reload:true}
//   GET  /:id/download → fila (attachment)
//
// Innhold i arkivet (<id>.tar.gz eller .tar.zst, + .enc når kryptert):
//   db/homelab.db   konsistent øyeblikksbilde (db.backup()); ved modul-utvalg bare modulenes tabeller og kv-rader.
//                   Øktene (sessions) tømmes alltid i kopien.
//   files/<mappe>/… filmappene i DATA_DIR som hører til modulene
//   manifest.json   {format, version (CHANGELOG), created, scope, modules, tables, kv, dirs, files:{navn: sha256}, counts}
// Kryptering: AES-256-GCM (samme format som FinansHub-backupen, nøkkel avledet med scrypt fra gjenopprettingsnøkkelen).
// Nøkkelen lagres kryptert med serverhemmeligheten (seal(), som secret()) + sha256-hash, så automatisk backup kan kryptere.
//
// Gjenoppretting (valget som er tatt): databasefilen byttes IKKE ut. Tabellene i de valgte modulene erstattes i én
// transaksjon (ATTACH av kopien, DELETE + INSERT), kv-radene likeså, og filmappene byttes med rename (atomisk per mappe).
// Da trengs ingen omstart, selv for «hele systemet»; svaret har reload:true så klientene laster på nytt (cacher i minnet
// kan ellers vise gamle verdier en stund). Systembackupens egne innstillinger og nøkler (kv sys_backup*), øktene og
// backup_jobs røres aldri.
import { Hono } from 'hono';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, lstatSync, statfsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { sessionUser, isAdmin, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { seal, unseal } from './finans/db.js';
import { tarHeader, untar, encryptStream, decryptFile, smbRun, cdDirOf, parseSmbLs, localArg, normShare, splitShare, SMB_SEG, smbPutError, smbErrorText } from './finans/backup.js';
import { settings as fhSettings, secret as fhSecret } from './finans/db.js';
import { broadcast } from './realtime.js';
import { parseChangelog } from './system-update.js';

const DATA = resolve(config.dataDir);
export const BACKUP_DIR = resolve(process.env.BACKUP_DIR || join(DATA, 'system-backups'));
mkdirSync(BACKUP_DIR, { recursive: true });
const TZ = 'Europe/Oslo';
const ID = /^bk-\d{8}-\d{6}-[0-9a-f]{6}$/;
const FILE = /^bk-\d{8}-\d{6}-[0-9a-f]{6}\.tar\.(gz|zst)(\.enc)?$/;
const q = (sql) => db.prepare(sql);

db.exec(`CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'manual',
  state TEXT NOT NULL DEFAULT 'queued',
  pct INTEGER NOT NULL DEFAULT 0,
  started INTEGER NOT NULL,
  finished INTEGER,
  size INTEGER,
  scope TEXT NOT NULL,
  modules TEXT NOT NULL,
  tables TEXT,
  file TEXT,
  encrypted INTEGER NOT NULL DEFAULT 0,
  key_id TEXT,
  sha256 TEXT,
  cloud TEXT,
  error TEXT,
  by_user TEXT
);`);
// Prompt 30: kopi til nettverksdisk (SMB). {ok, at, path, file?, removed?, error?}
if (!db.prepare('PRAGMA table_info(backup_jobs)').all().some((c) => c.name === 'smb')) db.exec('ALTER TABLE backup_jobs ADD COLUMN smb TEXT');

/* ---------------- Moduler → tabeller, kv-nøkler og filmapper ---------------- */

const like = (...pre) => (k) => pre.some((p) => (p.endsWith('*') ? k.startsWith(p.slice(0, -1)) : k === p));
export const MODULES = [
  { id: 'finans', name: 'Finans', desc: 'Transaksjoner, kvitteringer, budsjett, abonnementer',
    table: (t) => /^fh_/.test(t) || ['receipts', 'merchant_logos', 'ai_log', 'ai_audit'].includes(t), kv: like('fh_*', 't212_*', 'budget', 'loan', 'categories'), dirs: ['receipts', 'finn', 'boliger', 'finans', 'logos'] },
  { id: 'kalender', name: 'Kalender', desc: 'Egne hendelser, rask time', table: (t) => /^cal_/.test(t), kv: like('kal_*'), dirs: [] },
  { id: 'familie', name: 'Familie', desc: 'Posisjoner, soner, helse, bilder', table: (t) => /^family_/.test(t), kv: like('family_*', 'fam_*'), dirs: ['family-photos'] },
  { id: 'mat', name: 'Mat', desc: 'Matplan, oppskrifter, skanninger', table: (t) => /^(mat_|matplan_)/.test(t) || ['dish_link', 'food_folder'].includes(t), kv: like('mat', 'mat_*'), dirs: ['mat'] },
  { id: 'sporing', name: 'Sporing', desc: 'Pakker og hendelser', table: (t) => /^hl_shipment/.test(t), kv: like('trk_*', 'parcelsapp_usage'), dirs: [] },
  { id: 'huske', name: 'Huskeliste', desc: 'Lister og oppgaver', table: (t) => /^(hl_task|huske_)/.test(t), kv: like('huske_*', 'huske_ha', 'tasks_seeded'), dirs: [] },
  { id: 'bursdager', name: 'Bursdager', desc: 'Personer og påminnelser', table: (t) => t === 'birthdays', kv: like('bd_*'), dirs: [] },
  { id: 'chat', name: 'Chat', desc: 'Samtaler og kunnskapsbase', table: (t) => /^hl_chat/.test(t), kv: like('chat_*'), dirs: ['chat'] },
  { id: 'domener', name: 'Domener', desc: 'Domener og oppetid', table: (t) => ['hl_domains', 'hl_uptime'].includes(t), kv: like('hl_domains*'), dirs: [] },
  // Resten av databasen: brukere, enheter, oppsett (kv), karakterer, RSS …
  { id: 'innstillinger', name: 'Innstillinger og brukere', desc: 'Brukere, enheter, oppsett', table: () => true, kv: () => true, dirs: [] },
  { id: 'filer', name: 'Bilder og filer', desc: 'Opplastinger, profilbilder, bakgrunner, lyder, ikoner', table: () => false, kv: () => false, dirs: ['uploads', 'avatars', 'backgrounds', 'sounds', 'photo-window', 'icons'] },
];
export const MODULE_IDS = MODULES.map((m) => m.id);
const NEVER_TABLES = new Set(['sessions', 'backup_jobs', 'sqlite_sequence', 'sqlite_stat1', 'sqlite_stat4']);
// Systembackupens egne innstillinger og nøkler følger aldri med en gjenoppretting.
const NEVER_KV = (k) => k.startsWith('sys_backup');

/** Vanlige tabeller (ikke virtuelle FTS-tabeller eller skyggetabellene deres, de bygges på nytt av seg selv). */
function plainTables(conn = db, schema = 'main') {
  const rows = conn.prepare(`SELECT name, sql FROM ${schema}.sqlite_master WHERE type='table'`).all();
  const virt = rows.filter((r) => /^CREATE VIRTUAL/i.test(r.sql ?? '')).map((r) => r.name);
  return rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_') && !virt.includes(n) && !virt.some((v) => n.startsWith(v + '_')) && !NEVER_TABLES.has(n));
}
/** {modul: [tabeller]}: hver tabell hører til den første modulen som passer (Innstillinger tar resten, kv ligger der også). */
export function tableMap(tables = plainTables()) {
  const out = Object.fromEntries(MODULE_IDS.map((m) => [m, []]));
  for (const t of tables) {
    if (t === 'kv') { out.innstillinger.push(t); continue; }
    const m = MODULES.find((x) => x.table(t));
    if (m) out[m.id].push(t);
  }
  return out;
}
/** Modulen en kv-nøkkel hører til (null = aldri med). */
export function kvModule(key) {
  if (NEVER_KV(key)) return null;
  return MODULES.find((m) => m.id !== 'filer' && m.kv(key))?.id ?? null;
}
export const dirMap = () => Object.fromEntries(MODULES.map((m) => [m.id, m.dirs]));

/* ---------------- Innstillinger ---------------- */

const SCHEDULES = ['nightly', '6h', 'weekly', 'monthly'];
const KEEPS = ['7', '30', '90d', '1y'];
const SCOPES = ['all', 'finans', 'custom'];
const DEFAULTS = { auto: true, schedule: 'nightly', keep: '30', notifyFail: true, scope: 'all', modules: [...MODULE_IDS], encrypt: false,
  cloud: { enabled: false, provider: 'b2', bucket: '', endpoint: '', region: '', prefix: '' }, smb: { enabled: false, share: '', path: '' } };
const rawSettings = () => kv.get(OWNER, 'sys_backup', {}) ?? {};
export function backupSettings() {
  const s = rawSettings();
  const o = { ...DEFAULTS, ...s, cloud: { ...DEFAULTS.cloud, ...(s.cloud ?? {}) }, smb: { ...DEFAULTS.smb, ...(s.smb ?? {}) } };
  o.modules = Array.isArray(o.modules) ? o.modules.filter((m) => MODULE_IDS.includes(m)) : [...MODULE_IDS];
  return o;
}
const secrets = () => kv.get(OWNER, 'sys_backup_secrets', {}) ?? {};
const getSecret = (k) => { try { return unseal(secrets()[k]) || ''; } catch { return ''; } };
const setSecretKv = (k, v) => { const s = secrets(); if (v) s[k] = seal(String(v)); else delete s[k]; kv.set(OWNER, 'sys_backup_secrets', s); };
// Nøkler: {keyId: sealed}. Gamle nøkler beholdes så eldre backuper fortsatt kan gjenopprettes.
const keys = () => kv.get(OWNER, 'sys_backup_keys', {}) ?? {};
const currentKeyId = () => kv.get(OWNER, 'sys_backup_key_current', null);
export const keySet = () => !!currentKeyId() && !!keys()[currentKeyId()];
const keyIdOf = (key) => createHash('sha256').update(String(key)).digest('hex').slice(0, 12);
const keyById = (id) => { try { return unseal(keys()[id]) || ''; } catch { return ''; } };

function newKey() {
  const key = randomBytes(24).toString('base64url').match(/.{1,8}/g).join('-'); // 32 tegn i 4 grupper
  const id = keyIdOf(key);
  kv.set(OWNER, 'sys_backup_keys', { ...keys(), [id]: seal(key) });
  kv.set(OWNER, 'sys_backup_key_current', id);
  kv.set(OWNER, 'sys_backup_key_hashes', { ...(kv.get(OWNER, 'sys_backup_key_hashes', {}) ?? {}), [id]: createHash('sha256').update(key).digest('hex') });
  return { key, keyId: id };
}

const zstdOk = (() => { if (process.env.BACKUP_COMPRESS === 'gz') return false; try { return spawnSync('zstd', ['--version'], { timeout: 3000 }).status === 0; } catch { return false; } })();
export const FORMAT = zstdOk ? 'tar.zst' : 'tar.gz';

function settingsOut() {
  const s = backupSettings();
  let free = null;
  try { const f = statfsSync(BACKUP_DIR); free = f.bavail * f.bsize; } catch { /* ukjent */ }
  const last = q("SELECT * FROM backup_jobs WHERE cloud IS NOT NULL ORDER BY started DESC LIMIT 1").get();
  const lc = last ? JSON.parse(last.cloud) : null;
  const lastSmb = q("SELECT * FROM backup_jobs WHERE smb IS NOT NULL ORDER BY started DESC LIMIT 1").get();
  const ls = lastSmb ? JSON.parse(lastSmb.smb) : null;
  return {
    auto: !!s.auto, schedule: s.schedule, keep: s.keep, notifyFail: !!s.notifyFail, scope: s.scope, modules: s.scope === 'all' ? [...MODULE_IDS] : s.scope === 'finans' ? ['finans'] : s.modules,
    target: { local: true, path: BACKUP_DIR, docker: '/srv/backup', free,
      smb: { ...smbTarget(), lastUpload: ls?.ok ? ls.at : null, lastError: ls && !ls.ok ? ls.error : null, unencrypted: !s.encrypt } },
    cloud: { enabled: !!s.cloud.enabled, provider: s.cloud.provider, bucket: s.cloud.bucket, endpoint: s.cloud.endpoint, region: s.cloud.region, prefix: s.cloud.prefix,
      keySet: !!(getSecret('b2KeyId') && getSecret('b2AppKey')), lastUpload: lc?.ok ? lc.at : null, lastError: lc && !lc.ok ? lc.error : null,
      providers: [{ id: 'b2', name: 'Backblaze B2', supported: true }, { id: 'gdrive', name: 'Google Drive', supported: false, note: 'Kommer' }] },
    encrypt: !!s.encrypt, keySet: keySet(), keyId: keySet() ? currentKeyId() : null,
    moduleList: MODULES.map(({ id, name, desc }) => ({ id, name, desc })), format: FORMAT,
  };
}

/** Validerer og fletter en delvis endring. → {value} eller {error}. */
export function settingsInput(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Forventet et objekt' };
  const cur = backupSettings();
  const v = { ...cur, cloud: { ...cur.cloud } };
  const bool = (k) => { if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw new Error(`${k} må være true/false`); v[k] = b[k]; } };
  try {
    bool('auto'); bool('notifyFail'); bool('encrypt');
    if (b.schedule !== undefined) { if (!SCHEDULES.includes(b.schedule)) throw new Error('schedule må være nightly, 6h, weekly eller monthly'); v.schedule = b.schedule; }
    if (b.keep !== undefined) { if (!KEEPS.includes(String(b.keep))) throw new Error('keep må være 7, 30, 90d eller 1y'); v.keep = String(b.keep); }
    if (b.scope !== undefined) { if (!SCOPES.includes(b.scope)) throw new Error('scope må være all, finans eller custom'); v.scope = b.scope; }
    if (b.modules !== undefined) {
      if (!Array.isArray(b.modules) || !b.modules.every((m) => MODULE_IDS.includes(m))) throw new Error(`modules må være en liste med ${MODULE_IDS.join(', ')}`);
      v.modules = MODULE_IDS.filter((m) => b.modules.includes(m));
    }
    if (v.scope === 'custom' && !v.modules.length) throw new Error('Velg minst én modul');
    if (b.target !== undefined && b.target?.path !== undefined && b.target.path !== BACKUP_DIR) throw new Error('Lagringsstedet settes med BACKUP_DIR på serveren');
    if (b.target?.smb !== undefined) {
      const m = b.target.smb;
      if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('target.smb må være et objekt');
      v.smb = { ...cur.smb };
      if (m.enabled !== undefined) { if (typeof m.enabled !== 'boolean') throw new Error('target.smb.enabled må være true/false'); v.smb.enabled = m.enabled; }
      if (m.share !== undefined) { const sh = m.share ? normShare(m.share) : ''; if (sh === null) throw new Error('Ugyldig share. Bruk formen //server/share'); v.smb.share = sh; }
      if (m.path !== undefined) v.smb.path = smbPathOf(m.path);
      if (v.smb.enabled && !v.smb.share) throw new Error('Sett opp nettverksdisken først (Sett opp nettverksdisk)');
    }
    if (b.cloud !== undefined) {
      const c = b.cloud;
      if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('cloud må være et objekt');
      if (c.provider !== undefined) { if (!['b2', 'gdrive'].includes(c.provider)) throw new Error('provider må være b2 eller gdrive'); v.cloud.provider = c.provider; }
      if (c.enabled !== undefined) { if (typeof c.enabled !== 'boolean') throw new Error('cloud.enabled må være true/false'); v.cloud.enabled = c.enabled; }
      for (const k of ['bucket', 'region', 'prefix', 'endpoint']) if (c[k] !== undefined) v.cloud[k] = String(c[k] ?? '').trim();
      if (v.cloud.bucket && !/^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/i.test(v.cloud.bucket)) throw new Error('Ugyldig bøttenavn');
      if (v.cloud.region && !/^[a-z0-9-]{2,40}$/.test(v.cloud.region)) throw new Error('Ugyldig region');
      v.cloud.endpoint = v.cloud.endpoint.replace(/^https:\/\//, '').replace(/\/+$/, '');
      // Bare Backblaze sitt S3-endepunkt (ikke en vilkårlig adresse på nettet eller i hjemmenettet).
      if (v.cloud.endpoint && !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(v.cloud.endpoint)) throw new Error('Endepunktet må være s3.<region>.backblazeb2.com');
      if (!v.cloud.region && v.cloud.endpoint) v.cloud.region = v.cloud.endpoint.split('.')[1];
      if (v.cloud.prefix && !/^[\w./-]{0,100}$/.test(v.cloud.prefix) || v.cloud.prefix.includes('..')) throw new Error('Ugyldig prefiks');
      if (c.keyId !== undefined && c.keyId !== null && !/^[\w]{10,40}$/.test(String(c.keyId))) throw new Error('Ugyldig nøkkel-ID');
      if (c.appKey !== undefined && c.appKey !== null && !/^[\w+/=-]{10,80}$/.test(String(c.appKey))) throw new Error('Ugyldig applikasjonsnøkkel');
      if (v.cloud.enabled && v.cloud.provider === 'gdrive') throw new Error('Google Drive kommer senere');
    }
    if (v.encrypt && !keySet()) throw Object.assign(new Error('Lag gjenopprettingsnøkkelen først (POST /api/backup/key)'), { status: 409 });
    // Aldri ukryptert til sky.
    if (v.cloud.enabled && !v.encrypt) throw new Error('Kopi til sky krever at backupen krypteres');
    if (v.cloud.enabled && (!v.cloud.bucket || !v.cloud.endpoint)) throw new Error('Fyll inn bøtte og endepunkt for Backblaze B2');
  } catch (e) { return { error: e.message, status: e.status ?? 400 }; }
  return { value: v, keyId: b.cloud?.keyId, appKey: b.cloud?.appKey };
}

/* ---------------- Jobber ---------------- */

const stampOf = (t = Date.now()) => new Date(t).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const newId = (t) => `bk-${stampOf(t)}-${randomBytes(3).toString('hex')}`;
const getJob = (id) => (ID.test(String(id)) ? q('SELECT * FROM backup_jobs WHERE id=?').get(id) : undefined);
const setJob = (id, f) => { const k = Object.keys(f); q(`UPDATE backup_jobs SET ${k.map((x) => `${x}=@${x}`).join(', ')} WHERE id=@id`).run({ ...f, id }); };
export function jobOut(r) {
  if (!r) return null;
  const o = { id: r.id, at: new Date(r.started).toISOString(), finishedAt: r.finished ? new Date(r.finished).toISOString() : null, size: r.size ?? null, scope: r.scope,
    modules: JSON.parse(r.modules), ok: r.state === 'done', state: r.state, pct: r.pct, encrypted: !!r.encrypted, kind: r.kind, format: r.file?.includes('.tar.zst') ? 'tar.zst' : 'tar.gz' };
  if (r.error) o.error = r.error;
  if (r.cloud) o.cloud = JSON.parse(r.cloud);
  if (r.smb) o.smb = JSON.parse(r.smb);
  return o;
}
const modulesOf = (scope, modules) => (scope === 'all' ? [...MODULE_IDS] : scope === 'finans' ? ['finans'] : MODULE_IDS.filter((m) => (modules ?? []).includes(m)));

let running = null; // {id, promise}
export const backupRunning = () => running?.id ?? null;
let lastPct = -1;
function progress(id, pct) {
  pct = Math.max(0, Math.min(100, Math.floor(pct)));
  if (pct === lastPct) return;
  lastPct = pct;
  setJob(id, { pct });
  broadcast('system-backup', { action: 'progress', id, pct });
}

function walk(root, base, out) {
  let list;
  try { list = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const f of list) {
    const p = join(root, f.name);
    if (f.isSymbolicLink()) continue; // lenker følges aldri
    if (f.isDirectory()) walk(p, base, out);
    else if (f.isFile()) out.push({ name: 'files/' + p.slice(base.length + 1).split(sep).join('/'), path: p });
  }
}

/** Tar-strøm med sha256 per fil. manifest() kalles til slutt med hashene og legges sist i arkivet. */
async function* tarWithHashes(entries, hashes, onBytes, manifest) {
  for (const e of entries) {
    let size;
    try { size = lstatSync(e.path).size; } catch { continue; } // fila forsvant underveis
    const h = createHash('sha256');
    yield tarHeader(e.name, size, Date.now());
    let n = 0;
    if (size > 0) {
      for await (const chunk of createReadStream(e.path, { start: 0, end: size - 1 })) { n += chunk.length; h.update(chunk); onBytes(chunk.length); yield chunk; }
    }
    if (n < size) { const z = Buffer.alloc(size - n); h.update(z); yield z; } // fila krympet: fyll ut
    hashes[e.name] = h.digest('hex');
    if (size % 512) yield Buffer.alloc(512 - (size % 512));
  }
  const m = Buffer.from(JSON.stringify(manifest(), null, 1));
  yield tarHeader('manifest.json', m.length, Date.now()); yield m;
  if (m.length % 512) yield Buffer.alloc(512 - (m.length % 512));
  yield Buffer.alloc(1024);
}

function zstdStream(args) {
  const p = spawn('zstd', args, { stdio: ['pipe', 'pipe', 'ignore'] });
  // Duplex: skriv til stdin, les fra stdout.
  const t = new Transform({
    transform(ch, _e, cb) { if (!p.stdin.write(ch)) p.stdin.once('drain', cb); else cb(); },
    flush(cb) { p.stdout.on('end', () => cb()); p.stdin.end(); },
  });
  p.stdout.on('data', (d) => t.push(d));
  p.on('error', (e) => t.destroy(e));
  p.on('exit', (code) => { if (code) t.destroy(new Error(`zstd avsluttet med ${code}`)); });
  return t;
}
const compressor = () => (zstdOk ? zstdStream(['-q', '-c', '-3', '-T0']) : createGzip());
const decompressor = (file) => (/\.tar\.zst/.test(file) ? zstdStream(['-q', '-d', '-c']) : createGunzip());

function version() {
  try { return parseChangelog(readFileSync(resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md'), 'utf8'))[0]?.version ?? null; } catch { return null; }
}

/** Øyeblikksbilde av databasen til path. Ved modul-utvalg slettes alt annet. → {tables:{modul:[…]}, kv:{modul: antall}} */
async function snapshot(path, mods) {
  await db.backup(path);
  const s = new Database(path);
  try {
    s.pragma('journal_mode = DELETE');
    s.pragma('foreign_keys = OFF');
    s.prepare('DELETE FROM sessions').run();
    const map = tableMap(plainTables(s));
    const keep = new Set(mods.flatMap((m) => map[m] ?? []));
    const all = mods.length === MODULE_IDS.length;
    if (!all) {
      const hasKv = mods.some((m) => m !== 'filer');
      for (const r of s.prepare("SELECT name FROM sqlite_master WHERE type='view'").all()) s.exec(`DROP VIEW IF EXISTS "${r.name}"`);
      const virt = s.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL%'").pluck().all();
      for (const t of virt) s.exec(`DROP TABLE IF EXISTS "${t}"`);
      for (const t of s.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").pluck().all()) {
        if (t === 'kv' && hasKv) continue;
        if (!keep.has(t)) s.exec(`DROP TABLE IF EXISTS "${t}"`);
      }
      if (hasKv) {
        const del = s.prepare('DELETE FROM kv WHERE user=? AND key=?');
        s.transaction(() => { for (const r of s.prepare('SELECT user, key FROM kv').all()) { const m = kvModule(r.key); if (!m || !mods.includes(m)) del.run(r.user, r.key); } })();
      }
      s.exec('VACUUM');
    }
    const kvCount = {};
    if (s.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kv'").get()) for (const r of s.prepare('SELECT key FROM kv').all()) { const m = kvModule(r.key); if (m && mods.includes(m)) kvCount[m] = (kvCount[m] ?? 0) + 1; }
    const tables = Object.fromEntries(mods.map((m) => [m, (map[m] ?? []).filter((t) => keep.has(t) && (t !== 'kv'))]));
    const counts = Object.fromEntries(Object.values(tables).flat().map((t) => [t, s.prepare(`SELECT count(*) FROM "${t}"`).pluck().get()]));
    return { tables, kv: kvCount, counts };
  } finally { s.close(); }
}

/** Kjører en backup. → {id, done: Promise<job>} (done kaster aldri; feilen står i jobben). */
export function startBackup({ scope = 'all', modules = null, kind = 'manual', by = null } = {}) {
  if (running) throw Object.assign(new Error('En backup eller gjenoppretting pågår allerede'), { status: 409, id: running.id });
  const mods = modulesOf(scope, modules);
  if (!mods.length) throw Object.assign(new Error('Velg minst én modul'), { status: 400 });
  const st = backupSettings();
  const t0 = Date.now();
  const id = newId(t0);
  q('INSERT INTO backup_jobs(id, kind, state, pct, started, scope, modules, by_user) VALUES(?,?,?,?,?,?,?,?)').run(id, kind, 'running', 0, t0, scope, JSON.stringify(mods), by);
  lastPct = -1;
  broadcast('system-backup', { action: 'started', id, kind });
  const done = (async () => {
    const work = join(BACKUP_DIR, `.work-${id}`);
    const encKeyId = st.encrypt ? currentKeyId() : null;
    // Sikkerhetskopien før en gjenoppretting blir bare liggende lokalt: mangler nøkkelen (serveren har mistet den),
    // tas den ukryptert heller enn at gjenopprettingen stopper. Den lastes aldri opp til sky.
    const key = encKeyId ? keyById(encKeyId) : '';
    if (st.encrypt && !key && kind === 'safety') st.encrypt = false;
    const file = `${id}.${FORMAT}${key ? '.enc' : ''}`;
    const out = join(BACKUP_DIR, file), part = out + '.part';
    try {
      if (st.encrypt && !key) throw new Error('Krypteringsnøkkelen mangler. Lag en ny under Hvor → Krypter backup.');
      mkdirSync(work, { recursive: true });
      const snap = join(work, 'homelab.db');
      const info = await snapshot(snap, mods);
      progress(id, 10);
      const entries = [{ name: 'db/homelab.db', path: snap }];
      const dirs = {};
      for (const m of mods) {
        for (const d of MODULES.find((x) => x.id === m).dirs) {
          const root = join(DATA, d);
          if (!existsSync(root)) continue;
          dirs[m] = [...(dirs[m] ?? []), d];
          walk(root, DATA, entries);
        }
      }
      let total = 0; for (const e of entries) { try { total += statSync(e.path).size; } catch { /* */ } }
      let sent = 0;
      const hashes = {};
      const manifest = () => ({ format: 'homelab-system-backup', formatVersion: 1, version: version(), created: new Date(t0).toISOString(), id, scope, modules: mods,
        tables: info.tables, kv: info.kv, counts: info.counts, dirs, files: hashes, encrypted: !!key, keyId: encKeyId, compression: FORMAT });
      const fileHash = createHash('sha256');
      const tap = new Transform({ transform(ch, _e, cb) { fileHash.update(ch); cb(null, ch); } });
      const ws = createWriteStream(part, { mode: 0o600 });
      const src = Readable.from(tarWithHashes(entries, hashes, (n) => { sent += n; progress(id, 10 + (total ? (sent / total) * 85 : 85)); }, manifest));
      if (key) await pipeline(src, compressor(), encryptStream(key, tap), tap, ws);
      else await pipeline(src, compressor(), tap, ws);
      renameSync(part, out);
      const size = statSync(out).size;
      setJob(id, { state: 'done', pct: 100, finished: Date.now(), size, file, encrypted: key ? 1 : 0, key_id: encKeyId, sha256: fileHash.digest('hex'), tables: JSON.stringify(info.tables) });
      if (kind !== 'safety') rotate(st.keep);
      else rotateSafety();
      if (st.cloud.enabled && kind !== 'safety') await cloudUpload(id).catch(() => {});
      if (st.smb.enabled && kind !== 'safety') await smbUpload(id).catch(() => {});
      const job = jobOut(getJob(id));
      broadcast('system-backup', { action: 'done', id, job, title: 'Backup', body: '✓ Backup ferdig', category: 'system' });
      return job;
    } catch (e) {
      rmSync(part, { force: true });
      const msg = String(e?.message ?? e).slice(0, 500);
      console.error(`[system-backup] ${id} feilet: ${msg}`);
      setJob(id, { state: 'failed', finished: Date.now(), error: msg });
      const job = jobOut(getJob(id));
      broadcast('system-backup', { action: 'failed', id, job, title: 'Backup feilet', body: `Backup feilet: ${msg}`, category: 'system', silent: !st.notifyFail });
      // Ingen e-posttjeneste for utgående post finnes på serveren: varselet går som sanntid/push til administratorene og loggen.
      return job;
    } finally {
      rmSync(work, { recursive: true, force: true });
      if (running?.id === id) running = null;
    }
  })();
  running = { id, promise: done };
  return { id, done };
}

/* ---------------- Rotasjon ---------------- */

function removeJob(r) {
  if (r.file && FILE.test(r.file)) rmSync(join(BACKUP_DIR, r.file), { force: true });
  q('DELETE FROM backup_jobs WHERE id=?').run(r.id);
}
/** Sletter gamle backuper etter keep ('7' | '30' | '90d' | '1y'). Den nyeste vellykkede beholdes alltid. → antall slettet. */
export function rotate(keep = backupSettings().keep, now = Date.now()) {
  const ok = q("SELECT * FROM backup_jobs WHERE state='done' AND kind<>'safety' ORDER BY started DESC").all();
  let gone = [];
  if (keep === '7' || keep === '30') gone = ok.slice(Number(keep));
  else { const days = keep === '1y' ? 365 : 90; gone = ok.slice(1).filter((r) => now - r.started > days * 86_400_000); }
  for (const r of gone) removeJob(r);
  // Feilede jobber: behold de 20 siste radene.
  for (const r of q("SELECT * FROM backup_jobs WHERE state='failed' ORDER BY started DESC").all().slice(20)) removeJob(r);
  return gone.length;
}
function rotateSafety() { for (const r of q("SELECT * FROM backup_jobs WHERE state='done' AND kind='safety' ORDER BY started DESC").all().slice(5)) removeJob(r); }

/* ---------------- Tidsplan ---------------- */

function osloParts(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, d: +p.day, hh: +p.hour, mm: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
/** Tidsluken som gjelder nå (eller null): nattlig 03:00, hver 6. time, søndag 03:00, den 1. kl. 03:00 (Europe/Oslo). */
export function dueSlot(schedule, t = Date.now(), windowMin = 10) {
  const o = osloParts(t);
  if (o.mm >= windowMin) return null;
  if (schedule === 'nightly' && o.hh === 3) return `n-${o.date}`;
  if (schedule === '6h' && o.hh % 6 === 0) return `6h-${o.date}-${o.hh}`;
  if (schedule === 'weekly' && o.wd === 0 && o.hh === 3) return `w-${o.date}`;
  if (schedule === 'monthly' && o.d === 1 && o.hh === 3) return `m-${o.date}`;
  return null;
}
export function nextRun(schedule, t = Date.now()) {
  let x = Math.ceil((t + 1) / 3_600_000) * 3_600_000;
  for (let i = 0; i < 24 * 33; i++, x += 3_600_000) if (dueSlot(schedule, x, 1)) return new Date(x).toISOString();
  return null;
}
/** Én sjekk (kalles hvert minutt). → id for en startet backup, eller null. */
export function schedulerTick(t = Date.now()) {
  const st = backupSettings();
  if (!st.auto || running) return null;
  const slot = dueSlot(st.schedule, t);
  if (!slot || kv.get(OWNER, 'sys_backup_slot', null) === slot) return null;
  kv.set(OWNER, 'sys_backup_slot', slot);
  try { return startBackup({ scope: st.scope, modules: st.modules, kind: 'auto', by: 'tidsplan' }).id; } catch (e) { console.error('[system-backup] tidsplan:', e.message); return null; }
}
let timer = null;
export function startSystemBackupScheduler() {
  if (timer) return;
  // Jobber som ble avbrutt av en omstart.
  q("UPDATE backup_jobs SET state='failed', error='Avbrutt (serveren startet på nytt)', finished=? WHERE state IN ('queued','running')").run(Date.now());
  for (const f of readdirSync(BACKUP_DIR)) if (/^\.work-|\.part$/.test(f)) rmSync(join(BACKUP_DIR, f), { recursive: true, force: true });
  timer = setInterval(() => schedulerTick(), 60_000);
  timer.unref?.();
}

/* ---------------- Sky: Backblaze B2 (S3-kompatibelt, AWS Signature V4) ---------------- */

const sha256hex = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
/**
 * AWS SigV4 for S3. headers: {navn: verdi} (host må være med). → {authorization, signature, canonicalRequest, stringToSign}
 * payloadHash: sha256 av kroppen i hex, eller 'UNSIGNED-PAYLOAD'.
 */
export function sigv4({ method, path, query = {}, headers, payloadHash, region, service = 's3', accessKey, secretKey, amzDate }) {
  const date = amzDate.slice(0, 8);
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const names = Object.keys(h).sort();
  const canonicalUri = path.split('/').map((seg) => rfc3986(decodeURIComponent(seg))).join('/');
  const canonicalQuery = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(String(query[k]))}`).join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, names.map((n) => `${n}:${h[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + secretKey, date), region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return { authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`, signature, canonicalRequest, stringToSign };
}
let cloudFetch = (...a) => fetch(...a);
/** Bare for tester. */
export const _setCloudFetch = (fn) => { cloudFetch = fn ?? ((...a) => fetch(...a)); };

/** Laster opp den krypterte fila til B2. Ukryptert sendes aldri. */
export async function cloudUpload(id) {
  const r = getJob(id);
  const st = backupSettings();
  const mark = (o) => { setJob(id, { cloud: JSON.stringify({ provider: 'b2', at: new Date().toISOString(), ...o }) }); return o; };
  if (!r || r.state !== 'done') throw new Error('Fant ikke backupen');
  if (!r.encrypted || !/\.enc$/.test(r.file)) return mark({ ok: false, error: 'Bare krypterte backuper lastes opp til sky' });
  const accessKey = getSecret('b2KeyId'), secretKey = getSecret('b2AppKey');
  if (!accessKey || !secretKey || !st.cloud.bucket || !st.cloud.endpoint) return mark({ ok: false, error: 'Backblaze B2 er ikke satt opp' });
  const keyName = `${st.cloud.prefix ? st.cloud.prefix.replace(/\/+$/, '') + '/' : ''}${r.file}`;
  const host = st.cloud.endpoint;
  const path = `/${st.cloud.bucket}/${keyName}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const size = statSync(join(BACKUP_DIR, r.file)).size;
  const headers = { host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amzDate, 'content-length': String(size), 'content-type': 'application/octet-stream' };
  const sig = sigv4({ method: 'PUT', path, headers, payloadHash: 'UNSIGNED-PAYLOAD', region: st.cloud.region || host.split('.')[1], accessKey, secretKey, amzDate });
  try {
    const { host: _h, ...send } = headers;
    const res = await cloudFetch(`https://${host}${path.split('/').map((s) => rfc3986(decodeURIComponent(s))).join('/')}`, {
      method: 'PUT', headers: { ...send, authorization: sig.authorization }, body: Readable.toWeb(createReadStream(join(BACKUP_DIR, r.file))), duplex: 'half', signal: AbortSignal.timeout(6 * 3_600_000) });
    if (!res.ok) throw new Error(`B2 svarte ${res.status}`);
    return mark({ ok: true, key: keyName });
  } catch (e) { return mark({ ok: false, error: String(e.message).slice(0, 200) }); }
}

/* ---------------- Nettverksdisk (SMB, prompt 30) ---------------- */
// Pålogging (bruker, domene, versjon, passord) er felles med FinansHub-backupen (smbUser/smbDomain/smbVersion/smbPass);
// selve målet (share + mappe) ligger i sys_backup.smb. Settes opp med veiviseren (server/smb-browse.js).
// Ferdig backupfil kopieres dit etter lokal lagring (kryptert eller ikke – på eget LAN er kryptering anbefalt, ikke påkrevd),
// og gamle bk-*-filer der roteres etter samme keep som lokalt. Andre filer i mappen røres aldri.

/** Mappe relativ til sharen; kaster ved ugyldige navn (samme regler som veiviseren). */
export function smbPathOf(p) {
  const segs = String(p ?? '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (segs.length > 24 || !segs.every((x) => SMB_SEG.test(x))) throw new Error('Ugyldig mappe på nettverksdisken');
  return segs.join('/');
}
export const smbTarget = () => { const m = backupSettings().smb; return { enabled: !!m.enabled, share: m.share || '', path: m.path || '', label: m.share ? `${m.share}${m.path ? '/' + m.path : ''}` : '' }; };
export function setSmbTarget(o) {
  const cur = backupSettings();
  const next = { ...cur.smb, ...(o.enabled !== undefined ? { enabled: !!o.enabled } : {}), ...(o.share !== undefined ? { share: o.share ? normShare(o.share) ?? '' : '' } : {}), ...(o.path !== undefined ? { path: smbPathOf(o.path) } : {}) };
  if (next.enabled && !next.share) throw new Error('Mangler share');
  kv.set(OWNER, 'sys_backup', { ...rawSettings(), smb: next });
  return smbTarget();
}
const smbConn = () => { const f = fhSettings(OWNER); return { user: f.smbUser, password: fhSecret('smbPass', OWNER), domain: f.smbDomain, proto: f.smbVersion }; };
const smbWhere = (m) => { const { share, sub } = splitShare(m.share); return { share, dir: [sub, m.path].filter(Boolean).join('/') }; };
/** Navnene som skal slettes på nettverksdisken etter keep (nyeste først; den nyeste beholdes alltid). */
export function smbRotateList(names, keep, now = Date.now()) {
  const list = names.filter((n) => FILE.test(n)).sort().reverse();
  if (keep === '7' || keep === '30') return list.slice(Number(keep));
  const days = keep === '1y' ? 365 : 90;
  return list.slice(1).filter((n) => { const m = n.match(/^bk-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/); return m && now - Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) > days * 86_400_000; });
}
/** Kopierer backupen id til nettverksdisken og roterer der. Feil lagres i jobben (smb). */
export async function smbUpload(id) {
  const r = getJob(id);
  const st = backupSettings();
  const mark = (o) => { setJob(id, { smb: JSON.stringify({ at: new Date().toISOString(), path: smbTarget().label, ...o }) }); return o; };
  if (!r || r.state !== 'done' || !r.file || !FILE.test(r.file)) throw new Error('Fant ikke backupen');
  if (!st.smb.share) return mark({ ok: false, error: 'Nettverksdisken er ikke satt opp' });
  const { share, dir } = smbWhere(st.smb);
  const c = smbConn();
  try {
    // Prompt 34: til «.part» først, så rename når opplastingen er ferdig. NT_STATUS-feil i -c gir den ekte feilkoden.
    const putOut = await smbRun({ share, ...c, cmd: `${cdDirOf(dir)}put "${localArg(join(BACKUP_DIR, r.file))}" "${r.file}.part"; rename "${r.file}.part" "${r.file}"`, timeout: 6 * 3_600_000 });
    { const stc = smbPutError(putOut); if (stc) throw new Error(`${smbErrorText(stc).message} (${stc.replace(/^NT_/, '')})`); }
    let removed = 0;
    try {
      const names = parseSmbLs(await smbRun({ share, ...c, cmd: `${cdDirOf(dir)}ls`, timeout: 60_000 })).filter((x) => x.type === 'file').map((x) => x.name);
      if (!names.includes(r.file)) throw new Error('Fila kom ikke fram på nettverksdisken');
      const old = smbRotateList(names, st.keep);
      if (old.length) { await smbRun({ share, ...c, cmd: `${cdDirOf(dir)}${old.map((n) => `del "${n}"`).join('; ')}`, timeout: 120_000 }); removed = old.length; }
    } catch (e) { if (/kom ikke fram/.test(e.message)) throw e; console.warn('[system-backup] rotasjon på nettverksdisk:', e.message); }
    return mark({ ok: true, file: r.file, removed });
  } catch (e) {
    console.error(`[system-backup] ${id} kopi til nettverksdisk feilet: ${e.message}`);
    return mark({ ok: false, error: String(e.message).slice(0, 300) });
  }
}

/* ---------------- Gjenoppretting ---------------- */

const qi = (n) => `"${String(n).replace(/"/g, '""')}"`;
async function extract(r, keyOverride) {
  const src = join(BACKUP_DIR, r.file);
  if (!FILE.test(r.file) || !resolve(src).startsWith(BACKUP_DIR + sep) || !existsSync(src)) throw Object.assign(new Error('Backupfila finnes ikke'), { status: 404 });
  // I DATA_DIR (samme filsystem), så mappene kan byttes med rename.
  const dest = join(DATA, `.restore-${randomBytes(6).toString('hex')}`);
  mkdirSync(dest, { recursive: true });
  let plain = src, tmp = null;
  try {
    if (r.encrypted) {
      const key = keyOverride || (r.key_id ? keyById(r.key_id) : '');
      if (!key) throw Object.assign(new Error('Fant ikke nøkkelen til denne backupen. Lim inn gjenopprettingsnøkkelen.'), { status: 400, needKey: true });
      tmp = join(dest, '.plain');
      try { await decryptFile(src, key, tmp); } catch { throw Object.assign(new Error('Feil gjenopprettingsnøkkel, eller fila er skadet'), { status: 400, needKey: true }); }
      plain = tmp;
    }
    await pipeline(createReadStream(plain), decompressor(r.file), untar(dest));
    if (tmp) rmSync(tmp, { force: true });
    const manifest = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'homelab-system-backup') throw new Error('Ukjent backupformat');
    for (const [name, hash] of Object.entries(manifest.files ?? {})) {
      if (!/^(db\/homelab\.db|files\/[^\0]+)$/.test(name) || name.split('/').includes('..')) throw new Error('Ugyldig filnavn i backupen');
      const p = resolve(dest, name);
      if (!p.startsWith(dest + sep) || !existsSync(p)) throw new Error(`Mangler ${name} i backupen`);
      const h = createHash('sha256');
      for await (const ch of createReadStream(p)) h.update(ch);
      if (h.digest('hex') !== hash) throw new Error(`Sjekksummen stemmer ikke for ${name}`);
    }
    return { dest, manifest };
  } catch (e) { rmSync(dest, { recursive: true, force: true }); throw e; }
}

/** Erstatter de valgte modulene fra en utpakket backup. */
function applyRestore(dest, manifest, mods) {
  const file = join(dest, 'db', 'homelab.db');
  const now = tableMap();
  const mainTables = new Set(plainTables());
  db.prepare('ATTACH DATABASE ? AS bk').run(file);
  const restored = {};
  try {
    const bkTables = new Set(plainTables(db, 'bk'));
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const m of mods) {
          const tables = [...new Set([...(now[m] ?? []), ...(manifest.tables?.[m] ?? [])])].filter((t) => t !== 'kv' && mainTables.has(t) && bkTables.has(t));
          for (const t of tables) {
            const mc = db.prepare(`PRAGMA main.table_info(${qi(t)})`).all().map((c) => c.name);
            const bc = new Set(db.prepare(`PRAGMA bk.table_info(${qi(t)})`).all().map((c) => c.name));
            const cols = mc.filter((c) => bc.has(c)).map(qi).join(', ');
            db.exec(`DELETE FROM main.${qi(t)}`);
            if (cols) db.exec(`INSERT INTO main.${qi(t)} (${cols}) SELECT ${cols} FROM bk.${qi(t)}`);
          }
          restored[m] = tables;
        }
        if (bkTables.has('kv') && mods.some((m) => m !== 'filer')) {
          const del = db.prepare('DELETE FROM main.kv WHERE user=? AND key=?');
          for (const r of db.prepare('SELECT user, key FROM main.kv').all()) { const m = kvModule(r.key); if (m && mods.includes(m)) del.run(r.user, r.key); }
          const ins = db.prepare('INSERT OR REPLACE INTO main.kv(user, key, value) VALUES(?,?,?)');
          for (const r of db.prepare('SELECT user, key, value FROM bk.kv').all()) { const m = kvModule(r.key); if (m && mods.includes(m)) ins.run(r.user, r.key, r.value); }
        }
      })();
    } finally { db.pragma('foreign_keys = ON'); }
  } finally { db.exec('DETACH DATABASE bk'); }
  // Filmapper: hver mappe byttes med rename (gammel → .old-*, ny → plass, gammel slettes).
  const dirsDone = [];
  for (const m of mods) {
    for (const d of MODULES.find((x) => x.id === m).dirs) {
      if (!(manifest.dirs?.[m] ?? []).includes(d)) continue;
      const src = join(dest, 'files', d), dst = join(DATA, d);
      if (!existsSync(src)) continue;
      const old = join(DATA, `.old-${d}-${randomBytes(4).toString('hex')}`);
      if (existsSync(dst)) renameSync(dst, old);
      try { renameSync(src, dst); } catch (e) { if (existsSync(old)) renameSync(old, dst); throw e; }
      rmSync(old, { recursive: true, force: true });
      dirsDone.push(d);
    }
  }
  return { tables: restored, dirs: dirsDone };
}

/** Gjenoppretter modulene fra backupen id. Tar en full sikkerhetskopi først. → {ok, safetyId, modules, tables, dirs} */
export async function restoreBackup({ id, modules, by = null, key = null }) {
  const r = getJob(id);
  if (!r || r.state !== 'done') throw Object.assign(new Error('Fant ikke backupen'), { status: 404 });
  const inBackup = JSON.parse(r.modules);
  const mods = Array.isArray(modules) && modules.length ? modules : inBackup;
  if (!mods.every((m) => MODULE_IDS.includes(m))) throw Object.assign(new Error('Ukjent modul'), { status: 400 });
  const missing = mods.filter((m) => !inBackup.includes(m));
  if (missing.length) throw Object.assign(new Error(`Backupen inneholder ikke ${missing.join(', ')}`), { status: 400 });
  if (running) throw Object.assign(new Error('En backup eller gjenoppretting pågår allerede'), { status: 409 });
  // Pakk ut og sjekk før noe endres (feil nøkkel stopper her).
  const { dest, manifest } = await extract(r, key);
  try {
    const safety = startBackup({ scope: 'all', kind: 'safety', by });
    const sj = await safety.done;
    if (!sj?.ok) throw Object.assign(new Error(`Sikkerhetskopien feilet, ingenting er gjenopprettet: ${sj?.error ?? ''}`), { status: 500 });
    running = { id: `restore-${id}`, promise: null };
    try {
      const res = applyRestore(dest, manifest, mods);
      console.warn(`[system-backup] gjenopprettet ${mods.join(', ')} fra ${id} (av ${by}), sikkerhetskopi ${safety.id}`);
      broadcast('system-backup', { action: 'restored', id, modules: mods, safetyId: safety.id });
      return { ok: true, safetyId: safety.id, modules: mods, ...res };
    } finally { running = null; }
  } finally { rmSync(dest, { recursive: true, force: true }); }
}

/* ---------------- Ruter ---------------- */

const SCHED_TEXT = { nightly: 'Hver natt 03:00', '6h': 'Hver 6. time', weekly: 'Hver uke (søndag)', monthly: 'Hver måned' };
const SCOPE_TEXT = { all: 'Hele systemet', finans: 'Bare Finans', custom: 'Egendefinert' };
const api = new Hono();

api.use('*', async (c, next) => {
  const write = !['GET', 'HEAD'].includes(c.req.method);
  let user = sessionUser(c), session = !!user;
  if (!user && bearerOk(c, write ? 'finance:write' : 'finance:read')) user = c.get('user');
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(user)) return c.json({ error: 'Bare administratorer kan se og endre systembackup' }, 403);
  if (write && session && !/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  c.set('user', user);
  c.set('access', { user, session, admin: true });
  await next();
});
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
function passwordOk(c, password) {
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  if (!checkPassword(c.get('user'), password)) { loginFailed(ip); return c.json({ error: 'Feil passord' }, 403); }
  loginSucceeded(ip);
  return null;
}

api.get('/settings', (c) => c.json(settingsOut()));
api.put('/settings', async (c) => {
  const r = settingsInput(await body(c));
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  if (r.keyId !== undefined) setSecretKv('b2KeyId', r.keyId);
  if (r.appKey !== undefined) setSecretKv('b2AppKey', r.appKey);
  kv.set(OWNER, 'sys_backup', r.value);
  return c.json(settingsOut());
});
api.post('/key', async (c) => {
  const b = await body(c);
  if (keySet() && b.rotate !== true) return c.json({ error: 'Gjenopprettingsnøkkelen er allerede laget og vises bare én gang. Send rotate:true og passordet for å lage en ny.', keySet: true }, 409);
  if (keySet()) { const bad = passwordOk(c, b.password); if (bad) return bad; }
  const k = newKey();
  console.warn(`[system-backup] ny gjenopprettingsnøkkel ${k.keyId} laget av ${c.get('user')}`);
  return c.json(k);
});
api.post('/run', async (c) => {
  const b = await body(c);
  const st = backupSettings();
  const scope = b.scope ?? st.scope;
  if (!SCOPES.includes(scope)) return c.json({ error: 'scope må være all, finans eller custom' }, 400);
  if (b.modules !== undefined && (!Array.isArray(b.modules) || !b.modules.every((m) => MODULE_IDS.includes(m)))) return c.json({ error: 'Ukjent modul' }, 400);
  try { return c.json({ id: startBackup({ scope, modules: b.modules ?? st.modules, kind: 'manual', by: c.get('user') }).id }, 202); }
  catch (e) { return c.json({ error: e.message, ...(e.id ? { id: e.id } : {}) }, e.status ?? 500); }
});
api.get('/status', (c) => {
  const st = backupSettings();
  const last = q("SELECT * FROM backup_jobs WHERE state IN ('done','failed') AND kind<>'safety' ORDER BY started DESC LIMIT 1").get();
  const run = running?.id && ID.test(running.id) ? getJob(running.id) : q("SELECT * FROM backup_jobs WHERE state='running' ORDER BY started DESC LIMIT 1").get();
  return c.json({ last: jobOut(last), running: jobOut(run), restoring: !!running && !ID.test(running.id), next: st.auto ? nextRun(st.schedule) : null,
    summary: st.auto ? `${SCHED_TEXT[st.schedule]} · ${SCOPE_TEXT[st.scope]}` : 'Automatisk av' });
});
api.get('/list', (c) => c.json(q("SELECT * FROM backup_jobs WHERE state IN ('done','failed') ORDER BY started DESC LIMIT 200").all().map(jobOut)));
api.post('/restore', async (c) => {
  const b = await body(c);
  if (!ID.test(String(b.id ?? ''))) return c.json({ error: 'Ugyldig id' }, 400);
  if (b.modules !== undefined && (!Array.isArray(b.modules) || !b.modules.every((m) => MODULE_IDS.includes(m)))) return c.json({ error: 'Ukjent modul' }, 400);
  if (b.key !== undefined && b.key !== null && (typeof b.key !== 'string' || b.key.length > 200)) return c.json({ error: 'Ugyldig nøkkel' }, 400);
  const bad = passwordOk(c, b.password);
  if (bad) return bad;
  try { return c.json({ ...(await restoreBackup({ id: b.id, modules: b.modules, by: c.get('user'), key: b.key || null })), reload: true }); }
  catch (e) { return c.json({ error: String(e.message).slice(0, 500), ...(e.needKey ? { needKey: true } : {}) }, e.status ?? 500); }
});
api.get('/:id/download', (c) => {
  if (!c.get('access').session) return c.json({ error: 'Nedlasting må gjøres i nettleseren' }, 403);
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Ugyldig id' }, 400);
  const r = getJob(id);
  if (!r || r.state !== 'done' || !r.file || !FILE.test(r.file) || !r.file.startsWith(id + '.')) return c.json({ error: 'Fant ikke backupen' }, 404);
  const p = resolve(BACKUP_DIR, r.file);
  if (!p.startsWith(BACKUP_DIR + sep) || !existsSync(p)) return c.json({ error: 'Fant ikke backupfila' }, 404);
  const size = statSync(p).size;
  return new Response(Readable.toWeb(createReadStream(p)), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size),
    'Content-Disposition': `attachment; filename="${r.file}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
});

export const _test = { getJob, keyById, currentKeyId, setRunning: (v) => { running = v; } };
export default api;
