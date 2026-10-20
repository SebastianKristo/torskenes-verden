// Prompt 41 (SERVER41): innlogging uten serveradresse og «Logg inn med Homelab-appen» for Kalender
// (claude-code-innlogging-uten-server.md, claude-code-kalender-logg-inn-homelab.md). Montert i index.js via api41.js.
//
// Uten innlogging (ingen hemmeligheter):
//   GET  /api/discovery → {name, version, local:[url], external:url|null, app:'homelab', api:41}
//   POST /api/auth/device-exchange {device_token, app:'kalender', device?} → {token, refresh:null, user:{id, username, name}, expires, app}
//        («Fortsett som …»: kortlivet enhets-token fra Homelab via delt Keychain / ContentProvider → eget Kalender-token)
//   POST /api/auth/token {code, code_verifier, client, redirect, device?} → {token, refresh:null, user, expires, app}
//        (PKCE S256: koden er engangs, ≤ 60 s, bundet til code_challenge, client og redirect)
// Innlogget i Homelab (økt, eller app-token med finance:write):
//   POST /api/auth/device-token {app?:'kalender'} → {device_token, expiresAt, expiresIn:900}  (Homelab legger det i delt Keychain / ContentProvider)
//   POST /api/auth/app-code {client:'kalender', redirect:'kalender://auth'|'https://<host>/…', state, code_challenge, code_challenge_method?:'S256'}
//        → {code, expiresIn:60, redirectUrl:'kalender://auth?code=…&state=…'}
//   GET/PUT /api/me/server {local, external, auto} → {local, external, auto, discovered:{local[], external}}  (per bruker, synkes til Kalender)
// Web: GET /app-auth?client=kalender&redirect=…&state=…&cc=… → godkjenningssiden (public/app-auth.html når den finnes, ellers – eller med &basic=1 – en enkel side uten skript)
//      POST /app-auth (skjema fra den enkle siden: approve/deny) → 302 til redirect med code&state (eller error=access_denied&state)
// Utlogging: POST /api/logout og POST /finans/api/auth/logout (Homelab-appen) tilbakekaller Kalender-tokenene (companion-tokens) til brukeren.
// /.well-known (qr38.js): APPLE_TEAM_ID/APPLE_APP_ID og ANDROID_CERT_SHA256 fra miljøet, tomt/404 når de ikke er satt.
import { createHash, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db as fhDb } from './finans/db.js';
import { kv, OWNER } from './db.js';
import { config } from './config.js';
import { sessionUser, userInfo, serverName, currentSessionId } from './auth.js';
import { tokenAccessOf, issueToken, tokensById, revokeTokenOf, TOKEN_SCOPES } from './finans/routes.js';
import { companionsOf, deviceName } from './kalender33.js';
import { buildInfo } from './cache-bust.js';

fhDb.exec(`CREATE TABLE IF NOT EXISTS fh_app_codes (code_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, client TEXT NOT NULL, redirect TEXT, challenge TEXT, scopes TEXT NOT NULL,
  expires_tok INTEGER, parent TEXT, created INTEGER NOT NULL, exp INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);`);
const cq = (s) => fhDb.prepare(s);
const CODE_MS = 60_000, DEVICE_MS = 15 * 60_000;
const CLIENTS = { kalender: 'Kalender' };
const hash = (v) => createHash('sha256').update(String(v)).digest('hex');
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const bad = (c, error, status = 400, extra = {}) => c.json({ error, ...extra }, status);
const iso = (t) => (t ? new Date(t).toISOString() : null);

/* ---------------- Adresser ---------------- */

const URL_RE = /^https?:\/\/[^\s/?#]+(?::\d+)?(\/[^\s]*)?$/i;
const cleanUrl = (v) => { const s = String(v ?? '').trim().replace(/\/+$/, ''); return URL_RE.test(s) ? s : null; };
function lanUrls() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${config.port}`);
  return out.slice(0, 4);
}
/** Serverens egne adresser (admin kan sette dem i kv(OWNER,'server41')). */
export function serverAddresses41() {
  const s = kv.get(OWNER, 'server41', {}) ?? {};
  const local = Array.isArray(s.local) && s.local.length ? s.local : lanUrls();
  return { local, external: s.external ?? cleanUrl(process.env.PUBLIC_URL) ?? null };
}
let version = null;
export function discovery41() {
  try { version ??= buildInfo().version ?? null; } catch { version = null; }
  const a = serverAddresses41();
  return { name: serverName(), version, local: a.local, external: a.external, app: 'homelab', api: 41 };
}
export function meServer41(u) {
  const s = kv.get(u, 'server41_me', {}) ?? {};
  const d = serverAddresses41();
  return { local: s.local ?? d.local[0] ?? null, external: s.external ?? d.external ?? null, auto: s.auto !== false, discovered: d };
}
export function setMeServer41(u, b = {}) {
  const cur = kv.get(u, 'server41_me', {}) ?? {};
  const next = { ...cur };
  for (const k of ['local', 'external']) if (k in b) {
    if (b[k] === null || b[k] === '') next[k] = null;
    else { const v = cleanUrl(b[k]); if (!v) throw Object.assign(new Error(`${k === 'local' ? 'Lokal' : 'Ekstern'} adresse må starte med http:// eller https://`), { status: 400 }); next[k] = v; }
  }
  if ('auto' in b) { if (typeof b.auto !== 'boolean') throw Object.assign(new Error('auto må være true eller false'), { status: 400 }); next.auto = b.auto; }
  kv.set(u, 'server41_me', next);
  return meServer41(u);
}

/* ---------------- Hvem spør (Homelab) ---------------- */

/** Økt eller fh_-token med finance:write. → {user, scopes[], expires, tokenId, sessionId} | {error, status} */
function requester(c) {
  const sid = sessionUser(c);
  if (sid && userInfo(sid)) return { user: sid, scopes: [...TOKEN_SCOPES], expires: null, tokenId: null, sessionId: currentSessionId(c) };
  const a = tokenAccessOf(c);
  if (!a) return { error: 'Ikke innlogget', status: 401 };
  if (!a.scopes.has('finance:write')) return { error: 'Krever innlogging eller et app-token med finance:write', status: 403 };
  const row = a.tokenId ? tokensById(a.user, [a.tokenId])[0] : null;
  return { user: a.user, scopes: [...a.scopes].filter((s) => TOKEN_SCOPES.includes(s)), expires: row?.expires ?? null, tokenId: a.tokenId ?? null, sessionId: null };
}
const parentOf = (r) => r.tokenId ?? (r.sessionId ? `sid:${r.sessionId.slice(0, 24)}` : null);

/** Kalender-token (samme tabell og regler som /api/tokens/companion). */
function issueCompanion41(user, app, device, scopes, expires, parent) {
  for (const old of cq('SELECT token_id FROM fh_companion_tokens WHERE user_id=? AND app=? AND device=?').all(user, app, device)) {
    revokeTokenOf(user, old.token_id);
    cq('DELETE FROM fh_companion_tokens WHERE token_id=?').run(old.token_id);
  }
  if (companionsOf(user).length >= 10) throw Object.assign(new Error('Maks 10 app-tokens. Trekk tilbake et under Innstillinger → Enheter.'), { status: 409 });
  const t = issueToken(user, { name: `${CLIENTS[app]} (${device})`, scopes, expires });
  cq('INSERT INTO fh_companion_tokens(token_id,user_id,app,device,parent,created) VALUES(?,?,?,?,?,?)').run(t.fullId, user, app, device, parent, Date.now());
  const u = userInfo(user);
  return { token: t.token, refresh: null, id: t.id, app, device, scopes: t.scopes, expires: t.expires, user: { id: u.id, username: u.username, name: u.name ?? u.displayName ?? null } };
}
/** Utlogging i Homelab: Kalender-tokenene som ble gitt fra denne Homelab-innloggingen (parent = tokenet/økta) tilbakekalles. parent:null = alle. → antall */
export function revokeCompanions41(user, { parent = null } = {}) {
  let n = 0;
  for (const r of cq('SELECT token_id, parent FROM fh_companion_tokens WHERE user_id=?').all(user)) {
    if (parent && r.parent !== parent) continue;
    revokeTokenOf(user, r.token_id); cq('DELETE FROM fh_companion_tokens WHERE token_id=?').run(r.token_id); n++;
  }
  return n;
}

/* ---------------- Redirect-hviteliste ---------------- */

function hostOf(c) {
  try { const u = new URL(c.req.url); return (c.req.header('x-forwarded-host') ?? u.host).split(',')[0].trim(); } catch { return ''; }
}
/** kalender://auth eller https://<denne serveren>/… (også den eksterne adressen). */
export function redirectOk41(redirect, c) {
  const r = String(redirect ?? '');
  if (r === 'kalender://auth') return true;
  let u; try { u = new URL(r); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) return false;
  const ext = serverAddresses41().external;
  const hosts = new Set([hostOf(c), ext ? new URL(ext).host : null].filter(Boolean));
  return hosts.has(u.host);
}
const CC_RE = /^[A-Za-z0-9_-]{43,128}$/, STATE_RE = /^[\w.~-]{8,256}$/;
function createCode(r, { client, redirect, state, challenge }) {
  const code = b64u(randomBytes(24)), now = Date.now();
  cq('INSERT INTO fh_app_codes(code_hash, kind, user_id, client, redirect, challenge, scopes, expires_tok, parent, created, exp) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(hash(code), 'pkce', r.user, client, redirect, challenge, r.scopes.join(' '), r.expires, parentOf(r), now, now + CODE_MS);
  cq('DELETE FROM fh_app_codes WHERE exp < ?').run(now - 3600_000);
  const sep = redirect.includes('?') ? '&' : '?';
  return { code, expiresIn: CODE_MS / 1000, redirectUrl: `${redirect}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}` };
}
function validateAppCode(c, b) {
  const client = String(b.client ?? '').toLowerCase(), redirect = String(b.redirect ?? ''), state = String(b.state ?? ''), challenge = String(b.code_challenge ?? b.cc ?? '');
  if (!CLIENTS[client]) return { error: 'Ukjent app (client)' };
  if (!redirectOk41(redirect, c)) return { error: 'Omdirigeringen er ikke godkjent (redirect)' };
  if (!STATE_RE.test(state)) return { error: 'Ugyldig state' };
  if (!CC_RE.test(challenge)) return { error: 'Ugyldig code_challenge (PKCE S256, base64url)' };
  if ((b.code_challenge_method ?? 'S256') !== 'S256') return { error: 'Bare code_challenge_method S256 er støttet' };
  return { client, redirect, state, challenge };
}

/* ---------------- Rutene ---------------- */

export function mountAuth41(app) {
  app.get('/api/discovery', (c) => c.json(discovery41(), 200, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }));

  app.get('/api/me/server', (c) => { const r = requester(c); return r.error ? bad(c, r.error, r.status) : c.json(meServer41(r.user)); });
  app.put('/api/me/server', async (c) => {
    const r = requester(c);
    if (r.error) return bad(c, r.error, r.status);
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object') return bad(c, 'Forventet {local, external, auto}');
    try { return c.json(setMeServer41(r.user, b)); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });

  app.post('/api/auth/device-token', async (c) => {
    const r = requester(c);
    if (r.error) return bad(c, r.error, r.status);
    const b = await c.req.json().catch(() => ({})) ?? {};
    const client = String(b.app ?? 'kalender').toLowerCase();
    if (!CLIENTS[client]) return bad(c, 'Ukjent app');
    const tok = `hdt_${b64u(randomBytes(24))}`, now = Date.now();
    cq('INSERT INTO fh_app_codes(code_hash, kind, user_id, client, redirect, challenge, scopes, expires_tok, parent, created, exp) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(hash(tok), 'device', r.user, client, null, null, r.scopes.join(' '), r.expires, parentOf(r), now, now + DEVICE_MS);
    return c.json({ device_token: tok, expiresAt: iso(now + DEVICE_MS), expiresIn: DEVICE_MS / 1000, app: client });
  });
  app.post('/api/auth/device-exchange', async (c) => {
    const b = await c.req.json().catch(() => ({})) ?? {};
    const client = String(b.app ?? 'kalender').toLowerCase();
    if (!CLIENTS[client]) return bad(c, 'Ukjent app');
    const row = typeof b.device_token === 'string' ? cq("SELECT * FROM fh_app_codes WHERE code_hash=? AND kind='device'").get(hash(b.device_token)) : null;
    if (!row || row.used || row.exp < Date.now() || row.client !== client) return bad(c, 'Enhets-tokenet er ugyldig eller utløpt. Åpne Homelab og prøv igjen.', 401);
    cq('UPDATE fh_app_codes SET used=1 WHERE code_hash=?').run(row.code_hash);
    if (!userInfo(row.user_id)) return bad(c, 'Brukeren finnes ikke lenger', 401);
    try { return c.json(issueCompanion41(row.user_id, client, deviceName(b.device ?? 'iPhone'), row.scopes.split(' ').filter(Boolean), row.expires_tok, row.parent)); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });
  app.post('/api/auth/app-code', async (c) => {
    const r = requester(c);
    if (r.error) return bad(c, r.error, r.status);
    const b = await c.req.json().catch(() => ({})) ?? {};
    const v = validateAppCode(c, b);
    if (v.error) return bad(c, v.error);
    return c.json(createCode(r, v));
  });
  app.post('/api/auth/token', async (c) => {
    const b = await c.req.json().catch(() => ({})) ?? {};
    const code = String(b.code ?? ''), verifier = String(b.code_verifier ?? '');
    const row = code ? cq("SELECT * FROM fh_app_codes WHERE code_hash=? AND kind='pkce'").get(hash(code)) : null;
    if (!row) return bad(c, 'Ugyldig kode', 400, { code: 'invalid_grant' });
    if (row.used) return bad(c, 'Koden er allerede brukt', 400, { code: 'invalid_grant' });
    cq('UPDATE fh_app_codes SET used=1 WHERE code_hash=?').run(row.code_hash); // engangs, også ved feil under
    if (row.exp < Date.now()) return bad(c, 'Koden er utløpt (60 s). Prøv igjen.', 400, { code: 'expired' });
    if (row.client !== String(b.client ?? '').toLowerCase() || row.redirect !== String(b.redirect ?? '')) return bad(c, 'client eller redirect stemmer ikke', 400, { code: 'invalid_grant' });
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || b64u(createHash('sha256').update(verifier).digest()) !== row.challenge) return bad(c, 'code_verifier stemmer ikke (PKCE)', 400, { code: 'invalid_grant' });
    if (!userInfo(row.user_id)) return bad(c, 'Brukeren finnes ikke lenger', 401);
    try { return c.json(issueCompanion41(row.user_id, row.client, deviceName(b.device ?? 'iPhone'), row.scopes.split(' ').filter(Boolean), row.expires_tok, row.parent)); } catch (e) { return bad(c, e.message, e.status ?? 400); }
  });

  // Godkjenning på web (uten Homelab-appen). public/app-auth.html (WEB41) brukes når den finnes; ellers en enkel side uten skript.
  const PAGE = resolve('public', 'app-auth.html');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  app.get('/app-auth', async (c) => {
    const u = sessionUser(c);
    const url = new URL(c.req.url);
    if (!u) return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
    if (existsSync(PAGE) && c.req.query('basic') !== '1') return c.html(await readFile(PAGE, 'utf8'), 200, { 'Cache-Control': 'no-store' });
    const p = Object.fromEntries(url.searchParams);
    const v = validateAppCode(c, { client: p.client, redirect: p.redirect, state: p.state, code_challenge: p.cc ?? p.code_challenge });
    const who = userInfo(u);
    const hidden = ['client', 'redirect', 'state'].map((k) => `<input type="hidden" name="${k}" value="${esc(p[k])}">`).join('') + `<input type="hidden" name="cc" value="${esc(p.cc ?? p.code_challenge)}">`;
    return c.html(`<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logge inn i Kalender?</title>
<style>body{margin:0;font:17px/1.45 -apple-system,system-ui,sans-serif;background:#F4EFE6;color:#1B1A17;display:grid;place-items:center;min-height:100vh}main{max-width:380px;padding:28px 20px;text-align:center}
h1{font-size:22px;margin:0 0 8px}p{color:#4a463e}button{display:block;width:100%;margin-top:12px;padding:14px;border-radius:12px;border:0;font:600 16px system-ui}.ok{background:#1B1A17;color:#fff}.no{background:#e7e0d3;color:#1B1A17}</style></head>
<body><main>${v.error ? `<h1>Kan ikke logge inn</h1><p>${esc(v.error)}</p>` : `<h1>Logge inn i ${esc(CLIENTS[v.client])}?</h1><p>${esc(CLIENTS[v.client])} får tilgang til kontoen ${esc(who?.displayName ?? who?.username ?? '')} i Homelab.</p>
<form method="post" action="/app-auth">${hidden}<button class="ok" name="action" value="approve">Logg inn</button><button class="no" name="action" value="deny">Avbryt</button></form>`}</main></body></html>`, v.error ? 400 : 200, { 'Cache-Control': 'no-store' });
  });
  app.post('/app-auth', async (c) => {
    const u = sessionUser(c);
    if (!u) return c.redirect('/login');
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== hostOf(c)) return c.text('Ugyldig opphav', 403);
    const f = await c.req.parseBody().catch(() => ({}));
    const v = validateAppCode(c, { client: f.client, redirect: f.redirect, state: f.state, code_challenge: f.cc });
    if (v.error) return c.text(v.error, 400);
    const sep = v.redirect.includes('?') ? '&' : '?';
    if (f.action !== 'approve') return c.redirect(`${v.redirect}${sep}error=access_denied&state=${encodeURIComponent(v.state)}`);
    return c.redirect(createCode({ user: u, scopes: [...TOKEN_SCOPES], expires: null, tokenId: null, sessionId: currentSessionId(c) }, v).redirectUrl);
  });

  // Utlogging tilbakekaller Kalender-tokenene.
  app.use('/api/logout', async (c, next) => {
    const u = c.req.method === 'POST' ? sessionUser(c) : null;
    const sid = u ? currentSessionId(c) : null;
    await next();
    if (u && sid) { try { revokeCompanions41(u, { parent: `sid:${sid.slice(0, 24)}` }); } catch { /* */ } }
  });
  app.use('/finans/api/auth/logout', async (c, next) => {
    const a = c.req.method === 'POST' ? tokenAccessOf(c) : null;
    const isCompanion = a?.tokenId ? !!cq('SELECT 1 FROM fh_companion_tokens WHERE token_id=?').get(a.tokenId) : false;
    await next();
    if (a?.user && a.tokenId && !isCompanion) { try { revokeCompanions41(a.user, { parent: a.tokenId }); } catch { /* */ } }
  });
}
