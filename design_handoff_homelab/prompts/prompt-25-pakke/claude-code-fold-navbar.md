# Til Claude Code: Fanelinjen på Galaxy Fold / nettbrett (sidelinje)

Skjermbilde fra Galaxy Z Fold (utbrettet, ≈ 1010 dp bred). Sidelinjen til venstre viser **tekst i stedet for ikoner**: «cre» (Finans), «for» (Mat), «squ» (Domener), «mag» (Søk), «ell» (Mer). Etiketten «Domener/» er kuttet og har en skråstrek. Fargen avviker også fra telefonen.

## Årsak
Ikonene tegnes med en **ligatur-font** (Material Symbols / SF-navn som `credit_card`, `restaurant`/`fork_knife`, `square…`, `magnifyingglass`, `ellipsis`). På Fold lastes ikke fonten, eller den brede layouten bruker en annen komponent (`NavigationRail`) med tekst-ikon-fallback. Da vises ikonnavnet, avkuttet til 3 tegn. Dette skal aldri skje.

## Krav
1. **Ingen ligatur-fonter for ikoner.** Bruk samme ikonkilde som telefonens fanelinje: SVG-stier fra designet (`IC`/`TC` i `Mobil Papir App.dc.html`), konvertert til `ImageVector` (Android) eller SF Symbols / `Image(systemName:)` (iOS). Mangler et ikon, brukes en standardsti, aldri tekst.
2. **Samme komponent i bred modus.** Sidelinjen er bare en loddrett variant av den flytende fanelinjen:
   - Bredde **84 dp**, radius **28 dp**, padding 12 / 6, avstand 4, 12 dp fra kanten (topp, venstre og bunn).
   - Bakgrunn **lik telefonens fanelinje**: tokenet `nav` med blur 14 (Papir lys: `rgba(27,26,23,.88)`, mørk: `rgba(16,15,13,.9)`, Lys hovedbok: `rgba(26,25,22,.86)`). Ikke en ugjennomsiktig grå flate.
   - Valgt fane: lys pille (`navAct`, radius 20) med ikon 22 og etikett Manrope 600 12.5 under. Uvalgte: ikon 22 + etikett i `navInk`. **Ikon vises på alle** faner i bred modus, fordi det er plass.
   - Etikett: én linje, `maxLines=1`, ellipsis, ingen skråstrek. «Domener/» skal være «Domener».
   - Skann-knappen (FAB) nederst i sidelinjen eller nederst til høyre som nå.
3. **Rød Hjem-knapp øverst i sidelinjen** (bare i bred modus, og **bare når du ikke er på Hjem**):
   - Rund, 60 dp, `lab`-rød med `onLab` ikon (hus 24 dp), skygge `0 8 20 -8 / 50 %`, 8 dp over første fane.
   - Trykk går rett til Hjem og nullstiller historikken. Vises ikke på Hjem. Dukker opp og forsvinner med en kort skaler- og tonovergang (150 ms).
   - Gjelder alle seksjoner med egne faner (Finans, Domener, Familie, Subscription OS).
   - **Når den røde Hjem-knappen vises, skjules «‹ Hjem» øverst til venstre.** Tilbake-knappen vises bare når den går til noe annet enn Hjem (f.eks. «‹ Mer», «‹ Oversikt»).
4. **Brytepunkt:** bred modus fra ≥ 600 dp (`WindowWidthSizeClass.Medium/Expanded`). Bytt mellom fanelinje nederst og sidelinje uten å laste siden på nytt (Fold inn og ut).
5. **iPad:** samme sidelinje (ikke `TabView` sin sidebar).

## Test
Galaxy Z Fold 5/6 utbrettet og sammenbrettet, iPad i liggende og stående format, lyst og mørkt tema. Alle fem faner skal vise riktig ikon, uten tekstrester. Fargen på sidelinjen skal være lik fanelinjen på telefonen.

## Værsiden på Fold og nettbrett (≥ 700 dp)
Fasit: `design/Vaer.dc.html` med `fold` på (eller automatisk når bredden er ≥ 700). Skjermen brukes i to kolonner (5 : 7), maks 1280 bred, med 24 dp kantmarg:
- **Venstre kolonne:** sted, temperatur (stor), beskrivelse og H/L. Under: kortet med time for time og 10-dagersvarselet. Toppteksten fades ikke ut ved scrolling.
- **Høyre kolonne:**
  1. **Værkart rett på siden** (300 dp høyt, Windy): lagvelger Nedbør / Temperatur / Vind / Skyer og «⤢ Fullskjerm».
  2. Yr mot Pent.
  3. Vind og Månen.
  4. Flisene (Sol, UV, Føles som, I går, Nedbør, Sikt, Fuktighet, Trykk) i **3 kolonner** i stedet for 2.
- **Detaljark** (dag, mål, Yr/Pent, Steder) åpnes som **sidepanel** til høyre: bredde min(520 dp, 46 %), 16 dp fra kanten, radius 28 dp på alle hjørner og skygge. Ikke bunnark over hele skjermen. Bakgrunnen er fortsatt synlig til venstre.
- Kildelenken går over begge kolonnene, nederst.
- Bytt layout uten å laste på nytt når Fold åpnes og lukkes: iOS `horizontalSizeClass == .regular`, Android `WindowSizeClass` ≥ Medium.
