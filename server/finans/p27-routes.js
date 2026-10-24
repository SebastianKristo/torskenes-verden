// Prompt 27 (SERVER-B): FinansHub-ruter for søkeforslag, logo-oppslag, AI-logg og abonnement fra skjermbilde.
// Monteres fra routes.js: mountP27Public(api) før innloggingen (logofilene vises i <img> uten Authorization-header),
// mountP27(api, {R, W}) etter. Alt er per bruker (c.get('user')).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bodyLimit } from 'hono/body-limit';
import { userBool, setUserCfg } from '../settings.js';
import { db } from './db.js';
import { forslag } from './forslag.js';
import { auditList } from './ai-audit.js';
import { findLogo, setManualLogo, clearLogo, isLogoFile, LOGO_DIR } from './logo-lookup.js';
import { streamSSE } from 'hono/streaming';
import { readScreenshot, decodeImageField, imageKind, errorBody, shotError, pickVisionModel, clearVisionCache, VISION_INSTALL, canGemini48 } from './sub-screenshot.js';
import { startPull, pullStatus } from './ollama-models.js';
import { annotateForslag } from './highlight30.js';

const q = (sql) => db.prepare(sql);
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', svg: 'image/svg+xml' };
const typeOf = (b) => (b[0] === 0x89 ? TYPES.png : b[0] === 0xff ? TYPES.jpg : b.slice(0, 4).toString() === 'RIFF' ? TYPES.webp : b.slice(0, 3).toString() === 'GIF' ? TYPES.gif : b[0] === 0 && b[2] === 1 ? TYPES.ico : null);
const PRIVACY_KEYS = ['logo_local_receipts', 'logo_gemini', 'logo_verify'];
const privacyOut = (u) => Object.fromEntries(PRIVACY_KEYS.map((k) => [k, userBool(u, k)]));

export function mountP27Public(api) {
  // Lagrede logoer (128×128 PNG, eller originalen når ImageMagick mangler). Filnavnene er nøkler eller tilfeldige (manuelle).
  api.get('/merchants/logo/file/:file', async (c) => {
    const f = c.req.param('file');
    if (!isLogoFile(f)) return c.body(null, 404);
    try {
      const buf = await readFile(join(LOGO_DIR, f));
      const type = typeOf(buf);
      if (!type) return c.body(null, 404);
      return c.body(buf, 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
    } catch { return c.body(null, 404); }
  });
}

export function mountP27(api, { R, W }) {
  /* --- Søkeforslag --- */
  // Prompt 30: varelinje-forslag får {txId, receiptId, lineIndex[], matchedText} (+ matches[]) så treffet kan markeres i kvitteringen.
  api.get('/forslag', R, (c) => { const t = str(c.req.query('q'), 100); return c.json(annotateForslag(forslag(t, { limit: c.req.query('limit') ?? 6, u: c.get('user') }), t, c.get('user'))); });

  /* --- AI-logg og personvernbrytere --- */
  api.get('/ai-audit', R, (c) => c.json(auditList(c.get('user'), Number(c.req.query('limit')) || 100)));
  api.get('/ai-privacy', R, (c) => c.json(privacyOut(c.get('user'))));
  api.patch('/ai-privacy', W, async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const ch = {};
    for (const k of PRIVACY_KEYS) if (k in b) ch[k] = b[k] ? '1' : '0';
    setUserCfg(c.get('user'), ch);
    return c.json(privacyOut(c.get('user')));
  });

  /* --- Logo-oppslag --- */
  api.post('/merchants/logo', W, async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const name = str(b.name, 120);
    if (!name) return bad(c, 'Mangler navn');
    return c.json(await findLogo(name, { orgnr: b.orgnr ?? null, receiptId: b.receiptId ?? null, force: b.force === true, u: c.get('user') }));
  });
  api.post('/merchants/logo/manual', W, bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => bad(c, 'Logoen kan være maks 4 MB', 413) }), async (c) => {
    let name, domain = null, image = null;
    if (/multipart\/form-data/i.test(c.req.header('content-type') ?? '')) {
      const body = await c.req.parseBody();
      name = str(body.name, 120); domain = body.domain ? str(body.domain, 120) : null;
      const f = body.file ?? body.image;
      if (f instanceof File && f.size) image = Buffer.from(await f.arrayBuffer());
    } else { const b = await c.req.json().catch(() => ({})); name = str(b.name, 120); domain = b.domain ? str(b.domain, 120) : null; }
    if (!name) return bad(c, 'Mangler navn');
    if (!image && !domain) return bad(c, 'Last opp et bilde eller skriv et domene');
    try { return c.json(await setManualLogo(name, { domain, image, u: c.get('user') })); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });
  api.delete('/merchants/logo', W, (c) => { const n = str(c.req.query('name'), 120); if (!n) return bad(c, 'Mangler navn'); clearLogo(n, c.get('user')); return c.json({ ok: true }); });
  // «Prøv med AI» på en kvittering: samme kjede, med kvitteringens org.nr. og bildet (steg 7, lokalt).
  api.post('/receipts/:id/logo/ai', W, async (c) => {
    const r = q('SELECT id, merchant, extraction FROM fh_receipts WHERE id=? AND user_id=?').get(c.req.param('id'), c.get('user'));
    if (!r) return c.notFound();
    let ex = {};
    try { ex = JSON.parse(r.extraction ?? '{}') ?? {}; } catch { /* ugyldig */ }
    const name = r.merchant || ex.merchant;
    if (!name) return bad(c, 'Kvitteringen mangler butikknavn', 404);
    const res = await findLogo(name, { orgnr: ex.org_number ?? null, receiptId: r.id, force: true, u: c.get('user') });
    if (res.none) return c.json({ ...res, error: 'Fant ingen logo. Velg logo: last opp et bilde eller lim inn domenet.' }, 404);
    return c.json(res);
  });

  /* --- Abonnement fra skjermbilde (prompt 27, fikset i prompt 28) --- */
  // POST /subscriptions/from-screenshot[?engine=gemini]: multipart «image»/«file» (fil eller data-URL/base64-tekst),
  // JSON {image:"<base64 eller data-URL>"} eller rått image/*-innhold. HEIC, PNG, JPEG, WebP og GIF godtas.
  // 200 → normalisert abonnement + {engine, model, image:{w,h,bytes,converted}}.
  // Feil → {error, code:'ollama_down'|'no_vision'|'timeout'|'not_found'|'bad_image'|'no_gemini'|'gemini_failed', canGemini, detail?, install?}.
  // Gemini brukes bare med ?engine=gemini (brukeren trykket «Les med Gemini»), aldri automatisk; kallet logges i ai_audit.
  api.post('/subscriptions/from-screenshot', W, bodyLimit({ maxSize: 15 * 1024 * 1024, onError: (c) => c.json({ error: 'Bildet kan være maks 15 MB', code: 'bad_image', canGemini: false }, 413) }), async (c) => {
    let image = null;
    const type = c.req.header('content-type') ?? '';
    try {
      if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(type)) {
        const body = await c.req.parseBody();
        const f = body.image ?? body.file ?? body.photo;
        if (f instanceof File && f.size) image = Buffer.from(await f.arrayBuffer());
        else if (typeof f === 'string') image = decodeImageField(f);
      } else if (/json/i.test(type)) {
        const b = await c.req.json();
        image = decodeImageField(b?.image ?? b?.file ?? b?.data);
      } else if (/^image\//i.test(type) || /octet-stream/i.test(type)) image = Buffer.from(await c.req.arrayBuffer());
    } catch { /* ugyldig skjema */ }
    if (!image?.length) return bad(c, 'Velg et skjermbilde');
    if (!imageKind(image)) { image.fill(0); return c.json({ error: 'Skjermbildet må være JPEG, PNG, HEIC, WebP eller GIF', code: 'bad_image', canGemini: false }, 400); }
    const engine = c.req.query('engine') === 'gemini' ? 'gemini' : 'ollama';
    try {
      return c.json(await readScreenshot(image, { engine, u: c.get('user'), mock: c.req.query('mock') ?? null }));
    } catch (e) {
      const err = e.code ? e : shotError('ollama_down', e.message);
      console.warn(`[abo-skjermbilde] feil code=${err.code} engine=${engine}${err.detail ? ` detail=${JSON.stringify(String(err.detail).slice(0, 200))}` : ''}`);
      return c.json(errorBody(err), err.status ?? 502);
    } finally { image.fill(0); image = null; } // bildet lagres aldri; bufferen nullstilles
  });

  // GET /ai/vision → {ok:true, model, canGemini} | {ok:false, error, code, canGemini, install?}: hvilken bildemodell som brukes.
  api.get('/ai/vision', R, async (c) => {
    try { return c.json({ ok: true, model: await pickVisionModel({ fresh: c.req.query('fresh') === '1' }), canGemini: canGemini48() }); } // prompt 48: ikke når «Finansdata forlater aldri huset» er på
    catch (e) { return c.json({ ok: false, ...errorBody(e.code ? e : shotError('ollama_down', e.message)) }); }
  });
  // POST /ai/vision/install (admin) → SSE: data = {name, status, pct, completed, total, done, error} hvert sekund til done;
  // siste melding har event «done» og {ok, model, error}.
  api.post('/ai/vision/install', W, async (c) => {
    if (!c.get('access')?.admin) return bad(c, 'Bare administratorer kan installere modeller', 403);
    const name = VISION_INSTALL;
    try { startPull(name); } catch (e) { return bad(c, e.message, e.status ?? 400); }
    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');
    const cur = () => pullStatus().find((p) => p.name === name) ?? { name, status: 'ukjent', done: true, error: 'Fant ikke installeringen' };
    return streamSSE(c, async (sse) => {
      let id = 0, p = cur();
      const out = (x) => ({ name, status: x.status, pct: x.pct ?? null, completed: x.completed ?? 0, total: x.total ?? 0, done: !!x.done, error: x.error ?? null });
      await sse.writeSSE({ data: JSON.stringify(out(p)), id: String(id++) });
      while (!p.done && !sse.aborted) {
        await new Promise((r) => setTimeout(r, Number(process.env.VISION_PULL_POLL_MS ?? 1000)));
        p = cur();
        if (!sse.aborted) await sse.writeSSE({ data: JSON.stringify(out(p)), id: String(id++) });
      }
      clearVisionCache();
      if (!sse.aborted) await sse.writeSSE({ event: 'done', data: JSON.stringify({ ok: !p.error, model: p.error ? null : name, error: p.error ?? null }), id: String(id++) });
    });
  });
}
