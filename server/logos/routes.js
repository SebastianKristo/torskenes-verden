// Logobiblioteket for appene (prompt 20). Samme tilgang som /finans/api/logo/:domain: offentlig, fordi logoene er
// varemerker som uansett er offentlige og vises i <img> uten Authorization-header. Registeret har ETag og caches i appene.
import { readFile } from 'node:fs/promises';
import { publicRegistry, filePath, matchMerchant, setOverrides, overrides, normalize, itemForDomain } from './match.js';
import { kv, OWNER } from '../db.js';

// Egne logovalg (navn → domene) lagres i kv og gjelder for alle (serveroppsett, bare admin kan endre).
setOverrides(kv.get(OWNER, 'logo_overrides', {}));
const DOMAIN_RE = /^(?=.{3,120}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Innlogging sjekkes her fordi rutene monteres før FinansHubs egen tilgangskontroll. Dynamisk import unngår en importsirkel.
async function adminOnly(c) {
  const [{ bearerOk }, { isAdmin }] = await Promise.all([import('../finans/routes.js'), import('../auth.js')]);
  if (!bearerOk(c, 'finance:read')) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan velge logo' }, 403);
  return null;
}

export function mountLogoRoutes(api) {
  api.get('/logos/registry', (c) => {
    const { body, etag } = publicRegistry();
    const headers = { ETag: etag, 'Cache-Control': 'public, max-age=3600, must-revalidate' };
    const inm = c.req.header('if-none-match');
    if (inm && inm.split(/\s*,\s*/).some((t) => t.replace(/^W\//, '') === etag)) return c.body(null, 304, headers);
    return c.json(body, 200, headers);
  });
  api.get('/logos/file/:id', async (c) => {
    const id = c.req.param('id').replace(/\.png$/i, '');
    const f = filePath(id);
    if (!f) return c.body(null, 404, { 'Cache-Control': 'public, max-age=3600' }); // klienten viser bokstaven
    try {
      return c.body(await readFile(f), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=2592000', 'X-Content-Type-Options': 'nosniff' });
    } catch { return c.body(null, 404); }
  });
  // POST /logos/override {name, domain}: «Velg domene» for et navn (Tv2 → tv2.no). Tomt domene fjerner valget.
  api.get('/logos/overrides', async (c) => (await adminOnly(c)) ?? c.json({ items: overrides() }));
  api.post('/logos/override', async (c) => {
    const denied = await adminOnly(c);
    if (denied) return denied;
    const b = await c.req.json().catch(() => ({}));
    const name = normalize(b?.name ?? '');
    if (!name || name.length > 80) return c.json({ error: 'Mangler navn' }, 400);
    const domain = String(b?.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (domain && !DOMAIN_RE.test(domain)) return c.json({ error: 'Ugyldig domene' }, 400);
    const all = { ...kv.get(OWNER, 'logo_overrides', {}) };
    if (domain) all[name] = domain; else delete all[name];
    kv.set(OWNER, 'logo_overrides', all);
    setOverrides(all);
    const it = domain ? itemForDomain(domain) : null;
    return c.json({ name, domain: domain || null, match: domain ? matchMerchant(b.name) : null, hasFile: !!(it && filePath(it.id)), items: overrides() });
  });
  api.get('/logos/match', (c) => {
    const q = String(c.req.query('q') ?? '').slice(0, 200);
    const m = q.trim() ? matchMerchant(q) : null;
    if (!m) return c.json({ match: null }, 200, { 'Cache-Control': 'no-cache' });
    // Treffet ligger både øverst og under «match», så klienten kan lese det på begge måter.
    const hit = { ...m, hasFile: !!filePath(m.id) };
    return c.json({ ...hit, match: hit }, 200, { 'Cache-Control': 'no-cache' });
  });
}
