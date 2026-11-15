// Auth-domenet: brukere og økter (session.js), pålitelige enheter, 2FA (totp.js, two-factor.js), app-innlogging for Kalender
// (app-login.js, refresh.js), QR-innlogging (qr-login.js), passkeys og sikkerhet (security.js, webauthn.js), sperrer
// (rate-limit.js), serverhemmeligheten (server-secret.js, secret-rekey.js) og serverens adresser (server-address.js).
//
// Rekkefølgen i server/index.js er bærende, så domenet monteres på fire steder (samme steder som før Fase 2b):
//   1. mountAuthSecurity – rett etter «Logg inn som» og body-grensen. Mellomvaren (revisjon, godkjenning av nye enheter, sperrer for
//      QR og app-token) må stå foran innloggingsrutene. Også /api/auth/passkey/* og /api/security51/*.
//   2. mountAppAuth – /api/discovery, /api/me/server, Kalender-innlogging og /app-auth. Før /finans/api, fordi mellomvaren rundt
//      /finans/api/auth/logout tilbakekaller Kalender-tokenene til den som logger ut av Homelab-appen.
//   3. mountAuthRefresh – POST /api/auth/refresh og POST /api/apps/kalender/log (etter observabiliteten, som før).
//   4. mountAuth – passord, 2FA-steg og -oppsett, reauth, QR, førstegangsoppsett og utlogging.
import { mountSecurity } from './security.js';
import { mountAppLogin } from './app-login.js';
import { auth44Api } from './refresh.js';
import { mountLogin } from './login.js';

export const mountAuthSecurity = (app) => mountSecurity(app);
export const mountAppAuth = (app) => mountAppLogin(app);
export const mountAuthRefresh = (app) => { app.route('/api', auth44Api); };
export const mountAuth = (app) => mountLogin(app);
