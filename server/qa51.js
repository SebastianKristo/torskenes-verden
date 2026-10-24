// Prompt 51 (QA51): kvalitet – feature flags, selvhostet krasjrapportering (GlitchTip) og «Nytt i denne versjonen».
// API-formene står i SERVER51-API.md (scratchpad, seksjonen QA51) og i docs/kvalitet-51.md.
//
//   GET    /api/flags                              → {flags:{key:bool}, device, user}            (økt eller app-token)
//   GET    /api/admin/flags51                      → {flags:[…], users:[…], devices:[…]}           (bare admin)
//   POST   /api/admin/flags51 {key, description?}  → 201 {flag}  – nye flagg er alltid AV som standard
//   PATCH  /api/admin/flags51/:key {default?, description?} → {flag}
//   PUT    /api/admin/flags51/:key/override {scope:'user'|'device', user, device?, value:true|false|null} → {flag}
//   DELETE /api/admin/flags51/:key                 → {ok}
//   POST   /api/crash  (maks 64 KB, også uten innlogging, strengere grense) → 202 {id, forwarded}
//   GET    /api/admin/crashes51[?platform=&limit=&q=] · GET /api/admin/crashes51/:id · DELETE /api/admin/crashes51
//   GET    /api/admin/crashes51/status            → {glitchtip:{configured, host, local, reachable?}, total, pending, last24h}
//   GET    /api/whatsnew[?version=]                → {version, date, title, items, markdown, seen, seenVersion}
//   POST   /api/whatsnew/seen {version}            → {ok, seenVersion}
//
// Sikkerhet: krasjrapporter vises bare for admin. Alt som ser ut som nøkler, tokens, passord, cookies og e-postadresser
// vaskes bort før lagring og videresending (scrub51). GlitchTip-DSN-en (med nøkkelen) leses fra .env, logges aldri og sendes
// aldri til klientene. Videresending skjer bare til en vert i huset (Docker-navn, localhost, LAN-adresse, .local/.lan),
// så «Finansdata forlater aldri huset» holder; GLITCHTIP_ALLOW_EXTERNAL=1 må settes for en ekstern GlitchTip.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, kv } from './db.js';
import { authOrToken } from './mobile.js';
import { isAdmin, userInfo, listUsers, currentDeviceId, sessionUser, clientIp } from './auth.js';
import { parseChangelog } from './system-update.js';

const q = (sql) => db.prepare(sql);

/* =====================================================================================================================
   Tabeller (additive)
   ===================================================================================================================== */

db.exec(`CREATE TABLE IF NOT EXISTS flags51 (
  key TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '', default_on INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, updated INTEGER NOT NULL, builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS flag_overrides51 (
  flag_key TEXT NOT NULL, user TEXT NOT NULL, device TEXT NOT NULL DEFAULT '', value INTEGER NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY (flag_key, user, device)
);
CREATE TABLE IF NOT EXISTS flag_devices51 (
  user TEXT NOT NULL, device TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', platform TEXT, last_seen INTEGER NOT NULL,
  PRIMARY KEY (user, device)
);
CREATE TABLE IF NOT EXISTS crash51 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT NOT NULL, platform TEXT NOT NULL, release TEXT, level TEXT NOT NULL,
  message TEXT NOT NULL, stack TEXT, url TEXT, user TEXT, device TEXT, extra TEXT, count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, forwarded INTEGER NOT NULL DEFAULT 0, forward_error TEXT
);
CREATE INDEX IF NOT EXISTS crash51_fp ON crash51(fingerprint, last_seen);
CREATE INDEX IF NOT EXISTS crash51_last ON crash51(last_seen);`);

/* =====================================================================================================================
   Feature flags
   ===================================================================================================================== */

export const FLAG_KEY_RE51 = /^[a-z][a-z0-9_]{1,47}$/;
// Innebygde flagg (kan ikke slettes, standard AV). Klientene i runde 2 sjekker dem via GET /api/flags.
const BUILTIN51 = [
  ['crash_breadcrumbs51', 'Send de siste 20 navigasjonene/klikkene (uten tekst fra felt) med krasjrapporter.'],
  ['glimt_proactive51', 'Proaktiv Glimt (fase 3): forslag uten at du spør, med ukentlig grense og «ikke nå».'],
];
{
  const now = Date.now();
  const ins = q('INSERT OR IGNORE INTO flags51(key, description, default_on, created, updated, builtin) VALUES(?,?,0,?,?,1)');
  for (const [k, d] of BUILTIN51) ins.run(k, d, now, now);
}

/** Andre moduler kan registrere sine egne flagg (alltid AV som standard). Idempotent. */
export function defineFlag51(key, description = '') {
  if (!FLAG_KEY_RE51.test(key)) throw new Error('Ugyldig flaggnavn');
  const now = Date.now();
  q('INSERT OR IGNORE INTO flags51(key, description, default_on, created, updated, builtin) VALUES(?,?,0,?,?,1)').run(key, String(description).slice(0, 300), now, now);
}

const hash16 = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const DEVICE_HDR_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Enheten for flagg (ikke en sikkerhetsfaktor – brukes bare til å velge flagg innen samme bruker):
 * appene sender X-Device-Id (sin egen installasjons-id), web bruker enhetscookien (hash, aldri selve verdien).
 */
export function deviceOf51(c) {
  const h = c.req.header('x-device-id');
  if (h && DEVICE_HDR_RE.test(h)) return { id: `app-${hash16(h)}`, platform: platformOf(c) };
  const d = currentDeviceId(c);
  if (d) return { id: `web-${hash16(d)}`, platform: 'web', raw: d };
  return null;
}
function platformOf(c) {
  const p = String(c.req.header('x-client-platform') ?? '').toLowerCase();
  if (['ios', 'android', 'mac', 'web', 'watchos', 'wearos'].includes(p)) return p;
  const ua = c.req.header('user-agent') ?? '';
  return /Android/.test(ua) ? 'android' : /iPhone|iPad|CFNetwork|Darwin/.test(ua) ? 'ios' : 'web';
}
function rememberFlagDevice(user, dev, c) {
  if (!dev) return;
  let name = String(c.req.header('x-device-name') ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 60);
  if (!name && dev.raw) name = q('SELECT name FROM devices WHERE id=?').get(dev.raw)?.name ?? '';
  q(`INSERT INTO flag_devices51(user, device, name, platform, last_seen) VALUES(?,?,?,?,?)
     ON CONFLICT(user, device) DO UPDATE SET last_seen=excluded.last_seen, platform=excluded.platform, name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE flag_devices51.name END`)
    .run(user, dev.id, name || (dev.platform === 'web' ? 'Nettleser' : dev.platform), dev.platform, Date.now());
}

/** {key: bool} for en bruker (og ev. enhet): enhet > bruker > standard. */
export function flagsFor51(user, device = null) {
  const out = {};
  for (const f of q('SELECT key, default_on FROM flags51 ORDER BY key').all()) out[f.key] = !!f.default_on;
  for (const o of q("SELECT flag_key, value FROM flag_overrides51 WHERE user=? AND device=''").all(user)) if (o.flag_key in out) out[o.flag_key] = !!o.value;
  if (device) for (const o of q('SELECT flag_key, value FROM flag_overrides51 WHERE user=? AND device=?').all(user, device)) if (o.flag_key in out) out[o.flag_key] = !!o.value;
  return out;
}
/** For serverkode: er flagget på for brukeren (og enheten)? Ukjent flagg = av. */
export const flagOn51 = (key, user, device = null) => !!flagsFor51(user, device)[key];

function flagOut(f) {
  const ov = q('SELECT user, device, value, updated FROM flag_overrides51 WHERE flag_key=? ORDER BY user, device').all(f.key);
  return { key: f.key, description: f.description, default: !!f.default_on, builtin: !!f.builtin, created: f.created, updated: f.updated,
    overrides: ov.map((o) => ({ scope: o.device ? 'device' : 'user', user: o.user, device: o.device || null, value: !!o.value, updated: o.updated })) };
}
const flagRow = (key) => q('SELECT * FROM flags51 WHERE key=?').get(key);

/* =====================================================================================================================
   Krasjrapportering
   ===================================================================================================================== */

export const CRASH_MAX_BYTES51 = 64 * 1024;
const KEEP_ROWS = 2000;
const PLATFORMS = ['web', 'pwa', 'ios', 'android', 'mac', 'server', 'watchos', 'wearos'];
const LEVELS = ['fatal', 'error', 'warning', 'info'];

// Vasker hemmeligheter ut av tekst før lagring/videresending. Konservativt: heller for mye enn for lite.
const SCRUB = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [fjernet]'],
  [/\bfh_[A-Za-z0-9_-]{12,}/g, '[token]'],
  [/\b(sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{16,}/g, '[nøkkel]'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, '[nøkkel]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[nøkkel]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[nøkkel]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  [/([?&#;\s"'](?:token|access_token|refresh_token|api[_-]?key|apikey|key|secret|password|passord|pw|sig|signature|code|ticket|session|sid|hl_sid|hl_dev|auth)=)[^&#\s"';]+/gi, '$1[fjernet]'],
  [/("?(?:password|passord|secret|token|apiKey|api_key|authorization|cookie|set-cookie)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1"[fjernet]"'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[e-post]'],
  [/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[fjernet]@'],
  [/\b[0-9a-f]{40,}\b/gi, '[hash]'],
];
export function scrub51(s, max = 4000) {
  let t = String(s ?? '');
  for (const [re, rep] of SCRUB) t = t.replace(re, rep);
  return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
}
// URL uten spørring og fragment (de kan inneholde tokens og søketekst); hash-ruten beholdes uten parametre.
function cleanUrl(u) {
  const s = String(u ?? '').slice(0, 500);
  if (!s) return null;
  try {
    const x = new URL(s, 'http://x');
    const route = x.hash ? x.hash.split('?')[0].slice(0, 80) : '';
    return scrub51(x.pathname + route, 300);
  } catch { return scrub51(s.split('?')[0], 300); }
}
function scrubExtra(o, depth = 0) {
  if (o == null || depth > 3) return undefined;
  if (typeof o === 'string') return scrub51(o, 500);
  if (typeof o === 'number' || typeof o === 'boolean') return o;
  if (Array.isArray(o)) return o.slice(0, 30).map((x) => scrubExtra(x, depth + 1));
  if (typeof o === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(o).slice(0, 40)) {
      if (/pass|secret|token|cookie|auth|key|sig/i.test(k)) { out[k.slice(0, 40)] = '[fjernet]'; continue; }
      out[k.slice(0, 40)] = scrubExtra(v, depth + 1);
    }
    return out;
  }
  return undefined;
}

// Enkel ratebegrensning i minnet (per IP og per bruker, glidende minutt) + et tak per time for hele serveren.
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n <= max;
}
export const _resetCrashLimits51 = () => buckets.clear();

function fingerprint(platform, message, stack) {
  const top = String(stack ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join('|').replace(/:\d+:\d+/g, '').replace(/\?v=[^):\s]+/g, '');
  return hash16(`${platform}|${String(message).replace(/\d+/g, 'N').slice(0, 200)}|${top}`);
}

/** Validerer og lagrer én rapport. Returnerer {id, dedup} eller {error}. */
export function recordCrash51(input, { user = null, device = null } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const platform = PLATFORMS.includes(String(b.platform)) ? String(b.platform) : null;
  if (!platform) return { error: `platform må være en av ${PLATFORMS.join(', ')}` };
  const message = scrub51(b.message ?? b.error?.message ?? '', 1000).trim();
  if (!message) return { error: 'message mangler' };
  const level = LEVELS.includes(String(b.level)) ? String(b.level) : 'error';
  const stack = b.stack ? scrub51(b.stack, 8000) : null;
  const release = b.release ? scrub51(b.release, 60) : null;
  const url = cleanUrl(b.url ?? b.route);
  const extra = scrubExtra({ ...(b.extra && typeof b.extra === 'object' ? b.extra : {}), ...(b.tags && typeof b.tags === 'object' ? { tags: b.tags } : {}),
    ...(Array.isArray(b.breadcrumbs) ? { breadcrumbs: b.breadcrumbs.slice(-20) } : {}), ...(b.userAgent ? { userAgent: String(b.userAgent).slice(0, 200) } : {}),
    ...(b.osVersion ? { osVersion: String(b.osVersion).slice(0, 40) } : {}), ...(b.model ? { model: String(b.model).slice(0, 60) } : {}) });
  const fp = fingerprint(platform, message, stack);
  const now = Date.now();
  // Samme feil siste time: tell opp i stedet for en ny rad (en løkke som krasjer fyller ikke databasen).
  const dup = q('SELECT id FROM crash51 WHERE fingerprint=? AND last_seen > ? ORDER BY id DESC LIMIT 1').get(fp, now - 3600_000);
  if (dup) {
    q('UPDATE crash51 SET count=count+1, last_seen=?, release=COALESCE(?, release) WHERE id=?').run(now, release, dup.id);
    return { id: dup.id, dedup: true };
  }
  const r = q(`INSERT INTO crash51(fingerprint, platform, release, level, message, stack, url, user, device, extra, first_seen, last_seen)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(fp, platform, release, level, message, stack, url, user, device, JSON.stringify(extra ?? {}), now, now);
  const n = q('SELECT COUNT(*) n FROM crash51').get().n;
  if (n > KEEP_ROWS) q('DELETE FROM crash51 WHERE id IN (SELECT id FROM crash51 ORDER BY last_seen ASC LIMIT ?)').run(n - KEEP_ROWS);
  return { id: r.id, dedup: false };
}

/** Serverens egne uventede feil (app.onError) – samme lager, platform 'server'. Kaster aldri. */
export function reportServerError51(err, c) {
  try {
    if (process.env.NODE_ENV === 'test' && !process.env.QA51_CAPTURE_TEST) return;
    const r = recordCrash51({ platform: 'server', level: 'error', message: err?.message || String(err), stack: err?.stack, url: c?.req?.path, release: ownVersion51(), extra: { method: c?.req?.method } });
    if (r.id && !r.dedup) forwardSoon(r.id);
  } catch { /* aldri la rapporteringen gi en ny feil */ }
}

/* ---------------- GlitchTip (Sentry-protokollen, store-endepunktet) ---------------- */

// DSN: http(s)://<offentlig nøkkel>@<vert>[:port]/<prosjekt-id>. Nøkkelen forlater aldri serveren mot klientene.
export function parseDsn51(dsn = process.env.GLITCHTIP_DSN) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!/^https?:$/.test(u.protocol) || !u.username || !/^\d+$/.test(project)) return null;
    return { key: decodeURIComponent(u.username), host: u.host, hostname: u.hostname, origin: `${u.protocol}//${u.host}`, project };
  } catch { return null; }
}
export function isLocalHost51(h) {
  const s = String(h ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!s) return false;
  if (s === 'localhost' || s === '::1' || /^127\./.test(s)) return true;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(s) || /^169\.254\./.test(s) || /^f[cd][0-9a-f]{2}:/.test(s)) return true;
  if (!s.includes('.') && /^[a-z0-9-]+$/.test(s)) return true; // Docker-tjenestenavn (glitchtip)
  return /\.(local|lan|home\.arpa|internal)$/.test(s);
}
function forwardTarget() {
  const d = parseDsn51();
  if (!d) return null;
  if (!isLocalHost51(d.hostname) && process.env.GLITCHTIP_ALLOW_EXTERNAL !== '1') return null;
  return d;
}

let forwardFetch = (...a) => fetch(...a);
export const _setForwardFetch51 = (fn) => { forwardFetch = fn; };

function sentryEvent(row) {
  const extra = (() => { try { return JSON.parse(row.extra || '{}'); } catch { return {}; } })();
  const frames = String(row.stack ?? '').split('\n').slice(0, 40).map((l) => l.trim()).filter(Boolean).reverse().map((l) => ({ function: l.slice(0, 200) }));
  return {
    event_id: createHash('md5').update(`${row.id}-${row.first_seen}`).digest('hex'),
    timestamp: new Date(row.last_seen).toISOString(),
    platform: row.platform === 'server' ? 'node' : row.platform === 'ios' || row.platform === 'mac' ? 'cocoa' : row.platform === 'android' ? 'java' : 'javascript',
    level: row.level, release: row.release || undefined, environment: process.env.NODE_ENV || 'production',
    logger: 'nordlys', server_name: 'homelab-os',
    tags: { platform: row.platform, ...(extra.tags && typeof extra.tags === 'object' ? extra.tags : {}) },
    message: { formatted: row.message },
    exception: { values: [{ type: row.message.split(':')[0].slice(0, 80) || 'Error', value: row.message, ...(frames.length ? { stacktrace: { frames } } : {}) }] },
    request: row.url ? { url: row.url } : undefined,
    // Brukeren sendes bare som en anonym hash, aldri navn eller e-post.
    user: row.user ? { id: hash16(`u:${row.user}`) } : undefined,
    extra: { ...extra, count: row.count },
    fingerprint: [row.fingerprint],
  };
}

export async function forwardCrash51(id) {
  const t = forwardTarget();
  if (!t) return { forwarded: false, reason: parseDsn51() ? 'ekstern-vert' : 'ikke-konfigurert' };
  const row = q('SELECT * FROM crash51 WHERE id=?').get(id);
  if (!row) return { forwarded: false, reason: 'finnes-ikke' };
  try {
    const r = await forwardFetch(`${t.origin}/api/${t.project}/store/`, {
      method: 'POST', signal: AbortSignal.timeout(4000),
      headers: { 'content-type': 'application/json', 'x-sentry-auth': `Sentry sentry_version=7, sentry_client=nordlys-os/51, sentry_key=${t.key}` },
      body: JSON.stringify(sentryEvent(row)),
    });
    if (!r.ok) throw new Error(`GlitchTip svarte ${r.status}`);
    q('UPDATE crash51 SET forwarded=1, forward_error=NULL WHERE id=?').run(id);
    glitchState = { ok: true, at: Date.now() };
    return { forwarded: true };
  } catch (e) {
    const msg = (e?.name === 'TimeoutError' ? 'GlitchTip svarte ikke innen 4 s' : e?.cause?.code === 'ECONNREFUSED' || /fetch failed/.test(e?.message) ? 'GlitchTip svarer ikke' : String(e?.message ?? e)).slice(0, 200);
    q('UPDATE crash51 SET forward_error=? WHERE id=?').run(msg, id);
    glitchState = { ok: false, at: Date.now(), error: msg };
    return { forwarded: false, reason: 'feil', error: msg };
  }
}
let glitchState = null;
function forwardSoon(id) { if (forwardTarget()) setTimeout(() => forwardCrash51(id).catch(() => {}), 0).unref?.(); }

/** Sender lagrede rapporter som ikke kom fram (GlitchTip var nede). Maks 50 per kjøring. */
export async function flushCrashes51(limit = 50) {
  if (!forwardTarget()) return { sent: 0, pending: pendingCount() };
  let sent = 0;
  for (const r of q('SELECT id FROM crash51 WHERE forwarded=0 ORDER BY id LIMIT ?').all(limit)) {
    const x = await forwardCrash51(r.id);
    if (!x.forwarded) break; // nede: prøv igjen neste gang
    sent++;
  }
  return { sent, pending: pendingCount() };
}
const pendingCount = () => q('SELECT COUNT(*) n FROM crash51 WHERE forwarded=0').get().n;

function crashOut(r, full = false) {
  const u = r.user ? userInfo(r.user) : null;
  const o = { id: r.id, platform: r.platform, level: r.level, release: r.release, message: r.message, url: r.url, count: r.count,
    firstSeen: new Date(r.first_seen).toISOString(), lastSeen: new Date(r.last_seen).toISOString(), forwarded: !!r.forwarded, forwardError: r.forward_error || null,
    user: u ? { id: u.id, name: u.displayName || u.name || u.username } : null };
  if (full) { o.stack = r.stack; try { o.extra = JSON.parse(r.extra || '{}'); } catch { o.extra = {}; } o.device = r.device; o.fingerprint = r.fingerprint; }
  return o;
}

/* =====================================================================================================================
   «Nytt i denne versjonen»
   ===================================================================================================================== */

const changelogPath = () => resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md');
function readChangelog() { try { return readFileSync(changelogPath(), 'utf8'); } catch { return ''; } }
export function ownVersion51() { return parseChangelog(readChangelog())[0]?.version ?? null; }

/** Rå markdown for seksjonen (uten selve overskriften), maks 20 000 tegn. */
function rawSection(text, version) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(version));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim().slice(0, 20000);
}
export function whatsNew51(version = null) {
  const text = readChangelog();
  const sections = parseChangelog(text);
  const s = version ? sections.find((x) => x.version === version) : sections[0];
  if (!s) return null;
  return { version: s.version, date: s.date, title: s.title, items: s.items, markdown: rawSection(text, s.version), current: sections[0]?.version ?? null };
}

/* =====================================================================================================================
   Ruter
   ===================================================================================================================== */

export const qa51Api = new Hono();

// --- Flagg til klientene ---
qa51Api.get('/flags', authOrToken, (c) => {
  const user = c.get('user');
  const dev = deviceOf51(c);
  rememberFlagDevice(user, dev, c);
  return c.json({ flags: flagsFor51(user, dev?.id ?? null), device: dev?.id ?? null, user }, 200, { 'Cache-Control': 'no-store' });
});

// --- Admin: flagg ---
const adminOnly = async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
const body = async (c) => { try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };

qa51Api.get('/admin/flags51', authOrToken, adminOnly, (c) => {
  const flags = q('SELECT * FROM flags51 ORDER BY builtin DESC, key').all().map(flagOut);
  const users = listUsers().map((u) => ({ id: u.id, name: u.displayName || u.name || u.username, role: u.role }));
  const devices = q('SELECT user, device, name, platform, last_seen FROM flag_devices51 ORDER BY last_seen DESC LIMIT 500').all()
    .map((d) => ({ user: d.user, device: d.device, name: d.name, platform: d.platform, lastSeen: new Date(d.last_seen).toISOString() }));
  return c.json({ flags, users, devices }, 200, { 'Cache-Control': 'no-store' });
});
qa51Api.post('/admin/flags51', authOrToken, adminOnly, async (c) => {
  const b = await body(c);
  const key = String(b.key ?? '').trim();
  if (!FLAG_KEY_RE51.test(key)) return c.json({ error: 'key må være 2–48 tegn: små bokstaver, tall og _ (starter med bokstav)' }, 400);
  if (flagRow(key)) return c.json({ error: 'Flagget finnes allerede' }, 409);
  const now = Date.now();
  // Nye flagg er alltid AV som standard, uansett hva klienten sender.
  q('INSERT INTO flags51(key, description, default_on, created, updated, builtin) VALUES(?,?,0,?,?,0)').run(key, String(b.description ?? '').slice(0, 300), now, now);
  return c.json({ flag: flagOut(flagRow(key)) }, 201);
});
qa51Api.patch('/admin/flags51/:key', authOrToken, adminOnly, async (c) => {
  const f = flagRow(c.req.param('key'));
  if (!f) return c.json({ error: 'Fant ikke flagget' }, 404);
  const b = await body(c);
  if (b.default !== undefined && typeof b.default !== 'boolean') return c.json({ error: 'default må være true eller false' }, 400);
  q('UPDATE flags51 SET default_on=COALESCE(?, default_on), description=COALESCE(?, description), updated=? WHERE key=?')
    .run(b.default === undefined ? null : b.default ? 1 : 0, typeof b.description === 'string' ? b.description.slice(0, 300) : null, Date.now(), f.key);
  return c.json({ flag: flagOut(flagRow(f.key)) });
});
qa51Api.put('/admin/flags51/:key/override', authOrToken, adminOnly, async (c) => {
  const f = flagRow(c.req.param('key'));
  if (!f) return c.json({ error: 'Fant ikke flagget' }, 404);
  const b = await body(c);
  const scope = b.scope === 'device' ? 'device' : b.scope === 'user' ? 'user' : null;
  if (!scope) return c.json({ error: "scope må være 'user' eller 'device'" }, 400);
  const user = String(b.user ?? '');
  if (!userInfo(user)) return c.json({ error: 'Fant ikke brukeren' }, 404);
  const device = scope === 'device' ? String(b.device ?? '') : '';
  if (scope === 'device' && !/^(app|web)-[0-9a-f]{16}$/.test(device)) return c.json({ error: 'device må være en enhets-id fra listen (app-… eller web-…)' }, 400);
  if (b.value === null) q('DELETE FROM flag_overrides51 WHERE flag_key=? AND user=? AND device=?').run(f.key, user, device);
  else if (typeof b.value === 'boolean') q(`INSERT INTO flag_overrides51(flag_key, user, device, value, updated) VALUES(?,?,?,?,?)
    ON CONFLICT(flag_key, user, device) DO UPDATE SET value=excluded.value, updated=excluded.updated`).run(f.key, user, device, b.value ? 1 : 0, Date.now());
  else return c.json({ error: 'value må være true, false eller null (fjern)' }, 400);
  return c.json({ flag: flagOut(flagRow(f.key)) });
});
qa51Api.delete('/admin/flags51/:key', authOrToken, adminOnly, (c) => {
  const f = flagRow(c.req.param('key'));
  if (!f) return c.json({ error: 'Fant ikke flagget' }, 404);
  if (f.builtin) return c.json({ error: 'Innebygde flagg kan ikke slettes (slå dem av i stedet)' }, 400);
  q('DELETE FROM flag_overrides51 WHERE flag_key=?').run(f.key);
  q('DELETE FROM flags51 WHERE key=?').run(f.key);
  return c.json({ ok: true });
});

// --- Krasjrapporter inn (web, PWA, iOS, Android, Mac) ---
const crashLimit = bodyLimit({ maxSize: CRASH_MAX_BYTES51, onError: (c) => c.json({ error: `Rapporten er for stor (maks ${CRASH_MAX_BYTES51 / 1024} KB)` }, 413) });
qa51Api.post('/crash', crashLimit, async (c) => {
  // Innlogging er valgfri (krasj på innloggingssiden skal også komme fram), men uten innlogging er grensen strengere.
  let user = sessionUser(c);
  if (!user && c.req.header('authorization')) {
    let ok = false;
    const rejected = await authOrToken(c, async () => { ok = true; }); // svarer 401 selv når tokenet ikke gjelder
    if (ok && !rejected) user = c.get('user') ?? null;
  }
  if (user && !userInfo(user)) user = null;
  const ip = clientIp(c);
  const ok = allow(`ip:${ip}`, user ? 60 : 10, 60_000) && (!user || allow(`u:${user}`, 60, 60_000)) && allow('all', 600, 3600_000);
  if (!ok) return c.json({ error: 'For mange krasjrapporter – prøv igjen om litt' }, 429, { 'Retry-After': '60' });
  let b;
  try { b = await c.req.json(); } catch { return c.json({ error: 'Ugyldig JSON' }, 400); }
  const reports = Array.isArray(b?.reports) ? b.reports.slice(0, 10) : [b];
  const ids = [];
  for (const rep of reports) {
    const dev = deviceOf51(c);
    const r = recordCrash51(rep, { user, device: dev?.id ?? null });
    if (r.error) { if (reports.length === 1) return c.json({ error: r.error }, 400); continue; }
    ids.push(r.id);
    if (!r.dedup) forwardSoon(r.id);
  }
  return c.json({ ok: true, id: ids[0] ?? null, ids, forwarding: !!forwardTarget() }, 202);
});

// --- Admin: krasjrapporter ---
qa51Api.get('/admin/crashes51/status', authOrToken, adminOnly, (c) => {
  const d = parseDsn51();
  const t = forwardTarget();
  return c.json({
    glitchtip: { configured: !!d, host: d?.host ?? null, local: d ? isLocalHost51(d.hostname) : null, active: !!t, reachable: glitchState ? glitchState.ok : null, lastError: glitchState?.ok === false ? glitchState.error : null, lastAt: glitchState ? new Date(glitchState.at).toISOString() : null,
      note: !d ? 'GLITCHTIP_DSN er ikke satt – rapportene lagres bare lokalt.' : !t ? 'GlitchTip ligger utenfor huset – sett GLITCHTIP_ALLOW_EXTERNAL=1 for å videresende dit.' : null },
    total: q('SELECT COUNT(*) n FROM crash51').get().n, pending: t ? pendingCount() : 0,
    last24h: q('SELECT COALESCE(SUM(count),0) n FROM crash51 WHERE last_seen > ?').get(Date.now() - 86400_000).n,
    maxBytes: CRASH_MAX_BYTES51,
  }, 200, { 'Cache-Control': 'no-store' });
});
qa51Api.get('/admin/crashes51', authOrToken, adminOnly, (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 500);
  const platform = c.req.query('platform');
  const text = String(c.req.query('q') ?? '').slice(0, 80);
  const where = [], args = [];
  if (platform && PLATFORMS.includes(platform)) { where.push('platform=?'); args.push(platform); }
  if (text) { where.push('message LIKE ?'); args.push(`%${text.replace(/[%_]/g, '')}%`); }
  const rows = q(`SELECT * FROM crash51 ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_seen DESC LIMIT ?`).all(...args, limit);
  return c.json({ crashes: rows.map((r) => crashOut(r)) }, 200, { 'Cache-Control': 'no-store' });
});
qa51Api.get('/admin/crashes51/:id{[0-9]+}', authOrToken, adminOnly, (c) => {
  const r = q('SELECT * FROM crash51 WHERE id=?').get(Number(c.req.param('id')));
  return r ? c.json({ crash: crashOut(r, true) }) : c.json({ error: 'Fant ikke rapporten' }, 404);
});
qa51Api.post('/admin/crashes51/flush', authOrToken, adminOnly, async (c) => c.json(await flushCrashes51()));
qa51Api.delete('/admin/crashes51', authOrToken, adminOnly, (c) => c.json({ ok: true, deleted: q('DELETE FROM crash51').run().changes }));

// --- «Nytt i denne versjonen» ---
qa51Api.get('/whatsnew', authOrToken, (c) => {
  const v = c.req.query('version');
  if (v && !/^\d+\.\d+\.\d+$/.test(v)) return c.json({ error: 'version må være x.y.z' }, 400);
  const w = whatsNew51(v || null);
  if (!w) return c.json({ error: v ? 'Fant ikke versjonen i endringsloggen' : 'Ingen endringslogg' }, 404);
  const user = c.get('user');
  const seenVersion = kv.get(user, 'whatsnew51_seen', null);
  // Kortet vises én gang per versjon og bruker: når gjeldende versjon ikke er markert som sett (også første gang).
  const show = w.version === w.current && seenVersion !== w.version;
  return c.json({ ...w, seen: seenVersion === w.version, seenVersion, show }, 200, { 'Cache-Control': 'no-store' });
});
qa51Api.post('/whatsnew/seen', authOrToken, async (c) => {
  const b = await body(c);
  const v = String(b.version ?? '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) return c.json({ error: 'version må være x.y.z' }, 400);
  kv.set(c.get('user'), 'whatsnew51_seen', v);
  return c.json({ ok: true, seenVersion: v });
});

let flushTimer = null;
export function startQa51() {
  if (flushTimer) return;
  flushTimer = setInterval(() => { flushCrashes51().catch(() => {}); }, 10 * 60_000);
  flushTimer.unref?.();
}

/** Monteres før /api-rutene med requireAuth (index.js). */
export function mountQa51(app) {
  app.route('/api', qa51Api);
}
