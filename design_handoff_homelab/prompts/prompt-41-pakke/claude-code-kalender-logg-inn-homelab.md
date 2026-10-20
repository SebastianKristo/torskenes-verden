# Kalender-appen: «Logg inn med Homelab-appen» virker ikke

Ønske 2026-10-20: «i kaledner logg inn med homelab appen funker ikke.»
Fasit: `Kalender App.dc.html` → innloggingsskjermen (`auVals`) og Innstillinger → «Logg ut».

## Skjermen
- Kalender-ikonet med dagens dato, «Velkommen til Kalender», «Bruk samme konto som i Homelab …».
- **Fortsett som Sebastian** (mørk knapp med avatar): vises når Homelab er installert og innlogget på samme enhet. Ett trykk, ingen app-bytte.
- **Logg inn med Homelab-appen**: app-til-app med godkjenning.
- **Bruk brukernavn og passord** (+ 2FA): reserve.
- Venter: spinner + steg «Åpner Homelab → Godkjenn i Homelab (Face ID) → Sender deg tilbake til Kalender → Henter kalenderne dine», «Åpne Homelab igjen» og «Avbryt».
- Feil: konkret tekst (se under) + «Prøv igjen» og passord-reserve. Aldri en tom skjerm.

## Slik skal det fungere
### 1. Fortsett som (samme enhet, ingen app-bytte)
- **iOS:** Homelab lagrer et kortlivet *enhets-token* i **delt Keychain** (`keychain-access-groups` = `$(TeamID).no.kristo.shared`) og/eller App Group `group.no.kristo.homelab`. Kalender leser det, sender `POST /api/auth/device-exchange {device_token, app:"kalender"}` og får egen refresh-token. Begge apper må ha samme Team ID og entitlement. Dette mangler i dag.
- **Android:** Homelab eksponerer en `ContentProvider` beskyttet av `android:protectionLevel="signature"` (samme signeringsnøkkel), eller `AccountManager` med felles kontotype `no.kristo.homelab`.

### 2. Logg inn med Homelab-appen (PKCE)
1. Kalender lager `state` + `code_verifier`/`code_challenge` og åpner **universal link** `https://home.kristo.no/app-auth?client=kalender&redirect=kalender://auth&state=…&cc=…` (ikke bare `homelab://`, som feiler stille når skjemaet ikke er registrert eller appen mangler).
2. Homelab fanger lenken (`applinks:home.kristo.no` i Associated Domains / `autoVerify` intent-filter med `assetlinks.json`), viser arket «Logge inn i Kalender?» med Face ID, og kaller `POST /api/auth/app-code` → `code`.
3. Homelab åpner `kalender://auth?code=…&state=…` (registrer `kalender` i `CFBundleURLTypes` / intent-filter). Kalender sjekker `state` og bytter `code` + `code_verifier` mot tokens på `POST /api/auth/token`.
4. Er Homelab ikke installert: universal-lenken åpner web-siden for godkjenning (QR-flyten fra `claude-code-qr-innlogging.md`).
- **Sannsynlige feil i dag:** feil/manglende URL-skjema for retur, `state` lagres ikke før app-bytte (appen kan bli drept → bruk Keychain/DataStore), redirect-URI ikke hvitelistet på serveren, eller tokenet tas imot i `onOpenURL` på feil scene.

### Feilmeldinger
- Homelab ikke installert: «Fant ikke Homelab-appen. Logg inn med brukernavn og passord, eller installer Homelab.»
- Avvist i Homelab: «Innloggingen ble avvist i Homelab.»
- Tidsavbrudd 60 s: «Homelab svarte ikke. Sjekk at Homelab er innlogget, og prøv igjen.»
- Serverfeil: vis HTTP-kode og «Prøv igjen».

## Etterpå
- Toast «✓ Logget inn som Sebastian», hent kalendere og innstillinger fra Homelab.
- Innstillinger → **Logg ut** øverst i GLIMT OG KONTO. Utlogging i Homelab logger også ut Kalender (server tilbakekaller app-tokens).
- Mac-appen: samme PKCE-flyt; «Fortsett som» via delt Keychain på Mac.
