# Vær (mobil): liquid-glass dra-pillene virker ikke på telefon

Gjelder alle tre i `Vaer.dc.html`: Temp/Regn/Vind-velgeren, «Faktisk / Føles som» og begge kartlag-velgerne (fullskjerm og kort). Virker med mus, ikke med finger.

## Årsak
- Containerne hadde `touch-action: pan-y`. En litt skrå fingerbevegelse blir tolket som vertikal scroll av forelderen, nettleseren sender `pointercancel`, og draget stopper før pillen flytter seg.
- React-lyttere for touch er passive, så `preventDefault()` fra dem har ingen effekt.

## Fiks
1. Sett `touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none` på hver pille-container (ikke `pan-y`).
2. Legg én **ikke-passiv** `touchmove`-lytter på `document` i `componentDidMount` (`{passive:false, capture:true}`). Når et pille-drag er aktivt, kall `e.preventDefault()` så siden ikke scroller mens man drar. Fjern lytteren i `componentWillUnmount`.
3. Temp/Regn/Vind: ta `setPointerCapture` allerede på `pointerdown` når `pointerType !== 'mouse'` (den håndterer trykk selv i `up`).
4. «Faktisk / Føles som» og kartlag: behold capture etter 5 px bevegelse, ellers slutter vanlige trykk på knappene å virke.

## Test på telefon
- Dra sakte og raskt, også litt på skrå. Pillen skal følge fingeren, strekke seg med fart, vibrere ved hvert lagskifte og smekke på plass.
- Vanlig trykk på et valg skal fortsatt bytte.
- Vertikal scroll utenfor pillene skal virke som før.
