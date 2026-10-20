# AI-kontroll: Glimt anbefaler hvilke modeller du skal laste ned og hva de brukes til

Ønske 2026-10-20: «la ai bli bedre på å vise hvilke modeller som skal lastes ned og hva de kan brukes til, bruk kanskje til og med glimt til å bestemme hvilken modell som er best til hva.»

Fasit: `AI Kontroll.dc.html` → fanen **Modeller** → kortet **✦ GLIMT ANBEFALER** (over «Last ned fra Ollama»). Se `REC`, `RKW` og `R.md.gl` i logikken.

## 1. Glimt anbefaler-kortet
- Overskrift: «✦ GLIMT ANBEFALER · <maskin> · <minne>». Maskin og minne hentes fra Ollama-verten (se `claude-code-ai-maskin-mac-mini.md`).
- Én rad per oppgave (Chat, AI-søk, Glimt, Kvitteringer, Kategorisering, Finans · spør, Strekkoder, Domener, Kunnskapsbase). Raden viser:
  - oppgave + anbefalt modell (mono) + PASSER / TRANGT
  - én setning om hvorfor + «Alternativ: …»
  - knapp: **I bruk** (deaktivert) / **Bruk** (installert, setter rutingen) / **Last ned · 6,0 GB** / **Laster …**
- Under radene:
  - **Last ned det som mangler · X GB** (starter alle nedlastinger i kø, én om gangen)
  - **Bruk alle anbefalinger (n)** (bytter rutingen for alle installerte)
- **Spør Glimt**: fritekst «Hva vil du bruke AI til?».
  - Eksempel: «lese kvitteringer» → «Til kvitteringer anbefaler jeg qwen2.5vl:7b (6 GB, passer). Best til å lese tekst i bilder, bare 6 GB. Alternativ: minicpm-v.» + knappen **Last ned qwen2.5vl:7b**.

## 2. Modellbiblioteket
- Hver modell viser i tillegg:
  - «Brukes til: Glimt · AI-søk · Finans · spør»
  - «✦ Glimt anbefaler til …» (rød) når modellen er førstevalg for en oppgave
- Nye modeller i biblioteket: `gemma3:12b`, `qwen3:8b`, `llama3.2:3b`.

## 3. Slik bestemmer Glimt (backend)
Lag `GET /api/ai/recommend` som returnerer `{task, model, why, alt, fit, installed, inUse}[]`.
1. **Kandidater per oppgave** fra en kuratert tabell (start med `REC` i fasiten). Hver kandidat har:
   - `norsk` (1–5)
   - `fart` (tok/s målt på verten)
   - `minneGB`
   - `evner` (`bilde`, `verktøy`, `embedding`, `resonnering`)
2. **Filter:** krever oppgaven bilde/embedding, må modellen ha evnen. `minneGB` ≤ GPU-grensen (≈ ⅔ av samlet minne). Er «Finansdata forlater aldri huset» på, er bare lokale modeller lov for finans-oppgaver.
3. **Score** = vekter per oppgave:
   - kvittering: nøyaktighet 0,6 · fart 0,2 · minne 0,2
   - chat: norsk 0,5 · fart 0,3 · minne 0,2
   - kategorisering: fart 0,6 · minne 0,4
   - osv.

   Installerte modeller får +0,1. Da slipper man unødvendige nedlastinger.
4. **Minnebudsjett:** sørg for at kombinasjonen ikke krever mer enn én stor modell + én liten samtidig. Foretrekk at flere oppgaver deler samme modell.
5. **Glimt skriver begrunnelsen:** send toppkandidat + alternativ + tallene til Glimt-modellen. Be om én kort norsk setning per oppgave. Cache svaret 7 dager, og regenerer når modeller installeres eller fjernes eller maskinen endres.
6. **Lær av bruk:** logg tokens/s, feilrate (f.eks. sumkontroll på kvitteringer, se `claude-code-glimt-kvittering-lesing.md`) og brukerens manuelle bytter. Oppdater `fart` og `nøyaktighet` i tabellen med målte tall.

## 4. «Spør Glimt»
`POST /api/ai/recommend/ask {q}` → Glimt mapper teksten til oppgave(r) (f.eks. «kode», «kvitteringer», «kalender») og svarer med anbefaling + knapp. Lokal fallback = nøkkelord (`RKW` i fasiten). Ukjent: foreslå allrounder og eksempler.

## 5. «La Glimt velge modeller» i Valg-fanen (2026-10-20)
Spørsmål: «er det lagt inn i ai meny at glimt kan fylle ut valg av aier til forskjellige ting»
- Øverst i **Valg** (og «AI-valg» i Finans): kort «✦ La Glimt velge modeller» med undertekst «Fyller ut 4 oppgaver med beste installerte modell · 1 mangler (se Modeller)» og knappen **Fyll ut**.
- Fyll ut setter hovedmodellen for hver oppgave til Glimts førstevalg **blant installerte/aktiverte** modeller (`REC`, samme rangering som i Modeller). Reservemodellen røres ikke. Toast «✦ Glimt fylte ut 4 valg» + angre i 5 s.
- Når alt allerede følger anbefalingen: «✓ Ferdig» (deaktivert).
- Finans-scope: «Finansdata forlater aldri huset» respekteres (bare lokale modeller for finans-oppgaver).
- Fasit: `AI Kontroll.dc.html` → `R.rt.glPlan / glGo`.

## Test
- Mac mini M4 16 GB: kortet viser `gemma4:latest` (I bruk) for Chat, `qwen2.5vl:7b` for Kvitteringer og `llama3.2:3b` for Kategorisering. Ingen FOR STOR-modell anbefales.
- «Last ned det som mangler» legger modellene i kø, og fremdriften vises under «Laster ned».
- «Bruk alle anbefalinger» endrer Valg-fanen tilsvarende.
