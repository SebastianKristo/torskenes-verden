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
  if (sid) {
    const row = db.prepare('SELECT user, expires FROM sessions WHERE id=?').get(sidKey(sid));
    if (row && row.expires >= Date.now()) return row.user;
  }
  // Pålitelig enhet: passordet hoppes over kun med gyldig enhetscookie OG klient på lokalt nett.
  const dev = trustedDevice(c);
  if (dev) { createSession(c); return dev.user; }
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
  if (existing && db.prepare('UPDATE devices SET paused=0, last_seen=? WHERE id=?').run(Date.now(), existing).changes) return;
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
  const row = db.prepare('SELECT * FROM devices WHERE id=? AND paused=0').get(id);
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
