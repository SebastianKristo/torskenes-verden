// Prompt 53 (DAL53): Moderator for barnekontoer (brief-/tilgangsmodellen fra prompt 52: isChild52).
//   - Opplasting: bilder et barn laster opp i Glimt-chatten (POST /api/chat/files) sjekkes etter at de er lagret. NSFW → fila slettes
//     og barnet får 422 med en forklaring.
//   - Visning: bilder som vises til et barn via bildeproxyen (/api/img – nyhets- og Glimt-bilder) sjekkes; NSFW → et nøytralt
//     erstatningsbilde med forklaring (X-Moderated53: 1).
//   - Admin kan slå av med flagget dal_moderator53 (globalt eller per barn). Reserve: ikke klar/feil → som før (ingen blokkering).
//     Sjekken venter aldri på at modellen lastes (den lastes i bakgrunnen).
import { readFile, unlink } from 'node:fs/promises';
import { db } from '../db.js';
import { isAdmin, sessionUser } from '../auth.js';
import { moderate53 } from './image.js';
import { on53 } from './flags.js';

export const HIDDEN_TEXT53 = 'Bildet er skjult fordi det kan være upassende for barn. Spør en voksen hvis du tror det er feil.';
let childOf = null;
async function isChild(u) {
  if (!u || isAdmin(u)) return false;
  try { childOf ??= (await import('../srv52.js')).isChild52; return !!childOf(u); } catch { return false; }
}
/** Bare for tester. */
export const _setChildCheck53 = (fn) => { childOf = fn; };

const PLACEHOLDER_SVG53 = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e9e4da"/>`
  + `<text x="320" y="170" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#4a4136">Bildet er skjult</text>`
  + `<text x="320" y="204" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#6b6155">Det kan være upassende for barn.</text></svg>`;

/** Etter POST /api/chat/files: sjekk bildet barnet lastet opp. */
export const chatUploadMw53 = async (c, next) => {
  await next();
  if (c.req.method !== 'POST' || c.res.status !== 200) return;
  const u = c.get('user');
  if (!(await isChild(u)) || !on53('dal_moderator53', u)) return;
  let body;
  try { body = await c.res.clone().json(); } catch { return; }
  if (body?.kind !== 'image' || !body.id) return;
  const row = db.prepare('SELECT * FROM hl_chat_files WHERE id=? AND user_id=?').get(String(body.id), u);
  if (!row?.path) return;
  const buf = await readFile(row.path).catch(() => null);
  const r = buf ? await moderate53(buf).catch(() => null) : null;
  if (!r?.isNSFW) return;
  db.prepare('DELETE FROM hl_chat_files WHERE id=?').run(row.id);
  await unlink(row.path).catch(() => {});
  try { const { deleteFile50 } = await import('../chat50.js'); await deleteFile50?.(row); } catch { /* miniatyren ryddes ved neste opprydding */ }
  console.info(`[dal53] moderator: et bilde fra en barnekonto ble avvist (score ${r.score})`);
  c.res = c.json({ error: HIDDEN_TEXT53, moderated: true, code: 'moderated53' }, 422);
};

/** Etter bildeproxyen: bilder som vises til et barn. */
export const childImageMw53 = async (c, next) => {
  await next();
  if (c.res.status !== 200) return;
  const ct = c.res.headers.get('content-type') ?? '';
  if (!/^image\/(jpeg|png|webp|gif|avif|bmp)/i.test(ct)) return;
  let u = null;
  try { u = c.get('user') ?? sessionUser(c); } catch { u = null; }
  if (!(await isChild(u)) || !on53('dal_moderator53', u)) return;
  let buf;
  try { buf = Buffer.from(await c.res.clone().arrayBuffer()); } catch { return; }
  if (!buf.length || buf.length > 15 * 1024 * 1024) return;
  const r = await moderate53(buf, { timeoutMs: 1500 }).catch(() => null);
  if (!r?.isNSFW) return;
  c.res = new Response(PLACEHOLDER_SVG53, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Moderated53': '1', 'X-Content-Type-Options': 'nosniff' } });
};
