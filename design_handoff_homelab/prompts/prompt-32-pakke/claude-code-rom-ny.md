# Rom: ny side med alle satellitter, dagens rombilde og Mars-rovere

Fasit: `Rom.dc.html` (`variant="a"` Kontrollrom, `variant="b"` Avisforside). Sammenligning: `Rom Varianter.dc.html` (1a / 1b). Web: `Homelab Papir Web.dc.html` → Rom laster `Rom` (prop `romVariant`, standard a).

## Data
- **Alle aktive satellitter:** CelesTrak `gp.php?GROUP=active&FORMAT=tle` (≈ 10 000). Fallback: gruppene stations, starlink, gnss, weather og resource. Hent på serveren hver 2. time og cache. Klienten regner posisjoner med satellite.js (SGP4) hvert 4. sekund.
- **Kategorier** (etter navn): Romstasjoner (ISS, Tiangong) · Starlink · OneWeb · Navigasjon (GPS, Galileo, GLONASS, BeiDou) · Vær og jordobservasjon (NOAA, Meteosat, GOES, Sentinel, Landsat, Planet …) · Kommunikasjon (Iridium, Intelsat, SES, Eutelsat, Inmarsat, Kuiper …) · Annet. Hver har fast farge og kan slås av/på i kartet.
- **ISS:** posisjon, høyde, fart, høyde over horisonten fra valgt by, og bakkebane ±45 min (stiplet).
- **Over byen nå:** satellitter over 10° fra Oslo/Bergen/Trondheim/Tromsø, med romstasjoner først og så etter høyde. Viser navn, høyde og retning (N, NØ …).
- **Dagens bilde:** NASA APOD (`apod?start_date=i dag−6&thumbs=true`). Stort bilde med tittel, dato, © og forklaring, pluss de siste 7 dagene. Trykk bytter hovedbildet. Bytt DEMO_KEY med egen nøkkel på serveren og cache ett døgn.
- **Mars:** `mars-photos/api/v1/rovers/{perseverance|curiosity}/latest_photos` gir sol, jorddato, antall nye bilder, kameraer og 6 bilder. Fallback: images.nasa.gov (merket «fra NASA-arkivet»). Sjekk ny sol hver 6. time og send varsel «Perseverance · Sol 1650: 32 nye bilder» (kan slås av).

## 1a Kontrollrom
- Mørkt panel (`#0b1220`, radius 28): «I BANE NÅ · tid», stort tall «10 412 satellitter», byvalg.
- Verdenskart (2:1, ekvirektangulært) med alle satellitter som prikker i kategorifarge (Starlink 55 % opasitet), Norge uthevet, valgt by som ring og ISS med bane og etikett.
- Kategori-chips med antall under kartet. Til høyre: ISS-kort (2×2 tall) og «Over Oslo nå».
- Under: dagens bilde (4:3) med tekst og «Siste 7 dager» (3 per rad), og så rover-kort (navn, status, «Sol · dato · N nye bilder», 3×2 bilder, kameraer).

## 1b Avisforside
- Toppen er en «førsteside» med dagens rombilde: stor Newsreader-tittel, bilde 3:2, forklaring i to spalter og en stripe med de siste 7 dagene.
- Høyre spalte: «I BANE NÅ» med stort tall og en tabell per kategori (prikk, navn, stolpe, antall). Lyst kart under og «Over Oslo» med byvalg.
- «MELDINGER FRA MARS»: én rad per rover med navn, sol og status til venstre og en horisontal bilderekke til høyre.
