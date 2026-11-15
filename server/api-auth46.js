// Prompt 46 (SERVER46), claude-code-media-mobil-utlogget-2.md – Media sier «Utlogget» på mobil (andre gang), serverdelen.
//
// Den ekte årsaken (funnet sammen med IOS46/ANDROID46, se apps/ios/FinansHub/Sources/Media46.swift):
//   index.js monterer `authed` (authed.use('*', requireAuth)) på /api til slutt. requireAuth godtar bare økt-cookie, så ALLE
//   /api-stier som ingen rute har, svarte 401 «Ikke innlogget» til appene (Bearer) – men 404 til web (cookie). Media prøver eldre
//   og alternative stier først (/media/qbit/torrents før /media/torrents osv.) og går videre ved 404. På mobil ble første sti en
//   401, og appen viste «Utlogget fra Homelab» selv om tokenet var gyldig. Forrige rettelse (prompt 44) endret bare tekstene.
//   I tillegg: plakater (<img>/AsyncImage uten Authorization) fikk 401, og en 401 fra Homelab kunne ikke skilles fra andre feil.
//
// Nå:
//   - bearerFallthrough46(authed): gyldig app-token mot en sti som ikke finnes → 404 {error, code:'NOT_FOUND'}. Gyldig app-token mot
//     en rute som bare finnes for nettleseren → 401 {code:'SESSION_REQUIRED'} (ikke «utlogget»). Ingen/ugyldig innlogging → 401
//     {error:'Ikke innlogget', code:'HOMELAB_AUTH', reason:'none'|'invalid'}.
//   - Media-delen (401 → code:'HOMELAB_AUTH', signerte bilde-URL-er og diagnosen per kall) ligger i server/media/middleware.js.
import { Hono } from 'hono';
import { sessionUser } from './auth.js';
import { tokenAccessOf } from './finans/routes.js';

/* ---------------- Ukjente /api-stier med app-token → 404 ---------------- */

let probe = null, probeSize = -1;
function buildProbe(app) {
  const p = new Hono();
  for (const r of app.routes) {
    if (r.method === 'ALL' && (r.path === '/*' || r.path === '*')) continue; // use('*')-mellomvare
    try { p.on(r.method === 'ALL' ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] : r.method, r.path, (c) => c.body(null, 299)); } catch { /* ugyldig mønster */ }
  }
  return p;
}
/** Finnes det en rute i app for metode + sti (stien relativ til monteringen)? */
export async function routeExists46(app, method, path) {
  if (!probe || probeSize !== app.routes.length) { probe = buildProbe(app); probeSize = app.routes.length; }
  const r = await probe.request(`http://intern${path}`, { method: method === 'HEAD' ? 'GET' : method });
  return r.status === 299;
}
/** Mellomvare før requireAuth i `authed` (montert på /api). */
export function bearerFallthrough46(app, mount = '/api') {
  return async (c, next) => {
    if (sessionUser(c)) return next();
    const hasAuth = !!c.req.header('authorization');
    const a = hasAuth ? tokenAccessOf(c) : null;
    if (!a || a.session) {
      return c.json({ error: 'Ikke innlogget', code: 'HOMELAB_AUTH', reason: hasAuth ? 'invalid' : 'none' }, 401, { 'Cache-Control': 'no-store' });
    }
    c.set('user', a.user); // for diagnosen (mediaDiag46)
    const rel = c.req.path.startsWith(mount) ? c.req.path.slice(mount.length) || '/' : c.req.path;
    if (!(await routeExists46(app, c.req.method, rel))) return c.json({ error: `Finnes ikke på serveren: ${c.req.method} ${c.req.path}`, code: 'NOT_FOUND' }, 404, { 'Cache-Control': 'no-store' });
    return c.json({ error: 'Denne funksjonen krever innlogging i nettleseren', code: 'SESSION_REQUIRED' }, 401, { 'Cache-Control': 'no-store' });
  };
}
