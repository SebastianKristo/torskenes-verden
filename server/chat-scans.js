// Prompt 34 (SERVER34): Chat-mappen «Kvitteringer og skanninger». Alt AI gjør med skanning (kvitteringer, pakkelapper/strekkoder,
// Finn-e-poster, kategorisering etter bankimport) blir egne samtaler i en fast systemmappe per bruker, øverst under MAPPER.
//
// Datamodell: hl_chat_folders.sys = 1 (id 'scan:<bruker>', navn «Kvitteringer og skanninger», lukket som standard, kan ikke
// slettes eller få nytt navn). hl_chats.kind = 'receipt'|'label'|'categorize'|'finn', hl_chats.ref = JSON {receiptId|trackingId|importId}.
// Slettes en samtale, slettes ikke bilaget.
//
// GET /api/chat/chats → folders[0] = {id:'scan:<u>', name:'Kvitteringer og skanninger', open:false, sys:true, kind:'scan', icon:'receipt',
//                       color:'#b23a2a', count, review, label:'12 · 2 til godkjenning', chats:[{…brief, kind, ref, status}]}
// POST /api/chat/system {kind, ref?:{receiptId|trackingId|importId}, title, source?, attachment?:{url, thumb, name, mime},
//                        model?, text?, tools?:[{label, done}], status?:'running'|'done'|'failed'} → {chatId, created}
//   Samme (kind, ref) oppdaterer samtalen. Melding 1 (bruker/system): kilden + vedlegget. Melding 2 (modell): svaret, verktøy-chips
//   (meta.tools) og status (meta.status), modellnavnet i meta.model.
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { broadcast } from './realtime.js';

export const SCAN_FOLDER = 'Kvitteringer og skanninger';
export const SCAN_KINDS = ['receipt', 'label', 'categorize', 'finn'];
const q = (sql) => db.prepare(sql);
const has = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
// Tabellene lages i chat.js; her legges bare kolonnene til (aldri slett).
db.exec(`CREATE TABLE IF NOT EXISTS hl_chat_folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hl_chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Ny samtale', model TEXT, pinned INTEGER NOT NULL DEFAULT 0,
  folder_id TEXT, settings TEXT NOT NULL DEFAULT '{}', messages TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL, share_token TEXT);`);
if (!has('hl_chat_folders', 'sys')) db.exec('ALTER TABLE hl_chat_folders ADD COLUMN sys INTEGER NOT NULL DEFAULT 0');
if (!has('hl_chats', 'kind')) db.exec('ALTER TABLE hl_chats ADD COLUMN kind TEXT');
if (!has('hl_chats', 'ref')) db.exec('ALTER TABLE hl_chats ADD COLUMN ref TEXT');
db.exec('CREATE INDEX IF NOT EXISTS hl_chats_kind_ref ON hl_chats(user_id, kind, ref)');

export const scanFolderId = (u) => `scan:${u}`;
/** Lager systemmappen for brukeren én gang (lukket som standard). → mappe-id */
export function ensureScanFolder(u) {
  const id = scanFolderId(u);
  if (!q('SELECT 1 FROM hl_chat_folders WHERE id=?').get(id)) q('INSERT INTO hl_chat_folders(id,user_id,name,open,created,sys) VALUES(?,?,?,0,?,1)').run(id, u, SCAN_FOLDER, 0); // created 0 = øverst
  return id;
}
export const isSysFolder = (id) => !!q('SELECT sys FROM hl_chat_folders WHERE id=?').get(String(id ?? ''))?.sys;
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const refKey = (ref) => JSON.stringify(ref && typeof ref === 'object' ? Object.fromEntries(Object.entries(ref).filter(([k, v]) => ['receiptId', 'trackingId', 'importId', 'finnId'].includes(k) && v != null).map(([k, v]) => [k, String(v).slice(0, 80)])) : {});
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').slice(0, max);

/**
 * Lager eller oppdaterer skann-samtalen for (kind, ref). Se toppen av fila. → {chatId, created}
 */
export function upsertScanChat(u, { kind, ref = null, title, source = null, attachment = null, model = null, text = null, tools = null, status = 'running' } = {}) {
  if (!SCAN_KINDS.includes(kind)) throw Object.assign(new Error(`kind må være ${SCAN_KINDS.join(', ')}`), { status: 400 });
  const folder = ensureScanFolder(u);
  const rk = refKey(ref), now = Date.now();
  const row = rk !== '{}' ? q('SELECT * FROM hl_chats WHERE user_id=? AND kind=? AND ref=?').get(u, kind, rk) : null;
  const msgs = row ? parse(row.messages, []) : [];
  const first = msgs[0] ?? { role: 'user', content: '', ts: now };
  if (source || !first.content) first.content = clean(source || { receipt: 'Kvittering skannet', label: 'Pakkelapp skannet', categorize: 'Automatisk kategorisering etter bankimport', finn: 'Finn-e-post' }[kind], 300);
  if (attachment && typeof attachment === 'object') first.files = [{ name: clean(attachment.name || 'vedlegg', 120), ...(attachment.url ? { url: clean(attachment.url, 300) } : {}), ...(attachment.thumb ? { thumb: clean(attachment.thumb, 300) } : {}), ...(attachment.mime ? { mime: clean(attachment.mime, 80) } : {}), kind }];
  first.meta = { ...(first.meta ?? {}), system: true };
  const second = msgs[1] ?? { role: 'assistant', content: '', ts: now };
  if (text !== null && text !== undefined) second.content = clean(text, 4000);
  else if (!second.content) second.content = status === 'running' ? 'Leser …' : '';
  second.meta = { ...(second.meta ?? {}), ...(model ? { model: clean(model, 80) } : {}), ...(Array.isArray(tools) ? { tools: tools.slice(0, 12).map((t) => ({ label: clean(t?.label ?? t, 80), done: t?.done !== false })) } : {}), status: ['running', 'done', 'failed'].includes(status) ? status : 'done', ...(ref ? { ref: parse(rk, {}) } : {}) };
  second.ts = second.ts ?? now;
  const next = [first, second, ...msgs.slice(2)];
  const t = clean(title || row?.title || 'Skanning', 120);
  if (row) {
    q('UPDATE hl_chats SET title=?, model=COALESCE(?, model), messages=?, updated=? WHERE id=?').run(t, model, JSON.stringify(next), now, row.id);
    try { broadcast('chat-scan', { chatId: row.id, kind, status, title: t }, [u]); } catch { /* */ }
    return { chatId: row.id, created: false };
  }
  const id = randomUUID();
  q('INSERT INTO hl_chats(id,user_id,title,model,folder_id,settings,messages,created,updated,kind,ref) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, u, t, model ?? 'glimt', folder, '{}', JSON.stringify(next), now, now, kind, rk);
  try { broadcast('chat-scan', { chatId: id, kind, status, title: t }, [u]); } catch { /* */ }
  return { chatId: id, created: true };
}
export const scanChatFor = (u, kind, ref) => q('SELECT id FROM hl_chats WHERE user_id=? AND kind=? AND ref=?').pluck().get(u, kind, refKey(ref)) ?? null;

/** Ekstra felt for mappen i chatList: antall og «· N til godkjenning». */
export function scanFolderInfo(u, chats) {
  let review = 0;
  try { review = q("SELECT count(*) FROM fh_receipts WHERE user_id=? AND status IN ('needs_review')").pluck().get(u) ?? 0; } catch { review = 0; }
  const count = chats.length;
  return { sys: true, kind: 'scan', icon: 'receipt', color: '#b23a2a', count, review, label: `${count}${review ? ` · ${review} til godkjenning` : ''}` };
}
