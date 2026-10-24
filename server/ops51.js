// Prompt 51 (OPS51): backup og oppdateringer – restic-backup (3-2-1) med ukentlig testet gjenoppretting, staging-kanal og
// tilbakerulling med ett trykk (updateren), og database-vedlikehold. Montert under /api/ops51. Alt er bare for admin.
//
// Tilgang (samme mønster som system-update.js og system-backup.js): GET virker med økt eller admin-app-token (finance:read).
// Endringer krever økt i nettleseren ELLER admin-token med finance:write, og JSON-kropp. Å vise repo-passordet krever passordet
// på nytt. Staging/bytt/tilbakerulling krever passord bare når «Krev passord for å oppdatere» er på (som /api/system/update).
//
// Updateren (deploy/updater/updater.sh) får BARE {id, requestedBy, at, action} i data/update/request.json, med action
// 'stage' | 'promote' | 'discard' | 'rollback-image'. Ingen repo, branch, sha, image eller kommando sendes – updateren leser
// alt fra egen konfig (UPDATE_STAGING, STAGING_PORT …) og egne filer (staging51.json, prev51.json), som serveren bare leser.
//
// Ruter: se $S/SERVER51-API.md (OPS51). Kort:
//   GET  /summary                  → {backup, db, updates} (kortene i System)
//   GET  /backup/settings · PUT /backup/settings · POST /backup/key {password|reauthToken} → {repoPassword}
//   POST /backup/run → 202 {id} · GET /backup/runs · GET /backup/runs/:id
//   POST /backup/restore-test {target?} → 202 {id} · GET /backup/restore-tests · GET /backup/restore-tests/:id
//   GET  /db → {health, tables, migrations, maintenance} · POST /db/maintenance {kind} → {result}
//   GET  /updates → {channel, staging, previous, job} · POST /updates/{stage|promote|discard|rollback-image}
//   GET  /smoke → bare når OPS51_SANDBOX=1 (sandkassen og staging-containeren), uten innlogging; ellers 404.
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { sessionUser, isAdmin, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded, listUsers } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { consumeReauth } from './reauth.js';
import { notifyUser } from './notify.js';
import { DB_SCHEMA, parseChangelog, updateNow, updateSettings, updaterAvailable, preUpdateBackup, shortName } from './system-update.js';
import { dbHealth51, tableSizes51, migrationLog51, maintLog51, runMaintenance51, recordMigrations51, integrityOf51, maintRunning51 } from './dbmaint51.js';
import { backupCard51, settingsOut51, saveBackupSettings51, revealKey51, startBackup51, startRestoreTest51, backupRuns51, getRun51, restoreTests51, getRestoreTest51,
  backupSettings51, backupRunning51 } from './backup51.js';

const DATA = resolve(config.dataDir);
const UPD = join(DATA, 'update');
export const SANDBOX = () => process.env.OPS51_SANDBOX === '1';

function ownVersion() {
  try { return parseChangelog(readFileSync(resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md'), 'utf8'))[0]?.version ?? null; } catch { return null; }
}

/* ---------------- Updater-filer (bare lesing, alt valideres) ---------------- */

const readJson = (name) => { try { return JSON.parse(readFileSync(join(UPD, name), 'utf8')); } catch { return null; } };
const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : null);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const sha = (v) => (/^[0-9a-f]{40}$/.test(String(v ?? '')) ? v : null);
const semver = (v) => (/^\d{1,4}\.\d{1,5}\.\d{1,6}$/.test(String(v ?? '')) ? v : null);
const STAGE_STATES = new Set(['running', 'ready', 'failed', 'promoted', 'discarded']);

export function stagingOut51() {
  const s = readJson('staging51.json');
  const job = readJson('staging51-job.json');
  const prev = readJson('prev51.json');
  const cfg = readJson('config51.json');
  const smoke = Array.isArray(s?.smoke) ? s.smoke.slice(0, 20).map((x) => ({ name: str(x?.name, 80), ok: x?.ok === true, detail: str(x?.detail, 200) })) : [];
  return {
    channel: cfg && typeof cfg === 'object' ? { staging: cfg.staging === true, autoStaging: cfg.staging === true, port: num(cfg.stagingPort), minRamMb: num(cfg.minRamMb), at: num(cfg.at) } : null,
    staging: s && typeof s === 'object' && STAGE_STATES.has(s.state) ? { id: str(s.id, 80), state: s.state, sha: sha(s.sha), version: semver(s.version), at: num(s.at), error: str(s.error, 600),
      smoke, port: num(s.port), url: num(s.port) ? `http://<server>:${num(s.port)}` : null, canPromote: s.state === 'ready' && !!sha(s.sha) } : null,
    job: job && typeof job === 'object' ? { id: str(job.id, 80), state: str(job.state, 20), step: str(job.step, 200), error: str(job.error, 1000), startedAt: num(job.startedAt), finishedAt: num(job.finishedAt), version: semver(job.version) } : null,
    previous: prev && typeof prev === 'object' && sha(prev.sha) ? { sha: sha(prev.sha), version: semver(prev.version), at: num(prev.at), canRollback: true } : null,
  };
}

/** Kortet for oppdateringer: grønt når forrige versjon kan rulles tilbake med ett trykk og ingenting feiler i staging. */
function updatesCard() {
  const u = stagingOut51(), now = updateNow();
  const st = u.staging?.state;
  const status = st === 'failed' ? 'red' : !u.previous ? 'yellow' : 'green';
  const title = st === 'ready' ? `${u.staging.version ? shortName(u.staging.version) : 'Ny versjon'} er klar i staging`
    : st === 'failed' ? 'Ny versjon feilet i staging' : st === 'running' || u.job?.state === 'staging' ? 'Prøver ny versjon i staging …'
    : u.previous ? `Tilbakerulling til ${u.previous.version ?? u.previous.sha.slice(0, 7)} er klar` : 'Ingen forrige versjon lagret ennå';
  return { status, title, updaterAvailable: updaterAvailable(), updating: now.updating, ...u };
}

/* ---------------- Skrive forespørsel til updateren ---------------- */

const ACTIONS = new Set(['stage', 'promote', 'discard', 'rollback-image']);
export async function writeUpdaterRequest51(by, action) {
  if (!ACTIONS.has(action)) throw new Error('Ukjent handling');
  let backup = null;
  if (action === 'promote' || action === 'rollback-image') backup = await preUpdateBackup({ action: action === 'promote' ? 'update' : 'rollback' });
  // Bare id, hvem, når og handlingen. Alt annet bestemmer updateren selv.
  const req = { id: randomUUID(), requestedBy: String(by).slice(0, 64), at: Date.now(), action };
  mkdirSync(UPD, { recursive: true });
  const tmp = join(UPD, `.request-${req.id}.tmp`);
  writeFileSync(tmp, JSON.stringify(req), { mode: 0o644 });
  renameSync(tmp, join(UPD, 'request.json'));
  console.warn(`[ops51] updater: ${action} ${req.id} av ${req.requestedBy}${backup ? `, backup ${backup}` : ''}`);
  return { id: req.id, backup };
}

/* ---------------- Planlegger (Europe/Oslo) ---------------- */

function osloParts(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hh: Number(p.hour), mm: Number(p.minute), wd: p.weekday };
}
const inWindow = (o, hh, mm, win = 10) => { const a = o.hh * 60 + o.mm, b = hh * 60 + mm; return a >= b && a < b + win; };
const slot = (k) => kv.get(OWNER, `ops51_slot_${k}`, null);
const setSlot = (k, v) => kv.set(OWNER, `ops51_slot_${k}`, v);

function notifyAdmins(title, body, tag) {
  for (const u of listUsers().filter((x) => x.role === 'admin')) {
    notifyUser(u.id, { title, body, url: '/#/innstillinger/system', tag, category: 'system', data: { kind: 'ops51', deepLink: 'finanshub://innstillinger/system' } })
      .catch((e) => console.warn('[ops51] varsel:', e.message));
  }
}

/** Kalles hvert minutt. → hva som ble startet (for tester). */
export async function ops51Tick(t = Date.now()) {
  const o = osloParts(t), s = backupSettings51(), started = [];
  const [bh, bm] = s.time.split(':').map(Number);
  if (s.enabled && inWindow(o, bh, bm) && slot('backup') !== o.date && !backupRunning51()) {
    setSlot('backup', o.date);
    try { const r = startBackup51({ kind: 'auto', by: 'auto' }); started.push('backup'); watchRun(r, 'backup'); } catch (e) { console.warn('[ops51] backup:', e.message); }
  }
  if (s.enabled && s.restoreTest && o.wd === 'Sun' && inWindow(o, 4, 10, 30) && slot('restore') !== o.date && !backupRunning51()) {
    setSlot('restore', o.date);
    try { const r = startRestoreTest51({ kind: 'auto', by: 'auto' }); started.push('restore-test'); watchRun(r, 'restore'); } catch (e) { console.warn('[ops51] gjenopprettingstest:', e.message); }
  }
  if (o.wd === 'Sun' && inWindow(o, 4, 40, 15) && slot('maint') !== o.date && !maintRunning51() && !backupRunning51()) {
    setSlot('maint', o.date);
    const r = runMaintenance51({ kind: 'weekly', by: 'auto' });
    started.push('maintenance');
    if (!r.ok) notifyAdmins('Databasevedlikeholdet feilet', r.error ?? 'Se System → Database.', 'ops51-maint');
  }
  return started;
}
function watchRun(r, kind) {
  r.done.then(() => {
    if (kind === 'backup') {
      const run = getRun51(r.id);
      if (run && run.state !== 'ok') notifyAdmins(run.state === 'partial' ? 'Backup delvis feilet' : 'Backup feilet', String(run.error ?? 'Se System → Backup.').slice(0, 200), 'ops51-backup');
    } else {
      const t = getRestoreTest51(r.id);
      if (t && t.state !== 'ok') notifyAdmins('Testet gjenoppretting feilet', String(t.error ?? 'Se System → Backup.').slice(0, 200), 'ops51-restore');
    }
  }).catch(() => {});
}

let timers = [];
export function startOps51() {
  if (timers.length) return;
  const mig = setTimeout(() => { try { recordMigrations51({ version: ownVersion(), dbSchema: DB_SCHEMA }); } catch (e) { console.warn('[ops51] migrasjonslogg:', e.message); } }, 5_000);
  if (SANDBOX()) { timers = [mig]; return; } // sandkasse/staging: bare migrasjonsloggen, ingen backup eller vedlikehold
  const tick = setInterval(() => ops51Tick().catch((e) => console.warn('[ops51] planlegger:', e.message)), 60_000);
  timers = [mig, tick];
  for (const x of timers) x.unref?.();
}

/* ---------------- Ruter ---------------- */

const api = new Hono();

// Røyktest for sandkassen (testet gjenoppretting) og staging-containeren. Finnes bare med OPS51_SANDBOX=1.
api.get('/smoke', (c) => {
  if (!SANDBOX()) return c.json({ error: 'Ikke funnet' }, 404);
  try {
    const integrity = integrityOf51(null, { quick: true });
    const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get().n;
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    let migration = null;
    try { migration = recordMigrations51({ version: ownVersion(), dbSchema: DB_SCHEMA }); } catch { /* valgfritt */ }
    const ok = integrity === 'ok' && tables > 0;
    return c.json({ ok, integrity, tables, users, version: ownVersion(), dbSchema: DB_SCHEMA, migration: migration ? { kind: migration.kind, addedTables: migration.addedTables.length, addedColumns: migration.addedColumns.length, removed: migration.removed.length } : null, ...(ok ? {} : { error: `Integritet: ${integrity}` }) }, ok ? 200 : 500);
  } catch (e) {
    return c.json({ ok: false, error: String(e.message).slice(0, 200) }, 500);
  }
});

api.use('*', async (c, next) => {
  let user = sessionUser(c), session = !!user;
  if (!user && bearerOk(c, 'finance:read')) user = c.get('user');
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(user)) return c.json({ error: 'Bare administratorer har tilgang til backup og drift' }, 403);
  c.set('user', user);
  c.set('access', { user, session, admin: true });
  await next();
});
const canWrite = (c) => c.get('access').session || bearerOk(c, 'finance:write');
/** Felles sjekk for endringer: skrivetilgang + JSON. → svar ved feil, ellers null. */
function writeGuard(c) {
  if (!canWrite(c)) return c.json({ error: 'Tokenet mangler tilgangen finance:write' }, 403);
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  return null;
}
/** Passord (eller engangs reauthToken fra POST /api/auth/reauth). always: kreves uansett brukervalg. */
async function passwordGuard(c, b, { always = false } = {}) {
  const a = c.get('access'), ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  if (!always && !updateSettings().require_password) return null;
  const viaToken = typeof b?.reauthToken === 'string' && consumeReauth(b.reauthToken, a.user);
  if (!viaToken && !checkPassword(a.user, b?.password)) {
    loginFailed(ip);
    return c.json({ error: b?.reauthToken ? 'Bekreftelsen er utløpt. Prøv igjen.' : 'Feil passord', needsPassword: true }, 403);
  }
  loginSucceeded(ip);
  return null;
}
const errOut = (c, e) => c.json({ error: e.message }, e.status ?? 500);

api.get('/summary', (c) => {
  const health = dbHealth51();
  return c.json({
    backup: backupCard51(),
    db: { status: health.status, title: health.status === 'red' ? 'Databasen trenger tilsyn' : health.status === 'yellow' ? 'Databasen er ikke sjekket denne uka' : 'Databasen er frisk',
      sizeMb: health.sizeMb, walMb: health.wal.walMb, walWarn: health.wal.warn, freePct: health.freePct, lastIntegrity: health.lastIntegrity, lastVacuum: health.lastVacuum },
    updates: updatesCard(),
    sandbox: SANDBOX(),
  });
});

/* Backup */
api.get('/backup/settings', (c) => c.json(settingsOut51()));
api.put('/backup/settings', async (c) => {
  const g = writeGuard(c); if (g) return g;
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Ugyldig kropp' }, 400);
  // Å bytte repo-passordet krever passordet på nytt (det låser ellers ute gamle snapshots).
  if (b.repoPassword !== undefined) { const p = await passwordGuard(c, b, { always: true }); if (p) return p; }
  const r = saveBackupSettings51(b);
  if (r.error) return c.json(r, 400);
  console.warn(`[ops51] backupinnstillinger endret av ${c.get('user')}`);
  return c.json(r.settings);
});
api.post('/backup/key', async (c) => {
  const g = writeGuard(c); if (g) return g;
  const b = await c.req.json().catch(() => ({}));
  const p = await passwordGuard(c, b, { always: true }); if (p) return p;
  console.warn(`[ops51] repo-passordet ble vist for ${c.get('user')}`);
  return c.json(revealKey51(), 200, { 'Cache-Control': 'no-store' });
});
api.post('/backup/run', async (c) => {
  const g = writeGuard(c); if (g) return g;
  try { const r = startBackup51({ kind: 'manual', by: c.get('user') }); watchRun(r, 'backup'); return c.json({ ok: true, id: r.id }, 202); } catch (e) { return errOut(c, e); }
});
api.get('/backup/runs', (c) => c.json({ items: backupRuns51(Number(c.req.query('limit')) || 20), running: backupRunning51() }));
api.get('/backup/runs/:id', (c) => { const r = getRun51(c.req.param('id')); return r ? c.json(r) : c.json({ error: 'Ikke funnet' }, 404); });
api.post('/backup/restore-test', async (c) => {
  const g = writeGuard(c); if (g) return g;
  const b = await c.req.json().catch(() => ({}));
  const target = ['local', 'nas', 'offsite'].includes(b?.target) ? b.target : null;
  try { const r = startRestoreTest51({ kind: 'manual', by: c.get('user'), target }); watchRun(r, 'restore'); return c.json({ ok: true, id: r.id }, 202); } catch (e) { return errOut(c, e); }
});
api.get('/backup/restore-tests', (c) => c.json({ items: restoreTests51(Number(c.req.query('limit')) || 20), running: backupRunning51() }));
api.get('/backup/restore-tests/:id', (c) => { const r = getRestoreTest51(c.req.param('id')); return r ? c.json(r) : c.json({ error: 'Ikke funnet' }, 404); });

/* Database */
api.get('/db', (c) => c.json({ health: dbHealth51(), tables: tableSizes51({ limit: Number(c.req.query('limit')) || 200 }), migrations: migrationLog51(30), maintenance: maintLog51(20), running: maintRunning51() }));
api.post('/db/maintenance', async (c) => {
  const g = writeGuard(c); if (g) return g;
  const b = await c.req.json().catch(() => ({}));
  const kind = ['weekly', 'integrity', 'checkpoint', 'vacuum'].includes(b?.kind) ? b.kind : null;
  if (!kind) return c.json({ error: 'kind må være weekly, integrity, checkpoint eller vacuum' }, 400);
  if (backupRunning51() && (kind === 'vacuum' || kind === 'weekly')) return c.json({ error: 'En backup pågår – prøv igjen etterpå' }, 409);
  try { return c.json({ result: runMaintenance51({ kind, by: c.get('user') }), health: dbHealth51() }); } catch (e) { return errOut(c, e); }
});

/* Oppdateringer: staging og tilbakerulling med ett trykk */
api.get('/updates', (c) => c.json(updatesCard()));
for (const action of ACTIONS) {
  api.post(`/updates/${action}`, async (c) => {
    const g = writeGuard(c); if (g) return g;
    const b = await c.req.json().catch(() => ({}));
    if (action !== 'discard') { const p = await passwordGuard(c, b); if (p) return p; }
    if (!updaterAvailable()) return c.json({ error: 'Updateren svarer ikke. Kjør update.sh én gang fra Proxmox for å slå den på.' }, 409);
    const st = stagingOut51();
    if (updateNow().updating || st.job?.state === 'staging' || st.staging?.state === 'running') return c.json({ error: 'En oppdatering pågår allerede' }, 409);
    if (action === 'promote' && !st.staging?.canPromote) return c.json({ error: 'Ingen versjon er klar i staging' }, 409);
    if (action === 'discard' && !st.staging) return c.json({ error: 'Ingenting kjører i staging' }, 409);
    if (action === 'rollback-image' && !st.previous) return c.json({ error: 'Updateren har ikke tatt vare på forrige versjon ennå' }, 409);
    try {
      const r = await writeUpdaterRequest51(c.get('user'), action);
      const message = action === 'stage' ? 'Ny versjon bygges og testes i staging. Ingenting byttes før du trykker «Bytt».'
        : action === 'promote' ? `Bytter til ${st.staging.version ? shortName(st.staging.version) : 'versjonen i staging'}`
        : action === 'discard' ? 'Staging stoppes og ryddes'
        : `Går tilbake til ${st.previous.version ? shortName(st.previous.version) : 'forrige versjon'}`;
      return c.json({ ok: true, id: r.id, backup: r.backup, message }, 202);
    } catch (e) {
      return c.json({ error: `Kunne ikke starte: ${e.message}` }, 500);
    }
  });
}

export default api;
