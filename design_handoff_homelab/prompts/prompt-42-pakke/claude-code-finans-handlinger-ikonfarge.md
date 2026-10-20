# FEIL: grå/skitten farge bak ikonene i «Handlinger» (Finans → Oversikt)

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.00.35.png`. Ikon-brikkene i Last opp kvittering / Ny transaksjon / Importer / Rapport har en gråbrun, dempet bakgrunn som ikke passer med kortets farge.
Fasit: `FinansHub v3 Temaer.dc.html` → `actions` (`tile`, `tileBd`).

## Årsak
Brikken bruker `surf`-tokenet (`background: var(--surf)`). I Papir-temaet er `surf` en halvgjennomsiktig mørk farge (laget for mørkt tema). Lagt over den lyse kortfargen (`warnSoft`, `blueSoft` …) blir den grå.

## Fiks
- Brikken (34 × 34, radius 10) får en **lys tone av ikonfargen** i stedet for `surf`:
  - `background: color-mix(in oklab, <ikonfarge> 16%, var(--card))`
  - `box-shadow: inset 0 0 0 1px color-mix(in oklab, <ikonfarge> 22%, transparent)`
- Ikonfargene er som før: Last opp kvittering `warn` (rød/oransje), Ny transaksjon `blue`, Importer `pos` (grønn), Rapport `purple`.
- Mørkt tema: `color-mix(in oklab, <ikonfarge> 22%, var(--card))`, så brikken fortsatt skiller seg fra kortet.
- Ikke bruk `surf`, `rgba(0,0,0,…)` eller `opacity` på brikker som ligger oppå fargede kort. Sjekk de andre stedene med samme mønster (Hjem-snarveier, Boliger-handlinger, Kvitteringer-opplasting) og bytt til samme oppskrift.
- iOS/Android: samme regel (`Color.mix` / `lerp(card, icon, .16)`).

## Test
- Lyst tema: brikkene har en lys, ren tone av samme farge som ikonet (lys oransje, lys blå, lys grønn, lys lilla). Ingen grå.
- Mørkt tema og alle temaene i «Temaer»: brikkene er tydelige og ikke grumsete.
