// Prompt 37 (SERVER37): ruter for husstandens sporingsnøkler, montert under /api/tracking/keys (se tracking37.js for svarformen).
import { Hono } from 'hono';
import { isAdmin } from './auth.js';
import { authOrToken } from './mobile.js';
import { sealSecret } from './settings.js';
import { kv, OWNER } from './db.js';
import { PROVIDERS37, keysOut, usage37, quotaCfg, householdStore, householdSave, providerOut, parcelsLimit37 } from './tracking37.js';

const api = new Hono();
api.use('*', authOrToken);
api.get('/', (c) => c.json(keysOut(c.get('user'), parcelsLimit37())));
api.put('/quota', async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Administreres av admin' }, 403);
  const b = await c.req.json().catch(() => ({}));
  const cur = quotaCfg();
  if (b.perUserPct !== undefined) { const v = Math.round(+b.perUserPct); if (!(v >= 10 && v <= 100)) return c.json({ error: 'perUserPct må være 10–100' }, 400); cur.perUserPct = v; }
  if (b.limit !== undefined) { const v = b.limit === null ? null : Math.round(+b.limit); if (v !== null && !(v >= 1 && v <= 100000)) return c.json({ error: 'Ugyldig kvote' }, 400); cur.limit = v; }
  kv.set(OWNER, 'trk_quota', cur);
  return c.json({ quota: usage37(parcelsLimit37(), c.get('user')) });
});
api.put('/:id', async (c) => {
  const uid = c.get('user');
  if (!isAdmin(uid)) return c.json({ error: 'Administreres av admin' }, 403);
  const p = PROVIDERS37.find((x) => x.id === c.req.param('id'));
  if (!p) return c.json({ error: 'Ukjent leverandør' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const input = b.fields && typeof b.fields === 'object' ? b.fields : b.key !== undefined ? { [p.fields.find(([, , sec]) => sec !== false)[0]]: b.key } : b;
  const s = householdStore(), cur = s[p.id] ?? { fields: {} };
  const fields = { ...cur.fields };
  for (const [k, v] of Object.entries(input)) {
    if (!p.fields.some(([fk]) => fk === k)) return c.json({ error: `Ukjent felt ${k}` }, 400);
    if (v === null || v === '') { if (v === null) delete fields[k]; continue; } // tomt felt = behold
    const t = String(v).trim();
    if (t.length > 400 || /[\s<>]/.test(t)) return c.json({ error: `Ugyldig verdi for ${k}` }, 400);
    fields[k] = sealSecret(t);
  }
  s[p.id] = { ...cur, fields, addedBy: uid, updatedAt: Date.now(), status: 'ok' };
  if (!Object.keys(fields).length) delete s[p.id];
  householdSave(s);
  return c.json({ provider: providerOut(p, true, parcelsLimit37()) });
});
api.delete('/:id', (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Administreres av admin' }, 403);
  const p = PROVIDERS37.find((x) => x.id === c.req.param('id'));
  if (!p) return c.json({ error: 'Ukjent leverandør' }, 404);
  const s = householdStore(); delete s[p.id]; householdSave(s);
  return c.json({ provider: providerOut(p, true, parcelsLimit37()) });
});
export default api;
