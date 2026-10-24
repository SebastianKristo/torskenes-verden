// Ekstra (kartlegging 2.3): små bokstaver, «været» to ganger, «imorgen» i ett ord. Skal IKKE gi kalendersvar
// (i dag: «TRE1400 Forelesning er tirsdag 27. oktober kl. 14.30»).
import { checkWeather } from './_weather.mjs';
export default {
  id: '16-vaer-ikke-kalender', title: 'vær oslo neste time og new york imorgen (ikke kalender)', area: 'vær',
  seed: { calendar: ['forelesning-oslomet', 'frisor'] },
  async run(h, ck) { checkWeather(h, await h.ask('hvordan er været i oslo neste time og været i new york imorgen'), ck); },
};
