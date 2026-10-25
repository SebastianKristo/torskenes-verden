// Prompt 51 (OPS51): backup og oppdateringer.
// - restic-backup med falsk restic (bare node): 3-2-1-mål, konsistente databasekopier (VACUUM INTO, øktene tømt), unntak for levende
//   databaser og backup-mapper, hemmeligheter bare i miljøet (aldri i argumenter, svar eller lagrede feil), grønt/gult/rødt kort.
// - Testet gjenoppretting: siste snapshot til temp-mappe, integrity_check, ekte server startet mot kopien på port 4602
//   (OPS51_SANDBOX=1) og røyktest (/healthz, /api/ops51/smoke, innlogging som avvises).
// - Database-vedlikehold: WAL, integritet, VACUUM, størrelse per tabell, migrasjonslogg.
// - Updateren (updater.sh med falske docker/curl/sqlite3): stage → røyktester → klar; promote bruker det testede imaget; feilet
//   røyktest rører ikke prosjektmappen; forrige image beholdes og «rollback-image» bytter (og angrer) med ett trykk.
//   Serveren skriver bare {id, requestedBy, at, action}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const ROOT = mkdtempSync(join(tmpdir(), 'hl-p51ops-'));
process.env.DATA_DIR = join(ROOT, 'data');
mkdirSync(process.env.DATA_DIR, { recursive: true });
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51o';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4602';
process.env.OPS51_SANDBOX_PORT = '4602';
delete process.env.MOCK_DATA;
delete process.env.BACKUP_DIR;
delete process.env.OPS51_SANDBOX;
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;

// Falsk restic: repoet er en mappe med config + snapshots/<id>/<absolutt sti>. Argumentene logges (uten miljø).
const BIN = join(ROOT, 'bin');
mkdirSync(BIN, { recursive: true });
const ARGLOG = join(ROOT, 'restic-args.log'), ENVLOG = join(ROOT, 'restic-env.log');
writeFileSync(join(BIN, 'restic'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), env = process.env, repoName = env.RESTIC_REPOSITORY || '';
// Skyadresser (b2:, rest: …) blir mapper under ROOT/remote; styring via filer (miljøet til restic er bevisst minimalt).
const repo = path.isAbsolute(repoName) ? repoName : path.join(${JSON.stringify(ROOT)}, 'remote', encodeURIComponent(repoName));
const ctl = (f) => { try { return fs.readFileSync(path.join(${JSON.stringify(ROOT)}, f), 'utf8'); } catch { return null; } };
fs.appendFileSync(${JSON.stringify(ARGLOG)}, JSON.stringify(a) + '\\n');
fs.appendFileSync(${JSON.stringify(ENVLOG)}, JSON.stringify({ cmd: a[0], repo: repoName, hasPw: !!env.RESTIC_PASSWORD, b2: env.B2_ACCOUNT_ID || null, b2key: env.B2_ACCOUNT_KEY ? 'set' : null }) + '\\n');
const out = (s) => process.stdout.write(s), die = (c, m) => { process.stderr.write(m + '\\n'); process.exit(c); };
if (a[0] === 'version') { out('restic 0.17.3 compiled with go1.23 on linux/amd64\\n'); process.exit(0); }
if (ctl('fake-fail') && repoName.includes(ctl('fake-fail'))) die(1, 'Fatal: unable to open repository at ' + repoName + ': connection refused (password ' + env.RESTIC_PASSWORD + ')');
const cfg = path.join(repo, 'config');
if (a[0] === 'init') { fs.mkdirSync(path.join(repo, 'snapshots'), { recursive: true }); fs.writeFileSync(cfg, env.RESTIC_PASSWORD); out('created restic repository\\n'); process.exit(0); }
if (!fs.existsSync(cfg)) die(10, 'Fatal: repository does not exist: unable to open config file');
if (fs.readFileSync(cfg, 'utf8') !== env.RESTIC_PASSWORD) die(12, 'Fatal: wrong password or no key found');
if (a[0] === 'cat') { out('{}'); process.exit(0); }
const snaps = path.join(repo, 'snapshots');
const list = () => fs.readdirSync(snaps).sort().map((id) => JSON.parse(fs.readFileSync(path.join(snaps, id, 'meta.json'), 'utf8')));
if (a[0] === 'backup') {
  const ex = []; let src = null;
  for (let i = 1; i < a.length; i++) { if (a[i] === '--exclude') ex.push(a[++i]); else if (a[i] === '--tag' || a[i] === '--host') i++; else if (!a[i].startsWith('--')) src = a[i]; }
  const rx = ex.map((p) => new RegExp('^' + p.replace(/[.+^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '[^/]*') + '(/|$)'));
  const id = (Date.now().toString(16) + Math.random().toString(16).slice(2)).padEnd(64, '0').slice(0, 64);
  const dest = path.join(snaps, id, 'tree');
  let files = 0, bytes = 0;
  const walk = (p) => { if (rx.some((r) => r.test(p))) return; const st = fs.statSync(p); if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
    const to = path.join(dest, p); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(p, to); files++; bytes += st.size; };
  walk(src);
  fs.writeFileSync(path.join(snaps, id, 'meta.json'), JSON.stringify({ id, short_id: id.slice(0, 8), time: new Date().toISOString(), paths: [src], tags: ['nordlys51'], hostname: 'nordlys' }));
  out(JSON.stringify({ message_type: 'status', percent_done: 0.5 }) + '\\n');
  out(JSON.stringify({ message_type: 'summary', snapshot_id: id, files_new: files, files_changed: 0, data_added: bytes, total_bytes_processed: bytes }) + '\\n');
  process.exit(0);
}
if (a[0] === 'snapshots') { out(JSON.stringify(list())); process.exit(0); }
if (a[0] === 'restore') {
  const id = a[1], t = a[a.indexOf('--target') + 1], inc = a.includes('--include') ? a[a.indexOf('--include') + 1] : null;
  const s = list().find((x) => x.id === id || x.short_id === id); if (!s) die(1, 'no matching ID found');
  const tree = path.join(snaps, s.id, 'tree');
  const copy = (p, rel) => { const st = fs.statSync(p); if (st.isDirectory()) { for (const f of fs.readdirSync(p)) copy(path.join(p, f), path.join(rel, f)); return; }
    if (inc && !('/' + rel).startsWith(inc)) return; const to = path.join(t, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(p, to); };
  copy(tree, '');
  if (ctl('fake-corrupt')) fs.writeFileSync(path.join(t, ctl('fake-corrupt'), '.ops51-stage', 'db', 'homelab.db'), 'ødelagt');
  process.exit(0);
}
if (a[0] === 'forget' || a[0] === 'check') process.exit(0);
die(1, 'ukjent kommando ' + a[0]);
`);
chmodSync(join(BIN, 'restic'), 0o755);
process.env.RESTIC_BIN = join(BIN, 'restic');

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
// Ingen nett ut – unntatt sandkassen på 127.0.0.1:4602 (testet gjenoppretting).
globalThis.fetch = async (u, init) => { if (/^http:\/\/127\.0\.0\.1:4602\//.test(String(u))) return realFetch(u, init); throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const m = await import('../server/dbmaint51.js');
const b51 = await import('../server/backup51.js');
const ops = await import('../server/ops51.js');
const DATA = resolve(process.env.DATA_DIR);

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function cookie(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (ck) => (path, method = 'GET', body) => req(path, { method, headers: { cookie: ck }, body });
const A = as(await cookie('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as(await cookie('ingrid', 'ingridPassord123'));
const until = async (fn, ms = 60_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return null; };

/* ---------------- Tilgang ---------------- */

test('tilgang: bare admin; uten innlogging 401; /smoke finnes ikke utenfor sandkassen', async () => {
  assert.equal((await req('/api/ops51/summary')).status, 401);
  assert.equal((await I('/api/ops51/summary')).status, 403);
  assert.equal((await I('/api/ops51/backup/settings')).status, 403);
  assert.equal((await I('/api/ops51/updates/stage', 'POST', {})).status, 403);
  assert.equal((await req('/api/ops51/smoke')).status, 404);
  const s = await A('/api/ops51/summary');
  assert.equal(s.status, 200);
  assert.equal(s.body.backup.status, 'red', 'ikke satt opp = rødt kort');
  assert.match(s.body.backup.issues.join(' '), /Automatisk backup er av/);
});

/* ---------------- Database-vedlikehold ---------------- */

test('database: WAL-sjekk, størrelse per tabell, ukentlig vedlikehold (integritet + VACUUM) og logg', async () => {
  const w = m.walStatus51('PASSIVE');
  assert.equal(w.mode, 'wal');
  assert.equal(w.ok, true);
  const t = m.tableSizes51();
  assert.equal(t.via, 'dbstat');
  assert.ok(t.tables.find((x) => x.name === 'users' && x.rows >= 2 && x.bytes > 0));
  const r = await A('/api/ops51/db/maintenance', 'POST', { kind: 'weekly' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.result.ok, true);
  assert.equal(r.body.result.integrity, 'ok');
  assert.equal(r.body.health.status, 'green');
  assert.equal((await A('/api/ops51/db/maintenance', 'POST', { kind: 'drop' })).status, 400);
  const d = await A('/api/ops51/db');
  assert.equal(d.status, 200);
  assert.ok(d.body.tables.count > 20);
  assert.equal(d.body.maintenance[0].kind, 'weekly');
  assert.ok(d.body.health.lastIntegrity.ok);
  // Skjemaskjekk uten JSON-kropp avvises (CSRF).
  const raw = await app.request('/api/ops51/db/maintenance', { method: 'POST', headers: { cookie: (await cookie('sebastian', 'testpassord1')) }, body: 'kind=vacuum' });
  assert.equal(raw.status, 415);
});

test('migrasjonslogg: utgangspunkt første gang, deretter nye tabeller/kolonner; samme skjema logges ikke på nytt', () => {
  const base = m.recordMigrations51({ version: '9.0.0', dbSchema: 44 });
  assert.equal(base.kind, 'baseline');
  assert.equal(m.recordMigrations51({ version: '9.0.0', dbSchema: 44 }), null);
  db.exec('CREATE TABLE p51_ny (id INTEGER PRIMARY KEY, navn TEXT)');
  db.exec("ALTER TABLE users ADD COLUMN p51_test TEXT DEFAULT ''");
  db.exec('CREATE INDEX p51_ny_navn ON p51_ny(navn)');
  const r = m.recordMigrations51({ version: '9.1.0', dbSchema: 44 });
  assert.equal(r.kind, 'migration');
  assert.deepEqual(r.addedTables, ['p51_ny']);
  assert.deepEqual(r.addedColumns, ['users.p51_test']);
  assert.deepEqual(r.addedIndexes, ['p51_ny_navn']);
  assert.deepEqual(r.removed, []);
  const v = m.recordMigrations51({ version: '9.1.1', dbSchema: 44 });
  assert.equal(v.kind, 'version');
  db.exec('DROP TABLE p51_ny');
  const x = m.recordMigrations51({ version: '9.1.1', dbSchema: 44 });
  assert.deepEqual(x.removed, ['tabell p51_ny']);
  assert.equal(m.migrationLog51(10)[0].id, x.id);
});

/* ---------------- Backupinnstillinger ---------------- */

test('innstillinger: adresser valideres, nøkler lagres forseglet og sendes aldri ut', async () => {
  let r = await A('/api/ops51/backup/settings', 'PUT', { targets: { nas: { enabled: true, repo: join(DATA, 'nas') } } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /NAS-repoet kan ikke ligge i data-mappen/);
  for (const bad of ['-r /etc', 'rest:ftp://x', 'http://nas/x', 'rest:https://bruker:hemmelig@nas:8000/x', 'b2:bøtte\nrm']) {
    r = await A('/api/ops51/backup/settings', 'PUT', { targets: { nas: { repo: bad } } });
    assert.equal(r.status, 400, bad);
  }
  r = await A('/api/ops51/backup/settings', 'PUT', { targets: { offsite: { enabled: true, repo: '/mnt/x' } } });
  assert.match(r.body.error, /skytjeneste/);
  r = await A('/api/ops51/backup/settings', 'PUT', { time: '25:00' });
  assert.equal(r.body.field, 'time');
  const nas = join(ROOT, 'nas'), off = join(ROOT, 'offsite-sky');
  r = await A('/api/ops51/backup/settings', 'PUT', { enabled: true, time: '02:40', targets: { nas: { enabled: true, repo: nas }, offsite: { enabled: false, repo: 'b2:nordlys-bøtte:hjem', accountId: 'B2-ID-123456', accountKey: 'B2-HEMMELIG-NØKKEL-987' } } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.targets.nas.repo, nas);
  assert.equal(r.body.targets.offsite.accountKeySet, true);
  assert.equal(r.body.keySet, true);
  assert.equal(r.body.restic.available, true);
  assert.doesNotMatch(r.text, /B2-HEMMELIG|B2-ID-123456/);
  const raw = JSON.stringify(kv.get(OWNER, 'ops51_backup_secrets', {}));
  assert.doesNotMatch(raw, /B2-HEMMELIG|B2-ID-123456/);
  assert.match(raw, /"enc:/);
  // Repo-passordet: bare med passordet på nytt.
  assert.equal((await A('/api/ops51/backup/key', 'POST', {})).status, 403);
  assert.equal((await A('/api/ops51/backup/key', 'POST', { password: 'feil' })).status, 403);
  const k = await A('/api/ops51/backup/key', 'POST', { password: 'testpassord1' });
  assert.equal(k.status, 200);
  assert.ok(k.body.repoPassword.length >= 24);
  assert.doesNotMatch((await A('/api/ops51/backup/settings')).text, new RegExp(k.body.repoPassword));
  void off;
});

/* ---------------- Backup ---------------- */

test('backup: databasene kopieres konsistent (øktene tømt), levende .db og backup-mapper hoppes over, to mål → 3-2-1', async () => {
  mkdirSync(join(DATA, 'uploads'), { recursive: true });
  writeFileSync(join(DATA, 'uploads', 'kvittering.jpg'), 'bilde');
  mkdirSync(join(DATA, 'backups'), { recursive: true });
  writeFileSync(join(DATA, 'backups', 'pre-update-x.db'), 'stor kopi');
  // En ekstra database øverst i data-mappen tas også med.
  const Database = (await import('better-sqlite3')).default;
  const extra = new Database(join(DATA, 'ekstra.db')); extra.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1)'); extra.close();
  const br = new Database(join(DATA, 'brreg51.sqlite')); br.exec('CREATE TABLE enheter(orgnr)'); br.close();
  writeFileSync(ARGLOG, ''); writeFileSync(ENVLOG, '');
  const r = await A('/api/ops51/backup/run', 'POST', {});
  assert.equal(r.status, 202, r.text);
  assert.equal((await A('/api/ops51/backup/run', 'POST', {})).status, 409, 'bare én om gangen');
  const run = await until(async () => { const x = (await A(`/api/ops51/backup/runs/${r.body.id}`)).body; return x?.state !== 'running' ? x : null; });
  assert.equal(run.state, 'ok', JSON.stringify(run));
  assert.deepEqual(run.targets.map((t) => [t.id, t.state]), [['local', 'ok'], ['nas', 'ok']]);
  assert.deepEqual(run.dbs.map((x) => x.name).sort(), ['ekstra.db', 'homelab.db']);
  // Innholdet i snapshotet.
  const nas = join(ROOT, 'nas', 'snapshots');
  const snap = join(nas, readdirSync(nas)[0], 'tree', DATA);
  assert.ok(existsSync(join(snap, 'uploads', 'kvittering.jpg')));
  assert.ok(existsSync(join(snap, '.ops51-stage', 'db', 'homelab.db')));
  assert.ok(!existsSync(join(snap, 'homelab.db')), 'den levende databasen tas ikke med');
  assert.ok(!existsSync(join(snap, 'homelab.db-wal')));
  assert.ok(!existsSync(join(snap, 'backups')), 'pre-update-kopiene tas ikke med');
  assert.ok(!existsSync(join(snap, 'brreg51.sqlite')) && !existsSync(join(snap, '.ops51-stage', 'db', 'brreg51.sqlite')), 'Enhetsregisteret (kan lastes ned på nytt) tas ikke med');
  assert.ok(!existsSync(join(snap, 'system-backups')), 'det lokale repoet tas ikke med i seg selv');
  const copy = new Database(join(snap, '.ops51-stage', 'db', 'homelab.db'), { readonly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0, 'øktene er tømt i kopien');
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n >= 2);
  assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
  copy.close();
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n > 0, 'de ekte øktene er urørt');
  // Hemmeligheter aldri i argumentene; offsite (av) ble ikke kontaktet.
  const args = readFileSync(ARGLOG, 'utf8');
  assert.doesNotMatch(args, /B2-|enc:/);
  const k = JSON.parse(readFileSync(ENVLOG, 'utf8').split('\n')[0]);
  assert.equal(k.hasPw, true);
  assert.ok(!readFileSync(ENVLOG, 'utf8').includes('nordlys-bøtte'));
  assert.match(args, /"forget","--tag","nordlys51","--host","nordlys","--keep-daily","7","--keep-weekly","4","--keep-monthly","6","--prune"/);
  const card = (await A('/api/ops51/summary')).body.backup;
  assert.equal(card.copies, 2);
  assert.equal(card.rule321.copies, 3);
  assert.equal(card.status, 'yellow', 'gjenoppretting ikke testet ennå');
  assert.match(card.issues.join(' '), /ikke testet/);
});

test('offsite slått på: B2-nøkkelen bare i miljøet til offsite; feil på ett mål gir «partial» og vasket feiltekst', async () => {
  let r = await A('/api/ops51/backup/settings', 'PUT', { targets: { offsite: { enabled: true } } });
  assert.equal(r.status, 200);
  // offsite-repoet «b2:…» finnes ikke i den falske restic; FAKE_FAIL gjør at det feiler, og passordet i feilen skal vaskes bort.
  writeFileSync(join(ROOT, 'fake-fail'), 'nordlys-bøtte');
  writeFileSync(ENVLOG, '');
  r = await A('/api/ops51/backup/run', 'POST', {});
  const run = await until(async () => { const x = (await A(`/api/ops51/backup/runs/${r.body.id}`)).body; return x?.state !== 'running' ? x : null; });
  rmSync(join(ROOT, 'fake-fail'));
  assert.equal(run.state, 'partial');
  const off = run.targets.find((t) => t.id === 'offsite');
  assert.equal(off.state, 'failed');
  assert.match(off.error, /connection refused/);
  const pw = b51.revealKey51().repoPassword;
  assert.ok(!off.error.includes(pw), 'repo-passordet vaskes bort fra feilen');
  assert.ok(!JSON.stringify(run).includes(pw));
  const envs = readFileSync(ENVLOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(envs.filter((e) => e.repo.startsWith('b2:')).every((e) => e.b2 === 'B2-ID-123456' && e.b2key === 'set'));
  assert.ok(envs.filter((e) => !e.repo.startsWith('b2:')).every((e) => e.b2 === null && e.b2key === null), 'B2-nøkkelen gis bare til offsite');
  const card = (await A('/api/ops51/summary')).body.backup;
  assert.match(card.issues.join(' '), /Offsite: .*connection refused/);
  // Gjenoppretting fra et mål uten vellykket backup → tydelig melding, ikke restic sin «repository does not exist».
  assert.throws(() => b51.startRestoreTest51({ target: 'offsite', by: 'test' }), (e) => e.status === 409 && /Ingen backup er tatt til Offsite ennå/.test(e.message));
  await A('/api/ops51/backup/settings', 'PUT', { targets: { offsite: { enabled: false } } });
});

/* ---------------- Testet gjenoppretting ---------------- */

test('testet gjenoppretting: snapshot → temp-mappe → integritet → server mot kopien (port 4602) → røyktest → grønt kort', { timeout: 120_000 }, async () => {
  const before = new Set(readdirSync(tmpdir()).filter((f) => f.startsWith('nordlys-restore51-')));
  const r = await A('/api/ops51/backup/restore-test', 'POST', { target: 'nas' });
  assert.equal(r.status, 202, r.text);
  const t = await until(async () => { const x = (await A(`/api/ops51/backup/restore-tests/${r.body.id}`)).body; return x?.state !== 'running' ? x : null; }, 110_000);
  assert.equal(t.state, 'ok', JSON.stringify(t, null, 1));
  assert.equal(t.target, 'nas');
  assert.equal(t.scope, 'full');
  assert.deepEqual(t.steps.map((s) => [s.key, s.state]), [['snapshot', 'ok'], ['restore', 'ok'], ['integrity', 'ok'], ['start', 'ok'], ['smoke', 'ok']]);
  assert.match(t.steps.find((s) => s.key === 'integrity').detail, /homelab\.db: ok/);
  assert.match(t.steps.find((s) => s.key === 'smoke').detail, /tabeller · \d+ brukere · integritet ok/);
  // Temp-mappen er ryddet og sandkassen er stoppet.
  await until(() => !b51.backupRunning51());
  assert.deepEqual(readdirSync(tmpdir()).filter((f) => f.startsWith('nordlys-restore51-') && !before.has(f)), []);
  await assert.rejects(realFetch('http://127.0.0.1:4602/healthz'));
  const card = (await A('/api/ops51/summary')).body.backup;
  assert.equal(card.status, 'green', JSON.stringify(card.issues));
  assert.equal(card.restoreTest.state, 'ok');
});

test('testet gjenoppretting som feiler (ødelagt database i snapshotet) → rødt kort med årsak', { timeout: 60_000 }, async () => {
  await until(() => !b51.backupRunning51());
  writeFileSync(join(ROOT, 'fake-corrupt'), DATA);
  const { id, done } = b51.startRestoreTest51({ target: 'local', by: 'test' });
  await done;
  rmSync(join(ROOT, 'fake-corrupt'));
  const t = b51.getRestoreTest51(id);
  assert.equal(t.state, 'failed');
  assert.equal(t.steps.at(-1).key, 'integrity');
  const card = b51.backupCard51();
  assert.equal(card.status, 'red');
  assert.match(card.issues.join(' '), /Gjenopprettingstesten feilet/);
});

test('planlegger: backup på valgt klokkeslett (én gang per døgn), vedlikehold søndag 04:40', async () => {
  await until(() => !b51.backupRunning51());
  // 2026-10-25 er en søndag. 02:41 Oslo (vintertid, UTC+1) = 01:41Z.
  const t = Date.parse('2026-10-25T01:41:00Z');
  const s1 = await ops.ops51Tick(t);
  assert.deepEqual(s1, ['backup']);
  await until(() => !b51.backupRunning51());
  assert.deepEqual(await ops.ops51Tick(t + 60_000), [], 'ikke to ganger samme døgn');
  const s2 = await ops.ops51Tick(Date.parse('2026-10-25T03:41:00Z'));
  assert.deepEqual(s2, ['maintenance']);
  assert.equal(m.lastMaint51().kind, 'weekly');
});

/* ---------------- Updateren: staging og tilbakerulling med ett trykk ---------------- */

const SCRIPT = resolve('deploy/updater/updater.sh');
const has = (cmd) => spawnSync('bash', ['-c', `command -v ${cmd}`]).status === 0;
const skip = !(has('bash') && has('jq') && has('tar') && has('timeout')) && 'trenger bash, jq, tar og timeout';
const SHA = 'c0ffee'.padEnd(40, '0'), OLD = 'beef'.padEnd(40, '1');

function setupUpd() {
  const root = mkdtempSync(join(tmpdir(), 'hl-upd51-'));
  const host = join(root, 'opt', 'homelab-os'), bin = join(root, 'bin'), src = join(root, 'src', `torskenes-verden-${SHA}`), tags = join(root, 'tags');
  for (const d of [host, bin, src, tags, join(host, 'data', 'update'), join(host, 'server'), join(src, 'server')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(host, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(host, 'server', 'index.js'), '// gammel');
  writeFileSync(join(host, '.env'), 'SESSION_SECRET=hemmelig\n');
  writeFileSync(join(host, 'data', 'homelab.db'), 'ekte database');
  writeFileSync(join(host, 'data', 'update', 'history.json'), JSON.stringify({ entries: [{ sha: OLD, version: '9.9.8', at: 1 }] }));
  writeFileSync(join(src, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(src, 'server', 'index.js'), '// ny');
  writeFileSync(join(src, 'CHANGELOG.md'), '## [9.9.9] – 24.10.2026\n- ny\n');
  const tgz = join(root, 'src.tgz');
  execFileSync('tar', ['-czf', tgz, '-C', join(root, 'src'), `torskenes-verden-${SHA}`]);
  const calls = join(root, 'calls.log');
  writeFileSync(join(tags, 'homelab-os:local'), 'sha256:' + 'a'.repeat(64));
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
out=""; url=""; w=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -w) w="$2"; shift 2;; -H|--max-time|--data) shift 2;; http*) url="$1"; shift;; *) shift;; esac; done
echo "curl $url" >> "${calls}"
case "$url" in
  https://api.github.com/*) echo '{"sha":"${SHA}"}';;
  https://codeload.github.com/*) cp "${tgz}" "$out";;
  http://staging.test:3000/healthz) [ "\${FAKE_STAGING:-ok}" = down ] && exit 7; exit 0;;
  http://staging.test:3000/api/ops51/smoke) [ "\${FAKE_STAGING:-ok}" = baddb ] && { echo '{"ok":false,"error":"Integritet: feil"}'; exit 22; }; echo '{"ok":true,"tables":42,"integrity":"ok"}';;
  http://staging.test:3000/) [ -n "$w" ] && printf 200;;
  http://staging.test:3000/api/login) [ -n "$w" ] && printf 401;;
  *healthz) [ "\${FAKE_HEALTH:-ok}" = down ] && exit 7; exit 0;;
  *) exit 22;;
esac
`);
  // Falsk docker med tagger i en mappe: tag/build/inspect -f {{.Id}}/image inspect/compose config/run/rm/logs.
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
echo "docker $*" >> "${calls}"
T="${tags}"
newid() { printf 'sha256:%064x' "$(( $(date +%s%N) % 1000000007 ))"; }
resolve() { if [[ "$1" == sha256:* ]]; then echo "$1"; else cat "$T/$1" 2>/dev/null; fi; }
case "$*" in
  *project.working_dir*) echo "\${FAKE_WORKDIR:-}";;
  *com.docker.compose.project*) echo homelab-os;;
  inspect*Config.Image*) echo homelab-updater:local;;
  *"config --format json"*) echo '{"services":{"os":{"image":"homelab-os:local"}}}';;
  "image inspect -f {{.Id}} "*) resolve "$5" || exit 1;;
  "image inspect "*) [ -f "$T/$3" ] || exit 1;;
  "tag "*) id=$(resolve "$2") && [ -n "$id" ] && echo "$id" > "$T/$3" || exit 1;;
  "build -t "*) newid > "$T/$3";;
  *" build os"*) newid > "$T/homelab-os:local";;
  "image rm "*) rm -f "$T/$3";;
  "inspect -f {{.State.Running}}"*) echo true;;
esac
exit 0
`);
  writeFileSync(join(bin, 'sqlite3'), `#!/usr/bin/env bash
echo "sqlite3 $*" >> "${calls}"
src=""; for a in "$@"; do case "$a" in -*|.*) ;; VACUUM*) dest=$(printf '%s' "$a" | sed -E "s/^VACUUM INTO '(.*)'$/\\1/");; *) [ -z "$src" ] && src="$a";; esac; done
cp "$src" "$dest"
`);
  for (const f of ['curl', 'docker', 'sqlite3']) chmodSync(join(bin, f), 0o755);
  return { root, host, bin, calls, tags, upd: join(host, 'data', 'update') };
}
const envOf = (t, env) => ({ PATH: `${t.bin}:${process.env.PATH}`, HOME: t.root, HOSTNAME: 'abc123', HOST_DIR: t.host, ONCE: '1', LOCK_DIR: t.root, HEALTH_TIMEOUT: '2', HEALTH_SLEEP: '1',
  TMPDIR: t.root, FAKE_WORKDIR: t.host, SELF_UPDATE: '0', WATCH_SLEEP: '1', MIN_DISK_MB: '1', MIN_RAM_MB: '1', STAGING_MIN_RAM_MB: '1', STAGING_URL: 'http://staging.test:3000', ...env });
const rd = (t, f) => { try { return JSON.parse(readFileSync(join(t.upd, f), 'utf8')); } catch { return null; } };
const tagOf = (t, n) => { try { return readFileSync(join(t.tags, n), 'utf8').trim(); } catch { return null; } };
function runUpd(t, request, env = {}) {
  if (request) writeFileSync(join(t.upd, 'request.json'), JSON.stringify(request));
  const before = existsSync(t.calls) ? readFileSync(t.calls, 'utf8').length : 0;
  const r = spawnSync('bash', [SCRIPT], { env: envOf(t, env), encoding: 'utf8', timeout: 60_000 });
  return { ...r, calls: existsSync(t.calls) ? readFileSync(t.calls, 'utf8').slice(before) : '' };
}

test('updater: «stage» bygger og røyktester i staging mot en kopi av databasen; os, status.json og prosjektmappen røres ikke', { skip }, () => {
  const t = setupUpd();
  const r = runUpd(t, { id: 'st-1', at: Date.now(), action: 'stage', sha: 'f'.repeat(40), repo: 'evil/evil', image: 'evil:latest' });
  const s = rd(t, 'staging51.json'), job = rd(t, 'staging51-job.json');
  assert.equal(job?.state, 'done', r.stderr + readFileSync(join(t.upd, 'staging51-log.txt'), 'utf8'));
  assert.equal(job.step, 'Klar i staging');
  assert.equal(s.state, 'ready');
  assert.deepEqual([s.sha, s.version], [SHA, '9.9.9']);
  assert.deepEqual(s.smoke.map((x) => [x.name, x.ok]), [['Svarer (/healthz)', true], ['Databasen (kopi)', true], ['Forsiden', true], ['Innlogging avviser feil passord', true]]);
  assert.equal(rd(t, 'status.json'), null, 'status.json gjelder bare det som kjører');
  assert.equal(readFileSync(join(t.host, 'server', 'index.js'), 'utf8'), '// gammel', 'prosjektmappen er urørt');
  assert.equal(readFileSync(join(t.upd, 'staging51', 'data', 'homelab.db'), 'utf8'), 'ekte database', 'kopi av databasen');
  assert.ok(existsSync(join(t.upd, 'staging51', 'src.tgz')));
  assert.match(r.calls, /docker build -t homelab-os:staging51 /);
  assert.match(r.calls, /docker run -d --name homelab-os-staging51 .*--network homelab-os_default --env-file .*-e OPS51_SANDBOX=1 .*-e DOCKER_HOST=tcp:\/\/127\.0\.0\.1:9 .*-v .*staging51\/data:\/data homelab-os:staging51/);
  assert.doesNotMatch(r.calls, /docker run [^\n]*(docker-api| -p )|compose [^\n]* up|build os/, 'ingen port, ikke docker-api, os startes ikke');
  assert.doesNotMatch(r.calls, /evil|ffffffff/);
  assert.equal(tagOf(t, 'homelab-os:local'), 'sha256:' + 'a'.repeat(64));
  assert.equal(rd(t, 'config51.json').staging, false);

  // «promote»: samme image tas i bruk (ingen ny bygging), forrige image beholdes som prev51.
  const staged = tagOf(t, 'homelab-os:staging51');
  const p = runUpd(t, { id: 'pr-1', at: Date.now(), action: 'promote' });
  const st = rd(t, 'status.json');
  assert.equal(st?.state, 'done', p.stderr + readFileSync(join(t.upd, 'log.txt'), 'utf8'));
  assert.equal(st.action, 'update');
  assert.deepEqual([st.sha, st.version], [SHA, '9.9.9']);
  assert.doesNotMatch(p.calls, /build os|codeload|api\.github/, 'ingen ny nedlasting eller bygging');
  assert.match(p.calls, /docker rm -f homelab-os-staging51/);
  assert.equal(tagOf(t, 'homelab-os:local'), staged, 'det røyktestede imaget kjører');
  assert.equal(tagOf(t, 'homelab-os:prev51'), 'sha256:' + 'a'.repeat(64), 'forrige image er beholdt');
  assert.deepEqual([rd(t, 'prev51.json').sha, rd(t, 'prev51.json').version], [OLD, '9.9.8']);
  assert.equal(rd(t, 'staging51.json').state, 'promoted');
  assert.ok(!existsSync(join(t.upd, 'staging51')));
  assert.equal(readFileSync(join(t.host, 'server', 'index.js'), 'utf8'), '// ny');
  assert.equal(rd(t, 'history.json').entries[0].sha, SHA);

  // «rollback-image»: tilbake til 9.9.8 med ett trykk – og samme knapp angrer.
  const rb = runUpd(t, { id: 'ri-1', at: Date.now(), action: 'rollback-image' });
  let s2 = rd(t, 'status.json');
  assert.equal(s2.state, 'done', rb.stderr + readFileSync(join(t.upd, 'log.txt'), 'utf8'));
  assert.equal(s2.action, 'rollback');
  assert.deepEqual([s2.sha, s2.version], [OLD, '9.9.8']);
  assert.doesNotMatch(rb.calls, /build|codeload|api\.github/);
  assert.match(rb.calls, /docker tag homelab-os:prev51 homelab-os:local/);
  assert.match(rb.calls, /compose .* up -d --no-deps os/);
  assert.equal(tagOf(t, 'homelab-os:local'), 'sha256:' + 'a'.repeat(64));
  assert.equal(tagOf(t, 'homelab-os:prev51'), staged);
  assert.deepEqual([rd(t, 'prev51.json').sha, rd(t, 'installed.json').sha], [SHA, OLD]);
  runUpd(t, { id: 'ri-2', at: Date.now(), action: 'rollback-image' });
  s2 = rd(t, 'status.json');
  assert.deepEqual([s2.state, s2.version], ['done', '9.9.9']);
  assert.equal(tagOf(t, 'homelab-os:local'), staged);
});

test('updater: røyktest som feiler i staging → ingenting byttes, filene er urørt, kode «staging»; «discard» rydder', { skip }, () => {
  for (const mode of ['baddb', 'down']) {
    const t = setupUpd();
    const r = runUpd(t, { id: `sf-${mode}`, at: Date.now() }, { UPDATE_STAGING: '1', FAKE_STAGING: mode });
    const st = rd(t, 'status.json');
    assert.equal(st?.state, 'failed', r.stderr);
    assert.equal(st.code, 'staging');
    assert.match(st.error, mode === 'baddb' ? /databasesjekken mot kopien feilet/ : /svarte ikke innen 2 sekunder/);
    assert.match(st.error, /Ingenting er byttet – 9\.9\.8 kjører som før/);
    assert.equal(readFileSync(join(t.host, 'server', 'index.js'), 'utf8'), '// gammel');
    assert.doesNotMatch(r.calls, /compose .* up -d|build os/);
    assert.match(r.calls, /docker rm -f homelab-os-staging51/);
    assert.equal(rd(t, 'staging51.json').state, 'failed');
    assert.equal(rd(t, 'config51.json').staging, true);
    const d = runUpd(t, { id: `dc-${mode}`, at: Date.now(), action: 'discard' });
    assert.equal(rd(t, 'staging51.json').state, 'discarded', d.stderr);
    assert.ok(!existsSync(join(t.upd, 'staging51')));
  }
  // promote uten noe klart → feiler uten å røre noe.
  const t = setupUpd();
  const p = runUpd(t, { id: 'pr-x', at: Date.now(), action: 'promote' });
  assert.equal(rd(t, 'status.json').state, 'failed');
  assert.match(rd(t, 'status.json').error, /Ingen versjon er klar i staging/);
  assert.doesNotMatch(p.calls, /compose .* up -d|codeload/);
});

test('updater: vanlig oppdatering med UPDATE_STAGING=1 går via staging og bruker det testede imaget; forrige image beholdes', { skip }, () => {
  const t = setupUpd();
  const r = runUpd(t, { id: 'up-1', at: Date.now() }, { UPDATE_STAGING: '1' });
  const st = rd(t, 'status.json');
  assert.equal(st?.state, 'done', r.stderr + readFileSync(join(t.upd, 'log.txt'), 'utf8'));
  assert.match(r.calls, /docker build -t homelab-os:staging51/);
  assert.doesNotMatch(r.calls, / build os/, 'ingen dobbel bygging');
  assert.match(readFileSync(join(t.upd, 'log.txt'), 'utf8'), /Staging: alle røyktester er grønne/);
  assert.equal(rd(t, 'prev51.json').sha, OLD);
  assert.equal(rd(t, 'staging51.json').state, 'promoted');
  // For lite minne → vanlig oppdatering uten staging.
  const t2 = setupUpd();
  const r2 = runUpd(t2, { id: 'up-2', at: Date.now() }, { UPDATE_STAGING: '1', STAGING_MIN_RAM_MB: '9999999' });
  assert.equal(rd(t2, 'status.json').state, 'done', r2.stderr);
  assert.match(r2.calls, / build os/);
  assert.match(readFileSync(join(t2.upd, 'log.txt'), 'utf8'), /Staging hoppes over/);
  // Uten forrige image: rollback-image avvises.
  const t3 = setupUpd();
  runUpd(t3, { id: 'ri-x', at: Date.now(), action: 'rollback-image' });
  assert.match(rd(t3, 'status.json').error, /ikke tatt vare på forrige versjon/);
});

/* ---------------- Serveren → updateren ---------------- */

test('server: /updates/* skriver bare {id, requestedBy, at, action}; krever updater, klar staging og forrige versjon', async () => {
  const upd = join(DATA, 'update');
  mkdirSync(upd, { recursive: true });
  let r = await A('/api/ops51/updates/stage', 'POST', {});
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Updateren svarer ikke/);
  writeFileSync(join(upd, 'heartbeat'), String(Math.floor(Date.now() / 1000)));
  writeFileSync(join(upd, 'config51.json'), JSON.stringify({ staging: true, stagingPort: null, minRamMb: 1536 }));
  r = await A('/api/ops51/updates/stage', 'POST', { sha: 'f'.repeat(40), repo: 'evil/evil', command: 'rm -rf /' });
  assert.equal(r.status, 202, r.text);
  const q1 = JSON.parse(readFileSync(join(upd, 'request.json'), 'utf8'));
  assert.deepEqual(Object.keys(q1).sort(), ['action', 'at', 'id', 'requestedBy']);
  assert.equal(q1.action, 'stage');
  assert.ok(typeof q1.requestedBy === 'string' && q1.requestedBy.length > 0);
  rmSync(join(upd, 'request.json'));
  assert.equal((await A('/api/ops51/updates/promote', 'POST', {})).status, 409);
  assert.equal((await A('/api/ops51/updates/rollback-image', 'POST', {})).status, 409);
  writeFileSync(join(upd, 'staging51.json'), JSON.stringify({ id: 'x', state: 'ready', sha: SHA, version: '9.9.9', at: Date.now(), smoke: [{ name: 'Svarer', ok: true }], port: null, evil: '<script>' }));
  writeFileSync(join(upd, 'prev51.json'), JSON.stringify({ sha: OLD, version: '9.9.8', at: Date.now() }));
  const u = (await A('/api/ops51/updates')).body;
  assert.equal(u.staging.canPromote, true);
  assert.equal(u.previous.version, '9.9.8');
  assert.equal(u.channel.staging, true);
  assert.doesNotMatch(JSON.stringify(u), /<script>/);
  r = await A('/api/ops51/updates/promote', 'POST', {});
  assert.equal(r.status, 202, r.text);
  assert.ok(r.body.backup?.startsWith('pre-update-'), 'backup før byttet');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(upd, 'request.json'), 'utf8'))).sort(), ['action', 'at', 'id', 'requestedBy']);
  // Updateren har ikke plukket den opp ennå → «pågår».
  assert.equal((await A('/api/ops51/updates/rollback-image', 'POST', {})).status, 409);
  rmSync(join(upd, 'request.json'));
  r = await A('/api/ops51/updates/rollback-image', 'POST', {});
  assert.equal(r.status, 202);
  assert.match(r.body.message, /Går tilbake til Nordlys 9\.9/);
  rmSync(join(upd, 'request.json'));
  // Med «Krev passord for å oppdatere» på kreves passordet.
  kv.set(OWNER, 'update_settings', { require_password: true });
  assert.equal((await A('/api/ops51/updates/stage', 'POST', {})).status, 403);
  assert.equal((await A('/api/ops51/updates/stage', 'POST', { password: 'testpassord1' })).status, 202);
  kv.set(OWNER, 'update_settings', {});
  const card = (await A('/api/ops51/summary')).body.updates;
  assert.equal(card.status, 'green');
});
