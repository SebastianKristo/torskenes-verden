# Kalender: «Ny hendelse» kan fylles ut med Glimt

Fasit: `Kalender.dc.html` → `fmAi()` (kalles fra skjemaet `fm`).

## UI
- Øverst i arket «Ny hendelse» / «Rediger hendelse», over Tittel: et lilla tonet felt (radius 18, `#7a5ad6` 9 % + 24 % innerkant).
  - Etikett: «✦ BESKRIV MED GLIMT» (Plex Mono, lilla). Til høyre etter utfylling: «✓ Fylte ut tittel, dato, tid og sted» (grønn).
  - Tekstfelt (2 linjer): «F.eks. «Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før» eller lim inn en melding».
  - Knapp **Fyll ut** med Glimt-merket (28 px). Den er lilla og svak når feltet er tomt, og mørk når det står tekst der. Mens den jobber: «Fyller ut …» og merket spinner.
  - Enter = Fyll ut (Shift+Enter = ny linje).
- Feltene under fylles ut og kan rettes før man trykker Lagre. Ingenting lagres automatisk.

## Hva som tolkes
- Tittel, dato, tid (fra–til eller start + typisk varighet), sted: samme parser som «✦ Skriv time» (`QP`).
- Gjenta: «hver dag/daglig», «hver uke/ukentlig/hver tirsdag», «hver måned».
- Varsel: «dagen før», «1 time før», «15 min», «10 min», «ingen varsel».
- Kalender: «familie / barna / mamma / pappa» gir Familie, ellers Privat.
- Lang tekst (> 60 tegn, f.eks. innlimt SMS fra legekontoret) legges også i Merknad.
- Finner ikke parseren dato: spør AI (lokal modell) om JSON `{t,k,s,e,all,r}`. Feiler det: fyll det som ble funnet og vis «Fant ikke dato. Velg dato under.» (rød).
