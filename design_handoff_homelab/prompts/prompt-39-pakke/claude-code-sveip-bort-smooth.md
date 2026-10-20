# Sveip bort Brief og Bibelvers: myk og elegant (særlig Android)

Ønske 2026-10-20: «animasjon og handlingen med å sweipe bort ting som brief og bibelvers re litt hakkete og flikrete spesielt på andoroid, bevegelsen skal være smooth og elegant»

Fasit: `swipe-dismiss.js` (felles), brukt av `Mobil Papir App.dc.html` (Glimt Brief) og `Bibelvers.dc.html` (Hjem-kortet).

## Hvorfor det hakket
1. **State-oppdatering per `pointermove`.** Hver finger-bevegelse gjorde `setState` → hele Hjem-siden ble rendret på nytt (60–120 ganger i sekundet). På Android med svakere CPU gir det tapte frames.
2. **`max-height: 600px → 0`** ved kollaps. Kortet er ca. 160 px høyt, så de første ~70 % av animasjonen skjer ingenting synlig, og så smekker det sammen. Det oppleves som hakk og «flikk».
3. **Gap-hopp.** Når kortet fjernes, forsvinner også `gap` (12–14 px) i ett hopp.
4. Ingen fart-måling: et raskt sveip ble enten ikke registrert eller fløy ut med fast varighet.
5. `pointercancel` på Android (nettleseren tar over scroll) ga uforutsigbar tilstand.

## Slik skal det gjøres (web / WebView / PWA)
- **Ingen React-render under drag.** Skriv `transform` direkte på elementet i `requestAnimationFrame`. Bruk `translate3d(x,0,0) rotate(x/W·4°)`, `will-change: transform` og `backface-visibility: hidden`. State endres bare ved start og ved fullført sveip.
- **Retningslås:** 6 px før låsing. Horisontal hvis |dx| > |dy|·1,15 og dx > 0. Ellers slippes gesten til vertikal scroll. `touch-action: pan-y`, `setPointerCapture`, og `preventDefault` i `pointermove` (non-passive) når låst horisontalt.
- **Gummistrikk mot venstre:** `-(|dx|^0,7)`.
- **Terskel:** 38 % av bredden **eller** fart > 0,55 px/ms (målt over de siste 90 ms) og dx > 36 px. Haptikk 10 ms når terskelen passeres, og [8,30,12] ved fullføring.
- **Slipp under terskel:** fjær tilbake med Web Animations API, 420 ms `cubic-bezier(.22,1.28,.36,1)` (liten overshoot). Bakgrunnslaget fader ut på 220 ms.
- **Fullført:** fly ut fra nåværende posisjon. Varigheten følger farten (170–320 ms, `cubic-bezier(.2,.6,.3,1)`). Hold 260 ms så «Brief skjult» / «Flyttet til briefen» rekker å vises. Kollaps deretter med **målt høyde** `h px → 0` + `margin-bottom → -gap` + opacity, 300 ms `cubic-bezier(.3,0,.15,1)`, `fill: forwards`. Fjern elementet først når animasjonen er ferdig. Da blir det ingen hopp.
- Bakgrunnslaget (grønt/svart) og etikettene byttes med opacity, ikke ved å bytte tekst. Ingen re-render av innhold midt i gesten.
- `pointercancel` / `lostpointercapture` = fjær tilbake, aldri halvveis tilstand.
- Klikk som kommer < 350 ms etter et drag blokkeres (åpner ikke kortet ved et uhell).

## Native (hvis Android-appen er Compose / iOS SwiftUI)
- **Compose:** `Modifier.anchoredDraggable` (eller `SwipeToDismissBox`) med `graphicsLayer { translationX; rotationZ }` (ikke `offset`, som gir re-layout). Fling med `splineBasedDecay`, tilbake med `spring(dampingRatio = 0.72f, stiffness = 380f)`. Kollaps med `AnimatedVisibility(exit = shrinkVertically(tween(300, easing = FastOutSlowInEasing)) + fadeOut())`.
- **SwiftUI:** `DragGesture` → `.offset(x:)` + `.rotationEffect`, `.spring(response: 0.38, dampingFraction: 0.72)` tilbake, `.transition(.asymmetric(removal: .move(edge: .trailing).combined(with: .opacity)))` + `withAnimation(.smooth(duration: 0.3))` ved fjerning.
- Skru på 120 Hz der det støttes (Android: `preferredRefreshRate`, iOS: `CADisableMinimumFrameDurationOnPhone = YES`).

## Oppdatering 2026-10-20: ingen sveipe-hint
«sweipe bort now brief den viser animasjon at jeg skal sweipe den bort en gang i blant, ikke gjør det.»
- Fjern hint-animasjonen helt (kortet som dytter seg mot høyre + «Sveip → for å skjule»). Den skal aldri vises automatisk, heller ikke ved første oppstart eller etter oppdatering.
- Fasit: `Mobil Papir App.dc.html` → koden som satte `bsHint` (nøkkel `glimt_brief_swhint`) i `componentDidMount` er slettet.
- Det samme gjelder Bibelvers-kortet og alle andre sveipbare kort: ingen automatiske «vis meg»-animasjoner. Teksten «Sveip for å skjule» vises bare under selve sveipet.

## Test
- Android mellomklasse (f.eks. Pixel 6a / Samsung A54) med «Vis GPU-gjengivelse» / Perfetto: ingen frames > 16 ms under drag, fly-ut og kollaps.
- Sakte sveip, raskt kast (kort avstand), avbrutt sveip og vertikal scroll som starter skrått: ingen flikk og ingen hopp i listen under.
- «Angre» i toasten: kortet kommer tilbake uten blink.
