// Prompt 30 (SERVER30): Boliger – del med brukere uten å kunne brukernavnet, og rediger utgifter med historikk.
// claude-code-boliger-kvittering-deling-rediger.md. Rutene ligger i routes.js (de trenger folderFor), hjelperne her.
//   GET  /finans/api/users/shareable?home=<id>   → [{id, name, initial, color, avatarUrl, relation?}]
//        Andre brukere i Homelab som ikke har tilgang til boligen ennå. Aldri e-post, brukernavn eller rolle.
//   POST /finans/api/folders/:id/members {userIds[], role} (eier) – også {userId} som før. Mottakerne får push
//        «<navn> delte <bolig> med deg» (realtime «boliger», action 'shared', med title/body).
//   PATCH /finans/api/folders/:id/entries/:eid {merchant|description, amount, date, category|categoryId, …}
//        Endringer logges i fh_folder_entry_history («endret av»). GET …/entries/:eid/history → [{at, by, changes}].
//   Alias under /api/homes/:id/… i server/index.js (members, shareable, expenses/:eid).
import { db } from './db.js';
import { listUsers } from '../auth.js';

const q = (sql) => db.prepare(sql);

db.exec(`CREATE TABLE IF NOT EXISTS fh_folder_entry_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL, folder_id INTEGER NOT NULL, user_id TEXT, by_name TEXT NOT NULL,
  at INTEGER NOT NULL, changes TEXT NOT NULL DEFAULT '{}')`);
db.exec('CREATE INDEX IF NOT EXISTS fh_folder_entry_history_entry ON fh_folder_entry_history(entry_id, id)');
for (const [col, type] of [['edited_by', 'TEXT'], ['edited_at', 'INTEGER']]) {
  if (!q('PRAGMA table_info(fh_folder_entries)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE fh_folder_entries ADD COLUMN ${col} ${type}`);
}

const COLORS = ['#2b5d8a', '#7a5ad6', '#3f7a6e', '#c0562a', '#b23a2a', '#4a5bbf', '#2f7d4f', '#7a3b6b', '#a8661a', '#1f6f78'];
export const colorFor = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
// Bare navnet brukeren selv har satt; uten navn vises «Bruker» (brukernavnet skal ikke ut).
const safeName = (u) => String(u?.name ?? '').trim() || 'Bruker';

/** Brukere viewer kan dele boligen med: alle andre uten tilgang. relation = «Deler <annen bolig>» når dere deler en. */
export function shareableUsers(viewer, folderId) {
  const members = new Set(q('SELECT user_id FROM fh_folder_members WHERE folder_id=? AND user_id IS NOT NULL').all(folderId).map((r) => r.user_id));
  const shared = q(`SELECT m2.user_id uid, f.name FROM fh_folder_members m1 JOIN fh_folder_members m2 ON m2.folder_id=m1.folder_id JOIN fh_folders f ON f.id=m1.folder_id
    WHERE m1.user_id=? AND m2.user_id IS NOT NULL AND m2.user_id<>? AND f.id<>? ORDER BY f.id`).all(viewer, viewer, folderId);
  const rel = new Map();
  for (const r of shared) if (!rel.has(r.uid)) rel.set(r.uid, `Deler ${r.name}`);
  return listUsers().filter((u) => u.id !== viewer && !members.has(u.id)).map((u) => {
    const name = safeName(u);
    return { id: u.id, name, initial: name.charAt(0).toUpperCase(), color: colorFor(u.id), avatarUrl: u.avatarUrl ?? null, ...(rel.has(u.id) ? { relation: rel.get(u.id) } : {}) };
  });
}

/** Logger en endring på en utgift. changes = {felt: {from, to}}. */
export function logEntryChange(entry, userId, byName, changes) {
  if (!Object.keys(changes).length) return;
  const at = Date.now();
  q('INSERT INTO fh_folder_entry_history(entry_id, folder_id, user_id, by_name, at, changes) VALUES(?,?,?,?,?,?)').run(entry.id, entry.folder_id, userId ?? null, String(byName).slice(0, 60), at, JSON.stringify(changes).slice(0, 4000));
  q('UPDATE fh_folder_entries SET edited_by=?, edited_at=? WHERE id=?').run(String(byName).slice(0, 60), at, entry.id);
}
export function entryHistory(entryId) {
  return q('SELECT * FROM fh_folder_entry_history WHERE entry_id=? ORDER BY id DESC LIMIT 100').all(entryId).map((r) => {
    let changes = {};
    try { changes = JSON.parse(r.changes); } catch { /* ugyldig */ }
    return { at: r.at, by: r.by_name, you: false, userId: r.user_id, changes };
  });
}
