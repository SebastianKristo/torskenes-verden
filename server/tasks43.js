// Prompt 43 (SERVER43): rekkefølge på listene i Gjøremål (claude-code-gjoremal-faner-rekkefolge.md, Huskeliste.dc.html).
// Lagres per bruker (kv huske_tab_order) og synkes med profilen. «+ Ny liste» er ikke med (ligger alltid sist i klienten).
//   GET /api/tasks/lists/order → {ids:[nøkkel], default:[…], keys:[{id, name, color, special}]}
//   PUT /api/tasks/lists/order {ids:[nøkkel]} | {reset:true} → samme form
//   Nøkler: 'alle', liste-id-er, 'arkivert', 'glimt' (Laget med Glimt). Ukjente/slettede fjernes, nye lister havner sist (før de spesielle).
//   GET /api/tasks og /api/tasks/lists (mellomvare) får listOrder:[nøkkel].
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { broadcast } from './realtime.js';

const q = (sql) => db.prepare(sql);
const SPECIAL = [['alle', 'Alle'], ['arkivert', 'Arkivert'], ['glimt', 'Laget med Glimt']];
const listsOf = (u) => q(`SELECT id, name, color FROM hl_task_lists WHERE owner=? OR id IN (SELECT list_id FROM hl_task_list_members WHERE user_id=?) ORDER BY owner<>?, sort, created`).all(u, u, u);
export function tabOrder43(u) {
  const lists = listsOf(u);
  const def = ['alle', ...lists.map((l) => l.id), 'arkivert', 'glimt'];
  const known = new Set(def);
  const saved = (kv.get(u, 'huske_tab_order', null) ?? []).filter((k) => known.has(k));
  const missing = def.filter((k) => !saved.includes(k));
  // Nye lister legges sist blant listene (foran Arkivert/Laget med Glimt hvis de ligger sist), spesielle nøkler som mangler legges til på standardplass.
  const out = [...saved];
  for (const k of missing) {
    if (k === 'alle') out.unshift(k);
    else if (k === 'arkivert' || k === 'glimt') out.push(k);
    else { let i = out.length; while (i > 0 && (out[i - 1] === 'arkivert' || out[i - 1] === 'glimt')) i--; out.splice(i, 0, k); }
  }
  const keys = [...SPECIAL.slice(0, 1).map(([id, name]) => ({ id, name, color: null, special: true })), ...lists.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, special: false })), ...SPECIAL.slice(1).map(([id, name]) => ({ id, name, color: null, special: true }))];
  return { ids: out, default: def, keys, custom: !!saved.length };
}
export const tasks43Api = new Hono();
tasks43Api.get('/lists/order', authOrToken, (c) => c.json(tabOrder43(c.get('user'))));
tasks43Api.put('/lists/order', authOrToken, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  if (b?.reset) kv.del(u, 'huske_tab_order');
  else {
    if (!Array.isArray(b?.ids) || b.ids.length > 500 || b.ids.some((x) => typeof x !== 'string' || x.length > 80)) return c.json({ error: 'Forventet {ids:[nøkkel]}' }, 400);
    const known = new Set(tabOrder43(u).default);
    kv.set(u, 'huske_tab_order', [...new Set(b.ids)].filter((k) => known.has(k)));
  }
  const out = tabOrder43(u);
  try { broadcast('tasks', { action: 'listOrder', ids: out.ids }, [u]); } catch { /* */ }
  return c.json(out);
});
export async function tasksOrderMw43(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/^\/api\/tasks(\/lists)?\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user');
    if (!u) return;
    const j = await c.res.clone().json();
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.listOrder) return;
    c.res = c.json({ ...j, listOrder: tabOrder43(u).ids }, 200);
  } catch { /* svaret står */ }
}
