# Media: plakater og bilder for serier og filmer skal vises med en gang

Ønske 2026-10-24: «bildne for serier og filmer bruker også gansje lang tid på å laste seg inn, jeg vil se de medengagn»

Gjelder Media-listen, detaljsiden, Glimt-kort med serier og filmer, og Hjem. Alle plattformer: iOS, Android, web og Mac.

## Mål sårsaken først
Logg tid per bilde: forespørsel → første byte → ferdig → vist. Sjekk spesielt:
- Hentes bildene fra Sonarr/Radarr `MediaCover` i full størrelse (ofte 1–3 MB per plakat) eller direkte fra TMDB/TVDB over nett?
- Går hvert bilde gjennom serveren med API-nøkkel uten cache-headere, slik at alt lastes på nytt hver gang?
- Lastes bildene først etter at hele listen er hentet, eller ett og ett i serie?
- Ekstern adresse hjemme i stedet for lokal (`claude-code-standard-serveradresser.md`)?

## Server: egen bilde-endepunkt med cache
`GET /api/media/bilde/{type}/{id}/{variant}?w=…`
- `type`: serie | film. `variant`: poster | fanart | banner.
- Henter fra Sonarr/Radarr (`/MediaCover/{id}/poster.jpg`) eller TMDB, og **skalerer ned** til faste bredder: 160, 320, 640 (poster) og 1280 (fanart). Lagres som WebP (AVIF der klienten støtter det), kvalitet ca. 75.
- Lagres på disk (`/data/cache/media-bilder/`), med nøkkel id + variant + bredde + `lastModified` fra Sonarr/Radarr. Bildet hentes bare på nytt når plakaten er endret.
- Headere: `Cache-Control: public, max-age=31536000, immutable` med versjon i URL-en (`?v=<hash>`), og `ETag`.
- **Forhåndsgenerer** i bakgrunnen: alle plakater i biblioteket ved oppstart og når nye serier eller filmer legges til (Sonarr/Radarr webhook `SeriesAdd`/`MovieAdded`/`Grab`).
- Lag også en **blurhash/ThumbHash** per plakat. Den sendes med i liste-API-et (`/api/media/...` → `poster: { url, hash, w, h }`).

## Klient: vis noe umiddelbart
1. **Plassholder fra hash:** tegn ThumbHash/blurhash i plakatens farger med én gang listen kommer. Ingen grå bokser og ingen hopp i layout. Fast størrelse er 2:3.
2. **Riktig størrelse:** be om den bredden som trengs (skjermbredde × pikseltetthet): 320 i listen og 640 på detaljsiden. Bruk `srcset` på web.
3. **Disk- og minnecache på klienten:**
   - iOS/Mac: Nuke eller Kingfisher med diskcache (≥ 300 MB), eller `URLCache` med stor diskdel.
   - Android: Coil med `diskCache` (≥ 300 MB) og `memoryCache`.
   - Web: lag en service worker med cache-first for `/api/media/bilde/`.
4. **Forhåndslasting:** last plakatene for de neste 2 radene før brukeren scroller dit. Åpner brukeren en serie, vises plakaten fra listen med en gang mens fanart lastes.
5. **Prioritet:** synlige bilder først (`fetchpriority="high"` / høy prioritet i bildelasteren). Avbryt lasting for bilder som er scrollet forbi.
6. **Uten nett:** cachede plakater vises fortsatt.

## Krav
- Plakat synlig (eller hash-plassholder i riktige farger) innen **100 ms** etter at listen vises. Ekte bilde innen **300 ms** fra cache, innen **1 s** første gang på lokalt nett.
- Andre gang Media åpnes: alle synlige plakater kommer fra cache, uten nettverkskall.

## Test
- Kald start med tom klientcache, lokalt og på 5G: mål tid til første og siste synlige plakat.
- Rask scrolling gjennom 300 serier: ingen hakking, og ingen bilder som blinker eller bytter plass.
- Ny serie lagt til i Sonarr: plakaten er klar i cache før den vises i appen.
- Plakat endret i Sonarr: ny plakat vises, og den gamle brukes ikke fra cache.
