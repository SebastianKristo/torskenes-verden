# Hjem (mobil): Søk og Snarveier skal være to separate kort

Skjermbilder: `uploads/Screenshot 2026-10-23 at 14.04.03.png`, `uploads/Screenshot 2026-10-23 at 14.04.13.png`

## Feil
I appen henger søkefeltet (Glimt-søk) og de tre små kortene under (FINANS · MAT · DOMENER) sammen som ett element på Hjem. I wiggle-modus kan de ikke flyttes eller skjules hver for seg.

## Fasit
`Mobil Papir App.dc.html` har dem som **to egne widgets**:
- `h1` = **Søk** (bare søkefeltet med motorvelger, AI-knapp, avtaleforslag og svar).
- `h4` = **Snarveier** (`minis`: Finans, Mat, Domener i et 3-kolonners rutenett).
Begge har egen «–»-knapp (skjul) og kan dras til egen plass i rekkefølgen (`papir_layout.hjem.order` / `hid`).

## Krav
- Del dagens kombinerte komponent i to: `SearchWidget` og `ShortcutsWidget`, hver med egen nøkkel i layouten.
- Wiggle-modus: hvert kort rister for seg, har egen «–», kan dras opp/ned uavhengig. Skjuler man Søk, blir Snarveier stående (og omvendt).
- Migrering: eksisterende brukere som hadde det kombinerte kortet får `h1` og `h4` rett etter hverandre i samme posisjon, så ingenting flytter seg før brukeren endrer det selv.
- «+ Legg til widget» viser Søk og Snarveier som to valg.
- Snarveiene selv (hvilke tre moduler) kan fortsatt velges ved langt trykk på kortet.
- Bred visning (iPad/Fold): Søk og Snarveier går over hele bredden hver for seg (`FULL`).
