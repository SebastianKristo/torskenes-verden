// Prompt 38 (SERVER38): innlogging med QR-kode fra en mobil som allerede er logget inn (+ 2FA), app-økt for Kalender på Mac,
// «Logg ut av alle enheter» og antall økter. Montert i index.js (qrAuthApi under /api/auth, meApi under /api, GET /l/:code).
//
// ── QR-innlogging ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Sikkerhet: QR-en inneholder bare sid + engangs-nonce (aldri et token). Sesjonen lever 60 s (pending), 90 s etter skanning og
// 60 s etter godkjenning. Den er bundet til nettleseren som laget den (httpOnly-cookie hlqr_<sid> med en tilfeldig nøkkel +
// samme User-Agent), så SSE/finish ikke kan brukes fra en annen nettleser. Engangs: en kode kan skannes én gang. 2-sifret
// matchkode vises på begge skjermene. Godkjenning krever biometric:true fra mobilen. Har brukeren 2FA, gir finish bare en
// pre-auth-billett (5 min, 5 forsøk); POST /api/auth/2fa {code} fullfører. Rate limit per IP (lage/skanne) og per bruker.
//
// POST /api/auth/qr                         (uinnlogget) → 201 {sid, nonce, url:'https://<host>/l/<sid>.<nonce>',
//                                             deepLink:'homelab://login?c=<sid>.<nonce>', code:'<sid>.<nonce>', clientKey, expiresAt, ttl:60}
//                                             + cookie hlqr_<sid> (path /api/auth/qr). Apper uten cookie-lager sender clientKey som
//                                             X-QR-Key-header, body.key eller ?key= (SSE). clientKey står aldri i QR-en.
//   Alle tilstandssvar har state = status = type (og SSE-hendelsens navn er det samme).
// GET  /api/auth/qr/:sid/events             (SSE, samme nettleser) event = state, data = {state, sid, expiresAt, user?, match?, needs2fa?}
//                                             pending → scanned{user:{name, avatarUrl}, match:'42'} → approved{needs2fa} | denied | expired → done
// GET  /api/auth/qr/:sid                    (samme nettleser) → samme JSON som siste SSE-hendelse (polling)
// POST /api/auth/qr/scan {code}             (innlogget mobil: økt eller token med finance:write)
//                                           → {sid, device:{name, os, browser, ip, place}, account:{id, name, username, avatarUrl}, match, expiresAt}
// POST /api/auth/qr/approve {sid, approve, biometric:true | reauthToken, match?} (samme bruker som skannet) → {ok, state:'approved'|'denied', needs2fa}
// POST /api/auth/qr/finish {sid}            (samme nettleser) → {ok:true, user, device, trusted:true} + økt-cookie
//                                           eller {needs2fa:true, ticket} + pre-auth-cookie (hl_pre) → POST /api/auth/2fa {code}
// GET  /l/:sid.:nonce                       → mobil: /finans/#/l/<sid>.<nonce> (PWA-en), ellers /login – godkjenner aldri noe selv.
//
// ── App-økt (Kalender på Mac) ───────────────────────────────────────────────────────────────────────────────────────────
// POST /api/auth/app-session {token}        → {ok, user:{id, username, name}, expiresAt} + vanlig økt-cookie (hl_sid).
//   Bare companion-token for app 'kalender' eller fh_-token med finance:write. Logges (GET /api/me/sessions → recent).
//
// ── Konto → ØKT ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout-all {password | reauthToken, keepCurrent?:false} → {ok, count, sessions, tokens, devices}
//   Ugyldiggjør alle økter, pålitelige enheter og app-tokens (ikke personlige Glimt-API-nøkler). Krever passord eller
//   fersk re-auth (POST /api/auth/reauth). keepCurrent:true beholder økten/tokenet som spør.
// GET  /api/me/sessions                     → {count, web, apps, devices, current:{session, token}, recent:[{kind, at, device, ip}]}
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, kv, OWNER } from './db.js';
import { config } from './config.js';
import { createSession, cookieSecure, rememberDevice, userInfo, clientIp, trustIp, isLan, createTicket, checkPassword, loginBlocked, loginFailed, loginSucceeded, currentSessionId, currentDeviceId, listUsers } from './auth.js';
import { authOrToken } from './mobile.js';
import { notifyUser } from './notify.js';
import { consumeReauth } from './reauth.js';
import { tokenAccessOf } from './finans/routes.js';
import { db as fhDb } from './finans/db.js';

export const QR_TTL_MS = 60_000, QR_SCANNED_MS = 90_000, QR_APPROVED_MS = 60_000;
const sha = (s) => createHash('sha256').update(String(s ?? '')).digest();
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_RE = /([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{16,64})/;
const bad = (c, error, code = 400, extra = {}) => c.json({ error, ...extra }, code, { 'Cache-Control': 'no-store' });
const isJson = (c) => /application\/json/i.test(c.req.header('content-type') ?? '');

/* ---------------- Logg ---------------- */

/** Sikkerhetslogg per bruker (siste 50). kind: 'qr' | 'app-session' | 'logout-all' | 'qr-denied' */
export function logAuth(user, entry) {
  const list = kv.get(user, 'auth_log38', []) ?? [];
  const e = { at: new Date().toISOString(), ...entry };
  kv.set(user, 'auth_log38', [e, ...(Array.isArray(list) ? list : [])].slice(0, 50));
  console.log(`[auth] ${entry.kind} · ${user} · ${entry.device ?? ''} · ${entry.ip ?? ''}`);
}

/* ---------------- Enhet ---------------- */

export function deviceOf(c) {
  const ua = c.req.header('user-agent') ?? '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Ukjent';
  const app = /KalenderMac|Kalender\//.test(ua) ? 'Kalender' : /FinansHub|Homelab\//.test(ua) ? 'Homelab' : null;
  const browser = app ?? (/Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Nettleser');
  const ip = trustIp(c) || clientIp(c);
  const city = c.req.header('cf-ipcity'), country = c.req.header('cf-ipcountry');
  const place = isLan(ip) ? 'Hjemmenettet' : city ? `${city}${country ? `, ${country}` : ''}` : country && country !== 'XX' ? country : null;
  return { name: `${os} · ${browser}`, os, browser, ip, place };
}

/* ---------------- QR-sesjoner (bare i minnet) ---------------- */

const qrs = new Map(); // sid → sesjon
const createHits = new Map(); // ip → [ts]
const scanFails = new Map(); // bruker → {n, reset}
const qrTickets = new Map(); // pre-auth-billett → {sid, device}
const CREATE_MAX = 30, CREATE_WINDOW = 5 * 60_000, SCAN_MAX_FAILS = 10, SCAN_WINDOW = 15 * 60_000;
const TERMINAL = new Set(['denied', 'expired', 'done']);

function sweep(now = Date.now()) {
  for (const [k, s] of qrs) {
    if (!TERMINAL.has(s.state) && s.exp <= now) setState(s, 'expired');
    if (TERMINAL.has(s.state) && now - s.exp > 5 * 60_000) qrs.delete(k);
  }
  for (const [k, v] of qrTickets) if (v.exp < now) qrTickets.delete(k);
  for (const [k, v] of createHits) { const keep = v.filter((t) => now - t < CREATE_WINDOW); if (keep.length) createHits.set(k, keep); else createHits.delete(k); }
}
setInterval(() => sweep(), 1000).unref();

function stateOut(s) {
  const u = s.user ? userInfo(s.user) : null;
  return { state: s.state, status: s.state, type: s.state, sid: s.sid, expiresAt: new Date(s.exp).toISOString(),
    ...(u && ['scanned', 'approved', 'done'].includes(s.state) ? { user: { name: u.displayName ?? u.name, avatarUrl: u.avatarUrl ?? null }, match: s.match } : {}),
    ...(s.state === 'approved' || (s.state === 'done' && s.needs2fa != null) ? { needs2fa: !!s.needs2fa } : {}) };
}
function setState(s, state, patch = {}) {
  Object.assign(s, patch, { state });
  const out = stateOut(s);
  for (const fn of s.subs) { try { fn(out); } catch { /* */ } }
  if (TERMINAL.has(state)) s.subs.clear();
}
const cookieName = (sid) => `hlqr_${sid}`;
// Nøkkelen kommer som cookie (nettleser), eller fra appene som X-QR-Key-header / body.key / ?key= (EventSource). Den står aldri i QR-en.
function bound(c, s, body = null) {
  const k = getCookie(c, cookieName(s.sid)) || c.req.header('x-qr-key') || body?.key || c.req.query('key');
  return !!k && same(sha(k), s.keyHash) && same(sha(c.req.header('user-agent') ?? ''), s.uaHash);
}
function live(sid) {
  if (!ID_RE.test(String(sid ?? ''))) return null;
  const s = qrs.get(sid);
  if (!s) return null;
  if (!TERMINAL.has(s.state) && s.exp <= Date.now()) setState(s, 'expired');
  return s;
}
const hostOf = (c) => {
  const h = String(c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '').split(',')[0].trim();
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(h) ? h : 'home.kristo.no';
};
const scanBlocked = (u) => { const f = scanFails.get(u); return f && f.reset > Date.now() && f.n >= SCAN_MAX_FAILS; };
const scanFailed = (u) => { const f = scanFails.get(u); if (!f || f.reset < Date.now()) scanFails.set(u, { n: 1, reset: Date.now() + SCAN_WINDOW }); else f.n++; };

/** Pre-auth-billetten fra QR-innloggingen (cookie hl_pre), for POST /api/auth/2fa uten ticket i kroppen. */
export const preAuthTicket = (c) => getCookie(c, 'hl_pre') || null;
/** Kalles etter vellykket 2FA: var billetten fra QR, legges enheten til og admin varsles. */
export function qrAfter2fa(c, ticket, user) {
  deleteCookie(c, 'hl_pre', { path: '/api/auth' });
  const t = ticket && qrTickets.get(ticket);
  if (!t) return false;
  qrTickets.delete(ticket);
  announce(user, t.device, true);
  return true;
}
function announce(user, device, twoFa) {
  logAuth(user, { kind: 'qr', device: device.name, ip: device.ip, place: device.place, twoFa: !!twoFa });
  const u = userInfo(user);
  const body = `${u?.name ?? 'En bruker'} logget inn på ${device.name} med QR-kode${device.place ? ` · ${device.place}` : ''}. Enheten står under Pålitelige enheter.`;
  const to = new Set([user, ...listUsers().filter((x) => x.role === 'admin').map((x) => x.id)]);
  for (const id of to) notifyUser(id, { title: 'Ny enhet logget inn', body, tag: 'qr-login', category: 'system', url: '/#/innstillinger/enheter', data: { kind: 'qr-login', device } }).catch(() => {});
}

export const qrAuthApi = new Hono();

qrAuthApi.post('/qr', (c) => {
  const ip = clientIp(c), now = Date.now();
  sweep(now);
  const hits = createHits.get(ip) ?? [];
  if (hits.length >= CREATE_MAX) return bad(c, 'For mange QR-koder. Vent litt og prøv igjen.', 429);
  createHits.set(ip, [...hits, now]);
  const sid = randomBytes(16).toString('base64url'), nonce = randomBytes(18).toString('base64url'), key = randomBytes(32).toString('base64url');
  const s = { sid, nonceHash: sha(nonce), keyHash: sha(key), uaHash: sha(c.req.header('user-agent') ?? ''), device: deviceOf(c), created: now, exp: now + QR_TTL_MS,
    state: 'pending', user: null, match: String(randomInt(10, 100)), needs2fa: null, subs: new Set() };
  qrs.set(sid, s);
  setCookie(c, cookieName(sid), key, { httpOnly: true, secure: cookieSecure(c), sameSite: 'Strict', path: '/api/auth/qr', maxAge: 300 });
  const code = `${sid}.${nonce}`;
  return c.json({ sid, nonce, code, clientKey: key, url: `https://${hostOf(c)}/l/${code}`, deepLink: `homelab://login?c=${code}`, expiresAt: new Date(s.exp).toISOString(), ttl: QR_TTL_MS / 1000 },
    201, { 'Cache-Control': 'no-store' });
});

qrAuthApi.get('/qr/:sid/events', (c) => {
  const s = live(c.req.param('sid'));
  if (!s) return bad(c, 'Fant ikke QR-koden', 404, { state: 'expired' });
  if (!bound(c, s)) return bad(c, 'QR-koden hører til en annen nettleser', 403);
  return streamSSE(c, async (st) => {
    await st.writeSSE({ event: s.state, data: JSON.stringify(stateOut(s)) });
    if (TERMINAL.has(s.state)) return;
    await new Promise((resolve) => {
      let closed = false;
      const done = () => { if (closed) return; closed = true; s.subs.delete(fn); clearInterval(ping); clearTimeout(tm); resolve(); };
      const fn = (out) => { st.writeSSE({ event: out.state, data: JSON.stringify(out) }).catch(() => {}).finally(() => { if (TERMINAL.has(out.state)) done(); }); };
      s.subs.add(fn);
      const ping = setInterval(() => st.writeSSE({ event: 'ping', data: '{}' }).catch(() => done()), 15_000);
      // Utløp uten annen hendelse: sweep() setter expired; tidsavbruddet er en ekstra sikring.
      const tm = setTimeout(() => { if (!TERMINAL.has(s.state)) setState(s, 'expired'); done(); }, Math.max(0, s.exp - Date.now()) + QR_SCANNED_MS + QR_APPROVED_MS);
      st.onAbort(done);
    });
  });
});

qrAuthApi.get('/qr/:sid', (c) => {
  const s = live(c.req.param('sid'));
  if (!s) return c.json({ state: 'expired', status: 'expired', type: 'expired', sid: c.req.param('sid') }, 404, { 'Cache-Control': 'no-store' });
  if (!bound(c, s)) return bad(c, 'QR-koden hører til en annen nettleser', 403);
  return c.json(stateOut(s), 200, { 'Cache-Control': 'no-store' });
});

qrAuthApi.post('/qr/scan', authOrToken, async (c) => {
  const user = c.get('user');
  if (scanBlocked(user)) return bad(c, 'For mange ugyldige koder. Prøv igjen om 15 min.', 429);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const m = String(b.code ?? b.c ?? '').match(CODE_RE) ?? (b.sid && b.nonce ? [null, String(b.sid), String(b.nonce)] : null);
  if (!m) { scanFailed(user); return bad(c, 'Det er ikke en Homelab-innloggingskode'); }
  const s = live(m[1]);
  if (!s || !same(sha(m[2]), s.nonceHash)) { scanFailed(user); return bad(c, 'Ukjent eller utløpt kode. Be om en ny QR-kode.', 404); }
  if (s.state === 'expired') return bad(c, 'Koden er utløpt. Den fornyes automatisk på den andre skjermen.', 410, { state: 'expired' });
  if (s.state !== 'pending') return bad(c, 'Koden er allerede brukt', 409, { state: s.state });
  setState(s, 'scanned', { user, exp: Date.now() + QR_SCANNED_MS });
  const u = userInfo(user);
  return c.json({ sid: s.sid, device: s.device, account: { id: u.id, name: u.displayName ?? u.name, username: u.username, avatarUrl: u.avatarUrl ?? null, totp: !!u.totp },
    match: s.match, expiresAt: new Date(s.exp).toISOString(), needsBiometric: true }, 200, { 'Cache-Control': 'no-store' });
});

qrAuthApi.post('/qr/approve', authOrToken, async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({})) ?? {};
  const s = live(b.sid);
  if (!s || s.user !== user) return bad(c, 'Fant ikke innloggingen', 404);
  if (s.state !== 'scanned') return bad(c, s.state === 'expired' ? 'Innloggingen er utløpt' : 'Innloggingen er allerede behandlet', 409, { state: s.state });
  if (b.approve === false) {
    setState(s, 'denied', { exp: Date.now() });
    logAuth(user, { kind: 'qr-denied', device: s.device.name, ip: s.device.ip });
    return c.json({ ok: true, state: 'denied' });
  }
  if (b.approve !== true) return bad(c, 'approve må være true eller false');
  // Biometri på mobilen, eller (enheter uten biometri) et ferskt engangs re-auth-token fra POST /api/auth/reauth {password}.
  if (b.biometric !== true && !(b.reauthToken && consumeReauth(b.reauthToken, user))) return bad(c, 'Bekreft med Face ID, Touch ID, fingeravtrykk eller passordet på mobilen', 400, { needsBiometric: true });
  if (b.match !== undefined && String(b.match) !== s.match) return bad(c, 'Tallet stemmer ikke med skjermen', 400);
  const needs2fa = !!userInfo(user)?.totp;
  setState(s, 'approved', { needs2fa, exp: Date.now() + QR_APPROVED_MS });
  return c.json({ ok: true, state: 'approved', needs2fa, device: s.device });
});

qrAuthApi.post('/qr/finish', async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const s = live(b.sid ?? String(b.code ?? '').match(CODE_RE)?.[1]);
  if (!s) return bad(c, 'Fant ikke QR-koden', 404, { state: 'expired' });
  if (!bound(c, s, b)) return bad(c, 'QR-koden hører til en annen nettleser', 403);
  if (s.state !== 'approved') return bad(c, s.state === 'denied' ? 'Innloggingen ble avvist' : s.state === 'expired' ? 'Koden er utløpt' : 'Venter på godkjenning på mobilen', 409, { state: s.state });
  const user = s.user;
  deleteCookie(c, cookieName(s.sid), { path: '/api/auth/qr' });
  if (s.needs2fa) {
    const ticket = createTicket(user, true);
    qrTickets.set(ticket, { sid: s.sid, device: s.device, exp: Date.now() + 5 * 60_000 });
    setCookie(c, 'hl_pre', ticket, { httpOnly: true, secure: cookieSecure(c), sameSite: 'Strict', path: '/api/auth', maxAge: 300 });
    setState(s, 'done', { exp: Date.now() });
    return c.json({ needs2fa: true, ticket, user: { name: userInfo(user)?.displayName ?? null } }, 200, { 'Cache-Control': 'no-store' });
  }
  createSession(c, user);
  rememberDevice(c, user);
  setState(s, 'done', { exp: Date.now() });
  announce(user, s.device, false);
  return c.json({ ok: true, user: userInfo(user), device: s.device, trusted: true }, 200, { 'Cache-Control': 'no-store' });
});

/* ---------------- App-økt (Kalender på Mac) ---------------- */

/** Token → {user, tokenId, companion} når det er et companion-token for Kalender eller et fh_-token med finance:write. */
export function appTokenAccess(token) {
  const t = String(token ?? '').trim().replace(/^Bearer\s+/i, '');
  if (!/^fh_[A-Za-z0-9_-]{20,}$/.test(t)) return null;
  const raw = new Request('http://intern/', { headers: { authorization: `Bearer ${t}` } });
  const a = tokenAccessOf({ req: { raw, header: (n) => raw.headers.get(n) ?? undefined }, env: {}, get: () => undefined, set: () => {} });
  if (!a || a.session || !userInfo(a.user)) return null;
  let companion = false;
  try { companion = !!fhDb.prepare("SELECT 1 FROM fh_companion_tokens WHERE token_id=? AND user_id=? AND app='kalender'").get(a.tokenId, a.user); } catch { /* tabellen finnes ikke */ }
  if (!companion && !a.scopes.has('finance:write')) return null;
  return { user: a.user, tokenId: a.tokenId, companion };
}

qrAuthApi.post('/app-session', async (c) => {
  // Innloggings-CSRF: token i kroppen bare som JSON (et skjema på en annen side kan ikke sende det); Authorization-header går alltid.
  if (!isJson(c) && !c.req.header('authorization')) return bad(c, 'Forventet JSON', 415);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const a = appTokenAccess(b.token ?? c.req.header('authorization'));
  if (!a) { loginFailed(ip); return bad(c, 'Ugyldig app-token (bare Kalender-token eller token med finance:write)', 401); }
  loginSucceeded(ip);
  createSession(c, a.user);
  const dev = deviceOf(c), u = userInfo(a.user);
  logAuth(a.user, { kind: 'app-session', device: b.device ? String(b.device).slice(0, 40) : dev.name, ip: dev.ip, companion: a.companion });
  return c.json({ ok: true, user: { id: u.id, username: u.username, name: u.name }, expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() }, 200, { 'Cache-Control': 'no-store' });
});

/* ---------------- Logg ut av alle enheter ---------------- */

const GLIMT_API = 'Glimt-API: %';
const appTokens = (user) => fhDb.prepare('SELECT id FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name NOT LIKE ?').pluck().all(OWNER, user, GLIMT_API);
const currentTokenId = (c) => { const h = c.req.header('authorization'); if (!h) return null; const a = appTokenAccess(h); return a?.tokenId ?? null; };

qrAuthApi.post('/logout-all', authOrToken, async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({})) ?? {};
  const ip = clientIp(c);
  let ok = false;
  if (b.reauthToken) ok = consumeReauth(b.reauthToken, user);
  else if (b.password) {
    const wait = loginBlocked(ip);
    if (wait) return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429);
    ok = checkPassword(user, b.password);
    if (ok) loginSucceeded(ip); else loginFailed(ip);
  }
  if (!ok) return bad(c, 'Bekreft med passordet eller Face ID først', 403, { needsReauth: true });
  const keep = b.keepCurrent === true, curSid = keep ? currentSessionId(c) : null, curTok = keep ? currentTokenId(c) : null, curDev = keep ? currentDeviceId(c) : null;
  const res = db.transaction(() => ({
    sessions: db.prepare('DELETE FROM sessions WHERE user=? AND id IS NOT ?').run(user, curSid).changes,
    devices: db.prepare('DELETE FROM devices WHERE user=? AND id IS NOT ?').run(user, curDev).changes,
  }))();
  let tokens = 0;
  for (const id of appTokens(user)) {
    if (id === curTok) continue;
    tokens += fhDb.prepare('DELETE FROM fh_tokens WHERE id=?').run(id).changes;
    try { fhDb.prepare('DELETE FROM fh_companion_tokens WHERE token_id=?').run(id); } catch { /* */ }
  }
  if (!keep) { deleteCookie(c, 'hl_sid', { path: '/' }); deleteCookie(c, 'hl_dev', { path: '/' }); }
  const count = res.sessions + tokens;
  logAuth(user, { kind: 'logout-all', device: deviceOf(c).name, ip, count });
  return c.json({ ok: true, count, sessions: res.sessions, tokens, devices: res.devices, keptCurrent: keep });
});

/* ---------------- GET /api/me/sessions ---------------- */

export const meSessionsApi = new Hono();
meSessionsApi.get('/me/sessions', authOrToken, (c) => {
  const user = c.get('user');
  const web = db.prepare('SELECT COUNT(*) n FROM sessions WHERE user=? AND expires>=?').get(user, Date.now()).n;
  const devices = db.prepare('SELECT COUNT(*) n FROM devices WHERE user=?').get(user).n;
  let apps = 0;
  try { apps = fhDb.prepare('SELECT COUNT(*) n FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name NOT LIKE ? AND (expires IS NULL OR expires>=?)').get(OWNER, user, GLIMT_API, Date.now()).n; } catch { apps = 0; }
  const recent = (kv.get(user, 'auth_log38', []) ?? []).slice(0, 10);
  return c.json({ count: web + apps, web, apps, devices, current: { session: !!currentSessionId(c), token: !!c.req.header('authorization') }, recent }, 200, { 'Cache-Control': 'no-store' });
});

/* ---------------- GET /l/:code (universal link / systemkameraet) ---------------- */

export function qrLinkHandler(c) {
  const code = String(c.req.param('code') ?? '');
  const m = code.match(/^([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{16,64})$/);
  if (!m || !/iPhone|iPad|iPod|Android|Mobile/i.test(c.req.header('user-agent') ?? '')) return c.redirect('/login');
  return c.redirect(`/finans/#/l/${code}`);
}

export const _qr38 = { qrs, createHits, scanFails, qrTickets, sweep };

/* ---------------- Universal links / App Links for /l/* ---------------- */
// GET /.well-known/assetlinks.json → [] uten ANDROID_CERT_SHA256, ellers Android-appen (no.kristo.finanshub) med fingeravtrykket.
// GET /.well-known/apple-app-site-association → 404 uten APPLE_APP_ID (f.eks. TEAMID.no.kristo.finanshub), ellers applinks for /l/*.
const WK_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' };
export function assetLinksHandler(c) {
  const fps = String(process.env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const pkg = /^[a-z][\w.]{2,100}$/i.test(process.env.ANDROID_PACKAGE ?? '') ? process.env.ANDROID_PACKAGE : 'no.kristo.finanshub';
  const body = fps.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fps } }] : [];
  return c.body(JSON.stringify(body), 200, WK_HEADERS);
}
export function appleAssociationHandler(c) {
  const ids = String(process.env.APPLE_APP_ID ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{10}\.[\w.-]+$/.test(s));
  if (!ids.length) return c.body(JSON.stringify({ error: 'Ikke satt opp' }), 404, WK_HEADERS);
  return c.body(JSON.stringify({ applinks: { apps: [], details: ids.map((appID) => ({ appID, appIDs: [appID], paths: ['/l/*'], components: [{ '/': '/l/*' }] })) } }), 200, WK_HEADERS);
}
