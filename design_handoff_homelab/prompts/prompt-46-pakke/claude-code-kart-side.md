# Ny side: Kart (web og mobil)

Fasit: `Kart.dc.html` (én komponent; bred visning ≥ 900 pt = web/iPad/Fold, smalere = mobil).

## Innhold
- **Kart:** Kartverket gråtone (`topograatone`, WMTS webmercator). Dra for å flytte, scroll/knipe for zoom (11–18), +/−, «Min posisjon».
- **Holdeplasser** (Entur Journey Planner v3 `stopPlacesByBbox` for synlig utsnitt, fra zoom 14). Farget prikk per transportmiddel: Buss, T-bane, Trikk, Tog, Båt. Ikon fra zoom 15, navn fra zoom 16.
- **Filter-chips** øverst (Buss / T-bane / Trikk / Tog / Båt) gjelder både holdeplasser og kjøretøy.
- **Mine soner:** samme soner som Familie → Soner (`fam_v1.zones`), sirkel med radius og navnelapp. Sone med sanntid på har heltrukket kant og «LIVE».
- **Personer:** familiemedlemmer med posisjonsdeling, som på Familie-kartet. «Du» pulserer.
- **Kjøretøy i sanntid** (Entur Vehicles API `api.entur.io/realtime/v2/vehicles/graphql`, `boundingBox`) **bare for valgte soner**: område = sonesenter ± maks(3 × radius, 1200 m). Poll hvert 10. sekund. Merke = linjenummer i modusfarge med retningspil (bearing), glir mellom posisjoner.

## Panel
- **Web:** fast panel til venstre (372 pt). **Mobil:** bunnark med tre høyder (lav / halv / høy), håndtak for å bytte.
- Søk etter holdeplass (Entur Geocoder, `layers=venue`).
- Faner: **Lag** (brytere: Holdeplasser, Kjøretøy i sanntid, Mine soner, Personer), **Soner** (liste med «Sanntid»-knapp per sone + trykk for å fly dit), **Personer** (sone de er i, sist oppdatert, trykk for å fly dit).
- Trykk på holdeplass: navn, transportmidler og **avganger** (`estimatedCalls`, 12 stk / 2 t) med linje, destinasjon, plattform, minutter og forsinkelse.
- Kilde vises øverst: «SANNTID · ENTUR» eller «DEMO-DATA» (fallback når API ikke svarer).

## Data og lagring
- Header `ET-Client-Name: kristo-homelab` på alle Entur-kall. Kall går via egen server-proxy i appen (cache 30 s for holdeplasser, ingen cache for kjøretøy).
- Brukervalg lagres per bruker: `kart_v1 = {z, c, show, md, vz}` (zoom, senter, lag, moduser, soner med sanntid). Synkes mellom enheter.
- Personposisjoner fra samme kilde og tillatelser som Familie. Personer som har pauset deling vises ikke.

## Navigasjon (bygget inn)
- **Mobil** (`Mer Ny.dc.html` → verktøylisten, og `Mobil Papir App.dc.html`): rad **Mer → Kart** («Holdeplasser, sanntid og soner», kart-ikon), side-nøkkel `tkart` (Familie bruker `kart`). Åpnes i fullskjerm som Media/Kalender, fanelinjen skjules, «‹ Mer» først i chip-raden går tilbake. Kan også legges i fanelinjen (`HNAV_ALL`: Kart ⌖).
- **Web** (`Homelab Papir Web.dc.html`): eget punkt **Kart** i menyen etter Familie, overskrift «Holdeplasser · sanntid · soner». Kartet fyller høyden (100vh − topp), panel til venstre.
- `Kart.dc.html` props: `height`, `topPad` (statuslinje), `onClose` + `backLabel` (viser tilbake-knapp).
- Glimt: «vis bussene rundt hjemme» → åpner Kart med sone Hjem og sanntid på.

## Plattform
- iOS: MapKit med egne tile-overlays (Kartverket) eller MKMapView standard dempet; Android: MapLibre med Kartverket WMTS. Web/Mac: MapLibre GL eller samme flis-løsning som prototypen.
- Kjøretøy-animasjon: interpolér mellom posisjoner over pollintervallet. «Reduser bevegelse»: hopp direkte.
