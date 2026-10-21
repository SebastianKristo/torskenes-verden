# Kalender (mobil): sveip mellom måneder åpner uke-visning

Ønske 2026-10-21: «i kalender på mobil app. Sveipe mellom måneder går inn i uke view den skal jo egentlig sveipe mellom måneder»
Fasit: `Kalender App.dc.html` (handlerne `te` og `swClk` på kalenderflaten).

## Årsak
Trykk på en dag i måned åpner uke. Etter et horisontalt sveip sender nettleseren/WebView også et **klikk** på dagen der fingeren slapp. Sveipet bytter måned, og klikket åpner straks uke-visningen.

## Fiks
- Når fingeren har flyttet seg mer enn 12 pt, regnes det som sveip: lagre `swipedAt = now`.
- Sveip > 60 pt horisontalt (og 1,5 × mer enn vertikalt): `preventDefault()` på touchend og bytt måned.
- Kalenderflaten har `onClickCapture`: klikk innen 450 ms etter et sveip stoppes (`stopPropagation` + `preventDefault`) før de når dagcellen.
- Native: SwiftUI `DragGesture(minimumDistance: 12)` med `.highPriorityGesture` over `onTapGesture` på cellene. Compose: `detectHorizontalDragGestures` på månedsflaten og `consume()`, slik at `clickable` på cellen ikke trigges.
- Gjelder alle visninger med sveip (måned, uke, 3 dager, dag). Kantsveip fra venstre åpner fortsatt kalenderlista.

## Test
Sveip venstre/høyre i måned 10 ganger → alltid ny måned, aldri uke. Rolig trykk på en dag → uke som før. Klyp → zoom som før.
