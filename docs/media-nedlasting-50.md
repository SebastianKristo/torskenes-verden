# Media: ingenting lastes ned – qBittorrent starter ikke (prompt 50)

Ønske 2026-10-24: «media ingen ting lastes ned når jeg laster ned fra feks sonarr i media, qbit starer ikke nedlating»

Dette dokumentet følger kjeden for én nedlasting fra Media (knapp eller Glimt) ledd for ledd. Det sier hvor koden i Homelab
stoppet før, og hva som er rettet. Det lister også hva som sannsynligvis feiler i selve oppsettet (Sonarr/Radarr/qBittorrent).
Oppsettet kan ikke leses herfra. Diagnostikken (Innstillinger → Media → Diagnostikk) sier derfor hvilket ledd som faktisk
feiler hjemme.

## Kjeden

| Ledd | Hva | Hvor i Homelab |
|---|---|---|
| 1 | Appen → server: `POST /api/media/command {name:'EpisodeSearch', episodeIds}` (eller `MoviesSearch`) | `server/media43.js` → Sonarr/Radarr `POST /api/v3/command` (svarer 201 med `id`) |
| 2 | Kommandoen i Sonarr/Radarr: `GET /api/v3/command/{id}` til `completed`/`failed`, `message` | `server/media50.js` `evaluate()` |
| 3 | Indeksere (Prowlarr): `GET /api/v3/release?episodeId=` → kandidater og `rejections` | `releaseSummary50()` |
| 4 | Grab: køen (`GET /api/v3/queue`) og `GET /api/v3/history?eventType=1` (grabbed) | `evaluate()` |
| 5 | Nedlastingsklient: `GET /api/v3/downloadclient`, `POST /api/v3/downloadclient/testall`, `GET /api/v3/health` | `diagnose50()` |
| 6 | qBittorrent: `POST /api/v2/auth/login`, `GET /api/v2/torrents/info`, `app/preferences`, `transfer/info`, `sync/maindata` | `evaluate()` / `diagnose50()` |

Hvert ledd logges for én konkret nedlasting, uten nøkler eller passord:

```
media.track id=98e16ca9 svc=sonarr episodeIds=701 ledd=1 start command=55 name=EpisodeSearch
media.track id=98e16ca9 svc=sonarr episodeIds=701 ledd=2 state=searching "Søker i indekserne via Sonarr …"
media.track id=98e16ca9 svc=sonarr episodeIds=701 ledd=4 grab 9-1-1.S08E03.1080p.WEB.h264 client=qBittorrent
media.track id=98e16ca9 svc=sonarr episodeIds=701 ledd=6 auto-start hash=aaaaaaaa state=stoppedDL
media.track id=98e16ca9 svc=sonarr episodeIds=701 ledd=6 state=downloading "Laster ned 12 % · 4,2 MB/s · 8 min"
```

## Hvor koden stoppet før (rotårsak i Homelab)

1. **Appen fulgte aldri søket etter ledd 1.** `POST /api/media/command` svarte `{ok, id, message:'Automatisk søk startet'}`.
   Web viste en toast og knappen «Søker …». Mobilappene viste «Søker» til listen ble lastet på nytt. Ingen sjekket
   `command/{id}`, utgivelsene, historikken eller qBittorrent. Ble alle utgivelser avvist, var nedlastingsklienten nede eller
   lå torrenten stoppet i qBittorrent, så det ut som «søker» for alltid. Derfor «ingenting lastes ned» uten noen forklaring.
2. **Stoppede torrenter ble aldri startet.** qBittorrent 5.x legger til torrenter stoppet når «Start torrent automatically»
   er av (eller når Sonarr/Radarr har Initial State Stop/Pause). Media viste dem som «Pauset». Ingen startet dem.
3. **Statusen fra køen ble forenklet bort.** `queues()` i `media43.js` gjorde alle køstatuser til `dl`/`pause`/`stall`.
   «Venter på forsinkelsesprofil» (`delay`), «Nedlastingsklient utilgjengelig» (`downloadClientUnavailable`) og
   importfeil ble derfor vist som «Lastes ned» eller «Mangler».
4. **4.x-reserven i `qbVerb` gjaldt bare 404.** Svarte qBittorrent 405 på `/torrents/start`, ble `/resume` aldri prøvd.

Ledd 2–6 kunne altså ikke feilsøkes fra appen. Den ekte feilen hjemme er sannsynligvis én av de vanlige årsakene under
(oftest ledd 5 eller 6). Ny diagnostikk viser hvilken.

## Sannsynlige årsaker i oppsettet (sjekkes av diagnostikken)

| Ledd | Årsak | Hva diagnostikken sier / hva du gjør |
|---|---|---|
| 5 | **Feil host i Docker**: Sonarr/Radarr peker på `localhost:8080`, men qBittorrent kjører i en annen container (eller gjennom gluetun) | «Sonarr peker på localhost:8080 … bruk containernavnet (qbittorrent:8080, eller gluetun:8080) eller vertens IP» |
| 5/6 | **Innlogging avvist**: feil passord, IP utestengt, Host header validation/CSRF | «Innlogging avvist» – legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets» |
| 6 | **qBittorrent 5.x**: torrenter legges til stoppet («Start torrent automatically» av), eller Initial State Stop i Sonarr/Radarr | «nye torrenter legges til stoppet» – Homelab starter dem selv (`/torrents/start`, reserve `/resume`); sett «Initial State: Start» |
| 6 | **Kø og grenser**: «Torrent queueing» med maks aktive = 0, eller lite diskplass | «maks aktive nedlastinger er 0» / «lite diskplass (X igjen)» |
| 6 | **Kategori/lagringssti**: `tv-sonarr`/`radarr` finnes ikke, eller stien er ikke skrivbar (PUID/PGID) | «kategorien … finnes ikke» / torrenter i `error`/`missingFiles` |
| 6 | **VPN nede**: qBittorrent bundet til `tun0`, men VPN er nede | «ingen nettforbindelse (bundet til tun0 – VPN nede?)» |
| 3 | **Alle utgivelser avvist** (kvalitetsprofil, størrelse, språk, ingen seedere) | Media-kortet: «Fant ingen utgivelser · alle 12 under kvalitetskrav» + «Velg manuelt» |
| 3 | **Ingen indeksere med automatisk søk** i Sonarr/Radarr (ikke synket fra Prowlarr) | «Ingen av N indeksere har automatisk søk på» |
| 4 | **Forsinkelsesprofil**: utgivelsen venter (`delay`) | «Venter på forsinkelsesprofilen i Sonarr (til 21:30)» |

## Endret i koden

- **Sann status, ikke «Søker»** (`server/media50.js`): `POST /api/media/command` (og Glimt i Media) gir `track` i svaret.
  `GET /api/media/track/:id` går gjennom ledd 2–6 og svarer med én av:
  `searching` «Søker i indekserne via Sonarr …» · `none`/`rejected` «Fant ingen utgivelser» (grunnen fra `rejections`) + «Velg manuelt» ·
  `sent` «Sendt til qBittorrent» · `downloading` «Laster ned 12 % · 4,2 MB/s · 8 min» · `stopped` «Lagt til, men stoppet» [Start] ·
  `starting` (appen startet den selv) · `qbit_down` «qBittorrent svarer ikke» · `qbit_auth` «Innlogging avvist» ·
  `client_error` «Sonarr får ikke kontakt med qBittorrent» · `delayed` · `queued` · `stalled` · `error` · `importing` · `done`.
  Ikke-ferdige tilstander kommer med en lenke til Innstillinger → Media.
- **Manuelt valg**: «Velg manuelt» åpner det interaktive søket (`/api/v3/release`) med tittel, størrelse, seedere, kvalitet og
  avvisningsgrunn. `POST /api/media/release` henter valgt utgivelse, og web følger den videre med `POST /api/media/track`.
- **Start stoppede**: `POST /api/media/torrents/:hash/start` (5.x `torrents/start`, reserve `torrents/resume` for 4.x ved 404/405).
  Sporingen starter en torrent som ble lagt til stoppet under søket, automatisk og én gang.
- **Diagnostikk**: `GET /api/media/diagnostics` (bare admin) kjører ledd 2–6 og gir grønt/rødt per ledd med feilmelding og tips.
  Web: Innstillinger → Media → Diagnostikk. Den samme sjekken kjøres automatisk når et søk ikke har gitt grab innen 60 s.
  Svaret viser nedlastingsklienten som `host:port · kategori · passord satt/ikke satt`, aldri nøkler eller passord.

## Test

`test/p50-media.test.js` (falske Sonarr/Radarr/qBittorrent bak `_setMediaFetch43`):

- Ny episode av 9-1-1 → grab i køen → torrent stoppet i qBittorrent 5.x → Homelab starter den → «Laster ned 12 % · 4,2 MB/s · 8 min».
- qBittorrent stoppet (ECONNREFUSED) → «qBittorrent svarer ikke», ikke evig «Søker».
- Alle utgivelser avvist → «Fant ingen utgivelser» · «alle 2 under kvalitetskrav» + «Velg manuelt». Diagnostikken kjøres automatisk.
- qBittorrent 4.x: `/torrents/start` gir 404 → `/torrents/resume`.
- Film fra Radarr → samme flyt («Laster ned 50 % · 10 MB/s · 2 t 0 min»).
- Diagnostikk: grønn kjede; `localhost` i Docker + test som feiler → rødt ledd 5 med hint om containernavn; «start automatisk» av →
  advarsel med Start-knapp; innlogging avvist → «Innlogging avvist». Bare admin. Ingen nøkler i svaret.
