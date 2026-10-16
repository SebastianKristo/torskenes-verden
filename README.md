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
4. Kjør `docker compose up -d --build`.
5. Anbefalt: under **Access → Applications** lager du en app for `os.dittdomene.no` med en policy for e-posten din. Legg til en bypass-policy for stien `/cv*` og for `/assets/*`, slik at CV-en forblir offentlig.

Data (SQLite og opplastinger) ligger i `./data`. Ta backup av den mappen.

Oppdatering: `git pull && docker compose up -d --build`.

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
