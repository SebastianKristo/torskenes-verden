// Prompt 54 (WHISPER54): NB-Whisper (Nasjonalbiblioteket, Apache-2.0) på Mac mini-en – tale til tekst på norsk og engelsk.
// Mac-delen: tools/nb-whisper/. Brukerveiledning: docs/nb-whisper-54.md. API-formene: SERVER53-API.md (seksjon WHISPER54).
// Rutingen ligger i POST /api/voice53/transcribe (server/dal53/asr.js + ./route.js); backenden er nbWhisperAsr54 (./asr.js).
//
//   GET  /api/admin/whisper54/health[?fresh=1]  → {nbwhisper:{configured, flag, ok, status, url, model, engine, …}, engines:[…]}   (bare admin)
//   GET  /api/admin/whisper54/config            → {url, keySet}
//   PUT  /api/admin/whisper54/config            {url?, key?}   (adressen må være i huset; nøkkelen lagres kryptert, sendes aldri ut)
//   POST /api/admin/whisper54/test              → {ok, text, detected, ms, model, error?}
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { nbConfOut54, saveNbConf54 } from './config.js';
import { nbHealthOut54, nbState54, probeNb54, startNbHealth54 } from './health.js';
import { testNb54 } from './asr.js';
import { ENGINE_LABELS54 } from './route.js';

export { nbWhisperAsr54 } from './asr.js';

export const whisper54Api = new Hono();
const NO_STORE = { 'Cache-Control': 'no-store' };
const adminOnly = async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
const body = async (c) => { try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };

async function engines54() {
  const { asrBackends53 } = await import('../dal53/asr.js').catch(() => ({}));
  if (!asrBackends53) return [];
  return (await asrBackends53().catch(() => [])).map(({ b, ...x }) => ({ ...x, engine_label: ENGINE_LABELS54[x.id] ?? x.label }));
}

whisper54Api.use('/admin/whisper54/*', authOrToken, adminOnly);
whisper54Api.get('/admin/whisper54/health', async (c) => {
  if (c.req.query('fresh') === '1') await probeNb54();
  return c.json({ nbwhisper: nbHealthOut54(), engines: await engines54() }, 200, NO_STORE);
});
whisper54Api.get('/admin/whisper54/config', (c) => c.json(nbConfOut54(), 200, NO_STORE));
whisper54Api.put('/admin/whisper54/config', async (c) => {
  const r = saveNbConf54(await body(c));
  if (!r.ok) return c.json({ error: r.error }, 400, NO_STORE);
  nbState54().ok = false;
  probeNb54().catch(() => {}); // ny adresse/nøkkel: sjekk i bakgrunnen (svaret venter ikke på Mac-en)
  return c.json(nbConfOut54(), 200, NO_STORE);
});
whisper54Api.post('/admin/whisper54/test', async (c) => c.json(await testNb54(), 200, NO_STORE));

export function mountWhisper54(app) {
  app.route('/api', whisper54Api);
  startNbHealth54();
}
