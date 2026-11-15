// Mellomvare for hele /api/media/* og /api/playback/* (fra prompt 46, SERVER46: «Utlogget» i Media på mobil). Monteres først i
// mountMedia (server/media/index.js), før alle Media-rutene. Bakgrunnen står i server/auth/bearer-fallthrough.js (bearerFallthrough46).
//   - homelabAuthCode46: alle 401 fra /api/media/* og /api/playback/* får code:'HOMELAB_AUTH' (feil fra Sonarr/Radarr er 502
//     {code:'UPSTREAM_AUTH', service}, se media/arr.js). Appene viser «Utlogget» BARE ved HOMELAB_AUTH.
//   - Signerte bilde-URL-er: /api/media/cover?… og /api/media/poster?… i JSON-svarene får &uid=…&exp=…&sig=… (HMAC, 24 t), så
//     bilder lastes uten header. authOrToken (mobile.js) godtar signaturen bare for GET på disse stiene.
//   - mediaDiag46: hvert Media-kall logges (metode, sti uten query, status, auth: bearer|cookie|sig|none, token-alder, ms) i en
//     ringbuffer per bruker – GET /api/media/diag → {calls:[…]} («Vis detaljer» i appene). 4xx/5xx skrives også til Docker-loggen.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionSecret86 } from '../auth/server-secret.js'; // prompt 86
import { sessionUser, userInfo, isAdmin } from '../auth/session.js';
import { tokenAccessOf, tokensById } from '../finans/routes.js';

/* ---------------- 401 fra Media = HOMELAB_AUTH ---------------- */

export const homelabAuthCode46 = async (c, next) => {
  await next();
  if (c.res?.status !== 401 || !/json/i.test(c.res.headers.get('content-type') ?? '')) return;
  let body;
  try { body = await c.res.clone().json(); } catch { return; }
  if (!body || typeof body !== 'object' || body.code) return;
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify({ ...body, code: 'HOMELAB_AUTH' }), { status: 401, headers });
};

/* ---------------- Signerte bilde-URL-er ---------------- */

const SECRET = sessionSecret86().length >= 16 ? `img46:${sessionSecret86()}` : randomBytes(32).toString('hex');
const IMG_PATH = /^\/api\/media\/(cover|poster)$/;
const SIG_TTL_S = 24 * 3600;
const mac = (s) => createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 32);
/** «/api/media/cover?svc=…&path=…» → samme med &uid=…&exp=…&sig=… (exp rundes til hele timer så bildene kan caches). */
export function signImageUrl46(url, user, now = Date.now()) {
  const s = String(url);
  const [path, query = ''] = s.split('?');
  if (!IMG_PATH.test(path) || !user || /[?&]sig=/.test(s)) return s;
  const exp = Math.ceil((now / 1000 + SIG_TTL_S) / 3600) * 3600;
  const base = `${path}?${query}${query ? '&' : ''}uid=${encodeURIComponent(user)}&exp=${exp}`;
  return `${base}&sig=${mac(base)}`;
}
/** Gyldig signatur for denne GET-forespørselen? → bruker-id | null */
export function signedImageUser46(c, now = Date.now()) {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return null;
  if (!IMG_PATH.test(c.req.path)) return null;
  let u; try { u = new URL(c.req.url); } catch { return null; }
  const sig = u.searchParams.get('sig'), exp = Number(u.searchParams.get('exp')), uid = u.searchParams.get('uid');
  if (!sig || !uid || !Number.isFinite(exp) || exp * 1000 < now || exp * 1000 > now + (SIG_TTL_S + 7200) * 1000) return null;
  const raw = u.search.slice(1);
  const i = raw.lastIndexOf('&sig=');
  if (i < 0) return null;
  const want = Buffer.from(mac(`${u.pathname}?${raw.slice(0, i)}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return userInfo(uid) ? uid : null;
}
const IMG_IN_JSON = /"(\/api\/media\/(?:cover|poster)\?[^"\\]*)"/g;
/** JSON-svar fra /api/media/* og /api/playback/*: bilde-URL-ene signeres for brukeren. */
export const signImages46 = async (c, next) => {
  await next();
  const user = c.get('user');
  if (!user || !c.res || c.res.status !== 200 || !/application\/json/i.test(c.res.headers.get('content-type') ?? '')) return;
  let text;
  try { text = await c.res.clone().text(); } catch { return; }
  if (!text.includes('/api/media/')) return;
  const out = text.replace(IMG_IN_JSON, (_, url) => `"${signImageUrl46(url, user)}"`);
  if (out === text) return;
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(out, { status: 200, headers });
};

/* ---------------- Diagnose: hvert Media-kall ---------------- */

const RING = new Map(); // bruker | 'anon' → [kall]
const RING_MAX = 50;
const tokenAgeDays = (user, tokenId) => {
  try { const t = tokenId ? tokensById(user, [tokenId])[0] : null; return t?.created ? Math.floor((Date.now() - t.created) / 86400_000) : null; } catch { return null; }
};
export const mediaDiag46 = async (c, next) => {
  const t0 = Date.now();
  const hasBearer = /^Bearer\s/i.test(c.req.header('authorization') ?? '');
  const hasSig = /[?&]sig=/.test(c.req.url);
  await next();
  const status = c.res?.status ?? 0;
  const user = c.get('user') ?? null;
  const auth = hasBearer ? 'bearer' : hasSig ? 'sig' : sessionUser(c) ? 'cookie' : 'none';
  let tokenId = null;
  if (hasBearer && user) { try { tokenId = tokenAccessOf(c)?.tokenId ?? null; } catch { tokenId = null; } }
  const ua = c.req.header('user-agent') ?? '';
  const entry = { at: new Date(t0).toISOString(), method: c.req.method, path: c.req.path, status, auth, ms: Date.now() - t0,
    client: /FinansHub|Homelab\//.test(ua) ? 'ios' : /okhttp|Android/.test(ua) ? 'android' : /Mozilla/.test(ua) ? 'web' : 'annet',
    ...(tokenId ? { tokenAgeDays: tokenAgeDays(user, tokenId) } : {}), ...(c.res?.headers.get('x-media-fallback') ? { fallback: c.res.headers.get('x-media-fallback') } : {}) };
  const key = user ?? 'anon';
  const list = RING.get(key) ?? [];
  list.unshift(entry);
  RING.set(key, list.slice(0, RING_MAX));
  if (RING.size > 200) RING.delete(RING.keys().next().value);
  if (status >= 400 || process.env.MEDIA_LOG === '1') console.log(`media.req ${entry.method} ${entry.path} status=${status} auth=${auth} client=${entry.client} user=${user ?? '-'} ms=${entry.ms}${entry.tokenAgeDays != null ? ` tokenAge=${entry.tokenAgeDays}d` : ''}`);
};
/** GET /api/media/diag → {calls} for innlogget bruker (admin får også anonyme 401-er: anon). */
export function mediaDiagOut46(user) {
  return { calls: RING.get(user) ?? [], ...(isAdmin(user) ? { anon: (RING.get('anon') ?? []).slice(0, 20) } : {}) };
}
export const _diag46 = { RING };
