// Media på serveren: alle ruter under /api/media/*, /api/playback/* og /api/medctl51/* monteres herfra, i den rekkefølgen
// lagene forventer (mellomvarene som etterbehandler svar må registreres før rutene de gjelder).
//
//   middleware.js  401 → code:'HOMELAB_AUTH', signerte bilde-URL-er, diagnose per kall (GET /api/media/diag)
//   servers.js     sted (?server=) for hele /api/media, søk i biblioteket, flere servere, søk som jobb, slett fil
//   nrk.js         NRK-nedlaster (/api/media/nrk/*)
//   yubal.js       Musikk (/api/media/yubal/*)
//   images.js      /bilde (diskcache, ThumbHash), sporing etter søk, diagnostikk, start stoppede torrenter
//   unmonitored.js uovervåkede filer (/api/media/unmonitored*)
//   playback.js    Avspilling: Plex/Jellyfin, PIN-flyt, historikk, statistikk, sammendrag
//   arr.js         Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, webhooks, varsler, kalenderkilden «Media»
//   control.js     mediekontroll (/api/medctl51/*)
//   mock.js        innebygd Sonarr/Radarr/qBittorrent/Prowlarr for MOCK_DATA=1
//
// index.js kaller mountMedia(app, …) én gang, på stedet der Media-rutene alltid har stått (etter /api/upcoming og /api/news,
// før resten av domenene). Plex/Jellyfin-rutene /now, /recent og /history bruker integrasjonsklienten i index.js (ekte eller
// mock), så den sendes inn.
import { authOrToken } from '../mobile.js';
import { homelabAuthCode46, signImages46, mediaDiag46, mediaDiagOut46 } from './middleware.js';
import { media44Api, mediaSiteMw44, librarySearchMw44, legacyMedia44 } from './servers.js';
import { nrkApi } from './nrk.js';
import { yubalApi } from './yubal.js';
import { mountMedia50 } from './images.js';
import { media45Api } from './unmonitored.js';
import { playback44Api } from './playback.js';
import { media43Api } from './arr.js';
import { mountMedctl51 } from './control.js';

/**
 * @param {import('hono').Hono} app
 * @param {{now: Function, recent: Function, history: Function, poster: (src: string, id: string) => Promise<{body, type}|null>}} plex
 *   now/recent/history er ferdige Hono-handlere (personlige integrasjoner, ISO2); poster henter et bilde fra Plex/Jellyfin.
 */
export function mountMedia(app, plex) {
  // Prompt 46: hvert Media-kall logges (GET /api/media/diag), 401 får code:'HOMELAB_AUTH', bilde-URL-er signeres.
  app.use('/api/media/*', mediaDiag46, homelabAuthCode46, signImages46);
  app.use('/api/playback/*', mediaDiag46, homelabAuthCode46, signImages46);
  app.get('/api/media/diag', authOrToken, (c) => c.json(mediaDiagOut46(c.get('user')), 200, { 'Cache-Control': 'no-store' }));
  // Prompt 44: valgt sted (?server= eller brukerens valg) for hele /api/media og søk i biblioteket.
  app.use('/api/media/*', mediaSiteMw44);
  app.use('/api/media/series', librarySearchMw44);
  app.use('/api/media/movies', librarySearchMw44);
  app.route('/api/media/nrk', nrkApi); // før arr.js, som eier resten av /api/media
  app.route('/api/media/yubal', yubalApi);
  mountMedia50(app); // /bilde, /track, /diagnostics, /torrents/:hash/start + posterImg/track i svarene (før de eldre rutene)
  app.route('/api/media', media45Api); // uovervåkede filer
  // Plex/Jellyfin («Spilles nå», «Nylig lagt til», historikk): serverens oppsett for alle med tilgang som ikke har egne verdier.
  app.get('/api/media/now', authOrToken, legacyMedia44(plex.now));
  app.get('/api/media/recent', authOrToken, legacyMedia44(plex.recent));
  app.get('/api/media/history', authOrToken, legacyMedia44(plex.history));
  app.get('/api/media/poster', authOrToken, async (c) => {
    try {
      const img = await plex.poster(c.req.query('src'), c.req.query('id'));
      if (!img) return c.notFound();
      return c.body(img.body, 200, { 'Content-Type': /^image\//.test(img.type) ? img.type : 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    } catch (e) { console.warn('[media/poster]', e.message); return c.body(null, 502); }
  });
  app.route('/api/media', media44Api); // /servers, /release/search (jobb + SSE), /episodes/:id/file, /movies/:id/file
  app.route('/api/playback', playback44Api); // Avspilling (Plex/Jellyfin, PIN-flyt, historikk, statistikk)
  app.route('/api/media', media43Api); // Sonarr, Radarr, qBittorrent, Prowlarr, Glimt, webhooks – etter /now, /recent, /history og /poster
  mountMedctl51(app); // /api/medctl51/now og /api/medctl51/sessions/:id/:action (egen prefiks, rekkefølgen er fri)
}
