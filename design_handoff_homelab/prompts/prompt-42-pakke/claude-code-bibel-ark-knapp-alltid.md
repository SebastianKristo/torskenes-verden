# Hjem → «Dagens bibelvers»-arket: «Åpne Bibel-siden» skal alltid synes

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.23.56.png` (iPhone). Arket «Dagens bibelvers» er høyere enn skjermen, så knappen **Åpne Bibel-siden ›** kuttes nederst og havner bak hjemstreken. Man må scrolle for å finne den.

## Fiks
- Arket deles i tre: **topp** (tittel + Ferdig), **innhold** som scroller (vers før, dagens vers, referanse, vers etter, Del/Kopier), og en **fast bunn** med **Åpne Bibel-siden ›**.
  - Arket: `display:flex; flex-direction:column; max-height: calc(100dvh − safe-area-top − 12px)`.
  - Innhold: `flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`.
  - Bunn: `flex:none; padding: 12px 24px calc(env(safe-area-inset-bottom) + 12px)`, samme bakgrunn som arket og en svak linje/fade over (`box-shadow: 0 -12px 16px -12px rgba(27,26,23,.18)`), så det synes at innholdet scroller under.
- Knappen: full bredde, 56 px, mørk pille (`#1b1a17`, hvit tekst, Manrope 700 18 px). Den ligger alltid over hjemstreken og er aldri kuttet, uansett tekstlengde, Dynamic Type eller skjermstørrelse.
- Del og Kopier blir liggende i innholdet rett under verset.
- Lange kontekstvers: vis maks 3 linjer før og etter dagens vers, med «Vis mer». Da blir arket lavere og knappen nærmere verset.
- Trykk på **Åpne Bibel-siden** lukker arket og går til Bibel-siden (samme rute som Mer → Bibel), med lett haptikk.
- SwiftUI: `.safeAreaInset(edge: .bottom) { OpenBibleButton() }` på ScrollView i arket, `.presentationDetents([.large])`. Android: `Scaffold(bottomBar = …)` i `ModalBottomSheet` + `WindowInsets.navigationBars`.

## Test
- iPhone SE, 15 Pro og 16 Pro Max med stor tekst: knappen synes uten scrolling, og er ikke kuttet.
- Lang kontekst: innholdet scroller, og knappen står fast.
