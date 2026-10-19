# Vær: Yr mot Storm i fullskjerm med logoer

Fasit: `Vaer.dc.html` → kortet «Yr og Storm» → «Time for time og hele uka ›».

## Endringer
- Sammenligningen åpnes i **fullskjerm** (ikke ark/flytende panel). Bakgrunn #17191e helt ut, innhold maks 760 px midtstilt på web/iPad. Topp-padding = safe area + 48 px.
- Lukk med rund **✕** (44×44, #2a2e36) øverst til høyre (samme som Finans). Lett haptikk ved lukking.
- Navnet «Pent» er byttet til **Storm** overalt (kort, overskrift, graf, tabell, tekster).
- **Logoer**: ekte Yr- og Storm-logo i stedet for bokstavsirkler:
  - Kortet på Vær-siden: to overlappende runde logoer (30 px).
  - Fullskjerm-header: **ingen logoer**, kun «Yr mot Storm» (30 px), stedsnavn under, og «Ferdig»-pille til høyre.
  - Grafforklaring og tabellhoder: liten logo (16–18 px) foran «Yr»/«Storm».
  - Fasiten bruker favicon-tjenesten (`google.com/s2/favicons?domain=yr.no|storm.no&sz=128`). I appen: legg logoene som assets (`yr-logo.png`, `storm-logo.png`), hvit bakgrunn, rund maske.
- Data uendret: Yr = MET (api.met.no). Storm har ikke åpent API, så Storm-kolonnen viser ECMWF fra Open-Meteo. Behold forklaringen nederst.

## Haptikk-fiks (samme fil)
`componentDidUpdate` fikk ikke forrige state. Lagre et eget øyeblikksbilde (`_hp`) av plOpen/mpOpen/cmpOpen/sh/ms og sammenlign med det. I native: bruk `onDismiss`.

## Oppdatering: hele kortet trykkbart + riktig Yr-logo
- Hele kortet «Yr og Storm» på Vær-siden (logoer, enighet, tabellen og «Time for time og hele uka ›») åpner fullskjerm Yr mot Storm.
- Yr-logoen: favicon fra yr.no ga en grå globus. Bruk Yr sin ekte logo (blå sirkel med hvit «yr»). Fasiten henter den fra `img.logokit.com/yr.no`. Feiler den, vises en innebygd fallback (blå #00b9f1 sirkel, hvit «yr»).
- I appen: last ned logoen én gang og legg den som asset (`yr-logo.png`). Ikke hent den fra nettet hver gang.
