import { bootStep, bootState, bootFinish } from './system/boot.js'; // prompt 36: oppstartsstatus (først, så db-steget måles)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER, withKvMemo } from './db.js';
import { ensureIndexes } from './db-indexes.js';
import { compressJson } from './http/compress.js';
import { sessionUser, requireAuth, requireAdmin, userInfo, isAdmin, needsSetup, serverName } from './auth/session.js';
import * as integrations from './integrations.js';
import { cfg, publicConfig, updateConfig, runRequest, userCfgSet, runAsUser } from './settings.js';
import { db as fhDb } from './finans/db.js';
import homeApi from './home.js';
import { mountMat } from './mat/index.js'; // Mat: /api/matplan, /mat/api og /mat/calendar.ics
import domainsApi, { domainSummary } from './domains.js';
import { startTrackingWorker, hasTrackingTest, testTracking } from './sporing/shipments.js';
import { mountSporing } from './sporing/index.js'; // Sporing: /api/tracking (kontoer, feilsøking, nøkler, pakker)
import uiApi from './ui.js';
import backgroundApi, { hasBackgroundTest, testBackgrounds } from './background.js';
import mobileApi, { meOut, removeAvatar, shortcutsFor, layoutOf, authOrToken, designOf } from './mobile.js';
import { mountDates } from './dates/api.js';
import rssApi, { startRssWorker } from './rss.js';
import { mountLocalFetch86, migrateLocalHosts86 } from './net/local-fetch.js'; // prompt 86: godkjente lokale verter for RSS/iCal (admin: /api/admin/local-fetch-hosts)
import { faviconHandler46 } from './news46.js'; // prompt 46 (SERVER46)
import { news73Api } from './news73.js'; // prompt 73 (NEWS73)
import iconsApi from './icons.js';
import tilesApi, { hasMapTest, testMap } from './tiles.js';
import { mountGjoremal } from './gjoremal/index.js'; // Gjøremål: /api/tasks og /api/huske
import notifyApi, { appMeta } from './notify.js';
import { attachRealtime } from './realtime.js';
import { revokeUserTokens } from './finans/routes.js';
import { startBirthdayWorker } from './kalender/birthdays.js';
import { mountBirthdays, mountKalenderFront, mountKalender } from './kalender/index.js'; // Kalender og Bursdager (server/kalender/)
import integrationsApi, { settingsSearchApi, testByIdOrName, integrationScope } from './integrations-api.js';
import settingsAsk30Api from './system/settings-search.js';
import { mountAi, mountAiEngines, mountChat } from './ai/index.js'; // AI: /api/ai, Chat og motorene på Mac mini-en (server/ai/)
import appUpdateApi from './app-update.js'; // prompt 32: Android-appen oppdaterer seg selv (GitHub-release via serveren)
import systemUpdateApi, { updateNow, versionApi44 } from './system/update.js'; // Oppdater fra appen: data/update/ ↔ updater-containeren
import systemBackupApi from './system/backup.js'; // prompt 29: systembackup (bare admin)
import ops51Api, { logMigrationsAtStartup } from './system/ops.js'; // prompt 51 (OPS51): restic-backup 3-2-1, testet gjenoppretting, staging/tilbakerulling, DB-vedlikehold
import smbBrowseApi from './smb-browse.js'; // prompt 30: SMB-veiviser (finn server, shares, mapper, test, lagre) – bare admin
import { mountGlimt } from './glimt/index.js'; // Glimt: motoren, minnet, brief, innstillingene og /api/assist (server/glimt/)
import { recipesApi61 } from './recipes61/api.js'; // prompt 61 (prompt 49 del 1): Glimt lærer (oppskrifter)
import { schedulesApi62 } from './sched62/api.js'; // prompt 62 (prompt 49 del 2): planlagte oppgaver («Faste oppgaver»)
import { skjoldApi76 } from './skjold76/api.js'; // prompt 76 (SKJSRV): Skjold Lab – sorteringsskapet (deler, skuffer, bilder, søk)
import { startScheduler62 } from './sched62/scheduler.js'; // prompt 62: scheduler (tikk hvert minutt, ikke i test)
import { startMem63 } from './glimt/memory/nightly.js'; // prompt 63: systemoppgaven kl. 03 (ikke i test); morgenvarselet går via server/jobs/
import { qualityApi64 } from './system/quality/api.js'; // prompt 64 (prompt 49 del 7): kvalitet over tid (nattlig eval, ukerapport)
import api36 from './api36.js'; // prompt 36 (SERVER36)
import { profilesApi, bibleApi } from './api37.js'; // prompt 37 (SERVER37)
import { bearerFallthrough46 } from './auth/bearer-fallthrough.js'; // prompt 46 (SERVER46)
import { news40Api, newsDigestApi, pages40Api, briefJul40 } from './api40.js'; // prompt 40 (SERVER40)
import { mountServer47 } from './system/server-urls.js'; // prompt 47 (SERVER47)
import { ruter41Api, mai17Api, brief41 } from './api41.js'; // prompt 41 (SERVER41)
import { mountFamilie, startFamilie, hlPage41 } from './familie/index.js'; // Familie: /api/family, /api/kart, /api/famcal51, /api/hjemlys (+ /api/velfremme)
import { mountFinans, mountFinansAliases, mountTrialWidgets, mountSubsCalendar, registerLegacyReceipts, legacyReceiptOwner } from './finans/index.js'; // Økonomi: /finans/api, Boliger-aliasene, prøveperiode-widgets og kalenderen «Abonnementer»
import { widgets43Api, gscDomains43Api, gsc43Api, gscViewMw43, gscOverviewMw43 } from './api43.js'; // prompt 43 (SERVER43)
import { mountMedia, startMedia } from './media/index.js'; // Media: alle /api/media-, /api/playback- og /api/medctl51-ruter
import { mediaCalendarsMw43 } from './media/arr.js'; // kalenderkilden «Media»
// Prompt 44 (SERVER44): Logger (Docker), Media (servere, søk som jobb, felles status), Avspilling, Studie-dokumenter, Kalender-deltakere,
// Logg inn som / andres oppsett / overfør eier.
import { integrationsStatusApi44 } from './media/servers.js'; // felles status for Integrasjoner og Media
import { logs44Api } from './system/docker-logs.js';
import { impersonation44, admin44Api, layoutLockMw44, setMobileApi44 } from './system/admin.js';
import { study44Api } from './study44.js';
import { mountAuthSecurity, mountAppAuth, mountAuthInvites, mountAuthRefresh, mountAuth, registerAccountRoutes } from './auth/index.js'; // innlogging og sikkerhet
import { mountApi45 } from './api45.js'; // prompt 45 (SERVER45)
import { traceObs51, mountObs51 } from './system/observability/index.js'; // prompt 51 (OBS51): helsedashbord, selvreparasjon, spor, ntfy
import { mountQa51, reportServerError51 } from './system/flags-crashes.js'; // prompt 51 (QA51): feature flags, krasjrapporter (GlitchTip), «Nytt i denne versjonen»
import { errorShape, API_PREFIXES, serverError } from './http/errors.js'; // felles feilform {error, code} for /api og /finans/api
import { tokenStateOf } from './finans/routes.js';
import { aliasCounter } from './http/aliases.js';
import { startJobs, listJobs, jobsStarted } from './jobs/index.js'; // én planlegger for bakgrunnsjobber med sideeffekter (ikke i test/sandkasse) // Q29: eldre API-aliaser samlet i én tabell, bruken telles
import { badInput85 } from './http/bad-input.js'; // prompt 85 (SRVSEC85): feil i kroppen fra klienten → 400, ikke 500
import { anonBodyCap85 } from './http/anon-body-limit.js'; // prompt 85 (SRVSEC85): store kropper bare fra innloggede klienter
import { mountLive89, startLive89 } from './live89.js'; // prompt 89 (SRV89): Live Activities / Live Updates (/api/live/*) og APNs-push
import { mountWebx51 } from './system/search.js'; // prompt 51 (WEBX51): felles søk, onboarding, tema per bruker, offline-konfliktvarsel
import { mountSrv52 } from './glimt/my-brief.js'; // prompt 52 (SRV52): Glimt «sist jeg var på», kalenderkontekst, brief-kort, Glimt-figur per bruker
import { mountDal53 } from './dal53/index.js'; // prompt 53 (DAL53): Desert Ant Labs-modellene (Eye, Redact, Gist, Tongue, Emo, Moderator, Clear, Voz)
import { gphoto46Api, startGphoto46 } from './gphoto46.js'; // prompt 46 (DATA46): Google Photos-album som bakgrunn
import { mountVaer } from './vaer/index.js'; // Vær: /here, /week-summary, /place, /layout og ski i /full
import { installCacheBust } from './cache-bust.js'; // prompt 32 (SERVER32)
import searchHistoryApi from './search-history.js'; // prompt 32: søkehistorikk per bruker
import romApi, { startSpaceScheduler, spaceApi } from './space32.js'; // prompt 32
import { domainGlimtApi, gscApi, startDomainGlimtScheduler } from './domains-glimt.js'; // prompt 32
import { companionsOf } from './kalender/calendars.js'; // companion-tokens (Kalender) i /api/me/devices
import { osloDate } from './dates/oslo.js';
if (process.env.MOCK_DATA === '1' && !fhDb.prepare('SELECT 1 FROM fh_transactions LIMIT 1').get()) (await import('./finans/demo.js')).loadDemo();

// Prompt 36: alle moduler (og migreringene de kjører når de lastes) er ferdige her.
// Manglende indekser for fremmednøkler og bruker-kolonner (server/db-indexes.js), etter at alle tabellene finnes.
try { const made = ensureIndexes(); if (made.length) console.info(`[db] ${made.length} nye indekser`); } catch (e) { console.warn('[db] indekser:', e?.message); }
bootStep('migrate', 'ok');
const api = process.env.MOCK_DATA === '1' ? await import('./mock.js') : integrations;
if (api !== integrations) console.warn('[mock] MOCK_DATA=1 – viser eksempeldata.');

const app = new Hono();
// ISO2: hver forespørsel kjører med sin egen brukerkontekst, så cfg() gir den innloggedes personlige integrasjoner.
app.use('*', (c, next) => runRequest(c, next));
// kv leses én gang per (bruker, nøkkel) i hver API-forespørsel (server/db.js, withKvMemo); skriving tømmer minnet.
for (const p of ['/api/*', '/finans/api/*']) app.use(p, (c, next) => withKvMemo(next));
for (const p of ['/api/*', '/finans/api/*']) app.use(p, compressJson); // brotli/gzip for JSON (server/http/compress.js), ikke SSE eller binært
traceObs51(app); // prompt 51 (OBS51): spor for trege forespørsler (DB, AI, eksterne kall) – før alle ruter
// Felles feilform: alle feilsvar fra /api og /finans/api blir JSON {error, code} (også ukjent sti og 500). Før alle ruter,
// så den ser det endelige svaret. Se server/http/errors.js og shared/schemas/common/error.schema.json.
for (const p of API_PREFIXES) app.use(p, errorShape({ tokenState: tokenStateOf }));
// Q29: hver bruk av et eldre alias (tabellen i server/http/aliases.js) telles i kv, admin ser det på GET /api/admin/aliases.
const aliases = aliasCounter({ kv, owner: OWNER });
for (const p of ['/api/*', '/finans/api/*', '/mat/api/*', '/home/api/*']) app.use(p, aliases.middleware);
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
    mediaSrc: ["'self'", 'blob:'], // prompt 57: opplesning (/api/tts, VoxCPM) spilles som blob:-lyd
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
// Prompt 85 (SRVSEC85): kropper over 1 MB tas bare imot med gyldig økt eller app-token (flere ruter leser kroppen før innloggingen sjekkes).
app.use('*', anonBodyCap85);
// Prompt 51 (SEC51): revisjonslogg, godkjenning av nye enheter, nytt land, passkeys, sperrer for QR/app-token, hemmeligheter og logg-skanner
// (mellomvare rundt innloggingsrutene – må stå før dem). /api/security51/* og /api/auth/passkey/*.
mountAuthSecurity(app);
app.route('/api/version', versionApi44); // prompt 44: {version, features} uten innlogging
// Prompt 41: /api/discovery, /api/me/server, Kalender-innlogging (device-token/-exchange, app-code, token, /app-auth) og mellomvaren
// som tilbakekaller Kalender-tokenene ved utlogging fra Homelab-appen (må stå før /finans/api). server/auth/app-login.js.
mountAppAuth(app);
mountServer47(app); // prompt 47 (SERVER47): GET /api/config/servers {publicUrl, localUrl etter innlogging} + /api/finans/kvitteringer-aliasene
mountObs51(app); // prompt 51 (OBS51): /api/system/obs51/* (admin) og /api/me/ntfy51 (alle)
mountQa51(app); // prompt 51 (QA51): /api/flags, /api/crash, /api/whatsnew, /api/admin/flags51, /api/admin/crashes51
mountWebx51(app); // prompt 51 (WEBX51): /api/search51, /api/me/theme51, /api/me/share51, /api/offline51
mountAuthInvites(app); // onboarding for nye familiemedlemmer: /api/onboard51/*, /join/:token (server/auth/invites.js)
mountSrv52(app); // prompt 52 (SRV52): /api/glimt/quickparse52, /api/glimt/lex52, /api/brief52, /api/me/glimt-char52, admin; mellomvare foran POST /api/glimt/agent
mountAiEngines(app); // server/ai/: /api/admin/{fermion53,whisper54,voxcpm57,omlx58}/* (bare admin) og /api/voices57*
mountDal53(app); // prompt 53 (DAL53): /api/admin/dal53/{health,preload}, /api/emo53/suggest, /api/voice53/*; Moderator foran /api/chat/files og /api/img
mountLocalFetch86(app, authOrToken); // prompt 86: GET|PUT /api/admin/local-fetch-hosts (bare admin)
mountDates(app, authOrToken); // POST /api/dates/parse: den felles datotolkeren for klientene (Q17)
mountAuthRefresh(app); // prompt 44: POST /api/auth/refresh og POST /api/apps/kalender/log
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
// Prompt 51 (FIN51): Planlegging (sparemål, kalender, skatt, priser, abonnementsjeger) som egen side for PWA/mobil; desktop viser den i FinansHub.
app.get('/finans/plan51', async (c) => (sessionUser(c) ? html(c, await page('finans/plan51.html')) : c.redirect('/login?next=/finans/plan51')));
app.get('/finans/sw.js', async (c) => c.body(await page('finans/sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
mountFinans(app); // server/finans/: lagene på /finans/api (overview → planning → glimt-routes → tx-edit → routes.js), /api/receipts/scan|health, /finans/share

// Statiske filer revalideres alltid (304 når de er uendret), så en oppdatering slår inn med en gang.
app.use('/assets/*', async (c, next) => {
  await next();
  if (!c.res.ok) return;
  c.header('Cache-Control', 'no-cache');
  // Prompt 85: bilder, ikoner, lyder og annet som serveStatic sender, har bare Last-Modified, og If-Modified-Since ble oversett –
  // alt ble lastet ned på nytt ved hver sidevisning. Uendret fil svarer nå 304 uten innhold (JS har egen ETag i cache-bust.js).
  const lm = Date.parse(c.res.headers.get('Last-Modified') ?? ''), ims = Date.parse(c.req.header('if-modified-since') ?? '');
  if (c.req.method !== 'GET' || c.res.status !== 200 || c.req.header('if-none-match') || Number.isNaN(lm) || Number.isNaN(ims) || lm > ims) return;
  const headers = new Headers(c.res.headers);
  headers.delete('Content-Length'); headers.delete('Content-Type');
  try { await c.res.body?.cancel(); } catch { /* strømmen er allerede lukket */ }
  c.res = undefined;
  c.res = new Response(null, { status: 304, headers });
});
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

// Passord, 2FA-steg og 2FA-oppsett i appen, reauth, QR-innlogging, /l/:code, /.well-known, førstegangsoppsett og utlogging (server/auth/login.js).
mountAuth(app);

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

/* --- Konto: pålitelige enheter, passord, brukere, servernavn og 2FA (server/auth/account.js) --- */

registerAccountRoutes(authed);

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
  const r = legacyReceiptOwner(name); // undefined = ingen kvittering med fila
  if (r !== undefined) return r;
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

/* --- Kvitteringer (den gamle lista, server/finans/legacy-receipts.js) --- */

registerLegacyReceipts(authed, { upload, saveFile, removeFile });

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
  const today = osloDate(), u = c.get('user');
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
// Media (server/media/): /api/media/*, /api/playback/* og /api/medctl51/* i lagenes rekkefølge. Plex/Jellyfin-rutene bruker
// integrasjonsklienten her (ekte eller mock) og de personlige verdiene (ISO2), og den som har tilgang til Media uten egne verdier
// får serverens oppsett (se media/servers.js).
mountMedia(app, { now: personal('media', proxy(api.getMediaNow)), recent: personal('media', proxy(api.getMediaRecent)), history: personal('media', proxy(api.getMediaHistory)), poster: (src, id) => api.getMediaPoster(src, id) });
mountApi45(app); // prompt 45 (SERVER45): Docker-oppsett, Search Console, AI-import, sonevarsler, HA-helse, Vær, Gjøremål, Innstillinger
authed.get('/space/tle', proxy(api.getTle));
authed.get('/space/apod', proxy(api.getApod));
authed.get('/space/gallery/:key', proxy((c) => {
  const key = c.req.param('key');
  if (!api.GALLERIES[key]) throw new Error('Ukjent galleri');
  return api.getGallery(key);
}));

app.route('/api/ui', uiApi);
mountSporing(app); // server/sporing/: /api/tracking – kontoer, PostNord-helse, feilsøking, AliExpress, nøkler og pakkene
app.route('/api/bg', gphoto46Api); // prompt 46 (DATA46): /api/bg/gphoto (før mobileApi sin /api/bg/:file)
mountMat(app); // server/mat/: /api/matplan og /mat/api (samme app) og /mat/calendar.ics
// Profil, oppsett, søk, mobilforside og widgets: sesjon ELLER FinansHub-token (må stå før /api med requireAuth).
app.get('/api/rss/favicon', faviconHandler46); // prompt 46: offentlig, bare domener fra kildelistene (news46.js)
app.route('/api/rss', rssApi); // Nyhetsleser (prompt 13): RSS/Atom med ✦ AI-sammendrag og -kategorisering
app.route('/api/icons', iconsApi); // Ikoner (prompt 23): Iconify-søk, SVG cachet på disk og ✦ AI-forslag
// Kartfliser (prompt 20): /tiles/:style/:z/:x/:y.png og /api/config/map, sesjon eller app-token (header eller ?token=).
app.route('/', tilesApi);
mountLive89(app); // prompt 89 (SRV89): /api/live/aktiviteter, /handling, /innstillinger, /tokens
mountFamilie(app); // server/familie/: sonevarsler, Kart, familiekalender, Steder/Folk/Helse/Sjekk inn, posisjon og Vel fremme
mountGjoremal(app); // server/gjoremal/: /api/tasks (synk-raden, listerekkefølge, Glimt-logg, Huskeliste) og /api/huske
app.route('/api/news/saved', news73Api); // prompt 73 (NEWS73): lagrede artikler (offline, SSRF-vern)
app.route('/api/news', news40Api); // prompt 40: Nyheter · Glimt-siden
app.route('/api/app/pages', pages40Api); // prompt 40: alle sider i Mer (fanelinja), før /api/app
app.route('/api/app/android', appUpdateApi); // prompt 32: /latest og /apk/:version, sesjon eller app-token, alle brukere
app.route('/api', notifyApi); // Varsler (/api/me/notify) og appnavn (/api/app) (prompt 17)
mountFinansAliases(app); // server/finans/: Boliger under /api/homes/* og /api/boliger/oversikt (samme tilgang som /finans/api)
app.route('/api/background', backgroundApi); // Bakgrunner (prompt 19): Vær, Planeter, Oslo, eget bilde
// Prompt 24: Bursdager (per bruker, Google Kalender og Home Assistant), widget-svaret, alle integrasjoner (bare admin),
// ✦ AI-søk i innstillingene og domene-pillen på Boliger (bare admin, cache 5 min). Sesjon eller app-token.
mountBirthdays(app); // server/kalender/: /api/birthdays (bilder først), /api/widgets/birthdays, /api/apps/kalender
app.route('/api/space', spaceApi); // prompt 32: /tle?group=, /apod?days=7, /mars (før authed sine /space-ruter)
app.route('/api/rom', romApi); // prompt 32: Rom – APOD (7 dager), Mars-rovere, satellitter (SGP4), NASA-nøkkel på serveren
app.route('/api/widgets', widgets43Api); // prompt 43: /media og /catalog
mountTrialWidgets(app); // server/finans/: /api/widgets/trials (GET kompakt, POST /:id «Avsluttet»)
app.route('/api/integrations', integrationsStatusApi44); // prompt 44: GET /status (samme kilde som Media), før /:id
app.route('/api/integrasjoner', integrationsStatusApi44);
app.route('/api/integrations', integrationsApi);
app.route('/api/integrasjoner', integrationsApi); // prompt 26: samme liste under norsk navn
// Prompt 26: Kalender (skolens iCal, Canvas, Bursdager og Google) og kompakt widget-svar. Sesjon eller app-token, per bruker.
mountKalenderFront(app); // server/kalender/: invitasjoner, Glimt-søk, beskriv, rask time, HA, fag (før /api/kalender og de innebygde kalenderne)
app.route('/api/ruter', ruter41Api); // prompt 41: Min reise, skolesoner, «forlot skolen»
app.use('/api/kalender/calendars', mediaCalendarsMw43); // prompt 43: innebygd kalender «Media» (Sonarr/Radarr)
app.use('/api/kalender/calendars/*', mediaCalendarsMw43);
mountSubsCalendar(app); // server/finans/: innebygd kalender «Abonnementer» (trekkdatoer) – etter Media-kalenderen, før mountKalender
mountKalender(app); // server/kalender/: kalenderlista, hendelser, vær, widget, companion-token og /api/kalender
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
app.route('/api/glimt/quality', qualityApi64); // prompt 64: /runs, /runs/:id, /run-now, /abort, /weekly, /settings
app.route('/api/search-history', searchHistoryApi); // prompt 32: søkehistorikk per bruker (mobil logger, web viser)
mountAi(app); // server/ai/: /api/ai/memory, ✦ modellanbefalingene og AI-kontrollen (/api/ai)
app.use('/api/brief', briefJul40);
app.use('/api/brief', brief41); // prompt 41: ski, mai17, minReise // prompt 40: brief.jul i julemodus
app.route('/api/glimt/mai17', mai17Api); // prompt 41: 17. mai (program, design-bryter, hurra)
mountVaer(app); // server/vaer/: /api/weather/here, /week-summary, /place, ski i /full og /layout (før mobileApi sine værruter)
app.route('/api/glimt/recipes', recipesApi61); // prompt 61: oppskrifter som lærer av bruk (per bruker)
app.route('/api/glimt/schedules', schedulesApi62); // prompt 62: planlagte oppgaver (per bruker)
app.route('/api/skjold', skjoldApi76); // prompt 76 (SKJSRV): Skjold Lab (per bruker, sesjon eller app-token)
startScheduler62();
startMem63();
// server/glimt/: /api/glimt/memory, /api/brief, /api/glimt/settings, /api/tts, /api/img, /api/glimt/agent, /api/glimt/entities,
// /api/glimt og /api/assist (etter de andre /api/glimt/*-rutene over, så de spesifikke rutene svarer først)
mountGlimt(app);
mountChat(app); // server/ai/: Claude-importen (/api/chat/import) og Chat (/api/chat), sesjon eller app-token
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
app.route('/api', api36); // prompt 36: /dashboard/layout og /weather/places/summary (før mobileApi)
app.route('/api/bible', bibleApi); // prompt 37: dagens bibelvers (bare med modulen)
app.route('/api', profilesApi); // prompt 37: profiler og onboarding
app.route('/api', study44Api); // prompt 44: /study/documents, /study/overview
app.get('/api/admin/jobs', authOrToken, (c) => (isAdmin(c.get('user')) ? c.json({ started: jobsStarted(), jobs: listJobs() }) : c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403))); // bakgrunnsjobbene (server/jobs/)
app.get('/api/admin/aliases', authOrToken, (c) => (isAdmin(c.get('user')) ? c.json({ aliases: aliases.usage() }) : c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403))); // Q29
app.route('/api', admin44Api); // prompt 44: /admin/impersonate, /users/:id/layout, /server/owner
app.use('/api/me/layout', layoutLockMw44); // prompt 44: låst oppsett
setMobileApi44(mobileApi);
app.route('/api', mobileApi);
app.route('/api', authed);
app.route('/home/api', homeApi);
app.route('/domains/api', domainsApi);
// Prompt 51 (OPS51): OPS51_SANDBOX=1 = testet gjenoppretting / staging-kopi mot en kopi av databasen: ingen bakgrunnsjobber
// (ingen varsler, e-post, backup, oppdateringer eller selvreparasjon). Bare HTTP-serveren og migreringene kjører.
const BG51 = process.env.NODE_ENV !== 'test' && process.env.OPS51_SANDBOX !== '1';
migrateLocalHosts86().catch((e) => console.warn('[localfetch]', e.message)); // prompt 86: én gang – lokale verter i administratorenes abonnementer godkjennes
if (BG51) { startTrackingWorker(); startRssWorker(); startBirthdayWorker(); startDomainGlimtScheduler(); startSpaceScheduler(); startMedia(); startLive89(); }
if (BG51) { startGphoto46(); } // prompt 46 (DATA46)
if (BG51) startJobs(); // felles planlegger (server/jobs/): backup, oppdatering, drift og helse, sikkerhet, krasjrapporter, kvalitet, varm modell, prøveperioder, skattemelding, brief, iCal, skolekalendere, Sjekk inn, «forlot»
if (process.env.NODE_ENV !== 'test') logMigrationsAtStartup(); // migrasjonsloggen (også i sandkassen/staging); backup og vedlikehold går i server/jobs/
if (BG51) startFamilie(); // server/familie/: første runde av påminnelsene «hvem kjører?» (resten går i server/jobs/)
if (BG51) import('./ai39.js').then((m) => m.startBest59()).catch((e) => console.warn('[ai39] beste modeller:', e?.message)); // prompt 59: de beste modellene (fra eval) settes én gang

app.onError(async (err, c) => {
  // Prompt 85 (SRVSEC85): ugyldig JSON eller en kropp som ikke er et objekt er klientens feil → 400 uten feillogg og krasjrapport.
  const bad = await badInput85(err, c);
  if (bad) return bad;
  console.error(err);
  reportServerError51(err, c); // prompt 51 (QA51): lagres lokalt og videresendes til GlitchTip når den finnes
  return serverError(c); // {error:'Intern feil', code:'INTERNAL_ERROR'} – aldri stack eller detaljer
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
  // Prompt 85: ryddig nedstenging. I containeren er Node PID 1, og uten egen behandler overser PID 1 SIGTERM: «docker stop»,
  // omstart og hver oppdatering ventet da 10 s og drepte prosessen med SIGKILL midt i det den holdt på med. Nå tas det ikke imot
  // nye forespørsler, de som pågår får inntil 5 s, og databasen lukkes (WAL skrives inn) før prosessen avslutter.
  let stopping85 = false;
  const shutdown85 = (sig) => {
    if (stopping85) return;
    stopping85 = true;
    console.log(`[stopp] ${sig} – stenger ned.`);
    const done = () => {
      try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (e) { console.warn('[stopp] databasen:', e?.message); }
      process.exit(0);
    };
    setTimeout(done, 5000).unref();
    server.close(done);
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown85('SIGTERM'));
  process.on('SIGINT', () => shutdown85('SIGINT'));
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
