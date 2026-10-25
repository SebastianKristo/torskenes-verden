# Glimt-figur: Blekksprut (Rune)

Fasit: `glimt-figurer.js` → `fig('blekk', S, humør)`. Samme figur ligger i `Glimt Figurer.dc.html` (1h) og i figurvelgeren i `Glimt Brief.dc.html`.

## Figuren
- Kroppen er Runes bilde med ansiktet fjernet: `assets/glimt-blekk-base.png` (gjennomsiktig bakgrunn, ingen rynker, øyne eller tåre).
- Ansiktet tegnes oppå som SVG (viewBox 0 0 600 536, samme størrelse som bildet), så det kan endre humør:
  - **Rolig:** opphøyde øyelokk-ringer, blanke pupiller som blunker, lite smil.
  - **Glad:** smileøyne, stort åpent smil, rosa kinn, én stor gledeståre under venstre øye.
  - **Snakker:** blanke pupiller, munnen går, rosa kinn.
  - **Sover:** lukkede øyne, liten rund munn, zz.
- Ingen trist panne. Figuren skal se glad og vennlig ut.

## Figur per bruker
- Valget lagres per bruker: `localStorage glimt_char_<bruker>` (bruker = `uKey()`, f.eks. `rune`). `glimt_char` skrives fortsatt for bakoverkompatibilitet.
- Lesing: `glimt_char_<bruker>` → standard per bruker → `glimt_char` → `glimt`.
- Standard: `{ rune: 'blekk' }`. Rune ser blekkspruten uten å velge noe selv.
- I appen: lagre valget på brukerprofilen på serveren (`glimt_char`-felt), ikke bare lokalt, så det følger Rune på alle enheter.

## Karakter i Glimt
- id `blekk`, navn «Blekksprut», navnelapp `BLEKKSPRUT`, farge `#f1a3ad`.
- Stemmeinstruks: blid og nysgjerrig blekksprut med seks armer, varm, leken og litt klønete, ler lett. Norsk bokmål.
- Stemmejustering (tonehøyde/fart): `[1.06, 1.02]`.
- Hilsen ved valg: «Hei! Seks armer klare. Nå er jeg din Glimt.»
