# Nyhetsleser: bilde i listen og artikkelvisning

Fasit: `Nyhetsleser.dc.html`.
- **Liste:** hver sak har et bilde på 76 × 76 px til høyre. Kilde i prioritert rekkefølge: RSS `media:thumbnail` / `media:content` / `enclosure`, så `og:image` fra artikkelsiden (hentes i backend, cache 24 t). Ingen bilde: kildefarge + initialer.
- **Trykk åpner saken i appen** (ikke rett til nettsiden): stort bilde 16:9, kategori og kilde, tittel, «I dag 09:12 · ca. 3 min å lese», **✦ AI-sammendrag** (2–3 setninger + 3 hovedpunkter), knapp «Les hele saken hos NRK ↗», Del, og «Mer om …» (samme kategori).
- Sammendrag: backend henter artikkelteksten (readability/trafilatura), Ollama lager JSON `{sammendrag, punkter[3]}`. Cache per URL. Merk «Laget av AI fra saken. Kan inneholde feil.»
- Lesetid = ord / 230.
