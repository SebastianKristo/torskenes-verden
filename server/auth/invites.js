// Onboarding for nye familiemedlemmer: admin lager en invitasjon med engangskode (QR eller lenke), den nye personen velger
// brukernavn og passord og blir logget inn. Flyttet fra webx51.js (Fase 2b, auth-delen); stier og svar er de samme.
//
//   POST   /api/onboard51/invites (admin) · GET /api/onboard51/invites (admin) · DELETE /api/onboard51/invites/:id (admin)
//   POST   /api/onboard51/preview {id, code | link}  (uinnlogget)
//   POST   /api/onboard51/accept {id, code | link, username, password, name?, share?, client?, device?, platform?} (uinnlogget)
//   GET    /join/:id.:code                     → veiviseren (public/join.html)
//
// Sikkerhet: invitasjonen er en engangskode, aldri et token. QR/lenke har bare id + kode + offentlig server-URL, koden lagres bare
// som hash, varer maks 7 døgn, kan brukes én gang og trekkes tilbake. Nye kontoer fra en invitasjon er alltid vanlige brukere, og
// app-tokenet får aldri bredere scope enn en vanlig app-innlogging. Ugyldige koder telles i sperren (rate-limit.js, scope qr, per IP).
// Den nye kontoen går gjennom samme enhetsgodkjenning og revisjonslogg som annen innlogging (security.js gate51/afterLogin51).
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db, q, kv } from '../db.js';
import { authOrToken } from '../mobile.js';
import { sessionSecret86 } from './server-secret.js';
import { userInfo, isAdmin, createUser, createSession, trustIp, serverName, rememberDevice } from './session.js';
import { notifyUser } from '../notify.js';
import { qrSvg } from './totp.js';
import { publicUrl46, originOf46 } from './server-address.js';
import { blocked51, fail51, clear51 } from './rate-limit.js';
import { gate51, afterLogin51 } from './security.js';
import { issueToken, SCOPES as FH_SCOPES } from '../finans/routes.js';
import { fold42 } from '../finans/search-db.js';
import { setShare51 } from '../familie/sharing.js'; // delingsvalgene (posisjon, helse, kalender) eies av Familie

db.exec(`CREATE TABLE IF NOT EXISTS onboard51_invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, name TEXT NOT NULL, username TEXT, share TEXT NOT NULL DEFAULT '{}',
  note TEXT, created INTEGER NOT NULL, created_by TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER, user_id TEXT, revoked_at INTEGER);`);

const HOUR = 3_600_000, DAY = 86_400_000;
const NO_STORE = { 'Cache-Control': 'no-store' };
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status, NO_STORE);
const isoOf = (t) => (t ? new Date(t).toISOString() : null);
const nameOf = (id) => { const u = userInfo(id); return u?.displayName ?? u?.name ?? u?.username ?? null; };

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // uten 0/O/1/I
const newCode = () => { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[randomInt(CODE_ABC.length)]; return `${s.slice(0, 4)}-${s.slice(4)}`; };
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeHash = (id, code) => createHash('sha256').update(`onboard51:${sessionSecret86('dev')}:${id}:${normCode(code)}`).digest('hex');
const ID_RE = /^inv51_[A-Za-z0-9_-]{8,40}$/;
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const shareIn = (s, d = { location: false, health: false, calendar: true }) => ({
  location: typeof s?.location === 'boolean' ? s.location : d.location, health: typeof s?.health === 'boolean' ? s.health : d.health, calendar: typeof s?.calendar === 'boolean' ? s.calendar : d.calendar });
const stateOf = (r, now = Date.now()) => (r.revoked_at ? 'revoked' : r.used_at ? 'used' : r.expires <= now ? 'expired' : 'open');
const inviteOut = (r) => {
  let share = {}; try { share = JSON.parse(r.share); } catch { /* */ }
  return { id: r.id, name: r.name, username: r.username ?? null, share: shareIn(share), note: r.note ?? null, createdAt: isoOf(r.created), createdBy: r.created_by, createdByName: nameOf(r.created_by),
    expiresAt: isoOf(r.expires), state: stateOf(r), usedAt: isoOf(r.used_at), userId: r.user_id ?? null };
};
const slugUser = (name) => fold42(name).replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32) || 'bruker';
function suggestUsername(r) {
  const base = r.username && USERNAME_RE.test(r.username) ? r.username : slugUser(r.name);
  let u = base, i = 2;
  while (q('SELECT 1 FROM users WHERE username=?').get(u)) u = `${base.slice(0, 29)}${i++}`;
  return u;
}
/** «papir://join?i=…&c=…», «https://…/join/<id>.<code>» eller «<id>.<code>» → {id, code} */
export function parseInviteLink51(s) {
  const t = String(s ?? '').trim();
  try {
    if (/^papir:\/\/join\?/i.test(t)) { const u = new URL(t.replace(/^papir:\/\//i, 'https://x/')); return { id: u.searchParams.get('i'), code: u.searchParams.get('c') }; }
    if (/^https?:\/\//i.test(t)) { const m = new URL(t).pathname.match(/\/join\/([^/.]+)\.([A-Za-z0-9-]+)$/); if (m) return { id: m[1], code: m[2] }; }
  } catch { /* */ }
  const m = t.match(/^(inv51_[A-Za-z0-9_-]{8,40})\.([A-Za-z0-9-]{4,20})$/);
  return m ? { id: m[1], code: m[2] } : { id: null, code: null };
}
function ipKey(c) { return trustIp(c) || 'ukjent'; }
/** Finner en åpen invitasjon med riktig kode. → {row} | {status, error, code} */
function checkInvite(c, b) {
  const ip = ipKey(c);
  const wait = blocked51('qr', 'ip', ip);
  if (wait) return { status: 429, error: `For mange forsøk. Prøv igjen om ${Math.max(1, Math.ceil(wait / 60))} min.`, code: 'rate', retryAfter: wait };
  const parsed = b.link ? parseInviteLink51(b.link) : { id: b.id, code: b.code };
  const id = String(parsed.id ?? ''), code = String(parsed.code ?? '');
  const row = ID_RE.test(id) ? q('SELECT * FROM onboard51_invites WHERE id=?').get(id) : null;
  const ok = row && (() => { const a = Buffer.from(row.code_hash, 'hex'), x = Buffer.from(codeHash(id, code), 'hex'); return a.length === x.length && timingSafeEqual(a, x); })();
  if (!ok) { fail51('qr', 'ip', ip); return { status: 404, error: 'Invitasjonen finnes ikke, eller koden er feil.', code: 'invalid' }; }
  const st = stateOf(row);
  if (st === 'used') return { status: 410, error: 'Invitasjonen er allerede brukt.', code: 'used' };
  if (st === 'revoked') return { status: 410, error: 'Invitasjonen er trukket tilbake.', code: 'revoked' };
  if (st === 'expired') return { status: 410, error: 'Invitasjonen er utløpt. Be om en ny.', code: 'expired' };
  clear51('qr', 'ip', ip);
  return { row };
}

export const invitesApi = new Hono();
const admin = (c) => (isAdmin(c.get('user')) ? null : bad(c, 'Bare for administrator', 403));

invitesApi.post('/onboard51/invites', authOrToken, async (c) => {
  const no = admin(c); if (no) return no;
  const b = await body(c);
  const name = clean(b.name, 60);
  if (!name) return bad(c, 'Navn mangler');
  let username = b.username ? String(b.username).trim().toLowerCase().replace(/^@/, '') : null;
  if (username && !USERNAME_RE.test(username)) return bad(c, 'Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek');
  if (username && q('SELECT 1 FROM users WHERE username=?').get(username)) return bad(c, 'Brukernavnet finnes allerede', 409);
  const ttl = b.ttlHours == null ? 48 : Number(b.ttlHours);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 168) return bad(c, 'ttlHours må være 1–168');
  const id = `inv51_${randomBytes(12).toString('base64url')}`, code = newCode(), now = Date.now();
  q('INSERT INTO onboard51_invites(id, code_hash, name, username, share, note, created, created_by, expires) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, codeHash(id, code), name, username, JSON.stringify(shareIn(b.share)), clean(b.note, 200) || null, now, c.get('user'), now + Math.round(ttl * HOUR));
  const srv = (publicUrl46() || originOf46(c) || '').replace(/\/$/, '');
  const url = `${srv}/join/${id}.${code}`;
  const qr = `papir://join?i=${encodeURIComponent(id)}&c=${encodeURIComponent(code)}${srv ? `&srv=${encodeURIComponent(srv)}` : ''}`;
  return c.json({ invite: inviteOut(q('SELECT * FROM onboard51_invites WHERE id=?').get(id)), code, url, qr, qrSvg: qrSvg(qr, { px: 220, dark: '#17150f', light: '#ffffff' }) }, 201, NO_STORE);
});
invitesApi.get('/onboard51/invites', authOrToken, (c) => {
  const no = admin(c); if (no) return no;
  return c.json({ invites: q('SELECT * FROM onboard51_invites WHERE created > ? ORDER BY created DESC LIMIT 100').all(Date.now() - 90 * DAY).map(inviteOut) }, 200, NO_STORE);
});
invitesApi.delete('/onboard51/invites/:id', authOrToken, (c) => {
  const no = admin(c); if (no) return no;
  const r = q('SELECT * FROM onboard51_invites WHERE id=?').get(c.req.param('id'));
  if (!r) return bad(c, 'Fant ikke invitasjonen', 404);
  if (!r.used_at && !r.revoked_at) q('UPDATE onboard51_invites SET revoked_at=? WHERE id=?').run(Date.now(), r.id);
  return c.json({ ok: true, invite: inviteOut(q('SELECT * FROM onboard51_invites WHERE id=?').get(r.id)) }, 200, NO_STORE);
});
invitesApi.post('/onboard51/preview', async (c) => {
  const r = checkInvite(c, await body(c));
  if (!r.row) return c.json({ error: r.error, code: r.code, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status, NO_STORE);
  const inv = inviteOut(r.row);
  return c.json({ ok: true, id: inv.id, name: inv.name, usernameSuggestion: suggestUsername(r.row), serverName: serverName(), invitedBy: inv.createdByName, share: inv.share, expiresAt: inv.expiresAt }, 200, NO_STORE);
});
invitesApi.post('/onboard51/accept', async (c) => {
  const b = await body(c);
  const r = checkInvite(c, b);
  if (!r.row) return c.json({ error: r.error, code: r.code, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status, NO_STORE);
  const inv = r.row;
  const username = String(b.username ?? inv.username ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!USERNAME_RE.test(username)) return bad(c, 'Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek', 400, { code: 'username' });
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return bad(c, 'Passordet må ha minst 8 tegn', 400, { code: 'password' });
  if (q('SELECT 1 FROM users WHERE username=?').get(username)) return bad(c, 'Brukernavnet finnes allerede', 409, { code: 'username_taken' });
  let user;
  // Engangs: merk invitasjonen brukt i samme transaksjon som kontoen lages (to samtidige forsøk → bare ett lykkes).
  try {
    user = db.transaction(() => {
      if (q('UPDATE onboard51_invites SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires>?').run(Date.now(), inv.id, Date.now()).changes !== 1) throw Object.assign(new Error('Invitasjonen er allerede brukt.'), { status: 410 });
      // Scope-regel: alltid vanlig bruker, aldri admin via invitasjon.
      const u = createUser({ username, password: b.password, role: 'bruker', name: clean(b.name, 60) || inv.name });
      q('UPDATE onboard51_invites SET user_id=? WHERE id=?').run(u.id, inv.id);
      return u;
    })();
  } catch (e) { return bad(c, e.message || 'Kunne ikke lage kontoen', e.status ?? 400); }
  let invShare = {}; try { invShare = JSON.parse(inv.share); } catch { /* */ }
  const share = setShare51(user.id, shareIn(b.share, shareIn(invShare)));
  kv.set(user.id, 'onboard51', { invite: inv.id, at: Date.now(), by: inv.created_by });
  notifyUser(inv.created_by, { title: `${user.name ?? user.username} er med nå`, body: `Invitasjonen ble brukt. Deler: ${[share.location && 'posisjon', share.health && 'helse', share.calendar && 'kalender'].filter(Boolean).join(', ') || 'ingenting ennå'}.`, category: 'system', url: '/#/familie', tag: `onboard51-${inv.id}` }).catch(() => {});
  const app = b.client === 'app';
  const g = gate51(c, user.id, { method: 'password', kind: app ? 'token' : 'web', tokenName: clean(b.device, 60) || null });
  if (g.pending) return c.json({ error: 'Ny enhet må godkjennes', code: 'DEVICE_APPROVAL_REQUIRED', pendingApproval: true }, 403, NO_STORE); // skal ikke skje (første enhet)
  if (app) {
    const t = issueToken(user.id, { name: `${clean(b.device, 40) || (b.platform === 'android' ? 'Android' : b.platform === 'ios' ? 'iPhone' : 'App')} (invitasjon)`, scopes: [...FH_SCOPES], expires: null });
    try { afterLogin51(c, user.id, 'token', { detail: { onboard51: inv.id } }); } catch { /* */ }
    return c.json({ ok: true, user: { id: user.id, username: user.username, role: user.role, name: user.name }, token: t.token, scopes: t.scopes ?? [...FH_SCOPES], share }, 201, NO_STORE);
  }
  createSession(c, user.id);
  try { rememberDevice(c, user.id); } catch { /* */ }
  if (g.setCookie) c.header('Set-Cookie', g.setCookie, { append: true });
  try { afterLogin51(c, user.id, 'password', { detail: { onboard51: inv.id } }); } catch { /* */ }
  return c.json({ ok: true, user: { id: user.id, username: user.username, role: user.role, name: user.name }, share, next: '/#/dash' }, 201, NO_STORE);
});

/** Monteres rett etter mountWebx51 i index.js (samme plass i rekkefølgen som før). */
export function mountInvites(app) {
  app.route('/api', invitesApi);
  app.get('/join/:token', async (c) => c.html(await readFile(join(resolve('public'), 'join.html'), 'utf8'), 200, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }));
}
