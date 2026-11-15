// Nyheter: nyhetsleseren (RSS/Atom per bruker), egne kategorier og «For deg», Glimt-siden og lagrede artikler. server/index.js
// kaller mountNyheter(app) der /api/rss sto (etter Mat, før ikonene). /api/news/saved, /api/news og /api/glimt/news-digest sto
// lenger ned i index.js, men ingen rute eller mellomvare mellom de gamle plassene svarer på de stiene, så rekkefølgen for dem er
// den samme. Innenfor monteringen er rekkefølgen bærende:
//   1. GET /api/rss/favicon er offentlig (bare domener fra en brukers kildeliste), derfor før /api/rss med innlogging.
//   2. /api/news/saved før /api/news (Glimt-siden).
// Kildene hentes via server/jobs/ (nyheter.rss); startNyheter() tar første runde 15 s etter oppstart.
// Filene:
//   rss.js         kildene, hentingen, sakene, artikkelvisningen, ✦ AI-sammendrag og -kategorisering, newsFor (brief og mobil)
//   categories.js  egne kategorier, interesser og «For deg», sammendrag per kategori, favicon, Innstillinger → Nyheter (i /api/rss)
//   glimt.js       Nyheter · Glimt-siden (langt sammendrag med referanser og bilder)
//   saved.js       lagrede artikler offline, med SSRF-vernet guardedGet73 (brukes også av Skjold Lab og lokale verter)
import rssApi, { startRssWorker } from './rss.js';
import { faviconHandler46 } from './categories.js';
import { news40Api, newsDigestApi } from './glimt.js';
import { news73Api } from './saved.js';

export function mountNyheter(app) {
  app.get('/api/rss/favicon', faviconHandler46); // offentlig, bare domener fra kildelistene
  app.route('/api/rss', rssApi); // nyhetsleseren, sesjon eller app-token
  app.route('/api/news/saved', news73Api); // lagrede artikler (offline, SSRF-vern)
  app.route('/api/news', news40Api); // Nyheter · Glimt-siden
  app.route('/api/glimt/news-digest', newsDigestApi); // samme som POST /api/news/glimt
}

export const startNyheter = startRssWorker;
