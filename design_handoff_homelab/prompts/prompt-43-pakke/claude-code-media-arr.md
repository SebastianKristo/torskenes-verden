# Media: Sonarr, Radarr, qBittorrent og Prowlarr (web + iOS + Android)

Ønske 2026-10-21: «i web og mobil vil jeg ha en fullverdig sonarr radarr qbittorrent prowlarr app/side som jeg kan finne legge til shows kvalitetit overvåking type, seasrch interkativ search i et show, oversikt over qbittorrent nedlasting slutte nedlasting pause slette.» → valgt retning 2a (kombinasjon av 1a og 1b) → «bygg da 2a og legg den inn i web og app».
Fasit: `Media.dc.html` (`variant="web"` / `"mobile"`). Retningene: `Media Retninger.dc.html` → 2a.

## Plassering
- **Web:** egen side «Media» i sidemenyen (etter Familie). Åpnes som fullskjerm-side med × øverst til høyre (tilbake til Dashboard).
- **Mobil:** Mer → **Media** (erstatter den gamle «Plex · Jellyfin · Spilles nå»-siden). Fullskjerm med «‹ Tilbake», samme inn-animasjon som Kalender.
  - **Migrering:** hadde brukeren skjult den gamle Media-siden i Mer (`papir_mer.h` inneholder `media`), fjern den fra skjult-lista én gang og legg Media øverst i Mer (flagg `papir_mer_media_v2`). Ellers finner man ikke den nye siden.
- Følger valgt tema (Papir lys/mørk): bruk temaets `ink/bg/card/line/lab/mut`, ingen egne farger utenom status (grønn `#2f6b4a`, gul `#a0671a`/`#c48a1a`, rød `#b23a2a`).

## Navigasjon (fra 1b)
- Web: topplinja (Media, faner, Glimt, ⚙, ×), Glimt-panelet og innholdet bruker **full bredde** med samme sidemarg (32 px), ingen maks-bredde. Venstre- og høyrekant står på linje (ønsker 2026-10-21: «søkefelt og tabs ikke matcher bredden til innholdet» → «prøv å gi alt full bredde»).
Pille-faner: **Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr**. Web: én pillerad i toppen ved siden av «Media», Glimt-felt og innstillinger. Mobil: «Media» (Newsreader 34) og pillene i en sidelengs rad under. Valgt pille: `ink` bakgrunn, `bg` tekst. Startfane: **Kommer snart**.

## Kommer snart
- Kilde: `GET /api/v3/calendar` (Sonarr, `includeSeries=true`, 7 dager) + `GET /api/v3/calendar` (Radarr, digital utgivelse).
- **Web:** 7 kolonner (i dag i `lab`-farge), plakat 150 px høy med tittel, statusprikk, «S05E09 09:00» og status under. Mørk stripe nederst «Lastes ned ›» med 3 aktive + «Pause alt».
- **Mobil:** én seksjon per dag (bare dager med noe), kort med plakat 52×78, tittel, episode og navn, status og klokkeslett.
- Status: Lastet ned (grønn) · Lastes ned NN % (rød) · Mangler (gul) · Står fast (gul) · Pauset · Venter · Ikke overvåket. Status kobles til qBittorrent via Sonarr/Radarr-køen (`/api/v3/queue`).
- «Vis i Kalender» → egen kalender «Media» i Kalender-appen (kan slås av i innstillingene).

## Sonarr (serier) og Radarr (filmer)
- **Bibliotek:** plakatrutenett (web `minmax(150px,1fr)`, mobil 3 kolonner). Filterchips med antall: Serier: Alle · Mangler · Fortsetter · Avsluttet. Filmer: Alle · Lastet ned · Mangler · Kommer.
- **+ Legg til serie / film** (ark): søkefelt (`/api/v3/series/lookup?term=` / `/api/v3/movie/lookup?term=`). Treff som finnes viser «Finnes» og åpner siden. Velg → valg:
  - **Kvalitetsprofil** (`/api/v3/qualityprofile`): Any, HD-720p, HD-1080p, HD - 720p/1080p, Ultra-HD.
  - **Overvåking** (serie, `addOptions.monitor`): Alle episoder, Fremtidige, Manglende, Eksisterende, Første sesong, Siste sesong, Bare pilot, Ingen.
  - **Serietype**: Standard, Daglig, Anime.
  - **Last ned når den er** (film, `minimumAvailability`): Annonsert, På kino, Utgitt digitalt.
  - Rotmappe (`/api/v3/rootfolder`), bryter «Søk etter manglende med en gang» (`searchForMissingEpisodes` / `searchForMovie`).
- **Serieside:** plakat, tittel, år · kanal · status, «X av Y episoder · N mangler». Chips som åpner valgark: Profil · Overvåking · Serietype (lagres med `PUT /api/v3/series`). Knapper: «Søk alle manglende (N)» og «▶ Spill av i Jellyfin/Plex».
  - Sesonger (nyeste først, øverste åpen): bokmerke for overvåking av hele sesongen, «Søk sesong» når noe mangler.
  - Episoderad: bokmerke (overvåk), E09, navn, sendt-dato, statuschip. Mangler/står fast: **🔍 Automatisk søk** (`EpisodeSearch`-kommando) og **Interaktivt søk**. På mobil vises status i undertittelen når knappene vises.
- **Filmside:** samme oppsett. Chips: Profil · Last ned når den er · Overvåket (Ja/Nei). Fil-boks med kvalitet, størrelse og mappe. Knapper: Spill av, Automatisk søk, Interaktivt søk.

## Interaktivt søk (stil fra 1a)
- Kilde: `GET /api/v3/release?episodeId=` (Sonarr) / `?movieId=` (Radarr). Vis tid og antall indeksere («5 treff fra 11 indeksere · 1,4 s»).
- Topp: plakat, «S05E09 · The Last Floor», «Profil HD-1080p · Overvåker alle episoder».
- Filterchips: Alle · 1080p · 2160p · Norsk tekst · Flest seedere (sortering). Standard: beste treff for profilen øverst, så seedere.
- **Web:** tabell med kolonnene Utgivelse (mono) · Kvalitet · Størrelse · Seedere/peers · Indekser · Språk · last ned.
- **Mobil:** liste: utgivelsesnavn (mono, uten serienavn) · kvalitetsbrikke · størrelse · ▲ seedere/peers · indekser · språklinje.
- 0 seedere vises i rødt. «Best treff for profilen» i grønt.
- Seedere/peers fargekodes for rask oversikt (ønske 2026-10-21: «akkurat på disse legg til grønn og rød for rask oversikt over hvem som har flest og ferrest»): **grønn** når seedere ≥ 50 % av det høyeste i treffene, **rød** under 10 % (og alltid ved 0), ellers vanlig tekst. Relativt til søket, ikke faste tall. Gjelder web-tabellen og mobil-lista.
- Last ned → `POST /api/v3/release` (`guid`, `indexerId`). Knappen blir grønn ✓, og toast «Sendt til qBittorrent: 1080p WEB-DL · 2,4 GB».

## qBittorrent (forsiden på mobil fra 1b)
- Mørkt sammendragskort: total ↓ fart (Newsreader 32), «N aktive · ↑ · i køen», **Pause alt / Fortsett alt** (`/api/v2/torrents/stop|start hashes=all`), **Alt-hastighet** (`/api/v2/transfer/toggleSpeedLimitsMode`; viser «grense 5 MB/s»).
- Filterchips med antall: Alle · Aktive · Pauset · Ferdige · Står fast.
- Kort per torrent: plakat (fra Sonarr/Radarr), navn, episode · kvalitet · størrelse, stor prosent, linje, status/fart/ETA. Knapper (44 px): pause/fortsett, ⋯, søppel.
- ⋯-ark: Pause/Fortsett, Tving start (`setForceStart`), Opp/Ned/Øverst/Nederst i køen (`increasePrio`, `decreasePrio`, `topPrio`, `bottomPrio`), Sjekk filene på nytt (`recheck`), **Filer** med avkryssing for å velge bort enkeltfiler (`/api/v2/torrents/files` + `filePrio id=… priority=0`).
- Slett-ark: «Slett, behold filene» / «Slett med filene» (`deleteFiles=true|false`) / Avbryt.
- Diskplass-kort: per mappe (`/data/media/tv`, `/data/media/film`, `/data/downloads`) + ledig. Varsel når under 1 TB.
- **Legg til magnet-lenke** (ønske 2026-10-21: «la meg leggge til egen magnet link i qbittorent»): knapp over filterchipsene → ark:
  - Tekstfelt for `magnet:?xt=urn:btih:…` eller `https://…/fil.torrent` + «Lim inn» (utklippstavle). Gyldig lenke viser grønt navn (fra `dn=`), kort hash og antall trackere. Feil: «Magnet-lenken mangler xt=urn:btih:…», «Ligger allerede i qBittorrent» (sjekk hash).
  - Kategori: Ingen · tv-sonarr · radarr (viser lagringsmappe). Brytere: Start pauset, Sekvensiell nedlasting, Første og siste del først.
  - `POST /api/v2/torrents/add` med `urls`, `category`, `savepath`, `stopped`, `sequentialDownload`, `firstLastPiecePrio`. Ny rad viser «Henter metadata …» og «størrelse ukjent» til qBittorrent har metadata.
  - Android: registrer appen som mottaker av `magnet:`-lenker (intent-filter), iOS: Del-ark/URL-skjema `papir://magnet?…`, web: `navigator.registerProtocolHandler('magnet', …)`. Åpner arket ferdig utfylt.
- Oppdater hvert 2. sekund mens siden er åpen (`/api/v2/sync/maindata` med `rid`), hvert 30. sekund i bakgrunnen.

## Prowlarr
- Kort: «11 av 12 indeksere svarer» + søk og hentet i dag, «Test alle».
- Liste (web 2 kolonner): prikk, navn, «412 ms · 38 søk · 4 hentet i dag», feil i rødt («Tidsavbrudd siden 08:40»). «Test» per indekser (`POST /api/v1/indexer/test`), viser «Tester …» og resultat.
- Apper: Sonarr og Radarr med «Synk nå» (`ApplicationIndexerSync`).
- **+ Legg til indekser** (ønske 2026-10-21: «i prowlarr la meg legge til nye indexer»):
  - Steg 1: søkefelt + filterchips **Alle · Offentlig · Privat · Semi-privat · Usenet**. Liste fra `GET /api/v1/indexer/schema` (500+): typebrikke i farge, navn, kategorier · språk · Torrent/Usenet. Allerede lagt til: «Lagt til» (grå, kan ikke velges).
  - Steg 2: felter fra skjemaet til indekseren: **Brukernavn + passord**, **API-nøkkel** eller **Cookie** (med hjelpetekst om hvor den finnes). Offentlige: «Ingen innlogging trengs». **Prioritet** 1 · 10 · 25 (standard) · 40 · 50. Brytere **Sonarr** (serier) og **Radarr** (filmer) → app-profil/tags.
  - «Test og lagre»: `POST /api/v1/indexer/test`, så `POST /api/v1/indexer`. Knappen viser «Tester …». Feil vises i rødt under feltene (f.eks. «Feil passord», «Cloudflare-blokk – legg til FlareSolverr»). OK → toast «Nordicbytes lagt til · svarte på 412 ms · synket til Sonarr og Radarr», og den dukker opp i lista.
  - Passord/nøkler lagres bare i Prowlarr (via backend), aldri i appen.

## Glimt
- Web: felt i toppen. Mobil: ✦-knapp åpner feltet.
- **Størrelsessøk** (ønske 2026-10-21: «finn en episode av the rookie som er under 500mb»): `finn en episode av <serie> som er under|over|maks|minst <tall> MB|GB`. Glimt finner serien i Sonarr, tar manglende episoder først (så de nyeste), kjører `GET /api/v3/release?episodeId=` for opptil 3 episoder, filtrerer på størrelse og seedere > 0, og viser maks 2 treff per episode: episode + navn («mangler»/«har den»), utgivelse, kvalitet, størrelse i grønt, seedere/peers, indekser og **Last ned**. Steg med ekte tid: «Fant The Rookie i Sonarr · Søker i 12 indeksere via Prowlarr 1,2 s · Filtrerer på under 500 MB · 4 treff». Serien finnes ikke i biblioteket → tilbud om å legge den til. Ingen treff → «Fant ingen utgivelser av The Rookie under 500 MB med seedere».
- Forstår: «legg til Severance i 4K» (4K/UHD/2160p → Ultra-HD, 1080p/HD → HD-1080p, 720p → HD-720p), «pause alt», «fortsett alt», «hva lastes ned».
- Viser ekte steg med tid («✓ Søker i Sonarr og Radarr 412 ms»), aldri falsk fremdrift. Resultat: plakat, tittel, profil og overvåking + **Legg til** / **Endre** (åpner Legg til-arket ferdig utfylt). Finnes den: «Finnes allerede · Åpne».

## Varsler og innstillinger (⚙ i toppen)
- Varsel når en nedlasting er ferdig (push + Glimt-brief): «Ferdig: Shrinking S03E08 · klar i Jellyfin».
- Varsel når noe feiler eller står fast: 0 seedere i 30 min, indekser nede, full disk.
- Vis i Kalender-appen (på/av). Spill av med: Jellyfin / Plex (dyplenke til riktig episode/film).
- Tjenester med adresse og versjon. **API-nøklene ligger bare på serveren**. Appene snakker med `home.kristo.no`-backend, som proxer til `:8989`, `:7878`, `:8080`, `:9696`.

## Backend
- Ny modul `media` i homelab-backend: `/api/media/calendar`, `/series`, `/movies`, `/lookup`, `/release`, `/queue`, `/torrents`, `/indexers`, `/disk`. Cacher kalender og bibliotek 60 s.
- Webhooks fra Sonarr/Radarr («On Grab», «On Import», «On Health Issue») og qBittorrent «Run external program on torrent finished» → push-varsler.
- Rettigheter: bare admin kan slette og endre profiler. Andre i husstanden kan se og be om innhold (som senere kan bli en «Ønsker»-liste).

## iOS / Android
- Samme struktur. iOS: `ScrollView` + `LazyVGrid` for plakater, `.sheet` med `.presentationDetents([.medium,.large])` for ark. Android: `LazyVerticalGrid`, `ModalBottomSheet`.
- Alle trykkflater minst 44 pt/48 dp. Haptikk ved Last ned, Pause og Slett.
- Plakater: `images[coverType=poster].remoteUrl` fra Sonarr/Radarr, cachet lokalt.

## Test
- Legg til Severance med Ultra-HD og «Alle episoder» fra Glimt → dukker opp i Sonarr og i Kommer snart fredag.
- Interaktivt søk på Only Murders S05E09 → Last ned NTb 1080p → vises i qBittorrent → ferdig → status «Lastet ned» og varsel.
- Pause alt / Fortsett alt, Alt-hastighet, velg bort en fil i The Bear S04, slett med og uten filer.
- Test 1337x i Prowlarr → feiler med tidsavbrudd. Test alle.
- Mørkt tema: alt leses godt, ingen hvite flater.
