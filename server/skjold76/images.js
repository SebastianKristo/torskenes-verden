// Prompt 76 (SKJSRV): bilder i Skjold Lab (deler og skap). JPEG/PNG/WebP/HEIC inn (maks 10 MB) → JPEG maks 1600 px + miniatyr 320 px,
// rotert etter EXIF og uten metadata (-strip fjerner GPS). ImageMagick via img50.js (samme som chat/kvitteringer). Uten ImageMagick:
// JPEG/PNG/WebP lagres som de er (HEIC avvises). Filene ligger i DATA_DIR/skjold76 og serveres bare til eieren (skj_files).
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { toJpeg50, sniffImage50, magick50 } from '../img50.js';
import { now76, thumbOf76 } from './store.js';

export const MAX_IN76 = 10 * 1024 * 1024;
export const DIR76 = resolve(config.dataDir, 'skjold76');
mkdirSync(DIR76, { recursive: true });
const q = (sql) => db.prepare(sql);
export const NAME_RE76 = /^[0-9a-f]{20}(?:_t)?\.(?:jpg|png|webp)$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MIME76 = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Lagrer et opplastet bilde. → {name} | {error, status}
 * name er hovedfila (…jpg); miniatyren heter …_t.jpg (thumbOf76).
 */
export async function saveImage76(user, buf) {
  if (!buf?.length) return { error: 'Mangler fil', status: 400 };
  if (buf.length > MAX_IN76) return { error: 'Bildet er for stort (maks 10 MB)', status: 413 };
  const mime = sniffImage50(buf);
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(mime)) return { error: 'Ukjent bildeformat (JPEG, PNG, WebP eller HEIC)', status: 415 };
  const id = randomBytes(10).toString('hex');
  let main = null, thumb = null, ext = 'jpg';
  if (await magick50()) {
    main = await toJpeg50(buf, 1600, 85);
    if (main) thumb = await toJpeg50(main.buf, 320, 78);
  }
  if (!main) {
    if (mime === 'image/heic') return { error: 'HEIC krever ImageMagick på serveren – last opp JPEG eller PNG', status: 415 };
    ext = EXT[mime];
    main = { buf };
  }
  const name = `${id}.${ext}`;
  const tname = thumbOf76(name);
  writeFileSync(join(DIR76, name), main.buf);
  writeFileSync(join(DIR76, tname), thumb?.buf ?? main.buf);
  q('INSERT INTO skj_files(name, user_id, created) VALUES(?,?,?)').run(name, user, now76());
  q('INSERT INTO skj_files(name, user_id, created) VALUES(?,?,?)').run(tname, user, now76());
  return { name, thumb: tname, converted: ext === 'jpg' && !!thumb, w: main.w ?? null, h: main.h ?? null };
}
/** Miniatyrnavnet for et hovedbilde (også for PNG/WebP lagret uten ImageMagick). */
export const thumbName76 = thumbOf76;

export function removeImage76(name) {
  for (const n of [name, thumbName76(name)]) {
    if (!NAME_RE76.test(n)) continue;
    try { unlinkSync(join(DIR76, n)); } catch { /* finnes ikke */ }
    q('DELETE FROM skj_files WHERE name=?').run(n);
  }
}
/** Fila hvis brukeren eier den. → {buf, mime} | null */
export function readImage76(user, name) {
  if (!NAME_RE76.test(String(name))) return null;
  const own = q('SELECT user_id FROM skj_files WHERE name=?').pluck().get(name);
  if (!own || own !== user) return null;
  const p = join(DIR76, name);
  if (!existsSync(p)) return null;
  return { buf: readFileSync(p), mime: MIME76[name.split('.').pop()] ?? 'application/octet-stream' };
}

/* ---------------- Signerte bilde-URL-er (appenes bildelastere sender ikke alltid header) ---------------- */

const SECRET = () => process.env.SESSION_SECRET || config.sessionSecret || 'skjold76';
const WEEK = 7 * 86400;
const mac = (s) => createHmac('sha256', `skjold76|${SECRET()}`).update(s).digest('base64url').slice(0, 32);
/** URL for en fil: gyldig 7–14 dager (utløp rundet til uka, så URL-en er stabil og kan caches). */
export function signedUrl76(name, user) {
  const exp = (Math.floor(Date.now() / 1000 / WEEK) + 2) * WEEK;
  return `/api/skjold/files/${name}?u=${encodeURIComponent(user)}&exp=${exp}&sig=${mac(`${name}|${user}|${exp}`)}`;
}
/** → bruker-id hvis signaturen er gyldig, ellers null. */
export function signedUser76(name, u, exp, sig) {
  const e = Number(exp);
  if (!u || !sig || !Number.isFinite(e) || e * 1000 < Date.now()) return null;
  const want = Buffer.from(mac(`${name}|${u}|${e}`)), got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got) ? u : null;
}
