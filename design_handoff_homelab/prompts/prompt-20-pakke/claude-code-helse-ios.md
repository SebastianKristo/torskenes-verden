# Til Claude Code: iOS spør ikke om helsedata og mangler bryter i Innstillinger

## Symptom
- iOS-appen ber aldri om tilgang til Apple Health (HealthKit).
- Appen dukker ikke opp under iOS Innstillinger → Helse → Datatilgang og enheter, og det finnes ingen bryter for helse i appens egne innstillinger.

## Årsak (typisk)
iOS viser ikke appen i Helse-innstillingene før den har bedt om tilgang én gang. Det skjer bare hvis HealthKit er riktig satt opp, og koden faktisk kaller `requestAuthorization`.

## Fiks – oppsett
1. **Xcode → Signing & Capabilities → + HealthKit.** Gir `com.apple.developer.healthkit` i `.entitlements`. Skru på samme capability for App ID i Apple Developer, og lag provisioning-profilen på nytt.
2. **Info.plist:**
   - `NSHealthShareUsageDescription` = «Appen leser skritt, puls, søvn og aktivitet for å vise dem i Familie.»
   - `NSHealthUpdateUsageDescription` er bare nødvendig hvis appen skal skrive data.
   - Mangler disse, krasjer appen ved forespørsel.
3. **Capacitor/React Native:** bruk en HealthKit-plugin (f.eks. `@perfood/capacitor-healthkit` eller `react-native-health`). Kjør `npx cap sync ios` / `pod install` etter installasjon.
4. Sjekk `HKHealthStore.isHealthDataAvailable()`. iPad og simulator uten Helse gir `false`. Test på fysisk iPhone.

## Fiks – flyt
1. **Onboarding steg 3 («Nesten ferdig»):** egne rader for «Posisjon» og «Apple Health» (Android: «Health Connect»). Ved «Ferdig» med bryteren på: kall `requestAuthorization(toShare: [], read: [stepCount, heartRate, restingHeartRate, sleepAnalysis, activeEnergyBurned, appleExerciseTime])`.
2. **Innstillinger → App → Helse og posisjon** (ny undermeny, se `Mobil Papir App.dc.html`):
   - «Del helsedata» (hovedbryter) + «Be om tilgang ›»
   - Brytere per datatype: Skritt, Puls og hvilepuls, Søvn, Aktivitet og trening, Batteri og bevegelse
   - Posisjon: Del med familien, Presis posisjon, Også i bakgrunnen
   - «Åpne iOS-innstillinger» → `UIApplication.openSettingsURLString`. Helse-appen kan ikke dyplenkes direkte. Vis tekst: «Helse → Profil → Apper → <appnavn>».
3. HealthKit sier ikke om *lesetilgang* er gitt (av personvernhensyn). Lagre derfor at forespørselen er vist, og vis «Ingen data» i Familie hvis spørringen gir tomt svar, med lenke til fremgangsmåten over.
4. Synk: `HKObserverQuery` + `enableBackgroundDelivery(.hourly)` for skritt og puls. Send til backend `POST /api/familie/helse`. Stopp og slett serverdata når hovedbryteren slås av.

## Android (samme meny)
- Health Connect: `PermissionController.createRequestPermissionResultContract()` med `Steps`, `HeartRate`, `RestingHeartRate`, `SleepSession`, `ExerciseSession`.
- Manifest: `<uses-permission android:name="android.permission.health.READ_STEPS"/>` osv. og en `ACTION_SHOW_PERMISSIONS_RATIONALE`-aktivitet (påkrevd, ellers vises ikke dialogen).
- Kall alt utenfor hovedtråden (se også `claude-code-kart-fiks.md`, krasj i Familie).

## Test
Ny installasjon på iPhone → onboarding viser Apple Health → iOS-dialogen dukker opp → appen ligger under Helse → Apper → bryterne i appen styrer hvilke typer som synkes → Familie viser skritt og puls.
