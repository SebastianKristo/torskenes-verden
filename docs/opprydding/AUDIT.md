# Opprydding og kvalitetsløft – Fase 0: kartlegging

Dato: 14.11.2026 · Gren: `opprydding/fase-0` · Grunnlag: main `9170678` (v4.73.1)

Dette dokumentet er Fase 0. Ingen kode er endret. Alt er bygd på målinger: skript, grep, Playwright mot testserveren (`test/e2e51/server.mjs` med mock-data) og `EXPLAIN QUERY PLAN`. Der noe ikke kunne måles, står det **estimat**. iOS og Android kunne ikke bygges eller profileres her (ingen Xcode, Android SDK eller emulator), så alt om oppførsel under kjøring på mobil er estimat fra kodelesing.

Detaljrapportene med fil:linje, tabeller og kommandoer ligger i [`detaljer/`](detaljer/):

| Del | Rapport | Vedlegg |
|---|---|---|
| A – Server, arkitektur, API, ytelse, sikkerhet | [A-server.md](detaljer/A-server.md) | [A-server-vedlegg.md](detaljer/A-server-vedlegg.md) (alle 1 648 endepunkter med klienter) |
| B – Web/PWA og FinansHub web | [B-web.md](detaljer/B-web.md) | [B-web-vedlegg.md](detaljer/B-web-vedlegg.md) |
| C – iOS, macOS, watchOS | [C-ios.md](detaljer/C-ios.md) | [C-ios-vedlegg.md](detaljer/C-ios-vedlegg.md) |
| D – Android, Kalender, Wear | [D-android.md](detaljer/D-android.md) | [D-android-vedlegg.md](detaljer/D-android-vedlegg.md) |
| E – Informasjonsarkitektur og ordliste | [E-ia.md](detaljer/E-ia.md) | [E-ia-vedlegg.md](detaljer/E-ia-vedlegg.md) |
| F – Duplisert forretningslogikk | [F-logikk.md](detaljer/F-logikk.md) | – |

Skjermbildene (over 500) og måleskriptene er ikke lagt i repoet. Si fra om du vil ha dem som en zip.

---

## Sammendrag

**Anslagene dine, kontrollert:**

| Ditt anslag | Målt | Kommentar |
|---|---|---|
| ca. 870 filer med prompt-nummer | **892** utenfor `test/`. Server 276 av 371, iOS 493 av 568, Android 298 av 344 | Stemmer |
| 58 CSS-filer | **65** (41 med nummer) | 1,99 MB CSS |
| ca. 600 unike hex | **942** på web (354 klynger når nesten like nyanser slås sammen). iOS 700, Android 534 | Verre |
| ca. 190 `!important` | **1 218**, hvorav 914 i én fil (`finans/css/mobile.css`). Webskallet alene: 304 | Verre |
| ca. 230 iOS-filer med hardkodede farger | **277** (355 med `.white`/`.black`) | Stemmer |
| ca. 200 iOS-filer med `ObservableObject` | **15**. **203** filer bruker allerede `@Observable` | Feil. Det egentlige problemet er én `Store` på 1 686 linjer med 57 utvidelser og 254 singletoner |
| Mobilappene har egen forretningslogikk | Ja. 12 tilfeller på iOS og 14 på Android, og også duplisering **inne på serveren** (3 RRULE-utvidere, 2 datotolkere som svarer ulikt) | Verre |

**De fem viktigste funnene:**

1. **Lagene overstyrer hverandre på alle plattformer.** Web har 5 parallelle temasystemer, ca. 190 variabelprefikser og minst 12 palettsett. Serveren har 284 endepunkter med flere handlere i lag, og 88 steder skriver om svaret fra en eldre handler. iOS og Android har hver én «gudeklasse» for tilstand (`Store` på 1 686 linjer, `AppViewModel` på 3 855 linjer med 223 felt).
2. **Ingen felles designkilde.** Web har 942 hex-verdier, 75 fontstørrelser og 127 radier. iOS har 9 paletter, faste fontstørrelser og ingen Dynamic Type i hovedappen. Android leser `MaterialTheme.colorScheme` bare 2 ganger og har 3 713 faste `fontSize`. Det gir de målte fargefeilene: FinansHub følger ikke Papir mørk, lyse flater i mørkt tema og 339 tekstelementer under WCAG AA.
3. **Samme regel gir ulike svar.** «Neste fredag» sagt på en mandag gir 20.11 i Glimt, web og iOS, men 27.11 i serverens `parse-day35` og i Android. Neste trekkdato for abonnement regnes ut i klienten og overstyrer serverens utregning, så en årlig avgift lagt inn på iOS får feil dato. Serveren har 63 steder der «i dag» regnes i UTC.
4. **Hakking har konkrete, målte årsaker.** FinansHub mobil bruker ~1 s CPU på tvungne layouter (`mobile-p43.js:241`, `mobile-p41.js:108`). Hver web-rute laster 179–191 JS-moduler og poller 6 endepunkter uansett hvilken side som vises. Serveren gjør ~1 800 `kv.get` per kalenderforespørsel. Appene tolker JSON på hovedtråden og poller i stedet for å bruke `/api/ws`.
5. **Noen sikkerhetsfeil bør rettes før oppryddingen** (se §10): utlogging i Kalender-appene virker ikke (404, tokenet lever videre), signeringsnøkkelen til Android ligger i repoet, og iOS lagrer kontotoken i klartekst i App Group.

---

## 1. Arkitekturkart

Detaljer: [A §1](detaljer/A-server.md), [C §2](detaljer/C-ios.md), [D §2](detaljer/D-android.md).

**Server** (Node + Hono, `server/`): 371 JS-filer og 93 324 linjer. `index.js` (1 017 linjer) monterer 209 ruter og mellomvarer direkte, pluss 19 `mount*(app)`. 21 moduler registrerer selv ruter rett på `app`. Rekkefølgen bærer logikk: 28 kommentarer sier «før …» eller «etter …».
- **Data:** én SQLite-fil (`data/homelab.db`, WAL) med 202 tabeller og 110 indekser. `kv`-tabellen brukes for ca. 220 nøkler, også hele lister som JSON. Migreringer skjer når hver modul lastes, ikke samlet.
- **Bakgrunnsjobber:** 16 tidtakere startes ved import, 6 av dem med sideeffekter og uten sandkasse-sperre.
- **Sanntid:** `/api/ws` finnes, men brukes bare av to iOS/Mac-skjermer. Resten poller.

**Endepunkter:** 1 648 metode+sti-kombinasjoner. Hovedprefiksene, og hvem som bruker dem (full liste i A-vedlegget):

| Prefiks | Modul(er) i dag | Web | FinansHub web | iOS | Android | Kalender-apper | Wear/Watch |
|---|---|---|---|---|---|---|---|
| `/api/auth`, `/api/me`, `/api/login` | `auth.js`, `auth40/41.js`, `sec51.js`, `secret86/91.js` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/finans/api/*` | `finans/routes.js` + `finans42.js`, `subs-*` | – | ✓ | ✓ | ✓ | (logout) | ✓ |
| `/api/kalender`, `/api/calendars` | `kalender35.js`, `kal37/39.js`, `ical-expand.js` | ✓ | – | ✓ | ✓ | ✓ | – |
| `/api/media/*` | `media43/44/45/50.js`, `nrkdl.js`, `yubal.js`, `playback44.js` | ✓ | – | ✓ | ✓ | – | – |
| `/api/family`, `/api/tasks`, `/api/skjold`, `/api/live` … | én eller flere nummererte filer per domene | ✓ | – | ✓ | ✓ | delvis | delvis |

**Klienter og hvor tilstanden bor:**

| Klient | Tilstand | Nettverk |
|---|---|---|
| Web (`public/`, 301 JS) | Modulvariabler per side, `localStorage` for tema. 45 statiske importer i `app.js` | `fetch` via `api()`-hjelper, 84 `setInterval` |
| FinansHub web (`public/finans/`) | Eget skall og egen service worker. På mobil er det et helt Homelab-skall (`mobile.js:82`) | eget `api` |
| iOS (FinansHub/Homelab, Kalender, Mac, widgets, Watch) | `Store` (1 686 linjer, ~205 egenskaper) + 57 utvidelser + 254 `static let shared` + 121 globale `static var` | `API` og `KalNet`, pluss `URLSession.shared` direkte i 40 filer. 5 547 utypede `JS.str/num`-oppslag |
| Android (app, kalender, wear) | `AppViewModel` (3 855 linjer, 223 felt, 1 196 utvidelsesfunksjoner i 75 filer), 2 266 `mutableStateOf`, 40 globale `object` med Compose-tilstand | `Api.kt`, `KalApi.kt` og `WearApi51.kt`, tre klienter |

---

## 2. Lagvise filer (familier med nummersuffiks)

Fullstendige tabeller per familie: [A §2](detaljer/A-server.md), [B §1](detaljer/B-web.md), [C §1](detaljer/C-ios.md), [D §1](detaljer/D-android.md).

| Plattform | Filer med nummer | Hva som er i bruk | Død kode | Hvordan de overstyrer |
|---|---|---|---|---|
| Server | 276 av 371 (+16 mapper som `glimt45/`, `skjold76/`) | Nesten alt er montert | 108 ubrukte eksporter. Ruter uten klient i repoet: aliasene `/api/studie`, `/api/integrasjoner`, `/api/rom`, `/home/api`, `/api/update`, `/api/velfremme` | 284 endepunkter i lag, 88 omskrivinger etter `next()`, og rekkefølgen i `index.js` er bærende |
| Web CSS | 41 av 65 (`web30`…`web88-dark`, `media70.css` …) | 42 stilark lastes på hver Homelab-rute | 79 % ubrukt ved kjøring (øvre grense). 5,6 % av reglene er sikkert døde. `web34.css`/`web37.css` brukes 0 %. `family.css` lastes, men `family.js` er død | Hovedsakelig via variabler som omdefineres i opptil 8 filer (`--card`, `--line`, `--acc`, `--ink`) og tema-selektorer med høyere spesifisitet. 405 like selektorpar |
| Web JS | flertallet (`media43/44/45/50/70`, `mobile-p16…p52`, `settings-*`) | 179–191 moduler per rute | `js/family.js` | Senere moduler pakker inn eller erstatter funksjoner og DOM fra eldre |
| iOS | 493 av 568, over 60 familier (`KalLogin/41/89`, `KalStore/35/39`, `Server41/47/89`, `Family16/50` …) | Kjernen | **98 typer (ca. 4 400 linjer) som ikke kan nås**: `KalLoginView`, `MacLoginView`, `PaperMore24/28`, `Brief34Page`, 5 typer i `Family16`. FinansHubs gamle kalender (11 filer, 5 165 linjer) brukes bare med «Kalender i appen» av | Nye filer er `extension`-er oppå gamle typer, og nye skjermer ved siden av gamle |
| Android | 298 av 344 (`P##.kt` 22 filer, `ui/Ui##.kt` 19, Vær i 10 filer …) | Nesten alt. Bare 57 av 4 091 toppnivå-deklarasjoner er urefererte | `Lokal86.kt` finnes i 3 identiske kopier | Lite lagvis overstyring. Problemet er at filene er sortert etter prompt, ikke funksjon |

**Forslag til navn:** detaljrapportene foreslår beskrivende navn per familie (f.eks. `media43/44/45/50` → `server/media/{library,downloads,playback,images}.js`, `KalLogin/41/89` → `Kalender/Login/LoginView.swift`). Endelige navn bestemmes per fase.

---

## 3. Designinkonsistens og forslag til tokens

Detaljer: [B §2](detaljer/B-web.md), [C §3](detaljer/C-ios.md), [D §3](detaljer/D-android.md).

| | Web | iOS | Android |
|---|---|---|---|
| Unike farger | 942 hex (354 klynger). Papir-blekk `#1b1a17` i 43 varianter, papirbunn `#f3efe6` i 46 | 700 hex, 9 palettsystemer, global `PaperSkin.palette` som settes under `body` | 1 164 `Color(0x…)` (534 unike) + 819 `Color.White/Black`. Gammel palett oversettes mens appen kjører (`Theme.kt:108`) |
| Temasystemer | 5: `data-hl` cur/2c, `data-mode`, `data-kal-theme`, FinansHub `data-theme` lys/mork/glod, `data-ui` | Papir lys/mørk + mørkt glass. Tvunget mørk systemstil (`project.yml:63`) | Papir + glass, uten dynamic color |
| Typografi | 75 størrelser, mange halvpiksler | 3 902 kall til egen fonthjelper med fast størrelse, 645 `.system(size:)`. Bare Kalender har Dynamic Type | 3 713 `fontSize`, 42 ulike verdier. `typography` lest 11 ganger |
| Radier / skygger / z-index | 127 / 438 / 105 (opp til 2147483000) | ikke telt | ikke telt |
| Komponentvarianter | 143 kortfamilier, 186 knappefamilier, 45 ark, 64 tomtilstander, 19 lastetilstander, 28 toasts | 15 egne `…Empty`, eget søkefelt, egen fanelinje | ca. 122 egne knapper, 82 egne ark, 165 tekstglyfer brukt som ikon |

**Forslag til felles semantiske tokens** (verdiene er valgt fra klyngene som brukes mest, så byttet blir visuelt nøytralt; full tabell i [B §2.3](detaljer/B-web.md)):

| Token | Papir lys | Papir mørk | Mørkt glass (cur) |
|---|---|---|---|
| `surface` | `#f3efe6` | `#16140f` | `#07080b` (+ bilde) |
| `surfaceRaised` | `#fffdf8` | `#211e18` | `rgba(40,44,52,.55)` + blur |
| `surfaceSunken` | `#ebe5d8` | `#1b1a17` | `rgba(255,255,255,.06)` |
| `line` | `#d8d1c2` | `#3a352c` | `rgba(255,255,255,.12)` |
| `textPrimary` / `textSecondary` | `#1b1a17` / `#5c5850` | `#f3efe6` / `#a39d90` | `#eef0f4` / `#8a93a6` |
| `accent` / `onAccent` | `#b23a2a` / `#fff` | `#ec7a64` / `#1b1a17` | `#ff7a3d` / `#1b1a17` |
| `success` / `warning` / `danger` | `#2f7a4f` / `#a8661a` / `#b23a2a` | `#6fbf8f` / `#e0a24a` / `#f59a8f` | som mørk |
| `categoryX` | ca. 8 kategorifarger med kontrastgaranti mot `onCategory` | | |
| Skalaer | font 11/12/13/14/16/18/22/28/44 · radius 8/12/16/20/999 · avstand 4/8/12/16/24/32 · z: base/raised/sticky/nav/sheet/toast · bevegelse 150/250/400 ms | | |

Tema bør deles i **modus** (lys/mørk/system) og **stil** (Papir/glass), felles for Homelab, FinansHub og Kalender.

**Konkrete fargefeil (målt, med skjermbilder):** [B §2.4](detaljer/B-web.md) F1–F11 og [E §7](detaljer/E-ia.md) B3–B8. De viktigste:
- FinansHub ignorerer Papir mørk og vises lyst (`desktop.js:163`).
- Familie, Kalender og Media vises som lyst papir i mørkt glass.
- Dashbordkortene får Papir-farge i glass.
- Mat i mørkt har et lyst «i dag»-kort og hvit tekst på `#ec7a64` (2,8:1).
- Statusverdier i Integrasjoner og Domener har 1,79:1.
- FinansHub-avataren har 1,26:1.
- iOS: ark kan få feil palett etter temabytte (`Shell.swift:88`).

---

## 4. Duplisert logikk

Detaljer: [F-logikk.md](detaljer/F-logikk.md) (med testskript), [C §6](detaljer/C-ios.md), [D §6](detaljer/D-android.md). Sortert etter risiko for feil data:

| # | Regel | Hvor i dag | Avvik som er målt | Bør bo |
|---|---|---|---|---|
| L1 | Tolking av norske datoer («neste fredag», «mandag», «overmorgen») | `server/glimt45/dates.js`, `server/parse-day35.js`, `public/js/parse-day35.js`, `quick-time.js`, iOS `KalQuick.swift`/`Time44Parse.swift`, Android Kalender + Homelab (3 kopier) | Ja: samme setning gir ulik dato. `glimt45` gir null for «overmorgen» uten «i» | Server (én tolker + testvektorer i `shared/`), API `POST /api/parse/date` |
| L2 | Neste trekkdato for abonnement | iOS `SubsMobile.swift:156`, web `mobile-subs.js:283` og `subs-desktop.js:476`, Android, server `finans/routes.js:1816` | Ja: klientene ser bort fra syklusen og skriver resultatet til serveren | Server, og klientene sender ikke `nextDate` |
| L3 | «I dag» og tidssone | 63 `toISOString().slice(0,10)` i serveren, 97 `LocalDate.now()` uten sone på Android, 143 `Calendar.current` på iOS | Ja: 00–02 blir «i dag» i går | Server sender lokale datoer i Oslo-tid, med felles hjelper |
| L4 | Prøveperioder (tolking og varsler) | 4 tolkere + lokale varsler på iOS og Android i tillegg til serverpush | Android forstår ikke «tre uker». Mulig dobbeltvarsel (ikke bekreftet) | Server lager planen, appen bare planlegger og dedupliserer |
| L5 | «Betalt siste 12 mnd» og omregning per måned | server `subs-log46.js:127`, Android `Ui46b.kt:254`, iOS `Subs46Log.swift:105`. Omregning på 13+ steder | Ja: tre ulike tall | Server |
| L6 | Bolig «brukt» | server, iOS (hopper over `pending`), Android (hopper over `ai`, bruker `abs`) | Sannsynlig | Server |
| L7 | Gjentakende hendelser (RRULE) | 3 utvidere på serveren (`/api/school` med node-ical, `/api/kalender` med `ical-expand.js`) | Mulig tidsforskyvning ved sommertid | Én utvider på serveren |
| L8 | Serveradresse (normalisering, lokal/ekstern) | 5 implementasjoner. Wear tvinger https, iOS Kalender bruker http bare for IPv4 | Ja | Lokalt (må virke uten server), men én regel og felles testvektorer |
| L9 | Helligdager og merkedager | 4 varianter (`KalCals39.swift:386`, `server/kal39.js:128` …) | Appene viser merkedager serveren ikke har | Server |
| L10 | Beløps- og datoformat | 56 JS-, 19 Kotlin- og 21 Swift-funksjoner | Små forskjeller | Lokalt (presentasjon), men felles regel |
| L11 | CSV-eksport | Android bygger CSV med 100 000 rader på hovedtråden, mens serveren har `/transactions.csv` | – | Server |
| L12 | Vær | iOS henter Open-Meteo direkte | Ulike data og ingen cache | Server |

Mønsteret «serveren svarer 404, så gjør vi det lokalt» står ca. 242 steder (estimat). De kan fjernes når eldre servere ikke lenger er i bruk (spørsmål Q19).

**Må virke uten server:** widgeter, klokke, lokale varsler (serveren lager planen), geofence, OCR på enheten, normalisering av serveradressen og offline-køen.

---

## 5. Ytelse

Detaljer: [A §4](detaljer/A-server.md), [B §3](detaljer/B-web.md), [C §5](detaljer/C-ios.md), [D §5](detaljer/D-android.md).

**Web (målt, Playwright/CDP, mobil med 4× CPU-struping):**

| Rute | JS-moduler | API-kall ved lasting | LCP mobil | CLS desktop | Tvungne layouter |
|---|---|---|---|---|---|
| Dashbord | 179 (1,31 MB gzip) | 78 | 2,6 s | **0,43** | 65 / 94 ms |
| FinansHub mobil | 88 (1,05 MB) | 133 | **3,5 s** | 0 | **132 / 1 017 ms** |
| Skjold Lab | 191 | 63 | 2,2 s | **0,61** | 14 |
| Kalender | 179 | 61 | 3,4 s | 0,32 | 39 |

Årsakene:
- Alt lastes alltid, fordi `app.js` har 45 statiske importer.
- Polling av 6 endepunkter skjer på alle ruter (`app.js:240-249`).
- Tvungne layouter fra `bigOn()`/`foldOn()`, `scrollmem.js:44-52` (hvert 60. ms i 1,5 s), `media43.js:535/541`, `dash-edit36.js:179` og `kal39.js:378`.
- CLS kommer fra temabyttet i `hl-boot.js`.
- 359 `innerHTML`, ingen virtualisering, bilder uten størrelse og 10 Google-fontfamilier i FinansHub.
- To service workere med ulik strategi.

Ekte Lighthouse ble ikke kjørt. Estimatet er «Trenger forbedring» for de fleste rutene og «Dårlig» for FinansHub mobil.

**Server (målt, mock-data):**
- `GET /api/kalender` gjør ~1 800 `kv.get` per forespørsel (`kal39.js:52`, `kal37.js:47`), og `/finans/api/summary` ~1 000.
- Prepared statements gjenbrukes ikke (9,7 µs mot 1,3 µs per kall).
- `transactions?limit=2000` med 20 000 rader tar **547 ms** og blokkerer serveren (4 735 `prepare` per kall).
- 19 fremmednøkler mangler indeks, og 214 spørringer gjør full tabellskanning.
- `/api` komprimeres ikke (største svar 365 KB).
- Brief, kalender og widgets har 70–104 ms p50.

**iOS (estimat):**
- JSON tolkes på hovedaktøren, fordi `Store.run` arver `@MainActor`.
- 42 filer poller, og 22 filer har evige `TimelineView(.animation)`.
- 165 lister bruker `id: \.offset` og `PaperLinkRow.id = UUID()`.
- 137 av 172 `ScrollView` er ikke late.
- ~50 `DateFormatter()` lages per kall.
- 5 `AsyncImage` er uten buffer, og en bildecache har ingen grense.

**Android (estimat):**
- JSON tolkes på hovedtråden, verst `exportCsv` (`AppViewModel.kt:1587`).
- 79 `while (true)`, flere i UI uten livssyklussjekk (`Ui42.kt:319`, `Paper17.kt:804`, `Ui52B.kt:145/259/264`).
- 621 `item {}` mot 85 med nøkkel, 165 ikke-late lister, 9 `derivedStateOf` og 1 `@Immutable`.
- `Tone.map()` slår opp i en `HashMap` for hver farge i hver komposisjon.
- R8 er av, og baseline-profilen er håndskrevet.

---

## 6. Avvik fra iOS HIG og SwiftUI-praksis

Full liste med fil:linje: [C §4](detaljer/C-ios.md) (H1–H16). De viktigste:

| # | Hvor | Avvik | Apple anbefaler |
|---|---|---|---|
| H1 | `Shell.swift:90–108` | Rotnavigasjon via `if` i `ZStack`, ingen stabel og ingen tilstandsgjenoppretting | `NavigationStack(path:)` per fane, `NavigationSplitView` på iPad og Mac |
| H2 | `Nav23Swipe.swift:12–117` | Eget kant-sveip som etterligner systemets tilbake | Systemets interaktive pop |
| H3 | `Paper.swift:465–590`, `Paper16.swift:217–247` | Egen fanelinje som skifter innhold per seksjon, opptil 7 elementer, «Hjem» forsvinner, tekstglyfer som ikon | `TabView` med ≤ 5 faner, SF Symbols, iOS 18 `.sidebarAdaptable` |
| H4–H6 | Hele FinansHub | Ingen `Form`, 8 `List`, 2 `swipeActions`, eget søkefelt, 15 egne tomtilstander | `Form`/`List`/`Section`, `.searchable`, `ContentUnavailableView` |
| H7 | `Paper.swift:37–52`, 645 `.system(size:)` | Fast tekststørrelse, ingen Dynamic Type | Tekststiler eller `relativeTo:` / `@ScaledMetric` |
| H8–H10 | 387 rammer under 44 pt, 81 `onTapGesture` (7 merket som knapp), glyfer uten etikett | Trykkflater og VoiceOver | 44×44 pt, `Button`, `Label` med SF Symbol |
| H11–H12 | 15 evige animasjoner, 0 `colorSchemeContrast` | Reduser bevegelse og Øk kontrast støttes ikke | `accessibilityReduceMotion` og høykontrastvarianter i asset-katalogen |
| H13 | `Glass50.swift`, 20 filer med `.ultraThinMaterial` | Liquid Glass etterlignes, så det blir to visuelle språk på iOS 26 | Systemkomponenter, og `.glassEffect` bare på egne flater |
| H15 | `project.yml:10` | Swift 5.10 uten streng samtidighet, 17 `nonisolated(unsafe)` | Swift 6-modus, `@MainActor`-modeller, `Sendable` DTO-er |
| H16 | `MacSidebar.swift` | Egen sidekolonne på Mac | `NavigationSplitView` + `List(selection:)` |

---

## 7. Avvik fra Material 3 og Android-praksis

Full liste: [D §4](detaljer/D-android.md). De viktigste:

| # | Hvor | Avvik | Google anbefaler |
|---|---|---|---|
| 1 | `AppViewModel.kt:42`, `:623-664` | Hjemmelaget navigasjon (`Screen`-enum, `paperPage`-streng, ~40 grener i `back()`) | Navigation Compose med typesikre ruter |
| 2 | `ui/Paper.kt:481`, `P25.kt`, `Ui32b.kt`, `Ui42.kt` | Egne fanelinjer og et håndlaget brettoppsett | `NavigationSuiteScaffold` + `Scaffold` |
| 3 | 91 `BackHandler`, 2 `PredictiveBackHandler` | Prediktiv tilbake mangler nesten overalt | `PredictiveBackHandler` eller Navigation/`ModalBottomSheet` |
| 4 | `MainActivity.kt:31` + ~200 manuelle innfellinger | Kant-til-kant gjøres for hånd | `Scaffold(contentWindowInsets)` |
| 5–7 | 35+ trykkflater under 48 dp, 165 `Text("✕")`, 933 faste høyder | Tilgjengelighet og stor skrift | 48 dp, `IconButton` med `contentDescription`, `heightIn(min=)` |
| 8 | 3 713 `fontSize` | Typografien bruker ikke temaet | `MaterialTheme.typography` fra tokens |
| 10 | Manifest: 74 widget-leverandører (34 Samsung-varianter) | Uoversiktlig widget-katalog | Færre widgets med `SizeMode.Responsive` |
| 12 | 0 `SavedStateHandle` | Prosessdød gir tapte utkast | `SavedStateHandle` per skjerm |
| – | AGP 8.7.3, Kotlin 2.1.0, compile/targetSdk 35, `security-crypto 1.0.0` (avviklet), Wear på Compose M2 | Utdaterte versjoner | Oppgradering i Fase 5 (Play-kravet om API 36 er ikke sjekket) |

---

## 8. Informasjonsarkitektur

Detaljer: [E-ia.md](detaljer/E-ia.md) med tabell over funksjon × plattform.

**I dag:**
- Det finnes fire navigasjonsmodeller for samme innhold: web-toppmenyen med 18 faner, web-mobil (Hjem/Studie/Økonomi/Mer), FinansHub-mobil (et eget Homelab-skall) og appene (egne enum-er på iOS og Android). Hver har egne navn og ID-er.
- **«Hjem»** betyr tre ting: Dashboard, smarthjem (`#/hjem`) og Finans-oversikten.
- **Faste betalinger** finnes fire steder: Faste utgifter, Subscription OS, Planlegging og kategorien «Abonnementer».
- **Import** ligger både som egen side og i Innstillinger.
- **«Widgets»** betyr både forsidekort og telefon-widgets.
- **Integrasjoner** grupperes på tre måter (`/api/integrations`, `/api/config` og iOS `Integrations26.swift`). Google Kalender ligger under «Hjem».
- **Skjold Lab:** standardkategoriene samsvarer ikke med demodataene («Kabler» mot «Kabel»).
- **FinansHub** har både «Bolig» og «Hjem».
- **Innstillinger** er bygd ulikt per plattform. Sikkerhet ligger under Konto på web, men er egen side i appene.

**Forslag (ikke implementert):** én modulliste med faste ID-er i `shared/schemas` som alle plattformer leser:

| Gruppe | Moduler |
|---|---|
| I dag | Oversikt (dagens Dashboard), Glimt |
| Hjemme | Smarthjem, Mat, Gjøremål, Familie (med kart) |
| Tid | Kalender (med filtrene Familie, Bursdager og Skole) |
| Ute | Vær, Reise (avganger og kart), Pakker |
| Økonomi | Oversikt, Transaksjoner, Budsjett, **Faste betalinger** (slår sammen tre), Sparing, Kontoer, Kvitteringer, Boliger, Finn, Rapporter |
| Fritid og læring | Media, Studie, Rom |
| Verksted | Skjold Lab |
| Drift | Domener, Nettverk |

- **Desktop:** maks 7–8 faner i toppmenyen, resten under «Alle sider ▾». Det løser at Kalender og Skjold Lab ikke kan nås på 1440 px.
- **Mobil:** 4 faner + «Mer».
- **Innstillinger:** like grupper på alle plattformer.

**Ordliste:** begrepene brukes inkonsekvent (det ble ikke funnet stavefeil). Eksempler er produktnavnet (OS / Homelab / Nordlys OS / FinansHub), Gjøremål / Huskeliste, Ruter / Avganger / Reise, Totrinnsbekreftelse / Tofaktor og engelske navn som «Now Brief» og «Subscription OS». Full tabell med forslag i [E §6](detaljer/E-ia.md). Ordlisten fastsettes etter svarene på Q1–Q12.

---

## 9. Bugliste

Alle bugs med reproduksjon står i detaljrapportene: A §6, B §5, C §7, D §8 og E §7. Samlet, sortert etter alvorlighet:

| ID | Alvor | Plattform | Bug | Kilde |
|---|---|---|---|---|
| K1 | **Kritisk** (sikkerhet) | Kalender iOS/Mac/Android | Utlogging kaller `POST /finans/api/logout`, som gir 404. Tokenet virker videre (verifisert med curl) | A-B1 |
| K2 | **Kritisk** (sikkerhet) | Android (alle tre) | Signeringsnøkkelen og passordet ligger i repoet. Alle bygg uten CI-hemmeligheter signeres med den, så alle med repoet kan lage en «oppdatering» | D-S1 |
| H1 | Høy | Web desktop, Papir | Toppmenyen skjuler Kalender, Bursdager og Skjold Lab på 1440 og 1920 px (og Gjøremål på 1280) | B-B1, E-B1 |
| H2 | Høy (sikkerhet) | iOS | Homelabs kontotoken og Kalender-tokenet ligger i klartekst i App Group-`UserDefaults` og følger med i ukrypterte sikkerhetskopier | C-S1 |
| H3 | Høy (data) | iOS, web, Android | Neste trekkdato regnes i klienten og overstyrer serveren, så årlige abonnementer får feil dato | F-L2 |
| H4 | Høy (data) | Alle | Datotolkerne gir ulike svar for samme setning | F-L1 |
| H5 | Høy (data) | Server | «I dag» regnes i UTC 63 steder, så det blir feil dag mellom 00 og 02 | F-L3 |
| M1 | Middels | Server | 6 bakgrunnsjobber med sideeffekter (SMB-backup, brief, iCal …) starter ved import uten sandkasse-sperre | A-B2 |
| M2 | Middels | Alle | Ukjent sti gir 404 som ren tekst, så klienter som venter JSON kaster feil | A-B3 |
| M3 | Middels | FinansHub | Transaksjonslisten stopper på 2 000 uten paginering | A-B4 |
| M4 | Middels | Web | FinansHub følger ikke Papir mørk | B-B3/F1 |
| M5 | Middels | Web | Temaet hopper ved første besøk (CLS 0,27–0,61) | B-B4 |
| M6 | Middels | Web mobil | FinansHub mobil hakker (~1 s tvungne layouter) | B-B5 |
| M7 | Middels | Web desktop, cur | Toppmenyen brekker over to linjer | B-B2 |
| M8 | Middels | Web | «Hva skal vi se i kveld?» ligger under «‹ Tilbake» på Media | E-B2 |
| M9 | Middels | Web | Kontrast: Integrasjoner og Domener 1,79:1, Glimt-pillen lys i mørk, Mat 2,8:1, avatar 1,26:1 | E-B3/B4, B-F4–F6 |
| M10 | Middels | FinansHub mobil | Skann-knappen dekker beløpene | E-B5 |
| M11 | Middels | iOS | `PaperSkin.palette` settes under `body`, så ark kan få feil palett etter temabytte | C-B1 |
| M12 | Middels | Android | Polling i composables fortsetter trolig i bakgrunnen | D-B2 |
| M13 | Middels | Android | `exportCsv` på hovedtråden, mulig ANR | D-B3 |
| M14 | Middels (sikkerhet) | Android | Brukerinstallerte CA-er godtas for all trafikk | D-S2 |
| M15 | Middels (sikkerhet) | Android | Om adressen er «lokal» avgjøres av vertsnavnet, så token kan gå i klartekst på fremmede nett | D-S3 |
| M16 | Middels | Android | App Links gjelder bare `home.kristo.no`, ikke `os.smarthjemeksperten.no` | D-B1 |
| M17 | Middels (sikkerhet) | Server | OAuth-klienthemmeligheter for Posten, Bring og PostNord er hardkodet (`tracking46.js:32–43`) | A §5 |
| M18 | Middels (sikkerhet) | Server | App-tokens fra mobilinnlogging utløper aldri | A §5 |
| M19 | Middels | Server | Trege kalender-, summary- og transaksjonskall (N+1 mot `kv`, 547 ms ved 20 000 transaksjoner) | A §4 |
| L1–L20 | Lav | Alle | Bl.a. `scrollmem` drar scrollen tilbake, polling på alle ruter, død `family.css`, Leaflet-reserve blokkert av CSP, 20 Wikimedia-kall uten nett, `EncryptedSharedPreferences` uten `try/catch`, token i WebSocket-URL, `/api/ready` finnes ikke, `grades.sort` på tvers av brukere, nedstenging venter 5 s, ubegrenset bildecache på iOS, toasten «Vi ryddet kalenderne» uten handling, fanetittelen følger ikke Innstillinger | se rapportene |

---

## 10. Sikkerhet i forbifarten

| Alvor | Funn | Forslag |
|---|---|---|
| **Kritisk** | K1: utlogging i Kalender-appene tilbakekaller ikke tokenet | Rett stien i tre apper + alias på serveren. Liten endring |
| **Kritisk** | K2: Android-signeringsnøkkelen og passordet ligger i git | Lag en ny nøkkel som bare ligger i CI-hemmeligheter, og fjern den gamle fra repoet. **Krever avinstallering én gang** på telefonene (ny signatur). Historikken inneholder nøkkelen fortsatt, med mindre den skrives om (spørsmål Q24) |
| Høy | H2: iOS-tokens i klartekst i App Group | Flytt til Nøkkelringen med delt tilgangsgruppe (`ThisDeviceOnly`) |
| Middels | Hardkodede OAuth-hemmeligheter for Posten, Bring og PostNord i git | Avgjørelse om integrasjonen (Q22) |
| Middels | App-tokens uten utløp | Utløpstid + refresh som Kalender-appene (Q23) |
| Middels | Android godtar bruker-CA-er for all trafikk, og lokal avgjøres av vertsnavn | Begrens `user`-CA til egne domener, og avgjør lokal på IP |
| Lav | Token i `/api/ws?token=` (havner i logger), Nøkkelring uten `ThisDeviceOnly` to steder, `/api/discovery` viser lokal IP uten innlogging, media-webhook sammenligner token uten konstanttid, hardkodet brukernavn «sebastian» i `bible37.js` | Rettes i fasen for hver plattform |
| OK | Økt- og app-tokens lagres som HMAC. Cookies er `httpOnly`, `SameSite=Lax` og `secure`. Ingen andre nøkler i koden (mønstersøk). Ingen admin-data til vanlige brukere (testet). ATS er riktig, `allowBackup=false` og strenge CSP-er | – |

---

## 11. Plan

Jeg foreslår å rette de to kritiske sikkerhetsfeilene (K1, og K2 hvis du godkjenner nøkkelbyttet) i en egen liten **Fase 0b** før Fase 1. Resten følger fasene dine. Omfanget er anslått i arbeidsøkter med agenter, og hver fase går på egen gren med én commit per logisk endring.

| Fase | Innhold | Omfang (estimat) | Risiko | Funksjoner som berøres |
|---|---|---|---|---|
| **0b** | K1 utlogging. K2 ny Android-nøkkel (etter svar). H2 iOS-token til Nøkkelringen | Liten | Lav. K2 krever én reinstallasjon | Innlogging og utlogging |
| **1** Fundament | `shared/design/tokens.json` (modus × stil), generator for CSS, Swift (+ asset-katalog) og Compose, CI-sjekk. `CLAUDE.md` i rotmappen (slått sammen med `design_handoff_homelab/CLAUDE.md`). Felles testvektorer i `shared/` for datoer, abonnementssykluser og serveradresser | Middels | Lav, ingen synlig endring ennå | Ingen |
| **2** Server og API | Kontrakt i `shared/schemas` (start med endepunktene klientene bruker, ~400 av 1 648). Feil, tid og beløp i ett format, paginering. Flytte L1–L7 og L9–L12 til serveren. Statement-cache, `kv` lest én gang, indekser, gzip. Én planlegger for jobber. Slå sammen lagene per domene (`server/<domene>/`) | Stor | Middels: rekkefølgeavhengigheter. Krever testdekning per domene før sammenslåing | Alle, gjennom API-et (svarene beholder formen sin og får nye felt i overgangen) |
| **3** Web | CSS: 65 → ca. 15 filer (`tokens` generert, `base`, `layout`, `components/*`, `pages/*`). Fjerne hex og `!important`. Ett temasystem. JS: felles komponenter, lat lasting per rute, polling bare der det vises, rette tvungne layouter, virtualisering. Én service worker | Stor | Middels: visuell regresjon. Skjermbilder før og etter per rute × tema × bredde | Alle web-sider |
| **4** iOS | Del `Store` per domene med `@Environment`. Ett `APIClient` (actor, `Codable` fra kontrakten). Token i Nøkkelringen. `NavigationStack`/`TabView`/`SplitView`. `Form`/`List`/`.searchable`. Tokens + Dynamic Type. Fjerne 98 døde typer. Swift 6. Slå sammen filfamiliene | Svært stor | Høy: kan ikke bygges eller kjøres her. Alt verifiseres gjennom CI-bygget og din testing på telefon. Profilering i Instruments må du gjøre (jeg kan lage oppskrift) | Hele appen |
| **5** Android | Navigation Compose + `NavigationSuiteScaffold`, ViewModel per skjerm med `StateFlow` og repository, én klient, M3-tema fra tokens, prediktiv tilbake, oppgradering av AGP/Kotlin/SDK, R8, baseline-profil og Macrobenchmark (krever emulator i CI). Wear til Wear M3 | Svært stor | Høy: samme som iOS | Hele appen |
| **6** IA og kategorier | Modulliste i `shared/schemas`, nye navn, menyer og Innstillinger. Datamigrering av kategorier (kjøres bare etter godkjenning) | Middels | Middels: endrer vante plasser | Navigasjon, kategorier |
| **7** Verifisering | Alle tester og bygg, skjermbilder og ytelsestall før og etter, buglisten gjennomgått, CHANGELOG, docs og CLAUDE.md | Middels | Lav | – |

Rekkefølge og avhengigheter:
- Fase 1 før alt annet.
- Fase 2 før 4 og 5, fordi appene skal bygge mot kontrakten.
- Fase 3 kan gå parallelt med 2.
- Fase 6 kan tas før 3–5 hvis du vil at navnene skal være på plass før skjermene skrives om. Det anbefaler jeg, fordi det sparer dobbeltarbeid.

**Om testene i arbeidsreglene:**
- `npm test` (2 105 tester) og `npm run test:e2e` kjører her.
- `test:visual` og `a11y` finnes og kan kjøres.
- iOS og Android kan bare bygges i CI («Mobilapper»), og det finnes ingen Kotlin- eller Swift-enhetstester i dag. For «skriv testen først» på mobil foreslår jeg å legge til XCTest- og JUnit-mål som kjører i CI i Fase 4 og 5 (Q25).

---

## 12. Spørsmål til deg

Spørsmålene er gruppert. Svarene avgjør innholdet i Fase 1, 2 og 6. Detaljrapportene har bakgrunnen.

**Navn og struktur (Fase 6)**
1. Hva skal startsiden hete: «Oversikt», «Dashboard», «I dag» eller «Hjem»? Skal smarthjem-siden da hete «Smarthjem»?
2. Hva skal produktet hete i UI: «Homelab», «OS» eller «Nordlys OS»? Er «Nordlys OS» et bevisst navn på serverprogramvaren?
3. Skal FinansHub være en egen app/PWA (`/finans/`), eller en modul i Homelab? På mobil-web er den i dag et helt eget Homelab-skall.
4. Skal Faste utgifter, Subscription OS og faste trekk i Planlegging bli én side, «Faste betalinger»? Skal navnet «Subscription OS» beholdes?
5. Skal Familiekalender og Bursdager være egne sider eller filtre i Kalender?
6. Hvilke 6–8 moduler skal stå fast i toppmenyen på desktop?
7. Engelske og blandede navn («Now Brief», «Subscription OS», «Live Activities», «Backup», «Logger»): beholde eller fornorske?
8. Kollektivmodulen: «Ruter», «Avganger» eller «Reise»?
9. Skal Kart være egen modul eller en fane i Familie/Reise?
10. Skal Nyheter og Nyhetsleser være én modul?
11. Er «Bolig» og «Hjem» i FinansHub ment som to kategorier?
12. Skal Sikkerhet være egen side (som i appene) eller ligge under Konto (som på web)?

**Design (Fase 1 og 3)**

13. Skal «cur» (mørkt glass) leve videre som egen stil, eller er Papir lys/mørk målbildet? Det avgjør om tokensettet får tre eller to varianter.
14. Er det meningen at Familie, Kalender og Media alltid er lyst papir i glass-temaet?
15. Skal FinansHubs egne temaer (`glod`, `mork`) bevares, eller skal FinansHub følge Homelab-modusen?
16. Android: er dynamic color (Material You) bevisst borte for godt? iOS: er tvunget mørk systemstil og bare stående iPhone bevisste valg?

**Logikk (Fase 2)**

17. «Mandag» sagt på en mandag: i dag eller om en uke? «Neste fredag» sagt på en mandag: om 4 eller 11 dager?
18. Skal merkedager (Palmesøndag, Julaften …) vises i Kalender?
19. Bruker noen fortsatt en eldre server? Hvis ikke, kan ca. 242 «serveren svarer 404, gjør det lokalt»-reserver fjernes.
20. Skal appene vise Oslo-tid også når telefonen er i en annen tidssone?
21. Skal «betalt siste 12 mnd» ta med prøver som er gått over til betalt? Skal bolig-poster som venter eller er AI-forslag telle med i «brukt»?

**Sikkerhet og drift (Fase 0b og 2)**

22. Skal Posten/Bring/PostNord-sporingen med innebygde app-hemmeligheter beholdes?
23. Skal app-tokens fra mobilinnlogging få utløpstid med refresh?
24. Android-nøkkelen: godtar du ny signeringsnøkkel (én reinstallasjon)? Skal git-historikken skrives om for å fjerne den gamle (krever force-push på main og at alle kloner hentes på nytt)?
25. Kan vi legge til XCTest- og JUnit-mål og en Android-emulator i CI? Det trengs for testene, baseline-profilen og Macrobenchmark.

**Opprydding som kan fjerne noe (spør før sletting)**

26. Kan FinansHubs gamle kalender på iOS (11 filer, 5 165 linjer) fjernes nå som «Kalender i appen» er standard?
27. Skal Kalender finnes både som egen app og inne i Homelab-appen (iOS og Android)?
28. Kan Mac-appen kreve macOS 14? Da kan den bruke `@Observable` og dele kode med iOS-Kalender.
29. Brukes aliasene `/api/studie`, `/api/integrasjoner`, `/api/rom`, `/home/api`, `/api/update`, `/api/velfremme` og `/api/domener` av noe utenfor repoet (skript, Home Assistant, snarveier)?
30. Skal den gamle `receipts`-tabellen (`/api/receipts`) leve videre ved siden av FinansHub-kvitteringene?
31. Er Samsung- og låseskjerm-variantene av Android-widgetene (34 leverandører) i bruk?
32. Er kvitteringstolking på enheten (iOS) ønsket som reserve uten nett, eller skal bare serveren tolke?
33. Skal fanelinjen som kan tilpasses per seksjon (iOS) beholdes, eller er én fast fanelinje greit, med tilpasning under «Mer»?
34. Er automatisk rydding av kalendere («Vi ryddet kalenderne: 6 → 4») ønsket?
35. Er det meningen at onboardingen i mobil-FinansHub blokkerer dype lenker?

---

*Fase 0 stopper her. Ingen kode er endret. Jeg venter på at du godkjenner planen og svarer på spørsmålene, eller på at du sier hvilke spørsmål jeg skal avgjøre selv.*
