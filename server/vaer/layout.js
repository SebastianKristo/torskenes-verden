// Rediger Vær (kortene) og skiføre i værappen (prompt 41, claude-code-vaer-rediger-ski-julfigur.md). Sesjon eller app-token.
//   GET/PUT /api/weather/layout {order:[kort], hidden:[kort], ski:true|false, glimt:'top'|'bottom'} – per bruker, mobil og brett.
//   GET /api/weather/full får ski:{text, chip, wax, …, places[]} når det er skiføre og «Skiføre» ikke er slått av (ski41 i week-glimt.js).
//     Selve værsvaret lages i mobile.js; skiMw legger feltet på etter next(), og står før den handleren i server/index.js.
import { Hono } from 'hono';
import { kv } from '../db.js';
import { authOrToken as authOrToken0 } from '../mobile.js';
import { sessionUser } from '../auth/session.js';
import { ski41 } from './week-glimt.js';

const authOrToken = (c, next) => authOrToken0(c, next); // sen binding

/* ---------------- Rediger Vær (vaer_layout) ---------------- */
export const VAER_CARDS = ['na', 'ski', 'timer', 'dager10', 'yrstorm', 'vind', 'mane', 'detaljer', 'glimtuka'];
const layoutOut = (u) => { const l = kv.get(u, 'vaer_layout', {}) ?? {}; return { order: Array.isArray(l.order) ? l.order : VAER_CARDS, hidden: Array.isArray(l.hidden) ? l.hidden : [], ski: l.ski !== false, glimt: l.glimt === 'top' ? 'top' : 'bottom', cards: VAER_CARDS }; };
export const layoutApi = new Hono();
layoutApi.get('/layout', authOrToken, (c) => c.json(layoutOut(c.get('user'))));
layoutApi.put('/layout', authOrToken, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Forventet {order, hidden, ski, glimt}' }, 400);
  const cur = kv.get(u, 'vaer_layout', {}) ?? {};
  const list = (v) => (Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => VAER_CARDS.includes(x)) : null);
  if ('order' in b && !list(b.order)) return c.json({ error: 'order må være en liste med kort' }, 400);
  if ('ski' in b && typeof b.ski !== 'boolean') return c.json({ error: 'ski må være true eller false' }, 400);
  if ('glimt' in b && !['top', 'bottom'].includes(b.glimt)) return c.json({ error: 'glimt må være top eller bottom' }, 400);
  kv.set(u, 'vaer_layout', { ...cur, ...('order' in b ? { order: list(b.order) } : {}), ...('hidden' in b ? { hidden: list(b.hidden) ?? [] } : {}), ...('ski' in b ? { ski: b.ski } : {}), ...('glimt' in b ? { glimt: b.glimt } : {}), ...(b.reset ? { order: VAER_CARDS, hidden: [], glimt: 'bottom' } : {}) });
  return c.json(layoutOut(u));
});

/* ---------------- Skiføre i /api/weather/full ---------------- */
export async function skiMw(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/^\/api\/weather\/full\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user') ?? sessionUser(c);
    if (!u) return;
    const j = await c.res.clone().json();
    const ski = await ski41(u);
    if (ski) c.res = c.json({ ...j, ski }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
}
