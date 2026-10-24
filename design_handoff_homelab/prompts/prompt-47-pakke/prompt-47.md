# Prompt 47

Startet 2026-10-23.

- 2026-10-23: «får fortsatt blank skjerm på + knapp i kalender app» (vedlegg `uploads/Screenshot 2026-10-23 at 16.30.31.png`) → `claude-code-kalender-ny-hendelse-blank-2.md`: skjemaet er montert (tastatur oppe, fokus i felt) men usynlig – sjekk layout/animasjon/tema/rute, ikke krasj. Fiks også at autofyll foreslår telefonnummer i tittelfeltet.
- 2026-10-23: Lang instruks «Kritisk feil: Glimt svarer med kalenderdata på værspørsmål» (søk: «hvordan er været i oslo neste time og været i new york imorgen» → svar om TRE1400 Forelesning). Lagret ordrett som `claude-code-glimt-vaer-gir-kalendersvar.md`.
- 2026-10-23: «husk at standard arrese til serveren er https://os.smarthjemexperten.no og lokal er http://10.69.1.39:3000, la meg sette disse deafult i innstlinger.» → `claude-code-standard-serveradresser.md`.
- 2026-10-23: «her dette er kun et eksempel, den skjønner ikke hva jeg mener, skjønner du hva feilen er forkalr det til meg og fiks det» (vedlegg `uploads/Screenshot 2026-10-23 at 18.32.45.png`: «Last ned siste episode fra 9-1-1» → «Fant ingenting som heter «siste episode fra 9-1-1»») → `claude-code-glimt-media-tittel-og-utvalg.md`.
- 2026-10-23: «for ios, legg til toggle i innstligner at kvitteringer som scannes blir prosereser på iphone av iphonen en sin Apples Foundation Models-rammeverk istedet for glimt ollama» → `claude-code-ios-kvittering-foundation-models.md`.
- 2026-10-23: Engelsk instruks: Android-implementasjon i Kotlin med Google ML Kit Text Recognition for lokal OCR av kvitteringer (`ReceiptOcrScanner`, `extractTextFromReceipt(context, imageUri)`, coroutines/MVVM, linjer bevart, råtekst sendes til Ollama-backend, Gradle + Manifest) → `claude-code-android-kvittering-mlkit-ocr.md`.
- 2026-10-24: «legg til sttøtte for at glimt og alt med ai kjører på https://omlx.ai/ istedet for ollama» → `claude-code-ai-motor-omlx.md`.
- 2026-10-24: «fjern fra epost knappen og tilgang knappen kan ligge kun i nettversjon eller i innstliger på mobil.» (vedlegg `uploads/Screenshot 2026-10-24 at 10.03.36.png`, Boliger på iPhone) → `Boliger.dc.html` + `claude-code-boliger-mobil-uten-epost-tilgang.md`.
