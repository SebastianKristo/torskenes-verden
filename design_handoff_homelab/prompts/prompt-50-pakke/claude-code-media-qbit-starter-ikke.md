# Media: ingenting lastes ned – qBittorrent starter ikke nedlasting

Ønske 2026-10-24: «media ingen ting lastes ned når jeg laster ned fra feks sonarr i media, qbit starer ikke nedlating»

Gjelder alle nedlastinger som startes fra Media (Sonarr og Radarr, via knapp eller Glimt). Appen sier at den søker, men ingen torrent dukker opp eller starter i qBittorrent.

## Følg kjeden og finn hvor den stopper
Ikke gjett. Logg hvert ledd for én konkret nedlasting:
1. **Appen → server:** blir `EpisodeSearch` / `MoviesSearch` faktisk sendt? Svarer serveren 201 med en `command.id`?
2. **Sonarr/Radarr-kommandoen:** poll `GET /api/v3/command/{id}` til `status` er `completed` eller `failed`. Les `message`.
3. **Indeksere (Prowlarr):** fant søket utgivelser? `GET /api/v3/release?episodeId=…` viser kandidater og `rejections`. Alle avvist (kvalitetsprofil, størrelse, språk, ingen seedere) → ingenting sendes videre.
4. **Grab:** `GET /api/v3/history?eventType=grabbed` for episoden/filmen. Ingen grab = feilen ligger før qBittorrent.
5. **Nedlastingsklient:** `GET /api/v3/downloadclient` + `POST /api/v3/downloadclient/test`. `GET /api/v3/health` viser ofte «Unable to communicate with qBittorrent».
6. **qBittorrent:** `POST /api/v2/auth/login`, `GET /api/v2/torrents/info?category=tv-sonarr`. Ligger torrenten der med status `stoppedDL`/`pausedDL`, `queuedDL`, `stalledDL` eller `error`?

## Vanlige årsaker (sjekk alle mot faktisk oppsett)
- **Feil host i Docker:** Sonarr/Radarr peker på `localhost:8080`, men qBittorrent kjører i en annen container. Bruk containernavn (`qbittorrent:8080`) eller vertens IP (`10.69.1.39`). Sjekk også om qBittorrent går gjennom VPN-containeren (gluetun), og bruk i så fall dens navn og port.
- **Innlogging avvist:** feil passord, IP utestengt etter for mange forsøk, eller «Host header validation»/CSRF blokkerer. Legg Docker-nettet i «Bypass authentication for clients in whitelisted IP subnets», eller bruk riktig brukernavn og passord.
- **qBittorrent 5.x:** `pause`/`resume` heter nå `stop`/`start`, og torrents legges til «stoppet» hvis «Start torrent automatically» er av. Oppdater Sonarr/Radarr til en versjon som støtter 5.x, og sett «Initial State: Start» i klientoppsettet. Fiks også egen kode som kaller `/api/v2/torrents/resume` → bruk `/start`, med fallback.
- **Kø og grenser:** «Torrent queueing» med maks aktive nedlastinger = 0 eller fullt. Det samme skjer ved lite diskplass, der qBittorrent stopper når disken er nesten full.
- **Kategori/lagringssti:** kategorien `tv-sonarr`/`radarr` finnes ikke, eller stien er ikke skrivbar for containeren (PUID/PGID). Torrenten havner da i `error`/`missingFiles`.
- **VPN nede:** qBittorrent er bundet til `tun0`, men VPN er nede, så ingen trafikk og torrenten blir stående `stalledDL`.

## Rettelser i appen
- **Vis sannheten, ikke «Søker».** Etter et søk viser Media-kortet ett av disse:
  - «Fant ingen utgivelser» (med grunnen fra `rejections`, f.eks. «alle under kvalitetskrav»), med knappen «Velg manuelt».
  - «Sendt til qBittorrent», så «Laster ned 12 % · 4,2 MB/s · 8 min».
  - «qBittorrent svarer ikke» / «Innlogging avvist», med lenke til Innstillinger → Media.
  - «Lagt til, men stoppet», med knappen «Start».
- **Manuelt valg:** «Velg manuelt» viser listen fra `/api/v3/release` (tittel, størrelse, seedere, kvalitet, avvisningsgrunn) og `POST /api/v3/release` for å hente valgt utgivelse.
- **Start stoppede:** finnes torrenten men er stoppet, kall `torrents/start` (5.x) eller `torrents/resume` (4.x).
- **Innstillinger → Media → Diagnostikk:** én knapp som kjører ledd 2–6 og viser grønt/rødt per ledd med feilmeldingen. Den samme sjekken kjøres automatisk når et søk ikke har gitt grab innen 60 s.
- Ikke logg passord eller API-nøkler.

## Test
- Ny episode av 9-1-1 fra Media → grab i historikken → torrent i qBittorrent → status «Laster ned» i appen.
- qBittorrent stoppet → «qBittorrent svarer ikke», ikke evig «Søker».
- Alle utgivelser avvist → «Fant ingen utgivelser» med grunn og «Velg manuelt».
- qBittorrent 5.x med «start automatisk» av → appen starter torrenten selv.
- Film fra Radarr → samme flyt.

Avslutt med: dokumentert rotårsak (hvilket ledd som feilet og hvorfor), hva som ble endret i oppsett og kode, og testresultater.
