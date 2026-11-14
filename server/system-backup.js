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
//   (prompt 90) POST /upload  kropp = fila (application/octet-stream), bare økt i nettleseren. Se «Opplasting» under.
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
//
// Opplasting (prompt 90, BKUP90): en backupfil fra PC-en (lastet ned med /:id/download) kan lastes opp og så gjenopprettes med
// den vanlige POST /restore (passord på nytt, sikkerhetskopi først). Fila strømmes til en midlertidig .part-fil i BACKUP_DIR
// (aldri i minnet), i én forespørsel eller i biter (Cloudflare-tunnelen slipper ikke gjennom store kropper):
//   POST /upload  X-Backup-Filename: <filnavn>  X-Upload-Size: <totalt antall byte>  [X-Upload-Id, X-Upload-Offset for neste bit]
//     → 202 {uploadId, received, total} mens det mangler biter, og når alt er mottatt og sjekket:
//     → 200 {id, created, version, scope, modules, encrypted, needKey, size}
// Filnavnet brukes bare til formatet (.tar.gz | .tar.zst, + .enc), aldri som sti. Grense: BACKUP_UPLOAD_MAX (standard 20 GB) og
// ledig plass. Innholdet sjekkes uten å pakkes ut: tar-hodene (ingen «..», absolutte stier eller lenker, bare db/, files/ og
// manifest.json), manifest.json (format, moduler) og sha256 for hver fil mot manifestet. Krypterte filer prøves med nøklene
// serveren har; ukjent nøkkel → lagres likevel med needKey, og innholdet sjekkes ved gjenoppretting med nøkkelen brukeren limer inn.
// Fila får en ny id (bk-<nå>-…) og en rad i backup_jobs med kind 'upload' (roteres ikke med «Behold»; de 5 siste beholdes).
import { Hono } from 'hono';
import { spawn, spawnSync } from 'node:child_process';
import { createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, renameSync, rmSync, statSync, lstatSync, statfsSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { sessionUser, isAdmin, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { seal, unseal } from './finans/db.js';
import { tarHeader, untar, encryptStream, decryptFile, ENC_MAGIC, ENC_HEAD, encKeyOf, smbRun, cdDirOf, parseSmbLs, localArg, normShare, splitShare, SMB_SEG, smbPutError, smbErrorText } from './finans/backup.js';
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
// Prompt 36: kvittering per kjøring {target, fullPath, url, method, bytes, sha256, verified, retention:[…], ms, error, name, folder}.
if (!db.prepare('PRAGMA table_info(backup_jobs)').all().some((c) => c.name === 'report')) db.exec('ALTER TABLE backup_jobs ADD COLUMN report TEXT');

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
  // Prompt 36: kvitteringen (bare etter verifisering er ok:true).
  if (r.report) {
    const rep = JSON.parse(r.report);
    Object.assign(o, { name: rep.name ?? null, target: rep.target ?? null, fullPath: rep.fullPath ?? null, url: rep.url ?? null, method: rep.method ?? null, bytes: rep.bytes ?? r.size ?? null,
      sha256: rep.sha256 ?? r.sha256 ?? null, verified: !!rep.verified, retention: rep.retention ?? [], ms: rep.ms ?? null, folder: rep.folder ?? null, receipt: rep.receipt ?? null, log: rep.log ?? [] });
    if (rep.error && !o.error) o.error = rep.error;
    // Prompt 90: opplastet fil (filnavnet fra PC-en, når backupen ble laget og av hvilken versjon).
    if (r.kind === 'upload') Object.assign(o, { uploaded: true, created: rep.created ?? null, version: rep.version ?? null });
  }
  if (r.kind === 'upload') { o.uploaded = true; o.needKey = !!r.encrypted && !(r.key_id && keyById(r.key_id)); }
  return o;
}
const SCOPE_SLUG = { all: 'hele', finans: 'finans', custom: 'egendefinert' };
/** Synlig filnavn (prompt 36): homelab-2026-10-19_2130-hele.tar.zst (+ .enc). Oslo-tid. */
export function visibleName(t, scope, ext) {
  const o = osloParts(t);
  return `homelab-${o.date}_${String(o.hh).padStart(2, '0')}${String(o.mm).padStart(2, '0')}-${SCOPE_SLUG[scope] ?? 'hele'}.${ext}`;
}
const manifestNameOf = (name) => name.replace(/\.tar\.(gz|zst)(\.enc)?$/, '.json');
const gb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);
/** Lokal mappe: hvis BACKUP_DIR skal være et monteringspunkt (BACKUP_REQUIRE_MOUNT=1), må den være montert. Ingen stille fallback. */
export function checkBackupMount(dir = BACKUP_DIR) {
  if (process.env.BACKUP_REQUIRE_MOUNT !== '1') return null;
  try { if (statSync(dir).dev === statSync(resolve(dir, '..')).dev) return `${dir} er ikke montert (mountpoint mangler). Backupen ble ikke skrevet, så den ikke havner i en tom lokal mappe.`; }
  catch (e) { return `${dir} finnes ikke: ${e.message}`; }
  return null;
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
      { const mErr = checkBackupMount(); if (mErr) throw new Error(mErr); }
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
      let bytes = 0;
      const count = new Transform({ transform(ch, _e, cb) { bytes += ch.length; cb(null, ch); } });
      if (key) await pipeline(src, compressor(), encryptStream(key, tap), tap, count, ws);
      else await pipeline(src, compressor(), tap, count, ws);
      renameSync(part, out);
      // Prompt 36: verifiser lokalt (stat + størrelse + mappeliste) før noe kalles ferdig.
      const size = statSync(out).size;
      if (size !== bytes) throw new Error(`Backupfila har feil størrelse (${size} av ${bytes} byte)`);
      if (!readdirSync(BACKUP_DIR).includes(file)) throw new Error(`Fant ikke ${file} i ${BACKUP_DIR} etter skriving`);
      const sha256 = fileHash.digest('hex');
      const name = visibleName(t0, scope, FORMAT + (key ? '.enc' : ''));
      const man = { ...manifest(), file: name, localFile: file, bytes: size, sha256 };
      writeFileSync(join(BACKUP_DIR, `${id}.json`), JSON.stringify(man, null, 1), { mode: 0o600 });
      setJob(id, { state: 'verifying', pct: 96, size, file, encrypted: key ? 1 : 0, key_id: encKeyId, sha256, tables: JSON.stringify(info.tables) });
      broadcast('system-backup', { action: 'progress', id, pct: 96, step: 'verifying' });
      let rep = { target: 'local', fullPath: join(BACKUP_DIR, file), url: null, method: 'local', bytes: size, sha256, verified: true, retention: [], name, log: [] };
      if (st.smb.enabled && kind !== 'safety') {
        const sm = await smbUpload(id, { name, manifestPath: join(BACKUP_DIR, `${id}.json`) });
        if (!sm.ok) throw Object.assign(new Error(`Kopien til nettverksdisken feilet: ${sm.error}. Backupen ligger bare lokalt (${join(BACKUP_DIR, file)}).`), { report: { ...rep, ...sm, target: 'smb', verified: false } });
        rep = { ...rep, ...sm, target: 'smb', name: sm.file, retention: [...(sm.retention ?? [])] };
      }
      // Retention kjøres etter verifiseringen og aldri på fila som nettopp ble laget.
      if (kind !== 'safety') { rotate(st.keep, Date.now(), id); rep.retention.push(...lastRotated.map((n) => ({ where: 'local', name: n, action: 'slettet' }))); }
      else rotateSafety();
      rep.ms = Date.now() - t0;
      rep.receipt = `✓ ${gb(size)} · ${rep.url ?? rep.fullPath} · verifisert`;
      setJob(id, { state: 'done', pct: 100, finished: Date.now(), report: JSON.stringify(rep) });
      console.info(`[system-backup] ${id} mål=${rep.target} sti=${rep.fullPath} metode=${rep.method} bytes=${size} sha256=${sha256} verifisert=${rep.verified} retention=${JSON.stringify(rep.retention)} tid=${rep.ms} ms`);
      if (st.cloud.enabled && kind !== 'safety') await cloudUpload(id).catch(() => {});
      const job = jobOut(getJob(id));
      broadcast('system-backup', { action: 'done', id, job, title: 'Backup', body: `✓ Backup ferdig · ${gb(size)} · verifisert`, category: 'system' });
      return job;
    } catch (e) {
      rmSync(part, { force: true });
      const msg = String(e?.message ?? e).slice(0, 500);
      console.error(`[system-backup] ${id} feilet: ${msg}`);
      setJob(id, { state: 'failed', finished: Date.now(), error: msg, report: JSON.stringify({ target: st.smb.enabled && kind !== 'safety' ? 'smb' : 'local', verified: false, ms: Date.now() - t0, retention: [], ...(e.report ?? {}), error: msg }) });
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
  if (ID.test(r.id)) rmSync(join(BACKUP_DIR, `${r.id}.json`), { force: true });
  q('DELETE FROM backup_jobs WHERE id=?').run(r.id);
}
/** Sletter gamle backuper etter keep ('7' | '30' | '90d' | '1y'). Den nyeste vellykkede beholdes alltid. → antall slettet. */
let lastRotated = [];
// Prompt 36: except (id) slettes aldri, selv om sortering/tidssone skulle være feil. Gir lista over slettede filer.
export function rotate(keep = backupSettings().keep, now = Date.now(), except = null) {
  const ok = q("SELECT * FROM backup_jobs WHERE state='done' AND kind NOT IN ('safety','upload') ORDER BY started DESC").all();
  let gone = [];
  if (keep === '7' || keep === '30') gone = ok.slice(Number(keep));
  else { const days = keep === '1y' ? 365 : 90; gone = ok.slice(1).filter((r) => now - r.started > days * 86_400_000); }
  gone = gone.filter((r) => r.id !== except);
  for (const r of gone) { console.info(`[system-backup] retention: sletter ${r.file ?? r.id}`); removeJob(r); }
  // Feilede jobber: behold de 20 siste radene.
  for (const r of q("SELECT * FROM backup_jobs WHERE state='failed' ORDER BY started DESC").all().slice(20)) if (r.id !== except) removeJob(r);
  lastRotated = gone.map((r) => r.file ?? r.id);
  return gone.length;
}
function rotateSafety() { for (const r of q("SELECT * FROM backup_jobs WHERE state='done' AND kind='safety' ORDER BY started DESC").all().slice(5)) removeJob(r); }
// Prompt 90: opplastede filer telles ikke med i «Behold» (de skal ikke presse ut ekte backuper); de 5 siste beholdes.
function rotateUploads(except) { for (const r of q("SELECT * FROM backup_jobs WHERE kind='upload' ORDER BY started DESC").all().slice(5)) if (r.id !== except) removeJob(r); }

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
// Prompt 36: målet er {host, share, path}; vises som smb://host/share/path. share/label beholdes for eldre klienter.
export const smbTarget = () => {
  const m = backupSettings().smb, sp = splitShare(m.share || '');
  const host = sp.share.split('/')[2] || '', shareName = sp.share.split('/')[3] || '', path = [sp.sub, m.path].filter(Boolean).join('/');
  return { enabled: !!m.enabled, share: m.share || '', path: m.path || '', label: m.share ? `${m.share}${m.path ? '/' + m.path : ''}` : '',
    host, shareName, url: host && shareName ? `smb://${host}/${shareName}${path ? '/' + path : ''}` : '', folder: host && shareName ? { host, share: shareName, path } : null };
};
export function setSmbTarget(o) {
  const cur = backupSettings();
  const next = { ...cur.smb, ...(o.enabled !== undefined ? { enabled: !!o.enabled } : {}), ...(o.share !== undefined ? { share: o.share ? normShare(o.share) ?? '' : '' } : {}), ...(o.path !== undefined ? { path: smbPathOf(o.path) } : {}) };
  if (next.enabled && !next.share) throw new Error('Mangler share');
  kv.set(OWNER, 'sys_backup', { ...rawSettings(), smb: next });
  return smbTarget();
}
const smbConn = () => { const f = fhSettings(OWNER); return { user: f.smbUser, password: fhSecret('smbPass', OWNER), domain: f.smbDomain, proto: f.smbVersion }; };
const smbWhere = (m) => { const { share, sub } = splitShare(m.share); return { share, dir: [sub, m.path].filter(Boolean).join('/') }; };
// Backupfiler på nettverksdisken: de gamle bk-<id>.tar.* og de synlige homelab-YYYY-MM-DD_HHMM-<omfang>.tar.* (prompt 36).
const NEW_FILE = /^homelab-(\d{4})-(\d\d)-(\d\d)_(\d\d)(\d\d)-[a-z]+(?:-\d+)?\.tar\.(gz|zst)(\.enc)?$/;
const remoteKey = (n) => { let m = n.match(/^bk-(\d{8})-(\d{6})/); if (m && FILE.test(n)) return m[1] + m[2]; m = n.match(NEW_FILE); return m ? `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}00` : null; };
const remoteTime = (k) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10), +k.slice(10, 12), +k.slice(12, 14));
/** Navnene som skal slettes på nettverksdisken etter keep (nyeste først; den nyeste og except beholdes alltid). */
export function smbRotateList(names, keep, now = Date.now(), except = null) {
  const list = names.filter((n) => remoteKey(n)).sort((a, b) => remoteKey(b).localeCompare(remoteKey(a)) || b.localeCompare(a));
  let out;
  if (keep === '7' || keep === '30') out = list.slice(Number(keep));
  else { const days = keep === '1y' ? 365 : 90; out = list.slice(1).filter((n) => now - remoteTime(remoteKey(n)) > days * 86_400_000); }
  return out.filter((n) => n !== except);
}
const smbFail = (out) => { const stc = smbPutError(out); return stc ? `${smbErrorText(stc).message} (${stc.replace(/^NT_/, '')})` : null; };
const READBACK_MAX = Number(process.env.BACKUP_VERIFY_READBACK_MAX ?? 512 * 1024 * 1024);
/**
 * Kopierer backupen id til nettverksdisken, verifiserer og roterer der (prompt 36).
 * 1) lager mappene (mkdir/cd), 2) laster opp med --directory=<mappe> (finnes den ikke, feiler smbclient – aldri stille til roten
 * av sharen), til «.part» og rename, 3) manifest <navn>.json ved siden av, 4) ls: fila må finnes med riktig størrelse, og
 * SHA-256 sjekkes ved å lese fila tilbake (opp til BACKUP_VERIFY_READBACK_MAX), 5) retention (aldri den nye fila).
 * → {ok, file, fullPath, url, folder, method, bytes, sha256, verified, retention, removed, path, log, error?}. Lagres i jobben (smb).
 */
export async function smbUpload(id, { name = null, manifestPath = null } = {}) {
  const r = getJob(id);
  const st = backupSettings(), t0 = Date.now(), tgt = smbTarget(), log = [];
  const mark = (o) => { setJob(id, { smb: JSON.stringify({ at: new Date().toISOString(), path: tgt.label, ...o }) }); return o; };
  if (!r || !r.file || !FILE.test(r.file)) throw new Error('Fant ikke backupen');
  if (!st.smb.share) return mark({ ok: false, error: 'Nettverksdisken er ikke satt opp' });
  const { share, dir } = smbWhere(st.smb);
  const c = smbConn();
  const local = join(BACKUP_DIR, r.file), bytes = statSync(local).size;
  let file = name ?? r.file, partLeft = null;
  const base = { method: 'smbclient', folder: tgt.folder, url: null, fullPath: null, bytes, sha256: r.sha256 ?? null, verified: false, retention: [], log };
  try {
    // 1) Mappene finnes (mkdir på en mappe som finnes gir OBJECT_NAME_COLLISION og ignoreres).
    if (dir) { const o = await smbRun({ share, ...c, cmd: `${cdDirOf(dir)}pwd`, timeout: 60_000 }); const f = smbFail(o); if (f) throw new Error(f); }
    const ls0 = parseSmbLs(await smbRun({ share, ...c, dir: dir || undefined, cmd: 'ls', timeout: 60_000 }));
    const names0 = new Set(ls0.map((x) => x.name));
    if (name) for (let i = 2; names0.has(file) || names0.has(manifestNameOf(file)); i++) file = name.replace(/(\.tar\.)/, `-${i}$1`);
    // Halve filer fra avbrutte kjøringer ryddes.
    const stale = ls0.filter((x) => x.type === 'file' && /\.part$/.test(x.name) && (remoteKey(x.name.replace(/\.part$/, '')) || /^homelab-.*\.json\.part$/.test(x.name))).map((x) => x.name);
    if (stale.length) { await smbRun({ share, ...c, dir: dir || undefined, cmd: stale.map((n) => `del "${n}"`).join('; '), timeout: 60_000 }).catch(() => {}); log.push(`ryddet ${stale.join(', ')}`); }
    const where = `${share}${dir ? '/' + dir : ''}`;
    base.fullPath = `${where}/${file}`;
    base.url = `${tgt.url ? tgt.url.replace(/\/+$/, '') : 'smb:' + where}/${file}`;
    // 2) Opplasting til .part + rename. NT_STATUS-feil i -c gir den ekte feilkoden.
    partLeft = `${file}.part`;
    const putOut = await smbRun({ share, ...c, dir: dir || undefined, cmd: `put "${localArg(local)}" "${file}.part"; rename "${file}.part" "${file}"`, timeout: 6 * 3_600_000 });
    { const f = smbFail(putOut); if (f) throw new Error(f); }
    partLeft = null;
    log.push(`lastet opp ${bytes} byte til ${base.fullPath}`);
    // 3) Manifest ved siden av.
    const mname = manifestNameOf(file);
    if (manifestPath && existsSync(manifestPath)) {
      const mOut = await smbRun({ share, ...c, dir: dir || undefined, cmd: `put "${localArg(manifestPath)}" "${mname}.part"; rename "${mname}.part" "${mname}"`, timeout: 120_000 });
      const f = smbFail(mOut); if (f) throw new Error(`Manifestet: ${f}`);
    }
    // 4) Verifiser: list mappen, sjekk størrelse, og les tilbake for SHA-256.
    const ls = parseSmbLs(await smbRun({ share, ...c, dir: dir || undefined, cmd: 'ls', timeout: 60_000 }));
    const got = ls.find((x) => x.name === file && x.type === 'file');
    if (!got) throw new Error(`Fila kom ikke fram på nettverksdisken (${base.fullPath} finnes ikke etter opplasting)`);
    if (got.size !== bytes) throw new Error(`Fila på nettverksdisken har feil størrelse: ${got.size} av ${bytes} byte`);
    if (manifestPath && !ls.some((x) => x.name === mname)) throw new Error(`Manifestet ${mname} kom ikke fram`);
    let hashOk = null;
    if (bytes <= READBACK_MAX && r.sha256) {
      const back = join(BACKUP_DIR, `.verify-${id}`);
      try {
        await smbRun({ share, ...c, dir: dir || undefined, cmd: `get "${file}" "${localArg(back)}"`, timeout: 6 * 3_600_000 });
        const h = createHash('sha256');
        for await (const ch of createReadStream(back)) h.update(ch);
        hashOk = h.digest('hex') === r.sha256;
      } finally { rmSync(back, { force: true }); }
      if (!hashOk) throw new Error('SHA-256 for fila på nettverksdisken stemmer ikke med backupen');
    }
    log.push(`verifisert: stat + størrelse${hashOk ? ' + sha256' : ''} + mappeliste`);
    // 5) Retention etter verifisering, aldri den nye fila. Manifestet til en slettet fil slettes også.
    let removed = 0;
    const retention = [];
    try {
      const names = ls.filter((x) => x.type === 'file').map((x) => x.name);
      const old = smbRotateList(names, st.keep, Date.now(), file);
      const del = old.flatMap((n) => [n, ...(names.includes(manifestNameOf(n)) && manifestNameOf(n) !== n ? [manifestNameOf(n)] : [])]);
      if (del.length) {
        await smbRun({ share, ...c, dir: dir || undefined, cmd: del.map((n) => `del "${n}"`).join('; '), timeout: 120_000 });
        removed = old.length;
        for (const n of del) retention.push({ where: 'smb', name: n, action: 'slettet' });
        console.info(`[system-backup] retention på nettverksdisk (${where}): sletter ${del.join(', ')}`);
      }
    } catch (e) { console.warn('[system-backup] rotasjon på nettverksdisk:', e.message); retention.push({ where: 'smb', action: 'feilet', error: e.message }); }
    return mark({ ...base, ok: true, file, verified: true, sha256: r.sha256 ?? null, removed, retention, ms: Date.now() - t0 });
  } catch (e) {
    if (partLeft) await smbRun({ share, ...c, dir: dir || undefined, cmd: `del "${partLeft}"`, timeout: 60_000 }).catch(() => {});
    console.error(`[system-backup] ${id} kopi til nettverksdisk feilet: ${e.message}`);
    return mark({ ...base, ok: false, file, error: String(e.message).slice(0, 300), ms: Date.now() - t0 });
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
    // Prompt 90: en opplastet fil som ikke kunne sjekkes ved opplasting (ukjent nøkkel), sjekkes strengt nå, før noe pakkes ut.
    if (r.kind === 'upload' && !uploadVerified(r)) checkManifest(await scanArchive(createReadStream(plain), /\.tar\.zst/.test(r.file) ? 'zst' : 'gz'));
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

/** SQL-verdi for en NOT NULL-kolonne uten standardverdi som mangler i en eldre backup. */
const fillOf = (type) => (/INT|REAL|NUM|FLOA|DOUB|BOOL/i.test(type ?? '') ? '0' : "''");
/**
 * Erstatter de valgte modulene fra en utpakket backup.
 * Prompt 90: backupen kan være laget av en annen versjon. Tabeller som bare finnes i backupen (nyere versjon) eller bare her
 * (eldre backup) hoppes over med en melding; kolonnene tas fra snittet, og NOT NULL-kolonner uten standardverdi som mangler i
 * backupen fylles med 0 / ''. Kolonner som bare finnes i backupen tas ikke med.
 */
function applyRestore(dest, manifest, mods) {
  const file = join(dest, 'db', 'homelab.db');
  const now = tableMap();
  const mainTables = new Set(plainTables());
  db.prepare('ATTACH DATABASE ? AS bk').run(file);
  const restored = {}, skipped = [], notes = [];
  try {
    const bkTables = new Set(plainTables(db, 'bk'));
    const bkMap = tableMap([...bkTables]);
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const m of mods) {
          const cand = [...new Set([...(now[m] ?? []), ...(manifest.tables?.[m] ?? []), ...(bkMap[m] ?? [])])].filter((t) => t !== 'kv');
          const inBk = new Set([...(manifest.tables?.[m] ?? []), ...(bkMap[m] ?? [])]);
          const tables = [];
          for (const t of cand) {
            if (!mainTables.has(t)) { if (bkTables.has(t)) skipped.push({ module: m, table: t, reason: 'finnes ikke i denne versjonen' }); continue; }
            if (!bkTables.has(t)) { if (!inBk.has(t)) skipped.push({ module: m, table: t, reason: 'ikke i backupen (nyere tabell), beholdt som nå' }); continue; }
            const mc = db.prepare(`PRAGMA main.table_info(${qi(t)})`).all();
            const bc = new Set(db.prepare(`PRAGMA bk.table_info(${qi(t)})`).all().map((c) => c.name));
            const common = mc.filter((c) => bc.has(c.name));
            if (!common.length) { skipped.push({ module: m, table: t, reason: 'ingen felles kolonner' }); continue; }
            const fill = mc.filter((c) => !bc.has(c.name) && c.notnull && c.dflt_value == null && !c.pk);
            const missing = mc.filter((c) => !bc.has(c.name)).map((c) => c.name);
            const extra = [...bc].filter((n) => !mc.some((c) => c.name === n));
            if (missing.length || extra.length) notes.push({ module: m, table: t, missing, extra });
            const cols = [...common, ...fill].map((c) => qi(c.name)).join(', ');
            const sel = [...common.map((c) => qi(c.name)), ...fill.map((c) => fillOf(c.type))].join(', ');
            try {
              db.exec(`DELETE FROM main.${qi(t)}`);
              db.exec(`INSERT INTO main.${qi(t)} (${cols}) SELECT ${sel} FROM bk.${qi(t)}`);
            } catch (e) { throw Object.assign(new Error(`Kunne ikke gjenopprette tabellen ${t}: ${e.message}. Ingenting er endret.`), { status: 500 }); }
            tables.push(t);
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
  const messages = [
    ...skipped.map((x) => `Hoppet over ${x.table}: ${x.reason}.`),
    ...notes.map((x) => `${x.table}: ${[x.missing.length ? `${x.missing.length} kolonne${x.missing.length > 1 ? 'r' : ''} mangler i backupen (${x.missing.join(', ')})` : '', x.extra.length ? `${x.extra.length} kolonne${x.extra.length > 1 ? 'r' : ''} fra backupen finnes ikke her (${x.extra.join(', ')})` : ''].filter(Boolean).join('; ')}.`),
  ];
  return { tables: restored, dirs: dirsDone, skipped, notes, messages };
}

/** Gjenoppretter modulene fra backupen id. Tar en full sikkerhetskopi først. → {ok, safetyId, modules, tables, dirs, skipped, messages} */
export async function restoreBackup({ id, modules, by = null, key = null }) {
  const r = getJob(id);
  if (!r || r.state !== 'done') throw Object.assign(new Error('Fant ikke backupen'), { status: 404 });
  const inBackup = JSON.parse(r.modules);
  // Prompt 90: en kryptert fil som ble lastet opp uten kjent nøkkel har ukjent innhold til den er dekryptert.
  const unknown = r.kind === 'upload' && !inBackup.length;
  let mods = Array.isArray(modules) && modules.length ? modules : inBackup;
  if (!mods.every((m) => MODULE_IDS.includes(m))) throw Object.assign(new Error('Ukjent modul'), { status: 400 });
  const notIn = (list) => { const missing = mods.filter((m) => !list.includes(m)); if (missing.length) throw Object.assign(new Error(`Backupen inneholder ikke ${missing.join(', ')}`), { status: 400 }); };
  if (!unknown) notIn(inBackup);
  if (running) throw Object.assign(new Error('En backup eller gjenoppretting pågår allerede'), { status: 409 });
  // Pakk ut og sjekk før noe endres (feil nøkkel stopper her).
  const { dest, manifest } = await extract(r, key);
  try {
    if (unknown) {
      const info = checkManifest({ manifest, files: null });
      setJob(id, { modules: JSON.stringify(info.modules), scope: info.scope, tables: JSON.stringify(info.tables ?? null),
        report: JSON.stringify({ ...(r.report ? JSON.parse(r.report) : {}), created: info.created, version: info.version }) });
      if (!mods.length) mods = info.modules;
      notIn(info.modules);
    }
    const safety = startBackup({ scope: 'all', kind: 'safety', by });
    const sj = await safety.done;
    if (!sj?.ok) throw Object.assign(new Error(`Sikkerhetskopien feilet, ingenting er gjenopprettet: ${sj?.error ?? ''}`), { status: 500 });
    running = { id: `restore-${id}`, promise: null };
    try {
      const res = applyRestore(dest, manifest, mods);
      console.warn(`[system-backup] gjenopprettet ${mods.join(', ')} fra ${id} (av ${by}), sikkerhetskopi ${safety.id}${res.skipped.length ? `, hoppet over ${res.skipped.map((x) => x.table).join(', ')}` : ''}`);
      broadcast('system-backup', { action: 'restored', id, modules: mods, safetyId: safety.id });
      return { ok: true, safetyId: safety.id, modules: mods, ...res };
    } finally { running = null; }
  } finally { rmSync(dest, { recursive: true, force: true }); }
}

/* ---------------- Opplasting av en backupfil (prompt 90) ---------------- */

const badUpload = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
/** Bytes fra BACKUP_UPLOAD_MAX: tall (byte) eller med K/M/G/T (desimal). Standard 20 GB. Leses ved hver forespørsel. */
export function uploadMax() {
  const m = String(process.env.BACKUP_UPLOAD_MAX ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i);
  if (!m) return 20e9;
  return Math.floor(Number(m[1]) * { '': 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12 }[m[2].toLowerCase()]);
}
const UPLOAD_EXT = /\.tar\.(gz|zst)(\.enc)?$/i;
const uploadVerified = (r) => { try { return !!JSON.parse(r.report ?? '{}').verified; } catch { return false; } };
let zstdHave = null;
const zstdThere = () => (zstdHave ??= (() => { try { return spawnSync('zstd', ['--version'], { timeout: 3000 }).status === 0; } catch { return false; } })());
const magicOk = (b, ext) => (ext === 'zst' ? b.length >= 4 && b.readUInt32LE(0) === 0xfd2fb528 : b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b);

/**
 * Leser et tar-arkiv som strøm uten å skrive noe til disk. Avviser alt som ikke er en vanlig fil eller mappe (lenker, enheter,
 * GNU/pax-utvidelser), stier med «..», absolutte stier og navn utenfor db/, files/ og manifest.json. → Writable med .result()
 */
function tarScanner() {
  let buf = Buffer.alloc(0), cur = null, left = 0, pad = 0, entries = 0;
  const files = {}, seen = new Set();
  let manifest = null, dbHead = null;
  const done = (e) => {
    files[e.name] = e.h.digest('hex');
    if (e.name === 'manifest.json') manifest = Buffer.concat(e.parts).toString('utf8');
    if (e.name === 'db/homelab.db') dbHead = e.first;
  };
  const w = new Writable({
    write(chunk, _e, cb) {
      try {
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
        for (;;) {
          if (cur) {
            if (!buf.length) break;
            const n = Math.min(left, buf.length), part = buf.subarray(0, n);
            cur.h.update(part);
            if (cur.keep) cur.parts.push(Buffer.from(part));
            if (cur.first.length < 16) cur.first = Buffer.concat([cur.first, part.subarray(0, 16 - cur.first.length)]);
            buf = buf.subarray(n); left -= n;
            if (left > 0) break;
            done(cur); cur = null;
          }
          if (pad > 0) { const n = Math.min(pad, buf.length); buf = buf.subarray(n); pad -= n; if (pad > 0) break; }
          if (buf.length < 512) break;
          const h = buf.subarray(0, 512); buf = buf.subarray(512);
          if (h.every((b) => b === 0)) continue;
          const cstr = (a, b) => h.toString('utf8', a, b).replace(/\0.*$/s, '');
          let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
          if (parseInt(cstr(148, 156).trim(), 8) !== sum) throw badUpload('Fila er ikke en gyldig backup (ikke et tar-arkiv, eller skadet)');
          const ustar = h.toString('latin1', 257, 262) === 'ustar';
          let name = [ustar ? cstr(345, 500) : '', cstr(0, 100)].filter(Boolean).join('/');
          const type = String.fromCharCode(h[156] || 0x30);
          if (type === '1' || type === '2') throw badUpload(`Backupen inneholder en lenke (${name.slice(0, 120)}). Lenker er ikke tillatt.`);
          if (type !== '0' && type !== '5' && type !== '7') throw badUpload(`Ukjent oppføring i arkivet (type ${JSON.stringify(type)}). Bruk en backupfil lastet ned fra Homelab.`);
          if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\\') || name.split('/').includes('..')) throw badUpload(`Ugyldig sti i backupen: ${name.slice(0, 120)}`);
          name = name.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
          const size = h[124] & 0x80 ? Number(h.subarray(125, 136).readBigUInt64BE(3) ?? 0) : parseInt(cstr(124, 136).trim() || '0', 8) || 0;
          if (++entries > 2_000_000) throw badUpload('For mange filer i backupen');
          if (type === '5') {
            if (!/^(db|files(\/.+)?)$/.test(name)) throw badUpload(`Uventet mappe i backupen: ${name.slice(0, 120)}`);
            pad = size + ((512 - (size % 512)) % 512);
            continue;
          }
          if (!/^(manifest\.json|db\/homelab\.db|files\/.+)$/.test(name) || name.split('/').some((x) => x === '.' || x === '')) throw badUpload(`Uventet fil i backupen: ${name.slice(0, 120)}`);
          if (seen.has(name)) throw badUpload(`${name.slice(0, 120)} står to ganger i backupen`);
          seen.add(name);
          if (name === 'manifest.json' && size > 16 * 1024 * 1024) throw badUpload('manifest.json er for stor');
          cur = { name, h: createHash('sha256'), keep: name === 'manifest.json', parts: [], first: Buffer.alloc(0) };
          left = size; pad = (512 - (size % 512)) % 512;
          if (!size) { done(cur); cur = null; }
        }
        cb();
      } catch (e) { cb(e); }
    },
    final(cb) { cb(cur ? badUpload('Backupfila er avkortet (slutter midt i en fil)') : null); },
  });
  w.result = () => ({ files, manifest, dbHead });
  return w;
}

/** Pakker ut (bare i strøm) og sjekker arkivet. → {files, manifest, dbHead} */
async function scanArchive(readable, ext, decipher = null) {
  if (ext === 'zst' && !zstdThere()) throw badUpload('Serveren mangler zstd og kan ikke lese .tar.zst. Installer zstd, eller bruk en .tar.gz-backup.', 422);
  const sc = tarScanner();
  const stages = [readable, ...(decipher ? [decipher] : []), ext === 'zst' ? zstdStream(['-q', '-d', '-c']) : createGunzip(), sc];
  try { await pipeline(...stages); }
  catch (e) {
    if (e?.status) throw e;
    if (decipher && /auth|unable to authenticate/i.test(String(e?.message))) throw badUpload('Feil gjenopprettingsnøkkel, eller fila er skadet', 400, { needKey: true });
    throw badUpload(`Fila kunne ikke pakkes ut som ${ext === 'zst' ? '.tar.zst' : '.tar.gz'}. Er den skadet, eller ikke en backup fra Homelab?`);
  }
  return sc.result();
}

/**
 * Sjekker manifest.json (og, når files er gitt, sha256 for hver fil mot manifestet).
 * → {created, version, scope, modules, tables, ignored}
 */
function checkManifest({ manifest, files, dbHead }) {
  let m = manifest;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { throw badUpload('manifest.json i backupen er ikke gyldig JSON'); } }
  if (m == null) throw badUpload('Fant ikke manifest.json. Dette er ikke en systembackup fra Homelab.');
  if (!m || typeof m !== 'object' || m.format !== 'homelab-system-backup') throw badUpload('Ukjent backupformat. Bruk en fil fra Innstillinger → Backup → Last ned.');
  if (m.formatVersion != null && !(Number(m.formatVersion) >= 1 && Number(m.formatVersion) <= 1)) throw badUpload(`Backupformat ${m.formatVersion} er laget av en nyere versjon. Oppdater serveren først.`);
  const listed = Array.isArray(m.modules) ? m.modules.map(String) : [];
  const modules = MODULE_IDS.filter((x) => listed.includes(x));
  const ignored = listed.filter((x) => !MODULE_IDS.includes(x));
  if (!modules.length) throw badUpload('Backupen inneholder ingen moduler denne versjonen kjenner');
  if (files) {
    const mf = m.files && typeof m.files === 'object' ? m.files : {};
    if (!files['db/homelab.db'] || !mf['db/homelab.db']) throw badUpload('Backupen mangler databasen (db/homelab.db)');
    if (dbHead && dbHead.toString('latin1') !== 'SQLite format 3\0') throw badUpload('db/homelab.db i backupen er ikke en SQLite-database');
    for (const [name, hash] of Object.entries(mf)) {
      if (!(name in files)) throw badUpload(`Mangler ${String(name).slice(0, 120)} i backupen`);
      if (files[name] !== hash) throw badUpload(`Sjekksummen stemmer ikke for ${String(name).slice(0, 120)}. Fila er skadet.`);
    }
    for (const name of Object.keys(files)) if (name !== 'manifest.json' && !(name in mf)) throw badUpload(`${name.slice(0, 120)} står ikke i manifestet`);
  }
  const created = typeof m.created === 'string' && !Number.isNaN(Date.parse(m.created)) ? new Date(m.created).toISOString() : null;
  return { created, version: typeof m.version === 'string' ? m.version.slice(0, 40) : null, scope: SCOPES.includes(m.scope) ? m.scope : 'custom',
    modules, tables: m.tables && typeof m.tables === 'object' ? m.tables : null, ignored };
}

/** Hode og haletag i en kryptert fil. Kaster når fila ikke er i krypteringsformatet. */
function encParts(path) {
  const size = statSync(path).size;
  if (size < ENC_HEAD + 16 + 16) throw badUpload('Fila er for liten til å være en kryptert backup');
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(ENC_HEAD + 16), tag = Buffer.alloc(16);
    readSync(fd, head, 0, head.length, 0); readSync(fd, tag, 0, 16, size - 16);
    if (!head.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) throw badUpload('Fila heter .enc, men er ikke kryptert i backupformatet til Homelab');
    const o = ENC_MAGIC.length;
    return { size, salt: head.subarray(o, o + 16), iv: head.subarray(o + 16, o + 28), first: head.subarray(ENC_HEAD), tag };
  } finally { closeSync(fd); }
}
/** Nøkkelen (av dem serveren kjenner) som passer: de første bytene må dekrypteres til gzip/zstd-hodet. → {key, keyId} | null */
function knownKeyFor(p, ext) {
  const ids = [...new Set([currentKeyId(), ...Object.keys(keys())].filter(Boolean))];
  for (const keyId of ids) {
    const key = keyById(keyId);
    if (!key) continue;
    const d = createDecipheriv('aes-256-gcm', encKeyOf(key, p.salt), p.iv);
    if (magicOk(d.update(p.first), ext)) return { key, keyId };
  }
  return null;
}
const decipherOf = (path, p, key) => {
  const d = createDecipheriv('aes-256-gcm', encKeyOf(key, p.salt), p.iv); d.setAuthTag(p.tag);
  return { src: createReadStream(path, { start: ENC_HEAD, end: p.size - 17 }), d };
};

/** Sjekker en ferdig mottatt fil og legger den inn i backup_jobs. */
async function finishUpload(u, by) {
  const ext = u.ext, path = u.part;
  let info = null, keyId = null;
  if (u.enc) {
    const p = encParts(path);
    const k = knownKeyFor(p, ext);
    if (k) {
      keyId = k.keyId;
      const { src, d } = decipherOf(path, p, k.key);
      try { info = checkManifest(await scanArchive(src, ext, d)); }
      catch (e) { throw e?.needKey ? badUpload('Fila er skadet: krypteringen stemmer ikke (autentiseringen feilet)') : e; }
    }
  } else {
    const fd = openSync(path, 'r'); const b = Buffer.alloc(4);
    try { readSync(fd, b, 0, 4, 0); } finally { closeSync(fd); }
    if (!magicOk(b, ext)) throw badUpload(`Fila er ikke ${ext === 'zst' ? 'zstd' : 'gzip'}-komprimert. Er den kryptert (.enc) eller ikke en backup?`);
    info = checkManifest(await scanArchive(createReadStream(path), ext));
  }
  const t = Date.now(), id = newId(t), file = `${id}.tar.${ext}${u.enc ? '.enc' : ''}`;
  const out = join(BACKUP_DIR, file);
  renameSync(path, out);
  try { return insertUpload(u, { id, t, file, out, info, keyId, by }); } catch (e) { rmSync(out, { force: true }); throw e; }
}
function insertUpload(u, { id, t, file, out, info, keyId, by }) {
  const size = statSync(out).size, sha256 = u.hash.digest('hex'), needKey = u.enc && !info;
  const rep = { target: 'upload', method: 'upload', name: u.name, fullPath: out, bytes: size, sha256, verified: !!info, created: info?.created ?? null, version: info?.version ?? null,
    retention: [], ms: t - u.t0, receipt: `✓ Lastet opp ${gb(size)}${info ? ' · sjekket' : ' · kryptert, nøkkelen trengs'}`, ...(info?.ignored?.length ? { ignored: info.ignored } : {}) };
  q('INSERT INTO backup_jobs(id, kind, state, pct, started, finished, size, scope, modules, tables, file, encrypted, key_id, sha256, by_user, report) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, 'upload', 'done', 100, t, t, size, info?.scope ?? 'all', JSON.stringify(info?.modules ?? []), info ? JSON.stringify(info.tables) : null, file, u.enc ? 1 : 0, keyId, sha256, by, JSON.stringify(rep));
  rotateUploads(id);
  console.info(`[system-backup] opplastet ${id} (${size} byte, sha256=${sha256}, kryptert=${u.enc}, nøkkel ${keyId ? 'kjent' : u.enc ? 'ukjent' : '–'}) av ${by}`);
  broadcast('system-backup', { action: 'uploaded', id });
  return { id, created: info?.created ?? null, version: info?.version ?? null, scope: info?.scope ?? null, modules: info?.modules ?? [], encrypted: !!u.enc, needKey, size,
    ...(info?.ignored?.length ? { ignored: info.ignored } : {}) };
}

const uploads = new Map(); // uploadId → {user, part, ext, enc, name, total, received, hash, t0, at, busy}
const UPLOAD_IDLE = 60 * 60_000;
const uploadStarts = new Map(); // bruker → [tidspunkt] (rate-begrensning)
function dropUpload(id) { const u = uploads.get(id); if (!u) return; uploads.delete(id); rmSync(u.part, { force: true }); }
function sweepUploads(now = Date.now()) { for (const [id, u] of uploads) if (!u.busy && now - u.at > UPLOAD_IDLE) dropUpload(id); }
/** Bare for tester. */
export const _uploads = { list: () => [...uploads.values()], reset: () => { for (const id of [...uploads.keys()]) dropUpload(id); uploadStarts.clear(); } };

/** Skriver kroppen til slutten av .part-fila (strøm, aldri hele i minnet). */
async function receiveChunk(c, u) {
  const body = c.req.raw.body;
  if (!body) throw badUpload('Tom forespørsel: fila mangler');
  let n = 0;
  const gate = new Transform({ transform(ch, _e, cb) {
    n += ch.length;
    if (u.received + n > u.total) return cb(badUpload(`Fila er større enn oppgitt (${u.total} byte)`, 413));
    u.hash.update(ch); cb(null, ch);
  } });
  try { await pipeline(Readable.fromWeb(body), gate, createWriteStream(u.part, { flags: 'a', mode: 0o600 })); }
  catch (e) { throw e?.status ? e : badUpload('Opplastingen ble avbrutt', 400); }
  u.received += n; u.at = Date.now();
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
  // Prompt 90: opplastingen sender fila rått (octet-stream); ruten krever i stedet en egen header (X-Backup-Filename), som et annet
  // nettsted ikke kan sette uten CORS-godkjenning.
  const upload = c.req.method === 'POST' && /\/upload$/.test(c.req.path) && /^application\/octet-stream\b/i.test(c.req.header('content-type') ?? '');
  if (write && session && !upload && !/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
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
  const last = q("SELECT * FROM backup_jobs WHERE state IN ('done','failed') AND kind NOT IN ('safety','upload') ORDER BY started DESC LIMIT 1").get();
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
api.post('/upload', async (c) => {
  if (!c.get('access').session) return c.json({ error: 'Opplasting må gjøres i nettleseren' }, 403);
  const site = c.req.header('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return c.json({ error: 'Opplasting fra et annet nettsted er ikke tillatt' }, 403);
  if (!/^application\/octet-stream\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Send fila som application/octet-stream' }, 415);
  const user = c.get('user');
  sweepUploads();
  let u;
  const uid = c.req.header('x-upload-id');
  try {
    if (uid) {
      u = /^[0-9a-f]{24}$/.test(uid) ? uploads.get(uid) : null;
      if (!u || u.user !== user) return c.json({ error: 'Fant ikke opplastingen. Start på nytt.' }, 404);
      if (u.busy) return c.json({ error: 'En bit av denne fila lastes opp allerede' }, 409);
      if (Number(c.req.header('x-upload-offset')) !== u.received) return c.json({ error: 'Feil posisjon i fila', received: u.received }, 409);
    } else {
      let name = '';
      try { name = decodeURIComponent(c.req.header('x-backup-filename') ?? ''); } catch { /* ugyldig */ }
      name = name.split(/[\\/]/).pop().replace(/[\0-\x1f]/g, '').slice(-200);
      const fm = name.match(UPLOAD_EXT);
      if (!fm) return c.json({ error: 'Velg en backupfil fra Homelab (.tar.gz eller .tar.zst, eventuelt .enc)' }, 400);
      const total = Number(c.req.header('x-upload-size') ?? c.req.header('content-length'));
      if (!Number.isSafeInteger(total) || total <= 0) return c.json({ error: 'Oppgi filstørrelsen (X-Upload-Size)' }, 411);
      const max = uploadMax();
      if (total > max) return c.json({ error: `Fila er for stor (${gb(total)}). Grensen er ${gb(max)} (BACKUP_UPLOAD_MAX).` }, 413);
      let free = Infinity;
      try { const f = statfsSync(BACKUP_DIR); free = f.bavail * f.bsize; } catch { /* ukjent */ }
      if (free < total + 64e6) return c.json({ error: `Ikke nok ledig plass i ${BACKUP_DIR}: ${gb(free)} ledig, fila er ${gb(total)}.` }, 507);
      const now = Date.now(), hits = (uploadStarts.get(user) ?? []).filter((x) => now - x < 15 * 60_000);
      if (hits.length >= (Number(process.env.BACKUP_UPLOAD_RATE) || 10)) return c.json({ error: 'For mange opplastinger. Vent litt og prøv igjen.' }, 429);
      if ([...uploads.values()].length >= 2) return c.json({ error: 'To opplastinger pågår allerede. Vent til de er ferdige.' }, 429);
      uploadStarts.set(user, [...hits, now]);
      const id = randomBytes(12).toString('hex');
      u = { id, user, part: join(BACKUP_DIR, `.upload-${id}.part`), ext: fm[1].toLowerCase(), enc: !!fm[2], name, total, received: 0, hash: createHash('sha256'), t0: now, at: now, busy: false };
      writeFileSync(u.part, '', { mode: 0o600 });
      uploads.set(id, u);
    }
    u.busy = true;
    await receiveChunk(c, u);
    if (u.received < u.total) { u.busy = false; return c.json({ uploadId: u.id, received: u.received, total: u.total }, 202); }
    const res = await finishUpload(u, user);
    uploads.delete(u.id);
    return c.json(res);
  } catch (e) {
    if (u) dropUpload(u.id);
    const st = e?.status ?? 500;
    if (st >= 500) console.error(`[system-backup] opplasting feilet: ${e?.message}`);
    return c.json({ error: String(e?.message ?? e).slice(0, 500), ...(e?.needKey ? { needKey: true } : {}) }, st);
  }
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
