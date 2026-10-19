# AI-logo: animasjon når AI jobber

Fasit: `Mobil Papir App.dc.html` → `aiSpark()` og `aiToastEl()`. Prøv: skriv «time hos nina frisør 14.30 25.09» i søkefeltet på Hjem og trykk Gå.
Vedlegg: toast «✦ Legger til i kalenderen …» med statisk rød stjerne.

## Animasjonen (24 px)
1. **Ring**: `conic-gradient` rød #b23a2a → oransje #e8794a → fiolett #7a5ad6 → grønn #3fbf9a, maskert til en 2,5 px ring. Roterer 360° på 1,6 s, lineært, uendelig.
2. **Stjerne** i midten (firkantet glimt, gradient #ffb38a → #ff5a3c): pulserer skala 0,78 ↔ 1,08 og roterer 0 → 45° på 1,4 s, ease-in-out.
3. **To små glimt** (4 px hvit oppe til høyre, 3 px fersken nede til venstre) som blinker inn/ut (opasitet 0 → 1, skala 0,4 → 1), forskjøvet 0,2 s og 0,8 s.
- Når jobben er ferdig: ringen fader ut (150 ms) og stjernen byttes til ✓ (grønn) med liten sprett, deretter fader toasten.
- Respekter «Reduser bevegelse»: kun langsom puls, ingen rotasjon.

## Hvor den brukes
- **Toast øverst** (midtstilt, 54 px under safe area): mørk glass-pille `rgba(27,26,23,.92)` + blur 14, radius 999, animasjon + tekst («Legger til i kalenderen …», «Leser kvitteringen …», «Ollama leser skjermbildet …»). Glir inn ovenfra (280 ms).
- Søkefeltets motor-ikon (System-AI) mens AI tolker teksten.
- Chat: i stedet for «Tenker …»-teksten vises animasjonen ved siden av modellnavnet.
- Alle steder der ✦ står foran en «jobber»-tekst. Statisk ✦ beholdes for ferdige svar.

## Native
- iOS: `TimelineView(.animation)` eller `Canvas` med `AngularGradient` for ringen, `.symbolEffect(.pulse)` er for svakt, lag egen. Lottie er også greit (eksporter fra fasiten).
- Android: `InfiniteTransition` med `animateFloat` for rotasjon/skala, `Brush.sweepGradient` for ringen.
