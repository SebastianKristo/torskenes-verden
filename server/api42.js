// Prompt 42 (SERVER42): kobler sammen modulene for prompt 42 (montert i index.js).
//   Finans: Glimt-søkedatabase + /search/ask (+ /stream), filter, avanserte oppgaver + PDF, Boliger web, import rett til Boliger, aksje-logoer → finans/finans42.js (+ search42, glimt-tasks42, homes42, pdf42)
//   Finn-bilder (bare annonsens egne, felles bilder fjernes)                                                                → finans/finn42.js (+ finn-routes.js)
//   Abonnementer som innebygd kalender                                                                                     → subs-cal42.js
//   Sporing: AliExpress (mappen «AliExpress») + Cainiao, PostNord-varianter/feilsøkingslogg/reserve, /api/tracking/debug/:id   → server/sporing/ (mountSporing)
//   Gjøremål-Glimt deler opp: liste-kontrakt, prompt, lengdevakt, lokal forhåndsdeling, Angre                                → server/gjoremal/
//   Helse fra Home Assistant                                                                                                 → server/familie/
//   Vel fremme: alias /api/velfremme/* → /api/hjemlys/*, admin kan avslutte andres økt (POST /api/hjemlys/:id/end)          → server/familie/
//   Fanelinje: homeButton i /api/me/layout                                                                                    → mobile.js
export { finans42Api } from './finans/finans42.js';
export { abCalendarsMw42, abApi42, calendarsEvents42, abIcs42 } from './subs-cal42.js';


