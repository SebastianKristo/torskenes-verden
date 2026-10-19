// Prompt 37 (SERVER37): profiler i husstanden og onboarding («koble en profil til en bruker»), claude-code-onboarding-profil.md.
// Bruker = innlogging. Profil = personen i husstanden (navn, farge, avatar, samtykker). En profil kan finnes uten bruker
// (Pål, Mormor), og en bruker kobles til nøyaktig én profil (profiles37.user_id UNIQUE).
//
// GET  /api/profiles → {profiles:[{id, name, color, avatar, initials, userId|null, username|null, has:{location, lists, subs},
//                       suggested, linkedToOther, mine}], me:{profileId|null, userId, username, name}, locked, adminLinked}
//        locked = bare admin kan koble (adminOnlyLink). adminLinked = admin har koblet deg (steg 2 viser bare bekreft).
// POST /api/onboarding/link {profileId | newProfileName, consents:{location, lists, subs, calendars, health}}
//        → 200 {profile, consents, next:{requestLocation, requestHealth}} · 409 profilen er koblet til en annen bruker ·
//          403 når bare admin kan koble (og admin ikke har koblet deg til den profilen). Push til admin: «@ingrid koblet seg …».
// PUT  /api/users/:id/profile {profileId|null}  (admin) koble, bytt eller koble fra → {profile|null}
// PUT  /api/profiles/settings {adminOnlyLink}   (admin) → {adminOnlyLink}
// GET  /api/profiles/me → {profile|null, consents}
// Glimt, Hilsen, Now Brief og Bibelvers bruker profilnavnet (profileName(userId)), ikke brukernavnet.
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { userInfo, listUsers, isAdmin } from './auth.js';
import { authOrToken } from './mobile.js';
import { colorOf, prefsOf, PALETTE } from './family.js';

const MOCK = process.env.MOCK_DATA === '1';
const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS profiles37 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  avatar TEXT,
  user_id TEXT UNIQUE,
  consents TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL,
  linked_at INTEGER,
  linked_by TEXT
);`);

// Engangsmigrering: hver bruker som finnes nå får sin egen profil (koblet), så ingenting endrer seg for dem.
// Nye brukere kobles i onboarding (eller av admin). Logges, sletter ingenting.
export function migrateProfiles37() {
  if (kv.get(OWNER, 'profiles37_v1', false)) return;
  const users = q('SELECT id, name, username FROM users ORDER BY created').all();
  const ins = q('INSERT OR IGNORE INTO profiles37(name, color, user_id, created, linked_at, linked_by) VALUES(?,?,?,?,?,?)');
  db.transaction(() => { for (const u of users) ins.run(String(u.name || u.username).split(' ')[0] || u.username, null, u.id, Date.now(), Date.now(), 'migrering'); })();
  if (users.length) console.log(`[profiler] prompt 37: ${users.length} brukere fikk hver sin profil`);
  kv.set(OWNER, 'profiles37_v1', Date.now());
}
migrateProfiles37();
// Eksempelprofiler uten bruker (MOCK_DATA=1), som i Familie: Ingrid, Pål og Mormor.
function seedMock() {
  if (!MOCK || kv.get(OWNER, 'profiles37_mock', false)) return;
  const ins = q('INSERT INTO profiles37(name, color, created) VALUES(?,?,?)');
  for (const [n, c] of [['Ingrid', '#2f5d8a'], ['Pål', '#2f7a4f'], ['Mormor', '#a8456b']]) if (!q('SELECT 1 FROM profiles37 WHERE lower(name)=lower(?)').get(n)) ins.run(n, c, Date.now());
  kv.set(OWNER, 'profiles37_mock', Date.now());
}

const norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
const parseJ = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const initials = (name) => { const w = String(name ?? '').trim().split(/\s+/); return ((w[0]?.[0] ?? '?') + (w[1]?.[0] ?? '')).toUpperCase(); };
const settings = () => ({ adminOnlyLink: !!kv.get(OWNER, 'profiles37_settings', {})?.adminOnlyLink });
const rowOfUser = (uid) => q('SELECT * FROM profiles37 WHERE user_id=?').get(uid);
const rowById = (id) => q('SELECT * FROM profiles37 WHERE id=?').get(Number(id));

/** Profilen til en bruker, eller null. */
export function profileOfUser(uid) { const r = uid ? rowOfUser(uid) : null; return r ? profileOut(r, uid) : null; }
/** Navnet Glimt og hilsenen bruker: profilnavnet, ellers fornavnet til brukeren. */
export function profileName(uid) {
  const r = uid ? rowOfUser(uid) : null;
  if (r?.name) return r.name;
  const u = uid ? userInfo(uid) : null;
  return (u?.displayName || u?.name || u?.username || '').split(' ')[0] || null;
}

// Hva profilen har (for listen i steg 2). Lazy import, så tasks/finans ikke lastes før de trengs.
let hasLists = () => false, hasSubs = () => false;
export const _setProfileHas = ({ lists, subs }) => { if (lists) hasLists = lists; if (subs) hasSubs = subs; };
const MOCK_HAS = { ingrid: { location: true, lists: true, subs: true }, 'pål': { location: true, lists: true, subs: true }, mormor: { location: false, lists: false, subs: false } };
function hasOf(r) {
  if (r.user_id) {
    let loc = false;
    try { loc = prefsOf(r.user_id).sharing === 'on'; } catch { /* */ }
    return { location: loc, lists: !!hasLists(r.user_id), subs: !!hasSubs(r.user_id) };
  }
  return MOCK ? MOCK_HAS[String(r.name).toLowerCase()] ?? { location: false, lists: false, subs: false } : { location: false, lists: false, subs: false };
}
function colorFor(r) {
  if (r.color) return r.color;
  if (r.user_id) { try { return colorOf(r.user_id); } catch { /* */ } }
  let h = 0; for (const ch of String(r.name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function profileOut(r, viewer = null) {
  const u = r.user_id ? userInfo(r.user_id) : null;
  return { id: r.id, name: r.name, color: colorFor(r), avatar: r.avatar || u?.avatarUrl || null, initials: initials(r.name), userId: r.user_id ?? null,
    username: u?.username ?? null, linkedAt: r.linked_at ? new Date(r.linked_at).toISOString() : null, mine: !!viewer && r.user_id === viewer, has: hasOf(r) };
}

/** Profilene for steg 2 («Hvem er du?»). */
export function profilesFor(uid) {
  migrateProfiles37(); seedMock();
  const me = userInfo(uid);
  const rows = q('SELECT * FROM profiles37 ORDER BY user_id IS NULL, created, id').all();
  const mine = rows.find((r) => r.user_id === uid) ?? null;
  const keys = [me?.username, String(me?.displayName ?? me?.name ?? '').split(' ')[0]].map(norm).filter(Boolean);
  const sug = mine ?? rows.find((r) => !r.user_id && keys.includes(norm(r.name))) ?? null;
  const st = settings();
  return {
    profiles: rows.map((r) => ({ ...profileOut(r, uid), suggested: !!sug && r.id === sug.id, linkedToOther: !!r.user_id && r.user_id !== uid,
      linkedLabel: r.user_id && r.user_id !== uid ? `Koblet til @${userInfo(r.user_id)?.username ?? 'ukjent'}` : null })),
    me: { profileId: mine?.id ?? null, userId: uid, username: me?.username ?? null, name: profileName(uid) },
    locked: st.adminOnlyLink, adminLinked: !!(mine && mine.linked_by && mine.linked_by !== uid && mine.linked_by !== 'migrering'),
  };
}

const CONSENT_KEYS = ['location', 'lists', 'subs', 'calendars', 'health'];
const cleanConsents = (c) => Object.fromEntries(CONSENT_KEYS.map((k) => [k, k === 'health' ? c?.[k] === true : c?.[k] !== false]));

/** Kobler bruker til profil (i én transaksjon). → {profile} eller {error, status} */
export function linkProfile(uid, { profileId = null, newProfileName = null, consents = {} } = {}, { actor = uid } = {}) {
  migrateProfiles37();
  const admin = actor !== uid && isAdmin(actor);
  const st = settings();
  return db.transaction(() => {
    let row;
    if (profileId != null) {
      row = rowById(profileId);
      if (!row) return { error: 'Fant ikke profilen', status: 404 };
      if (row.user_id && row.user_id !== uid) return { error: `Profilen ${row.name} er allerede koblet til @${userInfo(row.user_id)?.username ?? 'en annen bruker'}`, status: 409 };
    } else {
      const name = String(newProfileName ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!name) return { error: 'Skriv navnet ditt', status: 400 };
      if (st.adminOnlyLink && !admin) return { error: 'Bare admin kan koble profiler på denne serveren', status: 403 };
      row = q('INSERT INTO profiles37(name, created) VALUES(?,?) RETURNING *').get(name, Date.now());
    }
    const cur = rowOfUser(uid);
    if (st.adminOnlyLink && !admin && !(cur && cur.id === row.id)) return { error: 'Bare admin kan koble profiler på denne serveren. Be admin koble deg.', status: 403 };
    if (cur && cur.id !== row.id) q('UPDATE profiles37 SET user_id=NULL, linked_at=NULL, linked_by=NULL WHERE id=?').run(cur.id);
    const c = cleanConsents(consents);
    q('UPDATE profiles37 SET user_id=?, linked_at=?, linked_by=?, consents=? WHERE id=?').run(uid, Date.now(), cur?.id === row.id ? row.linked_by ?? actor : actor, JSON.stringify(c), row.id);
    return { profile: profileOut(rowById(row.id), uid), consents: c, changed: !cur || cur.id !== row.id };
  })();
}

const api = new Hono();
api.use('/profiles', authOrToken);
api.use('/profiles/*', authOrToken);
api.use('/onboarding/*', authOrToken);
api.use('/users/:id/profile', authOrToken);
api.get('/profiles', (c) => c.json(profilesFor(c.get('user'))));
api.get('/profiles/me', (c) => { const r = rowOfUser(c.get('user')); return c.json({ profile: r ? profileOut(r, c.get('user')) : null, consents: r ? parseJ(r.consents, {}) : null }); });
api.post('/onboarding/link', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  if (b.profileId == null && !b.newProfileName) return c.json({ error: 'Velg en profil eller skriv navnet ditt' }, 400);
  const r = linkProfile(u, { profileId: b.profileId ?? null, newProfileName: b.newProfileName ?? null, consents: b.consents ?? {} });
  if (r.error) return c.json({ error: r.error }, r.status);
  if (r.changed) {
    const me = userInfo(u);
    try {
      const { notifyUser } = await import('./notify.js');
      for (const a of listUsers().filter((x) => x.role === 'admin' && x.id !== u)) await notifyUser(a.id, { title: 'Ny profilkobling', body: `@${me?.username} koblet seg til profilen ${r.profile.name}`, tag: `profil-${u}`, category: 'system', url: '/#/innstillinger/brukere' });
    } catch { /* varsel er best effort */ }
  }
  return c.json({ profile: r.profile, consents: r.consents, next: { requestLocation: !!r.consents.location, requestHealth: !!r.consents.health } });
});
api.put('/users/:id/profile', async (c) => {
  const actor = c.get('user');
  if (!isAdmin(actor)) return c.json({ error: 'Bare administratorer kan koble profiler' }, 403);
  const uid = c.req.param('id');
  if (!userInfo(uid)) return c.json({ error: 'Fant ikke brukeren' }, 404);
  const b = await c.req.json().catch(() => ({}));
  if (b.profileId === null) {
    q('UPDATE profiles37 SET user_id=NULL, linked_at=NULL, linked_by=NULL WHERE user_id=?').run(uid);
    return c.json({ profile: null });
  }
  if (b.profileId === undefined && !b.newProfileName) return c.json({ error: 'profileId mangler' }, 400);
  const r = linkProfile(uid, { profileId: b.profileId ?? null, newProfileName: b.newProfileName ?? null, consents: b.consents }, { actor });
  if (r.error) return c.json({ error: r.error }, r.status);
  return c.json({ profile: r.profile });
});
api.put('/profiles/settings', async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan endre dette' }, 403);
  const b = await c.req.json().catch(() => ({}));
  const next = { ...settings(), ...(b.adminOnlyLink !== undefined ? { adminOnlyLink: !!b.adminOnlyLink } : {}) };
  kv.set(OWNER, 'profiles37_settings', next);
  return c.json(next);
});
api.get('/profiles/settings', (c) => c.json(settings()));
export default api;
