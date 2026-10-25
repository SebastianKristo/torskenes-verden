// Prompt 60 (prompt 49 del 3, D3SRV): API-et for «bedre forståelse i samtaler». Se $S/SERVER60-API.md.
//   Under /api/glimt/agent (installConvo60):  GET|PUT /understand · GET|DELETE /convo/:conversationId
//   /api/glimt/entities (entitiesApi60):      GET / · GET /resolve · POST / · PATCH /:id · DELETE /:id
//   bodyConvo60(b): felles validering av {conversationId, conversationKind, choice} for POST /agent og /agent/stream.
// Alt per bruker (sesjon eller app-token).
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { convo60, serverConvo60, userConvo60, saveConvo60, LABELS60, HELP60 } from './settings.js';
import { CONV_RE60, TTL60, loadState60, clearState60 } from './state.js';
import { listEntities60, publicEntity60, createEntity60, patchEntity60, deleteEntity60, resolveEntity60, ETYPES60, ELABELS60, BUILTIN60 } from './entities.js';

/** → {opts:{conversationId?, conversationKind?, choice?}} | {error} */
export function bodyConvo60(b) {
  const o = {};
  if (b?.conversationId != null) {
    if (typeof b.conversationId !== 'string' || !CONV_RE60.test(b.conversationId)) return { error: 'Ugyldig conversationId (1–80 tegn: bokstaver, tall, . : - og _)' };
    o.conversationId = b.conversationId;
  }
  if (b?.conversationKind != null) {
    if (b.conversationKind !== 'chat' && b.conversationKind !== 'search') return { error: "conversationKind må være 'chat' eller 'search'" };
    o.conversationKind = b.conversationKind;
  }
  if (b?.choice != null) {
    const c = b.choice;
    if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.setId !== 'string' || !/^[A-Za-z0-9]{4,40}$/.test(c.setId) || (typeof c.id !== 'string' && typeof c.id !== 'number') || String(c.id).length > 20) return { error: 'Ugyldig choice (forventet {setId, id})' };
    o.choice = { setId: c.setId, id: String(c.id) };
  }
  return { opts: o };
}

const understandOut = (u) => ({ settings: convo60(u), server: serverConvo60(), user: userConvo60(u), admin: isAdmin(u), labels: LABELS60, help: HELP60, ttl: { search: TTL60.search, chat: TTL60.chat } });

/** Monteres på agentApi45 (etter authOrToken). */
export function installConvo60(api) {
  api.get('/understand', (c) => c.json(understandOut(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
  api.put('/understand', async (c) => {
    const u = c.get('user');
    const r = saveConvo60(u, await c.req.json().catch(() => null), { admin: isAdmin(u) });
    if (r.error) return c.json({ error: r.error }, r.status ?? 400);
    return c.json(understandOut(u));
  });
  api.get('/convo/:id', (c) => {
    const id = c.req.param('id');
    if (!CONV_RE60.test(id)) return c.json({ error: 'Ugyldig conversationId' }, 400);
    const l = loadState60(c.get('user'), { id });
    if (!l) return c.json({ error: 'Fant ikke samtalen (eller den er utløpt)' }, 404);
    const st = l.state;
    const ch = st.choices ? { setId: st.choices.setId, question: st.choices.question, items: (st.choices.items ?? []).map(({ id: i, label, text }) => ({ id: i, label, text })), expiresAt: st.choices.expiresAt } : null;
    return c.json({ conversationId: id, kind: l.kind, updatedAt: l.updatedAt, expiresAt: l.expiresAt,
      state: { intent: st.intent ?? null, tools: st.tools ?? [], entities: { eventId: st.entities?.eventId ?? null, event: st.entities?.event ?? null, person: st.entities?.person ?? null, place: st.entities?.place ?? null, when: st.entities?.when ?? null, subscription: st.entities?.subscription ?? null }, choices: ch, turns: (st.turns ?? []).length } }, 200, { 'Cache-Control': 'no-store' });
  });
  api.delete('/convo/:id', (c) => {
    const id = c.req.param('id');
    if (!CONV_RE60.test(id)) return c.json({ error: 'Ugyldig conversationId' }, 400);
    return c.json({ ok: true, removed: clearState60(c.get('user'), id) });
  });
}

/* ---------------- /api/glimt/entities ---------------- */

export const entitiesApi60 = new Hono();
entitiesApi60.use('*', authOrToken);
const listOut = (u, type) => ({ items: listEntities60(u, { type }).map(publicEntity60), types: ETYPES60, labels: ELABELS60, builtinWords: BUILTIN60, enabled: convo60(u).entities });
entitiesApi60.get('/', (c) => {
  const type = c.req.query('type') || null;
  if (type && !ETYPES60.includes(type)) return c.json({ error: `Ukjent type (${ETYPES60.join(', ')})` }, 400);
  return c.json(listOut(c.get('user'), type), 200, { 'Cache-Control': 'no-store' });
});
entitiesApi60.get('/resolve', (c) => {
  const qy = String(c.req.query('q') ?? '').slice(0, 80);
  const type = c.req.query('type') || null;
  if (type && !ETYPES60.includes(type)) return c.json({ error: `Ukjent type (${ETYPES60.join(', ')})` }, 400);
  const r = qy.trim().length >= 2 ? resolveEntity60(c.get('user'), qy, { type }) : null;
  return c.json({ q: qy, item: r ? publicEntity60(r.item) : null, via: r?.via ?? null });
});
entitiesApi60.post('/', async (c) => {
  const r = createEntity60(c.get('user'), await c.req.json().catch(() => null));
  if (r.error) return c.json({ error: r.error }, 400);
  return c.json({ ok: true, item: publicEntity60(r.item) }, r.created ? 201 : 200);
});
entitiesApi60.patch('/:id', async (c) => {
  const r = patchEntity60(c.get('user'), c.req.param('id'), await c.req.json().catch(() => null));
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json({ ok: true, item: publicEntity60(r.item) });
});
entitiesApi60.delete('/:id', (c) => {
  const r = deleteEntity60(c.get('user'), c.req.param('id'));
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(r);
});
