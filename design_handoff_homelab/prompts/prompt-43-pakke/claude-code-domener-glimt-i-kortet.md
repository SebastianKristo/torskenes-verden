# Domener (mobil): Glimt-knappen inn i domenekortet

Ønske 2026-10-21: «fra domener fjern glimt knappen, men få bygd det inn i det kortet» (vedlegg `uploads/Screenshot 2026-10-21 at 11.11.04.png`, `… 11.11.16.png`)
Fasit: `Homelab Domener Papir.dc.html` (mobil), kortet med «DOMENE · 3 domener», domene-pillene og 1t/24t/7d/30d.

## Endring
- **Fjern** den frittstående mørke pillen «GLIMT · Vis oppsummering av siste døgn» og den dansende Glimt-figuren over den (mellom kortet og «kristo.no»).
- **Legg inn** en rad **nederst i domenekortet**, under periodevelgeren, med samme sidemarg (18 pt):
  - Mørk flate (`#1b1a17`, 16 pt hjørner, min. 54 pt høy), **Glimt-orben** til venstre (30 pt: konisk fargering #b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6, kremfarget innside, rød firetakket stjerne). **Ikke figuren** med ansikt/lue (ønske 2026-10-21: «i domener bare gi glimt ikonet ikke figuren»).
  - Linje 1: «GLIMT · SISTE DØGN» (mono 9,5 pt, `#e8a593`). Følger valgt periode: SISTE TIME / SISTE DØGN / SISTE 7 DAGER / SISTE 30 DAGER.
  - Linje 2: «Oppsummering av siste døgn» (Manrope 700, 14,5 pt), «›» til høyre.
  - Oransje prikk oppe til høyre når en ny oppsummering er klar (samme regel som før).
- Trykk åpner oppsummeringen som før (kortet «GLIMT · OPPSUMMERING» under). Når den er åpen, skjules raden i kortet.
- Web er uendret (knappen i domene-baren).

## Test
- Mobil: ingen Glimt-knapp mellom kortet og «kristo.no». Raden ligger inne i kortet, og teksten følger perioden når du bytter 1t/24t/7d/30d.
