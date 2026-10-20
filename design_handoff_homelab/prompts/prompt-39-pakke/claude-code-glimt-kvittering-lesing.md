# Glimt: les kvitteringer ordentlig (varelinjer, ikke bare total)

Ønske 2026-10-20: «jeg syns ai glimt har vært bra i det siste men den har ikke vært noe særlig god på å finne hva som ble kjøpt og hva som stod på kvitteringen.» (skjermbilde: `vedlegg/kvittering-akademika.png`)

## Feil i dag
Akademika 135 kr: kvitteringskortet viser bare «AKADEMIKA · 12.10.2026 · Trykk for å se originalen · TOTAL 135,00». Ingen varelinjer, ingen MVA, ingen betalingsmåte. Glimt kan derfor ikke svare på «hva kjøpte jeg på Akademika?».

## Ny lese-pipeline (Mac mini M4 · 16 GB, se `claude-code-ai-maskin-mac-mini.md`)
1. **Forbehandling (iPhone):** `VNDocumentCameraViewController` / Vision-perspektivkorrigering, beskjær, øk kontrast, lengste side 2000 px. PDF: bruk tekstlaget hvis det finnes, og hopp over OCR.
2. **OCR på telefonen:** Apple Vision `VNRecognizeTextRequest` (`.accurate`, `["nb-NO","en-US"]`, `usesLanguageCorrection = false`). Gir tekstlinjer + bbox gratis og raskt. Send `{image, ocrLines:[{text,bbox}]}` til serveren.
3. **Strukturering på serveren:** `qwen2.5vl:7b` får **både bildet og OCR-teksten**, `temperature: 0` og Ollama `format` = JSON-skjema (nedenfor). Modellen skal kopiere tekst fra OCR, ikke gjette.
4. **Kontroll:** `sum(linjer) − rabatter + pant = total` (±1 kr), total = transaksjonsbeløp, og dato innen ±3 dager fra transaksjonen.
   - Feiler kontrollen: kjør én gang til med tilbakemelding («Linjene summerer 120,00, total er 135,00. Finn linjen som mangler.»).
   - Feiler den igjen: prøv sky-modell (bare hvis «Finansdata forlater aldri huset» er av). Ellers lagre med `status:"usikker"`.
5. **Digitale kvitteringer først:** finnes en e-postkvittering (Akademika, Elkjøp, Vy …) eller en digital kvittering (Trumf, Coop, Kiwi) for samme beløp og dato, så parse den i stedet for bildet. Den er 100 % korrekt.

## JSON-skjema
```json
{ "merchant":"", "orgnr":"", "date":"YYYY-MM-DD", "time":"HH:MM", "receiptNo":"",
  "payment":"Visa ••1234 | Vipps | kontant",
  "lines":[{"name":"", "nameRaw":"", "qty":1, "unitPrice":0, "price":0, "discount":0, "vatRate":25, "bbox":[x,y,w,h]}],
  "discounts":[{"text":"", "amount":0}], "pant":0,
  "vat":[{"rate":25, "base":0, "amount":0}], "total":0, "currency":"NOK",
  "confidence":0.0, "status":"ok|usikker" }
```

## Regler i systemprompten (norske kvitteringer)
- Komma er desimaltegn. «2 x 24,90» eller «2 STK á 24,90» blir `qty 2, unitPrice 24.90`.
- `RABATT`, `-10%`, `TRUMF` og `KUPONG` er rabatter, ikke varer. `PANT` er pant.
- `MVA 25 %` / `15 %` / `12 %` / `0 %` er MVA-tabellen, ikke varer.
- Ignorer terminaltekst: BAX, Ref, AID, TVR, Autorisasjon, «Kundens kopi», «Takk for handelen».
- `nameRaw` er teksten slik den står. `name` er lesbar form («TOMAT CHERRY 250G» → «Cherrytomater 250 g»). For bokhandel: bruk boktittel og ISBN hvis de står.
- Er en linje uleselig, ta den med som `"name":"(uleselig)"` med pris. Linjen skal aldri hoppes over.

## Lærer av rettinger
- Brukeren kan rette varelinjer (trykk på linjen → rediger navn/pris). Lagre som fasit per butikk.
- Ved neste kvittering fra samme butikk: send de 2 siste rettede kvitteringene som eksempler (few-shot). Akademika, Rema, Kiwi osv. blir bedre over tid.

## Visning (Transaksjon → Detaljer)
- Kvitteringskortet viser alltid de tolkede linjene: navn, antall, pris. Under dem rabatt, pant, MVA-tabell, TOTAL og betalingsmåte. «Trykk for originalen ›» nederst åpner bildet med gule bbox-markeringer (som i `claude-code-kvittering-highlight.md`).
- Statuslinje over kortet:
  - «✦ Glimt leste 3 varer · sum stemmer»
  - «Usikker · linjene summerer 120 av 135 kr»
  Begge med knappen **Les på nytt**.
- Bare bilde uten tolkning: vis «Glimt leser kvitteringen …» med fremdrift. Ikke vis en tom plassholder.
- `Endre kategori` kan foreslå kategori per linje (f.eks. pensum = Skole, snacks = Mat).

## Glimt-spørsmål som skal virke
- «Hva kjøpte jeg på Akademika?» → «12. okt: *Grunnleggende fysikk* (pensum) 129 kr og en blyant 6 kr. Totalt 135 kr.»
- «Hvor mye har jeg brukt på pensum i høst?»
- «Når kjøpte jeg sist tomater, og hva kostet de?»
- Svarene bygger på `lines`, ikke bare på transaksjonsteksten.

## Test
Lag et testsett med 20 ekte kvitteringer (dagligvare, bokhandel, restaurant, bensin, krøllet og bleket papir, PDF) med fasit-JSON. Mål:
- **total riktig** ≥ 98 %
- **alle linjer riktig** ≥ 90 %
- **ingen manglende linjer** når sumkontrollen er ok

Kjør testsettet automatisk ved bytte av modell eller prompt.
