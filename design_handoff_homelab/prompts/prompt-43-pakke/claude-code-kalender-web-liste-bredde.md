# Kalender web → Liste: bruk hele bredden

Ønske 2026-10-21: «i liste view er det mye tom rom på siden» (vedlegg `uploads/Screenshot 2026-10-21 at 11.18.31.png`)
Fasit: `Kalender.dc.html` (`variant="web"`, `isList`). Lista fyller hele innholdsflaten til høyre for sidepanelet (bare 14–32 px marg). Ingen sentrert smal spalte.

## Det som er feil i appen
Lista ligger i en sentrert spalte på ca. 780 px. På en 1900 px skjerm står ca. 440 px tomt på hver side, og stedene («Stensberggata 26–28, Natalie Rogoff Ramsøys hus X166 Hustrykkeri») blir lange linjer under tittelen.

## Fiks
1. Fjern `max-width` og `margin: 0 auto` på liste-containeren. Bruk `width: 100%` og `padding: 0 clamp(16px, 2.5vw, 40px)`.
2. Glimt-kortet «DAGEN DIN» ligger i **sidepanelet** (under kalenderne, over hurtigtastene): orb 20 px, «GLIMT · DAGEN DIN» (mono, `lab`), tekst 13 px: «Du har 1 igjen i dag. Neste er TRE1400 Forelesning kl. 14:30. Skyet, 7–10°. Frist: Oblig 45 man. 2. nov.» Skjul kortet øverst i lista når sidepanelet vises (ikke to ganger). Uten sidepanel: vis det øverst i lista.
3. Rader som rutenett når bredden er ≥ 1100 px:
   `grid-template-columns: 170px 120px minmax(0, 1.4fr) minmax(0, 1fr) 110px 120px`
   → **Dag** (I dag / 21. oktober / vær) · **Tid** (mono) · **Hendelse** (fargestrek + tittel) · **Sted** (egen kolonne, ellipsis, hele adressen i tooltip) · **Kalender** (prikk + navn) · **Beløp/merke** (f.eks. «467 kr TREKK»).
   Under 1100 px: dagens oppsett (sted under tittel).
4. Kolonneoverskrifter øverst (mono 10,5 px, sticky): DAG · TID · HENDELSE · STED · KALENDER.
5. Ukeskille «UKE 44» går over hele bredden. Dagskolonnen er sticky innen dagen, slik at «Mandag 26. oktober» står mens man scroller dagens hendelser.
6. ≥ 1700 px: vis to uker side om side (to kolonner med samme rader), eller la lista være full bredde med maks linjelengde 1400 px for sted. Velg to kolonner som standard.

## Test
- 1920 px: ingen store tomme felt. Sted i egen kolonne. Glimt bare i sidepanelet.
- 1280 px: rutenett uten tom side. 1000 px: vanlig liste.
