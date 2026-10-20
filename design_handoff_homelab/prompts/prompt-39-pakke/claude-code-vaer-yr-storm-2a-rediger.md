# Vær · Yr mot Storm (2a) med wiggle-redigering som på Hjem

Ønske 2026-10-20: «bra side med yr og storm la meg wiggle redigere i siden slik som i hjem.»

Fasit: `Yr mot Storm Design.dc.html` → **2a**: himmelbakgrunn og glasskort fra 1b, duell-topp og midtstilte avvikssøyler fra 1a, enighet og Glimt-forklaring fra 1c. Erstatter dagens «Yr mot Storm»-ark i Vær (`Vaer.dc.html`, `cmp.open`). Bruk ekte data fra `cmpVals()`.

## Kort på siden
| nøkkel | navn | standard |
|---|---|---|
| hero | Dagens duell | vist |
| agree | Enighet (x av 7 + prikker) | vist |
| glimt | Glimt forklarer | vist |
| list | Dag for dag (Temp/Nedbør/Vind + rader som kan åpnes) | vist |
| chart | Neste 24 timer (uenighetsbånd) | skjult |
| rain | Nedbør per dag | skjult |

Tittelraden og kildeteksten er faste og flyttes ikke.

## Wiggle-redigering (samme oppførsel som Hjem)
- **Hold inne 480 ms** på et kort uten å flytte fingeren mer enn 8 px. Da kommer haptikk 12 ms og redigering starter. Klikket som fulgte holdet blokkeres.
- I redigering:
  - Kortene vugger: ±0,5°, 0,3 s, annenhver i motsatt retning.
  - Rund «−» oppe til venstre skjuler kortet.
  - Innholdet i kortene kan ikke trykkes.
  - «Ferdig» oppe til høyre blir hvit og avslutter redigering.
  - Hjelpetekst: «Dra kortene for å flytte · − for å skjule».
- **Dra:** kortet løftes (`scale(1.03)`, skygge) og følger fingeren via `transform` i `requestAnimationFrame`. Når midten passerer nabokortets midte, bytter de plass. De andre kortene glir til ny plass med FLIP (260 ms `cubic-bezier(.2,.8,.2,1)`). Slipp: fjærer på plass på 240 ms, og vuggingen fortsetter.
- **Legg til kort:** stiplet boks nederst med skjulte kort og grønn «+». Kortet legges inn sist blant de synlige.
- Lagres per bruker: `vs_cmp_layout = {ord:[…], hid:{…}}`, synkes med kontoen (web + mobil).
- Native: iOS `onLongPressGesture(minimumDuration: 0.48)` + `.draggable/.dropDestination` eller egen `DragGesture`. Android Compose `detectDragGesturesAfterLongPress` + `animateItem()`.
