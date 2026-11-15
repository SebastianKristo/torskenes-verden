// Økonomi (internt «FinansHub»): monterer alle rutene i domenet. server/index.js kaller funksjonene nøyaktig der de gamle
// monteringene sto, fordi rekkefølgen er bærende (Hono kjører handlere og mellomvare i registreringsrekkefølge):
//   mountFinans(app)          – /finans/api (lagene før routes.js, så routes.js), aliasene /api/receipts/scan|health og /finans/share
//   mountFinansAliases(app)   – Boliger under /api/homes/* og /api/boliger/oversikt (samme tilgang som /finans/api)
//   mountTrialWidgets(app)    – /api/widgets/trials (prøveperiode-widgets)
//   mountSubsCalendar(app)    – den innebygde kalenderen «Abonnementer» i Kalender (før mountKalender)
// Den gamle kvitteringslista (/api/receipts, tabellen receipts, Q30) registreres på den innloggede routeren i index.js med
// registerLegacyReceipts(authed, {upload, saveFile, removeFile}) (legacy-receipts.js).
//
// Lagene på /finans/api, i rekkefølge (alle har egen tilgangskontroll: økt eller token med finance:read / finance:write):
//   overview.js      – /overview og /transactions/months (feltene til saldokortet og månedstoppen ligger i month-fields.js og
//                      legges på av handlerne for /summary og /transactions selv)
//   planning.js      – /fin51/*: sparemål, faste utgifter-kalender, skattehjelp (tax.js), prishistorikk (prices.js), abonnementsjeger
//   glimt-routes.js  – Glimt-søk (/search/ask), filter, avanserte oppgaver (glimt-tasks.js), Boliger web (boliger-web.js), aksje-logoer
//   tx-edit.js       – «Lagt til», rediger alt med historikk, «Les på nytt» (før routes.js; mellomvarer som slipper videre)
//   routes.js        – resten av FinansHub-API-et (og kvitteringskjeden i receipts/, abonnementer, prøveperioder, Boliger)
// Bakgrunnsjobbene (SMB-backup, varsler for prøveperioder, påminnelse om skattemeldingen) registreres i server/jobs/ av modulene selv.
import { authOrToken } from '../mobile.js';
import { sessionUser } from '../auth/session.js';
import finansApi from './routes.js';
import { finans43Api } from './overview.js';
import fin51Api from './planning.js';
import fasteBetalingerApi from './faste-betalinger.js';
import { finans42Api } from './glimt-routes.js';
import { finans40Api } from './tx-edit.js';
import { receiptsAlias48 } from './receipts/routes.js';
import trialWidgetsApi from './trial-widgets.js';
import { abCalendarsMw42, abApi42, calendarsEvents42, abIcs42 } from './subs-calendar.js';
import './trials-notify.js'; // registrerer jobben finans.provetider
import './tax.js'; // registrerer jobben finans.skattemelding
export { registerLegacyReceipts, legacyReceiptOwner } from './legacy-receipts.js'; // den gamle kvitteringslista (/api/receipts)

/** /finans/api med lagene før routes.js, aliasene /api/receipts/scan og /health, og del-målet /finans/share. */
export function mountFinans(app) {
  app.route('/finans/api', finans43Api); // /overview, /transactions/months
  app.route('/finans/api', fin51Api); // /fin51/* (egen tilgangskontroll, per bruker)
  app.route('/finans/api', fasteBetalingerApi); // /faste-betalinger: abonnementer, faste utgifter og planlagte trekk i én form (Q4)
  app.route('/finans/api', finans42Api); // Glimt-søk (SQL før LLM, tankesteg), filter, avanserte oppgaver + PDF, Boliger web, import til bolig, aksje-logoer
  app.route('/finans/api', finans40Api); // added, PATCH alt + historikk, Les på nytt, POST /search/ask (før routes.js)
  app.route('/finans/api', finansApi);
  app.route('/api/receipts', receiptsAlias48(finansApi)); // alias POST /api/receipts/scan og GET /api/receipts/health
  // Del-mål for PWA-en: «Del → FinansHub» fra bilder-appen legger kvitteringen i køen.
  app.post('/finans/share', async (c) => {
    if (!sessionUser(c)) return c.redirect('/login?next=/finans/');
    const res = await finansApi.request('/receipts', { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', 'content-type': c.req.header('content-type') ?? '' }, body: await c.req.arrayBuffer() }, c.env);
    return c.redirect(res.ok ? '/finans/#/skann' : '/finans/#/kv');
  });
}

/** Boliger (prompt 17, 30, 42): alias for FinansHub-rutene under /api, samme tilgang (økt eller token) fordi de går gjennom /finans/api. */
export function mountFinansAliases(app) {
  const toFinans = async (c, path) => {
    const u = new URL(c.req.url);
    u.pathname = `/finans/api${path}`;
    return app.fetch(new Request(u, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env);
  };
  const toFinansAny = async (c, path) => {
    const u = new URL(c.req.url);
    u.pathname = `/finans/api${path}`;
    const m = c.req.method;
    return app.fetch(new Request(u, { method: m, headers: c.req.raw.headers, body: m === 'GET' || m === 'HEAD' ? undefined : await c.req.arrayBuffer() }), c.env);
  };
  app.get('/api/homes/:id{[0-9]+}/shareable', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/shareable`));
  app.post('/api/homes/:id{[0-9]+}/members', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/members`));
  app.get('/api/boliger/oversikt', (c) => toFinansAny(c, '/boliger/oversikt')); // Boliger-forsiden (2a)
  app.patch('/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/entries/${c.req.param('eid')}`));
  app.get('/api/homes/:id{[0-9]+}/expenses/:eid{[0-9]+}/history', (c) => toFinansAny(c, `/folders/${c.req.param('id')}/entries/${c.req.param('eid')}/history`));
  app.post('/api/homes/:id{[0-9]+}/expenses', (c) => toFinans(c, (c.req.header('content-type') ?? '').startsWith('multipart/') ? `/folders/${c.req.param('id')}/receipts` : `/folders/${c.req.param('id')}/entries`));
}

/** Prøveperiode-widgets: GET kompakt liste, POST /:id «Avsluttet» eller «Behold». */
export function mountTrialWidgets(app) {
  app.route('/api/widgets/trials', trialWidgetsApi);
}

/** Den innebygde kalenderen «Abonnementer» (trekkdatoer og prøveperioder). Etter Media-kalenderen og før mountKalender. */
export function mountSubsCalendar(app) {
  app.use('/api/kalender/calendars', abCalendarsMw42);
  app.use('/api/kalender/calendars/*', abCalendarsMw42);
  app.route('/api/kalender/abonnementer', abApi42);
  app.get('/api/kalender/abonnementer.ics', authOrToken, abIcs42);
  app.route('/api/calendars', calendarsEvents42); // GET /api/calendars/events?cal=ab
}
