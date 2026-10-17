// Visningsvalg for Homelab per bruker: plassering i topplinjen, nyhetslinje og verdenskart.
import { Hono } from 'hono';
import { kv } from './db.js';
import { sessionUser } from './auth.js';

const PARTS = ['logo', 'tabs', 'wx', 'menu'];
const DEFAULTS = { hp: {}, headLock: true, newsSpeed: 5, newsPause: true, domMap: true, searchSuggest: true, searchSave: true };
const xy = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && Math.abs(n) <= 4000);
const VALID = {
  hp: (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, p]) => PARTS.includes(k) && xy(p)),
  headLock: (v) => typeof v === 'boolean',
  // 'right' (standard): logo til venstre, faner, vær og meny samlet til høyre. 'left': alt fra venstre.
  headAlign: (v) => v === 'left' || v === 'right',
  newsSpeed: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
  newsPause: (v) => typeof v === 'boolean',
  domMap: (v) => typeof v === 'boolean',
  searchSuggest: (v) => typeof v === 'boolean',
  searchSave: (v) => typeof v === 'boolean',
};

export const uiPrefs = (user) => ({ ...DEFAULTS, ...kv.get(user, 'ui_prefs', {}) });
/** Lagrer validerte endringer (brukes også av /api/search/settings). */
export function saveUiPrefs(user, changes) {
  const next = uiPrefs(user);
  for (const [k, v] of Object.entries(changes)) if (VALID[k]?.(v)) next[k] = v;
  kv.set(user, 'ui_prefs', next);
  return next;
}

const api = new Hono();
api.use('*', async (c, next) => {
  const u = sessionUser(c);
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', u);
  await next();
});
api.get('/', (c) => c.json(uiPrefs(c.get('user'))));
api.put('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Ugyldig' }, 400);
  const next = uiPrefs(c.get('user'));
  for (const [k, v] of Object.entries(body)) {
    if (!VALID[k]?.(v)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
    next[k] = v;
  }
  // Slås «samme høyde» på igjen, nullstilles y på alle delene.
  if (body.headLock === true) next.hp = Object.fromEntries(Object.entries(next.hp).map(([k, [x]]) => [k, [x, 0]]));
  kv.set(c.get('user'), 'ui_prefs', next);
  return c.json(next);
});

export default api;
