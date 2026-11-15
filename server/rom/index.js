// Rom: dagens rombilde (NASA APOD), Mars-roverne og satellittene. server/index.js kaller mountRom(app) der /api/space og /api/rom
// sto (etter Bursdager, før widgetene). /api/space/* er formen web bygger mot og må stå før authed sine eldre /space-ruter i
// index.js (GET /api/space/apod uten ?days= faller gjennom til dem). /api/rom er det eldre aliaset (server/http/aliases.js).
// Logikken og rutene ligger i space.js. Mars-varselet går via server/jobs/ (rom.mars); startRom() tar første sjekk etter ett minutt.
import romApi, { spaceApi, startSpaceScheduler } from './space.js';

export function mountRom(app) {
  app.route('/api/space', spaceApi); // /tle?group=, /apod?days=7, /mars
  app.route('/api/rom', romApi); // APOD (7 dager), Mars-rovere, satellitter (SGP4), innstillinger; NASA-nøkkelen blir på serveren
}

export const startRom = startSpaceScheduler;
