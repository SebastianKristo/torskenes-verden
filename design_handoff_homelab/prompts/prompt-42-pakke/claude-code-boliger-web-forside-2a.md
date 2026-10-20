# Boliger på web: forside etter design 2a «Alle boligene på ett ark»

Fasit: `Boliger Web v2.dc.html` → **2a** (vedlegg `uploads/Screenshot 2026-10-20 at 18.59.31.png`). Erstatter dagens Boliger-forside (boligliste til venstre + tallkort for én bolig).
**Inne i en bolig** brukes design 1b «Kontobok» (`claude-code-boliger-web-kontobok.md`). 2a er startsiden, og 1b er det man kommer til med **Åpne …**.
Grunnregler som i 1b: tekst 18 px, knapper ≥ 52 px med ord, kontrast ≥ 4.5:1, ingen tekst oppå bilder og tåler 200 % zoom.

## Rute
- `/finans/boliger` → 2a (alle boligene).
- `/finans/boliger/{id}` → 1b for boligen. «‹ Alle boligene» øverst til venstre i 1b går tilbake.
- Har brukeren bare **én** bolig: gå rett til 1b.

## Topp
- Brødsmule «FinansHub › Boliger», tittel «Boliger» (Newsreader 500, 56 px).
- Undertittel: «4 boliger · 98 280 kr brukt hittil i år» (sum for alle boligene brukeren har tilgang til, 1. jan → i dag).
- Til høyre: **+ Legg til utgift** (grønn `#2f6b4a`, 58 px). Åpner samme meny som i 1b (Ta bilde · Last opp · Send fra e-post · Skriv inn selv) med et **første steg «Hvilken bolig?»**: fire store knapper med bilde/farge og navn. Er bare én bolig valgbar, hoppes steget over.

## «Dette må gjøres»
Vises bare når det finnes noe. Maks 4 rader, sortert etter hast. «Vis alle (N)» under hvis flere.
- **Regning som forfaller** innen 7 dager, eller er forfalt: rød boks (`#fbeee4`, kant `#e8b9a3`), rundt merke «!», tekst «**Kommunale avgifter for Strømstad** forfaller fredag 31. oktober · 4 210 kr», knapp **Merk som betalt** (mørk). Forfalt: «forfalt for 3 dager siden».
  - Merk som betalt → raden forsvinner med toast «Merket som betalt · Angre».
- **Kvitteringer til gjennomgang** (Glimt har lest, ikke godkjent): gul boks (`#fbf3df`, kant `#e6cf98`), tall i merket, «**2 kvitteringer** er lest av Glimt og venter på at noen sjekker dem», knapp **Se på dem** → panel med de samme radene som «Til gjennomgang» i 1b (Godkjenn / Endre).
- **Utgift uten kvittering** eldre enn 7 dager (valgfritt, lav prioritet): «Jula, 645 kr i Strømstad mangler kvittering», knapp **Legg ved**.
- Ingen oppgaver: vis ingenting (ikke en tom boks).

## Boligkort (rutenett 2 kolonner, gap 22 px)
Ett kort per bolig, sortert som brukeren har valgt (dra for å endre rekkefølge i Rediger-modus) eller etter navn.
- **Toppbilde 130 px:** boligens bilde (`object-fit: cover`). Uten bilde: boligens farge med forbokstav (Newsreader 60 px, hvit) nede til venstre. Ingen tekst oppå bildet.
- **Navn** (Newsreader 30 px) og **type** under (Hytte i Sverige / Enebolig / Hytte / Leilighet). To boliger med samme navn (Toten): typen skiller dem, og knappen sier «Åpne Toten enebolig».
- **Tre rader** (etikett til venstre, `flex:none; white-space:nowrap`, verdi til høyre):
  1. **Brukt i år:** Plex Mono 600, 19 px.
  2. **Neste regning:** «Kommunale avgifter · 31. okt». Rød (`#9a2f22`) hvis innen 7 dager. Ingen: «Ingen faste regninger». Beløpet vises i «Dette må gjøres» og i 1b, ikke her (så linjen ikke brytes).
  3. **Kvitteringer:** «✓ Alt er i orden» (grønn `#2f6b4a`) eller «1 kvittering mangler» (rav `#8a5a12`) / «2 venter på gjennomgang».
- **Åpne …** (mørk, 56 px, full bredde) → `/finans/boliger/{id}`. Hele kortet er også klikkbart, men knappen er det tydelige valget.
- ⋯ øverst til høyre på kortet (44 × 44, «Mer») → Rediger bolig, Del med andre, Slett.
- Delte boliger: liten rad under typen med «Delt med Christine og Rolf» (bare når delt).
- Hold beløp og «kr» sammen: bruk `&nbsp;`/`\u202F` mellom tall og «kr», og mellom dato og måned.

## Nederst
- **+ Legg til bolig** (stiplet, 64 px, full bredde) → samme skjema som «Rediger bolig» (navn, type, adresse, budsjett, farge, bilde). Erstatter «+ Ny bolig i Innstillinger».

## Bredde
- ≥ 1100 px: 2 kolonner. 700–1100: 2 kolonner, toppbilde 110 px. < 700: 1 kolonne, og knappen i «Dette må gjøres» går under teksten i full bredde.
- Maks innholdsbredde 1180 px, sentrert.

## Data (ett kall)
`GET /api/boliger/oversikt?year=2026` →
```json
{ "sumYear": 98280,
  "todo": [{ "type":"bill_due", "homeId":"str", "title":"Kommunale avgifter", "due":"2026-10-31", "amount":4210, "billId":"…" },
           { "type":"review", "count":2 }],
  "homes": [{ "id":"str", "name":"Strømstad", "type":"Hytte i Sverige", "color":"#2b5d8a", "image":"/api/boliger/str/bilde",
              "spentYear":28760, "nextBill":{ "title":"Kommunale avgifter", "due":"2026-10-31", "amount":4210 },
              "receipts":{ "missing":1, "review":0 }, "sharedWith":[] }] }
```
- Bare boliger brukeren har tilgang til. Summer regnes på serveren.
- Oppdater etter Merk som betalt / Godkjenn / ny utgift uten å laste siden på nytt.

## Bevar
FinansHub-sidemenyen, Glimt-søket, varsler, profil, mørkt tema (`--b-*`-tokens: kort `--b-card`, linjer `--b-line`; rød/gul boks får mørke varianter `#3a2420`/`#3a3020` med lys tekst).

## Test
- 4 boliger med ulike tilstander vises som i fasiten. Ingen tekst brytes midt i et beløp.
- Merk regning som betalt fra «Dette må gjøres», og angre.
- Klikk Åpne Toten hytte → 1b for riktig bolig. Tilbake gir 2a.
- Bare én bolig → rett til 1b. Ingen oppgaver → ingen «Dette må gjøres».
- Tastatur: Tab går gjennom oppgaver, så kortene i rekkefølge. Zoom 200 % uten horisontal scroll.
