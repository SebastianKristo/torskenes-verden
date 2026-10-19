# Hjem: redigeringsmodus som iOS-hjemskjermen

Fasit: `Mobil Papir App.dc.html` → hold inne et kort på Hjem (skjermbilde 13.38.05 = referanse fra iOS).

## Inn/ut
- Hold inne et kort i 0,5 s → wiggle-modus (haptikk). Kortene vugger ±0,45° (0,6 s, annenhver i motfase).
- **Ingen** mørk instruksjonslinje og **ingen** ▲ ▼-knapper lenger.

## Toppen
- To flytende piller **utenfor scroll-innholdet** (eget lag over listen, festet 8 pt under toppen av innholdsområdet). De skal aldri kuttes av når man scroller. 40 pt høye, i Papir-stil:
  - ＋: `card` bakgrunn, 1 px `line`-kant, `ink` ikon, skygge 0 8 20 −8 rgba(0,0,0,.3).
  - ✓: `ink` bakgrunn, `bg` ikon (primær).
  - Venstre **＋** (viser antall skjulte, f.eks. «＋ 2») → arket «Legg til widget».
  - Høyre **✓** → avslutter redigering.

## Hvert kort
- Minus-sirkel 28 pt i Papir-stil (`card` bakgrunn, 1 px `line`, `ink` −, skygge 0 4 10 −3 rgba(0,0,0,.3)) i **øvre venstre hjørne**, 9 pt utenfor kanten → skjuler kortet.
- **Flytt** ved å dra kortet (som i dag). Kortet løftes litt (scale 1.03, opacity .6) mens det dras.
- Kort med innstillinger (Ruter, Vær, Kalender …) viser pillen **«✎ Rediger widget»** midt på kortet.

## «Legg til widget»-ark
- Grep-strek, tittel Newsreader 24, ✕.
- Liste over skjulte widgets i ett kort: navn + grønn ＋-sirkel (`pos`) → viser widgeten igjen (legges sist).
- Ingen skjulte: «Alle widgets vises allerede. Trykk − på en widget for å skjule den.»

## Native
- iOS: `.rotationEffect` med `repeatForever(autoreverses: true)`, minus som `.overlay(alignment: .topLeading)`, drag med `.onDrag/.onDrop` eller `ReorderableForEach`.
- Android: `graphicsLayer { rotationZ = … }` med `infiniteRepeatable`, `Modifier.dragAndDropSource`.

## Linjemerker
- Tekstfarge velges etter luminans på linjefargen: lys bakgrunn (L > 0,4) → `#1b1a17`, mørk → hvit.

## Samme design i alle wiggle-moduser
Gjelder **Hjem**, **Finans → Mer** (flisene), **Mat** og **Sporing**:
- Ingen mørk instruksjonslinje. Kun pillene øverst:
  - Hjem/Mat: ＋ (skjulte widgets) til venstre · ✓ til høyre.
  - Finans → Mer: «↺ Tilbakestill» til venstre · ✓ til høyre.
  - Sporing: kun ✓ til høyre.
- Minus-sirkel (Papir) øverst til venstre der kortet kan skjules.
- Flytt ved å dra. Sporing har midlertidig ▲ ▼ i Papir-stil (`card`, `line`-kant, `ink`) til dra er på plass.
- Samme wiggle (±0,45°, 0,6 s) overalt.
