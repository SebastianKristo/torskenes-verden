# Hjem: man kan ikke scrolle når fingeren starter på «Dagens bibelvers»-kortet

Ønske 2026-10-20: «når bibelvers viser kan jeg ikke scrolle hvis jeg prøver å scrolle over bibelverset, ordne det.» (vedlegg `uploads/Screenshot 2026-10-20 at 21.46.56.png`).

## Årsak (mest sannsynlig)
Kortet har sveip-for-å-skjule. Gesten er lagt på hele kortet som en vanlig `DragGesture` (SwiftUI) / `pointerInput { detectDragGestures }` (Compose). Den tar **alle** drag, også loddrette, så ScrollView/LazyColumn på Hjem får aldri bevegelsen.

## Fiks
- **Bare vannrette drag skal fanges.** Lås retning etter de første 8–10 pt: er |dx| > |dy| × 1,15 og dx > 0, er det sveip. Ellers slippes gesten, og scrollen tar over.
- **iOS (SwiftUI):**
  - Bruk `.simultaneousGesture(DragGesture(minimumDistance: 12))` (ikke `.gesture`/`.highPriorityGesture`), og ignorer `onChanged` til retningen er låst som vannrett. Eller legg en `UIPanGestureRecognizer` via `UIViewRepresentable` med `gestureRecognizerShouldBegin` → `abs(velocity.x) > abs(velocity.y)` og `shouldRecognizeSimultaneouslyWith` = true for ScrollView-pan.
  - iOS 18+: `.gesture(DragGesture(...), including: .subviews)` er ikke nok. Bruk retningssjekken.
  - Trykk på kortet (åpne arket) bruker `onTapGesture` og skal ikke ha `minimumDistance: 0`-drag.
- **Android (Compose):** bruk `Modifier.pointerInput { detectHorizontalDragGestures(...) }` eller `Modifier.draggable(orientation = Horizontal)` / `anchoredDraggable` med `Orientation.Horizontal`. Da går loddrett drag videre til `LazyColumn`.
- **Web/PWA:** kortet har `touch-action: pan-y`. Kall `preventDefault()` og `setPointerCapture` først når retningen er låst vannrett (som i `swipe-dismiss.js`).
- Gjør det samme for alle sveipbare kort på Hjem (Avganger, Kveldsbrief, Vel fremme-kortet), så scroll aldri stopper uansett hvor fingeren starter.

## Test
- Start et loddrett scroll midt på bibelverset → siden scroller jevnt, med momentum.
- Sveip til høyre → kortet følger fingeren og skjules over terskelen.
- Skrått drag (mest loddrett) → scroll, ikke sveip.
- Kort trykk → arket åpnes.
