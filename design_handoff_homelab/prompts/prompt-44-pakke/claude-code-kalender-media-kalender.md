# Kalender (app + web): «Media» som egen kalender

Ønske 2026-10-21: «for media release i kalender vis det som en kalender jeg kan slå av og på i sidebar i kalender app og web»
Fasit: `Kalender App.dc.html` (`CALS` → `{k:'me',n:'Media'}`, `MEDREL`) og `Kalender.dc.html` (`CALS` → `['media','Media',…]`, `evOn`).

- Ny kalender **Media** (oker `#a0671a`) under MINE KALENDERE i sidepanelet, med av/på-bryter som de andre. Undertekst: «Media · N de neste 30 dagene» (app) / «Sonarr · Radarr · utgivelser» (web).
- Hendelser: nye episoder (Sonarr `/calendar`) og filmer (Radarr `/calendar`, digital eller fysisk utgivelse) de neste 30 dagene. Tittel «▶ Slow Horses», notat «S06E03 · Dead Drop», tid = sendetid (lokal tid), 1 t eller episodelengde. Filmer: hele dagen.
- Trykk på en hendelse → detalj med status fra Media (Lastet ned / Lastes ned 64 % / Mangler) og knappen **Åpne i Media**.
- Erstatter bryteren «Vis i Kalender» i Media. Den styrer nå samme kalender.
- Skrivebeskyttet: endres ikke fra Kalender. Ikke med i varsler som standard (kan slås på per kalender).
