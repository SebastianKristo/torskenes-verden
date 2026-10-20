# Mobil Hjem: brief åpnes etter avbrutt sveip + kan ikke scrolle i redigeringsmodus

Ønske 2026-10-20: «vis jeg prøver å sweipe bort brief litt grann men gjør det ikke likevald så åpner brief seg. og får fortsatt ikke scrollet med fingeren i wiggle redigeirn av hjem på mobil.»
Fasit: `swipe-dismiss.js` (`moved`-flagg) og `Mobil Papir App.dc.html` (redigering: `ed.down`, `_edTm`, `_edSc`).

## 1. Brief-kortet åpnes når man avbryter et sveip
**Årsak:** klikket ble bare stoppet hvis siste bevegelse var under 350 ms siden. Holdt man fingeren stille litt før man slapp, eller beveget den litt opp/ned (låst som «vertikal»), gikk klikket gjennom og briefen åpnet seg.
**Fiks:**
- Mål total bevegelse fra fingeren traff kortet. Er den over **6 px i noen retning**, regnes det som en bevegelse, ikke et trykk, og klikket stoppes, uansett hvor lenge man holdt.
- Flagget nullstilles ved neste trykk.
- Lytt på bevegelse på `window` også, så det fanges når fingeren går utenfor kortet.
- Native: iOS `DragGesture(minimumDistance: 0)` + `onTapGesture` bare når `translation` < 6 pt; Android `detectTapGestures` + `awaitTouchSlopOrCancellation` (bruk `viewConfiguration.touchSlop`).
- Haptikk og fjær tilbake som før.

## 2. Kan ikke scrolle i redigeringsmodus (wiggle)
**Årsak:**
- Når redigering startet med langt trykk, ble kortet under fingeren satt som «drar» med en gang. Da blokkerte appen all scrolling til man slapp.
- I redigeringsmodus startet dra-modus etter bare 170 ms. På iOS kommer ikke pointer-bevegelser når nettleseren selv begynner å scrolle, så tidtakeren fyrte og blokkerte scrollen.
**Fiks:**
- Langt trykk (500 ms) åpner **bare** redigeringsmodus. Ingen kort dras før man trykker på nytt.
- I redigeringsmodus: dra starter først når fingeren har holdt **stille i 320 ms** (< 6 px). Beveger fingeren seg før det, er det scroll.
- Avbryt ventende dra ved `touchmove` > 6 px, ved `scroll` og ved `pointercancel`.
- `touch-action: pan-y` på kortene i redigeringsmodus. `preventDefault` på touchmove **bare** mens et kort faktisk dras.
- Mens man drar nær toppen/bunnen scroller lista av seg selv (som før).
- Håndtaket (≡) på hvert kort starter dra med en gang (for de som vil det).
- Native: iOS bruk `.onDrag`/`LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture())` inne i `ScrollView`; Android `detectDragGesturesAfterLongPress` inne i `LazyColumn` (ikke `pointerInput` som spiser alle bevegelser).

## Test
- Sveip brief 1–2 cm og slipp: kortet glir tilbake, briefen åpnes ikke. Vent 1 s med fingeren nede og slipp: åpnes ikke.
- Trykk raskt på brief uten å bevege: åpnes.
- Hold inne Hjem → redigering. Scroll opp og ned med fingeren over kortene: siden scroller.
- Hold stille på et kort i ~0,3 s og dra: kortet flyttes, siden scroller ikke (unntatt ved kantene).
