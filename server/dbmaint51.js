// Prompt 51 (OPS51): database-vedlikehold. Bare admin (rutene ligger i ops51.js).
//
// - WAL-sjekk: journal_mode, størrelse på -wal-fila, sjekkpunkt (PASSIVE ved lesing, TRUNCATE ved vedlikehold).
// - Ukentlig vedlikehold (søndag 04:40 Europe/Oslo, se ops51.js): PRAGMA integrity_check, wal_checkpoint(TRUNCATE), VACUUM og
//   PRAGMA optimize. Resultatet lagres i ops51_maint (nyeste 100).
// - Størrelse per tabell: dbstat (better-sqlite3 har DBSTAT_VTAB), ellers antall rader.
// - Migrasjonslogg: ved hver oppstart sammenlignes skjemaet (tabeller og kolonner) med forrige øyeblikksbilde. Endringer
//   (nye tabeller/kolonner/indekser, ny versjon eller DB_SCHEMA) lagres i ops51_migrations. Første gang lagres et utgangspunkt.
//   Migreringene er additive, så loggen viser bare det som er lagt til (og ev. fjernet, som da er et faresignal).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';

const DATA = resolve(config.dataDir);
const q = (sql) => db.prepare(sql);

db.exec(`CREATE TABLE IF NOT EXISTS ops51_maint (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  started INTEGER NOT NULL,
  finished INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  integrity TEXT,
  size_before INTEGER,
  size_after INTEGER,
  wal_before INTEGER,
  wal_after INTEGER,
  ms INTEGER,
  error TEXT,
  by_user TEXT
);
CREATE TABLE IF NOT EXISTS ops51_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  version TEXT,
  db_schema INTEGER,
  kind TEXT NOT NULL,
  added_tables TEXT NOT NULL DEFAULT '[]',
  added_columns TEXT NOT NULL DEFAULT '[]',
  added_indexes TEXT NOT NULL DEFAULT '[]',
  removed TEXT NOT NULL DEFAULT '[]',
  tables INTEGER,
  hash TEXT
);`);

const fileSize = (f) => { try { return statSync(f).size; } catch { return 0; } };
const MB = (b) => Math.round((b / 1048576) * 10) / 10;
export const MAIN_DB = () => db.name;

/** Alle SQLite-filer øverst i data-mappen (homelab.db og ev. andre .db), uten -wal/-shm. */
export function dbFiles51(dir = DATA) {
  try {
    return readdirSync(dir).filter((f) => /^[\w.-]+\.(db|sqlite3?)$/i.test(f)).map((f) => join(dir, f)).filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
  } catch { return []; }
}

/** WAL-status for hoveddatabasen. checkpoint: 'PASSIVE' (standard, blokkerer ingen) | 'TRUNCATE' | null (bare les). */
export function walStatus51(checkpoint = null) {
  const mode = String(db.pragma('journal_mode', { simple: true }) ?? '');
  let cp = null;
  if (checkpoint && /^(PASSIVE|FULL|RESTART|TRUNCATE)$/.test(checkpoint)) {
    try { const r = db.pragma(`wal_checkpoint(${checkpoint})`)[0] ?? {}; cp = { busy: r.busy ?? 0, logFrames: r.log ?? 0, checkpointed: r.checkpointed ?? 0 }; } catch { cp = null; }
  }
  const walBytes = fileSize(`${db.name}-wal`);
  const warn = mode !== 'wal' ? 'Databasen kjører ikke i WAL-modus.' : walBytes > 256 * 1048576 ? `WAL-fila er ${MB(walBytes)} MB – sjekkpunktet henger etter (lang lesing?).` : null;
  return { mode, walBytes, walMb: MB(walBytes), checkpoint: cp, warn, ok: !warn };
}

/** Størrelse per tabell (bytes, rader), største først. */
export function tableSizes51({ limit = 200 } = {}) {
  const tables = q("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  let bytes = {};
  let via = 'dbstat';
  try { for (const r of q('SELECT name, SUM(pgsize) AS s FROM dbstat GROUP BY name').all()) bytes[r.name] = r.s; } catch { via = 'rows'; bytes = {}; }
  // Indekser telles med tabellen sin.
  const idx = {};
  try { for (const r of q("SELECT name, tbl_name FROM sqlite_schema WHERE type='index'").all()) idx[r.name] = r.tbl_name; } catch { /* */ }
  const total = {};
  for (const [n, s] of Object.entries(bytes)) { const t = idx[n] ?? n; total[t] = (total[t] ?? 0) + s; }
  const out = tables.map((name) => {
    let rows = null;
    try { rows = q(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n; } catch { /* virtuelle tabeller o.l. */ }
    return { name, bytes: total[name] ?? null, mb: total[name] != null ? MB(total[name]) : null, rows };
  });
  out.sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || (b.rows ?? 0) - (a.rows ?? 0));
  return { via, tables: out.slice(0, limit), count: out.length };
}

/** Oversikt for System → Database. */
export function dbHealth51() {
  const pageSize = db.pragma('page_size', { simple: true }), pages = db.pragma('page_count', { simple: true }), free = db.pragma('freelist_count', { simple: true });
  const size = fileSize(db.name);
  const last = lastMaint51();
  const wal = walStatus51('PASSIVE');
  const files = dbFiles51().map((f) => ({ name: f.split(/[\\/]/).pop(), bytes: fileSize(f), walBytes: fileSize(`${f}-wal`) }));
  const lastIntegrity = q("SELECT * FROM ops51_maint WHERE integrity IS NOT NULL ORDER BY started DESC LIMIT 1").get() ?? null;
  const lastVacuum = q("SELECT * FROM ops51_maint WHERE kind IN ('weekly','vacuum') AND ok=1 ORDER BY started DESC LIMIT 1").get() ?? null;
  const week = 8 * 86400_000;
  const integrityOk = lastIntegrity ? lastIntegrity.integrity === 'ok' : null;
  const status = integrityOk === false || !wal.ok ? 'red' : !lastIntegrity || Date.now() - lastIntegrity.started > week ? 'yellow' : 'green';
  return {
    status,
    sizeBytes: size, sizeMb: MB(size), pageSize, pages, freePages: free, freePct: pages ? Math.round((free / pages) * 1000) / 10 : 0,
    wal, files,
    lastIntegrity: lastIntegrity ? { at: lastIntegrity.started, result: lastIntegrity.integrity, ok: lastIntegrity.integrity === 'ok' } : null,
    lastVacuum: lastVacuum ? { at: lastVacuum.started, sizeBefore: lastVacuum.size_before, sizeAfter: lastVacuum.size_after, ms: lastVacuum.ms } : null,
    last: last ? maintOut(last) : null,
  };
}

const maintOut = (r) => ({ id: r.id, kind: r.kind, at: r.started, finishedAt: r.finished, ok: !!r.ok, integrity: r.integrity, sizeBefore: r.size_before, sizeAfter: r.size_after,
  walBefore: r.wal_before, walAfter: r.wal_after, ms: r.ms, error: r.error, by: r.by_user });
export const lastMaint51 = () => q('SELECT * FROM ops51_maint ORDER BY started DESC LIMIT 1').get() ?? null;
export const maintLog51 = (limit = 20) => q('SELECT * FROM ops51_maint ORDER BY started DESC LIMIT ?').all(Math.max(1, Math.min(100, limit))).map(maintOut);

/** Integritetssjekk av en databasefil (eller hoveddatabasen). → 'ok' eller de første feilene. */
export function integrityOf51(file = null, { quick = false } = {}) {
  const pragma = quick ? 'quick_check' : 'integrity_check';
  if (!file) return db.pragma(pragma).map((r) => Object.values(r)[0]).slice(0, 20).join('; ');
  const d = new Database(file, { readonly: true, fileMustExist: true });
  try { return d.pragma(pragma).map((r) => Object.values(r)[0]).slice(0, 20).join('; '); } finally { d.close(); }
}

let running = null;
export const maintRunning51 = () => running;

/**
 * Vedlikehold. kind: 'weekly' (integritet + sjekkpunkt + VACUUM + optimize) | 'integrity' | 'checkpoint' | 'vacuum'.
 * Synkront (better-sqlite3); VACUUM blokkerer skriving mens det pågår, derfor søndag natt.
 */
export function runMaintenance51({ kind = 'weekly', by = null } = {}) {
  if (!['weekly', 'integrity', 'checkpoint', 'vacuum'].includes(kind)) throw new Error('Ukjent vedlikehold');
  if (running) throw Object.assign(new Error('Vedlikehold pågår allerede'), { status: 409 });
  const started = Date.now();
  running = { kind, started };
  const row = { kind, started, size_before: fileSize(db.name), wal_before: fileSize(`${db.name}-wal`), integrity: null, error: null, ok: 0 };
  try {
    if (kind === 'weekly' || kind === 'integrity') row.integrity = integrityOf51();
    if (kind === 'weekly' || kind === 'checkpoint' || kind === 'vacuum') db.pragma('wal_checkpoint(TRUNCATE)');
    if ((kind === 'weekly' || kind === 'vacuum') && row.integrity !== null && row.integrity !== 'ok') throw new Error('Integritetssjekken feilet – VACUUM er ikke kjørt. Gjenopprett fra backup.');
    if (kind === 'weekly' || kind === 'vacuum') { db.exec('VACUUM'); db.pragma('wal_checkpoint(TRUNCATE)'); }
    if (kind === 'weekly') { try { db.pragma('optimize'); } catch { /* eldre SQLite */ } }
    row.ok = row.integrity === null || row.integrity === 'ok' ? 1 : 0;
    if (!row.ok && !row.error) row.error = `Integritetssjekken fant feil: ${String(row.integrity).slice(0, 300)}`;
  } catch (e) {
    row.ok = 0; row.error = String(e.message ?? e).slice(0, 500);
  } finally {
    running = null;
  }
  row.finished = Date.now(); row.ms = row.finished - started;
  row.size_after = fileSize(db.name); row.wal_after = fileSize(`${db.name}-wal`);
  const r = q(`INSERT INTO ops51_maint(kind, started, finished, ok, integrity, size_before, size_after, wal_before, wal_after, ms, error, by_user)
    VALUES(@kind, @started, @finished, @ok, @integrity, @size_before, @size_after, @wal_before, @wal_after, @ms, @error, @by) RETURNING *`).get({ ...row, by: by ? String(by).slice(0, 64) : null });
  q('DELETE FROM ops51_maint WHERE id NOT IN (SELECT id FROM ops51_maint ORDER BY started DESC LIMIT 100)').run();
  if (!row.ok) console.warn(`[ops51] databasevedlikehold (${kind}) feilet: ${row.error}`);
  return maintOut(r);
}

/* ---------------- Migrasjonslogg ---------------- */

/** Skjemaet som {tables:{navn:[kolonner]}, indexes:[navn]} for en database (standard: hoveddatabasen). */
export function schemaSnapshot51(d = db) {
  const tables = {};
  for (const { name } of d.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    try { tables[name] = d.prepare(`SELECT name FROM pragma_table_info(?)`).all(name).map((c) => c.name); } catch { tables[name] = []; }
  }
  const indexes = d.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  return { tables, indexes };
}
const hashOf = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);

/**
 * Sammenligner skjemaet med forrige øyeblikksbilde (kv ops51_schema) og logger endringen. → raden som ble lagt til, eller null.
 * version/dbSchema: versjonen som kjører (CHANGELOG) og DB_SCHEMA fra system-update.js.
 */
export function recordMigrations51({ version = null, dbSchema = null, now = Date.now() } = {}) {
  const snap = schemaSnapshot51(), hash = hashOf(snap);
  const prev = kv.get(OWNER, 'ops51_schema', null);
  const tableCount = Object.keys(snap.tables).length;
  if (prev && prev.hash === hash && prev.version === version && prev.dbSchema === dbSchema) return null;
  let kind = 'baseline', addedT = [], addedC = [], addedI = [], removed = [];
  if (prev?.tables) {
    kind = 'migration';
    addedT = Object.keys(snap.tables).filter((t) => !prev.tables[t]);
    for (const [t, cols] of Object.entries(snap.tables)) if (prev.tables[t]) for (const c of cols) if (!prev.tables[t].includes(c)) addedC.push(`${t}.${c}`);
    addedI = snap.indexes.filter((i) => !(prev.indexes ?? []).includes(i));
    removed = [...Object.keys(prev.tables).filter((t) => !snap.tables[t]).map((t) => `tabell ${t}`),
      ...Object.entries(prev.tables).flatMap(([t, cols]) => (snap.tables[t] ? cols.filter((c) => !snap.tables[t].includes(c)).map((c) => `kolonne ${t}.${c}`) : []))];
    if (!addedT.length && !addedC.length && !addedI.length && !removed.length) kind = 'version';
  }
  kv.set(OWNER, 'ops51_schema', { hash, version, dbSchema, at: now, tables: snap.tables, indexes: snap.indexes });
  const r = q(`INSERT INTO ops51_migrations(at, version, db_schema, kind, added_tables, added_columns, added_indexes, removed, tables, hash)
    VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(now, version, dbSchema, kind, JSON.stringify(addedT), JSON.stringify(addedC), JSON.stringify(addedI), JSON.stringify(removed), tableCount, hash);
  q('DELETE FROM ops51_migrations WHERE id NOT IN (SELECT id FROM ops51_migrations ORDER BY at DESC LIMIT 200)').run();
  if (removed.length) console.warn(`[ops51] skjemaet har mistet ${removed.length} element(er) siden forrige oppstart: ${removed.slice(0, 5).join(', ')}`);
  return migOut(r);
}
const parse = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
const migOut = (r) => ({ id: r.id, at: r.at, version: r.version, dbSchema: r.db_schema, kind: r.kind, addedTables: parse(r.added_tables), addedColumns: parse(r.added_columns),
  addedIndexes: parse(r.added_indexes), removed: parse(r.removed), tables: r.tables });
export const migrationLog51 = (limit = 30) => q('SELECT * FROM ops51_migrations ORDER BY at DESC, id DESC LIMIT ?').all(Math.max(1, Math.min(200, limit))).map(migOut);

export const _test = { setRunning: (v) => { running = v; }, DATA, exists: existsSync };
