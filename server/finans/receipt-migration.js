// Q30: flytting av den gamle kvitteringslista (tabellen receipts, /api/receipts, beløp i kroner) til Økonomi-kvitteringer
// (fh_receipts). Bare admin, bare på forespørsel: den kjører aldri ved oppstart, i en jobb eller av seg selv. Samme mønster som
// kategoriflyttingen (category-migration.js):
//   1. Forhåndsvisning: hvor mange kvitteringer per bruker, sum og hvor mange bildefiler som finnes. Aldri innholdet.
//   2. Admin bekrefter med forhåndsvisningens id. Før noe endres, tas en kopi av hele databasen (DATA_DIR/backups).
//   3. Hver kvittering kopieres til fh_receipts (status «booked», kilde «legacy», beløpet i øre, kategorien med samme navn hvis
//      brukeren har den), og bildene kopieres til DATA_DIR/receipts/legacy/. Den gamle lista og filene røres ikke.
//   4. Angre: kopiene slettes igjen. Kvitteringer som er koblet til en transaksjon etterpå, står (telles som «hoppet over»).
// Ingen eksterne kall og ingen AI (finansdata forlater aldri huset).
//
//   GET  /finans/api/legacy-receipts/migration                 → {previewId, total, users:[{name, count, amount}], files, nothing, history}
//   POST /finans/api/legacy-receipts/migration {confirm:true, previewId} → {id, counts, backup}
//   POST /finans/api/legacy-receipts/migration/:id/undo        → {id, undone, counts}
//   GET  /finans/api/legacy-receipts/migrations                → {items:[{id, created, by, counts, backup, undoneAt, undoable}]}
import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { db, q } from './db.js';
import { config } from '../config.js';
import { userInfo } from '../auth/session.js';
import { auth42 } from './glimt-routes.js';

const DATA = resolve(config.dataDir);
const UPLOADS = join(DATA, 'uploads');
const RECEIPTS = join(DATA, 'receipts');
const BACKUPS = join(DATA, 'backups');

if (!q('PRAGMA table_info(fh_receipts)').all().some((c) => c.name === 'legacy_id')) db.exec('ALTER TABLE fh_receipts ADD COLUMN legacy_id INTEGER');
db.exec(`CREATE TABLE IF NOT EXISTS fh_receipt_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  by_user TEXT NOT NULL,
  plan TEXT NOT NULL,          -- JSON: antallene admin bekreftet og backupfila
  log TEXT NOT NULL,           -- JSON: [{receipt, legacy, files:[relativ sti]}]
  undone_at INTEGER,
  undone_by TEXT
)`);

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
/** Navnet på en opplastet fil, bare om den ligger rett i uploads/ (aldri en sti ut av mappa). */
const safeName = (n) => (typeof n === 'string' && n && basename(n) === n && !n.startsWith('.') ? n : null);
const pending = () => q('SELECT * FROM receipts r WHERE NOT EXISTS (SELECT 1 FROM fh_receipts f WHERE f.legacy_id = r.id) ORDER BY r.id').all();
const ore = (kr) => Math.round((Number(kr) || 0) * 100);

/** Forhåndsvisning: hva som flyttes. Endrer ingenting. */
export function preview() {
  const rows = pending();
  const by = new Map();
  let present = 0, missing = 0;
  for (const r of rows) {
    const u = by.get(r.user) ?? { user: r.user, name: userInfo(r.user)?.name ?? 'Ukjent bruker', count: 0, ore: 0 };
    u.count++; u.ore += ore(r.amount);
    by.set(r.user, u);
    for (const f of [r.file, r.thumb]) if (safeName(f)) { if (existsSync(join(UPLOADS, f))) present++; else missing++; }
  }
  const users = [...by.values()].map((u) => ({ name: u.name, count: u.count, amount: u.ore / 100, amountOre: u.ore }));
  const previewId = createHash('sha256').update(JSON.stringify(rows.map((r) => [r.id, r.user, r.store, r.date, r.category, r.amount, r.file, r.thumb]))).digest('hex').slice(0, 16);
  const already = q('SELECT count(*) FROM fh_receipts WHERE legacy_id IS NOT NULL').pluck().get();
  return { previewId, total: rows.length, users, files: { present, missing }, already, nothing: rows.length === 0,
    lines: rows.length ? [`${rows.length} ${rows.length === 1 ? 'kvittering' : 'kvitteringer'} fra den gamle kvitteringslista`, ...users.map((u) => `${u.name}: ${u.count}`)] : [] };
}

/** Utfører flyttingen forhåndsvisningen previewId beskrev. Tar en kopi av databasen først. */
export async function apply({ previewId, by }) {
  const pv = preview();
  if (!previewId || previewId !== pv.previewId) throw fail('Dataene har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen og bekreft på nytt.', 409, 'PREVIEW_STALE');
  if (pv.nothing) throw fail('Det er ingen gamle kvitteringer å flytte.', 400, 'NOTHING_TO_MIGRATE');
  await mkdir(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const backup = `for-kvitteringsflytting-${stamp}.db`;
  await db.backup(join(BACKUPS, backup));

  // Filene kopieres først (utenfor transaksjonen); radene skrives i én transaksjon.
  await mkdir(join(RECEIPTS, 'legacy'), { recursive: true });
  const rows = pending(), plan = [];
  for (const r of rows) {
    const id = randomUUID(), files = {};
    for (const [k, n] of [['file', r.file], ['thumb', r.thumb]]) {
      const name = safeName(n);
      if (!name || !existsSync(join(UPLOADS, name))) continue;
      const rel = `legacy/${id}${k === 'thumb' ? '_t' : ''}${extname(name).toLowerCase() || '.jpg'}`;
      await copyFile(join(UPLOADS, name), join(RECEIPTS, rel));
      files[k] = rel;
    }
    plan.push({ r, id, files });
  }
  const catId = (u, name) => q('SELECT id FROM fh_categories WHERE user_id=? AND lower(name)=lower(?)').pluck().get(u, String(name ?? ''));
  const ins = q(`INSERT INTO fh_receipts(id, file, thumb, mime, status, merchant, date, total, category_id, created, name, source, user_id, uploaded_by, legacy_id)
    VALUES(?,?,?,?,'booked',?,?,?,?,?,?,'legacy',?,?,?)`);
  const out = db.transaction(() => {
    const log = [];
    for (const { r, id, files } of plan) {
      ins.run(id, files.file ?? null, files.thumb ?? null, files.file ? r.mime : null, r.store || null, r.date, ore(r.amount), catId(r.user, r.category) ?? null,
        r.created ?? Date.now(), r.store || null, r.user, r.user, r.id);
      log.push({ receipt: id, legacy: r.id, files: Object.values(files) });
    }
    const counts = { receipts: log.length, files: log.reduce((a, x) => a + x.files.length, 0), users: pv.users.length };
    const mid = q('INSERT INTO fh_receipt_migrations(created, by_user, plan, log) VALUES(?,?,?,?) RETURNING id').pluck()
      .get(Date.now(), String(by), JSON.stringify({ previewId, counts, backup }), JSON.stringify(log));
    return { id: mid, counts };
  })();
  return { ...out, backup };
}

/** Angrer en flytting: kopiene slettes. Kvitteringer som er koblet til en transaksjon etterpå, står. */
export async function undo(id, by) {
  const row = q('SELECT * FROM fh_receipt_migrations WHERE id=?').get(+id);
  if (!row) throw fail('Fant ikke flyttingen', 404, 'NOT_FOUND');
  if (row.undone_at) throw fail('Flyttingen er allerede angret', 409, 'ALREADY_UNDONE');
  const log = JSON.parse(row.log), counts = { removed: 0, skipped: 0 }, gone = [];
  db.transaction(() => {
    for (const x of log) {
      const ch = q("DELETE FROM fh_receipts WHERE id=? AND legacy_id=? AND source='legacy' AND transaction_id IS NULL").run(x.receipt, x.legacy).changes;
      if (ch) { counts.removed++; gone.push(...x.files); } else counts.skipped++;
    }
    q('UPDATE fh_receipt_migrations SET undone_at=?, undone_by=? WHERE id=?').run(Date.now(), String(by), row.id);
  })();
  for (const f of gone) await unlink(join(RECEIPTS, f)).catch(() => {});
  return { id: row.id, undone: true, counts };
}

export function history() {
  return q('SELECT id, created, by_user, plan, undone_at FROM fh_receipt_migrations ORDER BY id DESC LIMIT 20').all()
    .map((r) => { const p = JSON.parse(r.plan); return { id: r.id, created: r.created, by: r.by_user, counts: p.counts, backup: p.backup, undoneAt: r.undone_at, undoable: !r.undone_at }; });
}

const R = auth42('finance:read'), W = auth42('finance:write');
const adminSession = async (c, next) => {
  const a = c.get('access');
  if (!a?.admin) return c.json({ error: 'Bare administratorer kan flytte de gamle kvitteringene', code: 'FORBIDDEN' }, 403);
  if (!a.session) return c.json({ error: 'Krever innlogging i nettleseren', code: 'SESSION_REQUIRED' }, 403);
  await next();
};
const bad = (c, e) => c.json({ error: e.message, code: e.code ?? 'BAD_REQUEST' }, e.status ?? 400);

export const receiptMigrationApi = new Hono();
receiptMigrationApi.get('/legacy-receipts/migration', R, adminSession, (c) => c.json({ ...preview(), history: history() }));
receiptMigrationApi.get('/legacy-receipts/migrations', R, adminSession, (c) => c.json({ items: history() }));
receiptMigrationApi.post('/legacy-receipts/migration', W, adminSession, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b?.confirm !== true) return c.json({ error: 'Bekreft flyttingen (confirm: true) etter forhåndsvisningen', code: 'CONFIRM_REQUIRED' }, 400);
  try { return c.json(await apply({ previewId: String(b.previewId ?? ''), by: c.get('user') })); } catch (e) { return bad(c, e); }
});
receiptMigrationApi.post('/legacy-receipts/migration/:id{[0-9]+}/undo', W, adminSession, async (c) => {
  try { return c.json(await undo(+c.req.param('id'), c.get('user'))); } catch (e) { return bad(c, e); }
});
export default receiptMigrationApi;
