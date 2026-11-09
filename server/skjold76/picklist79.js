// Prompt 79 (PICKSRV): Plukkliste per bruker («ta flere deler, vis alle med LED, ta ut av lager»).
// Lagres i kv (skjold79_picklist) slik at lista synkes mellom enheter. Klientene holder også en lokal kopi.
//
// Ruter (under /api/skjold):
//   GET  /picklist → {items:[{partId, qty, take, addedAt}], updatedAt}   (slettede deler filtreres bort; take = qty, alias for Android)
//   PUT  /picklist {items:[{partId, qty?|take?}]} → samme  (maks 200, qty 1–9999, standard 1, rekkefølgen bevares, samme del én gang)
//   POST /picklist/take {items?:[{partId, qty}]} → {ok, parts:[{partId, name, before, after, low}], undo:[{partId, set}], skipped?}
//        uten items: hele den lagrede lista. Trekker fra (aldri under 0) med historikk. Tømmer ikke lista.
//   POST /picklist/undo {undo:[{partId, set}]} → {ok, parts:[…]}
import { kv } from '../db.js';
import { partRow76, updatePart76, addHistory76 } from './store.js';

const NS = { 'Cache-Control': 'no-store' };
const KEY = 'skjold79_picklist';
export const MAX_PICK79 = 200;
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
const posInt = (v, lo, hi) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const iso = (ms) => new Date(ms).toISOString();

const raw = (user) => { const v = kv.get(user, KEY, null); return v && Array.isArray(v.items) ? v : { items: [], updatedAt: null }; };
export function picklist79(user) {
  const v = raw(user);
  const items = v.items.filter((x) => partRow76(user, x.partId)).map((x) => ({ partId: x.partId, qty: x.qty, take: x.qty, addedAt: x.addedAt ?? null }));
  return { items, updatedAt: v.updatedAt };
}
/** Body-items → [{partId, qty}] | {error}. */
function parseItems(list) {
  if (!Array.isArray(list)) return { error: 'items må være en liste' };
  if (list.length > MAX_PICK79) return { error: `Maks ${MAX_PICK79} deler i plukklista` };
  const out = [], seen = new Set();
  for (const it of list) {
    const pid = posInt(typeof it === 'object' && it ? it.partId ?? it.id : it, 1, Number.MAX_SAFE_INTEGER);
    if (pid == null) return { error: 'Hver linje må ha partId' };
    const q0 = typeof it === 'object' && it ? it.qty ?? it.take : null;
    const qty = q0 == null || q0 === '' ? 1 : posInt(q0, 1, 9999);
    if (qty == null) return { error: 'qty må være et heltall 1–9999' };
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({ partId: pid, qty });
  }
  return { items: out };
}
const partOut = (r, before) => ({ partId: r.id, name: r.name, before, after: r.qty, unit: r.unit ?? null, low: r.min_qty != null && r.qty <= r.min_qty });

export function mountPicklist79(app) {
  app.get('/picklist', (c) => c.json(picklist79(c.get('user')), 200, NS));
  app.put('/picklist', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!b) return c.json({ error: 'Forventet {items:[{partId, qty}]}' }, 400);
    const p = parseItems(b.items ?? b.picklist);
    if (p.error) return c.json({ error: p.error }, 400);
    const prev = new Map(raw(u).items.map((x) => [x.partId, x.addedAt]));
    const t = Date.now();
    // Ukjente/andres deler lagres ikke.
    const items = p.items.filter((x) => partRow76(u, x.partId)).map((x) => ({ ...x, addedAt: prev.get(x.partId) ?? iso(t) }));
    kv.set(u, KEY, { items, updatedAt: iso(t) });
    return c.json(picklist79(u), 200, NS);
  });
  app.post('/picklist/take', async (c) => {
    const u = c.get('user'), b = (await body(c)) ?? {};
    const p = b.items == null ? { items: raw(u).items } : parseItems(b.items);
    if (p.error) return c.json({ error: p.error }, 400);
    if (!p.items.length) return c.json({ error: 'Plukklista er tom' }, 400);
    const parts = [], undo = [], skipped = [];
    for (const it of p.items) {
      const cur = partRow76(u, it.partId);
      if (!cur) { skipped.push({ partId: it.partId, reason: 'Fant ikke delen' }); continue; }
      const next = Math.round(Math.max(0, cur.qty - it.qty) * 1000) / 1000;
      const row = updatePart76(u, cur.id, { qty: next });
      if (next !== cur.qty) addHistory76(u, cur.id, 'antall', { qty: cur.qty }, { qty: next });
      parts.push(partOut(row, cur.qty));
      undo.push({ partId: cur.id, set: cur.qty });
    }
    return c.json({ ok: true, parts, undo, ...(skipped.length ? { skipped } : {}) });
  });
  app.post('/picklist/undo', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!b || !Array.isArray(b.undo) || b.undo.length > MAX_PICK79) return c.json({ error: 'Forventet {undo:[{partId, set}]}' }, 400);
    const parts = [];
    for (const x of b.undo) {
      const cur = partRow76(u, x?.partId);
      const set = typeof x?.set === 'number' && Number.isFinite(x.set) && x.set >= 0 ? x.set : null;
      if (!cur || set == null) continue;
      const row = updatePart76(u, cur.id, { qty: set });
      if (set !== cur.qty) addHistory76(u, cur.id, 'antall', { qty: cur.qty }, { qty: set });
      parts.push(partOut(row, cur.qty));
    }
    return c.json({ ok: true, parts });
  });
}
