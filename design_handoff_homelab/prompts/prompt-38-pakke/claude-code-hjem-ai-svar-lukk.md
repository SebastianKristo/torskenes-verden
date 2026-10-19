# Hjem: lukke AI-svarboblen uten å treffe kortet under

Ønske 2026-10-20: «den eneste måte for å fjerne boksen er å trykke på den, med f.eks. vær så åpnes vær først, finn en annen måte å fjerne den» (vedlegg: uploads/Screenshot 2026-10-20 at 01.15.32.png).
Fasit: `Mobil Papir App.dc.html` → `hs.ans*` / `hs.sw*`.

- Trykk i selve boblen lukker den **ikke** lenger (`stopPropagation`), så tekst kan markeres og leses.
- **✕** oppe til høyre (30 px, glass) lukker.
- **Sveip opp** på boblen (> 40 px) lukker med glid og fade. Under terskelen spretter den tilbake. Et lite håndtak nederst viser at den kan sveipes.
- **Trykk utenfor** lukker via et usynlig lag (`fixed inset:0`, under boblen). Laget **fanger** trykket (`preventDefault` + `stopPropagation`), så kortet under (for eksempel Vær) ikke åpnes. Scroll eller touchmove på siden lukker også.
- Haptikk (lett) ved lukking.
- **Fortsett i Chat ›** fungerer som før.
- iOS: `UIPanGestureRecognizer` på boblen + tap-recognizer på et dimmet transparent overlay, med `cancelsTouchesInView = true`. Android: `Modifier.pointerInput` + `detectVerticalDragGestures`, scrim som konsumerer klikk.
