# Gjøremål: «+ Ny liste» alltid sist, riktig farge, og endre rekkefølge på listene

Ønske 2026-10-21: «feil farge og ny liste skal alltid ligge bakerst, jeg vil også kunne endre rekkefølgene på de» (vedlegg `uploads/Screenshot 2026-10-21 at 11.09.10.png`, `… 11.09.22.png`)
Fasit: `Huskeliste.dc.html` (mobil-siden: pille-raden øverst) → `tabSort()`, `tabSv()`, `lpFor()`, `ord`-arket.

## Feil i appen (skjermbildet)
- Raden viser «2 · + Ny liste · Laget med Glimt · Arkivert». «+ Ny liste» står nest først.
- «+ Ny liste» er gjennomsiktig med grå tekst og grå stiplet kant. Over toppbildet ser den utvasket ut og har for lav kontrast.

## Fiks
1. **Rekkefølge:** `[...lister i valgt rekkefølge, «Arkivert», «Laget med Glimt»]`, og **«+ Ny liste» er alltid siste element**. Den er ikke en del av lista som sorteres, men legges til etter. (Web-fasiten bruker `order:999` som ekstra sikring.)
2. **Farge:** samme flate som de andre pillene: bakgrunn `card`, tekst `ink` (700, 13 pt), kant **1,5 pt stiplet** i `ink` med 40 % dekning. Ingen grå tekst. Mørk modus: `card`/`ink` fra mørkt tema.
3. **Endre rekkefølge:**
   - **Hold inne på en pille i 0,45 s** (haptikk) → arket **«Rekkefølge på lister»**. Et vanlig trykk velger lista som før; et langt trykk velger ikke.
   - Rader for alle pillene (Alle, egne lister, Arkivert, Laget med Glimt) med fargeprikk, **≡ for å dra**, og **▲ ▼**. Endringen vises med en gang i raden bak arket.
   - «Tilbakestill» går tilbake til standard. «Ferdig» lukker. Undertekst: «Dra i ≡ eller bruk pilene. «+ Ny liste» ligger alltid sist.»
   - Lagres per bruker: `huske_tab_order` (liste med nøkler) og synkes med profilen. Nye lister havner sist (før «+ Ny liste»). Slettede lister fjernes fra rekkefølgen.
   - iOS: `List` + `.onMove` i et `.sheet` med `EditButton`-modus alltid på. Android: `LazyColumn` med `sh.calvin.reorderable`. Web: samme ark.
4. Samme rekkefølge brukes i web-sidepanelet («Lister») og på Hjem-widgeten.

## Test
- Raden slutter alltid med «+ Ny liste», også med mange lister og etter at en ny er laget.
- Hold inne «Laget med Glimt» → arket → flytt den øverst → raden viser den først (etter at «Alle» er flyttet ned om du vil).
- Lukk og åpne appen → rekkefølgen står.
