# Chat: nytt «Legg ved»-ark

Fasit: `Mobil Papir App.dc.html` → Chat → + (skjermbilde 13.30.40 viser gammelt).

## Feil i dag
- Tegn-ikoner (▣ ◉ ⎙ #) i ulik stil og størrelse.
- Arket er mye høyere enn innholdet (stort tomt felt nederst).
- Tittel og ✕ står ikke på linje; ingen grep-strek.

## Nytt oppsett
- Høyde etter innhold: iOS `.presentationDetents([.height(contentHeight)])` + `.presentationDragIndicator(.visible)`; Android `ModalBottomSheet` med `skipPartiallyExpanded = true` og innholdshøyde.
- Grep-strek 36×5, `line`. Tittel «Legg ved» Newsreader 24 + ✕-knapp 36 pt (`card` bakgrunn, strek-X), samme linje.
- **Tre fliser** i rad (grid 3, gap 8): **Kamera** (åpner kamera direkte) · **Bilder** (bildebibliotek, flere) · **Filer** (PDF, Word, tekst, CSV). Flis: `card`, radius 18, ikonboks 46×46 radius 14 i `bg`, strek-ikon 1.8, etikett 14/700.
- **Rad** under: «Fra kunnskapsbasen» + antall dokumenter, chevron ›. Samme ikonboks.
- Fotnote 12 `mut`: «Bilder leses av en bildemodell, f.eks. qwen2.5vl. Filer kan være PDF, Word, tekst eller CSV.»
- Ikoner: SF Symbols `camera`, `photo.on.rectangle`, `doc.text`, `books.vertical` (Android: Material Symbols Outlined tilsvarende).
