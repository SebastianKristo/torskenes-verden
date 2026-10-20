# Fiks: Hjem i redigeringsmodus (wiggle) – kan ikke scrolle (iOS)

Ønske 2026-10-20: «wiggle editor funker ikke. får ikke scrolelt ned.» (skjermopptak: `vedlegg/wiggle-scroll-1.png` … `-4.png`, bilder fra opptaket)
Fasit: `Mobil Papir App.dc.html` → `edVals()` (`down/move/up`). Erstatter og strammer inn `claude-code-brief-sveip-og-wiggle-scroll.md` (prompt 40).

## Det som skjer
- I wiggle-modus starter et vertikalt sveip **flytting av kortet** i stedet for å scrolle. Kortene glir oppå hverandre (Sporing over Avganger, Bibelvers over søkefeltet), og siden står stille.
- «Rediger widget»-pillene for to kort ligger oppå hverandre.

## Riktig oppførsel (som iOS-hjemskjermen)
- **Sveip = scroll.** Alltid, også i wiggle-modus.
- **Flytte et kort = hold inne 0,3 s uten å bevege fingeren (> 8 pt avbryter), så dra.** Lett haptikk når kortet «løftes» (skala 1,03, skygge).
- Mens du drar: de andre kortene **glir unna** med animasjon (0,25 s fjær), ingen overlapp. Nær topp/bunn (80 pt) autoscrolles siden.
- Slipp: kortet legger seg i ledig plass, rekkefølgen lagres.
- «–» skjuler, «Rediger widget» åpner innstillinger for kortet. Én pille per kort, midt på det kortet.

## SwiftUI
- Ikke legg `DragGesture(minimumDistance: 0)` eller `.gesture(...)` på kortene i `ScrollView`. Den spiser scroll.
- Bruk enten:
  1. `LazyVStack` + `.draggable(item)` / `.dropDestination(for:)` (iOS 16+). Systemet gir hold-for-å-løfte og lar scroll fungere, eller
  2. `LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture())` lagt på med **`.simultaneousGesture`** og `ScrollView` med `.scrollDisabled(isDraggingCard)` bare **etter** at løftet har skjedd.
- Wiggle-animasjonen (`rotationEffect` ±1,5°) må ikke endre layout. Bruk `.rotationEffect` / `.offset` på et lag, ikke `.frame`.
- Kortene beholder stabil `id` så `withAnimation` flytter dem i stedet for å tegne dem oppå hverandre.

## Android (Compose)
- `LazyColumn` + `Modifier.longPressDraggable` (f.eks. reorderable-biblioteket `sh.calvin.reorderable`). Ikke `pointerInput { detectDragGestures }` direkte på kortet.

## Web/PWA
- `touch-action: pan-y` på kortene, start flytting først etter 320 ms hold uten bevegelse (som i fasiten), `preventDefault` på `touchmove` **bare** når et kort faktisk er løftet.

## Sjekk
- Wiggle-modus: sveip opp/ned gjennom hele Hjem uten at noe flytter seg.
- Hold på Avganger 0,3 s → løft → dra forbi Prøveperioder → de andre glir unna → slipp → ny rekkefølge.
- Ingen kort ligger oppå hverandre etter flytting eller skjuling.
