// Bilder: felles bildeverktøy og Google Photos-album som bakgrunn. server/index.js kaller mountBilder(app) der /api/bg/gphoto sto
// (før mobileApi sin /api/bg/:file, ellers ville «gphoto» blitt tolket som et filnavn). Albumene hentes på nytt via server/jobs/
// (bilder.gphoto).
// Filene:
//   gphoto.js   delte Google Photos-album: henting med SSRF-vern, lokal cache per bruker, bildet for denne timen; guardedGet46
//               brukes også av Media (NRK, Yubal)
//   convert.js  ImageMagick-verktøy: nedskalert JPEG uten metadata, WebP-miniatyr, filtype og størrelse (Chat, kvitteringer,
//               Skjold Lab)
// Logobiblioteket for butikker ligger i server/logos/.
import { gphoto46Api } from './gphoto.js';

export function mountBilder(app) {
  app.route('/api/bg', gphoto46Api); // /api/bg/gphoto: sesjon eller app-token, per bruker
}
