// Prompt 58 (OMLX58): oMLX på Mac mini-en som motor bak AI-gaten. Brukerveiledning: docs/omlx-58.md.
//
//   GET  /api/admin/omlx58/health[?fresh=1] → {configured, ok, status, url, ms, checkedAt, error, models:[id], loaded:[id]|null, engines, fallbackOllama}
//   GET  /api/admin/omlx58/config            → {url, keySet, fallbackOllama, models:{text, vision, …}, engines:{glimt:'ollama'|'omlx', …}, tasks, defaults, standard}
//   PUT  /api/admin/omlx58/config            {url?, key?, fallbackOllama?, models?, engines?}  (tom url/key fjerner)
//   POST /api/admin/omlx58/test              {model?} → {ok, ms, text, model, error?}   (ekte kall gjennom gaten, backend «omlx»)
//
// Sikkerhet: serverinfrastruktur → bare admin. Nøkkelen sendes aldri ut og logges aldri. Bare adresser i huset (LAN/localhost).
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { gateChat, maskSecrets } from '../ai-gate.js';
import './backend.js'; // registrerer backend «omlx» i gaten
import { confOut58, saveConf58, omlxConf58 } from './config.js';
import { omlxModels58, invalidate58, resolveModel58, omlxFetch58 } from './health.js';

export { engineFor58, omlxModelFor58, omlxConf58 } from './config.js';

export const omlx58Api = new Hono();
const adminOnly = async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
const body = async (c) => { try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };

/** Helse og modeller til admin-kortet (aldri nøkkelen). */
export async function healthOut58({ force = false } = {}) {
  const c = omlxConf58();
  const h = await omlxModels58({ force });
  return { configured: !!c.url, keySet: !!c.key, ok: h.ok, status: c.url ? h.status : 'off', url: c.url || null, ms: h.ms ?? null, checkedAt: h.checkedAt ? new Date(h.checkedAt).toISOString() : null,
    error: h.ok ? null : h.error, models: (h.models ?? []).map((m) => m.id), modelInfo: (h.models ?? []).map((m) => ({ id: m.id, maxContext: m.maxContext, loaded: m.loaded })),
    loaded: h.loaded ?? null, loadedKnown: Array.isArray(h.loaded), engines: confOut58().engines, fallbackOllama: c.fallbackOllama, wanted: { text: c.models.text, vision: c.models.vision },
    missing: h.ok ? [c.models.text, c.models.vision].filter((m) => !resolveModel58(m, h.models)) : [] };
}

/** «Svar bare: ok» gjennom gaten (backend omlx). → {ok, ms, text, model, error?} */
export async function testOmlx58({ model = null } = {}) {
  const c = omlxConf58();
  if (!c.url) return { ok: false, ms: 0, error: 'Adressen til oMLX er ikke satt' };
  const h = await omlxModels58({ force: true });
  const want = model || c.models.text;
  const id = h.ok ? resolveModel58(want, h.models) : null;
  if (!h.ok) return { ok: false, ms: h.ms ?? 0, error: h.error ?? 'oMLX svarer ikke', model: want };
  if (!id) return { ok: false, ms: h.ms ?? 0, error: `Modellen «${want}» finnes ikke på oMLX (har: ${h.models.map((m) => m.id).slice(0, 6).join(', ') || 'ingen'})`, model: want };
  const t0 = Date.now();
  try {
    const out = await gateChat({ backend: 'omlx', model: id, fetch: omlxFetch58, priority: 'interactive', short: true, label: 'oMLX · test', retries: 0, loadMs: 120_000, warmMs: 60_000, idleMs: 60_000,
      body: { messages: [{ role: 'user', content: 'Svar bare med ordet: ok' }], options: { num_predict: 8, temperature: 0 } } });
    return { ok: !!String(out.text ?? '').trim(), ms: Date.now() - t0, text: String(out.text ?? '').trim().slice(0, 80), model: id, tokens: { in: out.telemetry?.tokIn ?? 0, out: out.telemetry?.tokOut ?? 0 },
      ...(String(out.text ?? '').trim() ? {} : { error: 'Tomt svar' }) };
  } catch (e) { return { ok: false, ms: Date.now() - t0, model: id, error: maskSecrets(String(e?.message ?? e)).slice(0, 200) }; }
}

omlx58Api.use('/admin/omlx58/*', authOrToken, adminOnly);
omlx58Api.get('/admin/omlx58/health', async (c) => c.json(await healthOut58({ force: c.req.query('fresh') === '1' }), 200, { 'Cache-Control': 'no-store' }));
omlx58Api.get('/admin/omlx58/config', (c) => c.json(confOut58(), 200, { 'Cache-Control': 'no-store' }));
omlx58Api.put('/admin/omlx58/config', async (c) => {
  const r = saveConf58(await body(c));
  if (!r.ok) return c.json({ error: r.error }, 400);
  invalidate58();
  try { (await import('../ai-run.js')).invalidateStatus(); } catch { /* */ }
  return c.json(confOut58());
});
omlx58Api.post('/admin/omlx58/test', async (c) => { const b = await body(c); return c.json(await testOmlx58({ model: typeof b.model === 'string' ? b.model : null })); });

export function mountOmlx58(app) { app.route('/api', omlx58Api); }
