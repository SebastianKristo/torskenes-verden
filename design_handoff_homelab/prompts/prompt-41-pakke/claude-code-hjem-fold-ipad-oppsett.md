# Hjem på Fold og iPad: nytt oppsett av widgets

Ønske 2026-10-20: «kom opp med et annet deisgn for oppset av widftes på fold og ipad.» (skjermbilde: `vedlegg/hjem-fold-ipad-na.png`)
Fasit: `Hjem Fold iPad Varianter.dc.html` → **1a / 1b / 1c**. **Valgt for Fold: 1c** (2026-10-20). iPad: ikke valgt ennå, bruk dagens oppsett til brukeren velger.

- **1a Rutenett med smal topp:** bildet blir et smalt bånd (150 pt) med hilsen og temperatur. Under: søk i full bredde, så et 4-kolonners rutenett der kortene har størrelser (liten 1×1, bred 2×1, høy 2×2): Brief (bred), I dag (høy), Avganger (bred), Huskeliste (bred), tall-kort (små). Wiggle-redigering bytter størrelse på kortet.
- **1b Fast «nå» + «i dag»:** venstre kolonne (5/11) med bildet som bakgrunn, hilsen, stor temperatur, Brief på mørkt glass og søk – står stille. Høyre kolonne (6/11) scroller: I dag (kalender), Avganger, Huskeliste, tall-kort.
- **1c Stort hovedkort + faner:** venstre halvdel er ett stort Glimt-kort (bilde, hilsen, vær, brief, «Hør briefen», søk). Høyre halvdel har faner **Nå · I dag · Hjemme · Økonomi** som viser relevante kort (Nå: avganger, huskeliste, tall, familie).
- Felles: sidelinje til venstre med rød Hjem-knapp i samme form som fanene (`claude-code-fold-hjem-knapp.md`). Portrett på iPad/Fold: 1a blir 2 kolonner, 1b og 1c stables (venstre del øverst).

## Valgt: 1c på Fold (2026-10-20)
Ønske: «for fold gå for 1c layout»
Bygg **1c** når telefonen er brettet ut (Samsung Galaxy Z Fold / Pixel Fold, bredde ≥ 600 dp):
- **Sidelinje** til venstre (84 dp) med rød Hjem-knapp i samme form som fanene.
- **Venstre halvdel: stort Glimt-kort** (fyller høyden, 26 dp hjørner). Bakgrunnsbildet fra «Bakgrunn på forsiden» (Oslo fra lufta / Vær nå / …) med mørk overgang nederst. Innhold ovenfra: dato (kursiv), «God ettermiddag, Sebastian», stor temperatur + kort vær, så nederst Brief (KVELDSBRIEF · GLIMT, hovedsetning, «Hør briefen», «3 nyheter») og søkefeltet med ✦ AI. Trykk på vær → Vær, på brief → Brief.
- **Høyre halvdel: faner** **Nå · I dag · Hjemme · Økonomi** (piller øverst, sveip mellom dem):
  - **Nå:** Avganger (eller Min reise når relevant), Huskeliste, Finans + Domener (små), Posisjon · Familie (med Hjemlys-rad når aktiv).
  - **I dag:** Kalender for dagen, bursdager, prøveperioder, Gjøremål.
  - **Hjemme:** Home Assistant (lys, varme), Bolig, Sporing (pakker), Mat i kveld.
  - **Økonomi:** Finans (brukt / budsjett), kvitteringer til gjennomgang, Aksjer, Abonnement.
  - Hvilke kort som ligger i hver fane styres i wiggle-redigering (hold inne → dra kort mellom faner, «–» skjuler). Sist brukte fane huskes.
- Hovedkortet scroller ikke; høyre fane scroller. Ingen fanelinje i bunnen. Skanneknappen flyter nederst til høyre i høyre halvdel (følger «Skanneknapp på Hjem»).
- **Sammenbrettet** (dekselskjerm): vanlig mobiloppsett. Overgang ved bretting: animer hovedkortet fra toppbildet (matched geometry).
- **Fold i portrett/«bordmodus»** (halvbrettet): hovedkortet på øvre halvdel, fanene på nedre.

## Lagt inn i appen (2026-10-20)
Ønske: «oppdater her men det nye fold designet» (skjermbilde av 1c i `FinansHub Mobil v2.dc.html`)
Fasit: `Mobil Papir App.dc.html` med `wide` (vises i `FinansHub Mobil v2.dc.html` → 1c Android brettbar).
- Toppbildet skjules på Hjem i brettet modus. Venstre: stort Glimt-kort (bakgrunnsbildet, hilsen, 7°, Brief-kortet, søk med ✦ AI). Høyre: fanene **Nå · I dag · Hjemme · Økonomi** og én kolonne med kort.
- Kort per fane (standard): Nå = Avganger, Gjøremål, Posisjon, Siste nytt · I dag = Kalender, Bursdager, Prøveperioder, Gjøremål, Bibelvers · Hjemme = Bolig, Pakker, Snarveier, Posisjon · Økonomi = Prøveperioder, Pakker (+ finanskortene). Søkekortet og Brief vises ikke i lista (de ligger i hovedkortet).
- Valgt fane huskes (`papir_fold_tab`).
- Fiks: fanene Nå/I dag/… lå helt inntil toppkanten. Høyre kolonne har nå 24 dp luft øverst (samme som hovedkortet til venstre, 12 dp + statuslinje), og fanene står på linje med toppen av hovedkortet.
