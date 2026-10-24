// Prompt 47 (SERVER47), claude-code-standard-serveradresser.md – standard serveradresser for alle apper.
//
//   GET /api/config/servers  (uten innlogging)  → {publicUrl, defaults:{external}, app:'homelab', api:47}
//                            (økt eller app-token) → {publicUrl, localUrl, defaults:{external, local}, source:{publicUrl, localUrl}, app, api:47}
//   (GET /api/config er fortsatt integrasjonslista i Innstillinger – uendret.)
//     publicUrl = PUBLIC_URL (.env), ellers https://os.smarthjemexperten.no
//     localUrl  = første gyldige LOCAL_URL (.env, kommaliste), ellers http://10.69.1.39:3000 – BARE etter innlogging
//     (den interne IP-en vises aldri til den som ikke er logget inn).
//   Aliasene fra instruksene (samme tilgang som /finans/api):
//     POST /api/finans/kvitteringer/ocr → POST /finans/api/receipts/ocr-text
//     POST /api/finans/kvitteringer     → POST /finans/api/receipts/parsed
// Adresseinnstillingene per konto (synk mellom enheter) ligger fortsatt i GET/PUT /api/me/server (auth41.js), som nå også
// gir defaults og godtar {reset:true} («Tilbakestill til standard»).
// Passordregelen er uendret: om en forespørsel er «lokal» avgjøres av serveren fra tilkoblingen, aldri av disse verdiene.
import { cleanUrl46, isInternalIp46 } from './public-url46.js';
import { sessionUser, userInfo } from './auth.js';
import { tokenAccessOf } from './finans/routes.js';

export const DEFAULT_PUBLIC_URL47 = 'https://os.smarthjemexperten.no';
export const DEFAULT_LOCAL_URL47 = 'http://10.69.1.39:3000';

const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };

/** Serverens standardadresser: env (PUBLIC_URL/LOCAL_URL) eller de faste standardverdiene. Aldri Docker-/loopback-adresser. */
export function serverUrls47() {
  const envPub = cleanUrl46(process.env.PUBLIC_URL);
  const pub = envPub && !isInternalIp46(hostOf(envPub)) ? envPub : null;
  const loc = String(process.env.LOCAL_URL ?? '').split(',').map(cleanUrl46).find((x) => x && !isInternalIp46(hostOf(x))) ?? null;
  return {
    publicUrl: pub ?? DEFAULT_PUBLIC_URL47,
    localUrl: loc ?? DEFAULT_LOCAL_URL47,
    source: { publicUrl: pub ? 'env' : 'default', localUrl: loc ? 'env' : 'default' },
  };
}

/** Innlogget med økt eller et gyldig app-token (hvilken som helst tilgang)? */
function signedIn(c) {
  const sid = sessionUser(c);
  if (sid && userInfo(sid)) return true;
  try { return !!tokenAccessOf(c); } catch { return false; }
}

export function mountServer47(app) {
  // NB: GET /api/config (uten sti) er integrasjonslista i Innstillinger (index.js) – adressene ligger på egen sti.
  app.get('/api/config/servers', (c) => {
    const u = serverUrls47();
    const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie, Authorization' };
    if (!signedIn(c)) return c.json({ publicUrl: u.publicUrl, defaults: { external: u.publicUrl }, app: 'homelab', api: 47 }, 200, headers);
    return c.json({ publicUrl: u.publicUrl, localUrl: u.localUrl, defaults: { external: u.publicUrl, local: u.localUrl }, source: u.source, app: 'homelab', api: 47 }, 200, headers);
  });

  // Aliasene fra Android-/iOS-instruksene → FinansHub-rutene (samme tilgangskontroll der).
  const forward = async (c, path) => {
    const url = new URL(c.req.url);
    url.pathname = `/finans/api${path}`;
    return app.fetch(new Request(url, { method: 'POST', headers: c.req.raw.headers, body: await c.req.arrayBuffer() }), c.env);
  };
  app.post('/api/finans/kvitteringer/ocr', (c) => forward(c, '/receipts/ocr-text'));
  app.post('/api/finans/kvitteringer', (c) => forward(c, '/receipts/parsed'));
}
