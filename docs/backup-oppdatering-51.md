# Backup, oppdateringer og databasen (51)

Alt finnes i **Innstillinger → System → Backup og oppdateringer** (bare admin). Kortene er grønne, gule eller røde.

## Backup (restic, 3-2-1)

Nordlys tar en kryptert backup hver natt med restic (innebygd i imaget):

- **Lokal disk** – standard `BACKUP_DIR/restic51` (helst en egen disk, se under).
- **NAS** – en mappe der NAS-sharen er montert (f.eks. `/mnt/nas/nordlys`), eller en restic rest-server (`rest:https://nas.lan:8000/nordlys`).
- **Utenfor huset (valgfritt)** – Backblaze B2 (`b2:bøtte:nordlys`) eller S3. Legg inn nøkkel-ID og nøkkel; de lagres kryptert og vises aldri igjen.

Databasene kopieres konsistent (`VACUUM INTO`) før backupen, og innloggingsøktene tas ikke med. Gamle snapshots ryddes
(7 daglige, 4 ukentlige, 6 månedlige).

**Repo-passordet** genereres første gang. Trykk *Oppsett → Vis repo-passord* (krever passordet ditt) og lagre det i en
passordbehandler. Uten det kan backupen ikke gjenopprettes på en ny server.

### Testet gjenoppretting

Hver søndag kl. 04:10 (eller *Test gjenoppretting*) hentes siste snapshot til en temp-mappe, databasene sjekkes med
`integrity_check`, og serveren startes mot kopien på egen port (3902) med røyktest. Feiler noe, blir kortet rødt og admin får varsel.

### Hva du må gjøre

1. Åpne *Oppsett*, slå på *Automatisk backup*, legg inn NAS (og gjerne offsite), og trykk *Lagre*.
2. Vis og lagre repo-passordet.
3. Trykk *Ta backup nå* og deretter *Test gjenoppretting*. Kortet skal bli grønt.

Egen backup-disk og NAS i Proxmox (monteres inn i LXC-en og videre til Nordlys, overlever oppdateringer):

```bash
BACKUP_MP=/mnt/backupdisk/nordlys NAS_MP=/mnt/pve/nas/nordlys CTID=106 bash deploy/proxmox/update.sh
```

Velg deretter `/mnt/nas/nordlys` som NAS-mål i appen.

Gjenopprette alt manuelt på en ny server (med repo-passordet):

```bash
restic -r /srv/backup/restic51 snapshots
restic -r /srv/backup/restic51 restore latest --target /tmp/gjenoppretting
# Databasene ligger i …/data/.ops51-stage/db/ – kopier dem til data/ (når os er stoppet).
```

## Oppdateringer: staging og tilbakerulling

- **Staging (på som standard)**: en ny versjon bygges og startes først som en egen container mot en *kopi* av databasen.
  Den røyktestes (svarer, databasen åpnes, forsiden, innlogging avviser feil passord). Bare hvis alt er grønt byttes versjonen –
  ellers kjører den gamle videre og ingenting er endret. Har serveren under 1,5 GB ledig minne, hoppes staging over.
- *Prøv ny versjon i staging* bygger og tester uten å bytte. Trykk *Bytt* for å ta den i bruk (samme testede image), eller
  *Forkast*. Staging som står i over et døgn forkastes automatisk.
- **Tilbakerulling med ett trykk**: forrige image beholdes. *Gå tilbake til …* bytter tilbake på sekunder (ingen nedlasting eller
  bygging) og kan angres med samme knapp. Dataene beholdes.

Valg i `.env` (leses bare av updateren):

```
UPDATE_STAGING=0      # slå av staging for vanlige oppdateringer
STAGING_PORT=3001     # gjør staging synlig på http://<server>:3001 mens den står klar (standard: ingen port)
STAGING_BIND=0.0.0.0  # (valgfritt) lytt på LAN i stedet for bare 127.0.0.1
```

Etter endring: `cd /opt/homelab-os && docker compose up -d updater`. Første oppdatering etter 51 bygger updateren på nytt
(den trenger `sqlite3` for staging) – derfor går akkurat den oppdateringen uten staging.

## Databasen

Hver søndag kl. 04:40: integritetssjekk, WAL-sjekkpunkt, `VACUUM` og `PRAGMA optimize`. Kortet viser størrelse, WAL-fil og
siste sjekk. *Sjekk integritet* og *Vedlikehold nå* kjører det med en gang. Størrelse per tabell og migrasjonsloggen (nye
tabeller/kolonner per versjon) finnes i API-et `GET /api/ops51/db`.
