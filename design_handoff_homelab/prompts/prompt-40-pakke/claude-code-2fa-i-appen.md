# Sett opp totrinnsbekreftelse (2FA) i appen, ikke i nettleseren

Ønske 2026-10-20: «når jeg skulle sette opp 2fa på mobilen ble jeg sendt inn i web versjonen på mobil, jeg vil kunne sette opp fra appen.»
Fasit: `Mobil Papir App.dc.html` → Innstillinger → Sikkerhet → «Totrinnsbekreftelse» (`tfVals`, overlegget `tf`).

## Feil
Raden åpnet web-versjonen i Safari/Chrome. Hele oppsettet skal skje i appen (iOS og Android), uten å forlate den.

## Raden i Sikkerhet
- Av: «Totrinnsbekreftelse · Av · sett opp i appen på 1 minutt» → «Sett opp ›».
- På: «På · autentiseringsapp · 8 reservekoder igjen» → «Endre ›» (administrer).

## Flyt (fullskjerm i appen, 4 steg med fremdriftslinje, «‹ Tilbake»)
1. **Velg metode:** Autentiseringsapp (Anbefalt) eller Passnøkkel med Face ID / fingeravtrykk (Raskest).
2. **Koble til:** stor knapp «Åpne i autentiseringsappen» = `otpauth://totp/Homelab:sebastian?secret=…&issuer=Homelab&digits=6&period=30`. Åpner Passord (iOS 17+ har innebygd kodegenerator), Google Authenticator, 1Password osv. på **samme telefon**, ingen QR å skanne. Under: hemmelig nøkkel i grupper på 4 med «Kopier», og «Vis QR-kode for en annen enhet».
3. **Skriv koden:** 6-sifret felt med `textContentType=.oneTimeCode` (iOS) / `autofillHints=SMS_OTP|ONE_TIME_CODE` (Android), så koden kan autofylles. Feil kode: «Koden stemmer ikke. Prøv den neste som vises.» (tillat ±1 tidsvindu).
4. **Reservekoder:** 8 koder (`xxxx-xxxx`), «Kopier alle», «Lagre i Passord / Del» (share sheet), avkrysning «Jeg har lagret reservekodene» før «Slå på totrinnsbekreftelse» blir aktiv.
5. **Ferdig:** ✓ «Totrinnsbekreftelse er på». Denne telefonen merkes som pålitelig enhet.
- **Passnøkkel:** `ASAuthorizationPlatformPublicKeyCredentialProvider` (iOS) / Credential Manager (Android) mot WebAuthn-endepunktene på serveren; gå så rett til reservekodene.

## Administrer (når den er på)
Nye reservekoder · Bytt autentiseringsapp · Legg til passnøkkel · Slå av (krever passord eller Face ID først).

## Server
- `POST /api/auth/2fa/setup` → `{secret, otpauth_uri}` (lagres som «venter» til den er bekreftet).
- `POST /api/auth/2fa/verify {code}` → aktiverer, returnerer reservekoder (lagres hashet).
- `POST /api/auth/2fa/backup-codes` (nye), `DELETE /api/auth/2fa` (krever re-autentisering).
- WebAuthn: `/api/auth/passkey/register/options` + `/verify`.
- Alle kall går via appens API-klient med innlogget økt; ingen lenke til web.
