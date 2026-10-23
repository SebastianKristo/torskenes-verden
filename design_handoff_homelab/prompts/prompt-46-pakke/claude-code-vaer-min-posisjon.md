# Vær: «Min posisjon» øverst i stedslisten + vær der man er

## Feil
Vær skal vise været der brukeren er (appens posisjon), men viser i dag et fast sted (Oslo / første lagrede sted).

## Fasit
`Vaer.dc.html`: `locate()`, `place()`, `pl.me`, og raden øverst under «MINE STEDER».

## Krav
- **Øverst i Steder-listen** (over lagrede steder): fast rad **«Min posisjon»** med blå posisjonsikon-sirkel. Tittel = stedsnavn fra omvendt geokoding (f.eks. «Strømstad»), undertekst «Min posisjon · følger telefonen». Hake når den er valgt. Kan ikke slettes, flyttes eller sveipes.
- **Standard:** `city = '__gps'` (Min posisjon) for nye brukere og når ingenting er lagret. Hero viser «MIN POSISJON» + stedsnavn.
- **Kilde for posisjon:** bruk **appens egen posisjonstjeneste** (samme som Familie/Vel fremme deler), ikke en egen forespørsel. Rekkefølge:
  1. Siste kjente posisjon fra appens posisjonstjeneste (≤ 10 min gammel) → vis med en gang.
  2. Ny posisjon i bakgrunnen (lav nøyaktighet holder, ~1–3 km). Oppdater når brukeren har flyttet seg > 2 km eller når appen kommer i forgrunnen.
  3. Web/Mac: `navigator.geolocation` / CoreLocation.
- **Omvendt geokoding:** server-endepunkt (cache per ~1 km rute) → by/tettsted/bydel på norsk. Faller tilbake til «Min posisjon».
- **Feiltilstander** i raden: «Finner posisjonen …», «Gi appen tilgang til posisjon» (trykk → systeminnstillinger), «Fant ikke posisjonen». Ved feil: vis siste kjente posisjon hvis den finnes, ellers første lagrede sted, men behold valget «Min posisjon».
- **Rotårsak å sjekke:** at Vær faktisk leser appens posisjon (tillatelse gitt til appen, men Vær-modulen ber ikke om / får ikke posisjonen), og at lagret `vaer_city` ikke overstyrer GPS for eksisterende brukere. Migrering: hvis `vaer_city` er standardverdien «Oslo» og brukeren aldri har valgt sted selv → sett `__gps`.
- Gjelder også Vær-widgeten på Hjem, Now Brief, Glimt-svar om været («hva blir været?» = Min posisjon) og widgets på hjemskjerm/låseskjerm.
- iOS, Android/Fold, iPad, web og Mac.
