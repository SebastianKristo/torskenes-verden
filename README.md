# OS – personlig homelab-dashboard

Et passordbeskyttet dashboard for homelab og hverdag (Ruter-avganger, timeplan, vær, Trading 212, energi, økonomi, Starlink og NASA), med mobil-PWA og en offentlig CV på `/cv`. Begrunnelsen for arkitekturen står i [DECISIONS.md](DECISIONS.md).

| Rute | Tilgang |
|---|---|
| `/login` | offentlig |
| `/` med `#/dash`, `#/studie`, `#/rom`, `#/okonomi`, `#/nettverk` (`#/mer` på mobil) | innlogget |
| `/cv` | offentlig lesing, redigering når innlogget |

## Kom i gang lokalt
```bash
npm install
cp .env.example .env
npm run hash-password -- 'velg-et-godt-passord'   # lim linja inn i .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "COOKIE_SECURE=false" >> .env                 # kun lokalt uten HTTPS
MOCK_DATA=1 npm run dev                            # eksempeldata, ingen API-nøkler nødvendig
```
Åpne http://localhost:3000.

## Deploy på homelab (Docker + Cloudflare Tunnel)
1. Lag en LXC/VM med Docker på Proxmox og klon repoet.
2. Fyll ut `.env`. Alle nøkler blir værende på serveren.
3. I Cloudflare Zero Trust går du til **Networks → Tunnels → Create tunnel**. Kopier tokenet til `CLOUDFLARE_TUNNEL_TOKEN` og legg til en public hostname, for eksempel `os.dittdomene.no`, som peker på `http://os:3000`.
4. Kjør `docker compose --profile tunnel up -d --build`. Uten `--profile tunnel` startes bare appen, og du kan sette `BIND_ADDR=0.0.0.0` i `.env` for LAN-tilgang.
5. Anbefalt: under **Access → Applications** lager du en app for `os.dittdomene.no` med en policy for e-posten din. Legg til en bypass-policy for stien `/cv*` og for `/assets/*`, slik at CV-en forblir offentlig.

Data (SQLite og opplastinger) ligger i `./data`. Ta backup av den mappen.

Oppdatering: `git pull && docker compose --profile tunnel up -d --build` (dropp `--profile tunnel` hvis du ikke bruker tunnel).

## Proxmox (automatisk LXC)
Kjør på Proxmox-verten som root:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/install.sh)"
```
Vil du installere fra en annen branch, last ned skriptet derfra og sett `BRANCH`:
```bash
curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/<branch>/deploy/proxmox/install.sh -o install.sh
BRANCH=<branch> bash install.sh
```
Alternativt kan du klone repoet og kjøre `bash torskenes-verden/deploy/proxmox/install.sh`. Da kopieres den lokale koden inn i containeren. Skriptet gjør dette:
- oppretter en uprivilegert Debian 12-LXC med nesting
- installerer Docker
- legger koden i `/opt/homelab-os`
- spør om passord og eventuelt Cloudflare Tunnel-token
- skriver `.env` og starter tjenesten

Uten lokal kopi kloner skriptet `REPO` direkte. `GITHUB_TOKEN` trengs bare hvis repoet blir privat igjen.

Valg kan overstyres med miljøvariabler, for eksempel `CTID=150 STORAGE=local-zfs IP=192.168.1.60/24 GW=192.168.1.1`. Lagring finnes automatisk hvis `STORAGE` ikke er satt. Resten av API-nøklene legger du inn etterpå i `/opt/homelab-os/.env`.

### Oppdatere Proxmox-installasjonen
Kjør på Proxmox-verten som root. Skriptet trenger ikke git, finner containeren `homelab-os` selv og rører ikke `.env` eller `data/`:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"
```
Har containeren et annet navn, kjør med `CTID=<id>` foran (finn ID-en med `pct list`).

## Unraid
1. Kopier `deploy/unraid/homelab-os.xml` til `/boot/config/plugins/dockerMan/templates-user/` på Unraid.
2. Gå til **Docker → Add Container** og velg `homelab-os` som mal.
3. Generer passord-hashen:
   ```bash
   docker run --rm ghcr.io/sebastiankristo/torskenes-verden node scripts/hash-password.js 'passord'
   ```
   Lim inn verdien etter `APP_PASSWORD_HASH=` i malen.

Bildet bygges og publiseres til GHCR av `.github/workflows/docker.yml` ved hver push til `main`. Sjekk at pakken også er *public* under GitHub → Packages, ellers må Unraid logge inn på ghcr.io. Data lagres i `/mnt/user/appdata/homelab-os` og eies av PUID/PGID (som standard 99:100).

## Viktige detaljer for drift
- **Passord-hashen bruker `:` som skilletegn** (`scrypt:N:r:p:salt:hash`). Docker Compose tolker `$` i `.env`, og det ødela det gamle formatet. Hasher med `$` virker fortsatt, men de bør genereres på nytt hvis de skal leses av Compose.
- **Rettigheter på `/data`:** containeren starter som root bare for å rette eierskapet på `/data`. Deretter kjører den som `PUID:PGID`. Standard er 1000:1000, og på Unraid 99:100.
- **Cloudflare Tunnel er valgfritt:** `cloudflared` starter bare med `docker compose --profile tunnel up -d`.
- **LAN-tilgang:** som standard lytter appen bare på `127.0.0.1`. Sett `BIND_ADDR=0.0.0.0` (og eventuelt `HOST_PORT`) i `.env` for å nå den fra nettverket.
- **Uten HTTPS** (direkte `http://` på LAN) må `COOKIE_SECURE=false` settes, ellers fungerer ikke innloggingen. Proxmox-skriptet gjør dette automatisk når du ikke oppgir et tunnel-token.

## Pålitelig enhet på lokalt nett
Ved innlogging er «Husk denne enheten på lokalt nett» krysset av som standard. Passordet hoppes da over neste gang, men **bare** når enheten både har en gyldig enhetscookie og kobler til fra en lokal adresse (192.168.x.x, 10.x.x.x eller 172.16–31.x.x).
- Fra internett kreves alltid passord. Det gjelder også via Cloudflare Tunnel, der `CF-Connecting-IP` inneholder klientens offentlige adresse.
- **Lås** i menyen pauser enheten til neste innlogging med passord.
- Under **Innstillinger → Innlogging** kan du slå funksjonen av og på for enheten du bruker, og fjerne andre enheter.
- ⚠️ **Ikke eksponer porten direkte mot internett** med portviderekobling i ruteren. Bruk Cloudflare Tunnel. Docker kan vise trafikk utenfra med en intern 172.x-adresse, og da vil den bli regnet som lokal.

## FinansHub (Økonomi)
Økonomi-fanen åpner **FinansHub** på `/finans/` i fullskjerm, uten homelab-headeren. Den runde **×** øverst til høyre tar deg tilbake til Hjem.

| Side | Innhold |
|---|---|
| Oversikt | Total saldo, inn, brukt og igjen av budsjett · inn/ut-graf · kontoer · siste transaksjoner · handlinger · budsjett · gjennomgangskø · kommende trekk |
| Transaksjoner | Søk, filter (konto, type, kategori), detaljpanel (kategori, dato, konto, notat, «Lag regel», slett), ny transaksjon, CSV-eksport |
| Kvitteringer | Skann/last opp (også dra og slipp), AI-utlesing i kø, bekreft-panel med bankmatch, «Les på nytt» med den andre motoren, avvis, bokfør |
| Budsjett | Månedsbudsjett per kategori med fargevarsel ved 80 % og over 100 % |
| Faste utgifter | Abonnementer og regninger, av/på, trekkdager, automatisk oppdagelse fra gjentakende trekk |
| Kontoer | Kontokort med saldo (startsaldo + transaksjoner) og sparemål |
| Rapporter | Måned/år, fordeling per kategori, mest brukt hos, månedstabell, CSV og PDF (utskrift) |
| Innstillinger | Generelt · AI-motor · Kategorier · Regler · Bank og import · Varsler · Mobil og tilgang · Data |

**Kvitteringsflyt:**
1. Nettleseren sender originalen, en nedskalert JPEG (~1600 px) og et miniatyrbilde.
2. Serveren leser kvitteringen med **Ollama** (lokalt) eller **Gemini** (sky), med valgfri reserve og ett nytt forsøk ved ugyldig svar.
3. Regler går foran AI-forslaget for kategori.
4. Kvitteringen matches mot en banktransaksjon: samme beløp ±1 kr og dato ±3 dager. Har kortet samme fire siste siffer, får det forrang.
5. Ingenting bokføres uten at du trykker **Bokfør**. Kategorier du retter, blir nye regler.
6. Går AI-motoren ned, havner kvitteringen i køen med beskjed om å fylles ut manuelt.

**CSV-import:** støtter DNB, Nordea, SpareBank 1, Sbanken og Bank Norwegian. Kolonnene finnes automatisk ut fra overskriftene. Duplikater hoppes over, og butikknavnet ryddes («VARER REMA 1000 MAJORSTUEN» blir «Rema 1000 Majorstuen»).

**Mobil:** `/finans/` kan installeres som egen app (PWA) og viser **bare FinansHub**.
- På iPhone og iPad brukes iOS-temaet med glassflater (Liquid Glass), flytende fanelinje og egen skanneknapp.
- På Android brukes Material 3 Expressive med tonale flater, utvidet skanneknapp og navigasjonslinje.
- Fra 600 px bredde (åpen brettbar eller nettbrett) byttes det til navigasjonsrail med liste til venstre og detaljer til høyre.
- Temaet kan overstyres under **Meg**.

**Native apper:** se [apps/README.md](apps/README.md). iOS (SwiftUI, Liquid Glass) og Android (Compose, Material 3, støtte for brettbare). Begge logger inn mot `/finans/api` og ser bare FinansHub.

**Tokens:** en iOS-snarvei eller en annen klient kan laste opp kvitteringer med et token (Innstillinger → Mobil og tilgang), med tilganger som `finance:read`, `receipts:write` og `finance:write`. Tokenet gir aldri tilgang til resten av homelab.

**AI-oppsett (`.env` eller Innstillinger → AI-motor):** `AI_PROVIDER`, `AI_FALLBACK`, `OLLAMA_URL`, `OLLAMA_MODEL`, `GEMINI_API_KEY` og `GEMINI_MODEL`. Gemini-nøkkelen kan også legges inn fra siden. Den lagres på serveren og sendes aldri tilbake til nettleseren. Velger du Ollama uten reserve, forlater ingen kvitteringer hjemmenettet.

## Integrasjoner
| Modul | Kilde | Env |
|---|---|---|
| Avganger | Entur Journey Planner v3 (`trip`) | `ENTUR_CLIENT_NAME`, `RUTER_ROUTES` |
| Vær | MET Locationforecast 2.0 | `MET_USER_AGENT`, `LAT`/`LON` |
| Timeplan, kalender, agenda, prøver | iCal fra Canvas/Outlook (cache 15 min) | `SCHOOL_ICAL_URL`, `MAZEMAP_CAMPUS_ID` |
| Trading 212 | `/equity/account/cash` + `/equity/portfolio` (cache 60 s) | `TRADING212_API_KEY` |
| Energi | Home Assistant REST | `HA_URL`, `HA_TOKEN`, `HA_SENSOR_*` |
| Starlink | CelesTrak TLE (cache 6 t) + satellite.js i nettleseren | – |
| APOD / galleri | api.nasa.gov / images-api.nasa.gov | `NASA_API_KEY` |
| Kommer ut | Sonarr/Radarr `/api/v3/calendar` (cache 10 min) | `SONARR_*`, `RADARR_*` |
| Nyhetslinje | NRK og VG RSS (cache 5 min) | – |
| Helsesjekk | HTTP-ping fra serveren (godtar selvsignert TLS) | `ROUTER_URL`, `PROXMOX_URL`, … |

En integrasjon uten konfigurasjon viser en forklaring i kortet sitt i stedet for å feile.

Alle integrasjonene kan også settes opp fra siden under **Innstillinger → Integrasjoner**. Verdier som lagres der, overstyrer `.env` og lagres i databasen. Hemmeligheter (API-nøkler, tokens og iCal-URL) sendes aldri tilbake til nettleseren: feltet viser bare «lagret», og du kan fjerne verdien slik at `.env` brukes igjen.

## Tilpasning
- **Endre rekkefølge:** dra og slipp elementer i headeren, fanene, toppområdet på dashboardet (avganger, søkebar, klokke/vær) og alle kortrutenett.
- **Endre størrelse:** dra i det usynlige hjørnet nederst til høyre på et kort (desktop). Bredden snapper til hele kolonner, og høyden er fri. Dobbeltklikk på hjørnet nullstiller kortet. Kortene pakkes tett (masonry), så ulike høyder kan kombineres.
- **Tilbakestill layout** i profilmenyen nullstiller både rekkefølge og størrelser.
- **Søkebar:** fire stiler velges under Innstillinger → Utseende. Søkebaren kan skjules fra profilmenyen.
- **Nyhetslinje:** kan skjules fra profilmenyen. Den stopper ved hover og står stille når «redusert bevegelse» er slått på i systemet.
- **Popup:** klikk på en kalenderdag, en agenda-rad, en aksje eller en plakat for å se detaljer.

## Struktur
```
server/   index.js (ruter og API), auth.js, password.js, db.js, integrations.js, settings.js, mock.js
server/finans/  db.js (tabeller), routes.js (/finans/api), ai.js (Ollama/Gemini), csv.js (bankimport), demo.js
public/   app.html, login.html, cv.html, css/, js/ (én modul per fane), manifest + sw.js
public/finans/  index.html, css/ (desktop + mobiltemaer), js/ (core, desktop, mobile), manifest + sw.js
```
