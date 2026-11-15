// Glimt-figuren per bruker og standardfiguren admin setter for andre.
//   GET/PUT /api/me/glimt-char52 · GET /api/admin/glimt-char52 · PUT /api/admin/glimt-char52/:userId (bare admin)
// Før i srv52.js; montert fra mountGlimtEarly (glimt/index.js).
import { Hono } from 'hono';
import { kv } from '../db.js';
import { authOrToken } from '../mobile.js';
import { userInfo, listUsers, isAdmin } from '../auth/session.js';
import { CHARS, glimtSettingsOf, cleanGlimtPatch, saveGlimtSettings, charDefaultOf52, setCharDefault52, CHAR_META52 } from './settings.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400) => c.json({ error }, status, NO_STORE);
const firstName = (u) => { const x = userInfo(u); return String(x?.displayName || x?.name || x?.username || '').trim().split(/\s+/)[0] || null; };

const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan gjøre dette', 403); await next(); };
const charsOut52 = () => CHARS.map((x) => ({ ...x, ...(CHAR_META52[x.id] ?? {}) }));
const charOut52 = (u) => {
  const own = kv.get(u, 'glimt35_settings', null)?.char;
  const def = charDefaultOf52(u);
  const s = glimtSettingsOf(u);
  return { char: s.char, source: own ? 'user' : def ? 'default' : 'standard', default: def, chars: charsOut52() };
};
export const characterApi = new Hono();
// NB: authOrToken per rute (ikke use('*')): ruteren monteres på /api og skal ikke treffe andre /api-ruter.
const A = authOrToken;

characterApi.get('/me/glimt-char52', A, (c) => c.json(charOut52(c.get('user')), 200, NO_STORE));
characterApi.put('/me/glimt-char52', A, async (c) => {
  const u = c.get('user'), b = await body(c);
  const { next, errors } = cleanGlimtPatch({ char: b.char }, glimtSettingsOf(u));
  if (errors.length || typeof b.char !== 'string') return bad(c, errors[0] ?? 'Forventet {char}');
  saveGlimtSettings(u, next);
  return c.json(charOut52(u));
});
characterApi.get('/admin/glimt-char52', A, adminOnly, (c) => c.json({ users: listUsers().map((x) => ({ id: x.id, name: x.displayName || x.name || x.username, ...(({ chars, ...r }) => r)(charOut52(x.id)) })), chars: charsOut52() }, 200, NO_STORE));
characterApi.put('/admin/glimt-char52/:userId', A, adminOnly, async (c) => {
  const id = c.req.param('userId');
  if (!userInfo(id)) return bad(c, 'Fant ikke brukeren', 404);
  const b = await body(c);
  if (b.default !== null && (typeof b.default !== 'string' || !CHARS.some((x) => x.id === b.default))) return bad(c, 'default må være en figur-id eller null');
  setCharDefault52(id, b.default);
  const { chars, ...r } = charOut52(id); void chars;
  return c.json({ ok: true, user: { id, name: firstName(id), ...r } });
});

