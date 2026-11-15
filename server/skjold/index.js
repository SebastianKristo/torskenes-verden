// Skjold Lab (sorteringsskapet): alt under /api/skjold, per bruker, sesjon eller app-token. server/index.js kaller mountSkjold(app)
// der /api/skjold sto (etter de andre /api/glimt/*-rutene, før mountGlimt). Bildene ligger i DATA_DIR/skjold76 (navnet på datamappa
// er beholdt).
// Filene:
//   routes.js        Hono-appen: skap, skuffer, deler, søk, bilder, historikk, papirkurv, CSV, etiketter; monterer resten
//   store.js         tabellene (skj_*), FTS5-søket og formen på delene
//   images.js        opplasting og signerte bilde-URL-er (skalering og EXIF-rydding med ImageMagick)
//   image-search.js  «Finn bilde» (SearXNG, Wikimedia Commons som reserve) med kryptert kandidat-id og proxy
//   ai.js            smarte forslag, bildesøk og «Rydd opp» (via ai-run)
//   decode.js        rene dekodere: fargebånd, SMD- og kondensatorkoder, enheter, navnemal og kategorier
//   leds.js          LED over hver skuff (WLED på en ESP32)
//   layout.js        sammenslåtte skuffer og forhåndsoppsettet «Skjold Lab-hylla (3D-print)»
//   picklist.js      plukkliste
//   projects.js      produkter: sjekk ut og inn deler
//   csv.js           CSV inn og ut
//   labels.js        utskriftssiden med etiketter
//   glimt.js         skjold.find i Glimt og «Deler» i felles søk
import { skjoldApi76 } from './routes.js';

export function mountSkjold(app) {
  app.route('/api/skjold', skjoldApi76);
}
