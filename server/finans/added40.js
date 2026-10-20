// Prompt 40 (SERVER40): «Lagt til …»-linja og endringshistorikk for transaksjoner og kvitteringer (datanivå, ingen ruter).
// Brukes av txOut/receiptOut i routes.js (feltet added) og av finans/p40.js (PATCH-historikk, søk).
//
// added = {at:'2026-10-16T15:46:00.000Z', by:'<bruker-id>'|null, byName:'Sebastian'|null, source:'scan'|'bank'|'manual'|'email'|'import',
//          via:'glimt'|'shortcut'|'api'|null, sourceLabel:'skannet kvittering', text:'Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian',
//          edited:{at, by, byName, text:'Sist endret 18.10.2026 kl. 09.12 av Ingrid'}|null}
// Additivt: nye kolonner created_by/created_via/updated_at/updated_by (+ tags på transaksjoner) og tabellen fh_tx_history40.
// Eksisterende rader: tidspunktet er created (importtid for bankimport, opplastingstid for kvitteringer).
import { db } from './db.js';
import { userInfo } from '../auth.js';

const addCol = (t, col, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
for (const t of ['fh_transactions', 'fh_receipts']) { addCol(t, 'created_by', 'TEXT'); addCol(t, 'created_via', 'TEXT'); addCol(t, 'updated_at', 'INTEGER'); addCol(t, 'updated_by', 'TEXT'); }
addCol('fh_transactions', 'tags', "TEXT NOT NULL DEFAULT '[]'");
addCol('fh_receipts', 'extraction_orig40', 'TEXT'); // slik Glimt leste den første gang («Tilbakestill»)
db.exec(`CREATE TABLE IF NOT EXISTS fh_tx_history40 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tx_id INTEGER NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, by TEXT, changes TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS fh_tx_history40_tx ON fh_tx_history40(tx_id, at);`);

export const VIA = ['glimt', 'shortcut', 'api', 'manual', 'scan', 'bank_import', 'email'];
const pad = (n) => String(n).padStart(2, '0');
/** «16.10.2026 kl. 17.46» i Europe/Oslo. */
export function osloStamp(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} kl. ${pad(+p.hour)}.${p.minute}`;
}
const firstName = (id) => { if (!id) return null; const u = userInfo(id); const n = u?.displayName || u?.name || u?.username || null; return n ? String(n).split(/\s+/)[0] : null; };
const bankOf = (row) => { try { const b = row.raw_bank_row ? JSON.parse(row.raw_bank_row) : null; return b?.bank || null; } catch { return null; } };
const tokenName = (via) => { const m = String(via ?? '').match(/^api:(.+)$/); return m ? m[1] : null; };

/**
 * «Lagt til»-info for en rad. kind 'tx' (fh_transactions, ev. med receipt_* fra TX_SELECT) eller 'receipt' (fh_receipts).
 */
export function addedOf40(row, kind = 'tx') {
  if (!row) return null;
  const at = Number(row.created) || null;
  const by = row.created_by || (kind === 'receipt' ? row.uploaded_by : null) || row.user_id || null;
  const via = row.created_via ? String(row.created_via).replace(/^api:.*/, 'api') : null;
  let source, label, showBy = true;
  if (kind === 'receipt') {
    source = row.source === 'email' ? 'email' : 'scan';
    label = source === 'email' ? 'kvittering fra e-post' : 'skannet kvittering';
  } else {
    const s = row.source ?? 'manual';
    if (s === 'receipt') { source = 'scan'; label = 'skannet kvittering'; }
    else if (s === 'psd2' || s === 'bank') { source = 'bank'; const b = bankOf(row); label = `bankimport${b ? ` fra ${b}` : ''}`; showBy = false; }
    else if (s === 'csv' || s === 'import') { source = 'import'; const b = bankOf(row); label = b ? `bankimport fra ${b}` : 'importert fra fil'; showBy = !b; }
    else if (s === 'email') { source = 'email'; label = 'fra e-post'; }
    else { source = 'manual'; label = 'lagt inn manuelt'; }
  }
  if (via === 'glimt') label = 'lagt til av Glimt fra chat';
  else if (via === 'shortcut') label = 'via iOS Snarvei';
  else if (via === 'api') { const n = tokenName(row.created_via); label = n ? `via API-nøkkel «${n}»` : 'via API-nøkkel'; }
  const byName = firstName(by);
  const text = at ? `Lagt til ${osloStamp(at)} · ${label}${showBy && byName ? ` · ${byName}` : ''}` : null;
  const upd = Number(row.updated_at) || null;
  const edited = upd ? { at: new Date(upd).toISOString(), by: row.updated_by ?? null, byName: firstName(row.updated_by), text: `Sist endret ${osloStamp(upd)}${firstName(row.updated_by) ? ` av ${firstName(row.updated_by)}` : ''}` } : null;
  return { at: at ? new Date(at).toISOString() : null, by, byName, source, via: via ?? null, sourceLabel: label, text, edited };
}

/** Setter hvem/hvordan en ny transaksjon (eller kvittering) ble lagt til. via: 'glimt'|'shortcut'|'api'|'api:<navn>'|null */
export function markCreated40(table, id, by, via = null) {
  if (!['fh_transactions', 'fh_receipts'].includes(table)) return;
  db.prepare(`UPDATE ${table} SET created_by=COALESCE(created_by, ?), created_via=COALESCE(created_via, ?) WHERE id=?`).run(by ?? null, via ?? null, id);
}

/** Endringshistorikk for en transaksjon (nyeste først). → [{at, by, byName, changes:[{field, label, old, new}], text}] */
export function historyOf40(txId) {
  return db.prepare('SELECT * FROM fh_tx_history40 WHERE tx_id=? ORDER BY at DESC, id DESC LIMIT 50').all(txId).map((h) => {
    let changes = []; try { changes = JSON.parse(h.changes); } catch { /* */ }
    return { at: new Date(h.at).toISOString(), by: h.by, byName: firstName(h.by), changes, text: `${osloStamp(h.at)}${firstName(h.by) ? ` · ${firstName(h.by)}` : ''} · ${changes.map((x) => x.label).join(', ')}` };
  });
}
const LABEL = { date: 'dato', amount: 'beløp', description: 'beskrivelse', merchant: 'motpart', category_id: 'kategori', account_id: 'konto', note: 'notat', tags: 'tagger', folder: 'deling', lines: 'varelinjer' };
/** Lagrer forskjellen mellom to rader (+ ekstra endringer) og setter updated_at/updated_by. → endringene */
export function recordChange40(txId, user, before, after, extra = []) {
  const changes = [];
  for (const f of ['date', 'amount', 'description', 'merchant', 'category_id', 'account_id', 'note', 'tags']) {
    const a = before?.[f] ?? null, b = after?.[f] ?? null;
    if (String(a) !== String(b)) changes.push({ field: f === 'category_id' ? 'categoryId' : f === 'account_id' ? 'accountId' : f, label: LABEL[f], old: f === 'amount' && a != null ? a / 100 : a, new: f === 'amount' && b != null ? b / 100 : b });
  }
  changes.push(...extra);
  if (!changes.length) return [];
  const now = Date.now();
  db.prepare('INSERT INTO fh_tx_history40(tx_id, user_id, at, by, changes) VALUES(?,?,?,?,?)').run(txId, before?.user_id ?? user, now, user, JSON.stringify(changes));
  db.prepare('UPDATE fh_transactions SET updated_at=?, updated_by=? WHERE id=?').run(now, user, txId);
  return changes;
}
export const tagsOf40 = (row) => { try { const v = JSON.parse(row?.tags ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

const linesOf = (r) => { try { return (JSON.parse(r?.extraction ?? 'null')?.lines ?? []).map((l) => ({ description: l.description, amount: l.amount })); } catch { return []; } };
/**
 * «Bruk endringene» etter «Les på nytt» på en bokført transaksjon (kandidat fra reanalyze med apply:false).
 * Kvitteringen får den nye lesingen (den gamle huskes i extraction_orig40 for «Tilbakestill»), transaksjonen får butikk, dato og beløp
 * (fortegnet beholdes), og endringen står i historikken. Status (booked) og koblingen beholdes. → endringene
 */
export function applyRereadTx40(u, t, r, cand) {
  const d = cand?.data ?? {};
  const before = linesOf(r);
  if (!r.extraction_orig40 && r.extraction) db.prepare('UPDATE fh_receipts SET extraction_orig40=? WHERE id=?').run(r.extraction, r.id);
  const totalOre = d.total != null ? Math.round(Math.abs(d.total) * 100) : null;
  db.prepare('UPDATE fh_receipts SET extraction=?, merchant=COALESCE(?, merchant), date=COALESCE(?, date), total=COALESCE(?, total), provider=COALESCE(?, provider), model=COALESCE(?, model), candidate=NULL, updated_at=?, updated_by=? WHERE id=?')
    .run(JSON.stringify(d), d.merchant ?? null, d.date ?? null, totalOre, cand.provider ?? null, cand.model ?? null, Date.now(), u, r.id);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? ''));
  db.prepare('UPDATE fh_transactions SET merchant=COALESCE(?, merchant), date=?, amount=? WHERE id=?')
    .run(d.merchant ?? null, isDate ? d.date : t.date, totalOre != null ? (t.amount < 0 ? -totalOre : totalOre) : t.amount, t.id);
  const after = db.prepare('SELECT * FROM fh_transactions WHERE id=?').get(t.id);
  const lines = linesOf(db.prepare('SELECT extraction FROM fh_receipts WHERE id=?').get(r.id));
  return recordChange40(t.id, u, t, after, JSON.stringify(lines) !== JSON.stringify(before) ? [{ field: 'lines', label: 'varelinjer (lest på nytt)', old: before.length, new: lines.length }] : []);
}
