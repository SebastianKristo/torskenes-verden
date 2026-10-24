# RECEIPT48 – avvik mellom dagens kvitteringskode og målformatet (prompt 48)

Dette var en ren lesejobb. Ingen filer i repoet er endret. Alle stier er relative til `/home/user/torskenes-verden`.

## Kort oppsummert

- **Felles OCR-format finnes ikke i dag.** iOS og Android lager bare *tekst*: rader skilt med `\n`, og kolonnene i en rad skilt med TAB. Ingen av dem sender bbox, konfidens, `image_size` eller `ms`. iOS sender dessuten bare OCR-tekst når Apple Intelligence har tolket kvitteringen. Ellers sendes bildet, og iOS bruker aldri `/receipts/ocr-text`.
- **Kvitteringsformatet ligger nær målet** (`SCHEMA`/`validate()` i `server/finans/ai.js`), men noen feltnavn avviker: `lines`↔`items`, `discounts.text`↔`description`, `suggested_category`↔`category_suggestion` og `unitPrice`↔`unit_price`. bbox er i prosent (0–100), ikke 0–1. Ingen hard validering av org.nr. (mod11) eller mva i AI-sporet.
- **Kjeden i dag er bilde → Gemini → Groq → Ollama (qwen2.5vl) → Tesseract** (eller tekst → Gemini/Groq/Ollama). Kjeden A→B→C→Tesseract→D finnes ikke. Gemini står *først* som standard, ikke sist.
- **Nettverk:** serveren kjører i Docker i en Proxmox-LXC (`10.69.1.39:3000`). Ollama/Mac mini er en annen maskin. **`127.0.0.1:8765` på Mac mini-en kan ikke nås fra serveren.** Mac-OCR-tjenesten må lytte på LAN-adressen og ha et token.

---

## 1. iOS (FinansHub-appen)

### Hvordan flyten er i dag
- Dokumentskanneren `VNDocumentCameraViewController` (automatisk beskjæring og perspektivretting) brukes når enheten støtter den. Ellers brukes vanlig kamera. Se `apps/ios/FinansHub/Sources/Receipts23.swift:195-206` og `:598-620`.
- Flere sider er én kvittering: `Receipts23.swift:209-215`.
- Vision-OCR og tolking på telefonen kjører **bare** når bryteren «Tolk kvitteringer på iPhone» er på. Den er av som standard (`Receipt47Engine.swift:77-96`, `Store.swift:1241-1253`).
- Er Foundation Models utilgjengelig eller feiler, går *bildet* til `/receipts` via `Receipt47Views.swift:50-66`, og OCR-teksten kastes. **iOS kaller aldri `/receipts/ocr-text`.** Serveren godtar `ios-vision` der (`server/finans/receipts47.js:32`), men ingen klient bruker det.
- Vision-oppsett (`Receipt47Engine.swift:256-272`):
  - `recognitionLevel = .accurate` og `usesLanguageCorrection = true`.
  - Språk: `nb-NO, no-NO, nn-NO, da-DK, sv-SE, en-US`, filtrert mot `supportedRecognitionLanguages()`, med `en-US` som reserve.
  - Orienteringen fra `UIImage` sendes videre (`:241-253`).
- Radgrupperingen (`Receipt47Engine.swift:275-295`):
  - Rekkefølgen sorteres på `midY` synkende (koden tar hensyn til at Vision har origo nede til venstre, `:282`).
  - En ny bit havner i en rad når `|midY − første bit i raden| < 0,5·maks(h)`.
  - Bitene sorteres på `minX` og slås sammen med **TAB**. Sider skilles med `\n\n` (`:237`).
  - `boundingBox` og `confidence` leses, men kastes.
- Det som sendes er multipart `POST /finans/api/receipts/parsed` med `data` (JSON), `file` og `thumb` (`Receipt47Views.swift:88-96`). Bygges i `Receipt47Engine.swift:173-192` med **norske feltnavn**: `source:"apple-fm"`, `tolketAv`, `butikk`, `dato`, `totalsum`, `valuta`, `mva` (ett tall), `varelinjer[{navn, pris, antall?}]`, `kategori`, `betalingsmiddel` og `ocrText`.
- Kontroll på telefonen (`Receipt47Engine.swift:117-152`):
  - butikk må finnes
  - datoen må være gyldig, ≥ 2000-01-01 og ikke i fremtiden
  - total > 0
  - linjesummen må stemme med totalen innenfor ±1 kr
- Køen når appen er uten nett: `UploadQueue18.swift`. Filen ligger i Application Support, og `parsed47` følger med i køen. `flushPending` sender til `/receipts/parsed` og faller tilbake til `/receipts` ved 404/405 (`:55-71`, `:76-118`). Køen tar seg også av «Venter på Wi-Fi» (`Store.swift:1254-1273`).
- Vanlig opplasting: `file` (original eller 1600 px), `scan` (1600 px JPEG 85 %) og `thumb` (240 px) via `Store.swift:1321-1328`.

### OCR-format: målfelt mot dagens iOS-kode

| Felt i målformatet | Hva som finnes i dag | Avvik | Hva som må til |
|---|---|---|---|
| `source: "ios_vision"` | `"apple-fm"` / `tolketAv:"apple-on-device"` (Receipt47Engine.swift:174). `ios-vision` godtas av serveren, men sendes aldri. | Feil verdi og bindestrek i stedet for understrek. OCR-tekst sendes aldri for seg. | Sende `ios_vision` alltid, også når FM ikke er tilgjengelig. |
| `lines[].text` | `topCandidates(1).first.string` (:278) | Brukes bare til å bygge en streng | Ta vare på hver observasjon |
| `lines[].confidence` | Ikke lest | Mangler | `candidate.confidence` (0–1) |
| `lines[].bbox [x,y,w,h]` 0–1, origo øverst til venstre | `boundingBox` lest (:279), men kastet. Origo nede til venstre. | Mangler, og må konverteres | `[minX, 1−maxY, width, height]`. Orienteringen er allerede sendt inn i handleren, så koordinatene er relative til det oppreiste bildet. |
| `rows[]` | Strenger skilt med `\n`. Kolonnene skilt med TAB, ikke mellomrom. | Grupperer mot første bit i raden, ikke mot overlappende y-intervall. TAB i stedet for mellomrom. | Ny gruppering: overlapp på y-intervall, sortering på x, sammenslåing med `" "`. Vurder å beholde TAB-varianten i `full_text`, for serverprompten forventer TAB (ai.js:719-721). |
| `full_text` | Hele teksten (`ocrText`, ≤ 40 000 tegn, :189-190). Sider skilt med `\n\n`. | Feltnavnet | `full_text` |
| `image_size [w,h]` | Ikke sendt | Mangler | `cg.width/height` etter orientering |
| `ms` | Ikke målt | Mangler | Ta tiden rundt `handler.perform` |
| Flere sider | Slått sammen til én tekst | Målformatet sier ikke noe om sider | Avgjøre: én OCR per side eller en `pages[]`-liste |
| Språk | nb/no/nn/da/sv/en, filtrert (:256-261) | OK | Vurder `usesLanguageCorrection=false` for tall/beløp (bør testes) |
| Forbehandling | VNDocumentCamera: beskjæring og perspektiv (Receipts23.swift:598-620). Ikke for bilder fra galleriet. | OK for kamera | Eventuelt `VNDetectDocumentSegmentation`/`CIPerspectiveCorrection` for bilder fra galleriet |

### Kvitteringsformat (`device_parse`): målfelt mot iOS-payload

| Målfelt | iOS i dag (Receipt47Engine.swift:173-192, 303-331) | Avvik | Hva som må til |
|---|---|---|---|
| `merchant` | `butikk` | Norsk navn (serveren godtar begge, receipts47.js:75) | Engelsk feltnavn |
| `org_number` | Finnes ikke | Mangler | Legg til i `@Generable` og valider mod11 |
| `date` | `dato` (ÅÅÅÅ-MM-DD, utelates når ugyldig) | Navnet | – |
| `time` | Finnes ikke | Mangler | Legg til (HH:MM) |
| `currency` | `valuta` | Navnet | – |
| `items[{description, quantity, unit_price, amount}]` | `varelinjer[{navn, antall?, pris}]` | Ingen `unit_price`. Navnene avviker. | Legg til `unit_price` |
| `discounts[{description, amount}]` | Finnes ikke. Rabatter filtreres ikke bort. | Mangler | Legg til |
| `subtotal` | Finnes ikke | Mangler | Legg til |
| `vat[{rate, amount}]` | `mva` er ett tall uten sats. Serveren lagrer det som `{rate:0}` (receipts47.js:109). | Feil struktur | Liste per sats |
| `total` | `totalsum` | Navnet | – |
| `payment_method` | `betalingsmiddel` | Navnet | – |
| `category_suggestion` | `kategori`, låst til `["Mat","Transport","Bolig","Helse","Klær","Elektronikk","Restaurant","Annet"]` (:78, :316) | **Passer ikke FinansHubs kategorier** (se punkt 6). `catIdByName` slår opp på eksakt navn (routes.js:151), så «Mat» treffer ikke «Mat og dagligvarer». Det reddes bare av `classify39`, som bruker fuzzy-likhet. | Kategorilisten må komme fra serveren (`/boot` eller ny `/receipts/health`) |

---

## 2. Android

### Hvordan flyten er i dag
- Avhengigheten er `play-services-mlkit-text-recognition:19.0.1` (`apps/android/app/build.gradle.kts:91`). Den er **ikke bundlet**: modellen lastes ned via Play-tjenester (`AndroidManifest.xml:60-61`, `DEPENDENCIES=barcode_ui,ocr`). Klienten er bare `TextRecognizerOptions.DEFAULT_OPTIONS` (Latin), se `ReceiptOcr47.kt:34`. Uten Play-tjenester feiler den med «Krever Google Play-tjenester» (`:44-46`).
- Lokal OCR kjører bare når innstillingen `PREF_OCR_LOCAL47` er på (standard av, `P47.kt:29`), for ett enkelt bilde (`ReceiptOcr47.kt:124-130`, kalt fra `AppViewModel.kt:1167`).
- Bildet leses med `InputImage.fromFilePath`, som håndterer EXIF-rotasjon (`ReceiptOcr47.kt:41`). **Ingen egen skalering.** ML Kit får originalen.
- Radgrupperingen `ReceiptTextFormatter47` (`ReceiptOcr47.kt:70-98`):
  - Den bruker ML Kit-*linjer* og bbox i piksler (`Rect`, origo øverst til venstre).
  - Toleransen er 0,5 · median linjehøyde, og den sammenligner med *snittet* av radens `centerY`.
  - Rader sorteres på `left` og slås sammen med TAB.
  - Bbox, konfidens og bildestørrelse kastes.
- Det som sendes (`ReceiptOcr47.kt:114-121`) er JSON `POST /finans/api/receipts/ocr-text` med `{text (≤ 20 000), lines: [rad som TAB-streng, ≤ 400 × 300 tegn], source:"android-mlkit"}`. Ved 404/405 lastes bildet opp i stedet (`:153-158`). **Bildet sendes ikke med OCR-teksten**, så kvitteringen lagres uten originalbilde, bare som `.txt` (receipts47.js:209).
- Køen når appen er uten nett:
  - Room finnes ikke.
  - **WorkManager finnes** (`build.gradle.kts:81`). `upload/PendingUploads.kt` er en filbasert kø (`filesDir/pending/<id>/meta.json` og `part*.bin`) med `PendingUploadWorker` og nettverkskrav (`:96-102`, `:125`).
  - Køen gjelder bare multipart-opplasting av bilder (`AppViewModel.kt:295`, `:1172`, `:1205`).
  - **OCR-teksten har ingen kø.** Feiler sendingen, vises Error med «Prøv igjen», og teksten ligger bare i minnet (`ReceiptOcr47.kt:165-167`).
- Vanlige deler: `file`, `scan` (1600 px, 85 %) og `thumb` (`AppViewModel.kt:1211-1230`).

### OCR-format: målfelt mot dagens Android-kode

| Felt i målformatet | Hva som finnes i dag | Avvik | Hva som må til |
|---|---|---|---|
| `source: "android_mlkit"` | `"android-mlkit"` (:117) | Bindestrek i stedet for understrek | Endre (og la serveren godta begge) |
| `lines[].text` | `line.getText()`, renset | Bare som del av en rad | Send hver ML Kit-linje |
| `lines[].confidence` | Ikke lest | Mangler | `Text.Line.getConfidence()` finnes i v2-API-et (bør sjekkes i 19.0.1) |
| `lines[].bbox` 0–1, origo øverst til venstre | `Rect` i piksler, lest og kastet (:78) | Ikke normalisert, ikke sendt | Del på `InputImage.width/height`. Origo er allerede øverst til venstre, men pass på at bredde og høyde gjelder bildet etter EXIF-rotasjon. |
| `rows[]` | `lines`-feltet er rader som TAB-strenger | Felt- og navnebruken er snudd: dagens `lines` er målformatets `rows`. TAB i stedet for mellomrom. Gruppering på senteravstand, ikke y-overlapp. | Ny `group()`: overlapp på y-intervall og sammenslåing med mellomrom. Funksjonen er ren og kan testes. |
| `full_text` | `text` | Navnet | – |
| `image_size` | Ikke sendt (`InputImage` har `width/height`) | Mangler | Legg til |
| `ms` | Ikke målt | Mangler | Legg til |
| Bildet | Sendes ikke med ocr-text | Målet er multipart med bilde + `device_ocr` | Send multipart: `image` + `device_ocr`. Serveren støtter allerede `file` i multipart (receipts47.js:188-197). |
| Skalering/EXIF | EXIF OK, ingen skalering | – | Vurder en grense (f.eks. 2000 px) for fart og minne |
| Kø ved offline | WorkManager-kø bare for bilder | OCR-tekst kan gå tapt | Legg OCR-JSON-en som en part i `PendingUploads` (den støtter vilkårlige parts) og bruk den nye ruten |
| Bundlet modell | play-services (unbundled) | Krever GMS | Valg: `com.google.mlkit:text-recognition:16.x` (bundlet, ca. +4 MB per arkitektur) hvis appen skal virke uten GMS |

Android har ingen parsing på enheten (`device_parse`). Android leverer alltid bare `device_ocr`.

---

## 3. Server

### Rutene
- Monteres under **`/finans/api`** (`server/index.js:182-185`). Målet sier `POST /api/receipts/scan`. Avgjør om ruten skal ligge under `/finans/api/receipts/scan` (der auth og `need('receipts:write')` allerede finnes) eller under `/api`.
- `POST /finans/api/receipts` → `receiptUpload` (`routes.js:878-946`). Tar imot `file`, `scan`, `thumb` og `accountId` og lagrer med `saveReceipt` (`:901-925`).
- `POST /finans/api/receipts/ocr-text` (`receipts47.js:185-217`):
  - Tar JSON eller multipart med `text|ocrText`, `lines` og `source ∈ {android-mlkit, ios-vision}` (`:32`).
  - `ocrText47` (`:44-55`) godtar `lines` som `string | {text}`. **bbox og konfidens kastes.**
  - Teksten lagres i `ocr_text47` (med bilde) eller som `.txt`.
- `POST /finans/api/receipts/parsed` (`receipts47.js:219-252`): bare `source = apple-fm`, validert av `parsedReceipt47` (`:69-158`).
- `GET /finans/api/health/ai` → `health()` (`routes.js:1644`, `ai.js:585-616`): status for Ollama, Gemini, Groq, Roboflow og Tesseract/ImageMagick/zbar. **`/receipts/health` finnes ikke**, men `health()` dekker det meste.
- Web/PWA: `public/finans/js/core.js:113-126` (`uploadReceipt`) sender `file`, `scan` og `thumb` til `/finans/api/receipts`. Ingen OCR i nettleseren.

### Kvitteringskøen og `processReceipt` (`routes.js:282-450`)
- Køen ligger i minnet og kjøres én om gangen (`:284-298`). Den tas opp igjen ved oppstart (`:453-459`). Ved tidsavbrudd med `onTimeout=queue` prøves det på nytt etter 5, 10 og 20 minutter (`:437-451`).
- Hvilken motor som brukes (`:356-357`):
  - Først `preParsed47` (apple-fm: ingen AI).
  - Ellers, med `ocr_text47`: `extractText(.., {kind:'ocr'})`.
  - Ellers, for `text/plain`: `extractText`.
  - Ellers: `extract(bilde)`.
- Etter tolkingen kjøres regel eller `classify39` (kategori, kan lage nye), `verify39`, bankmatch `findMatch` (±1 kr, ±3 dager, `:259-266`), `storeLines` (bbox, highlight30.js:25), sammendrag og `routeTarget`.
- `scanLog` (`server/finans/scan.js:39-50`) logger steg i `fh_receipts.scan_log`.

### Motorene og kallene (`server/finans/ai.js`)
- `PROMPT` og `SCHEMA` (`:14-46`) er felles for alle motorene. `validate()` (`:59-90`) normaliserer svaret.
- `TASKS.receipts.engine = 'gemini'` (`:99-104`). Med `fallback` (standard `AI_FALLBACK=gemini` → på, `db.js:336`) gjør `engineOrder` (`:224-233`) **Gemini først** for kvitteringer, så resten av `['ollama','gemini','groq']`.
- `extract()` (bilde, `:392-461`):
  - Roboflow-beskjæring, HEIC → Gemini.
  - Hver motor får ett nytt forsøk. Ved tidsavbrudd → `CHAIN = gemini → groq → ollama` (`:134-138`).
  - Ved lav sikkerhet → reserven.
  - `sumRetry39`: nytt kall med tilbakemelding når summen ikke stemmer (`:467-481`).
  - Til slutt **Tesseract**: `ocrReceipt` + regex, `needs_review` (`:445-458`).
  - `lowConfCheck` kan i tillegg kjøre Tesseract som kontroll (`:498-513`).
- `extractText(kind:'ocr')` (`:716-725`) → `textJson` (`:520-565`). Rekkefølgen er den samme (Gemini først). Regelen `finLocal` («Finansdata forlater aldri huset») og sky-budsjettet tvinger fram Ollama (`:525-533`).
  - Modellen for Ollama er `modelFor('rc', …)` (`ai-run.js:762-777`), og ruten `rc` er en **visjonsrute** (`ai-run.js:49`, standard `qwen2.5vl:7b`, `db.js:337`). **OCR-tekst går altså ikke til `qwen3:8b`** med mindre rutingen settes slik.
  - Ingen `sumRetry39` og ingen Tesseract-reserve i tekstsporet.
- Ollama-kallene går **via `server/ai-gate.js`** (`gateChat`, `ai.js:278-299`). Gaten har kø, gruppering per modell og strømming (`ai-gate.js:1-45`), og kan også gå via Open WebUI.
- Gemini og Groq kalles direkte med `fetch`, **ikke via ai-gate**:
  - Gemini: `geminiGenerate` (`ai.js:319-350`), modell `gemini-flash-latest` (`:210`) med automatisk valg av erstatter (`pickGemini`, `:311-317`), `thinkingBudget:0`, `responseSchema`. Nøkkelrotasjon i `server/finans/gemini-keys.js:49-76`.
  - Groq: `ai.js:354-366`.
- `providerName` (`:93`): gemini, groq, ollama, tesseract (`Lokal OCR`), roboflow og apple-fm.

### Tesseract (`server/ocr-fallback.js`)
- `tesseract … stdout -l nor+eng --oem 1 --psm 4 -c preserve_interword_spaces=1` (`:221-222`). Forbehandling med ImageMagick: auto-orient, gråtoner, resize, despeckle, deskew og adaptiv terskel (`:213-217`). Installert i Docker-imaget (`Dockerfile:10-15`).
- **Den gir bare ren tekst. Ingen linjer med bbox eller konfidens** (ikke `tsv`/`hocr`). `parseReceiptText` (`:186-198`) gir målformatet uten varelinjer (`lines: []`), med `raw_text`.
- Til målet: `tesseract … tsv` gir `left, top, width, height, conf` per ord og linje. Det kan normaliseres mot bildestørrelsen og grupperes til `rows` med samme funksjon som klientene.
- Nyttige funksjoner som kan gjenbrukes: `toAmount` (`:47`), **`mod11Ok`** (`:57-63`), `findDate` (`:106-120`, med poeng og vindu på fem år / ikke i fremtiden), `findStore`/`CHAINS` (`:123-161`) og `brregName` (Brønnøysund-oppslag, `:165-180`).

### Databasen
- `fh_receipts` (`db.js:94-112`):
  - Grunnkolonner: `id, file, scan, thumb, mime, status, provider, model, seconds, extraction (JSON), error, merchant, date, total (øre), category_id, account_id, confidence, transaction_id, created`.
  - Lagt til senere: `name, started, target, uploaded_by, source, meta, ai_short, ai_long, domain, user_id, retry_at/retry_n/timeout_engine`.
  - Andre filer legger til `scan_log` (scan.js:7), `line_boxes` (highlight30.js:15) og `ocr_text47` (receipts47.js:29). `receipt_reads` lagrer hver lesing (routes.js:1295).
- **Varelinjer, mva, org.nr., rabatter og klokkeslett har ingen egne kolonner.** Alt ligger i `extraction`-JSON-en (`validate`-formen). `line_boxes` er en kopi med bbox.
- Kategorier: `fh_categories(id, name, color, kind, sort, user_id)` (`db.js:73-79`, unik per bruker `:319`).

### Kvitteringsformat på serveren: målfelt mot `validate()` / `SCHEMA`

| Målfelt | Server i dag (ai.js:27-90, receipts39.js:48-67) | Avvik | Hva som må til |
|---|---|---|---|
| `merchant` | `merchant` (≤ 120) | OK | – |
| `org_number` | `org_number`, bare siffer, ≤ 9 tegn. **Ingen mod11 i `validate`.** Mod11 bare i Tesseract-sporet. | Mangler validering | Bruk `mod11Ok`, eventuelt `brregName` |
| `date` | Bare regex `^\d{4}-\d{2}-\d{2}$` i `validate`. Kalender-, fremtids- og ≥ 2000-sjekk **bare** i `parsedReceipt47`. | Svak i AI-sporet | Felles datosjekk (punkt 5) |
| `time` | `extras39.time`, `HH:MM` (receipts39.js:64) | OK | – |
| `currency` | `currency`, 3 tegn, standard NOK | OK | – |
| `items[]` | `lines[]` med `description, quantity, amount, bbox?` + `name, nameRaw, qty, unitPrice, discount, vatRate` | `items`↔`lines`, `unit_price`↔`unitPrice`. `quantity` er `null`, men `qty` blir 1 som standard. | Avbilde ved inngang/utgang, eller endre navn |
| `discounts[{description, amount}]` | `discounts[{text, amount}]`, positivt beløp | `text`↔`description` | Avbilde |
| `subtotal` | Finnes ikke | Mangler | Legg til i SCHEMA og validate |
| `vat[{rate, amount}]` | `vat[{rate, amount}]` | OK. Ingen sjekk av sats eller sum. | Valider at satsen er 25/15/12/0 og at summen er ≤ total |
| `total` | `total` (kr, 2 desimaler) | OK | – |
| `payment_method` | `payment_method` (≤ 20) + `card_last4` | OK | – |
| `category_suggestion` | `suggested_category` (≤ 60). Listen kommer fra databasen (routes.js:352) og sendes inn i PROMPT. | Navnet | Avbilde |
| bbox (ekstra) | Prosent 0–100, origo øverst til venstre (ai.js:21, bbox30.js:3-12). `cleanBbox` skalerer 0–1 opp til 0–100. | Målet bruker 0–1 | Bestem én skala. `cleanBbox` tåler begge allerede. |

---

## Kjeden på serveren i dag og målet A→B→C→Tesseract→D

| Steg i målet | Finnes i dag? | Hvor | Avvik |
|---|---|---|---|
| **A** `device_parse` (tolket på enheten) | Delvis, bare iOS apple-fm | `receipts47.js:219-252`, `preParsed47` :170-173 | Egen rute og norske felt. Ingen felles `device_parse`-felt i én scan-rute. Android har ingen A. |
| **B** `device_ocr` + `qwen3:8b` | Delvis: `ocr-text` → `extractText(kind:'ocr')` | `receipts47.js:185-217`, `ai.js:716-722` | Går til **Gemini først** (TASKS.receipts). Ollama-modellen er rc-visjonsruten (qwen2.5vl), ikke qwen3:8b. bbox og konfidens kastes. |
| **C** Mac Vision + `qwen3:8b` | **Nei** | – | Ingen Mac-OCR-tjeneste, ingen `mac_vision`, ingen `8765` i koden |
| **Tesseract** + `qwen3:8b` | Delvis: Tesseract + **regex**, ikke LLM | `ai.js:445-458`, `ocr-fallback.js:205-234` | Tesseract-teksten sendes aldri til en LLM. Den er siste reserve *etter* alle AI-motorene. |
| **D** Gemini Flash (bilde) | Ja, men **først** | `ai.js:377-379`, `:319-350` | Står først som standard (`engineOrder`/`TASKS`). Groq ligger mellom. Må flyttes til sist og respektere `finLocal` og sky-budsjettet. Bildesporet `extract()` sjekker ikke `finLocal`, bare `textJson` gjør det (`:525-533`). |
| Validering i kode | Delvis | `parsedReceipt47` (bare apple-fm), `validate`, `verify39` (sum ±1 kr, mot bank), `mod11Ok` (bare Tesseract) | Mangler felles validator med mod11, mva, dato og subtotal som avgjør om kjeden skal gå til neste steg |
| `GET /receipts/health` | Nei, men `GET /finans/api/health/ai` | `routes.js:1644`, `ai.js:585-616` | Kan utvides med Mac Vision, kategorilisten og hvilke motorer som er aktive |
| Ett endepunkt `POST /receipts/scan` | Nei. Tre ruter: `/receipts`, `/receipts/ocr-text`, `/receipts/parsed` | – | Ny rute som tar `image`, `device_ocr`, `device_parse` og `client`, og lagrer i samme `fh_receipts` og kø |

Køen, bankmatchen, `classify39`, `verify39`, sammendraget og «Til godkjenning» bør gjenbrukes uendret. Den nye kjeden hører hjemme der `processReceipt` velger motor (`routes.js:356-357`).

---

## 4. Hvor serveren og Ollama kjører

- Serveren er **én Node-container i Docker** (`docker-compose.yml:2-18`). Porten bindes `${BIND_ADDR:-127.0.0.1}:3000` (`:16`). Docker kjøres i en Proxmox-LXC (`README.md:38`, `DECISIONS.md:5`, `deploy/proxmox/update.sh:4` nevner `CTID=106`).
- Klientenes lokale standardadresse er `http://10.69.1.39:3000` (`server/server47.js:20`, `P47.kt:26`, `Server47.swift:21`). Ekstern adresse: `https://os.smarthjemexperten.no`.
- Ollama er en **annen maskin**, en Mac mini M4 med 16 GB (`server/aihw38.js:1-16`, `ai-gate.js:15`, `docs/glimt-dataflyt.md:64`). Adressen er `settings.ollamaUrl` = `OLLAMA_URL` eller standarden `http://192.168.1.30:11434` (`server/finans/db.js:337`, `.env.example:63`). Merk at `.env.example` også bruker `192.168.1.30` for Pi-hole, så standarden er trolig en plassholder. Den faktiske adressen ligger i innstillingene i databasen (admin, `SERVER_KEYS` db.js:364). Den lokale `.env` har ingen `OLLAMA_*`-linjer.
- **Konklusjon: en Mac-OCR-tjeneste på `127.0.0.1:8765` kan ikke nås fra serveren.** Inne i containeren er `127.0.0.1` containeren selv, og Mac mini-en er en annen vert. Tjenesten må:
  1. lytte på Mac mini-ens LAN-adresse (eller `0.0.0.0` med brannmur),
  2. ha en konfigurerbar adresse, for eksempel `settings.macOcrUrl`, lagt til i `SERVER_KEYS` (bare admin) på samme måte som `ollamaUrl`,
  3. kreve et delt token (lagret som hemmelighet med `seal`, `db.js:409-424`), siden den tar imot kvitteringsbilder på LAN,
  4. sjekkes i health (som `ollamaReachable`, `ai.js:262-269`).
  
  LXC-en og Mac mini-en kan dessuten ligge på ulike subnett (10.69.1.x mot 192.168.1.x i standardverdiene), så ruting og brannmur mellom dem må bekreftes. Ollama nås allerede fra containeren i dag, og det er et godt tegn.

---

## 5. Datotolkeren `server/glimt45/dates.js`

Funksjoner kvitteringsvalideringen kan bruke:
- `isIsoDate45(s)` (`:36`): streng `YYYY-MM-DD` og ekte kalenderdato. Erstatter regex-sjekken i `validate` (ai.js:64).
- `isHm45(s)` (`:37`): `HH:MM` 00:00–23:59.
- `todayOslo45()` (`:24-26`) og `addDays45` (`:33`): «ikke i fremtiden» (+1 dag slingring) og «ikke eldre enn N år».
- `parseDate45(text, today, {prefer:'past'})` (`:62-127`) tolker:
  - `dd.mm.yy`, `dd.mm.yyyy`, `dd/mm/yy(yy)`, ISO `yyyy-mm-dd`
  - `12. okt 2026` (månedsnavn)
  - `dd.mm` uten år, der `prefer:'past'` gir siste gang datoen var
  - Den hopper over «kl 12.15» og beløp med `kr/%`, og gir `{error}` for umulige datoer.
  - Begrensninger: den tar **første** dato i teksten og har ingen poenggiving. `yyyy.mm.dd` og `yyyy/mm/dd` er ikke støttet. `dd-mm-yyyy` er heller ikke støttet (regexen godtar bare `.` og `/`).
- `parseTime45` (`:156`) kan normalisere `time`.

Anbefaling:
- For å **normalisere ett datofelt** fra modellen (f.eks. «24.10.26») bør `parseDate45(..., {prefer:'past'})` + `isIsoDate45` brukes.
- For å **finne datoen i hele OCR-teksten** er `findDate` i `server/ocr-fallback.js:106-120` bedre. Den gir poeng for «Dato»-linjer og klokkeslett, trekker for «best før/garanti», støtter `yyyy.mm.dd` og har et vindu på fem år / ikke i fremtiden.

---

## 6. Kategoriene i FinansHub

- Standardlisten `DEFAULT_CATEGORIES` (`server/finans/db.js:326-330`) seedes per bruker (`seedLedger`, `:459-465`):
  - utgift: **Mat og dagligvarer, Restaurant og kafé, Transport og lading, Bolig, Hjem, Fritid og hobby, Abonnementer, Skole, Annet**
  - inntekt: **Inntekt**
  - overføring: **Sparing, Overføring**
- Regler: `DEFAULT_RULES` (`:331-332`), for eksempel REMA* → Mat og dagligvarer.
- Listen er **per bruker og kan endres** (`fh_categories.user_id`). Kvitteringskøen bruker brukerens `kind='expense'`-kategorier (`routes.js:352`).
- `classify39` (`receipts39.js:119+`) kan **lage nye** kategorier fra `MERCHANT_TYPES` (`:100+`), for eksempel «Skole og studier», «Drivstoff», «Helse og apotek», «Elektronikk», «Klær og sko».
- Konklusjon: `category_suggestion` må velges fra **brukerens egen liste**, hentet fra serveren. iOS-listen med 8 kategorier (`Receipt47Engine.swift:78`) stemmer ikke.

---

## Viktige funn for planen

1. **Nettverket (punkt 4):**
   - Serveren kjører i Docker i en LXC. `127.0.0.1:8765` på Mac mini-en kan ikke nås derfra.
   - Mac Vision (steg C) trenger en LAN-adresse, et token, en adminstyrt innstilling (`SERVER_KEYS`) og en sjekk i health.
   - Alternativ uten ny lyttende tjeneste: Mac mini-en henter jobber fra serveren selv (pull, som en worker med app-token). Da trenger ikke serveren å nå Mac-en.
2. **Gemini:**
   - Gemini er ferdig implementert (`ai.js:319-350`): nøkkelrotasjon og flere nøkler (`gemini-keys.js`), og modell `gemini-flash-latest` med automatisk erstatter.
   - Nøkkelen er `secret('geminiKey')`, kryptert i `kv(OWNER,'fh_secret')` eller `GEMINI_API_KEY` (`db.js:409-436`).
   - Bare admin kan endre den: `SERVER_SECRETS` og `adminOnly` (`routes.js:106`, `:1587-1602`, `:1665-1670`).
   - **Men Gemini står først i kjeden i dag** (`TASKS.receipts.engine='gemini'`, `ai.js:99-104`, `AI_FALLBACK=gemini`, `db.js:336`). D krever at rekkefølgen snus, og at bildesporet respekterer `finLocal` og sky-budsjettet. I dag gjør bare `textJson` det.
3. **Validering finnes delvis:**
   - `parsedReceipt47` (`receipts47.js:69-158`) er den strengeste: typer, kalenderdato, ikke i fremtiden, ≥ 2000, total 0–1 000 000, ISO-valuta, mva ≤ total, antall linjer, linjebeløp, `card_last4`, og summen som myk advarsel.
   - `verify39` (`receipts39.js:69-92`): linjer − rabatter + pant = total (±1 kr) og total mot banktransaksjonen. Den gir `status` ok/usikker og en tilbakemeldingstekst til nytt forsøk.
   - `mod11Ok` finnes (`ocr-fallback.js:57-63`), men brukes bare av Tesseract.
   - Disse bør samles i én validator (`validateReceipt48`) som brukes etter hvert steg og avgjør om kjeden skal gå videre. Ingen eksisterende kode sjekker mva-sats eller mva-sum, `subtotal` eller `time`.
4. **`qwen3:8b` brukes ikke for kvitteringstekst i dag.** Tekstsporet bruker `modelFor('rc')`, som er visjonsruten (qwen2.5vl:7b). B, C og Tesseract+LLM trenger en egen rute- eller oppgave-ID for tekst, for eksempel `rct` = «Kvitteringer (tekst)» i `ai-run.js:49`. Bare én av qwen3:8b og qwen2.5vl:7b får plass i minnet samtidig (`ai-gate.js:15-16`). Gaten grupperer per modell, men et bytte koster 2–40 s.
5. **OCR-formatet må lages fra bunnen:**
   - Begge klientene leser bbox og (for Vision) konfidens, men kaster dem.
   - Begge bruker TAB og en annen radgruppering enn målet.
   - Serveren kaster alt utenom tekst (`receipts47.js:49`).
   - Navnebruken er snudd på Android: dagens `lines` er målformatets `rows`.
   - Tesseract må kjøres med `tsv` for å gi linjer og bbox.
   - Én felles, ren `rows()`-funksjon (overlappende y-intervall) bør finnes på server og klienter med samme tester.
6. **iOS sender aldri ren OCR**, bare FM-resultatet eller bildet. Siden bryteren er av som standard og krever iOS 26, betyr det at iOS i praksis bare laster opp bilder i dag. iOS bør alltid kjøre Vision og sende `device_ocr` med bildet.
7. **Android sender ikke bildet sammen med OCR-teksten**, og OCR-teksten har ingen kø. Den eksisterende WorkManager-køen (`upload/PendingUploads.kt`) kan bære multipart med `image` + `device_ocr` uten endringer i selve køen.
8. **Feltnavn og skala:** målformatet bruker `items`, `unit_price`, `discounts.description`, `category_suggestion`, `subtotal` og bbox 0–1. Serveren bruker `lines`, `unitPrice`, `discounts.text`, `suggested_category` og bbox i prosent. `extraction`-JSON-en og `line_boxes` leses av appene, så en avbildning ved inngang/utgang er tryggere enn å endre navn i databasen.
9. **Rutesti:** finans-API-et ligger under `/finans/api`. `POST /api/receipts/scan` i spesifikasjonen bør trolig være `/finans/api/receipts/scan`, med `need('receipts:write')` og samme kø. `GET /finans/api/health/ai` finnes og kan utvides til eller pekes fra `/receipts/health`.
10. Eksisterende tester for prompt 47: `test/p47-server.test.js`. Utvides eller speiles for 48.
