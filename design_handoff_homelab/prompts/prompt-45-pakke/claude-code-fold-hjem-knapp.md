# Fold: rød Hjem-knapp i sidefanelinjen skal ha samme form som aktiv fane

Ønske 2026-10-20: «på fold navbare vis den rød ikke som sirkel med samme form som oversikt.» (skjermbilder: `vedlegg/fold-hjem-knapp-1.png`, `-2.png`)
Fasit: `Mobil Papir App.dc.html` → `foldHome` i fanelinjen (brettet telefon, sidefanelinje).

- Hjem-knappen øverst er nå en **rød avrundet firkant med samme mål og hjørneradius som den aktive fanen** («Oversikt»): full bredde i linjen, samme høyde, ikon 20 pt over teksten **«Hjem»** (samme skrift og størrelse som fanene). Ikke en 60 pt sirkel.
- Farger: bakgrunn `lab` (rød), ikon og tekst `onLab` (hvit). Skygge som før. 8 pt luft ned til første fane.
- Trykkeffekt som fanene (skala 0,96). VoiceOver: «Til Hjem».
- Gjelder Samsung Fold / Pixel Fold og iPad i sidefanelinje-modus.
