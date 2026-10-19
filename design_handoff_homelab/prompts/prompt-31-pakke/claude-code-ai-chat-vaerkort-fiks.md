# AI-chat: værkortet som én flate

Fasit: `Mobil Papir App.dc.html` → værkortet i Chat (`m.isWx`).

## Feil
Toppen (blå gradient, egen radius og skygge) og timeraden (hvit, egen radius) lå som to kort som ikke hang sammen.

## Fiks (Apple Vær-widget-stil)
- **Ett kort**, radius 22, `overflow: hidden`. Gradienten ligger bak hele kortet, også timeraden. Hele kortet kan trykkes og åpner Vær.
- Topp: by + posisjonspil, stor temperatur (44 px, 300) til venstre. Ikon, beskrivelse og H/L til høyre.
- Timerad: inne i samme flate, med 14 px innrykk og en tynn skillelinje `rgba(255,255,255,.22)` over. Hvit tekst: time (85 % opasitet), ikon, temperatur 14 px 600.
- Gradienter (mørkere nederst for kontrast med hvit tekst): dag klart `#134a86 → #3f74ab 70% → #5f8fc0` · grått/regn `#46525f → #6f7b8a` · natt `#0e1a33 → #2b3a5c`.
