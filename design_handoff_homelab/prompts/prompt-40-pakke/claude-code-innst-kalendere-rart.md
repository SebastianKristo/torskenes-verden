# Innstillinger → Kalendere (web): ting som ser rart ut

Ønske 2026-10-20: «her og rarr» (vedlegg: `vedlegg/innst-kalendere-rart.png`, `vedlegg/innst-kalendere-segment.png`).
Samme feiltype som domene-ikonene (`claude-code-domener-ikon-farge.md`): elementer som bruker en tema-variabel som ikke finnes i Papir, eller mangler fast størrelse.

## 1. Kalenderradene mangler fargen
- Personlig, Bursdager, Skole og Helligdager er rykket 24 px inn, men det står ingenting der. Fargeprikken rendres usynlig.
- Fiks: fast **12 × 12 sirkel** (`flex:none`) med kalenderens farge, 12 px før navnet: Personlig `#B23A2A`, Bursdager `#8A3FA0`, Skole `#2F7A4F`, Helligdager `#A8661A` (samme som i Kalender-appen). Hentes fra kalenderens `color`, aldri fra en CSS-variabel uten fallback.
- Tallet til høyre («1») er uklart. Bytt til «1 kilde ›» (dempet) og gjør raden trykkbar (åpner kalenderens innstillinger: farge, navn, vis/skjul, kilde).

## 2. «Velg ›→»
- Dobbel pil. Skal være **«Velg ›»** (én chevron), samme stil som andre rader.

## 3. Segmentkontrollen «Med toppmeny · Fullskjerm»
- Har firkantede hjørner og en grå boks rundt. Skal være lik resten av Papir:
  - Spor: `#E9E2D3`, radius 999, padding 3, gap 2.
  - Valgt: `#1B1A17` pille (radius 999) med `#F3EFE6` tekst. Ikke valgt: transparent, `#1B1A17` tekst.
  - Høyde 36, tekst 13,5 px / 700 Manrope, `white-space:nowrap`.

## 4. Skole og Canvas
- Hjelpeteksten under «Skole-iCal» er rykket inn og har sin egen skillelinje. Den skal stå rett under raden, venstrejustert med «Skole-iCal», uten egen linje (skillelinjen kommer etter hjelpeteksten).
- «••••••••• lagret» i monospace ser ut som en feil. Vis «Lagret ✓» i dempet tekst (`#8F897C`, Manrope 14 px) og «Fjern» som lenke i rødt. Klikk på «Lagret» lar deg lime inn ny adresse.

## Felles regel
Alle ikoner, prikker og avatarer i Innstillinger har fast størrelse og `flex-shrink:0`, og farger kommer fra dataene eller Papir-tokens med fallback.
