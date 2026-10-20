// Prompt 41 (SERVER41): Bursdager – last opp bilder av personer (claude-code-bursdag-bilder.md). Montert under /api/birthdays før birthdays.js.
// Sesjon eller app-token, bare egne bursdager. Bildet beskjæres/skaleres i appen (kvadrat 256 px eller maks 1600 px, WebP/JPEG); serveren
// sjekker type og størrelse (ingen bildebibliotek på serveren) og lagrer i DATA_DIR/birthday-photos/<id>/.
//
// GET    /api/birthdays/:id/photos → {photos:[photo], max:8, photoUrl}
// POST   /api/birthdays/:id/photos  (rå kropp image/jpeg|image/webp, multipart «file»/«photo», eller JSON {fromFamily:true} = «Bruk bildet fra Familie»)
//        → 201 {photo, photos, photoUrl, toast:'Bilde lagt til for Emma'}   (maks 8 per person, maks 4 MB, maks 1600 px; nyeste blir hovedbilde)
// DELETE /api/birthdays/:id/photos/:pid → {photos, photoUrl}
// PUT    /api/birthdays/:id/photos/:pid/primary → {photos, photoUrl}
// GET    /api/birthdays/:id/photos/:pid → bildet
// Alias (spesifikasjonen): POST /api/birthdays/:id/photo (= nytt hovedbilde) · DELETE /api/birthdays/:id/photo (fjerner hovedbildet)
// photo = {id, url, mime, width, height, createdAt, primary}. Personen får photoUrl (og avatarUrl = eget bilde foran Familie-bildet) i alle lister.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { authOrToken as authOrToken0 } from './mobile.js';
const authOrToken = (c, next) => authOrToken0(c, next); // sen binding (mobile.js kan være midt i lastingen)
import { broadcast } from './realtime.js';

const DIR = join(config.dataDir, 'birthday-photos');
export const MAX_PHOTOS41 = 8, MAX_BYTES41 = 4 * 1024 * 1024, MAX_PX41 = 1600;
db.exec(`CREATE TABLE IF NOT EXISTS birthday_photos (id TEXT PRIMARY KEY, birthday_id INTEGER NOT NULL, user_id TEXT NOT NULL, file TEXT NOT NULL, mime TEXT NOT NULL,
  width INTEGER, height INTEGER, is_primary INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS birthday_photos_b ON birthday_photos(birthday_id, created);`);
const q = (s) => db.prepare(s);

/** Type og størrelse fra filhodet. → {mime, width, height} | null */
export function imageInfo41(b) {
  if (!b || b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { mime: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { mime: 'image/jpeg', width: null, height: null };
  }
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
    const k = b.slice(12, 16).toString();
    if (k === 'VP8 ' && b.length >= 30) return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L' && b.length >= 25) { const v = b.readUInt32LE(21); return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (k === 'VP8X' && b.length >= 30) return { mime: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return { mime: 'image/webp', width: null, height: null };
  }
  return null;
}
const own = (c) => { const id = +c.req.param('id'); const r = Number.isInteger(id) ? q('SELECT * FROM birthdays WHERE id=? AND user_id=?').get(id, c.get('user')) : null; return r ?? null; };
const urlOf = (p) => `/api/birthdays/${p.birthday_id}/photos/${p.id}?v=${p.created.toString(36)}`;
const photoOut = (p) => ({ id: p.id, url: urlOf(p), mime: p.mime, width: p.width, height: p.height, createdAt: new Date(p.created).toISOString(), primary: !!p.is_primary });
const photosOf = (bid) => q('SELECT * FROM birthday_photos WHERE birthday_id=? ORDER BY is_primary DESC, created DESC').all(bid);
/** Hovedbildet til en bursdag (for itemOut i birthdays.js). */
export function photoUrl41(bid) {
  try { const p = q('SELECT * FROM birthday_photos WHERE birthday_id=? ORDER BY is_primary DESC, created DESC LIMIT 1').get(bid); return p ? urlOf(p) : null; } catch { return null; }
}
const out = (r) => { const ps = photosOf(r.id); return { photos: ps.map(photoOut), max: MAX_PHOTOS41, photoUrl: ps[0] ? urlOf(ps[0]) : null }; };
const changed = (r) => { try { broadcast('birthdays', { action: 'photo', id: r.id, photoUrl: photoUrl41(r.id) }, [r.user_id]); } catch { /* */ } };
async function save(r, buf, { primary = true } = {}) {
  const info = imageInfo41(buf);
  if (!info) throw Object.assign(new Error('Bildet må være JPEG eller WebP'), { status: 415 });
  if (buf.length > MAX_BYTES41) throw Object.assign(new Error('Bildet er for stort (maks 4 MB)'), { status: 413 });
  if ((info.width ?? 0) > MAX_PX41 || (info.height ?? 0) > MAX_PX41) throw Object.assign(new Error(`Bildet er større enn ${MAX_PX41} px. Skaler det ned i appen først.`), { status: 413 });
  if (photosOf(r.id).length >= MAX_PHOTOS41) throw Object.assign(new Error(`Maks ${MAX_PHOTOS41} bilder per person`), { status: 409 });
  const id = randomBytes(8).toString('hex'), file = `${r.id}/${id}.${info.mime === 'image/webp' ? 'webp' : 'jpg'}`;
  await mkdir(join(DIR, String(r.id)), { recursive: true });
  await writeFile(join(DIR, file), buf);
  db.transaction(() => {
    if (primary) q('UPDATE birthday_photos SET is_primary=0 WHERE birthday_id=?').run(r.id);
    q('INSERT INTO birthday_photos(id, birthday_id, user_id, file, mime, width, height, is_primary, created) VALUES(?,?,?,?,?,?,?,?,?)').run(id, r.id, r.user_id, file, info.mime, info.width, info.height, primary ? 1 : 0, Date.now());
  })();
  changed(r);
  return q('SELECT * FROM birthday_photos WHERE id=?').get(id);
}
async function bodyImage(c) {
  const ct = c.req.header('content-type') ?? '';
  if (ct.startsWith('multipart/')) { const f = await c.req.parseBody(); const file = f.file ?? f.photo ?? f.image; return file && typeof file !== 'string' ? Buffer.from(await file.arrayBuffer()) : null; }
  if (ct.startsWith('application/json')) {
    const b = await c.req.json().catch(() => ({}));
    if (b?.fromFamily) return { fromFamily: true };
    if (typeof b?.image === 'string') return Buffer.from(b.image.replace(/^data:[^,]+,/, ''), 'base64');
    return null;
  }
  return Buffer.from(await c.req.arrayBuffer());
}
async function addHandler(c, { primary = true } = {}) {
  const r = own(c);
  if (!r) return c.json({ error: 'Fant ikke personen' }, 404);
  let buf = await bodyImage(c);
  if (buf?.fromFamily) {
    if (!r.person_id) return c.json({ error: 'Personen er ikke koblet til Familie' }, 400);
    try { buf = await readFile(join(config.dataDir, 'avatars', `${String(r.person_id).replace(/[^\w-]/g, '')}.jpg`)); } catch { return c.json({ error: 'Fant ikke bildet fra Familie' }, 404); }
  }
  if (!buf?.length) return c.json({ error: 'Mangler bildet' }, 400);
  try {
    const p = await save(r, buf, { primary });
    return c.json({ photo: photoOut(p), ...out(r), toast: `Bilde lagt til for ${String(r.name).split(/\s+/)[0]}` }, 201);
  } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
}
async function remove(r, p) {
  q('DELETE FROM birthday_photos WHERE id=?').run(p.id);
  await unlink(join(DIR, p.file)).catch(() => {});
  if (p.is_primary) { const next = photosOf(r.id)[0]; if (next) q('UPDATE birthday_photos SET is_primary=1 WHERE id=?').run(next.id); }
  changed(r);
}

export const birthdays41Api = new Hono();
birthdays41Api.use('/:id{[0-9]+}/photo*', authOrToken);
const limit = bodyLimit({ maxSize: MAX_BYTES41 + 256 * 1024, onError: (c) => c.json({ error: 'Bildet er for stort (maks 4 MB)' }, 413) });
birthdays41Api.get('/:id{[0-9]+}/photos', (c) => { const r = own(c); return r ? c.json(out(r)) : c.json({ error: 'Fant ikke personen' }, 404); });
birthdays41Api.post('/:id{[0-9]+}/photos', limit, (c) => addHandler(c));
birthdays41Api.post('/:id{[0-9]+}/photo', limit, (c) => addHandler(c, { primary: true }));
birthdays41Api.delete('/:id{[0-9]+}/photo', async (c) => {
  const r = own(c);
  if (!r) return c.json({ error: 'Fant ikke personen' }, 404);
  const p = photosOf(r.id)[0];
  if (p) await remove(r, p);
  return c.json(out(r));
});
birthdays41Api.get('/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}', async (c) => {
  const r = own(c);
  const p = r ? q('SELECT * FROM birthday_photos WHERE id=? AND birthday_id=?').get(c.req.param('pid'), r.id) : null;
  if (!p) return c.json({ error: 'Fant ikke bildet' }, 404);
  try { return c.body(await readFile(join(DIR, p.file)), 200, { 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff' }); } catch { return c.json({ error: 'Fant ikke bildet' }, 404); }
});
birthdays41Api.delete('/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}', async (c) => {
  const r = own(c);
  const p = r ? q('SELECT * FROM birthday_photos WHERE id=? AND birthday_id=?').get(c.req.param('pid'), r.id) : null;
  if (!p) return c.json({ error: 'Fant ikke bildet' }, 404);
  await remove(r, p);
  return c.json(out(r));
});
birthdays41Api.put('/:id{[0-9]+}/photos/:pid{[0-9a-f]{16}}/primary', (c) => {
  const r = own(c);
  const p = r ? q('SELECT * FROM birthday_photos WHERE id=? AND birthday_id=?').get(c.req.param('pid'), r.id) : null;
  if (!p) return c.json({ error: 'Fant ikke bildet' }, 404);
  db.transaction(() => { q('UPDATE birthday_photos SET is_primary=0 WHERE birthday_id=?').run(r.id); q('UPDATE birthday_photos SET is_primary=1 WHERE id=?').run(p.id); })();
  changed(r);
  return c.json(out(r));
});
