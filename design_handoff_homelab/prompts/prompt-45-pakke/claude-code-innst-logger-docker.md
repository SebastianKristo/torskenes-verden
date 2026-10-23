# Innstillinger → Server → Logger: Docker-logger og feilsøking

Ønske 2026-10-21: «i innstillinger legg til en log funksjon til selve dockeren og feil og slik for feilsøking.»
Fasit: `Logger.dc.html`, åpnes fra `Innstillinger Web.dc.html` → SERVER → **Logger** («Docker-logger, feil og feilsøking»). Søk i Innstillinger på «logg», «docker», «feil» leder hit. Mobil: samme side under Innstillinger → Homelab → Logger (én kolonne).

## Innhold
1. **Tall øverst:** containere oppe (10/10), feil siste time, advarsler, omstarter (med navn på verste), diskbruk `/var/lib/docker`.
2. **Containere:** piller med statusprikk (grønn kjører · gul starter på nytt · rød stoppet/exited) og rødt feiltall. «Alle» viser alt.
   - Valgt container: image:tag, status, oppetid, CPU, minne, antall omstarter + **Start på nytt · Stopp · Inspiser** (bare admin, med bekreftelse for Stopp).
3. **Filter:** søk i tekst · nivå (Alle · Info+ · Advarsler · Feil) · tid (15m · 1t · 24t · 7d) · **Live** (følger nye linjer, pause når man scroller opp) · **Last ned** (.log for valgt filter).
4. **Loggvindu:** mørk mono, kolonner tid · nivå (farget) · container · melding. ERROR-linjer har rød bakgrunn. Klikk på en linje åpner detaljer.
5. **Detaljer:** hele linjen, og **Glimt** forklarer på norsk hva det betyr og hva man gjør (f.eks. «Tunnelen får ikke kontakt med appen på port 8080 → bruk tjenestenavnet homelab-web:8080 i config.yml»). Knapper: **Kopier med 20 linjer rundt** (til Chat/issue) og **Vis i sammenheng** (filtrerer til containeren, alle nivåer).
6. **Feil gruppert (24 t):** like feil slås sammen (samme container + melding med tall/id-er normalisert): ×antall, melding, container, sist sett, «Forklar ›».

## Backend
- `GET /api/system/containers` → Docker Engine API via socket (`/var/run/docker.sock`, **kun lesing** for logger; `POST /containers/{id}/restart|stop` bare for admin). Kjør gjerne via `tecnativa/docker-socket-proxy` med `CONTAINERS=1 LOGS=1 POST=1 RESTART=1`.
- `GET /api/system/logs?ct=&since=&level=&q=` → `/containers/{id}/logs?stdout=1&stderr=1&timestamps=1&since=`. Nivå tolkes fra JSON-logger (`level`) eller tekst (ERROR/WARN/INFO/DEBUG, linuxserver-format, Postgres `LOG/WARNING/ERROR`). stderr uten nivå = WARN.
- Live: `GET /api/system/logs/stream` (SSE) med `follow=1`. Maks 500 linjer i vinduet.
- Gruppering: normaliser tall, IP-er, UUID-er og hasher før man teller.
- Lagring: behold 7 dager (Loki eller SQLite-ringbuffer). Ikke logg hemmeligheter: masker `token=`, `password=`, `Authorization:`, API-nøkler før visning og nedlasting.
- Glimt-forklaring: lokal modell med linjen + 20 linjer rundt + container/image. Kjente mønstre (connection refused, 401/403, ETIMEDOUT, OOMKilled, exit code 137, «no space left on device») svares uten LLM.
- Varsel: ny feilgruppe eller container som restarter > 3 ganger på 10 min → push «cloudflared starter på nytt hele tiden».

## Test
- Stopp en container → rød prikk, feil dukker opp, Glimt forklarer.
- Live på/av, søk «timeout», nivå Feil, 24t → riktige linjer. Last ned gir samme linjer.
- Ikke-admin ser logger, men ikke Start på nytt / Stopp.
