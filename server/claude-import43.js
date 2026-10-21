// Prompt 43 (SERVER43): importer samtaler og minne fra en Claude-eksport (claude-code-chat-claude-import.md, Claude Import.dc.html).
// Fila leses på serveren (ZIP med conversations.json, projects.json og ev. minne, eller conversations.json alene), holdes bare i
// minnet til importen er ferdig (lagres aldri på disk) og sendes ingen steder. Sesjon eller app-token (skriving krever finance:write).
//
//   POST /api/chat/import/claude            multipart {file: .zip | conversations.json, memory?: tekst} eller JSON {conversations?, memory?, sample?:true}
//        (?sample=1 = «Prøv med en eksempel-eksport») → forhåndsvisning
//        {importId, conversations, messages, projects, memory:[{id, text, exists, selected}], range:{from, to, text}, projectNames:[…],
//         items:[{id, title, date, dateText, updatedAt, messages, project, imported, selected}], importedBefore, steps:[{t, ms}], files:[navn], expiresAt}
//   GET  /api/chat/import/claude/:importId?offset=0&limit=60&q= → {items, total, offset, limit}   (60 om gangen, søk i titler)
//   POST /api/chat/import/claude/:importId/commit {conversationIds?:[uuid], memory?:[tekst | id], importConversations?, importMemory?, skipExisting?}
//        → {ok, conversations, memory, skipped, folderId, folder:'Claude', text, detail}
//        Samtaler: mappen «Claude» i Chat, id «cl_<uuid>», human → user, assistant → assistant, vedlegg som tekst. Minne: /api/ai/memory (src «Claude»).
//   POST /api/chat/import/claude/:importId/undo → {ok, removedConversations, removedMemory}
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { unzip } from './finans/xlsx.js';
import { addMemory43, removeMemory43, splitMemory43 } from './ai-memory43.js';

const q = (sql) => db.prepare(sql);
const MAX_BYTES = 200 * 1024 * 1024;
const TTL = 60 * 60_000;
const imports = new Map(); // importId → {user, at, convs, projects, memory, files}
const sweep = () => { const t = Date.now(); for (const [k, v] of imports) if (t - v.at > TTL) imports.delete(k); };
const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const dText = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(+d)) return ''; const p = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); return `${+p.slice(8, 10)}. ${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`; };
const bad = (c, error, status = 400) => c.json({ error }, status);
class ImportError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

/** Tekst i en Claude-melding: text, ellers content[].type=='text'. Vedlegg (extracted_content) og filer som tekst. */
export function messageText43(m) {
  let t = typeof m?.text === 'string' && m.text.trim() ? m.text : '';
  if (!t && Array.isArray(m?.content)) t = m.content.filter((x) => x?.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n\n');
  const att = (m?.attachments ?? []).filter((a) => a?.extracted_content || a?.file_name).map((a) => `[Vedlegg: ${a.file_name ?? 'fil'}]${a.extracted_content ? `\n${String(a.extracted_content).slice(0, 20_000)}` : ''}`);
  const files = (m?.files ?? []).filter((f) => f?.file_name && !(m.attachments ?? []).some((a) => a.file_name === f.file_name)).map((f) => `[Fil: ${f.file_name}]`);
  return [t, ...att, ...files].filter(Boolean).join('\n\n').slice(0, 200_000);
}
/** Minne fra eksporten: tekst, liste med tekster eller objekter (conversations_memory, project_memories, content/text/memory). */
export function memoryFrom43(v) {
  if (v == null) return [];
  if (typeof v === 'string') return splitMemory43(v);
  if (Array.isArray(v)) return v.flatMap(memoryFrom43);
  if (typeof v === 'object') {
    const keys = ['conversations_memory', 'memory', 'content', 'text', 'summary'];
    const own = keys.flatMap((k) => (typeof v[k] === 'string' ? splitMemory43(v[k]) : []));
    const proj = v.project_memories && typeof v.project_memories === 'object' ? Object.values(v.project_memories).flatMap(memoryFrom43) : [];
    return [...own, ...proj];
  }
  return [];
}
const parseJson = (s, what) => { try { return JSON.parse(s); } catch { throw new ImportError(`${what} er ikke gyldig JSON`); } };
/** Leser en eksport (Buffer). → {convs, projects, memory, files, steps} */
export function readExport43(buf, name = '') {
  const steps = [];
  let t0 = Date.now();
  let files = new Map();
  const isZip = buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (isZip || /\.zip$/i.test(name)) {
    try { files = unzip(buf, (n) => /(^|\/)(conversations|projects|users|memories?|memory)[^/]*\.(json|md|txt)$/i.test(n)); }
    catch (e) { throw new ImportError(/for stort/.test(e.message) ? 'En fil i eksporten er for stor (over 100 MB utpakket)' : 'Fila er ikke en gyldig ZIP'); }
    steps.push({ t: `Pakket ut ${files.size} ${files.size === 1 ? 'fil' : 'filer'}`, ms: Date.now() - t0 });
  } else {
    const s = buf.toString('utf8').replace(/^﻿/, '').trim();
    if (!s.startsWith('[') && !s.startsWith('{')) throw new ImportError('Fila er ikke en gyldig ZIP');
    files.set(name || 'conversations.json', s);
  }
  t0 = Date.now();
  const find = (re) => [...files.entries()].find(([n]) => re.test(n.split('/').pop()));
  const conv = find(/^conversations[^/]*\.json$/i) ?? (!isZip && files.size === 1 ? [...files.entries()][0] : null);
  if (!conv) throw new ImportError('Fant ikke conversations.json i eksporten');
  let list = parseJson(conv[1], 'conversations.json');
  if (!Array.isArray(list)) list = Array.isArray(list?.conversations) ? list.conversations : null;
  if (!list) throw new ImportError('Fant ikke conversations.json i eksporten');
  const convs = list.filter((x) => x && typeof x === 'object').map((x) => {
    const msgs = (Array.isArray(x.chat_messages) ? x.chat_messages : Array.isArray(x.messages) ? x.messages : []).map((m) => ({ role: m.sender === 'human' || m.role === 'user' || m.sender === 'user' ? 'user' : 'assistant', content: messageText43(m), ts: Date.parse(m.created_at ?? '') || null })).filter((m) => m.content);
    return { uuid: String(x.uuid ?? x.id ?? randomUUID()).replace(/[^\w-]/g, '').slice(0, 80), name: String(x.name ?? x.title ?? '').trim().slice(0, 200) || (msgs[0]?.content.slice(0, 60) ?? 'Samtale fra Claude'),
      created: x.created_at ?? null, updated: x.updated_at ?? x.created_at ?? null, project: x.project?.name ?? x.project_name ?? null, projectId: x.project_uuid ?? x.project?.uuid ?? null, messages: msgs };
  });
  steps.push({ t: `Fant ${convs.length} ${convs.length === 1 ? 'samtale' : 'samtaler'}`, ms: Date.now() - t0 });
  let projects = [];
  const pj = find(/^projects[^/]*\.json$/i);
  if (pj) { try { const p = JSON.parse(pj[1]); projects = (Array.isArray(p) ? p : []).map((x) => ({ uuid: x.uuid ?? null, name: String(x.name ?? '').slice(0, 120) })).filter((x) => x.name); } catch { projects = []; } }
  const byId = new Map(projects.map((p) => [p.uuid, p.name]));
  for (const cv of convs) if (!cv.project && cv.projectId && byId.has(cv.projectId)) cv.project = byId.get(cv.projectId);
  let memory = [];
  for (const [n, s] of files) if (/^memor(y|ies)[^/]*\.(json|md|txt)$/i.test(n.split('/').pop())) { try { memory.push(...memoryFrom43(/\.json$/i.test(n) ? JSON.parse(s) : s)); } catch { memory.push(...splitMemory43(s)); } }
  if (memory.length) steps.push({ t: `Fant ${memory.length} minnepunkter`, ms: 0 });
  return { convs, projects, memory, files: [...files.keys()], steps };
}
const SAMPLE = () => {
  const d = (n) => new Date(Date.now() - n * 86400_000).toISOString();
  const conv = (uuid, name, n, msgs) => ({ uuid, name, created_at: d(n), updated_at: d(n - 1), chat_messages: msgs.map(([s, t], i) => ({ uuid: `${uuid}-${i}`, sender: s, text: t, created_at: d(n) })) });
  return {
    conversations: [
      conv('3b1f7c1e-0001', 'Docker compose for Sonarr og qBittorrent', 40, [['human', 'Hvordan setter jeg opp hardlinks mellom qBittorrent og Sonarr?'], ['assistant', 'Bruk samme /data-mappe i alle containerne: /srv/data:/data. Da blir flyttingen et hardlink, ikke en kopi.']]),
      conv('3b1f7c1e-0002', 'Eksamensplan statistikk', 25, [['human', 'Lag en leseplan for STK1000 de neste tre ukene.'], ['assistant', 'Uke 1: sannsynlighet og fordelinger. Uke 2: estimering og konfidensintervaller. Uke 3: hypotesetester og gamle eksamener.']]),
      conv('3b1f7c1e-0003', 'Middagsforslag uten gluten', 9, [['human', 'Fem middager uten gluten som tar under 30 minutter?'], ['assistant', 'Kyllingwok med ris, laks med potet og brokkoli, tacoskåler, omelett med grønnsaker og risnudler med reker.']]),
    ],
    memory: 'Studerer statistikk ved UiO\nKjører homelab med Docker på en Unraid-server\nFrokost uten gluten',
  };
};

/** Forhåndsvisning (lagres i minnet i 1 time). */
function preview(u, parsed, memText) {
  sweep();
  const importId = randomBytes(12).toString('base64url');
  const have = new Set(q("SELECT id FROM hl_chats WHERE user_id=? AND id LIKE 'cl_%'").pluck().all(u));
  const memAll = [...parsed.memory, ...splitMemory43(memText ?? '')];
  const seen = new Set(), memory = [];
  const existing = new Set(q('SELECT lower(text) FROM ai_memory43 WHERE user_id=?').pluck().all(u).map((s) => s.replace(/\s+/g, ' ').trim()));
  for (const t of memAll) { const k = t.toLowerCase().replace(/\s+/g, ' ').trim(); if (seen.has(k)) continue; seen.add(k); const ex = existing.has(k); memory.push({ id: `m${memory.length + 1}`, text: t, exists: ex, selected: !ex }); }
  const convs = parsed.convs.sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
  const dates = convs.flatMap((x) => [x.created, x.updated]).filter(Boolean).sort();
  const projectNames = [...new Set([...parsed.projects.map((p) => p.name), ...convs.map((x) => x.project).filter(Boolean)])];
  imports.set(importId, { user: u, at: Date.now(), convs, projects: parsed.projects, memory, files: parsed.files, done: null });
  const items = convs.map((x) => itemOut(x, have));
  const importedBefore = items.filter((x) => x.imported).length;
  const range = dates.length ? { from: dates[0], to: dates[dates.length - 1], text: `Fra ${dText(dates[0])} til ${dText(dates[dates.length - 1])}${projectNames.length ? ` · prosjekter: ${projectNames.slice(0, 6).join(', ')}` : ''}` } : { from: null, to: null, text: '' };
  return { importId, conversations: convs.length, messages: convs.reduce((a, x) => a + x.messages.length, 0), projects: projectNames.length, projectNames, memory, range, items: items.slice(0, 60), total: items.length,
    importedBefore, selected: items.filter((x) => x.selected).length, steps: parsed.steps, files: parsed.files, expiresAt: new Date(Date.now() + TTL).toISOString(),
    button: `Importer ${items.filter((x) => x.selected).length} samtaler og ${memory.filter((m) => m.selected).length} minnepunkter` };
}
const itemOut = (x, have) => { const imported = have.has(`cl_${x.uuid}`); return { id: x.uuid, title: x.name, date: x.updated ?? x.created, dateText: dText(x.updated ?? x.created), updatedAt: x.updated, messages: x.messages.length, project: x.project ?? null, imported, importedLabel: imported ? 'Importert før' : null, selected: !imported }; };
function folderOf(u) {
  const f = q("SELECT id FROM hl_chat_folders WHERE user_id=? AND name='Claude' ORDER BY created LIMIT 1").pluck().get(u);
  if (f) return f;
  const id = randomUUID();
  q('INSERT INTO hl_chat_folders(id,user_id,name,open,created) VALUES(?,?,?,1,?)').run(id, u, 'Claude', Date.now());
  return id;
}

export const claudeImport43Api = new Hono();
claudeImport43Api.use('*', authOrToken);
claudeImport43Api.post('/claude', bodyLimit({ maxSize: MAX_BYTES, onError: (c) => bad(c, 'Fila kan være maks 200 MB', 413) }), async (c) => {
  const u = c.get('user'), ct = c.req.header('content-type') ?? '';
  try {
    let parsed = null, memText = '';
    if (c.req.query('sample') === '1') { const s = SAMPLE(); parsed = readExport43(Buffer.from(JSON.stringify(s.conversations)), 'conversations.json'); memText = s.memory; }
    else if (ct.startsWith('multipart/')) {
      const b = await c.req.parseBody();
      memText = typeof b.memory === 'string' ? b.memory : '';
      const f = b.file ?? b.zip ?? b.export;
      if (f && typeof f === 'object' && typeof f.arrayBuffer === 'function') {
        if (f.size > MAX_BYTES) return bad(c, 'Fila kan være maks 200 MB', 413);
        parsed = readExport43(Buffer.from(await f.arrayBuffer()), f.name ?? '');
      }
    } else if (ct.includes('json')) {
      const b = await c.req.json().catch(() => null);
      if (!b || typeof b !== 'object') return bad(c, 'Forventet JSON eller en fil');
      if (b.sample) { const s = SAMPLE(); parsed = readExport43(Buffer.from(JSON.stringify(s.conversations)), 'conversations.json'); memText = s.memory; }
      else {
        memText = typeof b.memory === 'string' ? b.memory : Array.isArray(b.memory) ? b.memory.join('\n') : '';
        if (b.conversations != null) parsed = readExport43(Buffer.from(JSON.stringify(b.conversations)), 'conversations.json');
      }
    } else if (ct.includes('zip') || ct.includes('octet-stream')) parsed = readExport43(Buffer.from(await c.req.arrayBuffer()), 'eksport.zip');
    if (!parsed && !memText.trim()) return bad(c, 'Velg en .zip eller conversations.json, eller lim inn minnet');
    parsed ??= { convs: [], projects: [], memory: [], files: [], steps: [] };
    return c.json(preview(u, parsed, memText));
  } catch (e) { return bad(c, e instanceof ImportError ? e.message : `Kunne ikke lese eksporten: ${e.message}`, e.status ?? 400); }
});
const own = (c) => { sweep(); const x = imports.get(c.req.param('importId')); return x && x.user === c.get('user') ? x : null; };
claudeImport43Api.get('/claude/:importId', (c) => {
  const x = own(c);
  if (!x) return c.json({ error: 'Importen er utløpt. Velg fila på nytt.' }, 404);
  const have = new Set(q("SELECT id FROM hl_chats WHERE user_id=? AND id LIKE 'cl_%'").pluck().all(c.get('user')));
  const t = String(c.req.query('q') ?? '').toLowerCase().trim();
  const all = x.convs.filter((cv) => !t || cv.name.toLowerCase().includes(t)).map((cv) => itemOut(cv, have));
  const offset = Math.max(0, +c.req.query('offset') || 0), limit = Math.min(500, Math.max(1, +c.req.query('limit') || 60));
  return c.json({ items: all.slice(offset, offset + limit), total: all.length, offset, limit, memory: x.memory });
});
claudeImport43Api.post('/claude/:importId/commit', async (c) => {
  const u = c.get('user'), x = own(c);
  if (!x) return c.json({ error: 'Importen er utløpt. Velg fila på nytt.' }, 404);
  if (x.done) return c.json({ error: 'Importen er allerede gjort', ...x.done }, 409);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const skipExisting = b.skipExisting !== false;
  const wantC = b.importConversations !== false;
  const ids = Array.isArray(b.conversationIds) ? new Set(b.conversationIds.map(String)) : null;
  const created = [];
  let skipped = 0;
  let folderId = null;
  if (wantC) {
    const pick = x.convs.filter((cv) => (ids ? ids.has(cv.uuid) : true));
    if (pick.length) folderId = folderOf(u);
    const ins = q('INSERT INTO hl_chats(id,user_id,title,model,settings,messages,created,updated,folder_id) VALUES(?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const cv of pick) {
        const id = `cl_${cv.uuid}`;
        const row = q('SELECT user_id FROM hl_chats WHERE id=?').get(id);
        if (row) { if (skipExisting || row.user_id !== u) { skipped++; continue; } q('DELETE FROM hl_chats WHERE id=? AND user_id=?').run(id, u); }
        const created0 = Date.parse(cv.created ?? '') || Date.now(), updated = Date.parse(cv.updated ?? '') || created0;
        ins.run(id, u, cv.name.slice(0, 200), 'auto', JSON.stringify({ importedFrom: 'claude' }), JSON.stringify(cv.messages.map((m) => ({ role: m.role, content: m.content, ...(m.ts ? { ts: m.ts } : {}) }))), created0, updated, folderId);
        created.push(id);
      }
    })();
  }
  let mem = { added: [], skipped: 0 };
  if (b.importMemory !== false) {
    const want = Array.isArray(b.memory) ? b.memory.map((m) => (typeof m === 'string' && /^m\d+$/.test(m) ? x.memory.find((y) => y.id === m)?.text : typeof m === 'string' ? m : m?.text)).filter(Boolean) : x.memory.filter((m) => m.selected).map((m) => m.text);
    mem = addMemory43(u, want, 'Claude');
  }
  const done = { conversations: created.length, memory: mem.added.length, skipped, folderId, folder: 'Claude' };
  x.done = done;
  x.chatIds = created; x.memoryIds = mem.added.map((m) => m.id);
  // Personvern: eksporten slettes fra minnet; bare det som trengs for «Angre importen» blir igjen.
  x.convs = []; x.memory = [];
  const log = kv.get(u, 'claude43_imports', []) ?? [];
  kv.set(u, 'claude43_imports', [...log.slice(-19), { importId: c.req.param('importId'), at: new Date().toISOString(), chatIds: created, memoryIds: x.memoryIds }]);
  const parts = [`${created.length} ${created.length === 1 ? 'samtale' : 'samtaler'}`, `${mem.added.length} minnepunkter`];
  return c.json({ ok: true, ...done, text: `✓ ${parts.join(' og ')} importert`,
    detail: `Samtalene ligger i mappen «Claude» i Chat. Minnet ligger under Chat → ⚙ → Minne.${skipped ? ` ${skipped} var importert før og ble hoppet over.` : ''}` });
});
claudeImport43Api.post('/claude/:importId/undo', (c) => {
  const u = c.get('user'), id = c.req.param('importId');
  const x = own(c);
  const log = kv.get(u, 'claude43_imports', []) ?? [];
  const rec = x?.done ? { chatIds: x.chatIds, memoryIds: x.memoryIds } : log.find((r) => r.importId === id);
  if (!rec) return c.json({ error: 'Fant ikke importen' }, 404);
  let removedConversations = 0;
  for (const cid of rec.chatIds ?? []) removedConversations += q('DELETE FROM hl_chats WHERE id=? AND user_id=?').run(cid, u).changes;
  const removedMemory = removeMemory43(u, rec.memoryIds ?? []);
  kv.set(u, 'claude43_imports', log.filter((r) => r.importId !== id));
  if (x) { x.done = null; x.chatIds = []; x.memoryIds = []; imports.delete(id); }
  return c.json({ ok: true, removedConversations, removedMemory, text: `Fjernet ${removedConversations} samtaler og ${removedMemory} minnepunkter` });
});
