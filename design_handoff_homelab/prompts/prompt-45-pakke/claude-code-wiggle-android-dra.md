# Android: wiggle-modus åpner, men kort kan ikke dras opp eller ned

Gjelder Hjem, Mer, Finans → Mer og alle andre sider med wiggle-redigering, på Android (telefon og Fold). Se også `claude-code-hjem-wiggle.md`, `claude-code-wiggle-ios-virker-ikke.md` og `claude-code-wiggle-scroll-ios.md` (der iOS-feilen ble løst ved å sammenligne med Subscription OS).

## Sannsynlige årsaker (undersøk alle)
1. **Scroll-containeren stjeler gesten.** I WebView/Compose tar den loddrette scrollen (`LazyColumn`/`verticalScroll`/WebView-overscroll) over etter få px, og drag-handleren får `cancel`.
   - Web/WebView: kortene må ha `touch-action: none` **mens wiggle er på** (ikke bare `pan-y`). Bruk `setPointerCapture(pointerId)` på `pointerdown`, og `preventDefault()` på `touchmove` med `{passive:false}`.
   - Compose: bruk `Modifier.pointerInput { detectDragGesturesAfterLongPress }` på hvert kort, og slå av scroll på containeren mens et kort dras (`userScrollEnabled = !isDragging`). Alternativt et ferdig bibliotek for omsortering, f.eks. `sh.calvin.reorderable` med `LazyColumn`.
2. **Long-press som starter wiggle brukes opp.** Etter at wiggle er startet, må et nytt trykk og drag på et kort starte flytting med en gang (ingen ny long-press), eller med kort forsinkelse (≤ 150 ms).
3. **`pointerleave`/`pointercancel` avslutter drag på Android.** WebView sender `pointercancel` når systemet tror det er scroll. Ikke avslutt drag på `pointerleave`, bare på `pointerup`/`pointercancel` fra den fangede pekeren.
4. **Hit-testing med `elementFromPoint` treffer overlegget** (wiggle-knapper med `data-edc`, skygger, det dratte kortet selv). Sett `pointer-events: none` på kortet som dras, og hopp over `[data-edc]`.
5. **Samsung-spesifikt:** «Edge panels»/kant-sveip og One UI-tilbakesveip kan ta gesten nær kantene. Legg kortene innenfor `systemGestureExclusionRects` mens man redigerer.

## Krav
- I wiggle-modus: trykk og dra et kort → kortet løftes (skala 1,03 + skygge + haptikk), følger fingeren, og de andre kortene glir unna (200 ms).
- Autoscroll når kortet nærmer seg topp eller bunn (innenfor 80 px), hastighet etter avstand.
- Slipp → kortet legger seg på plass, rekkefølgen lagres og synkes.
- Siden kan fortsatt scrolles ved å dra **mellom** kortene eller med to fingre.
- Test: Pixel (Gboard, gestnavigasjon), Galaxy S og Galaxy Z Fold (utbrettet og sammenbrettet), både i appen (WebView/Compose) og i Chrome på Android.

Fasit for oppførsel: `Mobil Papir App.dc.html` (wiggle på Hjem) og `Mer Ny.dc.html`.
