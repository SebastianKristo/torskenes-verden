# <img src="assets/icons/backup.svg" width="32" align="top"> Backup og gjenoppretting

[← Til README](../README.md)

<img src="images/finanshub-backup.webp" alt="Backup og data">

Alt finnes under **FinansHub → Innstillinger → Backup og data**.

## Last ned

| Format | Innhold | Brukes til |
|---|---|---|
| **Full backup (.json)** | Alle FinansHub-tabeller med ID-er | Gjenoppretting |
| **Excel-database (.xlsx)** | Ett ark per tabell: Info, Kontoer, Kategorier, Transaksjoner, Kvitteringer, Varelinjer, Budsjett, Faste utgifter, Aksjer, Utbytte, Ordre, Regler og flere | Oversikt, Excel og Power Query, og gjenoppretting |
| **Bare transaksjoner (.csv)** | `;` som skilletegn, UTF-8 med BOM | Regneark |

Excel-filen har filter på overskriftene og en frossen topprad. ID-kolonnene kobler arkene sammen, beløp lagres som tall og datoer som Excel-datoer.

## SMB-share (NAS)

Automatisk backup til en Windows-share, Synology, TrueNAS eller Unraid.

| Felt | Eksempel / standard |
|---|---|
| Share | `//nas.local/backup` |
| Mappe | `finanshub` |
| SMB-versjon | `3.1.1` (eller 3.0 / 2.1) |
| Brukernavn / passord / domene | `backup` / •••• / `WORKGROUP` |
| Tidsplan | Bare manuelt · hver natt kl. 03.00 · hver søndag kl. 03.00 · etter endringer (maks én per time) |
| Behold versjoner | `14` |
| Innhold | ☑ Database ☑ Kvitteringsbilder ☑ Innstillinger |
| Kryptering | ☑ AES-256-GCM med passfrase |

**Knapper:** «Test tilkobling», «Lagre» og «Ta backup nå». Listen nederst viser backupene på sharen (fil, tid, type, størrelse og status), hver med «Gjenopprett».

**Arkivet:**
```
homelab-backup-<tidspunkt>.tar.gz.enc
└─ FHBK1-hode · salt · IV · AES-256-GCM( tar.gz )
   ├─ homelab.db       øyeblikksbilde av hele SQLite-databasen (online backup)
   ├─ receipts/        kvitteringsbilder og miniatyrer
   ├─ uploads/         bakgrunner og andre opplastinger
   └─ settings.json    innstillinger (kv-tabellen)
```

- **Nøkkel:** nøkkelen lages fra passfrasen med scrypt (N=2¹⁵).
- **Overføring:** filen sendes med `smbclient`, som er inkludert i Docker-imaget, med en midlertidig passordfil (modus 600).
- **Opprydding:** eldre versjoner enn «behold versjoner» slettes fra sharen.

> [!CAUTION]
> Uten passfrasen kan en kryptert backup **ikke** gjenopprettes. Ta vare på den, og på `SECRET_KEY` og `TOTP_ENC_KEY` hvis du har satt dem, et annet sted enn på serveren.

## Gjenoppretting

Gjenoppretting skjer i to steg:
1. **Forhåndsvisning:** last opp en `.json`, `.xlsx` eller `.tar.gz(.enc)`, eller velg en backup på sharen. Du ser antall rader per tabell før noe skjer.
2. **Gjenopprett:** importen beholder ID-ene og er idempotent, så samme fil to ganger gir samme resultat.

Testene ([`test/finans-backup.test.js`](../test/finans-backup.test.js)) sjekker at en gjenoppretting til en tom installasjon gir like mange rader for alle tre formatene.

## Ny installasjon

Første gang `/finans/` åpnes med tom database, får du fire valg:

| Valg | Hva skjer |
|---|---|
| **Start tom** | Standardkategorier og ingen data |
| **Hent fra SMB-share** | Fyll inn sharen og passfrasen, velg en backup og gjenopprett |
| **Last opp backupfil** | `.json`, `.xlsx` eller `.tar.gz(.enc)` |
| **Eksempeldata** | Demodata for å prøve FinansHub |

## Manuell backup av hele serveren

Alt ligger i `data/` (`/opt/homelab-os/data` på Proxmox). Stopp containeren og kopier mappen, eller ta et snapshot av LXC-en i Proxmox:

```bash
pct snapshot <ctid> for-oppdatering
```

## Systembackup (Innstillinger → Backup)

Hele serveren (eller utvalgte moduler) som ett arkiv, kjørt etter tidsplan eller med **Ta backup nå**. Bare administratorer
ser og endrer dette. API: `/api/backup` (se `server/system-backup.js`).

- **Innhold:** `db/homelab.db` (konsistent øyeblikksbilde med `db.backup()`; ved modul-utvalg bare modulenes tabeller og
  innstillinger), filmappene til modulene under `files/` og `manifest.json` (versjon, moduler, tabeller, sha256 per fil).
  Øktene tas aldri med.
- **Hemmeligheten følger ikke med i arkivet:** `SESSION_SECRET` (i `.env`) eller fila `data/session-secret` (lages automatisk på en ny
  installasjon uten `SESSION_SECRET`) må tas vare på ved siden av backupen. Uten den kan lagrede integrasjonsnøkler og 2FA i en
  gjenopprettet database ikke leses. Restic-backupen (hele `data/`) tar med `session-secret`; for arkivene her må du kopiere den selv,
  eller sette samme verdi som `SESSION_SECRET` i `.env` på den nye serveren.
- **Format:** `.tar.zst` når `zstd` finnes på serveren, ellers `.tar.gz`. Kryptert: `.enc` (AES-256-GCM).
- **Lagring:** `BACKUP_DIR` (standard `data/system-backups`). I Docker/Proxmox: bind-mount `/srv/backup:/srv/backup` og sett
  `BACKUP_DIR=/srv/backup` i `.env` (se `docker-compose.yml`). Eldre backuper slettes etter «Behold».
- **Tidsplan (Europe/Oslo):** hver natt 03:00, hver 6. time, søndag 03:00 eller den 1. kl. 03:00.
- **Kryptering:** gjenopprettingsnøkkelen vises én gang. Ta vare på den: serveren har en kryptert kopi (for automatisk
  backup), men mister du `SESSION_SECRET`/`SECRET_KEY` eller datamappen, er nøkkelen eneste vei tilbake.
- **Sky:** Backblaze B2 (S3-API, signert med AWS SigV4). Bare krypterte backuper lastes opp. Google Drive kommer senere.
- **Gjenoppretting:** krever passordet, tar alltid en full sikkerhetskopi først, og erstatter de valgte modulenes tabeller i én
  transaksjon og filmappene med rename. Databasefilen byttes ikke, så serveren trenger ingen omstart; last appen på nytt etterpå.

## Gjenopprett fra en fil på PC-en

En systembackup du har lastet ned (**Innstillinger → Backup → Last ned siste backup**, filnavn
`bk-ÅÅÅÅMMDD-TTMMSS-xxxxxx.tar.gz` eller `.tar.zst`, eventuelt med `.enc`) kan lastes opp igjen og gjenopprettes.

1. Gå til **Innstillinger → Backup** og trykk **Gjenopprett fra fil …** (under *Gjenopprett*; på en server uten backuper står
   den øverst som *Har du en backup? Gjenopprett fra fil …*).
2. Velg fila. Den lastes opp med fremdrift og sjekkes på serveren før noe annet skjer.
3. Gjenopprettingsdialogen åpnes, den samme som for backupene i lista: velg hele backupen eller moduler, skriv passordet ditt
   på nytt og, hvis fila er kryptert og serveren ikke har nøkkelen, lim inn **gjenopprettingsnøkkelen**.
4. Det tas en full sikkerhetskopi av dagens data først. Last siden på nytt når den er ferdig.

Den opplastede fila står i lista med merket **Lastet opp** og kan gjenopprettes flere ganger. De fem siste opplastingene beholdes,
og de telles ikke med i «Behold».

**Ny installasjon (ny server, eller alt er slettet):**

1. Installer Homelab OS som vanlig (se [installasjon](installasjon.md)). Bruk gjerne samme `SESSION_SECRET` (eller fila
   `data/session-secret`) som den gamle serveren, ellers kan lagrede integrasjonsnøkler og 2FA i backupen ikke leses.
2. Åpne serveren i nettleseren og opprett admin i førstegangsoppsettet. På siste steg kan du trykke
   *Har du en backup? Gjenopprett fra fil etter oppsettet*, så går du rett til riktig side.
3. **Innstillinger → Backup → Gjenopprett fra fil …**, velg fila, skriv passordet du nettopp laget.
4. Krypterte backuper (`.enc`): den nye serveren har ikke nøkkelen, så du må lime inn gjenopprettingsnøkkelen som ble vist da
   du slo på kryptering (`xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx`). Uten den kan fila ikke gjenopprettes.
5. Gjenoppretter du *Innstillinger og brukere* (eller hele backupen), gjelder brukerne og passordene fra backupen etterpå.

Ingen kan gjenopprette uten å være innlogget som administrator: opplastingen krever en økt i nettleseren (ikke app-token), og
gjenopprettingen krever passordet på nytt.

**Hva serveren sjekker ved opplasting** (`POST /api/backup/upload`, `server/system-backup.js`):

- Fila strømmes til en midlertidig fil i `BACKUP_DIR`, aldri i minnet, i biter på 64 MB (Cloudflare-tunnelen slipper ikke
  gjennom store forespørsler). Grense: `BACKUP_UPLOAD_MAX` (standard `20G`; tall i byte, eller med `K`/`M`/`G`/`T`) og ledig
  plass. For stor fil gir 413. Til selve gjenopprettingen trengs omtrent like mye ledig plass til i `DATA_DIR`.
- Filnavnet fra PC-en avgjør bare formatet (`.tar.gz`/`.tar.zst` + valgfri `.enc`). Fila får en ny id (`bk-<nå>-…`).
- Kryptert: hodet må være i krypteringsformatet. Serveren prøver nøklene den har; passer ingen, lagres fila likevel, og
  innholdet sjekkes når du gjenoppretter med nøkkelen.
- Innholdet leses uten å pakkes ut: bare `db/homelab.db`, `files/…` og `manifest.json` er lov. Stier med `..`, absolutte
  stier, lenker (symlink/hardlink) og andre oppføringer avvises, og sha256 for hver fil må stemme med manifestet.
- Høyst ti nye opplastinger per kvarter per bruker (`BACKUP_UPLOAD_RATE`).

**Backup fra en annen versjon:** tabellene gjenopprettes med kolonnene begge versjonene har. Kolonner som er nye her og ikke kan
være tomme, får 0 eller tom tekst. Tabeller som bare finnes i backupen (nyere versjon), hoppes over, og tabeller som bare finnes
her (eldre backup), beholdes som de er. Dialogen viser hva som ble hoppet over.
