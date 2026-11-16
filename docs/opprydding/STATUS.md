# Opprydding – status etter Fase 7 (verifisering)

Dato: 16.11.2026 · Gren: `opprydding/fase-7-verifisering` · Grunnlag: `main` `ba4542f` (Fase 0–6)

Dette dokumentet går gjennom alle funnene i [AUDIT.md](AUDIT.md) og detaljrapportene i [`detaljer/`](detaljer/) og sjekker dem mot koden slik den er nå. Hvert funn har status, bevis (fil, test eller commit) og, for det som gjenstår, en kort begrunnelse og et forslag. Tallene før og etter, testresultatene og skjermbildene står først.

**Kort fortalt:** begge kritiske funn (K1, K2) og alle fem høye (H1–H5) er rettet. Av de 19 middels er 16 rettet og 3 delvis (M5 CLS på Skjold Lab, M9 kontrast, M17 transportørverdiene etter Q22). Buglisten i §4 har 107 rader: 61 rettet, 16 delvis, 25 gjenstår, 3 ikke målt og 2 som ikke er feil. Fase 7 rettet 9 små feil, hver med test (§6). Alle testene er grønne. Det som gjenstår, er i hovedsak de store arkitekturgrepene på mobil (`Store` på iOS, `AppViewModel` på Android, Navigation Compose, Swift 6), filnavn med nummer i Økonomi på mobil-web, Android og testene, noen kontrastfeil og en håndfull lave funn. Se [Det viktigste som gjenstår](#det-viktigste-som-gjenstår).

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
| `!important` i CSS | 1 218 | 1 218 | **1 188** | 861 i `finans/css/mobile.css` (før 914). Skallet og sidene: 327 (før 304, etter omfordeling), alle med begrunnelse (`dd62b01`, `8243021`) |
| Unike `font-size` / `border-radius` (px) i CSS | 75 / 127 | 73 / 64 | **72 / 63** | Annen telling enn AUDIT (bare px-verdier). Typografi og radier er i tokens, men gamle regler står igjen |
| JS-filer på web med nummer | flertallet | 189 av 302 | **32 av 316** | Alle 32 er Økonomi på mobil (`public/finans/js/mobile-p16…p46.js`, `mobile-paper2/3.js`). Skallet og sidene: 0 |
| Statiske importer i `app.js` | 45 | 45 | **27** | Rutene lastes ved behov (`b7501e0`) |
| JS-moduler per rute | 179–191 | 179–191 | **100–112** | Fra `test:perf` |
| Serverfiler med nummer | 276 av 371 | 276 av 371 (sti) | **1 av 418** | Igjen: `server/mai17-41.js`. Ingen mapper med nummer (før 16) |
| `server/index.js` | 1 017 linjer | 1 017 | **668** | – |
| `db.prepare(` i serveren | 513 | 513 | **387** | Resten bruker `q(sql)` med cache (`3f27b6f`) |
| «I dag» i UTC (`toISOString().slice(0, 10)`) | 63 | 71 | **53** | Alle 53 er datoaritmetikk på rene datoer (se H5) |
| Swift-filer med nummer | 493 av 568 | 493 av 568 | **5 av 532** | `Cal70Card`, `FamCal51`, `Playback44`, `Calendar26WidgetViews`, `Calendar26Shared` |
| Kotlin-filer med nummer | 298 av 344 | 298 av 344 | **70 av 367** | Bl.a. `Paper14–19.kt`, `Models11–17.kt`, `…51Plat.kt`, `Brief34Widgets.kt` |
| Filer med nummer utenfor `test/` (server, public, apps) | 892 | 1 202 (alle typer) | **111** | – |
| Testfiler med nummer | – | – | **195 av 275** | `test/p22.test.js` … ikke omdøpt |
| iOS: unike hex (uten generert) / filer med hex | 700 / 277 | 788 / 296 | **757 / 256** | Fargene går mest via `DS`-tokens nå, men hex-verdiene står igjen i bl.a. `GlimtFigures.swift` og `WeatherSheets.swift` |
| iOS: `ObservableObject` / `URLSession.shared` | 15 / 40 filer | 13 / 45 | **0 / 2** | – |
| iOS: `id: \.offset` / `DateFormatter()` / `nonisolated(unsafe)` | 165 / ~50 / 17 | 165 / 95 / 17 | **162 / 71 / 18** | Lite endret |
| iOS: `.system(size:)` | 645 | 645 | **482** | Dynamic Type via `relativeTo:` (4 → 13) |
| iOS: `NavigationStack` / `NavigationSplitView` / `ContentUnavailableView` | – | 3 / 0 / 0 | **12 / 13 / 6** | – |
| iOS: `Store.swift` | 1 686 linjer | 1 686 | **1 720** | Ikke delt opp |
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
| **M5** (B-B4) | Temaet hoppet ved første besøk (CLS) | Delvis | Temabyttet rettet i Fase 3 (`31d0c2b`): CLS Oversikt 0,44 → 0,11, Media 0,36 → 0,05, Kalender 0,36 → 0,05 på desktop (§2.2) | Skjold Lab har fortsatt CLS 0,49 (desktop) og 0,57 (mobil), med en annen årsak enn temaet. Forslag: finn elementet med `layout-shift`-sporing (`perf.mjs` kan logge `sources`) og gi det fast høyde |
| **M6** (B-B5) | Økonomi mobil: ~1 s tvungne layouter | Rettet i Fase 3 (`121014c`, `78826da`, `9760576`) | `test:perf` mobil Økonomi: tvungne layouter 115 / 883 ms → 5 / 18 ms, lange oppgaver 1 604 → 254 ms, LCP 4,8 → 2,3 s | – |
| **M7** (B-B2) | Toppmenyen brakk over to linjer i Glass | Rettet i Fase 3 (`f80c7d7`) | `test/e2e51/toppmeny.e2e.mjs` («én linje») | – |
| **M8** (E-B2) | «Hva skal vi se i kveld?» under «‹ Tilbake» | Rettet i Fase 3 (`986615c`) | Visuell referanse `media-*` | – |
| **M9** (E-B3, E-B4, B-F4–F6) | Kontrastfeil (Integrasjoner, Domener, Glimt-pille, Mat, avatar) | Delvis | Domener 0 kontrastbrudd, avataren rettet (`903a251`), Mat i Papir mørk mørkt dagskort (`01fce01`). `npm run a11y`: 141 kontrastbrudd i alt (339 i AUDIT, annen metode) | Integrasjoner i Papir mørk og Glass: «Mangler …» 2,79–3,02:1 (`.sg-v` med `--ds-warning`). Mat i Glass/mørk 3,85–4,39:1, Faste betalinger og Abonnementer 3,5–4,4:1. Forslag: én runde med tokenet for svak tekst mot kortflaten, styrt av a11y-rapporten |
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
| A-B9 | `starting.js` spør `/api/ready`, som ikke finnes | Gjenstår (lav) | `public/js/starting.js:43` | Faller tilbake til `/api/health`, så det er bare én 404 per omstart. Forslag: `GET /api/ready` → `{ok, version}` i `server/system/`, eller fjern kallet |
| A §5 | `/api/discovery` viser lokal adresse uten innlogging | Gjenstår (lav) | `server/auth/app-login.js:117` | Brukes av appene ved oppsett. Forslag: lokal adresse bare til klienter på lokalt nett |
| A §5 | Media-webhook: token sammenlignet med `!==` | Rettet i Fase 7 | `server/media/arr.js` (`timingSafeEqual`); `test/media-ruter.test.js` | Kall uten token godtas fortsatt direkte fra LAN (bevisst) |
| A §5 | Brukernavnet «sebastian» hardkodet for bibelvers | Gjenstår (lav) | `server/bibel/bible.js:63,71` | Forslag: på som standard for eieren (`OWNER`/admin), ikke for et brukernavn |
| B-B6 | `scrollmem` dro scrollen tilbake | Rettet i Fase 3 (`121014c`) | `public/js/scrollmem.js:17–33` (ResizeObserver, brukerinput avbryter) | – |
| B-B7 | Polling på alle ruter | Rettet i Fase 3 (`b7501e0`) | Periodisk henting bare der det vises | API-kall ved første lasting er nesten uendret (Oversikt 76 → 75, Kalender 59 → 56). Forslag: én samlet startforespørsel for skallet |
| B-B8 | Død `family.css`/`family.js` | Rettet i Fase 3 (`1e58f67`) | `family.css` er borte; `family.js` er nå Familie-modulen (`family-web.js` importerer den) | – |
| B-B9 | Leaflet-reserve fra unpkg blokkert av CSP | Rettet i Fase 3 (`4faa033`) | `public/finans/js/leaflet.js` (bare fra serveren) | – |
| B-B10 | 20 Wikimedia-kall uten nett ved oppstart | Gjenstår (lav) | `public/js/bgsvc.js:121–150` henter bakgrunnene direkte fra commons.wikimedia.org | Forslag: bruk serverens bildebuffer (`server/background.js` laster dem allerede ned) |
| B-B11 | Onboardingen i mobil-Økonomi blokkerte dype lenker | Rettet i Fase 3 (`4cf5996`, Q35) | – | – |
| B-F2 | Familie, Kalender, Media lyst papir i Glass | Rettet i Fase 3 (`21df0a7`, Q14) | Skjermbilder `familie-*-glass`, `kalender-*-glass` | – |
| B-F3 | Dashbordkortene fikk Papir-farge i Glass | Rettet i Fase 3 | Skjermbilde `oversikt-1440-glass` | – |
| B-F5 | Aksentrød tekst på mørk flate | Rettet i Fase 3 (`905ed2a`) | a11y: Bursdager 0 kontrastbrudd | Chat er ikke med i a11y-sidene |
| B-F6 | Økonomi desktop: svak tekst, avatar 1,26:1 | Rettet i Fase 3 (`65360a3`, `21a312d`, `903a251`) | a11y `finans-oversikt` Papir lys 0 | Papir mørk: 4 brudd (3,77–4,36:1) i «Trenger gjennomgang» |
| B-F7 | Smarthjem undertekst 3,1–3,5:1 | Rettet i Fase 3 | a11y `smarthjem` 0 kontrastbrudd | – |
| B-F8 | Skjold Lab initialmerker | Rettet i Fase 3 (`8c65439`) | a11y `skjold` 0 kontrastbrudd | – |
| B-F9 | Innstillinger → Utseende seksjonstitler | Rettet i Fase 3 | a11y `innst-utseende` 0 kontrastbrudd | – |
| B-F10 | Mediakveld «I kveld»-knappen | Rettet i Fase 3 (`986615c`) | Tokens i `pages/media.css` | Mediakveld er ikke med i a11y-sidene |
| B-F11 | Mat «Fast» 3,65:1 | Delvis | `01fce01` | Papir lys rettet; i Glass 3,96:1 (se M9) |
| C-S2 | Token i `/api/ws?token=` (iOS/Mac) | Rettet i Fase 4; Android i Fase 7 | `PaperAppSettings.swift:520`, `MacSystem.swift:28`; Android `Realtime.kt` (header); `test/android-fundament.test.js` | – |
| C-S3 | Nøkkelring uten `ThisDeviceOnly` | Rettet i Fase 0b/4 | `Nokkelring.swift:19` | – |
| C-S4 | Standard lokal adresse `http://10.69.1.39:3000` | Gjenstår (info) | `apps/ios/project.yml:169,278`; Android `Regel89.kt:13`, `Serveradresse.kt:80`, `kalender/Innlogging.kt:58` (D-B5, P85 B) | Gjelder bare denne husstanden. Forslag: ingen standard, bare oppdagelse (`/api/discovery`, QR) |
| C-B2 | Tvunget mørk systemstil | Rettet i Fase 4 (Q16) | `project.yml:84`, `PaperTheme.swift:102` | – |
| C-B3 | `KalNet` sender tom kropp stille ved kodefeil | Gjenstår (lav) | `SharedKal/Core/KalNet.swift:84` (`try?`) | Forslag: `throw` i stedet for `try?` |
| C-B4 | Ubegrenset bildecache for skyer | Ingen feil | `WeatherEffects.swift:191`: nøkkelen er værtypen (noen få), så den vokser ikke | – |
| C-B5 | `innst-…`-rutingen duplisert (iPhone og iPad) | Gjenstår (lav) | `Paper.swift:856–861` og `SettingsWide.swift:331–335` | Forslag: én funksjon `innstSide(id)` som begge bruker |
| D-B4 | `EncryptedSharedPreferences` uten `try/catch` | Rettet i Fase 5 (`3cf75f1`) | `felles-android/…/SikkerLagring.kt` | – |
| D-B5 (P85 B) | Hardkodet lokal adresse, klartekst bare til én IP | Delvis | Klartekst er nå tillatt til alle lokale adresser (`LokaltNett.kt`) | Standardadressen er fortsatt hardkodet (se C-S4) |
| D-B6 | `ALLOW_ALL_HOSTS_VALIDATOR` i debug | Ingen feil | `Car51Plat.kt:42–45`: `FLAG_DEBUGGABLE` settes av byggtypen | – |
| P85 C | Tilstandsendrende dyplenker uten bekreftelse | Rettet før Fase 0 | `LinkRegel86.kt` | – |
| P85 E | Trykkflater, ikoner uten beskrivelse | Delvis | `08e8c8c`, `c29a40f`, `df8cf60` (48 dp, ikoner) | Ikke hele appen; må ses på enhet |
| P85 F | Ingen `SavedStateHandle` (prosessdød) | Gjenstår | 0 treff | Del av ViewModel per skjerm (AUDIT §7 nr. 12) |
| P85 G | Mulig duplikat ved ny opplasting av kvittering | Gjenstår (lav) | Ingen idempotensnøkkel på serveren | Forslag: `Idempotency-Key` på `POST /finans/api/receipts` |
| P85 H | Widgeter oppdaterer i `Thread { runBlocking }` uten `goAsync()` | Gjenstår (lav) | `widget/Brief34Widgets.kt:97`, `BirthdaysWidgets.kt:107`, `TasksWidget.kt:99`, `ProveperiodeWidgets.kt:119` | Virker i praksis; neste synk retter opp. Forslag: `goAsync()` + korutine, eller WorkManager |
| P85 I | «Alt bra» fra varsel uten nett går tapt | Gjenstår (lav) | – | Trenger kø eller feilvarsel (ny funksjon) |
| P85 J | Hjemlys startes ikke etter omstart av telefonen | Gjenstår (lav) | `BOOT_COMPLETED` bare for ntfy | Krever «alltid»-posisjon; eget valg |
| P85 K | Ny hendelse kan forsvinne under synk (Kalender) | Gjenstår (lav, ikke gjenskapt) | `KalRepo.sync` | Ingen datatap |
| P85 L | Forrige brukers Familie-områder blir liggende | Gjenstår (lav, ikke verifisert) | `FamilyPrefs` | – |
| P85 M / D §1 | R8 av | Gjenstår (bevisst) | `isMinifyEnabled = false` i alle moduler | Slå på med baseline-profil når emulatoren er i CI |
| E-B6 | Ikonplassholdere i Snarveier 2,35:1 | Ikke målt | Mobil «Mer» er ikke med i a11y-sidene | Legg til `mer` i `PAGES51` |
| E-B7 | Glass: «Snarveier», «Du har siste versjon», Import «Lagre» 1,99:1 | Rettet i Fase 3 og 7 | a11y `oversikt` Glass 0 kontrastbrudd; «Lagre» rettet i Fase 7 (`--acc-ink`, `test/finans-tema.test.js`) | «Du har siste versjon» (System) er ikke med i a11y-sidene |
| E-B8 | Ticker-farger på Aksjer | Delvis (`65360a3`) | a11y `finans-aksjer` Papir lys: 1 brudd (3,50:1) | – |
| E-B9 | 404 for logoer uten nett, feil sti til app-ikonet | Delvis | App-ikonet rettet (`23f78d1`) | `/finans/api/logo/:domain` svarer fortsatt 404 (bufret en dag). Forslag: 204 eller en reserve-SVG |
| E-B10 | Fanetittelen fulgte ikke Innstillinger | Ikke målt | Titlene kommer fra modullisten (`app.js:166–170`, `f9dc0e1`) | Sjekk med e2e: åpne Innstillinger og les `document.title` |
| E-B11 | «Henter været …» i mocken | Ikke målt | – | Bør sjekkes mot ekte server (som i AUDIT) |
| E-B12 (Q34) | Toasten «Vi ryddet kalenderne» uten handling | Delvis | Ryddingen har «Angre» (`kalender-oppsett.js:512–518`, `four-calendars.js:103`) | Q34 sier forslag *før* rydding («Slå sammen 6 → 4?»). Ryddingen skjer fortsatt automatisk. Forslag: vis forslaget, kjør `migrate` først ved ja |
| E-B13 | Tekstklipping uten tooltip | Gjenstår (lav) | – | Forslag: `title` på avkortede titler i Sporing, Media og Kvitteringer |
| O1 | «Hjem» betydde tre ting | Delvis | Web og appene bruker Oversikt/Smarthjem (Fase 6) | Økonomi på mobil-web har fortsatt «Hjem» og «Huskeliste» i `mobile-paper.js:494` og `mobile-p42.js:51` |
| O2 | Faste betalinger fire steder | Rettet i Fase 6 (`4d4a9f6`, Q4) | `GET /finans/api/faste-betalinger`; Fase 7 fjernet de siste «Subscription OS»-tekstene | – |
| O3 | Import to steder | Gjenstår (lav) | `desktop.js:35` (`imp` aldri i menyen), `goto-import` | Forslag: én plass (Innstillinger → Import), siden `imp` sender dit |
| O4 | «Widgets» betydde to ting | Rettet i Fase 6 | «Tilpass Oversikt» (`profile-menu.js:32`), «Enheter og widgets» (`moduler.json`) | – |
| O5 | Kalender-familien spredt | Rettet i Fase 6 (Q5) | Filtrene Familie, Bursdager, Skole i Kalender | – |
| O6 | Gjøremål / Huskeliste | Delvis | Web og appene heter Gjøremål | «Huskeliste» står fortsatt i Økonomi på mobil-web (`mobile-p42.js`, `mobile-p17.js:349`) |
| O7 | Kollektiv uten eget hjem på web | Rettet i Fase 6 (Q8) | `#/reise` med Avganger og kart | – |
| O8 | Integrasjoner blandet | Rettet i Fase 6 | `shared/schemas/tilkoblinger.json` | – |
| O9 | Varselgrupper blandet kategori og «Haptikk» | Gjenstår (lav) | `settings-notify.js:119` | Forslag: Haptikk som egen bryter under gruppene |
| O10 | Utdaterte stier i Innstillinger-søket | Gjenstår (lav) | `settings-search.js:41,43`, `settings-system.js:231` («System → Mer → Kvalitet») | Forslag: bygg stiene fra modullisten (`innstillinger` i `moduler.json`) |
| O11 | Media: dobbel lukking og skjult lenke | Delvis | Lenken rettet (M8) | Dobbel lukking («‹ Tilbake» og «×») ikke vurdert på nytt |
| O12 | Mobil «Mer» startet med eksterne lenker | Rettet i Fase 6 | `public/js/net.js:14–16` (modulene først) | – |
| O13 | Økonomi på mobil var et eget Homelab-skall | Rettet i Fase 6 (`3886e29`, Q3) | – | – |
| O14 | Ulike undersider per plattform | Delvis | Media «Kalender» heter «Kommer» (`media-side.js:581`); undersidene står i `moduler.json` | Dekningen per plattform er ikke målt |
| F 4 | Prøveperioder: fire tolkere, mulig dobbeltvarsel | Rettet i Fase 2 | `shared/testvektorer/proveperioder.json`; serveren lager planen | – |
| F 5–7 | Betalt siste 12 mnd, per måned, bolig «brukt» | Rettet i Fase 2–3 (Q21) | `server/finans/subs-log.js:127`, `routes.js:2110–2143`; `7ec4a59`, `dfa11bd` | – |
| F 8 / L7 | To iCal-utvidere | Rettet i Fase 2 | Én utvider `server/kalender/ical.js` | – |
| F 9 / L9 | Helligdager fire steder | Rettet i Fase 2–3 (Q18) | `server/dates/holidays.js`; `2154695` | – |
| F 10 / L8 | Serveradresse fem regler | Rettet i Fase 1–5 | `shared/testvektorer/serveradresse.json`; `server/auth/server-address.js`; Android `:felles` | – |
| F 11 | Bursdager i enhetens tidssone | Rettet i Fase 2 (Q20) | Oslo-dato fra serveren | – |
| F 12 / L10 | Beløpsformat 96 funksjoner | Gjenstår (lav) | Presentasjon, lokalt | Personvernmodus i widgeter ikke verifisert |
| L12 | Vær hentet direkte fra Open-Meteo på iOS | Delvis | iOS henter ikke lenger direkte | Android `Glimt.kt:886` slår opp sted direkte hos Open-Meteo. Forslag: via serveren |
| Q19 | 404-reserver for eldre servere | Delvis | `/api/version` med `minClient` (`45ee66d`), iOS `APIClient.compatibility` | Mange reserver står igjen (f.eks. `MediaModel.swift:530–748`, ca. 48 «404 → lokalt»-steder i appene). Forslag: fjern dem modul for modul |
| Q26 | Den gamle kalenderen i iOS-appen | Gjenstår (etter Q26) | `HomelabKalender*.swift` bak `kal84_embed` | Fjernes først når alt finnes i den innebygde Kalenderen |
| Q30 | Gamle `receipts`-data | Gjenstår | `server/finans/legacy-receipts.js:2` («dataene flyttes ikke ennå») | Krever migrering med godkjenning |
| Q31 | Widgeter fra én definisjon per widget | Gjenstår | 83 `<receiver>` i `app/AndroidManifest.xml` | Generering fra én definisjon er ikke gjort |
| Q1–Q18, Q20–Q25, Q27–Q29, Q32, Q33, Q35–Q41 | Beslutningene | Gjennomført | Fase 1–6 (se commitene), testvektorene og `test/moduler*.test.js` | Q1/O1 og Q4: siste rester av gamle navn i Økonomi på mobil-web (se O1, O6) |
| Struktur: filnavn | Filer med promptnummer | Delvis | §2.1: server 1, web-CSS 0, iOS 5, web-JS 34, Android 70, test 195 av 275 | Økonomi på mobil-web (`mobile-p16…p46.js`, 32 filer), Android (`Paper14–19`, `Models11–17`, `…51Plat` m.fl.) og testene. Forslag: egen runde per plattform, som i Fase 3–5 |
| Struktur: iOS | `Store` på 1 686 linjer, Swift 5.10, `.searchable` 0 | Gjenstår | `Store.swift` 1 720 linjer; `project.yml:10` Swift 5.10; 258 `static let shared` | Fase 4 la grunnmuren (APIClient, `NavigationStack`/`SplitView`, Dynamic Type). Oppdeling per domene og Swift 6 gjenstår |
| Struktur: Android | `AppViewModel` på 3 855 linjer, egen navigasjon, gamle versjoner | Gjenstår | `AppViewModel.kt` 3 949 linjer; 0 `NavigationSuiteScaffold`, 0 `SavedStateHandle`; AGP 8.7.3, Kotlin 2.1.0 | Fase 5 la grunnmuren (`:felles`, tema fra tokens, tilbakestabel). Navigation Compose, ViewModel per skjerm og oppgradering gjenstår |

## 5. Sikkerhetsreglene i CLAUDE.md, sjekket mot koden

Hver regel er sjekket med grep og lesing av koden på denne grenen (16.11.2026).

| Regel | Resultat | Bevis |
|---|---|---|
| Pålitelig enhet: enhetscookie **og** lokal adresse, aldri `X-Forwarded-For` | OK | `server/auth/session.js:428–437` (`trustedDevice` bruker `trustIp`); `trustIp` (`:385–392`) bruker `CF-Connecting-IP` bare når tilkoblingen kommer fra lokalt nett/Docker. `X-Forwarded-For` brukes bare i `clientIp` (rate limiting og logg, `:255–259`) og bare bak en lokal proxy. Merk: `isLan` godtar også 127/8, `::1`, IPv6 ULA og link-local, ikke bare de tre IPv4-områdene i CLAUDE.md (uendret siden før Fase 0) |
| Passord fra internett (og 2FA) | OK | Samme sted; `test/p85-srvsec.test.js`, `test/auth*.test.js` |
| Alt per bruker, unntatt Boliger og Matplan | OK | `test/isolation.test.js` (9 tester, ny i Fase 7: karakterenes rekkefølge per bruker), `test/iso2-*.test.js` |
| Serverinfrastruktur, AI-nøkler og backup bare for admin | OK | `test/p85-srvsec.test.js`, `test/system-ruter.test.js` |
| Serveren sender aldri repo, branch, sha eller kommandoer til updateren | OK | `server/system/update.js:628–640, 765–770`: forespørselen er bare `{id, requestedBy, at, action?, target?, restoreBackup?}` |
| Ollama (11434) eksponeres aldri | OK | Ingen port 11434 i `docker-compose.yml` eller `Dockerfile`. Bare som adresse til en ekstern Ollama i Unraid-malen (`deploy/unraid/homelab-os.xml:48`) |
| Docker-proxyen utvides ikke, containeren får aldri socketen | OK | `docker-compose.yml` er uendret siden `9170678`. `os` har ingen `docker.sock`; bare `updater` og `homelab-docker` (socket-proxy, `:ro`) har den |
| API-nøkler logges aldri og sendes aldri til frontend | OK, med merknad | `server/auth/log-guard.js` maskerer kjente nøkler og tokens i all konsollutskrift; `media/middleware.js` logger stien uten spørrestreng. Merknad: feilsøkingen for PostNord (bare admin) viser `x-bap-key` i en curl-linje (`server/sporing/aliexpress-debug.js:118`). Det er PostNords offentlige nettsidenøkkel, men bør maskeres |
| Alle AI-kall via `server/ai/gate.js` / `server/ai/run.js` | OK | Ollama-kall går via `gateChat`/`gatePost`/`gateEmbed`; skykallene (Gemini, Groq, OpenAI-stemme) går via `ai/run.js` sin ruting og budsjett (`finans/ai.js:6–8`, `logo-lookup.js:37`, `glimt/settings.js:37`) |
| Finansdata forlater aldri huset | OK, uendret | Ingen nye utgående kall med finansdata i Fase 0–7. Sky-reserven for kvitteringstolking (Gemini/Groq) finnes fra før og styres i AI-kontroll |
| QR-innlogging bærer aldri token | OK | `server/auth/qr-login.js:4–24`: QR-en har bare `sid.nonce`; `clientKey` står aldri i QR-en |
| Ikke omgå 403/bot-blokkering med falske nettleser-headere | **Avvik** | `server/sporing/carriers.js:268` (`PN_HEADERS42`): PostNord-profilen «browser» sender Safari-UA, `Origin` og `Referer` for postnord.no. Brukes som alternativ profil (`PN_PROFILES46`). Gjenstår: avgjøres av brukeren (fjerne profilen eller bruke den åpne HA-profilen alene). De andre `Mozilla/5.0 (…)`-UA-ene sier ærlig at de er Homelab (`Mozilla/5.0 (homelab-os)` o.l.) |
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
3. **Avvik fra sikkerhetsregelen om nettleser-headere**: PostNord-profilen «browser» (`server/sporing/carriers.js:268`) later som den er Safari på postnord.no. Brukeren må avgjøre om profilen skal bort.
4. **Gamle navn og filer i Økonomi på mobil-web**: 32 `mobile-p*.js` med promptnummer, og «Hjem»/«Huskeliste» står fortsatt i menyene der (O1, O6). Egen runde som Fase 3 gjorde for skallet.
5. **iOS-arkitektur** (AUDIT §6, Fase 4-målene): `Store` (1 720 linjer) delt per domene, Swift 6 med streng samtidighet, `.searchable`, `@ScaledMetric`, færre `static let shared` (258).
6. **Android-arkitektur** (AUDIT §7, Fase 5-målene): Navigation Compose og `NavigationSuiteScaffold`, ViewModel per skjerm med `SavedStateHandle`, `AppViewModel` (3 949 linjer) delt opp, AGP/Kotlin/SDK oppgradert, R8 og baseline-profil, widgeter med `goAsync` (P85 H) og fra én definisjon (Q31). 70 Kotlin-filer har fortsatt nummer.
7. **404-reserver i appene** (Q19): ca. 48 steder prøver gamle stier eller gjør det lokalt når serveren svarer 404. Kan fjernes modul for modul nå som `/api/version` sier fra om for gammel server.
8. **Beslutninger som venter på data eller godkjenning**: gamle `receipts` til Økonomi (Q30), den gamle kalenderen i iOS-appen (Q26), kalenderryddingen som forslag før den kjøres (Q34, E-B12).
9. **Lave funn**: `/api/ready` (A-B9), `/api/discovery` uten innlogging (A §5), «sebastian» for bibelvers, Wikimedia direkte fra nettleseren (B-B10), `KalNet` med `try?` (C-B3), dobbel `innst-`-ruting på iOS (C-B5), hardkodet lokal adresse (C-S4/D-B5), Innstillinger-søkets stier (O10), Haptikk som varselgruppe (O9), Import to steder (O3), logo-404 (E-B9), duplikat ved ny kvitteringsopplasting (P85 G).
10. **Testfilene**: 195 av 275 har promptnummer i navnet (`p22.test.js` …). Kan slås sammen per domene, slik `*-ruter.test.js` allerede er.
11. **Visuelle referanser**: 41 av 266 er utdaterte, men under terskelen på 1 % (bl.a. den gamle toppmenyen i Glass). Forslag: se gjennom `test/visual51/out/report.html`, kjør `npm run test:visual -- --update` og vurder en lavere terskel for toppmenyen, så en regresjon der ikke skjules.
