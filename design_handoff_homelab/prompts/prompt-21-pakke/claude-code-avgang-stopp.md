# Til Claude Code: Utvidet avgang med holdeplasser mangler i appen

## Symptom
Når man trykker på en avgang i Ruter-visningen (sanntid) i designet, utvides raden og viser holdeplassene på turen. I appen skjer ingenting. Raden viser bare linje, retning og minutter.

## Fasit (`Mobil Papir App.dc.html` → Avganger / Ruter-visningen)
Utvidet rad, for eksempel linje 17 mot Grefsen st.:
- **Topplinje:** linjemerke (17, lyseblå), «Grefsen st.» (16px, 700) og under «Trikk · plattform B · i rute» (12.5px, `--mut`). Til høyre «2 min» (Newsreader 500, 26px) og under klokkeslett «19:01» (12px, `--mut`).
- **Stoppliste** under, rykket inn med samme venstrekant som teksten (ikke linjemerket):
  - Loddrett linje i linjefargen (2px) med en sirkel per stopp: første stopp er fylt sirkel, mellomstopp er hule sirkler (2px kant i linjefargen, `--card` inni), siste stopp er hul sirkel.
  - Første og siste stopp i **fet** (700). Mellomstopp normal vekt.
  - Klokkeslett høyrejustert i IBM Plex Mono 600 13px, `--mut`.
- **«Åpne i Ruter ›»**: lenke i `--lab`, understreket, åpner `https://ruter.no/reiseplanlegger/` med fra/til forhåndsutfylt.
- Tynn skillelinje (`--line`) under før neste avgang.
- Trykk på samme rad igjen lukker den. Bare én rad er åpen om gangen. Animer høyden (200 ms, ease-out).

## Data
1. Entur JourneyPlanner v3 (GraphQL, `https://api.entur.io/journey-planner/v3/graphql`, header `ET-Client-Name: kristo-homelab`).
2. For hver avgang fra `estimatedCalls`, hent `serviceJourney { estimatedCalls { quay { name publicCode } expectedDepartureTime aimedDepartureTime } }`.
3. Vis stoppene fra valgt holdeplass til endestasjon. Mer enn 6 stopp → vis første 2, «· · · N stopp» (trykkbar for å vise alle) og siste 2.
4. «i rute» / «2 min forsinket» fra `expectedDepartureTime − aimedDepartureTime`. Forsinkelse vises i `--lab`.
5. Plattform fra `quay.publicCode` («plattform B»). Transportmåte fra `serviceJourney.line.transportMode` (Trikk, Buss, T-bane, Tog, Båt).
6. Oppdater hvert 30. sekund mens visningen er åpen.

## Test
Åpne Ruter-visningen → trykk på 17 Grefsen st. → raden utvides med fire stopp (Amagerveien 19:01 fet, Grefsenveien 19:04, Kjelsåsveien 19:06, Grefsen st. 19:09 fet) og «Åpne i Ruter ›». Trykk igjen → lukkes. Likt på iOS, Android og Fold.
