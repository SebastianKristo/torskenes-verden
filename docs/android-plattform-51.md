# Android-plattform (prompt 51)

Gjelder FinansHub for Android (`apps/android/app`) og den nye Wear OS-appen (`apps/android/wear`).

## Widgets (hjemskjerm)
- **Planlegging · saldo** (2 × 2, dra bredere for de neste trekkene): laveste saldo de neste 30 dagene, hvilken konto og hvilken dag. Data fra Planlegging (`/finans/api/fin51/calendar`). Trykk åpner Planlegging.
- **Sjekk inn** (2 × 2): «Alt bra» sender en innsjekk til familien med ett trykk (posisjonen sendes bare med selve innsjekken). «Hent meg» åpner Sjekk inn i appen, der du bekrefter (høy prioritet skal ikke sendes ved et uhell).
- Pakker og avganger fantes fra før og er uendret.
- Widgetene oppdateres hvert 15. minutt. Åpne appen én gang etter oppdatering så familien hentes til «Alt bra».

## Snarveier og Google Assistant (App Actions)
- Hold inne app-ikonet: **Sjekk inn**, **Legg til melk**, **Saldo**, **Neste buss**. Den siste varen du la til får sin egen snarvei.
- Assistant: «Hey Google, åpne sjekk inn i FinansHub», «… saldo», «… bussen», og «legg til melk» / «kjøp melk og egg» (havner i handlelisten «Handel» i Gjøremål).
- Merk: App Actions via Assistant krever at appen er installert fra Play Console (intern testing holder). Snarveiene på ikonet virker uansett.

## Android Auto
- **Avganger** (Mine stopp), **På vei hjem** (reisen hjem nå og «Si fra til familien»), **Media** (hva som spilles nå og «Fortsett» fra Audiobookshelf).
- Sideloadet app: åpne Android Auto på telefonen → trykk på versjonsnummeret 10 ganger → ⋮ → Utviklerinnstillinger → slå på **Ukjente kilder**. Da vises Homelab i bilen.
- Media i bilen er bare visning: serveren har ikke API for å styre avspilling (pause/spill) ennå.

## Wear OS-app (klokka)
- Sider: Sjekk inn «Alt bra», **Hent meg** (med bekreftelse), Avganger, Handleliste (kryss av, legg til med stemmen) og **Glimt** (snakk inn spørsmålet, svaret vises som tekst).
- Innlogging: klokka viser en QR-kode. Åpne FinansHub på telefonen → **Mer → Logg inn på annen enhet → Skann QR-kode**, og godkjenn med fingeravtrykk. Klokka får sitt eget token (kan logges ut under Innstillinger → Enheter). QR-koden inneholder aldri et token.
- Standardserver er `os.smarthjemexperten.no`; trykk **Server** på innloggingssiden for å endre.
- Installer: `adb -s <klokke> install wear-release.apk` (klokka må ha ADB over Wi-Fi slått på under Utvikleralternativer).

## Uten nett (offline-modus)
- Avkryssing og endringer i Gjøremål/handlelisten, varer fra snarveier og Assistant, og innsjekk fra widgeten eller bilen lagres på telefonen og sendes når nettet er tilbake (overlever omstart).
- Konfliktregel: **siste skriving vinner**. Er oppgaven endret av andre mens du var frakoblet, lagres din endring likevel og du får et varsel. Er den slettet, får du varsel om at endringen ikke ble lagret.
- Ting som har ligget i køen i over en uke fjernes (med varsel).

## Tilgjengelighet
- Knapper uten tekst (lukk ✕, slett ×, oppdater ↻ …) har fått beskrivelse for TalkBack og trykkflate på minst 48 dp der de manglet.
- Tekst er i sp og følger systemets tekststørrelse (også i widgetene og på klokka).

## Bygg
```
cd apps/android
./gradlew assembleDebug          # :app, :kalender og :wear
./gradlew assembleRelease        # også lintVitalRelease for alle tre
# wear/build/outputs/apk/{debug,release}/wear-{debug,release}.apk
```
