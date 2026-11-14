# F – Duplisert forretningslogikk (server, web, iOS, Android, Kalender, Wear/Watch)

Kartlegging, ingen endringer i repoet. Linjenumre gjelder arbeidskopien `/home/user/torskenes-verden` (gren `opprydding/fase-0`).
Tester jeg kjørte selv er merket **målt**. Resten er lest i kode. Det som ikke er bekreftet, er merket «verifiser».

## Kort oppsummering

- Brukerens anslag stemmer, og det er verre enn antatt: logikken er ikke bare kopiert ut til klientene, den finnes også i **flere versjoner på serveren** (3 RRULE-utvidere, 2 tolkere for norske datoer som svarer forskjellig, minst 15 egne «i dag»-hjelpere).
- Mønsteret bak det meste: «svarer serveren 404 (eldre versjon), gjør det lokalt». Grep gir **242 linjer** i apps/ og public/ som beskriver en slik reserve (`grep -rnE "(404|eldre server|eldre versjon)" … | grep -iE "lokal|selv|her|fallback|reserve|ellers" | wc -l`, estimat siden ordlyden varierer). Hver av dem er en kopi av en regel som kan gli fra originalen. Når én server er eneste kilde, kan de fleste slettes.
- De verste avvikene gir feil tall eller feil dato hos brukeren: datotolkning (samme setning gir tre ulike datoer), neste trekkdato for abonnement (klientene regner den ut selv og **skriver** den til serveren), «betalt siste 12 mnd» (tre svar), boligbudsjettet «brukt», og prøveperiodevarsler som planlegges både på serveren og på telefonen.

## 1. Prioritert liste (risiko for feil data hos brukeren)

| # | Regel | Risiko | Kort |
|---|---|---|---|
| 1 | Norsk datotolkning («neste fredag», «mandag», «overmorgen») | **Høy** | Samme setning gir ulik dato i server/glimt45, server/parse-day35, web, iOS og Android Kalender. Målt. |
| 2 | Neste trekkdato for abonnement | **Høy** | iOS, Android og web regner ut `nextDate` med tre ulike algoritmer og sender den til serveren. Serveren bruker da ikke sin egen `nextFor()`. |
| 3 | «Dagens dato» på server og klienter (UTC eller enhetens sone mot Europe/Oslo) | **Høy** | 63 `toISOString().slice(0,10)` i server/. Mellom 00:00 og 01:00/02:00 blir «i dag» i går, blant annet i abonnementskalenderen og i «i morgen» for gjøremål. |
| 4 | Prøveperioder: tolkning og varsler | **Høy/middels** | Fire tolkere med ulik dekning. Varsler planlegges både på serveren (push) og lokalt på iOS og Android, så du kan få samme varsel to ganger (verifiser). iOS bruker enhetens tidssone. |
| 5 | Abonnement: «betalt siste 12 mnd» / månedssum | **Middels** | Server, iOS og Android gir tre ulike svar på samme logg. |
| 6 | Abonnement/faste trekk: omregning til per måned | **Middels** | Minst 13 steder. Syklusene, `abs()` og avrundingen er ikke de samme. |
| 7 | Bolig: «brukt» per måned | **Middels** | Serveren tar med alle poster, iOS hopper over `pending`, Android hopper over `status=="ai"` og bruker `abs`. |
| 8 | Skole-iCal: to utvidere på serveren | **Middels** | `/api/school` bruker node-ical sin `rrule`. `/api/kalender` bruker egen `ical-expand.js` med Europe/Oslo. Når de to gir ulike tider rundt sommertid, er det trolig `/api/school` som har feil (verifiser). |
| 9 | Helligdager | **Lav/middels** | Fire implementasjoner. Appene tar med merkedager som serveren ikke har, og web kaller 1. mai noe annet. |
| 10 | Normalisering av serveradressen | **Middels** (innlogging) | Fem implementasjoner med ulike regler. Klokken tvinger alltid https, også for lokale adresser. |
| 11 | Bursdager: neste dato og alder | **Lav** | Like regler, men appene bruker enhetens tidssone og serveren Oslo. Android lagrer lokalt når serveren svarer 404. |
| 12 | Valuta- og beløpsformatering | **Lav** (personvern: middels) | 56 JS-, 19 Kotlin- og 21 Swift-funksjoner. Noen widgeter skjuler ikke beløp når personvernmodus er på (verifiser). |
| 13 | Pakkestatus, Media-filtre, Ruter, strømpris | **Lav** | Mest presentasjon. Strømpris finnes bare på serveren (bra). |

## 2. Funn i detalj

### 2.1 Datotolkning (Glimt, Rask, gjøremål, kalender) – høy

Rundt 40 filer tolker «overmorgen» eller lignende (`grep -rlnE overmorgen`). Hovedvariantene er disse:

| Tolker | Fil |
|---|---|
| Server, Glimt | `server/glimt45/dates.js:72` `parseDate45`, `:313` `whenOf45` |
| Server, eldre | `server/parse-day35.js` `parseDay` (brukes av kalender33, assist, calendar-glimt, tasks-glimt37, glimt39-fag) |
| Server, gjøremål | `server/tasks-glimt40/41/42.js` (egne `splitLocal41/42`) |
| Web | `public/js/parse-day35.js:12`, `public/js/quick-time.js`, `public/js/kal38.js`, `public/finans/js/mobile-p42.js`, `public/finans/js/mobile-kal.js` |
| iOS | `apps/ios/FinansHub/Sources/Time44Parse.swift:97`, `SharedKal/Core/KalTime44Core.swift`, `Kalender/Sources/KalQuick.swift`, `KalRask46.swift` (lokal tolkning ved 404) |
| Android | `apps/android/kalender/.../KalParse.kt:116`, `Kal46.kt` (Kal46Rask), `app/.../P31.kt`, `P35–P37.kt`, `Calendar29.kt` |

**Målt** (node, `TZ=Europe/Oslo`, i dag = mandag 16.11.2026, skript i `$S/audit-logikk/t*.mjs`). iOS og Android er lest i koden.

| Tekst | glimt45 `whenOf45` | server `parse-day35` | web `parseDay` | iOS `Time44Parse` | Android `KalParse` |
|---|---|---|---|---|---|
| «mandag» (det er mandag) | 16.11 (i dag) | 23.11 | 16.11 | 16.11 (`add = 0`) | 23.11 (`if (it == 0) 7`) |
| «neste fredag» | 20.11 | 27.11 | 20.11 | 20.11 («neste» ignoreres) | 27.11 (`+7`) |
| «overmorgen» (uten «i») | **null** | 18.11 | 18.11 | – | – |
| «fredag om to uker» | **30.11 (en mandag)** | 20.11 | 20.11 | – | – |

Det betyr at en avtale eller et gjøremål lagres på ulik dag etter hvilken inngang brukeren tilfeldigvis bruker. Web `parseDay` gir dessuten et UTC-tidsstempel (`2026-11-19T23:00:00Z`) og ikke en dato. Det er en felle for alle som kaller den med `.slice(0,10)`.

**Bør bo:** én tolker på serveren (glimt45/dates.js er den mest komplette, men har feilene over). Lag en API-forhåndsvisning med felt som `{date, time, label, assumed}` (finnes delvis: `POST /api/glimt/agent/preview`). Klientene viser bare `label`. Offline trengs bare en enkel tolker for «i dag/i morgen/ukedag/dd.mm», og den bør testes mot **samme testvektorer** som serveren (JSON-fil i `shared/`).

### 2.2 Neste trekkdato for abonnement – høy

- Serveren: `server/finans/routes.js:1816` `nextFor(day, month, cycle)`. Den brukes bare når klienten ikke sender `nextDate` (`routes.js:1909` `dateIn(b.nextDate) ?? nextFor(...)` og `:1929`).
- iOS `apps/ios/FinansHub/Sources/SubsMobile.swift:156–179`: `Store.nextCharge(day)` regner **alltid månedlig**. Den ser bort fra `cycle` og trekkmåned, og sender resultatet som `nextDate`. En årlig avgift som legges inn på iOS, får dermed neste trekk om under én måned.
- Web mobil `public/finans/js/mobile-subs.js:283` `nextCharge(day, mon, cycle)` er en egen variant (årlig/annet hvert år behandles likt for neste dato). Den sendes på `:316` og `:420`.
- Web desktop `public/finans/js/subs-desktop.js:476` sender `nextDate: "d.m"` (et annet format enn ISO). Det avhenger av at `dateIn` tåler formatet (verifiser).
- Android `AppViewModel.kt:1372` sender `nextDate` fra UI-et.

**Bør bo:** bare på serveren. Klientene sender `chargeDay`, `billMonth` og `cycle`, aldri `nextDate`, og API-et svarer med `nextCharge` og `nextLabel`.

### 2.3 «I dag» og tidssoner – høy

- Serveren: **63** forekomster av `toISOString().slice(0,10)` (UTC-dato) utenfor test. Eksempler: `server/subs-cal42.js:122,130` (abonnementskalenderens område), `server/finans/finans42.js:80` (prøver som slutter innen 14 dager), `server/tasks-glimt41.js:106,159` og `tasks-glimt42.js:91` (standard `today` når gjøremål tolkes, så «i morgen» blir i dag mellom 00 og 01/02), `server/domains.js:101`.
- Serveren har dessuten minst 15 egne «i dag»-hjelpere (`osloDate`, `today51`, `ymdOslo`, `todayOslo45`, `osloTodayISO` …). Noen bruker `toLocaleDateString('sv-SE')` **uten** `timeZone`, for eksempel `finans/routes.js:68`, `finn-routes.js:23` og `backup.js:23`. De stemmer bare fordi Dockerfile setter `TZ=Europe/Oslo`, og kan derfor gi andre svar i dev og CI.
- Android: 97 `LocalDate.now()` uten sone mot 51 med `OSLO31`. iOS: 143 `Calendar.current`. Klientene blander altså enhetens sone og Oslo. Eksempler: bursdager (`Birthdays24.kt:28–29`, `Shared/Birthdays24Shared.swift:66`), prøveperioder på iOS (`Trial31.swift:207`, varsler kl. 09/18 i enhetens sone), mens Android bruker Oslo (`P31.kt:748`).
- Web: `public/js/cal70.js:134` og `domains.js:336` bruker UTC-dato.

**Bør bo:** én `today()` og én `zone` i en felles modul på serveren. API-svar bør ha `today` (Oslo) og ferdig utregnede `daysLeft` der det trengs.

### 2.4 Prøveperioder – høy/middels

- Tolker: `public/js/trial-parse.js` deles mellom web og server (`server/finans/trials.js:14` importerer den, bra). iOS `FinansHub/Sources/Trial31.swift:79` (`Trial31Parse`) og Android `P31.kt:713` (`parseTrial31`) er egne kopier. Dekningen er ulik: Android forstår bare sifre pluss «en uke/en måned», ikke «tre uker». Web forstår også «år» og tallord. Teksten for utløpt prøve er «Prøve · utløpt» på web/server og «Prøven er over» på Android (`P31.kt:849`).
- Varsler: serveren sender push (`server/trials-notify.js`, kl. 09 på dagen minus offset, kl. 18 på sluttdagen, og «Minn meg i morgen»/snooze). iOS planlegger de samme varslene lokalt (`Trial31.swift:207–222`, `UNCalendarNotificationTrigger`), og Android også (`P31.kt:741–752`, AlarmManager). Mulig dobbeltvarsel (**verifiser** om appene undertrykker serverpush). Snooze og serverens grense 0–60 dager for offset finnes ikke lokalt.
- **Bør bo:** tolkning og varseltider på serveren (`/trials` svarer allerede med `daysLeft`, `badge` og planen). Appene holder bare en lokal *kopi* av planen serveren har laget (for å varsle uten nett) og ingen egen regel.

### 2.5 Abonnement: betalt og per måned – middels

«Betalt siste 12 mnd» i abonnementsloggen:
- Server `server/subs-log46.js:127`: bare `charge` (sender `summary.paid12m` og `months[].total`).
- Android `ui/Ui46b.kt:254`: `charge` og `trial_converted`, med `abs(amount)`.
- iOS `Subs46Log.swift:105`: `charge` og `trial_converted`, med `max(abs(amount), priceAfter)`. iOS bygger i tillegg egne hendelser fra prøvene (`Subs46Log.swift:79–84`).
→ Tre ulike tall for samme konto. Klientene bør vise `summary.text` og `months[].totalText` fra serveren.

Omregning til per måned (et utvalg av steder):
- Server: `finans/routes.js:211` (`fh_recurring`: monthly/yearly/weekly), `routes.js:1784–1790` (`fh_subscriptions`: monthly/yearly/biennial, avrundet til øre), `finans/p40.js:76`, `glimt45/subs46.js:33` (også quarterly og halfyearly). Det er altså **to datamodeller og tre tabeller** for sykluser bare på serveren.
- Web: `public/finans/js/desktop.js:538` (uten `abs`), `mobile-pages.js:92`, `mobile-paper3.js:265`, `mobile-subs.js:95`, `mobile-p37b.js:427`, `fin40.js:154`.
- iOS: `Models.swift:969–976` (`abs`, quarterly), `SubsMobile.swift:40,96`, `Subs37.swift:308`, `Modules.swift:79`.
- Android: `Models.kt:163` (`abs`, quarterly), `Models11.kt:361` (summerer lokalt når `monthly` mangler).

**Bør bo:** serveren sender `monthly`, `yearly` og `perLabel` på hvert element og `totals` på lista (finnes delvis). Klientene regner ikke.

### 2.6 Bolig: «brukt» – middels (verifiser)

- Server `finans/routes.js:2067–2093`: `total`, `yearTotal` og måned summerer alle poster, også `status='review'`, uten `abs`.
- iOS `Boliger24Model.swift:137`: per måned uten `pending`.
- Android `ui/Boliger24.kt:191,387,424,547` og `ui/Paper16.kt:505,566`: uten `status=="ai"`, med `abs`.
- Budsjettsiden «igjen» regnes lokalt på iOS (`PaperBoliger16.swift:276–294`).

**Bør bo:** serveren sender `spentByMonth[]`, `budgetLeft` og `over`.

### 2.7 Kalender: gjentakelser og helligdager – middels

- RRULE på serveren: `server/ical-expand.js` (egen kode, Europe/Oslo, RECURRENCE-ID, brukes av `calendar.js`, `kalender35.js` og `kal39.js`), `server/integrations.js:241–245` (`node-ical`/`rrule`, ingen RECURRENCE-ID, rammes trolig av sommertid, brukes av `/api/school` på `index.js:711`, som igjen brukes av `public/js/kalender.js:217` og `study44.js`), og `server/glimt45/recur62.js` (egen `nextRun62` for planlagte Glimt-oppgaver). Klientene utvider ikke RRULE (bra).
- Helligdager: `server/kal39.js:128`, `public/js/kal39.js:117`, `android/kalender/.../Kal39.kt:218` og `ios/SharedKal/Core/KalCals39.swift:386`. Appene tar med Palmesøndag, Julaften og Nyttårsaften som serveren ikke har. Web kaller 1. mai «Offentlig høytidsdag», de andre «Arbeidernes dag». Appenes liste brukes bare når serveren ikke sender kalenderen (`Kal39.kt:243`).
- Uke-start og ukenummer: ISO-uke overalt (`KalCore.swift:101–102`, `Calendar26Shared.swift:195`, `KalCore35.swift:58`). Valget «Uken starter søndag» finnes i Kalender-appene. Dette er presentasjon og kan være lokalt.

### 2.8 Serveradresse – middels (innlogging)

| Implementasjon | http for lokale adresser? | `.home.arpa` | Fjerner sti |
|---|---|---|---|
| Android-appen `Api.kt:220` | ja (RFC1918, 100.64/10, `.local`, `.lan`, uten punktum) | ja | ja |
| Android Kalender `KalApi.kt:105` | ja | **nei** | ja |
| Wear `WearApi51.kt:74` | **nei, alltid https** | – | ja |
| iOS `API.swift:210–225` | ja (som Android-appen) | ja | ja |
| iOS Kalender `KalSrv47Core.swift:31` | bare når verten er en IPv4-adresse (også offentlige IP-er). `nas.local` blir https | nei | ingen egen fjerning (avhenger av `KalAuth41.trim`) |

Dette **må** være lokalt (det skjer før appen har kontakt med serveren), men bør være én spesifikasjon med felles testvektorer (`shared/server-url.cases.json`) som alle fem kjører.

### 2.9 Bursdager – lav

Serveren `server/birthdays.js:76–156` (Oslo; 29.2 blir 28.2; `daysLeft`, `age`, påminnelse kl. 09). iOS `Shared/Birthdays24Shared.swift:65–115` regner `daysLeft` og alder **alltid** lokalt (kommentaren sier «når serveren ikke sender dem»), i enhetens sone, og godtar dag ≤ 31 for alle måneder. Android `Birthdays24.kt:28–31,65` gjør det samme, og lagrer bursdager bare lokalt når serveren svarer 404 (`:125`). Det lokale gir mening for widgeter (tallet skal stemme dagen etter uten nett), men regelen bør komme fra serveren som `month`/`day` pluss `nextDate`, og klienten regner bare `daysLeft = nextDate − i dag(Oslo)`.

### 2.10 Formatering av beløp og personvern – lav/middels

56 kr-funksjoner i JS, 19 i Kotlin og 21 i Swift (grep på `kr|nok|money|kr\d+`). Kjernen `n0()` (Android `ui/Theme.kt:303`, iOS `Models.swift:725`) skjuler beløp i personvernmodus og fjerner fortegnet. Noen kopier går utenom:
- Android `widget/Widgets51Plat.kt:175` `kr51` (laveste saldo i widgeten) sjekker ikke `HIDE_AMOUNTS` i formateringen (**verifiser** om widgeten skjules på et annet nivå).
- Android `ui/Fin27.kt:52` og `ui/AiCtl34.kt:68` bruker `String.format` og ingen `Privacy`.

Dette er presentasjon og kan være lokalt, men som **én** funksjon per plattform (med personvernmodus), styrt av design-tokens (tusenskille med smalt mellomrom, minus som «−»).

### 2.11 Annet (lav risiko, for helhetens skyld)

- **Valuta:** faste kurser i `server/finans/sub-screenshot.js:42` (`SEK: 1.0`, `USD: 10.8` …). Bare på serveren, men tallene er utdaterte og ikke merket som anslag. Bør hentes (Norges Bank) eller vises som «omregnet ca.».
- **Kvitteringer:** tolkning på enheten (iOS `Receipt47Engine.swift`, `Receipt48Ocr.swift`; Android `ReceiptOcr47/48.kt`) har bevisst samme regler som serveren (`server/receipts48/validate.js:80`: sum ±1 kr, likt med `Receipt47Engine.swift:145`). Den dupliseringen er begrunnet med personvern og at det fungerer uten nett. Serveren validerer på nytt (bra).
- **Skjold Lab:** uttaket regnes på serveren (`server/skjold76/picklist79.js:78`: aldri under 0, tre desimaler). Android trekker fra lokalt for å vise det med en gang (`Skjold79.kt:441`, uten avrunding). iOS og web kjører plukklista bare lokalt ved 404 (`Skjold79Pick.swift:46`, `public/js/skjold79-pick.js:7`). LED-paletten er kopiert («samme palett som serveren», `Skjold79Pick.swift:53`). Lav risiko, men regelen for lavt lager (`min_qty`) må bare komme fra serveren (`store.js:157`), og det gjør den.
- **Pakker:** statusnormalisering finnes bare på serveren (`server/tracking-carriers.js:88`). Klientene har sin egen tabell fra status til steg (iOS `Tracking.swift:198–205`, Android `Models11.kt:123`) og egne filtre. Det er presentasjon, men serveren bør sende `step` og `statusText`.
- **Media:** filtrene «Mangler/Lastet/Kommer» er regnet lokalt (Android `ui/Media43.kt:313–318`). Lav risiko.
- **Ruter:** bare på serveren. Klientene buffrer (`Shared/Ruter52Buffer.swift`) og filtrerer bort avganger som er mer enn 1 minutt gamle. Greit.
- **Strømpris:** bare på serveren (`server/power-price.js:50–63`, mva og billigste time). Bra, og et godt mønster for resten.
- **Gjøremål, forfalt:** serveren sender `overdue` og `today` (`server/tasks.js:229`). iOS og Android regner det likevel selv (`Tasks44Info.swift:338`, `Tasks37Glimt.swift:217`, `ui/Tasks37.kt:194`), i enhetens sone. iOS har i tillegg en hel lokal Glimt-tolkning for gjøremål ved 404 (`Tasks37Glimt.swift`, 458 linjer).

## 3. Presentasjon eller forretningsregel

| Kan være lokalt (presentasjon) | Må flyttes til serveren (forretningsregel) |
|---|---|
| Beløps-, dato- og ukedagsformat (én funksjon per plattform, med personvernmodus) | Datotolkning av fritekst (alle innganger) |
| Ukenummer og «Uken starter» | Neste trekkdato og omregning per måned / per år |
| `daysLeft` regnet fra en `nextDate` som serveren har sendt (for widgeter) | «Betalt», «brukt» og «igjen» (abonnement, bolig, budsjett, mat) |
| Media-, pakke- og gjøremålsfilter i UI-et | Prøvetolkning, varselplan og snooze |
| Normalisering av serveradressen (men felles testvektorer) | Helligdager (serveren sender kalenderen, appene cacher) |
| Optimistisk visning (Skjold-uttak) som erstattes av serverens svar | Statusnormalisering og steg for pakker, bursdagspåminnelser, alder |

## 4. Det som må fungere uten server (begrunnet lokal logikk)

- **Widgeter (iOS `KalenderWidgets`, `FinansHubWidgets`, Android `widget/*`), Watch51 og Wear:** de viser cachede data og må telle ned riktig (bursdager, prøver, avganger, gjøremål) uten nett. Løsning: serveren sender **absolutte** datoer og tidspunkter (`nextDate`, `endsAt`, `expectedDeparture`). Klienten regner bare tidsforskjell mot nå i `Europe/Oslo`, ingen regler.
- **Lokale varsler:** prøver (iOS `Trial31.swift`, Android `P31.kt`, `Notify31.kt`), kalenderpåminnelser (`KalNotify*.swift`, `KalNotify.kt`) og alarmer (`Alarms37.kt`). Serveren bør lage *planen* (liste med `{key, at, title, body}`), og appen bare planlegger den og dedupliserer mot push med `key`.
- **Geofence og sone:** familie-soner og butikkvarsel for handlelista (iOS `Zone45.swift`, `Family22Zones.swift`; `UNLocationNotificationTrigger`). Det må skje på enheten. Sonedefinisjonene kommer fra serveren.
- **OCR og tolkning av kvitteringer på enheten:** begrunnet med personvern. Serveren validerer på nytt.
- **Oppsett og innlogging:** normalisering av serveradressen og QR-innlogging.
- **Offline-kø:** opplastingskø (`UploadQueue18.swift`) og Kalender-hendelser som lagres lokalt når Glimt ikke svarer (`Kal46.kt:140–146`). Hendelsen må få en `requestId` (finnes) og tolkes på serveren når den synkes, ikke på enheten.

## 5. Anbefalt rekkefølge (fase 1)

1. Lag `shared/testvektorer/` (JSON) for datotolkning, prøvetolkning, serveradresse, helligdager og syklus-til-måned. Kjør dem mot server og web i `node --test`, og mot Swift og Kotlin i enhetstester. Da ser man avvikene før man flytter noe.
2. Server: én modul for `today()`/`zone`, og fjern de 63 `toISOString().slice(0,10)`. Velg én datotolker (glimt45), rett feilene i tabellen i 2.1, og la `parse-day35` og `tasks-glimt41/42` bruke den.
3. Abonnement: slutt å godta `nextDate` fra klienten (eller valider den mot `nextFor`). Én syklustabell (`CYCLE_MONTHS`) som både `fh_recurring` og `fh_subscriptions` bruker. Ferdige summer i API-et.
4. Bytt `/api/school` til `ical-expand.js`.
5. Fjern 404-reservene app for app etter hvert som serverversjonen er låst (krever en minste serverversjon i `/api/discovery`).

## Spørsmål til brukeren

1. Skal «mandag» sagt på en mandag bety i dag eller neste uke? Og «neste fredag» sagt på en mandag: om 4 eller 11 dager? (Implementasjonene er uenige, og vi trenger én fasit.)
2. Skal merkedager (Palmesøndag, Julaften, Nyttårsaften) vises i Kalender? I dag gjør de det bare når serveren ikke svarer.
3. Skal «betalt siste 12 mnd» ta med prøver som er gått over til betalt?
4. Skal bolig-poster som venter på gjennomgang eller er AI-forslag telle med i «brukt»?
5. Er det noen som fortsatt bruker en eldre server, slik at 404-reservene trengs? Hvis ikke, kan de fleste av de 242 stedene fjernes.
6. Skal appene vise tider i Oslo-tid også når telefonen er i en annen tidssone (på reise)?

## Hvordan målt

- Datotolkerne: `$S/audit-logikk/t.mjs`, `t2.mjs` og `t3.mjs` (importerer `server/glimt45/dates.js`, `server/parse-day35.js` og `public/js/parse-day35.js`, `TZ=Europe/Oslo node …`).
- Telling: `grep -rnoE "LocalDate\.now\(\)"` (97), `"LocalDate\.now\([A-Za-z0-9_.]+\)"` (51), `"Calendar\.current"` (143), `toISOString\(\)\.slice\(0, *10\)` i server/ (63), kr-funksjoner (56/19/21), 404-reserver (242, estimat).
