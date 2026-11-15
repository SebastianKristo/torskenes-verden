// System og drift: monterer rutene for admin, logger, helse, backup, oppdatering, flagg, krasjrapporter, kvalitet og søk.
// server/index.js kaller monteringene nøyaktig der de gamle linjene sto. Rekkefølgen er bærende (Hono kjører handlere og
// mellomvare i registreringsrekkefølge):
//   mountSystemEarly(app)  – tidlig, før /api-rutene med requireAuth: serveradresser, helse/spor/ntfy, flagg, krasj, «Nytt i
//                            versjonen», felles søk, tema per bruker og konfliktvarselet for offline-køen
//   mountSystemAdmin(app)  – etter integrasjonssøket i Innstillinger: Innstillinger-søket, restic-backup og vedlikehold (/api/ops51),
//                            systembackup, oppdatering, Docker-oppsett (mellomvaren før loggene), logger og kvalitet over tid
//   mountAdminRoutes(app, { mobileApi }) – rett før mobileApi: bakgrunnsjobbene, «Logg inn som», andres oppsett, servereier og
//                            mellomvaren for låst oppsett foran /api/me/layout
// Bakgrunnsjobbene registreres i filene via server/jobs/ (ikke i test/sandkasse). Filene:
//   boot.js              oppstartsstatus («Starter opp», /api/health i index.js)
//   admin.js             «Logg inn som» (impersonering), andres oppsett og overføring av servereierskapet
//   dashboard-layout.js  widget-oppsettet på Oversikt per enhetsklasse
//   app-pages.js         alle sider i Mer og «Rediger fanelinjen»
//   server-urls.js       standard serveradresser for appene (/api/config/servers) og kvitteringsaliasene
//   settings-search.js   indeksen, ✦ AI-søket og seksjonene i Innstillinger
//   search.js            felles søk over alle moduler
//   theme.js             tema per bruker (synket, etter sola eller klokka)
//   offline-conflicts.js konfliktvarselet for offline-køen (X-Offline51-Base)
//   flags-crashes.js     feature flags, krasjrapporter (GlitchTip) og «Nytt i denne versjonen»; whatsnew.js gjør punktene lesbare
//   model-flags.js       flagg for lokale modeller (PÅ som standard)
//   docker-logs.js       Docker-logger, containere, feilsøking og omstartsvarselet
//   docker-setup.js      «Sett opp nå» for Docker-proxyen (updateren gjør jobben)
//   observability/       helsedashbord, selvreparasjon, spor for trege forespørsler og ntfy
//   ops.js               restic-backup (restic-backup.js), testet gjenoppretting, staging og databasevedlikehold (db-maintenance.js)
//   backup.js            systembackup (lokal, SMB, B2) og gjenoppretting
//   update.js            oppdatering fra appen via updater-containeren, versjoner og tilbakerulling
//   quality/             kvalitet over tid: nattlig eval og ukerapport
import { mountServer47 } from './server-urls.js';
import { mountObs51 } from './observability/index.js';
import { mountQa51 } from './flags-crashes.js';
import { mountWebx51 } from './search.js';
import settingsSearchApi from './settings-search.js';
import ops51Api from './ops.js';
import systemBackupApi from './backup.js';
import systemUpdateApi from './update.js';
import { docker45Api, dockerSetupMw45 } from './docker-setup.js';
import { logs44Api } from './docker-logs.js';
import { qualityApi64 } from './quality/api.js';
import { admin44Api, layoutLockMw44, setMobileApi44 } from './admin.js';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth/session.js';
import { listJobs, jobsStarted } from '../jobs/index.js';

export function mountSystemEarly(app) {
  mountServer47(app); // GET /api/config/servers {publicUrl, localUrl etter innlogging} + /api/finans/kvitteringer-aliasene
  mountObs51(app); // /api/system/obs51/* (admin) og /api/me/ntfy51 (alle)
  mountQa51(app); // /api/flags, /api/crash, /api/whatsnew, /api/admin/flags51, /api/admin/crashes51
  mountWebx51(app); // /api/search51, /api/me/theme51, /api/me/share51, /api/offline51
}

/** Intern videresending til en annen sti med samme innlogging (samme tilgang som målet). */
const forwardGet = (app, path) => (c) => { const u = new URL(c.req.url); u.pathname = path; return app.fetch(new Request(u, { headers: c.req.raw.headers }), c.env); };

export function mountSystemAdmin(app) {
  app.route('/api/settings', settingsSearchApi); // GET /index, POST /ask (✦ AI-søk med indeks fra serveren) og GET /sections
  app.route('/api/ops51', ops51Api); // bare admin; /smoke bare i sandkassen (OPS51_SANDBOX=1)
  app.route('/api/backup', systemBackupApi); // bare admin; endringer krever økt eller admin-token, gjenoppretting passordet
  app.route('/api/system/update', systemUpdateApi);
  app.route('/api/update', systemUpdateApi); // /api/update/versions, /api/update/rollback {version, restoreBackup, pauseAutoDays}, /api/update/status
  // Docker-logger uten oppsett: «Sett opp nå», og tomtilstanden med setup.state på containere og logger (før logs44Api).
  app.route('/api/system/docker', docker45Api);
  for (const p of ['/api/system/containers', '/api/system/containers/*', '/api/system/logs', '/api/system/logs/*']) app.use(p, dockerSetupMw45);
  app.route('/api/system', logs44Api); // /api/system/containers, /api/system/logs (bare admin; start/stopp/omstart krever {confirm:true})
  // Kort versjonssvar for oppdateringsbanneret og endringsloggen (samme tilgang som /api/system/update).
  app.get('/api/system/version', forwardGet(app, '/api/system/update/version'));
  app.get('/api/system/changelog', forwardGet(app, '/api/system/update/changelog'));
  app.route('/api/glimt/quality', qualityApi64); // /runs, /runs/:id, /run-now, /abort, /weekly, /settings
}

export function mountAdminRoutes(app, { mobileApi }) {
  app.get('/api/admin/jobs', authOrToken, (c) => (isAdmin(c.get('user')) ? c.json({ started: jobsStarted(), jobs: listJobs() }) : c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403))); // bakgrunnsjobbene (server/jobs/)
  app.route('/api', admin44Api); // /admin/impersonate, /users/:id/layout, /server/owner
  app.use('/api/me/layout', layoutLockMw44); // låst oppsett
  setMobileApi44(mobileApi);
}
