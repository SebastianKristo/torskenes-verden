# Mobilapper

Det finnes tre måter å bruke Homelab OS på telefonen:

| | Hva | Når |
|---|---|---|
| **Android-app** | Native (Kotlin og Jetpack Compose), APK | Android-telefoner, Galaxy Fold, nettbrett |
| **iOS-app** | Native (SwiftUI), IPA for sideloading | iPhone og iPad |
| **PWA** | Nettsiden `/finans/` lagt på hjemskjermen | Alle telefoner, ingen installasjon |

Alle tre har samme Papir-design og snakker med det samme API-et.

<p>
<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/mobil-hjem.webp" width="180" alt="Hjem">
<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/mobil-finans.webp" width="180" alt="Finans">
<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/mobil-kalender.webp" width="180" alt="Kalender">
<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/mobil-integrasjoner.webp" width="180" alt="Integrasjoner">
</p>

## Installere på Android (APK)

1. Åpne [Releases](https://github.com/SebastianKristo/torskenes-verden/releases) på telefonen og last ned `FinansHub-<versjon>.apk`.
   Den nyeste byggingen fra `main` ligger også som artefakten **FinansHub-android** under [Actions → Mobilapper](https://github.com/SebastianKristo/torskenes-verden/actions/workflows/mobile.yml). Den er pakket i en zip.
2. Åpne filen. Android spør om du vil tillate **«Installer ukjente apper»** for nettleseren eller filbehandleren. Slå det på for den appen.
3. Trykk **Installer**.

**Oppdatering:** last ned den nye APK-en og installer over den gamle. Dataene beholdes. Har du 4.6.0 eller eldre, må du avinstallere én gang først, fordi APK-en etter det signeres med en fast nøkkel.

## Installere på iPhone og iPad (IPA)

Appen er ikke i App Store, så den må sideloades. Last ned `FinansHub-<versjon>-unsigned.ipa` fra [Releases](https://github.com/SebastianKristo/torskenes-verden/releases).

### AltStore eller SideStore (anbefalt)

1. Installer [AltStore](https://altstore.io) (med AltServer på en Mac eller PC) eller [SideStore](https://sidestore.io) etter veiledningen deres.
2. Del IPA-filen til AltStore/SideStore, eller åpne den fra **Filer → Del → AltStore**.
3. Logg inn med Apple-ID-en din når du blir spurt.
4. Første gang: **Innstillinger → Generelt → VPN og enhetsadministrasjon** → stol på utvikleren (Apple-ID-en din).
5. Med gratis Apple-ID varer signaturen i **7 dager**. AltStore og SideStore fornyer den automatisk. AltStore krever at telefonen er på samme nett som AltServer.

### Sideloadly

1. Installer [Sideloadly](https://sideloadly.io) på Mac eller PC og koble til iPhonen med kabel.
2. Dra IPA-filen inn i Sideloadly, skriv inn Apple-ID-en og trykk **Start**.
3. Stol på utvikleren som i steg 4 over.
4. Du må fornye selv innen 7 dager med gratis Apple-ID.

> [!WARNING]
> **HealthKit og sideloading.** Appen ber om HealthKit for å lese Apple Health. Med gratis Apple-ID godtar ikke alle verktøy det.
> - Feiler installasjonen i Sideloadly: åpne **Advanced options** og huk av **Remove entitlements**, og prøv igjen.
> - Appen virker da som vanlig, men **Apple Health dukker ikke opp**. Under Innstillinger → App forklarer appen hvorfor den ikke får spørre om tilgang.
> - Med betalt utviklerkonto (99 USD/år) beholdes HealthKit.

## Logg inn med app-token

1. Åpne appen og skriv inn **serveradressen**:
   - Hjemme: `http://192.168.1.60:3000`. Skriver du `192.168.1.60:3000` uten `http://`, velger appen `http://` selv for lokale adresser.
   - Ute: `https://os.example.no`.
2. Skriv inn **brukernavn** og **passord**.
3. Har kontoen 2FA, kommer det et eget steg for den 6-sifrede koden.

Appen sender dette til `POST /finans/api/login` og får tilbake et **app-token** (`fh_pat_…`). Tokenet lagres i nøkkelringen på iOS og i kryptert lagring (Android Keystore) på Android. **Passordet lagres ikke.**

- **Flere kontoer:** Innstillinger → Kontoer og brukere → Legg til konto. Hold inne profilbildet for å bytte raskt. Hver konto har egne data, widgets og opplastingskø.
- **Lokal og ekstern adresse:** under Server og synk kan appen bruke den lokale adressen når den svarer innen 1,5 s, og ellers den eksterne.
- **Logg ut** trekker tilbake appens token. Andre tokens ser du under FinansHub → Innstillinger → Mobil og tilgang.
- Bruker du Cloudflare Access, må `/finans/api/*`, `/api/*` og `/tiles/*` slippes forbi. Se [Installasjon](Installasjon#cloudflare-tunnel-anbefalt).

## Widgets

Widgetene henter data fra serveren hvert 15. minutt. Kalender-widgeten oppdateres i tillegg når hver time starter og slutter. Trykk på en widget for å åpne riktig side.

| Plattform | Widgets |
|---|---|
| **iPhone (WidgetKit)** | Kalender, Bursdager, Huskeliste, Vær, Pakker, Budsjett, Finans, Neste trekk, Aksjer, Domener, Matplan, Finn, Boliger og Skann, i liten, medium og stor. Bursdager finnes også på låseskjermen. |
| **Android (Material You)** | Glance-widgets med dynamiske farger, blant annet Kalender, Bursdager, Huskeliste, Sporing, Avganger og Saldo |
| **Samsung (One UI)** | Egne widgets i samme størrelse som Samsungs Vær-widget (2 × 2 = 134 × 155 dp): Skann, Huskeliste, Bursdager, Sporing, Avganger, Saldo og Kalender |

**Legge til:**
- **iPhone:** hold inne på hjemskjermen → **+** → søk etter appen → velg størrelse.
- **Android:** hold inne på hjemskjermen → **Widgets** → finn appen.
- **Samsung:** hold inne → **Widgets** → appen → velg en widget merket One UI. Under «Rediger widget» kan du slå av navnet under widgeten.

**Widgeten viser «Logg inn» (iOS):** åpne appen og gå til **Innstillinger → Widgets**. Der ser du om widgetene er koblet til appen, og kan trykke **Oppdater widgetene nå**. Se også [Feilsøking](Feilsøking#ios-widgeten-viser-logg-inn).

## Galaxy Fold og iPad

- Fra 600 dp bredde (Fold åpen, iPad) blir fanelinjen en **sidelinje** til venstre, med samme farge som fanelinjen på telefonen.
- En rød Hjem-knapp ligger øverst når du ikke er på Hjem.
- Hjem får to kolonner, Finans viser liste og detaljer side om side, og Vær har værkart og detaljark i et sidepanel.

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/brettbar-kalender.webp" alt="Kalender på Galaxy Fold" width="100%">

## Fanelinjen

- **Hold inne på fanelinjen** (på Hjem eller i Finans) for å endre navn, ikon og rekkefølge, eller legge til og fjerne faner.
- **Stil:** «Tekst», «Bare ikoner» eller «Ikoner + navn på valgt». Velges under Innstillinger eller «Rediger fanelinjen».
- **Trykk på aktiv fane** for å gå til fanens rot, for eksempel fra Bursdager tilbake til Mer. Trykker du igjen, scroller siden til toppen.

## App-ikon og app-navn

Under **Innstillinger** (gruppen med appnavn) velger du:

- **Navn**, for eksempel «Torskenes Verden». Navnet vises inne i appen, og på Android også under ikonet.
- **Ikon:** Hus, Monogram eller Fire rom.
  - iPhone: standard, mørk og tonet variant.
  - Android: Material You-ikon med monokromt lag for «Tematiske ikoner». Byttet skjer med activity-alias, så launcheren kan bruke noen sekunder på å oppdatere.
  - Web og PWA: favicon og ikon på hjemskjermen.

## Apple Health (iOS)

1. Første gang appen starter, spør onboardingen om Apple Health. Du kan også gå til **Innstillinger → App → Helse og posisjon**.
2. Slå på hovedbryteren og trykk **Be om tilgang**. iOS viser listen over datatyper.
3. Velg datatypene du vil dele. Bare det du velger, sendes til serveren.
4. Etterpå står appen under **Helse → Profil → Apper**.

Dukker ikke Apple Health opp, er HealthKit fjernet ved sideloading. Se advarselen [over](#installere-på-iphone-og-ipad-ipa) og [Feilsøking](Feilsøking#apple-health-dukker-ikke-opp).

## Health Connect (Android)

1. Android 14 og nyere har Health Connect innebygd (Innstillinger → Sikkerhet og personvern → Personvern → Health Connect). På Android 13 og eldre installerer du **Health Connect** fra Play Butikk.
2. La appen som samler dataene dine (Samsung Health, Google Fit, Garmin og lignende) skrive til Health Connect.
3. I Homelab-appen: **Innstillinger → App → Helse og posisjon → Be om tilgang**, og velg datatyper.

Slår du av hovedbryteren, slettes helsedataene dine på serveren. Helse deles med familien bare når du har slått på deling, se [Familie og kart](Familie-og-kart).

## PWA

1. Åpne `https://os.example.no/finans/` i Safari (iPhone) eller Chrome (Android).
2. **Del → Legg til på Hjem-skjerm** (Safari) eller **⋮ → Installer app** (Chrome).
3. Logg inn som på nettsiden.

PWA-en har ikke widgets eller Apple Health, men har ellers de samme sidene. Kvitteringer som ikke kommer fram fordi du mangler nett, ligger i «Venter på opplasting» og sendes når nettet er tilbake.

## Oppdatere appene

| | Hvordan |
|---|---|
| Android | Installer ny APK over den gamle |
| iOS (AltStore/SideStore) | Åpne den nye IPA-en i AltStore/SideStore. Den erstatter den gamle. |
| iOS (Sideloadly) | Installer den nye IPA-en med samme Apple-ID |
| PWA | Oppdaterer seg selv. Lukk og åpne appen. |

## Bygge selv

Se [apps/README.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/apps/README.md) for Android Studio, Xcode og XcodeGen.
