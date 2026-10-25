// Prompt 52 (SRV52): butikklogoer for lister (Filter-treff, Boliger-lista, transaksjoner) – bare fra lokal cache:
// logobiblioteket (server/logos) og logoer serveren allerede har lagret (merchant_logos + fil i data/logos). Aldri nettkall.
//   POST /finans/api/logos52/batch {names:[…]} → {items:{navn:{id, url, initial, color, source?}}}
//   GET  /finans/api/logos52/match?q=           → ett slikt objekt
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { matchMerchant, filePath as libraryFile } from './logos/match.js';

const q = (sql) => db.prepare(sql);
const hasTable = (t) => !!q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const BANK_PREFIX52 = /^(?:vipps\s*\*|klarna\s*\*|sumup\s*\*|iz\s*\*|zettle_?\s*\*|sq\s*\*|nets\s*\*|paypal\s*\*|varekjøp\s+|varekjop\s+|kortkjøp\s+|visa\s+)/i;
const normMerchant52 = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' og ').replace(/[^\p{L}\p{N}]+/gu, '').trim();
const cleanName52 = (s) => String(s ?? '').replace(BANK_PREFIX52, '').replace(/\s+\d{3,}.*$/, '').trim();
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };


const LOGO_DIR52 = join(config.dataDir, 'logos');
/** Logo for et butikknavn uten nettkall: logobiblioteket, så brukerens lagrede merchant_logos (fil på disk). */
export function localLogo52(u, name) {
  const n = clean(name, 120);
  const initial = (n.replace(BANK_PREFIX52, '').match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  if (!n) return { id: null, url: null, initial, color: null };
  let m = null; try { m = matchMerchant(n); } catch { /* */ }
  if (m?.id && libraryFile(m.id)) return { id: m.id, url: `/finans/api/logos/file/${m.id}`, initial, color: m.farge ?? null, source: 'library' };
  try {
    if (hasTable('merchant_logos')) {
      const key = normMerchant52(cleanName52(n));
      const rows = q('SELECT key, file, domain, name FROM merchant_logos WHERE user_id=? AND file IS NOT NULL').all(u);
      const hit = rows.find((r) => normMerchant52(r.key) === key || (r.name && normMerchant52(cleanName52(r.name)) === key));
      if (hit?.file && existsSync(join(LOGO_DIR52, hit.file))) return { id: null, url: `/finans/api/merchants/logo/file/${encodeURIComponent(hit.file)}`, initial, color: m?.farge ?? null, source: 'saved' };
    }
  } catch { /* */ }
  return { id: null, url: null, initial, color: m?.farge ?? null };
}
export function mountLogos52(api, { R }) {
  api.post('/logos52/batch', R, async (c) => {
    const b = await body(c);
    const names = Array.isArray(b.names) ? [...new Set(b.names.map((x) => clean(x, 120)).filter(Boolean))].slice(0, 200) : null;
    if (!names) return c.json({ error: 'Forventet {names: [...]} (maks 200)' }, 400);
    const u = c.get('user');
    return c.json({ items: Object.fromEntries(names.map((n) => [n, localLogo52(u, n)])) }, 200, { 'Cache-Control': 'private, max-age=300' });
  });
  api.get('/logos52/match', R, (c) => c.json(localLogo52(c.get('user'), c.req.query('q') ?? ''), 200, { 'Cache-Control': 'private, max-age=300' }));
}

