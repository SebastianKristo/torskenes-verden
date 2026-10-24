# Kvitteringer og bilder i Glimt (prompt 51)

## Hva er rettet

**Kvitteringsskanningen (FinansHub, web og Android)**
- OCR (Tesseract) leser nå **originalbildet**, ikke 1600 px-kopien. Før OCR rettes EXIF-rotasjonen, kvitteringen finnes i
  bildet og rettes opp (perspektiv) og beskjæres, og lengste side er aldri under 2000 px. Den hardhendte terskelen som
  spiste tynne tegn er borte.
- Tekstmodellen (qwen3:8b) får kontekstvinduet målt før kallet: lange kvitteringer får 32 768 tokens, og systemteksten
  kuttes aldri. Modellen ser aldri bildet, bare OCR-radene.
- **Butikknavn via org.nr.:** org.nr. i teksten (etter «Org.nr», «Foretaksregisteret», «NO … MVA») kontrolleres med mod11
  og slås opp i en **lokal kopi av Enhetsregisteret**. Rekkefølgen er: 1) org.nr., 2) kjent butikk fra kvitteringer du har
  bokført (samme org.nr. eller samme navn øverst), 3) modellens forslag. Skjemaet viser hvor navnet kom fra.
- **Den lærer:** retter du butikknavnet, husker serveren org.nr. → navnet ditt, og neste kvittering fra samme butikk får det.
  Dette er per bruker.
- **Rådata:** OCR-radene, motoren (Mac Vision / Tesseract / iPhone / Android) og bildestørrelsen lagres per kvittering og
  vises i «Rådata» i skjemaet. Er radene feil, ligger feilen i OCR; er radene riktige, ligger feilen i modellen.
- Den gamle opplastingen (web «Last opp») leser fortsatt med visjonsmodellen, men totalen kontrolleres nå mot Tesseract på
  originalen. Avvik, eller ingen OCR å sammenligne med, gir «til gjennomgang» med lav sikkerhet.
- **Mac Vision:** svarer ikke Mac-en, merker serveren den som nede i 5 minutter etter en helsesjekk på 1,5 sekunder, i stedet
  for å vente 30 sekunder per kvittering. Status står i `GET /finans/api/receipts/health` (`macOcr.down_until`).
- Gemini får aldri bildet når «Finansdata forlater aldri huset» er på.

**Bilder i Glimt-chatten**
- Bilder sendes aldri til en modell som ikke ser bilder. Evnen leses fra Ollama (`/api/show`) og bufres, også for modeller
  som kommer via Open WebUI (der sto alle modeller som «kan se bilder»). Det var årsaken til «Ollama svarte 400: Multimodal …».
- Glimt velger vei selv og viser hvilken, under svaret:
  - **Kvittering** → kvitteringskjeden, svaret som tabell (eller liste, JSON eller CSV hvis du ber om det).
  - **Faktura, vitnemål, brev, skjema og andre dokumenter** → OCR-radene til qwen3:8b, formatert slik du ba om.
  - **Vanlige bilder** → visjonsmodellen (qwen2.5vl:7b), som lastes når den trengs.
- Avviser en modell bildet likevel, bytter Glimt vei og husker at modellen ikke ser bilder. Rå feilmeldinger fra Ollama vises
  ikke lenger.

## Hva du må gjøre

1. Oppdater serveren som vanlig. Første gang laster serveren ned Enhetsregisteret i bakgrunnen, ca. 10 minutter etter
   oppstart (noen hundre MB lastes ned, fila `data/brreg51.sqlite` blir rundt 100–150 MB). Etter det skjer det ukentlig.
   Du kan starte det med en gang (admin):
   ```sh
   curl -X POST -b "hl_sid=…" https://<din-server>/finans/api/receipts/brreg/update
   curl -b "hl_sid=…" https://<din-server>/finans/api/receipts/brreg          # status: antall og dato
   ```
   Vil du ikke laste ned automatisk, sett `BRREG51_AUTO=0` i `.env`.
2. Sørg for at qwen2.5vl:7b er installert i Ollama (`ollama pull qwen2.5vl:7b`) for vanlige bilder i chatten.
3. Send kvitteringen din som første testcase: se `tests/receipts/real-mal/README.md`.
4. Mac Vision: se `tools/vision-ocr/README.md`. Til den er i gang, brukes Tesseract på serveren.

## Eval

```sh
npm run eval -- --case 17,18,19                 # chat: kvitteringsbilde → tabell, foto → visjonsmodell, qwen3:8b + bilde → ingen 400
make eval-receipts ARGS="--only ekte"           # dine egne kvitteringer
node --test test/p51-receipts.test.js           # servertestene
```
