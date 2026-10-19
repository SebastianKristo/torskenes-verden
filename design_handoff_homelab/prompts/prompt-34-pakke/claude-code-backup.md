# Innstillinger → Backup (hele systemet)

Fasit: `Mobil Papir App.dc.html` → Innstillinger → KONTO → **Backup** (undertekst viser «Hver natt 03:00 · Hele systemet» eller «Automatisk av»). Samme side på web under Homelab → Innstillinger.

## Seksjoner
1. **STATUS**
   - Siste backup: «I natt 03:00 · 2,4 GB · Hele systemet» + «✓ OK» (grønn) / «Feilet» (rød).
   - **Ta backup nå** → kjører med fremdrift i %. «Du kan lukke appen, den fortsetter i bakgrunnen.» Ferdig: hint «✓ Backup ferdig» + push.
2. **AUTOMATISK**
   - Bryter **Automatisk backup** (standard på).
   - Hvor ofte: Hver natt 03:00 · Hver 6. time · Hver uke (søndag) · Hver måned.
   - Behold: 7 siste · 30 siste · 90 dager · 1 år (eldre slettes automatisk).
   - Varsle meg når backup feiler.
3. **HVA SKAL TAS MED**
   - Omfang: **Hele systemet** · **Bare Finans** · **Egendefinert**.
   - Moduler (kan bare endres i Egendefinert): Finans (transaksjoner, kvitteringer, budsjett, abonnementer) · Kalender · Familie · Mat · Sporing · Huskeliste · Bursdager · Chat (samtaler + kunnskapsbase) · Domener · Innstillinger og brukere · Bilder og filer.
4. **HVOR**
   - Lagres på Homelab-disk `/srv/backup` (lokal).
   - Kopi til sky (av som standard): Backblaze B2 / Google Drive, kryptert **før** opplasting.
   - Krypter backup: AES-256, nøkkel hos brukeren (vis gjenopprettingsnøkkel én gang).
5. **GJENOPPRETT**
   - Liste over siste backups (dato · størrelse · omfang) → «Gjenopprett ›» åpner bekreftelse: velg hele eller enkeltmoduler, advarsel om at nåværende data overskrives (tar automatisk en sikkerhetskopi først).
   - «Last ned siste backup» (.tar.zst).

## Backend
- Jobb i køen (`backup_jobs`), kjøres av scheduler (cron-uttrykk fra valget). Kun admin kan endre.
- Innhold: `pg_dump` per modul-skjema + filmapper (kvitteringer, vedlegg) + `config/`. Manifest med versjon, moduler, sjekksum.
- API: `GET/PUT /api/backup/settings`, `POST /api/backup/run`, `GET /api/backup/list`, `POST /api/backup/restore {id, modules[]}`, `GET /api/backup/{id}/download`.
- Lagre status per kjøring (start, slutt, størrelse, feil). Feil → push + e-post til admin.
