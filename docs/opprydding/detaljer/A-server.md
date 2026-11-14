# A – Server (`server/`)

Kartlagt 2026-11-14 på gren `opprydding/fase-0`. Ingen endringer i repoet. Testserver: `test/e2e51/server.mjs` på port 4920 med
`DATA_DIR=$S/audit-server` (MOCK_DATA=1, NODE_ENV=test, ingen bakgrunnsjobber). Den er stoppet. Alle skript ligger i `$S/audit-server/`
(`routes.mjs`, `usage.mjs`, `graph.mjs`, `eqp.mjs`, `fk.mjs`, `bench.mjs`, `prof*.mjs`, `sweep.mjs`, `idor.mjs`, `reverse.mjs`).
Rålister ligger i **`$S/audit/A-server-vedlegg.md`** (alle 1648 endepunkter med klientbruk, døde ruter, ubrukte eksporter, EXPLAIN-skanninger).

## 0. Sammendrag

| Tema | Funn |
|---|---|
| Størrelse | 371 JS-filer, **93 324 linjer** (186 på toppnivå i `server/`, 185 + `index.js`). 276 av 371 har prompt-nummer i fil- eller mappenavn (121 av 186 på toppnivå, 16 mapper som `glimt45/`, `skjold76/`). Brukerens tall 185 stemmer for toppnivået. |
| Ruter | **1 648 unike metode+sti-endepunkter**, 2 824 registrerte handlere, 195 `app.use`-mellomvarer. 284 endepunkter har flere enn én handler (lag). 88 steder i 28 filer skriver om svaret til en eldre handler etter `await next()`. |
| Monteringen | `index.js` (1 017 linjer) har 209 `app.route/use/get/…`-kall og 19 `mount*(app)`-kall. 21 moduler registrerer selv flere ruter rett på `app` (213 kall). Rekkefølgen er bærende: 28 kommentarer i `index.js` sier «før …»/«etter …». |
| Databaser | Én SQLite-fil `data/homelab.db` (WAL) med **202 tabeller** og 110 egne indekser (pluss `brreg51`-registeret som egen fil). `kv`-tabellen er brukt som nøkkel/verdi-lager for ca. 220 ulike nøkler (innstillinger, migrasjonsflagg, hele lister som JSON). |
| API-kontrakt | `shared/schemas` har bare 2 filer (kvittering). Feilsvar er nesten alltid `{error}` (1 061 steder), men 404 for ukjent sti er **ren tekst** «404 Not Found», ekstra felt (`code`, `restricted`, `reason`, `unreadable`) varierer, og `code` har tre skrivemåter. Ingen ekte paginering. Tid: samme feltnavn (`updatedAt`) er ms-epoch i noen svar og ISO i andre. Beløp: øre i DB, kroner som float i API. |
| Ytelse | Kalender/brief/widgets er tregest (60–125 ms p50 i mock). Årsak målt: **N+1 mot `kv`** – `GET /api/kalender` gjør ~1 800 `kv.get` per forespørsel, `/finans/api/summary` ~1 000. Ingen gjenbruk av prepared statements (9,7 µs vs 1,3 µs per `kv.get`). `GET /finans/api/transactions?limit=2000` med 20 000 transaksjoner: **547 ms** blokkerende (4 735 `prepare` per kall). 19 fremmednøkler uten indeks. JSON-svar fra `/api` komprimeres ikke. |
| Bugs | Kalender-appene (iOS, Mac, Android) logger ut mot **`POST /finans/api/logout`, som ikke finnes (404)** – tokenet blir gyldig (verifisert). Bakgrunnsjobber startes ved import uten sandkasse-sperre (SMB-backup m.fl.). Se §6. |
| Sikkerhet | Hardkodede OAuth-klienthemmeligheter for Posten/Bring/PostNord i `tracking46.js:38–43`. App-tokens fra mobil-innlogging utløper aldri. Ellers ryddig: 20 av 534 parameterløse GET svarer uten innlogging, alle forventet. |

## 1. Arkitekturkart

### 1.1 Oppstart og mellomvare (rekkefølge i `server/index.js`)

1. **Import av alle ~110 moduler (linje 1–131).** Hver modul kjører sine egne `CREATE TABLE IF NOT EXISTS` / migreringer når den lastes
   (det finnes ingen samlet migreringsmappe). `db.js` importerer `secret86.js` først (avgjør «ny installasjon»). Oppstart til ferdig
   import: 730–930 ms (målt med `routes.mjs`).
2. `runRequest` (AsyncLocalStorage med brukerkontekst, `settings.js`) → `traceObs51` (egen ALS + innpakking av alle
   `Statement.run/get/all` og `globalThis.fetch`, `obs51/trace.js:53–89`).
3. `/starting.html` (egen CSP), Studie-fil-CSP-mellomvare, `secureHeaders` (global CSP), `installCacheBust` (no-store på `/api`,
   gzip bare på `/assets/*`), `impersonation44`, `anonBodyCap85`, `mountSec51` (revisjon/enhetsgodkjenning rundt innlogging).
4. Ruter uten innlogging: `/api/version`, `mountAuth41` (discovery, Kalender-innlogging), `mountServer47`, `mountObs51`, `mountQa51`,
   `mountWebx51`, `mountSrv52`, `mountFermion53` … `mountOmlx58`, `/api/auth/*`, `/api/setup`, `/api/cv`, sider (`/`, `/login`, `/finans/` …).
5. FinansHub: 2 mellomvarer + 5 sub-apper på `/finans/api` (finans43 → fin51 → finans42 → finans40 → `finans/routes.js`).
6. Media: `mediaDiag46, homelabAuthCode46, signImages46, mediaSiteMw44, librarySearchMw44`, deretter nrk → yubal → `mountMedia50` →
   `mountApi45` (media45) → `/now,/recent,/history,/poster` (index.js) → `media44Api` → `playback44Api` → `media43Api`.
7. Alle øvrige domener (Sporing, Familie, Gjøremål, Kalender, Brief, Glimt, AI, Chat, Domener …), se tabellen under.
8. `app.route('/api', mobileApi)` og til slutt `app.route('/api', authed)` – `authed` har `bearerFallthrough46` + `requireAuth` på `*`,
   så **alt under `/api` som ingen tidligere handler tok, ender i `requireAuth`** (401 uten innlogging, ellers Honos tekst-404).
9. Bakgrunnsjobber (linje 686–698, gated av `BG51 = NODE_ENV!=='test' && OPS51_SANDBOX!=='1'`): 22 `start*`-funksjoner. I tillegg
   startes **16 tidtakere rett ved import** i modulene, 6 av dem med sideeffekter (se §6, B2). Totalt 65 `setInterval` i `server/`.
10. `app.onError` → `badInput85` (ugyldig JSON → 400) → `reportServerError51` → `{error:'Intern feil'}` 500.

Tilgang håndheves per rute, ikke sentralt: 294 `authOrToken`, 122 `guard`, 49 `adminOnly`, 35 `admin`, 23 `sessionOnly`, 13 `adminGuard`,
11 `anyAuth`, 7 `sameAdmin`, 5 `requireAdmin51`, 5 `requireAdmin`, 4 `mainOnly`, 3 `tokenAdmin`, 3 `readAuth` (navn på handlerfunksjoner
i `app.routes`). Det er altså minst 13 ulike tilgangsvakter med overlappende betydning.

### 1.2 Prefiks → modul → klienter

Klientbruk er funnet ved å matche alle sti-strenger i klientkoden mot rutene (`usage.mjs`, estimat – se vedlegg A1 for hver rute).
Antall = endepunkter (metode+sti).

| Prefiks | Ant. | Moduler (montert i denne rekkefølgen) | Klienter (direkte treff) |
|---|---:|---|---|
| `/finans/api/*` | 348 | `finans/finans43.js`(mw), `fin51.js`, `finans42.js`, `p40.js`(finans40), `finans/routes.js` (2 800+ linjer) + 45 filer i `finans/` | fhweb, ios, android |
| `/api/media/*`, `/api/playback/*` | 125 | `api-auth46`(mw), `media44`(mw), `nrkdl`, `yubal`, `media50`, `media45`, index.js, `media44`, `playback44/45`, `media43` | web, ios, android |
| `/api/glimt/*` | 81 | `srv52`, `newsDigest`(api40), `mem63`, `quality64`, `glimt-memory`, `mai17-41`, `glimt35`, `glimt45/`, `convo60/`, `recipes61/`, `sched62/`, `ai-api` (glimtApi) | web, ios, android |
| `/api/skjold/*` | 67 | `skjold76/` (13 filer) | web, android (via prefiks) |
| `/api/family/*` | 54 | `family50`, `zone45`(api45), `health45`(mw), `health42`, `family` | web, ios, android, wear |
| `/api/ai/*` | 50 | `ai-import45`, `ai-memory43`, `ai39`(rec), `ai-api` | web, ios, android |
| `/api/tasks/*` | 47 | `misc45`(tasks45), `tasks43`(mw+api), `tasks42`, `api40`(2 mw), `tasks.js` (+ `tasks-glimt37–42`, `tasks-ha`) | web, ios, android, wear |
| `/api/kalender/*`, `/api/calendar*`, `/api/widgets/calendar` | 51 | `kal44`, `kalender41`, `calendar-glimt`, `calendar-quick`, `kalender35`, `kal37`, `media43`(mw), `subs-cal42`(mw), `kal39`, `kalender33`(mw+api), `calendar.js` | web, kal_ios, kal_android, mac |
| `/api/system/*`, `/api/update/*`, `/api/backup`, `/api/ops51`, `/api/smb` | 92 | `docker45`, `logs44`, `obs51/`, `system-update`, `system-backup`, `ops51/backup51/dbmaint51`, `smb-browse` | web, ios, android (admin) |
| `/api/admin/*` | 39 | `admin44`, `qa51`, `srv52`, `fermion53`, `dal53`, `whisper54`, `voxcpm57`, `omlx58`, `localfetch86` | web, ios, android |
| `/api/me/*`, `/api/mobile/*`, `/api/app/*`, `/api/bg/*` | ~50 | `mobile.js`, `notify.js`, `profiles37`, `webx51`, `obs51`, `api40`(pages), `app-update`, `gphoto46`, `admin44`(mw) | alle |
| `/api/auth/*`, `/api/login`, `/api/logout`, `/api/setup` | 37 | index.js, `auth.js`, `auth40`(2FA), `auth41`, `auth44`(refresh), `qr38`, `sec51`, `reauth` | alle |
| `/api/security51/*` | 21 | `sec51` (+ `webauthn51`, `ratelimit51`, `logguard51`) | web, ios, android, kal_* |
| `/api/tracking/*` | 29 | `tracking46`, `tracking41`(api41), `tracking42`, `tracking-keys37`, `tracking.js` | web, ios, android |
| `/api/brief*` | 11 | `jul40`(mw), `brief41`(mw, api41), `brief38`, `brief34`, `srv52`(brief52), `brief73`, `cards38` | web, ios, android |
| `/api/chat/*` | 32 | `dal53`(moderator-mw), `claude-import43`, `chat.js` (+ `chat41/50/51/52`, `chat-tools41`) | web, ios, android, wear |
| `/api/hjemlys/*` (+ alias `/api/velfremme/*`) | 18 | `api42`, `hjemlys41`(mw+api), `hjemlys40` | web, fhweb, ios, android |
| `/api/matplan/*` og `/mat/api/*` | 35+35 | samme `mat.js`-app montert to ganger | web (`/api/matplan`), fhweb/ios/android (`/mat/api`) |
| `/api/domains/*`, `/domains/api/*`, `/api/gsc/*` | 31 | `gsc43`(mw), `domains-glimt`, `gsc45`(mw), `domains.js` | web, android |
| `/api/rss/*`, `/api/news/*` | 32 | `news46`, `rss.js`, `news73`, `news40` | web, ios, android |
| `/api/integrations` + `/api/integrasjoner` | 6+6 | `media44`(status), `integrations-api` – samme app to ganger | bare engelsk navn brukes |
| `/api/study/*` + `/api/studie/*` | 11+10 | `study44/45/46/55` | bare `/api/study` brukes |
| `/api/space/*` + `/api/rom/*` | 4+6 | `space32` | bare `/api/space` brukes |
| `/home/api/*` | 6 | `home.js` | **ingen klient** |
| Andre | resten | `api36` (dashboard-layout), `api37` (profiler, bibel), `live89`, `medfam51/`, `medctl51`, `kart46`, `birthdays(41)`, `weather*`, `icons`, `tiles` … | |

### 1.3 Databaser

- **`data/homelab.db`** – én fil for alt (Homelab og FinansHub; `finans/db.js` bruker samme `db`). 202 tabeller fordelt på prefiks:
  `fh_*` 44, `skj_*` 13, `family_*` 10, `hl_*` 10, `search*` 14 (FTS), `ai_*` 7, `glimt*` 11, `hjemlys_*` 6, `obs51_*`/`ops51_*` 8 … (full
  liste i `$S/audit-server/schema.txt`). Mange tabeller bærer promptnummer i navnet (`fh_tx_history40`, `fh_refresh44`, `imp44_*`,
  `crash51`, `quality64_runs` …).
- **`kv(user, key, value)`** – JSON-blobber per bruker. ~220 ulike statiske nøkler i koden; brukes til innstillinger (`cfg`, `cfg_personal`
  med krypterte hemmeligheter), migrasjonsflagg (`fh_mig_05`, `tasks37_v1`, `profiles37_v1` …) og **hele lister** (f.eks. lokale
  kalenderhendelser `kal_local_events`, `calendar.js:309,671`, opptil 2 000 elementer lest/skrevet som én blob).
- `brreg51` (Enhetsregisteret) som egen read-only SQLite (`receipts48/brreg51.js:89`). Backup/vedlikehold åpner kopier
  (`backup51.js`, `dbmaint51.js`, `system-backup.js`).
- Filer i `DATA_DIR`: `uploads/`, `avatars/`, `backgrounds/`, `media/`, `skjold76/`, `glimt-reports/`, `system-backups/` m.fl.
- Ingen migreringsversjonering: hver modul sjekker `pragma_table_info` / `kv`-flagg ved import (f.eks. `db.js:79`, `finans/db.js:17–40`).

### 1.4 Dataflyt til klientene

| Klient | Autentisering | Kanal |
|---|---|---|
| Web (`public/`) og Mac-Kalender (WKWebView på `/kalender?app=mac`) | Cookie `hl_sid` (httpOnly, SameSite=Lax), valgfri «husk enhet»-cookie | REST `/api/*`, WebSocket `/api/ws` (`realtime.js`), Web Push (`webpush.js`) |
| FinansHub-web (`public/finans`) | samme cookie | `/finans/api/*`, `/mat/api/*`, SSE for jobber |
| iOS/Android «Homelab/FinansHub»-appen | Bearer `fh_pat_…` fra `POST /finans/api/login` (HMAC-lagret i `fh_tokens`) | `/api/*` og `/finans/api/*`, `/api/ws?token=`, APNs (`apns.js`, `live89.js`) |
| Kalender iOS/Android/Mac (native deler) | companion-token (`fh_companion_tokens`, `kalender33.js`) + refresh-token (`auth44.js`) | `/api/kalender/*`, `/api/assist`, `/api/birthdays` |
| Watch (`apps/ios/Watch51`) og Wear | QR-økt (`/api/auth/qr/session`) → Bearer | 8 endepunkter (sjekk inn, avganger, mediekontroll, chat) |

Forretningslogikk på serveren er i dag spredt over lag: f.eks. dagsendring i Trading 212 beregnes i `index.js:454–463`, Kalenderens
«fire kalendere» i `kal39.js`, fagfarger i `kal37.js`. Klientene får ferdigberegnede felt, men felt legges på i flere lag (se §2.2).

## 2. Lagvise serverfiler (nummersuffiks)

### 2.1 Familier og forslag til navn

«imp» = antall serverfiler som importerer fila. Alle 371 filer importeres av noen; ingen hel fil er død. Bare
`ollama-gate.js` (re-eksport av `ai-gate.js`) og `receipts48/engines/gemini.js` importeres kun av tester (gemini.js kan lastes dynamisk – ikke verifisert).

| Familie | Filer (linjer, imp) | Hva de gjør / overlapp | Forslag |
|---|---|---|---|
| `api36…api45` | api36 (152, 1), api37 (26), api38 (12), api39 (15), api40 (107), api41 (96), api42 (37), api43 (18), api45 (31) | Rene «koblingsfiler» som bare re-eksporterer eller monterer det promptens moduler laget. Ingen egen logikk utover api36/api40/api41. | Fjernes; hver domenemodul eksporterer én router som monteres i en `routes.js`. |
| `media43/44/45/50` (+ `media43-mock`) | 1 410 / 526 / 140 / 753 (+499) | 43 = Sonarr/Radarr/qBit/Prowlarr-klient og alle grunnruter; 44 = flere servere/steder, søk som jobb, overstyrer `POST /release` og `GET /status` med `next()`-fallback (`media44.js:465–468`); 45 = uovervåkede filer; 50 = bildecache, sporing, `/bilde`, mellomvare som skriver om svar fra 43. Fire handlere på mange av de samme stiene (f.eks. `POST /api/media/servers` ×4 i `app.routes`). | `media/arr-client.js`, `media/routes.js`, `media/servers.js`, `media/images.js`, `media/mock.js` |
| `auth / auth40 / auth41 / auth44` + `api-auth46`, `qr38`, `sec51`, `reauth`, `secret86/91`, `ratelimit51`, `webauthn51` | auth.js 466 (100 imp) | 40 = 2FA-oppsett i appen; 41 = discovery + Kalender-innlogging + logout-mellomvare; 44 = refresh-token; 46 = 401-kode/404 for app-token; 86 = serverhemmelighet; 91 = hemmelighet i systembackup. | `auth/session.js`, `auth/totp.js`, `auth/app-tokens.js`, `auth/companion.js`, `auth/qr.js`, `auth/passkeys.js`, `auth/server-secret.js` |
| `kalender33/35/36g/41`, `kal37/39/44`, `calendar*.js`, `subs-cal42`, `ical-expand` | 13 filer, ~4 000 linjer | 19 `app.route/use` på `/api/kalender`. Hendelser passerer `kalEventsMw44` → `kalEventsMw` (33) → `calendar.js`; kalenderlista passerer to mellomvarer (media43, subs-cal42) før `cals39Api` → `kalCalendarsApi` → `calendarApi`. 17 svar-omskrivinger i kal44+kalender33. | `calendar/{sources,events,calendars,invites,widgets,glimt}.js` |
| `tasks / tasks43`, `tasks-glimt37/40/41/42`, `tasks-ha`, `misc45` | 9 filer | 7 monteringer på `/api/tasks` inkl. to mellomvarer fra api40. | `tasks/{routes,order,glimt,ha}.js` |
| `tracking / 37 / 42 / 46`, `tracking-keys37`, `tracking-carriers` | 6 filer | 5 monteringer på `/api/tracking`; 46 har hardkodede klienthemmeligheter. | `tracking/{routes,carriers,accounts,household-keys}.js` |
| `weather / 35 / 39 / 41`, `weather-full`, `weather-places`, `here46`, `sun36` | 8 filer | 4 monteringer på `/api/weather`. | `weather/{yr,places,week,full,sun}.js` |
| `brief34/38/73`, `cards38`, `jul40`, `srv52` | 6 filer | 2 mellomvarer + 2 apper på `/api/brief`, + `/api/brief52` og `/api/brief-cards`. | `brief/{generate,cards,seasonal}.js` |
| `chat / 41 / 50 / 51 / 52`, `chat-tools41`, `chat-scans` | 7 filer | Vedlegg, bilder, tankegang, auto-modell lagt i hver sin fil. | `chat/{routes,attachments,models,tools}.js` |
| `study44/45/46/55` | 4 filer, 1 337 linjer | 45, 46 og 55 er tre runder med fiks av vitnemålslesing; to prefikser (`/api/study`, `/api/studie`). | `study/{documents,diploma-parser}.js` |
| `family / family50`, `zone45`, `health42/45`, `medfam51/` | | `family50` monteres før `family.js` og overtar deler av de samme stiene. | `family/{places,people,health,checkin,zones}.js` |
| `hjemlys40/41` (+ alias velfremme) | | Funksjonen heter nå «Vel fremme», koden «hjemlys». | `vel-fremme/` |
| `gsc43/45`, `health42/45`, `ai39/41`, `birthdays/41`, `glimt35/39-fag`, `news40/46/73`, `secret86/91` | | Hver nyere fil er en fiks eller utvidelse av den eldre. | slås sammen per domene |
| Ett-prompt-moduler | `admin44`, `sec51`, `qa51`, `ops51`, `obs51/`, `webx51`, `live89`, `domain89` (23 l), `server47` … | Funksjonelt egne moduler, bare navnet er problemet. | `admin/impersonation.js`, `security/`, `feature-flags.js`, `ops/`, `observability/`, `search.js`, `live-activities.js`, `default-domain.js` |

### 2.2 Overstyringer og rekkefølge-avhengigheter

- **Svar-omskriving etter `next()`**: 88 steder i 28 filer (`c.res.clone().json()` eller `c.res = c.json(...)`). Topp: `kal44.js` 9,
  `kalender33.js` 8, `media43.js` 5, `media50.js` 5, `finans/p40.js` 5. Hvert lag parser JSON på nytt og legger på felt. Eksempel:
  `/finans/api/summary` passerer `summaryMw43` som legger til `spentMonth/day/daysInMonth` på svaret fra `routes.js`.
- **«Ny handler først, gammel som fallback»**: f.eks. `media44.js:465` (`POST /release` → `next()` til media43), `finans42`
  (`GET /transactions` filtrert ellers `next()`). `GET /finans/api/transactions` har 4 handlere, `POST /finans/api/import` 4.
- **Intern omdirigering via `app.fetch(new Request…)`**: 20 steder (bl.a. `/api/velfremme/*`, `/api/homes/*` → `/finans/api/folders/*`,
  `/api/system/version`, `/finans/share`). Hver slik forespørsel går gjennom hele mellomvarekjeden to ganger (tracing, rate limit,
  impersonering).
- **Samme app montert under to prefikser** (alias): `mat.js` (`/api/matplan` + `/mat/api`), `integrations-api` (`/integrations` +
  `/integrasjoner`), `systemUpdateApi` (`/api/system/update` + `/api/update`), `calendarQuickApi` (`/api/kalender/quick` +
  `/api/calendar/quick`), `space32` (`/api/space` + `/api/rom`), `domainPill` (`/api/domains/summary` + `/api/domener/sammendrag`).
  Klientbruk av aliasene: `/api/update` 2 av 17 ruter, `/api/studie` 0/10, `/api/integrasjoner` 0/6, `/api/rom` 0/6, `/home/api` 0/6,
  `/api/domener` 0/1 (vedlegg A2).
- **Mellomvare montert på en sti uten GET-handler**: `app.use('/api/kalender/events', kalEventsMw44)` mens listen er `GET /api/kalender`.
- **Rekkefølge er kontrakt**: 28 kommentarer i `index.js` av typen «(før /api/kalender)», «må stå før /api/logout og /finans/api».
  Å flytte én linje endrer oppførsel uten at noe feiler ved oppstart.

### 2.3 Død kode

- **Endepunkter uten klienttreff**: 155 av 1 648 (vedlegg A2). Av dem er ca. 60 alias-prefikser (over), 52 i `/finans/api` (bl.a.
  eldre import-/OCR-varianter), sider/well-known (bruksriktige). 354 endepunkter har bare treff via et sti-prefiks og bør sjekkes for hånd.
- **Ubrukte eksporter**: 108 navngitte eksporter som ingen fil (server, test, skript) importerer (vedlegg A3). Flest i `space32.js` (10),
  `fermion53/index.js` (7), `omlx58/index.js` (6), `hjemlys41.js` (5), `admin44.js` (4).
- **Klientkall uten serverrute** (`reverse.mjs`): `POST /finans/api/logout` (Kalender iOS/Mac/Android – bug B1),
  `POST /api/media/qbit/torrents/pauseAll|resumeAll` (`apps/ios/Shared/Media43Shared.swift:141,160` – prøver feil sti først, faller
  tilbake), `GET /api/ready` (`public/js/starting36.js:43` – tåler 404).

## 3. API-kontrakt

### 3.1 `shared/schemas`
To filer: `receipt.schema.json` og `receipt-ocr.schema.json` (3,5 KB). Brukes av `server/receipts48/schema.js`, `ReceiptOcr48.kt`,
`Receipt48*.swift` og én test. Ingen valideringsbibliotek (ajv/zod) i `package.json`; resten av API-et (1 646 endepunkter) har ingen
maskinlesbar kontrakt. Formene står spredt i markdown (`docs/api.md`, `docs/wiki/API.md`, kommentarer «formene står i SERVER45-API.md»).

### 3.2 Feilsvar

| Form | Forekomst | Eksempel |
|---|---:|---|
| `{error: '<norsk tekst>'}` + status | 1 061 i 134 filer | `{"error":"Fant ikke hendelsen"}` 404 |
| `{error, code}` (+ `reason`) | `code` i 3 stiler: `HOMELAB_AUTH`, `not_found`/`not_configured`, `ESIZE`, `rate` | `/api/state` uinnlogget: `{"error":"Ikke innlogget","code":"HOMELAB_AUTH","reason":"none"}`; `/api/kalender/calendars`: `{"error":"Ikke innlogget"}` |
| `{ok:false, error}` | 24 i 14 filer, noen med **200** | `finans/p27-routes.js:123` |
| Flagg ved siden av | `restricted:true`, `unreadable:true`, `expired`, `reconnect:true`, `needsTotp` | `index.js:246,285`, `calendar.js:661` |
| **Ren tekst 404** | alle ukjente stier og `c.notFound()` (78 steder) | `GET /api/finnesikke`, `/finans/api/transactions/99999`, `/api/tasks/99999` → `404 Not Found` text/plain |
| `{error:'Finnes ikke på serveren: …', code:'NOT_FOUND'}` | bare app-token mot ukjent `/api` | `api-auth46.js:55` |

Ingen `{feil}` i serverkoden (0 treff). 401 har tre former avhengig av prefiks (målt over).

### 3.3 Paginering
Ingen cursor/`hasMore`/`nextCursor` (0 treff). `limit` leses 29 steder, `offset` 3 steder (bare `claude-import43.js:171`). Lister kuttes
med harde tak: `/finans/api/transactions` standard 500, maks 2 000 (`finans/routes.js:697`) – med flere transaksjoner er resten
uoppnåelig uten datofilter; `finans42.js:181` `LIMIT 20000`. 15× `LIMIT 200`, 12× `LIMIT 500`.

### 3.4 Tid
Målt på svar fra testserveren:
- `updatedAt` er **ms-epoch** i `/api/tasks`, `/api/tracking`, `/api/family`, men **ISO-streng** i `/api/rss`, `/api/widgets/calendar`, `/api/brief`.
- `created` er ms i `/api/birthdays`, ISO i lokale kalenderhendelser (`calendar.js:669`).
- `/api/brief` feltet `t` er ISO **uten tidssone** (lokal tid).
- Datoer uten tid som `YYYY-MM-DD` (konsekvent). DB: `INTEGER` ms (`sessions.created`, `fh_tokens.created`) og ISO-tekst om hverandre.

### 3.5 Valuta
- FinansHub lagrer øre som heltall (`finans/db.js:2`), API-et sender **kroner som float** (`amount: t.amount / 100`, `routes.js:129`);
  innkommende beløp i kroner konverteres med `ore()`. Eksempler: `"amount":-1284`, `"amount":44.8`, `price:239`.
- Gamle `receipts`-tabellen (`db.js:47`, `/api/receipts`) lagrer `amount REAL` i kroner – to systemer for kvitteringer.
- Backup-eksport (JSON) er i øre (`finans/backup.js:61`), Excel i kroner.
- Andre felt med «total» er ikke penger (`memTotal` bytes i `/api/mobile/home`).

**Anbefaling til kontrakten:** én feilform `{error:{code,message,details?}}` også for 404/401, ISO 8601 med sone (eller ms) konsekvent,
beløp som heltall øre + `currency`, cursor-paginering, JSON Schema/OpenAPI per domene i `shared/schemas`, generert til TS/Swift/Kotlin.

## 4. Ytelse

### 4.1 Responstid (testserver, mock-data, 15 kall, ms)

| Endepunkt | p50 | maks | KB |
|---|---:|---:|---:|
| `/api/brief` | 94 | 144 | 10.9 |
| `/api/widgets/calendar` | 85 | 131 | 10.2 |
| `/api/kalender?from=2026-11-01&to=2026-11-30` | 83 | 160 | 58.4 |
| `/api/kalender` (hele året) | 104 | 120 | 223 |
| `/api/brief/widget` | 70 | 94 | 0.6 |
| `/finans/api/transactions` | 48 | 95 | 83 |
| `/api/mobile/home` | 35 | 48 | 18.6 |
| `/finans/api/summary` (= `/overview`, identisk svar) | 23 | 49 | 13.1 |
| `/api/kalender/calendars` | 21 | 34 | 3.8 |
| `/api/tracking` | 13 | 27 | 23 |
| `/api/weather` | 12 | 54 | 2.2 |
| `/api/media/calendar` / `series` / `now` | 10 / 5 / 2 | 30 / 22 / 3 | 12.8 / 7 / 0.7 |
| `/api/state`, `/api/tasks`, `/api/family` | 3 | 34 / 5 / 22 | 3–6 |

Sveip over alle 490 parameterløse GET (`sweep.mjs`): 450× 200, ingen over 125 ms i mock. Tredje-tregest er `/api/system/logs/groups` (114 ms).

**Skalert test** (20 116 transaksjoner satt inn i en kopi, `prof5.mjs`): `/finans/api/summary` 23 → **66 ms**,
`/finans/api/transactions` 48 → **172 ms**, `?limit=2000` → **547 ms**, `?q=rema` 123 ms. Node er entrådet, så alt annet venter i mellomtiden.

### 4.2 Årsaker (målt med CPU-profil og telling av `prepare`/`kv.get`)

1. **N+1 mot `kv` og ingen statement-gjenbruk.** `kv.get` gjør `db.prepare()` hver gang (`db.js:84`), og 20 filer har
   `const q = (sql) => db.prepare(sql)`. 513 `db.prepare(` i koden, ingen cache. Mikromåling: 9,7 µs per `kv.get` mot 1,3 µs med gjenbrukt statement.
   | Forespørsel | `prepare` per kall | Hovedkilde |
   |---|---:|---|
   | `GET /api/kalender` (1 mnd) | 2 174 | `kal39.js:52` `st()` leses 3× per hendelse fra `resolveCalendar` (`kalender33.js:147–152`, via `decorate` 213); `layoutOf` per hendelse i `kal37.js:47` (`subjectColor`) + `study_subject_colors` per hendelse |
   | `/api/widgets/calendar` | 2 695 | samme |
   | `/api/brief` | 1 264 | samme kalenderkode + `cfg()` |
   | `/finans/api/summary` | 1 099 | `period()` (`routes.js:174`) kaller `settings()` (`finans/db.js:383–395`) som leser `cfg_personal` + `cfg` + dekrypterer per kall, ~12× per måned i serien |
   | `/finans/api/transactions?limit=2000` | 4 735 | `txOut` → `addedOf40` per rad: `SELECT * FROM users WHERE id=?` + `kv` (avatar) for hver transaksjon |
2. **`Intl.DateTimeFormat` lages per kall**: `tracking.js:228–229` (`hhmm`, `ddmm`) – 257 ms selvtid i profilen over 69 forespørsler.
   `ical-expand.js:83` `localParts` (586 ms) og `calendar.js:122` `oslo` (273 ms) bruker `formatToParts` per hendelse.
3. **Manglende indekser** (`noidx.mjs`, `fk.mjs`, `eqp.mjs`): 1 489 SQL-strenger kjørt gjennom `EXPLAIN QUERY PLAN`, 214 har full skanning.
   - 19 fremmednøkler uten indeks, bl.a. `fh_receipts.transaction_id`, `fh_folder_entries.{tx_id,folder_id,receipt_id}`,
     `fh_transactions.{category_id,account_id}`, `fh_subscriptions.tx_id`, `fh_finn.tx_id`. Følge: hver `DELETE FROM fh_transactions WHERE id=?`
     (`routes.js:786`) skanner `fh_receipts`, `fh_folder_entries`, `fh_subscriptions` og `fh_finn` for FK-sjekk.
   - `fh_folder_entries` 33 skannende spørringer, `fh_folder_members` 18 (`WHERE folder_id=? AND user_id=?`, `homes42.js:129`),
     `hl_task_lists` 12 (`owner`), `fh_tokens` 8, `sessions` 5 (`DELETE … WHERE user=?`), `devices` 5.
   - 33 tabeller med `user`/`user_id`/`owner` uten indeks (bl.a. `sessions.user`, `devices.user`, `fh_tokens.user_id`, `hl_chat_files.user_id`, `skj_files.user_id`).
   - `GET /api/files/:name` slår opp eier med skanning av `receipts` og **hele `kv` med `instr(value, ?)`** (`index.js:309–316`).
4. **Store, ukomprimerte JSON-svar**: gzip bare på `/assets/*` (`cache-bust.js:113`). Største API-svar: `/api/skjold/labels` 365 KB,
   `/api/space/tle` 176 KB, `/finans/api/stocks` 101 KB, `/finans/api/transactions` 83 KB, `/api/weather/full` 80 KB, `/api/kalender` 74 KB
   (223 KB for et år). `/finans/api/logos/registry` 77 KB uten innlogging.
5. **Synkront tungt arbeid i forespørsel**: `scryptSync` ved innlogging/`checkPassword` (`password.js:11,21`, 442 ms selvtid i profilen,
   blokkerer hele serveren per innlogging); 95 `readFileSync/execSync/spawnSync`-kall (bl.a. `backup51.js`, `system-backup.js`);
   `deflateSync` for kartfliser (`tiles.js:56`).
6. **Dobbelt arbeid i lagene**: svar-omskrivinger parser og serialiserer JSON på nytt (88 steder); `summary` og `overview` beregner det samme.
7. **Cache**: Det finnes lokale cacher (kalender `clearCalendarCache`, media `clearMedia43`, domene-pille 5 min, ikoner på disk, ETag i
   `kal44.js:78`), men ingen felles cache-lag og ingen `ETag/304` på de tunge API-ene (`/api/kalender` svarte uten ETag).

**Gevinst-estimat:** statement-cache + én `kv`-lesing per forespørsel og bruker (memo i request-ALS) fjerner trolig 15–30 ms av 60–85 ms
på kalender/brief; `addedOf40` med én brukeroppslag-map gjør `transactions` lineær i SQL i stedet for i JS-oppslag. (estimat)

## 5. Sikkerhet i forbifarten

| Alvor | Funn | Sted |
|---|---|---|
| Høy | Kalender-utlogging tilbakekaller ikke tokenet (404, se B1). | `KalStore.swift:228,261`, `MacStore.swift:177`, `KalVm.kt:245` |
| Middels | Hardkodede OAuth-klient-ID-er og **klienthemmeligheter** for Posten og Bring, og PostNords gateway-nøkkel, hentet fra de offisielle appene. Kommentaren kaller det «delt app-materiale». Juridisk/vilkårsrisiko og ligger i git. | `server/tracking46.js:32,38,42,43` |
| Middels | App-tokens fra `POST /finans/api/login` lagres uten `expires` (utløper aldri, bare manuell tilbakekalling). | `finans/routes.js:497` |
| Lav | `/api/discovery` (uten innlogging, `Access-Control-Allow-Origin: *`) viser lokal IP (`"local":["http://192.0.2.2:4920"]`). | `auth41.js:179` |
| Lav | Media-webhook godtar kall uten token direkte fra LAN; token i spørrestreng og sammenlignet med `!==` (ikke konstanttid). | `media43.js:1247–1248` |
| Lav | Brukernavnet «sebastian» er hardkodet som standard for bibelvers. | `bible37.js:63,71` |
| Info | Tilgang: 20 av 534 parameterløse GET svarer uten innlogging (alle forventet: health, version, cv, manifest, logo-register). Som vanlig bruker ga ingen admin-ruter data (10 svarer 200 med egne/tomme data). `:id`-ruter med id 1/2 ga samme svar til eier og vanlig bruker bare for sone-ikoner (delt i familien) og `/join/:token`-siden. | `unauth.mjs`, `idor.mjs` |
| Info | Økt- og app-tokens lagres som HMAC (`auth.js:341`, `fh_tokens.id`), cookies er `httpOnly`, `SameSite=Lax`, `secure` bak https. Ingen andre nøkler funnet med mønstersøk (AIza, sk-, ghp_, AKIA, private keys). | |

## 6. Bugs (server)

| # | Alvor | Plattform | Beskrivelse | Reproduksjon |
|---|---|---|---|---|
| B1 | **Høy** | Kalender iOS/Mac/Android | Appene kaller `POST /finans/api/logout`; serveren har bare `POST /finans/api/auth/logout` og `POST /api/logout`. Svar 404, tokenet fortsetter å virke. | `curl -X POST -H "Authorization: Bearer $TOK" …/finans/api/logout` → 404; `GET /api/me` med samme token → 200. Med `/finans/api/auth/logout` → 200 og deretter 401. |
| B2 | Middels | Server | 16 tidtakere startes ved import uten `BG51`/`OPS51_SANDBOX`-sperren (10 er ufarlige minneopprydninger). Disse 6 har sideeffekter: planlagt SMB-backup `finans/backup.js:681`, brief-generering `brief34.js:347`, iCal-oppdatering `kalender35.js:266`, skolekalendere `kal39.js:351`, sjekk-inn-påminnelser `family50.js:460`, «forlot»-sjekk `family.js:299`. Kommentaren i `index.js:686` lover at sandkassen ikke kjører backup eller varsler. | Start med `OPS51_SANDBOX=1` og en kopi av DB med SMB-backup på: `due()` kjøres hvert 5. min. |
| B3 | Middels | Alle | Ukjente stier og «finnes ikke» gir `text/plain` «404 Not Found», mens klientene forventer JSON (`r.json()` kaster). | `GET /api/tasks/99999`, `/finans/api/transactions/99999` |
| B4 | Middels | FinansHub | Transaksjonslisten har tak på 2 000 uten paginering; eldre transaksjoner er bare tilgjengelige med datofilter. | `routes.js:697` |
| B5 | Lav | iOS | Pause/fortsett alle torrenter prøver først en sti som ikke finnes (`/api/media/qbit/torrents/pauseAll`), ekstra rundtur hver gang. | `Media43Shared.swift:141,160` |
| B6 | Lav | Server | `POST /api/grades` setter `sort` fra `MAX(sort)` over **alle** brukeres karakterer, ikke brukerens. | `index.js:406` |
| B7 | Lav | Server | Ved nedstenging venter `server.close()` på åpne WebSocket-forbindelser, så den når nesten alltid 5 s-tidsgrensen. | `index.js:729–738` |
| B8 | Lav | Server | `/finans/api/summary` og `/finans/api/overview` gir identisk svar (13 459 B) – dobbelt vedlikehold. | |
| B9 | Lav | Web | `public/js/starting36.js:43` spør `GET /api/ready`, som ikke finnes. | |

## 7. Anbefalt retning (kort)

1. Én `server/routes.js` som monterer én router per domene (`auth`, `finans`, `calendar`, `media`, `family`, `tasks`, `glimt` …), uten
   rekkefølgeavhengige lag; lagene i §2.1 slås sammen per domene.
2. Felles tilgangsvakt (`requireUser`, `requireAdmin`, `requireScope`) i stedet for 13 varianter.
3. Data-lag: statement-cache (`db.prepare` én gang per SQL), `kv` lest én gang per forespørsel, migreringer i nummererte filer
   (`server/migrations/NNN_*.sql`) i stedet for ved import, indekser for FK og `user_id`.
4. Kontrakt i `shared/schemas` (OpenAPI/JSON Schema), felles feil-/tid-/beløpsformat, cursor-paginering, gzip/ETag på `/api`.
5. Bakgrunnsjobber registrert ett sted (én planlegger med sandkasse-sperre).

## Spørsmål til brukeren

1. Brukes aliasene `/api/update`, `/api/studie`, `/api/integrasjoner`, `/api/rom`, `/api/domener`, `/home/api` og `/api/velfremme` av noe
   utenfor repoet (skript, Home Assistant, snarveier)? I repoet har de nesten ingen klienttreff.
2. Er Posten/Bring/PostNord-integrasjonen med de innebygde app-hemmelighetene noe du vil beholde?
3. Skal app-tokens fra mobil-innlogging få utløpstid (med refresh), som Kalender-appene har?
4. Skal den gamle `receipts`-tabellen (`/api/receipts`, beløp i kroner) leve videre ved siden av FinansHub-kvitteringene?
