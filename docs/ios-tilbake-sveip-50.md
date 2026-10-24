# iOS: tilbake-sveip (prompt 50)

Ønske 2026-10-24: «få ordnet back swipe på ios appen, den skal alltid funke». Spesifikasjon:
`design_handoff_homelab/prompts/prompt-50-pakke/claude-code-ios-tilbake-sveip.md`.

## Hvorfor sveipet ikke alltid virket

Gjennomgang av punktene i spesifikasjonen, mot koden i `apps/ios/FinansHub/Sources`:

| Mulig årsak | Gjelder? | Funn |
|---|---|---|
| Egen side-navigasjon i stedet for `NavigationStack`/`UINavigationController` | **Ja – hovedårsaken** | Ruteren er tilstandsbasert (`paperTab`, `module`, `paperFin`, `settingsPage` …, se `Nav23Route.swift`). Det finnes ingen `UINavigationController` i appen, så systemets `interactivePopGestureRecognizer` (og `interactiveContentPopGestureRecognizer` i iOS 26) finnes ikke. Kantsveipet er appens egen `UIScreenEdgePanGestureRecognizer` på vinduet (`Nav23Swipe.swift`). |
| Gesten slått av på sider som har tilbakeknapp | **Ja** | Den egne gesten var bare på når `paperCanSwipeBack` var sann – en håndplukket liste. Mange sider med synlig «‹ …»-pille i toppbildet var ikke med: Finans, Mat, Sporing, Familie, Domener-sider utenfor Domener, Avganger (fullskjerm), Bibel, Innstillinger åpnet fra Mer (`innst` → «‹ Mer») m.fl. Der skjedde ingenting når man sveipet. |
| `.navigationBarBackButtonHidden(true)` / egen tilbakeknapp | Nei | Brukes ikke. De få `NavigationStack` i appen er rot-stakker i ark (f.eks. `FinNavEditor26`) uten undersider. |
| `.toolbar(.hidden, for: .navigationBar)` / `navigationBarHidden` | Nei | Brukes ikke. |
| `fullScreenCover`/`sheet` brukt som «side» | **Ja** | Media, Studie, Nyheter-artikkel og Glimt-siden, Vær, System (Nordlys OS), AI-kontroll, Logger, Widgets, Glimt-innstillinger, Briefen, Finn-annonse, Gjøremål-info, 2FA og Kart er `fullScreenCover`. Hovedgesten slår seg av med vilje når noe er presentert. De hadde sin egen lukke-gest (`EdgeSwipeClose30`, `Common30.swift`), men den var en SwiftUI `DragGesture` lagt over hele siden – se neste punkt. Kart (`Kart46Views.swift`) og værkartet hadde ingen kantsveip i det hele tatt. Serie/film-detaljen i Media på telefon er et ark (`.sheet`) og lukkes med sveip ned som før. |
| `DragGesture`/`.highPriorityGesture` på rot, horisontale `ScrollView`/karuseller/kart som tar pan-gesten | **Ja** | `EdgeSwipeClose30` var en `DragGesture(minimumDistance: 8)` på roten av fullskjermen. Den konkurrerte med `ScrollView`-pannen, den vannrette fanerekka i Media, lister og kart, og tapte ofte (særlig på iOS 18, der UIKit-pannen i en `ScrollView` vinner). Hovedgesten krevde bare at kart og vannrette scroll-flater ventet; sveip-handlinger i lister (`UISwipeActionPanGestureRecognizer`), egne `UIPanGestureRecognizer` (f.eks. `HPan42`) og SwiftUI-drag kunne ta sveipet fra kanten. |
| WKWebView med `allowsBackForwardNavigationGestures` av | Nei (ikke relevant) | Eneste `WKWebView` er værradaren (`WxWebView22`) uten nettleserhistorikk. Gesten for frem/tilbake er bevisst av der, så kantsveipet lukker værkartet i stedet. |

## Hva som er endret

- **Sveip på alle sider med tilbakeknapp** (`Nav50Back.swift`, `Store.nav50CanSwipe`): de gamle undersidene, fullskjerm Avganger/Kalender/Chat, og alle andre sider der toppbildet viser «‹ …». Samme regel som pila (`PaperHero.topRow`): ingen pil → ingen sveip. Aldri på Hjem (roten), så appen kan ikke «fryse» der. Handlingen er `nav50SwipeBack()`: lukker det som er åpent (`paperBack`), ellers det samme som pila (`paperUp`). Koblet inn i `Shell.swift` (`RootView`).
- **Kantgesten vinner** (`Nav50Edge.waits`): alle pan-/drag-gester (scroll-flater, kart, karuseller, sveip-handlinger i lister, egne pans og SwiftUI-drag) venter på kantgesten. Kantgesten tar bare berøringer som starter i kantsonen (ca. 20 pt), så alt annet virker som før; et loddrett drag fra kanten avvises straks (fartsjekk i `gestureRecognizerShouldBegin`) og scroller.
- **Fullskjerm-sider** (`EdgeClose50`): `edgeSwipeClose30` bruker nå samme UIKit-kantgest, lagt på rotvisningen til kontrolleren som viser fullskjermen (ikke på en scroll-flate, jf. scroll-lærdommen). Av når et ark ligger over. Siden følger fingeren og lukkes etter min(110 pt, 28 % av bredden) eller et raskt sveip; slippes den før, glir den tilbake.
- **Kart og værkart** kan lukkes med kantsveip (`Kart46Views.swift`, `PaperWeather.swift`). Kartet kan fortsatt dras overalt ellers.

## Avvik fra spesifikasjonen

- **Ingen overgang til `NavigationStack(path:)`.** Ruteren styrer rundt 300 filer (fanelinje, sidelinje på iPad, profiler, dyplenker, toppbildet, scroll-posisjon og øyeblikksbilder for parallakse i `Nav23Swipe.swift`). En 1:1-overføring uten kompilator og uten UI-test-target for FinansHub er for risikabel i én runde. I stedet er den egne kantgesten gjort like robust som systemets: den er på overalt der det finnes en tilbakeknapp og vinner over andre gester fra kanten.
- **iOS 26 `interactiveContentPopGestureRecognizer` (sveip fra midten)**: finnes bare på `UINavigationController`, som appen ikke bruker. En egen fullbredde-gest ville konkurrert med karuseller, slidere, sveip-for-å-slette og kortene på Hjem (scroll-lærdommen), så den er ikke lagt til. Kant-sveipet virker på alle iOS-versjoner.
- **`UINavigationController`-utvidelsen** fra spesifikasjonen er ikke lagt inn: appen har ingen egne navigasjonskontrollere med undersider, og en global `viewDidLoad`-overstyring ville også endret systemets kontrollere (bildevelger, e-post, deling).
- **«Forkast endringer?» ved ulagret skjema** er ikke bygget: skjemaene (ny hendelse, rediger utgift) er ark eller sider uten felles «endret»-tilstand.

## Test (manuelt – ingen UI-test-target for FinansHub)

- Kant-sveip fra hver underside i Innstillinger, Finans (Liste, Detaljer, Aksjer, Kvitteringer, Mer), Media, Studie, Boliger, Kalender, Chat, Kart, Vær, System og Logger.
- Finans, Mat, Familie, Avganger: sveip går til Hjem (som «‹ Hjem»).
- Hjem: sveip gjør ingenting.
- Sveip halvveis og slipp: siden glir tilbake.
- Media: sveip fra kanten over fanerekka (Kommer snart · Sonarr …) lukker Media; vannrett scroll midt i rekka virker som før.
- Lister med sveip-handlinger: sveip fra kanten går tilbake; sveip som starter inne på raden viser handlingene.
- iPad: Innstillinger i to kolonner – sveip fra en underside går til oversikten.
