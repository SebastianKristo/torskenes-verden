# Kalender: oppdater appen fra inne i appen (Mac og Android)

Ønske 2026-10-21: «La meg også oppdatere kalender appen for Mac fra kakender appen på Mac samme med kalender app på andorid.»
Fasit: `Kalender Oppdatering.dc.html` (`variant="mac" | "android" | "ios"`), brukt i `Kalender Mac.dc.html` (menylinja **Kalender → Se etter oppdateringer …**) og `Kalender App.dc.html` (Innstillinger → **Programvareoppdatering**).

## Flyt (Mac og Android)
1. **Se etter oppdateringer**: «Sist sjekket i dag 08:12». Kaller `GET https://home.kristo.no/api/apps/kalender/latest?platform=mac|android&channel=stabil|beta` → `{version:"1.1", build:17, size, url, sha256, signature, notes[]}`.
2. **Ny versjon**: «Kalender 1.1 (17) · Kalender-1.1.dmg · 12,4 MB» + «Nytt»-punkter fra `notes`. Knapper: **Last ned og installer** (Mac) / **Last ned** (Android) og **Senere**. Ingen ny: «Kalender er oppdatert».
3. **Laster ned**: fremdrift i %, MB av MB, fart. **Avbryt**.
4. **Klar til å installere**: signaturen sjekkes før knappen vises.
   - **Mac:** Sparkle 2 (`SPUStandardUpdaterController`), appcast fra serveren, EdDSA-signatur (`SUPublicEDKey` i Info.plist). «Installer og start på nytt» → appen lukkes, byttes og åpnes der du var.
   - **Android:** last ned APK til app-cache, sjekk at signeringssertifikatet er det samme som den installerte appen (`PackageManager.getPackageArchiveInfo(..., GET_SIGNING_CERTIFICATES)`) og SHA-256 fra serveren. Installer med `PackageInstaller` session. Systemet viser «Vil du installere en oppdatering av denne eksisterende appen?». Første gang: send brukeren til «Installer ukjente apper» for Kalender (`Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES`), og forklar det med én linje før.
5. **Ferdig**: «✓ Kalender er oppdatert til 1.1 (17). Kalenderne, innstillingene og innloggingen er beholdt.»

## Innstillinger i samme vindu
- **Se etter oppdateringer automatisk** (én gang om dagen, standard på).
- **Last ned og installer i bakgrunnen** (Mac: installeres neste gang appen lukkes) / **Last ned i bakgrunnen på Wi-Fi** (Android: WorkManager, `NetworkType.UNMETERED`, så varsel «Kalender 1.1 er klar · Installer»).
- **Kanal:** Stabil / Beta.

## iPhone og iPad
Kan ikke oppdatere seg selv. Raden viser «Kalender 1.0 (14) · via TestFlight», og vinduet forklarer det med knappen **Åpne TestFlight** (`itms-beta://`).

## Server
- `/api/apps/kalender/latest` og `/api/apps/kalender/<versjon>/<fil>` i homelab-backend. Byggene lastes opp av CI. Appcast for Sparkle genereres fra samme data.
- Varsel i Homelab-appen når ny versjon er publisert (valgfritt).

## Test
- Mac: Kalender → Se etter oppdateringer … → Last ned og installer → appen starter på nytt i 1.1.
- Android: Innstillinger → Programvareoppdatering → Last ned → Installer → systemdialog → Installer → 1.1. Første gang: tillat ukjente apper.
- Feil signatur / feil SHA-256 → «Oppdateringen kunne ikke bekreftes og ble slettet.» Ingen installasjon.
