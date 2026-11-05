# Vær: feil strek på toppen av valgt modus-pille (Android)

Gjelder: Forhold-kortet, bryteren Temperatur / Nedbør / Vind. Den valgte pillen (glass-boblen bak ikonet) har en kort, lys strek som ligger over toppkanten på Android (skjermbilde 05.11). Det er feil.

Fasit (`Vaer.dc.html`): pillen er 44 × 30, radius 999, bakgrunn `linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,.16))`, glanslys **inni** pillen langs toppkanten (`inset 0 1px 0 rgba(255,255,255,.55)`), ikke en egen strek utenfor.

## Årsak (sannsynlig)
Android støtter ikke `inset`-skygge. Glanslyset er laget som et eget element (View/linje) med fast bredde og posisjon, som ikke følger radius og pillens skalering, eller ligger utenfor `overflow`.

## Fiks
- Fjern det separate strek-elementet.
- Lag glansen inni pillen: pillen får `overflow:'hidden'` + `borderRadius` = høyde/2, og glansen er en `LinearGradient` (hvit 0.55 → 0 over de øverste 6 dp) som fyller hele bredden **inne i** pillen. Alternativt: `borderTopWidth: StyleSheet.hairlineWidth` + `borderColor:'rgba(255,255,255,.45)'` på selve pillen, og ingen ekstra element.
- Kantlinja rundt (`0 0 0 .5px rgba(255,255,255,.25)`) som `borderWidth: StyleSheet.hairlineWidth` på pillen.
- Skyggen under: `elevation` gir grå firkant-skygge på Android → bruk ingen `elevation` her, eventuelt en svak mørk `LinearGradient` under.
- Glansen skal skalere sammen med pillen ved dra (`scale(sx, sy)`): legg den inne i samme Animated-view.
- Sjekk samme mønster andre steder (glass-knapper, X-knappen, kart/☰-knappene) og bruk samme løsning.

## Test
- Android: ingen strek over pillen i noen av de tre modusene, heller ikke mens du drar.
- iOS: uendret.
