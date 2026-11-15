// Oversikt: widget-oppsettet (dashbordet) per bruker og enhetsklasse. Montert fra server/system/index.js (mountSystemLate).
//
//   GET  /api/dashboard/layout?device=web   → {device, cols, gap, snap, items:[{id, x, y, w, h, auto, hidden}], v, at, alt?}
//   PUT  /api/dashboard/layout {device:'web', cols, gap, snap, items, v, at?, alt?:{cur:{…samme…}}} → det lagrede
//        Per bruker og enhetsklasse (web | mobile | tablet), kv «dash_layout_<device>». Ugyldige felt avvises (400).
//   DELETE /api/dashboard/layout?device=web → {ok}
import { Hono } from 'hono';
import { kv } from '../db.js';
import { authOrToken } from '../mobile.js';

const api = new Hono();

export const DEVICES = ['web', 'mobile', 'tablet'];
const COLS = [1, 2, 3, 4, 6, 8, 12];
const bad = (message) => Object.assign(new Error(message), { status: 400 });
const int = (v, lo, hi, name) => { if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`${name} må være et heltall ${lo}–${hi}`); return v; };
function cleanRec(b, depth = 0) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Forventet et objekt');
  const cols = b.cols === undefined ? 12 : Number(b.cols);
  if (!COLS.includes(cols)) throw bad(`cols må være ${COLS.join(', ')}`);
  const gap = b.gap === undefined ? 16 : int(b.gap, 0, 64, 'gap');
  if (b.snap !== undefined && typeof b.snap !== 'boolean') throw bad('snap må være true/false');
  if (!Array.isArray(b.items ?? [])) throw bad('items må være en liste');
  const items = (b.items ?? []);
  if (items.length > 80) throw bad('Maks 80 widgets');
  const seen = new Set();
  const out = items.map((x, i) => {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[\w.:-]{1,48}$/.test(x.id)) throw bad(`items[${i}].id er ugyldig`);
    if (seen.has(x.id)) throw bad(`items[${i}].id finnes to ganger`);
    seen.add(x.id);
    const w = int(x.w ?? 1, 1, cols, `items[${i}].w`), xx = int(x.x ?? 0, 0, cols - 1, `items[${i}].x`);
    if (xx + w > cols) throw bad(`items[${i}] går utenfor ${cols} kolonner`);
    return { id: x.id, x: xx, y: int(x.y ?? 0, 0, 999, `items[${i}].y`), w, h: int(x.h ?? 1, 1, 48, `items[${i}].h`), ...(x.auto !== undefined ? { auto: !!x.auto } : {}), hidden: !!x.hidden };
  });
  const rec = { cols, gap, snap: b.snap ?? true, items: out, v: Number.isInteger(b.v) ? b.v : 1, at: Number.isFinite(+b.at) && +b.at > 0 ? Math.round(+b.at) : Date.now() };
  if (b.alt !== undefined && b.alt !== null) {
    if (depth || typeof b.alt !== 'object' || Array.isArray(b.alt)) throw bad('alt må være et objekt');
    rec.alt = {};
    for (const [k, v] of Object.entries(b.alt)) { if (!/^[\w-]{1,16}$/.test(k) || Object.keys(rec.alt).length >= 4) throw bad('Ugyldig nøkkel i alt'); if (v != null) rec.alt[k] = cleanRec(v, 1); }
  }
  return rec;
}
const deviceOf = (v) => (DEVICES.includes(v) ? v : 'web');
const layoutKey = (d) => `dash_layout_${d}`;
export const dashLayoutOf = (u, device = 'web') => kv.get(u, layoutKey(deviceOf(device)), null);

api.get('/dashboard/layout', authOrToken, (c) => {
  const device = deviceOf(c.req.query('device'));
  const r = dashLayoutOf(c.get('user'), device);
  return c.json(r ? { device, ...r } : { device, cols: 12, gap: 16, snap: true, items: [], v: 1, at: null, empty: true });
});
api.put('/dashboard/layout', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => null);
  try {
    const device = deviceOf(b?.device ?? c.req.query('device'));
    const rec = cleanRec(b);
    kv.set(c.get('user'), layoutKey(device), rec);
    return c.json({ device, ...rec });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});
api.delete('/dashboard/layout', authOrToken, (c) => { kv.del(c.get('user'), layoutKey(deviceOf(c.req.query('device')))); return c.json({ ok: true }); });

export default api;
