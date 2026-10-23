# iPad/Fold: jevn overgang til Hjem

## Symptom
Selve Hjem-knappen har en god animasjon, men overgangen fra en app/modul til Hjem-siden hakker på iPad og Fold (store skjermer).

## Behold
Knappens egen trykk-animasjon er godkjent. Ikke endre den.

## Sannsynlige årsaker
1. Hjem-siden bygges/lastes **under** overgangen (widgets henter data, bilder dekodes, grid layoutes) → tapte frames.
2. Animasjonen animerer layout-egenskaper (width/height/top/left, padding, blur-radius) i stedet for transform/opacity.
3. Store skjermer: flere widgets samtidig + blur/skygge på hvert kort.
4. Overgang og knappeanimasjon kjører samtidig på hovedtråden med ulike kurver.

## Krav
- Kun **transform (scale/translate) + opacity**, GPU-akselerert. Ingen layout-animasjon og ingen animert blur.
- Hjem-siden holdes **i minnet** (ikke bygg på nytt). Widgets viser siste cache umiddelbart, og fersk data hentes først **etter** at overgangen er ferdig.
- Overgangen: den aktive modulen skalerer ned mot Hjem-knappens/ikonets posisjon (0.92 → fade), mens Hjem tones inn fra scale 1.03 → 1.0. Varighet 320–380 ms, fjærkurve (iOS: `spring(response: 0.38, dampingFraction: 0.86)`, Android: `spring(dampingRatio = 0.85, stiffness = 380)`).
- Widgets på Hjem kan komme inn forskjøvet (20 ms mellom hver, maks 6 stk), kun opacity + translateY 8 px.
- Skygger/blur: rasteriser kortene under animasjonen (iOS `drawingGroup`/`shouldRasterize`, Android `graphicsLayer`/hardware layer).
- Støtt ProMotion (120 Hz) på iPad og høy oppdateringsfrekvens på Fold. Ingen fast 60 fps-timer.
- Respekter «Reduser bevegelse»: kun crossfade 200 ms.

## Test
- Profiler med Instruments (Core Animation FPS) og Android GPU-profilering/Macrobenchmark: ingen frames > 8,3 ms på 120 Hz.
- Test fra tunge moduler (Finans, Kalender-uke, Media) med mange widgets på Hjem, i både stående og liggende modus, og med Fold åpen/lukket.
