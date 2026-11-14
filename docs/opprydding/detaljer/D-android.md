# D – Android (`apps/android/**`)

Metode: lesing av kode, `grep`/`find`/`awk` og et Python-skript for døde deklarasjoner (`$S/audit/D-android-skript/dead.py`, `dead2.py`).
Ingenting er bygget. Google Maven og Android SDK er sperret i miljøet (se `$S/P85-AND85.md`), så alle tall om oppførsel under kjøring er **estimater**.
Lange lister ligger i `$S/audit/D-android-vedlegg.md`.

## 0. Sammendrag

- **3 moduler, 344 Kotlin-filer, ca. 121 300 linjer:** `:app` 296 filer / 106 477 linjer, `:kalender` 44 / 13 830, `:wear` 4 / 1 020. Det finnes ingen Kotlin-enhetstester. Android testes bare av JS-tester i `test/` som leser kildekoden.
- **298 av 344 filer har et nummer fra prompten i navnet.** Filene er organisert **etter prompt, ikke etter funksjon**. `P43.kt` inneholder Media/Sonarr, `P41.kt` inneholder Hjemlys og serveradresser, og `Ui40.kt` inneholder «Vær-✕, julemodus, økonomi-ikon». Familiene overstyrer *ikke* hverandre lagvis slik CSS-en gjør. Hver fil legger til ting, så nesten alt er i bruk: bare **57 av 4 091** offentlige toppnivå-deklarasjoner er urefererte. Problemet er spredning, ikke død kode.
- **All tilstand ligger i én `AppViewModel`:** 3 855 linjer, 223 `var … by mutableStateOf`, 39 holder-klasser (`p43 = P43State()` …). I tillegg finnes **1 196 utvidelsesfunksjoner `fun AppViewModel.x()` fordelt på 75 filer**. Det er ingen repository-lag. Nettverkskall og JSON-tolkning skjer direkte i ViewModel-utvidelsene. Appen bruker 2 266 `mutableStateOf` mot bare 42 `StateFlow`.
- **Fargesystemet er hjemmelaget og oversetter farger mens appen kjører.** Skjermene er tegnet med hex-farger fra en gammel mørk palett. `Tone.map()` (`ui/Theme.kt:108`) slår opp rollen til hver hex og flytter kuløren i OKLCH. I tillegg står **1 164 `Color(0x…)` (534 unike) i 106 filer som ikke oversettes**, og 819 `Color.White/Black…`. `MaterialTheme.colorScheme` leses bare 2 ganger og `MaterialTheme.typography` 11 ganger. 3 713 steder har hardkodet `fontSize = N.sp`, med 42 ulike størrelser.
- **Navigasjonen er en hjemmelaget tilstandsmaskin:** `enum Screen` + `paperPage: String?` + dusinvis av boolske flagg. `back()` har **ca. 40 grener** (`AppViewModel.kt:623-664`). Appen bruker verken Navigation Compose eller Scaffold, NavigationBar eller TopAppBar.

## 1. Moduler, versjoner og filfamilier

### Versjoner (alle tre moduler like)

| Hva | Verdi | Kommentar (per nov. 2026) |
|---|---|---|
| Gradle / AGP / Kotlin | 8.11.1 / 8.7.3 / 2.1.0 (`build.gradle.kts:2-4`) | Desember 2024. Ingen versjonskatalog (`libs.versions.toml`); versjonene gjentas i tre `build.gradle.kts`. |
| compileSdk / targetSdk / minSdk | 35 / 35 / 26 (wear 30) | Play krever trolig API 36 for oppdateringer fra aug. 2026 (estimat, verifiser). Appen sideloades, så det blokkerer ikke i dag. |
| Compose BOM | 2024.12.01 (Material3 ca. 1.3.1) | Ca. 2 år gammel. Ingen M3 Expressive-komponenter, selv om kommentarene sier «M3 Expressive» (`Theme.kt:203`). |
| security-crypto | 1.0.0 (`MasterKeys`) | Biblioteket er avviklet av Google. `MasterKeys` har vært utdatert siden 1.1.0. |
| Wear | `wear.compose:compose-material:1.4.0` | Wear Compose **M2**, ikke Wear Material 3. |
| Alpha/beta | `health.connect 1.1.0-alpha07`, `mlkit-document-scanner 16.0.0-beta1` | |
| R8 | `isMinifyEnabled = false` i alle tre | Bevisst (P85 M). Det gir større APK og ingen optimalisering. |
| Baseline profile | `app/src/main/baseline-prof.txt` (91 linjer, **håndskrevet** med jokertegn) + profileinstaller | Den er ikke generert med Macrobenchmark. Bare `:app` har profil. |

### Filfamilier (≥ 3 filer; `fam` = navn uten nummer og `Ui`-suffiks)

| Modul | Familie | Filer | Linjer | Merknad |
|---|---|---|---|---|
| app | `P##` (P25–P52B, P73Brief) | 22 | 12 797 | **En søppelfil per prompt.** Logikk for mange funksjoner per fil (P37: oppgaver + delte abonnement + bibel + alarmer). |
| app | `ui/Ui##` (Ui20–Ui52B) | 19 | 9 125 | Det samme for UI: «felles UI-biter» fra hver prompt. |
| kalender | `Kal##` / `Kal##Ui` | 24 | 7 769 | Samme mønster i Kalender. |
| app | `Skjold76–82` (+Ui) | 12 | 5 251 | Én funksjon (Skjold/LED-skuffer) over 7 prompter. |
| app | `Paper`, `Paper14–19` | 7 | 5 187 | Hovedskjermene («Papir»-designet). |
| app | `Weather15/22/28/30/32b/39` + `Vaer41/45/73` + `Wx28` | 10 | ca. 3 600 | Én skjerm spredt på 10 filer med to navn. |
| app | `Calendar26/27/29` (+Ui, Widgets) + `Cal70` + `Kal33` | 9 | ca. 3 300 | Kalender **inne i** Homelab-appen, i tillegg til `:kalender`. Overlapper funksjonelt. |
| app | `Models`, `Models11–22` | 10 | 2 471 | Datamodeller og `parse*` spredt etter prompt. |
| app | `Chat27/41/50` (+Ui, Sheets) | 7 | 2 673 | |
| app | `Family16/22/24/45/50` + `P50Fam` + `family/` | 9 | ca. 3 800 | |
| app | `Media43/44/45/50Ui/51Ui` + `P50Med` + `Nrk87/88` + `Musikk88` | 11 | ca. 4 800 | `Nrk87`+`Nrk88` og `NrkRegel87`+`NrkRegel88` er **tillegg** (88 = søk/serie), ikke erstatninger. |
| app | `Live41` / `Live89` (+Ui) | 3 | 778 | Ulike ting: Live41 = Hjemlys-varsel, Live89 = Live Updates fra `/api/live`. Navnet sier ikke det. |
| app | `Settings*`, `Mer24/44/45`, `Mod23–28B`, `Tasks*`, `Receipt*`, `Brief*`, `Glimt*`, `Subs*`, `Ruter*`, `Fold*` | 3–6 hver | | Samme mønster. |
| alle | `Lokal86.kt` | 3 kopier | 3 × 129 | **Byte-identiske** bortsett fra `package` (app, kalender, wear). Burde vært en delt modul. |
| app+kal | fontfiler i `res/font` | 9 + 7 | | Duplisert mellom app og kalender. |

**I bruk eller død?** Skriptet (deklarasjon uten treff i andre filer i samme modul, i XML eller i `baseline-prof.txt`) fant 0 døde filer og 57 urefererte deklarasjoner, blant annet `Calendar26.kt` (8: `setKalView26`, `moveKalCard26` …), `Paper16.kt:280 RuterPage`, `Paper17.kt:447 TasksScreen`, `More.kt:379 StocksScreen`, `Update28.kt:98 Update28Page`, `SettingsUi.kt:265 ServerPage`, `Modules.kt:77 SubScreen`. Hele lista står i vedlegg A. Skriptet fanger ikke kode som bare kalles fra annen død kode eller bak flagg som aldri slås på, så det reelle tallet er høyere (estimat).

## 2. Arkitektur

| Tema | Funn |
|---|---|
| ViewModel | Én `AppViewModel` (`AndroidViewModel`, `AppViewModel.kt:65`) for hele appen: 3 855 linjer, 226 `mutableStateOf` direkte, 39 `val xNN = XNNState()`-holdere og 48 `class …State`-klasser. Den eneste andre «VM-en» er `ReceiptScanViewModel48`, som også eies av AppViewModel (`ReceiptScan48.kt:204`). |
| Utvidelser | 1 196 `fun AppViewModel.…` i 75 filer. Hver prompt har sin egen `launchNN()` (39 stykker, `AppViewModel.kt:3525-3826`), som alle kaller den samme private `launch`. |
| Global tilstand | Minst 40 `object`-er med Compose-tilstand (`Skjold76` 27 felt, `Skjold77` 22, `P46` 20, `Onboard51` 14, `Voice56` 13 …; grovt awk-estimat). Det gjelder også `Tone`, `Privacy` og `PaperPal.current` (`Theme.kt:108-240`), som leses 898 ganger. Dette er tilstand utenfor ViewModel og utenfor `CompositionLocal`. |
| UI ↔ VM | 1 041 composables tar `vm: AppViewModel` som parameter. Ingen skjerm har sin egen UI-tilstandsklasse. |
| Flow | Bare 42 `StateFlow` og 36 `collectAsState`. Appen bruker **0** `collectAsStateWithLifecycle`, **0** `repeatOnLifecycle` og **0** `SavedStateHandle`. |
| Repository | Ingen. VM-utvidelsene kaller `api.get(...)` og `parseX(JSONObject(...))` direkte. Det finnes 37 SharedPreferences-filer (`getSharedPreferences("…")`) med logikk spredt over modulene. |
| Nettverk | `Api.kt` (235 linjer) bruker `HttpURLConnection` + `org.json` og hjelpere per prefiks (`/finans/api`, `/mat/api`, `/domains/api`, `/api`). OkHttp brukes bare til bilder (`Img50.kt`) og WebSocket (`Realtime.kt`). Kalender (`KalApi.kt`) og Wear (`WearApi51.kt`) har **egne klienter**. Ingen kodegenerering fra `shared/schemas`; 553 `data class`-er tolkes for hånd. |
| Endepunkter | Grovt uttrekk: ca. 525 ulike sti-mønstre i `:app` (vedlegg B, estimat). De største gruppene er `receipts` 15, `subscriptions` 13, `glimt` 10+7+6, `folders` 9, `finn` 8, `auth` 8 og `media/nrk` 8. |
| Token-lagring | `EncryptedSharedPreferences` (Keystore AES-256) i app (`Accounts.kt:33`, `Sec51.kt:57`, `Notify31.kt:353`), kalender (`KalApi.kt:132`, `Kal41.kt:62`, `Kal51.kt:64`) og wear (`WearApi51.kt:48`). Det er OK, men biblioteket er avviklet, og `create()` står uten `try/catch` (`Accounts.kt:33`). En ødelagt Keystore-nøkkel (kjent problem etter gjenoppretting/OEM) gir krasj ved oppstart (estimat; ikke reprodusert). |
| Kalender-pålogging | `Kal33.kt:118-150`: ContentProvider (signaturbeskyttet) som gir token til `no.kristo.kalender`. Sikkerheten avhenger av signeringsnøkkelen (se §8). |

## 3. Design

| Måling (`:app`) | Antall |
|---|---|
| `Color(0x……)` direkte (ikke tonet) | 1 164 forekomster, 534 unike, 106 filer (flest: `GlimtFigs35.kt` 63, `Glimt36.kt` 36, `Weather22.kt` 30, `Ui40.kt` 29) |
| `Color.White/Black/Red…` | 819 |
| `tc(0x…)` (tonet designfarge) | 28 (23 unike). De fleste går via `C.*` (460) og `P.*` (99) |
| `PaperPal.current` | 898 |
| `MaterialTheme.colorScheme` / `.typography` | 2 / 11 |
| `fontSize = N.sp` | 3 713 (42 ulike størrelser; 13 sp ×749, 12 sp ×570, **12.5 sp ×508**) |
| `PaperFonts.*` (Newsreader/Manrope/Plex Mono) | 845 |
| Egne composables (`fun Stor…(`) | 1 538, hvorav ca. 122 knapper/piller/chips, 82 ark og 105 kort (`Btn43`, `Btn50`, `Btn51`, `Ch27Btn`, `G67Btn` …) |
| M3-komponenter | `ModalBottomSheet` 50, `TextButton` 40, `AlertDialog` 15, `Button` 20, `Switch` 9, `CircularProgressIndicator` 75. **0** `Scaffold`, `TopAppBar`, `NavigationBar`/`Rail`, `Card`, `ListItem`, `FloatingActionButton`, `SearchBar`, `TabRow`. 92 `BasicTextField` mot 13 `OutlinedTextField` |
| Ikoner | 248 `Icons.*`, 67 egne SVG/Path, **165 `Text("✕"/"‹"/"›"/"+"…)` brukt som ikon** |

**Tema:** `FinansTheme` (`Theme.kt:279`) setter `MaterialTheme(colorScheme = schemeFromPalette(...))`, men skjermene leser nesten aldri temaet. De bruker de globale objektene `C`, `P`, `PaperPal.current` og `Tone` direkte. Dynamic color ble **fjernet med vilje** i prompt 42 (`Theme.kt:41`), og det bør stå som et bevisst valg. `WidgetConfigActivity.kt:43` har sitt eget `darkColorScheme(primary = 0xFF3E91FF)`, som ikke passer med resten. Kalender (`KalTheme.kt:36-45`) har en ryddigere `KTok` via `staticCompositionLocalOf`, men 94 egne `Color(0x…)` (52 unike). Paletten (`Red = 0xFFB23A2A`, Manrope/Newsreader) er kopiert, ikke delt.

## 4. Avvik fra M3 og Android-anbefalinger

| # | Fil:linje | Hva | Anbefalt |
|---|---|---|---|
| 1 | `AppViewModel.kt:42`, `:623-664` | Hjemmelaget navigasjon: `Screen`-enum + `paperPage`-streng + ca. 40 flagg i `back()`. Ingen tilbakestabel, ingen dyplenke-graf. | Navigation Compose (type-sikre ruter) eller Navigation 3, én rute per skjerm. |
| 2 | `ui/Paper.kt:481` (`PAPER_BAR = 82.dp`) + egne fanelinjer (`P25.kt`, `Ui32b.kt`, `Ui42.kt`) | Egen fanelinje med flere stiler. Brettoppsett ≥ 700 dp er laget for hånd (`Paper.kt`, «LayoutMode»). | `NavigationSuiteScaffold` (bar/rail/drawer etter vindusklasse) + `Scaffold`. |
| 3 | 91 `BackHandler`, 2 `PredictiveBackHandler` | Manifestet har `enableOnBackInvokedCallback="true"`, men de fleste ark og sider avbryter med `BackHandler` uten prediktiv animasjon. | `PredictiveBackHandler`, eller at Navigation og `ModalBottomSheet` gjør det selv. |
| 4 | `MainActivity.kt:31` | `enableEdgeToEdge()` er på, og innfelling gjøres for hånd (87 `navigationBarsPadding`, 59 `statusBarsPadding`, 48 `imePadding`, 3 `systemBarsPadding`). Ingen `Scaffold`-innfelling. | `Scaffold(contentWindowInsets)` / `WindowInsets.safeDrawing` på ett sted. |
| 5 | 1 144 `clickable`, 241 `onClickLabel`; 35 `size(<48.dp)` + `clickable` på samme linje (f.eks. `Ui32b.kt:369` 32 dp, `Skjold77Ui.kt:86` 36 dp, `Mer45.kt:221` 40 dp); bare 2 `minimumInteractiveComponentSize` | Trykkflater under 48 dp. | 48 dp minimum (`minimumInteractiveComponentSize()` eller M3 `IconButton`). |
| 6 | 165 `Text("✕")`-ikoner; 59 `Icon(` / 110 `contentDescription = "…"` | Tegn i stedet for ikoner. Talkback leser «gangetegn» der ingen `semantics` er satt (P85 E: 48 ikoner uten beskrivelse). | `Icon(Icons.…, contentDescription)` i `IconButton`. |
| 7 | 933 `.height(N.dp)`, 1 324 `maxLines` | Faste høyder rundt tekst kutter tekst ved stor skrift (P85 E). Bare 3 steder leser `fontScale`. | `heightIn(min=…)`, test ved 200 % skrift. |
| 8 | 3 713 `fontSize = N.sp` | Typografien ligger utenfor `MaterialTheme.typography` (`paperType` i `Theme.kt:259` brukes nesten ikke). | Et typeskjema (tokens) og `style = MaterialTheme.typography.x`. |
| 9 | `ui/Weather22.kt:710`, `:742` | `WebView` med JavaScript på i vær-UI. | OK hvis innholdet er eget. Krev https og ingen `addJavascriptInterface` (ingen funnet). |
| 10 | `app/src/main/AndroidManifest.xml` | 83 `<receiver>`, hvorav 74 widget-leverandører (34 skrudd av som standard: Samsung-varianter). Widget-katalogen blir uoversiktlig. | Færre widgets med størrelsesvalg (Glance `SizeMode.Responsive`). |
| 11 | `app` manifest `configChanges` uten `uiMode`, mens kalender har det | Inkonsistent. Appen gjenskapes ved bytte til mørk modus (det er OK etter P85-1, men sjekk utkast i skjema). | Velg én regel. |
| 12 | 5 `rememberSaveable`, 0 `SavedStateHandle` | Prosessdød fører til startsiden og tapte skjemautkast (P85 F). | `SavedStateHandle` per skjerm-VM. |

## 5. Ytelse (estimat; ingen profilering mulig)

| Område | Funn | Konsekvens (estimat) |
|---|---|---|
| Tilstand | Én VM med ca. 1 300 snapshot-felt + globale `Tone`/`PaperPal.current`/`Privacy` lest i 898+ composables. `Tone.map()` slår opp i en `HashMap` for hver farge i hver komposisjon (`Theme.kt:120-125`). | Bytte av tema eller personvern rekomponerer alt. Skjermrøtter som leser mange `vm.*`-felt rekomponerer bredt. Sterk hopping (Kotlin 2.1) demper problemet med ustabil `vm`-parameter. |
| Stabilitet | 553 `data class` med `List<…>`, 1 `@Immutable`, 2 `@Stable`, 0 `ImmutableList` | Listeparametre er ustabile og hoppes over sjeldnere. |
| Lister | 106 `Lazy*`; `items(` 28 (18 med `key`); `item {` 621 mot `item(key` 85; 165 `verticalScroll` (ikke-lat `Column` + `forEach`) | Mange lister er ikke late eller mangler nøkler. Det gir rulling som hakker i lange lister og tap av tilstand ved endringer. |
| `derivedStateOf` | 9 i hele appen | Filtrering og sortering regnes trolig på nytt ved hver rekomposisjon. |
| Arbeid på main | `launch` = `viewModelScope.launch` (Main) (`AppViewModel.kt:339`). `api.*` går på IO, men **JSON-tolkingen skjer på Main** (f.eks. `parseTxList(api.get(...))`). Verst er `exportCsv` (`AppViewModel.kt:1587-1597`): henter `/transactions?limit=100000`, tolker og bygger CSV på Main. | Hakking og mulig ANR ved store svar. Serveren har allerede `GET /finans/api/transactions.csv` (`server/finans/routes.js:838`). |
| Polling | 79 `while (true)`-løkker. Flere ligger i `LaunchedEffect` i UI uten livssyklussjekk: `Ui42.kt:319` (Hjemlys hvert 30. s), `Paper17.kt:804` og `Ui52B.kt:264` (`loadPositions` hvert 60. s), `Ui52B.kt:145` (vær 60 s), `Ui52B.kt:259` (Ruter 30 s). Bare 11 UI-filer bruker `ON_STOP`-observatør (f.eks. `Nrk87Ui.kt:160`). | Sannsynligvis nettverk og batteri i bakgrunnen så lenge aktiviteten lever (komposisjonen stoppes ikke av `onStop`; verifiser på enhet). |
| Bilder | Egen laster `Img50.kt` (OkHttp-diskcache 320 MB + `LruCache` 1/8 heap), ikke Coil. 16 `BitmapFactory`-kall i 6 UI-filer. | Fungerer, men sjekk at dekoding skjer utenfor Main i UI-filene. |
| Oppstart | Håndskrevet baseline-profil, R8 av | Saktere kaldstart og større APK enn nødvendig. Både en generert profil og R8 krever bygg på CI med enhet eller emulator. |

## 6. Duplisert forretningslogikk (klient ↔ server)

| Android | Server (fasit) | Hva |
|---|---|---|
| `kalender/KalParse.kt:37 parseQuick` **og** `app/Calendar29.kt:83` (lokal «QP») | `public/js/quick-time.js` (importert i `server/calendar-quick.js:25`) | Tolking av «time hos Nina 14.30 25.09». **Tre kopier.** |
| `app/P37.kt:92 nextDue37` | `server/tasks.js:295 nextDue` | Neste forekomst av gjentatte oppgaver |
| `app/P42.kt:209 carrierId42` | `server/tracking-carriers.js:46 carrierId42` | Normalisering av fraktselskap |
| `app/Skjold78.kt:136` (autoIndex) | `server/skjold76/leds78.js:149 autoIndex78` | LED-indeks per skuff |
| `app/Skjold79.kt:83 PALETTE79` | `server/skjold76/leds78.js:42 PALETTE79` | Fargepalett |
| `app/P73Brief.kt:31` (katalog «reserve uten server») | `server/brief73.js:19 CATALOG73` | Brief-kortkatalog |
| `app/ReceiptOcr48.kt:22` (radbygging) | `server/receipts48/normalize.js:37 rows48` | OCR-rader for kvittering |
| `app/Mod27B.kt:103 norm27/lev27` («samme regler som serveren») | `server/calendar.js:571 lev`, `server/weather35.js:74 lev` | Normalisering og uklar matching |
| `app/P37.kt:880` (morgen 05–17) | `server/bible37.js:9` | Valg av bibelvers etter tid på dagen |
| `app/ui/Boliger24.kt:191 spentOf` | `server/finans/boliger.js` | Summering av utgifter per bolig og måned i UI |
| `app/ui/Subs14.kt:34 nextChargeText` | abonnement i `server/finans/routes.js` | Neste trekk regnes ut lokalt |
| `app/AppViewModel.kt:1587 exportCsv` | `server/finans/routes.js:838 /transactions.csv` | CSV-eksport bygges på klienten |
| `app/Regel89.kt` (farger, segmenter, utløp og dyplenker for Live Updates) | `/api/live/aktiviteter` | Presentasjonsregler for 5 typer duplisert (web og iOS har sine egne) |
| `app/NrkRegel87/88.kt` | `server/nrkdl.js`, `server/yubal.js` | URL-validering. Akseptabelt som inputsjekk, men det er en kopi. |

Mønster: de «rene reglene» (`*Regel*.kt`, `Regel89`) holdes like serveren med JS-tester mot fasit (`test/p8x-and.test.js`). Det fungerer, men gjør hver regel til tre til fire kopier (server, web, iOS, Android). Kandidater til å flytte helt til serveren: quick-parse, nextDue, spentOf, nextCharge, CSV og Live-presentasjon (serveren kan sende ferdige felt).

## 7. Kalender- og Wear-appen

**`:kalender`** (`no.kristo.kalender`, 44 filer, 13 830 linjer): `KalVm.kt` (1 079 linjer, ca. 67 tilstandsfelt) + `KalRepo.kt` (304), med et skikkelig repository og egen fil-cache. Den er ryddigere enn `:app`, men har det samme navnemønsteret (24 `Kal##`-filer). Den har egen HTTP-klient (`KalApi.kt`), egen kopi av `Lokal86.kt`, egne fonter og egen palett (`KalTheme.kt`, `CompositionLocal`, 94 `Color(0x…)`). `parseQuick` er duplisert (§6). Kalender finnes **også inne i** Homelab-appen (`Calendar26/27/29`, `Cal70`, `Kal33`, ca. 3 300 linjer), så to apper viser og redigerer de samme hendelsene med ulik kode. Kjent: P85 K (en hendelse kan forsvinne fra visningen under synk). App Links: `kalender.kristo.no` (`kalender/AndroidManifest.xml:75`).

**`:wear`** (`no.kristo.finanshub.wear`, 4 filer, 1 020 linjer): `ScalingLazyColumn`, `SwipeToDismissBox`, `TimeText`, `PositionIndicator` og `Chip`/`ToggleChip` (`WearMain51.kt:98-134`). Den følger Wear-mønsteret, men bruker **Wear Compose M2 1.4.0** og ikke Wear Material 3 (anbefalt nå). Den støtter ikke rotasjonsinndata (ingen `rotaryScrollable`/`onRotaryScrollEvent`), og har verken Tiles eller komplikasjoner. Egen klient (`WearApi51.kt`), token i `EncryptedSharedPreferences` og ellers små avvik (`Color(0xFF2B2B2B)` på `WearMain51.kt:489`).

## 8. Bugs og sikkerhet

| # | Alvor | Plattform | Hva | Bevis / reproduksjon |
|---|---|---|---|---|
| S1 | **Høy** (sikkerhet) | alle | Signeringsnøkkelen ligger i repoet med passordet i klartekst. Alle bygg uten `ANDROID_KEYSTORE_*` signeres med den. Alle med repoet kan lage en «oppdatering», eller en falsk `no.kristo.kalender` som får token via `Kal33`-leverandøren. | `app/build.gradle.kts` `signingConfigs.sideload` (`storePassword` i klartekst), `signing/sideload.jks`. Det samme står i kalender og wear. Varselet i `build.gradle.kts` erkjenner det (P86). |
| S2 | Middels | app, kal, wear | Brukerinstallerte CA-er godtas for **all** trafikk (`network_security_config.xml`, `<certificates src="user"/>` i `base-config`). Det åpner for MITM via en CA installert av MDM eller en angriper. Klartekst er globalt tillatt i XML-en og håndheves bare i koden (`Lokal86.kt`). | Les XML-en. Begrens `user` til `domain-config` for egne domener, eller bruk pinning. |
| S3 | Middels | app | «Lokalt» avgjøres av **vertsnavnet** (`.local`, `.lan`, `.home.arpa`, `.internal`, navn uten punktum; `Api.kt:228`, `Lokal86.kt`). Er serveren `http://nas.lan`, sendes token i klartekst på *ethvert* nett som svarer på det navnet (f.eks. falsk DNS på offentlig wifi). | Kodelesing (estimat på risiko). |
| B1 | Middels | app | App Links (`autoVerify`) gjelder bare `home.kristo.no` (`AndroidManifest.xml:99,101,115`), mens standardserveren nå er `os.smarthjemeksperten.no` (`Regel89.kt:EXTERNAL`). QR-lenken bygges med forespørselens vert (`server/qr38.js:284`). Brukere på det nye domenet får QR-/invitasjonslenker som åpnes i nettleseren i stedet for i appen. | Spørsmål til brukeren: hvilket domene er i bruk, og finnes `assetlinks.json` for det? |
| B2 | Middels | app | Polling fra composables fortsetter trolig i bakgrunnen (§5, `Ui42.kt:319`, `Paper17.kt:804`, `Ui52B.kt:145/259/264`). | Legg appen i bakgrunnen med en side åpen, og se på serverloggen etter `/api/family/positions` (må verifiseres). |
| B3 | Middels | app | `exportCsv` tolker opptil 100 000 transaksjoner på Main (`AppViewModel.kt:1590`). | Mulig ANR ved stor database. |
| B4 | Lav–middels | app, kal, wear | `EncryptedSharedPreferences.create` uten `try/catch` (`Accounts.kt:33`, `KalApi.kt:132`, `WearApi51.kt:48`). Det er en kjent kilde til krasj ved oppstart (`AEADBadTagException`/`KeyStoreException`) etter gjenoppretting eller OEM-feil. | Kodelesing. |
| B5 | Lav | app | Standard lokal adresse `http://10.69.1.39:3000` er hardkodet (`Regel89.kt` `LOCAL`, `Kal47.kt`), og «klar for massene» fungerer ikke for andre husstander (P85 B). | |
| B6 | Lav | app | `Car51Plat.kt:43`: `HostValidator.ALLOW_ALL_HOSTS_VALIDATOR` når appen er `debug`. Alle bygg som sideloades er signert likt, så sjekk at `debug` virkelig er `FLAG_DEBUGGABLE` og ikke byggtype. | |
| – | Lav | app | Fortsatt åpne fra P85: G (duplikat ved opplasting), H (widget uten `goAsync`), I, J, L. Dyplenker som endrer tilstand har nå bekreftelse (`LinkRegel86.kt`), så P85 C er rettet. | `$S/P85-AND85.md` |

Sjekket uten funn: ingen hemmeligheter eller API-nøkler i Kotlin (grep `sk-`, `AIza`, `ghp_`, `xox`; treffet i `AiCtl34.kt:618` er en plassholdertekst). Ingen `Log.*` med token (25 `Log`-kall totalt). `allowBackup="false"` i alle tre. Ingen `addJavascriptInterface` og ingen egen `TrustManager`.

## Spørsmål til brukeren

1. Hvilket domene skal App Links bruke: `home.kristo.no`, `os.smarthjemeksperten.no` eller begge (B1)?
2. Skal Kalender finnes både som egen app og inne i Homelab-appen, eller skal den ene ut?
3. Er dynamic color (Material You) bevisst borte for godt (fjernet i prompt 42)?
4. Er Samsung- og låseskjerm-variantene av widgetene (74 leverandører) i bruk, eller kan de slås sammen?
5. Kan vi få en CI-jobb med emulator, slik at R8, en generert baseline-profil og Macrobenchmark kan innføres trygt?
