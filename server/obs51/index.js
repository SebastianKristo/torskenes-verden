// Prompt 51 (OBS51): drift – helsedashbord, selvreparasjon, spor for trege forespørsler og ntfy. API-formene står i SERVER51-API.md (OBS51).
//
//   Bare admin (økt eller admin-app-token; endringer krever økt eller token med finance:write, ikke «Logg inn som»):
//   GET    /api/system/obs51/health[?force=1]        → dashbordet (se health.js)
//   GET    /api/system/obs51/traces?limit=&route=   → trege forespørsler + p50/p95 per rute
//   GET    /api/system/obs51/heal                   → {settings, events, drafts, lastHour, watching}
//   PUT    /api/system/obs51/heal {on?, maxPerHour?, exclude?}
//   POST   /api/system/obs51/heal/run {confirm:true} → én runde nå
//   GET    /api/system/obs51/heal/drafts/:id        → {id, container, title, body, markdown, count, …}
//   DELETE /api/system/obs51/heal/drafts/:id
//   GET    /api/system/obs51/proxmox · PUT {url, tokenId, secret?, ca?} | {clear:true}
//   Alle innloggede (økt eller app-token):
//   GET    /api/me/ntfy51 · POST /api/me/ntfy51/topics {device} · DELETE /api/me/ntfy51/topics/:id · POST /api/me/ntfy51/test
import { Hono } from 'hono';
import { db, kv, OWNER } from '../db.js';
import { sessionUser, isAdmin, listUsers } from '../auth.js';
import { bearerOk } from '../finans/routes.js';
import { notifyUser, setNotifyHook51 } from '../notify.js';
import { backendConfig } from '../ai-gate.js';
import { traceMw51, traces51, installTrace51, setAiHosts51 } from './trace.js';
import { health51, takeSamples51, proxmoxOut51, saveProxmox51 } from './health.js';
import { healOnce51, healOut51, saveHeal51, draft51, dismissDraft51 } from './heal.js';
import { ntfyStatus51, addTopic51, removeTopic51, topicsOf51, publish51, ntfyNotify51 } from './ntfy.js';

const MOCK = () => process.env.MOCK_DATA === '1';
const json = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
const NS = { 'Cache-Control': 'no-store' };

const adminGuard = async (c, next) => {
  let u = sessionUser(c);
  const session = !!u, write = c.req.method !== 'GET';
  if (!u && bearerOk(c, write ? 'finance:write' : 'finance:read')) u = c.get('user');
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(u)) return c.json({ error: 'Driftsdashbordet er serverinfrastruktur og vises bare for administratorer', restricted: true }, 403);
  if (c.get('actor')) return c.json({ error: 'Ikke tilgjengelig mens du er logget inn som en annen bruker' }, 403);
  c.set('user', u); c.set('session', session);
  await next();
};
const userGuard = async (c, next) => {
  let u = sessionUser(c);
  if (!u && bearerOk(c, c.req.method === 'GET' ? 'finance:read' : 'finance:write')) u = c.get('user');
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', u);
  await next();
};

export const obs51Api = new Hono();
obs51Api.use('*', adminGuard);
obs51Api.get('/health', async (c) => c.json(await health51({ force: c.req.query('force') === '1' }), 200, NS));
obs51Api.get('/traces', (c) => c.json(traces51({ limit: parseInt(c.req.query('limit') ?? '50', 10) || 50, route: String(c.req.query('route') ?? '').slice(0, 100) }), 200, NS));
obs51Api.get('/heal', (c) => c.json(healOut51(), 200, NS));
obs51Api.put('/heal', async (c) => {
  const b = await json(c); if (!b) return c.json({ error: 'Forventet JSON' }, 400);
  const e = saveHeal51(b); if (e) return c.json({ error: e }, 400);
  console.log(`obs51.heal settings by=${c.get('user')}`);
  return c.json(healOut51());
});
obs51Api.post('/heal/run', async (c) => {
  const b = await json(c);
  if (b?.confirm !== true) return c.json({ error: 'Bekreft handlingen ({confirm:true})', needsConfirm: true }, 400);
  return c.json(await healOnce51());
});
obs51Api.get('/heal/drafts/:id', (c) => {
  const d = draft51(c.req.param('id'));
  if (!d || d.dismissed) return c.json({ error: 'Fant ikke utkastet' }, 404);
  return c.json({ id: d.id, container: d.container, title: d.title, body: d.body, markdown: `# ${d.title}\n\n${d.body}`, count: d.count, createdAt: new Date(d.created).toISOString(), updatedAt: new Date(d.updated).toISOString(),
    note: 'Utkastet er ikke sendt noe sted. Kopier det og opprett issuet selv.' }, 200, NS);
});
obs51Api.delete('/heal/drafts/:id', (c) => (dismissDraft51(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Fant ikke utkastet' }, 404)));
obs51Api.get('/proxmox', (c) => c.json(proxmoxOut51(), 200, NS));
obs51Api.put('/proxmox', async (c) => {
  if (!c.get('session') && !bearerOk(c, 'finance:write')) return c.json({ error: 'Krever innlogging' }, 403);
  const b = await json(c); if (!b) return c.json({ error: 'Forventet JSON' }, 400);
  const e = saveProxmox51(b); if (e) return c.json({ error: e }, 400);
  console.log(`obs51.proxmox saved by=${c.get('user')}`); // aldri tokenet
  return c.json(proxmoxOut51());
});

export const ntfy51Api = new Hono();
ntfy51Api.use('*', userGuard);
ntfy51Api.get('/', (c) => c.json(ntfyStatus51(c.get('user')), 200, NS));
ntfy51Api.post('/topics', async (c) => {
  const b = (await json(c)) ?? {};
  try { return c.json({ topic: addTopic51(c.get('user'), b.device), ...ntfyStatus51(c.get('user')) }); } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
});
ntfy51Api.delete('/topics/:id', (c) => (removeTopic51(c.get('user'), c.req.param('id')) ? c.json(ntfyStatus51(c.get('user'))) : c.json({ error: 'Fant ikke emnet' }, 404)));
ntfy51Api.post('/test', async (c) => {
  const rows = topicsOf51(c.get('user'));
  if (!rows.length) return c.json({ error: 'Legg til en enhet først' }, 400);
  const res = await Promise.all(rows.map((r) => publish51(r.topic, { title: 'Test fra Homelab', body: 'ntfy virker. 🎉', priority: 3 })));
  const ok = res.filter((r) => r.ok).length;
  return c.json({ ok: ok > 0, sent: ok, total: rows.length, ...(ok ? {} : { error: res[0]?.error ?? 'Ikke sendt' }) }, ok ? 200 : 502);
});

/** Spor-mellomvaren: så tidlig som mulig i index.js (før alle ruter), så hele forespørselen måles. */
export function traceObs51(app) {
  installTrace51(db);
  let hosts = { at: 0, v: [] };
  setAiHosts51(() => {
    if (Date.now() - hosts.at < 30_000) return hosts.v;
    const v = [];
    try { const b = backendConfig(); for (const u of [b?.ollama?.url, b?.openwebui?.url, process.env.OLLAMA_URL]) if (u) { try { v.push(new URL(u).host); } catch { /* */ } } } catch { /* */ }
    hosts = { at: Date.now(), v };
    return v;
  });
  app.use('*', traceMw51);
}
/** Rutene: etter secureHeaders og «Logg inn som» (actor), før de eldre /api/system- og /api/me-rutene. */
export function mountObs51(app) {
  app.route('/api/system/obs51', obs51Api);
  app.route('/api/me/ntfy51', ntfy51Api);
  setNotifyHook51((user, item) => ntfyNotify51(user, item));
}

/* ---------------- Bakgrunn ---------------- */

const ALERT_KEY = 'obs51_alerts_sent';
/** Driftsvarsler til admin: én gang per 12 t per varsel. → [nøkler sendt] */
export async function alertRound51(now = Date.now()) {
  const h = await health51({ now });
  const sent = kv.get(OWNER, ALERT_KEY, {}) ?? {};
  const out = [];
  for (const a of h.alerts) {
    if (a.key.startsWith('ct:') && a.key.endsWith(':unhealthy')) continue; // selvreparasjonen varsler selv
    if (now - (sent[a.key] ?? 0) < 12 * 3_600_000) continue;
    sent[a.key] = now; out.push(a.key);
    for (const u of listUsers().filter((x) => x.role === 'admin')) notifyUser(u.id, { title: a.title, body: a.text, url: '/#/innstillinger/system', tag: `obs51-${a.key}`, category: 'system', data: { obs51: true, ...(a.level === 'crit' ? { critical: true } : {}) } }).catch(() => {});
  }
  for (const k of Object.keys(sent)) if (now - sent[k] > 7 * 86_400_000) delete sent[k];
  kv.set(OWNER, ALERT_KEY, sent);
  return out;
}

let timers = [];
export function startObs51() {
  if (timers.length || process.env.NODE_ENV === 'test' || process.env.OBS51_BACKGROUND === '0') return;
  const every = (ms, fn) => { const t = setInterval(() => fn().catch((e) => console.warn(`obs51: ${e.message}`)), ms); t.unref?.(); timers.push(t); };
  every(15 * 60_000, () => takeSamples51());
  every(15 * 60_000, () => alertRound51());
  if (!MOCK()) every(60_000, () => healOnce51());
  setTimeout(() => takeSamples51().catch(() => {}), 30_000).unref?.();
}
