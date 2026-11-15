// Familie: monterer rutene under /api/family, /api/kart, /api/famcal51, /api/hjemlys og aliaset /api/velfremme. server/index.js
// kaller mountFamilie(app) der Familie-rutene sto (etter Media, Sporing og Mat, før Gjøremål). Rekkefølgen er bærende (Hono kjører
// handlere og mellomvare i registreringsrekkefølge):
//   1. zone-alerts.js       /api/family/zone-alerts og soneikonene, så HA-filteret (health-ha-devices.js) foran /health/ha
//   2. places.js            Steder, Folk, I dag, Helse, Sjekk inn – før de eldre /api/family-rutene, som den overtar deler av
//   3. health-ha.js         /api/family/health/ha, så mellomvaren som legger health.source/limited/stale på /api/family/*
//   4. positions.js         grunnmodulen: posisjon, spor, sensorer, soner, varsler, helse
//   5. hjemlys*.js          Vel fremme (koden heter «hjemlys»), med aliaset /api/velfremme/* → /api/hjemlys/*
// /api/kart og /api/famcal51 har egne prefikser. Den offentlige statussiden /hl/:token monteres tidlig i index.js (hlPage41).
// Bakgrunnsjobbene (forlot, Sjekk inn, Vel fremme, helse fra HA, «hvem kjører?») registreres i filene via server/jobs/.
// Filene:
//   positions.js        posisjon, spor, sensorer, soner med varsler, helsesammendrag og personvernet (deling på/omtrentlig/av)
//   places.js           Familie i nytt design: Steder med områder, Folk, I dag, Helse per person og Sjekk inn
//   zone-alerts.js      sonevarsler med soneikon og brytere per mottaker
//   health-ha.js        Helse fra Home Assistant (Companion-appens sensorer); health-ha-devices.js filtrerer på mobile_app
//   where.js            «Hvor er Ingrid?» i Glimt
//   map.js              Kart: holdeplasser, avganger og kjøretøy (Entur) for valgte soner, soner og personer
//   famcal.js           familiekalenderen med «hvem kjører?»
//   hjemlys.js          Vel fremme: økta, posisjon, ok/hjemme/avslutt (også admin), tokens, forslag, «Si fra»-beskjeder i GET /
//   profiles.js         profiler i husstanden og onboarding (/api/profiles*, /api/onboarding/link, /api/users/:id/profile); montert
//                       på /api fra api37.js (etter Bibelvers, før mobil-API-et), og profileName() til hilsenen i Glimt og briefen
//   hjemlys-notices.js  «Si fra» (Sjekket inn · Drar snart · Drar nå · Fremme), tur til et valgfritt mål og den offentlige statussiden
import { zone45Api } from './zone-alerts.js';
import { haHealthMw45 } from './health-ha-devices.js';
import { mountFamily50 } from './places.js';
import { health42Api, familyHealthMw42 } from './health-ha.js';
import familyApi from './positions.js';
import { kart46Api } from './map.js';
import { famcal51Api, sweepFamcal51 } from './famcal.js';
import { hjemlys40Api } from './hjemlys.js';
import { hjemlys41Api } from './hjemlys-notices.js';

export { hlPage41 } from './hjemlys-notices.js';

export function mountFamilie(app) {
  app.route('/api/family', zone45Api); // sonevarsler + soneikon
  app.use('/api/family/health/ha', haHealthMw45); // HA-helse: bare mobile_app-enheter
  app.route('/api/kart', kart46Api); // holdeplasser, avganger, kjøretøy for valgte soner, soner og personer
  app.route('/api/famcal51', famcal51Api); // familiekalenderen
  mountFamily50(app); // /api/family/places…, /people50, /today50, /health50…, /checkin… (før de eldre /api/family-rutene)
  app.route('/api/family/health/ha', health42Api); // helse fra Home Assistant
  app.use('/api/family/*', familyHealthMw42); // health.source/sourceDevice/limited/stale
  app.route('/api/family', familyApi); // posisjon, soner, varsler og helse
  // Vel fremme (tidligere Hjemlys): /api/velfremme/* er et alias for /api/hjemlys/*.
  app.all('/api/velfremme/*', async (c) => { const u = new URL(c.req.url); u.pathname = u.pathname.replace(/^\/api\/velfremme/, '/api/hjemlys'); const m = c.req.method; return app.fetch(new Request(u, { method: m, headers: c.req.raw.headers, body: m === 'GET' || m === 'HEAD' ? undefined : await c.req.arrayBuffer() }), c.env); });
  app.route('/api/hjemlys', hjemlys41Api); // Si fra (notice/status), offentlig status
  app.route('/api/hjemlys', hjemlys40Api); // start (også tur til valgfritt mål), status med notices, posisjon, ok/hjemme/avslutt, tokens, forslag
}

/** Første runde av påminnelsene «hvem kjører?» 30 s etter oppstart (ellers først etter ett intervall). Bare når bakgrunnsjobber er lov. */
export function startFamilie() {
  setTimeout(() => sweepFamcal51().catch((e) => console.warn('[famcal51] påminnelser:', e.message)), 30_000).unref?.();
}
