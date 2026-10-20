# Now Brief: trykk på bibelvers-kortet åpner Bibel-siden

Fasit: `Bibelvers.dc.html` (`mode="brief"`, `openP`), `Glimt Brief.dc.html` (`onOpenBibel`), `Mobil Papir App.dc.html` (`briefBibel`).

- Hele bibelvers-kortet i Now Brief er trykkbart (begge plasseringer: øverst morgen/kveld og nederst etter at verset er lest/sveipet bort).
- Trykk: lett haptikk (8 ms), briefen lukkes, og appen går til **Bibel-siden** (samme side som Mer → Bibel og Hjem-kortet).
- Knappene «Kopier» og «↻ Nytt vers» inne i kortet gjør bare sin egen handling (stopper trykket fra å åpne siden).
- Et sveip på kortet skal ikke regnes som trykk (bruk samme terskel som sveip-bort: over 8 px bevegelse = ikke trykk).
- Kortet vises bare for brukere med Bibel-modulen (Sebastian), så trykket finnes bare der.
- Tilgjengelighet: kortet har `role="button"` og «Åpne Bibel» som lesbar etikett.
