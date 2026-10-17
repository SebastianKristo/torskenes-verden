# Handoff: Personlig homelab-dashboard («OS»)

> **Start her:** gi Claude Code innholdet i `PROMPT-CLAUDE-CODE.md` som prompt, og legg ved hele mappen. Siste endringer (prompt 06) står i `CHANGES-prompt-06.md`. Designfilene i `design/` er HTML-referanser: åpne dem i en nettleser sammen med `support.js`.


Prompt til Claude Code. Les hele dokumentet før du begynner.

> **Start med `PROMPT-CLAUDE-CODE.md`.** Den samler alt fra prompt 01–05: brukere, 2FA, tokens, Trading 212, AI-søk, backup, delte boligmapper, Domener og mobilinnstillinger. Dette dokumentet er grunnlaget den viser til.

## Oppgave
Bygg et personlig, passordbeskyttet dashboard for homelab og hverdagsliv (elev i Oslo), med desktop- og mobilversjon og en offentlig CV-side. Designet finnes som HTML-prototyper i `design/`. De er **designreferanser**, ikke produksjonskode: gjenskap utseende og oppførsel i et ordentlig prosjekt med backend, ekte API-integrasjoner og sikker innlogging.

**Oppdatert 17.10.2026:** les også `CHANGES-prompt-03.md` (innstillinger, Sonarr/Radarr, nyhetslinje, søkebar-stiler, resize/masonry, kalender-popup, ny kortfarge). Hemmeligheter i tillegg: `SONARR_API_KEY`, `RADARR_API_KEY`. Ordrette ønsker i `prompts/`.

**FinansHub (Økonomi):** les `CHANGES-prompt-04.md` → `finanshub/README.md` (backend/AI/DB/API) → `FINANSHUB-MOBIL.md`. Design: `design/FinansHub v2.dc.html`, `design/FinansHub Mobil.dc.html`. Hemmeligheter i tillegg: `GEMINI_API_KEY`, `DB_PASSWORD`, `SECRET_KEY`, `OLLAMA_URL`.

**Rekkefølge:** 1) DECISIONS.md (hosting) 2) homelab-skall + innlogging 3) dashboard-widgets 4) FinansHub backend + desktop 5) mobilapper.

**Oppdatert 17.10.2026 (FinansHub):** les `CHANGES-prompt-04.md`, `FINANSHUB-MOBIL.md` og `finanshub/README.md`. Designfiler: `design/FinansHub v2.dc.html`, `design/FinansHub Mobil.dc.html`.

Fidelity: **high-fidelity**. Farger, typografi, radius og layout skal følges nøye. All UI-tekst er på **norsk (bokmål)**.

## Steg 0 – velg hosting selv (begrunn valget i `DECISIONS.md`)
Vurder disse to alternativene og velg det som passer best. Skriv ned valget og begrunnelsen før du koder.

**A. Docker-container på homelab (Proxmox LXC/VM) + eget domene**
- Én container (f.eks. Node/Hono, Next.js eller SvelteKit + SQLite) med `docker-compose.yml`.
- Eksponeres via **Cloudflare Tunnel** (`cloudflared`) eller reverse proxy (Caddy/Traefik) med TLS.
- Fordel: når Home Assistant, Homey, ruter, Proxmox og LabDeck direkte på LAN (192.168.1.x). Kvitteringer lagres lokalt.
- Ulempe: nede når homelab er nede, og du må vedlikeholde den selv.

**B. GitHub-repo → Cloudflare Pages + Workers (+ D1/R2/KV)**
- Statisk frontend på Pages, API i Workers, kvitteringsbilder i R2, data i D1.
- Fordel: gratis, raskt, alltid oppe, CV-siden er tilgjengelig selv om homelab er nede.
- Ulempe: Workers når ikke LAN. Home Assistant og lokale tjenester må nås via Cloudflare Tunnel eller HA sin eksterne URL.

**Hybrid er lov** (f.eks. Pages for frontend og CV, og en liten container på homelab bak Tunnel for HA-, Homey- og LAN-kall). Uansett valg:
- Alle hemmeligheter (Trading 212-nøkkel, HA-token, iCal-URL, NASA-nøkkel) ligger **kun på serveren** i env/secrets og sendes aldri til nettleseren.
- Passord: server-side sesjon (httpOnly-cookie, hashet passord, rate limiting). Vurder **Cloudflare Access** foran alt unntatt `/cv`.
- Lever `README` med oppsett, `.env.example` og deploy-steg.

### Pålitelig enhet på lokalt nett
- Ved innlogging: avkrysning «Husk denne enheten på lokalt nett» (på som standard). Setter en langvarig, signert device-cookie (httpOnly, 1 år) og lagrer enheten i DB.
- Serveren hopper over passord **kun** når både (a) gyldig device-cookie og (b) klient-IP er i LAN (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12). Bak Cloudflare Tunnel: bruk `CF-Connecting-IP`; LAN-trafikk bør gå direkte til containeren, ikke via tunnelen.
- Innstillinger → «Pålitelig enhet» av/på, og liste over pålitelige enheter med «Fjern».
- Fra internett kreves alltid passord.

## Sider og ruter
| Rute | Tilgang | Kilde-fil |
|---|---|---|
| `/login` | offentlig | låseskjerm i `Homelab v2.dc.html` |
| `/` (Dashboard, Studie, Rom, Økonomi, Nettverk) | innlogget | `Homelab v2.dc.html` |
| Mobil: samme ruter, responsivt eller egen layout < 768 px | innlogget | `Homelab Mobil.dc.html` |
| `/cv` | **offentlig, kun lesing** | `CV.dc.html` |
| `/cv` redigering | kun når innlogget | `CV.dc.html` (redigeringsmodus) |

Mobil skal være en installerbar PWA (manifest, ikon, `apple-mobile-web-app-capable`, safe-area-insets).

## Skjermbilder
- `screenshots/referanse-layout.png`: brukerens stilreferanse (pillenavigasjon, stor klokke, fotobakgrunn, mørke kort med stor radius).
- `screenshots/01-desktop.png` til `05-desktop.png`: Dashboard, Studie, Rom, Økonomi, Nettverk. Eksterne bilder vises blanke i skjermbildene. Åpne HTML-filene i en nettleser for riktig gjengivelse.

## Moduler og datakilder

### Topplinje (alle sider)
- «OS»-logo (44×44, radius 12, hvit bakgrunn og svart JetBrains Mono-tekst).
- Pillenavigasjon: Dashboard · Studie · Rom · Økonomi · Nettverk. Aktiv fane har hvit bakgrunn og svart tekst.
- Værpille (temperatur, tilstand, vind).
- Profilknapp (hamburger + avatar «B») åpner en meny med: Innstillinger, Tilbakestill layout, CV ↗, Lås.

### Dashboard
1. **Ruter-avganger** øverst, uten kortbakgrunn. Fire strekninger med de tre neste avgangene hver. Hver strekning lenker til reise.ruter.no med reisesøk:
   - Amagerveien → Majorstuen
   - Frydenlund → Majorstuen
   - Majorstuen → Amagerveien
   - Majorstuen → Holbergs plass

   Stopp-ID-er (NSR): Majorstuen `58381` (10.71634, 59.929213), Amagerveien `6354` (10.660875, 59.952497), Frydenlund `6258` (10.733173, 59.920864), Holbergs plass `63280` (≈10.7355, 59.91795). Verifiser ID-ene.

   URL-format: `https://reise.ruter.no/?fromId=__NSR-StopPlace-<id>__&fromType=__STOP_PLACE__&fromName=__<navn>__&fromLongitude=..&fromLatitude=..&toId=...`

   Sanntid: **Entur Journey Planner GraphQL** (`https://api.entur.io/journey-planner/v3/graphql`, header `ET-Client-Name`). Bruk `trip(from,to)` og vis linjenummer og minutter. Linjebadge: T-bane gul `#f3d38a`, trikk/buss blå `#a8d4fb`.
2. **Hilsen + klokke**: «God morgen / Hei / God kveld, **Benjamin**», dato, «Oslo». Klokka er 96 px Outfit 300, med sekunder i hevet skrift.
3. **Skoletime nå**: kort under klokka med fag, rom, tid, «x min igjen», framdriftslinje og knappen «MazeMap ↗». Er det ingen time nå, vises neste time; etter siste time vises «Ingen flere timer i dag».
   - Data hentes fra skolens **iCal-URL** (Canvas/Outlook), som parses server-side og caches i 15 min. Rom hentes fra `LOCATION` i hendelsen.
   - MazeMap-lenke: `https://use.mazemap.com/#v=1&search=<rom>` (legg til `campusid` når skolen er kjent).
4. **Værkort** (glasskort `rgba(40,44,52,.55)` + `backdrop-filter: blur(18px)`): nåværende vær, 6 timer og 4 dager. Kilde: **MET Locationforecast 2.0** (`api.met.no/weatherapi/locationforecast/2.0/compact`, krever User-Agent-header, så kallet må gå via server). Lenke til yr.no.
5. **Skolekalender**: månedsrutenett med fargeprikker per hendelse, dagens dato markert med `#a8d4fb`. Kilde: samme iCal.
6. **Agenda**: kommende hendelser med etiketter som «NÅ» og «FRIST».
7. **Trading 212**: totalverdi, dagsendring og beholdning. API: `https://live.trading212.com/api/v0/equity/account/cash` og `/equity/portfolio`, med header `Authorization: <API_KEY>`. Kun server-side, cache 60 s, og respekter rate limits.
8. **Energi**: nåforbruk (kW), uke (kWh), strømpris og søyler for 7 dager. Kilde: **Home Assistant REST** (`/api/states/<sensor>`, `/api/history/period`) med long-lived token. Sensornavn skal kunne konfigureres i env.
9. **Økonomi-sammendrag**: brukt av budsjett, framdriftslinje og sum per kategori. Knappen «Åpne ↗» går til Økonomi-fanen.
10. **Snarveier** (4-kolonners rutenett med forkortelser): NRK, VG, FINN, Komplett, Yr, Canvas, Claude, ChatGPT, Gemini, Ruter (192.168.1.1), Home Assistant, Proxmox, Homey (my.homey.app), LabDeck.

### Studie
- Lenker: Canvas, Notion, skolens nettside, Visma InSchool, NDLA, Lånekassen.
- Karakterer per fag med prøvekarakterer og snitt. Disse registreres manuelt (CRUD).
- Kommende prøver, fra iCal og/eller manuelt.
- Studielån: gjeld, stipend og neste utbetaling (manuelle felt, eller import hvis Lånekassen tilbyr det).

### Rom (satellitt og teleskop)
- **Starlink over Norge**: hent TLE fra CelesTrak (`celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle`), cache 6 t server-side, og propager med `satellite.js` i nettleseren hvert 3. sekund. Vis:
  - antall satellitter geografisk over Norge (bounding box lat 57,9–71,2, lon 4,5–31,1)
  - antall over horisonten (>10°) fra valgt by (Oslo, Bergen, Trondheim, Tromsø)
  - en liste over de høyeste satellittene (høyde og retning)
  - et kart (canvas) med satellittprikker og byer

  Utvid gjerne med «synlig fra bakken», det vil si at satellitten er solbelyst mens observatøren er i mørke (sola under −6°), og med neste passeringer.
- **NASA APOD** (`api.nasa.gov/planetary/apod`, egen API-nøkkel og ikke DEMO_KEY i produksjon).
- Gallerier fra NASA Image Library (`images-api.nasa.gov/search`): Mars-rovere, James Webb, Hubble. Horisontal scrolling uten synlig scrollbar.

### Økonomi
- Last opp kvitteringer (bilde/PDF, og kamera på mobil via `capture="environment"`).
- Lagring: R2, S3 eller lokal disk. Lag miniatyrbilder.
- Felt per kvittering: butikk, dato, kategori og beløp, alle redigerbare direkte i listen.
- Kategorier: Mat `#8fe0b0`, Transport `#a8d4fb`, Bolig `#f3d38a`, Fritid `#e8a6d8`, Skole `#9fb4ff`, Annet `#8a93a6`. Gjør dem redigerbare.
- Månedsbudsjett (redigerbart), «x kr igjen» eller «over budsjett», søyler per kategori (klikk for å filtrere), søk på butikk, kategorifilter, CSV-eksport (`;`-separert, UTF-8 med BOM).
- Valgfritt: OCR av kvitteringen for å foreslå butikk og beløp, for eksempel med Claude vision API.

### Nettverk
- Homelab-tjenester med statusprikk: Ruter `192.168.1.1`, Home Assistant `:8123`, Proxmox `:8006`, Pi-hole, NAS, Homey, LabDeck. **Gjør ekte helsesjekk** server-side (HTTP-ping).
- Lenkegrupper: Nyheter og handel, AI og skole.

### Innstillinger (modal)
Velg bakgrunn: Måne, Jorda, Saturn, Oslo (lysbildeserie hvert 15. sekund med overtoning), Vær (bilde etter dagens værtilstand: sol, sky eller regn), Eget bilde, Ingen. Brukeren kan laste opp egne bilder til Oslo, Vær og Eget bilde. **Forhåndslast alle bakgrunnsbilder.** Legg alltid en gradient over bildet for lesbarhet. Desktop: `linear-gradient(180deg, rgba(7,8,11,.25), rgba(7,8,11,.75))`.

### Drag-and-drop av widgets
Widgets i alle rutenett kan flyttes. Desktop bruker HTML5 drag-and-drop, mobil long-press (450 ms) og dra. Rekkefølgen lagres per side **på serveren** per bruker, ikke bare i localStorage. «Tilbakestill layout» ligger i profilmenyen.

### CV (`/cv`)
- Lys stil: bakgrunn `#f4f3f0`, tekst `#16181d`, maks bredde 820 px.
- Innhold: navn, tittel, kontaktinfo, om meg, erfaring, utdanning og ferdigheter (som pills).
- Offentlig uten passord. Innlogget eier ser knappene «Rediger CV» og «Tilbakestill» og redigerer i skjema. Lagres i databasen.
- Legg gjerne til «Last ned som PDF» (print-stylesheet).

## Design-tokens
**Farger (mørkt tema)**
- Sidebakgrunn `#1a1d25` (bak bildet), låseskjerm `#07080b`
- Kort `rgba(12,15,24,.94)`, indre rader `#111522`, kanter `#232938`
- Tekst `#eef0f4`, sekundær `#b6bccb`, dempet `#8a93a6`, svak `#6b7385`
- Aksent blå `#a8d4fb`, grønn (pluss) `#8fe0b0`, rød (minus/feil) `#f59a8f`, gul `#f3d38a`, rosa `#e8a6d8`, lilla `#9fb4ff`
- Pillebakgrunn `rgba(10,12,18,.7)`

**Typografi**: Outfit (300/400/500/600/700) for UI, JetBrains Mono (400/500) for tall, klokkeslett, IP-adresser og etiketter.
- Klokke 96 px / 300 (mobil 76 px)
- Sidetittel 40 px / 300, med andre del i fet 700
- Korttittel 18 px / 600, undertittel 13 px `#b6bccb`
- Store tall 36–52 px / 300
- Brødtekst 14–15 px

**Radius**: kort 32 px (mobil 28), indre rader 14–16 px, rutenettceller 12 px, pills 999 px.
**Avstand**: kort-padding 26 px (mobil 20), mellomrom i rutenett 20 px (mobil 14), sidepadding 36 px (mobil 16).
**Rutenett**: `repeat(auto-fit, minmax(min(100%, 330px), 1fr))`.
**Scrollbarer**: skjult overalt, men scrolling fungerer (`scrollbar-width: none` og `::-webkit-scrollbar { display: none }`).

## Mobil
- Maks bredde 440 px. Fast bunnmeny med fire faner (Hjem, Studie, Økonomi, Mer) som pill, med blur.
- Ruter-strekninger i horisontal scroll med scroll-snap.
- Flytende «+»-knapp (60 px, blå) for kvitteringer på Økonomi.
- Bakgrunnsknapp øverst bytter mellom presetene.
- Rom-fanen finnes ikke på mobil ennå. Legg den til under «Mer» eller som egen fane.

## Bildekilder (Wikimedia Commons, sjekk lisens og kreditering)
Bruk `https://commons.wikimedia.org/wiki/Special:FilePath/<fil>?width=2400`, eller last ned bildene til egne assets (anbefalt).
- Måne: `upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg`
- Jorda: `upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg`
- Saturn: `upload.wikimedia.org/wikipedia/commons/c/c7/Saturn_during_Equinox.jpg`
- Oslo: `Oslo_Opera_House_-_2025.jpg` (CC0), `Panorama_taken_from_top_of_the_Oslo_Opera_House_(Operahuset)_(29585739880).jpg`, `Oslo_Opera_House_seen_from_Langkaia.JPG`, `The_Oslo_Opera_House_(Operahuset)_(29585744210).jpg`
- Vær: sol `Blue-skies-cumulus-clouds.jpg`, sky `Cumulus_congestus_cloud_in_sky.jpg`, regn `Raindrops_on_a_window.jpg`

## Miljøvariabler (`.env.example`)
```
APP_PASSWORD_HASH=
SESSION_SECRET=
TRADING212_API_KEY=
HA_URL=http://192.168.1.20:8123
HA_TOKEN=
HA_SENSOR_POWER=sensor.power_now
HA_SENSOR_ENERGY_DAILY=sensor.energy_daily
HA_SENSOR_PRICE=sensor.nordpool_kwh_oslo_nok
HOMEY_URL=https://my.homey.app
SCHOOL_ICAL_URL=
MAZEMAP_CAMPUS_ID=
NASA_API_KEY=
ENTUR_CLIENT_NAME=benjamin-homelab
MET_USER_AGENT=homelab-dashboard/1.0 benjamin@kristo.no
LABDECK_URL=http://192.168.1.50
```

## Åpne spørsmål (spør brukeren, eller lag placeholder)
- Hvilken skole går han på? Det trengs for MazeMap-campus og lenken til skolens nettside.
- Riktig URL til LabDeck.
- Navn på HA-sensorene for energi og strømpris.
- Riktige linjer for Ruter-strekningene. Prototypen bruker eksempeldata.

## Filer
- `design/Homelab v2.dc.html`: desktop med alle faner, innstillinger, profilmeny og drag-and-drop
- `design/Homelab Mobil.dc.html`: mobil/PWA
- `design/CV.dc.html`: offentlig CV med redigeringsmodus for eier
- `design/support.js`: runtime som trengs for å åpne prototypene lokalt
- `screenshots/`: referanse og skjermbilder

Prototypene lagrer data i `localStorage` og `sessionStorage` (nøklene `hl_auth`, `hl_receipts`, `hl_budget`, `hl_bg`, `hl_bgc`, `hl_cv`, `hl_order_*`). I produksjon skal dette flyttes til database og server-side sesjon.
