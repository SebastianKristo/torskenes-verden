# Finans · Kvitteringer til gjennomgang: vis fremdrift ved «✦ På nytt»

Ønske 2026-10-20: «i kvitteringer i finans mobil til gjennomgang når jeg trykker på ai på nytt, jeg vil se prosessen dens.»

Fasit: `Mobil Papir App.dc.html` → Finans → Kvitteringer → TIL GJENNOMGANG → åpne en rad → «✦ På nytt» (`re`, `reStop`, `rcRe`).

## Oppførsel
- Trykk **✦ På nytt** → knappen blir **«✦ 42 %»** (deaktivert) og et fremdriftspanel vises under knappene:
  - nåværende steg i fet skrift + prosent (Plex Mono, rød)
  - fremdriftslinje 6 px
  - stegliste med ✓ (ferdig, grønn) · • (pågår) · · (venter):
    1. Laster opp bildet
    2. Leser teksten (OCR)
    3. ✦ Gemini tolker butikk, linjer og beløp
    4. Sjekker sum og dato
  - **Avbryt** stopper jobben: «Avbrutt · ingenting ble endret».
- **Lukket rad** under analysen: undertekst «✦ Analyserer på nytt … 42 %» og en tynn rød linje under raden. Du kan lukke raden eller gå til en annen side. Jobben fortsetter.
- **Ferdig:** raden oppdateres (motor, sikkerhet, felt), og du får toasten «✦ Analysert på nytt · 96 % sikker». Har ett av feltene endret seg (butikk, beløp, dato, kategori), markeres det med gul bakgrunn i 2 s.
- **Feil:** steget blir rødt «✕ Gemini svarte ikke», med knappene «Prøv igjen» og «Bruk lokal OCR».

## Backend
- `POST /api/finance/receipts/:id/reanalyze` → `{jobId}`. Fremdrift via SSE/WebSocket `job:<id>` med `{step:'upload'|'ocr'|'llm'|'verify'|'done'|'error', pct, msg}`. Samme kanal som køen bruker (`claude-code-glimt-kvittering-lesing.md` for selve lese-pipelinen).
- Reelle prosenter:
  - opplasting: bytes sendt
  - OCR: linjer lest / totalt
  - LLM: tokens strømmet / forventet
  - kontroll: fast 90 → 100
- Appen i bakgrunnen: varsel «Kvitteringen fra Clas Ohlson er lest på nytt» (Glimt-ikon, se `claude-code-glimt-varsel-ikon.md`).
