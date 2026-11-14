# C – iOS / macOS / watchOS (`apps/ios/**`)

Fase 0, kun lesing. Ingen kompilator. Tallene kommer fra grep og egne Python-skript (`$S/ios/*.py`, kjørt mot `apps/ios`).
Skriptene fjerner kommentarer og strenger med en egen leksikalsk analyse før de teller. «Estimat» betyr vurdering, ikke måling.
Lange lister ligger i `C-ios-vedlegg.md`.

## 0. Sammendrag (de viktigste funnene)

| # | Funn | Tall |
|---|---|---|
| 1 | Brukerens anslag om `ObservableObject` stemmer ikke. Tallene peker motsatt vei. | **`@Observable` i 203 filer / 220 treff; `ObservableObject` i 15 filer (16 klasser), hvorav 12 er Mac-kode (macOS 13) og 3 er SharedKal som Mac også bruker.** Det finnes 0 iOS-eksklusive `ObservableObject` og 0 `@EnvironmentObject`. |
| 2 | Hardkodede farger | 277 filer (av 568) har litterære farger (`Color(hex:)`, `Color(red:)`, `"#xxxxxx"`, `0xRRGGBB`), 355 filer når `.white`/`.black` regnes med. Det er **700 unike hex-verdier** og 1 084 `Color(hex:)`-kall. Brukeren anslo ca. 230, hovedagenten målte 245; tellemåten avgjør. |
| 3 | Tilstanden er spredt | Det er én gud-`Store` (1 686 linjer, ~205 `var`) med **57 `extension Store`-blokker i 49 filer**, i tillegg til **254 `static let shared`-singletoner**. 121 `static var` med muterbar global tilstand ligger i 45 filer. |
| 4 | Navigasjonen bygger ikke på systemkomponenter | `NavigationStack` brukes 3 ganger, `NavigationSplitView` 0, `Form` 0, `.searchable` 0 og `ContentUnavailableView` 0. Ruting går via `if store.detail != nil …` i en `ZStack` (Shell.swift:90–108), med egen kant-sveip tilbake og egen fanelinje. |
| 5 | Dynamic Type mangler i hovedappen | `PF.ui/serif/mono(size)` brukes 3 902 ganger med faste størrelser og uten `relativeTo`. I tillegg kommer 645 `.system(size:)`. Bare Kalender (`KalTheme.swift:66–81`) skalerer. `@ScaledMetric` er brukt 0 ganger. |
| 6 | API-kontrakten er utypet | Hjelperen `JS.str/num/int/dict(...)` brukes 5 547 ganger og `JSONSerialization` 240 ganger. Det finnes bare 56 `JSONDecoder()`. 77 av 109 filer med `JSONSerialization.jsonObject` er `@MainActor`/`extension Store`, så parsingen skjer på hovedtråden (estimat). |
| 7 | Sikkerhet | Kalender-appens økt-token (`kal.token`), Homelab-tokenet som deles med widgetene (`w.token`, **fullt kontotoken**), `kal.hl.token` og `hl41.device` ligger i klartekst i App Group-`UserDefaults`. Bare FinansHub-kontoen og Mac ligger i Nøkkelringen. |
| 8 | Duplisert forretningslogikk | 10 konkrete tilfeller (helligdager/påske, tolking av klokkeslett på 3 steder, neste trekkdato, abonnementskategorier, oppslag fra butikk til domene, kalenderroller, bursdager, kvitteringstolking på enheten, vær direkte fra Open-Meteo m.m.). Se §6. |
| 9 | Død kode | 98 typer (~4 400 linjer) kan ikke nås statisk fra `@main`/widget-/intent-røttene. I tillegg ligger FinansHubs egen kalender (11 filer, 5 165 linjer) bak flagget `Kal84.on` (standard **på**), så den brukes nesten aldri. |
| 10 | Ytelse (estimat) | 22 filer har evige `TimelineView(.animation)` (15 av dem ignorerer Reduser bevegelse), 42 filer har `while … Task.sleep`-polling (30 s – 5 min), 165 `id: \.offset`-id-er ligger i 84 filer, 137 filer har `ScrollView` uten `Lazy*`, og ~50 `DateFormatter()` lages i funksjoner/kropper. |

## 1. Mål og filer

### 1.1 Mål i `project.yml`

| Mål | Plattform | Kilder | Swift-filer / linjer |
|---|---|---|---|
| FinansHub («Homelab») | iOS 17 | `FinansHub/Sources`, `Shared`, `SharedKal/Group`, **`Kalender/Sources` + `SharedKal/Core`** (KAL_EMBED, prompt 84) | 411 + 22 + 50 + 23 / ~178 000 |
| FinansHubWidgets | iOS-utv. | `FinansHubWidgets/Sources`, `Shared` | 15 + 22 |
| Kalender | iOS 17 | `Kalender/Sources`, `SharedKal/*` | 50 + 23 / ~20 000 |
| KalenderWidgets | iOS-utv. | `KalenderWidgets/Sources`, `SharedKal/*` | 3 |
| KalenderMac | macOS 13 | `KalenderMac/Sources`, `SharedKal/*`, **`Kalender/Sources/KalQuick.swift`, `KalGeo37.swift`** | 40 / 10 799 |
| KalenderMacWidgets | macOS 14 | `KalenderWidgets/Sources` (samme som iOS) | – |
| KalenderUITests47 | iOS UI-test | 1 fil, 34 linjer | – |
| FinansHubWatch51 | watchOS 10 | `Watch51/Sources` (eget, ingenting fra Shared) | 3 / 960 |

- Hele Kalender-appen kompileres **to ganger**: som egen app og inne i FinansHub med `#if !KAL_EMBED` rundt det som er særegent (project.yml:52–55). FinansHub har derfor to fullstendige tilstandsmodeller (`Store` og `KalStore`) og tre kalendergrensesnitt: `Cal27Page` (FinansHub), den innebygde Kalenderen og KalenderMac.
- `SWIFT_VERSION: "5.10"`, og `SWIFT_STRICT_CONCURRENCY` er ikke satt (project.yml:10).
- **493 av 568 Swift-filer har tall i navnet.** De grupperer seg i 60+ filfamilier (se vedlegg A).

### 1.2 Filfamilier med nummersuffiks (de viktigste)

Mønsteret er nesten alltid det samme: den første filen definerer typen, og senere «promptfiler» legger til `extension X`, nye satellitt-singletoner eller nye skjermer som erstatter gamle. **Filer blir sjelden slettet. Gamle visninger blir liggende, enten døde eller bak flagg.**

| Familie | Filer (linjer) | Rolle | Død / overstyrt |
|---|---|---|---|
| KalLogin | KalLogin (229), KalLogin41 (699), KalLogin89 (177) | 33: gammel skjerm og `KalAuth`. 41: ny skjerm uten serverfelt. 89: tannhjul/serverark | **`KalLoginView` (33) er død.** Bare `enum KalAuth` i KalLogin.swift brukes. 41 er i bruk, og 89 legger tannhjulet oppå 41 |
| MacLogin | MacLogin (133), MacLogin41 (419), MacLogin89 (140) | Samme mønster på Mac | **`MacLoginView` er død.** `MacLogin89Gear`/`MacLogin89Sheet` er også døde (bare `enum MacLogin89` brukes) |
| KalStore | KalStore (842), KalStore35 (233), KalStore39 (192) | Hovedklasse, zoom/innstillinger og fire kalendere | Alle er i bruk (extension-lag) |
| MacStore | MacStore (700), MacStore35 (125), MacStore39 (28) | Speiler KalStore for macOS 13 (`ObservableObject`) | I bruk. Logikken er **duplisert** fra KalStore |
| KalSrv*Core | KalSrv46Core (106), 47Core (183), 89Core (118) + KalSrv47 (iOS) / MacSrv47 | Serveradresser: filtrering (46), lagring/synk (47), migrering av feilstavet domene (89) | Alle er i bruk. De danner tre lag for én innstilling |
| Server (FinansHub) | Server41 (387), Server47 (243), Login89 | 41 finner adresse uten serverfelt, 47 standardadresser, 89 domeneretting | `Server41Group` er død. 41 og 47 dupliserer KalSrv41/47 for Kalender |
| Settings | SettingsView (756), Settings24/25/30/32/34/36/39/45 (44–353), Settings50Wide (350) | Klassisk skjerm og én fil per prompt | Rutingen `case "innst-…"` er **duplisert** i Paper.swift:1082 og Settings50Wide.swift:334 |
| Family | Family16 (1 332), 21, 22 (546), 24, 42 + Family50* (8 filer) + Family52Guard | 16: første versjon, 50: ny navigasjon | **5 typer i Family16 er døde** (`FamilyHeroArt`, `FamilyPin`, `FamilyMemberCard`, `FamilyZoneSheet`, `FamilyHealthView`). `FamilyZoneShareRow21` er død |
| Brief | Brief34Page (461), Brief35Page (664), Brief36/37/38/52/73 + Brief34Shared | Morgenbrief, lag på lag | **`Brief34Page` med 7 undertyper er død**, og det samme gjelder `Glimt34Figure` med 7 typer i Shared/Brief34Shared. `Brief35Top`, `Brief37TodosCard`, `Brief38CardsStack` og `Brief38CardsSettings` er døde |
| More | More (998), More24 (149), More28 (444), More44 (523) | «Mer»-siden | **`PaperMore24` og `PaperMore28` med undertyper er døde** (erstattet av More44). Wiggle30 er også død: `Mer30EditList`, `Mer30Card` … |
| Paper | Paper (1 360), Paper15 (627), Paper16 (750), Paper17 (1 348), PaperPages (1 115) … | Designskall og sider | `PaperSearch`, `PaperMore`, `PaperSettings` (PaperPages), `PaperEditBar`, `PaperTabBarEditor`, `GoogleArc20`, `AppNameSheet`, `PaperStocks`, `PaperFinMore`/`PaperFinMoreGrid` er døde |
| Weather/Vaer | Weather16/22*/25/28*/32, Vaer40/41/45/46, WxWeek39, Wx52Bg | To parallelle navnerom for vær | `Vaer45HereCard`, `WxBottomBar28` og `WxBarBackground28` er døde |
| Tasks | Tasks17 (784), 21, 22, 32, 37*/40*/41*/43*/44*/45*/46 | Huskeliste | `TaskEditSheet` (17), `TaskListHeader21`, `TaskShareSheet21`, `Task37NewListChip` og `Tasks44SyncRow` er døde |
| Calendar (FinansHub) | Calendar26*/27*/29/32 (11 filer, 5 165 linjer) + Shared/Calendar26Shared | Homelabs egen kalender | Bak `Kal84.on`, som er av som standard. Nesten all bruk går derfor til den innebygde Kalenderen (Kal84Embed.swift:17–21) |
| Theme | Theme22, Theme28, Theme51 + Skin17, Glass50, Paper.swift `PaperPalette` | Fire palettlag | Alle i bruk. Se §3 |

Full familietabell (110 filer) og alle døde typer: vedlegg A og B.

### 1.3 Navnekollisjoner mellom mål

Typene `BudgetView`, `ScanView`, `DomainsView`, `StocksView` og `FinnView` finnes både i FinansHub og i FinansHubWidgets/Widgets.swift. `KalFont` finnes i KalTheme og KalWidgets, og `Reply` finnes tre steder (Watch, Shared, Mac). Det kompilerer fordi de ligger i ulike mål, men det er duplisert UI.

## 2. Arkitektur

### 2.1 Tilstand (nøyaktige tall)

| Mekanisme | Filer | Treff |
|---|---|---|
| `@Observable` | 203 | 220 |
| `class …: ObservableObject` | 15 | 16 (MacStore, MacWin, MacLogin41Model, MacUpdater43, MacPrefsTab43, MacBarModel, MacGlimtModel, MacSearchModel, MacAbLogos42, MacWeb38Model, MacBdPeople41, MacAi41, KalGeo37, KalSec51Model, KalQR38Model, KalSrv47Model) |
| `@Published` | 15 | 115 |
| `@StateObject` / `@ObservedObject` / `@EnvironmentObject` | 5 / 27 / 0 | 7 / 86 / 0 |
| `@Environment(Type.self)` | 277 | 907 (av dem `@Environment(Store.self)` i 276 filer) |
| `@State` | 224 | 1 095 |
| `static let shared` (singletoner) | – | **254** |
| `X.shared` brukt direkte i visninger | – | `KalStore.shared` 149, `Store.shared` 114 |
| `UserDefaults` | 140 | 658 (`@AppStorage` bare 7) |

**Vurdering:** iOS bruker allerede `@Observable`. Problemet er ikke rammeverket, men at all tilstand ligger i én `Store` (iOS) eller `KalStore`, pluss ~250 globale singletoner. Det gir skjulte avhengigheter (276 visninger leser hele `Store`), testbarheten blir svak, og visninger tegnes på nytt bredt (estimat). `ObservableObject` på Mac er en bevisst følge av macOS 13 som minstemål. Å heve minstemålet til macOS 14 ville gjøre det mulig å fjerne begge.

Spesielt om **`PaperSkin.palette`** (Skin17.swift:7–9): en global `static var` settes *under* `body` (Shell.swift:88 `let _ = PaperSkin.use(pal)`) og leses av 10 filer, blant annet `Color.skinFg`, `skinScheme()` og `skinSheetStyle()`. Den er ikke observerbar. Visninger som bare leser den, tegnes derfor ikke på nytt når temaet byttes. Dette er en sannsynlig kilde til fargefeil i ark og «klassiske» skjermer, og et datakappløp i Swift 6.

### 2.2 Store-varianter

| Store | Fil | Eier |
|---|---|---|
| `Store` | FinansHub/Sources/Store.swift (1 686 l.) + 57 extensions | Kontoer/innlogging (Nøkkelringen), alle FinansHub-data (transaksjoner, kvitteringer, abonnementer, budsjett …), navigasjon (`paperTab`, `detail`, `editing`, `paperClassic` …), tema, meldinger/toast |
| `KalStore` | Kalender/Sources/KalStore.swift (842) + 35/39 + 4 extensions | Hendelser, buffer i UserDefaults (`kal.snapshot`, `kal.pending`), kalendere, innstillinger |
| `MacStore` | KalenderMac/Sources/MacStore.swift (700) + 35/39 | Kopi av KalStore for Mac (`ObservableObject`) |
| `ChatStore27` | FinansHub | Chat |
| `W51Store`, `W51MediaStore` | Watch51 | Klokke |
| ~200 andre `@Observable`-modeller med `.shared` | f.eks. `FamilyModel`, `Fam50Model`, `Glimt35Model`, `Media43/44/45/46`, `Hjemlys40Model`, `Theme51` … | Hver sin modul, ofte flere per modul og prompt (Media har 9 modeller) |

### 2.3 Nettverkslag

- **FinansHub: `struct API`** (API.swift:20) er én `URLSession.shared`-wrapper med `get/call/callAt/send51/sendRaw51/module/raw/mat`. Den bruker Bearer-token og `X-Device-Key`, oversetter `URLError` til norske feilmeldinger og har en offline-kø (`Plat51Queue`). Ved 401 kalles `Store.run` → `expired()`.
- **Kalender/Mac/widgets: `enum KalNet`** (SharedKal/Core/KalNet.swift:19) prøver adressene i rekkefølge (`KalNet44.order`), fornyer token ved 401 via `KalAuthGate44` og bruker egen feiltype `KalNetError`. Deler av Kalender-familien har egne kallere: `KalNet44`, `KalCalAPI35/39`, `KalGoogleAPI36`, `KalGMapAPI39`.
- **Utenom begge:** `URLSession.shared` brukes direkte i **40 filer (45 treff)** og `URLSession(configuration:)` 4 ganger. Eksempler er WidgetData.swift, Glimt35Model, Media46/50Img, Chat50Attach, Stream67, Login89, Qr46Login, Watch51Store, MacUpdater43 og Plat51Shared. Hver har egen tidsfrist og egen feiltolking. Dessuten finnes egne `enum …Net` (Glimt35Net, Hjemlys40Net, Plat51Net, G67Api).
- **Tre egne Nøkkelring-wrappere:** `Keychain` (API.swift:233), `KalKeychain41` (KalShared41.swift:25) og Watch51Store:30 / MacAuth:40.
- **Sanntid:** WebSocket `/api/ws?token=…` i Paper17.swift:520 og MacSystem.swift:27, med **tokenet i URL-en**. Mange moduler poller i stedet (§5).
- **Endepunkter:** 429 kall går til `callAt("/api", …)`, resten til `/finans/api`, `/mat/api` og `/domains/api`. Rundt 60 toppnivåressurser (`/api/media`, `/glimt`, `/family`, `/tasks`, `/kalender`, `/auth` …). Full liste: vedlegg C.
- **Direkte mot tredjepart (uten serveren):** `api.open-meteo.com` (KalNet.swift:135, WxWeek39.swift:50), `ws.geonorge.no`, `api.iconify.design` og `google.com/s2/favicons`.

## 3. Design

### 3.1 Farger
- 277 filer og 700 unike hex-verdier. Treff per mappe: FinansHub 213 av 411 filer (1 618 treff), Shared 16 av 22 (292), SharedKal 7 av 23 (101), Kalender 15 av 50 (97), KalenderMac 11 av 40 (83), FinansHubWidgets 12 av 15 (113) og Watch 0.
- Flest treff: Shared/Glimt35Figs.swift (72, maskotgrafikk, akseptabelt), Weather22Sheets (52), Subs23 (33, kategorifarger), Integrations26 (22), Paper16 (21) og Media45 (21).
- Det finnes **minst 9 parallelle palettsystemer**: `PaperPalette` (Paper.swift:9, light/night), `PaperPalette.ledger` (Theme22), `glass50` (Glass50), `KalTheme` (KalTheme.swift:8), `MacTheme`, `Live89Tokens`, `Stocks23Theme`, `StockTheme` (privat i StocksMobile.swift:124), `Bol24Pal` og `PaperIconTheme`, i tillegg til 3 `extension Color`.
- Asset-katalogfarger (`Color("…")`) brukes i 1 fil. Semantiske systemfarger (`.primary/.secondary`) har 66 treff, og `Color(.systemBackground)` 0. **Ingen farger tilpasser seg Increase Contrast** (`colorSchemeContrast` 0).
- **Konflikt mellom tvunget mørk modus og lyst tema:** FinansHub har `INFOPLIST_KEY_UIUserInterfaceStyle: Dark` (project.yml:63). Shell.swift:123 overstyrer med `.preferredColorScheme`, men `skinScheme()` faller tilbake til `.dark` når `PaperSkin.palette` er nil (Skin17.swift:31). Det kan gi mørke systemark og tastatur over lyst innhold (estimat; kan ikke kjøres her).
- Kategorifarger er hardkodet i klienten: Subs23.swift:107–130 `catColors`.

### 3.2 Fonter
- **FinansHub:** `PF.ui/serif/mono(size)` (Paper.swift:37–52) brukes 3 902 ganger med `.custom(name, size:)` **uten `relativeTo`**, i tillegg til 645 `.system(size:)`. De vanligste størrelsene er 13 (590), 12,5 (582), 12 (432), 14 (363) og 13,5 (311), altså over 40 ulike punktstørrelser fra 9,5 til 26+.
- `Font.dyn51` (Plat51Host.swift:27) brukes 445 ganger i 121 filer. Den leser `UIFont.preferredFont` når den kalles, men er ikke knyttet til miljøet, så den reagerer ikke på endret tekststørrelse før visningen tegnes på nytt av andre grunner.
- **Kalender:** `KalFont` bruker `relativeTo:` (KalTheme.swift:66, 78, 81) og er riktig. `monoHeavy` (linje 84) har fast størrelse.
- Tekststiler (`.body`, `.headline` …) brukes 268 ganger i 18 filer. `@ScaledMetric` og `dynamicTypeSize` brukes 0 ganger. `lineLimit(1)` (1 137) og `minimumScaleFactor` (209) skjuler at oppsettet ikke tåler større tekst.

### 3.3 Egne komponenter der systemet har én

| Egen | Antall | System |
|---|---|---|
| Fanelinje `PaperTabBar` / `PaperRail` (Paper.swift:465) | 1 (+ redigerer) | `TabView` (iOS 18 `Tab`, sidebar-tilpasset) |
| Tilbake-sveip `EdgeSwipeBack` (Nav23Swipe.swift:12, 117), `EdgeSwipeClose30` (død) | 2 | `NavigationStack` (interaktiv pop) |
| Brytere `PaperSwitch`, `Switch`, `Bol24Switch`, `TaskSwitch22` … | 22 | `Toggle` (84 i bruk) |
| Segmentvelgere `WxSeg46`, `KalSegment35`, `AiSegment34` … | 7 | `Picker(.segmented)` |
| Søkefelt `SearchField27`, `Cal32bSearchField` | 2 | `.searchable` (0) |
| Toast-typer `MinReise41Toast`, `Glimt31Toast`, `Logs44Toast`, `AiCtl34Toast`, `Brief36Toast`, `News73Toast`, `F51Toast` (død) … | 11 | (én felles) |
| Tomme tilstander `Brief52Empty`, `Fin45Empty`, `Smb30Empty`, `Empty` … | 15 | `ContentUnavailableView` (0) |
| Toppfelt `Smb30Header`, `Fin45Header`, `Chat27TopBar` … | 16 | `.toolbar`/`navigationTitle` (toolbar 3) |
| Ark-typer `…Sheet: View` | 123 | `.sheet` + `presentationDetents` (97, brukes) |
| Tekstglyfer som ikoner `Text("›")` 54, `"✓"` 29, `"✦"` 20, `"✕"`/`"×"` 17, `"+"`, `"−"`, `"⌕"`, `"⋯"` | 99 filer | SF Symbols (`systemName:` 464 treff, brukes også) |

## 4. HIG/SwiftUI-avvik (utvalg; fil:linje)

| # | Fil:linje | Hva er galt | Apple anbefaler |
|---|---|---|---|
| H1 | FinansHub/Sources/Shell.swift:90–108 | Rotnavigasjon via `if store.detail != nil / editing / original …` i `ZStack`. Ingen stabel, ingen systemtilbake, ingen tilstandsgjenoppretting | `NavigationStack(path:)` per fane, og `NavigationSplitView` på iPad |
| H2 | Nav23Swipe.swift:12–117, Shell.swift:114 | Eget kant-sveip med `UIView`-snapshot (`behind`) som etterligner systemets pop | Den innebygde interaktive pop-en |
| H3 | Paper.swift:465–590, Paper16.swift:217–235 | Egen fanelinje: (a) innholdet **endres per seksjon** (Hjem, Finans, Domener, Abo, Familie, Paper.swift:473–486), (b) opptil 5 brukervalgte faner + «Mer» + «+» = 7 elementer (Nav32.swift:394 `max: 5`, Paper16.swift:233), (c) «Hjem»-fanen forsvinner når man ikke er på Hjem (Paper16.swift:223), (d) noen faner åpner ark i stedet for å navigere (Paper16.swift:239–247), (e) tekstglyfer «⌕», «⋯», «✦» som ikon (Paper.swift:480–481, 536), (f) langt trykk på linja åpner redigering (Paper.swift:540) | Fast `TabView` med ≤ 5 faner, SF Symbols, «Mer» som egen fane og systemets tilpasning (iOS 18 `TabView` + `.sidebarAdaptable`) |
| H4 | Hele FinansHub | Ingen `Form`/`List` i innstillinger (SettingsView.swift 756 l., Settings24–45, Settings50Wide). Bare 8 `List` og 2 `swipeActions` i hele kodebasen | `Form`/`List` med `Section`, `.swipeActions`, `.contextMenu` (18 i dag) |
| H5 | SearchField27.swift | Eget søkefelt | `.searchable` |
| H6 | 15 `…Empty`-typer | Egne tomme tilstander | `ContentUnavailableView` |
| H7 | Paper.swift:37–52 (PF), 645 × `.system(size:)` | Fast tekststørrelse | Tekststiler, eller `.custom(_, size:, relativeTo:)` og `@ScaledMetric` |
| H8 | 387 `.frame(width:height:)` < 44×44 (≥ 16), f.eks. Calendar27Sheets.swift:29 og Chat27Sheets.swift:66 (`Text("✕")` 40×40), News23.swift:293 (38×38), Chat50Attach.swift:346 | Trykkflater under 44 pt (estimat: ikke alle er knapper) | Minst 44×44 pt, eventuelt `contentShape` |
| H9 | 81 × `.onTapGesture`, bare 7 med `.isButton` innen to linjer (f.eks. SubsMobile.swift:433, Weather25.swift:90–91) | VoiceOver annonserer ikke elementene som knapper | `Button` |
| H10 | `accessibilityLabel` i 219 filer, men 99 filer har tekstglyfer (`"›"`, `"✕"`) | Glyfer leses som «høyre vinkelanførselstegn» der etikett mangler (estimat, ikke målt per forekomst) | SF Symbols med `Label`, eller `accessibilityHidden` på dekor |
| H11 | 15 `TimelineView(.animation)` uten `paused: reduce`: System36.swift:173 og 287, Brief36.swift:26, Starter36.swift:283, Glimt35Settings.swift:26, Mai17Home41.swift:153 og 253, Background19.swift:288, Birthdays41.swift:176, Vaer41.swift:245, KalSpark.swift:55 og 123 (`paused: false`), Glimt38Priest.swift:100, Glimt40Jul.swift:413, MacSpark.swift:54 og 122. `repeatForever` uten sjekk av Reduser bevegelse: Tracking.swift:552, Convo67.swift:619, Subs23.swift:573, AiCtl34Page.swift:484, Departures16.swift:258 | Reduser bevegelse respekteres ikke | `@Environment(\.accessibilityReduceMotion)` (allerede brukt i 41 filer) |
| H12 | Hele kodebasen | `colorSchemeContrast` 0, `accessibilityDifferentiateWithoutColor` 0 | Øk kontrast og Differensier uten farge |
| H13 | Glass50.swift:9–46, WxSeg46.swift:19, 20 filer med `.ultraThinMaterial` | Liquid Glass etterlignes. På iOS 26 får systemkontroller ekte glass, mens den egne fanelinja, egne ark og egne brytere ikke gjør det. Det gir to visuelle språk. `UIDesignRequiresCompatibility` er ikke satt | Systemets `TabView`, toolbar og ark gir Liquid Glass automatisk. Bruk `.glassEffect` bare på egne flater |
| H14 | project.yml:64 | iPhone er bare stående | Akseptabelt for appen, men bør være et bevisst valg |
| H15 | project.yml:10, 121 `static var` i 45 filer, 17 `nonisolated(unsafe)`, 663 `nonisolated` | Swift 5.10 uten streng samtidighet. Global muterbar tilstand (PaperSkin, cacher) og `Task { }` fra `@MainActor` som parser JSON | Swift 6-modus: `@MainActor` på UI-modeller, `Sendable` DTO-er og dekoding i `nonisolated`/actor |
| H16 | MacSidebar.swift / MacRoot.swift | Egen sidekolonne på Mac | `NavigationSplitView` + `List(selection:)` |

## 5. Ytelse (estimat; ingen Instruments)

1. **JSON på hovedtråden:** `Store.run { }` (Store.swift:486) starter en `Task` som arver `@MainActor`, så `JSONSerialization` + `JS.*` kjører på main. 77 av 109 filer med `jsonObject` ligger i hovedaktør-kontekst. `KalStore` leser og skriver hele hendelsesbufferen som JSON i `UserDefaults` (KalStore.swift:765–779).
2. **Evige animasjoner:** 22 filer med `TimelineView(.animation)` (30–60 fps; Weather28Fx.swift:63 kjører 60 fps i Canvas). I tillegg kommer 101 `TimelineView`-treff totalt, 339 `withAnimation` og 165 `.animation(`.
3. **Polling i stedet for sanntid:** 42 filer med `while … Task.sleep`, f.eks. Departures16/24, RuterHome27, Home50Tiles, Home52Grid (30 s), Family16 og Family50Views (30 s), Ruter52 og FHSec51 (60 s), Theme51 (60 s), Bg41Oslo (60 s), Kart46Model (10 s), Shell.swift:127 (sporing hvert 5. min) og Receipts23 (2/20 s). Serveren har `/api/ws`, men bare Paper17 og MacSystem bruker den.
4. **Ustabile id-er:** 165 `ForEach(Array(x.enumerated()), id: \.offset)` i 84 filer (også PaperTabBar, Paper.swift:525), 261 `id: \.self` og 86 `ForEach(…indices / 0..<n)`. `PaperLinkRow.id = UUID()` (PaperPages.swift:547, 777) gir ny identitet ved hver tegning.
5. **Ikke-late lister:** 137 av 172 filer med `ScrollView` har ingen `Lazy*`. Det gjelder blant annet lange lister som transaksjoner, kvitteringer og media (estimat: krever kontroll per skjerm).
6. **Formatterere:** ~50 `let f = DateFormatter()` i funksjoner og beregnede egenskaper, 38 `ISO8601DateFormatter()` og 14 `NumberFormatter()`. Bare 8 er bufret som `static let`. Eksempler: SettingsView.swift:21, News.swift:118, KalCore.swift:403 og WxWeek39.swift:124.
7. **Bilder:** Det finnes fire egne bildebufre (`Brief35ImgCache`, `Img50Cache`, NSCache i Media46 og Chat50Attach, `Thumbs67`), og 5 `AsyncImage` er helt uten buffer (Brief35Page:514, News40Glimt:346/388, Fin40Ask:266, News27:46). `Weather28Fx.cloudCache` er en `static var [String:[UIImage]]` uten grense.
8. **Bred observasjon:** 276 visninger leser `@Environment(Store.self)`, og `Store` har ~205 egenskaper. Med `@Observable` spores bare egenskapene som faktisk leses, men beregnede egenskaper som `PaperTabBar.tabs` leser mange felt og tegner fanelinja på nytt ofte (estimat). `AnyView` har 37 treff (lite).

## 6. Duplisert forretningslogikk (klient og server)

| # | iOS (fil:linje) | Server (fil:linje) | Kommentar |
|---|---|---|---|
| D1 | SharedKal/Core/KalCals39.swift:386 `easter()`, :412–452 norske helligdager | server/kal39.js:128 `easter`, :135 `holidaysNO` | To implementasjoner av påske og helligdager. Klienten «legger inn helligdagene når serveren ikke har sendt noen» |
| D2 | Kalender/Sources/KalQuick.swift:94 `parse` («frisør 14.30 25.10»), FinansHub/Sources/Time44Parse.swift (enda en tolker) | public/js/quick-time.js `parseQuick` (brukt i server/assist.js:71, `/api/kalender/quick/parse`) | **Tre tolkere** for samme norske tid/dato-språk. KalQuick brukes også av Mac |
| D3 | FinansHub/Sources/SubsMobile.swift:170 `nextCharge` (sender `nextDate` til serveren) | server/finans/routes.js:196 `nextDate`, :1801 `nextChargeOf` | Klienten regner neste trekkdato |
| D4 | Subs23.swift:44 `fallbackCats`, :107–130 kategorifarger | server/finans/subs.js:10 `SUB_CATEGORIES` | Kategoriliste og farger finnes i begge |
| D5 | Subs23.swift:83 `next7` (regner selv når `upcoming` mangler) | server/finans (upcoming) | Reserveberegning |
| D6 | Shared/Trials32bShared.swift:96, Shared/Glimt35Shared.swift:289 (butikk → domene), Trial31.swift:86 (oppsigelses-URL-er) | server/finans/sub-screenshot.js:30, subs.js:12 | Tre tabeller i klienten |
| D7 | KalCals39.swift:80–115, 284, 687, Shared/Calendar26Shared.swift:176, 334, Calendar26Model.swift:22 (kalenderroller og kategorier) | server/kal39.js:43 `FOUR`, :46–47 | Klienten mapper navn til de fire kalendertypene |
| D8 | Shared/Birthdays24Shared.swift:83 `daysUntil`, Calendar26Shared.swift:231 | server/birthdays.js:76 `nextDateOf` | Neste bursdag regnes begge steder |
| D9 | Receipt47Engine.swift (Vision + FoundationModels på enheten), Receipt48Ocr/48FM | server/finans/receipts47.js, receipts39.js, reread50.js | Kvitteringstolking på enheten parallelt med serverens AI |
| D10 | KalNet.swift:135, WxWeek39.swift:50 (Open-Meteo direkte) | serverens `/api/kalender/weather` og værmodulen | Reserve som omgår serveren (og har fast posisjon 59.91/10.75) |
| D11 | Boliger24Model.swift:136 `spent(month)` | server/finans/boliger*.js | Summering i klienten (estimat: ikke kontrollert om serveren sender sum) |
| D12 | KalenderMac (MacStore/MacGrid …) og Kalender (KalStore/KalGrid …) | – | Klient-til-klient-duplisering. Bare SharedKal/Core og KalQuick deles |

## 7. Bugs og sikkerhet

| # | Alvorlighet | Plattform | Funn | Reproduksjon / bevis |
|---|---|---|---|---|
| S1 | **Middels** | iOS | Tokens ligger i klartekst i App Group-`UserDefaults`: `w.token` = **Homelabs fulle kontotoken** (AppWidgets.swift:23 → WidgetShared.swift:60), `kal.token` = Kalender-appens økt (KalGroup.swift:146, aldri i Nøkkelringen på iOS), `kal.hl.token` (KalGroup.swift:110) og `hl41.device` (KalShared41.swift:133). Plist-filen kommer med i ukrypterte sikkerhetskopier | Les `Library/Preferences/group.no.kristo.finanshub.plist` i en ukryptert backup |
| S2 | Lav–middels | iOS/Mac | Tokenet sendes i URL-en: `/api/ws?token=` (Paper17.swift:520, MacSystem.swift:27). Det havner i serverens og proxyens tilgangslogger | Se serverlogg |
| S3 | Lav | iOS/Mac | `kSecAttrAccessibleAfterFirstUnlock` uten `ThisDeviceOnly` (KalShared41.swift:66, MacAuth.swift:44). Nøkler kan migreres via kryptert backup. FinansHub (API.swift:241) og Watch er riktige | – |
| S4 | Info | Alle | ATS: bare `NSAllowsLocalNetworking` og ingen `NSAllowsArbitraryLoads` (riktig). Standard lokal adresse er `http://10.69.1.39:3000` (project.yml:147). Bearer-token og passord går i klartekst på LAN når den lokale adressen brukes | – |
| S5 | Info | – | Ingen hemmeligheter i koden (grep etter `sk-`, `ghp_`, `AIza`, `eyJ`: 0). Ingen `try!`, `fatalError` eller `as!`. 6 `URL(string:)!` på faste strenger (trygt) | – |
| B1 | Middels | iOS | `PaperSkin.palette` (global, ikke observerbar) settes under `body` (Shell.swift:88). Ark og klassiske skjermer kan vise feil palett etter temabytte | Bytt lys↔mørk med et ark åpent (ikke kjørt) |
| B2 | Lav–middels | iOS | `UIUserInterfaceStyle: Dark` + `skinScheme()` har `.dark` som standard (Skin17.swift:31). Kan gi mørke systemflater i lyst tema | – |
| B3 | Lav | iOS/Mac | `KalNet` gjør `r.httpBody = try? JSONSerialization…` (KalNet.swift ~79). En kodefeil sender da en tom kropp stille | – |
| B4 | Lav | iOS | `Weather28Fx.cloudCache` er en ubegrenset `static var` med `[UIImage]` (Weather28Fx.swift:191). Minnet vokser | – |
| B5 | Lav | iOS | Rutingen `case "innst-…"` er duplisert (Paper.swift:1082 og Settings50Wide.swift:334). Sider kan bli ulike på iPhone og iPad | – |

## 8. Spørsmål til brukeren

1. Skal FinansHubs egen kalender (Calendar26–32, 5 165 linjer) fjernes når «Kalender i appen» er standard? Eller bruker noen bryteren `kal84_embed = av`?
2. Skal KalenderMac fortsatt støtte macOS 13? macOS 14 gir `@Observable` og lar oss dele KalStore i stedet for MacStore.
3. Er fast stående iPhone og tvunget mørk systemstil (project.yml:63) bevisste valg?
4. Er kvitteringstolkingen på enheten (FoundationModels) ønsket som offline-reserve, eller skal bare serveren tolke?
5. Skal tilpassbare fanelinjer per seksjon beholdes (funksjon), eller er det greit med én fast `TabView` der tilpasningen flyttes til «Mer» og Hjem?

## 9. Anbefalt retning (kort)
- Felles `DesignTokens` (farger fra asset-katalog med Any/Dark/High Contrast og tekststiler med `relativeTo`), generert fra én kilde sammen med web og Android. Erstatt de 9 palettene og fjern `PaperSkin`.
- Ett `APIClient` (actor), typede `Codable`-DTO-er generert fra `shared/schemas`, `URLSession` med felles konfigurasjon, WebSocket med token i header, og token i Nøkkelringen med delt tilgangsgruppe (App Group-plisten skal bare holde adresser).
- Del `Store` per domene (`FinanceStore`, `CalendarStore` …) injisert med `@Environment`, uten `.shared` i visninger.
- `NavigationStack` per fane, `TabView` med ≤ 5 faner, `Form`/`List`, `.searchable` og `ContentUnavailableView`.
- Fjern de 98 døde typene og slå sammen filfamiliene til én fil per skjerm eller komponent.
- Flytt D1–D11 til serveren. Klienten viser bare det serveren svarer, eventuelt med en bufret kopi.
