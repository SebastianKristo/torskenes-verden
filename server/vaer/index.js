// Vær: monterer rutene under /api/weather som ikke ligger i mobile.js. server/index.js kaller mountVaer(app) der de gamle
// monteringene sto (før mobileApi, som har /weather/full, /compare, /places og /search, og før api36 med /weather/places/summary).
// Rekkefølgen er bærende: skiMw må stå før handleren for /api/weather/full i mobile.js, fordi den legger på ski etter next().
// Filene:
//   met.js          – værmeldingen fra MET (Locationforecast, Nowcast, Sunrise), buildWeather er ren og testbar, sunTime
//   full.js         – værappen (MET/yr med Open-Meteo som reserve), steder, sammenligning Yr/ECMWF, månefase
//   place-search.js – stedssøket (Open-Meteo, foldet tekst og Nominatim)
//   place.js        – været for et hvilket som helst sted (/api/weather/place, Glimt, Chat, web-søket)
//   here.js         – «Min posisjon»: enhetens posisjon for Hjem/brief og /api/weather/here
//   week-summary.js – «Glimt · ukas vær» (/api/weather/week-summary)
//   week-glimt.js   – ukesvær med ekte ukesdata til Glimt og Chat, og skiføre (ski41)
//   layout.js       – Rediger Vær (/api/weather/layout) og skiføre i /api/weather/full
//   sun.js          – dagslys, soloppgang og solnedgang regnet lokalt
import { weather45Api } from './here.js';
import { week39Api } from './week-summary.js';
import placeApi from './place.js';
import { layoutApi, skiMw } from './layout.js';

export function mountVaer(app) {
  app.route('/api/weather', weather45Api); // GET /here (Min posisjon)
  app.route('/api/weather/week-summary', week39Api); // Glimt · ukas vær
  app.route('/api/weather/place', placeApi); // været for et sted
  app.use('/api/weather/full', skiMw); // ski i værappen (før handleren i mobile.js)
  app.route('/api/weather', layoutApi); // GET/PUT /layout (Rediger Vær)
}
