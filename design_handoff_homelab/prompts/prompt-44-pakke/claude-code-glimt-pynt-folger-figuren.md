# Glimt: lue, skjerf og gave følger figuren når den beveger seg

Ønske 2026-10-21: «ordene fortsatt glimt, du vet når den animerer seg går litt opp og ned og slikt så følger ikke skjerf og hatt og de tingene med» (vedlegg `uploads/Screenshot 2026-10-21 at 13.42.18.png`)
Fasit: `glimt-figurer.js` → `dress()`.

**Feil:** figuren hopper/vugger (`gfBob` 2,6 s, `gfHop` 1 s når glad, `gfSq` 3,6 s når den sover) på sitt eget element, mens pynten (julelue, skjerf, gave, 17. mai-sløyfe, bunad, flagg, lue) ligger utenfor og står stille.
**Retting:** animasjonen flyttes fra figuren til en felles beholder som har både figuren og pynten (`transform-origin: 50% 100%`). Figuren selv får `animation: none` når den er pyntet. Da beveger alt seg likt. Flagget beholder sin egen vaiing i tillegg.
- **SwiftUI:** legg figur + pynt i én `ZStack` og bruk `.offset/.scaleEffect` med animasjon på ZStack-en, ikke på figuren.
- **Compose:** én `Box` med `graphicsLayer { translationY; scaleY }` fra `rememberInfiniteTransition`, pynten som barn i samme Box.
- Gjelder alle steder Glimt vises: søkepillen, Chat, Glimt Brief, widgets, onboarding.
