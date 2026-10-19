# Vær: haptisk tilbakemelding når menyer/popuper lukkes

Fasit: `Vaer.dc.html`.

## Når
Ett lett «tikk» hver gang noe av dette **lukkes** (med ✕, sveip ned, trykk utenfor eller ved å velge et sted):
- Steder-menyen (byer/søk)
- Værkart
- Sammenlign kilder (Yr / Pent)
- Dag-popup (timegraf for en dag)
- Detalj-popuper: vind, måne, sol, UV, føles som, nedbør, sikt, fuktighet, trykk

Ikke ved åpning. Eksisterende haptikk beholdes: lang-trykk for å flytte by (15 ms) og sveip-slett by (12 ms).

## Implementasjon
- iOS (native): `UIImpactFeedbackGenerator(style: .light).impactOccurred()` i `onDismiss` på sheet/fullScreenCover. SwiftUI: `.sensoryFeedback(.impact(weight: .light), trigger: isPresented) { old, new in old && !new }`.
- Android: `view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)`.
- Web/PWA: `navigator.vibrate(10)` (Android). iOS Safari 18+: klikk på skjult `<input type="checkbox" switch>` gir systemhaptikk. Fasiten gjør begge i `haptic()`.
- Én sentral funksjon `haptic(.light)` kalt fra en felles «dismiss»-hook, så alle nye popuper får det automatisk.
