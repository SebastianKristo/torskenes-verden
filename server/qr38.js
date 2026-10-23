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
//
// ── Prompt 46 (SERVER46): QR-innlogging i appene (claude-code-qr-innlogging-finans-kalender.md) ─────────────────────────────
// Bygger på samme sesjoner som over. Enheten som skal logges inn (Kalender Mac/iOS/Android, Finans iOS/Android) viser QR,
// en innlogget Finans-/Kalender-app skanner og godkjenner med biometri/PIN. QR-en har bare sessionId + engangskode + offentlig
// server-URL (PUBLIC_URL, aldri en Docker-IP) – ALDRI et token. 2 min, én gang, rate-limit på oppretting og polling.
// POST /api/auth/qr/session {app:'kalender'|'finans', platform:'mac'|'ios'|'android', device?}
//      → 201 {sessionId, code, expiresAt, ttl:120, qr:'papir://login?s=…&c=…&srv=…', server, clientKey, app, platform}
//      (clientKey sendes som X-QR-Key ved polling; den står aldri i QR-en.)
// GET  /api/auth/qr/session/:id  (X-QR-Key) → {state:'pending'|'scanned'|'approved'|'denied'|'expired'|'done', expiresAt, user?, match?}
//      Ved godkjenning: ÉN gang {state:'done', token, refresh?, refreshExpires?, expires, user, device, app} – et NYTT token for denne
//      enheten (egen enhetsøkt: Kalender = companion-token + refresh som /api/auth/token, Finans = eget fh_-token). Vises i
//      Innstillinger → Enheter og kan logges ut der. Senere polling → {state:'done'} uten token.
// POST /api/auth/qr/scan {code:'papir://login?s=…&c=…' | 's.c'} → som før (enhetsnavn, plattform, app, sted/IP) + app/platform
// POST /api/auth/qr/approve {sessionId, code, approve:true, biometric:true | reauthToken} – skann og godkjenn i ett kall
//      (eller {sid, approve, biometric} etter /scan som før). Bare innlogget bruker (økt eller token med finance:write).
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, kv, OWNER } from './db.js';
import { config } from './config.js';
import { sessionUser, createSession, cookieSecure, rememberDevice, userInfo, clientIp, trustIp, isLan, createTicket, checkPassword, loginBlocked, loginFailed, loginSucceeded, currentSessionId, currentDeviceId, listUsers } from './auth.js';
import { authOrToken } from './mobile.js';
import { notifyUser } from './notify.js';
import { consumeReauth } from './reauth.js';
import { tokenAccessOf } from './finans/routes.js';
import { db as fhDb } from './finans/db.js';
import { issueToken, SCOPES as FH_SCOPES } from './finans/routes.js';
import { issueCompanion41 } from './auth41.js';
import { originOf46, hostOf46 } from './public-url46.js';

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
// Prompt 46: PUBLIC_URL / klarert X-Forwarded-Host / Host – aldri en Docker-IP (public-url46.js).
const hostOf = (c) => hostOf46(c);
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

/* ---------------- Prompt 46: QR-innlogging for appene ---------------- */

export const QR46_TTL_MS = 120_000;
const APP46 = { kalender: 'Kalender', finans: 'Finans' }, PLATFORM46 = { mac: 'Mac', ios: 'iOS', ipados: 'iPad', android: 'Android' };
const PAPIR_RE = /[?&]s=([A-Za-z0-9_-]{16,64})(?:&|.*?&)c=([A-Za-z0-9_-]{16,64})/;
/** «papir://login?s=…&c=…&srv=…», «s.c», eller {sid|sessionId, nonce|code} → [sid, nonce] | null */
export function parseQrCode46(b = {}) {
  const raw = String(b.code ?? b.c ?? b.qr ?? '');
  const sid = b.sessionId ?? b.sid, code = b.code;
  if (sid && code && ID_RE.test(String(sid)) && ID_RE.test(String(code))) return [String(sid), String(code)];
  const p = raw.match(PAPIR_RE);
  if (p) return [p[1], p[2]];
  const m = raw.match(CODE_RE);
  if (m) return [m[1], m[2]];
  return b.sid && b.nonce ? [String(b.sid), String(b.nonce)] : null;
}
const pollHits = new Map(); // ip → [ts]
const POLL_MAX = 240, POLL_WINDOW = 60_000, POLL_PER_SESSION = 200;
setInterval(() => { const now = Date.now(); for (const [k, v] of pollHits) { const keep = v.filter((t) => now - t < POLL_WINDOW); if (keep.length) pollHits.set(k, keep); else pollHits.delete(k); } }, 30_000).unref();
const cleanDevice46 = (v) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
/** Nytt token for enheten som viste QR-en (egen enhetsøkt, aldri skannerens token). */
function issueFor46(s) {
  const u = userInfo(s.user);
  const device = s.deviceName || s.device.name;
  if (s.app === 'kalender') {
    const t = issueCompanion41(s.user, 'kalender', device, s.scopes, null, `qr:${s.sid.slice(0, 12)}`);
    return { ...t, app: 'kalender' };
  }
  const t = issueToken(s.user, { name: `${device} (QR)`.slice(0, 60), scopes: s.scopes, expires: null });
  return { token: t.token, id: t.id, scopes: t.scopes, expires: t.expires ?? null, app: 'finans', device, user: { id: u.id, username: u.username, role: u.role, name: u.name ?? u.displayName ?? null } };
}
// Prompt 46 (koordinatoravgjørelse): hvem kan skanne/godkjenne? Økt i nettleseren eller fh_-token med finance:write = «finans»
// (kan godkjenne alle økter). Kalender-token (companion, app 'kalender') = «kalender»: kan BARE godkjenne Kalender-økter
// (Mac/iOS/Android), aldri Finans-/web-innlogging (403). Den nye enheten får aldri bredere scope enn skanneren har.
function scannerOf46(c) {
  const sid = sessionUser(c);
  if (sid && userInfo(sid)) return { user: sid, kind: 'finans', scopes: [...FH_SCOPES] };
  const a = tokenAccessOf(c);
  if (!a || a.session || !userInfo(a.user)) return null;
  let companion = false;
  try { companion = !!fhDb.prepare("SELECT 1 FROM fh_companion_tokens WHERE token_id=? AND user_id=? AND app='kalender'").get(a.tokenId, a.user); } catch { /* */ }
  const scopes = [...a.scopes].filter((x) => FH_SCOPES.includes(x));
  if (companion) return { user: a.user, kind: 'kalender', scopes };
  if (!a.scopes.has('finance:write')) return null;
  return { user: a.user, kind: 'finans', scopes };
}
const scanner46 = async (c, next) => {
  const sc = scannerOf46(c);
  if (!sc) return c.json({ error: 'Ikke innlogget', code: 'HOMELAB_AUTH' }, 401);
  c.set('user', sc.user); c.set('scanner46', sc);
  await next();
};
/** Kan denne skanneren godkjenne sesjonen? Kalender-token bare Kalender-økter. */
const mayApprove46 = (sc, s) => sc.kind === 'finans' || s.app === 'kalender' || (!s.app && s.appHint === 'kalender');

qrAuthApi.post('/qr/session', async (c) => {
  if (!isJson(c)) return bad(c, 'Forventet JSON', 415);
  const ip = clientIp(c), now = Date.now();
  sweep(now);
  const hits = createHits.get(ip) ?? [];
  if (hits.length >= CREATE_MAX) return bad(c, 'For mange QR-koder. Vent litt og prøv igjen.', 429);
  createHits.set(ip, [...hits, now]);
  const b = await c.req.json().catch(() => ({})) ?? {};
  const app = String(b.app ?? '').toLowerCase(), platform = String(b.platform ?? '').toLowerCase();
  if (!APP46[app]) return bad(c, 'app må være kalender eller finans');
  if (platform && !PLATFORM46[platform]) return bad(c, 'platform må være mac, ios, ipados eller android');
  const sid = randomBytes(16).toString('base64url'), nonce = randomBytes(18).toString('base64url'), key = randomBytes(32).toString('base64url');
  const dev = deviceOf(c);
  const plat = PLATFORM46[platform] ?? dev.os;
  const device = { ...dev, os: plat, browser: APP46[app], name: `${plat} · ${APP46[app]}` };
  const s = { sid, nonceHash: sha(nonce), keyHash: sha(key), uaHash: sha(c.req.header('user-agent') ?? ''), device, created: now, exp: now + QR46_TTL_MS,
    state: 'pending', user: null, match: String(randomInt(10, 100)), needs2fa: null, subs: new Set(), app, platform: platform || null,
    deviceName: cleanDevice46(b.device ?? b.deviceName) || null, scopes: [], polls: 0, issued: false };
  qrs.set(sid, s);
  const srv = originOf46(c);
  const qr = `papir://login?s=${sid}&c=${nonce}${srv ? `&srv=${encodeURIComponent(srv)}` : ''}`;
  return c.json({ sessionId: sid, code: nonce, expiresAt: new Date(s.exp).toISOString(), ttl: QR46_TTL_MS / 1000, qr, server: srv || null, clientKey: key, app, platform: s.platform,
    hint: 'Skann med Papir Finans på mobilen' }, 201, { 'Cache-Control': 'no-store' });
});
qrAuthApi.get('/qr/session/:id', (c) => {
  const ip = clientIp(c), now = Date.now();
  const hits = pollHits.get(ip) ?? [];
  if (hits.length >= POLL_MAX) return bad(c, 'For mange forespørsler. Vent litt.', 429);
  pollHits.set(ip, [...hits, now]);
  const s = live(c.req.param('id'));
  if (!s || !s.app) return c.json({ state: 'expired', status: 'expired', sessionId: c.req.param('id') }, 404, { 'Cache-Control': 'no-store' });
  if (!bound(c, s)) return bad(c, 'QR-koden hører til en annen enhet', 403);
  if (++s.polls > POLL_PER_SESSION) return bad(c, 'For mange forespørsler for denne koden. Lag en ny QR-kode.', 429);
  const out = { ...stateOut(s), sessionId: s.sid, app: s.app };
  delete out.needs2fa;
  if (s.state === 'approved' && !s.issued) {
    s.issued = true;
    let t;
    try { t = issueFor46(s); } catch (e) { setState(s, 'denied', { exp: Date.now() }); return bad(c, e.message, e.status ?? 500, { state: 'denied' }); }
    setState(s, 'done', { exp: Date.now() });
    logAuth(s.user, { kind: 'qr-app', device: s.deviceName || s.device.name, ip: s.device.ip, place: s.device.place, app: s.app });
    announce(s.user, { ...s.device, name: s.deviceName || s.device.name }, false);
    return c.json({ ...stateOut(s), sessionId: s.sid, ...t, state: 'done', status: 'done', type: 'done' }, 200, { 'Cache-Control': 'no-store' });
  }
  return c.json(out, 200, { 'Cache-Control': 'no-store' });
});

qrAuthApi.post('/qr', async (c) => {
  const ip = clientIp(c), now = Date.now();
  // Prompt 46: den gamle flyten (Kalender iOS/Mac) kan si hvilken app den er: {app:'kalender'|'finans'} eller User-Agent «KalenderMac/…».
  const b0 = isJson(c) ? (await c.req.json().catch(() => ({})) ?? {}) : {};
  const appHint = b0.app === 'kalender' || /KalenderMac|Kalender\//.test(c.req.header('user-agent') ?? '') ? 'kalender' : b0.app === 'finans' ? 'finans' : null;
  sweep(now);
  const hits = createHits.get(ip) ?? [];
  if (hits.length >= CREATE_MAX) return bad(c, 'For mange QR-koder. Vent litt og prøv igjen.', 429);
  createHits.set(ip, [...hits, now]);
  const sid = randomBytes(16).toString('base64url'), nonce = randomBytes(18).toString('base64url'), key = randomBytes(32).toString('base64url');
  const s = { sid, nonceHash: sha(nonce), keyHash: sha(key), uaHash: sha(c.req.header('user-agent') ?? ''), device: deviceOf(c), created: now, exp: now + QR_TTL_MS,
    state: 'pending', user: null, match: String(randomInt(10, 100)), needs2fa: null, subs: new Set(), appHint, scopes: [], approver: null };
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

qrAuthApi.post('/qr/scan', scanner46, async (c) => {
  const user = c.get('user');
  if (scanBlocked(user)) return bad(c, 'For mange ugyldige koder. Prøv igjen om 15 min.', 429);
  const b = await c.req.json().catch(() => ({})) ?? {};
  // Prompt 46: også papir://login?s=…&c=…&srv=… og {sessionId, code}.
  const p = parseQrCode46(b);
  const m = p ? [null, p[0], p[1]] : null;
  if (!m) { scanFailed(user); return bad(c, 'Det er ikke en Homelab-innloggingskode'); }
  const s = live(m[1]);
  if (!s || !same(sha(m[2]), s.nonceHash)) { scanFailed(user); return bad(c, 'Ukjent eller utløpt kode. Be om en ny QR-kode.', 404); }
  if (!mayApprove46(c.get('scanner46'), s)) return bad(c, 'Kalender kan bare godkjenne innlogging i Kalender. Skann med Papir Finans.', 403, { code: 'SCANNER_SCOPE' });
  if (s.state === 'expired') return bad(c, 'Koden er utløpt. Den fornyes automatisk på den andre skjermen.', 410, { state: 'expired' });
  if (s.state !== 'pending') return bad(c, 'Koden er allerede brukt', 409, { state: s.state });
  setState(s, 'scanned', { user, exp: Date.now() + QR_SCANNED_MS });
  const u = userInfo(user);
  return c.json({ sid: s.sid, device: s.device, account: { id: u.id, name: u.displayName ?? u.name, username: u.username, avatarUrl: u.avatarUrl ?? null, totp: !!u.totp },
    match: s.match, expiresAt: new Date(s.exp).toISOString(), needsBiometric: true,
    ...(s.app ? { app: s.app, appName: APP46[s.app], platform: s.platform, deviceName: s.deviceName || s.device.name } : { app: 'web' }) }, 200, { 'Cache-Control': 'no-store' });
});

qrAuthApi.post('/qr/approve', scanner46, async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({})) ?? {};
  // Prompt 46: {sessionId, code} (eller papir://-strengen) skanner og godkjenner i ett kall.
  let s = live(b.sid);
  if (!s && (b.sessionId || b.code)) {
    if (scanBlocked(user)) return bad(c, 'For mange ugyldige koder. Prøv igjen om 15 min.', 429);
    const p = parseQrCode46(b);
    const x = p ? live(p[0]) : null;
    if (!x || !same(sha(p[1]), x.nonceHash)) { scanFailed(user); return bad(c, 'Ukjent eller utløpt kode. Be om en ny QR-kode.', 404); }
    if (!mayApprove46(c.get('scanner46'), x)) return bad(c, 'Kalender kan bare godkjenne innlogging i Kalender. Skann med Papir Finans.', 403, { code: 'SCANNER_SCOPE' });
    if (x.state === 'pending') setState(x, 'scanned', { user, exp: Date.now() + QR_SCANNED_MS });
    s = x;
  }
  if (!s || s.user !== user) return bad(c, 'Fant ikke innloggingen', 404);
  if (!mayApprove46(c.get('scanner46'), s)) return bad(c, 'Kalender kan bare godkjenne innlogging i Kalender. Skann med Papir Finans.', 403, { code: 'SCANNER_SCOPE' });
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
  // Prompt 46: app-innlogging – den nye enheten får aldri bredere tilgang enn skanneren har.
  if (s.app) {
    s.scopes = [...(c.get('scanner46')?.scopes ?? [])];
    setState(s, 'approved', { needs2fa: false, exp: Date.now() + QR_APPROVED_MS });
    return c.json({ ok: true, state: 'approved', needs2fa: false, device: s.device, app: s.app });
  }
  // Gammel flyt: husk hvem som godkjente. Kalender-skanner → /finish gir bare et Kalender-token (aldri nettleserøkt).
  s.approver = c.get('scanner46')?.kind ?? 'finans';
  s.scopes = [...(c.get('scanner46')?.scopes ?? [])];
  const needs2fa = s.approver === 'kalender' ? false : !!userInfo(user)?.totp;
  setState(s, 'approved', { needs2fa, exp: Date.now() + QR_APPROVED_MS });
  return c.json({ ok: true, state: 'approved', needs2fa, device: s.device });
});

qrAuthApi.post('/qr/finish', async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const s = live(b.sid ?? String(b.code ?? '').match(CODE_RE)?.[1]);
  if (!s) return bad(c, 'Fant ikke QR-koden', 404, { state: 'expired' });
  if (!bound(c, s, b)) return bad(c, 'QR-koden hører til en annen nettleser', 403);
  if (s.app) return bad(c, 'App-innlogging fullføres med GET /api/auth/qr/session/:id', 409, { state: s.state }); // prompt 46
  // Prompt 46: {app:'kalender'|'finans'} gir et eget token for appen (som /qr/session). Godkjent av en Kalender-skanner → bare Kalender.
  const want = b.app === 'kalender' || b.app === 'finans' ? b.app : s.approver === 'kalender' ? 'kalender' : null;
  if (want && s.state === 'approved') {
    if (s.approver === 'kalender' && want !== 'kalender') return bad(c, 'Godkjent fra Kalender – gjelder bare innlogging i Kalender', 403, { code: 'SCANNER_SCOPE' });
    if (s.issued) return bad(c, 'Innloggingen er allerede fullført', 409, { state: 'done' });
    deleteCookie(c, cookieName(s.sid), { path: '/api/auth/qr' });
    s.issued = true;
    let t;
    try { t = issueFor46({ ...s, app: want, deviceName: (typeof b.device === 'string' && b.device.trim().slice(0, 40)) || s.device.name }); } catch (e) { return bad(c, e.message, e.status ?? 500); }
    setState(s, 'done', { exp: Date.now() });
    announce(s.user, s.device, false);
    return c.json({ ok: true, ...t }, 200, { 'Cache-Control': 'no-store' });
  }
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
  // Prompt 41: APPLE_TEAM_ID gir appene no.kristo.finanshub (Homelab, fanger /app-auth) og no.kristo.kalender (delt innlogging / webcredentials).
  const team = /^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID ?? '') ? process.env.APPLE_TEAM_ID : null;
  const ids = [...new Set([...String(process.env.APPLE_APP_ID ?? '').split(',').map((s) => s.trim()), ...(team ? [`${team}.no.kristo.finanshub`] : [])].filter((s) => /^[A-Z0-9]{10}\.[\w.-]+$/.test(s)))];
  if (!ids.length) return c.body(JSON.stringify({ error: 'Ikke satt opp' }), 404, WK_HEADERS);
  const paths = ['/l/*', '/app-auth', '/app-auth/*'];
  const web = [...ids, ...(team ? [`${team}.no.kristo.kalender`, `${team}.no.kristo.kalender.mac`] : [])];
  return c.body(JSON.stringify({ applinks: { apps: [], details: ids.map((appID) => ({ appID, appIDs: [appID], paths, components: paths.map((p) => ({ '/': p })) })) }, webcredentials: { apps: web } }), 200, WK_HEADERS);
}
