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
import { readScreenshot, normalizeSub } from './sub-screenshot.js';

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
  api.get('/forslag', R, (c) => c.json(forslag(str(c.req.query('q'), 100), { limit: c.req.query('limit') ?? 6, u: c.get('user') })));

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

  /* --- Abonnement fra skjermbilde --- */
  api.post('/subscriptions/from-screenshot', W, bodyLimit({ maxSize: 15 * 1024 * 1024, onError: (c) => bad(c, 'Bildet kan være maks 15 MB', 413) }), async (c) => {
    let image = null;
    try {
      const body = await c.req.parseBody();
      const f = body.image ?? body.file;
      if (f instanceof File && f.size) image = Buffer.from(await f.arrayBuffer());
    } catch { /* ugyldig skjema */ }
    if (!image) return bad(c, 'Velg et skjermbilde');
    if (!typeOf(image) || typeOf(image) === TYPES.ico) return bad(c, 'Skjermbildet må være PNG, JPEG, WebP eller GIF');
    try {
      const raw = await readScreenshot(image);
      return c.json(normalizeSub(raw, { u: c.get('user') }));
    } catch (e) { return bad(c, e.message, e.status ?? 502); } finally { image.fill(0); image = null; } // bildet lagres aldri; bufferen nullstilles
  });
}
