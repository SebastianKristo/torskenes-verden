# Finans (mobil og web): «Les kvitteringen på nytt» med Glimt + rediger alt i en transaksjon

Ønske 2026-10-20: «i liste i finasn mobil og web la meg få glimt til å gå over kvitteringen på nytt. la meg også rediger all infoen i trnaskjoner som dato og slikt.»
Fasit: `Mobil Papir App.dc.html` → Finans → Liste → transaksjon (`txTools`, `tx1.reread`, `tx1.ed`). Web: samme funksjon i `FinansHub v2.dc.html` (detaljpanelet) og `FinansHub Mobil v2.dc.html` (detaljsiden har allerede «Rediger»; legg til «Les på nytt»).

## 1. ✦ La Glimt lese kvitteringen på nytt
- Knapp under kvitteringen (full bredde, mørk): «✦ La Glimt lese kvitteringen på nytt». Web: samme knapp i detaljpanelet og i høyreklikkmenyen i lista.
- Mens den jobber: kort med Glimt-merket «Glimt leser kvitteringen på nytt … Sjekker butikk, dato, hver linje og at summen stemmer».
- Resultat:
  - **Endringer funnet:** tekst + liste «gammelt (gjennomstreket) → nytt» per felt/linje (butikk, dato, beløp, linjer, MVA). Knapper «Bruk endringene» / «Behold som før».
  - **Ingen endringer:** «Ingen endringer. Butikk, dato og alle 6 linjer stemmer, og summen er 386,50 kr.» + OK.
  - **Summen stemmer ikke:** si fra og pek til «Rediger alt».
- Backend: `POST /api/receipts/{id}/reread` → kjører kvitteringslesingen på nytt med **originalbildet i full oppløsning** (ikke miniatyr), samme pipeline som i `claude-code-glimt-kvittering-lesing.md` (sumkontroll, læring fra rettinger). Kan velge modell («Les med Gemini» / «Les lokalt»). Returnerer `{changes:[{field, old, new}], lines_new, total_ok}`. Endringene lagres bare når brukeren trykker «Bruk endringene». Logg som jobb i AI → Jobber.
- Brukerens tidligere manuelle rettinger på samme butikk sendes med som eksempler, så samme feil ikke kommer igjen.

## 2. Rediger alt
- «Rediger alt» åpner et ark (mobil) / panel (web) der **alle felt** kan endres:
  - Butikk/beskrivelse · Dato (datovelger) · Beløp (beholder fortegn: utgift/inntekt) · Kategori (chips) · Konto (chips) · Notat
  - **Varelinjer:** endre navn og pris, fjerne (×) og «+ Legg til linje».
  - Sumkontroll live: «Sum linjer 386,50 kr · stemmer» (grønn) / «… stemmer ikke med beløpet» (rød).
  - «Tilbakestill til slik Glimt leste den».
- Lagre oppdaterer transaksjonen overalt (liste, budsjett, Økonomi-kortet på Hjem) og viser «Sist endret … av Sebastian» nederst (se `claude-code-finans-lagt-til.md`).
- Backend: `PATCH /api/transactions/{id}` med alle felt + `lines`. Lagre originalverdiene fra lesingen i `receipt_extractions`, så «Tilbakestill» virker. Endringer i linjer brukes som treningseksempler for neste lesing.
- Web: tastatur – `E` åpner Rediger, `R` = Les på nytt, `⌘S` lagrer, `Esc` avbryter.
