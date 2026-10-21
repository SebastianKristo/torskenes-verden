# Integrasjoner: Media-tjenestene (Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin, Plex) + web-siden

Ønske 2026-10-21: «i innstligner for integration legg til alle disse tjeneseten og gi god oppset dokumentasjon.»
Fasit:
- **Mobil:** `Mobil Papir App.dc.html` → Innstillinger → Integrasjoner → ny gruppe **MEDIA** (`IDEF`, `ILOGO`). Undertittel i Innstillinger: «Home Assistant, Media, Entur, Bring og 17 til».
- **Web:** `Innstillinger Web.dc.html` → Tilkoblinger → **Integrasjoner** (var en tom plassholder, nå en ekte side med alle 19 integrasjoner, `WINT` + `intVals()`).

## Felles oppførsel
- Rad: logo, navn, kort beskrivelse, status til høyre: **Tilkoblet** (grønn) eller **Mangler <felt>** (rød). Kalendere og Gemini/AI åpner sine egne sider.
- Trykk åpner raden (web: trekkspill i to kolonner; mobil: egen underside):
  - **Felter** fra definisjonen. Hemmelige felt (API-nøkkel, passord, token) er `password` og viser «•••• lagret · skriv for å bytte». Felt merket «(valgfri)» teller ikke som mangler.
  - **Lagre** og **Test tilkobling**. Testen kaller backend `POST /api/integrations/<id>/test` → viser «✓ Sonarr v4 svarte på 142 ms» eller hva som mangler / feilmeldingen fra tjenesten (401 = feil nøkkel, ECONNREFUSED = feil adresse/port).
  - **Slik setter du det opp**: nummererte steg med tittel, forklaring og kodeblokk der det trengs (mørk boks, mono, kan kopieres med ett trykk).
- Verdier lagres kryptert på serveren (`/api/integrations`), aldri i klartekst i appen. Lokalt bare «er satt»-status.
- Samme data på web og mobil (én kilde i backend: `integrations.json` med `id, name, sub, group, fields[], steps[]`).

## MEDIA-gruppen

### Sonarr
Felter: Adresse (`http://home.kristo.no:8989`), API-nøkkel*, Rotmappe for serier (`/data/media/tv`), Standard kvalitetsprofil (`HD-1080p`).
1. Finn API-nøkkelen: Settings → General → Security → API Key.
2. Adresse og port 8989, med URL Base hvis satt (`http://192.168.1.20:8989/sonarr`).
3. Samme mapper i alle containerne (hardlinks): `volumes: - /srv/data:/data` → `/data/downloads`, `/data/media/tv`, `/data/media/film`.
4. Rotmappe: Settings → Media Management → Root Folders → `/data/media/tv`.
5. Koble til qBittorrent: Download Clients → qBittorrent, port 8080, kategori `tv-sonarr`.
6. Standard kvalitetsprofil brukes når man legger til fra Media/Glimt (4K → Ultra-HD).
7. Webhook: Connect → Webhook (On Grab, On Import, On Upgrade, On Health Issue) → `https://home.kristo.no/api/media/hook/sonarr`.

### Radarr
Felter: Adresse (`:7878`), API-nøkkel*, Rotmappe for filmer (`/data/media/film`), Standard kvalitetsprofil (`Ultra-HD`).
Steg: API-nøkkel · adresse · rotmappe · qBittorrent med kategori `radarr` · Minimum Availability (Announced / In Cinemas / Released = «Utgitt digitalt») · webhook `…/hook/radarr`.

### qBittorrent
Felter: Web UI-adresse (`:8080`), Brukernavn, Passord*, Standard lagringsmappe (`/data/downloads`).
1. Slå på Web UI (port 8080). Docker: `docker logs qbittorrent | grep -i password` for midlertidig passord.
2. Eget brukernavn og sterkt passord.
3. Tillat bare Homelab-serverens IP; ikke åpne Web UI mot internett.
4. Kategorier: `tv-sonarr` → `/data/downloads/tv`, `radarr` → `/data/downloads/film`.
5. Varsel når ferdig: «Kjør eksternt program når torrent er ferdig» → `curl -s -X POST https://home.kristo.no/api/media/hook/qbit -d "hash=%I&name=%N"`.
6. Alt-hastighet: Fart → Alternative fartsgrenser (f.eks. 5 MB/s ned).

### Prowlarr
Felter: Adresse (`:9696`), API-nøkkel*, FlareSolverr (valgfri, `:8191`).
Steg: API-nøkkel · Apps → Sonarr/Radarr med Full Sync (`http://prowlarr:9696`, `http://sonarr:8989`, `http://radarr:7878`) · legg til indeksere (fra Media eller Prowlarr) · FlareSolverr (`docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr`, tagg `flaresolverr`) · webhook `…/hook/prowlarr`.

### Jellyfin
Felter: Adresse (`:8096`), API-nøkkel*, Bruker.
Steg: Dashbord → API-nøkler → + «Homelab» · bibliotek på `/data/media/tv` og `/data/media/film` · Sonarr/Radarr Connect → Emby/Jellyfin · velg Jellyfin under Media → ⚙ → Spill av med.

### Plex
Felter: Adresse (`:32400`), Plex-token*.
Steg: token fra «Vis XML» (`X-Plex-Token=`) · bibliotek på samme mapper · Sonarr/Radarr Connect → Plex Media Server · velg Plex under Media → ⚙.

(* = hemmelig felt)

## Media-siden
- ⚙ i Media viser tjenestene med status og lenker til «Innstillinger → Integrasjoner → Media».
- Mappene i Media er endret til `/data/media/tv`, `/data/media/film`, `/data/downloads` så de stemmer med oppsettet.

## Test
- Web: Innstillinger → Integrasjoner → Sonarr → fyll inn adresse og nøkkel → Lagre → status «Tilkoblet» → Test tilkobling.
- Tom nøkkel → «Mangler api-nøkkel» i rødt, test sier hva som mangler.
- Mobil: samme rad under MEDIA, samme steg, kodeblokkene vises som tekst som kan kopieres.
