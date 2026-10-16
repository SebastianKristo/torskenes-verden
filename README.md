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
Repoet er privat, så skriptet kan ikke hentes med `curl` fra raw.githubusercontent.com (det gir 404). Klon repoet på Proxmox-verten med et GitHub-token og kjør skriptet derfra. Tokenet er en fine-grained PAT med *Contents: read* på dette repoet.
```bash
git clone -b claude/wizardly-darwin-kr7ay8 https://<TOKEN>@github.com/SebastianKristo/torskenes-verden.git
bash torskenes-verden/deploy/proxmox/install.sh
```
Bytt `-b claude/wizardly-darwin-kr7ay8` med `main` etter merge. Skriptet kopierer koden fra den lokale kopien inn i containeren, så containeren trenger ikke tilgang til GitHub. Det gjør dette:
- oppretter en uprivilegert Debian 12-LXC med nesting
- installerer Docker
- legger koden i `/opt/homelab-os`
- spør om passord og eventuelt Cloudflare Tunnel-token
- skriver `.env` og starter tjenesten

Kjører du skriptet uten lokal kopi, kloner det `REPO` direkte. Da må `GITHUB_TOKEN` være satt for et privat repo.

Valg kan overstyres med miljøvariabler, for eksempel `CTID=150 STORAGE=local-zfs IP=192.168.1.60/24 GW=192.168.1.1`. Resten av API-nøklene legger du inn etterpå i `/opt/homelab-os/.env`.

### Oppdatere Proxmox-installasjonen
```bash
cd torskenes-verden && git pull
tar --exclude=node_modules --exclude=data --exclude=.env -czf /tmp/os.tgz .
pct push <CTID> /tmp/os.tgz /tmp/os.tgz
pct exec <CTID> -- bash -c 'tar -xzf /tmp/os.tgz -C /opt/homelab-os && cd /opt/homelab-os && docker compose up -d --build'
```
`.env` og `data/` i containeren blir ikke rørt.

## Unraid
1. Kopier `deploy/unraid/homelab-os.xml` til `/boot/config/plugins/dockerMan/templates-user/` på Unraid.
2. Gå til **Docker → Add Container** og velg `homelab-os` som mal.
3. Generer passord-hashen:
   ```bash
   docker run --rm ghcr.io/sebastiankristo/torskenes-verden node scripts/hash-password.js 'passord'
   ```
   Lim inn verdien etter `APP_PASSWORD_HASH=` i malen.

Bildet bygges og publiseres til GHCR av `.github/workflows/docker.yml` ved hver push til `main`. Etter første kjøring må pakken settes til *public* under GitHub → Packages, eller så må du logge inn på ghcr.io fra Unraid. Data lagres i `/mnt/user/appdata/homelab-os` og eies av PUID/PGID (som standard 99:100).

## Viktige detaljer for drift
- **Passord-hashen bruker `:` som skilletegn** (`scrypt:N:r:p:salt:hash`). Docker Compose tolker `$` i `.env`, og det ødela det gamle formatet. Hasher med `$` virker fortsatt, men de bør genereres på nytt hvis de skal leses av Compose.
- **Rettigheter på `/data`:** containeren starter som root bare for å rette eierskapet på `/data`. Deretter kjører den som `PUID:PGID`. Standard er 1000:1000, og på Unraid 99:100.
- **Cloudflare Tunnel er valgfritt:** `cloudflared` starter bare med `docker compose --profile tunnel up -d`.
- **LAN-tilgang:** som standard lytter appen bare på `127.0.0.1`. Sett `BIND_ADDR=0.0.0.0` (og eventuelt `HOST_PORT`) i `.env` for å nå den fra nettverket.
- **Uten HTTPS** (direkte `http://` på LAN) må `COOKIE_SECURE=false` settes, ellers fungerer ikke innloggingen. Proxmox-skriptet gjør dette automatisk når du ikke oppgir et tunnel-token.

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
| Helsesjekk | HTTP-ping fra serveren (godtar selvsignert TLS) | `ROUTER_URL`, `PROXMOX_URL`, … |

En integrasjon uten konfigurasjon viser en forklaring i kortet sitt i stedet for å feile.

## Struktur
```
server/   index.js (ruter og API), auth.js, password.js, db.js, integrations.js, mock.js
public/   app.html, login.html, cv.html, css/, js/ (én modul per fane), manifest + sw.js
```
