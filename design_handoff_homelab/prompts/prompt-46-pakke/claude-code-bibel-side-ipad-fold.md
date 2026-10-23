# Bibel-side: oppsett for iPad og Fold

Fasit: `Bibelvers.dc.html` → `mode="page"`. Siden bruker nå et responsivt grid: `repeat(auto-fit, minmax(min(100%, 330px), 1fr))`.

## Oppsett
- **Mobil (smal):** uendret, én kolonne i samme rekkefølge som før.
- **iPad og Fold åpen (bredde ≥ ca. 680 pt):** to kolonner.
  - **Venstre:** Rekke-kortet (flamme, uke, lengste) og Dagens vers (med Glimt i prestedrakt, Lest/Lagre/Forklar/Kopier, Glimt-forklaring).
  - **Høyre:** Leseplan, statistikk (3 bokser), lagrede vers, daglig påminnelse og kildetekst.
- Kolonnene er toppjustert. Avstand 14 pt vertikalt og 18 pt mellom kolonnene.
- Fold lukket = mobiloppsett. Bytter automatisk når skjermen brettes ut/inn eller ved rotasjon, uten å miste tilstand (lest, forklaring åpen, valgt plan).
- iPad og Fold: Bibel-siden er unntatt den vanlige maksbredden på 720 pt for undersider. Den bruker maks 1100 pt, sentrert, så to kolonner får plass (Fold åpen ≈ 2 × 330 pt). Fasit: `Mobil Papir App.dc.html` → `cMax`.

## Implementasjon
- iOS: `ViewThatFits` eller `horizontalSizeClass == .regular` → `HStack(alignment: .top)` med to `VStack`. Ellers `VStack`.
- Android: `WindowSizeClass` (Medium/Expanded) → `Row` med to `Column(Modifier.weight(1f))`. Compact → én `Column`.
- Ingen nye komponenter: gjenbruk eksisterende kort.
