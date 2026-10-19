# Chat: fjern lokal-tekst og skjul tastatur ved trykk

Fasit: `Mobil Papir App.dc.html` → Chat.

1. **Fjern** linjen «Kjører lokalt på hjemmeserveren. Ingenting sendes ut.» under skrivefeltet. Ingen tekst vises for lokale modeller.
   - For sky-modeller (Gemini/Groq) beholdes én linje: «Sky-modell: meldingen sendes til Google/Groq.»
2. **Skjul tastaturet** når brukeren trykker hvor som helst i meldingsområdet (ikke på knapper/lenker/felt).
   - iOS (SwiftUI): `.scrollDismissesKeyboard(.interactively)` på meldingslisten + `.onTapGesture { focused = false }` på bakgrunnen.
   - Android (Compose): `Modifier.pointerInput(Unit){ detectTapGestures { focusManager.clearFocus(); keyboard?.hide() } }` på listen, og `imeNestedScroll()`.
   - Web/PWA: `touchstart`/`click` på listen → `document.activeElement.blur()` hvis det er et tekstfelt.
