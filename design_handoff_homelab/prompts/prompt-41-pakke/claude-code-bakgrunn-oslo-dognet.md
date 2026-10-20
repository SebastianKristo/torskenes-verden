# Bakgrunn «Oslo»: ekte Oslo-bilder fra lufta som skifter gjennom dagen

Ønske 2026-10-20: «jeg ser heller ikke riktigige bilder av oslo, ta bilder herfra https://www.gettyimages.no/search/2/image?phrase=oslo+drone… og ruler gjennom dagen.»
Fasit: `Mobil Papir App.dc.html` (`BGSET.oslo_*`, `bgKey('oslo')`, `loadBg`).

## Om Getty Images
Getty-bilder er lisensierte og kan ikke hentes inn i appen uten kjøpt lisens. Bruk de frie Wikimedia Commons-bildene under (CC BY / CC BY-SA, med kreditering i Innstillinger → Tilpass → Bakgrunn). Har du kjøpt Getty-lisens: legg filene i `assets/bakgrunn/oslo/{morgen,dag,kveld,natt}/` på serveren, så brukes de foran Commons-listen.

## Feil i dag
Flere av filnavnene finnes ikke på Commons (`Oslofjord.jpg`, `Oslo_from_Holmenkollen.jpg`, `Oslo_Opera_House.jpg`), så appen faller tilbake til feil bilde eller gradient.

## Bildesett per tid på døgnet (Commons-filnavn, verifisert)
- **Morgen 05–10:** `Oslo_sett_fra_Nesoddtangen,_2020.jpg`, `Oslo_from_east_IMG_7642_aerial.JPG`, `Oslo_S_aerial.jpg`
- **Dag 10–16:** `Oslo_Skyline,_drone.jpg`, `Rodeløkka_(7._september_2018).jpg` (Wikimedia Norges droneprosjekt), `Holmenkollen_aerial.jpg`, `2010-10-25_Oslo.jpg`, `Operahuset.jpg`, `Oslo_S_aerial.jpg`
- **Kveld 16–20:** `Bjørvika_-_Oslo,_Norway_2020-12-23.jpg`, `Oslo_sunset_-_33885192918.jpg`, `Oslo_view.jpg`
- **Natt 20–05:** `Oslo_at_night.jpg`, `Oslo_night_skyline_2011.jpg`, `Oslo_-_Bjørvika_-_2026.jpg`
- URL: `https://commons.wikimedia.org/wiki/Special:FilePath/{fil}?width=2000` (1280 som reserve).

## Rotasjon
- Tidsrom velges fra lokal klokke. Innenfor tidsrommet byttes bilde **hver hele time** (`time % antall`).
- Sjekk hvert minutt om timen har endret seg, last neste bilde i bakgrunnen og bytt med 600 ms crossfade når det er lastet (aldri blankt).
- Bruk solnedgang/soloppgang fra Vær (Open-Meteo `sunrise/sunset`) i stedet for faste klokkeslett når det finnes: morgen = soloppgang−1 t til +3 t, kveld = solnedgang−2 t til +1 t, natt = mørkt.
- Bildet som feiler hoppes over. Feiler alle i tidsrommet: bruk dag-settet.
- Mørk overgang (`OV`) over bildet som før, så teksten leses.
- Undertekst i bakgrunnsvalget: «Oslo fra lufta · skifter gjennom dagen».
- Forhåndslast neste times bilde 5 min før bytte. Cache på disk (iOS `URLCache`, Android Coil diskcache, web Service Worker).
- Samme bilder og rotasjon på iOS, Android, web og Mac.

## Sjekk
- Kl. 07, 12, 18 og 23: riktig sett og bilde av Oslo, ikke gradient.
- Ved hel time byttes bildet med crossfade uten flimmer.
