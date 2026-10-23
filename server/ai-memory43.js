// Prompt 43 (SERVER43): AI-minne per bruker («Chat → ⚙ → Minne»), fylles bl.a. fra Claude-importen (src:'Claude').
// Brukes av Chat (systemprompten, se chat.js) og Glimt. Sesjon eller app-token (skriving krever finance:write).
//
//   GET    /api/ai/memory                  → {items:[{id, text, src, created, updated}], count}
//   POST   /api/ai/memory {text | items:[text], src?} → {added:[item], skipped:N, items:[…]}  (duplikater: samme tekst uten store/små bokstaver)
//   PATCH  /api/ai/memory/:id {text}       → {item}
//   DELETE /api/ai/memory/:id              → {ok}
import { Hono } from 'hono';
import { db } from './db.js';
import { authOrToken } from './mobile.js';
import { areasOf46 } from './claude-memory46.js'; // prompt 46 (SERVER46)

db.exec(`CREATE TABLE IF NOT EXISTS ai_memory43 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, text TEXT NOT NULL, src TEXT NOT NULL DEFAULT 'Chat',
  created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_memory43_user ON ai_memory43(user_id);`);
const q = (sql) => db.prepare(sql);
const MAX = 500, MAX_LEN = 1000;
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
const out = (r) => ({ id: r.id, text: r.text, src: r.src, created: new Date(r.created).toISOString(), updated: new Date(r.updated).toISOString() });

export const memoryOf43 = (u) => q('SELECT * FROM ai_memory43 WHERE user_id=? ORDER BY id').all(u).map(out);
/** Legger til punkter uten duplikater. → {added:[item], skipped} */
export function addMemory43(u, texts, src = 'Chat') {
  const have = new Set(q('SELECT text FROM ai_memory43 WHERE user_id=?').pluck().all(u).map(norm));
  let n = q('SELECT count(*) FROM ai_memory43 WHERE user_id=?').pluck().get(u);
  const added = [];
  let skipped = 0;
  const ins = q('INSERT INTO ai_memory43(user_id, text, src, created, updated) VALUES(?,?,?,?,?) RETURNING *');
  for (const t0 of texts) {
    const t = clean(t0);
    if (!t) continue;
    if (have.has(norm(t)) || n >= MAX) { skipped++; continue; }
    const now = Date.now();
    added.push(out(ins.get(u, t, String(src).slice(0, 40) || 'Chat', now, now)));
    have.add(norm(t)); n++;
  }
  return { added, skipped };
}
export const removeMemory43 = (u, ids) => { let n = 0; for (const id of ids) n += q('DELETE FROM ai_memory43 WHERE id=? AND user_id=?').run(id, u).changes; return n; };
/** Tekst til systemprompten (Chat/Glimt), eller '' når minnet er tomt. */
export function memoryPrompt43(u, maxChars = 4000) {
  const items = q('SELECT text FROM ai_memory43 WHERE user_id=? ORDER BY id DESC LIMIT 80').pluck().all(u).reverse();
  if (!items.length) return '';
  let s = 'Det du vet om brukeren (minne, bruk når det er relevant):';
  for (const t of items) { if (s.length + t.length > maxChars) break; s += `\n- ${t}`; }
  return s;
}
/** Deler opp innlimt minnetekst: ett punkt per linje (punkttegn og nummerering fjernes). */
export const splitMemory43 = (text) => String(text ?? '').split(/\r?\n/).map(clean).filter((x) => x.length > 1);

export const aiMemory43Api = new Hono();
aiMemory43Api.use('*', authOrToken);
// Prompt 46: ?src=claude-memory filtrerer på kilde (lenken «Se minnene» etter Claude-importen); GET /areas = minneområdene.
aiMemory43Api.get('/', (c) => { const src = c.req.query('src'); const items = memoryOf43(c.get('user')).filter((x) => !src || x.src === src); return c.json({ items, count: items.length, ...(src ? { src } : {}) }); });
aiMemory43Api.get('/areas', (c) => { const areas = areasOf46(c.get('user')); return c.json({ areas, count: areas.length }); });
aiMemory43Api.post('/', async (c) => {
  const b = await c.req.json().catch(() => null);
  const texts = Array.isArray(b?.items) ? b.items.map((x) => (typeof x === 'string' ? x : x?.text)) : typeof b?.text === 'string' ? splitMemory43(b.text) : [];
  if (!texts.length) return c.json({ error: 'Skriv minst ett punkt' }, 400);
  const r = addMemory43(c.get('user'), texts.slice(0, MAX), b.src ?? 'Chat');
  return c.json({ ...r, items: memoryOf43(c.get('user')) }, r.added.length ? 201 : 200);
});
aiMemory43Api.patch('/:id{[0-9]+}', async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null), t = clean(b?.text);
  if (!t) return c.json({ error: 'Teksten kan ikke være tom' }, 400);
  const r = q('UPDATE ai_memory43 SET text=?, updated=? WHERE id=? AND user_id=? RETURNING *').get(t, Date.now(), +c.req.param('id'), u);
  return r ? c.json({ item: out(r) }) : c.json({ error: 'Fant ikke minnepunktet' }, 404);
});
aiMemory43Api.delete('/:id{[0-9]+}', (c) => (removeMemory43(c.get('user'), [+c.req.param('id')]) ? c.json({ ok: true }) : c.json({ error: 'Fant ikke minnepunktet' }, 404)));
