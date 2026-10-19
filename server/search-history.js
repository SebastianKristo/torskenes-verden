// Prompt 32 (SERVER32): søkehistorikk per bruker – mobil logger, web viser «Nylige søk» (claude-code-sokehistorikk-synk.md).
// Montert på /api/search-history. Den eldre /api/search/history (mobile.js, liste med tekster) speiles hit og gir entries[] i GET.
// Sesjon eller app-token, alltid bare innlogget bruker.
//
//   POST   {q, engine?, device?}  engine: 'glimt'|'google'|'ddg'|'snarvei'|'time'|'ai'|… (≤ 20 tegn), device: 'mobil'|'web'
//          (uten device: «mobil» for app-token/mobil-UA, ellers «web»)
//          → 201 {saved:true, item:{id, q, engine, device, createdAt}}
//          → 200 {saved:false, reason:'off'|'sensitive'|'empty'}   (off = Lagre søkehistorikk er av: PUT /api/search/settings {save:false})
//   GET    ?limit=8 (1–50) → {enabled, items:[{id, q, engine, device, createdAt}]}  nyeste først, uten duplikater (store/små
//          bokstaver, siste vinner). enabled:false → items:[] (web skjuler «Nylige søk»).
//   DELETE /:id → {ok:true}   (404 når den ikke finnes / tilhører en annen)
//   DELETE      → {ok:true, deleted:n, items:[{q, engine, device, createdAt}]}  (items kan sendes til /restore for «Angre»)
//   POST   /restore {items:[{q, engine?, device?, createdAt?}]} → {ok:true, restored:n}
// Lagring: tabell search_history(id, user_id, q, engine, device, created_at), indeks (user_id, created_at DESC).
// Beholder 90 dager og maks 200 per bruker. Passord, koder, kortnummer og personnummer lagres aldri.
import { Hono } from 'hono';
import { db } from './db.js';
import { authOrToken, searchSettings, histOf, setHist } from './mobile.js'; // syklisk import: brukes bare inne i funksjoner

db.exec(`CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  q TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'glimt',
  device TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS search_history_user ON search_history(user_id, created_at DESC);`);
const q = (sql) => db.prepare(sql);
const KEEP_MS = 90 * 86400_000, KEEP_N = 200;

/** Ser teksten ut som noe hemmelig? (kortnummer, personnummer, passord/koder) */
export function looksSensitive(text) {
  const t = String(text ?? '');
  if (/\b(?:\d[ -]?){13,19}\b/.test(t)) return true; // kortnummer
  if (/\b[0-3]\d[01]\d{3}[ -]?\d{5}\b/.test(t)) return true; // personnummer (11 siffer)
  if (/passord|password|passwd|pin-?kode|\bpin\b|engangskode|bankid|cvc|cvv|\bkode\s*[:=]?\s*\d{4,}/i.test(t)) return true;
  return false;
}
export const historyEnabled = (user) => searchSettings(user).save !== false;
const out = (r) => ({ id: r.id, q: r.q, engine: r.engine, device: r.device, createdAt: new Date(r.created_at).toISOString() });
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
const engOf = (v) => (typeof v === 'string' && /^[\w.-]{1,20}$/.test(v) ? v.toLowerCase() : 'glimt');
export function deviceOfReq(c, v) {
  if (v === 'mobil' || v === 'web') return v;
  if (/^bearer /i.test(c.req.header('authorization') ?? '')) return 'mobil';
  return /iPhone|iPad|Android|Mobile/i.test(c.req.header('user-agent') ?? '') ? 'mobil' : 'web';
}
function prune(user, now = Date.now()) {
  q('DELETE FROM search_history WHERE user_id=? AND created_at<?').run(user, now - KEEP_MS);
  q('DELETE FROM search_history WHERE user_id=? AND id NOT IN (SELECT id FROM search_history WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ?)').run(user, user, KEEP_N);
}
export function logSearch(user, { qText, engine = 'glimt', device = 'web', at = Date.now() }) {
  const text = clean(qText).slice(0, 300);
  if (!text) return { saved: false, reason: 'empty' };
  if (!historyEnabled(user)) return { saved: false, reason: 'off' };
  if (looksSensitive(text)) return { saved: false, reason: 'sensitive' };
  const r = q('INSERT INTO search_history(user_id, q, engine, device, created_at) VALUES(?,?,?,?,?) RETURNING *').get(user, text, engine, device, at);
  prune(user);
  return { saved: true, item: out(r) };
}
export function recentSearches(user, limit = 8) {
  const seen = new Set(), items = [];
  for (const r of q('SELECT * FROM search_history WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 400').all(user)) {
    const k = r.q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); items.push(out(r));
    if (items.length >= limit) break;
  }
  return items;
}

export const clearSearches = (user) => q('DELETE FROM search_history WHERE user_id=?').run(user).changes;
export const forgetSearch = (user, text) => q('DELETE FROM search_history WHERE user_id=? AND lower(q)=?').run(user, String(text).toLowerCase()).changes;

const api = new Hono();
api.use('*', (c, next) => authOrToken(c, next));
api.get('/', (c) => {
  const user = c.get('user'), enabled = historyEnabled(user);
  const lim = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '8', 10) || 8));
  return c.json({ enabled, items: enabled ? recentSearches(user, lim) : [] });
});
api.post('/', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || typeof b.q !== 'string') return c.json({ error: 'Forventet {q, engine?, device?}' }, 400);
  const r = logSearch(c.get('user'), { qText: b.q, engine: engOf(b.engine), device: deviceOfReq(c, b.device) });
  return c.json(r, r.saved ? 201 : 200);
});
api.post('/restore', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!Array.isArray(b?.items) || b.items.length > KEEP_N) return c.json({ error: 'Forventet {items:[…]}' }, 400);
  const user = c.get('user');
  if (!historyEnabled(user)) return c.json({ ok: true, restored: 0 });
  let n = 0;
  const now = Date.now();
  for (const it of b.items) {
    const at = Date.parse(it?.createdAt);
    const r = logSearch(user, { qText: it?.q, engine: engOf(it?.engine), device: it?.device === 'mobil' ? 'mobil' : 'web', at: Number.isFinite(at) && at <= now && at > now - KEEP_MS ? at : now });
    if (r.saved) n++;
  }
  return c.json({ ok: true, restored: n });
});
api.delete('/:id{[0-9]+}', (c) => {
  const user = c.get('user');
  const row = q('SELECT * FROM search_history WHERE id=? AND user_id=?').get(+c.req.param('id'), user);
  if (!row) return c.json({ error: 'Fant ikke søket' }, 404);
  // Samme søk (uavhengig av store/små bokstaver) forsvinner også fra mobilloggen.
  forgetSearch(user, row.q);
  try { setHist(user, histOf(user).filter((x) => x.toLowerCase() !== row.q.toLowerCase())); } catch { /* */ }
  return c.json({ ok: true });
});
api.delete('/', (c) => {
  const user = c.get('user');
  const items = q('SELECT * FROM search_history WHERE user_id=? ORDER BY created_at DESC').all(user).map(({ q: text, engine, device, created_at }) => ({ q: text, engine, device, createdAt: new Date(created_at).toISOString() }));
  clearSearches(user);
  try { setHist(user, []); } catch { /* */ }
  return c.json({ ok: true, deleted: items.length, items });
});

export default api;
