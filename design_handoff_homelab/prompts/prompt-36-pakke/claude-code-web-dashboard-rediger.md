# Web-dashboard: full wiggle-redigering med rutenett, snapp og endre størrelse

Ønske 2026-10-19: «gi meg full wiggle redigerings som i mobil appen. la meg rezise widegets og felt. legg kansje et slags rutenett med antall columns som jeg kan bestemme og gi litt snapp grid.» Vedlegg: `uploads/Screenshot 2026-10-19 at 21.59.49.png` (dagens dashboard med faste kolonner).
Fasit (prototype): `Dashboard Rediger Web.dc.html`.

## Starte og avslutte
- **Hold inne en widget i 520 ms** (beveger man seg mer enn 6 px, avbrytes det), eller trykk **Rediger** oppe til høyre.
- Alle widgets **vugger** (±0,45°, 0,26–0,32 s, annenhver retning, som på mobil).
- **Ferdig** (mørk pille, til høyre i verktøylinja) avslutter. Esc gjør det samme.

## Verktøylinje (sticky, glass-pille øverst)
- **+** legger til widget. Panelet viser widgets som ikke er på dashboardet, og trykk legger dem øverst.
- **KOLONNER 4 · 6 · 8 · 12** (segmentert). Ved bytte skaleres x og bredde proporsjonalt (`round(x·ny/gammel)`), og så komprimeres oppsettet.
- **Vis rutenett** (bryter): stiplede kolonner (`rgba(178,58,42,.045)` + stiplet kant) og radlinjer.
- **Tilbakestill**: standardoppsett for valgt antall kolonner.
- Statustekst i mono: «Kolonne 5 · rad 3» når man drar, «6 × 4» når man endrer størrelse.

## Rutenett og snapp
- CSS grid: `repeat(N, minmax(0,1fr))`, gap 16, radhøyde **56 px** (12 kol), **64** (8) og **72** (4–6).
- Hver widget har `{id, x, y, w, h}` i rutenett-enheter.
- **Flytt:**
  - Dra hvor som helst på widgeten. Den følger pekeren (`scale 1.03`, skygge).
  - En **stiplet rød ramme** viser hvor den lander (snappet til nærmeste celle, pulserer). Den viser også størrelsen.
  - De andre widgetene **flytter seg live** av veien (kollisjon + komprimering oppover, 0,2 s).
- **Endre størrelse:**
  - Rundt håndtak nederst til høyre (begge retninger). Usynlige kanter til høyre og nederst gir bare bredde eller bare høyde.
  - Størrelsen **snapper** per celle mens man drar. Minimum 2 kolonner × 1 rad, maks gjenværende bredde.
- **Komprimering:** vertikal «tyngdekraft». Hver widget legges på laveste ledige y ved sin x (som gridstack/react-grid-layout). Ingen overlapp.
- **− (oppe til venstre)** fjerner widgeten. Den kan legges til igjen via +.
- **Rediger widget** (pille midt på widgeten, med størrelsen «4 × 3»): størrelsespresets **S / M / L / XL** (¼, ⅓, ½ og full bredde). Widgetens egne innstillinger (hva som vises) skal ligge her også, som på mobil.

## Lagring og synk
- Oppsettet lagres per bruker og **per enhetsklasse** (web-desktop for seg, mobil for seg): `PUT /api/dashboard/layout {device:'web', cols, items:[{id,x,y,w,h}]}`. Lokal cache: `hl_web_dash_layout_v1`.
- Er vinduet smalere enn 900 px, brukes en automatisk 4-kolonners variant (bare visning, ikke lagret), som deretter blir 1 kolonne på mobil.

## Tilgjengelighet
- Tastatur i redigeringsmodus:
  - Tab velger widget.
  - Piltaster flytter én celle, shift+piltaster endrer størrelsen.
  - Delete fjerner.
- «Reduser bevegelse»: ingen vugging, bare en stiplet ramme rundt widgetene.

## Bibliotek
`react-grid-layout` (eller `gridstack`) passer: `cols`, `rowHeight`, `compactType:'vertical'`, `preventCollision:false`, `resizeHandles:['se','e','s']`, `isDraggable/isResizable` bare i redigeringsmodus. Vugging som CSS-animasjon på kortet, ikke på grid-elementet, så transform ikke kolliderer.


## Oppdatering 2026-10-19 (2): ny verktøylinje + inne i selve dashboardet
Vedlegg: `uploads/Screenshot 2026-10-19 at 22.22.15.png` (den gamle linja: hvit, brøt over to linjer, «stygg») og `22.22.28.png` (dashboardet).
- **Verktøylinja er nå én mørk, flytende pille**, sentrert og sticky 14 px fra toppen (`rgba(27,26,23,.92)` + blur 18, lys tekst, aldri linjeskift, scroller vannrett hvis smalt). Fra venstre:
  1. **＋ Widget** (åpner panelet for å legge til).
  2. Skillelinje.
  3. Kolonne-ikon + segmentert **4 · 6 · 8 · 12** (valgt verdi har lys pille).
  4. Skillelinje.
  5. **Rutenett-ikon** (av/på, lyst når på).
  6. **↺ Tilbakestill** (bare ikon, med tooltip).
  7. **Ferdig** (lys pille, `#f3efe6` med mørk tekst).
- Hjelpeteksten («Kolonne 5 · rad 3» / «6 × 4») ligger **ikke** i linja lenger. Den vises som en liten mørk brikke nederst på midten **bare mens man drar**.
- **I Homelab Papir Web (Dashboard):**
  - Knappen **Rediger widgets** står over widget-rutenettet (til høyre), og **hold inne 560 ms** hvor som helst på widgetene gjør det samme.
  - Begge åpner redigeringsmodus med vugging rett på dashboardet (`<dc-import name="Dashboard Rediger Web" embedded>`).
  - **Ferdig** går tilbake. I den ekte appen er det **de samme widget-komponentene** som vugger og flyttes. Prototypen viser forenklede kort.

- **Endret (2026-10-19, vedlegg `uploads/Screenshot 2026-10-19 at 22.25.47.png`):** knappen «Rediger widgets» over rutenettet er fjernet. Den ligger nå i **profilmenyen (S oppe til høyre)** som egen rad **Rediger widgets** (rød ikonbrikke `#b23a2a`, rutenett+-ikon), rett under «Tilpass forside og meny». Raden kan flyttes eller skjules i «Tilpass denne menyen». Trykk lukker menyen, går til Dashboard hvis man står et annet sted, og starter vuggingen. «Hold inne en widget» virker fortsatt.
