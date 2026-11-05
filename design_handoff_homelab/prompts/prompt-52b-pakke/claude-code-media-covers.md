# Media (web): manglende covers i «Klar til å se»

## Symptom
Flere serier/filmer vises med farget plassholder i stedet for cover (f.eks. «CIA», «Line of Fire 2026», «FBI»). Samme tittel vises i tillegg en gang til med cover («CIA (2026)», «Line of Fire (2026)»).

## Årsak (sannsynlig)
Kortene uten cover bygges fra nedlastingsdata (qBittorrent/Sonarr-historikk: «S02E04 · 720p · 945 MB»). Tittelen er da parset fra filnavnet og har ingen kobling til Sonarr/Radarr/Plex-metadata, så poster-URL mangler. Kortene med cover kommer fra Plex/Sonarr med riktig ID.

## Fiks
1. Koble hver nedlasting til riktig serie/film via ID, ikke via tittel:
   - Serier: bruk `seriesId` / `episodeId` fra Sonarr-historikk (`/api/v3/history` med `includeSeries=true&includeEpisode=true`).
   - Filmer: bruk `movieId` fra Radarr-historikk (`/api/v3/history` med `includeMovie=true`).
   - qBittorrent-hash → Sonarr/Radarr `downloadId` når kun torrent er kjent.
2. Hent poster fra metadata:
   - Sonarr/Radarr: `images[]` der `coverType === "poster"`; bruk `remoteUrl`, ellers `/api/v3/mediacover/{id}/poster-250.jpg` via backend-proxy (API-nøkkel skal ikke til klienten).
   - Plex: `thumb` / `grandparentThumb` via `/photo/:/transcode?width=300&height=450&url=…` gjennom proxy.
3. Fallback-rekkefølge: Plex → Sonarr/Radarr → TMDB/TVDB (via ID) → farget plassholder med tittel (som i dag). Plassholder skal bare vises når alle feiler.
4. Slå sammen duplikater: samme `seriesId + sesong + episode` (eller `movieId`) = ett kort. Behold Plex-data (tittel med år, episodenavn, cover) og legg til kvalitet/størrelse fra nedlastingen: «S02E04 · Black Tie Optional · 720p · 945 MB».
5. Vis tittel fra metadata («CIA (2026)»), aldri parset filnavn.
6. Cache poster-URL per ID (f.eks. 24 t) og last bilder med `loading="lazy"`; ved `onerror` gå videre i fallback-rekkefølgen.

## Gjelder også
Bibliotek, Kalender og Nedlastinger — samme cover-oppslag og fallback overalt.
