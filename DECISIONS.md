# Beslutninger

## Hosting: A – Docker-container på homelab bak Cloudflare Tunnel

**Valg:** Én Node 22-container (Hono + SQLite via better-sqlite3) kjørt med `docker-compose` på Proxmox (LXC/VM), eksponert gjennom `cloudflared` (Cloudflare Tunnel). Anbefalt: Cloudflare Access foran alt unntatt `/cv`.

**Begrunnelse**
- Halvparten av dashboardet er LAN: Home Assistant, helsesjekk av ruter, Proxmox, Pi-hole, NAS og LabDeck. En Worker når ikke 192.168.1.x uten å eksponere hver tjeneste gjennom en tunnel, og da trengs en container på homelab uansett. Én container er enklere enn en hybrid med to deploy-mål.
- Kvitteringer og bakgrunnsbilder lagres på lokal disk (`/data/uploads`), og data lagres i SQLite (`/data/homelab.db`). Backup tas av én mappe, for eksempel med Proxmox Backup.
- Tunnelen gir TLS og skjuler hjemme-IP-en uten åpne porter i ruteren.
- Ulempen er at alt, også CV-en, er nede når homelab er nede. Det er akseptert for et personlig dashboard. Om CV-en må være alltid oppe, kan `public/cv.html` og en statisk JSON-eksport legges på Cloudflare Pages senere.

## Andre valg
- **Ingen byggesteg i frontend:** vanilla ES-moduler. Det gir færre avhengigheter å vedlikeholde og raskere oppstart. Visningene er delt opp per fane i `public/js/`.
- **Responsiv layout i stedet for en egen mobilapp:** under 768 px byttes pillenavigasjonen ut med bunnmenyen (Hjem · Studie · Økonomi · Mer), slik det er vist i `Homelab Mobil.dc.html`. Rom og Nettverk ligger under «Mer».
- **Sesjoner:** tilfeldig 256-bit ID i en httpOnly-, Secure- og SameSite=Lax-cookie. Databasen lagrer bare en HMAC av ID-en. Passordet hashes med scrypt. Innlogging begrenses til 5 feil per IP per 15 min (bruker `CF-Connecting-IP`).
- **Hemmeligheter** leses bare på serveren. Nettleseren snakker kun med `/api/*`. CSP-en tillater `connect-src 'self'`.
- **Miniatyrbilder** lages i nettleseren (canvas → JPEG) før opplasting. Det sparer en native avhengighet som sharp.
- **Trading 212 har ikke dagsendring i API-et.** Serveren lagrer første totalverdi hver dag og regner endringen ut fra den. Innskudd samme dag telles med.
- **Energi:** den daglige sensoren antas å nullstilles ved midnatt. Høyeste verdi per dag er dagens forbruk.
- **Bakgrunnsbilder** hentes fra Wikimedia Commons (`Special:FilePath`). Disse bildene er CC0/PD eller CC BY(-SA). Sjekk krediteringskravet per fil, eller last dem ned til `public/` for egen hosting.
- **OCR av kvitteringer** (valgfritt i spesifikasjonen) er ikke implementert ennå.

## Distribusjon
- **Tre måter å kjøre på:** `docker compose` manuelt, `deploy/proxmox/install.sh` (lager en LXC automatisk) og en Unraid-mal (`deploy/unraid/homelab-os.xml`).
- **Image-registry:** Unraid trenger et ferdigbygd image. GitHub Actions publiserer derfor til `ghcr.io/sebastiankristo/torskenes-verden` (amd64 og arm64). Proxmox bygger lokalt fra kildekoden.
- **PUID/PGID:** entrypointen bruker `setpriv` (allerede i Debian, ingen ekstra pakke) for å bytte bruker etter å ha rettet eierskapet på `/data`.
- **Passord-hash med `:`** fordi Compose interpolerer `$` i env-filer.

## Prompt 03
- **Innstillinger fra siden:** integrasjonsinnstillinger lagres i databasen (`kv` → `cfg`) og overstyrer env. Hemmeligheter returneres aldri til klienten. Ved lagring tømmes cachen, slik at endringer vises med en gang.
- **Ruter-strekninger** konfigureres som tekst («Fra (NSR-ID) > Til (NSR-ID)») i stedet for en liste med stopp, fordi dashboardet viser strekninger.
- **Plakater** lastes direkte fra Sonarr/Radarr sine `remoteUrl`-er (TMDB/TheTVDB). CSP tillater derfor `img-src https:`.
- **Pålitelig enhet på lokalt nett** (godkjent av eieren): passordet hoppes over bare når enheten har en gyldig enhetscookie **og** klientadressen er lokal.
  - Enhetscookien er tilfeldig, httpOnly og gyldig i 1 år. Databasen lagrer bare en HMAC av den.
  - Adressen tas fra `CF-Connecting-IP`, som Cloudflare alltid setter og overskriver, eller ellers fra TCP-tilkoblingen. `X-Forwarded-For` brukes aldri.
  - «Lås» pauser enheten til neste innlogging med passord.
  - Innlogging uten «Husk denne enheten» fjerner enheten.
- **Navn:** standard `USER_NAME` er nå Sebastian. CV-ens standardtekst har nøytral e-post.

## Prompt 04 – FinansHub
- **FinansHub i samme Node-server og SQLite-database**, ikke som en egen FastAPI/Postgres/Redis-stack. Handoffen åpner for SQLite («holder for start»), og én container betyr én innlogging, én backup og ingen ekstra tjenester å drifte. Datamodellen følger `finanshub/README.md` med prefikset `fh_`. API-et ligger på `/finans/api/*` som foreslått, slik at FinansHub senere kan skilles ut uten at klientene endres.
- **Beløp lagres i øre (heltall)** for å unngå avrundingsfeil.
- **Jobbkø:** en enkel kø i prosessen i stedet for ARQ/Redis. Bilag som avbrytes av en omstart, gjenopptas ved oppstart.
- **Bildebehandling i nettleseren:** EXIF-rotasjon, nedskalering til 1600 px og miniatyrbilde gjøres med canvas før opplasting. Pillow/sharp trengs ikke, og originalen lagres urørt.
- **Mobilappene er én PWA med to temaer**, ikke native SwiftUI/Compose-apper. Handoffen nevner dette som et alternativ («Alternativt én PWA med to temaer»), og det kan bygges og testes i samme kodebase. Native apper kan komme senere mot det samme `/finans/api` med tokens.
- **Mobil-tokens** har egne tilganger (`finance:read`, `finance:write`, `receipts:write`). Tokenet lagres som HMAC og gir ikke tilgang til `/api/*` i homelab.
- **Den gamle Økonomi-fanen er fjernet.** Eksisterende kvitteringer flyttes automatisk til FinansHub ved første oppstart (bilder kopieres til `data/receipts/migrert/`).
- **PSD2/Enable Banking (fase 3) og e-postinnboks** er ikke implementert. Innstillingene viser «Ikke koblet».

## Åpne spørsmål / plassholdere
- Skole: `MAZEMAP_CAMPUS_ID` og `SCHOOL_URL` står tomme (lenken peker til vilbli.no).
- NSR-ID-ene (Majorstuen 58381, Amagerveien 6354, Frydenlund 6258, Holbergs plass 63280) er brukt som oppgitt. De kunne ikke verifiseres fra utviklingsmiljøet fordi det ikke hadde nettilgang. Sjekk dem i Entur-geocoderen, og overstyr med `RUTER_ROUTES` eller `STOPS` i `server/integrations.js`.
- Linjene kommer fra sanntidsdata, så de stemmer automatisk.
- HA-sensornavn og LabDeck-URL settes i `.env`.
