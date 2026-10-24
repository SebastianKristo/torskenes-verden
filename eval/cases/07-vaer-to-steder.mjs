// Oppdrag test 7: to deloppgaver med hvert sitt sted og hver sin tid. Kalenderen har en felle: «TRE1400 Forelesning» på OsloMet.
import { checkWeather } from './_weather.mjs';
export default {
  id: '07-vaer-to-steder', title: 'Vær Oslo neste time + New York i morgen', area: 'vær',
  seed: { calendar: ['forelesning-oslomet', 'frisor'] },
  async run(h, ck) { checkWeather(h, await h.ask('Hvordan er været i Oslo neste time og i New York i morgen?'), ck); },
};
