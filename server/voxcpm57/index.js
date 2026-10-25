// Prompt 57 (VOX57): VoxCPM2 (OpenBMB, Apache-2.0) på Mac mini-en – lokale stemmer, kloning og stemmevalg for Glimt og nyhetsleseren.
// Mac-delen: tools/voxcpm/. Veiledning: docs/voxcpm-57.md. API-formene: SERVER57-API.md (scratchpad) og docs/voxcpm-57.md.
// Motoren «voxcpm» i POST /api/tts ligger i server/glimt35.js (bruker vxSpeakFor57 herfra).
//
//   GET    /api/voices57                     → {voices, engineReady, configured, selected, consentText, sampleText, limits}
//   POST   /api/voices57                     JSON {name, kind:'design', prompt} · multipart {name, kind:'clone', file, transcript?, consent}
//   POST   /api/voices57/:id/preview         {text?} → lyd
//   DELETE /api/voices57/:id                 → {ok, macDeleted}
//   GET    /api/admin/voxcpm57/health[?fresh=1] · GET/PUT /api/admin/voxcpm57/config · POST /api/admin/voxcpm57/test   (bare admin)
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { vxConfOut57, saveVxConf57 } from './config.js';
import { vxHealthOut57, vxState57, probeVx57, startVxHealth57, vxReady57, vxConfigured57 } from './health.js';
import { listVoices57, createDesign57, createClone57, deleteVoice57, vxVoiceOf57, vxSpeakFor57, voiceCounts57, pruneVxCache57,
  CONSENT_TEXT57, SAMPLE_TEXT57, LIMITS57 } from './voices.js';

export { vxReady57, vxConfigured57 } from './health.js';

export const voxcpm57Api = new Hono();
const NO_STORE = { 'Cache-Control': 'no-store' };
const PREVIEW_TEXT = 'Hei! Slik høres denne stemmen ut når Glimt leser for deg.';
const adminOnly = async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
const jsonBody = async (c) => { try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
const fail = (c, e) => {
  const st = e?.status === 413 ? 413 : e?.status === 404 ? 404 : e?.status === 400 ? 400 : 503;
  return c.json({ error: e?.message ?? 'Feil', ...(e?.code ? { code: e.code } : {}), ...(st === 503 ? { fallback: 'browser' } : {}) }, st, NO_STORE);
};
const audioResponse = (r, extra = {}) => new Response(r.audio, { status: 200, headers: { 'Content-Type': r.contentType || 'audio/mpeg', 'Content-Length': String(r.audio.length),
  'Cache-Control': 'private, max-age=2592000', 'X-TTS-Engine': 'voxcpm', 'X-TTS-Cache': r.cache, 'X-TTS-Voice': r.voice, 'X-TTS-Chars': String(r.chars), 'X-TTS-AI': '1', ...extra } });

async function glimt() { return import('../glimt35.js'); }

/* ─────────────── stemmer per bruker ─────────────── */

voxcpm57Api.use('/voices57', authOrToken);
voxcpm57Api.use('/voices57/*', authOrToken);

voxcpm57Api.get('/voices57', async (c) => {
  const u = c.get('user');
  const { glimtSettingsOf } = await glimt();
  const s = glimtSettingsOf(u);
  return c.json({ voices: listVoices57(u), engineReady: vxReady57(), configured: vxConfigured57(), selected: { voice: s.tts.voice, newsVoice: s.tts.newsVoice ?? null },
    consentText: CONSENT_TEXT57, sampleText: SAMPLE_TEXT57, limits: LIMITS57 }, 200, NO_STORE);
});

voxcpm57Api.post('/voices57', async (c) => {
  const u = c.get('user');
  const ct = String(c.req.header('content-type') ?? '').toLowerCase();
  try {
    if (ct.startsWith('multipart/form-data')) {
      const len = Number(c.req.header('content-length') ?? 0);
      if (len > LIMITS57.maxBytes + 1024 * 1024) return c.json({ error: `Opptaket er for stort (maks ${LIMITS57.maxBytes / 1048576} MB)`, code: 'too_large' }, 413, NO_STORE);
      const form = await c.req.parseBody().catch(() => null);
      if (!form) return c.json({ error: 'Ugyldig skjema', code: 'bad_request' }, 400, NO_STORE);
      const kind = String(form.kind ?? 'clone');
      if (kind === 'design') return c.json({ voice: createDesign57(u, { name: form.name, prompt: form.prompt, lang: form.lang }) }, 201, NO_STORE);
      if (kind !== 'clone') return c.json({ error: 'kind må være design eller clone', code: 'bad_kind' }, 400, NO_STORE);
      const f = form.file;
      const buf = f && typeof f === 'object' && typeof f.arrayBuffer === 'function' ? Buffer.from(await f.arrayBuffer()) : null;
      return c.json({ voice: await createClone57(u, { name: form.name, file: buf, transcript: form.transcript, consent: form.consent }) }, 201, NO_STORE);
    }
    const b = await jsonBody(c);
    if (b.kind === 'clone') return c.json({ error: 'Kloning krever multipart/form-data med lydfilen i «file»', code: 'file_required' }, 400, NO_STORE);
    if (b.kind !== 'design') return c.json({ error: 'kind må være design eller clone', code: 'bad_kind' }, 400, NO_STORE);
    return c.json({ voice: createDesign57(u, b) }, 201, NO_STORE);
  } catch (e) { return fail(c, e); }
});

voxcpm57Api.post('/voices57/:id/preview', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  if (!vxVoiceOf57(u, id)) return c.json({ error: 'Fant ikke stemmen', code: 'not_found' }, 404, NO_STORE);
  const b = await jsonBody(c);
  const raw = String(b.text ?? '').trim().slice(0, 300) || PREVIEW_TEXT;
  if (!vxReady57()) return c.json({ error: 'VoxCPM på Mac mini-en svarer ikke akkurat nå', fallback: 'browser' }, 503, NO_STORE);
  try {
    const { normalizeSpeech } = await glimt();
    const r = await vxSpeakFor57(u, { voiceId: id, text: normalizeSpeech(raw, 'no'), lang: 'no', title: 'Glimt · stemme (forhåndslytting)' });
    return audioResponse(r);
  } catch (e) { return fail(c, e); }
});

voxcpm57Api.delete('/voices57/:id', async (c) => {
  const u = c.get('user'), id = c.req.param('id');
  try {
    const r = await deleteVoice57(u, id);
    // Var stemmen valgt, går innstillingene tilbake til standard.
    const { glimtSettingsOf, saveGlimtSettings } = await glimt();
    const s = glimtSettingsOf(u);
    if (s.tts.voice === id || s.tts.newsVoice === id) {
      const next = { ...s, tts: { ...s.tts, ...(s.tts.voice === id ? { voice: 'nora' } : {}), ...(s.tts.newsVoice === id ? { newsVoice: null } : {}) } };
      saveGlimtSettings(u, next);
    }
    return c.json(r, 200, NO_STORE);
  } catch (e) { return fail(c, e); }
});

/* ─────────────── admin ─────────────── */

voxcpm57Api.use('/admin/voxcpm57/*', authOrToken, adminOnly);
voxcpm57Api.get('/admin/voxcpm57/health', async (c) => {
  if (c.req.query('fresh') === '1') await probeVx57();
  return c.json({ voxcpm: vxHealthOut57(), voices: voiceCounts57() }, 200, NO_STORE);
});
voxcpm57Api.get('/admin/voxcpm57/config', (c) => c.json(vxConfOut57(), 200, NO_STORE));
voxcpm57Api.put('/admin/voxcpm57/config', async (c) => {
  const r = saveVxConf57(await jsonBody(c));
  if (!r.ok) return c.json({ error: r.error }, 400, NO_STORE);
  vxState57().ok = false;
  probeVx57().catch(() => {}); // ny adresse/nøkkel: sjekk i bakgrunnen
  return c.json(vxConfOut57(), 200, NO_STORE);
});
voxcpm57Api.post('/admin/voxcpm57/test', async (c) => {
  const t0 = Date.now();
  await probeVx57();
  if (!vxReady57()) return c.json({ ok: false, error: vxState57().error ?? 'Ikke klar', ms: Date.now() - t0 }, 200, NO_STORE);
  try {
    const r = await vxSpeakFor57(c.get('user'), { voiceId: 'vx-nora', text: 'Hei, dette er en test.', cache: false, title: 'Glimt · stemme (VoxCPM-test)' });
    return c.json({ ok: true, ms: Date.now() - t0, bytes: r.audio.length, engine: 'voxcpm', contentType: r.contentType }, 200, NO_STORE);
  } catch (e) { return c.json({ ok: false, error: e.message, code: e.code ?? null, ms: Date.now() - t0 }, 200, NO_STORE); }
});

let pruner = null;
export function mountVoxcpm57(app) {
  app.route('/api', voxcpm57Api);
  startVxHealth57();
  if (!pruner && process.env.NODE_ENV !== 'test') { pruner = setInterval(pruneVxCache57, 86400_000); pruner.unref?.(); setTimeout(pruneVxCache57, 45_000).unref?.(); }
}
