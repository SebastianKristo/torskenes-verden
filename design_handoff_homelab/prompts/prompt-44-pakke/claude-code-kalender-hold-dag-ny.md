# Kalender (mobil): hold inne en dag for å legge til hendelse

Ønske 2026-10-21: «La meg trykke inne i en dag for å legge til en hendelse»
Fasit: `Kalender App.dc.html` (månedsrutenettet, `newOn(k)`).

- **Hold inne** en dag i måned (480 ms, lett vibrasjon) → «Ny hendelse»-arket åpnes med **den dagen** valgt. Starttid: neste halvtime hvis det er i dag, ellers 09:00. Varighet fra innstillingen (standard 60 min). Tittelfeltet får fokus.
- Vanlig trykk åpner fortsatt uke-visning. Etter et langt trykk åpnes ikke uke.
- Flytter fingeren seg mer enn 10 pt (sveip), avbrytes det lange trykket. Sveip bytter måned som før (`claude-code-kalender-sveip-maned.md`).
- Ingen tekstmarkering eller kontekstmeny (`-webkit-touch-callout:none`, `user-select:none`, `contextmenu` stoppes).
- I uke, 3 dager og dag: hold inne på et tidspunkt → ny hendelse på det klokkeslettet (avrundet til 15 min).
- Native: SwiftUI `.onLongPressGesture(minimumDuration: 0.45)` med `UIImpactFeedbackGenerator(.medium)` · Compose `combinedClickable(onLongClick=…)` med `HapticFeedbackType.LongPress`.

## Trykk på tomt tidspunkt i Dag / 3 d / Uke (2026-10-21)
Ønske: «la meg trykke her for å skape en hendelse der» (vedlegg `uploads/Screenshot 2026-10-21 at 13.20.03.png`, `… 13.20.07.png`)
- **Vanlig trykk** på tom plass i tidsrutenettet åpner «Ny hendelse» på den dagen og det klokkeslettet, avrundet **ned til nærmeste halvtime** (trykk ved 21:10 → 21:00–22:00). Varighet fra innstillingen.
- Trykk på en eksisterende hendelse åpner den som før (ikke ny).
- Etter sveip (bytte dag/uke) åpnes ikke arket.
- Native: tap-gest på rutenettet, `y / timeHøyde` → minutter, `floor(min/30)*30`.
