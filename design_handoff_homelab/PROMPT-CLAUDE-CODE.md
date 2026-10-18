# Prompt til Claude Code: Homelab OS + FinansHub + mobilapper

Les hele dette dokumentet før du skriver kode. Det samler alle ønskene brukeren har kommet med (prompt 01–11). **Les deretter `CHANGES-prompt-06.md`.** Den beskriver prompt 06 og gjelder foran dette dokumentet der de sier noe ulikt: mobilappen åpner på Homelab, førstegangsoppsett, redigering av transaksjoner, Material You osv. Detaljer som ikke står her finner du i filene som er nevnt under «Kildefiler».

## 0. Rammer

- **Hva du skal bygge:** et personlig, selvhostet system med tre deler:
  1. **Homelab OS**: dashboard i nettleseren, også brukt som startside for nye faner.
  2. **FinansHub**: privatøkonomi med AI-lesing av kvitteringer.
  3. **Mobilapper** for iOS og Android, inkludert brettbare telefoner.
- **Designfilene** i `design/` er HTML-prototyper. De er **designreferanser**, ikke produksjonskode. Gjenskap utseende og oppførsel i en ordentlig kodebase med backend, database, ekte API-er og sikker innlogging.
- **Fidelitet:** høy. Farger, typografi, radius, avstander og tekster er endelige.
- **Språk:** all tekst i grensesnittet skal være på norsk bokmål. Tallformat `1 234,56`, minus skrives `−`, dato `dd.mm.åååå`.
- **Eksempeldata:** alt som er demo i prototypene skal erstattes med API-kall. Det gjelder blant annet `localStorage`, tall som er satt med tilfeldighetsgenerator, og 2FA-koden 123456.
- **Eier:** navnet på hovedadmin settes i førstegangsoppsettet og kan endres senere (se `CHANGES-prompt-06.md` §1.1). «Sebastian» er bare eksempeldata. Avataren er profilbildet, eller initialen hvis det ikke finnes noe bilde. Domenene er `kristo.no`, `arildkrist.com` og `home.kristo.no`.
- **Rekkefølge:**
  1. Skriv `DECISIONS.md` med valg av hosting.
  2. Felles innlogging og brukere.
  3. Homelab-skallet og widgetene.
  4. FinansHub-backend og desktop.
  5. Modulene.
  6. Mobilappene.

### Hosting (bestem selv, og begrunn i `DECISIONS.md`)
- **Anbefalt:** Docker Compose på homelab (Proxmox LXC/VM eller Unraid) bak **Cloudflare Tunnel og Cloudflare Access**, uten åpne porter.
- Kun `/cv` er offentlig.
- Hybridløsning er lov, for eksempel Pages for CV-en.
- Leveranser: `README`, `.env.example`, `docker-compose.yml` og stegene for deploy.
- **Anbefalt stack:**
  - Backend: FastAPI (Python 3.12), SQLAlchemy 2 og Alembic. PostgreSQL 16, eventuelt SQLite til å begynne med. Redis og ARQ som jobbkø.
  - Frontend: React, Vite og TypeScript.
  - Mobil: native SwiftUI og Jetpack Compose. Alternativt Capacitor-skall rundt en PWA med to temaer.

## 1. Innlogging, brukere og sikkerhet (gjelder hele systemet)

### Brukere og roller
- **Én felles brukerdatabase** for Homelab, FinansHub og mobilappene.
- **Roller:** `admin` og `bruker`.
  - **Admin** kan legge til og fjerne brukere og sette roller. Dette gjøres i Homelab → Innstillinger → Innlogging → «Brukere».
  - **Bruker** ser dashbordet og kan styre sin egen 2FA.
  - Bare admin ser skjemaet «Legg til bruker» (brukernavn, passord, rolle). Andre får teksten «Bare administratorer kan legge til brukere.»
- **Innlogging** skjer med **brukernavn og passord**, ikke bare passord.
  - Passord hashes med argon2.
  - Server-side sesjon med httpOnly-cookie og `SameSite=Lax`.
  - Rate limiting og utestengning etter gjentatte feil.
- **Brukerlisten** viser avatar med initial, brukernavn, rolle, «2FA på/av», knappen for 2FA og «Fjern». Øverst står «Innlogget som X · rolle».

### Tofaktor (2FA, TOTP)
- Hver bruker kan slå på 2FA. Oppsettet har to steg:
  1. Vis en QR-kode (`otpauth://totp/Homelab:<bruker>?secret=…&issuer=Homelab`) og den hemmelige nøkkelen som tekst for manuell inntasting. Nevn appene Google Authenticator, Aegis og 1Password.
  2. Brukeren skriver inn koden fra appen. Den bekreftes før 2FA aktiveres.
- **Innloggingsflyt:** brukernavn og passord → hvis 2FA er på: et eget steg med teksten «Tofaktor er på for X. Skriv inn den 6-sifrede koden fra autentiseringsappen», et kodefelt og «← Tilbake».
- Tillat ±1 tidsvindu (30 s) for klokkeavvik.
- Lag **gjenopprettingskoder**, 10 engangskoder, når 2FA slås på.
- Lagre TOTP-hemmeligheten kryptert i databasen.
- Å slå av 2FA krever passord eller en gyldig kode.

### Pålitelig enhet på lokalt nett
- På låseskjermen er avkrysningen «Husk denne enheten på lokalt nett» på som standard.
- Den setter en signert device-cookie (httpOnly, 1 år) og lagrer enheten i databasen.
- Passord hoppes over **bare** når begge disse er oppfylt:
  - cookien er gyldig
  - klient-IP er i et privat nett: `192.168.0.0/16`, `10.0.0.0/8` eller `172.16.0.0/12`. Bak en tunnel brukes `CF-Connecting-IP`. LAN-trafikk skal gå direkte til containeren.
- Fra internett kreves alltid passord, og 2FA hvis det er på.
- Innstillinger viser «Pålitelig enhet» av/på og en liste over pålitelige enheter med «Fjern».

### API-tokens (personal access tokens)
- Tokenene brukes av iOS-snarveien for kvitteringer, Home Assistant, Excel Power Query og skript.
- **Tilganger (scopes):** `receipts:write`, `read:transactions`, `read:summary`, `read:budget`, `write:transactions`, `finance:read`.
- **Utløp:** 30 d, 90 d, 1 år eller aldri.
- **Format:** `fh_pat_` + 32 tilfeldige tegn. Tokenet vises **bare én gang** med «Kopier». Lagre bare hashen.
- **Listen** viser navn, tilganger, når tokenet ble laget, når det sist ble brukt, når det utløper, og «Trekk tilbake».

### Mobil-innlogging
- `POST /finans/api/login` med brukernavn og passord (+ TOTP) returnerer et token med finans-tilgang.
- Tokenet lagres i iOS-nøkkelringen eller Android Keystore.
- **Ikke** bruk HTTP Basic Auth. Det ga ingen popup i Android WebView, og var feilen brukeren opplevde.

## 2. Homelab OS (`design/Homelab v2.dc.html`)

### Topplinje
- **Innhold:**
  - «OS»-logo (44×44, hvit, JetBrains Mono)
  - pillefaner: Dashboard · Studie · Rom · Økonomi · Hjem · Matplan · Domener · Nettverk
  - værpille
  - meny (hamburger + avatar «S»)
- Venstrejustert.
- **Redigeringsmodus** åpnes fra menyen eller fra Innstillinger → «✥ Flytt elementer i topplinjen». Da kan hver del (logo, faner, vær, meny) dras med musa.
  - **«Hold alle elementene på samme høyde»** er på som standard. Da kan delene bare flyttes sideveis (`translateX`), og y er alltid 0. Slås valget på igjen, nullstilles y på alle delene.
  - Er valget av, kan delene flyttes fritt i x og y.
  - Plasseringen lagres per bruker. Knappen «Nullstill plassering» finnes.
- **Innstillinger → Utseende → Topplinje:**
  - Mellomrom mellom seksjoner: 0–120 px, standard 16
  - Mellomrom mellom faner: 0–40 px, standard 2
  - Bredde på faner: 6–24 px padding, standard 12
- **Menyen:** Innstillinger, Flytt topplinje, Vis/skjul søkebar, Tilbakestill layout, CV ↗, Lås.

### Nyhetslinje («SISTE NYTT»)
- Ligger rett under topplinjen.
- **Utseende:** rødt merke, kildebadge (NRK `#0b4ea2`, VG `#c8102e`), tittel og klokkeslett.
- **Rulling:** kontinuerlig. Listen dupliseres så loopen blir sømløs, og kantene tones ut med mask.
- **Kilder:** NRK `https://www.nrk.no/toppsaker.rss` og VG `https://www.vg.no/rss/feed/`. Hentes på serveren og caches i 5 min.
- **Innstillinger → Nyhetsbar:**
  - Vis nyhetsbar (av/på)
  - **Hastighet 1–10**: varighet per runde = 350 s / hastighet. Standard 5 gir 70 s.
  - **Pause når musepekeren er over** (på som standard)
- Rullingen stopper ved `prefers-reduced-motion`.

### Dashboard-widgets
Kilder og detaljer står i `README.md` under «Moduler og datakilder».
- **Ruter-avganger:** Entur GraphQL, med fire strekninger og lenker til reise.ruter.no.
- **Søkebar til Google**, fire stiler:
  - `light`: sentrert og lys
  - `dark`
  - `wideLight`: full bredde og lys
  - `wide`: full bredde med Google-logoen til venstre i feltet
  Innstillinger viser en forhåndsvisning av hver stil. Søkebaren kan dras mellom Ruter og klokka, og skjules fra menyen.
- **Hilsen og klokke:** «God morgen/Hei/God kveld, Sebastian». Klokka er 96 px Outfit 300.
- **Skoletime nå:** iCal, med en lenke til MazeMap.
- **Vær:** MET Locationforecast via server, med User-Agent.
- **Skolekalender:** klikk på en dag åpner en **popup** sentrert på skjermen, med uskarp bakgrunn og liste over hendelser. Lukkes med ×, Esc eller klikk utenfor. Samme popup-mønster brukes overalt der noe kan klikkes.
- **Agenda.**
- **Trading 212:** sammendrag.
- **Energi:** Home Assistant.
- **Økonomi-sammendrag.**
- **Snarveier.**
- **«Kommer ut»:** Sonarr og Radarr, vist som plakatrutenett (2:3) med dato eller status. Hentes via backend.
  - `GET {url}/api/v3/calendar`, med header `X-Api-Key`.

- **Media (Plex og Jellyfin):** eget kort på dashbordet, rett etter «Kommer ut».
  - Viser serverstatus (logo og grønn/gul prikk), **Spilles nå** (plakat, tittel, kildemerke Plex `#e5a00d` / Jellyfin `#7b4fd6`, bruker · enhet · direkte/transkoding, fremdrift, tid igjen, ▶/❚❚) og **Nylig lagt til** (plakatrutenett 2:3 med kildemerke).
  - Plex: `GET {url}/status/sessions` og `GET {url}/library/recentlyAdded?X-Plex-Container-Size=12`, med `X-Plex-Token` og `Accept: application/json`. Plakater via `{url}/photo/:/transcode?width=300&height=450&url={thumb}&X-Plex-Token=…`, proxet gjennom backend så tokenet ikke når nettleseren.
  - Jellyfin: header `Authorization: MediaBrowser Token="<nøkkel>"` (eller `X-Emby-Token`). `GET /Sessions?activeWithinSeconds=960` (filtrer på `NowPlayingItem`), `GET /Users` for å finne bruker-ID, `GET /Users/{id}/Items/Latest?Limit=12`. Plakater: `/Items/{id}/Images/Primary?maxHeight=450`.
  - Cache 30 s for «Spilles nå» og 10 min for «Nylig lagt til». Hent via `GET /api/media/now` og `GET /api/media/recent`.
  - Innstillinger → Integrasjoner → Media har Plex (URL, X-Plex-Token) og Jellyfin (URL, API-nøkkel, brukernavn), med veiledning for å finne tokenet (Vis XML eller `PlexOnlineToken` i Preferences.xml) og API-nøkkelen (Kontrollpanel → Avansert → API-nøkler). «Test tilkobling» henter servernavn, versjon og antall som spiller nå.
  - `.env`: `PLEX_URL= PLEX_TOKEN= JELLYFIN_URL= JELLYFIN_API_KEY= JELLYFIN_USER=`

### Layout
- Widgetene kan dras til ny plass: HTML5-dra på desktop, og langt trykk (450 ms) på mobil.
- **Endre størrelse:** et usynlig håndtak på 18×18 nederst til høyre i hvert kort.
  - Bredden snapper til antall kolonner.
  - Høyden er fri, minst 120 px.
  - Dobbeltklikk nullstiller.
- **Masonry:** `grid-auto-rows:4px`, og hvert kort får `grid-row-end: span ceil((h+20)/4)` via ResizeObserver.
- Rekkefølge, størrelser, topplinje og alle innstillinger lagres **på serveren per bruker**.

### Innstillinger (modal med sidemeny)
- **Utseende:**
  - bakgrunn: Måne, Jorda, Saturn, Oslo (lysbildeserie hvert 15. sekund), Vær (bilde etter dagens vær), Eget bilde eller Ingen
  - søkebar-stil
  - topplinje
  - nyhetsbar
  - Domener: «Vis verdenskart med besøk per land»
- **Integrasjoner:** full konfigurasjon av alt i grensesnittet. Lagres på serveren, og hemmeligheter sendes aldri til nettleseren.
  - Vær: sted, lat, lon
  - Ruter: NSR-stopp, antall
  - Kalender: iCal-URL, MazeMap
  - Home Assistant: URL, token, sensor
  - Sonarr: URL, nøkkel, dager
  - Radarr: URL, nøkkel, dager
  - Trading 212
  - NASA: nøkkel, CelesTrak-gruppe
  - Søk: URL
- **Innlogging:** brukere, 2FA og pålitelige enheter (se del 1).

### Øvrige faner
- **Studie:** lenker, karakterer (CRUD), prøver, studielån.
- **Rom:** Starlink over Norge (CelesTrak TLE + satellite.js), NASA APOD og gallerier.
- **Nettverk:** ekte helsesjekk av tjenestene (HTTP-ping på serveren).
- **Økonomi:** åpner **FinansHub i fullskjerm uten homelab-headeren**. Det eneste ekstra er en rund × øverst til høyre for å gå tilbake.

### Hjem (Home OS)
- 4 nøkkeltall: Boligverdi, Restgjeld (bank, rente, måneder), Faste boutgifter (spesifisert) og Inventar (sum, antall).
- Rom-filter.
- Inventarliste med garanti. Garanti markeres oransje når det er under 60 dager igjen.
- Kvitteringer fra FinansHub kan sendes hit.

### Matplan (`design/Matplan.dc.html`)
- **Det nye designet gjelder.** Matplan hører til **Homelab**, ikke FinansHub. Den ligger som egen fane i Homelab og som modul under «Andre OS» i mobilappen. **Ikke** legg Matplan i sidemenyen i FinansHub.
- **Toppen:** «UKE 42 · 12.–18. OKT», tittel, bryteren «Ny plan hver søndag», «Abonner i kalender» (webcal-adresse med «Kopier» og «Last ned .ics for uka») og «✦ Ny ukeplan med AI».
- **Ukekort (7):** ukedag, dato («I dag · 17. okt» med oransje kant), ✦ foreslår en annen rett for dagen, rettens navn, merke «★ Ingrids beste» eller «HelloFresh», velger for kokk og knappen «Fast». Uka byttes med ‹ ›, og «Lag ny for uka» fyller dagene som ikke er faste. Retter kan dras fra listen til en dag, og mellom dager for å bytte.
- **Retter:** antall, «+ Ny rett», søk i navn og ingredienser, filtrene Alle, På planen, Ikke brukt og HelloFresh. Hver rett viser antall ingredienser og hvilke dager den ligger på (Ma, Ti …). Åpnet rett viser ingredienser, «Slik gjør du», «Legg på dag …», «Rediger» og «Slett rett».
- **HelloFresh denne uka:** «Lim inn ukesmeny», én rett per linje.
- **Kokker:** hver kokk har retter de er best på. Når en slik rett havner på planen, settes kokken automatisk. Kokker kan legges til og fjernes.
- Se også `FINANSHUB-MODULER.md` → Matplan.
- **Gemini** lager ny ukeplan, automatisk søndag kl. 18 eller på forespørsel for en uke eller en dag.
- Retter kan **låses til en ukedag** (faste retter).
- Retter kan importeres fra **HelloFresh**: via e-post eller URL, tolket med Gemini.
- Man kan legge til egne retter.
- Hver dag har en kokk, og kokkene skrives til **Google Kalender** (kalenderen «Middag», 17–18, kokken som deltaker).
- Handleliste.
- Ukekostnaden trekkes fra kategorien «Mat og dagligvarer».

### Domener (`design/Homelab Domener.dc.html`, desktop)
- **Flere domener:** «+ Legg til domene» med domene, statistikkilde og API-token.
  - Statistikkilder: Cloudflare zone analytics, Cloudflare Tunnel, Plausible, Umami (selvhostet), eller «Bare oppetid og SSL».
  - Domener kan fjernes.
  - Listen deles med mobilappen.
- **Domenevelger** og periodevelger.
- **Nøkkeltall:** Domene, Status, Forespørsler, Besøkende, Bufret, Oppetid, SSL utløper, Fornyes.
- **Trafikk:** kurve for totalt og bufret, pluss **Sanntid** med live besøkende akkurat nå.
- **Publikum:**
  - **Verdenskart** som fargelegger land etter unike besøkende, fra mørkeblå `#24406b` (få) til lys `#a8d4fb` (mange), med logaritmisk skala. Land uten besøk har `#1d2738`.
  - Holder man musepekeren over et land, vises navn og antall besøk.
  - Kartet bruker d3-geo, Natural Earth-projeksjon og world-atlas `countries-110m`, med ISO 3166-1 numeriske ID-er.
  - Topp land, enheter og nettlesere.
  - Kartet kan skjules i Innstillinger.
- **Ytelse og sikkerhet:** statuskoder (2xx/3xx/4xx/5xx), tid til første byte (p50 og p95), og sikkerhet (trusler som er stoppet).
- **Innhold:** toppsider og topphenvisere.
- **Infrastruktur:** oppetid de siste 90 dagene og DNS-poster.
- **Data:**
  - Cloudflare GraphQL Analytics API (`httpRequestsAdaptiveGroups`, `httpRequests1dGroups`, `firewallEventsAdaptive`).
  - REST for zones, DNS og registrar.
  - Tokenet trenger: Zone:Read, DNS:Read, Analytics:Read, Registrar:Read og Firewall Services:Read.
  - Cache 5 min, og 30 s for sanntid.

## 3. FinansHub desktop (`design/FinansHub v2.dc.html` + `design/FinansHub v2 Moduler.dc.html`)

Backend, AI-pipeline, datamodell og API er beskrevet i `finanshub/README.md`. Visuelt gjelder v2-filene, ikke `finanshub/DESIGN.md`.

### Sidemeny
- Sidene: Oversikt, Transaksjoner, Kvitteringer, Budsjett, Faste utgifter, Kontoer, **Aksjer**, Rapporter, **Subscription OS**, **Delte mapper**, Finn-handler, Import, Innstillinger.
- **Endre rekkefølge:** knappen «Endre» ved siden av «Generelt». Punktene kan da dras med musa, eller flyttes med ▲▼. «Ferdig» lagrer, og det finnes også «Tilbakestill».
- Rekkefølgen lagres per bruker.
- Nederst i sidemenyen står AI-status (Ollama eller Gemini).

### Oversikt
- **4 nøkkeltallkort:** Total saldo, Inn i oktober, Brukt i oktober og Igjen av budsjett.
  - Beløpet står på én linje, med «kr» rett etter. Det skal ikke brytes.
  - Hvert kort har en minigraf: sparkline, søyler eller måler.
- Graf for inn og ut med tooltip når musepekeren holdes over.
- Kontokort.
- Siste transaksjoner.
- Handlinger, for eksempel **«Last opp kvittering»**. På PC lastes filer opp; kamera brukes ikke.
- Budsjett.
- Gjennomgangskø.
- Kommende trekk.

### AI-søk (✦ AI)
- Søkefeltet øverst har knappen «✦ AI».
- I AI-modus stiller man et spørsmål på vanlig norsk, for eksempel «hvor mye brukte jeg på strøm i september?».
- Søket går gjennom **transaksjoner, kvitteringer og varelinjene i kvitteringene** og svarer med et sammendrag og treff. Hvert treff viser beskrivelse, dato, kilde, hvorfor det traff, og beløp.
- Trykk på et treff åpner transaksjonen.
- Det vises forslag til spørsmål.
- Motoren er den som er valgt under AI-motor (Ollama lokalt eller Gemini).
- **Implementasjon:**
  - Embeddings for tekst fra tx, kvitteringer og linjer i pgvector, eller SQLite-vec.
  - Hybrid søk (BM25 + vektor) gir topp-N.
  - LLM-en svarer med kildehenvisninger, og må ikke finne på tall.
- `POST /finans/api/search/ai {q}` → `{answer, hits[]}`

### Aksjer (Trading 212)
- **Nøkkel og secret** legges inn i Innstillinger og lagres **kun på serveren**.
  - Header: `Authorization: Basic base64(KEY:SECRET)`.
  - Base-URL: `https://live.trading212.com/api/v0`, eller demo.
- **Kall:**
  - `GET /equity/account/summary`
  - `GET /equity/portfolio`
  - `GET /equity/history/orders?limit=50`
  - `GET /history/dividends?limit=50`
- Ta hensyn til rate limits, og cache i 60 s. Knappen «Synk nå».
- **Hjelpetekst:** lag nøkkelen under Innstillinger → API (Beta) hos Trading 212. Gi bare lesetilgang (account, portfolio, history:orders, history:dividends), og lås nøkkelen gjerne til IP-en til homelaben.
- **Visning:**
  - nøkkeltall: porteføljeverdi med periodevalg
  - fordeling
  - posisjonstabell: posisjon, antall, snittkurs, kurs, verdi, avkastning, i dag
  - ordrer og utbytte

### Feil: «Trading 212 avviste nøkkelen» selv med riktig nøkkel og secret
Brukeren får denne feilen i den bygde appen. Gå gjennom dette i rekkefølge, og vis den konkrete årsaken i grensesnittet i stedet for én felles feilmelding:
1. **Header-formatet:** `Authorization: Basic base64(KEY_ID:SECRET)`. Kun nøkkelen alene, `Bearer`, eller nøkkel og secret i egne headere gir 401. Base64 må være uten linjeskift (Node: `Buffer.from(`${key}:${secret}`).toString('base64')`, Python: `base64.b64encode(...).decode()`).
2. **Trim verdiene:** fjern mellomrom, linjeskift og anførselstegn som følger med ved liming, både i grensesnittet og i `.env`. Sjekk at `.env` faktisk lastes, og at nøkkelen fra grensesnittet ikke blir overskrevet av en tom `TRADING212_API_KEY`.
3. **Riktig miljø:** en nøkkel laget i Live virker bare mot `live.trading212.com`, og en Demo-nøkkel bare mot `demo.trading212.com`. Velgeren Live/Demo må styre base-URL-en, og må lagres sammen med nøkkelen.
4. **Riktig konto:** API-et virker for Invest og Stocks ISA, ikke CFD. Nøkkelen må lages i samme konto.
5. **Hemmeligheten må dekrypteres før bruk.** Lagres secret kryptert, må den dekrypteres før header bygges. Logg lengden (aldri verdien) for å se at den ikke er tom.
6. **IP-begrensning:** er nøkkelen låst til IP, må kallet gå fra serverens offentlige IP. Bak Cloudflare Tunnel er det homelabens WAN-IP.
7. **Kall fra serveren, ikke nettleseren.** CORS og lekkasje av nøkkelen gjør at kallet må gå via backend (`/finans/api/stocks/*`).
8. **Tolk statuskoden:** 401 = feil nøkkel, secret eller miljø. 403 = mangler tilgang (scope). 429 = rate limit (vent og prøv igjen). Vis tydelig hvilken det er.
9. **«Test tilkobling»:** kall `GET /api/v0/equity/account/summary` og vis valuta og total verdi ved suksess.

### Kvitteringer fra e-post (Proton Mail via Bridge)
Brukeren har Proton Mail. Proton har ingen offentlig IMAP-server, så alt går gjennom **Proton Mail Bridge** (krever betalt plan). Oppsett og hjelpetekst står i `design/Homelab v2.dc.html` → Innstillinger → Integrasjoner → Proton Mail.

**Docker Compose (Bridge ved siden av FinansHub):**
```yaml
  protonmail-bridge:
    image: shenxn/protonmail-bridge     # eller ghcr.io/videocurio/proton-mail-bridge
    restart: unless-stopped
    volumes: [ "./proton:/root" ]       # nøkler og cache, ta med i backup
    networks: [ homelab ]                # IKKE publiser portene
```
- Første innlogging: `docker compose run --rm protonmail-bridge init` → `login` (adresse, passord, 2FA) → vent på synk → `info` → kopier brukernavn og **Bridge-passordet** → `exit` → `docker compose up -d`.
- `info` viser port 1143/1025. **Fra en annen container** er verten `protonmail-bridge` og portene **143** (IMAP) og **25** (SMTP), fordi imaget videresender dem. Med Bridge-appen på samme maskin: `127.0.0.1:1143`.
- Sikkerhet: **STARTTLS**. Bridge bruker et selvsignert sertifikat: pin sertifikatet (lagres ved første tilkobling, eller eksporteres fra Bridge) i stedet for å slå av sjekken globalt.

**Variabler (`.env`, kan også settes i grensesnittet):**
```
IMAP_HOST=protonmail-bridge
IMAP_PORT=143
IMAP_SECURITY=starttls
IMAP_USER=navn@proton.me          # fra «info» i Bridge
IMAP_PASSWORD=                     # Bridge-passordet, ikke Proton-passordet
IMAP_FOLDER=Folders/Kvitteringer   # egne mapper: Folders/<navn>, etiketter: Labels/<navn>
IMAP_DONE_FOLDER=Folders/Kvitteringer/Lest
IMAP_POLL_MINUTES=10
```

**Henting (worker-jobb):**
- Bibliotek: `imapclient` eller `aioimaplib` (Python). Bruk IDLE når det støttes, ellers poll hvert `IMAP_POLL_MINUTES`.
- `SELECT IMAP_FOLDER` → `SEARCH UNSEEN` → for hver e-post: hent `BODY.PEEK[]`, parse med `email`-modulen.
- Ta ut vedlegg av typene PDF, JPG, PNG og HEIC. Har e-posten ingen vedlegg (typisk nettbutikker), send HTML-teksten renset til tekst til AI-lesingen.
- **Duplikatsjekk** på `Message-ID` og sha256 av hvert vedlegg. Lagre i `mail_imports(message_id, sha256, receipt_id, folder, received_at, status, error)`.
- Lag kvitteringsjobber i samme kø som mobilopplasting, med `source='email'`, avsender og emne som metadata. De vises i opplastingskøen og gjennomgangskøen.
- Etter suksess: `MOVE` til `IMAP_DONE_FOLDER` (eller sett `\Seen` hvis mappen mangler). Ved feil: la e-posten ligge og logg feilen.
- Finn-handler bruker samme postkasse med eget filter (Folders/Finn).
- Statussiden viser sist sjekket, antall importert, og siste feil.

**«Test tilkobling» (backend):** `POST /finans/api/mail/test` → koble til, STARTTLS, LOGIN, `LIST`, `SELECT` mappen, og svar med antall uleste. Vanlige feil som skal gi egen melding:
- `AUTHENTICATIONFAILED`: brukt Proton-passordet i stedet for Bridge-passordet, eller Bridge er logget ut.
- Tilkobling nektet: Bridge kjører ikke, eller feil vert/port (1143 i stedet for 143 fra en annen container).
- `NONEXISTENT`/mappe finnes ikke: mangler `Folders/` foran navnet.
- Sertifikatfeil: sertifikatet er ikke pinnet.

**Filter i Proton (brukerens oppgave, vis som hjelp):** mail.proton.me → Innstillinger → Filtre → Legg til filter → emne inneholder «kvittering», «ordre», «receipt» eller avsender er butikken → flytt til mappen Kvitteringer.

### Subscription OS
- 3 nøkkeltall: Per måned, Per år og «Lite brukt, kan sies opp».
- **Legg til** på tre måter: nytt abonnement, fra kvittering (AI fyller ut feltene), eller fra transaksjoner.
- **Trekk-intervall:** Månedlig, Årlig eller **Hvert 2. år**.
  - Felt: «kr per trekk».
  - Summene regnes om til per måned og per år, så 2-årig gir pris/24 per måned og pris/2 per år.
- Hvert abonnement har status Aktiv, Si opp eller Sagt opp.

### Delte mapper: hovedsakelig dashboard for boliger
- **Formål:** oversikt over utgifter til bolig, hytte og utleie. Eksempler:
  - kvitteringer for blomster ute
  - kjøp og avdrag til snekker eller basseng
  - vannregning og strømregning
- **Ny bolig eller delt mappe:**
  - navn
  - type: Enebolig, Leilighet, Hytte, Utleie eller Annet
  - adresse
  - hvem den skal deles med (velg blant brukerne)
- **Deling mellom brukere:**
  - **Roller per mappe:** Eier, Kan redigere, Kan se.
  - Eier kan dele med flere brukere, endre roller og fjerne medlemmer. Medlemmer kan forlate mappen.
  - Med lesetilgang vises teksten «Du har lesetilgang. Be en eier om redigeringstilgang …».
  - Brukere ser bare mapper de er medlem av.
  - Nye brukere legges til av admin i Homelab → Innlogging.
- **Dashboard per bolig:**
  - nøkkeltall
  - utgifter per måned (graf)
  - kategorier (Vann, Strøm, Hage, Vedlikehold osv.)
  - **Prosjekter** med leverandør, brukt av budsjett, gjenstående og avdragsplan (betalt eller forfaller), pluss knappen «Registrer betalt»
  - **Faste regninger** med hvem som betaler, frekvens, sist betalt og neste
  - **Fordeling**, likt delt eller egen nøkkel, med saldo per medlem (betalt − andel)
  - **Legg til utgift eller kvittering:** ny utgift, kvittering (AI) eller fra transaksjoner
- **Data:**
  - `folders(id,name,type,address,owner_id)`
  - `folder_members(folder_id,user_id,role)`
  - `folder_entries(folder_id,tx_id?,receipt_id?,desc,amount,paid_by,split,category,project_id?)`
  - `folder_projects(id,folder_id,name,vendor,budget)`
  - `project_installments(project_id,label,due,amount,paid_at?)`
  - `folder_bills(folder_id,name,category,freq,payer,next_due)`

### Finn-handler og Import
Se `FINANSHUB-MODULER.md`.
- **Finn-handler:** henter Finn-e-poster (Trygg betaling, Fiks ferdig, Tillit forsikring) via IMAP. AI-uttrekk matches mot bankpost.
- **Import:** CSV, XLSX (SheetJS) og innlimt tekst. DNB-formatet renses.

### Felles i FinansHub
- **Logoer:** butikknavn gjøres om til domene, via regelliste med AI som reserve (for eksempel «Bilema» → biltema.no). Deretter hentes favicon. Cache og proxy på serveren.
- **✦ AI-sammendrag** på hver transaksjon og kvittering: en kort linje (~60 tegn) og en lang (2–3 setninger). Lagres i `ai_short` og `ai_long`.

### Innstillinger i FinansHub
- Generelt
- AI-motor:
  - Ollama: URL, modell
  - Gemini: nøkkel, modell
  - minimum sikkerhet
  - test
- Kategorier
- Regler
- Bank og import
- Varsler
- **Backup og data** (se under)

### Backup og data
- **Last ned:**
  - **Full backup (.json):** komplett, og brukes til gjenoppretting.
  - **Excel-database (.xlsx):** ett ark per tabell (Info, Kontoer, Kategorier, Transaksjoner, Kvitteringer, Varelinjer, Budsjett, Faste_utgifter, Aksjer, Utbytte, Ordre, Regler).
    - ID-kolonner kobler arkene sammen.
    - Filter på overskriftene.
    - Beløp lagres som tall, ikke tekst.
  - **Bare transaksjoner (CSV):** `;` som skilletegn, UTF-8 med BOM.
- **SMB-share:**
  - Felt: share (`//nas/backup`), mappe, SMB-versjon (3.1.1, 3.0 eller 2.1), brukernavn, passord, domene eller arbeidsgruppe.
  - **Tidsplan:** bare manuelt, hver natt kl. 03.00, hver søndag kl. 03.00, eller etter hver endring (maks én per time).
  - **Behold versjoner** (antall).
  - **Innhold** (kryss av): database, kvitteringsbilder, innstillinger.
  - **Passfrase for kryptering** (AES-256).
  - Knappene «Test tilkobling» og «Lagre».
  - Liste over backuper på sharen (fil, tid, type, størrelse, status), med «Gjenopprett».
  - Implementeres i containeren med `smbclient` eller `pysmb` (eller en CIFS-mount), en cron-jobb, `pg_dump` + kvitteringsmappen + innstillinger → tar.zst → kryptering.
- **Gjenopprett / ny installasjon:**
  - Ved **første oppstart** spør appen: start tom, hent fra SMB-share, eller last opp en backupfil.
  - Både .json og .xlsx kan importeres. Før import vises en forhåndsvisning med antall per tabell.
  - Importen skal være idempotent, og ID-er bevares.

## 4. Mobilapper (`design/FinansHub Mobil v2.dc.html`)

- Det finnes tre varianter:
  - **1a iPhone:** iOS 26 Liquid Glass
  - **1b Android:** Material 3 Expressive
  - **1c Android brettbar:** åpen skjerm med to paneler
- Appene er **først og fremst FinansHub-klienter**. De snakker bare med `/finans/api/*`, i tillegg til modulene under «Andre OS».

### Navigasjon
- **Fanelinja i Finans:** Hjem, Liste og Budsjett. Matplan er **ikke** i fanelinja.
- **Profilbildet** åpner menyen:
  - **Finans**
  - **Andre OS:** Matplan, Domener, Subscription OS, Delte mapper, Finn-handler
  - **Innstillinger**
- **Brettbar:** navigasjonsrail med skanneknappen øverst og **profilbildet nederst til venstre**. Det åpner menyen fra venstre.
  - Finans viser to paneler: liste og detalj.
  - Moduler fyller hele skjermen.
  - Bytter layout ved ≥ 600 dp (WindowSizeClass). Bruk Jetpack WindowManager for hengselposisjon.

### Skanning
- **Trykk** på skanneknappen åpner **kameraet med en gang** i fullskjerm. Det har en ramme for kvitteringen, en utløserknapp, og knappene «Bilder» og «Filer» nederst. Når bildet er tatt, åpnes «Bekreft kvittering».
- **Hold inne** (~480 ms) åpner et ark nederst med «Ta bilde», «Velg fra Bilder», «Velg fil» (PDF, JPG, HEIC) og «Avbryt».
- Valgte filer legges i **opplastingskøen**.
- Innstillinger → Skanning kan bytte oppførselen, slik at et trykk viser valgene.
- **Native:**
  - iOS: `AVCaptureSession` / VisionKit `VNDocumentCameraViewController`, `PHPicker`, `UIDocumentPicker`
  - Android: CameraX + ML Kit Document Scanner, Photo Picker, `ACTION_OPEN_DOCUMENT`
- Skann uten nett legges i kø og lastes opp senere.

### Opplasting i bakgrunnen
- Flere filer kan lastes opp samtidig.
- Status per fil: «I kø» → «Gemini leser … N %» → «Klar · trykk for å bekrefte».
- En pille på forsiden viser fremdrift.
- iOS bruker `URLSession` background, Android bruker WorkManager.
- Push-varsel når filene er ferdige.
- `POST /finans/api/receipts` (multipart, flere filer) og `GET /finans/api/receipts/jobs` (SSE).

### Skjermer
- **Hjem:** «Hei, <aktiv bruker>».
  - Igjen å bruke.
  - Android-kortene «Inn i oktober» (7 minisøyler) og «Spart i år» (ring mot årsmålet).
  - Transaksjoner med logo og ✦.
- **Utgiftsdetalj:**
  - logo 60, navn, dato, beløp
  - **AI-beskrivelse** (2–3 setninger)
  - varelinjer
  - metadata: kategori, konto, kvittering, delt mappe
- **Budsjett:**
  - oppsummering: budsjett, brukt, dager igjen
  - per kategori: «X kr igjen · Y kr/dag» eller «Over med X kr»
  - % brukt
  - chips: antall kjøp, mest brukt butikk, trend mot forrige måned
- **Søkefelt:** 46 px høyt (iOS), 56 px (Android).
- **Matplan, Subscription OS, Delte mapper og Finn-handler** som moduler.
- **Domener:**
  - Fanelinja byttes ut med **Trafikk, Besøk, Ytelse og Sikkerhet**, og skanneknappen skjules.
  - Øverst: domenevelger (samme liste som i Homelab), oppdater-knapp og tannhjul (Innstillinger).
  - **Trafikk:** stort live-kort (besøk, forespørsler, MB) med sparkline, «Siste 24 t» / «I dag», 4 kort (Besøk, Forespørsler, Dataoverføring, Land) og historikk for 7 d, 30 d, 90 d eller 1 år.
  - **Besøk:** besøk, sidevisninger, land, topp land, enheter, toppsider, henvisere og nettlesere.
  - **Ytelse:** bufret andel, median og p95 for tid til første byte, svartid fra opprinnelse, feilrate, statuskoder, HTTP/TLS-versjon og oppetid siste 30 dager.
  - **Sikkerhet:** trusler stoppet, typer, siste hendelser (Blokkert/Utfordret), trusler per land og innstillinger: SSL-modus, Alltid HTTPS, minimum TLS, DNSSEC, Bot Fight Mode og når sertifikatet utløper.
  - **Samme innhold som på PC (prompt 09):**
    - Trafikk har kortet «Domene» med status, statistikkilde, registrar, fornyes, SSL-sertifikat (dager igjen, gult under 30), navnetjenere, IP, TLS og DNSSEC.
    - Besøk har **verdenskart** (samme `domener-kart.html`/d3-kart som desktop, rosa skala `#4a2433` → `#FFB1C8`). Trykk på et land viser navn og antall besøk.
    - Ytelse viser oppetid for **90 dager**.
    - Sikkerhet har **DNS-poster** (type, navn, verdi, Proxy/Kun DNS).
    - Domenevelgeren har «＋ Administrer domener»: listen med «Fjern», og «Legg til domene» (domene + statistikkilde). Listen er den samme som i Homelab (`/domains/api/domains`). API-token legges inn på web.
  - **Stil:** iPhone bruker mørkt glass med rosa aksent `#FF9EBE`. Android bruker rosa tonal palett: hero `#7B2949`/`#FFD9E2`, aksent `#FFB1C8`, kort `#2A2024`.

### Innstillinger (egen side i appen)
- **Hovedside:** profilkort øverst, og gruppene Konto, App og System.
- **Kontoer og brukere: flere kontoer i samme app.**
  - Bytt aktiv konto. Hilsenen og avataren følger valget.
  - Hold inne profilbildet for raskt bytte.
  - Logg ut andre kontoer.
  - **Legg til konto:** server, brukernavn, passord → 2FA-kode → innlogget.
  - Hver konto har egne data, tokens og varsler.
- **Sikkerhet:**
  - lås med Face ID eller fingeravtrykk
  - lås etter umiddelbart, 1 min, 5 min eller 15 min
  - skjul beløp i appveksleren (uskarpt bilde)
  - 2FA av/på eller oppsett
  - pålitelige enheter
- **API-tokens:** som på web. Liste, trekk tilbake, nytt token med tilganger og utløp, vises én gang med «Kopier».
- **Utseende:**
  - **Fargebakgrunn** på iOS (fargede lysflekker bak glasset). Flyttet hit fra menyen.
  - Startside: Hjem, Liste eller Budsjett.
  - Skjul beløp til man trykker.
- **Skanning og AI:**
  - et trykk på skann åpner kamera eller viser valg
  - beskjær automatisk
  - lagre originalbildet
  - last opp bare på Wi-Fi
  - AI-motor: Ollama lokalt, Gemini, eller Ollama + Gemini
- **Varsler:**
  - kvittering ferdig lest
  - budsjett over 80 %
  - abonnement trekkes snart
  - domene eller SSL utløper (30 og 7 dager før)
  - ukesoppsummering (søndag kl. 18)
- **Server og synk:**
  - lokal adresse og ekstern adresse
  - «Bruk lokal adresse hjemme», som bytter automatisk etter SSID eller når serveren svarer
  - «Test tilkobling»
  - status: aktiv vei, siste synk og serverversjon
- **Data og lagring:**
  - hurtigbuffer og «Tøm hurtigbuffer»
  - «Synk nå»
  - «Eksporter som CSV»
  - Full backup lages i FinansHub på PC.
- **Om:** versjoner, personvern og lisenser.

### iOS: Liquid Glass
Følg Apples retningslinjer: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- **Native:** bruk standard `TabView` (SwiftUI) i iOS 26. Den får Liquid Glass automatisk.
  - `.tabBarMinimizeBehavior(.onScrollDown)`
  - Skanneknappen er en egen glassknapp med `.glassEffect(.regular.tint(.orange).interactive())`, eller `Tab(role: .search)`-plassen.
  - Bruk farge sparsomt: bare valgt fane og primærhandlingen får tint.
  - Innhold går helt ut til kanten under fanelinja, med scroll edge-effekt.
- **Slik prototypen etterligner det:**
  - **Fanelinje:** flytende kapsel (høyde 62, radius 31).
    - Lite uskarphet: `blur(8px) saturate(190%) brightness(1.12)`.
    - Bakgrunn `rgba(28,28,32,.22)`.
    - Spekulær kant: inset-skygge med lyse topp- og sidekanter, og et diagonalt glans-lag.
  - **Glass-markør** bak valgt fane, som glir med fjæring: `cubic-bezier(.3,1.35,.5,1)` .45 s.
  - Knapper vokser 1,12× ved trykk.
  - Ved scroll ned krymper linja til en sirkel med aktiv fane. Ved scroll opp eller trykk utvides den igjen.
  - Tonet gradient og blur ved bunnkanten.
- Resten av appen har glassflater `rgba(255,255,255,.08)`, blur 30 og saturate 180. Aksent `#FF7A3D`/`#FFB08A`, bakgrunn `#07070A`.

#### Fanelinje på iPhone: plassering og dra-effekt (prompt 09)
Brukeren testet appen på iPhone: fanelinjen sto for høyt, og glass-markøren kunne ikke dras.
- **Plassering:** linja skal ligge rett over hjemindikatoren, slik systemets `TabView` gjør. I SwiftUI får du dette gratis med `TabView` i iOS 26. I Capacitor/PWA: `bottom: max(8px, env(safe-area-inset-bottom) - 20px)`, ikke `safe-area-inset-bottom + 30px`. Krever `viewport-fit=cover` i viewport-taggen og `ios.contentInset: 'never'` i `capacitor.config.ts`, ellers legges innsettet på to ganger.
- **Dra-effekt (Liquid Glass):** brukeren skal kunne legge fingeren på linja og dra glass-markøren mellom fanene.
  - Native: standard `TabView` har dette i iOS 26. Ikke lag en egen fanelinje i SwiftUI, da mister du effekten.
  - Capacitor/PWA (slik prototypen gjør det):
    - `pointerdown` på linja.
    - Etter 6 px bevegelse: `setPointerCapture`, og markøren følger fingeren uten overgang.
    - **Linsen løftes:** `scale(1.18, 1.22)`, lysere kant og glans, `backdrop-filter: blur(2px) saturate(220%) brightness(1.25)`, slik at ikonet under forstørres.
    - Strekkes litt etter farten.
    - Gummibånd ved kantene (25 %).
    - Ved slipp: snap til nærmeste fane med fjæring `cubic-bezier(.3,1.35,.5,1)` .5 s, bytt fane, og stopp klikket som følger.
    - Hele linja vokser til `scale(1.02)` mens man drar.
    - Haptikk: `Haptics.selectionChanged()` (`@capacitor/haptics`) hver gang markøren passerer en ny fane, og `impact({style:'light'})` ved slipp.
  - Glasset skal **ikke** vise speilet eller forvrengt tekst fra fanene bak seg (slik det gjorde i brukerens skjermbilde). Bruk bare blur/saturate/brightness, ikke SVG-forskyvningsfilter, på WebKit.
- `touch-action: pan-y` på linja, slik at loddrett scroll fortsatt virker.

### Android: Material 3 Expressive
- **Rammeverk:** Jetpack Compose Material3 (Expressive) og `ListDetailPaneScaffold` for brettbare telefoner.
- **Tonal palett fra seed `#FF7A3D`:**
  - flate `#19120E`
  - kort `#261E19`
  - felt `#31281F`
  - primærcontainer `#763300`/`#FFDBC8`
  - primær `#FFB68A`/`#532200`
  - sekundærcontainer `#5D4033`
  - tertiær `#45462A`/`#E6E6AE`
- Roboto Flex, med `wdth` 110–120 på store tall.
- Asymmetriske hjørner (28/10).
- Extended FAB.
- Navigasjonslinje med pillemarkør.
- **Cleartext mot LAN:** `network_security_config` for 192.168.0.0/16 og `.local`. Det var årsaken til at innlogging virket i nettleseren, men ikke i appen.

### Bygg og release: IPA og APK i GitHub Releases
Hver ny versjon skal ha ferdige installasjonsfiler for begge plattformer som vedlegg til en GitHub Release. Brukeren skal kunne laste dem ned derfra uten å bygge selv.

- **Utløser:** en tag `v*` (for eksempel `v1.4.0`) starter workflowen `.github/workflows/release.yml`. Den kan også startes manuelt (`workflow_dispatch`).
- **Versjon:** tagen setter `versionName`/`CFBundleShortVersionString`. Byggnummeret (`versionCode`/`CFBundleVersion`) er `github.run_number`.
- **Android-jobb** (`ubuntu-latest`):
  - JDK 17 og Gradle-cache. `./gradlew assembleRelease` (og gjerne `bundleRelease` for .aab).
  - Signer med en egen release-keystore. Den ligger base64-kodet i secret `ANDROID_KEYSTORE_BASE64`, og passordene ligger i `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` og `ANDROID_KEY_PASSWORD`. Samme nøkkel må brukes hver gang, ellers kan appen ikke oppdateres over en eldre versjon.
  - Filnavn: `FinansHub-<versjon>.apk`. Én universell APK som fungerer på vanlige og brettbare telefoner.
- **iOS-jobb** (`macos-latest` med Xcode 26):
  - `xcodebuild archive` og deretter `xcodebuild -exportArchive` med `ExportOptions.plist` (`method: development` eller `ad-hoc`).
  - Sertifikat (.p12) og provisioning profile ligger base64-kodet i secrets: `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_TEAM_ID`. Importer dem i en midlertidig keychain som slettes etter bygget.
  - Uten betalt utviklerkonto: lag i tillegg en **usignert IPA** (`CODE_SIGNING_ALLOWED=NO`, pakk `Payload/FinansHub.app` som zip med endelsen .ipa). AltStore, SideStore og Sideloadly signerer den på nytt med brukerens Apple-ID ved installasjon.
  - Filnavn: `FinansHub-<versjon>.ipa` (og `FinansHub-<versjon>-unsigned.ipa`).
- **Release-jobb:** venter på begge, og laster opp filene med `softprops/action-gh-release`. Release-teksten genereres fra commit-meldingene siden forrige tag, og har en kort installasjonsveiledning:
  - Android: last ned APK-en, tillat «Installer ukjente apper» for nettleseren, og åpne filen.
  - iPhone: åpne IPA-en i AltStore, SideStore eller Sideloadly.
- **Sjekksummer:** legg ved `SHA256SUMS.txt` for alle filene.
- **AltStore-kilde (valgfritt):** publiser en `altstore-source.json` som peker på siste IPA i releasen, så AltStore og SideStore varsler om oppdateringer.
- **Ferdig utkast:** `ci/release.yml` (kopier til `.github/workflows/`) og `ci/ExportOptions.plist`. Utkastet er skrevet for et Capacitor-prosjekt. Juster stiene hvis appene bygges native.
- Manuell fremgangsmåte for IPA står fortsatt i `CHANGES-prompt-04b.md` (Xcode → Archive → Development → AltStore eller SideStore).

## 5. Data og API (tillegg til `finanshub/README.md`)

### Tabeller
- `users(id,username,pw_hash,role,totp_secret_enc,totp_enabled,recovery_codes_hash[])`
- `sessions`
- `trusted_devices(id,user_id,name,last_ip,created,last_seen)`
- `api_tokens(id,user_id,name,hash,scopes[],expires_at,last_used_at)`
- `user_prefs(user_id,key,value_json)`: layout, topplinje, nyhetsbar, rekkefølge i sidemenyen, mobilvalg
- `subscriptions(…, cycle: monthly|yearly|biennial, price_per_charge)`
- `t212_cache`, `domains(id,name,source,token_enc,added_by)`
- `backups(id,file,kind,size,status,created)`, `backup_config`
- Mapper og prosjekter: se del 3.

### Endepunkter
```
POST /api/auth/login            {username,password} → {needs_totp?} | session
POST /api/auth/totp             {code}
POST /api/auth/totp/setup  → {otpauth_url, secret}   POST /api/auth/totp/verify {code}
GET/POST/DELETE /api/users      (admin)
GET/DELETE /api/devices
GET/POST/DELETE /api/tokens
GET/PUT /api/prefs
POST /finans/api/login          (mobil, returnerer token)
POST /finans/api/search/ai
GET  /finans/api/stocks/{summary|portfolio|orders|dividends}   POST /finans/api/stocks/sync
GET/POST /finans/api/subscriptions
GET/POST /finans/api/folders  POST /finans/api/folders/:id/members  …/entries  …/projects  …/bills
GET  /finans/api/backup/export?format=json|xlsx|csv
POST /finans/api/backup/smb/test  PUT /finans/api/backup/smb  POST /finans/api/backup/run
GET  /finans/api/backup/list   POST /finans/api/backup/restore
GET/POST/DELETE /domains/api/domains   GET /domains/api/:name/analytics?range=24h|today|7d|30d|90d|1y
GET  /api/news   GET /api/media/upcoming
```

## 6. Hemmeligheter (`.env`)
```
SECRET_KEY=  SESSION_SECRET=  TOTP_ENC_KEY=  DB_PASSWORD=
TRADING212_API_KEY=  TRADING212_API_SECRET=  TRADING212_ENV=live
GEMINI_API_KEY=  GEMINI_MODEL=  OLLAMA_URL=  OLLAMA_MODEL=qwen2.5vl:7b
CLOUDFLARE_API_TOKEN=  HA_URL=  HA_TOKEN=  SONARR_URL= SONARR_API_KEY=  RADARR_URL= RADARR_API_KEY=
SCHOOL_ICAL_URL=  NASA_API_KEY=  ENTUR_CLIENT_NAME=  MET_USER_AGENT=
GOOGLE_OAUTH_CLIENT_ID=  GOOGLE_OAUTH_CLIENT_SECRET=  IMAP_HOST= IMAP_USER= IMAP_PASSWORD=
SMB_SHARE= SMB_USER= SMB_PASSWORD= BACKUP_PASSPHRASE=
```
Nøkler kan også legges inn i grensesnittet. Da lagres de kryptert på serveren og vises aldri igjen i klartekst.

## 7. Akseptansekriterier (et utvalg)
- Admin kan opprette brukeren «ingrid». Hun kan logge inn med brukernavn og passord, slå på 2FA med en autentiseringsapp, og etter det kreves kode ved innlogging fra internett.
- En pålitelig enhet på LAN slipper passord. Den samme enheten via tunnelen gjør det ikke.
- Elementene i topplinjen kan bare flyttes sideveis når «samme høyde» er på.
- Hastigheten på nyhetsbaren endres med en gang.
- Et 2-årig abonnement på 1 200 kr gir 50 kr/mnd og 600 kr/år.
- En backup til SMB-share kan gjenopprettes på en tom installasjon, og gir like mange rader og kvitteringsbilder.
- Excel-filen åpnes i Excel med ett ark per tabell og beløp som tall.
- Et trykk på skann på mobil åpner kameraet. Holder man inne, kan man velge fra Bilder eller Filer.
- To kontoer kan være logget inn i mobilappen samtidig, og man kan bytte mellom dem.
- Fanelinja på iPhone krymper ved scroll ned.

## Kildefiler i denne pakken
- `ci/release.yml`, `ci/ExportOptions.plist`: GitHub Actions for APK og IPA i Releases
- `README.md`: Homelab-grunnlag (datakilder, tokens, bilder)
- `CHANGES-prompt-03.md`: innstillinger, Sonarr/Radarr, nyhetslinje, søkebar, layout, popup
- `CHANGES-prompt-04.md`, `CHANGES-prompt-04b.md`: FinansHub v2, mobil, Android-innlogging, IPA
- `FINANSHUB-MODULER.md`, `FINANSHUB-MOBIL.md`: moduler og mobilomfang
- `finanshub/README.md`: FinansHub-arkitektur, AI, datamodell og API
- `prompts/prompt-01.md` … `prompt-05.md`: brukerens ønsker ordrett
- `design/`:
  - `Homelab v2.dc.html`
  - `Matplan.dc.html`
  - `Homelab Domener.dc.html` (+ `domener-kart.html`)
  - `FinansHub v2.dc.html`
  - `FinansHub v2 Moduler.dc.html`
  - `FinansHub Mobil v2.dc.html`
  - `Homelab Mobil.dc.html`
  - `CV.dc.html`
  - `support.js`, som trengs for å åpne prototypene lokalt
- Merk: `FinansHub OS` er fjernet. Alt ligger i `FinansHub v2` og `Homelab v2`.

## Prompt 11 · gjør dette først

- Brukerens ordrette ønsker står i `prompts/prompt-11.md`. Design: `design/Sporing.dc.html` (variant `page` og `widget`).
- **Ny fane «Sporing» i Homelab**, både på web (mellom Matplan og Domener) og i mobilappen (Homelab-fanelinjen og en widget på Homelab-hjem, «Pakker på vei»).
  - **Værmelding er kompakt og like stor som Pakker-kortet:** ikon og temperatur, tilstand, «føles som», høy/lav, en kort linje (vind, nedbør, fukt), 6 timer, nowcast, de neste 3 dagene (ikon, høy/lav, nedbør) og chips for soloppgang, solnedgang, UV og lufttrykk. Resten ligger i nedtrekket «Mer vær ▾».
- **I nedtrekket «Mer vær» på web-Dashboard** (yr/MET Locationforecast + Nowcast + Sunrise): ikon og temperatur, tilstand, «føles som» og dagens høy/lav, en nowcast-linje («Regnet gir seg rundt 01:00 …»), 8 nøkkeltall (vind med retning og kast, nedbør nå og 24 t, fuktighet med duggpunkt, UV, lufttrykk med trend, sikt, soloppgang med daglengde, solnedgang), 8 timer med ikon, temperatur og nedbørsstolpe i mm, og 6 dager med ikon, min–maks-stolpe og nedbør.
- **Web-Dashboard:** «Pakker» ligger i en **karusell med Værmelding** nederst til høyre (samme kortstil, sveip/scroll-snap og prikker under som også kan klikkes). Ingen egen pakke-widget øverst til venstre.
- **Widget** på Dashboard (web) og Homelab-hjem (mobil): opptil 3 aktive pakker med transportørmerke, navn, status, ETA og en fremdriftslinje i 5 steg. Pakker som er klare for henting kommer først. «Åpne sporing ›» går til fanen. På mobil ligger «Pakker» i en **karusell sammen med klokke og vær** øverst på Homelab-hjem: sveip sideveis mellom de to kortene, med prikker under (scroll-snap; native: `TabView(.page)` / `HorizontalPager`). Pakke-kortet viser de 2 viktigste pakkene og åpner Sporing-fanen. Karusellen flyttes og skjules sammen med «Klokke og vær».
  - **Fanen:**
    - Feltet «Lim inn sporingsnummer» og et valgfritt navn. Transportøren gjettes ut fra formatet og kan overstyres med chips.
    - Kilder som kan slås av og på: **Finn** og **E-post (Proton Mail)**, med «Sist sjekket» og «Sjekk nå».
    - Filteret Aktive / Klar for henting / Utgående / Levert, og kort med steg (Registrert → Hentet → I transport → Klar for henting / Ute for levering → Levert; ved utgående: Registrert → Levert inn → I transport → Ute for levering → Levert).
    - Trykk på et kort for å se tidslinjen, «Åpne hos transportør ↗», Arkiver og Slett (to trykk).
    - Nederst en liste over transportørene og om nøkkelen er på plass.
  - **Transportører:** Posten og Bring (Tracking API), PostNord (Tracking API), DHL (Shipment Tracking – Unified), UPS (OAuth Tracking API), og som reserve **17TRACK** eller AfterShip for FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og andre. Nøklene legges inn i Innstillinger → Integrasjoner under en ny gruppe «Sporing», med testknapp som de andre integrasjonene.
  - **Gjenkjenning av format** (start; må verifiseres): Posten `^[A-Z]{2}\d{9}NO$`, Bring `^70\d{15}$`, PostNord `^00370\d{15}$` / `^[A-Z]{2}\d{9}(SE|DK|FI)$`, DHL `^JJD\d{10,}$` / 10 siffer, UPS `^1Z[0-9A-Z]{16}$`, FedEx 12 eller 15 siffer, GLS 11 siffer. Ellers sendes nummeret til reservetjenesten, som finner transportøren.
  - **Automatisk innhenting:**
    - En jobb hvert 15. minutt leser nye e-poster via Proton Mail Bridge (IMAP). Den finner sporingsnumre i ordre- og fraktbekreftelser med regex, pluss AI som reserve, og lagrer butikk og varenavn.
    - Finn-handler med Fiks ferdig får sporingsnummeret fra Finn-e-posten og kobles til handelen; status vises også i Finn-tidslinjen.
    - Duplikater slås sammen på sporingsnummer.
    - Statusen hentes fra transportøren, oftere når en pakke er ute for levering.
  - **Varsler (push):** «Klar for henting hos …» og «Levert».
  - **Datamodell:** `shipment(id, tracking_no unique, carrier, name, source enum(finn,email,manual), source_ref, direction enum(in,out), status, eta, pickup_point, archived, created_at)` + `shipment_event(shipment_id, ts, status, location, raw)`.
- **Brytere for sporingsvarsler:** i Sporing-fanen («Varsler og haptikk») og i mobilappen under Innstillinger → Varsler → Sporing: Nytt sporingsnummer funnet · Ute for levering · Klar for henting · Levert · Forsinket. Standard er alle på, unntatt Forsinket.
- **Haptisk tilbakemelding i appene:** Innstillinger → App → Haptikk. Hovedbryter, styrke (Lett/Middels/Kraftig), og egne brytere for trykk på knapper og faner, fullført handling, feil og advarsler, og pakke-varsler, pluss en testknapp.
  - iOS: `UIImpactFeedbackGenerator(.light/.medium/.heavy)` for trykk, `UINotificationFeedbackGenerator` (`.success`/`.error`) for fullført og feil, `UISelectionFeedbackGenerator` for faner og chips. Respekter Systemhaptikk.
  - Android: `view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK / CONFIRM / REJECT)`. Respekter «Vibrasjon og haptikk».
  - Capacitor/PWA: `@capacitor/haptics` (`impact`, `notification`, `selectionChanged`), med `navigator.vibrate` som reserve på Android-web.
- **Søk: vanlig søk før AI ved enkle ord (web og mobil).** Er søket 1–2 ord uten spørsmålsord eller «?» (f.eks. «ica», «proton»), kjøres vanlig søk først. Gir det treff, vises de med «Fant N treff med vanlig søk, så AI ble ikke brukt», og AI kalles ikke. «✦ Spør AI likevel» tvinger AI. Gir vanlig søk ingen treff, går spørsmålet til AI som før. Dette sparer kall og tid.
- **iOS: sveip fra venstre kant for å gå tilbake**, overalt der det finnes en tilbakepil (til Homelab fra Finans, Domener og andre moduler, fra undersider, Finn-detalj osv.). Etter 90 pt gir det et haptisk tikk, og når du slipper går appen tilbake. Native: `UINavigationController.interactivePopGestureRecognizer` (UIKit) eller `NavigationStack` (SwiftUI). Har du en egen tilbakeknapp, behold gesten med `interactivePopGestureRecognizer.delegate = nil`. Capacitor: `@capacitor/app` + egen kantgest, eller `swipeBackEnabled` i Ionic.
- **Trading 212 er flyttet til Innstillinger → «Aksjer · Trading 212»** i FinansHub (web): status, Live/Demo, «Synk nå», API-nøkkel og secret ligger der. Aksjer-siden har bare en liten statuslinje («● Trading 212 · Synkronisert · 22:19 · Innstillinger ›») og ingen knapper.
- **Aksjer (Trading 212) i mobilappene, nytt design:** se `design/Aksjer Mobil.dc.html`. **Følger alltid appens tema:** iOS mørk med Liquid Glass-kort, hvite pilleknapper og dempede pasteller; Android/brettbar med Material You-tokens (følger fargetema, lys/mørk og «Følg systemet»). Den lyse varianten finnes bare som referanse.
  - **Portefølje:** verdi i dag med endringschip, områdegraf, periodevalg 1D/1U/1M/3M/1Å/Alt og filteret Alle/Aksjer/ETF/Kontanter. «Største posisjoner» er pastellkort du blar sidelengs i, med Kjøp/Selg. «Alle posisjoner» har sparkline og endring. Kontanter og «Transaksjoner ›».
  - **Aksjedetaljer:** logo, kurs, endring, graf med markør og tooltip, periodevalg, Min posisjon (antall, verdi, snittkurs, avkastning), handler i aksjen og en fast nederste rad med Selg/Kjøp.
  - **Transaksjoner:** søk, filteret Alle/Kjøp/Salg/Utbytte, gruppert per dag, med status Utført/Venter/Avvist.
  - Data: Trading 212 Public API (`/equity/portfolio`, `/equity/account/cash`, `/equity/history/orders`, `/history/dividends`); grafdata fra en kursleverandør. Kjøp/Selg åpner Trading 212 (deep link) med mindre ordre-API er slått på for kontoen. Oppsettet ligger i Innstillinger.
- **Subscription OS, nytt design (web og mobil):** se `design/Subscription OS.dc.html` (`variant="web"` og `variant="mobile"`) og `design/Subscription Varianter.dc.html`.
  - **Web**, med fanene Oversikt og Kalender:
    - **Oversikt:** kort med AI-sparing («Spar X kr i måneden»), totalbeløp per måned med trend og årsbeløp, Aktive/Dyreste/Billigste, et banner om kommende trekk og en årsgraf per kategori (stablet, med tooltip for valgt måned). Til høyre «Trekk denne måneden».
    - **Tabell** med sortering på alle kolonner, status Aktiv / ⚠ Lite brukt / ▲ Pris økt, og «Si opp». «⊕ Nytt abonnement» åpner en rad med tjeneste, plan, beløp, syklus (månedlig, årlig, hvert 2. år) og trekkdag.
    - Abonnementshelse 0–100 med gauge, og ✦ Forslag.
    - **Kalender:** måneden med logoer på trekkdagene. Trykk på en dag for å se trekkene, med fordeling per kategori ved siden av.
  - **Mobil** (følger appens tema: iOS-glass / Material You), med fanene Hjem · Innsikt · Historikk øverst:
    - **Hjem:** AI-sparing, neste 7 dager med stolper, abonnementssjekk og kommende trekk.
    - **Innsikt:** per måned (6 mnd), helse-gauge og stripete kategorilinjer.
    - **Historikk:** Smart sparing-agent med fremdrift og oppgaver du krysser av, og trekk denne måneden.
  - **«+ Legg til abonnement»:** på web en oransje knapp med meny, på mobil en +-knapp ved tittelen som åpner et panel. Tre valg: **Skriv inn selv** (tjeneste, beløp, syklus, trekkdag) · **Fra kvittering** (✦ AI leser bilde/PDF/e-post og fyller inn) · **Fra transaksjoner** (✦ faste trekk som er sett minst 3 ganger og ikke er registrert, hver med «+ Legg til»). Tilsvarende valg finnes i appens +-meny.
  - Status «Lite brukt» kommer fra bruksdata (Plex/Jellyfin/kontoinnlogging eller manuelt). «Pris økt» kommer fra sammenligning med forrige trekk.
- **Verdenskartet i Domener** tegnes direkte på siden (d3 + world-atlas), ikke i en iframe. Det er samme komponent på web og mobil.
- **Matplan i mobilappen følger appens tema:** glass på iOS og Material You-farger på Android og Fold. Det egne valget lys/mørk for Matplan er fjernet.
- **Android: samme farger på alle sider.** Innstillinger → Utseende → Sider har valgene «Samme overalt» (standard) og «Egen farge per side». Med «Samme overalt» bruker også Domener (som ellers er rosa) Material You-fargetemaet. Alle fargeroller utledes fra én seed-farge.
- **Import med maler:** `.xlsx`, `.csv` (`,` / `;` / tab, med celler i anførselstegn over flere linjer) og innlimt tekst.
  - **Innebygde maler:** «DNB · kontoutskrift (Excel)», som gjenkjennes på overskriftene Utført dato · Beløp inn · Beløp ut · Melding/KID/Fakt.nr, og «Kortutskrift MM/DD/YY uten overskrift».
  - **Overskrifter:** de kobles til feltene dato, beskrivelse, beløp inn, beløp ut, beløp, melding og mottaker via synonymer.
  - **Ukjent format:** AI (Ollama/Gemini) får overskriften og de første 5 radene og svarer med JSON `{date_col, desc_col, in_col, out_col, amount_col, date_format}`. Resultatet lagres som en mal med kolonnesignatur (`import_template(id, name, signature, has_header, mapping_json, date_format)`). Neste fil med samme signatur bruker malen uten AI.
  - **Beløp:** `-935.00`, `5300.00`, `11,616.00` og `1 234,50` tolkes riktig.
  - **Beskrivelse:** STORE BOKSTAVER gjøres om til vanlig skrift. Meldingen legges ved som råtekst.
  - **Visning:** importsiden viser hvilket format som ble brukt, hvilke kolonner som er koblet til hva, og listen over maler, der lagrede maler kan slettes.
- **Media → Historikk:** en vannrett rad med plakatkort for de siste avspillingene fra Plex (`/status/sessions/history/all`) og Jellyfin (`/Users/{id}/Items?SortBy=DatePlayed&Filters=IsPlayed` eller Playback Reporting). Hvert kort viser plakat, bruker (gul), «20 t siden», serie, «Sesong 8 · Episode 21» og episodetittel. Et trykk åpner tittelen på serveren.
- **iOS tilbake-sveip:** bruk det innebygde interaktive sveipet (UINavigationController `interactivePopGestureRecognizer`, eller i SwiftUI `NavigationStack`, ikke en egen gest). Siden følger fingeren fra venstre kant, forrige side vises dempet bak, og slipper du etter ca. 35 % av bredden eller med fart, går appen tilbake. Ingen pil eller ikon under sveipet.
- **Widgets (se `design/Widgets.dc.html`):** iOS WidgetKit (small/medium/large, glass, AppIntents for Skann-knappene) og Android Glance (2×2, 4×2, 4×3, Material You dynamiske farger). Widgetene er Vær, Pakker, Budsjett, Finans (saldo, siste transaksjoner, kvitteringer til gjennomgang), Neste trekk, Aksjer (Trading 212), Domener, Matplan, Finn, Boliger og Skann. Data hentes fra serverens API med app group / WorkManager hvert 15. minutt, og et trykk åpner riktig side (deep link).
- **Klokke/vær-kortet på mobil (Homelab-hjem):** vis bare klokke, dato, temperatur, tilstand, «føles som» / høy / lav, vindlinjen og stripen med de neste 6 timene. Fjern nowcast-linjen («Opphold de neste 90 minuttene»), de 3 dagene og chipsene for soloppgang, solnedgang, UV og lufttrykk. Kortet skal ikke ha tomrom nederst. Den utvidede versjonen hører bare til på web-Dashboard.
- **Samsung One UI-widgets (Widgets.dc.html → 1c):** samme størrelser som Samsungs egne (4×1 søk, 2×2, 4×2, 4×4), celler litt høyere enn brede (ca. 1 : 1,15, som Samsung Vær), hjørneradius ca. 34 dp, mørk bakgrunn med innstillbar gjennomsiktighet og lys/mørk-modus som Samsung-widgets, og blå One UI-aksent (#3E91FF). Widgetene er Søk, Klokke + vær, Pakker, Skann, Budsjett, Aksjer, Middag, FinansHub (4×4), Domener og Finn. Bygges med Glance, og `widgetCategory` og `targetCellWidth/Height` settes riktig.
- **Innstillinger → Import (samlet):** bankimport (CSV/XLSX med maler, CSV-profil, PSD2) og Finn.no. For Finn: last opp .eml/.mbox eller hent alle Finn-e-poster fra Proton Mail Bridge, og koble dem til handler (kvittering, «Du har solgt», Fiks ferdig, utbetaling). Lim inn annonselenker (`finn.no/.../item/{finnkode}`, én per linje). Serveren henter annonsesiden, AI trekker ut tittel, pris, beskrivelse og bilder, og alt lagres i Finn-handelen. Fanen «Bank og import» er fjernet.
- Lenkene til transportørene i prototypen (sporing.posten.no, tracking.bring.com, postnord.no/sporing, dhl.com, ups.com, fedex.com, gls-group.com, dbschenker.com, helthjem.no, budbee, instabox, 17track) må sjekkes før de brukes.

## Prompt 10

Dette er endringene fra forrige runde. De gjelder foran eldre punkter der de sier noe annet.


- Brukerens ordrette ønsker står i `prompts/prompt-10.md`.
- **Matplan skal ligge i Homelab, ikke i Finans.** I den bygde appen står «Matplan» i sidemenyen i FinansHub, mellom Finn-handler og Innstillinger. Fjern den derfra, og fjern `/finans/matplan`-ruten.
  - Matplan er en Homelab-fane (`/matplan`) med eget API (`/api/matplan`), ikke `/finans/api/…`.
  - Det eneste som kobler Matplan til økonomi: ukekostnaden kan trekkes fra kategorien «Mat og dagligvarer». Det skjer på serveren, ikke via FinansHub-grensesnittet.
  - I mobilappen åpnes Matplan fra profilmenyen → Andre OS, og Finans-fanelinjen skjules der.
- **Faste retter per ukedag:** når en rett er åpnet i Matplan, finnes «Alltid på» med Ma–Sø. En rett kan være fast på flere dager (f.eks. taco hver fredag, fiskesuppe mandag og torsdag), og hver dag kan ha én fast rett. Faste dager legges på i denne og kommende uker, og AI eller «Lag ny for uka» endrer dem ikke. Lagres i `matplan_fixed(weekday, dish_id, cook_id)`.
- **«Ny bolig» er flyttet til Innstillinger → Boliger** i FinansHub. Der ligger skjemaet (navn, adresse, type, del med, Opprett) og en liste over boligene, med «Slett» for eiere (to trykk: Slett, så Bekreft sletting). På Boliger-siden er skjemaet byttet ut med knappen «+ Ny bolig i Innstillinger». Deling og tilgang endres fortsatt inne på hver bolig.
- **Deling av boliger er også flyttet til Innstillinger → Boliger.** Hver bolig har knappen «Deling · N». Den åpner panelet med medlemmer, roller (Eier / Kan redigere / Kan se), fjern eller forlat, og del med en ny bruker.
- **Oppsett av boligsiden ligger i Innstillinger → Boliger** («Oppsett av boligsiden»). Der er en liste over kortene (Nøkkeltall, Utgifter per måned, Kategorier, Prosjekter, Faste regninger, Legg til utgift, Utgifter) med ↑, ↓ og en vis/skjul-bryter, pluss Nullstill. Boligsiden har **ingen** «Rediger»- eller «Del»-knapp i toppen; deling skjer også bare i innstillingene. Oppsettet lagres per bruker: `user_prefs.boliger_layout = {order:[], hid:[]}`.
- **Boliger: last opp til valgt bolig, og AI-kategorier med underkategorier (PC og mobil):**
  - «Legg i bolig» (select på PC, chips på mobil) bestemmer hvilken bolig en utgift, kvittering eller transaksjon havner i. Standard er boligen du står i. Bare boliger der du kan redigere vises.
  - Kategorier har underkategorier. Standard: Strøm · Vann og avløp · Hage og uteområde (Blomster, Jord og gjødsel, Plen) · Håndverker (Snekker, Elektriker, Rørlegger) · Basseng (Pumpe og filter, Kjemikalier) · Møbler og interiør (Hagemøbler) · Reparasjon · Vaktmester (Snømåking) · Kommunale avgifter · Vedlikehold (Maling og bygg) · Forsikring.
  - Etter skanning, opplastning eller henting av transaksjon velger AI kategori og underkategori. Passer ingen, **lager AI en ny kategori** (f.eks. «Sikkerhet › Alarm» for Verisure, «Oppvarming › Ved og pellets») **eller en ny underkategori** (f.eks. «Møbler og interiør › Sofa»). Det AI har laget merkes ✦, og brukeren får en melding.
  - Innstillinger → Boliger → «Kategorier for boliger»: legg til eller fjern kategorier, legg til underkategorier (Enter) eller fjern dem, slå «✦ La AI lage nye kategorier» av og på, og Nullstill. Er bryteren av, velger AI bare blant eksisterende kategorier.
  - Datamodell: `bolig_category(id, name, color, parent_id NULL, created_by_ai bool)`. Utgiften peker på underkategorien hvis den har en. AI-kallet returnerer `{category, subcategory, is_new}` som strukturert JSON, med listen over eksisterende kategorier i prompten.
  - Kategorikortet på boligsiden viser fordelingen på underkategorier, og utgiftslisten viser «Kategori › Underkategori».
- **Finn-handler: detaljside per handel.** Klikk på en handel for å åpne fire kort:
  - **Annonsen:** lim inn finn.no-lenken. Med «✦ Hent annonsen» henter serveren siden og lagrer tittel, pris, sted, beskrivelse og *alle bildene* lokalt (`finn_ad` + filer under `/data/finn/<finnkode>/`). Kopien beholdes selv om annonsen slettes. Mangler lenken, brukes Finn-koden fra e-postene. Annonsen kan også lastes opp som PDF eller skjermbilde. Henting skjer på serveren (ikke CORS i nettleseren), med rate-limit og respekt for robots.txt; AI trekker ut feltene til strukturert JSON.
  - **Original kvittering:** legg ved PDF, bilde eller .eml (flere filer), og fjern dem.
  - **E-poster i handelen:** alle e-poster i Proton Mail (via Bridge, IMAP) som inneholder Finn-koden eller varenavnet og kommer fra FINN, Posten/Bring, Tillit eller motparten, kobles automatisk til handelen og vises kronologisk med en utvidbar tekst. Manuelle .eml-filer kan legges til.
  - **Bilder:** last opp flere bilder (ved mottak eller før sending), med miniatyrer og fjern.
  - Listen viser et sammendrag per handel: «5 e-poster · kvittering ✓ · annonse lagret · 3 bilder».
- **Finn i mobilappens fanelinje (Finans), design 2a (valgt):** standard faner er Oversikt · Liste · **Finn** · Søk · Mer. Finn tar plassen til Budsjett, som er skjult som fane og ligger øverst under Mer. Budsjett kan slås på igjen i navbar-redigeringen. Se `design/Finn Mobil.dc.html` (komponent) og `design/Finn Handler Varianter.dc.html` (#2a).
  - **Liste:** netto i år med månedsstolper og linjer for kjøpt og solgt, «N på vei» som kort du blar sidelengs i (bilde, beløp, 4 sporingspunkter, «Neste: …»), filteret Alle/Kjøpt/Solgt/Fullført og et rutenett med 2 kolonner (bilde, statuspille, beløp). Søk i toppen.
  - **Handel:** stort bilde (egne bilder eller bildene fra annonsen; trykk for neste bilde), rolle og Finn-kode, tittel og beløp, oransje statuskort med sporingspunkter, tre fliser: Kvittering (last opp) · Annonse (✦ hent fra Finn) · Bilder (last opp), kvittering i papirstil (varepris, frakt, gebyr, total) og en tidslinje med steg og e-poster (trykk for å åpne; «+ Legg ved e-post»).
  - Stegene er Betalt → Sendt → Mottatt → Godkjent ved kjøp, og Solgt → Sendt → Levert → Utbetalt ved salg.
- **Nytt app-ikon (Homelab):** et tak over tre stigende søyler, på oransje gradient. Alle filer og oppsett ligger i `app-icon/` (se `app-icon/README.md` og `design/App-ikon.dc.html`).
  - iOS: Icon Composer-ikon med Standard, Mørk, Tonet og Klar (Liquid Glass), så ikonet støtter Tilpass på hjem-skjermen.
  - Android: adaptivt ikon (bakgrunn + forgrunn + **monochrome**), så «Tematiske ikoner» i Material You virker. PWA-manifestet får `maskable` og `monochrome`.
- **Sidemenyen i FinansHub skal være:** Oversikt, Transaksjoner, AI-søk, Kvitteringer, Budsjett, Faste utgifter, Kontoer, Aksjer, Rapporter, Subscription OS, Boliger, Finn-handler, **Import**, Innstillinger. Import manglet i den bygde appen.

## Prompt 09

- Brukerens ordrette ønsker står i `prompts/prompt-09.md`.
- **Matplan på mobil** har eget lyst «matapp»-utseende (se `design/FinansHub Mobil v2.dc.html`, Matplan i 1a/1b/1c):
  - Lys flate `#F1F2EC`, hvite kort med radius 24–30, limegrønn `#E4F0A9`, krem `#FBEACB`, tekst `#1E241C`, svarte pilleknapper `#1E1F1C`.
  - Rekkefølge: «Hei, <navn> / Middag denne uka» med ✦-knapp (ny ukeplan), tre kort (I dag, Kokk i dag, Faste dager), dagpiller (Ma 12 … Sø 18, valgt dag svart), stort kremkort for valgt dag (rett, «★ Ingrids beste», antall ingredienser, steg og kokk, ✦ for annen rett), Ingredienser (hver i lys rad med farget initial-rute), Slik gjør du, Handleliste med avkrysning, og «Se hele uka og alle retter».
  - Samme data som Matplan på web (`/api/matplan`).
- **Android-utseende på iPhone:** Innstillinger → Utseende → Designstil: «iOS · Liquid Glass» eller «Android · Material 3». Valget lagres per enhet. Med Android-valget bruker iPhone-appen samme skjermer og komponenter som Android-appen (Material 3 Expressive), med samme data, kontoer og innstillinger. I Android-visningen finnes samme valg for å bytte tilbake.
  - Native: hold UI-laget tema-agnostisk, eller bygg Android-skjermene i SwiftUI med Material-tokens. Enklest med Capacitor/PWA: samme webapp, `data-theme="ios"|"material"` på roten.
- **Matplan på mobil har lys og mørk modus:** bytt med ☾/☀ øverst, eller i Innstillinger → Utseende → Matplan. Mørk modus bruker flate `#141612`, kort `#1E211B`, rader `#252821`, lime `#3B4421`, krem `#3D3323`, tekst `#ECEFE6` og aksent `#FF7A55`.
- **Navigasjonslinjen kan redigeres:** Innstillinger → Utseende → Navigasjonslinje → «Endre navn, rekkefølge og skjul faner». Hver fane i Homelab og Finans kan få nytt navn (et tomt felt gir standardnavnet), flyttes eller skjules, for eksempel Budsjett. Lagres per bruker (`user_prefs.mobile_nav` = `{order, hide, names}`).
- **Toppraden med tilbakepil:** profilbildet står på samme rad som «‹ Homelab»/«‹ Finans», helt til høyre. Da skjules profilbildet i overskriften under.
- **Domener på iPhone:** innstillinger (tannhjul) er en rund glassknapp til høyre for fanelinjen, på samme plass som skanneknappen i Finans. Tannhjulet øverst er fjernet.
- **Skanneknappen på iPhone** ligger i samme rad som fanelinjen, som en rund glassknapp (62 × 62, oransje tint) til høyre for kapselen, ikke flytende over den.
- **Matplan er en egen flate:** Finans-fanelinjen, skanneknappen og Finans-fanene i railen (brettbar) skjules i Matplan. Bare «‹ Tilbake»-pilen øverst og profilmenyen vises.
- **Tilbake til startsiden:** standard er en **pil øverst** («‹ Homelab» eller «‹ Finans») i moduler som Domener, Matplan og Andre OS, ikke en hjem-knapp i navigasjonslinjen. Valget «Knapp i linjen» gir den gamle knappen tilbake. På iOS bruker pilen samme glass som resten.
- **Material You («Følg systemet») på Android:** fargene genereres i **OKLCH** fra systemets aksentfarge (Android: `dynamicDarkColorScheme(context)` / `dynamicLightColorScheme` i Compose, som gjør dette riktig av seg selv). Bare kulørtonen roteres. Hver token har en fast rolle og tone (overflate, tekst, primær, container, på-primær osv.), og lys modus bruker egne toner per rolle, ikke invertering. Statusfarger (grønn, rød, gul) og Domener-rosa følger ikke aksentfargen. Tidligere ga HSL-skifting av alle farger dårlige kombinasjoner.
- **Startside på mobil:** Innstillinger → Utseende → Oppstart: Homelab, Finans · Hjem, Finans · Liste eller Finans · Budsjett. Med Finans som startside åpner appen der, hjem-knappen går til Finans, og Homelab og de andre modulene ligger i profilmenyen.
- **Søk på mobil (AI og vanlig søk):**
  - Velgeren «✦ AI / Vanlig søk». Er AI-motoren av eller nede, brukes vanlig søk automatisk, med en melding om det.
  - Vanlig søk ser i butikknavn, kategorier, notater **og varelinjene i kvitteringene** (fritekst). Det forstår:
    - «sist jeg var på X»: siste kjøp, dato, og alle butikker med det navnet
    - «kvitteringer med tomater»: varelinjer som inneholder ordet, med bøying (tomat/tomater)
    - månedsnavn («i oktober»)
    - «over 500 kr»
    - «største utgift»
    - «til gjennomgang»
  - Hvert treff viser **hvorfor** det traff (Butikk · …, I kvitteringen · Tomater 500 g 24,90 kr, Kategori · …).
  - Etter et søk vises **«Prøv også»** (oppfølgingsspørsmål ut fra treffet) og **«Flere forslag»** under treffene.
  - Før søk vises forslag i tre grupper: Butikker, Varer i kvitteringer, Beløp og perioder.
  - Backend: `GET /finans/api/search?q=` (Postgres full-text på tx, kvitteringer og varelinjer, `unaccent` + norsk stemmer) som reserve når `POST /finans/api/search/ai` ikke svarer.
- **Android-utseende på iPhone** i prototypen vises som en innebygd ramme med «↩ iOS»-knapp.
- **Domener på mobil** har nå alt som på PC (se Domener under Mobilapper → Skjermer).
- **Fanelinja på iPhone** er flyttet ned, og glass-markøren kan dras mellom fanene (se «Fanelinje på iPhone: plassering og dra-effekt» under iOS).

## Prompt 08

- Brukerens ordrette ønsker står i `prompts/prompt-08.md`.
- **Innstillinger i Homelab** er bygget om igjen (se `design/Homelab v2.dc.html`):
  - Sidemenyen viser profilen øverst (avatar, navn, @bruker · rolle), og under den «Søk i innstillinger», som søker på tvers av alle sidene.
  - Gruppene er GENERELT (Konto, Utseende, Startside, Domener), TILKOBLINGER (Integrasjoner, med et merke for antall som mangler nøkkel) og SIKKERHET (Brukere). Nederst står «Lås skjermen» og «Logg ut».
  - Innholdet har en stor tittel og undertekst, og seksjoner med overskrift over et innrammet kort. Radene har tekst til venstre, verdi til høyre og en knapp («Endre», «Administrer», «Oppsett») eller bryter. Undersider har «‹ Tilbake» over tittelen.
  - Integrasjoner viser ekte logoer (favicon fra tjenestens domene) på lys bakgrunn.
- **Snarveier** viser ekte logoer. Lokale adresser slås opp med AI én gang (navn → domene), og svaret lagres. Uten treff vises initialer.
- **Rom:** Starlink-kartet tegner omrisset av Norge og nabolandene (world-atlas 50m + topojson-client) under satellittene.
- **Bakgrunn:** alle faner unntatt Dashboard bruker Matplan-fargene (side `#111113`, kort `#19191B` med kant `#262628`, felter `#202022`). Bakgrunnsbilde og «Siste nytt» vises bare på Dashboard.
- **Trading 212:** se «Feil: Trading 212 avviste nøkkelen» under Aksjer.
- **Kvitteringer fra Proton Mail:** se egen del under FinansHub.
- **Plex og Jellyfin:** se «Media» under Dashboard-widgets.
- **Krasj som er rettet i prototypen:** gammel kode slo opp innstillingsfanen i en liste med bare tre faner, og nye faner krasjet hele siden. Sørg for at ukjente faner faller tilbake til første fane.

## Prompt 07

- Brukerens ordrette ønsker står i `prompts/prompt-07.md`.
- **Innstillinger i Homelab** er bygget om til grupperte lister med ikon, verdi og › (se `design/Homelab v2.dc.html`). Hver integrasjon har «Test tilkobling» som gjør et ekte kall via serveren og viser resultatet, og «Test alle tilkoblinger» øverst.
- **Faner i topplinjen** kan skjules, gis nytt navn og flyttes (Utseende → Faner). I FinansHub gjelder det samme for sidemenyen (Innstillinger → Sidemeny).
- **Domener** legges til under Innstillinger → Utseende → Domener → «Administrer domener», ikke på Domener-siden.
- **«Delte mapper» heter nå «Boliger».**
- **Bakgrunnsbilde og «Siste nytt»** vises bare på Dashboard.
- **Matplan** har nytt design (se Matplan over).
- **Mobilappene** leveres som APK og IPA i GitHub Releases (se «Bygg og release»).

## Prompt 06

Se `CHANGES-prompt-06.md`. Den har egne endepunkter (§4) og akseptansekriterier (§5). Brukerens ordrette ønsker står i `prompts/prompt-06.md`.

## Feilrettinger i appen (18.10.2026)
Sammenlign alltid med `design/FinansHub Mobil v2.dc.html`. Designet er fasiten.
1. **Google-søk med AI på Homelab virker ikke.** Sjekk at forslag hentes via serveren (`/api/search/suggest`, proxy til Google suggest, så CORS ikke stopper det) og at «✦ AI»-modus kaller Ollama/Gemini med søket. Vis en feilmelding med årsak i stedet for ingenting. Enkle ord (f.eks. «ica», «proton») skal gi vanlig treff først, uten AI.
2. **Skanning av dokumenter og kvitteringer virker ikke.** Gå gjennom hele kjeden: kamera / filvelger → opplasting (multipart, HEIC → JPEG på serveren) → kø → Ollama qwen2.5vl / Gemini → lagring. Logg hvert steg. Feil skal vises på kvitteringen, ikke stoppe køen.
3. **Analyser på nytt med Gemini:** på en kvittering som mislyktes eller har lav sikkerhet (under minConf) vises knappen «✦ Analyser på nytt med Gemini» på bekreftelsessiden og i køen. Den sender originalbildet til Gemini (modell fra innstillingene), viser resultatet side om side med det forrige og lar brukeren velge hvilket som beholdes. Knappen vises også når Ollama ble brukt og var usikker.
4. **Fargebakgrunn på iOS virker ikke.** Innstillinger → Utseende → Bakgrunn → «Fargebakgrunn» skal tegne de fargede, uskarpe lysflekkene bak glasset (se designet). Bryteren må lagres, og lysflekkene skal ligge under alt innhold og over den svarte grunnen.
5. **Finn → «Netto i år»-kortet på iOS** skal ha samme farge og stil som i designet (FinansHub Mobil v2 → Finn), ikke systemets standardkort.
6. **Ruter-kortet på mobil er for stort.** Det skal være like kompakt som i designet: linjenavn i farget merke, destinasjon og minutter til avgang på én rad per avgang, maks 3–4 avganger. Ingen ekstra luft eller store tall.
