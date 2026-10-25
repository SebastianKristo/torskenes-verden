// Prompt 50 (SRVCHAT50): «Les på nytt» / «✦ Analyser på nytt» av kvitteringer uten 502 (claude-code-kvittering-les-pa-nytt-502.md).
//
// Rotårsaker (fra koden, se rapporten / SERVER50-API.md):
//   1. POST /receipts/:id/reanalyze uten async (web «✦ Glimt leser kvitteringen på nytt», PWA «Les på nytt», /transactions/:id/reread,
//      Boliger) holdt HTTP-forespørselen åpen hele lesingen: Gemini 20 s × nøkler + sumkontroll + nye forsøk → over proxyens tidsgrense
//      (Caddy/nginx/Traefik/Cloudflare-tunnel 30–100 s) → proxyen svarer 502 uten JSON, og appen viser «Feil 502 (HTTP 502)».
//   2. reanalyzeRun sendte ORIGINALFILEN i full oppløsning (r.file, ikke den nedskalerte r.scan som første lesing bruker): 5–15 MB / 4000+ px
//      base64 i én JSON-forespørsel til Gemini (≈ +33 %) – treg opplasting, Gemini-grensen på ~20 MB og minnetopp i Node.
//   3. API-et svarte selv 502 for ALLE motorfeil (`status: e.missing ? 501 : 502`), også når modellen var nede eller tok for lang tid –
//      umulig å skille fra proxyens 502 i appen.
// Fiks: nedskaler til lengste side 2048 px (JPEG 85, rotert etter EXIF; «Les mindre versjon» = 1280 px) før modellen, svar alltid som
// jobb når klienten ber om det (og etter maks SYNC_MAX_MS ellers), og tydelige feilkoder:
//   404 bilde_mangler · 503 modell_utilgjengelig · 504 tidsavbrudd · 422 ulesbar · 400 gemini_mangler · 409 opptatt · 500 ukjent.
import { toJpeg50 } from '../img50.js';

export const REREAD50 = { maxPx: 2048, smallPx: 1280, quality: 85, syncMaxMs: Number(process.env.REANALYZE_SYNC_MAX_MS ?? 25_000) };
export const _reread50 = REREAD50; // tester

const RESIZABLE = /^image\/(jpeg|png|webp|heic|heif|gif|tiff|bmp)$/;
/** Bildet slik modellen får det: nedskalert JPEG (originalen på disk røres ikke). PDF/tekst og ukjent → uendret. */
export async function modelImage50(img, mime, { small = false, maxSide = null } = {}) {
  if (!RESIZABLE.test(mime ?? '')) return { img, mime, resized: false };
  // maxSide (iOS): lengste side 512–2048 px; small = 1280 px; ellers 2048 px.
  const max = Number.isFinite(+maxSide) && +maxSide > 0 ? Math.min(REREAD50.maxPx, Math.max(512, Math.round(+maxSide))) : small ? REREAD50.smallPx : REREAD50.maxPx;
  if (maxSide) small = small || max < REREAD50.maxPx;
  const j = await toJpeg50(img, max, small ? 80 : REREAD50.quality).catch(() => null);
  if (!j || (j.buf.length >= img.length && mime === 'image/jpeg' && !small)) return { img, mime, resized: false };
  return { img: j.buf, mime: 'image/jpeg', resized: true, w: j.w ?? null, h: j.h ?? null, fromKb: Math.round(img.length / 1024), toKb: Math.round(j.buf.length / 1024) };
}

export const KODER50 = {
  bilde_mangler: { status: 404, text: 'Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.' },
  modell_utilgjengelig: { status: 503, text: 'Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.' },
  tidsavbrudd: { status: 504, text: 'Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.' },
  ulesbar: { status: 422, text: 'Glimt fikk ikke lest kvitteringen. Prøv igjen, eller les en mindre versjon.' },
  gemini_mangler: { status: 400, text: 'Legg inn en Gemini-nøkkel under Innstillinger → AI-motor for å analysere på nytt.' },
  opptatt: { status: 409, text: 'Kvitteringen leses allerede.' },
  ukjent: { status: 500, text: 'Noe gikk galt.' },
};

/** Motorfeil → {status, kode, error}. Aldri 502 (det betyr «proxyen fikk ikke svar» og skal bare komme fra proxyen). */
export function classify50(e, label = 'Lokal AI') {
  const msg = String(e?.message ?? e ?? '');
  const st = Number(e?.status) || 0;
  let kode;
  if (e?.missingOriginal || e?.code === 'ENOENT') kode = 'bilde_mangler';
  else if (e?.timeout || e?.name === 'TimeoutError' || /tidsfrist|svarte ikke innen|timed? ?out/i.test(msg)) kode = 'tidsavbrudd';
  else if (/nøkkel mangler/i.test(msg)) kode = 'gemini_mangler';
  else if (e?.net || e?.missing || e?.blocked || st === 429 || st >= 500 || /kan ikke nås|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|utilgjengelig|ikke installert|quota|kvote|overloaded|unavailable|finnes ikke lenger/i.test(msg)) kode = 'modell_utilgjengelig';
  else if (st === 413 || /too large|for stor|payload|request entity/i.test(msg)) kode = 'tidsavbrudd'; // for stort bilde: samme råd («Les mindre versjon»)
  else if (/JSON|tomt svar|ugyldig|validering|kunne ikke lese/i.test(msg) || (st >= 400 && st < 500)) kode = 'ulesbar';
  else kode = 'ukjent';
  return { status: KODER50[kode].status, kode, error: `${label} kunne ikke lese kvitteringen: ${msg}`.slice(0, 400), melding: KODER50[kode].text };
}
