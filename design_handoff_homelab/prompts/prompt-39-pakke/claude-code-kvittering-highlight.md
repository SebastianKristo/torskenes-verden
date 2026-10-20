# Finans-søk: marker hvor i kvitteringen treffet er

Fasit: `Mobil Papir App.dc.html` → Finans → Søk (f.eks. «tomat») → trykk på treffet → transaksjon med kvittering.

## Oppførsel
- Når en transaksjon åpnes fra **Søk** eller fra **Liste** med søketekst, sendes søkeordet med (`?hl=tomat`).
- Over kvitteringen: gult banner «‹tomat› står på linje 3 · 24,90 kr» (+ «og 1 til» ved flere treff). Trykk på teksten scroller til linjen igjen. **Fjern** skjuler markeringen.
- Linjen(e) som matcher får gul bakgrunn `rgba(255,205,40,.42)` med kant `#e0a800`, fet tekst og pris. Selve ordet markeres sterkere (`#ffd23f`, som en markeringstusj).
- Siden scroller automatisk så linjen er midt på skjermen, og linjen pulserer to ganger (900 ms).
- Match er uavhengig av store/små bokstaver og aksenter. «tomat» matcher «TOMATER CHERRY».

## Ekte kvitteringsbilde (foto/PDF)
- OCR-steget (Gemini/Ollama vision) må returnere **bounding box per varelinje**: `lines: [{text, price, bbox:[x,y,w,h]}]` i prosent av bildet. Lagre sammen med kvitteringen.
- Vis bildet med et gult, halvgjennomsiktig rektangel (`rgba(255,210,63,.35)`, kant 2 px `#e0a800`, radius 4) over hver matchende linje. Zoom/scroll bildet så første treff er synlig. Pinch-zoom skal fortsatt virke.
- Mangler bbox (eldre kvitteringer): vis bare den tolkede linjelisten med markering som i fasiten. Tilby «Les kvitteringen på nytt» for å hente posisjoner.
- Backend-søk: `GET /api/finance/search?q=tomat` returnerer for hvert treff `{txId, lineIndex[], matchedText}` så appen vet hvilke linjer som skal markeres.
