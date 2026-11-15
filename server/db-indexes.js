// Indekser for fremmednøkler og bruker-kolonner som manglet dem (AUDIT A §4.2 punkt 3).
//
// Uten indeks på en fremmednøkkel må SQLite skanne hele barnetabellen ved hver sletting i foreldretabellen
// (DELETE FROM fh_transactions skannet fh_receipts, fh_folder_entries, fh_subscriptions og fh_finn), og spørringer
// som «WHERE user_id=?» skanner hele tabellen. ensureIndexes() kjøres ved oppstart etter at alle modulene har laget
// tabellene sine. Den er idempotent: tabeller eller kolonner som ikke finnes (ennå), virtuelle tabeller (FTS) og
// kolonner som allerede er første kolonne i en indeks, hoppes over. Bare CREATE INDEX IF NOT EXISTS, ingen data endres.
import { db } from './db.js';

/** [tabell, [kolonner]] – rekkefølgen i kolonnelista er rekkefølgen i indeksen. */
export const INDEXES = [
  // Fremmednøkler (19)
  ['fh_transactions', ['category_id']],
  ['fh_transactions', ['account_id']],
  ['fh_receipts', ['transaction_id']],
  ['fh_receipts', ['account_id']],
  ['fh_receipts', ['category_id']],
  ['fh_recurring', ['account_id']],
  ['fh_recurring', ['category_id']],
  ['fh_rules', ['category_id']],
  ['fh_subscriptions', ['tx_id']],
  ['fh_folder_members', ['folder_id', 'user_id']], // «WHERE folder_id=? AND user_id=?» (tilgang til bolig)
  ['fh_folder_entries', ['receipt_id']],
  ['fh_folder_entries', ['tx_id']],
  ['fh_folder_entries', ['folder_id']],
  ['fh_folder_projects', ['folder_id']],
  ['fh_project_installments', ['entry_id']],
  ['fh_project_installments', ['project_id']],
  ['fh_folder_bills', ['folder_id']],
  ['fh_finn', ['tx_id']],
  ['fh_finn_files', ['finn_id']],
  // Bruker-/eierkolonner
  ['sessions', ['user']],
  ['devices', ['user']],
  ['receipts', ['user']],
  ['grades', ['user']],
  ['tests', ['user']],
  ['fh_tokens', ['user_id']],
  ['fh_folders', ['owner_id']],
  ['fh_folder_members', ['user_id']],
  ['fh_tx_history40', ['user_id']],
  ['subscription_members', ['user_id']],
  ['fh_folder_entry_history', ['user_id']],
  ['hl_chat_folders', ['user_id']],
  ['birthday_photos', ['user_id']],
  ['hl_chat_files', ['user_id']],
  ['skj_files', ['user_id']],
  ['quality64_runs', ['user_id']],
  ['dish_link', ['user_id']],
  ['mat_file', ['user_id']],
  ['mat_scan_job', ['user_id']],
  ['family_event', ['user']],
  ['fh_refresh44', ['user_id']],
  ['hl_task_lists', ['owner']],
  ['huske_ha_map', ['user_id']],
  ['flag_overrides51', ['user']],
  ['crash51', ['user']],
  ['glimt45_confirm', ['user_id']],
  ['fh_app_codes', ['user_id']],
  ['fin51_goal_moves', ['user_id']],
  ['mail44_outbox', ['user_id']],
  ['plays44', ['user']],
  ['sec51_approvals', ['user']],
  ['onboard51_invites', ['user_id']],
];

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** Lager manglende indekser. → navnene på indeksene som ble laget nå. */
export function ensureIndexes(d = db, list = INDEXES) {
  const made = [];
  for (const [table, cols] of list) {
    const t = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").pluck().get(table);
    if (!t || /^\s*CREATE\s+VIRTUAL/i.test(t)) continue;
    const have = new Set(d.prepare(`PRAGMA table_info(${ident(table)})`).all().map((c) => c.name));
    if (!cols.every((c) => have.has(c))) continue;
    // Finnes det en indeks (eller primærnøkkel) som allerede begynner med disse kolonnene, trengs ingen ny.
    const covered = d.prepare(`PRAGMA index_list(${ident(table)})`).all().some((ix) => {
      const ic = d.prepare(`PRAGMA index_info(${ident(ix.name)})`).all().sort((a, b) => a.seqno - b.seqno).map((x) => x.name);
      return cols.every((c, i) => ic[i] === c);
    });
    if (covered) continue;
    const name = `ix_${table}_${cols.join('_')}`;
    d.exec(`CREATE INDEX IF NOT EXISTS ${ident(name)} ON ${ident(table)}(${cols.map(ident).join(', ')})`);
    made.push(name);
  }
  return made;
}
