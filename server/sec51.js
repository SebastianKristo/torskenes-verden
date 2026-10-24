// Prompt 51 (SEC51): sikkerhet – revisjonslogg, godkjenning av nye enheter, varsel ved nytt land, passkeys (WebAuthn),
// rotering av hemmeligheter med påminnelse, logg-skanner og visning/opplåsing av sperrer. Montert i index.js med mountSec51(app)
// rett etter «Logg inn som» (før innloggingsrutene, så mellomvaren rundt dem kjører først). API-former: SERVER51-API.md (SEC51).
//
// Passordregelen er uendret: passordet hoppes bare over med gyldig enhetscookie OG lokal adresse fra tilkoblingen/Cloudflare
// (auth.js trustIp – aldri X-Forwarded-For). Fra internett kreves alltid passord, eller en passkey (WebAuthn med brukerbekreftelse)
// som likeverdig faktor. Nye enheter fra internett må i tillegg godkjennes fra en kjent enhet eller av en administrator.
//
// Kjent enhet = nettleser med cookien hl_kd51 (eller app med X-Device-Key) som er godkjent, eller en pålitelig enhet (hl_dev)
// for samme bruker. Innlogging fra lokalt nett godkjenner enheten automatisk, og det samme gjør brukerens aller første enhet
// (ellers kunne ingen godkjenne den) – da varsles brukeren og administratorene.
import { Hono } from 'hono';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCookie, setCookie } from 'hono/cookie';
import { db, kv, OWNER } from './db.js';
import { config } from './config.js';
import { sessionUser, createSession, rememberDevice, currentDeviceId, currentSessionId, userInfo, listUsers, isAdmin, isLan, trustIp, viaCloudflare,
  clientIp, checkPassword, cookieSecure, setAuthHook51 } from './auth.js';
import { blocked51, fail51, clear51, list51, unlock51, onLock51, POLICY51 } from './ratelimit51.js';
import { verifyRegistration51, verifyAssertion51, b64u, fromB64u } from './webauthn51.js';
import { installLogGuard51, setSecretProvider51, ringsOf51, TOKEN_PATTERNS51, registerRing51 } from './logguard51.js';
import { authOrToken } from './mobile.js';
import { notifyUser } from './notify.js';
import { consumeReauth } from './reauth.js';
import { deviceOf, _qr38 } from './qr38.js';
import { issueToken, SCOPES as FH_SCOPES, tokenAccessOf } from './finans/routes.js';
import { db as fhDb, secret as fhSecret, setSecret as fhSetSecret } from './finans/db.js';
import { SCHEMA, cfg, updateConfig, userCfg, setUserCfg } from './settings.js';
import { publicUrl46 } from './public-url46.js';

export { registerRing51 };
installLogGuard51();

/* ---------------- Tabeller (additive) ---------------- */

db.exec(`
CREATE TABLE IF NOT EXISTS sec51_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user TEXT, kind TEXT NOT NULL, method TEXT,
  ok INTEGER NOT NULL DEFAULT 1, ip TEXT, country TEXT, device TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS sec51_audit_user ON sec51_audit(user, at);
CREATE INDEX IF NOT EXISTS sec51_audit_at ON sec51_audit(at);
CREATE TABLE IF NOT EXISTS sec51_devices (id TEXT PRIMARY KEY, user TEXT NOT NULL, key_hash TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'web',
  approved INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at INTEGER, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, last_ip TEXT, last_country TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS sec51_devices_key ON sec51_devices(user, key_hash);
CREATE TABLE IF NOT EXISTS sec51_approvals (id TEXT PRIMARY KEY, user TEXT NOT NULL, kind TEXT NOT NULL, method TEXT, device_key_hash TEXT, fp TEXT, poll_hash TEXT NOT NULL,
  name TEXT, ip TEXT, country TEXT, remember INTEGER NOT NULL DEFAULT 0, token_name TEXT, created INTEGER NOT NULL, exp INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, retry_until INTEGER, finished INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sec51_passkeys (id TEXT PRIMARY KEY, user TEXT NOT NULL, name TEXT NOT NULL, jwk TEXT NOT NULL, alg INTEGER NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', aaguid TEXT, fmt TEXT, backed_up INTEGER NOT NULL DEFAULT 0,
  rp_id TEXT NOT NULL, created INTEGER NOT NULL, last_used INTEGER);
CREATE INDEX IF NOT EXISTS sec51_passkeys_user ON sec51_passkeys(user);
`);

const MOCK = () => process.env.MOCK_DATA === '1';
const hk = (v) => createHmac('sha256', config.sessionSecret || 'dev').update(`kd51:${v}`).digest('hex');
const sidKey = (sid) => createHmac('sha256', config.sessionSecret || 'dev').update(sid).digest('hex'); // samme som auth.js
const fhTokenKey = (t) => createHmac('sha256', config.sessionSecret || 'dev').update('fh:' + t).digest('hex'); // samme som finans/routes.js
const sha = (v) => createHash('sha256').update(String(v)).digest('hex');
const rid = (p) => `${p}${randomBytes(12).toString('base64url')}`;
const iso = (t) => (t ? new Date(t).toISOString() : null);
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status, { 'Cache-Control': 'no-store' });
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const KD_COOKIE = 'hl_kd51', AP_COOKIE = 'hl_ap51', KD_AGE = 365 * 86400, APPROVAL_MS = 15 * 60_000, RETRY_MS = 15 * 60_000;
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const userIdByName = (u) => db.prepare('SELECT id FROM users WHERE username=?').get(String(u ?? '').trim().toLowerCase())?.id ?? null;
const nameOf = (id) => { const u = id ? userInfo(id) : null; return u ? u.displayName ?? u.name ?? u.username : null; };
const admins = () => listUsers().filter((u) => u.role === 'admin').map((u) => u.id);

/* ---------------- Innstillinger ---------------- */

export const POLICY_DEFAULTS51 = Object.freeze({ deviceApproval: true, newCountryAlert: true, secretMaxAgeDays: 180, sessionSecretMaxAgeDays: 365, logScanDaily: true });
export const policy51 = () => ({ ...POLICY_DEFAULTS51, ...(kv.get(OWNER, 'sec51_policy', {}) ?? {}) });
export function setPolicy51(b = {}) {
  const cur = policy51(), next = { ...cur };
  for (const k of ['deviceApproval', 'newCountryAlert', 'logScanDaily']) if (typeof b[k] === 'boolean') next[k] = b[k];
  for (const k of ['secretMaxAgeDays', 'sessionSecretMaxAgeDays']) if (b[k] !== undefined) { const n = Math.round(Number(b[k])); if (!(n >= 30 && n <= 1095)) throw Object.assign(new Error(`${k} må være 30–1095 dager`), { status: 400 }); next[k] = n; }
  kv.set(OWNER, 'sec51_policy', next);
  return next;
}

/* ---------------- Forespørselen: IP, land, enhet ---------------- */

/** {ip, public, country, device, cloudflare}. Land bare når forespørselen kom gjennom Cloudflare (CF-IPCountry). */
export function reqInfo51(c) {
  const ip = trustIp(c) || '';
  const cf = viaCloudflare(c);
  const cc = cf ? String(c.req.header('cf-ipcountry') ?? '').trim().toUpperCase() : '';
  const country = /^([A-Z]{2}|T1)$/.test(cc) && cc !== 'XX' ? cc : null;
  let device = 'Ukjent enhet';
  try { device = deviceOf(c).name; } catch { /* */ }
  return { ip, public: !!ip && !isLan(ip), country, device, cloudflare: cf };
}

/* ---------------- Revisjonslogg ---------------- */

export const KINDS51 = {
  login: 'Innlogging', login_failed: 'Mislykket innlogging', blocked: 'Stoppet av sperre', lockout: 'Midlertidig sperret', unlock: 'Låst opp',
  device_pending: 'Ny enhet venter', device_approved: 'Enhet godkjent', device_denied: 'Enhet avvist', device_auto: 'Enhet godkjent automatisk', device_removed: 'Enhet fjernet',
  new_country: 'Innlogging fra nytt land', passkey_added: 'Passkey lagt til', passkey_removed: 'Passkey fjernet', passkey_clone: 'Passkey kan være kopiert',
  secret_rotated: 'Hemmelighet rotert', policy: 'Sikkerhetsinnstillinger endret', logscan: 'Logg-skanning',
};
export const METHODS51 = { password: 'Passord', totp: 'Passord + kode', passkey: 'Passkey', qr: 'QR-kode', 'qr-2fa': 'QR-kode + kode', 'app-token': 'App-token', 'app-session': 'App-økt',
  'trusted-device': 'Pålitelig enhet', approval: 'Godkjent enhet', token: 'App-innlogging' };
const AUDIT_MAX = 20_000, AUDIT_DAYS = 365;
/** Skriver en hendelse. Aldri passord, tokens eller nøkler i detail. */
export function audit51(e) {
  const at = e.at ?? Date.now();
  const id = db.prepare('INSERT INTO sec51_audit(at, user, kind, method, ok, ip, country, device, detail) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(at, e.user ?? null, e.kind, e.method ?? null, e.ok === false ? 0 : 1, e.ip ? String(e.ip).slice(0, 64) : null, e.country ?? null,
      e.device ? String(e.device).slice(0, 80) : null, e.detail ? JSON.stringify(e.detail).slice(0, 2000) : null).lastInsertRowid;
  if (Number(id) % 200 === 0) db.prepare('DELETE FROM sec51_audit WHERE at<? OR id<=?').run(at - AUDIT_DAYS * 86400_000, Number(id) - AUDIT_MAX);
  return Number(id);
}
const auditOut = (r) => {
  let detail = null; try { detail = r.detail ? JSON.parse(r.detail) : null; } catch { detail = null; }
  return { id: r.id, at: iso(r.at), user: r.user, userName: nameOf(r.user), kind: r.kind, kindLabel: KINDS51[r.kind] ?? r.kind, method: r.method, methodLabel: METHODS51[r.method] ?? r.method ?? null,
    ok: !!r.ok, ip: r.ip, country: r.country, device: r.device, detail };
};
/** {items, next} – user=null og all=true (admin) gir alle brukere. */
export function auditList51({ user = null, all = false, kind = null, before = null, limit = 100 } = {}) {
  const w = [], a = [];
  if (!all) { w.push('user=?'); a.push(user); } else if (user) { w.push('user=?'); a.push(user); }
  if (kind) { w.push('kind=?'); a.push(kind); }
  if (before) { w.push('id<?'); a.push(Number(before)); }
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  const rows = db.prepare(`SELECT * FROM sec51_audit ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`).all(...a, n + 1);
  return { items: rows.slice(0, n).map(auditOut), next: rows.length > n ? rows[n - 1].id : null };
}

/* ---------------- Nytt land ---------------- */

const COUNTRY_NAMES = { NO: 'Norge', SE: 'Sverige', DK: 'Danmark', FI: 'Finland', IS: 'Island', DE: 'Tyskland', GB: 'Storbritannia', US: 'USA', NL: 'Nederland', FR: 'Frankrike', ES: 'Spania', IT: 'Italia', PL: 'Polen', T1: 'Tor-nettverket' };
export const countryName51 = (cc) => COUNTRY_NAMES[cc] ?? cc;
function checkCountry(user, info, method) {
  if (!info.country) return false;
  const seen = kv.get(user, 'sec51_countries', []) ?? [];
  if (seen.includes(info.country)) return false;
  kv.set(user, 'sec51_countries', [...seen, info.country].slice(-50));
  if (!seen.length || !policy51().newCountryAlert) return false; // første land vi ser, er utgangspunktet
  audit51({ user, kind: 'new_country', method, ip: info.ip, country: info.country, device: info.device });
  const body = `${nameOf(user) ?? 'Kontoen'} ble logget inn fra ${countryName51(info.country)} (${info.device}, ${info.ip}). Var det ikke deg? Bytt passord og logg ut av alle enheter.`;
  for (const id of new Set([user, ...admins()])) notifyUser(id, { title: 'Innlogging fra nytt land', body, tag: `sec51-country-${user}`, category: 'system', url: '/#/innstillinger/sikkerhet', data: { kind: 'sec51.new_country', priority: 'high', country: info.country } }).catch(() => {});
  return true;
}

/** Kalles etter hver vellykkede innlogging (som ikke venter på godkjenning). */
export function afterLogin51(c, user, method, extra = {}) {
  const info = reqInfo51(c);
  audit51({ user, kind: 'login', method, ip: info.ip, country: info.country, device: extra.device ?? info.device, detail: extra.detail ?? null });
  try { checkCountry(user, info, method); } catch { /* varselet skal ikke stoppe innloggingen */ }
}

/* ---------------- Kjente enheter ---------------- */

const deviceOut = (d, curHash = null) => ({ id: d.id, name: d.name, kind: d.kind, approved: !!d.approved, approvedBy: d.approved_by, approvedByName: d.approved_by && !['lan', 'first', 'policy', 'session', 'qr'].includes(d.approved_by) ? nameOf(d.approved_by) : null,
  approvedAt: iso(d.approved_at), firstSeen: iso(d.first_seen), lastSeen: iso(d.last_seen), lastIp: d.last_ip, lastCountry: d.last_country, current: !!curHash && d.key_hash === curHash });
const keyOfReq = (c) => {
  const k = getCookie(c, KD_COOKIE) || c.req.header('x-device-key') || '';
  return KEY_RE.test(k) ? k : null;
};
const hasApproved = (user) => !!db.prepare('SELECT 1 FROM sec51_devices WHERE user=? AND approved=1 LIMIT 1').get(user)
  || !!db.prepare('SELECT 1 FROM devices WHERE user=? AND paused=0 LIMIT 1').get(user);
function registerDevice(user, keyHash, { name, kind = 'web', by, info }) {
  const now = Date.now();
  const ex = db.prepare('SELECT * FROM sec51_devices WHERE user=? AND key_hash=?').get(user, keyHash);
  if (ex) {
    db.prepare('UPDATE sec51_devices SET approved=1, approved_by=COALESCE(approved_by, ?), approved_at=COALESCE(approved_at, ?), last_seen=?, last_ip=?, last_country=COALESCE(?, last_country), name=? WHERE id=?')
      .run(by, now, now, info?.ip ?? null, info?.country ?? null, String(name ?? ex.name).slice(0, 60), ex.id);
    return ex.id;
  }
  const id = rid('d51_');
  db.prepare('INSERT INTO sec51_devices(id, user, key_hash, name, kind, approved, approved_by, approved_at, first_seen, last_seen, last_ip, last_country) VALUES(?,?,?,?,?,1,?,?,?,?,?,?)')
    .run(id, user, keyHash, String(name ?? 'Enhet').slice(0, 60), kind, by, now, now, now, info?.ip ?? null, info?.country ?? null);
  return id;
}
const kdCookie = (c, key) => `${KD_COOKIE}=${key}; Max-Age=${KD_AGE}; Path=/; HttpOnly; SameSite=Lax${cookieSecure(c) ? '; Secure' : ''}`;
const apCookie = (c, key) => `${AP_COOKIE}=${key}; Max-Age=${APPROVAL_MS / 1000}; Path=/api/security51/approvals; HttpOnly; SameSite=Strict${cookieSecure(c) ? '; Secure' : ''}`;

/**
 * Må enheten godkjennes? kind 'web' (nettleser) eller 'token' (app). → {ok:true, setCookie?} | {pending:{approval, pollKey}, setCookie}
 * Kalles etter at passord/2FA/passkey er sjekket, men før økt/token gis ut (eller fjernes igjen, se loginWatch).
 */
export function gate51(c, user, { method, kind = 'web', remember = false, tokenName = null } = {}) {
  const info = reqInfo51(c), pol = policy51(), now = Date.now();
  let key = keyOfReq(c), setKd = null;
  if (kind === 'web' && !key) { key = randomBytes(24).toString('base64url'); setKd = key; }
  const kh = key ? hk(key) : null;
  const name = kind === 'token' ? String(tokenName || info.device).slice(0, 60) : info.device;
  const known = kh ? db.prepare('SELECT * FROM sec51_devices WHERE user=? AND key_hash=? AND approved=1').get(user, kh) : null;
  // Pålitelig enhet (hl_dev) for samme bruker regnes som kjent.
  const devId = kind === 'web' ? currentDeviceId(c) : null;
  const trusted = devId ? db.prepare('SELECT 1 FROM devices WHERE id=? AND user=?').get(devId, user) : null;
  if (known || trusted) {
    if (kh) registerDevice(user, kh, { name, kind, by: known?.approved_by ?? 'session', info });
    return { ok: true, setCookie: setKd ? kdCookie(c, setKd) : null };
  }
  // Apper uten X-Device-Key: godkjent forespørsel fra samme IP + programvare kan logge inn én gang til innen 15 min.
  const fp = sha(`${user}|${info.ip}|${c.req.header('user-agent') ?? ''}`);
  if (!kh) {
    const ok = db.prepare("SELECT * FROM sec51_approvals WHERE user=? AND fp=? AND state='approved' AND finished=0 AND retry_until>? ORDER BY created DESC LIMIT 1").get(user, fp, now);
    if (ok) { db.prepare('UPDATE sec51_approvals SET finished=1 WHERE id=?').run(ok.id); return { ok: true }; }
  }
  const first = !hasApproved(user);
  if (!pol.deviceApproval || !info.public || first) {
    if (kh) registerDevice(user, kh, { name, kind, by: !info.public ? 'lan' : first ? 'first' : 'policy', info });
    if (info.public && first && pol.deviceApproval) {
      audit51({ user, kind: 'device_auto', method, ip: info.ip, country: info.country, device: name, detail: { reason: 'first' } });
      const body = `${nameOf(user) ?? 'En bruker'} logget inn fra internett på sin første kjente enhet (${name}${info.country ? `, ${countryName51(info.country)}` : ''}). Nye enheter må godkjennes herfra.`;
      for (const id of new Set([user, ...admins()])) notifyUser(id, { title: 'Første enhet godkjent', body, tag: `sec51-first-${user}`, category: 'system', url: '/#/innstillinger/sikkerhet' }).catch(() => {});
    }
    return { ok: true, setCookie: setKd ? kdCookie(c, setKd) : null };
  }
  const pollKey = randomBytes(24).toString('base64url'), id = rid('ap51_');
  db.prepare(`INSERT INTO sec51_approvals(id, user, kind, method, device_key_hash, fp, poll_hash, name, ip, country, remember, token_name, created, exp)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, user, kind, method, kh, fp, sha(pollKey), name, info.ip, info.country, remember ? 1 : 0, tokenName, now, now + APPROVAL_MS);
  audit51({ user, kind: 'device_pending', method, ip: info.ip, country: info.country, device: name, detail: { approval: id } });
  const where = `${name}${info.country ? ` · ${countryName51(info.country)}` : ''} · ${info.ip}`;
  const bodyTxt = `${nameOf(user) ?? 'En bruker'} prøver å logge inn på en ny enhet: ${where}. Godkjenn eller avvis i Innstillinger → Sikkerhet.`;
  for (const to of new Set([user, ...admins()])) notifyUser(to, { title: 'Ny enhet vil logge inn', body: bodyTxt, tag: `sec51-approve-${id}`, category: 'system', url: '/#/innstillinger/sikkerhet', data: { kind: 'sec51.approval', approvalId: id, priority: 'high' } }).catch(() => {});
  const ap = db.prepare('SELECT * FROM sec51_approvals WHERE id=?').get(id);
  return { pending: { approval: ap, pollKey }, setCookie: setKd ? kdCookie(c, setKd) : null };
}
const approvalOut = (a, now = Date.now()) => ({ id: a.id, user: a.user, userName: nameOf(a.user), kind: a.kind, method: a.method, methodLabel: METHODS51[a.method] ?? a.method, device: a.name, ip: a.ip, country: a.country,
  countryName: a.country ? countryName51(a.country) : null, createdAt: iso(a.created), expiresAt: iso(a.exp), state: a.state === 'pending' && a.exp <= now ? 'expired' : a.state,
  decidedBy: a.decided_by, decidedByName: nameOf(a.decided_by), decidedAt: iso(a.decided_at) });
const pendingBody = (p) => ({ error: 'Ny enhet må godkjennes. Godkjenn innloggingen fra en enhet du allerede er logget inn på (Innstillinger → Sikkerhet), eller be en administrator om det.',
  code: 'DEVICE_APPROVAL_REQUIRED', pendingApproval: true, approvalId: p.approval.id, pollKey: p.pollKey, expiresAt: iso(p.approval.exp),
  device: p.approval.name, statusUrl: `/api/security51/approvals/${p.approval.id}/status`, finishUrl: `/api/security51/approvals/${p.approval.id}/finish` });

/* ---------------- Mellomvare rundt innloggingsrutene ---------------- */

const replaceRes = (c, status, json, cookies = []) => {
  const h = new Headers({ 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' });
  for (const ck of cookies.filter(Boolean)) h.append('set-cookie', ck);
  c.res = undefined; // ellers kopierer Hono de gamle Set-Cookie (økt-cookien) inn i det nye svaret
  c.res = new Response(JSON.stringify(json), { status, headers: h });
};
const cookieVal = (res, name) => { for (const s of res.headers.getSetCookie?.() ?? []) { const m = s.match(new RegExp(`^${name}=([^;]*)`)); if (m && m[1]) return decodeURIComponent(m[1]); } return null; };
/** Fjerner økten/tokenet som handleren nettopp ga ut (innloggingen venter på godkjenning). */
function undoLogin(res, j, kind) {
  if (kind === 'token') { if (typeof j?.token === 'string') fhDb.prepare('DELETE FROM fh_tokens WHERE id=?').run(fhTokenKey(j.token)); return; }
  const sid = cookieVal(res, 'hl_sid'), dev = cookieVal(res, 'hl_dev');
  if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sidKey(sid));
  if (dev) db.prepare('DELETE FROM devices WHERE id=?').run(sidKey(dev));
}
const appendCookie = (c, ck) => { if (!ck) return; const h = new Headers(c.res.headers); h.append('set-cookie', ck); const r = new Response(c.res.body, { status: c.res.status, headers: h }); c.res = undefined; c.res = r; };

/**
 * Passord-/2FA-innlogging (web og app). Før: sperre-sjekk skjer i verifyLogin. Etter: revisjonslogg, godkjenning av ny enhet, nytt land.
 * kind 'web' | 'token'. method 'password' (steg 2 blir 'totp').
 */
const loginWatch = (kind, method) => async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const b = await c.req.json().catch(() => ({})) ?? {};
  const ticket = typeof b.ticket === 'string' ? b.ticket : getCookie(c, 'hl_pre');
  const fromQr = method === 'totp' && !!ticket && _qr38.qrTickets.has(ticket);
  await next();
  const res = c.res, st = res.status, info = reqInfo51(c);
  let j = null;
  try { j = await res.clone().json(); } catch { j = null; }
  const uname = typeof b.username === 'string' ? b.username : '';
  if (st === 429) { audit51({ user: uname ? userIdByName(uname) : null, kind: 'blocked', method, ok: false, ip: info.ip, country: info.country, device: info.device, detail: uname ? { username: uname.slice(0, 32) } : null }); return; }
  if (st === 401 || st === 403) {
    if (j?.needsTotp && !j.error?.match?.(/Feil kode/)) return; // steg 1 ok, venter på kode
    audit51({ user: uname ? userIdByName(uname) : null, kind: 'login_failed', method, ok: false, ip: info.ip, country: info.country, device: info.device, detail: uname ? { username: uname.slice(0, 32) } : null });
    return;
  }
  if (st < 200 || st >= 300 || !j || j.needsTotp || j.needs2fa) return;
  const user = j.user?.id;
  if (!user || !userInfo(user)) return;
  const m = fromQr ? 'qr-2fa' : method;
  if (!fromQr) {
    const g = gate51(c, user, { method: m, kind, remember: b.remember !== false, tokenName: kind === 'token' ? String(b.deviceName ?? b.device ?? '').slice(0, 60) || null : null });
    if (g.pending) {
      undoLogin(res, j, kind);
      const cookies = [g.setCookie, kind === 'web' ? apCookie(c, g.pending.pollKey) : null];
      replaceRes(c, 403, pendingBody(g.pending), cookies);
      return;
    }
    if (g.setCookie) appendCookie(c, g.setCookie);
  }
  afterLogin51(c, user, m);
};

/** QR, app-token-utveksling og app-økt: rate limiting (scope qr/token) + revisjonslogg. */
const flowWatch = (scope, method, { failOn = [400, 401, 403, 404], audit = true } = {}) => async (c, next) => {
  const ip = clientIp(c);
  // QR: skanneren (innlogget mobil) har også en kontosperre.
  let pre = null;
  if (scope === 'qr' && c.req.method === 'POST') { try { pre = sessionUser(c) || tokenAccessOf(c)?.user || null; } catch { pre = null; } }
  const wait = Math.max(blocked51(scope, 'ip', ip), pre ? blocked51(scope, 'acct', pre) : 0);
  if (wait) {
    const info = reqInfo51(c);
    audit51({ kind: 'blocked', method, ok: false, ip: info.ip, country: info.country, device: info.device, detail: { scope } });
    return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429, { retryAfter: wait });
  }
  await next();
  const st = c.res.status;
  const acct = c.get('user') ?? null;
  if (failOn.includes(st)) {
    fail51(scope, 'ip', ip);
    if (acct && scope === 'qr') fail51(scope, 'acct', acct);
    return;
  }
  if (st < 200 || st >= 300) return;
  clear51(scope, 'ip', ip);
  if (!audit) return;
  let j = null;
  try { j = await c.res.clone().json(); } catch { j = null; }
  const user = j?.user?.id;
  if (!user || j.needs2fa || (j.state && j.state !== 'done')) return;
  if (method === 'qr' && !(j.ok || j.token)) return;
  afterLogin51(c, user, method);
};

/* ---------------- Passkeys ---------------- */

/** {rpId, origins, rpName} | null. RP-id fra PUBLIC_URL (eller Innstillinger → Server); localhost i utvikling. */
export function rp51(c) {
  const name = 'Nordlys OS';
  const extra = String(process.env.PASSKEY_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https:\/\/[^\s/]+$/.test(s));
  const pub = publicUrl46();
  if (pub) {
    try { const u = new URL(pub); return { rpId: u.hostname, origins: [...new Set([u.origin, ...extra.filter((o) => { try { const h = new URL(o).hostname; return h === u.hostname || h.endsWith(`.${u.hostname}`); } catch { return false; } })])], rpName: name }; } catch { /* */ }
  }
  let host = '';
  try { host = new URL(c.req.url).host; } catch { host = c.req.header('host') ?? ''; }
  const hn = host.replace(/:\d+$/, '');
  if (hn === 'localhost' || hn === '127.0.0.1') return { rpId: 'localhost', origins: [`http://${host.replace('127.0.0.1', 'localhost')}`, `https://${host.replace('127.0.0.1', 'localhost')}`], rpName: name };
  return null;
}
const challenges = new Map(); // id → {challenge, user, purpose, rpId, exp}
const CHALLENGE_MS = 5 * 60_000;
setInterval(() => { const now = Date.now(); for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k); }, 60_000).unref();
function newChallenge(purpose, user, rpId) {
  const id = rid('ch51_'), challenge = randomBytes(32);
  challenges.set(id, { challenge, user, purpose, rpId, exp: Date.now() + CHALLENGE_MS });
  if (challenges.size > 5000) challenges.delete(challenges.keys().next().value);
  return { id, challenge };
}
function takeChallenge(id, purpose) {
  const ch = challenges.get(String(id ?? ''));
  challenges.delete(String(id ?? ''));
  return ch && ch.purpose === purpose && ch.exp > Date.now() ? ch : null;
}
const passkeyOut = (p) => ({ id: p.id, name: p.name, createdAt: iso(p.created), lastUsedAt: iso(p.last_used), backedUp: !!p.backed_up, synced: !!p.backed_up,
  transports: JSON.parse(p.transports || '[]'), alg: p.alg === -7 ? 'ES256' : p.alg === -257 ? 'RS256' : String(p.alg), rpId: p.rp_id });
export const passkeysOf51 = (user) => db.prepare('SELECT * FROM sec51_passkeys WHERE user=? ORDER BY created').all(user).map(passkeyOut);
const userHandle = (user) => b64u(Buffer.from(String(user), 'utf8'));
function freshSession(c) {
  const sid = currentSessionId(c);
  const s = sid ? db.prepare('SELECT created FROM sessions WHERE id=?').get(sid) : null;
  return !!s && Date.now() - s.created < 10 * 60_000;
}
function reauthOk(c, user, b) {
  if (b.reauthToken && consumeReauth(b.reauthToken, user)) return true;
  if (b.password !== undefined) {
    const ip = clientIp(c);
    if (blocked51('login', 'ip', ip)) return 'blocked';
    if (checkPassword(user, b.password)) { clear51('login', 'ip', ip); return true; }
    fail51('login', 'ip', ip);
    return false;
  }
  return !b.reauthToken && freshSession(c);
}

/* ---------------- Hemmeligheter (alder og rotering) ---------------- */

const FH_LABELS = { geminiKey: 'Gemini API-nøkkel', groqKey: 'Groq API-nøkkel', openaiKey: 'OpenAI API-nøkkel', elevenlabsKey: 'ElevenLabs API-nøkkel', azureSpeechKey: 'Azure Speech-nøkkel',
  roboflowKey: 'Roboflow API-nøkkel', smbPass: 'SMB-passord (NAS)', backupPhrase: 'Backup-passfrase', macOcrKey: 'Mac OCR-nøkkel' };
const ENV_SKIP = /HASH|_URL$|_HOST$|_PORT$|_USER$|_NAME$|_ID$|_MODEL$|_DAYS$|^npm_|^NODE_|^PATH$|^HOME$|PUBLIC|^APPLE_|^ANDROID_/;
const ENV_SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|_PASS|CREDENTIALS?)$/;
const registered = new Map(); // id → {label, group, get, set?, howTo?}
/** Andre moduler (backup, ntfy, Proxmox …) kan melde inn egne hemmeligheter: get() → verdi, set?(verdi). */
export function registerSecret51(id, def) { if (/^[a-z0-9:._-]{3,60}$/i.test(id) && typeof def?.get === 'function') registered.set(id, def); }
const ENV_HELP = 'Lag en ny verdi, sett den i .env på serveren og start på nytt: docker compose up -d homelab';
/** Inventaret med verdiene (bare internt – sendes aldri ut). */
function secretsRaw(user = OWNER, { admin = true } = {}) {
  const out = [];
  const add = (x) => { if (x.value) out.push(x); };
  if (admin) {
    for (const [k, v] of Object.entries(process.env)) {
      if (!v || v.length < 8 || ENV_SKIP.test(k) || !ENV_SECRET.test(k)) continue;
      add({ id: `env:${k}`, label: k, group: 'Miljøvariabler (.env)', source: 'env', value: v, rotate: 'manual',
        howTo: k === 'SESSION_SECRET' ? 'openssl rand -hex 32 → SESSION_SECRET i .env → docker compose up -d homelab' : ENV_HELP,
        warning: k === 'SESSION_SECRET' ? 'Alle blir logget ut, og lagrede nøkler i Innstillinger (kryptert med SESSION_SECRET) må legges inn på nytt – med mindre SECRET_KEY er satt.' : k === 'SECRET_KEY' ? 'FinansHub-hemmelighetene er kryptert med denne – legg dem inn på nytt etterpå.' : null });
    }
    for (const k of Object.keys(FH_LABELS)) {
      let v = ''; try { v = fhSecret(k, OWNER) || ''; } catch { v = ''; }
      if (v) add({ id: `fh:${k}`, label: FH_LABELS[k], group: 'AI og FinansHub', source: 'app', value: v, rotate: 'paste' });
    }
    for (const [gname, meta, fields] of SCHEMA) {
      if (meta.scope === 'personal') continue;
      for (const f of fields) {
        if (!f[3]) continue;
        let v = ''; try { v = cfg(f[0]) || ''; } catch { v = ''; }
        if (v && v !== 'DEMO_KEY') add({ id: `cfg:${f[0]}`, label: `${gname}: ${f[1]}`, group: 'Integrasjoner (server)', source: 'app', value: v, rotate: 'paste' });
      }
    }
    for (const [id, d] of registered) { let v = ''; try { v = d.get() || ''; } catch { v = ''; } add({ id: `reg:${id}`, label: d.label ?? id, group: d.group ?? 'Andre', source: 'app', value: v, rotate: d.set ? 'paste' : 'manual', howTo: d.howTo ?? null }); }
  }
  for (const [gname, meta, fields] of SCHEMA) {
    if (meta.scope !== 'personal') continue;
    for (const f of fields) {
      if (!f[3]) continue;
      let v = ''; try { v = userCfg(user, f[0]) || ''; } catch { v = ''; }
      add({ id: `my:${f[0]}`, label: `${gname}: ${f[1]}`, group: 'Mine integrasjoner', source: 'personal', value: v, rotate: 'paste' });
    }
  }
  let imap = ''; try { imap = userCfg(user, 'imapPass') || ''; } catch { imap = ''; }
  add({ id: 'my:imapPass', label: 'E-post (IMAP): passord', group: 'Mine integrasjoner', source: 'personal', value: imap, rotate: 'paste' });
  // Samme nøkkel kan ligge i flere kilder (env + speiling i Innstillinger) – vis den én gang (første kilde vinner, env først).
  const seenV = new Set(), seenId = new Set();
  return out.filter((x) => { if (seenId.has(x.id) || seenV.has(x.value)) return false; seenId.add(x.id); seenV.add(x.value); return true; });
}
const fpOf = (id, v) => createHmac('sha256', config.sessionSecret || 'dev').update(`sec51fp:${id}:${v}`).digest('hex').slice(0, 24);
/** Alder per nøkkel uten å lagre verdien: et fingeravtrykk (HMAC) per id; endres det, er nøkkelen rotert. */
export function secrets51(user = OWNER, { admin = true, now = Date.now() } = {}) {
  const pol = policy51();
  const raw = secretsRaw(user, { admin });
  const sysSeen = kv.get(OWNER, 'sec51_secret_seen', {}) ?? {}, mySeen = kv.get(user, 'sec51_secret_seen_me', {}) ?? {};
  let chSys = false, chMe = false;
  const items = raw.map((x) => {
    const store = x.source === 'personal' ? mySeen : sysSeen;
    const fp = fpOf(x.id, x.value);
    let s = store[x.id];
    if (!s || s.fp !== fp) {
      s = { fp, since: now, estimated: !s, rotatedAt: s ? now : null };
      store[x.id] = s;
      if (x.source === 'personal') chMe = true; else chSys = true;
    }
    const maxAgeDays = x.id === 'env:SESSION_SECRET' ? pol.sessionSecretMaxAgeDays : pol.secretMaxAgeDays;
    const ageDays = Math.floor((now - s.since) / 86400_000);
    return { id: x.id, label: x.label, group: x.group, source: x.source, set: true, since: iso(s.since), ageDays, estimated: !!s.estimated, rotatedAt: iso(s.rotatedAt),
      maxAgeDays, overdue: ageDays >= maxAgeDays, dueInDays: Math.max(0, maxAgeDays - ageDays), rotate: x.rotate, howTo: x.howTo ?? (x.rotate === 'paste' ? 'Lag en ny nøkkel hos tjenesten, lim den inn under «Roter» og slett den gamle hos tjenesten.' : null), warning: x.warning ?? null };
  });
  if (chSys) kv.set(OWNER, 'sec51_secret_seen', sysSeen);
  if (chMe) kv.set(user, 'sec51_secret_seen_me', mySeen);
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.ageDays - a.ageDays);
}
/** Ny verdi for en nøkkel som kan limes inn. Verdien sendes aldri tilbake. */
export function rotateSecret51(user, id, value, { admin = false } = {}) {
  const v = String(value ?? '').trim();
  if (v.length < 8 || v.length > 4000) throw Object.assign(new Error('Den nye nøkkelen må ha 8–4000 tegn'), { status: 400 });
  const [src, k] = String(id).split(/:(.*)/s);
  if (src === 'my') { setUserCfg(user, { [k]: v }); }
  else {
    if (!admin) throw Object.assign(new Error('Bare administratorer kan rotere servernøkler'), { status: 403 });
    if (src === 'fh' && FH_LABELS[k]) fhSetSecret(k, v, OWNER);
    else if (src === 'cfg') updateConfig({ [k]: v }, OWNER, { admin: true });
    else if (src === 'reg' && registered.get(k)?.set) registered.get(k).set(v);
    else throw Object.assign(new Error('Denne nøkkelen kan ikke roteres herfra. Følg fremgangsmåten under nøkkelen.'), { status: 400 });
  }
  const store = src === 'my' ? kv.get(user, 'sec51_secret_seen_me', {}) ?? {} : kv.get(OWNER, 'sec51_secret_seen', {}) ?? {};
  store[id] = { fp: fpOf(id, v), since: Date.now(), estimated: false, rotatedAt: Date.now() };
  kv.set(src === 'my' ? user : OWNER, src === 'my' ? 'sec51_secret_seen_me' : 'sec51_secret_seen', store);
  return true;
}
// Loggvakten (logguard51) masker alle kjente verdier – eiers og alle brukeres personlige nøkler.
setSecretProvider51(() => {
  const all = secretsRaw(OWNER, { admin: true });
  for (const u of listUsers()) if (u.id !== OWNER) all.push(...secretsRaw(u.id, { admin: false }));
  return all;
});

/* ---------------- Logg-skanner ---------------- */

const SCAN_PATTERNS = [
  ...TOKEN_PATTERNS51.map(([re, to]) => [re, `App-token (${to.replace('••••', '…')})`]),
  [/\bBearer\s+(?!•)[A-Za-z0-9._~+/-]{24,}/g, 'Bearer-token'],
  [/\bsk-(?!•)[A-Za-z0-9_-]{20,}/g, 'OpenAI-/Open WebUI-nøkkel (sk-…)'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'Google-/Gemini-nøkkel (AIza…)'],
  [/\bgsk_[A-Za-z0-9]{20,}/g, 'Groq-nøkkel (gsk_…)'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, 'GitHub-token'],
  [/\bxox[abps]-[A-Za-z0-9-]{10,}/g, 'Slack-token'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS-nøkkel (AKIA…)'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'JWT'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 'Privat nøkkel'],
  [/(?:password|passwd|api[_-]?key|secret|token)["']?\s*[:=]\s*["']?(?!•|\*|\$\{|<|null|undefined|true|false)[^\s"',;}&]{12,}/gi, 'Nøkkel=verdi i klartekst'],
];
function scanLines(lines, source, known, findings) {
  let scanned = 0;
  for (const raw of lines) {
    const line = String(raw ?? '');
    if (!line) continue;
    scanned++;
    for (const k of known) {
      if (line.includes(k.value)) {
        const key = `${source}|known|${k.id}`;
        const f = findings.get(key) ?? { source, rule: `Kjent nøkkel: ${k.label}`, secretId: k.id, count: 0, example: null };
        f.count++; f.example ??= line.split(k.value).join('[NØKKEL]').slice(0, 160);
        findings.set(key, f);
      }
    }
    for (const [re, label] of SCAN_PATTERNS) {
      re.lastIndex = 0;
      const m = line.match(re);
      if (!m) continue;
      const key = `${source}|pat|${label}`;
      const f = findings.get(key) ?? { source, rule: `Mønster: ${label}`, secretId: null, count: 0, example: null };
      f.count += m.length;
      f.example ??= line.replace(re, (x) => `${x.slice(0, 4)}••••`).slice(0, 160);
      findings.set(key, f);
    }
  }
  return scanned;
}
function tailFile(p, max = 2 * 1024 * 1024) {
  const st = statSync(p), n = Math.min(st.size, max), buf = Buffer.alloc(n), fd = openSync(p, 'r');
  try { readSync(fd, buf, 0, n, st.size - n); } finally { closeSync(fd); }
  return buf.toString('utf8').split('\n');
}
function logFiles(dir, depth = 2) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (out.length > 50) break;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !/^(uploads|media|backups?|restic|node_modules)$/i.test(e.name)) out.push(...logFiles(p, depth - 1));
    else if (e.isFile() && /\.(log|txt|jsonl)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const LOG_TABLE_RE = /(log|audit|error|crash|trace|event|history|job)/i;
function dbLines(d, label) {
  const out = [];
  let tables = [];
  try { tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name).filter((n) => LOG_TABLE_RE.test(n) && !/^sec51_audit$/.test(n) && /^[A-Za-z0-9_]+$/.test(n)); } catch { tables = []; }
  for (const t of tables) {
    try {
      const cols = d.prepare(`PRAGMA table_info(${t})`).all().filter((c) => !c.type || /TEXT|CHAR|CLOB|JSON/i.test(c.type)).map((c) => c.name).filter((n) => /^[A-Za-z0-9_]+$/.test(n));
      if (!cols.length) continue;
      const rows = d.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM ${t} ORDER BY rowid DESC LIMIT 3000`).all();
      out.push({ source: `${label}: ${t}`, lines: rows.map((r) => cols.map((c) => r[c] ?? '').join(' ')) });
    } catch { /* tabellen kan være låst eller ha et rart skjema */ }
  }
  try {
    const rows = db === d ? d.prepare("SELECT user, key, value FROM kv WHERE key LIKE '%log%' OR key LIKE '%history%' OR key LIKE '%error%' OR key LIKE '%trace%' OR key LIKE '%events%' LIMIT 5000").all() : [];
    if (rows.length) out.push({ source: `${label}: kv (logger og historikk)`, lines: rows.map((r) => `${r.key} ${r.value}`) });
  } catch { /* */ }
  return out;
}
/** Skanner ringbuffere, logg-tabeller/-nøkler i databasene, loggfiler i data-mappen og Docker-loggene (siste døgn). Lagrer resultatet. */
export async function logScan51({ docker = true, now = Date.now() } = {}) {
  const t0 = Date.now();
  const known = (() => { const all = secretsRaw(OWNER, { admin: true }); for (const u of listUsers()) if (u.id !== OWNER) all.push(...secretsRaw(u.id, { admin: false })); return all.filter((x) => String(x.value).length >= 12); })();
  const findings = new Map(), sources = [];
  const run = (source, lines) => { const n = scanLines(lines, source, known, findings); sources.push({ source, lines: n }); };
  for (const r of ringsOf51()) run(`Ringbuffer: ${r.name}`, r.lines);
  for (const x of dbLines(db, 'homelab.db')) run(x.source, x.lines);
  for (const x of dbLines(fhDb, 'finans.db')) run(x.source, x.lines);
  for (const p of logFiles(resolve(config.dataDir))) { try { run(`Fil: ${p.replace(resolve(config.dataDir), 'data')}`, tailFile(p)); } catch { /* */ } }
  let dockerState = 'skipped';
  if (docker && !MOCK()) {
    try {
      const L = await import('./logs44.js');
      if (L.dockerAvailable44()) {
        const r = await L.queryLogs44({ since: '24h', limit: 5000 }, now);
        const by = new Map();
        for (const l of r.lines ?? []) { const a = by.get(l.ct) ?? []; a.push(l.msg); by.set(l.ct, a); }
        for (const [ct, lines] of by) run(`Docker: ${ct}`, lines);
        dockerState = 'ok';
      } else dockerState = 'unavailable';
    } catch { dockerState = 'error'; }
  }
  const items = [...findings.values()].sort((a, b) => b.count - a.count);
  const out = { at: iso(now), ms: Date.now() - t0, ok: !items.length, findings: items, sources, docker: dockerState, knownSecrets: known.length };
  kv.set(OWNER, 'sec51_logscan', out);
  audit51({ kind: 'logscan', ok: !items.length, detail: { findings: items.length, sources: sources.length } });
  if (items.length) {
    const last = kv.get(OWNER, 'sec51_logscan_notified', 0) ?? 0;
    if (now - last > 20 * 3600_000) {
      kv.set(OWNER, 'sec51_logscan_notified', now);
      const body = `Logg-skanneren fant ${items.length === 1 ? 'en mulig nøkkel' : `${items.length} mulige nøkler`} i loggene (${items.slice(0, 2).map((f) => f.source).join(', ')}). Se Innstillinger → Sikkerhet, og roter nøkkelen.`;
      for (const id of admins()) notifyUser(id, { title: 'Nøkkel funnet i loggene', body, tag: 'sec51-logscan', category: 'system', url: '/#/innstillinger/sikkerhet' }).catch(() => {});
    }
  }
  return out;
}

/* ---------------- Påminnelser og bakgrunn ---------------- */

export function remindSecrets51(now = Date.now()) {
  const due = secrets51(OWNER, { admin: true, now }).filter((s) => s.overdue);
  const sent = kv.get(OWNER, 'sec51_secret_reminded', {}) ?? {};
  const fresh = due.filter((s) => !sent[s.id] || now - sent[s.id] > 30 * 86400_000);
  if (!fresh.length) return 0;
  for (const s of fresh) sent[s.id] = now;
  kv.set(OWNER, 'sec51_secret_reminded', sent);
  const body = fresh.length === 1 ? `${fresh[0].label} er ${fresh[0].ageDays} dager gammel. Roter den i Innstillinger → Sikkerhet.` : `${fresh.length} nøkler bør roteres (${fresh.slice(0, 3).map((s) => s.label).join(', ')}${fresh.length > 3 ? ' …' : ''}).`;
  for (const id of admins()) notifyUser(id, { title: 'På tide å rotere nøkler', body, tag: 'sec51-rotate', category: 'system', url: '/#/innstillinger/sikkerhet' }).catch(() => {});
  return fresh.length;
}
const lockNotified = new Map();
onLock51((e) => {
  const user = e.kind === 'acct' ? e.subject : null;
  audit51({ user, kind: 'lockout', ok: false, ip: e.kind === 'ip' ? e.subject : null, detail: { scope: e.scope, kind: e.kind, fails: e.fails, minutes: Math.ceil(e.lockMs / 60_000) } });
  const k = `${e.scope}:${e.kind}:${e.subject}`;
  if (Date.now() - (lockNotified.get(k) ?? 0) < 3600_000) return;
  lockNotified.set(k, Date.now());
  if (user && userInfo(user)) notifyUser(user, { title: 'Kontoen er midlertidig sperret', body: `Etter ${e.fails} feil forsøk er innloggingen sperret i ${Math.ceil(e.lockMs / 60_000)} min. Var det ikke deg? Bytt passord.`, tag: `sec51-lock-${user}`, category: 'system', url: '/#/innstillinger/sikkerhet' }).catch(() => {});
});
// Pålitelig enhet logget inn automatisk (auth.js) → revisjonslogg (maks én gang i timen per bruker og enhet).
const trustedSeen = new Map();
setAuthHook51((c, user, method) => {
  const k = `${user}|${currentDeviceId(c) ?? ''}`;
  if (Date.now() - (trustedSeen.get(k) ?? 0) < 3600_000) return;
  trustedSeen.set(k, Date.now());
  afterLogin51(c, user, method);
});
export function startSec51() {
  const tick = () => {
    try { remindSecrets51(); } catch (e) { console.warn('[sec51] påminnelse:', e.message); }
    if (policy51().logScanDaily) {
      const last = Date.parse(kv.get(OWNER, 'sec51_logscan', null)?.at ?? '') || 0;
      if (Date.now() - last > 23 * 3600_000) logScan51().catch((e) => console.warn('[sec51] logg-skanning:', e.message));
    }
    try { db.prepare("DELETE FROM sec51_approvals WHERE exp<? AND (retry_until IS NULL OR retry_until<?)").run(Date.now() - 7 * 86400_000, Date.now()); } catch { /* */ }
  };
  setTimeout(tick, 5 * 60_000).unref();
  setInterval(tick, 6 * 3600_000).unref();
}

/* ---------------- API ---------------- */

export const sec51Api = new Hono();
const requireAdmin51 = async (c, next) => (isAdmin(c.get('user')) && !c.get('impersonation')?.target ? next() : bad(c, 'Bare administratorer kan se dette', 403));

sec51Api.get('/approvals/:id/status', (c) => {
  const a = db.prepare('SELECT * FROM sec51_approvals WHERE id=?').get(c.req.param('id'));
  const key = c.req.header('x-approval-key') || getCookie(c, AP_COOKIE) || c.req.query('key') || '';
  if (!a || !key || !timingSafeEqualHex(sha(key), a.poll_hash)) return bad(c, 'Fant ikke godkjenningen', 404, { state: 'expired' });
  return c.json({ ...approvalOut(a), finished: !!a.finished }, 200, { 'Cache-Control': 'no-store' });
});
sec51Api.post('/approvals/:id/finish', async (c) => {
  const b = await body(c);
  const a = db.prepare('SELECT * FROM sec51_approvals WHERE id=?').get(c.req.param('id'));
  const key = c.req.header('x-approval-key') || getCookie(c, AP_COOKIE) || b.pollKey || '';
  if (!a || !key || !timingSafeEqualHex(sha(key), a.poll_hash)) return bad(c, 'Fant ikke godkjenningen', 404, { state: 'expired' });
  if (a.state === 'denied') return bad(c, 'Innloggingen ble avvist', 403, { state: 'denied' });
  if (a.state !== 'approved') return bad(c, a.exp <= Date.now() ? 'Godkjenningen er utløpt. Logg inn på nytt.' : 'Venter fortsatt på godkjenning', 409, { state: a.exp <= Date.now() ? 'expired' : 'pending' });
  if (a.finished) return bad(c, 'Innloggingen er allerede fullført', 409, { state: 'done' });
  if (Date.now() - a.decided_at > APPROVAL_MS) return bad(c, 'Godkjenningen er utløpt. Logg inn på nytt.', 410, { state: 'expired' });
  if (!userInfo(a.user)) return bad(c, 'Brukeren finnes ikke lenger', 404);
  const info = reqInfo51(c);
  if (a.kind === 'web') {
    const k = keyOfReq(c);
    if (a.device_key_hash && (!k || hk(k) !== a.device_key_hash)) return bad(c, 'Fullfør innloggingen i samme nettleser', 403);
    db.prepare('UPDATE sec51_approvals SET finished=1 WHERE id=?').run(a.id);
    if (a.device_key_hash) registerDevice(a.user, a.device_key_hash, { name: a.name, kind: 'web', by: a.decided_by, info });
    createSession(c, a.user);
    if (a.remember) rememberDevice(c, a.user);
    setCookie(c, AP_COOKIE, '', { path: '/api/security51/approvals', maxAge: 0 });
    afterLogin51(c, a.user, a.method ?? 'approval', { detail: { approval: a.id } });
    return c.json({ ok: true, user: userInfo(a.user), state: 'done' }, 200, { 'Cache-Control': 'no-store' });
  }
  db.prepare('UPDATE sec51_approvals SET finished=1 WHERE id=?').run(a.id);
  const k = keyOfReq(c);
  if (k && (!a.device_key_hash || hk(k) === a.device_key_hash)) registerDevice(a.user, hk(k), { name: a.name, kind: 'token', by: a.decided_by, info });
  const t = issueToken(a.user, { name: (a.token_name || a.name || 'Mobilapp').slice(0, 60), scopes: [...FH_SCOPES], expires: null });
  const u = userInfo(a.user);
  afterLogin51(c, a.user, a.method ?? 'approval', { detail: { approval: a.id } });
  return c.json({ token: t.token, scopes: t.scopes ?? FH_SCOPES, user: { id: u.id, username: u.username, role: u.role, name: u.name }, state: 'done' }, 200, { 'Cache-Control': 'no-store' });
});
function timingSafeEqualHex(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }

// Resten krever innlogging (økt eller app-token).
const authed = new Hono();
authed.use('*', authOrToken);
authed.get('/overview', (c) => {
  const u = c.get('user'), adm = isAdmin(u) && !c.get('impersonation')?.target;
  const k = keyOfReq(c), curHash = k ? hk(k) : null, now = Date.now();
  const mine = db.prepare('SELECT * FROM sec51_devices WHERE user=? ORDER BY last_seen DESC').all(u).map((d) => deviceOut(d, curHash));
  const pend = db.prepare(`SELECT * FROM sec51_approvals WHERE state='pending' AND exp>? ${adm ? '' : 'AND user=?'} ORDER BY created DESC LIMIT 50`).all(...(adm ? [now] : [now, u])).map((a) => approvalOut(a, now));
  const rp = rp51(c);
  return c.json({ me: { passkeys: passkeysOf51(u), devices: mine, countries: kv.get(u, 'sec51_countries', []) ?? [], audit: auditList51({ user: u, limit: 20 }).items },
    pending: pend, passkeys: { available: !!rp, rpId: rp?.rpId ?? null, reason: rp ? null : 'Sett PUBLIC_URL (https) i .env for å bruke passkeys.' },
    policy: policy51(), admin: adm, limits: adm ? list51(now) : undefined, lastScan: adm ? kv.get(OWNER, 'sec51_logscan', null) : undefined }, 200, { 'Cache-Control': 'no-store' });
});
authed.get('/audit', (c) => {
  const u = c.get('user'), adm = isAdmin(u) && !c.get('impersonation')?.target;
  const all = adm && (c.req.query('all') === '1' || !!c.req.query('user'));
  return c.json(auditList51({ user: all ? c.req.query('user') || null : u, all, kind: c.req.query('kind') || null, before: c.req.query('before') || null, limit: c.req.query('limit') }), 200, { 'Cache-Control': 'no-store' });
});
authed.get('/devices', (c) => {
  const k = keyOfReq(c), curHash = k ? hk(k) : null;
  return c.json({ devices: db.prepare('SELECT * FROM sec51_devices WHERE user=? ORDER BY last_seen DESC').all(c.get('user')).map((d) => deviceOut(d, curHash)) }, 200, { 'Cache-Control': 'no-store' });
});
authed.delete('/devices/:id', (c) => {
  const u = c.get('user'), d = db.prepare('SELECT * FROM sec51_devices WHERE id=?').get(c.req.param('id'));
  if (!d || (d.user !== u && !(isAdmin(u) && !c.get('impersonation')?.target))) return bad(c, 'Fant ikke enheten', 404);
  db.prepare('DELETE FROM sec51_devices WHERE id=?').run(d.id);
  const info = reqInfo51(c);
  audit51({ user: d.user, kind: 'device_removed', ip: info.ip, device: d.name, detail: { by: u } });
  return c.json({ ok: true });
});
authed.get('/approvals', (c) => {
  const u = c.get('user'), adm = isAdmin(u) && !c.get('impersonation')?.target, now = Date.now();
  const rows = db.prepare(`SELECT * FROM sec51_approvals WHERE created>? ${adm ? '' : 'AND user=?'} ORDER BY created DESC LIMIT 50`).all(...(adm ? [now - 7 * 86400_000] : [now - 7 * 86400_000, u]));
  return c.json({ approvals: rows.map((a) => approvalOut(a, now)) }, 200, { 'Cache-Control': 'no-store' });
});
authed.post('/approvals/:id', async (c) => {
  const u = c.get('user'), b = await body(c), now = Date.now();
  const a = db.prepare('SELECT * FROM sec51_approvals WHERE id=?').get(c.req.param('id'));
  const adm = isAdmin(u) && !c.get('impersonation')?.target;
  if (!a || (a.user !== u && !adm)) return bad(c, 'Fant ikke godkjenningen', 404);
  if (a.state !== 'pending') return bad(c, 'Allerede behandlet', 409, { state: a.state });
  if (a.exp <= now) return bad(c, 'Forespørselen er utløpt', 410, { state: 'expired' });
  if (typeof b.approve !== 'boolean') return bad(c, 'approve må være true eller false');
  const state = b.approve ? 'approved' : 'denied';
  db.prepare('UPDATE sec51_approvals SET state=?, decided_by=?, decided_at=?, retry_until=? WHERE id=?').run(state, u, now, b.approve ? now + RETRY_MS : null, a.id);
  const info = reqInfo51(c);
  audit51({ user: a.user, kind: b.approve ? 'device_approved' : 'device_denied', method: a.method, ip: a.ip, country: a.country, device: a.name, detail: { approval: a.id, by: u, byIp: info.ip } });
  if (!b.approve && a.user !== u) notifyUser(a.user, { title: 'Innlogging avvist', body: `Innloggingen på ${a.name} ble avvist av ${nameOf(u) ?? 'en administrator'}.`, tag: `sec51-approve-${a.id}`, category: 'system' }).catch(() => {});
  return c.json({ ok: true, approval: approvalOut(db.prepare('SELECT * FROM sec51_approvals WHERE id=?').get(a.id)) });
});

// Passkeys: registrering (innlogget) og administrasjon.
authed.get('/passkeys', (c) => { const rp = rp51(c); return c.json({ passkeys: passkeysOf51(c.get('user')), available: !!rp, rpId: rp?.rpId ?? null }, 200, { 'Cache-Control': 'no-store' }); });
authed.post('/passkeys/register/options', async (c) => {
  const u = c.get('user'), b = await body(c);
  if (c.get('impersonation')?.target) return bad(c, 'Ikke mulig under «Logg inn som»', 403);
  const rp = rp51(c);
  if (!rp) return bad(c, 'Passkeys krever en https-adresse. Sett PUBLIC_URL i .env.', 409, { code: 'NO_RP' });
  const ok = reauthOk(c, u, b);
  if (ok === 'blocked') return bad(c, 'For mange forsøk. Prøv igjen senere.', 429);
  if (ok !== true) return bad(c, 'Bekreft passordet ditt først', 403, { needsPassword: true });
  const info = userInfo(u), { id, challenge } = newChallenge('register', u, rp.rpId);
  const exclude = db.prepare('SELECT id, transports FROM sec51_passkeys WHERE user=?').all(u).map((p) => ({ type: 'public-key', id: p.id, transports: JSON.parse(p.transports || '[]') }));
  return c.json({ challengeId: id, publicKey: { challenge: b64u(challenge), rp: { id: rp.rpId, name: rp.rpName }, user: { id: userHandle(u), name: info.username, displayName: info.displayName ?? info.name ?? info.username },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: CHALLENGE_MS, attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' }, excludeCredentials: exclude } }, 200, { 'Cache-Control': 'no-store' });
});
authed.post('/passkeys/register/verify', async (c) => {
  const u = c.get('user'), b = await body(c);
  const ch = takeChallenge(b.challengeId, 'register');
  if (!ch || ch.user !== u) return bad(c, 'Utfordringen er utløpt. Prøv igjen.', 400, { code: 'challenge' });
  const rp = rp51(c);
  if (!rp || rp.rpId !== ch.rpId) return bad(c, 'Serveradressen er endret. Prøv igjen.', 400);
  let r;
  try { r = verifyRegistration51(b.credential ?? b, { challenge: ch.challenge, rpId: rp.rpId, origins: rp.origins }); } catch (e) { return bad(c, e.message, 400, { code: e.code ?? 'invalid' }); }
  if (db.prepare('SELECT 1 FROM sec51_passkeys WHERE id=?').get(r.credentialId)) return bad(c, 'Denne passkeyen er allerede registrert', 409);
  const info = reqInfo51(c);
  const name = String(b.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || `Passkey · ${info.device}`;
  db.prepare('INSERT INTO sec51_passkeys(id, user, name, jwk, alg, sign_count, transports, aaguid, fmt, backed_up, rp_id, created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(r.credentialId, u, name, JSON.stringify(r.jwk), r.alg, r.signCount, JSON.stringify(r.transports), r.aaguid, r.fmt, r.backedUp ? 1 : 0, rp.rpId, Date.now());
  audit51({ user: u, kind: 'passkey_added', ip: info.ip, country: info.country, device: info.device, detail: { name } });
  notifyUser(u, { title: 'Ny passkey', body: `Passkeyen «${name}» ble lagt til på kontoen din. Var det ikke deg? Fjern den i Innstillinger → Sikkerhet.`, tag: 'sec51-passkey', category: 'system', url: '/#/innstillinger/sikkerhet' }).catch(() => {});
  return c.json({ ok: true, passkey: passkeyOut(db.prepare('SELECT * FROM sec51_passkeys WHERE id=?').get(r.credentialId)) });
});
authed.patch('/passkeys/:id', async (c) => {
  const u = c.get('user'), b = await body(c);
  const name = String(b.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  if (!name) return bad(c, 'Skriv inn et navn');
  const ch = db.prepare('UPDATE sec51_passkeys SET name=? WHERE id=? AND user=?').run(name, c.req.param('id'), u).changes;
  return ch ? c.json({ ok: true }) : bad(c, 'Fant ikke passkeyen', 404);
});
authed.delete('/passkeys/:id', (c) => {
  const u = c.get('user'), p = db.prepare('SELECT * FROM sec51_passkeys WHERE id=? AND user=?').get(c.req.param('id'), u);
  if (!p) return bad(c, 'Fant ikke passkeyen', 404);
  db.prepare('DELETE FROM sec51_passkeys WHERE id=?').run(p.id);
  const info = reqInfo51(c);
  audit51({ user: u, kind: 'passkey_removed', ip: info.ip, country: info.country, device: info.device, detail: { name: p.name } });
  return c.json({ ok: true });
});

// Hemmeligheter: admin ser serverens og sine egne, andre bare sine egne personlige.
authed.get('/secrets', (c) => {
  const u = c.get('user'), adm = isAdmin(u) && !c.get('impersonation')?.target;
  return c.json({ secrets: secrets51(u, { admin: adm }), policy: { secretMaxAgeDays: policy51().secretMaxAgeDays, sessionSecretMaxAgeDays: policy51().sessionSecretMaxAgeDays } }, 200, { 'Cache-Control': 'no-store' });
});
authed.post('/secrets/rotate', async (c) => {
  const u = c.get('user'), b = await body(c), adm = isAdmin(u) && !c.get('impersonation')?.target;
  if (c.get('impersonation')?.target) return bad(c, 'Ikke mulig under «Logg inn som»', 403);
  const ok = reauthOk(c, u, { password: b.password, reauthToken: b.reauthToken });
  if (ok === 'blocked') return bad(c, 'For mange forsøk. Prøv igjen senere.', 429);
  if (ok !== true || (b.password === undefined && !b.reauthToken)) return bad(c, 'Bekreft med passordet ditt', 403, { needsPassword: true });
  const id = String(b.id ?? '');
  if (!secrets51(u, { admin: adm }).some((s) => s.id === id)) return bad(c, 'Fant ikke nøkkelen', 404);
  try { rotateSecret51(u, id, b.value, { admin: adm }); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  const info = reqInfo51(c);
  audit51({ user: u, kind: 'secret_rotated', ip: info.ip, country: info.country, device: info.device, detail: { id } });
  return c.json({ ok: true, secret: secrets51(u, { admin: adm }).find((s) => s.id === id) ?? null });
});

// Bare admin: sperrer, policy, logg-skanning.
authed.get('/limits', requireAdmin51, (c) => c.json({ limits: list51(), policy: POLICY51 }, 200, { 'Cache-Control': 'no-store' }));
authed.delete('/limits', requireAdmin51, async (c) => {
  const b = await body(c);
  const key = String(b.key ?? c.req.query('key') ?? '');
  const n = unlock51(key);
  if (!n) return bad(c, 'Fant ikke sperren', 404);
  const [, kind, ...rest] = key.split(':');
  const subject = rest.join(':');
  audit51({ user: kind === 'acct' ? subject : null, kind: 'unlock', detail: { key, by: c.get('user') } });
  return c.json({ ok: true });
});
authed.get('/policy', (c) => c.json(policy51()));
authed.put('/policy', requireAdmin51, async (c) => {
  try { const p = setPolicy51(await body(c)); audit51({ user: c.get('user'), kind: 'policy', detail: p }); return c.json(p); } catch (e) { return bad(c, e.message, e.status ?? 400); }
});
authed.get('/logscan', requireAdmin51, (c) => c.json(kv.get(OWNER, 'sec51_logscan', null) ?? { at: null, findings: [], sources: [] }, 200, { 'Cache-Control': 'no-store' }));
authed.post('/logscan', requireAdmin51, async (c) => c.json(await logScan51(), 200, { 'Cache-Control': 'no-store' }));
sec51Api.route('/', authed);

/* ---------------- Passkey-innlogging (uten økt) ---------------- */

export const passkeyLoginApi = new Hono();
passkeyLoginApi.get('/status', (c) => { const rp = rp51(c); return c.json({ available: !!rp, rpId: rp?.rpId ?? null }); });
passkeyLoginApi.post('/options', async (c) => {
  const ip = clientIp(c), wait = blocked51('login', 'ip', ip);
  if (wait) return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429);
  const rp = rp51(c);
  if (!rp) return bad(c, 'Passkeys er ikke satt opp på denne serveren (mangler PUBLIC_URL med https).', 409, { code: 'NO_RP' });
  const b = await body(c);
  const uid = b.username ? userIdByName(b.username) : null;
  const allow = uid ? db.prepare('SELECT id, transports FROM sec51_passkeys WHERE user=? AND rp_id=?').all(uid, rp.rpId).map((p) => ({ type: 'public-key', id: p.id, transports: JSON.parse(p.transports || '[]') })) : [];
  const { id, challenge } = newChallenge('login', null, rp.rpId);
  return c.json({ challengeId: id, publicKey: { challenge: b64u(challenge), rpId: rp.rpId, timeout: CHALLENGE_MS, userVerification: 'required', allowCredentials: allow } }, 200, { 'Cache-Control': 'no-store' });
});
passkeyLoginApi.post('/login', async (c) => {
  const ip = clientIp(c), wait = blocked51('login', 'ip', ip), info = reqInfo51(c);
  if (wait) { audit51({ kind: 'blocked', method: 'passkey', ok: false, ip: info.ip, country: info.country, device: info.device }); return bad(c, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.`, 429); }
  const b = await body(c);
  const ch = takeChallenge(b.challengeId, 'login');
  const cred = b.credential ?? {};
  const credId = typeof cred.id === 'string' ? cred.id : typeof cred.rawId === 'string' ? cred.rawId : '';
  const row = credId ? db.prepare('SELECT * FROM sec51_passkeys WHERE id=?').get(b64u(fromB64uSafe(credId))) : null;
  const failNow = (msg, code = 'invalid', user = null) => {
    fail51('login', 'ip', ip);
    audit51({ user, kind: 'login_failed', method: 'passkey', ok: false, ip: info.ip, country: info.country, device: info.device, detail: { code } });
    return bad(c, msg, 401, { code });
  };
  if (!ch) return failNow('Utfordringen er utløpt. Prøv igjen.', 'challenge');
  const rp = rp51(c);
  if (!rp || rp.rpId !== ch.rpId) return failNow('Serveradressen er endret. Prøv igjen.', 'rpid');
  if (!row || row.rp_id !== rp.rpId || !userInfo(row.user)) return failNow('Ukjent passkey. Logg inn med passord og legg den til på nytt.', 'unknown');
  let r;
  try { r = verifyAssertion51(cred, { jwk: row.jwk, alg: row.alg, signCount: row.sign_count, userHandle: userHandle(row.user) }, { challenge: ch.challenge, rpId: rp.rpId, origins: rp.origins }); } catch (e) {
    if (e.code === 'sign_count') {
      audit51({ user: row.user, kind: 'passkey_clone', ok: false, ip: info.ip, country: info.country, device: info.device, detail: { name: row.name } });
      for (const id of new Set([row.user, ...admins()])) notifyUser(id, { title: 'Passkey kan være kopiert', body: `Passkeyen «${row.name}» ble avvist fordi telleren ikke gikk fremover. Fjern den og lag en ny.`, tag: `sec51-clone-${row.id}`, category: 'system', url: '/#/innstillinger/sikkerhet', data: { priority: 'high' } }).catch(() => {});
    }
    return failNow(e.message, e.code ?? 'invalid', row.user);
  }
  db.prepare('UPDATE sec51_passkeys SET sign_count=?, last_used=?, backed_up=? WHERE id=?').run(r.signCount, Date.now(), r.backedUp ? 1 : 0, row.id);
  clear51('login', 'ip', ip);
  // Kontosperren (mange feil passord) gjelder ikke passkeys – de kan ikke gjettes. IP-sperren gjelder.
  const g = gate51(c, row.user, { method: 'passkey', kind: 'web', remember: b.remember !== false });
  if (g.pending) {
    if (g.setCookie) c.header('Set-Cookie', g.setCookie, { append: true });
    c.header('Set-Cookie', apCookie(c, g.pending.pollKey), { append: true });
    return c.json(pendingBody(g.pending), 403, { 'Cache-Control': 'no-store' });
  }
  createSession(c, row.user);
  if (b.remember !== false) rememberDevice(c, row.user);
  if (g.setCookie) c.header('Set-Cookie', g.setCookie, { append: true });
  afterLogin51(c, row.user, 'passkey', { detail: { passkey: row.name } });
  return c.json({ ok: true, user: userInfo(row.user) }, 200, { 'Cache-Control': 'no-store' });
});
const fromB64uSafe = (s) => { try { return fromB64u(s); } catch { return Buffer.alloc(0); } };

/* ---------------- Montering ---------------- */

/** Kjente enheter fra før prompt 51: en nettleser med gyldig økt og uten hl_kd51 får en godkjent enhets-cookie. */
const bootstrapKnown = async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || !getCookie(c, 'hl_sid') || getCookie(c, KD_COOKIE) || c.get('impersonation')?.target) return;
  if (c.res.status !== 200 || /event-stream/i.test(c.res.headers.get('content-type') ?? '')) return;
  const u = sessionUser(c);
  if (!u) return;
  const key = randomBytes(24).toString('base64url');
  registerDevice(u, hk(key), { name: reqInfo51(c).device, kind: 'web', by: 'session', info: reqInfo51(c) });
  appendCookie(c, kdCookie(c, key));
};

export function mountSec51(app) {
  // Passord og 2FA (web), og passord-innlogging fra appene (token).
  for (const p of ['/api/auth/login', '/api/login']) app.use(p, loginWatch('web', 'password'));
  for (const p of ['/api/auth/totp', '/api/auth/2fa']) app.use(p, loginWatch('web', 'totp'));
  for (const p of ['/finans/api/auth/token', '/finans/api/login']) app.use(p, loginWatch('token', 'password'));
  // QR (rate limiting per IP og konto) og app-token-utveksling (per IP).
  app.use('/api/auth/qr/scan', flowWatch('qr', 'qr', { failOn: [400, 404], audit: false }));
  app.use('/api/auth/qr/approve', flowWatch('qr', 'qr', { failOn: [404], audit: false }));
  app.use('/api/auth/qr/finish', flowWatch('qr', 'qr', { failOn: [403, 404] }));
  app.use('/api/auth/qr/session/:id', async (c, next) => (c.req.method === 'GET' ? flowWatch('qr', 'qr', { failOn: [403] })(c, next) : next()));
  app.use('/api/auth/device-exchange', flowWatch('token', 'app-token'));
  app.use('/api/auth/token', flowWatch('token', 'app-token'));
  // /api/auth/refresh telles ikke: refresh-tokenene er 256 bit tilfeldige, og utløpte tokens fra flere apper bak samme IP skulle ikke sperre innloggingen.
  app.use('/api/auth/app-session', flowWatch('token', 'app-session', { failOn: [401] }));
  app.use('/api/*', bootstrapKnown);
  app.route('/api/auth/passkey', passkeyLoginApi);
  app.route('/api/security51', sec51Api);
  if (process.env.NODE_ENV !== 'test') startSec51();
}

export const _sec51 = { challenges, gate51, secretsRaw, hk };
