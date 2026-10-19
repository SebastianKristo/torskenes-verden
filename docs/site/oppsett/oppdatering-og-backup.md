# Oppdatering og backup

!!! warning "Viktig"

    **Ta backup før oppdatering.** Databasen migreres automatisk når serveren starter. Noen versjoner bygger den om, for eksempel 4.18.0, som flyttet alle data til én eier per bruker. En migrering kan ikke angres uten backup.

## Hva må tas vare på

| Hva | Hvor | Hvorfor |
|---|---|---|
| `data/` | `/opt/homelab-os/data` (Docker), `/mnt/user/appdata/homelab-os` (Unraid) | Databasen `homelab.db`, kvitteringsbilder, opplastinger, logo- og kartcache |
| `.env` | `/opt/homelab-os/.env` | `SESSION_SECRET`, og eventuelt `TOTP_ENC_KEY` og `SECRET_KEY`. Uten dem kan krypterte nøkler og 2FA ikke leses. |
| `proton/` | `/opt/homelab-os/proton` | Bare hvis du bruker Proton Mail Bridge |
| Passfrasen for SMB-backup | Passordbehandleren din | En kryptert backup kan ikke åpnes uten den |

## Backup før oppdatering

Velg minst én av disse.

=== "FinansHub (alle oppsett)"

    Gå til **FinansHub → Innstillinger → Backup og data**.

    - **Ta backup nå** sender en kryptert kopi til SMB-sharen, hvis den er satt opp.
    - **Full backup (.json)** laster ned alle dine FinansHub-data til maskinen din.

=== "Kopi av data/ (Docker)"

    ```bash
    cd /opt/homelab-os
    docker compose stop
    tar czf ~/homelab-backup-$(date +%F).tgz data .env
    docker compose start
    ```

=== "Snapshot (Proxmox)"

    ```bash
    pct snapshot 150 for-oppdatering      # bytt 150 med din CTID
    pct listsnapshot 150
    ```

## Oppdatere

En administrator kan oppdatere rett fra appen. Første gang må du likevel kjøre `update.sh` (Proxmox) én gang, så updater-containeren blir installert. På Unraid oppdaterer du som før.

=== ":material-cellphone-arrow-down: Fra appen"

    En admin kan oppdatere hele systemet fra nettleseren, uten Proxmox-shell: **Innstillinger → System → Oppdatering**. Siden viser installert og nyeste versjon og hva som er nytt (fra endringsloggen). Trykk **Oppdater nå** og skriv passordet ditt.

    !!! info "Første gang: kjør `update.sh` én gang"

        `update.sh` (se fanen Proxmox) henter den nye `docker-compose.yml` og starter den lille tjenesten `updater`. Etter det virker knappen. Frem til da står det «Oppdatering fra appen er ikke satt opp».

    Slik foregår en oppdatering:

    1. Serveren sjekker at du er admin, er logget inn i nettleseren og har skrevet riktig passord. Appene (iOS og Android) kan vise versjonen, men ikke starte en oppdatering.
    2. Databasen kopieres til `data/backups/pre-update-<tidspunkt>.db`. De fem siste beholdes.
    3. Updateren laster ned siste commit fra `main` på GitHub og kopierer filene inn i `/opt/homelab-os`. **`.env`, `data/` og `proton/` røres ikke.** Ingen filer slettes.
    4. Den bygger ny versjon av `os`. Den gamle kjører videre så lenge bygget pågår.
    5. Den starter `os` på nytt (og `cloudflared` hvis tunnelen er i bruk) og venter på at `/healthz` svarer, i opptil 3 minutter. Siden laster seg selv på nytt når den nye versjonen svarer. Vanligvis tar alt 2–5 minutter.
    6. Til slutt oppdaterer updateren seg selv og rydder bort gamle images.

    ??? note "Hva updateren har tilgang til"

        `updater` er en egen container med Docker-socketen. Det er i praksis root i LXC-en, og derfor er den skilt ut fra `os`, som aldri får Docker-tilgang. Den har ingen porter. Den leser bare `data/update/request.json`, og der brukes bare en id. Repo og branch bestemmer updateren selv (`UPDATE_REPO` og `UPDATE_BRANCH` i `.env`, standard `SebastianKristo/torskenes-verden` og `main`), så serveren kan ikke be den hente noe annet eller kjøre kommandoer. Prosjektmappen er montert på samme sti som på verten, så kjør alltid compose fra mappen: `cd /opt/homelab-os && docker compose …`.

    ??? failure "Hvis noe går galt"

        Status og logg vises på siden, og ligger i `data/update/status.json` og `data/update/log.txt`.

        - **Bygget feiler:** den gamle versjonen kjører videre. De nye filene er likevel kopiert inn, så en `docker compose up -d --build` for hånd vil prøve samme versjon. Neste vellykkede oppdatering retter det. Du kan også kjøre `update.sh` fra Proxmox.
        - **Ny versjon starter ikke:** se `docker compose logs --tail 100 os`. Rull tilbake som beskrevet i [Fra pre-update-backupen](#fra-pre-update-backupen).
        - **«Ikke satt opp» selv om du har kjørt `update.sh`:** se `docker compose ps updater` og `docker compose logs updater`. Updateren nekter å starte hvis compose er kjørt fra en annen mappe enn prosjektmappen.

    **Unraid** har ingen `updater`. Der står det at oppdatering fra appen ikke er tilgjengelig. Bruk **Check for updates** som før.

=== ":simple-proxmox: Proxmox: update.sh"

    Kjør på **verten** (ikke inne i containeren):

    ```bash
    bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"
    ```

    Skriptet gjør dette:

    1. Finner containeren med navnet `homelab-os`. Har du gitt den et annet navn, sett `CTID` foran: `CTID=150 bash -c "$(curl …)"`.
    2. Starter containeren hvis den er stoppet.
    3. Laster ned siste kode fra `main` som en tarball. Det trengs ikke git eller innlogging.
    4. Pakker den ut over `/opt/homelab-os`. **`.env` og `data/` røres ikke.**
    5. Bygger og starter på nytt med `docker compose up -d --build`, og med `--profile tunnel` hvis `CLOUDFLARE_TUNNEL_TOKEN` er satt. Dette starter også `updater`, så [Oppdater fra appen](#oppdatere) virker etterpå.
    6. Rydder bort gamle images.

    Vil du ha en annen branch, sett `BRANCH=navn` foran kommandoen.

=== ":fontawesome-brands-docker: Docker Compose"

    ```bash
    cd /opt/homelab-os
    git pull
    docker compose up -d --build                   # eller: docker compose --profile tunnel up -d --build
    docker image prune -f
    ```

    Har du brukt [Oppdater fra appen](#oppdatere) i en git-klon, er filene endret uten commit, og `git pull` kan klage på lokale endringer. Bruk da `git fetch && git reset --hard origin/main`. Det rører ikke `.env`, `data/` eller `proton/`, som ikke er i git.

=== ":material-server: Unraid"

    Trykk **Check for updates** på containeren, deretter **Apply update**.

### Etter oppdateringen

- Sjekk at `curl http://localhost:3000/healthz` svarer `ok`, og se `docker compose logs --tail 50 os`.
- Gjør en hard reload i nettleseren (Ctrl+Shift+R). PWA-en henter ny kode selv ved neste åpning.
- Les [endringsloggen](https://github.com/SebastianKristo/torskenes-verden/blob/main/CHANGELOG.md) for ting du må gjøre selv. Etter 4.13.0 må for eksempel alle slå på posisjonsdeling i Familie på nytt.
- Oppdater appene fra [Releases](https://github.com/SebastianKristo/torskenes-verden/releases), se [Mobilapper](mobilapper.md#oppdatere-appene).

## Migreringer

- Databasen migreres **automatisk** ved oppstart. Nye tabeller og kolonner legges til, og ingenting slettes.
- Det finnes ingen egne migreringskommandoer, og du trenger ikke kjøre noe for hånd.
- Etter 4.18.0 tilhører eksisterende data eieren av serveren (hovedadmin). Andre brukere starter med tomt regnskap.
- Gamle nøkkelnavn leses fortsatt. `trk_bring_uid` leses for eksempel som `mybringUid`.

## Automatisk backup til SMB-share

Gå til **FinansHub → Innstillinger → Backup og data → SMB-share**. SMB-backup er serveroppsett, så bare admin kan endre det. Andre brukere kan laste ned backup av sine egne data.

| Felt | Eksempel |
|---|---|
| Share | `//nas.local/backup` |
| Mappe | `finanshub` |
| SMB-versjon | `3.1.1` |
| Brukernavn / passord / domene | `backup` / •••• / `WORKGROUP` |
| Tidsplan | Hver natt kl. 03.00 |
| Behold versjoner | `14` |
| Innhold | Database, kvitteringsbilder og innstillinger |
| Kryptering | AES-256-GCM med passfrase |

1. Lag en egen bruker på NAS-en med skrivetilgang til sharen.
2. Fyll inn feltene og trykk **Test tilkobling**.
3. Trykk **Lagre**, og deretter **Ta backup nå** for å sjekke at det virker.
4. Listen nederst viser backupene på sharen med fil, tid, type, størrelse og status.

Arkivet heter `homelab-backup-<tidspunkt>.tar.gz.enc` og inneholder et øyeblikksbilde av hele `homelab.db`, `receipts/`, `uploads/` og `settings.json`.

## Gjenoppretting

### Fra FinansHub

1. **FinansHub → Innstillinger → Backup og data → Gjenopprett**.
2. Last opp en `.json`, `.xlsx` eller `.tar.gz(.enc)`, eller velg en backup på sharen. Krypterte filer trenger passfrasen.
3. Du ser antall rader per tabell før noe skjer. Trykk **Gjenopprett**.

Gjenopprettingen beholder ID-ene og gir samme resultat om den kjøres to ganger.

### Ny server fra backup

1. Installer som vanlig, se [Installasjon](installasjon.md). Bruk **samme `SESSION_SECRET`, `TOTP_ENC_KEY` og `SECRET_KEY`** som før.
2. Åpne `/finans/` og velg **Hent fra SMB-share** eller **Last opp backupfil**.

### Hele `data/`

```bash
cd /opt/homelab-os
docker compose down
mv data data.feil
tar xzf ~/homelab-backup-2026-10-18.tgz      # gir data/ og .env
docker compose up -d
```

## Rulle tilbake en oppdatering

Databasen er allerede migrert framover, så du må ta tilbake **både** koden og dataene.

### Fra pre-update-backupen

En oppdatering startet fra appen lagrer databasen i `data/backups/pre-update-<tidspunkt>.db` først. Slik går du tilbake:

```bash
cd /opt/homelab-os
docker compose stop os
cp data/homelab.db data/homelab.db.feil
cp data/backups/pre-update-2026-10-20T10-00-00-000Z.db data/homelab.db   # velg riktig fil (ls data/backups)
rm -f data/homelab.db-wal data/homelab.db-shm
docker compose start os
```

Kjører den nye koden ikke med den gamle databasen, må du også ta tilbake koden: bruk snapshot (Proxmox) eller `git checkout` (Docker) som under. Kvitteringsbilder og opplastinger ligger ikke i denne backupen, men de endres ikke av en oppdatering.

### Snapshot eller git

**Proxmox:** `pct rollback 150 for-oppdatering`

**Docker:**

```bash
cd /opt/homelab-os
docker compose down
git log --oneline -20                        # finn commiten du kjørte før
git checkout <commit>                        # eller en tag, f.eks. v4.12.1 (git tag --sort=-v:refname)
rm -rf data && tar xzf ~/homelab-backup-2026-10-18.tgz
docker compose up -d --build
```

Gå tilbake til `main` med `git checkout main` når feilen er rettet.
