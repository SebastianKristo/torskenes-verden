# Chat: egen mappe for kvitteringer og skanninger

Fasit: `Homelab Papir Web.dc.html` og `Mobil Papir App.dc.html` → `SCAN_F`, `SCAN_SEED()`, `chLoad()` (migrering + `papir-scan`-lytter), mappegruppene i chat-sidemenyen. `FinansHub v2.dc.html` sender `papir-scan` ved ny kvittering.

## Hva
- Alt AI gjør med skanning havner som **egne samtaler** i mappen **«Kvitteringer og skanninger»** øverst under MAPPER i Chat (web og mobil). De blandes **ikke** med vanlige samtaler (I dag / I går …).
  - Kvitteringer: kamera, opplasting, e-post/PDF.
  - Pakkelapper og strekkoder.
  - Finn-e-poster.
  - Automatisk kategorisering etter bankimport.
- Mappen har eget kvitteringsikon i rødt, viser antall og «· N til godkjenning», og er **lukket som standard**.
- Hver samtale:
  - Tittel: «Butikk · beløp» (f.eks. «REMA 1000 Bislett · 247,80 kr») eller «Pakkelapp · Bring 70712…».
  - Melding 1 (bruker/system): kilde («Kvittering skannet med kamera» / «fra e-post …») og vedlegget (bildet/PDF-en, trykk for å se).
  - Melding 2 (modell): butikk, tid og sum, varelinjer, kategori og sikkerhet, og hva som ble gjort («Bokført i Finans», «Lagt i Til godkjenning», «Lagt til i Sporing»). Verktøy-chips viser stegene («Leste kvittering ✓ Fant 9 varelinjer ✓ Kategoriserte ✓ Bokført»). Modellnavn står i hodet.
  - Man kan **skrive videre** i samtalen («feil kategori, det var studie», «del opp på to personer», «hvorfor 72 %?»), og Glimt endrer bilaget.
- Ikke mulig å slette eller gi nytt navn til selve mappen (systemmappe). Enkeltsamtaler kan slettes, og da slettes ikke bilaget.

## Teknisk
- Datamodell: chat `{id, t, f:'Kvitteringer og skanninger', sys:true, kind:'receipt'|'label'|'categorize'|'finn', ref:{receiptId|trackingId|importId}, m, up, msgs[]}`.
- Backend: alle AI-jobber med `kind` i (receipt, label, categorize, finn) oppretter/oppdaterer en chat i mappen (`POST /api/chat/system`). Jobben strømmer statusen inn i samme samtale («Leser …» → ferdig). Se Jobber i `claude-code-ai-kontroll.md`.
- Klient-hendelse i prototypen: `window.dispatchEvent(new CustomEvent('papir-scan',{detail:{title,src,att,model,text,tool}}))`.
- Migrering: eksisterende brukere får mappen lagt til først i `folders` (`scanSeeded`).
- Søk i chat finner også skanninger (butikk, varer, beløp).
- Varsel: «Kvittering lest · REMA 1000 · 247,80 kr» åpner samtalen i mappen.

## Kvitteringer (mobil): «Analyseres av AI»
Fasit: `Mobil Papir App.dc.html` → Kvitteringer → `kv.ai` / `rcAiL()` / `rcAiTick()`.
- Ny seksjon **✦ ANALYSERES AV AI · N** øverst, under Ta bilde / Bilder / Filer og over KØ og TIL GJENNOMGANG.
- Ett kort per kvittering som leses nå:
  - Miniatyr med en rød skannelinje som glir over bildet.
  - Tittel: «Leser kvittering …» → butikknavn når det er funnet. Beløpet vises når det er lest.
  - Undertekst: filnavn → «6 varelinjer» → «Mat og dagligvarer · 94 % sikker». Modell-chip (`qwen2.5vl:7b` / `gemini-2.5-flash`).
  - Fremdriftslinje og stegliste som hukes av: Lastet opp ✓ · Leser bildet · Finner butikk, dato og sum · Leser varelinjer · Foreslår kategori.
  - **Følg i Chat ›** åpner samme samtale i mappen «Kvitteringer og skanninger», der statusen strømmes. **Avbryt** stopper jobben.
- Når opplastingen i KØ er ferdig, går kvitteringen **automatisk** videre til AI-analysen.
- Ferdig: kvitteringen flyttes til **Bokført** (sikkerhet ≥ terskel, standard 85 %) eller **Til godkjenning**. Chat-samtalen får det endelige svaret. Toast «✦ Kvittering lest · KIWI Majorstuen» med dobbel haptikk.
- Data fra backend: `GET /api/ai/jobs?kind=receipt` (SSE) → `{id, file, thumb, model, progress, step, partial:{store,sum,lines,category,confidence}}`. Delresultater vises så fort de finnes.
