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

## Søk i biblioteket (2026-10-21)
Ønske: «legg til at jeg kan søke etter en serie» (vedlegg `uploads/Screenshot 2026-10-21 at 14.03.12.png`)
- Sonarr → Serier og Radarr → Filmer: **søkefelt** foran filterpillene («Søk i 40 serier» / «Søk i 112 filmer»), maks 420 bredde, ✕ tømmer.
- Filtrerer mens man skriver på tittel, kanal/nettverk og år. Uavhengig av store bokstaver og aksenter («9-1-1» = «911»). Kombineres med Alle / Mangler / Fortsetter / Avsluttet.
- Tellerne i pillene viser antall uten søk. Ingen treff: «Ingen serier i biblioteket som heter «X».» + knapp **Søk etter «X» for å legge til** (åpner Legg til serie med søket utfylt, Sonarr `/series/lookup`).
- Mobil: samme felt over pillene. «/» (web) setter fokus i feltet.

## Plakater i riktig format (2026-10-21)
Ønske: «flere av postere for serier er feil størrelse» (vedlegg `uploads/Screenshot 2026-10-21 at 14.03.28.png`: stående plakater ble beskåret til liggende kort i Kommer snart, tekst i plakaten kuttet).
- **Regel:** en bildeflate har alltid samme format som bildet. Plakater (`coverType: poster`) er **2:3**, med `aspect-ratio: 2/3` og `object-fit: cover`. Aldri fast høyde med variabel bredde.
- **Kommer snart (uke):** kortene er nå **liggende rader**: plakat 64 × 96 til venstre (status-prikk i hjørnet), tittel (Newsreader 16), episode + tid og status til høyre. Plakaten beskjæres ikke.
- Trengs et bredt bilde (helt kort, hero i detalj), bruk `coverType: fanart` (16:9) fra Sonarr/Radarr, ikke plakaten. Mangler fanart: plakaten midtstilt i 2:3 på uskarp, forstørret kopi av seg selv.
- Hent bildene i riktig størrelse (`/MediaCover/{id}/poster-250.jpg`, `fanart-360.jpg`) og cache dem. Ikke strekk små bilder.
- Biblioteket (Serier/Filmer) bruker allerede 2:3. Sjekk at alle kort, widgets og søkeresultater følger samme regel.

## Kommer snart: visning Uke · Liste (2026-10-21)
Ønske: «legg til dette som en view i kommer snart» (vedlegg `uploads/Screenshot 2026-10-21 at 14.04.32.png`)
- Velger **Uke · Liste** i toppen av Kommer snart (web, ved datoen). Valget lagres (`media_komv`).
- **Liste:** én seksjon per dag med innhold: mono-etikett (I DAG / I MORGEN / TORSDAG …, rød) + dato (Newsreader 24), strek under. Rader (72 pt): plakat 44 bred i 2:3, tittel (Newsreader 20) og «S06E03 · Dead Drop» / «Film · Digital utgivelse», tid (mono), kvalitetsprofil (mono, dempet), status-pille til høyre i statusfarge (Lastet ned · ▶ Jellyfin / Lastes ned 64 % / Mangler · søker / Venter). Dager uten innhold vises ikke. Maks 1100 bredde.
- Trykk på en rad åpner serien eller filmen. Mobil bruker allerede listeformen.

## Last ned på nytt og slett (2026-10-21)
Ønske: «la meg også laste ned episoder av show og filmer på nytt med interaktiv search og slette en episode» (vedlegg `uploads/Screenshot 2026-10-21 at 14.06.35.png`)
- **Episode med fil:** to runde knapper på raden. **⟳ Last ned på nytt** åpner interaktivt søk for episoden (`re:true`). Valgt utgivelse sendes med `POST /api/v3/release`, og Sonarr erstatter filen når den nye er importert (Upgrade/Replace). **Slett** (rød søppelbøtte) spør først, kjører `DELETE /api/v3/episodefile/{id}` og slår av overvåking så den ikke lastes ned igjen med en gang. Toast med «Angre» i 5 s (slå på overvåking igjen).
- **Film med fil:** knappene **⟳ Last ned på nytt** (interaktivt søk, Radarr `/release`) og **Slett fil** (`DELETE /api/v3/moviefile/{id}`, `monitored=false`).
- Hele sesongen: i sesongmenyen **Last ned sesongen på nytt** (sesongpakke) og **Slett alle filer i sesongen**.
- Mobil: sveip venstre på en episode → Last ned på nytt / Slett.

## Banner øverst i serie/film (2026-10-21)
Ønske: «legg også et slikt banner i toppen når man har en film eller serie åpen. bli inspirert av banneret» (vedlegg `uploads/Screenshot 2026-10-21 at 14.07.00.png` = Sonarr-detalj, `… 14.07.10.png` = vår side i dag)
- **Banner** (22 pt hjørner) med **fanart** som bakgrunn (Sonarr/Radarr `coverType: fanart`, lett uskarp) og mørk gradient fra venstre (92 % → 55 %), så tekst alltid er lesbar.
- Venstre: **plakat 2:3** med skygge. Høyre: SONARR · SERIE (rosa mono), **tittel** (Newsreader 44), **←/→** øverst til høyre (forrige/neste i biblioteket).
- Linje med fakta: spilletid («43 min»), sjanger, år («2018–»), status i grønt («5 av 37 episoder · komplett»).
- **Info-brikker** (glass): MAPPE /data/media/tv/9-1-1, STR. 913 MB, PROFIL HD-720p, Overvåket, Fortsetter/Avsluttet, SPRÅK Engelsk, KANAL ABC (US). Trykk på PROFIL / overvåket åpner samme valg som brikkene under.
- **Handling** (oversikt fra TVDB/TMDb) under, maks 900 bredde, 14,5 pt.
- Nederst til høyre: «Metadata fra TheTVDB» / «TMDb».
- Valgkortene (Profil, Overvåking, Serietype) og knappene ligger fortsatt under banneret. Mobil: samme banner, plakat 104 bred, brikker brytes over flere linjer.

## Flere servere per tjeneste (2026-10-21)
Ønske: «la meg også legge til to av alt, to qBittorrent, to Sonarr, to Radarr, to Prowlarr, legge til to servere. og så velge hvilke jeg bruker i toppen i en dropdown»
- **Innstillinger → Integrasjoner:** hver tjeneste kan ha **flere servere** (minst 2). Per server: navn («Hjemme», «Hytta», «4K», «Seedbox»), URL, API-nøkkel / bruker+passord, farge, **Test tilkobling**, Standard (stjerne). Lagres som `integrations.sonarr = [{id, name, url, key, default}]`.
- **Media, toppen (web):** ved fanene en **nedtrekksknapp** «● Sonarr · Hjemme ▼» for fanen som er åpen (Sonarr, Radarr, qBittorrent, Prowlarr). Menyen: «SONARR · VELG SERVER», én rad per server (prikk, navn, URL i mono, status: Tilkoblet / Treg · 1,8 s / Svarer ikke, ✓ på valgt), nederst «+ Legg til Sonarr-server». Valget huskes per tjeneste.
- **Mobil:** samme valg som rad øverst i hver fane («Server: Hjemme ›») som åpner et ark.
- **Kommer snart** og Glimt søker i **alle** Sonarr/Radarr-servere og viser serverens navn som liten brikke på raden når det er flere.
- «Legg til serie/film» spør hvilken server (standard forhåndsvalgt). qBittorrent: «Send til» velger klient ved interaktivt søk.
- Statusen hentes med `/api/v3/system/status` (qBit: `/api/v2/app/version`) hvert 60 s.
- Endring 2026-10-21: «når jeg velger server gi samme server i alt i prowlarr qbit son rad» (vedlegg `uploads/Screenshot 2026-10-21 at 14.11.55.png`): valget er **felles**. Serverne grupperes som **steder/oppsett** («Hjemme», «Hytta»), hvert med sin Sonarr, Radarr, qBittorrent og Prowlarr. Velger man «Hytta» i én fane, bruker alle fanene Hytta. Menyen viser fortsatt URL og status for tjenesten i fanen som er åpen. Overskrift: «VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR». Lagres som `media_site`. Integrasjoner: «+ Legg til server» lager et nytt sted med felt for alle fire tjenestene (kan stå tomme).

## Frem/tilbake i nettleseren og på musen (2026-10-21)
Ønske: «når jeg har åpnet en film f.eks. og vil tilbake til filmer eller har vært i Sonarr så åpnet Radarr og vil tilbake til Sonarr la meg bruke frem- og tilbakepil på musen som man vanligvis kan i nettsider»
- Hver navigasjon i Media (fane, åpnet serie/film, interaktivt søk) legger et steg i **nettleserhistorikken** (`history.pushState`) med egen URL: `#media/sonarr`, `#media/radarr/m/<id>`, `#media/sonarr/s/<id>/sok`.
- **Tilbake/frem** (musens sideknapper 4/5, ⌘[ / ⌘], Alt+←/→, nettleserknappene, sveip på styreflate) går mellom stegene via `popstate`. Åpne ark og menyer lukkes.
- Direkte lenke / oppfrisking åpner riktig visning (les URL ved oppstart).
- Lukk-knappen (✕) og «‹ Serier» bruker `history.back()` når forrige steg er i Media, ellers vanlig navigasjon.
- Gjelder hele web-appen, ikke bare Media: alle moduler (Kalender-visning, Gjøremål-oppgave, Finans-faner, Innstillinger-undersider) skal bruke samme mønster via felles ruter (f.eks. React Router / TanStack Router med `hash` eller `browser`-historikk).
