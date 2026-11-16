# Opprydding – status etter Fase 7 (verifisering)

Dato: 16.11.2026 · Gren: `opprydding/fase-7-verifisering` · Grunnlag: `main` `ba4542f` (Fase 0–6)

Dette dokumentet går gjennom alle funnene i [AUDIT.md](AUDIT.md) og detaljrapportene i [`detaljer/`](detaljer/) og sjekker dem mot koden slik den er nå. Hvert funn har status, bevis (fil, test eller commit) og, for det som gjenstår, en kort begrunnelse og et forslag. Tallene før og etter, testresultatene og skjermbildene står først.

**Kort fortalt:** begge kritiske funn (K1, K2) og alle fem høye (H1–H5) er rettet. Av de 19 middels er 16 rettet og 3 delvis (M5 CLS på Skjold Lab, M9 kontrast, M17 transportørverdiene etter Q22). Buglisten i §4 har 107 rader: 61 rettet, 16 delvis, 25 gjenstår, 3 ikke målt og 2 som ikke er feil. Fase 7 rettet 9 små feil, hver med test (§6). Alle testene er grønne. Det som gjenstår, er i hovedsak de store arkitekturgrepene på mobil (`Store` på iOS, `AppViewModel` på Android, Navigation Compose, Swift 6), filnavn med nummer i Økonomi på mobil-web, Android og iOS-/Android-testene, noen kontrastfeil og en håndfull lave funn. Se [Det viktigste som gjenstår](#det-viktigste-som-gjenstår).

---

## 1. Testresultater (main + Fase 7)

| Kommando | Resultat | Merknad |
|---|---|---|
| `npm test` på `main`, kjøring 1 | **3 120 av 3 120** grønne, 0 todo, 4 min 44 s | Egen `DATA_DIR` og `TMPDIR` |
| `npm test` på `main`, kjøring 2 | **3 120 av 3 120** grønne, 4 min 42 s | Ingen ustabile tester: de samme testene var grønne begge gangene |
| `npm test` med Fase 7 | **3 128 av 3 128** grønne, 0 todo, 5 min 4 s | 8 nye tester |
| `npm run test:e2e` | **17 av 17** grønne | Egen port |
| `npm run a11y` | **OK, ingen nye brudd** | 266 visninger, 483 brudd i alt, 0 nye mot grunnlinjen (312 berøringsflater under 24 px, 141 kontrast, 30 etiketter). Rapport: `test/a11y51/out/report.md` |
| `npm run test:visual` | **266 av 266 like** | 0 nye, 0 endret |
| `npm run test:perf` | Kjørt, se §2.2 | Skrev [`ytelse-etter.json`](ytelse-etter.json) |
| `npm run tokens:check` | **OK** (68 filer) | – |
| `npm run kontrakt:eksempler` | **Ingen endringer** etter Fase 7 | På `main` skrev den nye tidspunkter og en ny tilfeldig webhook-hemmelighet hver gang. Rettet i Fase 7 (steg 1) |
| iOS og Android | Ikke bygget her | Ingen Xcode eller Android SDK i miljøet. CI-jobben «Mobilapper» var grønn for `main` (Fase 6). Swift- og Kotlin-endringene i Fase 7 er sjekket med kildetester |

## 2. Tall før og etter

### 2.1 Målbare tall fra AUDIT

«Før» er AUDIT-tallene (main `9170678`, v4.73.1) og samme telling på den commiten. «Etter» er denne grenen. Tellingene er gjort med `find`/`grep` på filnavn og innhold i `server/`, `public/` og `apps/`; AUDIT-tallene står i egen kolonne, fordi AUDIT til dels talte annerledes.

| Mål | AUDIT (før) | Før, samme telling | Etter | Kommentar |
|---|---:|---:|---:|---|
| CSS-filer på web | 65 | 65 | **50** | `public/css` 58 → 42 (tokens, base, layout, components, pages), Økonomi 7 → 8. Målet var ca. 15 |
| CSS-størrelse | 1,99 MB | 1 992 230 B | **1 958 208 B** | −2 %. Mesteparten er `public/finans/css/mobile.css` (925 KB med resten av Økonomi) |
| CSS-filer med nummer | 41 | 41 | **0** | – |
| CSS lastet per Homelab-rute | 42–47 | 42–47 | **28–30** | Fra `test:perf`, se §2.2 |
| Unike hex i CSS (uten generert `tokens.css`) | 942 | 943 | **875** | 5 067 forekomster (før 6 314). 1 848 av dem i `finans/css/mobile.css`; 21 `TODO(token)` står igjen |
| `!important` i CSS | 1 218 | 1 218 | **1 188** | 861 i `finans/css/mobile.css` (før 914). Skallet og sidene: 327 (før 304, etter omfordeling), alle med begrunnelse (`dd62b01`, `8243021`). Rest-Økonomi: `mobile.css` 861 → **806** (11 i døde `.ios`-regler, 42 målt uten virkning, 2 erstattet av klasser); `test/finans-mobil-css.test.js` holder tallet nede |
| Unike `font-size` / `border-radius` (px) i CSS | 75 / 127 | 73 / 64 | **72 / 63** | Annen telling enn AUDIT (bare px-verdier). Typografi og radier er i tokens, men gamle regler står igjen |
| JS-filer på web med nummer | flertallet | 189 av 302 | **32 av 316** | Alle 32 var Økonomi på mobil (`public/finans/js/mobile-p16…p46.js`, `mobile-paper2/3.js`). Rest-Økonomi: **0**, de har fått beskrivende navn (`test/finans-mobil-filer.test.js`). Skallet og sidene: 0 |
| Statiske importer i `app.js` | 45 | 45 | **27** | Rutene lastes ved behov (`b7501e0`) |
| JS-moduler per rute | 179–191 | 179–191 | **100–112** | Fra `test:perf` |
| Serverfiler med nummer | 276 av 371 | 276 av 371 (sti) | **1 av 418** | Igjen: `server/mai17-41.js`. Ingen mapper med nummer (før 16) |
| `server/index.js` | 1 017 linjer | 1 017 | **668** | – |
| `db.prepare(` i serveren | 513 | 513 | **387** | Resten bruker `q(sql)` med cache (`3f27b6f`) |
| «I dag» i UTC (`toISOString().slice(0, 10)`) | 63 | 71 | **53** | Alle 53 er datoaritmetikk på rene datoer (se H5) |
| Swift-filer med nummer | 493 av 568 | 493 av 568 | **0 av 533** | rest-ios: `GlimtCalendarCard`, `FamilyCalendar`, `MediaPlayback`, `CalendarWidgetViews`, `CalendarShared` (filene; typenavnene som `Cal70CardView` står foreløpig). `test/ios-opprydding.test.js` |
| Kotlin-filer med nummer | 298 av 344 | 298 av 344 | **70 av 367** | Bl.a. `Paper14–19.kt`, `Models11–17.kt`, `…51Plat.kt`, `Brief34Widgets.kt` |
| Filer med nummer utenfor `test/` (server, public, apps) | 892 | 1 202 (alle typer) | **111** | – |
| Testfiler med nummer | – | – | **31 av 285** (før: 195 av 288) | rest-tester: 161 omdøpt etter domene (f.eks. `test/sporing-mybring.test.js`), 3 små slått sammen. De 31 som gjenstår, er iOS- og Android-testene (`p70-andhome` … `p89-ios`) |
| iOS: unike hex (uten generert) / filer med hex | 700 / 277 | 788 / 296 | **757 / 256** | Fargene går mest via `DS`-tokens nå, men hex-verdiene står igjen i bl.a. `GlimtFigures.swift` og `WeatherSheets.swift` |
| iOS: `ObservableObject` / `URLSession.shared` | 15 / 40 filer | 13 / 45 | **0 / 2** | – |
| iOS: `id: \.offset` / `DateFormatter()` / `nonisolated(unsafe)` | 165 / ~50 / 17 | 165 / 95 / 17 | **162 / 71 / 18** | Lite endret |
| iOS: `.system(size:)` | 645 | 645 | **482** | Dynamic Type via `relativeTo:` (4 → 13) |
| iOS: `NavigationStack` / `NavigationSplitView` / `ContentUnavailableView` | – | 3 / 0 / 0 | **12 / 13 / 6** | – |
| iOS: `Store.swift` | 1 686 linjer | 1 686 | **1 681** | rest-ios: første domene (Domener) ute som `DomenerModell`; resten gjenstår |
| Android: `Color(0x…)` (uten generert) | 1 164 (534 unike) | 1 282 (558) | **973 (484)** | – |
| Android: `fontSize` | 3 713 | 3 716 | **1 638** | – |
| Android: `MaterialTheme.colorScheme` / `.typography` | 2 / 11 | 2 / 17 | **4 / 19** | Tema og typeskjema fra tokens via `HomelabTheme` |
| Android: `LocalDate.now()` uten sone | 97 | 92 | **63** | `OsloDato.iDag()` i `:felles` |
| Android: `AppViewModel.kt` | 3 855 linjer | – | **3 949** | Ikke delt opp |
| Android: `SavedStateHandle` / `PredictiveBackHandler` | 0 / 2 | 0 / 2 | **0 / 3** | – |

### 2.2 Ytelse på web (`npm run test:perf`)

Samme måleskript som før Fase 3 (`test/ui51/perf.mjs`: mock-server, kald last, desktop 1440 × 900, mobil 390 × 844 med 4× CPU-struping). «Før» er [`ytelse-for.json`](ytelse-for.json) (15.11, før Fase 3), «etter» er [`ytelse-etter.json`](ytelse-etter.json). Begge er målt i samme type skymiljø, men tallene varierer noe mellom kjøringer (særlig FCP, LCP og lange oppgaver), så små forskjeller betyr lite.

| Profil | Rute | JS-filer | JS (kB gzip) | CSS-filer | Forespørsler | API-kall | FCP (ms) | LCP (ms) | CLS | Lange oppgaver (ms) | Tvungne layouter (antall / ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | dash | 179 → 110 | 1338 → 684 | 42 → 29 | 326 → 243 | 76 → 75 | 332 → 440 | 1936 → 1968 | 0,44 → 0,11 | 158 → 249 | 64 / 85 → 52 / 106 |
| desktop | media | 181 → 100 | 1344 → 626 | 42 → 30 | 301 → 205 | 75 → 72 | 256 → 232 | 1244 → 1004 | 0,36 → 0,05 | 50 → 0 | 69 / 87 → 30 / 72 |
| desktop | finans | 39 → 43 | 335 → 349 | 9 → 9 | 65 → 69 | 10 → 10 | 176 → 204 | 356 → 516 | 0,00 → 0,00 | 0 → 0 | 24 / 24 → 9 / 23 |
| desktop | skjold | 191 → 112 | 1429 → 715 | 47 → 30 | 303 → 204 | 61 → 58 | 216 → 336 | 1100 → 1408 | 0,36 → 0,49 | 0 → 0 | 10 / 19 → 11 / 12 |
| desktop | kalender | 179 → 106 | 1338 → 673 | 42 → 28 | 284 → 194 | 59 → 56 | 256 → 384 | 1272 → 1496 | 0,36 → 0,05 | 108 → 124 | 32 / 56 → 14 / 59 |
| mobil | dash | 179 → 110 | 1338 → 684 | 42 → 29 | 308 → 225 | 75 → 74 | 416 → 564 | 2988 → 2620 | 0,17 → 0,10 | 1021 → 497 | 22 / 254 → 11 / 152 |
| mobil | media | 181 → 100 | 1344 → 626 | 42 → 30 | 301 → 205 | 75 → 72 | 608 → 464 | 2352 → 2556 | 0,08 → 0,00 | 524 → 542 | 67 / 250 → 27 / 167 |
| mobil | finans | 87 → 94 | 1053 → 1072 | 9 → 10 | 218 → 179 | 115 → 58 | 204 → 244 | 4812 → 2256 | 0,00 → 0,00 | 1604 → 254 | 115 / 883 → 5 / 18 |
| mobil | skjold | 191 → 112 | 1429 → 715 | 47 → 30 | 303 → 204 | 61 → 58 | 552 → 396 | 2624 → 1644 | 0,59 → 0,57 | 620 → 279 | 15 / 112 → 11 / 50 |
| mobil | kalender | 179 → 106 | 1338 → 673 | 42 → 28 | 284 → 194 | 59 → 56 | 468 → 368 | 2404 → 1688 | 0,11 → 0,09 | 730 → 388 | 33 / 190 → 15 / 156 |

Rå tall: [`ytelse-for.json`](ytelse-for.json) og [`ytelse-etter.json`](ytelse-etter.json). Oversikt = `dash`, Økonomi = `finans` (`/finans/`).

- **Mindre å laste:** Homelab-rutene laster 100–112 JS-moduler i stedet for 179–191, og overfører halvparten så mye JS (gzip 1,3–1,4 MB → 0,6–0,7 MB). CSS-filene per rute er 28–30 i stedet for 42–47. Forespørslene ved lasting er 25–33 % færre.
- **Økonomi på mobil** (verst i AUDIT): tvungne layouter 883 ms → 18 ms, lange oppgaver 1,6 s → 0,25 s, LCP 4,8 s → 2,3 s og API-kall ved lasting 115 → 58.
- **CLS** er nesten borte på Oversikt, Media og Kalender. **Skjold Lab** har fortsatt høy CLS (0,49 / 0,57), med en annen årsak enn temabyttet (se M5).
- **FCP og LCP på desktop** er litt høyere på noen ruter (Oversikt, Skjold, Kalender, Økonomi desktop +30–160 ms). Det ligger innenfor variasjonen mellom kjøringer med denne metoden, men lat lasting av rutene gir én ekstra rundtur før første tegning, så det er verdt å følge med på.
- **API-kall ved lasting** er nesten uendret på Homelab-rutene (56–75). Pollingen går bare der den vises, men startkallene er de samme.

### 2.3 Kall-tider på serveren (M19)

Samme metode som AUDIT A §4.1: serveren med eksempeldata i prosess, 15 kall per endepunkt (p50 og maks i ms), deretter 20 000 ekstra transaksjoner. Måleskriptet (et lite Node-skript som laster `server/index.js` med `MOCK_DATA=1` og kaller `app.request`) ligger ikke i repoet. «Før» er kjørt på nytt mot `9170678` på samme maskin, så tallene kan sammenlignes direkte.

| Endepunkt | p50 før → etter | maks før → etter | KB |
|---|---|---|---|
| `/api/brief` | 97 → **43** | 169 → 51 | 12,1 |
| `/api/widgets/calendar` | 88 → **38** | 157 → 53 | 10,4 |
| `/api/kalender?from=2026-11-01&to=2026-11-30` | 62 → **28** | 66 → 31 | 56,8 |
| `/api/kalender` | 62 → **29** | 70 → 31 | 73,6 |
| `/api/brief/widget` | 68 → **37** | 95 → 44 | 0,6 |
| `/finans/api/transactions` | 42 → **9** | 90 → 15 | 87,8 |
| `/api/mobile/home` | 36 → **27** | 54 → 33 | 18,9 |
| `/finans/api/summary` | 22 → **4** | 77 → 50 | 15,7 |
| `/api/kalender/calendars` | 20 → **10** | 26 → 19 | 3,8 |
| `/api/tracking` | 10 → **2** | 16 → 7 | 23 |

Med 20 119 transaksjoner:

| Endepunkt | p50 før → etter | maks før → etter | KB |
|---|---|---|---|
| `/finans/api/summary` | 100 → **70** | 136 → 103 | 15,8 |
| `/finans/api/transactions` | 167 → **53** | 275 → 60 | 362,4 |
| `/finans/api/transactions?limit=2000` | 592 → **168** | 768 → 248 | 1448,8 |
| `/finans/api/transactions?q=rema` | 140 → **49** | 164 → 66 | 361,4 |

Kalender, Brief og widgetene er 2–2,5 ganger raskere. `/finans/api/transactions?limit=2000` med 20 000 transaksjoner går fra 592 til 168 ms (AUDIT målte 547 ms), fordi statementene gjenbrukes, `kv` leses én gang per forespørsel og brukeroppslaget gjøres én gang per liste. `/finans/api/summary` med mange transaksjoner (70 ms) er det tregeste som er igjen. `/api/weather` er utelatt (krever økt, ikke token, i begge versjoner).

## 3. Visuelt før og etter

[`skjermbilder/`](skjermbilder/) har 36 par (én WebP per par, «før» til venstre). «Før» er den første referansen i Fase 3 (`77f8a68`, `test/visual51/ref`), altså etter serverarbeidet i Fase 2, men før web-oppryddingen. «Etter» er skjermbildene fra `npm run test:visual` på denne grenen (`test/visual51/out`), ikke referansene: 41 av 266 referanser avviker 0,3–0,94 % fra dagens skjerm, under terskelen på 1 %. Flere av dem viser fortsatt den gamle toppmenyen (f.eks. `familie-1440-glass.png` med «Dashboard, Vær, Chat …»), fordi menyen er en liten del av bildet. Se punkt 11 under [Det viktigste som gjenstår](#det-viktigste-som-gjenstår).

| Visning | 1440 px | 390 px |
|---|---|---|
| Oversikt | [Papir lys](skjermbilder/oversikt-1440-papir-lys.webp) · [Papir mørk](skjermbilder/oversikt-1440-papir-mork.webp) · [Glass](skjermbilder/oversikt-1440-glass.webp) | [Papir lys](skjermbilder/oversikt-390-papir-lys.webp) · [Papir mørk](skjermbilder/oversikt-390-papir-mork.webp) · [Glass](skjermbilder/oversikt-390-glass.webp) |
| Kalender | [Papir lys](skjermbilder/kalender-1440-papir-lys.webp) · [Papir mørk](skjermbilder/kalender-1440-papir-mork.webp) · [Glass](skjermbilder/kalender-1440-glass.webp) | [Papir lys](skjermbilder/kalender-390-papir-lys.webp) · [Papir mørk](skjermbilder/kalender-390-papir-mork.webp) · [Glass](skjermbilder/kalender-390-glass.webp) |
| Økonomi | [Papir lys](skjermbilder/finans-oversikt-1440-papir-lys.webp) · [Papir mørk](skjermbilder/finans-oversikt-1440-papir-mork.webp) · [Glass](skjermbilder/finans-oversikt-1440-glass.webp) | [Papir lys](skjermbilder/finans-oversikt-390-papir-lys.webp) · [Papir mørk](skjermbilder/finans-oversikt-390-papir-mork.webp) · [Glass](skjermbilder/finans-oversikt-390-glass.webp) |
| Media | [Papir lys](skjermbilder/media-1440-papir-lys.webp) · [Papir mørk](skjermbilder/media-1440-papir-mork.webp) · [Glass](skjermbilder/media-1440-glass.webp) | [Papir lys](skjermbilder/media-390-papir-lys.webp) · [Papir mørk](skjermbilder/media-390-papir-mork.webp) · [Glass](skjermbilder/media-390-glass.webp) |
| Familie | [Papir lys](skjermbilder/familie-1440-papir-lys.webp) · [Papir mørk](skjermbilder/familie-1440-papir-mork.webp) · [Glass](skjermbilder/familie-1440-glass.webp) | [Papir lys](skjermbilder/familie-390-papir-lys.webp) · [Papir mørk](skjermbilder/familie-390-papir-mork.webp) · [Glass](skjermbilder/familie-390-glass.webp) |
| Mat | [Papir lys](skjermbilder/mat-1440-papir-lys.webp) · [Papir mørk](skjermbilder/mat-1440-papir-mork.webp) · [Glass](skjermbilder/mat-1440-glass.webp) | [Papir lys](skjermbilder/mat-390-papir-lys.webp) · [Papir mørk](skjermbilder/mat-390-papir-mork.webp) · [Glass](skjermbilder/mat-390-glass.webp) |

Det som synes best: toppmenyen på én linje med «Alle sider ▾» (H1, M7), «Økonomi» og de nye menynavnene (Q2, Q4), Familie, Kalender og Media i mørkt i Glass (Q14), Mat med mørkt dagskort i mørk modus (B-F4) og Glass-kort på Oversikt (B-F3).

## 4. Bugliste

Status: **Rettet** (i fase N), **Delvis**, **Gjenstår** eller **Ingen feil** (vurdert, ikke en feil). Id-ene er fra AUDIT §9 (K, H, M), detaljrapportene (A-, B-, C-, D-, E-) og E §3 (O). Funn som har to id-er, står én gang med begge. L1–L20 i AUDIT er de lave funnene i detaljrapportene og står under sine egne id-er (A-B6, A-B7, A-B9, B-B6–B10, C-B4, C-S2, D-B4, E-B10, E-B12).

| Id | Funn | Status | Bevis | Gjenstår: begrunnelse og forslag |
|---|---|---|---|---|
| **K1** (A-B1) | Utlogging i Kalender-appene kalte `/finans/api/logout` (404), tokenet levde videre | Rettet i Fase 0b, forsterket i Fase 2 | `KalStore.swift:228`, `MacStore.swift:178`, `KalVm.kt:247` kaller `/finans/api/auth/logout`; aliaset i `server/http/aliases.js:25`; `test/sikkerhet-utlogging.test.js` | – |
| **K2** (D-S1, P85 A) | Android-signeringsnøkkelen og passordet lå i repoet | Rettet i Fase 0b (`f199453`) | Ingen `.jks`/`.keystore` i repoet; `apps/android/build.gradle.kts` leser `ANDROID_KEYSTORE_*`; `test/sikkerhet-android-signering.test.js` | Historikken er ikke skrevet om (Q24, bevisst) |
| **H1** (B-B1, E-B1) | Toppmenyen skjulte Kalender, Bursdager og Skjold Lab på 1440/1920 px | Rettet i Fase 3 og 6 | `f80c7d7`, `f9dc0e1`; `test/e2e51/toppmeny.e2e.mjs` (grønn) | – |
| **H2** (C-S1) | iOS-tokens i klartekst i App Group-`UserDefaults` | Rettet i Fase 0b (`ec14f11`) | `apps/ios/SharedKeychain/Nokkelring.swift` (`AfterFirstUnlockThisDeviceOnly`); `test/sikkerhet-ios-nokkelring.test.js` | – |
| **H3** (F 2, L2) | Neste trekkdato regnet i klienten og sendt til serveren | Rettet i Fase 2–5 | Serveren regner (`server/finans/`, `shared/testvektorer/abonnement.json`); web `mobile-subs.js:319`, `subs-desktop.js:481`; iOS `121646f`; Android `dc53465` | Klientene sender `nextDate` bare når datoen er kjent (skjermbilde, prøveperiode). `Store.addSub` (iOS) og `AppViewModel.addSub` (Android) sender fortsatt `nextDate`, men kalles ikke (død kode). Forslag: slett dem i neste runde |
| **H4** (F 1, L1) | Datotolkerne ga ulike svar | Rettet i Fase 1–2 | Én tolker `server/dates/parse.js` + `POST /api/dates/parse`; `shared/testvektorer/datoer.json` kjøres av `test/testvektorer.test.js` (0 todo), iOS `DateVectorTests.swift`, Android `HurtigtolkingTest.kt` | Lokal reserve uten nett finnes fortsatt i Android Kalender (`KalParse.kt`), men følger testvektorene |
| **H5** (F 3, L3) | «I dag» i UTC 63 steder | Rettet i Fase 2 | `server/dates/oslo.js` (`osloDate`); `shared/testvektorer/idag.json`. De 53 `toISOString().slice(0, 10)` som er igjen, er datoaritmetikk på rene datoer i UTC (trygt) | To utviklerskript (`server/logos/fetch-logos.mjs`, `server/backgrounds/fetch-backgrounds.mjs`) bruker UTC-datoen som stempel. Ufarlig |
| **M1** (A-B2) | Bakgrunnsjobber med sideeffekter startet ved import, også i sandkassen | Rettet i Fase 2 og 7 | `server/jobs/index.js`; `test/kontrakt-server.test.js`, `test/jobber.test.js`. Fase 7: e-postimporten (`finans.epost`) og oppetidssjekken (`domener.oppetid`) gikk fortsatt utenom | – |
| **M2** (A-B3) | 404 som ren tekst | Rettet i Fase 2 (`6ea9b4b`) | `server/http/errors.js`; `test/http-errors.test.js` | – |
| **M3** (A-B4) | Transaksjoner stoppet på 2 000 | Rettet i Fase 2 (`e7c69de`) | Cursor-paginering; `test/finans-tx-cursor.test.js` | – |
| **M4** (B-B3, B-F1) | Økonomi fulgte ikke Papir mørk | Rettet i Fase 3 (`287c414`, Q15) | `public/finans/js/tema.js`; `test/finans-tema.test.js`; skjermbilde `finans-oversikt-1440-papir-mork` | – |
| **M5** (B-B4) | Temaet hoppet ved første besøk (CLS) | Rettet | Temabyttet rettet i Fase 3 (`31d0c2b`): Oversikt 0,44 → 0,11, Media 0,36 → 0,05, Kalender 0,36 → 0,05. Skjold Lab (`f499a9c`): innholdet ble tegnet før `skjold.css` var lastet, «Ingen deler ennå» kom før lista, og på mobil ble skapet skjøvet ut av lista. CLS 0,49 → 0,064 (desktop) og 0,57 → 0,069 (mobil), målt med kildene til `layout-shift`; `test/e2e51/skjold-cls.e2e.mjs` | Resten (0,06) er topplinjen ved oppstart, lik på alle sider |
| **M6** (B-B5) | Økonomi mobil: ~1 s tvungne layouter | Rettet i Fase 3 (`121014c`, `78826da`, `9760576`) | `test:perf` mobil Økonomi: tvungne layouter 115 / 883 ms → 5 / 18 ms, lange oppgaver 1 604 → 254 ms, LCP 4,8 → 2,3 s | – |
| **M7** (B-B2) | Toppmenyen brakk over to linjer i Glass | Rettet i Fase 3 (`f80c7d7`) | `test/e2e51/toppmeny.e2e.mjs` («én linje») | – |
| **M8** (E-B2) | «Hva skal vi se i kveld?» under «‹ Tilbake» | Rettet i Fase 3 (`986615c`) | Visuell referanse `media-*` | – |
| **M9** (E-B3, E-B4, B-F4–F6) | Kontrastfeil (Integrasjoner, Domener, Glimt-pille, Mat, avatar) | Delvis | Domener, avataren (`903a251`), Mat i Papir mørk (`01fce01`). `2dd9868`: Integrasjoner «Mangler …» (fast #b23a2a, 2,79–3,02:1) bruker `--ds-warning`; Mat «Fast» og dagens kort i mørk og Glass 4,8–6,2:1; Husstand (Overfør eierskap, forbokstaver 2,34:1), Varsler, Media-avspilling og kartene. `npm run a11y`: 482 → 382 brudd i alt, og kontrastbrudd på Homelab-sidene bare i Nyheter-innstillingene; grunnlinjen senket (`b47bad1`) | Nyheter-innstillingene: forbokstavene bak kildelogoen (3,71:1) har fargen brukeren har valgt per kilde. Økonomi (Faste betalinger, Abonnementer) er ikke med i denne runden (eies av Økonomi) |
| **M10** (E-B5) | Skann-knappen dekket beløpene | Rettet i Fase 3 (`9fa88e3`, `eda7266`) | Visuell referanse `finans-oversikt-390-*` | – |
| **M11** (C-B1) | `PaperSkin.palette` satt under `body` | Rettet i Fase 4 | `PaperTheme.swift:6–36` (`@Observable`, settes av roten); `dd6b444` | – |
| **M12** (D-B2) | Polling i composables fortsatte i bakgrunnen | Rettet i Fase 5 (`dd292ad`, `5944a4f`, `a079589`) | Livssyklusbasert henting | Ikke verifisert på enhet |
| **M13** (D-B3, F 11 / L11) | `exportCsv` på hovedtråden | Rettet i Fase 5 (`8e0e440`) | CSV fra serveren; `test/android-fundament.test.js` «B3» | – |
| **M14** (D-S2) | Brukerinstallerte CA-er for all trafikk | Rettet i Fase 5 (`8e0e440`) | `network_security_config.xml`: bruker-CA bare for `.local/.lan/.home.arpa/.internal` | – |
| **M15** (D-S3) | «Lokal» avgjort av vertsnavnet | Rettet i Fase 5 | `felles/…/LokaltNett.kt` (et lokalt navn må peke til en lokal adresse); `ServerAdresseTest.kt` | – |
| **M16** (D-B1) | App Links bare for `home.kristo.no` | Rettet i Fase 5 (`8e0e440`) | `AndroidManifest.xml:122–123`; `/.well-known/assetlinks.json` (`server/auth/login.js:93`) | Krever `ANDROID_CERT_SHA256` på serveren for det nye domenet |
| **M17** (A §5) | OAuth-verdier for Posten, Bring og PostNord i koden | Delvis (etter Q22) | `server/sporing/carrier-apps.js` med overstyring fra miljøet (`349f2cb`) | Standardverdiene ligger fortsatt i repoet, bevisst etter Q22 (risikoen står i `docs/sikkerhet.md`) |
| **M18** (A §5) | App-tokens utløp aldri | Rettet i Fase 2 (`d36b7cc`, Q23) | 180 dager glidende; `test/kontrakt-server.test.js` | – |
| **M19** (A §4) | Trege kalender-, summary- og transaksjonskall | Rettet i Fase 2 | Statement-cache, kv per forespørsel, indekser, cursor, gzip (`3f27b6f`, `0c62132`, `99f1a57`, `e7c69de`, `4521fe7`); tall i §2.3 | – |
| A-B5 | iOS-widgeten prøvde en sti som ikke finnes før «Pause alt» | Rettet i Fase 7 | `apps/ios/Shared/MediaShared.swift`; `test/ios-moduler.test.js` | – |
| A-B6 | `POST /api/grades` regnet `sort` over alle brukere | Rettet i Fase 7 | `server/index.js`, `server/studie/documents.js`; `test/isolation.test.js` | – |
| A-B7 | Nedstengingen ventet 5 s på WebSocket-forbindelser | Rettet i Fase 7 | `closeRealtime()` i `server/realtime.js`; `test/realtime-stopp.test.js` | – |
| A-B8 | `/summary` og `/overview` dobbelt vedlikehold | Rettet i Fase 2 (`fb913b7`) | Én handler; `/overview` legger bare til egne felt (`server/finans/overview.js`) | – |
| A-B9 | `starting.js` spør `/api/ready`, som ikke fantes | Rettet (rest-server) | `GET /api/ready` → `{ok, ready, version}` i `server/index.js` (503 mens serveren starter); skjema `shared/schemas/api/ready.schema.json`; `test/oppstart-og-oppdagelse.test.js` | – |
| A §5 | `/api/discovery` viste lokal adresse uten innlogging | Rettet (rest-server) | `server/auth/app-login.js`: `local` bare når klienten er på lokalt nett (`trustIp` + `isLan`: tilkoblingen eller `CF-Connecting-IP` bak cloudflared, aldri `X-Forwarded-For`), ellers `[]`; skjema `api/discovery.schema.json`; `test/oppstart-og-oppdagelse.test.js` | Appene som settes opp fra internett, får bare `external` |
| A §5 | Media-webhook: token sammenlignet med `!==` | Rettet i Fase 7 | `server/media/arr.js` (`timingSafeEqual`); `test/media-ruter.test.js` | Kall uten token godtas fortsatt direkte fra LAN (bevisst) |
| A §5 | Brukernavnet «sebastian» hardkodet for bibelvers | Rettet (rest-server) | `server/bibel/bible.js`: på som standard for eieren (hovedadmin), av for andre; lagrede valg endres ikke; `test/bibel-standard.test.js` | – |
| B-B6 | `scrollmem` dro scrollen tilbake | Rettet i Fase 3 (`121014c`) | `public/js/scrollmem.js:17–33` (ResizeObserver, brukerinput avbryter) | – |
| B-B7 | Polling på alle ruter | Rettet i Fase 3 (`b7501e0`) | Periodisk henting bare der det vises | API-kall ved første lasting er nesten uendret (Oversikt 76 → 75, Kalender 59 → 56). Forslag: én samlet startforespørsel for skallet |
| B-B8 | Død `family.css`/`family.js` | Rettet i Fase 3 (`1e58f67`) | `family.css` er borte; `family.js` er nå Familie-modulen (`family-web.js` importerer den) | – |
| B-B9 | Leaflet-reserve fra unpkg blokkert av CSP | Rettet i Fase 3 (`4faa033`) | `public/finans/js/leaflet.js` (bare fra serveren) | – |
| B-B10 | 20 Wikimedia-kall uten nett ved oppstart | Rettet (rest-server) | `public/js/bgsvc.js` og `public/finans/js/mobile-p41.js` henter Oslo-bildene fra `GET /api/background/file/:navn` (`server/background.js`, katalogen `oslo_dognet`); `test/bakgrunn-bildebuffer.test.js` | Fotoene ligger ikke ferdig nedlastet i imaget ennå: kjør Actions «backgrounds» med `oslo_dognet`. Til da laster serveren dem ned ved første bruk |
| B-B11 | Onboardingen i mobil-Økonomi blokkerte dype lenker | Rettet i Fase 3 (`4cf5996`, Q35) | – | – |
| B-F2 | Familie, Kalender, Media lyst papir i Glass | Rettet i Fase 3 (`21df0a7`, Q14) | Skjermbilder `familie-*-glass`, `kalender-*-glass` | – |
| B-F3 | Dashbordkortene fikk Papir-farge i Glass | Rettet i Fase 3 | Skjermbilde `oversikt-1440-glass` | – |
| B-F5 | Aksentrød tekst på mørk flate | Rettet i Fase 3 (`905ed2a`) | a11y: Bursdager 0 kontrastbrudd | Chat er ikke med i a11y-sidene |
| B-F6 | Økonomi desktop: svak tekst, avatar 1,26:1 | Rettet i Fase 3 (`65360a3`, `21a312d`, `903a251`) | a11y `finans-oversikt` Papir lys 0 | Papir mørk: 4 brudd (3,77–4,36:1) i «Trenger gjennomgang» |
| B-F7 | Smarthjem undertekst 3,1–3,5:1 | Rettet i Fase 3 | a11y `smarthjem` 0 kontrastbrudd | – |
| B-F8 | Skjold Lab initialmerker | Rettet i Fase 3 (`8c65439`) | a11y `skjold` 0 kontrastbrudd | – |
| B-F9 | Innstillinger → Utseende seksjonstitler | Rettet i Fase 3 | a11y `innst-utseende` 0 kontrastbrudd | – |
| B-F10 | Mediakveld «I kveld»-knappen | Rettet i Fase 3 (`986615c`) | Tokens i `pages/media.css` | Mediakveld er ikke med i a11y-sidene |
| B-F11 | Mat «Fast» 3,65:1 | Rettet | `01fce01` (Papir lys), `2dd9868`: «Fast» og «Fast»-merket 4,84:1 (Glass), 5,10:1 (Papir mørk), 5,95:1 (Papir lys) | – |
| C-S2 | Token i `/api/ws?token=` (iOS/Mac) | Rettet i Fase 4; Android i Fase 7 | `PaperAppSettings.swift:520`, `MacSystem.swift:28`; Android `Realtime.kt` (header); `test/android-fundament.test.js` | – |
| C-S3 | Nøkkelring uten `ThisDeviceOnly` | Rettet i Fase 0b/4 | `Nokkelring.swift:19` | – |
| C-S4 | Standard lokal adresse `http://10.69.1.39:3000` | Rettet: iOS (rest-ios), Android (rest-android `52e630f`), server og web (rest-tester) | iOS: ingen fast lokal adresse i `project.yml` eller koden (`Server47.defaultLocal`, `KalAuth41.defaultLocal47` er tomme uten Info.plist-verdi); adressen læres fra serveren (`/api/config/servers`, `/api/me/server`, `/api/discovery`) eller QR, og «Tilbakestill» beholder lagret lokal adresse; `test/ios-opprydding.test.js`. Server: `DEFAULT_LOCAL_URL47` er fjernet; `serverUrls47()` gir `LOCAL_URL` → oppdaget LAN-adresse (`lanUrls46`, aldri i container) → `null`, med `source.localUrl` `env`/`discovered`/`none`. `/api/me/server` gir `local: null` uten lagret adresse, og `reset:true` beholder brukerens lokale adresse når det ikke finnes noen standard. Web og PWA: `DEF47.local` er tom, plassholderen er eksemplet `http://192.168.1.10:3000` (`EKSEMPEL_LOKAL`), «Tilbakestill» sender ikke lokal adresse uten standard. `LOCAL_URL` er dokumentert i `.env.example`. Tester: `test/serveradresser-og-enhets-ocr.test.js` (C-S4-testene, også et søk etter `10.69.1.39` i server- og webfilene) og `test/domene-media-og-innlogging-web.test.js` | Android `Regel89.kt:13`, `Serveradresse.kt:80`, `kalender/Innlogging.kt:58` (D-B5, P85 B) gjenstår (rest-android). `10.69.1.39` står fortsatt som tillatt avsender i verktøyene på Mac mini-en (`tools/*/install.sh`); det er en annen sak (hvilken maskin som får kalle dem), ikke klientenes standardadresse |
| C-B2 | Tvunget mørk systemstil | Rettet i Fase 4 (Q16) | `project.yml:84`, `PaperTheme.swift:102` | – |
| C-B3 | `KalNet` sender tom kropp stille ved kodefeil | Rettet (rest-ios) | `SharedKal/Core/KalNet.swift` (`isValidJSONObject` + `throw`); `test/ios-opprydding.test.js` | – |
| C-B4 | Ubegrenset bildecache for skyer | Ingen feil | `WeatherEffects.swift:191`: nøkkelen er værtypen (noen få), så den vokser ikke | – |
| C-B5 | `innst-…`-rutingen duplisert (iPhone og iPad) | Rettet (rest-ios) | `FinansHub/Sources/InnstSide.swift`, brukt av `Paper.swift` og `SettingsWide.swift`; `test/ios-opprydding.test.js` | Én visning `InnstSide(id:)` i stedet for en fri funksjon, så den arver `@MainActor` fra `View` |
| D-B4 | `EncryptedSharedPreferences` uten `try/catch` | Rettet i Fase 5 (`3cf75f1`) | `felles-android/…/SikkerLagring.kt` | – |
| D-B5 (P85 B) | Hardkodet lokal adresse, klartekst bare til én IP | Rettet (`52e630f`) | Klartekst er tillatt til alle lokale adresser (`LokaltNett.kt`); ingen standardadresse (se C-S4) | Innlogging uten svar fra ekstern prøver bare en lokal adresse brukeren har, og bare når den svarer som samme server |
| D-B6 | `ALLOW_ALL_HOSTS_VALIDATOR` i debug | Ingen feil | `Car51Plat.kt:42–45`: `FLAG_DEBUGGABLE` settes av byggtypen | – |
| P85 C | Tilstandsendrende dyplenker uten bekreftelse | Rettet før Fase 0 | `LinkRegel86.kt` | – |
| P85 E | Trykkflater, ikoner uten beskrivelse | Delvis (skallet og 17 modulsider rettet) | `08e8c8c`, `c29a40f`, `df8cf60` (48 dp, ikoner); skallet `eb8d285` (14 trykkflater); runde3-android `da126f5` (27 trykkflater i `ui/domene`: Avganger, Drift, Familie, Gjøremål, Helse, Hjemlys, Nyheter, Økonomi) og `cb0be3f` (31 i Nyheter, Mat, Domener, Vær, Avganger og kalendervisningen): rolle (knapp), handling der teksten ikke sier nok, `selectable` med «valgt» for faner og filtre, `toggleable` (bryter) i Nyheter-innstillingene, «⟳» heter «Oppdater»; `test/android-opprydding.test.js` «P85 E» (ingen `clickable` uten rolle i de filene) | 183 `clickable` uten rolle står igjen i andre sider (Media 18, Abonnement 17, Aksjer 13, Papir-sidene 11, Familie 11, Boliger 9 …). Størrelsene er ikke endret (utseendet beholdt), så 48 dp må ses på enhet |
| P85 F | Ingen `SavedStateHandle` (prosessdød) | Rettet (rest-android-arkitektur) | `AppViewModel(app, SavedStateHandle)`: side, tilbakevei, Papir-side, innstillingsside, faner og søk lagres i en `SavedStateProvider` (aldri under `previewBack`) og hentes før `refresh()`; `DomenerViewModel` lagrer domene, fane og periode; 60 tekstutkast i skjemaene (app og Kalender) bruker `rememberSaveable`, passord, koder, nøkler og innloggingsnavn bevisst ikke; `test/android-arkitektur.test.js` «P85 F» | Ikke prøvd på enhet («Ikke behold aktiviteter»). Åpne ark (Gjøremål, Chat, Kalender-overlegget) gjenopprettes ikke, bare siden under |
| P85 G | Mulig duplikat ved ny opplasting av kvittering | Rettet (rest-server) | `Idempotency-Key` på alle opplastingsrutene for kvitteringer (`server/finans/idempotency.js`); `test/okonomi-kvittering-idempotens.test.js` | iOS sender nøkkelen fra offline-køen; Android må sende en UUID per bilde |
| P85 H | Widgeter oppdaterer i `Thread { runBlocking }` uten `goAsync()` | Rettet (`9ddc1b2`) | `widget/WidgetSync.kt` `WidgetJobs` (korutine, `goAsync()` i mottakere); Huskeliste-mottakeren henter via WorkManager; `test/android-opprydding.test.js` «P85 H» | – |
| P85 I | «Alt bra» fra varsel uten nett går tapt | Gjenstår (lav) | – | Trenger kø eller feilvarsel (ny funksjon) |
| P85 J | Hjemlys startes ikke etter omstart av telefonen | Gjenstår (lav) | `BOOT_COMPLETED` bare for ntfy | Krever «alltid»-posisjon; eget valg |
| P85 K | Ny hendelse kan forsvinne under synk (Kalender) | Gjenstår (lav, ikke gjenskapt) | `KalRepo.sync` | Ingen datatap |
| P85 L | Forrige brukers Familie-områder blir liggende | Rettet (`10e83bb`) | `Geofence50.useAccount` fjerner nærhetsvarsler og skolesoner ved kontobytte og utlogging; `test/android-opprydding.test.js` «P85 L» | Ikke verifisert på enhet |
| P85 M / D §1 | R8 av | Gjenstår (bevisst) | `isMinifyEnabled = false` i alle moduler | Slå på med baseline-profil når emulatoren er i CI |
| E-B6 | Ikonplassholdere i Snarveier 2,35:1 | Rettet | `8d01c9d`: `mer` er med i `PAGES51`, med logoene som 404 (`nologo`), så forbokstavene måles: 5,64:1 (Papir lys), 6,45:1 (Papir mørk), 7,07:1 (Glass). Ingen brudd på Mer | – |
| E-B7 | Glass: «Snarveier», «Du har siste versjon», Import «Lagre» 1,99:1 | Rettet i Fase 3 og 7 | a11y `oversikt` Glass 0 kontrastbrudd; «Lagre» rettet i Fase 7 (`--acc-ink`, `test/finans-tema.test.js`) | «Du har siste versjon» (System) er ikke med i a11y-sidene |
| E-B8 | Ticker-farger på Aksjer | Rettet (`65360a3`, rest-Økonomi patch 01) | «Salg»-merket har klassen `.mtag.ordre-salg` (5,8:1); `test/finans-tema.test.js`. a11y `finans-aksjer`: 4 brudd → 0 (også «Transaksjoner ›» 24 px på mobil) | – |
| E-B9 | 404 for logoer uten nett, feil sti til app-ikonet | Rettet (rest-server) | App-ikonet (`23f78d1`); `/finans/api/logo/:domain` svarer 204 uten innhold når logoen ikke finnes; `test/logos.test.js` | Klientene viser bokstavmerket som før |
| E-B10 | Fanetittelen fulgte ikke Innstillinger | Rettet | Målt: tittelen var «Homelab» med Innstillinger åpne. `356b9e6`: «Utseende · Innstillinger · Homelab», følger sidebyttene og settes tilbake når de lukkes; `test/e2e51/innstillinger.e2e.mjs` | – |
| E-B11 | «Henter været …» i mocken | Ikke målt | – | Bør sjekkes mot ekte server (som i AUDIT) |
| E-B12 (Q34) | Toasten «Vi ryddet kalenderne» uten handling | Rettet (web) | `3223fbe`: serveren sender `migration.proposed` (hva som ville flyttes) og endrer ingenting; web viser «Slå sammen kalenderne: 6 → 4?», og ryddingen kjøres først ved «Slå sammen» (`POST …/migration`). «Angre» i 30 dager som før. Ingenting å flytte (ny bruker) → de fire med en gang, uten melding. `test/kalender-fire-kalendere.test.js`, `test/e2e51/kalender.e2e.mjs` | iOS- og Kalender-appene viser ikke forslaget ennå (de leser bare `done`); brukerne får det på web |
| E-B13 | Tekstklipping uten tooltip | Rettet (Sporing, Media) | `7759bd9`: `public/js/ui/avkortet.js` gir hele teksten som `title` når pekeren eller fokus kommer til tekst som faktisk er kuttet; `test/e2e51/avkortet.e2e.mjs` | Kvitteringer ligger i Økonomi (`public/finans/`) og er ikke med |
| O1 | «Hjem» betydde tre ting | Rettet (rest-Økonomi patch 07) | Web og appene bruker Oversikt/Smarthjem (Fase 6). Økonomi på mobil-web: fanelinja, Mer, Tilpass og Oversikt-knappen sier Oversikt, pila mot skallet «‹ Homelab»; `test/finans-mobil-navn.test.js`, unntaket i `brukertekst-navn.test.js` er fjernet | «Hjem» står bare igjen som sted (sonen Hjem, Vel fremme) og telefonens Hjem-skjerm |
| O2 | Faste betalinger fire steder | Rettet i Fase 6 (`4d4a9f6`, Q4) | `GET /finans/api/faste-betalinger`; Fase 7 fjernet de siste «Subscription OS»-tekstene | – |
| O3 | Import to steder | Rettet (sjekket i rest-Økonomi) | Én side: Innstillinger → Import. Desktop: `#/imp` → `#/inn/imp` (`desktop.js:1101`), `goto-import` dit (`desktop.js:1375`), e2e `okonomi.e2e.mjs`. Mobil-web: `#/inn/imp` → `imp` (`mobile.js`), pila går til Innstillinger (`mobile-paper.js`) | Raden «Import» i Økonomi → Mer på mobil åpner samme side (snarvei, ikke en kopi) |
| O4 | «Widgets» betydde to ting | Rettet i Fase 6 | «Tilpass Oversikt» (`profile-menu.js:32`), «Enheter og widgets» (`moduler.json`) | – |
| O5 | Kalender-familien spredt | Rettet i Fase 6 (Q5) | Filtrene Familie, Bursdager, Skole i Kalender | – |
| O6 | Gjøremål / Huskeliste | Rettet (rest-Økonomi patch 07) | Web og appene heter Gjøremål. Økonomi på mobil-web: siste brukertekst var navnet på Home Assistant-lista (`mobile-familie-soner.js`), nå «Gjøremål»; `test/finans-mobil-navn.test.js` | Søkeordet «huskeliste» gjenkjennes fortsatt i det brukeren skriver |
| O7 | Kollektiv uten eget hjem på web | Rettet i Fase 6 (Q8) | `#/reise` med Avganger og kart | – |
| O8 | Integrasjoner blandet | Rettet i Fase 6 | `shared/schemas/tilkoblinger.json` | – |
| O9 | Varselgrupper blandet kategori og «Haptikk» | Rettet | `7a5bc03`: gruppene per modul først, så «Levering» med Haptikk som egen bryter. «Test varsel» følger samme standard som bryteren; `test/e2e51/innstillinger.e2e.mjs` | – |
| O10 | Utdaterte stier i Innstillinger-søket | Rettet | `e3abea4`: første ledd i stien kommer fra `innstillinger` i `moduler.json` (`stiFra` i `settings-search.js`); Feature flags viser «Server → System → Mer». Kvalitet og Faste oppgaver er søkbare igjen; `test/e2e51/innstillinger.e2e.mjs` | – |
| O11 | Media: dobbel lukking og skjult lenke | Rettet | Lenken rettet (M8). `2404bb2`: én lukkeknapp, ✕ øverst til høyre (og Esc). Media dekker hele skjermen med egne faner og skjuler appens menyer, som Innstillinger; da er én lukk-handling systemmønsteret (iOS lukk/Ferdig, Material 3). ✕ er den som er valgt i prompt 73 og 89 | – |
| O12 | Mobil «Mer» startet med eksterne lenker | Rettet i Fase 6 | `public/js/net.js:14–16` (modulene først) | – |
| O13 | Økonomi på mobil var et eget Homelab-skall | Rettet i Fase 6 (`3886e29`, Q3) | – | – |
| O14 | Ulike undersider per plattform | Delvis (målt) | Målt mot `moduler.json` (navnene i koden per plattform): Familie 5/5 på web, iOS og Android. Reise 2/2 overalt. Kalender: web 6/6 visninger og 4/4 filtre; hovedappene på iOS og Android 5/6 (År finnes bare i Kalender-appene). Media: web 6/6; iOS og Android har andre faner (Kommer snart, Sonarr, Radarr, qBittorrent, Prowlarr, NRK, Musikk, Avspilling) og bare «I kveld» med samme navn | Media i appene trenger en avgjørelse: samme fem faner som web (Nå ≈ Avspilling, Bibliotek ≈ Sonarr + Radarr, Nedlastinger ≈ qBittorrent + Prowlarr, Kilder ≈ NRK + Musikk) i Fase 4/5, eller tjenestefaner som bevisst unntak |
| F 4 | Prøveperioder: fire tolkere, mulig dobbeltvarsel | Rettet i Fase 2 | `shared/testvektorer/proveperioder.json`; serveren lager planen | – |
| F 5–7 | Betalt siste 12 mnd, per måned, bolig «brukt» | Rettet i Fase 2–3 (Q21) | `server/finans/subs-log.js:127`, `routes.js:2110–2143`; `7ec4a59`, `dfa11bd` | – |
| F 8 / L7 | To iCal-utvidere | Rettet i Fase 2 | Én utvider `server/kalender/ical.js` | – |
| F 9 / L9 | Helligdager fire steder | Rettet i Fase 2–3 (Q18) | `server/dates/holidays.js`; `2154695` | – |
| F 10 / L8 | Serveradresse fem regler | Rettet i Fase 1–5 | `shared/testvektorer/serveradresse.json`; `server/auth/server-address.js`; Android `:felles` | – |
| F 11 | Bursdager i enhetens tidssone | Rettet i Fase 2 (Q20) | Oslo-dato fra serveren | – |
| F 12 / L10 | Beløpsformat 96 funksjoner | Gjenstår (lav) | Presentasjon, lokalt | Personvernmodus i widgeter ikke verifisert |
| L12 | Vær hentet direkte fra Open-Meteo på iOS | Rettet (Android `178b3cd`, runde3-android `d5de2bb`, `7679844`) | iOS henter ikke lenger direkte. Android: «været i X» og sol/dagslys slår opp stedet via `/api/weather/place` og `/api/weather/places?q=`, og skiføret i Nordmarka kommer fra det nye `GET /api/weather/ski` (`server/vaer/layout.js`: innlogging, fast offentlig adresse uten parametre fra klienten, bufret 15 min, ingen nøkler, 502 når Open-Meteo ikke svarer; `docs/api.md`). `test/vaer-skifore.test.js`; `test/android-opprydding.test.js` «L12» sjekker at ingen Kotlin-fil i app eller Kalender nevner `api.open-meteo.com` | Smøreråd (`skiAdvice41`) regnes fortsatt i appen fra serverdataene; serveren har samme regler i `ski41` (kan flyttes i en egen runde) |
| Q19 | 404-reserver for eldre servere | Delvis | `/api/version` med `minClient` (`45ee66d`), iOS `APIClient.compatibility`. Android runde3: Mat (`/folders` ved siden av `/week`, `0fccbdd`), kvitteringsskann og opplastingskøen (omvei til `/receipts`), kopi i kalenderen (lokal kopi), «Kjøp gave» (gjøremål med frist fra telefonen) (`f3782ac`), oppstartssiden («404 = kjører») og flaggene (`f0e4212`), Kalender-innloggingen (vanlig app-token med alle tilganger, og omveien rundt device-exchange) (`b2d4715`). `test/android-opprydding.test.js` «Q19» sjekker også at serveren har rutene | Igjen i appene: meldinger av typen «Oppdater Homelab» ved 404 (beholdt, de forklarer bare), `QrInnlogging.kt` (`/auth/qr` ved siden av `/auth/qr/session`), `SmbModel.kt` (`/browse`), `Api.login` (`/auth/token`), `Profiler.kt` `try404` og iOS (`MediaModel.swift:530–748` m.fl.). Angre i Rask time (`RaskTime.kt`) sletter hendelsen når jobben er ukjent (404 betyr der «fant ikke jobben», ikke gammel server) og er beholdt med vilje |
| Q26 | Den gamle kalenderen i iOS-appen | Rettet (rest-ios-kalender) | Det den innebygde Kalenderen manglet, ligger nå i den delte Kalender-koden: lærer, fag, merknad, gjentakelse og MazeMap i detaljarket, «Kopier til Personlig», «Lær Glimt hva dette er…» (`9180aed`), Gjenta, Merknad og «Beskriv med Glimt» i Ny hendelse (`0ecbc29`), Oversikt med Nå-kort, «Prøver og frister» med nedtelling og kort som flyttes/skjules i `kalOrder`/`kalHidden` (`9510419`). Dataene andre deler av Homelab trenger, er en tynn fasade (`KalenderData`, `7a5d088`), og `HomelabKalender*.swift` er slettet med en sjekkliste per funksjon i `64c57bf`. Alle innganger går til Kalender; «Kalender i appen» av = Kalender-appen når den er installert, ellers den innebygde (`a502e59`). `test/ios-kalender.test.js` | `Cal26`/`CalEvent26` (`Shared/CalendarShared.swift`) er fortsatt widget- og datalaget i Homelab-målet, fordi widget-målet ikke har `SharedKal`. Bygget i CI, ikke prøvd på enhet |
| Q30 | Gamle `receipts`-data | Rettet (rest-server), venter på admin | `server/finans/receipt-migration.js`: forhåndsvisning, bekreftelse, kopi av databasen, angring. Knapp i Økonomi → Innstillinger → Backup og data («Flytt gamle kvitteringer»); `test/kvittering-flytting.test.js` | Flyttingen kjøres aldri av seg selv. `/api/receipts` virker som før (lista beholdes) |
| Q31 | Widgeter fra én definisjon per widget | Rettet (`619dd9e`) | `apps/android/app/widgets.json` → `npm run widgets` genererer `<receiver>`-blokken og `widget/WidgetKatalog.kt` (galleriet, Samsung-påslåingen); `npm run widgets:check`; `test/android-opprydding.test.js` «Q31» | Variantene har fortsatt egne Kotlin-klasser og layouter (samme klassenavn så plasserte widgets virker). `widgets:check` er ikke lagt i CI-jobben |
| Q1–Q18, Q20–Q25, Q27–Q29, Q32, Q33, Q35–Q41 | Beslutningene | Gjennomført | Fase 1–6 (se commitene), testvektorene og `test/moduler*.test.js` | Q1/O1: de siste restene i Økonomi på mobil-web er rettet (se O1, O6) |
| Struktur: filnavn | Filer med promptnummer | Delvis | §2.1: server 1, web-CSS 0, iOS 5, web-JS 34 → 2, Android 70, test 195 → 31 av 285 (rest-tester). Rest-Økonomi (patch 02–06): de 32 `mobile-p16…p46.js`/`mobile-paper2/3.js` har fått navn etter funksjon (f.eks. `mobile-gjoremal.js`, `mobile-glimt.js`, `mobile-tilpassing.js`), én patch per familie; `test/finans-mobil-filer.test.js` sjekker importer og SHELL | Filene er omdøpt, ikke slått sammen: hver dekker flere funksjoner og importerer hverandre i ring (TDZ), så sammenslåing/oppdeling krever en egen runde med nettlesertester. Testene (rest-tester): 164 av 195 testfiler med promptnummer er ryddet (161 har fått navn etter domene og funksjon, 3 er slått sammen) (`ai-`, `glimt-`, `chat-`, `media-`, `finans-`/`kvittering-`/`logo-`, `kalender-`, `sporing-`/`reise-`/`bakgrunn-`, `skjold-`, `updater-`/`smb-`/`drift-`, `sikkerhet-`, `web-`/`innstillinger-`), én commit per domene med `git mv`; `p71-clock` → `glimt-datoer`, `p83-skjscroll` → `skjold-web` og `p85-compress` → `http-compress` er slått sammen; hjelpefilene heter `ollama-sim.js` og `openwebui-sim.js`. 3194 tester før og etter. Igjen: Android (`Paper14–19`, `Models11–17`, `…51Plat` m.fl.) og de 31 iOS-/Android-testene (`p70-andhome` … `p89-ios`). De store samlefilene (f.eks. `glimt-assist-og-oppdatering`, `felles-api-innlogging-og-hjemlys`) dekker flere domener og bør deles i en egen runde. Mappene `test/e2e51`, `ui51`, `a11y51` og `visual51` har fortsatt nummer (CLAUDE.md, CI og npm-skriptene peker dit) |
| Struktur: iOS | `Store` på 1 686 linjer, Swift 5.10, `.searchable` 0 | Delvis (rest-ios) | Mønsteret for oppdelingen: `DomenerModell.swift` (`@MainActor @Observable`), eid av Store med videresendende egenskaper, injisert med `.homelabMiljo(store)` (`HomelabMiljo.swift`) alle 43 steder Store settes i miljøet, lest med `@Environment(DomenerModell.self)` i `PaperDomains`; `test/ios-opprydding.test.js`. Swift 6: `SWIFT_STRICT_CONCURRENCY: complete` på klokka (`HomelabWatch`), bare advarsler i Swift 5-modus | Igjen: de andre domenene i Store (Finans, Mat, Boliger, Finn, Sporing, Papir-tilstand, innlogging) etter samme mønster, ett per steg. Swift 6-modus mangler: 258 `static let shared` på ikke-`Sendable` typer, 18 `nonisolated(unsafe)`, 54 filer med `static var` (globalt muterbart), `[String: Any]`-JSON over aktørgrenser, og advarslene CI-loggen viser for klokka. Slå på `SWIFT_VERSION: 6` mål for mål når CI er uten advarsler |
| Struktur: Android | `AppViewModel` på 3 855 linjer, egen navigasjon, gamle versjoner | Delvis (rest-android-arkitektur, runde3-android) | Mønsteret for ViewModel per skjerm: `skjerm/<Side>ViewModel.kt` (én `StateFlow`, `SavedStateHandle` der det trengs) og `repository/<Side>Repository.kt` (nettet, JSON på `Dispatchers.Default`). Flyttet: Domener, Nyheter (`a07ecff`, kategorien overlever prosessdød), Sporing (`89e4db2`, arkivet tømmes nå også ved utlogging) og Mat (`0fccbdd`, skannekøen følges i ViewModel-en). AppViewModel har bare videresendinger for disse, og et speil i Compose-tilstand holder sider som ikke er flyttet oppdatert; om en side er åpen, valgt rad og filter er navigasjon og blir i AppViewModel. Tilbakestabelen fra `:felles` med `PredictiveBackHandler` også i Kalender-appen. Versjonsplanen står i `gradle/libs.versions.toml`; `test/android-arkitektur.test.js` (én test per side) | `AppViewModel.kt` 3 957 linjer (4 013 før runde3). Vær er ikke flyttet (størst, mange felt brukt fra Glimt, Hjem og widgetene; egen runde), heller ikke kallene i `domene/Sporing.kt` og `domene/Nyheter.kt` (nøkler, transportør, egne kategorier). Navigation Compose er bevisst ikke tatt inn (tilstandsstyrte lag, ingen kompilator her); ca. 45 lokale `BackHandler` i Homelab-appen går utenom stabelen. AGP 8.7.3 er siste patch i 8.7; Kotlin 2.1.2x og compileSdk 36 krever en egen runde med CI. R8 er av med vilje |
| Tester: midlertidige mapper | `npm test` etterlot mappene sine i `/tmp` (23 GB etter en dag, updater-testene feilet på `low_disk`) | Rettet (rest-tmp) | `test/lib/midlertidig.mjs` lastes med `--import` av `npm test` og `test:e2e`: hver testprosess får en egen mappe i TMPDIR, alt i `tmpdir()` havner der (også serverne testene starter), og mappa slettes når prosessen avslutter, altså etter at testfila er ferdig. `lagMidlertidig(prefiks)` for nye tester. E2E-serveren og `kontrakt-eksempler.mjs` sletter `DATA_DIR`. Målt med egen TMPDIR, én hel `npm test`: før **276 mapper, 366 MB**; etter **0** (3214 av 3214 grønne). `npm run test:e2e`: 26 av 26, 0 igjen. `test/midlertidige-mapper.test.js` kjører et utvalg som lekket (17 mapper før) og krever tom TMPDIR (`9baa932`, `9b2f917`) | Igjen ligger bare `node-compile-cache` (516 KB), som npm selv lager og gjenbruker. En testløper som blir avbrutt med Ctrl-C eller `SIGKILL`, rydder ikke (én mappe `hl-test-<pid>-*`). De 196 testfilene er ikke skrevet om hver for seg; hjelperen dekker dem samlet |

## 5. Sikkerhetsreglene i CLAUDE.md, sjekket mot koden

Hver regel er sjekket med grep og lesing av koden på denne grenen (16.11.2026).

| Regel | Resultat | Bevis |
|---|---|---|
| Pålitelig enhet: enhetscookie **og** lokal adresse, aldri `X-Forwarded-For` | OK | `server/auth/session.js:428–437` (`trustedDevice` bruker `trustIp`); `trustIp` (`:385–392`) bruker `CF-Connecting-IP` bare når tilkoblingen kommer fra lokalt nett/Docker. `X-Forwarded-For` brukes bare i `clientIp` (rate limiting og logg, `:255–259`) og bare bak en lokal proxy. Merk: `isLan` godtar også 127/8, `::1`, IPv6 ULA og link-local, ikke bare de tre IPv4-områdene i CLAUDE.md (uendret siden før Fase 0) |
| Passord fra internett (og 2FA) | OK | Samme sted; `test/sikkerhet-foresporselskropp.test.js`, `test/auth*.test.js` |
| Alt per bruker, unntatt Boliger og Matplan | OK | `test/isolation.test.js` (9 tester, ny i Fase 7: karakterenes rekkefølge per bruker), `test/iso2-*.test.js` |
| Serverinfrastruktur, AI-nøkler og backup bare for admin | OK | `test/sikkerhet-foresporselskropp.test.js`, `test/system-ruter.test.js` |
| Serveren sender aldri repo, branch, sha eller kommandoer til updateren | OK | `server/system/update.js:628–640, 765–770`: forespørselen er bare `{id, requestedBy, at, action?, target?, restoreBackup?}` |
| Ollama (11434) eksponeres aldri | OK | Ingen port 11434 i `docker-compose.yml` eller `Dockerfile`. Bare som adresse til en ekstern Ollama i Unraid-malen (`deploy/unraid/homelab-os.xml:48`) |
| Docker-proxyen utvides ikke, containeren får aldri socketen | OK | `docker-compose.yml` er uendret siden `9170678`. `os` har ingen `docker.sock`; bare `updater` og `homelab-docker` (socket-proxy, `:ro`) har den |
| API-nøkler logges aldri og sendes aldri til frontend | OK, med merknad | `server/auth/log-guard.js` maskerer kjente nøkler og tokens i all konsollutskrift; `media/middleware.js` logger stien uten spørrestreng. Merknad: feilsøkingen for PostNord (bare admin) viser `x-bap-key` i en curl-linje (`server/sporing/aliexpress-debug.js:118`). Det er PostNords offentlige nettsidenøkkel, men bør maskeres |
| Alle AI-kall via `server/ai/gate.js` / `server/ai/run.js` | OK | Ollama-kall går via `gateChat`/`gatePost`/`gateEmbed`; skykallene (Gemini, Groq, OpenAI-stemme) går via `ai/run.js` sin ruting og budsjett (`finans/ai.js:6–8`, `logo-lookup.js:37`, `glimt/settings.js:37`) |
| Finansdata forlater aldri huset | OK, uendret | Ingen nye utgående kall med finansdata i Fase 0–7. Sky-reserven for kvitteringstolking (Gemini/Groq) finnes fra før og styres i AI-kontroll |
| QR-innlogging bærer aldri token | OK | `server/auth/qr-login.js:4–24`: QR-en har bare `sid.nonce`; `clientKey` står aldri i QR-en |
| Ikke omgå 403/bot-blokkering med falske nettleser-headere | OK (rettet i Fase 7) | PostNord-profilen «browser» (Safari-UA, `Origin` og `Referer` for postnord.no) er fjernet fra `server/sporing/carriers.js`. PostNord får bare de åpne HA-headerne, og 401/403 gir backoff. Testene er `test/sporing-posten-postnord.test.js` og `test/ingen-falsk-nettleser.test.js` (ingen nettleser-UA i `server/`). De andre `Mozilla/5.0 (…)`-UA-ene sier at de er Homelab |
| iOS-tokens i Nøkkelringen (`ThisDeviceOnly`), aldri `UserDefaults` | OK | `apps/ios/SharedKeychain/Nokkelring.swift:19`; ingen token-nøkler i `UserDefaults` (grep); `test/sikkerhet-ios-nokkelring.test.js` |
| Ingen signeringsnøkler eller hemmeligheter i repoet | OK, med merknad | Ingen `.jks`, `.keystore`, `.p12`, `.pem`, `.env` i git; mønstersøk (`AIza…`, `sk-…`, `ghp_…`, `AKIA…`, private nøkler) gir bare testverdier og en PEM-mal i `server/apns.js:39`. Merknad: transportørverdiene i `server/sporing/carrier-apps.js` (Q22, bevisst). Fase 7 fjernet en tilfeldig webhook-hemmelighet som lå i `shared/schemas/eksempler/media-status.json` |
| Ingen modell-identifikatorer i kode, kommentarer eller commit-meldinger | OK | Ingen treff på `claude-…`-identifikatorer i kode, dokumentasjon eller commit-meldinger. Navnene på modellene Homelab bruker (Gemini, Ollama, OpenAI-stemme), er konfigurasjon og funksjon, ikke berørt av regelen |
| RSS, artikler og iCal bare fra offentlige adresser | OK | `guardedFetch86` i `server/nyheter/rss.js:251` og iCal-hentingen; `test/p86*.test.js` |
| Token i URL (`/api/ws?token=`) | OK etter Fase 7 | iOS og Mac sender header (Fase 4), Android sender header (Fase 7). Serveren godtar fortsatt `?token=` for eldre apper (`server/index.js:657–663`) |

## 6. Fase 7: hva som ble rettet her

Små feil som var klart feil og trygge å rette, hver med test:

| Steg | Hva | Test |
|---|---|---|
| 1 | `npm run kontrakt:eksempler` ga nye filer hver gang (klokke, vær, tilfeldig webhook-hemmelighet og token-id-er). Nå fast klokke (16.11.2026 kl. 09:00) og faste tekster for tilfeldige verdier; to kjøringer gir like filer | `test/kontrakt-eksempler.test.js`, Android `KontraktTest.kt` |
| 2 | A-B6: `sort` for karakterer per bruker | `test/isolation.test.js` |
| 3 | A-B7: nedstengingen lukker `/api/ws` i stedet for å vente 5 s | `test/realtime-stopp.test.js` (ny) |
| 4 | M1-rest: e-postimporten og oppetidssjekken via den felles planleggeren (ikke i test eller sandkasse) | `test/kontrakt-server.test.js`, `innhold-ruter`, `okonomi-ruter` |
| 5 | Android sender tokenet til `/api/ws` i headeren, ikke i adressen | `test/android-fundament.test.js` |
| 6 | A-B5: iOS-widgetens «Pause alt»/«Fortsett» uten 404 først | `test/ios-moduler.test.js` |
| 7 | Skjermbildene før og etter (`skjermbilder/`) | – |
| 8 | Media-webhook: tokenet sammenlignes i konstant tid | `test/media-ruter.test.js` |
| 9 | De siste «Subscription OS»-tekstene på web blir «Faste betalinger» (Q4, Q7) | `test/moduler-web.test.js` |
| 10 | E-B7: «Lagre» i e-postimporten i Økonomi var 1,99:1 i Papir lys | `test/finans-tema.test.js` |
| 11 | Denne statusen og `ytelse-etter.json` | – |

Ingen funksjoner er fjernet. Swift- og Kotlin-endringene (steg 1, 5 og 6) er små og bare sjekket med kildetester her; de bygges i CI-jobben «Mobilapper».

## Det viktigste som gjenstår

Sortert etter hva som gir mest for brukeren:

1. **Kontrast** (M9, B-F6, B-F11, E-B8): 141 kontrastbrudd i `npm run a11y`, mest Integrasjoner i Papir mørk og Glass (2,8–3,0:1), Mat i Glass og Abonnementer/Faste betalinger i Papir lys. Én runde med tokens for svak tekst, styrt av rapporten.
2. **CLS på Skjold Lab** (M5): 0,49 / 0,57. Finn elementet som flytter seg og gi det fast plass.
3. **Nettleser-headere (rettet i Fase 7):** PostNord-profilen «browser» brøt regelen og er fjernet. Blokkerer PostNord de åpne headerne, viser sporingen «PostNord svarer ikke akkurat nå» til backoffen er over (maks 1 t). Med egen PostNord-nøkkel brukes det offisielle API-et.
4. ~~**Gamle navn og filer i Økonomi på mobil-web**~~: gjort i rest-Økonomi (filnavn, O1, O6). Igjen: dele de store filene etter funksjon (se «Struktur: filnavn»).
5. **iOS-arkitektur** (AUDIT §6, Fase 4-målene): `Store` (1 720 linjer) delt per domene, Swift 6 med streng samtidighet, `.searchable`, `@ScaledMetric`, færre `static let shared` (258).
6. **Android-arkitektur** (AUDIT §7, Fase 5-målene): Navigation Compose og `NavigationSuiteScaffold`, ViewModel per skjerm med `SavedStateHandle`, `AppViewModel` (3 949 linjer) delt opp, AGP/Kotlin/SDK oppgradert, R8 og baseline-profil, widgeter med `goAsync` (P85 H) og fra én definisjon (Q31). 70 Kotlin-filer har fortsatt nummer.
7. **404-reserver i appene** (Q19): ca. 48 steder prøver gamle stier eller gjør det lokalt når serveren svarer 404. Kan fjernes modul for modul nå som `/api/version` sier fra om for gammel server.
8. **Beslutninger som venter på data eller godkjenning**: gamle `receipts` til Økonomi (Q30). Den gamle kalenderen i iOS-appen (Q26) og kalenderryddingen som forslag i appene (Q34, E-B12) er gjort i rest-ios-kalender.
9. **Lave funn**: `/api/ready` (A-B9), `/api/discovery` uten innlogging (A §5), «sebastian» for bibelvers, Wikimedia direkte fra nettleseren (B-B10), `KalNet` med `try?` (C-B3), dobbel `innst-`-ruting på iOS (C-B5), hardkodet lokal adresse (C-S4/D-B5), Innstillinger-søkets stier (O10), Haptikk som varselgruppe (O9), Import to steder (O3), logo-404 (E-B9), duplikat ved ny kvitteringsopplasting (P85 G).
10. ~~**Testfilene**~~: gjort i rest-tester for server og web (195 → 31 med promptnummer). Igjen: de 31 iOS- og Android-testene (`p70-andhome` … `p89-ios`), som ble endret parallelt i rest-ios/rest-android.
11. **Visuelle referanser**: 41 av 266 er utdaterte, men under terskelen på 1 % (bl.a. den gamle toppmenyen i Glass). Forslag: se gjennom `test/visual51/out/report.html`, kjør `npm run test:visual -- --update` og vurder en lavere terskel for toppmenyen, så en regresjon der ikke skjules.
