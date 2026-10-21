// Prompt 44 (SERVER44): «Logg inn som» (impersonering), rediger andres oppsett, og overfør eierskapet til serveren.
// claude-code-rediger-andres-oppsett.md, claude-code-overfor-servereier.md og kontrakten (Sikkerhet).
//
// Impersonering (bare admin, aldri en annen admin eller eieren):
//   POST /api/admin/impersonate {userId, web?:true} → {token, tokenType:'Bearer', expiresAt, ttlSec:1800, user:{id,name,color?}, actor:{id,name}, act:{sub:adminId}}
//        web:true setter i tillegg informasjonskapselen hl_imp (httpOnly) – da gjelder X-økten i nettleseren til «Gå ut».
//   GET  /api/admin/impersonate → {active, user?, actor?, expiresAt?, changes?}   (med X-tokenet / hl_imp, ellers active:false)
//   POST /api/admin/impersonate/exit → {ok, changes, user, actor, message, undo:{method,path}}   (forkaster X-tokenet)
//   GET  /api/admin/impersonate/notice → {notice:{by, at, changes, text}|null} · POST …/notice/seen → {ok}   (for X selv)
//   Tokenet er et vanlig app-token (fh_pat_…, finance:read + finance:write) for X, kortlevd: 30 min, fornyes ved aktivitet.
//   Admin-tokenet/-økten røres ikke. Mens det brukes: ikke passord, 2FA, rolle, eierskap, sletting, tokens eller oppdatering;
//   Chat, Finans og Helse er skrivebeskyttet (403 {readOnly:true}). Alt som skriver logges «[imp] actor=<admin> as=<X> …».
// Oppsett (bare admin, ikke mens man er logget inn som en annen):
//   GET  /api/users/:id/layout → {userId, name, home, nav, mer, locked, lockedBy, updatedBy, updatedAt, layout}
//   PUT  /api/users/:id/layout {…samme nøkler som PUT /api/me/layout (+ home/nav/mer)} → samme form som GET
//   POST /api/users/:id/layout/copy-from-me → samme · POST …/reset → samme · POST …/undo → samme
//   PUT  /api/users/:id/layout/lock {locked} → samme. Låst: X får 423 {locked:true, error:'Oppsettet styres av …'} på PUT /api/me/layout.
//   Sanntid «layout.updated» {userId, by, at} til X.
// Eierskap:
//   GET  /api/server/owner → {owner:{id,name,avatarUrl,since}, me:{id, isOwner, canTransfer, needsApproval}, pending:[…], candidates:[{id,name,role,totp,eligible,reason}]}
//   POST /api/server/owner/transfer {toUserId, password|reauthToken} → eier: {ok, owner, previous, message} · admin: 202 {ok, pending, message}
//   POST /api/server/owner/transfer/:id/approve {password|reauthToken} (eieren) → {ok, owner, previous, message} · …/reject → {ok, pending}
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db, kv, OWNER } from './db.js';
import { userInfo, isAdmin, listUsers, checkPassword, clientIp, loginBlocked, loginFailed, loginSucceeded, cookieSecure, sessionUser } from './auth.js';
import { issueToken, revokeTokenOf, tokenAccessOf } from './finans/routes.js';
import { consumeReauth } from './reauth.js';
import { broadcast } from './realtime.js';
import { notifyUser } from './notify.js';
import { authOrToken, layoutOf } from './mobile.js';

db.exec(`CREATE TABLE IF NOT EXISTS imp44 (tok_hash TEXT PRIMARY KEY, token_id TEXT NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL,
  expires INTEGER NOT NULL, renewed INTEGER NOT NULL, ended INTEGER, changes INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS owner44_transfer (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, to_user TEXT NOT NULL, by_user TEXT NOT NULL, created INTEGER NOT NULL,
  expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decided INTEGER);`);
const q = (sql) => db.prepare(sql);

export const IMP_TTL_MS = 30 * 60_000;
const IMP_COOKIE = 'hl_imp';
const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
const nameOf = (id) => userInfo(id)?.displayName ?? userInfo(id)?.name ?? String(id);
const brief = (id) => { const u = userInfo(id); return u ? { id: u.id, name: u.displayName ?? u.name, avatarUrl: u.avatarUrl ?? null } : null; };
const bearerOf = (c) => c.req.header('authorization')?.match(/^Bearer\s+(fh_[A-Za-z0-9_-]{20,})$/)?.[1] ?? null;
/** Den aktive impersoneringen for tokenet i forespørselen, eller null. */
export function impOf(token, now = Date.now()) {
  if (!token) return null;
  const r = q('SELECT * FROM imp44 WHERE tok_hash=?').get(sha(token));
  return r && !r.ended && r.expires > now ? r : null;
}
const isOwnerUser = (id) => !!q('SELECT is_main_admin FROM users WHERE id=?').get(id)?.is_main_admin;
export const serverOwner44 = () => q('SELECT id FROM users WHERE is_main_admin=1 ORDER BY created LIMIT 1').get()?.id ?? (userInfo(OWNER) ? OWNER : null);

/* ---------------- Sperrer mens man er logget inn som en annen ---------------- */

const DENY = [
  ['PUT', /^\/api\/password$/], ['*', /^\/api\/auth\/(totp|2fa)(\/|$)/], ['DELETE', /^\/api\/users\//], ['POST', /^\/api\/users$/],
  ['*', /^\/api\/server\/owner(\/|$)/], ['POST', /^\/api\/admin\/impersonate$/], ['*', /^\/api\/(system\/update|update|backup)(\/|$)/], ['*', /^\/api\/system\/containers\//],
  ['*', /^\/(finans\/)?api\/tokens(\/|$)/], ['*', /^\/finans\/api\/tokens(\/|$)/], ['POST', /^\/api\/auth\/(qr|reauth|logout-all)/], ['*', /^\/api\/me\/sessions/], ['*', /^\/api\/users\/[^/]+\/layout/],
];
const READONLY = [/^\/finans\/api\//, /^\/api\/chat(\/|$)/, /^\/api\/family\/health(\/|$)/, /^\/api\/health42(\/|$)/, /^\/api\/homes(\/|$)/, /^\/api\/boliger(\/|$)/];
const LAYOUT_WRITE = /^\/api\/(me\/layout|layouts?|dashboard\/layout|app\/pages|weather\/layout|me\/shortcuts|tasks\/lists\/order)/;
function blocked(c, imp) {
  const m = c.req.method, p = c.req.path;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  if (DENY.some(([mm, re]) => (mm === '*' || mm === m) && re.test(p))) return { error: `Ikke mulig mens du er logget inn som ${nameOf(imp.target)}. Gå ut først.`, impersonating: true };
  if (m === 'PATCH' && /^\/api\/users\/[^/]+$/.test(p)) return { error: `Rolle, passord og 2FA for ${nameOf(imp.target)} kan ikke endres mens du er logget inn som ${nameOf(imp.target)}.`, impersonating: true };
  if (READONLY.some((re) => re.test(p))) return { error: `Du ser dette som admin. Chat, Finans og Helse er skrivebeskyttet mens du er logget inn som ${nameOf(imp.target)}.`, readOnly: true, impersonating: true };
  return null;
}

/**
 * Global middleware (index.js, før alle ruter). 1) hl_imp-informasjonskapsel fra nettleseren: forespørselen sendes på nytt med
 * X-tokenet (og uten admin-økten). 2) X-tokenet: fornyes ved aktivitet, c.set('actor'), sperrer og logg.
 */
export const impersonation44 = (app) => async (c, next) => {
  const ck = getCookie(c, IMP_COOKIE);
  if (ck && !c.req.header('authorization') && /^\/(api|finans\/api)\//.test(c.req.path)) {
    const imp = impOf(ck);
    if (imp) {
      const h = new Headers(c.req.raw.headers);
      h.set('authorization', `Bearer ${ck}`);
      h.set('cookie', (h.get('cookie') ?? '').split(/;\s*/).filter((x) => x && !/^(hl_sid|hl_dev|hl_imp)=/.test(x)).join('; '));
      const init = { method: c.req.method, headers: h };
      if (!['GET', 'HEAD'].includes(c.req.method)) { init.body = await c.req.raw.arrayBuffer(); }
      return app.fetch(new Request(c.req.url, init), c.env);
    }
    deleteCookie(c, IMP_COOKIE, { path: '/' });
  }
  const tok = bearerOf(c);
  const imp = tok ? impOf(tok) : null;
  if (!imp) return next();
  const now = Date.now();
  if (now - imp.renewed > 60_000) {
    const exp = now + IMP_TTL_MS;
    q('UPDATE imp44 SET expires=?, renewed=? WHERE tok_hash=?').run(exp, now, imp.tok_hash);
    q('UPDATE fh_tokens SET expires=? WHERE id=?').run(exp, imp.token_id);
  }
  c.set('actor', imp.actor);
  c.set('impersonation', imp);
  const deny = blocked(c, imp);
  if (deny) { console.log(`[imp] actor=${imp.actor} as=${imp.target} ${c.req.method} ${c.req.path} → avvist`); return c.json(deny, 403); }
  await next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    console.log(`[imp] actor=${imp.actor} as=${imp.target} ${c.req.method} ${c.req.path} ${c.res.status}`);
    if (c.res.status < 400 && LAYOUT_WRITE.test(c.req.path)) {
      q('UPDATE imp44 SET changes=changes+1 WHERE tok_hash=?').run(imp.tok_hash);
      layoutMeta(imp.target, imp.actor);
    }
  }
};

/* ---------------- Oppsett ---------------- */

const META = 'layout44_meta', LOCK = 'layout44_lock', HIST = 'layout44_hist';
function layoutMeta(target, by) {
  const at = new Date().toISOString();
  kv.set(target, META, { updatedBy: by, updatedByName: nameOf(by), updatedAt: at });
  broadcast('layout.updated', { userId: target, by, byName: nameOf(by), at }, [target]);
}
function snapshot(target, by, reason) {
  const h = kv.get(target, HIST, []) ?? [];
  kv.set(target, HIST, [{ at: Date.now(), by, reason, layout: layoutOf(target) }, ...h].slice(0, 10));
}
const lockOf = (id) => kv.get(id, LOCK, null) ?? { locked: false };
export function layoutOut44(id) {
  const l = layoutOf(id), m = kv.get(id, META, null) ?? {}, lk = lockOf(id);
  return { userId: id, name: nameOf(id), home: l.pages?.hjem ?? l.pages?.home ?? l.mobile?.sec ?? null, nav: l.finNavList ?? l.homeNav ?? l.mobile?.finTabs ?? null, mer: l.pages?.mer ?? l.mobile?.hide ?? null,
    locked: !!lk.locked, lockedBy: lk.locked ? nameOf(lk.by) : null, canEditSelf: !lk.locked, updatedBy: m.updatedByName ?? null, updatedById: m.updatedBy ?? null, updatedAt: m.updatedAt ?? null,
    undoAvailable: (kv.get(id, HIST, []) ?? []).length > 0, layout: l };
}
let mobileApiRef = null;
/** index.js gir oss mobileApi, så PUT /api/users/:id/layout bruker samme validering som PUT /api/me/layout. */
export const setMobileApi44 = (a) => { mobileApiRef = a; };
async function putAs(target, body) {
  const t = issueToken(target, { name: 'Oppsett (admin)', scopes: ['finance:read', 'finance:write'], expires: Date.now() + 60_000 });
  try {
    const r = await mobileApiRef.request('/me/layout', { method: 'PUT', headers: { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } finally { revokeTokenOf(target, t.fullId); }
}
const mapBody = (b) => {
  const out = { ...b };
  delete out.locked;
  if (b.home !== undefined) { out.pages = { ...(out.pages ?? {}), hjem: b.home }; delete out.home; }
  if (b.mer !== undefined) { out.pages = { ...(out.pages ?? {}), mer: b.mer }; delete out.mer; }
  if (b.nav !== undefined) { out.finNav = b.nav; delete out.nav; }
  return out;
};

/** Middleware på /api/me/layout: låst oppsett (X kan ikke endre selv) og locked/lockedBy i svaret. */
export async function layoutLockMw44(c, next) {
  if (c.req.method === 'PUT') {
    const tok = bearerOf(c), imp = tok ? impOf(tok) : null;
    const u = sessionUser(c) ?? tokenAccessOf(c)?.user ?? null;
    if (u && !imp && !isAdmin(u) && lockOf(u).locked) return c.json({ error: `Oppsettet styres av ${nameOf(lockOf(u).by)}`, locked: true }, 423);
    if (u && imp) snapshotOnce(u, imp);
  }
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200) return;
  try {
    const j = await c.res.clone().json();
    const u = sessionUser(c) ?? tokenAccessOf(c)?.user ?? null;
    if (!u) return;
    const lk = lockOf(u), m = kv.get(u, META, null);
    c.res = c.json({ ...j, locked: !!lk.locked, lockedBy: lk.locked ? nameOf(lk.by) : null, ...(m?.updatedAt ? { layoutUpdatedBy: m.updatedByName, layoutUpdatedAt: m.updatedAt } : {}) });
  } catch { /* lar svaret stå */ }
}
// Første endring i en impersonering: øyeblikksbilde, så «Angre» etter Gå ut kan rulle tilbake.
function snapshotOnce(target, imp) {
  const key = `layout44_imp_${imp.tok_hash.slice(0, 16)}`;
  if (kv.get(target, key, null)) return;
  kv.set(target, key, 1);
  snapshot(target, imp.actor, 'impersonation');
}

/* ---------------- Ruter ---------------- */

const sameAdmin = async (c, next) => {
  const u = c.get('user');
  if (c.get('actor')) return c.json({ error: 'Ikke mulig mens du er logget inn som en annen bruker. Gå ut først.', impersonating: true }, 403);
  if (!isAdmin(u)) return c.json({ error: 'Bare administratorer kan gjøre dette', restricted: true }, 403);
  await next();
};
const targetOk = (c) => {
  const id = c.req.param('id'), t = userInfo(id);
  if (!t) return { res: c.json({ error: 'Fant ikke brukeren' }, 404) };
  return { id };
};

export const admin44Api = new Hono();
admin44Api.post('/admin/impersonate', authOrToken, sameAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const admin = c.get('user'), id = String(b?.userId ?? '');
  const t = userInfo(id);
  if (!t) return c.json({ error: 'Fant ikke brukeren' }, 404);
  if (id === admin) return c.json({ error: 'Du er allerede deg selv' }, 400);
  if (t.role === 'admin' || isOwnerUser(id) || id === OWNER) return c.json({ error: 'Du kan ikke logge inn som en annen administrator eller eieren' }, 403);
  const now = Date.now(), exp = now + IMP_TTL_MS;
  const tok = issueToken(id, { name: `Logg inn som (${nameOf(admin)})`, scopes: ['finance:read', 'finance:write'], expires: exp });
  q('INSERT INTO imp44(tok_hash, token_id, actor, target, created, expires, renewed) VALUES(?,?,?,?,?,?,?)').run(sha(tok.token), tok.fullId, admin, id, now, exp, now);
  console.log(`[imp] start actor=${admin} as=${id} ip=${clientIp(c)}`);
  if (b?.web === true) setCookie(c, IMP_COOKIE, tok.token, { httpOnly: true, sameSite: 'Strict', secure: cookieSecure(c), path: '/', maxAge: 12 * 3600 });
  return c.json({ token: tok.token, tokenType: 'Bearer', expiresAt: new Date(exp).toISOString(), ttlSec: IMP_TTL_MS / 1000, renewsOnActivity: true,
    user: brief(id), actor: brief(admin), act: { sub: admin }, web: b?.web === true }, 201);
});
admin44Api.get('/admin/impersonate', authOrToken, (c) => {
  const imp = c.get('impersonation');
  if (!imp) return c.json({ active: false });
  const cur = q('SELECT * FROM imp44 WHERE tok_hash=?').get(imp.tok_hash);
  return c.json({ active: true, user: brief(imp.target), actor: brief(imp.actor), act: { sub: imp.actor }, expiresAt: new Date(cur.expires).toISOString(), changes: cur.changes, text: `Logget inn som ${nameOf(imp.target)}` });
});
admin44Api.post('/admin/impersonate/exit', authOrToken, (c) => {
  const imp = c.get('impersonation');
  deleteCookie(c, IMP_COOKIE, { path: '/' });
  if (!imp) return c.json({ ok: true, active: false, changes: 0 });
  const cur = q('SELECT * FROM imp44 WHERE tok_hash=?').get(imp.tok_hash);
  q('UPDATE imp44 SET ended=? WHERE tok_hash=?').run(Date.now(), imp.tok_hash);
  revokeTokenOf(imp.target, imp.token_id);
  const n = cur?.changes ?? 0, x = nameOf(imp.target), a = nameOf(imp.actor);
  if (n > 0) {
    kv.set(imp.target, 'imp44_notice', { by: imp.actor, byName: a, at: new Date().toISOString(), changes: n, text: `${a} har oppdatert oppsettet ditt` });
    notifyUser(imp.target, { title: `${a} har oppdatert oppsettet ditt`, body: `${n} ${n === 1 ? 'endring' : 'endringer'}. Trykk for å se.`, url: '/', tag: 'layout-updated', category: 'system' }).catch(() => {});
  }
  console.log(`[imp] slutt actor=${imp.actor} as=${imp.target} endringer=${n}`);
  return c.json({ ok: true, changes: n, user: brief(imp.target), actor: brief(imp.actor), message: `Logget ut av ${x} · ${n} ${n === 1 ? 'endring' : 'endringer'} lagret. Du er ${a} igjen.`,
    undo: n > 0 ? { label: 'Angre', method: 'POST', path: `/api/users/${imp.target}/layout/undo`, ms: 4500 } : null });
});
admin44Api.get('/admin/impersonate/notice', authOrToken, (c) => c.json({ notice: c.get('actor') ? null : kv.get(c.get('user'), 'imp44_notice', null) }));
admin44Api.post('/admin/impersonate/notice/seen', authOrToken, (c) => { if (!c.get('actor')) kv.del(c.get('user'), 'imp44_notice'); return c.json({ ok: true }); });

admin44Api.get('/users/:id/layout', authOrToken, sameAdmin, (c) => { const t = targetOk(c); return t.res ?? c.json(layoutOut44(t.id)); });
admin44Api.put('/users/:id/layout', authOrToken, sameAdmin, async (c) => {
  const t = targetOk(c); if (t.res) return t.res;
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt' }, 400);
  if (typeof b.locked === 'boolean') kv.set(t.id, LOCK, { locked: b.locked, by: c.get('user'), at: Date.now() });
  const body = mapBody(b);
  if (Object.keys(body).length) {
    snapshot(t.id, c.get('user'), 'edit');
    const r = await putAs(t.id, body);
    if (r.status !== 200) return c.json(r.body, r.status);
  }
  layoutMeta(t.id, c.get('user'));
  console.log(`layout.update user=${t.id} by=${c.get('user')}`);
  return c.json(layoutOut44(t.id));
});
admin44Api.post('/users/:id/layout/copy-from-me', authOrToken, sameAdmin, (c) => {
  const t = targetOk(c); if (t.res) return t.res;
  snapshot(t.id, c.get('user'), 'copy');
  const mine = layoutOf(c.get('user')), theirs = layoutOf(t.id);
  // Personlige felt (språk, appnavn, profilbilde-relatert) beholdes hos mottakeren.
  const keep = Object.fromEntries(['language', 'appName', 'onboarded', 'appIcon'].filter((k) => k in theirs).map((k) => [k, theirs[k]]));
  kv.set(t.id, 'layout', { ...mine, ...keep });
  layoutMeta(t.id, c.get('user'));
  return c.json(layoutOut44(t.id));
});
admin44Api.post('/users/:id/layout/reset', authOrToken, sameAdmin, (c) => {
  const t = targetOk(c); if (t.res) return t.res;
  snapshot(t.id, c.get('user'), 'reset');
  const cur = layoutOf(t.id);
  kv.set(t.id, 'layout', Object.fromEntries(['language', 'appName', 'onboarded'].filter((k) => k in cur).map((k) => [k, cur[k]])));
  layoutMeta(t.id, c.get('user'));
  return c.json(layoutOut44(t.id));
});
admin44Api.post('/users/:id/layout/undo', authOrToken, sameAdmin, (c) => {
  const t = targetOk(c); if (t.res) return t.res;
  const h = kv.get(t.id, HIST, []) ?? [];
  if (!h.length) return c.json({ error: 'Ingenting å angre' }, 409);
  const [top, ...rest] = h;
  kv.set(t.id, 'layout', top.layout ?? {});
  kv.set(t.id, HIST, rest);
  layoutMeta(t.id, c.get('user'));
  return c.json({ ...layoutOut44(t.id), undone: { at: new Date(top.at).toISOString(), reason: top.reason } });
});
admin44Api.put('/users/:id/layout/lock', authOrToken, sameAdmin, async (c) => {
  const t = targetOk(c); if (t.res) return t.res;
  const b = await c.req.json().catch(() => ({}));
  if (typeof b?.locked !== 'boolean') return c.json({ error: 'locked må være true eller false' }, 400);
  kv.set(t.id, LOCK, { locked: b.locked, by: c.get('user'), at: Date.now() });
  broadcast('layout.updated', { userId: t.id, by: c.get('user'), locked: b.locked, at: new Date().toISOString() }, [t.id]);
  return c.json(layoutOut44(t.id));
});

/* ---------------- Eierskap ---------------- */

const REAUTH_HELP = 'Bekreft med passordet ditt (eller Face ID / fingeravtrykk: reauthToken fra POST /api/auth/reauth)';
function reauthOk(c, b) {
  const u = c.get('user'), ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return { res: c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429) };
  if (typeof b?.reauthToken === 'string' && consumeReauth(b.reauthToken, u)) return {};
  if (typeof b?.password === 'string' && checkPassword(u, b.password)) { loginSucceeded(ip); return {}; }
  if (b?.password !== undefined) loginFailed(ip);
  return { res: c.json({ error: b?.password !== undefined || b?.reauthToken !== undefined ? 'Bekreftelsen stemmer ikke' : REAUTH_HELP, needsReauth: true }, 403) };
}
const totpOn = (id) => !!q('SELECT totp_enabled FROM users WHERE id=?').get(id)?.totp_enabled;
function eligible(id, owner) {
  const u = userInfo(id);
  if (!u) return { ok: false, reason: 'Fant ikke brukeren' };
  if (id === owner) return { ok: false, reason: 'Eier allerede serveren' };
  if (!totpOn(id)) return { ok: false, reason: `${u.displayName ?? u.name} må slå på 2FA først` };
  return { ok: true };
}
const transferOut = (r) => r && { id: r.id, from: brief(r.from_user), to: brief(r.to_user), by: brief(r.by_user), createdAt: new Date(r.created).toISOString(), expiresAt: new Date(r.expires).toISOString(), status: r.expires < Date.now() && r.status === 'pending' ? 'expired' : r.status };
function doTransfer(from, to, by) {
  db.transaction(() => {
    q('UPDATE users SET is_main_admin=0 WHERE is_main_admin=1').run();
    q("UPDATE users SET is_main_admin=1, role='admin' WHERE id=?").run(to);
    if (from) q("UPDATE users SET role='admin' WHERE id=?").run(from); // forrige eier blir (fortsatt) admin
  })();
  kv.set(OWNER, 'server_owner44', { id: to, since: new Date().toISOString(), from, by });
  console.log(`owner.transfer from=${from} to=${to} by=${by}`);
  const fromName = nameOf(from), toName = nameOf(to);
  notifyUser(to, { title: 'Du eier nå serveren', body: `${fromName} overførte eierskapet til deg.`, url: '/#/innstillinger/kontoer', tag: 'owner-transfer', category: 'system' }).catch(() => {});
  broadcast('server.owner', { owner: brief(to), previous: brief(from) });
  return { ok: true, owner: brief(to), previous: brief(from), message: `${toName} eier nå serveren. Du er fortsatt admin. ${toName} har fått varsel.` };
}
admin44Api.get('/server/owner', authOrToken, (c) => {
  const u = c.get('user'), owner = serverOwner44(), info = kv.get(OWNER, 'server_owner44', null);
  const isOwner = u === owner, admin = isAdmin(u);
  const since = info?.id === owner ? info.since : userInfo(owner) ? new Date(q('SELECT created FROM users WHERE id=?').get(owner)?.created ?? Date.now()).toISOString() : null;
  const pending = q("SELECT * FROM owner44_transfer WHERE status='pending' ORDER BY id DESC").all().map(transferOut).filter((x) => x.status === 'pending');
  return c.json({ owner: owner ? { ...brief(owner), since } : null, me: { id: u, isOwner, canTransfer: (isOwner || admin) && !c.get('actor'), needsApproval: admin && !isOwner },
    pending: isOwner || admin ? pending : [], candidates: isOwner || admin ? listUsers().filter((x) => x.id !== owner).map((x) => { const e = eligible(x.id, owner); return { id: x.id, name: x.displayName, role: x.role, avatarUrl: x.avatarUrl, totp: !!x.totp, eligible: e.ok, reason: e.reason ?? null }; }) : [] });
});
admin44Api.post('/server/owner/transfer', authOrToken, async (c) => {
  const u = c.get('user'), owner = serverOwner44();
  if (c.get('actor')) return c.json({ error: 'Ikke mulig mens du er logget inn som en annen bruker' }, 403);
  if (u !== owner && !isAdmin(u)) return c.json({ error: 'Bare eieren og administratorer kan overføre serveren' }, 403);
  const b = await c.req.json().catch(() => ({}));
  const r = reauthOk(c, b); if (r.res) return r.res;
  const to = String(b?.toUserId ?? '');
  const e = eligible(to, owner);
  if (!e.ok) return c.json({ error: e.reason, field: 'toUserId' }, userInfo(to) ? 409 : 404);
  if (u === owner) return c.json(doTransfer(owner, to, u));
  // Admin som ikke er eier: eieren må godkjenne innen 48 t.
  q("UPDATE owner44_transfer SET status='replaced', decided=? WHERE status='pending'").run(Date.now());
  const row = q('INSERT INTO owner44_transfer(from_user, to_user, by_user, created, expires) VALUES(?,?,?,?,?) RETURNING *').get(owner, to, u, Date.now(), Date.now() + 48 * 3600_000);
  notifyUser(owner, { title: 'Godkjenn overføring av serveren', body: `${nameOf(u)} vil overføre serveren til ${nameOf(to)}. Gyldig i 48 timer.`, url: '/#/innstillinger/kontoer', tag: `owner-${row.id}`, category: 'system', data: { kind: 'owner.transfer', id: row.id } }).catch(() => {});
  console.log(`owner.transfer.request id=${row.id} from=${owner} to=${to} by=${u}`);
  return c.json({ ok: true, pending: transferOut(row), message: `Venter på godkjenning fra ${nameOf(owner)} (48 timer)` }, 202);
});
admin44Api.post('/server/owner/transfer/:id{[0-9]+}/:act{approve|reject}', authOrToken, async (c) => {
  const u = c.get('user'), owner = serverOwner44();
  if (c.get('actor')) return c.json({ error: 'Ikke mulig mens du er logget inn som en annen bruker' }, 403);
  if (u !== owner) return c.json({ error: 'Bare eieren kan godkjenne eller avslå' }, 403);
  const row = q('SELECT * FROM owner44_transfer WHERE id=?').get(+c.req.param('id'));
  if (!row || row.status !== 'pending') return c.json({ error: 'Fant ingen ventende overføring' }, 404);
  if (row.expires < Date.now()) { q("UPDATE owner44_transfer SET status='expired', decided=? WHERE id=?").run(Date.now(), row.id); return c.json({ error: 'Forespørselen er utløpt (48 timer)' }, 410); }
  const b = await c.req.json().catch(() => ({}));
  if (c.req.param('act') === 'reject') { q("UPDATE owner44_transfer SET status='rejected', decided=? WHERE id=?").run(Date.now(), row.id); notifyUser(row.by_user, { title: 'Overføringen ble avslått', body: `${nameOf(u)} avslo å overføre serveren til ${nameOf(row.to_user)}.`, category: 'system' }).catch(() => {}); return c.json({ ok: true, pending: transferOut(q('SELECT * FROM owner44_transfer WHERE id=?').get(row.id)) }); }
  const r = reauthOk(c, b); if (r.res) return r.res;
  const e = eligible(row.to_user, owner);
  if (!e.ok) return c.json({ error: e.reason }, 409);
  q("UPDATE owner44_transfer SET status='approved', decided=? WHERE id=?").run(Date.now(), row.id);
  return c.json(doTransfer(owner, row.to_user, row.by_user));
});
