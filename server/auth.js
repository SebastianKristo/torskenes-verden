import { randomBytes, createHmac } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, kv, OWNER } from './db.js';
import { config } from './config.js';
import { hashPassword, verifyPassword } from './password.js';
import { passwordHash as legacyPasswordHash, setPasswordHash as setLegacyPasswordHash } from './settings.js';
import { verifyTotp, newSecret, base32Encode, otpauthUrl, qrSvg, encryptSecret, decryptSecret, newRecoveryCodes, recoveryHash } from './totp.js';

const COOKIE = 'hl_sid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dager

// Sesjons-ID lagres hashet med SESSION_SECRET, så en lekket database ikke gir gyldige cookies.
const sidKey = (sid) => createHmac('sha256', config.sessionSecret || 'dev').update(sid).digest('hex');

/* ---------------- Brukere ---------------- */

export const USERNAME_RE = /^[a-z0-9._-]{2,32}$/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Første oppstart etter oppgradering: eieren blir hovedadmin med samme id som før (OWNER), så alle data i kv beholdes.
// Passordet hentes fra «Bytt passord» (kv) eller APP_PASSWORD_HASH. Finnes verken bruker eller passord,
// er dette en ny server, og /login viser førstegangsoppsettet i stedet (se setupServer).
function ensureOwner() {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    // Eksisterende installasjon fra før prompt 06: eieren (ellers eldste admin) blir hovedadmin.
    if (!db.prepare('SELECT 1 FROM users WHERE is_main_admin=1').get()) {
      const main = db.prepare("SELECT id FROM users WHERE id=?").get(OWNER) ?? db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created LIMIT 1").get();
      if (main) db.prepare('UPDATE users SET is_main_admin=1 WHERE id=?').run(main.id);
    }
    return;
  }
  if (!legacyPasswordHash()) return;
  const name = config.userName || 'Admin';
  db.prepare('INSERT INTO users(id,username,name,pw_hash,role,is_main_admin,created) VALUES(?,?,?,?,?,1,?)')
    .run(OWNER, slugUsername(name) || 'admin', name, legacyPasswordHash(), 'admin', Date.now());
}

/** Foreslått brukernavn fra et navn: små bokstaver, æ→ae, ø→o, å→a, bare a–z og 0–9. */
export function slugUsername(name) {
  return String(name ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/[øö]/g, 'o').replace(/[åä]/g, 'a').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 32);
}

export const needsSetup = () => !db.prepare('SELECT 1 FROM users LIMIT 1').get();

/** Servernavnet fra førstegangsoppsettet (vises i menyen og mobilappen). */
export const serverName = () => kv.get(OWNER, 'server_name', 'Homelab');
export function setServerName(name) {
  const n = String(name ?? '').trim().slice(0, 40);
  if (!n) throw httpError('Skriv inn et navn på serveren', 400);
  kv.set(OWNER, 'server_name', n);
  return n;
}

/**
 * Førstegangsoppsett: lager hovedadmin (id = OWNER, så eksisterende data i kv beholdes) og lagrer servernavnet.
 * Virker bare når det ikke finnes noen brukere.
 */
export function setupServer({ adminName, serverName: srv, username, password }) {
  const name = String(adminName ?? '').trim().slice(0, 60);
  const u = String(username ?? '').trim().toLowerCase();
  if (!name) throw httpError('Skriv inn navnet til hovedadmin', 400);
  if (!/^[a-z0-9._-]{2,32}$/.test(u)) throw httpError('Brukernavn: minst 2 tegn, bare a–z, 0–9, punktum, bindestrek og understrek', 400);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw httpError('Passordet må ha minst 8 tegn', 400);
  const h = hashPassword(password);
  const ok = db.transaction(() => {
    if (!needsSetup()) return false;
    db.prepare('INSERT INTO users(id,username,name,pw_hash,role,is_main_admin,created) VALUES(?,?,?,?,?,1,?)').run(OWNER, u, name, h, 'admin', Date.now());
    kv.set(OWNER, 'server_name', String(srv ?? '').trim().slice(0, 40) || 'Homelab');
    return true;
  })();
  if (!ok) throw httpError('Serveren er allerede satt opp', 409);
  setLegacyPasswordHash(h);
  return userInfo(OWNER);
}

const userRow = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const userByName = (username) => db.prepare('SELECT * FROM users WHERE username=?').get(String(username ?? '').trim().toLowerCase());
// Eieren kan mangle hash hvis APP_PASSWORD_HASH ble satt etter første oppstart; da brukes den.
const hashOf = (u) => u.pw_hash || (u.id === OWNER ? legacyPasswordHash() : '');

const avatarVersion = (id) => kv.get(id, 'avatar_v', 0);
const publicUser = (u) => u && { id: u.id, username: u.username, role: u.role, name: u.name || cap(u.username), displayName: u.name || cap(u.username),
  totp: !!u.totp_enabled, isMainAdmin: !!u.is_main_admin, avatarUrl: avatarVersion(u.id) ? `/api/users/${u.id}/avatar?v=${avatarVersion(u.id)}` : null };
// Standardtema (prompt 14): en ny installasjon (tom database) får Papir på nett og mobil og onboarding etter første
// innlogging. Eksisterende installasjoner beholder «Nåværende» og «Klassisk». Avgjøres én gang, før eieren opprettes.
if (!kv.get(OWNER, 'install_kind')) kv.set(OWNER, 'install_kind', db.prepare('SELECT 1 FROM users LIMIT 1').get() ? 'legacy' : 'papir');
export const installKind = () => kv.get(OWNER, 'install_kind', 'legacy');
ensureOwner();

/** {id,username,role,name,totp} eller null. */
export const userInfo = (id) => publicUser(userRow(id)) ?? null;

export const listUsers = () => db.prepare('SELECT * FROM users ORDER BY role=\'admin\' DESC, created').all().map(publicUser);

export const isAdmin = (id) => userRow(id)?.role === 'admin';

const adminCount = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n;

export function createUser({ username, password, role = 'bruker', name = '' }) {
  const u = String(username ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw httpError('Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek', 400);
  if (userByName(u)) throw httpError('Brukernavnet finnes allerede', 409);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw httpError('Passord må ha minst 8 tegn', 400);
  if (!['admin', 'bruker'].includes(role)) throw httpError('Ugyldig rolle', 400);
  const id = 'u_' + randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users(id,username,name,pw_hash,role,created) VALUES(?,?,?,?,?,?)')
    .run(id, u, String(name || cap(u)).slice(0, 60), hashPassword(password), role, Date.now());
  return userInfo(id);
}

export function deleteUser(id, actingId) {
  const u = userRow(id);
  if (!u) throw httpError('Fant ikke brukeren', 404);
  if (id === actingId) throw httpError('Du kan ikke fjerne deg selv', 400);
  if (id === OWNER || u.is_main_admin) throw httpError('Hovedadmin kan ikke fjernes', 400);
  if (u.role === 'admin' && adminCount() < 2) throw httpError('Det må finnes minst én administrator', 400);
  db.transaction(() => {
    for (const t of ['sessions', 'devices', 'kv']) db.prepare(`DELETE FROM ${t} WHERE user=?`).run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
  })();
}

export function updateUser(id, { role, password, name, displayName, resetTotp, username }) {
  name = displayName ?? name;
  const u = userRow(id);
  if (!u) throw httpError('Fant ikke brukeren', 404);
  if (role !== undefined) {
    if (!['admin', 'bruker'].includes(role)) throw httpError('Ugyldig rolle', 400);
    if (u.role === 'admin' && role !== 'admin' && (adminCount() < 2 || id === OWNER || u.is_main_admin)) throw httpError(id === OWNER || u.is_main_admin ? 'Hovedadmin må være administrator' : 'Det må finnes minst én administrator', 400);
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
  }
  if (password !== undefined) setPassword(id, password);
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) throw httpError('Navnet kan ikke være tomt', 400);
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim().slice(0, 60), id);
  }
  if (username !== undefined) {
    const un = String(username ?? '').trim().toLowerCase().replace(/^@/, '');
    if (!USERNAME_RE.test(un)) throw httpError('Brukernavn: 2–32 tegn, bokstaver, tall, punktum, bindestrek eller understrek', 400);
    if (un !== u.username) {
      if (db.prepare('SELECT 1 FROM users WHERE username=? AND id<>?').get(un, id)) throw httpError('Brukernavnet er allerede i bruk', 409);
      db.prepare('UPDATE users SET username=? WHERE id=?').run(un, id);
    }
  }
  if (resetTotp) db.prepare("UPDATE users SET totp_enabled=0, totp_secret_enc=NULL, recovery_hashes='[]', totp_last_step=-1 WHERE id=?").run(id);
  return userInfo(id);
}

export function setPassword(id, password, { keepSession } = {}) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw httpError('Nytt passord må ha minst 8 tegn', 400);
  const h = hashPassword(password);
  db.prepare('UPDATE users SET pw_hash=? WHERE id=?').run(h, id);
  // Eldre kode (og nedgradering) leser fortsatt eierens passord herfra.
  if (id === OWNER) setLegacyPasswordHash(h);
  // Logg ut alle andre økter for brukeren.
  if (keepSession) db.prepare('DELETE FROM sessions WHERE user=? AND id<>?').run(id, keepSession);
  else db.prepare('DELETE FROM sessions WHERE user=?').run(id);
}

export const checkPassword = (id, password) => { const u = userRow(id); return !!u && !!hashOf(u) && verifyPassword(String(password ?? ''), hashOf(u)); };

function httpError(message, status) { const e = new Error(message); e.status = status; return e; }

/* ---------------- Tofaktor ---------------- */

// Sjekker TOTP-kode (avviser gjenbruk av samme tidsvindu) eller en gjenopprettingskode (brukes én gang).
export function checkSecondFactor(id, code) {
  const u = userRow(id);
  if (!u?.totp_enabled || !u.totp_secret_enc) return false;
  const c = String(code ?? '').trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const step = verifyTotp(decryptSecret(u.totp_secret_enc), c.replace(/\s/g, ''), { lastStep: u.totp_last_step });
    if (step < 0) return false;
    db.prepare('UPDATE users SET totp_last_step=? WHERE id=?').run(step, id);
    return true;
  }
  const hashes = JSON.parse(u.recovery_hashes || '[]'), h = recoveryHash(c), i = hashes.indexOf(h);
  if (i < 0) return false;
  hashes.splice(i, 1);
  db.prepare('UPDATE users SET recovery_hashes=? WHERE id=?').run(JSON.stringify(hashes), id);
  return true;
}

// Steg 1: ny hemmelighet lagres kryptert som «ventende» i 10 min til brukeren har bekreftet en kode.
export function startTotpSetup(id) {
  const u = userRow(id);
  if (!u) throw httpError('Fant ikke brukeren', 404);
  const secret = newSecret(), b32 = base32Encode(secret), url = otpauthUrl(u.username, b32);
  kv.set(id, 'totp_pending', { enc: encryptSecret(secret), exp: Date.now() + 10 * 60_000 });
  return { otpauthUrl: url, secret: b32.replace(/(.{4})/g, '$1 ').trim(), qrSvg: qrSvg(url) };
}

// Steg 2: koden bekrefter at appen er satt opp riktig. Gir 10 gjenopprettingskoder (vises én gang).
export function confirmTotpSetup(id, code) {
  const p = kv.get(id, 'totp_pending');
  if (!p || p.exp < Date.now()) throw httpError('Oppsettet er utløpt. Start på nytt.', 400);
  const step = verifyTotp(decryptSecret(p.enc), code);
  if (step < 0) throw httpError('Koden stemmer ikke. Sjekk klokka på telefonen.', 400);
  const codes = newRecoveryCodes();
  db.prepare('UPDATE users SET totp_secret_enc=?, totp_enabled=1, totp_last_step=?, recovery_hashes=? WHERE id=?')
    .run(p.enc, step, JSON.stringify(codes.map(recoveryHash)), id);
  kv.del(id, 'totp_pending');
  return codes;
}

// Å slå av krever passord eller en gyldig kode.
export function disableTotp(id, { password, code }) {
  if (!(password && checkPassword(id, password)) && !(code && checkSecondFactor(id, code))) throw httpError('Feil passord eller kode', 403);
  updateUser(id, { resetTotp: true });
}

/* ---------------- Rate limiting ---------------- */

// Per IP: maks 5 feil på 15 min. Per brukernavn: maks 10 feil på 15 min (utestengning).
const attempts = new Map();
const WINDOW = 15 * 60_000, MAX_FAILS = 5, MAX_USER_FAILS = 10;

export function clientIp(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.env?.incoming?.socket?.remoteAddress || 'ukjent';
}

function blockedFor(key, max) {
  const a = attempts.get(key);
  if (!a || a.reset < Date.now()) return 0;
  return a.fails >= max ? Math.ceil((a.reset - Date.now()) / 1000) : 0;
}
function fail(key) {
  const a = attempts.get(key);
  if (!a || a.reset < Date.now()) attempts.set(key, { fails: 1, reset: Date.now() + WINDOW });
  else a.fails++;
}

export const loginBlocked = (ip) => blockedFor(ip, MAX_FAILS);
export const loginFailed = (ip) => fail(ip);
export const loginSucceeded = (ip) => attempts.delete(ip);

/**
 * Felles innloggingssjekk for web, mobilapper og FinansHub-tokens.
 * username tom = eieren (bakoverkompatibelt med innlogging med bare passord).
 * → {ok:true,user} | {ok:false,needsTotp:true,status:401,error} | {ok:false,status,error}
 */
let dummyHash = null;
export function verifyLogin(username, password, code, ip = 'ukjent') {
  const uname = String(username ?? '').trim().toLowerCase();
  const u = uname ? userByName(uname) : userRow(OWNER);
  const ukey = 'u:' + (u ? u.id : uname);
  const wait = Math.max(loginBlocked(ip), blockedFor(ukey, MAX_USER_FAILS));
  if (wait) return { ok: false, status: 429, error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` };
  const bad = uname ? 'Feil brukernavn eller passord' : 'Feil passord';
  // Ukjent bruker bruker like lang tid som feil passord, så brukernavn ikke kan gjettes ut fra svartiden.
  if (!u || !hashOf(u)) verifyPassword(String(password ?? ''), dummyHash ??= hashPassword(randomBytes(12).toString('hex')));
  if (!u || !hashOf(u) || !verifyPassword(String(password ?? ''), hashOf(u))) {
    fail(ip); fail(ukey);
    return { ok: false, status: 401, error: bad };
  }
  if (u.totp_enabled) {
    if (code === undefined || code === null || code === '') return { ok: false, needsTotp: true, status: 401, error: 'Tofaktor-kode kreves', user: { id: u.id, username: u.username } };
    if (!checkSecondFactor(u.id, code)) { fail(ip); fail(ukey); return { ok: false, needsTotp: true, status: 401, error: 'Feil kode. Prøv igjen.' }; }
  }
  loginSucceeded(ip); attempts.delete(ukey);
  return { ok: true, user: userInfo(u.id) };
}

// Steg 2 på web: passordet er allerede sjekket; billetten gjelder 5 min og 5 forsøk.
const tickets = new Map();
export function createTicket(userId, remember) {
  const t = randomBytes(24).toString('base64url');
  tickets.set(t, { userId, remember: !!remember, exp: Date.now() + 5 * 60_000, tries: 0 });
  return t;
}
export function redeemTicket(ticket, code, ip) {
  const t = tickets.get(String(ticket ?? ''));
  if (!t || t.exp < Date.now()) { tickets.delete(ticket); return { ok: false, status: 401, error: 'Innloggingen er utløpt. Start på nytt.', expired: true }; }
  const wait = Math.max(loginBlocked(ip), blockedFor('u:' + t.userId, MAX_USER_FAILS));
  if (wait) return { ok: false, status: 429, error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` };
  if (!checkSecondFactor(t.userId, code)) {
    fail(ip); fail('u:' + t.userId);
    if (++t.tries >= 5) { tickets.delete(ticket); return { ok: false, status: 401, error: 'For mange feil koder. Start på nytt.', expired: true }; }
    return { ok: false, status: 401, error: 'Feil kode. Prøv igjen.' };
  }
  tickets.delete(ticket);
  loginSucceeded(ip);
  return { ok: true, user: userInfo(t.userId), remember: t.remember };
}
setInterval(() => { const now = Date.now(); for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k); }, 60_000).unref();

/* ---------------- Sesjoner ---------------- */

export function createSession(c, user = OWNER) {
  const sid = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(id,user,created,expires) VALUES(?,?,?,?)').run(sidKey(sid), user, now, now + MAX_AGE * 1000);
  setCookie(c, COOKIE, sid, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: MAX_AGE });
  return sidKey(sid);
}

export const currentSessionId = (c) => { const sid = getCookie(c, COOKIE); return sid ? sidKey(sid) : null; };

export function destroySession(c) {
  const sid = getCookie(c, COOKIE);
  if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sidKey(sid));
  deleteCookie(c, COOKIE, { path: '/' });
}

export function sessionUser(c) {
  const sid = getCookie(c, COOKIE);
  if (sid) {
    const row = db.prepare('SELECT s.user, s.expires FROM sessions s JOIN users u ON u.id=s.user WHERE s.id=?').get(sidKey(sid));
    if (row && row.expires >= Date.now()) return row.user;
  }
  // Pålitelig enhet: passordet hoppes over kun med gyldig enhetscookie OG klient på lokalt nett.
  const dev = trustedDevice(c);
  if (dev) { createSession(c, dev.user); return dev.user; }
  return null;
}

/* ---------------- Pålitelige enheter ---------------- */

const DEVICE_COOKIE = 'hl_dev';
const DEVICE_AGE = 60 * 60 * 24 * 365; // 1 år

// Adressen som avgjør om klienten er på lokalt nett:
// - Bak Cloudflare Tunnel setter Cloudflare CF-Connecting-IP til klientens ekte (offentlige) adresse og
//   overskriver det klienten sender, så trafikk fra internett blir aldri regnet som lokal.
// - Ellers brukes adressen fra selve TCP-tilkoblingen.
// X-Forwarded-For og lignende brukes aldri her, fordi klienten kan sette dem selv.
export function trustIp(c) {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf.trim();
  return (c.env?.incoming?.socket?.remoteAddress ?? '').replace(/^::ffff:/, '');
}

export function isLan(ip) {
  if (/^(10|127)\.\d+\.\d+\.\d+$/.test(ip) || /^192\.168\.\d+\.\d+$/.test(ip) || ip === '::1') return true;
  const m = ip.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
}

function deviceName(c) {
  const ua = c.req.header('user-agent') ?? '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'ukjent system';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Nettleser';
  return `${br} på ${os}`;
}

export const currentDeviceId = (c) => { const t = getCookie(c, DEVICE_COOKIE); return t ? sidKey(t) : null; };

export function rememberDevice(c, user) {
  const existing = currentDeviceId(c);
  if (existing) {
    // Samme nettleser og samme bruker: bare aktiver igjen. En annen bruker får en ny enhet i stedet.
    if (db.prepare('UPDATE devices SET paused=0, last_seen=? WHERE id=? AND user=?').run(Date.now(), existing, user).changes) return;
    db.prepare('DELETE FROM devices WHERE id=?').run(existing);
  }
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO devices(id,user,name,created,last_seen,last_ip) VALUES(?,?,?,?,?,?)').run(sidKey(token), user, deviceName(c), now, now, trustIp(c));
  setCookie(c, DEVICE_COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: DEVICE_AGE });
}

function trustedDevice(c) {
  const id = currentDeviceId(c);
  if (!id) return null;
  const ip = trustIp(c);
  if (!isLan(ip)) return null;
  const row = db.prepare('SELECT d.* FROM devices d JOIN users u ON u.id=d.user WHERE d.id=? AND d.paused=0').get(id);
  if (!row || row.created + DEVICE_AGE * 1000 < Date.now()) return null;
  db.prepare('UPDATE devices SET last_seen=?, last_ip=? WHERE id=?').run(Date.now(), ip, id);
  return row;
}

// «Lås» skal faktisk låse: enheten logges ikke inn automatisk før neste innlogging med passord.
export function pauseDevice(c) {
  const id = currentDeviceId(c);
  if (id) db.prepare('UPDATE devices SET paused=1 WHERE id=?').run(id);
}

export function forgetDevice(c, id = currentDeviceId(c)) {
  if (id) db.prepare('DELETE FROM devices WHERE id=?').run(id);
  if (id === currentDeviceId(c)) deleteCookie(c, DEVICE_COOKIE, { path: '/' });
}

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3600_000).unref();

/* ---------------- Mellomvare ---------------- */

export const requireAuth = async (c, next) => {
  const user = sessionUser(c);
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', user);
  c.set('role', userRow(user)?.role ?? 'bruker');
  await next();
};

export const requireAdmin = async (c, next) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
