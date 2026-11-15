// Studie: dokumenter (vitnemål, karakterutskrift, attest …) og Studie-oversikten. Bare eieren ser dokumentene (per bruker).
// server/index.js kaller to monteringer, fordi rekkefølgen er bærende:
//   mountStudieFrames(app)  tidlig, FØR secureHeaders: mellomvaren kjører da etter den og erstatter den globale
//                           frame-ancestors 'none' for originalen (PDF/bilde), så den kan vises i appen/web (iframe/WebView fra
//                           samme opprinnelse). Andre opprinnelser kan fortsatt ikke ramme den inn.
//   mountStudie(app)        der /api/study sto (etter profilene, før admin- og mobil-rutene på /api).
// /api/studie/docs er det eldre aliaset for /api/study/documents (server/http/aliases.js).
// Filene:
//   documents.js  rutene, lagring (kryptert), snitt og studiepoeng (regnes her, aldri av modellen), oversikten
//   extract.js    tekst fra PDF (poppler eller innebygd leser med ToUnicode), skannede sider og HEIC, linjetolkeren
//   tables.js     tabeller med posisjon (pdftotext -bbox), OCR-bokser og visjon i striper
//   grades.js     karakter, fagkode og fagnavn valideres i kode
import { study44Api } from './documents.js';

const STUDY_FILE = /^\/api\/(?:study\/documents|studie\/docs)\/\d+\/(?:file|thumb)$/;

export function mountStudieFrames(app) {
  // Bare eieren får fila (ruten sjekker det); her settes bare rammereglene for et vellykket svar.
  app.use('/api/*', async (c, next) => {
    await next();
    if (!STUDY_FILE.test(c.req.path) || c.res.status !== 200) return;
    const ct = c.res.headers.get('content-type') ?? '';
    const viewable = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))\b/i.test(ct);
    c.res.headers.set('Content-Security-Policy', viewable ? "frame-ancestors 'self'" : "default-src 'none'; sandbox; frame-ancestors 'self'");
    c.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
  });
}

export function mountStudie(app) {
  app.route('/api', study44Api); // /study/documents, /studie/docs, /study/overview
}
