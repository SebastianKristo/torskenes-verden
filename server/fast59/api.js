// Prompt 59 (prompt 49 del 4, D4SRV): ruter under /api/glimt/agent – strømming (SSE) og innstillingene for «raskere svar».
//   POST /stream            SSE: start · status · token · done | error (se $S/SERVER59-API.md §1)
//   POST /stream/stop       {requestId} → {ok, stopped}
//   GET|PUT /fast           innstillingene (cache, warm, stream, parallel)   · DELETE /fast/cache   · POST /fast/warm (admin)
// Den ikke-strømmende POST / er uendret (appene bruker den).
import { streamSSE } from 'hono/streaming';
import { runAsUser } from '../settings.js';
import { isAdmin } from '../auth.js';
import { agent45, busyOf45 } from '../glimt45/engine.js';
import { MODULES45 } from '../glimt45/plan.js';
import { fast59, serverFast59, userFast59, saveFast59, FAST_LABELS59, FAST_HELP59 } from './settings.js';
import { cacheCount59, cacheClear59, TTL59 } from './cache.js';
import { wordsOf59 } from './status.js';
import { warmNow59, warmState59 } from './warm.js';
import { saveGlimtChat59 } from '../assist.js';
import { bodyConvo60 } from '../convo60/api.js';

const RID = /^[A-Za-z0-9_-]{8,80}$/;
const live = new Map(); // `${user}|${requestId}` → AbortController
export const PING_MS59 = { v: 15_000 };

function bodyErr(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Forventet {text, module, context?, requestId}';
  const text = typeof (b.text ?? b.q) === 'string' ? String(b.text ?? b.q).trim() : '';
  if (!text) return 'Skriv noe til Glimt';
  if (text.length > 1000) return 'Teksten er for lang (maks 1000 tegn)';
  if (b.requestId != null && !RID.test(String(b.requestId))) return 'Ugyldig requestId (8–80 tegn: bokstaver, tall, - og _)';
  return null;
}
const fastOut = (u) => ({ settings: fast59(u), server: serverFast59(), user: userFast59(u), admin: isAdmin(u), labels: FAST_LABELS59, help: FAST_HELP59,
  ttl: { weather: TTL59.weather, power: 'neste hele time', web: TTL59.web, news: TTL59.news }, cacheEntries: cacheCount59(u), warmState: isAdmin(u) ? warmState59() : null });

/** Monteres på agentApi45 (etter authOrToken). */
export function installFast59(api) {
  api.post('/stream', async (c) => {
    const u = c.get('user');
    const b = await c.req.json().catch(() => null);
    const err = bodyErr(b);
    if (err) return c.json({ error: err }, 400);
    const cv = bodyConvo60(b); // prompt 60: conversationId, conversationKind, choice (samme som POST /)
    if (cv.error) return c.json({ error: cv.error }, 400);
    if (busyOf45(u) >= 4) return c.json({ error: 'Glimt jobber allerede med flere ting. Vent litt.' }, 429);
    const text = String(b.text ?? b.q).trim();
    const module = MODULES45.includes(b.module) ? b.module : 'home';
    const requestId = b.requestId ?? null;
    const on = fast59(u).stream;
    const ctrl = new AbortController();
    const lk = requestId ? `${u}|${requestId}` : null;
    if (lk) live.set(lk, ctrl);
    c.header('Cache-Control', 'no-store');
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (sse) => {
      let chain = Promise.resolve(), closed = false, tokens = 0, stopped = false;
      const send = (event, data) => { if (closed) return chain; chain = chain.then(() => (closed ? null : sse.writeSSE({ event, data: JSON.stringify(data) }))).catch(() => { closed = true; }); return chain; };
      sse.onAbort(() => { closed = true; ctrl.abort(new Error('Klienten koblet fra')); });
      ctrl.signal.addEventListener('abort', () => { stopped = true; }, { once: true });
      const ping = setInterval(() => { if (!closed) chain = chain.then(() => sse.write(': ping\n\n')).catch(() => { closed = true; }); }, PING_MS59.v);
      ping.unref?.();
      try {
        send('start', { requestId, stream: on });
        const onEvent = (event, data) => {
          if (event === 'token') { if (!on) return; tokens++; send('token', data); return; }
          send(event, data);
        };
        const out = await runAsUser(u, () => agent45(u, text, { module, context: b.context, requestId, onEvent, signal: ctrl.signal, ...(typeof b.webSearch === 'boolean' ? { webSearch: b.webSearch } : {}), ...cv.opts }));
        // Kodemalene (kalender, vær, finans …) skriver ingen tekst underveis: hele setningen ord for ord med en gang.
        if (on && !tokens && out?.reply) for (const w of wordsOf59(out.reply)) send('token', { t: w, source: 'mal' });
        await send('done', { ...out, cached: !!out?.cached });
      } catch (e) {
        if (stopped || e?.cancelled) await send('error', { error: 'Stoppet', status: 499 });
        else { console.warn('[fast59] stream', String(e?.message ?? e).slice(0, 200)); await send('error', { error: 'Glimt fikk ikke gjort det akkurat nå. Prøv igjen.', status: 502 }); }
      } finally {
        clearInterval(ping);
        if (lk && live.get(lk) === ctrl) live.delete(lk);
        await chain;
      }
    });
  });
  api.post('/stream/stop', async (c) => {
    const b = await c.req.json().catch(() => null);
    const id = b?.requestId;
    if (!id || !RID.test(String(id))) return c.json({ error: 'Ugyldig requestId' }, 400);
    const ctrl = live.get(`${c.get('user')}|${id}`);
    if (ctrl) ctrl.abort(new Error('Stoppet'));
    return c.json({ ok: true, stopped: !!ctrl });
  });
  // Lagrer et ferdig strømmet Glimt-svar i brukerens samtale (ny samtale uten chatId). → {chatId}. Bare egne samtaler.
  api.post('/stream/save', async (c) => {
    const b = await c.req.json().catch(() => null);
    const q = String(b?.q ?? '').trim().slice(0, 4000), text = String(b?.text ?? '').trim().slice(0, 20_000);
    if (!q || !text) return c.json({ error: 'Forventet {q, text, chatId?, card?, tool?, intent?, ms?}' }, 400);
    const chatId = typeof b.chatId === 'string' && /^[\w-]{1,80}$/.test(b.chatId) ? b.chatId : null;
    const card = b.card && typeof b.card === 'object' && JSON.stringify(b.card).length <= 50_000 ? b.card : null;
    const id = saveGlimtChat59(c.get('user'), chatId, q, { text, card, tool: typeof b.tool === 'string' ? b.tool.slice(0, 80) : null, intent: typeof b.intent === 'string' ? b.intent.slice(0, 40) : null, source: 'glimt', ms: Number(b.ms) || 0 });
    return id ? c.json({ chatId: id }) : c.json({ error: 'Kunne ikke lagre i samtalen' }, 500);
  });
  api.get('/fast', (c) => c.json(fastOut(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
  api.put('/fast', async (c) => {
    const u = c.get('user');
    const r = saveFast59(u, await c.req.json().catch(() => null), { admin: isAdmin(u) });
    if (r.error) return c.json({ error: r.error }, r.status ?? 400);
    return c.json(fastOut(u));
  });
  api.delete('/fast/cache', (c) => c.json({ ok: true, removed: cacheClear59(c.get('user')) }));
  api.post('/fast/warm', async (c) => {
    if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administrator' }, 403);
    const r = await warmNow59('manuelt', { force: true });
    return c.json(r);
  });
}
