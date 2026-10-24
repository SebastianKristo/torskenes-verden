import { bootStep, bootState, bootFinish } from './boot36.js'; // prompt 36: oppstartsstatus (først, så db-steget måles)
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
import { cfg, publicConfig, updateConfig, runRequest, userCfgSet, runAsUser } from './settings.js';
import finansApi from './finans/routes.js';
import { receiptsAlias48 } from './receipts48/routes.js';
import { db as fhDb } from './finans/db.js';
import homeApi from './home.js';
import { matApi, matCalendar, startMatScheduler } from './mat.js';
import domainsApi, { domainSummary } from './domains.js';
import trackingApi, { startTrackingWorker, hasTrackingTest, testTracking } from './tracking.js';
import uiApi from './ui.js';
import backgroundApi, { hasBackgroundTest, testBackgrounds } from './background.js';
import mobileApi, { meOut, removeAvatar, shortcutsFor, layoutOf, authOrToken, designOf } from './mobile.js';
import rssApi, { startRssWorker } from './rss.js';
import { faviconHandler46 } from './news46.js'; // prompt 46 (SERVER46)
import iconsApi from './icons.js';
import familyApi from './family.js';
import tilesApi, { hasMapTest, testMap } from './tiles.js';
import tasksApi from './tasks.js';
import notifyApi, { appMeta } from './notify.js';
import { attachRealtime } from './realtime.js';
import { revokeUserTokens } from './finans/routes.js';
import birthdaysApi, { startBirthdayWorker, widgetOut as birthdaysWidget } from './birthdays.js';
import integrationsApi, { settingsSearchApi, testByIdOrName, integrationScope } from './integrations-api.js';
import settingsAsk30Api from './settings-ask30.js';
import calendarApi, { widgetApi as calendarWidgetApi } from './calendar.js';
import chatApi from './chat.js'; // prompt 27 (SERVER-B): Chat
import appUpdateApi from './app-update.js'; // prompt 32: Android-appen oppdaterer seg selv (GitHub-release via serveren)
import systemUpdateApi, { startUpdateScheduler, updateNow, versionApi44 } from './system-update.js'; // Oppdater fra appen: data/update/ ↔ updater-containeren
import systemBackupApi, { startSystemBackupScheduler } from './system-backup.js'; // prompt 29: systembackup (bare admin)
import ops51Api, { startOps51 } from './ops51.js'; // prompt 51 (OPS51): restic-backup 3-2-1, testet gjenoppretting, staging/tilbakerulling, DB-vedlikehold
import smbBrowseApi from './smb-browse.js'; // prompt 30: SMB-veiviser (finn server, shares, mapper, test, lagre) – bare admin
import calendarQuickApi from './calendar-quick.js'; // prompt 29: Kalender → rask time (AI-jobbkø)
import { reauthHandler } from './reauth.js'; // prompt 31: POST /api/auth/reauth
import glimtMemoryApi from './glimt-memory.js'; // prompt 33: «Glimt husker» (alias per bruker)
import { agentApi45 } from './glimt45/api.js'; // prompt 45: Glimt-motoren
import assistApi from './assist.js'; // prompt 31: Glimt – POST /api/assist (vær, kalender, … før LLM), serverjobb
import aiApi, { glimtApi } from './ai-api.js';
import api36 from './api36.js'; // prompt 36 (SERVER36)
import { profilesApi, bibleApi, trackingKeysApi, kal37Api } from './api37.js'; // prompt 37 (SERVER37)
import { bearerFallthrough46, homelabAuthCode46, signImages46, mediaDiag46, mediaDiagOut46 } from './api-auth46.js'; // prompt 46 (SERVER46)
import { qrAuthApi, meSessionsApi, qrLinkHandler, preAuthTicket, qrAfter2fa, assetLinksHandler, appleAssociationHandler, brief38Api, startApi38 } from './api38.js'; // prompt 38 (SERVER38)
import { cals39Api, googleMap39Api, rec39Api, week39Api } from './api39.js'; // prompt 39 (SERVER39)
import { twofa40Api, finans40Api, news40Api, newsDigestApi, hjemlys40Api, pages40Api, briefJul40, tasksAfter40, tasksCreate40, startApi40 } from './api40.js'; // prompt 40 (SERVER40)
import { mountServer47 } from './server47.js'; // prompt 47 (SERVER47)
import { hjemlys41Api, hjemlysGet41, hlPage41, ruter41Api, birthdays41Api, mai17Api, kalender41Api, mountAuth41, huske41Api, tracking41Api, weather41Api, brief41, weatherFull41 } from './api41.js'; // prompt 41 (SERVER41)
import { finans42Api, abCalendarsMw42, abApi42, calendarsEvents42, abIcs42, tracking42Api, health42Api, familyHealthMw42, startHealth42, hjemlys42Api, tasks42Api } from './api42.js'; // prompt 42 (SERVER42)
import { media43Api, mediaCalendarsMw43, startMediaWatch43, widgets43Api, claudeImport43Api, aiMemory43Api, gscDomains43Api, gsc43Api, gscViewMw43, gscOverviewMw43, kalUpdate43Api, finans43Api, summaryMw43, transactionsMw43, tasks43Api, tasksOrderMw43 } from './api43.js'; // prompt 43 (SERVER43)
// Prompt 44 (SERVER44): Logger (Docker), Media (servere, søk som jobb, felles status), Avspilling, Studie-dokumenter, Kalender-deltakere,
// Logg inn som / andres oppsett / overfør eier.
import { media44Api, mediaSiteMw44, librarySearchMw44, legacyMedia44, integrationsStatusApi44 } from './media44.js';
import { logs44Api, startLogs44 } from './logs44.js';
import { impersonation44, admin44Api, layoutLockMw44, setMobileApi44 } from './admin44.js';
import { kal44Api, kalEventsMw44, assistLocalMw44 } from './kal44.js';
import { study44Api } from './study44.js';
import { auth44Api } from './auth44.js';
import { playback44Api, startPlayback44 } from './playback44.js';
import { mountApi45 } from './api45.js'; // prompt 45 (SERVER45)
import { mountMedia50, startMedia50 } from './media50.js'; // prompt 50 (SRVMEDIA50): bilder med diskcache, sporing etter søk, diagnostikk
import { mountSec51 } from './sec51.js'; // prompt 51 (SEC51): sikkerhet
import { mountFamily50 } from './family50.js'; // prompt 50 (SRVFAM50): Steder med områder, Folk, Helse, I dag, Sjekk inn
import { traceObs51, mountObs51, startObs51 } from './obs51/index.js'; // prompt 51 (OBS51): helsedashbord, selvreparasjon, spor, ntfy
import { mountQa51, startQa51, reportServerError51 } from './qa51.js'; // prompt 51 (QA51): feature flags, krasjrapporter (GlitchTip), «Nytt i denne versjonen»
import { tracking46Api, startAccounts46 } from './tracking46.js'; // prompt 46 (DATA46): Posten/Bring- og PostNord-konto
import { gphoto46Api, startGphoto46 } from './gphoto46.js'; // prompt 46 (DATA46): Google Photos-album som bakgrunn
import { kart46Api } from './kart46.js'; // prompt 46 (DATA46): Kart-API
import { settingsApi as glimtSettingsApi, ttsApi, imgApi } from './glimt35.js'; // prompt 35: /api/glimt/settings, /api/tts, /api/img
import weather35Api from './weather35.js'; // prompt 35: /api/weather/place?q=
import { haApi as kal35HaApi } from './kalender35.js'; // prompt 35: /api/kalender/ha/calendars
import briefApi from './brief34.js'; // prompt 34: Glimt-brief /api/brief (+ /widget, /settings) og daglig generering // prompt 34: AI-kontroll /api/ai/* (status, modeller, ruting, jobber, forbruk, nøkler, selvtest)
import { startTrialScheduler } from './trials-notify.js'; // prompt 31: varsler for gratis prøveperioder
import { installCacheBust } from './cache-bust.js'; // prompt 32 (SERVER32)
import searchHistoryApi from './search-history.js'; // prompt 32: søkehistorikk per bruker
import trialWidgetsApi from './trial-widgets.js'; // prompt 32
import romApi, { startSpaceScheduler, spaceApi } from './space32.js'; // prompt 32
import { domainGlimtApi, gscApi, startDomainGlimtScheduler } from './domains-glimt.js'; // prompt 32
import { describeApi as calendarDescribeApi, searchAiMiddleware as calendarSearchAi } from './calendar-glimt.js'; // prompt 32
import { calendarsApi as kalCalendarsApi, weatherApi as kalWeatherApi, eventsMiddleware as kalEventsMw, widgetMiddleware as kalWidgetMw, companionApi, companionsOf } from './kalender33.js'; // prompt 33 (SERVER33)
if (process.env.MOCK_DATA === '1' && !fhDb.prepare('SELECT 1 FROM fh_transactions LIMIT 1').get()) (await import('./finans/demo.js')).loadDemo();

// Prompt 36: alle moduler (og migreringene de kjører når de lastes) er ferdige her.
bootStep('migrate', 'ok');
const api = process.env.MOCK_DATA === '1' ? await import('./mock.js') : integrations;
if (api !== integrations) console.warn('[mock] MOCK_DATA=1 – viser eksempeldata.');

const app = new Hono();
// ISO2: hver forespørsel kjører med sin egen brukerkontekst, så cfg() gir den innloggedes personlige integrasjoner.
app.use('*', (c, next) => runRequest(c, next));
traceObs51(app); // prompt 51 (OBS51): spor for trege forespørsler (DB, AI, eksterne kall) – før alle ruter
// Prompt 36: «Starter opp»-siden. Registrert før secureHeaders: siden er én fil med innebygd skript/stil, så den får sin
// egen strenge CSP (ingen eksterne skript, bare fonten fra Google Fonts, fetch bare til samme opphav).
app.get('/starting.html', async (c) => c.body(await readFile(join(resolve('public'), 'starting.html'), 'utf8'), 200, {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" }));
const UPLOADS = resolve(config.dataDir, 'uploads');
const PUBLIC = resolve('public');

// Prompt 45 (SERVER45): originalen i Studie (PDF/bilde) skal kunne vises inne i appen/web (iframe/WebView fra samme opprinnelse).
// Registrert FØR secureHeaders, så dette kjører etter den og erstatter den globale frame-ancestors 'none' for akkurat disse rutene.
// Bare eieren får fila (ruten sjekker det); andre opprinnelser kan fortsatt ikke ramme den inn.
const STUDY_FILE45 = /^\/api\/(?:study\/documents|studie\/docs)\/\d+\/(?:file|thumb)$/;
app.use('/api/*', async (c, next) => {
  await next();
  if (!STUDY_FILE45.test(c.req.path) || c.res.status !== 200) return;
  const ct = c.res.headers.get('content-type') ?? '';
  const viewable = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))\b/i.test(ct);
  c.res.headers.set('Content-Security-Policy', viewable ? "frame-ancestors 'self'" : "default-src 'none'; sandbox; frame-ancestors 'self'");
  c.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
});
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'],
    // Plakater fra Sonarr/Radarr kommer fra varierende CDN-er (TheTVDB, TMDB, fanart.tv), så alle https-bilder tillates.
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    // Prompt 42: ikonsøket i Familie → Soner (web og PWA) søker i Lucide og Tabler via Iconify-API-et.
    connectSrc: ["'self'", 'https://api.iconify.design'],
    frameAncestors: ["'none'"],
    // Værkartet på værsiden (prompt 22) er Windy-innbyggingen.
    frameSrc: ["'self'", 'https://embed.windy.com'],
    formAction: ["'self'", 'https:'],
    baseUri: ["'self'"],
  },
  crossOriginEmbedderPolicy: false,
}));

// Prompt 32: cache-fiks (HTML/sw.js/manifest no-cache, /api no-store, ?v=<build> på JS/CSS, GET /version.json).
installCacheBust(app);
// Prompt 44: «Logg inn som» – X-tokenet (eller hl_imp fra nettleseren) fornyes, sperrer og logg (før alle ruter).
app.use('*', impersonation44(app));
// Prompt 51 (SEC51): revisjonslogg, godkjenning av nye enheter, nytt land, passkeys, sperrer for QR/app-token, hemmeligheter og logg-skanner
// (mellomvare rundt innloggingsrutene – må stå før dem). /api/security51/* og /api/auth/passkey/*.
mountSec51(app);
app.route('/api/version', versionApi44); // prompt 44: {version, features} uten innlogging
// Prompt 41: /api/discovery, /api/me/server, Kalender-innlogging (device-token/-exchange, app-code, token, /app-auth) og utlogging som
// tilbakekaller Kalender-tokenene (må stå før /api/logout og /finans/api).
mountAuth41(app);
mountServer47(app); // prompt 47 (SERVER47): GET /api/config/servers {publicUrl, localUrl etter innlogging} + /api/finans/kvitteringer-aliasene
mountObs51(app); // prompt 51 (OBS51): /api/system/obs51/* (admin) og /api/me/ntfy51 (alle)
mountQa51(app); // prompt 51 (QA51): /api/flags, /api/crash, /api/whatsnew, /api/admin/flags51, /api/admin/crashes51
app.route('/api', auth44Api); // prompt 44: POST /api/auth/refresh og POST /api/apps/kalender/log
app.get('/hl/:token', hlPage41); // prompt 41: Hjemlys-statusside for kontakter uten Papir (24 t)

/* ---------------- Sider ---------------- */

const page = (name) => readFile(join(PUBLIC, name), 'utf8');
/** Prompt 40: {…boot, restarting, updating, state:'starting'|'updating'|'ready', updatingTo?} – klienten viser «Starter opp» bare når restarting er true. */
function health40(b) {
  const u = updateNow();
  // Prompt 44 (oppdatering hopper mellom skjermer): restarting bare når serveren ikke er klar eller updateren selv sier
  // «restarting». Under nedlasting/bygging er updating:true, men restarting:false (web blir på siden sin).
  const rs = !b.ready || u.state === 'restarting';
  return { ...b, restarting: rs, updating: u.updating, phase: !b.ready ? 'restarting' : u.updating ? u.phase ?? u.state : 'idle', progress: u.updating ? u.progress ?? null : null, state: !b.ready ? 'starting' : u.state === 'restarting' ? 'restarting' : u.updating ? 'updating' : 'ready', ...(u.updating && u.version ? { updatingTo: u.version } : {}) };
}
const html = (c, body) => c.html(body, 200, { 'Cache-Control': 'no-store' });

app.get('/', async (c) => sessionUser(c) ? html(c, await page('app.html')) : c.redirect('/login'));
// /login viser førstegangsoppsettet når det ikke finnes noen brukere (login.js spør /api/setup/status).
app.get('/login', async (c) => sessionUser(c) ? c.redirect('/') : html(c, await page('login.html')));
app.get('/cv', async (c) => html(c, await page('cv.html')));
// Prompt 33: /chat åpnes direkte (alltid fullskjerm) – webappen ruter med hash.
app.get('/chat', (c) => c.redirect(sessionUser(c) ? '/#/chat' : '/login'));
app.get('/gjoremal', (c) => c.redirect(sessionUser(c) ? '/#/gjoremal' : '/login?next=/gjoremal')); // prompt 40: Gjøremål i fullskjerm
// Prompt 38 (WEB38): /kalender åpner Kalender i fullskjerm. /kalender?app=mac er siden Kalender.app for Mac laster i sin
// WKWebView (samme bundel som web, uten Homelab-menyen; hl-boot.js setter html[data-kal-app]).
app.get('/kalender', async (c) => {
  const appQ = c.req.query('app');
  if (!sessionUser(c)) return c.redirect(`/login?next=${encodeURIComponent(appQ ? `/kalender?app=${encodeURIComponent(appQ)}` : '/kalender')}`);
  return appQ && /^[a-z]{2,12}$/.test(appQ) ? html(c, await page('app.html')) : c.redirect('/#/kalender');
});
// FinansHub: egen fullskjerm-app (desktop og mobil/PWA). API-et har egen tilgangskontroll (sesjon eller token).
app.get('/finans', (c) => c.redirect('/finans/'));
// Mobil uten innlogging får appskallet, som viser sin egen Papir-innlogging (mobile-gate.js). Desktop og en tom server går til /login.
const MOBILE_UA = /iPhone|iPad|iPod|Android|Mobile/i;
app.get('/finans/', async (c) => (sessionUser(c) || (!needsSetup() && MOBILE_UA.test(c.req.header('user-agent') ?? '')))
  ? html(c, await page('finans/index.html')) : c.redirect('/login?next=/finans/'));
app.get('/finans/manifest.webmanifest', async (c) => c.body(await page('finans/manifest.webmanifest'), 200, { 'Content-Type': 'application/manifest+json' }));
app.get('/finans/sw.js', async (c) => c.body(await page('finans/sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
app.use('/finans/api/summary', summaryMw43); // prompt 43: spentMonth, day, daysInMonth (saldokortet)
app.use('/finans/api/transactions', transactionsMw43); // prompt 43: months:[{month, label, count, net}]
app.route('/finans/api', finans43Api); // prompt 43: /overview, /transactions/months
app.route('/finans/api', finans42Api); // prompt 42: Glimt-søk (SQL før LLM, tankesteg), filter, avanserte oppgaver + PDF, Boliger web, import til bolig, aksje-logoer
app.route('/finans/api', finans40Api); // prompt 40: added, PATCH alt + historikk, Les på nytt, POST /search/ask (før routes.js)
app.route('/finans/api', finansApi);
app.route('/api/receipts', receiptsAlias48(finansApi)); // prompt 48: alias POST /api/receipts/scan og GET /api/receipts/health
// Del-mål for PWA-en: «Del → FinansHub» fra bilder-appen legger kvitteringen i køen.
app.post('/finans/share', async (c) => {
  if (!sessionUser(c)) return c.redirect('/login?next=/finans/');
  const res = await finansApi.request('/receipts', { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', 'content-type': c.req.header('content-type') ?? '' }, body: await c.req.arrayBuffer() }, c.env);
  return c.redirect(res.ok ? '/finans/#/skann' : '/finans/#/kv');
});

// Statiske filer revalideres alltid (304 når de er uendret), så en oppdatering slår inn med en gang.
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'no-cache'); });
// Prompt 30: Yr- og Storm-logoene ligger i public/assets/brands/ (samme sti som URL-en, /assets/brands/yr.png).
app.use('/assets/brands/*', serveStatic({ root: './public' }));
// Prompt 39: filer som ligger i public/assets/ (glimt-varsel.png, glimt-badge.png …) først, så resten av public/ som før.
app.use('/assets/*', serveStatic({ root: './public' }));
app.use('/assets/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/assets/, '') }));
app.use('/vendor/satellite/*', serveStatic({ root: './node_modules/satellite.js/dist', rewriteRequestPath: (p) => p.replace(/^\/vendor\/satellite/, '') }));
app.get('/manifest.webmanifest', async (c) => c.body(await page('manifest.webmanifest'), 200, { 'Content-Type': 'application/manifest+json' }));
app.get('/sw.js', async (c) => c.body(await page('sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
app.get('/healthz', (c) => c.text('ok'));
// Prompt 36: GET /api/health → {ready, version, steps:[{id, label, status, ms}], startedAt, uptimeMs} uten innlogging (oppstartssiden).
// Innlogget (og ?boot=1 ikke satt) svarer den som før med tjenestestatusen, og oppstartsfeltene flettes inn.
app.get('/api/health', async (c, next) => {
  // Prompt 40: restarting:true bare når serveren faktisk starter (ikke klar) eller en oppdatering pågår – aldri ved vanlig sideoppdatering.
  // ?boot=1 (starting.html) beholder den gamle formen; markøren står da i X-Homelab-State.
  const b0 = bootState(), b = health40(b0);
  const authd = !!(c.req.header('authorization') || sessionUser(c));
  if (c.req.query('boot') === '1') return c.json(b0, 200, { 'Cache-Control': 'no-store', 'X-Homelab-State': b.state });
  // Prompt 40: 503 + X-Homelab-State: starting mens serveren starter (ikke klar); ellers 200.
  if (!b.ready) return c.json(b, 503, { 'Cache-Control': 'no-store', 'X-Homelab-State': b.state, 'Retry-After': '2' });
  if (!authd) return c.json(b, 200, { 'Cache-Control': 'no-store', 'X-Homelab-State': b.state });
  await next();
  if (c.res.status !== 200) { c.res = c.json(b, 200, { 'Cache-Control': 'no-store' }); return; }
  try { const j = await c.res.clone().json(); c.res = c.json({ ...j, ...b }, 200, { 'Cache-Control': 'no-store', 'X-Homelab-State': b.state }); } catch { /* lar svaret stå */ }
});

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
const totpStep = async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const { code, remember } = b;
  const ticket = b.ticket || preAuthTicket(c); // prompt 38: QR-innloggingens pre-auth-cookie (hl_pre)
  const r = redeemTicket(ticket, code, clientIp(c));
  if (!r.ok) { await sleep(400); return c.json({ error: r.error, expired: !!r.expired }, r.status); }
  finishLogin(c, r.user.id, remember ?? r.remember);
  qrAfter2fa(c, ticket, r.user.id); // prompt 38: enheten fra QR-innloggingen → Pålitelige enheter + varsel
  return c.json({ ok: true, user: r.user });
};
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

/* ---------------- Førstegangsoppsett ---------------- */

app.get('/api/setup/status', (c) => c.json({ needsSetup: needsSetup() }));
app.post('/api/setup', async (c) => {
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
// Prompt 46 (SERVER46): app-token mot en /api-sti som ikke finnes → 404 (ikke 401 «Ikke innlogget» – den ekte årsaken til «Utlogget» i Media
// på mobil). Ingen/ugyldig innlogging → 401 code:'HOMELAB_AUTH'. Se server/api-auth46.js.
authed.use('*', bearerFallthrough46(authed));
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
    schoolUrl: cfg('school_url'), // personlig (ISO2): brukerens egen skoleside, tom hvis ikke satt
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
    devices: list.map((d) => ({ id: d.id.slice(0, 16), name: d.name, created: d.created, lastSeen: d.last_seen, lastIp: d.last_ip, current: d.id === cur })),
    apps: companionsOf(c.get('user')) }); // prompt 33: companion-tokens (Kalender), trekkes tilbake med DELETE /api/tokens/companion/:id
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
// ISO2: hver gruppe har scope 'personal' (brukerens egne: Plex, Jellyfin, Sonarr, Radarr, skolekalender, Trading 212, Sporing)
// eller 'server' (bare admin). Alle får sine egne personlige grupper med verdier; admin får i tillegg servergruppene.
// Ingen ser andre brukeres personlige verdier.
const configFor = (c) => publicConfig(c.get('user'), { admin: c.get('role') === 'admin' });
authed.get('/config', (c) => c.json(configFor(c)));
authed.put('/config', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet et objekt {nøkkel: verdi}' }, 400);
  try { updateConfig(b, c.get('user'), { admin: c.get('role') === 'admin' }); } catch (e) { return c.json({ error: e.message }, e.status === 403 ? 403 : 400); }
  return c.json(configFor(c));
});
// «Test tilkobling»: ett ekte kall via serveren med de lagrede verdiene. Personlige grupper kan alle teste (med egne verdier).
authed.post('/config/test/:group', async (c) => {
  const group = c.req.param('group');
  if (c.get('role') !== 'admin' && !(hasTrackingTest(group) || integrations.groupScope(group) === 'personal' || integrationScope(group) === 'personal')) return c.json({ error: 'Bare administratorer kan teste serveroppsettet', restricted: true }, 403);
  if (hasTrackingTest(group)) return c.json(await testTracking());
  if (hasBackgroundTest(group)) return c.json(await testBackgrounds());
  if (hasMapTest(group)) return c.json(await testMap());
  if (integrations.hasTest(group)) return c.json(await integrations.testIntegration(group));
  // Nyere integrasjoner (f.eks. Google Kalender) har testen sin i integrations-api.js.
  const r = await testByIdOrName(group, c.get('user'));
  return r ? c.json(r) : c.json({ error: 'Ukjent integrasjon' }, 404);
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
  // ISO2: også administratorer får bare sine egne filer; filer uten kjent eier (eldre) bare for administratorer.
  const owner = fileOwner(name);
  if (owner ? owner !== c.get('user') : c.get('role') !== 'admin') return c.notFound();
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
// Personlige integrasjoner (ISO2): portefølje, skolekalender, Plex/Jellyfin og Sonarr/Radarr bruker den innloggedes egne
// verdier (cfg() leser brukerens kv cfg_personal). Har brukeren ikke satt opp noe, svares 200 med {configured:false}.
// Med MOCK_DATA=1 får eieren demo, og andre brukere får demo først når de har lagt inn en egen verdi for integrasjonen.
const NOT_CONFIGURED = { configured: false, events: [], positions: [], items: [], servers: [] };
const MOCK_KEYS = { school: ['cal_ics'], trading: ['t212_key'], media: ['plex_token', 'jf_key'], upcoming: ['sonarr_key', 'radarr_key'] };
const personal = (kind, fn) => async (c) => {
  if (api !== integrations && c.get('user') !== OWNER && !MOCK_KEYS[kind].some((k) => userCfgSet(c.get('user'), k))) {
    return c.json(kind === 'upcoming' ? { configured: false, tv: { configured: false, items: [] }, movies: { configured: false, items: [] } } : NOT_CONFIGURED);
  }
  return fn(c);
};
authed.get('/ruter', proxy(api.getRuter));
authed.get('/weather', proxy(api.getWeather));
authed.get('/school', personal('school', proxy(api.getSchool)));
// Trading 212 gir ikke dagsendring direkte: lagre første totalverdi hver dag (per bruker) og sammenlign.
authed.get('/trading', personal('trading', proxy(async (c) => {
  const t = await api.getTrading();
  if (!t.configured || !Number.isFinite(t.total)) return t;
  const today = new Date().toLocaleDateString('sv-SE'), u = c.get('user');
  let base = kv.get(u, 't212_day');
  if (base?.date !== today) { base = { date: today, total: t.total }; kv.set(u, 't212_day', base); }
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
authed.get('/upcoming', personal('upcoming', proxy(api.getUpcoming)));
authed.get('/news', proxy(api.getNews));
// Plex og Jellyfin: «Spilles nå» (30 s) og «Nylig lagt til» (10 min). Plakater hentes via serveren så tokenet aldri når nettleseren.
// Hver bruker ser sin egen Plex/Jellyfin (ISO2).
// Prompt 44: valgt sted (?server= eller brukerens valg) for hele /api/media, søk i biblioteket, og serverens Plex/Jellyfin for alle med
// tilgang som ikke har egne verdier (den ekte årsaken til «ikke logget inn» på mobil, se media44.js).
// Prompt 46 (SERVER46): hvert Media-kall logges (GET /api/media/diag), 401 får code:'HOMELAB_AUTH', bilde-URL-er signeres.
app.use('/api/media/*', mediaDiag46, homelabAuthCode46, signImages46);
app.use('/api/playback/*', mediaDiag46, homelabAuthCode46, signImages46);
app.get('/api/media/diag', authOrToken, (c) => c.json(mediaDiagOut46(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
app.use('/api/media/*', mediaSiteMw44);
app.use('/api/media/series', librarySearchMw44);
app.use('/api/media/movies', librarySearchMw44);
mountMedia50(app); // prompt 50 (SRVMEDIA50): /bilde, /track, /diagnostics, /torrents/:hash/start + posterImg/track i svarene (før mountApi45 og media43/44)
mountApi45(app); // prompt 45 (SERVER45): Docker-oppsett, Search Console, AI-import, Media/Avspilling, sonevarsler, HA-helse, Vær, Gjøremål, Innstillinger (etter mediaSiteMw44, før de eldre rutene)
app.get('/api/media/now', authOrToken, legacyMedia44(personal('media', proxy(api.getMediaNow))));
app.get('/api/media/recent', authOrToken, legacyMedia44(personal('media', proxy(api.getMediaRecent))));
app.get('/api/media/history', authOrToken, legacyMedia44(personal('media', proxy(api.getMediaHistory))));
app.get('/api/media/poster', authOrToken, async (c) => {
  try {
    const img = await api.getMediaPoster(c.req.query('src'), c.req.query('id'));
    if (!img) return c.notFound();
    return c.body(img.body, 200, { 'Content-Type': /^image\//.test(img.type) ? img.type : 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  } catch (e) { console.warn('[media/poster]', e.message); return c.body(null, 502); }
});
app.route('/api/media', media44Api); // prompt 44: /servers, /release/search (jobb + SSE), /episodes/:id/file, /movies/:id/file
app.route('/api/playback', playback44Api); // prompt 44: Avspilling (Plex/Jellyfin, PIN-flyt, historikk, statistikk)
app.route('/api/media', media43Api); // prompt 43: Media (Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, webhooks) – etter /now, /recent, /history og /poster
authed.get('/space/tle', proxy(api.getTle));
authed.get('/space/apod', proxy(api.getApod));
authed.get('/space/gallery/:key', proxy((c) => {
  const key = c.req.param('key');
  if (!api.GALLERIES[key]) throw new Error('Ukjent galleri');
  return api.getGallery(key);
}));

app.route('/api/ui', uiApi);
app.route('/api/tracking', tracking46Api); // prompt 46 (DATA46): /sources46, /accounts/:src/{start,finish,sync} (Posten/Bring, PostNord)
app.route('/api/bg', gphoto46Api); // prompt 46 (DATA46): /api/bg/gphoto (før mobileApi sin /api/bg/:file)
app.route('/api/kart', kart46Api); // prompt 46 (DATA46): holdeplasser, avganger, kjøretøy for valgte soner, soner og personer
app.route('/api/tracking', tracking41Api); // prompt 41: GET /postnord/health
app.route('/api/tracking', tracking42Api); // prompt 42: /debug/:id (+ /test), /aliexpress (mappe, sjekk nå, e-post)
app.route('/api/tracking/keys', trackingKeysApi); // prompt 37: husstandens sporingsnøkler (før /api/tracking/:id)
app.route('/api/tracking', trackingApi); // Sporing (prompt 11): pakker fra Finn, e-post og manuelt
app.route('/api/matplan', matApi); // samme Matplan-API som /mat/api (prompt 10: Matplan hører til Homelab)
// Profil, oppsett, søk, mobilforside og widgets: sesjon ELLER FinansHub-token (må stå før /api med requireAuth).
app.get('/api/rss/favicon', faviconHandler46); // prompt 46: offentlig, bare domener fra kildelistene (news46.js)
app.route('/api/rss', rssApi); // Nyhetsleser (prompt 13): RSS/Atom med ✦ AI-sammendrag og -kategorisering
app.route('/api/icons', iconsApi); // Ikoner (prompt 23): Iconify-søk, SVG cachet på disk og ✦ AI-forslag
// Kartfliser (prompt 20): /tiles/:style/:z/:x/:y.png og /api/config/map, sesjon eller app-token (header eller ?token=).
app.route('/', tilesApi);
mountFamily50(app); // prompt 50 (SRVFAM50): /api/family/places…, /people50, /today50, /health50…, /checkin… (før de eldre /api/family-rutene)
app.route('/api/family/health/ha', health42Api); // prompt 42: helse fra Home Assistant
app.use('/api/family/*', familyHealthMw42); // prompt 42: health.source/sourceDevice/limited/stale
app.route('/api/family', familyApi); // Familie og kart (prompt 16): posisjon, soner, varsler og helse
app.use('/api/tasks', tasksOrderMw43); // prompt 43: listOrder
app.use('/api/tasks/lists', tasksOrderMw43);
app.route('/api/tasks', tasks43Api); // prompt 43: GET/PUT /lists/order
app.route('/api/tasks', tasks42Api); // prompt 42: /glimt/log
app.use('/api/tasks/:id{[0-9]+}', tasksAfter40); // prompt 40: «Nå kan du: …» når punktet før er gjort, placeName/after i PATCH
app.use('/api/tasks', tasksCreate40); // prompt 40: POST /api/tasks godtar placeName og after
app.route('/api/tasks', tasksApi); // Huskeliste (prompt 17): delt i familien, sanntid via /api/ws
app.route('/api/hjemlys', hjemlys42Api); // prompt 42: admin kan avslutte andres Vel fremme-økt
// Prompt 42: Hjemlys heter nå Vel fremme – /api/velfremme/* er et alias for /api/hjemlys/*.
app.all('/api/velfremme/*', async (c) => { const u = new URL(c.req.url); u.pathname = u.pathname.replace(/^\/api\/velfremme/, '/api/hjemlys'); const m = c.req.method; return app.fetch(new Request(u, { method: m, headers: c.req.raw.headers, body: m === 'GET' || m === 'HEAD' ? undefined : await c.req.arrayBuffer() }), c.env); });
app.use('/api/hjemlys', hjemlysGet41); // prompt 41: GET /api/hjemlys får notices
app.route('/api/hjemlys', hjemlys41Api); // prompt 41: Si fra (notice/status), tur med valgfritt mål (før prompt 40)
app.route('/api/hjemlys', hjemlys40Api); // prompt 40: Hjemlys (start, status, posisjon, ok/hjemme/avslutt, tokens, forslag)
app.route('/api/news', news40Api); // prompt 40: Nyheter · Glimt-siden
app.route('/api/app/pages', pages40Api); // prompt 40: alle sider i Mer (fanelinja), før /api/app
app.route('/api/app/android', appUpdateApi); // prompt 32: /latest og /apk/:version, sesjon eller app-token, alle brukere
app.route('/api', notifyApi); // Varsler (/api/me/notify) og appnavn (/api/app) (prompt 17)
// Boliger (prompt 17): skann rett inn i en bolig. Alias for FinansHub-rutene, samme tilgang (sesjon eller token).
const toFinans = async (c, path) => {
  const u = new URL(c.req.url);
  u.pathname = `/finans/api${path}`;
  return app.fetch(new Request(u, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env);
};
// Prompt 30: del med brukere og rediger utgifter (samme tilgang som FinansHub-rutene).
const toFinansAny = async (c, path) => {
  const u = new URL(c.req.url);
  u.pathname = `/finans/api${path}`;
  const m = c.req.method;
  return app.fetch(new Request(u, { method: m, headers: c.req.raw.headers, body: m === 'GET' || m === 'HEAD' ? undefined : await c.req.arrayBuffer() }), c.env);
};
app.get('/api/homes/:id{[0-9]+}/shareable', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/shareable`));
app.post('/api/homes/:id{[0-9]+}/members', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/members`));
// Prompt 42: Boliger-forsiden (2a) også under /api/boliger/oversikt.
app.get('/api/boliger/oversikt', (c) => toFinansAny(c, '/boliger/oversikt'));
app.patch('/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/entries/${c.req.param('eid')}`));
app.get('/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}/history', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/entries/${c.req.param('eid')}/history`));
app.post('/api/homes/:id{[0-9]+}/expenses', (c) => toFinans(c, (c.req.header('content-type') ?? '').startsWith('multipart/') ? `/folders/${c.req.param('id')}/receipts` : `/folders/${c.req.param('id')}/entries`));
app.route('/api/background', backgroundApi); // Bakgrunner (prompt 19): Vær, Planeter, Oslo, eget bilde
// Prompt 24: Bursdager (per bruker, Google Kalender og Home Assistant), widget-svaret, alle integrasjoner (bare admin),
// ✦ AI-søk i innstillingene og domene-pillen på Boliger (bare admin, cache 5 min). Sesjon eller app-token.
app.route('/api/birthdays', birthdays41Api); // prompt 41: bilder av personer
app.route('/api/birthdays', birthdaysApi);
app.get('/api/widgets/birthdays', authOrToken, (c) => c.json(birthdaysWidget(c.get('user'))));
app.route('/api/space', spaceApi); // prompt 32: /tle?group=, /apod?days=7, /mars (før authed sine /space-ruter)
app.route('/api/rom', romApi); // prompt 32: Rom – APOD (7 dager), Mars-rovere, satellitter (SGP4), NASA-nøkkel på serveren
app.route('/api/widgets', widgets43Api); // prompt 43: /media og /catalog
app.route('/api/apps/kalender', kalUpdate43Api); // prompt 43: /latest?platform=mac|android&channel=stabil|beta (uinnlogget) og /:versjon/:fil
app.route('/api/widgets/trials', trialWidgetsApi); // prompt 32: prøveperiode-widgets (GET kompakt, POST /:id «Avsluttet»)
app.route('/api/integrations', integrationsStatusApi44); // prompt 44: GET /status (samme kilde som Media), før /:id
app.route('/api/integrasjoner', integrationsStatusApi44);
app.route('/api/integrations', integrationsApi);
app.route('/api/integrasjoner', integrationsApi); // prompt 26: samme liste under norsk navn
// Prompt 26: Kalender (skolens iCal, Canvas, Bursdager og Google) og kompakt widget-svar. Sesjon eller app-token, per bruker.
app.route('/api', kal44Api); // prompt 44: /kalender/events/:id/invite, /kalender/invites, /users/directory, /geo/address
app.route('/api', kalender41Api); // prompt 41: /kalender/glimt/search, /calendar/ask, /kalender/notify/test, /push/test
app.route('/api/ruter', ruter41Api); // prompt 41: Min reise, skolesoner, «forlot skolen»
app.route('/api/huske', huske41Api); // prompt 41: POST /glimt-jobs
app.route('/api/kalender/describe', calendarDescribeApi); // prompt 32: «Beskriv med Glimt» (før /api/kalender)
app.use('/api/kalender/search', calendarSearchAi); // prompt 32: ?ai=1 → Glimt-svar, ellers det vanlige søket
app.route('/api/kalender/quick', calendarQuickApi); // prompt 29: før /api/kalender
// Prompt 33 (SERVER33): Kalender-appen – kalendere (visning, farger, egne), vær 16 dager, appCalendar på hendelser, widgets.
app.route('/api/kalender/ha', kal35HaApi); // prompt 35
app.route('/api/kalender', kal37Api); // prompt 37: /subjects (fagfarger) og /geo (adresse + kart)
app.use('/api/kalender/calendars', mediaCalendarsMw43); // prompt 43: innebygd kalender «Media» (Sonarr/Radarr)
app.use('/api/kalender/calendars/*', mediaCalendarsMw43);
app.use('/api/kalender/calendars', abCalendarsMw42); // prompt 42: innebygd kalender «Abonnementer» (trekkdatoer)
app.use('/api/kalender/calendars/*', abCalendarsMw42);
app.route('/api/kalender/abonnementer', abApi42);
app.get('/api/kalender/abonnementer.ics', authOrToken, abIcs42);
app.route('/api/calendars', calendarsEvents42); // GET /api/calendars/events?cal=ab
app.route('/api/kalender/calendars', cals39Api); // prompt 39: fire kalendere, opprydding/angre, nye felt (før kalender33)
app.route('/api/kalender/google', googleMap39Api); // prompt 39: GET/PUT /mapping
app.route('/api/kalender/calendars', kalCalendarsApi);
app.route('/api/kalender/weather', kalWeatherApi);
app.use('/api/kalender/events', kalEventsMw44); // prompt 44: attendees og geo, avlysning ved sletting
app.use('/api/kalender/events/*', kalEventsMw44);
app.use('/api/kalender/events', kalEventsMw);
app.use('/api/kalender/events/*', kalEventsMw);
app.use('/api/widgets/calendar', kalWidgetMw);
app.route('/api/tokens/companion', companionApi); // «Logg inn med Homelab-appen»: eget token for Kalender (økt eller token med finance:write)
app.route('/api/calendar/quick', calendarQuickApi);
app.route('/api/kalender', calendarApi);
app.route('/api/widgets/calendar', calendarWidgetApi);
app.route('/api/settings', settingsSearchApi);
app.route('/api/settings', settingsAsk30Api); // prompt 30: GET /index og POST /ask (✦ AI-søk med indeks fra serveren)
app.route('/api/smb', smbBrowseApi); // prompt 30: bare admin; økt (JSON) eller admin-token med finance:write
app.route('/api/ops51', ops51Api); // prompt 51 (OPS51): bare admin; /smoke bare i sandkassen (OPS51_SANDBOX=1)
app.route('/api/backup', systemBackupApi); // prompt 29: bare admin; endringer krever økt eller admin-token, gjenoppretting passordet
app.route('/api/system/update', systemUpdateApi);
app.route('/api/update', systemUpdateApi); // prompt 44: /api/update/versions, /api/update/rollback {version, restoreBackup, pauseAutoDays}, /api/update/status
app.route('/api/system', logs44Api); // prompt 44: /api/system/containers, /api/system/logs (bare admin) // bare admin; start/rollback krever passordet og økt eller admin-token (finance:write)
// Prompt 30: kort versjonssvar for oppdateringsbanneret (samme tilgang som /api/system/update).
app.get('/api/system/version', (c) => { const u = new URL(c.req.url); u.pathname = '/api/system/update/version'; return app.fetch(new Request(u, { headers: c.req.raw.headers }), c.env); });
app.get('/api/system/changelog', (c) => { const u = new URL(c.req.url); u.pathname = '/api/system/update/changelog'; return app.fetch(new Request(u, { headers: c.req.raw.headers }), c.env); }); // prompt 36
app.route('/api/glimt/news-digest', newsDigestApi); // prompt 40: samme som POST /api/news/glimt
app.route('/api/glimt/memory', glimtMemoryApi); // prompt 33: GET/POST/DELETE, POST /:id/apply (sesjon eller app-token, per bruker)
app.route('/api/search-history', searchHistoryApi); // prompt 32: søkehistorikk per bruker (mobil logger, web viser)
app.route('/api/ai/memory', aiMemory43Api); // prompt 43: AI-minne per bruker
app.route('/api/ai', rec39Api); // prompt 39: ✦ Glimt anbefaler modeller
app.route('/api/ai', aiApi); // prompt 34: AI-kontroll
app.use('/api/brief', briefJul40);
app.use('/api/brief', brief41); // prompt 41: ski, mai17, minReise // prompt 40: brief.jul i julemodus
app.route('/api/brief', brief38Api); // prompt 38: nye kort (pakker, familie, skole og jobb, bursdager, nordlys) + POST /api/brief/gift
app.route('/api/brief', briefApi); // prompt 34: Glimt-brief
app.route('/api/glimt/mai17', mai17Api); // prompt 41: 17. mai (program, design-bryter, hurra)
app.route('/api/glimt/settings', glimtSettingsApi); // prompt 35
app.route('/api/tts', ttsApi); // prompt 35
app.route('/api/img', imgApi); // prompt 35
app.route('/api/weather/week-summary', week39Api); // prompt 39: Glimt · ukas vær
app.route('/api/weather/place', weather35Api); // prompt 35
app.route('/api/glimt/agent', agentApi45); // prompt 45: Glimt-motoren (én inngang for alle Glimt-felt)
app.route('/api/glimt', glimtApi); // prompt 34: POST /api/glimt {prompt, tool:'calendar'} (etter /api/glimt/memory)
app.use('/api/assist', assistLocalMw44); // prompt 44: local (Glimt-tid) i svaret
app.route('/api/assist', assistApi); // prompt 31: Glimt-ruteren (sesjon eller app-token, per bruker)
app.route('/api/chat/import', claudeImport43Api); // prompt 43: importer fra Claude
app.route('/api/chat', chatApi); // prompt 27: Chat (Open WebUI eller Ollama/Gemini/Groq direkte), sesjon eller app-token
const domainPill = async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403);
  try { return c.json(await domainSummary()); } catch (e) { return c.json({ error: e.message }, 502); }
};
app.get('/api/domains/summary', authOrToken, domainPill);
// Prompt 30: Test token i Innstillinger → Domener (samme tilgang som /domains/api: bare admin).
app.post('/api/domains/token/verify', async (c) => { const u = new URL(c.req.url); u.pathname = '/domains/api/token/verify'; return app.fetch(new Request(u, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env); });
app.get('/api/domener/sammendrag', authOrToken, domainPill);
app.use('/api/domains/overview', gscOverviewMw43); // prompt 43: Google Søk uten tall → årsak
app.use('/api/domains/:domain/gsc', gscViewMw43);
app.route('/api/domains', gscDomains43Api); // prompt 43: /:domain/gsc/refresh (Hent nå) og /:domain/gsc/test
app.route('/api/domains', domainGlimtApi); // prompt 32: /:domain/summary (Glimt) og /:domain/gsc (Google Search Console), bare admin
app.route('/api/gsc', gsc43Api); // prompt 43: /test (diagnose per eiendom)
app.route('/api/gsc', gscApi); // prompt 32: Google Search Console-kobling per bruker (webmasters.readonly)
app.use('/api/weather/full', weatherFull41); // prompt 41: ski
app.route('/api/weather', weather41Api); // prompt 41: GET/PUT /layout (Rediger Vær)
app.route('/api', api36); // prompt 36: /dashboard/layout og /weather/places/summary (før mobileApi)
app.route('/api/bible', bibleApi); // prompt 37: dagens bibelvers (bare med modulen)
app.route('/api', profilesApi); // prompt 37: profiler og onboarding
app.route('/api', study44Api); // prompt 44: /study/documents, /study/overview
app.route('/api', admin44Api); // prompt 44: /admin/impersonate, /users/:id/layout, /server/owner
app.use('/api/me/layout', layoutLockMw44); // prompt 44: låst oppsett
setMobileApi44(mobileApi);
app.route('/api', mobileApi);
app.route('/api', authed);
app.route('/home/api', homeApi);
app.route('/mat/api', matApi);
app.route('/domains/api', domainsApi);
app.get('/mat/calendar.ics', matCalendar);
// Prompt 51 (OPS51): OPS51_SANDBOX=1 = testet gjenoppretting / staging-kopi mot en kopi av databasen: ingen bakgrunnsjobber
// (ingen varsler, e-post, backup, oppdateringer eller selvreparasjon). Bare HTTP-serveren og migreringene kjører.
const BG51 = process.env.NODE_ENV !== 'test' && process.env.OPS51_SANDBOX !== '1';
if (BG51) { startMatScheduler(); startTrackingWorker(); startRssWorker(); startBirthdayWorker(); startSystemBackupScheduler(); startUpdateScheduler(); startTrialScheduler(); startDomainGlimtScheduler(); startSpaceScheduler(); startApi38(); startApi40(); startHealth42(); startMediaWatch43(); startMedia50(); startLogs44(); startPlayback44(); }
if (BG51) { startAccounts46(); startGphoto46(); } // prompt 46 (DATA46)
if (process.env.NODE_ENV !== 'test') startOps51(); // prompt 51 (OPS51): planlegger (backup, testet gjenoppretting, vedlikehold) og migrasjonslogg
if (process.env.OPS51_SANDBOX !== '1') startObs51(); // prompt 51 (OBS51): samples, driftsvarsler og selvreparasjon (ikke i test)
if (BG51) startQa51(); // prompt 51 (QA51): sender krasjrapporter som ikke kom fram til GlitchTip

app.onError((err, c) => {
  console.error(err);
  reportServerError51(err, c); // prompt 51 (QA51): lagres lokalt og videresendes til GlitchTip når den finnes
  return c.json({ error: 'Intern feil' }, 500);
});

// Prompt 25: HTTP-serveren skal aldri kutte et langt AI-kall (Ollama kan bruke 60–120 s, og flere motorer etter hverandre mer).
// requestTimeout gjelder hele forespørselen (10 min), socketTimeout 0 = ingen grense for inaktiv socket (SSE fra /finans/api/jobs).
export const HTTP_TIMEOUTS = { requestTimeout: 600_000, headersTimeout: 65_000, keepAliveTimeout: 75_000, socketTimeout: 0 };

if (process.env.NODE_ENV === 'test') { bootStep('api', 'ok'); bootStep('ai', 'ok'); bootStep('integrations', 'ok'); }
if (process.env.NODE_ENV !== 'test') {
  const server = serve({ fetch: app.fetch, port: config.port, serverOptions: { requestTimeout: HTTP_TIMEOUTS.requestTimeout, headersTimeout: HTTP_TIMEOUTS.headersTimeout, keepAliveTimeout: HTTP_TIMEOUTS.keepAliveTimeout } },
    (info) => {
      console.log(`OS kjører på http://localhost:${info.port}`);
      bootStep('api', 'ok');
      // AI og integrasjoner: i bakgrunnen med tidsgrense (siden blir aldri stående).
      bootFinish({ aiCheck: () => runAsUser(OWNER, async () => (await import('./finans/ai.js')).health()) })
        .then((b) => console.log(`[boot] klar: ${b.steps.map((s) => `${s.id} ${s.ms ?? '–'} ms`).join(' · ')}`));
    });
  server.setTimeout(HTTP_TIMEOUTS.socketTimeout);
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
