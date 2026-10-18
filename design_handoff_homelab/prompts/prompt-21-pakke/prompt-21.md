# Prompt 21

Startet: 2026-10-18

- 2026-10-18: «la meg sweipe på ios appen på den måten» (vedlegg: skjermopptak `ScreenRecording_10-18-2026 18-56-54_1.MP4`)

- 2026-10-18: «rett opp den streken øverst den stikker litt lengre ut» (vedlegg: Kvitteringer på iOS, strek over KØ-kortet går forbi de avrundede hjørnene)
  - Feilen er i appen. Skrevet `prompts/claude-code-kvittering-strek.md`: fjern streken over første rad, skillelinjer bare mellom rader, samme komponent for KØ og TIL GJENNOMGANG.
- 2026-10-18: «dette dukket heller ikke opp i appen, viser holdeplasser.» (vedlegg: utvidet avgang 17 Grefsen st. med stoppliste Amagerveien → Grefsen st. og «Åpne i Ruter ›»)
  - Designfilen har dette allerede. Skrevet `prompts/claude-code-avgang-stopp.md`: utvidbar avgangsrad med stoppliste, design og data fra Entur (serviceJourney.estimatedCalls).
- 2026-10-18: «under redigering feil med gjenomsikthet og farge» (vedlegg: redigeringslinjen over Finans-flisene ligger gjennomsiktig over toppbildet, grå tekst og «Tilbakestill» uleselig)
  - Redigeringslinjen er nå en egen Papir-pille med kortbakgrunn og skygge. Teksten er i `--ink` («Dra for å flytte»), «Tilbakestill» har fylt `--bg`-bakgrunn og «Ferdig» er svart. Lesbar over bildet i lyst og mørkt tema.
- 2026-10-18: «og i familie vis kart soner helse i navbaren.» (vedlegg: Familie i appen med Kart/Soner/Helse som knapper under toppbildet. Kartet viser «API KEY REQUIRED» fra CARTO)
  - `Mobil Papir App.dc.html`: på Familie viser fanelinjen nederst nå Kart · Soner · Helse (+ Mer), som Subscription OS. De tre knappene øverst i Familie er skjult i appen (`hide-tabs`). `Familie.dc.html` tar imot `tab` som prop.
  - Kartfliser byttet fra CARTO (krever nå API-nøkkel) til Kartverket topo (gratis, ingen nøkkel). `claude-code-kart-fiks.md` er oppdatert.
- 2026-10-18: «når jeg på mobil holder inne for redigering. la meg dra itilegg til å bruke pilene. men når jeg holder på mange av widgetsene åpener de sin side og da blir redigeringen kuttet.» (vedlegg: Hjem i appen med widgetene)
  - `Mobil Papir App.dc.html`: hold inne virker nå på hele widgeten, også på lenker og knapper. Klikket etter et langt trykk blokkeres, så siden åpnes ikke. I redigeringsmodus blokkeres alle trykk inne i widgetene, unntatt ▲ ▼ −.
  - Dra for å flytte: dra en widget opp eller ned over de andre (den vugger ikke, er litt gjennomsiktig og forstørret mens den dras). Rekkefølgen lagres. Pilene virker fortsatt. Langt trykk starter draget direkte, som på iOS.
  - Langt trykk avbrytes hvis fingeren flyttes mer enn 8 px (vanlig scrolling virker).
  - For Claude Code: samme oppførsel i den native appen. iOS: `onLongPressGesture` + `.onDrag`/`.onDrop` med `simultaneousGesture` slik at `NavigationLink` ikke trigges. Android: `detectDragGesturesAfterLongPress` i Compose. Bruk `consume()`, så klikk ikke sendes videre.
- 2026-10-18: «her i design kommer bakgurnnen riktig fram men ikke i mobil appen eler nettsiden i ferdig verjonnen til claude, her ser du feil.» (vedlegg: ferdig iOS-app med tegnet CSS/SVG-Saturn som toppbilde)
  - Skrevet `prompts/claude-code-bakgrunn.md`: bruk ekte fotografier (Wikimedia/NASA) med gradient, ikke tegnede planeter. Inneholder eksakte filnavn per bakgrunnstype, rotasjon og fallback, og forslag om å laste ned og servere bildene fra backend.
  - Designet: Planeter har nå også Månen (`FullMoon2010.jpg`) og Mars (`OSIRIS_Mars_true_color.jpg`) i både app og web, som ønsket i prompt 19.
- 2026-10-18: «her er det jo riktigm» (vedlegg: designet 1a iPhone med Oslo-, Vær nå- og Planeter-bakgrunn som ekte foto)
  - Lagt inn som fasit i `claude-code-bakgrunn.md`: beskrivelse av riktig visning for Oslo, Vær nå og Planeter.
- 2026-10-18: «og denne har fortsatt ikke fått ikon,» (vedlegg: pakkekort på Hjem i appen med grønn firkant og teksten «Bring» i stedet for logo, tittel «Bring · 0750», «13 til ›»)
  - Skrevet `prompts/claude-code-pakke-logo.md`: butikklogo, så fraktlogo, så bokstav. Liten fraktmerkelapp, tittel med varenavn eller butikk i stedet for sporingsnummer, tydelig «+12 pakker ›», felles Logo-komponent overalt.

## Tilhørende filer
- `claude-code-kvittering-strek.md`
- `claude-code-avgang-stopp.md`
- `claude-code-kart-fiks.md` (oppdatert)
- `claude-code-bakgrunn.md`
- `claude-code-pakke-logo.md`
- `claude-code-logobibliotek.md` (fra prompt 20, trengs for logoene)
