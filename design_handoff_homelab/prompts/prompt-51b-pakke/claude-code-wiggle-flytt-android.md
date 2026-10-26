# FEIL: Android – wiggle starter, men widgets på Hjem kan ikke flyttes

Ønske 2026-10-26: «jeg får heller ikke flyttet på widgets i hjem i homelab appen på android. wiggle starter, jeg kan holde inne widgets, men ikke flytte dem.»
Fasit for oppførsel: `Homelab.dc.html` → `edVals()` (`down / move / up`, `save`). iOS-fiksen står i `claude-code-wiggle-ios-virker-ikke.md`.
Henger sammen med `claude-code-android-hjem-flishoyde.md` (nytt rutenett) og `claude-code-widget-storrelse-mobil.md` (håndtaket ↔).

## Ønsket oppførsel (likt iOS)
1. Hold 0,5 s → haptikk → wiggle (virker allerede).
2. I wiggle: **hold 0,3 s på en widget → den løftes** (skala 1,03, skygge, 60 % opasitet på plassen den kom fra).
3. **Dra** → de andre glir unna, også sideveis mellom venstre og høyre kolonne. Autoscroll når fingeren er 80 dp fra topp/bunn.
4. **Slipp** → lagres (`papir_layout.hjem.order`), lett haptikk.
5. Vanlig sveip i wiggle (uten å holde først) = scroll.

## Sannsynlige årsaker (sjekk i denne rekkefølgen)
1. **Scroll-containeren tar gesten.** `verticalScroll`/`LazyColumn` får dra-bevegelsen før widgeten, så draget avbrytes etter noen piksler.
   → Når en widget er løftet: `userScrollEnabled = false` på `LazyColumn` (eller `Modifier.verticalScroll(state, enabled = !isDragging)`). Slå på igjen ved slipp.
2. **Feil gest-API.** `combinedClickable(onLongClick)` starter wiggle, men gir ingen dra-hendelser etterpå.
   → Bruk `Modifier.pointerInput(key) { detectDragGesturesAfterLongPress(onDragStart, onDrag, onDragEnd, onDragCancel) }` på hver widget i wiggle-modus. `onDragCancel` må også lagre/rydde, ellers står kortet løftet.
3. **`clickable` på kortet** sluker trykket. I wiggle-modus skal kortets `clickable` være av (`enabled = !isEditing`).
4. **Gammel `LazyVerticalGrid` + indeks som key.** Rekkefølgen endres i lista, men gridet tegner på nytt med samme indeks → kortet hopper tilbake.
   → Stabil key = widget-id (`"h9"`, `"h14"` …), aldri indeks. Med nytt rutenett (se flishøyde-filen) bygges radene fra `order` hver gang.
5. **Lista endres ikke før slipp.** Hvis `order` bare oppdateres i `onDragEnd`, ser det ut som ingenting skjer.
   → Oppdater `order` live når fingeren er over en annen widget (som i fasiten), lagre til disk/server ved slipp.
6. **WebView-variant** (hvis Hjem er web i en WebView): Chrome sender `pointercancel` når siden begynner å scrolle. Fiks: ikke-passiv `touchmove`-lytter på `document` (`{passive:false, capture:true}`) som kaller `preventDefault()` så snart en widget er løftet (fasiten gjør dette), og `setPointerCapture` på widgeten ved løft. Sjekk at `WebView` ikke har egen `OnTouchListener` som returnerer `true`.

## Implementasjon (Compose)
```kotlin
var dragKey by remember { mutableStateOf<String?>(null) }
var dragOffset by remember { mutableStateOf(Offset.Zero) }
val bounds = remember { mutableStateMapOf<String, Rect>() }   // fra onGloballyPositioned

Modifier
  .onGloballyPositioned { bounds[key] = it.boundsInRoot() }
  .graphicsLayer {
      if (dragKey == key) { translationX = dragOffset.x; translationY = dragOffset.y; scaleX = 1.03f; scaleY = 1.03f; shadowElevation = 18f }
      else rotationZ = wiggle(i)
  }
  .zIndex(if (dragKey == key) 1f else 0f)
  .pointerInput(isEditing, key) {
      if (!isEditing) return@pointerInput
      detectDragGesturesAfterLongPress(
          onDragStart = { dragKey = key; dragOffset = Offset.Zero; haptic(LongPress) },
          onDrag = { ch, d -> ch.consume(); dragOffset += d
              val p = bounds[key]!!.center + dragOffset
              bounds.entries.firstOrNull { it.key != key && it.value.contains(p) }?.let { swapLive(key, it.key) }
              autoScroll(p) },
          onDragEnd = { dragKey = null; saveLayout() },
          onDragCancel = { dragKey = null; saveLayout() })
  }
```
- Løft-tid i wiggle: `viewConfiguration.longPressTimeoutMillis` er 400–500 ms; overstyr til 300 ms med egen `ViewConfiguration` i `CompositionLocalProvider(LocalViewConfiguration provides …)` rundt Hjem.
- Etter `swapLive` hopper kortets plass; nullstill `dragOffset` relativt til ny posisjon (`dragOffset -= newBounds.topLeft - oldBounds.topLeft`) så kortet blir under fingeren.
- Autoscroll: `LaunchedEffect(dragKey)` med `listState.scrollBy(±9f)` hver frame når fingeren er i kantsonen.
- Håndtaket ↔ og «–» ligger utenfor dra-området (egen `pointerInput` som konsumerer først).

## Test (fysisk Pixel og Galaxy)
- Hold → wiggle. Hold 0,3 s på Finans og dra til venstre kolonne under Avgang → de andre glir → slipp → lukk/åpne appen → rekkefølgen står.
- Dra Siste nytt (full) fra bunnen til toppen med autoscroll.
- Sveip uten å holde i wiggle → scroll, ingenting flytter seg.
- Etter størrelsesendring (↔): flytting virker fortsatt, ingen hull.
- One UI med «Fjern animasjoner» på: ingen wiggle, men løft og flytt virker.
