// Prompt 53 (DAL53): lokale modeller fra Desert Ant Labs (Eye, Redact, Gist, Tongue, Emo, Moderator, Clear, Voz).
// API-formene står i $S/SERVER53-API.md (seksjon DAL53) og i docs/dal-53.md.
//
//   GET  /api/admin/dal53/health                 → helse per modell (bare admin)
//   POST /api/admin/dal53/preload {models?}      → 202, laster i bakgrunnen (bare admin)
//   POST /api/emo53/suggest {text, limit?}       → emoji-forslag (alle innloggede)
//   POST /api/voice53/transcribe                 → tale til tekst med ordtider (alle innloggede)
//   GET  /api/voice53/backends                   → ASR-backends og språk
//
// Bruk andre steder (alle med stille reserve når modellen ikke er klar):
//   chat.js:   engine53 rundt runEngine (Tongue + Redact for sky), webSearch53 (Redact på søkeordene), eyeIntent53 (veien for bilder)
//   receipts48/preprocess51.js: eyeRotation53 før Tesseract · receipts48/routes.js: eyeKind53 (advarsel når bildet er et foto)
//   rss.js / news46.js: gistCategory53 / topicSlugs53 · index.js: chatUploadMw53 og childImageMw53 (Moderator for barn)
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile } from 'node:fs/promises';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { languageOf } from '../mobile.js';
import { MODELS53, health53, load53, CREDIT53 } from './models.js';
import { FLAGS53, on53 } from './flags.js';
import { suggestEmoji53 } from './text.js';
import { eyeAnalyze53 } from './image.js';
import { asrBackends53, transcribe53 } from './asr.js';
import { startNews53 } from './news.js';
import { chatUploadMw53, childImageMw53 } from './moderate.js';

export { engine53, webSearch53, aiRun53, langNote53, detectLang53, suggestEmoji53 } from './text.js';
export { eyeRotation53, eyeAnalyze53, moderate53 } from './image.js';
export { gistCategory53, topicSlugs53, interestMatchesTopics53 } from './news.js';
export { chatUploadMw53, childImageMw53 } from './moderate.js';
export { registerAsrBackend53 } from './asr.js';
export { CREDIT53 };

const NO_STORE = { 'Cache-Control': 'no-store' };
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status, NO_STORE);
const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan gjøre dette', 403); await next(); };

/**
 * Veien for chat-bilder fra Eye: 'document' | 'photo' | null (ikke klar/flagget av → dagens heuristikk).
 * rows: hl_chat_files-radene ({path}). Første bilde avgjør.
 */
export async function eyeIntent53(rows) {
  if (!rows?.length || !on53('dal_eye53')) return null;
  try {
    const buf = await readFile(rows[0].path);
    const r = await eyeAnalyze53(buf, { timeoutMs: 1500 });
    return r?.route ?? null;
  } catch { return null; }
}
/** Kvitteringsopplasting: {kind, route, rotation} fra Eye eller null. */
export async function eyeKind53(buf) {
  if (!buf?.length || !on53('dal_eye53')) return null;
  return eyeAnalyze53(buf, { timeoutMs: 1500 }).catch(() => null);
}

export const dal53Api = new Hono();
const A = authOrToken;

dal53Api.get('/admin/dal53/health', A, adminOnly, async (c) => {
  const h = health53({ flagOn: (f) => on53(f, null) });
  const asr = (await asrBackends53().catch(() => [])).map(({ b, ...x }) => x);
  return c.json({ ...h, flags: Object.keys(FLAGS53), asr: { backends: asr } }, 200, NO_STORE);
});
dal53Api.post('/admin/dal53/preload', A, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(b?.models) && b.models.length ? b.models.map(String) : MODELS53.map((m) => m.id);
  const started = [], skipped = [];
  const known = new Set(MODELS53.map((m) => m.id));
  for (const id of ids) {
    if (!known.has(id)) { skipped.push({ id, reason: 'ukjent modell' }); continue; }
    const h = health53().models.find((m) => m.id === id);
    if (h.status === 'ready') { skipped.push({ id, reason: 'allerede klar' }); continue; }
    if (h.status === 'missing') { skipped.push({ id, reason: h.error }); continue; }
    load53(id, { force: true }).catch(() => {});
    started.push(id);
  }
  console.info(`[dal53] forhåndslasting startet av admin: ${started.join(', ') || 'ingen'}`);
  return c.json({ started, skipped }, 202, NO_STORE);
});

dal53Api.post('/emo53/suggest', A, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const text = typeof b?.text === 'string' ? b.text : '';
  if (!text.trim()) return bad(c, 'Mangler tekst');
  return c.json(await suggestEmoji53(text, { limit: b.limit, user: c.get('user') }), 200, NO_STORE);
});

dal53Api.get('/voice53/backends', A, async (c) => {
  const list = (await asrBackends53().catch(() => [])).map(({ b, ...x }) => x);
  return c.json({ backends: list, norwegian: list.some((x) => !x.languages || x.languages.includes('no')) }, 200, NO_STORE);
});

const AUDIO_MAX = 50 * 1024 * 1024;
dal53Api.post('/voice53/transcribe', A, bodyLimit({ maxSize: AUDIO_MAX + 1024 * 1024, onError: (c) => bad(c, 'Lydfilen kan være maks 50 MB', 413) }), async (c) => {
  const u = c.get('user');
  if (!on53('dal_voice53', u)) return bad(c, 'Tale til tekst (prompt 53) er slått av for deg', 403, { code: 'disabled' });
  const ct = c.req.header('content-type') ?? '';
  let buf = null, language = c.req.query('language') ?? null, backend = c.req.query('backend') ?? 'auto', enhance = c.req.query('enhance');
  if (/multipart\/form-data/i.test(ct)) {
    const form = await c.req.parseBody().catch(() => null);
    const f = form?.file ?? form?.audio;
    if (!(f instanceof File) || !f.size) return bad(c, 'Mangler lydfil (feltet «file» eller «audio»)');
    buf = Buffer.from(await f.arrayBuffer());
    language = typeof form.language === 'string' ? form.language : language;
    backend = typeof form.backend === 'string' ? form.backend : backend;
    enhance = typeof form.enhance === 'string' ? form.enhance : enhance;
  } else if (/^(audio|video)\/|application\/octet-stream/i.test(ct)) {
    buf = Buffer.from(await c.req.arrayBuffer());
  } else return bad(c, 'Forventet multipart/form-data med feltet «file», eller rå lyd (Content-Type: audio/*)');
  if (!buf?.length) return bad(c, 'Lydfilen er tom');
  if (buf.length > AUDIO_MAX) return bad(c, 'Lydfilen kan være maks 50 MB', 413);
  if (!language) language = languageOf(u) === 'en' ? 'en' : 'no';
  try {
    const r = await transcribe53(buf, { language, backend, enhance: enhance !== '0', signal: c.req.raw.signal });
    return c.json(r, 200, NO_STORE);
  } catch (e) {
    return bad(c, e.message, e.status ?? 500, { code: e.code ?? 'error', ...(e.supported ? { supported: e.supported } : {}) });
  }
});

export function mountDal53(app) {
  // Moderator for barnekontoer: opplasting i Glimt-chatten og bildeproxyen (før rutene deres).
  app.use('/api/chat/files', chatUploadMw53);
  app.use('/api/img', childImageMw53);
  app.route('/api', dal53Api);
  startNews53();
}
