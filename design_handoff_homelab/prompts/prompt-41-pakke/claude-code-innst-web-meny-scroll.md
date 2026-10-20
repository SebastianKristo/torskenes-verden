# Fiks: Innstillinger (web) – sidemenyen hopper til toppen

Ønske 2026-10-20: «fortsatt i web versjonen, i inntlinger når jeg scroller ned å trykker på bruker tar den meg til toppen i scrollebaren igjen. den skal ikke det»
Fasit: `Innstillinger Web.dc.html`.

## Feil
Scroller du ned i venstremenyen og trykker f.eks. **Brukere**, hopper menyen tilbake til toppen.

## Årsak (sannsynlig)
Sidemenyen remountes ved rutebytte (`/innstillinger/:seksjon` rendrer hele layouten på nytt, eller lista har `key` som endres), eller koden kaller `scrollTo(0,0)` / `window.scrollTo` ved hvert bytte. Det nullstiller også menyen.

## Riktig
- Sidemenyen ligger **utenfor** rute-outleten og remountes ikke når seksjonen byttes (felles layout-komponent, stabile `key`-er per menypunkt).
- Menyens `scrollTop` lagres i en ref (og i `sessionStorage` `innst_nav_y`) ved scroll, og settes tilbake etter navigering hvis den likevel rendres på nytt.
- `overflow-anchor: none` på menylista så den ikke hopper når innhold endres.
- Bare **innholdsdelen** (høyre) scrolles til toppen når du bytter seksjon. Ikke `window.scrollTo`, ikke `scrollIntoView` på aktivt menypunkt.
- Trykk på samme seksjon igjen: ingenting flytter seg.
- Gjelder også søk: når søket tømmes, vises menyen der du var.
- Samme regel i Mac-appen (sidebar `List` med `selection`, ikke ny `NavigationSplitView` per seksjon).

## Sjekk
- Scroll helt ned i menyen → trykk Brukere → menyen står stille, innholdet starter øverst.
- Bytt mellom fem seksjoner nederst i menyen: ingen hopp.
- Last siden på nytt på `/innstillinger/brukere`: aktivt punkt er synlig (scrolles inn kun ved første last, med `block: nearest`).
