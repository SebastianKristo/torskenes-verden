# AI-toast: trykk for å se hva AI jobber med (glassboble)

Fasit: `Mobil Papir App.dc.html` → `aiToastEl()`. Prøv: skriv «time hos nina frisør 14.30 25.09» i søkefeltet på Hjem → trykk på toasten øverst.

## Lukket (toast)
- Mørk pille med animert AI-logo (se `claude-code-ai-animasjon.md`) + tekst + liten ▾ som viser at den kan åpnes.

## Åpen (glassboble)
- Trykk → toasten vokser til en **glassboble** (340 px, radius 28) under samme posisjon: `rgba(250,248,243,.72)` + `blur(28px) saturate(1.6)`, hvit innerkant, myk skygge. Animasjon: skala 0,6 → 1 fra pillen, lett overshoot (320 ms). Lett haptikk.
- Innhold:
  1. Topp: AI-logo (28 px, animert) · tittel («Legger til i kalenderen») · modell («System-AI · lokal») · prosent til høyre (mono).
  2. Det brukeren skrev, i kursiv i et grått felt: «time hos nina frisør 14.30 25.09».
  3. Steg med status: ✓ grønn (ferdig) · rød pulserende ring (pågår, fet tekst + «…») · grå ring (venter). Eksempel: Leser teksten → Finner dato og klokkeslett → Sjekker kalenderen for kollisjoner → Lagrer avtalen.
  4. Det AI har funnet: Hva / Når / Kalender / Varsel (to kolonner).
  5. Knapper: **Avbryt** (sekundær, stopper jobben, «Avbrutt · ingenting ble lagt til») og **Skjul** (ink-pille, krymper tilbake til toasten).
- Trykk hvor som helst på boblen = skjul. Jobben fortsetter i bakgrunnen.
- Når ferdig: boblen/toasten bytter til «✓ Nina frisør · fre 25. sep · 14:30 lagt i kalenderen» og forsvinner etter 3 s.

## Generelt
- Samme komponent for alle AI-jobber (kvittering, skjermbilde, Chat-verktøy, oppsummering av nyheter). Jobben sender `{title, model, input, steps[], fields[], progress}` via SSE/WebSocket så boblen er live.
- iOS: `.glassEffect()` (iOS 26) eller `.ultraThinMaterial` + `matchedGeometryEffect` mellom pille og boble.
