// Prompt 45 (GLIMT45): /api/glimt/agent – én inngang for alle Glimt-felt. Sesjon eller app-token, alt per bruker.
// Se $S/SERVER45-API.md (seksjon «Glimt») for formene.
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { runAsUser } from '../settings.js';
import { agent45, confirm45, logOf45, busyOf45 } from './engine.js';
import { registryOut45 } from './tools.js';
import { modelInfo45, MODULES45 } from './plan.js';
import { personalityOf, setPersonality, PERSONALITIES, PERSONALITY_LABELS } from './personality.js';

export const agentApi45 = new Hono();
agentApi45.use('*', authOrToken);
const RID = /^[A-Za-z0-9_-]{8,80}$/;
const settingsOut = (u) => ({ personality: personalityOf(u), options: PERSONALITIES, labels: PERSONALITY_LABELS });

agentApi45.post('/', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {text, module, context?, requestId}' }, 400);
  const text = typeof (b.text ?? b.q) === 'string' ? String(b.text ?? b.q).trim() : '';
  if (!text) return c.json({ error: 'Skriv noe til Glimt' }, 400);
  if (text.length > 1000) return c.json({ error: 'Teksten er for lang (maks 1000 tegn)' }, 400);
  if (b.requestId != null && !RID.test(String(b.requestId))) return c.json({ error: 'Ugyldig requestId (8–80 tegn: bokstaver, tall, - og _)' }, 400);
  if (busyOf45(u) >= 4) return c.json({ error: 'Glimt jobber allerede med flere ting. Vent litt.' }, 429);
  const module = MODULES45.includes(b.module) ? b.module : 'home';
  try {
    const out = await runAsUser(u, () => agent45(u, text, { module, context: b.context, requestId: b.requestId ?? null }));
    return c.json(out, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.warn('[glimt45]', String(e?.message ?? e).slice(0, 200));
    return c.json({ error: 'Glimt fikk ikke gjort det akkurat nå. Prøv igjen.' }, 502);
  }
});
agentApi45.post('/confirm', async (c) => {
  const b = await c.req.json().catch(() => null);
  const r = await runAsUser(c.get('user'), () => confirm45(c.get('user'), b?.token));
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(r);
});
agentApi45.get('/settings', (c) => c.json(settingsOut(c.get('user'))));
agentApi45.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => null);
  const v = b?.personality ?? b?.glimt_personality;
  try { setPersonality(c.get('user'), v); } catch (e) { return c.json({ error: e.message }, 400); }
  return c.json(settingsOut(c.get('user')));
});
agentApi45.get('/tools', async (c) => { const m = await modelInfo45(c.get('user')); return c.json({ tools: registryOut45(), toolMode: m.mode, model: m.model }); });
agentApi45.get('/log', (c) => c.json({ items: logOf45(c.get('user')) }));
