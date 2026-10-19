# Tøm-knapp (✕) i alle søkefelt

Lag én felles komponent `SearchField` og bruk den overalt (web, iOS, Android, Fold).

- Tomt felt: forstørrelsesglass til venstre.
- Med tekst: forstørrelsesglasset byttes til **✕** på samme plass (venstre). 26 px sirkel med `rgba(127,127,127,.22)`, 11 px kryss, trykkflate minst 36 px (44 px på mobil der det er plass).
- Trykk: tøm verdien, avbryt ventende søk (debounce / fetch `AbortController`), lukk forslag og treff, nullstill «valgt forslag».
- Behold fokus og tastatur: `onPointerDown: e.preventDefault()` på knappen (web), ikke kall `blur()` (native). Android: `TextField` med `leadingIcon` som bytter. iOS: egen venstre-knapp, ikke `clearButtonMode` (den står til høyre).
- `aria-label="Tøm søket"`. Esc på web tømmer også.
- Fasit: `Mobil Papir App.dc.html`, `Boliger.dc.html`, `Bursdager.dc.html`, `Vaer.dc.html`, `Nyhetsleser.dc.html`, `Matplan.dc.html`, `Homelab Papir Web.dc.html`.
