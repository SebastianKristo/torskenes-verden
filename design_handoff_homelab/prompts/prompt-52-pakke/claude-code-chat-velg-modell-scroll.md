# Chat → Velg modell: arket scroller ikke

Ønske 2026-10-24: «scrolling her funker ikke» (vedlegg `Screenshot 2026-10-24 at 17.32.30.png`).
Fasit: `Homelab.dc.html` → Chat → modellvelgeren (`ch.sh.model`).

## Feil
Arket har maks høyde 90 %, men innholdet krymper i stedet for å scrolle: Auto-kortet kuttes («dine data er med» halvt synlig), Ollama-listen kuttes etter qwen2.5vl:7b (qwen3:8b halvt synlig, resten utilgjengelig) og Sky-kortet kuttes. Sveip i arket gjør ingenting.

## Årsak
Seksjonene ligger i en vertikal flex/stack med begrenset høyde og har standard krymping (`flex-shrink:1` / SwiftUI-stack uten ScrollView, Compose `Column` uten `verticalScroll`). De presses sammen og klippes med `overflow:hidden` i stedet for å flyte over.

## Retting
1. Alle barn i arket (tittelrad, seksjonsetiketter, Auto-kort, Ollama-liste, Sky-liste, forklaring, «Administrer modeller») får **fast høyde etter innhold** (`flex:none` / `.fixedSize(horizontal:false, vertical:true)`). Ingenting skal krympes eller klippes.
2. Innholdet ligger i **én** scrollbar beholder: SwiftUI `ScrollView` i `.sheet` med `.presentationDetents([.large])` og `.scrollBounceBehavior(.basedOnSize)`. Compose: `ModalBottomSheet { LazyColumn { … } }`.
3. `overscroll-behavior: contain`, slik at scrolling ikke går videre til chatten bak. Sveip ned på grabberen/toppen lukker arket, sveip i listen scroller.
4. Sveip-tilbake-gesten fra venstre kant og wiggle-touchlytterne skal **ikke** fange `touchmove` når et ark er åpent (de kaller `preventDefault` i dag).
5. «Administrer modeller» ligger nederst i scrollen, med luft til hjemindikatoren (safe area).
