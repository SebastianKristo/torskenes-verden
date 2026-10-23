# Ruter: velg hvor mange anbefalte reiser som vises

Gjelder: kortet «Anbefalt for min reise» (Ruter-modul + Hjem-kort). Se `claude-code-ruter-hjem.md`.

- Legg til innstilling **Antall anbefalte reiser**: segmentert kontroll **1 · 2 · 3** (standard 2).
- Plassering: i kortets ⋯-meny og i Innstillinger → Ruter. Samme verdi brukes overalt (lagres per bruker på serveren, synkes mellom enheter).
- Kortet viser nøyaktig N rader. Kortets høyde følger antallet (ingen tomme plasser).
- Er det færre avganger enn N, vis det som finnes, ingen plassholdere.
- Haptikk (lett) ved bytte på mobil.
