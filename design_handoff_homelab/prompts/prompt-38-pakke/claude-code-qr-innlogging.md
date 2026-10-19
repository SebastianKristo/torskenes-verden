# Innlogging med QR-kode fra en mobil som allerede er logget inn (+ 2FA)

Ønske 2026-10-20: «la meg logge inn på brukere med å skanne QR-kode med mobil som allerede er logget inn, så hvis 2-faktor er på, spør så om den.»
Fasit: `Logg inn QR.dc.html` (web-innlogging til venstre, mobilen til høyre, klikkbar flyt).

## Flyt
1. **Ny enhet (web/Mac/brett):** innloggingssiden viser en **QR-kode** (med Glimt-logo i midten) og «Koden fornyes om 58 s», med instruksen «Åpne Homelab på mobilen → Innstillinger → Konto → Logg inn på ny enhet, eller skann med kameraet». Lenke: «Logg inn med passord i stedet».
2. **Mobil (innlogget):** Konto → **Logg inn på ny enhet**, eller systemkameraet (universal link `homelab://login?c=…` / `https://home.kristo.no/l/…`), åpner skanneren.
3. **Skannet:** på web dempes QR-en og avataren vises: «Skannet av Sebastian · Godkjenn på mobilen …». Mobilen viser arket **«Logge inn på ny enhet?»** med:
   - enhet (MacBook · Safari), sted/IP, konto
   - en **2-sifret matchkode** som også vises på web (beskytter mot QR-phishing)
   - **Godkjenn med Face ID** / **Avvis**
4. **Godkjent:**
   - **2FA av:** web logges inn med en gang: «✓ Logget inn som Sebastian · MacBook · Safari er lagt til under Pålitelige enheter».
   - **2FA på:** web viser **«Totrinnsbekreftelse»** med 6 sifferbokser og `autocomplete=one-time-code` (TOTP fra autentiseringsappen). Feil kode gir risting og rød tekst. Lenke: «Bruk en reservekode». Mobilen viser «Godkjent · skriv koden på den nye enheten».
5. **Avvist:** web viser «Innloggingen ble avvist» og ny kode.

## Sikkerhet / backend
- `POST /api/auth/qr` → `{sid, secret}`. QR-en inneholder `sid` + engangs-nonce, aldri en token.
  - Gyldig i 60 s, fornyes automatisk.
  - Web lytter med SSE/WebSocket på `sid` (`pending → scanned → approved|denied → done`).
- `POST /api/auth/qr/scan {sid}` (mobil, krever gyldig sesjon) knytter brukeren og returnerer enhetsinfo og matchkode.
- `POST /api/auth/qr/approve {sid, approve, biometric:true}` krever Face ID/Touch ID/fingeravtrykk på mobilen (LocalAuthentication / BiometricPrompt).
- **2FA:** er `user.totp_enabled`, får web bare en *pre-auth*-sesjon. `POST /api/auth/2fa {code}` (TOTP ±1 vindu, eller engangs reservekode) fullfører. 5 feil gir 15 min sperre.
- Godkjent ny enhet legges i **Pålitelige enheter** (navn, OS, nettleser, sist sett) og kan fjernes. Admin får varsel ved ny enhet.
- Rate limit per IP. QR-sesjonen bindes til web-klientens fingeravtrykk (UA + ephemeral nøkkel), så den ikke kan brukes fra en annen nettleser.
- Fungerer også mellom apper: Kalender-appen på Mac og iPad kan logge inn med QR fra telefonen.
