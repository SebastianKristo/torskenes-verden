# Familie og Media (prompt 51, fase 4)

Kort brukerveiledning for familiekalenderen med «hvem kjører?», «Hva skal vi se i kveld?», norske undertekster, lagring med anbefaling og lydbøker/podkaster. API-formene står i `SERVER51-API.md` (seksjon MEDFAM51).

## Familiekalender – «hvem kjører?»
**Hva den gjør:** felles kalender for hele familien (alle brukerne på serveren) på web/PWA under **Familie › Familiekalender** (`#/familiekalender`). En hendelse kan ha kjøreoppgaver – *bringing* (framme til start) og *henting* (når hendelsen er ferdig) – som tildeles et familiemedlem.
- Den som får en oppgave, får varsel («Du kjører: …»). «Jeg kjører» tar oppgaven selv, «Si fra meg» gir den tilbake.
- Har en oppgave ingen sjåfør et døgn før, får alle i familien ett varsel «Hvem kjører?».
- Sjåføren får påminnelse ca. 45 min før, med første kollektivforslag fra Ruter (Entur).
- **Ruter-forslag** går fra hjemmet (stedet med type *hjem* i Familie › Steder) til stedet på hendelsen. Stedet trenger koordinater (feltet «Koordinater» i skjemaet).
- Hendelsene vises også i **Kalender** som «Familiekalender» (kan slås av per person nederst på siden).

**Hva du må gjøre:** legg inn et sted med type *hjem* i Familie › Steder. Ingenting annet.

## Hva skal vi se i kveld?
**Hva den gjør:** Media › «Hva skal vi se i kveld?» (`#/mediakveld`) foreslår filmer og serier som **finnes i ditt eget bibliotek** (Radarr/Sonarr), ut fra **historikken** fra Plex/Jellyfin (Media › Avspilling) og **hvem som er hjemme** (Familie: de som deler posisjon og er innenfor et sted med type *hjem*). Du kan velge personer, lengde, sjanger og film/serie selv. Hvert forslag har en forklaring («Ingen av dere har sett den · 1 t 25 min · Animasjon», «Ingrid så sist S02E03 – neste: S02E04»).
- «Formuler med lokal modell» lar den lokale modellen (via ai-gate, aldri skyen) skrive forklaringen penere. Forslagene og fakta er de samme.
- Heter du noe annet i Plex enn i Nordlys, sett navnet med `PUT /api/media51/tonight/profile {plexUser}`.

## Norske undertekster (Bazarr)
**Hva den gjør:** viser om en film/episode har norske undertekster og lar deg trykke «Hent undertekster» (Bazarr søker etter manglende). Fanen *Undertekster* viser alt som mangler norsk.

**Hva du må gjøre:**
1. I `.env`: `MEDIA_DIR` (mediemappa på verten) og `MEDIA_PATH_IN_ARR` (stien Sonarr/Radarr bruker, f.eks. `/data/media`).
2. `docker compose --profile bazarr up -d`
3. Åpne Bazarr (`http://<LAN-IP>:6767` hvis `BAZARR_BIND` er satt til LAN-IP-en), koble til Sonarr og Radarr, og slå på **Norwegian** i Settings → Languages + en språkprofil som standard.
4. Kopier API-nøkkelen (Settings → General) til `.env`: `BAZARR_URL=http://bazarr:6767` og `BAZARR_API_KEY=…`, og start os på nytt: `docker compose up -d os`.

**Whisper (valgfritt):** undertekster kan genereres lokalt med Whisper på Mac minien (f.eks. `whisper.cpp` med modellen `large-v3` og `--language no`), og legges som `<film>.no.srt` ved siden av filen – Bazarr plukker dem opp ved neste skanning. Dette er ikke automatisert her, og ingen skytjenester brukes.

## Lagring med anbefaling (bare admin)
**Hva den gjør:** Media › *Lagring* viser diskene (fra Sonarr/Radarr), størrelsen på serier, filmer og nedlastinger, og en **«sett og stort»**-liste: filmer over `MEDFAM51_BIG_GB` (standard 8 GB) som noen har sett ferdig for mer enn 14 dager siden, og avsluttede serier over det dobbelte som ingen har sett på 30 dager.

**Sletting med angre – aldri hard sletting uten bekreftelse:**
- «Slett …» krever bekreftelse. Elementet slutter å overvåkes i Sonarr/Radarr med en gang (så det ikke lastes ned igjen).
- Med papirkurv-mappe flyttes mappa dit med en gang. Uten papirkurv står filene urørt i 24 timer, og deretter sletter Sonarr/Radarr dem (deres egen «Recycling Bin» brukes hvis den er satt opp der).
- «Angre» virker i 24 timer (flytter tilbake og slår overvåking på igjen).
- Papirkurven tømmes bare når du skriver **SLETT**, og bare for elementer som er eldre enn 24 timer.

**Hva du må gjøre for papirkurv (valgfritt):** monter mediemappa i os (se kommentaren under `os` i `docker-compose.yml`, f.eks. `- /srv/media:/media`) og sett i `.env`:
```
MEDFAM51_TRASH_DIR=/media/.papirkurv
MEDFAM51_PATH_MAP=/data/media=/media
```
Papirkurven må ligge på samme disk som filmene/seriene.

## Lydbøker og podkaster (Audiobookshelf)
**Hva den gjør:** Media › *Fortsett* viser «fortsett der du slapp» for lydbøker og podkaster per familiemedlem. Omslag hentes via serveren, så tokenet aldri forlater den.

**Hva du må gjøre:**
1. I `.env`: `AUDIOBOOKS_DIR` og `PODCASTS_DIR` (mappene på verten), og `ABS_BIND=<LAN-IP>` hvis appene på telefonen skal nå den hjemme.
2. `docker compose --profile audiobookshelf up -d`, åpne `http://<LAN-IP>:13378`, lag en admin og én bruker per familiemedlem (samme brukernavn som i Nordlys, ellers velger hver person sin bruker under *Fortsett*).
3. Lag et API-token for admin (Settings → Users → admin) og sett `ABS_URL=http://audiobookshelf:80` og `ABS_TOKEN=…` i `.env`. Valgfritt: `ABS_PUBLIC_URL=http://<LAN-IP>:13378` gir lenken «Fortsett i Audiobookshelf».
4. `docker compose up -d os`

## Sikkerhet
- Bazarr- og Audiobookshelf-nøklene står bare i `.env`, logges aldri og sendes aldri til web/apper.
- Begge containerne er bundet til `127.0.0.1` som standard (sett LAN-IP for hjemmenettet) og skal aldri eksponeres via Cloudflare uten egen innlogging.
- Lagring og sletting er bare for admin. Media krever Media-tilgang. Familiekalenderen er felles for alle i familien.
- Ta med `./audiobookshelf/metadata` og `./bazarr/config` i backupen hvis du vil beholde fremdrift og oppsett (de ligger utenfor `data/`).
