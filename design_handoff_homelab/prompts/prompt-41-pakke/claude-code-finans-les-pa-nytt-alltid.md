# Finans: Glimt kan alltid lese kvittering/transaksjon på nytt

Ønske 2026-10-20: «i finans, i liste så vil jeg kunne la glimt lese kvitteirng eller transkasjon på nytt uansett. for nå får melding kvittering er allerde bokfør eller avist. og lar meg ikke lese den på nytt. ordene det.»
Fasit: `Mobil Papir App.dc.html` → Finans → Liste → transaksjon → «✦ Les på nytt med Glimt», og Kvitteringer → Bokført (ny «✦ På nytt»-knapp per rad).

## Feil
API-et avviser ny lesing med «Kvitteringen er allerede bokført eller avvist» når status er `booked` eller `rejected`.

## Riktig
- `POST /api/receipts/{id}/reread` og `POST /api/transactions/{id}/reread` er tillatt for **alle** statuser: `pending`, `review`, `booked`, `rejected`. Fjern status-sjekken.
- Ny lesing endrer **aldri** bokføringen automatisk. Resultatet lagres som et forslag (`receipt_reads`: `receipt_id, engine, read_at, fields_json, lines_json, confidence`).
- Svaret viser forskjellene mot det som er bokført (butikk, dato, sum, linjer, kategori), som i dag i transaksjonsvisningen: «Bruk endringene» / «Behold som det er». Ingen forskjeller: «Ingen endringer. Butikk, dato og alle N linjer stemmer.»
- «Bruk endringene» på en bokført kvittering oppdaterer transaksjonen og logger det i historikken («Endret av Glimt · ny lesing · 20.10 16:42 · Sebastian»).
- Avvist kvittering: etter ny lesing tilbys «Flytt til gjennomgang» (status → `review`). Ellers blir den liggende som avvist.
- Bildet/PDF-en beholdes alltid, også for avviste, så den kan leses på nytt. Mangler originalen: «Fant ikke originalbildet. Last det opp på nytt for å lese det.» med opplastingsknapp, ikke en generisk feil.
- Samme kø og fremdrift som vanlig lesing (Laster opp → OCR → Gemini tolker → Sjekker sum og dato). Kan avbrytes uten endringer.
- Gjelder iOS, Android, web og Mac.

## Åpne bokførte kvitteringer (2026-10-20)
Ønske: «i finans mobil med kvitteringer, under bokført la meg åpne kvitteringen derfra også.»
Fasit: `Mobil Papir App.dc.html` → Finans → Kvitteringer → **Bokført**.
- Trykk på en bokført rad åpner den (samme utvidelse som i «Til gjennomgang»): **bildet av kvitteringen** (eller en kvitteringsliknende oppsummering hvis bilde mangler), feltene **navn og beløp**, **kategori**, og knappene **Lagre endringer** og **↺ Til gjennomgang**. «✦ På nytt» står på raden.
- Lagre endrer den bokførte transaksjonen og logger endringen (hvem, når, hva). Bildet kan åpnes i fullskjerm med zoom.

## Tekst: Glimt, ikke AI (2026-10-20)
Ønske: «i kvittering, når analyseres av ai skriv analyseres av glimt.»
- Kvitteringer: overskriften «ANALYSERES AV AI · N» → **«ANALYSERES AV GLIMT · N»**. «✦ Analyserer på nytt …» → **«✦ Glimt analyserer på nytt …»**, «✦ Analysert på nytt» → **«✦ Glimt har analysert på nytt»**.
- Bruk «Glimt» i stedet for «AI» i brukertekster om kvitteringslesing (iOS, Android, web, Mac). Modellnavn (Gemini, Qwen) kan stå som detalj.
