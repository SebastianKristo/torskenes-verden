// Kontoinnstillinger for den innloggede brukeren: pålitelige enheter, bytt passord, brukerlisten og brukeradministrasjon,
// servernavnet og 2FA-oppsettet fra web (/api/auth/totp/*). Flyttet fra index.js (Fase 2b); rutene registreres på den innloggede
// routeren (`authed`, etter bearerFallthrough46 + requireAuth) på samme sted som før, så tilgangssjekkene er de samme:
//   alle innloggede: GET /devices, PUT /password, GET /users, PATCH /users/:id (bare eget navn/brukernavn uten admin),
//                    POST /auth/totp/{setup,verify,disable}, POST /devices/current, DELETE /devices/:id (bare egne enheter)
//   bare admin:      POST /users, PUT /server, DELETE /users/:id (requireAdmin)
import { db } from '../db.js';
import { removeAvatar } from '../mobile.js';
import { revokeUserTokens } from '../finans/routes.js';
import { companionsOf } from '../kalender/calendars.js';
import { rememberDevice, forgetDevice, currentDeviceId, currentSessionId, trustIp, isLan, requireAdmin, clientIp, userInfo, listUsersFor, createUser, deleteUser,
  updateUser, setPassword, checkPassword, setServerName, startTotpSetup, confirmTotpSetup, disableTotp, totpReadable, loginBlocked, loginFailed, loginSucceeded } from './session.js';

const fail = (c, e) => c.json({ error: e.message }, e.status ?? 400);

/** Registrerer kontorutene på en innlogget router (index.js: authed, montert under /api). */
export function registerAccountRoutes(r) {
  /* --- Pålitelige enheter --- */

  r.get('/devices', (c) => {
    const cur = currentDeviceId(c), ip = trustIp(c);
    const list = db.prepare('SELECT id, name, created, last_seen, last_ip FROM devices WHERE user=? ORDER BY last_seen DESC').all(c.get('user'));
    return c.json({ lan: isLan(ip), trusted: list.some((d) => d.id === cur),
      devices: list.map((d) => ({ id: d.id.slice(0, 16), name: d.name, created: d.created, lastSeen: d.last_seen, lastIp: d.last_ip, current: d.id === cur })),
      apps: companionsOf(c.get('user')) }); // prompt 33: companion-tokens (Kalender), trekkes tilbake med DELETE /api/tokens/companion/:id
  });
  r.put('/password', async (c) => {
    const { current, next } = await c.req.json().catch(() => ({}));
    const ip = clientIp(c), wait = loginBlocked(ip);
    if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
    if (!checkPassword(c.get('user'), current)) { loginFailed(ip); return c.json({ error: 'Nåværende passord er feil' }, 403); }
    try { setPassword(c.get('user'), next, { keepSession: currentSessionId(c) }); } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
    loginSucceeded(ip);
    return c.json({ ok: true });
  });

  /* --- Brukere, 2FA og innstillinger per bruker --- */

  // Alle innloggede ser listen (brukes til deling av boliger og huskelister); bare admin kan endre den.
  // Vanlige brukere ser bare id, navn og profilbilde om de andre (prompt 21), ikke rolle, brukernavn eller 2FA.
  // Prompt 91: totpUnreadable = 2FA er på, men hemmeligheten kan ikke leses med dagens serverhemmelighet (bare et flagg, aldri nøkkelen).
  const tfaFlag91 = (u) => (u && totpReadable(u.id) === false ? { ...u, totpUnreadable: true } : u);
  r.get('/users', (c) => c.json({ me: tfaFlag91(userInfo(c.get('user'))), users: listUsersFor(c.get('user')).map(tfaFlag91) }));
  r.post('/users', requireAdmin, async (c) => {
    try { return c.json(createUser(await c.req.json().catch(() => ({})))); } catch (e) { return fail(c, e); }
  });
  // Admin kan endre alle; andre kan bare endre sitt eget visningsnavn.
  r.patch('/users/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const id = c.req.param('id'), self = id === c.get('user');
    if (c.get('role') !== 'admin') {
      if (!self || b.role !== undefined || b.password !== undefined || b.resetTotp) return c.json({ error: 'Du kan bare endre ditt eget navn og brukernavn' }, 403);
    }
    try { return c.json(updateUser(id, { role: b.role, password: b.password, name: b.displayName ?? b.name, resetTotp: !!b.resetTotp, username: b.username })); } catch (e) { return fail(c, e); }
  });
  r.put('/server', requireAdmin, async (c) => {
    try { return c.json({ serverName: setServerName((await c.req.json().catch(() => ({}))).name) }); } catch (e) { return fail(c, e); }
  });
  r.delete('/users/:id', requireAdmin, (c) => {
    const id = c.req.param('id');
    try { deleteUser(id, c.get('user')); } catch (e) { return fail(c, e); }
    removeAvatar(id); revokeUserTokens(id);
    import('../voxcpm57/voices.js').then((m) => m.purgeUser57(id)).catch(() => {}); // prompt 57: brukerens stemmer og opptak
    return c.json({ ok: true });
  });
  r.post('/auth/totp/setup', (c) => { try { return c.json(startTotpSetup(c.get('user'))); } catch (e) { return fail(c, e); } });
  r.post('/auth/totp/verify', async (c) => {
    const { code } = await c.req.json().catch(() => ({}));
    try { return c.json({ ok: true, recoveryCodes: confirmTotpSetup(c.get('user'), code) }); } catch (e) { return fail(c, e); }
  });
  r.post('/auth/totp/disable', async (c) => {
    const ip = clientIp(c), wait = loginBlocked(ip);
    if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
    const b = await c.req.json().catch(() => ({}));
    try { disableTotp(c.get('user'), b); loginSucceeded(ip); return c.json({ ok: true }); } catch (e) { if (e.code === 'TOTP_UNREADABLE') return c.json({ error: e.message, unreadable: true }, 409); loginFailed(ip); return fail(c, e); } // prompt 91
  });
  r.post('/devices/current', (c) => { rememberDevice(c, c.get('user')); return c.json({ ok: true }); });
  r.delete('/devices/:id', (c) => {
    const id = c.req.param('id');
    const row = /^[a-f0-9]{16}$/.test(id) && db.prepare("SELECT id FROM devices WHERE user=? AND substr(id,1,16)=?").get(c.get('user'), id);
    if (row) forgetDevice(c, row.id);
    return c.json({ ok: true });
  });
}
