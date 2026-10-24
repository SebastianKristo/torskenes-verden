# Prompt 48: Kvitteringsskanning på mobil og Mac med reserveløsning

Startet 2026-10-24. Avviksrapport: `docs/kvittering-ocr-avvik-48.md`.

## Brukerens avklaringer og avgjørelser
1. Apple Vision OCR på Mac minien (Del 3) finnes ikke ennå og skal bygges. Behold Tesseract-reserven (`server/ocr-fallback.js`) som et ekstra steg i kjeden når Mac-OCR er utilgjengelig, før Gemini.
2. Ikke vent på Glimt-ombyggingen. Bygg på det som finnes: `server/ai-gate.js` for kø og modellklient, `server/glimt45/dates.js` for datoer og den eksisterende kvitteringskøen i Finans. Kvitteringslogikken i egne moduler med tydelige grensesnitt, så den enkelt kan flyttes til den nye felles klienten. Ikke rør `eval/` eller noe testsuiten jobber med.
3. Mobilappene er native (SwiftUI og Kotlin/Compose). Bygg videre på prompt 47. Bryterne for on-device OCR og tolkning er av som standard til eval viser at de fungerer.
4. PWA-en laster bare opp bildet; serveren kjører C → Tesseract → D.
5. Rekkefølge: (1) avvik mot felles OCR-format, (2) plan, (3) Mac-OCR (Del 3) og validering (Del 4) først, så mobilappene, til slutt eval-receipts.
6. Kjede på serveren: A (device_parse) → B (device_ocr + qwen3:8b) → C (Mac Vision + qwen3:8b) → Tesseract + qwen3:8b → D (Gemini Flash).
7. Gemini sist og bare når «Finansdata forlater aldri huset» er av. Det samme gjelder Groq og alle andre eksterne tjenester, både for bilder og tekst. Fjern Groq fra kvitteringskjeden eller legg den bak samme sperre.
8. Mac miniens IP er `10.69.1.173` (fast i UniFi). OCR-tjenesten godtar bare forespørsler fra Glimt-serverens IP i tillegg til nøkkelen, og eksponeres aldri via Cloudflare.
9. ML Kit Document Scanner tas med på Android. Gemini Nano droppes.
10. Installasjonsskript for Swift-tjenesten (bygg, installer, LaunchAgent) med én kommando, og curl-tester med riktig adresse og nøkkel.

## Oppdrag (brukerens spesifikasjon)

### Mål
Jeg tar bilde av en kvittering i FinansHub-appen. Teksten skal kunne leses ut både på mobilen (iPhone: Apple Vision + Apple Foundation Models, Android: Google ML Kit) og på Mac mini-en (Apple Vision OCR + lokal modell via Glimt). Hvis én del ikke fungerer – mobilen mangler støtte, Mac-en er utilgjengelig, eller resultatet ikke består kontrollen – tar den andre over. Gemini Flash er siste reserve.

### Samlet flyt
```
Mobil (FinansHub)
  1. Ta bilde → forbehandling (rett opp perspektiv, beskjær)
  2. On-device OCR, hvis tilgjengelig       (iOS: Vision · Android: ML Kit)
  3. On-device strukturering, hvis tilgjengelig (iOS: Foundation Models · Android: valgfritt Gemini Nano)
  4. Send til Glimt: bilde + (valgfritt) device_ocr + (valgfritt) device_parse

Glimt POST /api/receipts/scan
  A. Har device_parse og den består validering?          → bruk den
  B. Ellers: har device_ocr?                             → qwen3:8b på device-OCR-radene → valider
  C. Ellers / B feilet: Mac Vision OCR på bildet          → qwen3:8b → valider
  (Tesseract + qwen3:8b når Mac-OCR er utilgjengelig)
  D. Fortsatt feil: Gemini Flash (bilde + beste OCR-tekst) → valider
  → svar: kvittering + confidence + "pipeline": hvilke steg som ble brukt + usikre felt

Mac utilgjengelig (offline / server nede)
  - iPhone med Foundation Models: vis utkast fra device_parse lokalt, lagre i kø
  - Ellers: lagre bilde + device_ocr i kø
  - Køen sendes automatisk til Glimt når den svarer igjen, og Glimt validerer på nytt
```

Regler:
- All validering skjer på serveren (Glimt), også for resultater laget på mobilen. Mobilens resultat er et forslag.
- Hvis både device-OCR og Mac-OCR finnes, sammenlign totalbeløpet fra begge. Avvik → bruk det som består sumsjekken, ellers merk som usikkert.
- Hver del skal kunne slås av i innstillingene (device-OCR, device-parse, Mac-OCR, Gemini) for testing.
- Logg hvilken vei hver kvittering tok, og tid per steg.

### Felles OCR-format (samme fra iPhone, Android og Mac)
```json
{
  "source": "ios_vision | android_mlkit | mac_vision",
  "lines": [ { "text": "MELK 1L", "confidence": 0.97, "bbox": [x, y, w, h] } ],
  "rows":  [ "MELK 1L            24,90" ],
  "full_text": "...",
  "image_size": [w, h],
  "ms": 412
}
```
- `bbox` normalisert til 0–1, origo øverst til venstre, på alle plattformer (Vision bruker origo nede til venstre – konverter).
- `rows`: grupper linjer med overlappende y-intervall, sorter på x, slå sammen med mellomrom. Da havner vare og pris på samme rad.
- Én delt spesifikasjon (f.eks. `receipt-ocr.schema.json`) som alle tre implementasjonene og Glimt valideres mot.

### Felles kvitteringsformat (JSON-schema)
```json
{
  "merchant": "string",
  "org_number": "string|null",
  "date": "YYYY-MM-DD",
  "time": "HH:MM|null",
  "currency": "NOK",
  "items": [ { "description": "string", "quantity": "number|null", "unit_price": "number|null", "amount": "number" } ],
  "discounts": [ { "description": "string", "amount": "number" } ],
  "subtotal": "number|null",
  "vat": [ { "rate": "number", "amount": "number" } ],
  "total": "number",
  "payment_method": "string|null",
  "category_suggestion": "string"
}
```
`category_suggestion` velges fra FinansHubs kategoriliste. Ingen fritekstkategorier.

### Del 1 – iPhone (Swift)
OCR `ReceiptOcrScanner`: forbehandling (orientering, `VNDocumentCameraViewController` foretrukket, ellers `VNDetectDocumentSegmentationRequest` + `CIPerspectiveCorrection`), `VNRecognizeTextRequest`/`RecognizeTextRequest` (iOS 18+), `.accurate`, `usesLanguageCorrection = true`, norsk hvis støttet, ellers best for æ/ø/å. `func extractText(from image: UIImage) async throws -> ReceiptOcrResult` i felles OCR-format.
Strukturering med Foundation Models: sjekk `SystemLanguageModel.default.availability`, ikke tilgjengelig → hopp over stille og send bare OCR. Guided generation med `@Generable` som speiler kvitteringsschemaet og `@Guide` per felt. Gi modellen `rows`, ikke bildet. Kort instruks: transkriber hver varelinje, pant og rabatter er egne linjer, ikke regn ut noe selv. For lang tekst → del opp eller hopp over device-parse. Lokal sumsjekk for utkast, men send alt til Glimt.

### Del 2 – Android (Kotlin)
1. Input fra CameraX eller Photo Picker (`Uri`/`Bitmap`). 2. ML Kit Text Recognition (Latin); vurder bundlet variant og begrunn. 3. Klasse `ReceiptOcrScanner`. 4. `suspend fun extractTextFromReceipt(context: Context, imageUri: Uri): ReceiptOcrResult` med `.await()`. 5. Felles OCR-format inkl. `rows` gruppert på y. 6. Gradle og manifest (ingen egne tillatelser for ML Kit; CAMERA bare ved egen CameraX; INTERNET).
MVVM: `ReceiptScanViewModel` med `StateFlow` (Idle, Scanning, Uploading, Draft, Done, Error), `ReceiptRepository` med opplasting og offline-kø (WorkManager). Forbehandling: EXIF-rotasjon, ikke under ca. 2000 px på lengste side, ML Kit Document Scanner for perspektiv. (Gemini Nano droppet.)

### Del 3 – Mac mini OCR-tjeneste
Egen prosess uavhengig av Glimt (også for vitnemål og fakturaer). Swift-program valgt (se plan). HTTP `POST /ocr` (multipart eller base64) og `GET /health`. Lytter på `10.69.1.173:8765`, bare fra Glimt-serverens IP + nøkkel. Samme forbehandling som iPhone (orientering, HEIC/JPEG/PNG, dokumentsegmentering, perspektiv, beskjæring). Lange kvitteringer: overlappende bånd, dedupliser overlappen. Felles OCR-format med `source: "mac_vision"`. launchd LaunchAgent `com.local.vision-ocr` med automatisk omstart, logg til `~/Library/Logs/vision-ocr.log`.

### Del 4 – Glimt `POST /api/receipts/scan`
Multipart: `image` (påkrevd), `device_ocr` (valgfri JSON), `device_parse` (valgfri JSON), `client` (ios/android/web + versjon). API-nøkkel som i resten av Glimt. A–D-kjeden. Modellkall via felles AI-klient og kø (interaktiv prioritet): `temperature: 0`, `think: false`, `num_ctx: 16384`, JSON-schema via `format`, 2–3 few-shots (dagligvare med pant og rabatt, restaurant med tips, bensinstasjon). `GET /api/receipts/health`.
Validering (kode): normaliser beløp (`24,90`, `24.90`, `1 299,00`, `kr 1.299,00`, `-10,00`); sum(items) + sum(discounts) = total ±1 kr; total også med regex (`TOTAL`, `Å BETALE`, `SUM`, `BETALT`); dato gyldig, ikke fremtid, ikke eldre enn 2 år (felles datoparser); org.nr 9 siffer mod11 ellers null; mva 25/15/12 % og omtrent riktig; `confidence` high/medium/low + felt som feilet; ett nytt forsøk med beskjed før neste steg.

### Del 5 – FinansHub-visning
Redigerbart skjema før lagring, usikre felt markert, merkelapp for vei («iPhone», «Mac», «Gemini»). Lagre originalbildet med transaksjonen. Rettelser lagres (modellens svar + rettelsen) som testdata.

### Del 6 – Test
`tests/receipts/` med bilder og `.json` fasit per bilde. `make eval-receipts` kjører hver kvittering gjennom alle tilgjengelige veier separat (device-OCR fra lagret resultat, Mac-OCR, Gemini) og rapporterer per vei og per felt: butikk, dato, total, antall varelinjer, tid. Test fallback eksplisitt: Mac-OCR av, device-parse ugyldig, Glimt utilgjengelig (offline-kø), Gemini av.

### Leveranse
Hvilken vei mobilappen tar og hva som må til; hvordan starte og teste OCR-tjenesten på Mac-en (`launchctl`, `curl`); eval-resultat per vei; valgt OCR-språkoppsett per plattform og hvorfor.
