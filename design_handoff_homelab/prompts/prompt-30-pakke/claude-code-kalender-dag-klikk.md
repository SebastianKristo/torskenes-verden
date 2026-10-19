# Kalender: trykk på en dag åpner den dagen

Fasit: `Kalender.dc.html` (web og mobil).
Vedlegg: web, månedsvisning med minikalender i sidepanelet. Trykk på en dato gjorde ingenting synlig (bare markering).

## Oppførsel
- **Minikalender (sidepanel på web):** trykk på en dato → bytter til **Dag**-visning for den datoen. Ukenummer til venstre → **Uke**-visning for den uka (uendret).
- **Månedsvisning (stort rutenett):** trykk hvor som helst i dagruten (dato, tomt felt, «+N») → **Dag**-visning for den datoen. Trykk på en hendelse åpner hendelsen (som før). Ukenummer → Uke.
- **Mobil, nedtrekks-minikalender:** står du i Dag, 3 dager eller Uke, beholdes visningen og den hopper til datoen. Fra Måned eller Liste → Dag.
- Lett haptikk (8 ms). Valgt visning lagres som før.
- URL på web: `/kalender/dag/2026-10-21`, så tilbake-knappen går til forrige visning.
