// Sporing: monterer alle rutene under /api/tracking. server/index.js kaller mountSporing(app) der de gamle monteringene sto,
// fordi rekkefølgen er bærende (Hono kjører handlere og mellomvare i registreringsrekkefølge):
//   1. accounts.js            – /sources46 og /accounts/:src/{start,finish,sync} (Posten/Bring- og PostNord-konto)
//   2. aliexpress-debug.js    – /postnord/health (sesjon eller app-token), så /debug/:id og /aliexpress bak userGuard
//   3. household-keys-routes  – /keys (husstandens sporingsnøkler) før /:id i shipments.js
//   4. shipments.js           – pakkene: liste, widget, gjenkjenning, legg til, endre, slett
// Filene:
//   shipments.js        – pakker fra Finn, e-post og manuelt (hl_shipments), statusoppdatering, varsler, widget/mobil-utdrag
//   carriers.js         – transportørene: gjenkjenning av nummer, sporingslenker og API-klientene
//   carrier-apps.js     – app-verdiene for Posten, Bring og PostNord (Q22), med overstyring fra miljøet
//   accounts.js         – innlogging på Posten/Bring- og PostNord-kontoen og innboksen derfra
//   household-keys.js   – husstandens delte sporingsnøkler (kryptert), kvoter; household-keys-routes.js er rutene
//   aliexpress-debug.js – AliExpress fra e-postmappen, Cainiao og PostNord-feilsøking
import trackingApi from './shipments.js';
import { tracking46Api } from './accounts.js';
import { tracking42Api } from './aliexpress-debug.js';
import trackingKeysApi from './household-keys-routes.js';

export function mountSporing(app) {
  app.route('/api/tracking', tracking46Api); // /sources46, /accounts/:src/{start,finish,sync}
  app.route('/api/tracking', tracking42Api); // /postnord/health, /debug/:id (+ /test), /aliexpress (mappe, sjekk nå, e-post)
  app.route('/api/tracking/keys', trackingKeysApi); // husstandens sporingsnøkler (før /api/tracking/:id)
  app.route('/api/tracking', trackingApi); // pakker fra Finn, e-post og manuelt
}
