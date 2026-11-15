// Flytting av eksisterende kategoridata til de nye standardkategoriene (Fase 6, Q11). Bare admin, bare på forespørsel:
// den kjører aldri ved oppstart, i en jobb eller av seg selv. Først en forhåndsvisning («23 transaksjoner i Hjem → Hjem og interiør»,
// «4 budsjetter»), så må admin bekrefte med forhåndsvisningens id. Alt som endres logges i fh_cat_migrations, så endringen kan angres.
// Ingen eksterne kall og ingen AI (finansdata forlater aldri huset).
//
//   GET  /finans/api/categories/migration?abonnementer=<kategori>  → forhåndsvisning {previewId, mappings:[…], total, targets, history}
//   POST /finans/api/categories/migration {confirm:true, previewId, targets?}  → {id, counts, mappings}
//   POST /finans/api/categories/migration/:id/undo  → {id, undone, counts}
//   GET  /finans/api/categories/migrations  → {items:[{id, created, by, counts, undoneAt}]}
//
// Endringene gjelder alle brukernes regnskap (kategoriene er per bruker). Forhåndsvisningen viser bare antall, aldri innhold.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { db, q } from './db.js';
import { auth42 } from './glimt-routes.js';

db.exec(`CREATE TABLE IF NOT EXISTS fh_cat_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  by_user TEXT NOT NULL,
  plan TEXT NOT NULL,          -- JSON: mappingene og antallene admin bekreftet
  log TEXT NOT NULL,           -- JSON: hver endring med gammel verdi, i rekkefølge
  undone_at INTEGER,
  undone_by TEXT
)`);

/** Flyttingene. rename: kategorien får nytt navn (alle koblinger blir). merge: radene flyttes til en annen kategori, og den gamle slettes. */
export const MIGRATIONS = [
  { id: 'hjem', from: 'Hjem', to: 'Hjem og interiør', text: '«Hjem» får navnet «Hjem og interiør» (innkjøp), så det ikke forveksles med «Bolig» (faste boutgifter).' },
  { id: 'abonnementer', from: 'Abonnementer', to: 'Fritid og hobby', choose: true, text: '«Abonnementer» er ikke en kategori lenger. Abonnementene ligger i Faste betalinger, og trekkene får kategorien du velger.' },
];
// Kategoriene «Abonnementer» kan flyttes til (standard utgiftskategorier). Mangler målet hos en bruker, lages det (og fjernes ved angring).
export const ABO_TARGETS = ['Fritid og hobby', 'Annet', 'Bolig', 'Hjem og interiør', 'Skole', 'Mat og dagligvarer', 'Transport og lading', 'Restaurant og kafé'];
const TABLES = [['fh_transactions', 'transaksjoner', 'transaksjon'], ['fh_receipts', 'kvitteringer', 'kvittering'], ['fh_recurring', 'faste utgifter', 'fast utgift'], ['fh_rules', 'regler', 'regel']];
const DEFAULT_COLOR = { 'Hjem og interiør': '#8FD3FF', 'Fritid og hobby': '#5FD3A8', Annet: '#A0A0AA' };

const catOf = (u, name) => q('SELECT * FROM fh_categories WHERE user_id=? AND name=?').get(u, name);
const users = () => q('SELECT DISTINCT user_id u FROM fh_categories').pluck().all();
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function targetsOf(t = {}) {
  const abo = ABO_TARGETS.includes(t?.abonnementer) ? t.abonnementer : 'Fritid og hobby';
  return { hjem: 'Hjem og interiør', abonnementer: abo };
}

/** Forhåndsvisning: hva som endres, og hvor mange rader. Endrer ingenting. */
export function preview(targets = {}) {
  const T = targetsOf(targets);
  const mappings = MIGRATIONS.map((m) => {
    const to = T[m.id], c = { users: 0, rename: 0, merge: 0, budgets: 0, transactions: 0, receipts: 0, recurring: 0, rules: 0 };
    for (const u of users()) {
      const src = catOf(u, m.from);
      if (!src || m.from === to) continue;
      c.users++;
      const dst = catOf(u, to);
      if (!dst && m.id === 'hjem') c.rename++; else c.merge++;
      c.transactions += q('SELECT count(*) FROM fh_transactions WHERE category_id=? AND user_id=?').pluck().get(src.id, u);
      c.receipts += q('SELECT count(*) FROM fh_receipts WHERE category_id=? AND user_id=?').pluck().get(src.id, u);
      c.recurring += q('SELECT count(*) FROM fh_recurring WHERE category_id=? AND user_id=?').pluck().get(src.id, u);
      c.rules += q('SELECT count(*) FROM fh_rules WHERE category_id=? AND user_id=?').pluck().get(src.id, u);
      c.budgets += q('SELECT count(*) FROM fh_budgets WHERE category_id=? AND user_id=?').pluck().get(src.id, u);
    }
    const arrow = `${m.from} → ${to}`;
    const lines = !c.users ? [] : [
      `${word(c.transactions, 'transaksjon', 'transaksjoner')} i ${arrow}`,
      ...(c.receipts ? [word(c.receipts, 'kvittering', 'kvitteringer')] : []),
      ...(c.budgets ? [word(c.budgets, 'budsjett', 'budsjetter')] : []),
      ...(c.recurring ? [word(c.recurring, 'fast utgift', 'faste utgifter')] : []),
      ...(c.rules ? [word(c.rules, 'regel', 'regler')] : []),
      `${word(c.users, 'regnskap', 'regnskap')}${c.merge ? ` · kategorien «${m.from}» slås sammen med «${to}»` : ` · kategorien får nytt navn`}`,
    ];
    return { id: m.id, from: m.from, to, text: m.text, choose: !!m.choose, ...c, lines };
  });
  const total = mappings.reduce((a, m) => a + m.transactions + m.receipts + m.budgets + m.recurring + m.rules + m.rename + m.merge, 0);
  const previewId = createHash('sha256').update(JSON.stringify({ T, mappings: mappings.map(({ text, lines, ...x }) => x) })).digest('hex').slice(0, 16);
  return { previewId, targets: T, targetOptions: ABO_TARGETS, mappings, total, nothing: total === 0 };
}

/** Utfører flyttingen som forhåndsvisningen previewId beskrev. Kaster hvis dataene har endret seg siden. */
export function apply({ previewId, targets = {}, by }) {
  const pv = preview(targets);
  if (!previewId || previewId !== pv.previewId) { const e = new Error('Dataene har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen og bekreft på nytt.'); e.status = 409; e.code = 'PREVIEW_STALE'; throw e; }
  if (pv.nothing) { const e = new Error('Det er ingenting å flytte.'); e.status = 400; e.code = 'NOTHING_TO_MIGRATE'; throw e; }
  const T = pv.targets, log = [];
  const run = db.transaction(() => {
    for (const m of MIGRATIONS) {
      const to = T[m.id];
      for (const u of users()) {
        const src = catOf(u, m.from);
        if (!src || m.from === to) continue;
        let dst = catOf(u, to);
        if (!dst && m.id === 'hjem') { // nytt navn, alle koblinger blir
          q('UPDATE fh_categories SET name=? WHERE id=?').run(to, src.id);
          log.push({ op: 'rename', u, id: src.id, from: m.from, to });
          continue;
        }
        if (!dst) {
          dst = q('INSERT INTO fh_categories(name,color,kind,sort,user_id) VALUES(?,?,?,?,?) RETURNING *').get(to, DEFAULT_COLOR[to] ?? src.color, 'expense', src.sort, u);
          log.push({ op: 'create', u, id: dst.id, name: to });
        }
        for (const [t] of TABLES) {
          const ids = q(`SELECT id FROM ${t} WHERE category_id=? AND user_id=?`).pluck().all(src.id, u);
          if (!ids.length) continue;
          q(`UPDATE ${t} SET category_id=? WHERE category_id=? AND user_id=?`).run(dst.id, src.id, u);
          log.push({ op: 'move', u, table: t, ids, from: src.id, to: dst.id });
        }
        // Budsjetter: samme måned hos målet → beløpene legges sammen.
        for (const b of q('SELECT * FROM fh_budgets WHERE category_id=? AND user_id=?').all(src.id, u)) {
          const cur = q('SELECT amount FROM fh_budgets WHERE category_id=? AND month=?').get(dst.id, b.month);
          if (cur) q('UPDATE fh_budgets SET amount=? WHERE category_id=? AND month=?').run(cur.amount + b.amount, dst.id, b.month);
          else q('INSERT INTO fh_budgets(category_id,month,amount,user_id) VALUES(?,?,?,?)').run(dst.id, b.month, b.amount, u);
          q('DELETE FROM fh_budgets WHERE category_id=? AND month=?').run(src.id, b.month);
          log.push({ op: 'budget', u, from: src.id, to: dst.id, month: b.month, amount: b.amount, before: cur?.amount ?? null });
        }
        q('DELETE FROM fh_categories WHERE id=?').run(src.id);
        log.push({ op: 'delete', u, row: src });
      }
    }
    const counts = Object.fromEntries(pv.mappings.map((m) => [m.id, { transactions: m.transactions, receipts: m.receipts, budgets: m.budgets, recurring: m.recurring, rules: m.rules, users: m.users }]));
    const id = q('INSERT INTO fh_cat_migrations(created,by_user,plan,log) VALUES(?,?,?,?) RETURNING id').pluck().get(Date.now(), String(by), JSON.stringify({ previewId, targets: T, counts }), JSON.stringify(log));
    return { id, counts };
  });
  const r = run();
  return { ...r, mappings: pv.mappings.map(({ id, from, to, lines }) => ({ id, from, to, lines })) };
}

/** Angrer en flytting: alt i loggen settes tilbake i motsatt rekkefølge. Rader som er endret senere (annen kategori), røres ikke. */
export function undo(id, by) {
  const row = q('SELECT * FROM fh_cat_migrations WHERE id=?').get(+id);
  if (!row) { const e = new Error('Fant ikke flyttingen'); e.status = 404; e.code = 'NOT_FOUND'; throw e; }
  if (row.undone_at) { const e = new Error('Flyttingen er allerede angret'); e.status = 409; e.code = 'ALREADY_UNDONE'; throw e; }
  const log = JSON.parse(row.log), counts = { restored: 0, skipped: 0 };
  db.transaction(() => {
    for (const x of [...log].reverse()) {
      if (x.op === 'delete') {
        const r = x.row, cols = Object.keys(r);
        if (q('SELECT 1 FROM fh_categories WHERE user_id=? AND name=?').get(x.u, r.name)) { counts.skipped++; continue; }
        q(`INSERT INTO fh_categories(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((k) => r[k]));
        counts.restored++;
      } else if (x.op === 'budget') {
        if (x.before == null) q('DELETE FROM fh_budgets WHERE category_id=? AND month=?').run(x.to, x.month);
        else q('UPDATE fh_budgets SET amount=? WHERE category_id=? AND month=?').run(x.before, x.to, x.month);
        q('INSERT OR REPLACE INTO fh_budgets(category_id,month,amount,user_id) VALUES(?,?,?,?)').run(x.from, x.month, x.amount, x.u);
        counts.restored++;
      } else if (x.op === 'move') {
        const st = q(`UPDATE ${x.table} SET category_id=? WHERE id=? AND category_id=? AND user_id=?`);
        for (const rid of x.ids) { const ch = st.run(x.from, rid, x.to, x.u).changes; if (ch) counts.restored++; else counts.skipped++; }
      } else if (x.op === 'create') {
        const used = TABLES.some(([t]) => q(`SELECT 1 FROM ${t} WHERE category_id=? LIMIT 1`).get(x.id)) || q('SELECT 1 FROM fh_budgets WHERE category_id=? LIMIT 1').get(x.id);
        if (used) counts.skipped++; else { q('DELETE FROM fh_categories WHERE id=?').run(x.id); counts.restored++; }
      } else if (x.op === 'rename') {
        if (q('SELECT 1 FROM fh_categories WHERE user_id=? AND name=?').get(x.u, x.from)) { counts.skipped++; continue; }
        const ch = q('UPDATE fh_categories SET name=? WHERE id=? AND name=?').run(x.from, x.id, x.to).changes;
        if (ch) counts.restored++; else counts.skipped++;
      }
    }
    q('UPDATE fh_cat_migrations SET undone_at=?, undone_by=? WHERE id=?').run(Date.now(), String(by), row.id);
  })();
  return { id: row.id, undone: true, counts };
}

export function history() {
  return q('SELECT id, created, by_user, plan, undone_at FROM fh_cat_migrations ORDER BY id DESC LIMIT 20').all()
    .map((r) => ({ id: r.id, created: r.created, by: r.by_user, counts: JSON.parse(r.plan).counts, targets: JSON.parse(r.plan).targets, undoneAt: r.undone_at, undoable: !r.undone_at }));
}

const R = auth42('finance:read'), W = auth42('finance:write');
const adminSession = async (c, next) => {
  const a = c.get('access');
  if (!a?.admin) return c.json({ error: 'Bare administratorer kan flytte kategoridata', code: 'FORBIDDEN' }, 403);
  if (!a.session) return c.json({ error: 'Krever innlogging i nettleseren', code: 'SESSION_REQUIRED' }, 403);
  await next();
};
const fail = (c, e) => c.json({ error: e.message, code: e.code ?? 'BAD_REQUEST' }, e.status ?? 400);

export const categoryMigrationApi = new Hono();
categoryMigrationApi.get('/categories/migration', R, adminSession, (c) => c.json({ ...preview({ abonnementer: c.req.query('abonnementer') }), history: history() }));
categoryMigrationApi.get('/categories/migrations', R, adminSession, (c) => c.json({ items: history() }));
categoryMigrationApi.post('/categories/migration', W, adminSession, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.confirm !== true) return c.json({ error: 'Bekreft flyttingen (confirm: true) etter forhåndsvisningen', code: 'CONFIRM_REQUIRED' }, 400);
  try { return c.json(apply({ previewId: String(b.previewId ?? ''), targets: b.targets ?? {}, by: c.get('user') })); } catch (e) { return fail(c, e); }
});
categoryMigrationApi.post('/categories/migration/:id{[0-9]+}/undo', W, adminSession, (c) => {
  try { return c.json(undo(+c.req.param('id'), c.get('user'))); } catch (e) { return fail(c, e); }
});
export default categoryMigrationApi;
