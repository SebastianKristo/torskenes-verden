# Docker-logger uten manuelt oppsett (med i neste serveroppdatering)

Ønske 2026-10-23: «gjør at jeg slipper å legge den docker ct for å få logg over containere. legg til det i neste server oppdatering.»
Gjelder `claude-code-innst-logger-docker.md` (Innstillinger → Server → Logger, `Logger.dc.html`).

## I dag
For at Logger skal virke, må brukeren selv legge til en egen container (`docker-socket-proxy`) og koble den til Homelab. Det skal ikke være nødvendig.

## Løsning
1. **Docker-socket-proxyen blir en del av Homelab-stacken.** Legg tjenesten i `docker-compose.yml` som følger med oppdateringen:
   ```yaml
   homelab-docker:
     image: tecnativa/docker-socket-proxy:latest
     container_name: homelab-docker
     restart: unless-stopped
     environment:
       CONTAINERS: 1
       LOGS: 1
       INFO: 1
       EVENTS: 1
       POST: 1        # kun for restart/stop, sjekkes i tillegg mot admin i API-et
       RESTART: 1
       STOP: 1
     volumes:
       - /var/run/docker.sock:/var/run/docker.sock:ro
     networks: [homelab]
   ```
   Ikke eksponert ut (ingen `ports`), bare tilgjengelig på det interne nettet som `homelab-docker:2375`.
2. **Backend** bruker `DOCKER_HOST=tcp://homelab-docker:2375` som standard. Faller tilbake til `/var/run/docker.sock` hvis den er montert direkte.
3. **Migrering ved oppdatering:** oppdateringsjobben (samme som brukes av «Tidligere versjoner»/rollback) legger til tjenesten hvis den mangler, og starter den. Finnes det allerede en proxy som brukeren har lagt inn selv, gjenbrukes den (oppdag via image-navn), og det lages ingen duplikat.
4. **Rollback:** tjenesten fjernes ikke ved rollback til en eldre versjon. Den er ufarlig, og loggene virker fortsatt.
5. **Uten Docker-tilgang** (f.eks. podman eller manglende socket): Logger viser «Får ikke tilgang til Docker. Homelab prøver å sette dette opp automatisk …» med knappen **Sett opp nå** (kjører samme steg) og «Vis detaljer» med feilen. Ingen tom side.
6. **Endringslogg** for oppdateringen: «Logger virker nå uten ekstra oppsett. Homelab tar med Docker-tilgangen selv.»

## Sikkerhet
- Socket montert `:ro` i proxyen. Proxyen tillater bare containers/logs/info/events + restart/stop.
- Restart/stop krever admin i Homelab-API-et (uendret).
- Masking av hemmeligheter i logger (uendret).

## Test
- Ren installasjon → Logger viser containere uten at brukeren gjør noe.
- Eksisterende installasjon med manuell proxy → oppdatering gjenbruker den, ingen to proxyer.
- Eksisterende installasjon uten proxy → oppdatering legger den til, og Logger virker etter omstart.
- Rollback én versjon → Logger virker fortsatt.
