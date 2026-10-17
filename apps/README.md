# FinansHub – native apper

Begge appene er rene FinansHub-klienter. De snakker bare med `/finans/api/*` på homelab-serveren og viser ingenting fra resten av siden.

**Innlogging:** skriv inn serveradressen (f.eks. `https://os.dittdomene.no` eller `http://192.168.1.60:3000`), brukernavn og passord. Har kontoen tofaktor, spør appen etter den 6-sifrede koden i et eget steg («Tofaktor er på for X …», med «← Tilbake»). Appen bytter innloggingen mot et eget token (`POST /finans/api/login` med `{username, password, code}`; svar 401 `{needsTotp: true}` betyr at koden mangler).
- Tokenet lagres i nøkkelringen på iOS og i kryptert lagring (Android Keystore) på Android.
- Passordet lagres ikke.
- Tokens kan trekkes tilbake i FinansHub → Innstillinger → Mobil og tilgang. «Logg ut» i appen trekker tilbake appens eget token.

## Android (`apps/android`)
- Kotlin og Jetpack Compose med Material 3 og tonal palett fra `#FF7A3D`.
- Uttrykksfulle former: ulik rundingsgrad og grupperte lister.
- Bunnmeny med en stor «Skann»-knapp.
- **Brettbare telefoner og nettbrett:** fra 600 dp bredde (`WindowSizeClass` Medium/Expanded) byttes det til navigasjonsrail med skanneknapp øverst, liste til venstre og detaljer til høyre.
- Skanning: systemkameraet (bakkamera) eller filvelger. «Del → FinansHub» fra Galleri laster opp direkte.
- Bildet roteres etter EXIF, og det sendes en nedskalert versjon (1600 px) til AI-en og et miniatyrbilde. Originalen beholdes.

Bygg: `cd apps/android && ./gradlew assembleDebug` (krever Android SDK og JDK 17). APK-en havner i `app/build/outputs/apk/debug/`.

## iOS (`apps/ios`)
- SwiftUI (iOS 17+) med Liquid Glass: `.glassEffect()` på iOS 26, ellers uskarpt materiale med lys kant.
- Flytende fanelinje med egen skanneknapp.
- **iPad:** sidefelt, liste og detaljer side om side.
- Skanning: kamera, Bilder eller Filer (også PDF).

Bygg (krever macOS med Xcode og [XcodeGen](https://github.com/yonaskolb/XcodeGen)):
```bash
cd apps/ios
brew install xcodegen
xcodegen generate
open FinansHub.xcodeproj
```
Velg ditt team under Signing & Capabilities og kjør appen på telefonen. Liquid Glass krever Xcode 26 og iOS 26.

## Mobil v3 (begge apper)
- **Flere kontoer i samme app:** «Legg til konto» (server → brukernavn/passord → 2FA-kode). Bytt aktiv konto i Innstillinger → Kontoer og brukere, eller **hold inne profilbildet** for raskt bytte. Hilsenen og avataren følger aktiv konto, og hver konto har egne data og tokens. «Logg ut andre kontoer» trekker tilbake de andre tokenene. Kontoene lagres i nøkkelringen (iOS) / kryptert med Android Keystore. Gamle innlogginger (én server + token) flyttes automatisk over.
- **Fanelinja i Finans:** Hjem, Liste og Budsjett. **Profilbildet** åpner menyen: Finans, «Andre OS» (Matplan, Domener, Subscription OS, Delte mapper, Finn-handler – egne skjermer i appen) og Innstillinger.
- **Skann:** trykk åpner kameraet med en gang; **hold inne** (~480 ms) gir valgene Ta bilde, Velg fra Bilder, Velg fil (PDF, JPG, HEIC) og Avbryt. Kan byttes i Innstillinger → Skanning og AI. Valgte filer går i opplastingskøen («I kø» → «Gemini leser … N %» → «Klar · trykk for å bekrefte»). Med «Last opp bare på Wi-Fi», eller uten nett, venter filene og lastes opp ved neste synk.
- **Brettbar Android / iPad:** navigasjonsrail/sidefelt med skanneknappen øverst og profilbildet nederst til venstre; på Android åpnes menyen fra venstre. Finans viser liste + detalj, modulene fyller hele skjermen.
- **Domener:** fanelinja byttes ut med Trafikk, Besøk, Ytelse og Sikkerhet, og skanneknappen skjules. Domenevelger, oppdater og tannhjul øverst. Leser `GET /domains/api/domains` og `GET /domains/api/:navn/analytics?range=…`. iPhone: mørkt glass med rosa aksent `#FF9EBE`; Android: rosa tonal palett (`#7B2949`/`#FFD9E2`, aksent `#FFB1C8`, kort `#2A2024`).
- **Innstillinger** (egen skjerm): profilkort og gruppene Konto (kontoer, sikkerhet, API-tokens), App (utseende, skanning og AI, varsler) og System (server og synk, data og lagring, om).
  - *Sikkerhet:* lås med Face ID / fingeravtrykk (kode/PIN som reserve), lås etter umiddelbart/1/5/15 min, skjul beløp i appveksleren. 2FA-status vises; oppsett (QR, gjenopprettingskoder) og pålitelige enheter åpnes i Homelab.
  - *API-tokens:* liste, «Trekk tilbake», nytt token med tilganger og utløp (30 d, 90 d, 1 år, aldri) som vises én gang med «Kopier». Krever at serveren tillater token-administrasjon med app-tokenet; ellers vises en henvisning til nettleseren.
  - *Utseende:* Fargebakgrunn (iOS, `fh_ios_bg`), startside, «Skjul beløp til jeg trykker».
  - *Server og synk:* lokal og ekstern adresse, «Bruk lokal adresse hjemme» (lokal brukes når den svarer innen 1,5 s), «Test tilkobling», aktiv vei, siste synk og serverversjon.
  - *Data og lagring:* tøm hurtigbuffer, synk nå, eksporter transaksjoner som CSV (`;`, UTF-8 med BOM). Full backup lages i FinansHub på PC.
- **iOS Liquid Glass:** standard `TabView` (får Liquid Glass automatisk på iOS 26) med `.tabBarMinimizeBehavior(.onScrollDown)` og en egen interaktiv glass-skanneknapp (`.glassEffect(.regular.tint(.orange).interactive())`). Bak `#if compiler(>=6.2)` + `#available(iOS 26, *)`, så appen bygger også med Xcode 16 / iOS 17.
- **Varsler:** valgene lagres (kvittering lest og budsjett 80 % også på serveren). Push fra serveren er ikke koblet på ennå.

## Innlogging og lokalt nett
- Skriver du adressen uten `http://`/`https://`, velger appen `http://` for lokale adresser (192.168.x.x, 10.x, 172.16–31.x, 100.64–127.x, `localhost`, `*.local`, `*.lan` og navn uten punktum) og ellers `https://`.
- Appen logger inn via `POST /finans/api/login` (brukernavn, passord, ev. 2FA-kode), og faller tilbake til `/auth/token` på eldre servere (bare passord). Svarer begge med 404, får du beskjed om å sjekke adressen eller oppdatere homelab.
- **Android:** `res/xml/network_security_config.xml` tillater klartekst-HTTP (Android 9+ blokkerer det ellers) og brukerinstallerte CA-er (for selvsignerte sertifikater). Adressefeltet bruker URL-tastatur uten stor forbokstav og autokorrektur.
- **iOS:** `NSAllowsLocalNetworking` og `NSLocalNetworkUsageDescription` er satt. iOS spør om tilgang til lokalt nett første gang.

## iOS: .ipa for sideloading
Det trengs en Mac med Xcode for å bygge og signere selv. CI lager også en **usignert** `.ipa` (artefakt «FinansHub-ios-unsigned» fra macOS 26-jobben) som kan signeres ved installasjon.
1. Installer [AltStore](https://altstore.io) eller [SideStore](https://sidestore.io), som fornyer signaturen automatisk, eller [Sideloadly](https://sideloadly.io).
2. Last ned `FinansHub-unsigned.ipa` fra Actions-kjøringen, og åpne den i AltStore/SideStore/Sideloadly med din Apple-ID.
3. Med en gratis Apple-ID er signaturen gyldig i 7 dager. AltStore/SideStore fornyer den mens telefonen er på samme nett som AltServer.

Bygg selv i Xcode: `xcodegen generate`, åpne prosjektet, velg ditt personlige team under Signing, og velg **Product → Archive → Distribute App → Custom → Development** for å eksportere en `.ipa`.

## CI
`.github/workflows/mobile.yml` bygger APK-en og iOS-appen (simulator) ved hver endring i `apps/`.
- Last ned APK-en fra Actions-kjøringen (artefakt «FinansHub-android») og installer den direkte.
- iOS må signeres med egen Apple-konto for å kjøre på en telefon. Den usignerte `.ipa`-en ligger i artefakten «FinansHub-ios-unsigned».
