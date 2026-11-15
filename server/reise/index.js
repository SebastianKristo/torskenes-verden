// Reise: Min reise (forhåndsruter, «forlot skolen», alternativ ved forsinkelse), skolesoner og skolested. server/index.js kaller
// mountReise(app) der /api/ruter sto (etter Kalender-forsiden, før de innebygde kalenderne). Avgangene og stoppestedsøket
// (/api/ruter/departures, /api/ruter/search) ligger i mobile.js og den gamle GET /api/ruter (reiseplanen) i index.js (authed);
// de står etter denne monteringen og er ikke flyttet.
// Logikken og rutene ligger i ruter.js; Familie (henting, steder, Vel fremme) og Glimt bruker funksjonene derfra.
import { ruter41Api } from './ruter.js';

export function mountReise(app) {
  app.route('/api/ruter', ruter41Api); // sesjon eller app-token, alt per bruker
}
