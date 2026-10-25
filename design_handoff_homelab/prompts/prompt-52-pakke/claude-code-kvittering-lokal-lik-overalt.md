# Kvitteringsleser: én leser overalt, ingen Gemini

Ønske: «kvittering leser i boliger skal være lik som i resten av systemet, fjern også gemini fra å lese kvittierngr selv som backup.»

## 1. Samme leser og visning i Boliger
- Boliger skal bruke **samme kvitteringstjeneste** som Transaksjoner/Kvitteringer (`receiptService.read(file)`). Ingen egen opplasting eller egen tolkning i Boliger-modulen.
- Visningen i Boliger er nå lik transaksjonspanelet (`Boliger Web.dc.html` → `rcv`): panel fra høyre (maks 500 px, egen scroll, `overscroll-behavior: contain`), logo + ×, butikk, «dato · bolig · kategori», stort beløp, **✦ Glimt-beskrivelse** med varelinjer, deretter selve kvitteringen (bilde / PDF / papir-gjengivelse), «⇩ Last ned original», «Endre», «Lukk».
- Bruk samme komponent (`<ReceiptPanel>`) begge steder, så endringer bare gjøres én gang.

## 2. Fjern Gemini fra kvitteringer
- Kvitteringer leses **bare lokalt**: Ollama med visjonsmodell (`qwen2.5vl` / `llama3.2-vision`) → lokal OCR (Tesseract/PaddleOCR) som reserve → legg i kø og prøv igjen senere.
- Fjern Gemini (og andre skytjenester) fra rekkefølgen for «Les kvitteringer», også som backup. Fjern alternativet i innstillingene og migrer lagrede verdier: `rc_engine: 'gemini'` → `'ollama'`.
- Kvitteringsbilder, varelinjer og beløp skal aldri sendes ut av huset. Logg en advarsel hvis noe forsøker å kalle en sky-API med et kvitteringsbilde.
- «Finn logo med Gemini» (bare butikknavnet sendes) kan beholdes som eget valg, av som standard.
- Tekster i appen: «Gemini leser …» → «Glimt leser lokalt …». Kilde på kvitteringer: «Lokal AI».

## 3. Test
- Last opp kvittering i Boliger og i Kvitteringer: samme felt, samme panel, samme resultat.
- Stopp Ollama: kvitteringen går til lokal OCR eller kø, aldri til Gemini.

## Mobil
- Samme regler i mobilappen: Boliger-arket (`Boliger.dc.html` → `det`) bruker samme kvitteringskomponent som Finans → transaksjon (`tx1` i `Homelab.dc.html`). Ingen egen leser i Boliger.
- Ingen Gemini i mobilens kvitteringsflyt (kamera, filvalg, del-til-app). Bare Ollama lokalt → lokal OCR → kø.
