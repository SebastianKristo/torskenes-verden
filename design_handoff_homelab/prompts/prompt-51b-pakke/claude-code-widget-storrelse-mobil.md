# Endre størrelse på widgets på Hjem (mobil)

## Hva
I redigeringsmodus på Hjem (hold inne → widgetene vipper) får hver widget et lite håndtak (↔, 34 px rundt) nede i høyre hjørne, i tillegg til «–» (skjul) oppe til venstre.

- **Halv → full bredde:** dra håndtaket utover (mer enn 40 px, uansett retning) → widgeten tar hele raden.
- **Full → halv bredde:** dra håndtaket innover/mot venstre (mer enn 40 px) → widgeten blir en halv flis.
- **Trykk** på håndtaket (uten å dra) bytter mellom halv og full.
- Endringen vises live mens man drar, med et lite vibrasjonsklikk ved hvert bytte. Lagres når man slipper.

## Gjelder
Alle widgets på Hjem unntatt Søk og Snarveier (de er alltid fulle). Standard som i dag: Avgang, Finans, Middag, Familie, Domener, Kalender, Bursdag, Bolig og Prøve er halve; resten fulle.

Kun mobil (smal visning). iPad/web beholder sitt rutenett.

## Lagring
`papir_layout.hjem.sz = { h9: 'full', h8: 'half', … }` ved siden av `order` og `hid`. Synkes per bruker som resten av oppsettet. Når `order`/`hid` lagres, beholdes `sz`.

## Implementasjon
- Håndtaket ligger i et `data-edc`-område så lang-trykk/flytting av widgeten ikke starter.
- `touch-action: none` på håndtaket; pointer-lyttere på window under draget.
- iOS: i SwiftUI-gridet, sett `gridCellColumns(isFull ? 2 : 1)` per widget. Android: `GridItemSpan(if (full) 2 else 1)` i `LazyVerticalGrid`.
- En widget i full bredde bruker samme innhold, bare bredere (ingen egen layout nødvendig nå).

Design: `Homelab.dc.html` (`edVals` → `rz_*`, `rzOn`, `gc`).
