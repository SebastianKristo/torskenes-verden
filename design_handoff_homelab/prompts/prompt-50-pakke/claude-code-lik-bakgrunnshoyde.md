# Lik høyde på bakgrunnsbildet (hero) på alle faner

Fasit: `Mobil Papir App.dc.html` → `heroH` / `heroPb`.

- I dag: Hjem har høyere hero (226px, 250px på bred skjerm) enn andre faner (168px), så bildet hopper når man bytter fane.
- Nå: alle sider med hero bruker samme høyde som Hjem: **226px** (bred: **250px**) og samme bunnpolstring **42px**. Unntak som før: Nordlys og Gjøremål (150px).
- Innholdskortet overlapper bildet likt overalt (samme negative margin), så kanten under bildet står helt i ro ved fanebytte.
- Tittel/kicker ligger nederst i heroen (margin-top:auto) og flytter seg derfor ned; det er ønsket.
- Gjelder iOS (inkl. statuslinje/safe area: høyden måles fra toppen av skjermen likt på alle faner), Android, Fold og iPad.
- Test: bytt Hjem → Domener → Finans → Hjem; bunnkanten av bildet skal ikke flytte seg en piksel.
