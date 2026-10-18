# <img src="assets/icons/api.svg" width="32" align="top"> Konfigurasjon

[← Til README](../README.md)

Konfigurasjonen kommer fra to steder:

1. **`.env`**: miljøvariabler som leses ved oppstart. Mal: [`.env.example`](../.env.example).
2. **Innstillinger i grensesnittet**: lagres i databasen og **overstyrer** `.env`. Hemmeligheter vises bare som «lagret», og sendes aldri tilbake til nettleseren. Tømmer du feltet, brukes `.env` igjen.

> [!NOTE]
> Bare grunnoppsettet (passord, hemmelighet og nettverk) **må** stå i `.env`. Nesten alt annet kan legges inn fra siden etter første innlogging.

## Grunnoppsett

| Variabel | Påkrevd | Standard | Beskrivelse |
|---|:-:|---|---|
| `APP_PASSWORD_HASH` | ✅ første gang | – | Passord til eier-kontoen. Lages med `npm run hash-password -- 'passord'`. Etter første oppstart ligger passordet i brukertabellen og byttes i Innstillinger. |
| `SESSION_SECRET` | ✅ | – | Minst 32 tilfeldige tegn (`openssl rand -hex 32`). Brukes til sesjoner og tokens, og som grunnlag for krypteringsnøkler hvis de under mangler. |
| `USER_NAME` | | `Sebastian` | Visningsnavn for eieren. Brukernavnet blir det samme med små bokstaver. |
| `COOKIE_SECURE` | | `true` | Sett `false` bare når du bruker `http://` uten TLS. |
| `PORT` | | `3000` | Port i containeren / prosessen. |
| `DATA_DIR` | | `./data` (`/data` i Docker) | Database, kvitteringer, logoer og bakgrunner. |
| `MOCK_DATA` | | – | `1` gir eksempeldata uten eksterne kall. |
| `TOTP_ENC_KEY` | | avledet | 64 hex-tegn. Krypterer 2FA-hemmeligheter. |
| `SECRET_KEY` | | avledet | Krypterer lagrede nøkler i FinansHub (Gemini, Trading 212, SMB, IMAP). |
| `MAX_UPLOAD_MB` | | `40` | Største opplasting (original, JPEG-kopi og miniatyr til sammen). |

> [!IMPORTANT]
> Bytter du `SESSION_SECRET` (og ikke har satt `TOTP_ENC_KEY` og `SECRET_KEY`), kan ikke lagrede 2FA-hemmeligheter og nøkler leses lenger. Sett dem eksplisitt hvis du vil kunne rotere sesjonshemmeligheten.

## Docker og nettverk

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `BIND_ADDR` | `127.0.0.1` | `0.0.0.0` for LAN-tilgang. |
| `HOST_PORT` | `3000` | Port på verten. |
| `PUID` / `PGID` | `1000` | Eier av `/data`. |
| `CLOUDFLARE_TUNNEL_TOKEN` | – | Token for `cloudflared` (profil `tunnel`). |

## Integrasjoner (Homelab)

Alt her kan også settes i **Innstillinger → Integrasjoner**.

| Gruppe | Variabler | Merknad |
|---|---|---|
| Vær (MET/Yr) | `PLACE`, `LAT`, `LON`, `MET_USER_AGENT` | MET krever en User-Agent med kontaktinfo. |
| Ruter (Entur) | `RUTER_ROUTES`, `ENTUR_CLIENT_NAME` | Én strekning per linje: `Fra (NSR-ID) > Til (NSR-ID)`. |
| Kalender | `SCHOOL_ICAL_URL`, `MAZEMAP_CAMPUS_ID`, `SCHOOL_URL` | iCal fra Canvas eller Outlook, cache 15 min. |
| Home Assistant | `HA_URL`, `HA_TOKEN`, `HA_SENSOR_POWER`, `HA_SENSOR_ENERGY_DAILY`, `HA_SENSOR_PRICE` | Long-lived access token. |
| Sonarr / Radarr | `SONARR_URL`, `SONARR_API_KEY`, `SONARR_DAYS`, `RADARR_URL`, `RADARR_API_KEY`, `RADARR_DAYS` | `/api/v3/calendar`, cache 10 min. |
| Trading 212 (dashboard) | `TRADING212_API_KEY`, `TRADING212_BASE` | Sammendrag på dashboardet. |
| NASA / CelesTrak | `NASA_API_KEY`, `SAT_GROUP` | `DEMO_KEY` virker, men har lav grense. |
| Cloudflare (Domener) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_DOMAIN` | Standard-token for domener uten eget token. |
| Søk | `SEARCH_URL` | Søket legges til på slutten. |
| Helsesjekk | `ROUTER_URL`, `PROXMOX_URL`, `PIHOLE_URL`, `NAS_URL`, `HOMEY_URL`, `LABDECK_URL` | Pinges fra serveren, selvsignert TLS godtas. |

## FinansHub

Kan også settes i **FinansHub → Innstillinger**.

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `AI_PROVIDER` | `ollama` | `ollama` eller `gemini`. |
| `AI_FALLBACK` | `gemini` | `gemini` eller `none`. Med `none` og Ollama forlater ingen kvitteringer hjemmenettet. |
| `AI_MIN_CONFIDENCE` | `0.85` | Under dette markeres kvitteringen for kontroll. |
| `OLLAMA_URL` / `OLLAMA_MODEL` | – / `qwen2.5vl:7b` | Lokal visjonsmodell. |
| `OLLAMA_TIMEOUT` | `120` | Sekunder per kall. |
| `OLLAMA_EMBED_MODEL` | – | Valgfri modell for vektorsøk i ✦ AI-søk. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | – / `gemini-2.5-flash` | Skybasert reserve eller hovedmotor. |
| `TRADING212_API_KEY` / `TRADING212_API_SECRET` / `TRADING212_ENV` | – / – / `live` | Aksjer-siden. `demo` bruker demo-kontoen. |
| `SMB_SHARE` / `SMB_USER` / `SMB_PASSWORD` / `BACKUP_PASSPHRASE` | – | Standardverdier for backup til SMB-share. |
| `FINN_IMAP_PASSWORD` | – | Lagres for fremtidig IMAP-henting av Finn-e-poster. |

## Innstillinger i grensesnittet

### Homelab → Innstillinger
| Fane | Innhold |
|---|---|
| **Utseende** | Bakgrunn (Måne, Jorda, Saturn, Oslo, Vær, eget bilde, ingen), søkebar-stil, topplinje (avstand, fanebredde, «✥ Flytt elementer»), nyhetsbar (vis, hastighet 1–10, pause ved hover), verdenskart i Domener |
| **Integrasjoner** | Alle gruppene over |
| **Innlogging** | Pålitelig enhet, enhetsliste, brukere (admin), 2FA, bytt passord |

### FinansHub → Innstillinger
| Fane | Innhold |
|---|---|
| Generelt | Navn, valuta, månedsstart |
| AI-motor | Ollama/Gemini, reserve, minimum sikkerhet, ✦ sammendrag, test |
| Kategorier / Regler | Farger, typer, auto-kategorisering med `*` som jokertegn |
| Bank og import | CSV-import, IMAP-felter |
| Varsler | Budsjett over 80/100 %, kvitteringer |
| Mobil og tilgang | API-tokens med tilganger og utløp |
| Backup og data | Nedlasting, SMB-share, gjenoppretting, se [backup.md](backup.md) |
