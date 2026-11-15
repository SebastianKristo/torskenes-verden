// Innlogging med passord (web og eldre klienter), steg 2 med 2FA-kode, 2FA-oppsett i appene, reauth, QR-innlogging,
// førstegangsoppsett og utlogging. Flyttet fra index.js (Fase 2b); rutene, rekkefølgen og svarene er de samme.
//
// POST /api/auth/login | /api/login {username, password, remember}  → {ok, user} | {needsTotp, ticket, username} | 401/429 {error}
// POST /api/auth/totp | /api/auth/2fa {ticket|hl_pre-cookie, code}   → {ok, user} | 401/409/429 {error, expired}
// /api/auth/2fa/*                                                    → two-factor.js
// POST /api/auth/reauth {password}                                    → reauth.js
// /api/auth/qr*, /api/auth/app-session, /api/auth/logout-all, GET /api/me/sessions, GET /l/:code, /.well-known/* → qr-login.js
// GET  /api/setup/status, POST /api/setup                             → førstegangsoppsettet (bare når det ikke finnes brukere)
// POST /api/logout                                                    → økta slettes, enheten låses, og Kalender-tokenene som ble
//                                                                       gitt fra denne økta trekkes tilbake (mellomvare i app-login.js)
//
// Mellomvaren i security.js (revisjon, godkjenning av nye enheter) står foran disse rutene, se mountAuthSecurity i index.js.
import { kv } from '../db.js';
import { meOut, layoutOf, authOrToken } from '../mobile.js';
import { createSession, destroySession, rememberDevice, pauseDevice, forgetDevice, clientIp, verifyLogin, createTicket, redeemTicket,
  needsSetup, setupServer, loginBlocked, loginFailed } from './session.js';
import { twofa40Api } from './two-factor.js';
import { reauthHandler } from './reauth.js';
import { qrAuthApi, meSessionsApi, qrLinkHandler, preAuthTicket, qrAfter2fa, assetLinksHandler, appleAssociationHandler } from './qr-login.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finishLogin(c, userId, remember) {
  createSession(c, userId);
  if (remember) rememberDevice(c, userId); else forgetDevice(c);
}

// Steg 1: brukernavn + passord. Har brukeren 2FA, svarer vi med en kortlivet billett til steg 2.
// Uten brukernavn logges eieren inn (gamle innloggingssider og skript).
async function passwordLogin(c) {
  const ip = clientIp(c);
  const { username, password, remember } = await c.req.json().catch(() => ({}));
  const r = verifyLogin(username, password, undefined, ip);
  if (r.needsTotp) return c.json({ needsTotp: true, ticket: createTicket(r.user.id, remember), username: r.user?.username });
  if (!r.ok) { if (r.status === 401) await sleep(400); return c.json({ error: r.error }, r.status); }
  finishLogin(c, r.user.id, remember);
  return c.json({ ok: true, user: r.user });
}

// Steg 2: 6-sifret kode fra autentiseringsappen eller en gjenopprettingskode.
async function totpStep(c) {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const { code, remember } = b;
  const ticket = b.ticket || preAuthTicket(c); // prompt 38: QR-innloggingens pre-auth-cookie (hl_pre)
  const r = redeemTicket(ticket, code, clientIp(c));
  if (!r.ok) { await sleep(400); return c.json({ error: r.error, expired: !!r.expired }, r.status); }
  finishLogin(c, r.user.id, remember ?? r.remember);
  qrAfter2fa(c, ticket, r.user.id); // prompt 38: enheten fra QR-innloggingen → Pålitelige enheter + varsel
  return c.json({ ok: true, user: r.user });
}

// Førstegangsoppsett: lager hovedadmin og logger inn.
async function setup(c) {
  if (!needsSetup()) return c.json({ error: 'Serveren er allerede satt opp' }, 409);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  try {
    const u = setupServer(b);
    // Prompt 25: Papir · lys er standard etter oppsettet, og bakgrunnen fra steg 3 (Oslo / Vær / Planeter / Ingen) lagres med en gang.
    const bg = { oslo: 'oslo', vaer: 'weather', 'vær': 'weather', weather: 'weather', planeter: 'planets', planets: 'planets', ingen: 'none', none: 'none' }[String(b.background ?? b.bgType ?? '').toLowerCase()];
    kv.set(u.id, 'layout', { ...layoutOf(u.id), mobileDesign: 'papir', paperMode: 'lys', ...(bg ? { bgType: bg, photo: bg === 'none' ? 'cur' : bg } : {}) });
    finishLogin(c, u.id, b.remember !== false);
    return c.json({ ok: true, user: meOut(u.id) });
  } catch (e) { loginFailed(ip); return c.json({ error: e.message }, e.status ?? 400); }
}

// Utlogging: økta slettes og enheten låses («Lås» skal faktisk låse). Kalender-tokenene trekkes tilbake i mellomvaren i app-login.js.
function logout(c) { pauseDevice(c); destroySession(c); return c.json({ ok: true }); }

export function mountLogin(app) {
  app.post('/api/auth/login', passwordLogin);
  app.post('/api/login', passwordLogin);
  app.post('/api/auth/totp', totpStep);
  app.post('/api/auth/2fa', totpStep); // prompt 25: samme steg under navnet i designet
  app.route('/api/auth/2fa', twofa40Api); // prompt 40: 2FA-oppsett i appen (status, setup, enable, disable, backup/regenerate)
  // Prompt 31: bekreft passordet på nytt → kortlivet engangstoken (5 min, bundet til brukeren) for biometri-flyten i appene.
  app.post('/api/auth/reauth', authOrToken, reauthHandler);
  // Prompt 38: QR-innlogging (/api/auth/qr*), app-økt for Kalender på Mac, logg ut av alle enheter, GET /api/me/sessions og /l/:code.
  app.route('/api/auth', qrAuthApi);
  app.route('/api', meSessionsApi);
  app.get('/l/:code', qrLinkHandler);
  app.get('/.well-known/assetlinks.json', assetLinksHandler); // prompt 38: Android App Links for /l/*
  app.get('/.well-known/apple-app-site-association', appleAssociationHandler); // prompt 38: iOS universal links for /l/*

  app.get('/api/setup/status', (c) => c.json({ needsSetup: needsSetup() }));
  app.post('/api/setup', setup);

  app.post('/api/logout', logout);
}
