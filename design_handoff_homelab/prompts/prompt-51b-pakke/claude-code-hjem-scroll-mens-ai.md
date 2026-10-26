# Hjem: kunne scrolle mens Glimt svarer

Ønske 2026-10-26: «la meg scrolle i hjem samtidig som ai kjører» (vedlegg `uploads/Screenshot 2026-10-26 at 15.25.35.png`: kortet «Tenker på …» under søkefeltet).
Fasit: `Homelab.dc.html` (svarkortet under søkefeltet på Hjem).

## Feil
Når Glimt-svarkortet var åpent (også mens det tenkte), lå et usynlig fullskjerm-lag over Hjem. Laget stoppet scroll og lukket kortet ved første bevegelse. Selve kortet hadde `touch-action: none`, så man kunne ikke scrolle med fingeren på kortet heller.

## Fiks
- **Ingen fullskjerm-lag.** Hjem scroller fritt mens Glimt tenker og etter at svaret er klart. Kortet ligger i innholdet og scroller med siden.
- **Lukk ved trykk utenfor** (ikke ved scroll): lytt på `pointerdown`/`pointerup` på dokumentet; lukk bare hvis fingeren flyttet seg mindre enn 8 px, trykket var utenfor kortet og søkefeltet, og svaret er ferdig. Mens Glimt tenker lukkes kortet bare med ✕.
- **Kortet:** `touch-action: pan-y`, så vertikalt sveip på kortet scroller siden.
- **Sveip opp for å lukke / dra ned for å åpne i Chat** gjøres nå fra grepet nederst (30 px høyt område med `touch-action: none`). Med mus virker det fra hele kortet som før.
- Svaret fortsetter å strømme inn selv om kortet er scrollet ut av syne. Når det er ferdig og kortet ikke er synlig: lett haptikk + liten pille «Glimt svarte ↑» nederst over fanelinjen som scroller opp til kortet.

## Native
- iOS: ikke legg `.contentShape`/`onTapGesture` på et fullskjerm-lag; bruk `.simultaneousGesture(TapGesture())` på ScrollView-innholdet og sjekk at trykket er utenfor kortet. `DragGesture` bare på grepet.
- Android: ikke `pointerInput` som konsumerer på hele skjermen; tap-utenfor via `Modifier.pointerInput(Unit){ detectTapGestures }` på innholdet. Drag bare på grepet.
