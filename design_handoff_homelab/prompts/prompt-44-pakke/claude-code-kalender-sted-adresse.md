# Kalender (web + app): skriv adresse i «Sted» med forslag

Ønske 2026-10-21: «i kalender for ny hendelse. sted la meg skrive inn adresse»
Fasit: `Kalender App.dc.html` (arket Ny / Rediger) og `Kalender.dc.html` (Ny hendelse-skjemaet), metoden `geoSearch`.

- Feltet heter «Sted eller adresse». Fra 3 tegn (vent 280 ms etter siste tastetrykk) vises opptil 6 forslag under feltet: kartnål, **gateadresse** (fet), postnummer og sted under. Nederst: «ADRESSER FRA KARTVERKET».
- Trykk på et forslag → feltet blir «Storgata 1, 0155 Oslo», og koordinatene lagres på hendelsen (`geo:{lat,lon}`). Fri tekst er fortsatt lov («Hos mormor»).
- Kilde 1: Kartverket `https://ws.geonorge.no/adresser/v1/sok?sok=…&fuzzy=true&treffPerSide=6&utkoordsys=4258` (gratis, ingen nøkkel).
- Kilde 2 når Kartverket ikke gir treff (steder, bedrifter, utlandet): Nominatim/OSM (`countrycodes=no`, `accept-language=nb`, egen User-Agent, maks 1 kall/s). Gjerne via egen server-proxy med cache.
- Bare det siste søket vises (eldre svar forkastes). Forslagene lukkes når feltet mister fokus.
- Med koordinater: detaljvisningen viser kart-miniatyr + «Åpne i Kart / Google Maps», og reisetid kan brukes i varsel («Dra nå»).
- Native: iOS `MKLocalSearchCompleter` kan brukes i tillegg, Android Places API er valgfritt. Kartverket er førstevalg for norske adresser.

- Feil 2026-10-21 (vedlegg `… 13.43.10.png`): forslagslista ble klemt til en tynn strek fordi arket er en flex-kolonne med fast høyde. Lista og radene skal ikke krympe (`flex:none` / `.fixedSize(horizontal:false, vertical:true)`). Arket skal heller rulle. Hver rad er minst 48 pt høy.
