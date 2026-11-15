// Domener: flere domener med statistikk (Cloudflare, Plausible, Umami eller bare oppetid og SSL), Glimt-oppsummeringen og Google
// Search Console. Domenene er serveroppsett (bare admin); oppsummeringer og Search Console-koblingen er per bruker.
// server/index.js kaller mountDomener(app) der domene-pillen sto (etter Chat, før dashbord-oppsettet). /domains/api sto helt til
// slutt i index.js, men ingen rute eller mellomvare mellom de to plassene svarer på /domains/api/*, så svarene er de samme.
// Rekkefølgen innenfor er bærende:
//   1. domene-pillen (/api/domains/summary og aliaset /api/domener/sammendrag) og «Test token» før de generelle /api/domains-rutene
//   2. mellomvarene i gsc-diagnose.js som legger årsaken på tomme Search Console-svar, før handlerne i glimt.js
//   3. «Hent nå» og diagnosen (gsc-diagnose.js) før glimt.js sine /:domain-ruter; /api/gsc/test før koblingen i glimt.js
// Oppsettet med servicekonto og normaliseringen av eiendommen (gsc-service-account.js) monteres i api45.js (mountApi45), tidligere
// i index.js. Hentingen kl. 06 og oppsummeringene kl. 07 går via server/jobs/ (domener.daglig).
// Filene:
//   domains.js              /domains/api: domenene, tokens (kryptert), analyse og sanntid, domene-pillen og tallene til Glimt
//   glimt.js                Glimt-oppsummeringen per domene, Search Console-koblingen (OAuth/PKCE), hentingen og visningen
//   gsc-diagnose.js         hvorfor Google Søk er tomt, «Hent nå» og Test per eiendom
//   gsc-service-account.js  servicekonto og eiendom i riktig format
import { isAdmin } from '../auth/session.js';
import { authOrToken } from '../mobile.js';
import domainsApi, { domainSummary } from './domains.js';
import { domainGlimtApi, gscApi } from './glimt.js';
import { gscDomains43Api, gsc43Api, gscViewMw43, gscOverviewMw43 } from './gsc-diagnose.js';

const domainPill = async (c) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403);
  try { return c.json(await domainSummary()); } catch (e) { return c.json({ error: e.message }, 502); }
};

export function mountDomener(app) {
  app.get('/api/domains/summary', authOrToken, domainPill); // pillen på Boliger (cache 5 min)
  // Test token i Innstillinger → Domener (samme tilgang som /domains/api: bare admin).
  app.post('/api/domains/token/verify', async (c) => { const u = new URL(c.req.url); u.pathname = '/domains/api/token/verify'; return app.fetch(new Request(u, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env); });
  app.get('/api/domener/sammendrag', authOrToken, domainPill);
  app.use('/api/domains/overview', gscOverviewMw43); // Google Søk uten tall → årsak
  app.use('/api/domains/:domain/gsc', gscViewMw43);
  app.route('/api/domains', gscDomains43Api); // /:domain/gsc/refresh (Hent nå) og /:domain/gsc/test
  app.route('/api/domains', domainGlimtApi); // /:domain/summary (Glimt), /overview, /import og /:domain/gsc, bare admin
  app.route('/api/gsc', gsc43Api); // /test (diagnose per eiendom)
  app.route('/api/gsc', gscApi); // Search Console-kobling per bruker (webmasters.readonly)
  app.route('/domains/api', domainsApi);
}
