# Familie-krasjet (prompt 52)

Ønske: «når jeg åpner familie på mobil ap krasjer hele appen». Ingen stacktrace var tilgjengelig her. Årsakene under er funnet ved
å gå gjennom koden etter sjekklisten i `claude-code-familie-krasj.md`. Send gjerne `adb logcat -b crash` (Android) eller
`.ips`-fila (iOS) hvis det fortsatt krasjer.

## Android (AND52A)

**Mest sannsynlige rotårsak:** profilbildene ble dekodet i full oppløsning (`AppViewModel.image()` → `BitmapFactory.decodeByteArray`
uten nedskalering) og lagt i en `LruCache` som talte *antall* bilder (48), ikke byte. Et profilbilde fra kamera er 12–50 MP, altså
48–200 MB per bilde. Folk-kortene, «I DAG», kartpinnene og kartstripa viser alle profilbildene samtidig når Familie åpnes. Det gir
OutOfMemoryError eller «Canvas: trying to draw too large bitmap» (over 100 MB) i tegningen, og det kan ikke fanges. Appen krasjer.

Rettet:
- `P50Fam.kt` `photo50`: dekoder med `inSampleSize` til maks 2 × største visning (52 dp, maks 400 px) via `decodeScaled52` (`And52A.kt`).
  Cachen telles nå i byte (8 MB).
- Krasjgrense per kort (`ui/And52AUi.kt` `famGuard52`/`FamCardErr52`): kartdata (Folk-stripa, Kart, Personside, Sted) og «På vei hjem» i
  Sjekk inn. Feiler et kort, vises «Kunne ikke laste …», og resten av siden virker. Kartet hadde allerede sin egen feilgrense (`FamilyMapSafe`).

Sjekket uten funn (allerede trygt):
- NaN/manglende posisjon: `FamPerson50.hasPos` sjekker `validLatLon`. Pinner uten posisjon hoppes over.
- Tillatelser: `lastFix50` og `Geofence50` sjekker posisjonstillatelsen før `LocationManager` brukes. `FamilyService` starter ikke uten tillatelse.
- Health Connect: `HealthSync.statusIo` sjekker `getSdkStatus`. Helse-delen skjules når Health Connect ikke finnes.
- osmdroid: `MapView` lages én gang i `AndroidView.factory`, med `SafeMapView` og feilgrense.
- Ukjent `famTab`: `fam50Tab()` faller tilbake til Folk.

## iOS (IOS52A)

**Mest sannsynlige rotårsak:** profilbildet i kartnålene (`Fam50Avatar`, `Family50Model.swift`) leste `@Environment(Store.self)`.
Folk-fanen, som vises først når Familie åpnes, har kartstripa med én nål per person (`Fam50MapStrip` → MapKit `Annotation`).
Innholdet i en `Annotation` tegnes av MapKit i egne vertsvisninger, og miljøobjektet følger ikke alltid med dit. Mangler det,
er det en fatal feil i SwiftUI («No Observable object of type Store found») – appen avsluttes med en gang, og bare når minst
én person har posisjon (ellers er det ingen nåler). Den gamle Familie-siden (prompt 22) tegnet nålene uten miljøobjekter.

Rettet:
- `Fam50Avatar` bruker ikke lenger `@Environment(Store.self)`. Butikken hentes fra `Fam50Model.storeRef` (satt ved første henting).
- **NaN/ugyldige posisjoner** (`Family52Guard.swift`, `Fam52Geo`): `Fam50Person.coord` er `nil` for NaN, ±inf, utenfor ±90/±180 og
  0,0 – da tegnes ingen nål. Alle områder som går til MapKit (`Fam50Geo.region`, `Fam22MapCtl.go/fit`, områdekartet i Steder) klemmes
  til et gyldig område. `MKMapView` kaster `NSInvalidArgumentException` («Invalid Region») på ugyldige områder.
- `Int(NaN)` er en fatal feil i Swift: pila i kantmerkelappene på kartet (`Fam50Geo.arrow`) og merkelappene sjekker at tallene er endelige,
  og merkelappene vises ikke før kartet har en størrelse.
- **Like id-er:** personlisten (`LazyVGrid`, krasjer på like id-er), helse og «I DAG»/loggen får unike id-er.
- **Minne:** profilbilder nedskaleres til maks 240 px (`Fam22Photos.small`, ca. 2 × største visning), i stedet for kamerabilder i full
  oppløsning i nåler, kort og lister samtidig.
- **Kart i `body`:** kartstripa lages bare på nytt når noen flytter seg merkbart (~1 km), ikke ved hver henting hvert 30. sekund.
- **Info.plist:** personverntekstene for posisjon (når i bruk, alltid), bevegelse og Helse står nå også direkte i `Info.plist`
  (`project.yml` → `info.properties`), ikke bare som `INFOPLIST_KEY_`-innstillinger.
- **Krasjgrense per kort** (`Fam52Guard`): kartstripa, personene, Vel fremme, familiekalenderen, helsekortene og kartet i Kart/Personside.
  SwiftUI kan ikke fange en felle i ett kort, så vakten husker hvilket kort som ble tegnet. Krasjet appen da, viser kortet
  «Kunne ikke laste …» med «Prøv igjen» neste gang, og resten av Familie virker.

Sjekket uten funn (allerede trygt):
- Ingen `!`, `first!` eller `try!` i Familie-koden; indekser er sjekket.
- `CLLocationManager`: `Fam50Locator.fix()` ber om tillatelse først og venter maks 6 s; `didFailWithError` er implementert.
- HealthKit: `HealthSync` sjekker `HKHealthStore.isHealthDataAvailable()` før spørringer.
- Live Activity: `Activity.request` bare når `ActivityAuthorizationInfo().areActivitiesEnabled` (Hjemlys40/41, Plat51).
- Ukjent `famTab`: `Fam50Nav.tabKey` faller tilbake til Folk.

**Hvis det fortsatt krasjer:** Innstillinger → Personvern og sikkerhet → Analyse og forbedringer → Analysedata → `Homelab-…ips`
(eller Xcode → Devices → View Device Logs). Legg stacktracen i `vedlegg/familie-krasj.txt`.
