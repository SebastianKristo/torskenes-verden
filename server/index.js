import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { createSession, destroySession, sessionUser, rememberDevice, pauseDevice, forgetDevice, currentDeviceId, currentSessionId, trustIp, isLan, requireAuth, requireAdmin, clientIp, verifyLogin, createTicket, redeemTicket, userInfo, listUsers, listUsersFor, createUser, deleteUser, updateUser, setPassword, checkPassword, isAdmin, needsSetup, setupServer, serverName, setServerName, startTotpSetup, confirmTotpSetup, disableTotp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import * as integrations from './integrations.js';
import { cfg, publicConfig, updateConfig } from './settings.js';
import finansApi from './finans/routes.js';
import { db as fhDb } from './finans/db.js';
import homeApi from './home.js';
import { matApi, matCalendar, startMatScheduler } from './mat.js';
import domainsApi from './domains.js';
import trackingApi, { startTrackingWorker, hasTrackingTest, testTracking } from './tracking.js';
import uiApi from './ui.js';
import backgroundApi, { hasBackgroundTest, testBackgrounds } from './background.js';
import mobileApi, { meOut, removeAvatar, shortcutsFor, layoutOf, authOrToken, designOf } from './mobile.js';
import rssApi, { startRssWorker } from './rss.js';
import familyApi from './family.js';
import tilesApi, { hasMapTest, testMap } from './tiles.js';
import tasksApi from './tasks.js';
import notifyApi, { appMeta } from './notify.js';
import { attachRealtime } from './realtime.js';
import { revokeUserTokens } from './finans/routes.js';
if (process.env.MOCK_DATA === '1' && !fhDb.prepare('SELECT 1 FROM fh_transactions LIMIT 1').get()) (await import('./finans/demo.js')).loadDemo();

const api = process.env.MOCK_DATA === '1' ? await import('./mock.js') : integrations;
if (api !== integrations) console.warn('[mock] MOCK_DATA=1 – viser eksempeldata.');

const app = new Hono();
const UPLOADS = resolve(config.dataDir, 'uploads');
const PUBLIC = resolve('public');

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'],
    // Plakater fra Sonarr/Radarr kommer fra varierende CDN-er (TheTVDB, TMDB, fanart.tv), så alle https-bilder tillates.
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'", 'https:'],
    baseUri: ["'self'"],
  },
  crossOriginEmbedderPolicy: false,
}));

/* ---------------- Sider ---------------- */

const page = (name) => readFile(join(PUBLIC, name), 'utf8');
const html = (c, body) => c.html(body, 200, { 'Cache-Control': 'no-store' });

app.get('/', async (c) => sessionUser(c) ? html(c, await page('app.html')) : c.redirect('/login'));
// /login viser førstegangsoppsettet når det ikke finnes noen brukere (login.js spør /api/setup/status).
app.get('/login', async (c) => sessionUser(c) ? c.redirect('/') : html(c, await page('login.html')));
app.get('/cv', async (c) => html(c, await page('cv.html')));
// FinansHub: egen fullskjerm-app (desktop og mobil/PWA). API-et har egen tilgangskontroll (sesjon eller token).
app.get('/finans', (c) => c.redirect('/finans/'));
// Mobil uten innlogging får appskallet, som viser sin egen Papir-innlogging (mobile-gate.js). Desktop og en tom server går til /login.
const MOBILE_UA = /iPhone|iPad|iPod|Android|Mobile/i;
app.get('/finans/', async (c) => (sessionUser(c) || (!needsSetup() && MOBILE_UA.test(c.req.header('user-agent') ?? '')))
  ? html(c, await page('finans/index.html')) : c.redirect('/login?next=/finans/'));
app.get('/finans/manifest.webmanifest', async (c) => c.body(await page('finans/manifest.webmanifest'), 200, { 'Content-Type': 'application/manifest+json' }));
app.get('/finans/sw.js', async (c) => c.body(await page('finans/sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
app.route('/finans/api', finansApi);
// Del-mål for PWA-en: «Del → FinansHub» fra bilder-appen legger kvitteringen i køen.
app.post('/finans/share', async (c) => {
  if (!sessionUser(c)) return c.redirect('/login?next=/finans/');
  const res = await finansApi.request('/receipts', { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', 'content-type': c.req.header('content-type') ?? '' }, body: await c.req.arrayBuffer() }, c.env);
  return c.redirect(res.ok ? '/finans/#/skann' : '/finans/#/kv');
});

// Statiske filer revalideres alltid (304 når de er uendret), så en oppdatering slår inn med en gang.
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'no-cache'); });
app.use('/assets/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/assets/, '') }));
app.use('/vendor/satellite/*', serveStatic({ root: './node_modules/satellite.js/dist', rewriteRequestPath: (p) => p.replace(/^\/vendor\/satellite/, '') }));
app.get('/manifest.webmanifest', async (c) => c.body(await page('manifest.webmanifest'), 200, { 'Content-Type': 'application/manifest+json' }));
app.get('/sw.js', async (c) => c.body(await page('sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
app.get('/healthz', (c) => c.text('ok'));

/* ---------------- Innlogging ---------------- */

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function finishLogin(c, userId, remember) {
  createSession(c, userId);
  if (remember) rememberDevice(c, userId); else forgetDevice(c);
}
app.post('/api/auth/login', passwordLogin);
app.post('/api/login', passwordLogin);
// Steg 2: 6-sifret kode fra autentiseringsappen eller en gjenopprettingskode.
app.post('/api/auth/totp', async (c) => {
  const { ticket, code, remember } = await c.req.json().catch(() => ({}));
  const r = redeemTicket(ticket, code, clientIp(c));
  if (!r.ok) { await sleep(400); return c.json({ error: r.error, expired: !!r.expired }, r.status); }
  finishLogin(c, r.user.id, remember ?? r.remember);
  return c.json({ ok: true, user: r.user });
});

/* ---------------- Førstegangsoppsett ---------------- */

app.get('/api/setup/status', (c) => c.json({ needsSetup: needsSetup() }));
app.post('/api/setup', async (c) => {
  if (!needsSetup()) return c.json({ error: 'Serveren er allerede satt opp' }, 409);
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  try {
    const u = setupServer(b);
    finishLogin(c, u.id, b.remember !== false);
    return c.json({ ok: true, user: meOut(u.id) });
  } catch (e) { loginFailed(ip); return c.json({ error: e.message }, e.status ?? 400); }
});

app.post('/api/logout', (c) => { pauseDevice(c); destroySession(c); return c.json({ ok: true }); });

/* ---------------- CV (offentlig lesing) ---------------- */

export const CV_DEFAULT = {
  name: '', title: 'Elev · IT og homelab-entusiast', email: 'navn@eksempel.no', phone: '+47 900 00 000', place: 'Oslo',
  about: 'Elev med stor interesse for nettverk, servere og automatisering. Driver eget homelab med Proxmox, Home Assistant og Pi-hole.',
  work: '2025 – nå | Deltid, Komplett | Kundeservice og produktveiledning\n2024 | Sommerjobb, Oslo kommune | IT-support for skoler',
  edu: '2024 – nå | Videregående, studiespesialisering | Matematikk R2, Fysikk 2\n2021 – 2024 | Ungdomsskole | ',
  skills: 'Linux, Proxmox, Docker, Home Assistant, Nettverk, Python, Norsk, Engelsk',
};
const CV_KEYS = Object.keys(CV_DEFAULT);

// Navnet i CV-en er hovedadmins navn til det er endret i CV-en.
const cvOf = () => { const cv = { ...CV_DEFAULT, ...kv.get(OWNER, 'cv', {}) }; if (!cv.name) cv.name = userInfo(OWNER)?.name ?? ''; return cv; };
app.get('/api/cv', (c) => c.json({ cv: cvOf(), canEdit: isAdmin(sessionUser(c)) }));

/* ---------------- Alt under er innlogget ---------------- */

const authed = new Hono();
authed.use('*', requireAuth);

authed.put('/cv', requireAdmin, async (c) => {
  const body = await c.req.json();
  const cv = {};
  for (const k of CV_KEYS) if (typeof body[k] === 'string') cv[k] = body[k].slice(0, 5000);
  kv.set(OWNER, 'cv', cv);
  return c.json({ cv: cvOf() });
});
authed.delete('/cv', requireAdmin, (c) => { kv.del(OWNER, 'cv'); return c.json({ cv: cvOf() }); });

const DEFAULT_CATS = [
  { name: 'Mat', color: '#8fe0b0' }, { name: 'Transport', color: '#a8d4fb' }, { name: 'Bolig', color: '#f3d38a' },
  { name: 'Fritid', color: '#e8a6d8' }, { name: 'Skole', color: '#9fb4ff' }, { name: 'Annet', color: '#8a93a6' },
];
const DEFAULT_LOAN = { debt: 46120, grantMonthly: 3860, nextPayout: '2026-11-15', progress: 62 };

authed.get('/state', (c) => {
  const u = c.get('user');
  const layouts = Object.fromEntries(db.prepare("SELECT key, value FROM kv WHERE user=? AND key LIKE 'layout_%'").all(u).map((r) => [r.key.slice(7), JSON.parse(r.value)]));
  return c.json({
    user: userInfo(u)?.name ?? '',
    me: meOut(u),
    serverName: serverName(),
    shortcuts: shortcutsFor(u),
    layout: layoutOf(u).homelab ?? {},
    design: designOf(u),
    app: appMeta(),
    place: cfg('wx_place'),
    bg: kv.get(u, 'bg', 'mane'),
    bgCustom: kv.get(u, 'bg_custom', {}),
    budget: kv.get(u, 'budget', 8000),
    categories: kv.get(u, 'categories', DEFAULT_CATS),
    loan: kv.get(u, 'loan', DEFAULT_LOAN),
    city: kv.get(u, 'city', 'Oslo'),
    schoolUrl: c.get('role') === 'admin' ? cfg('school_url') : '', // serveroppsett: bare for administratorer (prompt 21)
    searchUrl: cfg('search_url'),
    searchStyle: kv.get(u, 'search_style', 'wide'),
    hideSearch: kv.get(u, 'hide_search', false),
    hideNews: kv.get(u, 'hide_news', false),
    top: { head: kv.get(u, 'hl_head_gap', 16), tab: kv.get(u, 'hl_tab_gap', 2), pad: kv.get(u, 'hl_tab_pad', 12) },
    sizes: Object.fromEntries(db.prepare("SELECT key, value FROM kv WHERE user=? AND key LIKE 'size_%'").all(u).map((r) => [r.key.slice(5), JSON.parse(r.value)])),
    layouts,
  });
});

const SETTINGS = {
  bg: (v) => typeof v === 'string' && /^[a-z]{2,10}$/.test(v),
  budget: (v) => Number.isFinite(v) && v >= 0,
  city: (v) => typeof v === 'string' && v.length < 40,
  categories: (v) => Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x.name === 'string' && x.name.length <= 30 && /^#[0-9a-f]{6}$/i.test(x.color)),
  search_style: (v) => ['light', 'dark', 'wide', 'wideLight'].includes(v),
  hide_search: (v) => typeof v === 'boolean',
  hide_news: (v) => typeof v === 'boolean',
  hl_head_gap: (v) => Number.isInteger(v) && v >= 0 && v <= 120,
  hl_tab_gap: (v) => Number.isInteger(v) && v >= 0 && v <= 40,
  hl_tab_pad: (v) => Number.isInteger(v) && v >= 6 && v <= 24,
  loan: (v) => v && typeof v === 'object' && ['debt', 'grantMonthly', 'progress'].every((k) => Number.isFinite(v[k])) && typeof v.nextPayout === 'string',
};
authed.put('/settings/:key', async (c) => {
  const key = c.req.param('key');
  const { value } = await c.req.json();
  if (key.startsWith('layout_')) {
    if (!/^layout_[a-z0-9_]{1,20}$/.test(key) || !Array.isArray(value) || !value.every(Number.isInteger)) return c.json({ error: 'Ugyldig' }, 400);
  } else if (key.startsWith('size_')) {
    // { indeks: { s: kolonner, h: høyde i px } }
    const ok = /^size_[a-z0-9_]{1,20}$/.test(key) && value && typeof value === 'object' && Object.entries(value).length <= 40
      && Object.entries(value).every(([i, v]) => /^\d+$/.test(i) && Number.isInteger(v?.s) && v.s >= 1 && v.s <= 6 && (v.h === 0 || (Number.isInteger(v.h) && v.h >= 120 && v.h <= 4000)));
    if (!ok) return c.json({ error: 'Ugyldig' }, 400);
  } else if (!SETTINGS[key]?.(value)) return c.json({ error: 'Ugyldig verdi' }, 400);
  kv.set(c.get('user'), key, value);
  return c.json({ ok: true });
});
authed.delete('/layouts', (c) => { kv.delPrefix(c.get('user'), 'layout_'); kv.delPrefix(c.get('user'), 'size_'); return c.json({ ok: true }); });

/* --- Pålitelige enheter --- */

authed.get('/devices', (c) => {
  const cur = currentDeviceId(c), ip = trustIp(c);
  const list = db.prepare('SELECT id, name, created, last_seen, last_ip FROM devices WHERE user=? ORDER BY last_seen DESC').all(c.get('user'));
  return c.json({ lan: isLan(ip), trusted: list.some((d) => d.id === cur),
    devices: list.map((d) => ({ id: d.id.slice(0, 16), name: d.name, created: d.created, lastSeen: d.last_seen, lastIp: d.last_ip, current: d.id === cur })) });
});
authed.put('/password', async (c) => {
  const { current, next } = await c.req.json().catch(() => ({}));
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  if (!checkPassword(c.get('user'), current)) { loginFailed(ip); return c.json({ error: 'Nåværende passord er feil' }, 403); }
  try { setPassword(c.get('user'), next, { keepSession: currentSessionId(c) }); } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
  loginSucceeded(ip);
  return c.json({ ok: true });
});

/* --- Brukere, 2FA og innstillinger per bruker --- */

const fail = (c, e) => c.json({ error: e.message }, e.status ?? 400);
// Alle innloggede ser listen (brukes til deling av boliger og huskelister); bare admin kan endre den.
// Vanlige brukere ser bare id, navn og profilbilde om de andre (prompt 21), ikke rolle, brukernavn eller 2FA.
authed.get('/users', (c) => c.json({ me: userInfo(c.get('user')), users: listUsersFor(c.get('user')) }));
authed.post('/users', requireAdmin, async (c) => {
  try { return c.json(createUser(await c.req.json().catch(() => ({})))); } catch (e) { return fail(c, e); }
});
// Admin kan endre alle; andre kan bare endre sitt eget visningsnavn.
authed.patch('/users/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = c.req.param('id'), self = id === c.get('user');
  if (c.get('role') !== 'admin') {
    if (!self || b.role !== undefined || b.password !== undefined || b.resetTotp) return c.json({ error: 'Du kan bare endre ditt eget navn og brukernavn' }, 403);
  }
  try { return c.json(updateUser(id, { role: b.role, password: b.password, name: b.displayName ?? b.name, resetTotp: !!b.resetTotp, username: b.username })); } catch (e) { return fail(c, e); }
});
authed.put('/server', requireAdmin, async (c) => {
  try { return c.json({ serverName: setServerName((await c.req.json().catch(() => ({}))).name) }); } catch (e) { return fail(c, e); }
});
authed.delete('/users/:id', requireAdmin, (c) => {
  const id = c.req.param('id');
  try { deleteUser(id, c.get('user')); } catch (e) { return fail(c, e); }
  removeAvatar(id); revokeUserTokens(id);
  return c.json({ ok: true });
});
authed.post('/auth/totp/setup', (c) => { try { return c.json(startTotpSetup(c.get('user'))); } catch (e) { return fail(c, e); } });
authed.post('/auth/totp/verify', async (c) => {
  const { code } = await c.req.json().catch(() => ({}));
  try { return c.json({ ok: true, recoveryCodes: confirmTotpSetup(c.get('user'), code) }); } catch (e) { return fail(c, e); }
});
authed.post('/auth/totp/disable', async (c) => {
  const ip = clientIp(c), wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const b = await c.req.json().catch(() => ({}));
  try { disableTotp(c.get('user'), b); loginSucceeded(ip); return c.json({ ok: true }); } catch (e) { loginFailed(ip); return fail(c, e); }
});
// Fritt innhold per bruker (layout, topplinje, nyhetsbar, rekkefølge i sidemenyen, mobilvalg). PUT fletter toppnivånøkler.
authed.get('/prefs', (c) => c.json(kv.get(c.get('user'), 'prefs', {})));
authed.put('/prefs', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt' }, 400);
  const next = { ...kv.get(c.get('user'), 'prefs', {}) };
  for (const [k, v] of Object.entries(b)) { if (!/^[\w.-]{1,64}$/.test(k)) continue; if (v === null) delete next[k]; else next[k] = v; }
  if (JSON.stringify(next).length > 64_000) return c.json({ error: 'For mye data' }, 413);
  kv.set(c.get('user'), 'prefs', next);
  return c.json(next);
});
authed.post('/devices/current', (c) => { rememberDevice(c, c.get('user')); return c.json({ ok: true }); });
authed.delete('/devices/:id', (c) => {
  const id = c.req.param('id');
  const row = /^[a-f0-9]{16}$/.test(id) && db.prepare("SELECT id FROM devices WHERE user=? AND substr(id,1,16)=?").get(c.get('user'), id);
  if (row) forgetDevice(c, row.id);
  return c.json({ ok: true });
});

/* --- Integrasjonsinnstillinger --- */

// Integrasjonene er serveroppsett. Vanlige brukere får bare gruppene med navn, logo og om de er satt opp, uten verdier
// (ingen adresser, koordinater, URL-er, e-post eller brukernavn), så Innstillinger kan vises uten feil (prompt 21).
const restrictedConfig = () => publicConfig().map((g) => ({ name: g.name, id: g.id, domain: g.domain, category: g.category, help: '', guide: [], restricted: true,
  fields: g.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, secret: f.secret, set: f.set, value: '', custom: false })) }));
authed.get('/config', (c) => c.json(c.get('role') === 'admin' ? publicConfig() : restrictedConfig()));
authed.put('/config', requireAdmin, async (c) => {
  try { updateConfig(await c.req.json()); } catch (e) { return c.json({ error: e.message }, 400); }
  return c.json(publicConfig());
});
// «Test tilkobling»: ett ekte kall via serveren med de lagrede verdiene.
authed.post('/config/test/:group', requireAdmin, async (c) => {
  const group = c.req.param('group');
  if (hasTrackingTest(group)) return c.json(await testTracking());
  if (hasBackgroundTest(group)) return c.json(await testBackgrounds());
  if (hasMapTest(group)) return c.json(await testMap());
  if (!integrations.hasTest(group)) return c.json({ error: 'Ukjent integrasjon' }, 404);
  return c.json(await integrations.testIntegration(group));
});

/* --- Filer (kvitteringer og bakgrunner) --- */

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
async function saveFile(file, allowPdf = true) {
  if (!(file instanceof File)) return null;
  const ext = MIME_EXT[file.type];
  if (!ext || (!allowPdf && ext === 'pdf')) throw new Error('Filtypen støttes ikke');
  const name = `${randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(join(UPLOADS, name), Buffer.from(await file.arrayBuffer()));
  return { name, mime: file.type };
}
const removeFile = (name) => name && unlink(join(UPLOADS, name)).catch(() => {});

// Hvem eier en opplastet fil? Kvitteringer (gamle Økonomi) og egne bakgrunnsbilder (bg_custom). null = ukjent.
function fileOwner(name) {
  const r = db.prepare('SELECT user FROM receipts WHERE file=? OR thumb=? LIMIT 1').get(name, name);
  if (r) return r.user;
  for (const row of db.prepare("SELECT user, value FROM kv WHERE key='bg_custom' AND instr(value, ?) > 0").all(name)) {
    try { if (Object.values(JSON.parse(row.value) ?? {}).flat().includes(name)) return row.user; } catch { /* ugyldig */ }
  }
  return null;
}
// Bare eieren av filen og administratorer (også når eieren ikke kan avgjøres) får den. Andre får 404, som for ukjente filer.
authed.get('/files/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-f0-9]{24}(_t)?\.[a-z]{3,4}$/.test(name)) return c.notFound();
  if (c.get('role') !== 'admin' && fileOwner(name) !== c.get('user')) return c.notFound();
  const ext = name.split('.').pop();
  const mime = Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  try {
    return c.body(await readFile(join(UPLOADS, name)), 200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.notFound(); }
});

const upload = bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: 'Filen er for stor (maks 20 MB)' }, 413) });

const BG_SLOTS = ['oslo', 'egen', 'vaer_sol', 'vaer_sky', 'vaer_regn'];
authed.post('/backgrounds/:slot', upload, async (c) => {
  const slot = c.req.param('slot');
  if (!BG_SLOTS.includes(slot)) return c.json({ error: 'Ukjent plass' }, 400);
  const body = await c.req.parseBody();
  let saved;
  try { saved = await saveFile(body.file, false); } catch (e) { return c.json({ error: e.message }, 400); }
  if (!saved) return c.json({ error: 'Mangler fil' }, 400);
  const u = c.get('user');
  const custom = kv.get(u, 'bg_custom', {});
  if (slot === 'oslo') custom.oslo = [...(custom.oslo ?? []), saved.name].slice(-8);
  else { removeFile(custom[slot]); custom[slot] = saved.name; }
  kv.set(u, 'bg_custom', custom);
  return c.json({ bgCustom: custom });
});
authed.delete('/backgrounds/:slot', (c) => {
  const u = c.get('user'), slot = c.req.param('slot');
  const custom = kv.get(u, 'bg_custom', {});
  [custom[slot]].flat().forEach(removeFile);
  delete custom[slot];
  kv.set(u, 'bg_custom', custom);
  return c.json({ bgCustom: custom });
});

/* --- Kvitteringer --- */

const receiptOut = (r) => ({ id: r.id, store: r.store, date: r.date, category: r.category, amount: r.amount, file: r.file, thumb: r.thumb, mime: r.mime });

authed.get('/receipts', (c) => c.json(db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date DESC, id DESC').all(c.get('user')).map(receiptOut)));

authed.post('/receipts', upload, async (c) => {
  const body = await c.req.parseBody();
  let file, thumb;
  try { file = await saveFile(body.file); thumb = await saveFile(body.thumb, false); } catch (e) { return c.json({ error: e.message }, 400); }
  const today = new Date().toLocaleDateString('sv-SE');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
  const r = db.prepare('INSERT INTO receipts(user,store,date,category,amount,file,thumb,mime,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(c.get('user'), String(body.store ?? '').slice(0, 120), date, String(body.category ?? 'Annet').slice(0, 30), Number(body.amount) || 0, file?.name ?? null, thumb?.name ?? null, file?.mime ?? null, Date.now());
  return c.json(receiptOut(r));
});

authed.patch('/receipts/:id', async (c) => {
  const b = await c.req.json();
  const cur = db.prepare('SELECT * FROM receipts WHERE id=? AND user=?').get(c.req.param('id'), c.get('user'));
  if (!cur) return c.notFound();
  const next = {
    store: typeof b.store === 'string' ? b.store.slice(0, 120) : cur.store,
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : cur.date,
    category: typeof b.category === 'string' ? b.category.slice(0, 30) : cur.category,
    amount: b.amount !== undefined && Number.isFinite(Number(b.amount)) ? Number(b.amount) : cur.amount,
  };
  const r = db.prepare('UPDATE receipts SET store=?, date=?, category=?, amount=? WHERE id=? RETURNING *').get(next.store, next.date, next.category, next.amount, cur.id);
  return c.json(receiptOut(r));
});

authed.delete('/receipts/:id', (c) => {
  const r = db.prepare('DELETE FROM receipts WHERE id=? AND user=? RETURNING file, thumb').get(c.req.param('id'), c.get('user'));
  if (r) { removeFile(r.file); removeFile(r.thumb); }
  return c.json({ ok: true });
});

authed.get('/receipts.csv', (c) => {
  const rows = db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date').all(c.get('user'));
  const q = (v) => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = '﻿' + ['Dato;Butikk;Kategori;Beløp', ...rows.map((r) => [r.date.split('-').reverse().join('.'), r.store, r.category, String(r.amount).replace('.', ',')].map(q).join(';'))].join('\r\n');
  return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kvitteringer.csv"' });
});

/* --- Karakterer og prøver --- */

authed.get('/grades', (c) => c.json(db.prepare('SELECT id, subject, grade, tests FROM grades WHERE user=? ORDER BY sort, id').all(c.get('user'))));
authed.post('/grades', async (c) => {
  const b = await c.req.json();
  const r = db.prepare('INSERT INTO grades(user,subject,grade,tests,sort) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM grades)) RETURNING id, subject, grade, tests')
    .get(c.get('user'), String(b.subject || 'Nytt fag').slice(0, 60), gradeVal(b.grade), String(b.tests ?? '').slice(0, 100));
  return c.json(r);
});
const gradeVal = (g) => { const n = parseInt(g, 10); return n >= 1 && n <= 6 ? n : null; };
authed.patch('/grades/:id', async (c) => {
  const b = await c.req.json();
  const cur = db.prepare('SELECT * FROM grades WHERE id=? AND user=?').get(c.req.param('id'), c.get('user'));
  if (!cur) return c.notFound();
  const r = db.prepare('UPDATE grades SET subject=?, grade=?, tests=? WHERE id=? RETURNING id, subject, grade, tests').get(
    typeof b.subject === 'string' ? b.subject.slice(0, 60) : cur.subject, 'grade' in b ? gradeVal(b.grade) : cur.grade,
    typeof b.tests === 'string' ? b.tests.slice(0, 100) : cur.tests, cur.id);
  return c.json(r);
});
authed.delete('/grades/:id', (c) => { db.prepare('DELETE FROM grades WHERE id=? AND user=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });

authed.get('/tests', (c) => c.json(db.prepare('SELECT id, date, title, note FROM tests WHERE user=? ORDER BY date').all(c.get('user'))));
authed.post('/tests', async (c) => {
  const b = await c.req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.title) return c.json({ error: 'Dato og tittel må fylles ut' }, 400);
  return c.json(db.prepare('INSERT INTO tests(user,date,title,note) VALUES(?,?,?,?) RETURNING id, date, title, note')
    .get(c.get('user'), b.date, String(b.title).slice(0, 100), String(b.note ?? '').slice(0, 200)));
});
authed.delete('/tests/:id', (c) => { db.prepare('DELETE FROM tests WHERE id=? AND user=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });

/* --- Integrasjoner --- */

const proxy = (fn) => async (c) => {
  try { return c.json(await fn(c)); } catch (e) {
    console.warn(`[${c.req.path}]`, e.message);
    return c.json({ error: e.message }, 502);
  }
};
// Admins integrasjoner (portefølje, skolekalender, Plex/Jellyfin): vanlige brukere får 200 med tomme data og
// {configured:false, restricted:true}, så widgetene viser «ikke koblet» i stedet for en feilmelding (prompt 21).
const RESTRICTED = { configured: false, restricted: true, events: [], positions: [], items: [], servers: [] };
const adminOnly = (fn) => async (c) => {
  if (!isAdmin(c.get('user'))) return c.json(RESTRICTED);
  return fn(c);
};
authed.get('/ruter', proxy(api.getRuter));
authed.get('/weather', proxy(api.getWeather));
authed.get('/school', adminOnly(proxy(api.getSchool)));
// Trading 212 gir ikke dagsendring direkte: lagre første totalverdi hver dag og sammenlign.
authed.get('/trading', adminOnly(proxy(async () => {
  const t = await api.getTrading();
  if (!t.configured || !Number.isFinite(t.total)) return t;
  const today = new Date().toLocaleDateString('sv-SE');
  let base = kv.get(OWNER, 't212_day');
  if (base?.date !== today) { base = { date: today, total: t.total }; kv.set(OWNER, 't212_day', base); }
  // Merk: innskudd/uttak samme dag regnes med i endringen.
  const dayChange = t.total - base.total;
  return { ...t, dayChange, dayPct: base.total ? (dayChange / base.total) * 100 : 0 };
})));
authed.get('/energy', proxy(api.getEnergy));
// Tjenestestatus: vanlige brukere ser navn og om tjenesten svarer, ikke interne adresser (prompt 21).
authed.get('/health', proxy(async (c) => {
  const h = await api.getHealth();
  if (isAdmin(c.get('user'))) return h;
  return { ...h, services: (h.services ?? []).map((x) => ({ name: x.name, up: x.up, status: x.status, ms: x.ms, error: x.error })) };
}));
authed.get('/upcoming', proxy(api.getUpcoming));
authed.get('/news', proxy(api.getNews));
// Plex og Jellyfin: «Spilles nå» (30 s) og «Nylig lagt til» (10 min). Plakater hentes via serveren så tokenet aldri når nettleseren.
app.get('/api/media/now', authOrToken, adminOnly(proxy(api.getMediaNow)));
app.get('/api/media/recent', authOrToken, adminOnly(proxy(api.getMediaRecent)));
app.get('/api/media/history', authOrToken, adminOnly(proxy(api.getMediaHistory)));
app.get('/api/media/poster', authOrToken, async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette', restricted: true }, 403);
  try {
    const img = await api.getMediaPoster(c.req.query('src'), c.req.query('id'));
    if (!img) return c.notFound();
    return c.body(img.body, 200, { 'Content-Type': /^image\//.test(img.type) ? img.type : 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  } catch (e) { console.warn('[media/poster]', e.message); return c.body(null, 502); }
});
authed.get('/space/tle', proxy(api.getTle));
authed.get('/space/apod', proxy(api.getApod));
authed.get('/space/gallery/:key', proxy((c) => {
  const key = c.req.param('key');
  if (!api.GALLERIES[key]) throw new Error('Ukjent galleri');
  return api.getGallery(key);
}));

app.route('/api/ui', uiApi);
app.route('/api/tracking', trackingApi); // Sporing (prompt 11): pakker fra Finn, e-post og manuelt
app.route('/api/matplan', matApi); // samme Matplan-API som /mat/api (prompt 10: Matplan hører til Homelab)
// Profil, oppsett, søk, mobilforside og widgets: sesjon ELLER FinansHub-token (må stå før /api med requireAuth).
app.route('/api/rss', rssApi); // Nyhetsleser (prompt 13): RSS/Atom med ✦ AI-sammendrag og -kategorisering
// Kartfliser (prompt 20): /tiles/:style/:z/:x/:y.png og /api/config/map, sesjon eller app-token (header eller ?token=).
app.route('/', tilesApi);
app.route('/api/family', familyApi); // Familie og kart (prompt 16): posisjon, soner, varsler og helse
app.route('/api/tasks', tasksApi); // Huskeliste (prompt 17): delt i familien, sanntid via /api/ws
app.route('/api', notifyApi); // Varsler (/api/me/notify) og appnavn (/api/app) (prompt 17)
// Boliger (prompt 17): skann rett inn i en bolig. Alias for FinansHub-rutene, samme tilgang (sesjon eller token).
const toFinans = async (c, path) => {
  const u = new URL(c.req.url);
  u.pathname = `/finans/api${path}`;
  return app.fetch(new Request(u, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env);
};
app.post('/api/homes/:id{[0-9]+}/expenses', (c) => toFinans(c, (c.req.header('content-type') ?? '').startsWith('multipart/') ? `/folders/${c.req.param('id')}/receipts` : `/folders/${c.req.param('id')}/entries`));
app.route('/api/background', backgroundApi); // Bakgrunner (prompt 19): Vær, Planeter, Oslo, eget bilde
app.route('/api', mobileApi);
app.route('/api', authed);
app.route('/home/api', homeApi);
app.route('/mat/api', matApi);
app.route('/domains/api', domainsApi);
app.get('/mat/calendar.ics', matCalendar);
if (process.env.NODE_ENV !== 'test') { startMatScheduler(); startTrackingWorker(); startRssWorker(); }

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Intern feil' }, 500);
});

if (process.env.NODE_ENV !== 'test') {
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`OS kjører på http://localhost:${info.port}`));
  attachRealtime(server, wsUser);
}

// Innlogging for /api/ws: sesjonscookien eller ?token= sjekkes med den vanlige regelen (sesjon eller app-token) via en intern rute.
const wsAuth = new Hono();
wsAuth.get('/', authOrToken, (c) => c.json({ user: c.get('user') }));
async function wsUser(req, token) {
  const headers = {};
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (token) headers.authorization = `Bearer ${token}`;
  else if (req.headers.authorization) headers.authorization = req.headers.authorization;
  const r = await wsAuth.request('/', { headers });
  return r.ok ? (await r.json()).user : null;
}
export { wsUser };

export default app;
