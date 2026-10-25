# Mobil: appen krasjer når Familie åpnes

Ønske 2026-10-24: «når jeg åpner familie på mobil ap krasjer hele appen»
Fasit for hvordan siden skal se ut: `Familie App.dc.html` (brukt i `Homelab.dc.html` → side `kart`, `tab="{{ famTab }}"`, `top-pad="44px"`, `on-close`). Designet åpner uten feil, så krasjet ligger i den native koden.

## 1. Finn årsaken først (ikke gjett)
- iOS: Xcode → Devices → *View Device Logs* / `Settings → Privacy → Analytics Data → Homelab-*.ips`. Android: `adb logcat -b crash` eller Play Console → Krasj.
- Reproduser: kald start → Familie, og varm start fra Hjem → Mer → Familie og kart. Noter hvilken som krasjer.
- Legg stacktracen i `vedlegg/familie-krasj.txt` og skriv årsaken i denne fila før du retter.

## 2. Sjekk disse (vanligste årsaker for denne siden)
1. **Tvungen utpakking / indeks utenfor rekkevidde** i personlisten: Mer sier «3 personer», Familie viser 4 (Sebastian, Ingrid, Pål, Kari). Ingen `!`, `first!` eller `[i]` uten grensesjekk. Person uten posisjon, batteri eller avatar skal vises som «Ukjent», ikke krasje.
2. **Kart:** MapKit/MapLibre skal opprettes på hovedtråden, én gang, og ikke på nytt for hver `body`-oppdatering. Ingen annotasjon med `NaN`-koordinater (posisjon mangler → hopp over pinnen). Tile-overlay (Kartverket topo) med feil URL skal gi tomt kart, ikke unntak.
3. **Posisjonstillatelse:** `CLLocationManager` / `FusedLocationProvider` må ikke kalles før tillatelse er gitt, og **Info.plist må ha** `NSLocationWhenInUseUsageDescription` (+ `Always` hvis deling i bakgrunnen). Mangler nøkkelen, krasjer iOS med en gang.
4. **HealthKit / Helse-kortet** (Home Assistant-import): `NSHealthShareUsageDescription` i Info.plist, og spørring kun når `HKHealthStore.isHealthDataAvailable()`. På Android: Health Connect ikke installert → skjul kortet.
5. **Live Activity / Hjemme trygt:** `Activity.request` bare når `ActivityAuthorizationInfo().areActivitiesEnabled`, og fang feilen.
6. **Fold/iPad-oppsett** (`variant="fold"`): bytte mellom én og to kolonner ved rotasjon må ikke skape ny kartvisning eller dobbel observer.
7. **Minne:** profilbilder og kartfliser nedskaleres (maks 2× visningsstørrelse). Mange fullstørrelsesbilder samtidig gir OOM-krasj på eldre telefoner.
8. **Navigasjon:** `famTab` med ukjent verdi (gammel lagret fane) skal falle tilbake til standardfanen.

## 3. Etter retting
- Familie åpner uten krasj fra kald start, fra Hjem, fra Mer og fra varsel/deep link, både med og uten posisjonstillatelse, og i flymodus.
- Legg til en krasjgrense: feil i ett kort (kart, helse, Live Activity) viser «Kunne ikke laste» i det kortet, resten av siden virker.
- Kjør med Address Sanitizer / StrictMode én gang for å fange flere feil.
