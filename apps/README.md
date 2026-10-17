# FinansHub – native apper

Begge appene er rene FinansHub-klienter. De snakker bare med `/finans/api/*` på homelab-serveren og viser ingenting fra resten av siden.

**Innlogging:** skriv inn serveradressen (f.eks. `https://os.dittdomene.no` eller `http://192.168.1.60:3000`) og passordet. Appen bytter passordet mot et eget token (`POST /finans/api/auth/token`) med tilgangene `finance:read`, `finance:write` og `receipts:write`.
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

## CI
`.github/workflows/mobile.yml` bygger APK-en og iOS-appen (simulator) ved hver endring i `apps/`.
- Last ned APK-en fra Actions-kjøringen (artefakt «FinansHub-android») og installer den direkte.
- iOS må signeres med egen Apple-konto for å kjøre på en telefon.
