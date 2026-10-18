// Logobiblioteket for appene (prompt 20). Samme tilgang som /finans/api/logo/:domain: offentlig, fordi logoene er
// varemerker som uansett er offentlige og vises i <img> uten Authorization-header. Registeret har ETag og caches i appene.
import { readFile } from 'node:fs/promises';
import { publicRegistry, filePath, matchMerchant } from './match.js';

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
  api.get('/logos/match', (c) => {
    const q = String(c.req.query('q') ?? '').slice(0, 200);
    const m = q.trim() ? matchMerchant(q) : null;
    if (!m) return c.json({ match: null }, 200, { 'Cache-Control': 'no-cache' });
    // Treffet ligger både øverst og under «match», så klienten kan lese det på begge måter.
    const hit = { ...m, hasFile: !!filePath(m.id) };
    return c.json({ ...hit, match: hit }, 200, { 'Cache-Control': 'no-cache' });
  });
}
