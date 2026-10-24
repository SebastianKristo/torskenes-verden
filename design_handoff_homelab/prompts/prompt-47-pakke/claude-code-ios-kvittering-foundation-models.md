# iOS: kvitteringer tolkes på iPhone med Apple Foundation Models (valgfritt)

Ønske 2026-10-23: «for ios, legg til toggle i innstligner at kvitteringer som scannes blir prosereser på iphone av iphonen en sin Apples Foundation Models-rammeverk istedet for glimt ollama»

## Innstilling
Innstillinger → Glimt → **Kvitteringer**:
- Bryter: **«Tolk kvitteringer på iPhone»**. Undertekst: «Bruker Apple Intelligence på enheten i stedet for Glimt på serveren. Kvitteringen forlater ikke telefonen før den er tolket.»
- Av som standard.
- Bryteren vises bare på iOS. Kan ikke enheten bruke det, er den grå og viser grunnen (se Tilgjengelighet).

## Tilgjengelighet
Krever iOS 26+, en iPhone som støtter Apple Intelligence (15 Pro / 16 eller nyere) og at Apple Intelligence er slått på. Sjekk med `SystemLanguageModel.default.availability`:
- `.available` → bryteren kan slås på.
- `.unavailable(.deviceNotEligible)` → «Denne iPhonen støtter ikke Apple Intelligence».
- `.unavailable(.appleIntelligenceNotEnabled)` → «Slå på Apple Intelligence i Innstillinger» + lenke.
- `.unavailable(.modelNotReady)` → «Modellen lastes ned – prøv igjen senere».
Sjekk på nytt ved hver skanning. Er modellen utilgjengelig når bryteren står på, bruk Glimt/Ollama og vis en liten merknad: «Tolket av Glimt (Apple Intelligence utilgjengelig)».

## Flyt når bryteren er på
1. Skann med `VNDocumentCameraViewController` (som i dag).
2. Les teksten på enheten med Vision (`RecognizeDocumentsRequest` / `VNRecognizeTextRequest`, språk `nb-NO`, `en-US`).
3. Tolk med Foundation Models, med guided generation:
   ```swift
   @Generable struct Kvittering {
     @Guide(description: "Butikk eller selger") var butikk: String
     @Guide(description: "Dato på formen ÅÅÅÅ-MM-DD") var dato: String
     var totalsum: Double
     @Guide(description: "ISO-valutakode, f.eks. NOK") var valuta: String
     var mva: Double?
     var varelinjer: [Varelinje]
     @Guide(description: "Kategori", .anyOf(["Mat","Transport","Bolig","Helse","Klær","Elektronikk","Restaurant","Annet"])) var kategori: String
     var betalingsmiddel: String?
   }
   @Generable struct Varelinje { var navn: String; var antall: Double?; var pris: Double }
   ```
   `LanguageModelSession(instructions: "Du leser norske kvitteringer. Bruk bare tall som står i teksten. Ikke gjett.")` → `respond(to: ocrTekst, generating: Kvittering.self)`.
4. Kontroller resultatet: summen av varelinjene skal stemme med totalsummen (±1 kr), datoen skal være gyldig og ikke ligge i fremtiden, og totalsummen skal være større enn 0. Felt som ikke stemmer, markeres gule i bekreftelsesskjermen. Brukeren retter før lagring.
5. Bare det ferdige strukturerte resultatet sendes til serveren (`POST /api/finans/kvitteringer`, med feltet `tolketAv: "apple-on-device"`). Bildet lastes opp som i dag, som vedlegg.

## Når bryteren er av
Uendret: bilde/OCR sendes til Glimt (Ollama på Mac mini). Felt: `tolketAv: "glimt-ollama"`.

## Felles
- Samme datamodell og samme bekreftelsesskjerm uansett motor, så resten av FinansHub ikke merker forskjell.
- Vis en liten etikett på kvitteringen: «Tolket på iPhone» / «Tolket av Glimt».
- Er teksten for lang for kontekstvinduet (lange kvitteringer): del opp i varelinjer i bolker og slå sammen.
- Fungerer uten nett når bryteren er på. Lagre lokalt og synk når nettet er tilbake.

## Test
- 10 ekte norske kvitteringer (Rema, Kiwi, Coop, Vinmonopolet, bensin, restaurant): sammenlign felt mot Ollama-resultatet.
- Flymodus med bryteren på: tolkingen fungerer, og synken skjer senere.
- Enhet uten Apple Intelligence: bryteren er grå med riktig tekst.
- Bryteren på + modellen utilgjengelig: faller tilbake til Glimt med merknad.
