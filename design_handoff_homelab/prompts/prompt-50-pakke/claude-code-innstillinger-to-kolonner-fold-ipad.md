# Innstillinger i to kolonner på Fold og iPad

Ønske 2026-10-24: «lag innstlinger for fold og ipad litt som i  bilde nr 2» (referanse: Samsung-innstillinger på Fold – liste til venstre, valgt side til høyre).
Design: `Mobil Papir App.dc.html` (side `innst` med `wide`). Telefon er uendret.

## Når
Bredde ≥ 700 dp/pt (Fold utbrettet, iPad, iPad-vindu i Stage Manager når det er bredt nok). Under det: dagens ene kolonne. Bytt live ved rotasjon/bretting uten å miste valgt side.

## Venstre kolonne (300 pt, fast, følger med ved scrolling)
- Søkefelt med ✦ AI øverst. Treff filtrerer listen direkte.
- Alle hovedgrupper (Programvare, Konto, Finans, Papir, Glimt, App …) med liten gruppetittel og prikket skillelinje mellom gruppene.
- Rad: rundt farget ikon (hvitt symbol), navn, ingen undertekst. Statusverdi bare når den krever handling (f.eks. «Oppdater» i rødt).
- Valgt rad: kort-bakgrunn, fet tekst, myk skygge. Ny side åpnes i høyre kolonne, ikke som ny skjerm.
- Rader som åpner ark (Glimt, Nyhetsleser, AI og modeller) åpner arket som i dag.

## Høyre kolonne
- Ingenting valgt: oppdateringskort (hvis ny versjon) og profilkortet.
- Valgt side: stor tittel (Newsreader 32) og innholdet til undersiden. Ingen «‹ Alle innstillinger»-knapp; venstre listen er navigasjonen. Undersider i nivå 2 (f.eks. en integrasjon) beholder «‹ Integrasjoner».
- Bruker hele skjermbredden (ingen maks bredde). Venstre marg 28 pt (ikke 124 pt som på andre sider), venstre kolonne 300 pt, resten til høyre kolonne.
- Høyre kolonne: innholdet starter rett under tittelen (ingen strekking av rader når venstre liste er høyere).
- Undersider: gruppene (kortene) legges i et rutenett med kolonner på minst 380 pt – to kolonner på iPad og stor Fold-bredde, én når høyre del er smal. Tittel, tilbake-knapp, søkesvar og innebygde sider (Widgets, Kalendere, Aksjer) går over hele bredden.
- Ark (Glimt, Nyhetsleser, AI og modeller, ikon, rediger osv.) vises sentrert med maks 820 pt bredde i stedet for over hele skjermen.

## Plattform
- iOS/iPadOS: `NavigationSplitView` (sidebar + detail), `columnVisibility = .all`, egen stil så det matcher Papir (ikke systemets grå liste).
- Android: `ListDetailPaneScaffold` (Material 3 adaptive) med `WindowSizeClass` ≥ Medium. Tilbake-knappen lukker detaljsiden før den forlater Innstillinger.
- Husk valgt side per enhet (`papir_set_sub`).

## Test
- Fold: brett ut/inn mens en underside er åpen → samme side vises (som egen skjerm på telefon).
- iPad liggende og stående, og Split View 50/50 (smal → én kolonne).
- Søk i venstre kolonne → velg treff → riktig side til høyre.

## System / Nordlys-oppdatering (Fold og iPad)
- Hele bredden, venstre marg 28 pt som Innstillinger.
- To kolonner: venstre = versjonskortet (4.22, fremdrift) med «Oppdater nå»-knappen og teksten under, rett under kortet (ikke flytende over innholdet). Venstre kolonne følger med ved scrolling.
- Høyre = Programvareversjon, «Krev Face ID eller passord», «Nytt i 4.22» og tidligere versjoner.
- Telefon er uendret (flytende knapp nederst).
