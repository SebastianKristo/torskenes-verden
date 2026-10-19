# Vær: stedssøk finner ikke alle steder (f.eks. Strømstad, Sverige)

Fasit: `Vaer.dc.html` → Steder → søk.

## Årsak
Søket brukte bare Open-Meteo geocoding (`language=nb`, 8 treff). Den mangler/rangerer bort mange mindre steder og er følsom for æ/ø/å.

## Ny søkelogikk (parallelt, debounce 250 ms, min. 2 tegn)
1. Open-Meteo: `/v1/search?count=10&language=nb&name=<q>`
2. Open-Meteo med **foldet** tekst hvis den er ulik (ø→o, æ→ae, å→a, fjern aksenter): «Strømstad» → «Stromstad».
3. **Nominatim (OpenStreetMap)**: `/search?format=jsonv2&addressdetails=1&limit=8&accept-language=nb&q=<q>`. Behold kun bosteder (city, town, village, hamlet, suburb, municipality, administrative, island, locality). Navn fra `address.city|town|village|…`, undertekst `county|state, country`.
   - Send egen `User-Agent`/`Referer` fra backend (krav fra Nominatim), og maks 1 kall/sek. Kjør helst via Homelab-backend med cache (24 t).
4. Slå sammen, fjern duplikater innen ~5 km, sorter: navn som starter med søket først, deretter folketall. Vis maks 10.
5. Undertekst alltid «Fylke/region, Land» så utenlandske steder er tydelige (Strømstad → «Västra Götaland, Sverige»).

## Feiltilstander
- Ingen treff: «Fant ingen steder som heter "<q>"».
- Nett feiler: «Får ikke søkt nå. Prøv igjen.»
- Kildetekst nederst: «Stedssøk via Open-Meteo og OpenStreetMap.»

## Bunnlinje (kart · steder)
- Kart-ikonet (venstre) og meny/steder-ikonet (høyre) ligger i en **bunnlinje helt nederst**, ikke som flytende sirkler over innholdet.
- Linjen: full bredde, frostet (`rgba(10,20,35,.32)` + blur 20), 1 px hvit 14 %-kant øverst, padding 6 pt + safe area nederst.
- Ikoner 24 pt, hvite, uten egen sirkel, treffflate 48×48.
- Skann-knappen (FAB) vises ikke på Vær-siden.
- Innholdet får bunnpadding = linjens høyde, så siste rad ikke skjules.
