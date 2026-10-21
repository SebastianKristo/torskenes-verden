# Media (mobilappen): står «ikke logget inn» selv om alt er koblet til

Ønske 2026-10-21: «feil med media på mobil, alt er logget inn på web og funker men står ikke logget inn på mobil appen, men innstillinger på mobil sier innlogget»

## Symptom
- Web: Sonarr, Radarr, qBittorrent, Prowlarr (og Plex) virker.
- Mobilappen → Innstillinger → Integrasjoner: «Koblet til».
- Mobilappen → Media: «Ikke logget inn» / «Koble til» for tjenestene.

## Sannsynlige årsaker (sjekk i denne rekkefølgen)
1. **Media-skjermen leser egen lokal tilstand** (f.eks. \`media_connected\` / gammel nøkkel i AsyncStorage/DataStore fra en tidligere versjon) i stedet for serverens integrasjonsstatus. Innstillinger leser serveren og viser riktig.
2. **Appen kaller tjenestene direkte** (\`sonarr.lan:8989\` med API-nøkkel) i stedet for gjennom Homelab-backend. På mobil utenfor hjemmenettet (eller med ekstern adresse) svarer de ikke, og feilen vises som «ikke logget inn».
3. **Feil server valgt:** etter «to servere per tjeneste» er \`media_site\` tom eller peker på «Hytta» på mobil, men bare «Hjemme» er satt opp.
4. **401 fra backend** fordi Media-kallene ikke sender appens innloggings-token (eget HTTP-klient-oppsett uten interceptor), eller token er utløpt og ikke fornyes (se \`claude-code-kalender-ipad-topp-innlogging-hastighet.md\`, punkt 3).

## Retting
- **Én kilde:** Media henter status fra \`GET /api/integrations/status\` (samme som Innstillinger), med felt per tjeneste og server: \`{service, site, connected, lastOk, error}\`. Ingen egen lokal «innlogget»-flagg. Slett gamle nøkler ved oppstart (migrering).
- **Alt går via backend:** mobilappen kaller \`/api/media/*\` på Homelab-serveren med vanlig innloggings-token. Backend har API-nøklene og snakker med Sonarr/Radarr/qBit/Prowlarr/Plex. Aldri API-nøkler i appen.
- **Servervalg:** hvis valgt sted mangler en tjeneste, fall tilbake til standard («Hjemme») og vis liten brikke «Hytta mangler qBittorrent».
- **Feilmelding som stemmer:** skill mellom «Ikke satt opp» (lenke til Integrasjoner), «Svarer ikke» (Prøv igjen, viser adresse), «Utlogget fra Homelab» (logg inn). Aldri «ikke logget inn» når backend bare er treg.
- Logg \`media.status service=sonarr site=a connected=true source=backend\` fra appen til Docker-loggen ved feil.

## Test
Mobil på Wi-Fi hjemme, mobil på 4G (ekstern adresse), etter kald start, etter 1 time i bakgrunnen: Media viser samme status som Innstillinger og som web.
