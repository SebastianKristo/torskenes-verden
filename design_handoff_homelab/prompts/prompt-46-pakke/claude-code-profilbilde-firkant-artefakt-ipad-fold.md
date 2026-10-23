# iPad/Fold: firkantet fargeflate rundt profilbildet på Hjem

Skjermbilder: `uploads/Skjermbilde 2026-10-23 kl. 13.29.31.png`, `uploads/Screenshot 2026-10-23 at 13.29.44.png`

## Symptom
Øverst til høyre i vær-/hero-kortet på Hjem (iPad og Fold) ligger det en **firkantet**, litt lysere/annerledes farget flate bak det runde profilbildet. Bildet selv er rundt, men effekten rundt er kvadratisk og ser ut som en feil.

## Sannsynlig årsak
Et lag rundt avataren er ikke klippet til sirkel:
- `backdrop-filter`/`.ultraThinMaterial`/`BlurView` eller en skygge ligger på en **firkantet container** rundt bildet (blur/material følger rammen, ikke `clipShape`).
- Skygge (`shadow`) beregnes fra firkantet ramme fordi `clip`/`cornerRadius` legges **etter** skyggen, eller fordi bildet har en ikke-transparent kvadratisk bakgrunn.
- Rasterisering (`drawingGroup`/`graphicsLayer`, kanskje lagt til for jevnere Hjem-overgang) flater ut laget til et rektangel før klipping.

## Fiks
- Klipp **alle** lag (bilde, ring, material/blur, bakgrunn) til `Circle()` / `CircleShape` / `border-radius: 50%` med `overflow: hidden`.
- Rekkefølge: innhold → `clipShape(Circle())` → evt. hvit ring 2 pt → skygge sist, med `shadow` på en `Circle`-form (ikke på en firkantet container). Android: `Modifier.shadow(elevation, CircleShape).clip(CircleShape)`.
- Ingen blur/material bak avataren. Hvis kontrast trengs: kun myk sirkulær skygge (y 2, radius 8, 25 % svart).
- Sjekk at bakgrunnsbildet (værbildet) ikke tegnes i et eget kvadratisk lag bak avataren.
- Samme fiks for avatarer i navbar/sidepanel og andre steder som bruker samme komponent.

## Test
iPad (stående/liggende), Fold åpen og lukket, lys og mørk modus, med regn-/sol-/natt-bakgrunn, og under/etter Hjem-overgangen.
