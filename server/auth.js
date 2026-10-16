import { randomBytes, createHmac } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, OWNER } from './db.js';
import { config } from './config.js';

const COOKIE = 'hl_sid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dager

// Sesjons-ID lagres hashet med SESSION_SECRET, så en lekket database ikke gir gyldige cookies.
const sidKey = (sid) => createHmac('sha256', config.sessionSecret || 'dev').update(sid).digest('hex');

export function createSession(c) {
  const sid = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(id,user,created,expires) VALUES(?,?,?,?)').run(sidKey(sid), OWNER, now, now + MAX_AGE * 1000);
  setCookie(c, COOKIE, sid, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: MAX_AGE });
}

export function destroySession(c) {
  const sid = getCookie(c, COOKIE);
  if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sidKey(sid));
  deleteCookie(c, COOKIE, { path: '/' });
}

export function sessionUser(c) {
  const sid = getCookie(c, COOKIE);
  if (!sid) return null;
  const row = db.prepare('SELECT user, expires FROM sessions WHERE id=?').get(sidKey(sid));
  if (!row || row.expires < Date.now()) return null;
  return row.user;
}

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3600_000).unref();

// Rate limiting per IP: maks 5 feil på 15 min, deretter sperre.
const attempts = new Map();
const WINDOW = 15 * 60_000, MAX_FAILS = 5;

export function clientIp(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.env?.incoming?.socket?.remoteAddress || 'ukjent';
}

export function loginBlocked(ip) {
  const a = attempts.get(ip);
  if (!a || a.reset < Date.now()) return 0;
  return a.fails >= MAX_FAILS ? Math.ceil((a.reset - Date.now()) / 1000) : 0;
}

export function loginFailed(ip) {
  const a = attempts.get(ip);
  if (!a || a.reset < Date.now()) attempts.set(ip, { fails: 1, reset: Date.now() + WINDOW });
  else a.fails++;
}

export function loginSucceeded(ip) { attempts.delete(ip); }

export const requireAuth = async (c, next) => {
  const user = sessionUser(c);
  if (!user) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', user);
  await next();
};
