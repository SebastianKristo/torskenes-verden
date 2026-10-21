// Prompt 44 (SERVER44): refresh-token for Kalender-appene (claude-code-kalender-ipad-topp-innlogging-hastighet.md, punkt 3) og
// app-logg til Docker-loggen.
//
//   Kalender-tokenene fra POST /api/auth/token og /api/auth/device-exchange får nå refresh:'hlr_…' + refreshExpires (90 d, glidende).
//   POST /api/auth/refresh {refresh, device?} → {token, refresh, refreshExpires, expires, app, device, user}
//        Roterer: nytt tilgangstoken (samme app + enhet; det gamle trekkes tilbake) og nytt refresh-token. Det forrige refresh-tokenet
//        kan brukes én gang til innen 60 s (grace) og gir da SAMME svar – så to samtidige fornyelser ikke logger ut.
//        Ugyldig/utløpt/tilbakekalt → 400 {error:'invalid_grant'} (bare da skal appen logge ut).
//   POST /api/apps/kalender/log {events:[{event, ms?, reason?, at?, platform?, version?}]} (eller ett objekt) → {ok, n}
//        Uten innlogging (handoff skjer før innlogging), maks 20 hendelser og 30 kall/min per IP. Skrives som
//        «kal.app event=… ms=… reason=… platform=… user=…» i Docker-loggen.
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { db as fhDb } from './finans/db.js';
import { userInfo, clientIp } from './auth.js';
import { issueToken, revokeTokenOf, tokenAccessOf } from './finans/routes.js';

fhDb.exec(`CREATE TABLE IF NOT EXISTS fh_refresh44 (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, app TEXT NOT NULL, device TEXT NOT NULL, token_id TEXT NOT NULL, scopes TEXT NOT NULL,
  family TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER, replaced_by TEXT);`);
const q = (s) => fhDb.prepare(s);
export const REFRESH_MS = 90 * 86400_000, GRACE_MS = 60_000;
const sha = (v) => createHash('sha256').update(String(v)).digest('hex');
const APPS = { kalender: 'Kalender' };

/** Nytt refresh-token for et Kalender-token (kalles fra auth41.js når tokenet lages). → {refresh, refreshExpires} */
export function issueRefresh44(user, app, device, tokenFullId, scopes, family = null) {
  const r = `hlr_${randomBytes(32).toString('base64url')}`, now = Date.now();
  q('INSERT INTO fh_refresh44(hash, user_id, app, device, token_id, scopes, family, created, expires) VALUES(?,?,?,?,?,?,?,?,?)').run(sha(r), user, app, device, tokenFullId, scopes.join(' '), family ?? randomBytes(8).toString('hex'), now, now + REFRESH_MS);
  return { refresh: r, refreshExpires: new Date(now + REFRESH_MS).toISOString() };
}
const grace = new Map(); // hash → {until, out}
function rotate(row, now) {
  // Nytt tilgangstoken for samme app + enhet; det gamle (og andre for samme enhet) trekkes tilbake.
  for (const old of q('SELECT token_id FROM fh_companion_tokens WHERE user_id=? AND app=? AND device=?').all(row.user_id, row.app, row.device)) {
    revokeTokenOf(row.user_id, old.token_id);
    q('DELETE FROM fh_companion_tokens WHERE token_id=?').run(old.token_id);
  }
  revokeTokenOf(row.user_id, row.token_id);
  const scopes = row.scopes.split(' ').filter(Boolean);
  const t = issueToken(row.user_id, { name: `${APPS[row.app] ?? row.app} (${row.device})`, scopes, expires: null });
  q('INSERT INTO fh_companion_tokens(token_id,user_id,app,device,parent,created) VALUES(?,?,?,?,?,?)').run(t.fullId, row.user_id, row.app, row.device, `refresh:${row.family}`, now);
  const nr = issueRefresh44(row.user_id, row.app, row.device, t.fullId, scopes, row.family);
  q('UPDATE fh_refresh44 SET used=?, replaced_by=? WHERE hash=?').run(now, sha(nr.refresh), row.hash);
  const u = userInfo(row.user_id);
  return { token: t.token, ...nr, expires: t.expires ?? null, app: row.app, device: row.device, scopes: t.scopes, user: { id: u.id, username: u.username, name: u.name ?? u.displayName ?? null } };
}
export function refresh44(refresh, now = Date.now()) {
  if (typeof refresh !== 'string' || !/^hlr_[A-Za-z0-9_-]{40,}$/.test(refresh)) return null;
  const h = sha(refresh);
  const g = grace.get(h);
  if (g && g.until > now) return g.out;
  const row = q('SELECT * FROM fh_refresh44 WHERE hash=?').get(h);
  if (!row || row.expires < now || !userInfo(row.user_id)) return null;
  // Tilgangstokenet er trukket tilbake (utlogging i Homelab, Enheter → Trekk tilbake): refresh-tokenet gjelder ikke lenger.
  if (!row.used && !q('SELECT 1 FROM fh_tokens WHERE id=?').get(row.token_id)) { q('DELETE FROM fh_refresh44 WHERE family=?').run(row.family); return null; }
  if (row.used) {
    // Brukt før grace-vinduet: mulig tyveri → hele familien trekkes tilbake.
    if (now - row.used > GRACE_MS) { for (const r of q('SELECT * FROM fh_refresh44 WHERE family=?').all(row.family)) { revokeTokenOf(r.user_id, r.token_id); q('DELETE FROM fh_refresh44 WHERE hash=?').run(r.hash); } }
    return null;
  }
  const out = rotate(row, now);
  grace.set(h, { until: now + GRACE_MS, out });
  for (const [k, v] of grace) if (v.until <= now) grace.delete(k);
  return out;
}

export const auth44Api = new Hono();
auth44Api.post('/auth/refresh', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const out = refresh44(b?.refresh ?? b?.refresh_token);
  if (!out) return c.json({ error: 'invalid_grant', message: 'Innloggingen er utløpt. Logg inn på nytt.' }, 400);
  console.log(`auth.refresh user=${out.user.id} app=${out.app} device=${out.device}`);
  return c.json(out, 200, { 'Cache-Control': 'no-store' });
});

const hits = new Map();
const clean = (v, n = 60) => String(v ?? '').replace(/[^\p{L}\p{N} ._:/=+-]/gu, '').slice(0, n);
auth44Api.post('/apps/kalender/log', async (c) => {
  const ip = clientIp(c), now = Date.now();
  const h = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (h.length >= 30) return c.json({ error: 'For mange logglinjer' }, 429);
  h.push(now); hits.set(ip, h);
  const b = await c.req.json().catch(() => null);
  const list = (Array.isArray(b?.events) ? b.events : b ? [b] : []).slice(0, 20);
  let user = null; try { user = tokenAccessOf(c)?.user ?? null; } catch { user = null; }
  let n = 0;
  for (const e of list) {
    const ev = String(e?.event ?? e?.name ?? '');
    if (!/^[a-z][\w.]{1,39}$/i.test(ev)) continue;
    const parts = [`event=${ev}`, Number.isFinite(+e.ms) ? `ms=${Math.round(+e.ms)}` : null, e.reason ? `reason=${clean(e.reason, 80).replace(/\s+/g, '_')}` : null, e.platform ? `platform=${clean(e.platform, 20)}` : null, e.version ? `version=${clean(e.version, 20)}` : null, user ? `user=${user}` : null].filter(Boolean);
    console.log(`kal.app ${parts.join(' ')}`);
    n++;
  }
  return c.json({ ok: true, n });
});
