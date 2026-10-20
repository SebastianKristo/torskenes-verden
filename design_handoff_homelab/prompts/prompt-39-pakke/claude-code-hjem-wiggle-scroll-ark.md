# Hjem · wiggle-redigering: scroll virker + redigeringsark som ikke flyter

Ønske 2026-10-20: «feil med wiggle redigering i hjem, får ikke scrollet ned eller opp. også feil rundt redigers kort flyter på en måte som ikke ser bra ut på mobil» (skjermbilder: `vedlegg/hjem-wiggle-ark-mobil.png`, `vedlegg/hjem-wiggle-ark-web.png`)

Fasit: `Mobil Papir App.dc.html` → `edVals()` (Hjem), og samme mønster i `Yr mot Storm Design.dc.html` 2a.

## 1. Scroll i redigeringsmodus
**Feil:** alle widgets fikk `touch-action: none` i redigering. Widgetene fyller hele skjermen, så det finnes ingen flate igjen å scrolle på.

**Fiks:**
- Widgets har `touch-action: pan-y` også i redigering. Vanlig sveip opp/ned scroller siden.
- **Drag starter etter et kort hold (170 ms)** på en widget uten at fingeren flytter seg mer enn 8 px. Flytter fingeren seg før det, er det scroll, og drag avbrytes.
- Når drag har startet: en global `touchmove`-lytter (`{passive:false, capture:true}`) gjør `preventDefault()` så lenge `edDrag` er satt. Da står siden stille mens kortet flyttes. Dette virker på iOS fordi scrollen ikke har startet ennå (fingeren sto stille i 170 ms).
- Hold-inne for å *starte* redigering (500 ms) kan fortsatt gå rett over i drag i samme bevegelse.
- **Auto-scroll:** drar du et kort innenfor 80 px fra toppen/bunnen av scroll-flaten, scroller siden 9 px per frame i den retningen (`requestAnimationFrame`) til du slipper eller flytter deg bort fra kanten.
- Native: iOS `UIScrollView` + `UILongPressGestureRecognizer(minimumPressDuration: 0.17)` i redigering (`require(toFail:)` er ikke nødvendig). Compose: `detectDragGesturesAfterLongPress` med kort `longPressTimeoutMillis` i redigering, og `LazyColumn` scroller som normalt.

## 2. Redigeringsarket («Velg stopp», «Rediger widget» osv.)
**Feil:** arket ligger inne i scroll-innholdet med marg rundt og runde hjørner nederst. Det svever midt på skjermen, innholdet under («Rune …») synes nedenfor, og Skann-knappen ligger oppå. Widgetene bak fortsetter å vugge.

**Fiks:**
- Arket rendres i en **portal på app-roten**: `position: fixed; left: 0; right: 0; bottom: 0`, full bredde. Kun øvre hjørner har radius 26. `padding-bottom: calc(env(safe-area-inset-bottom) + 24px)`. `max-height: 86dvh` med egen scroll inni.
- **Bakteppe:** `position: fixed; inset: 0; background: rgba(0,0,0,.4)` over alt, også over tab-bar og Skann-knapp. Trykk på bakteppet lukker.
- Siden bak er låst: ingen scroll bak arket (`overflow: hidden` på scroll-containeren mens arket er åpent, og gjenopprett posisjonen etterpå).
- Widgetene bak stopper å vugge mens arket er åpent (`animation-play-state: paused`).
- Skann-knapp, tab-bar og «Rediger widget»-pillen skjules mens arket er åpent.
- Inngang: glir opp fra bunnen, 320 ms `cubic-bezier(.2,.8,.2,1)`. Ut: 220 ms. Dra håndtaket ned > 80 px for å lukke.
- Web på stor skjerm (≥ 700 px): samme ark, men sentrert med `max-width: 560px` og fortsatt festet i bunnen. Alternativt en sentrert dialog med runde hjørner rundt hele og skygge. Aldri «halvveis» flytende med innhold synlig under.

## Test
- iPhone/Android: start redigering. Sveip opp og ned over widgetene: siden scroller. Hold 0,2 s og dra: kortet flytter seg og siden står stille. Dra mot bunnen: siden auto-scroller.
- Åpne «Velg stopp» i redigering: arket ligger helt i bunnen og dekker hele bredden. Ingenting under arket er synlig, tab-bar og Skann-knapp er skjult, og widgetene bak står stille.
