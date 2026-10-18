# Til Claude Code: Bakgrunnsbildene vises feil i appen og på nettsiden

## Symptom
I designet (`Mobil Papir App.dc.html`, `Homelab Papir Web.dc.html`) er toppbildet ekte fotografier: Oslo, vær og planeter (NASA). I den ferdige appen og på nettsiden er «Planeter» i stedet en **tegnet** planet (CSS/SVG-Saturn med stripete kule, ringer og prikkete stjerner). Den ser kunstig ut og dekker teksten og profilbildet.

## Fasit
Slik ser det riktig ut i designet (iPhone 1a): Oslo viser flyfoto over Oslo S og Operaen, Vær nå viser et foto av grå regnskyer, og Planeter viser JunoCam-fotoet av Jupiters sydpol. Alle tre er fotografier i full bredde. Teksten «Homelab», dato, hilsen og temperatur står i hvitt over bildet, og velgeren («Oslo ▾» / «Vær nå ▾» / «Planeter ▾») er en mørk pille ved profilbildet.

Toppbildet er alltid et **fotografi** som fyller hele toppfeltet (`background-size: cover`). Det skal ikke tegnes eller genereres. Over bildet ligger en mørk gradient så teksten er lesbar:
```css
background-image: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,0) 35%, rgba(0,0,0,.45)), url(<bilde>);
background-size: cover; background-position: center 40%;
```
Fjern all kode som tegner planeter, ringer eller stjernehimmel.

## Bildekilder (Wikimedia Commons, fri lisens / NASA public domain)
URL: `https://commons.wikimedia.org/wiki/Special:FilePath/<filnavn>?width=2000` (fallback `?width=1280`)

| Nøkkel | Filer (prøves i rekkefølge) |
|---|---|
| `planet` | `PIA21641-Jupiter-SouthernStorms-JunoCam-20170525.jpg`, `The_Earth_seen_from_Apollo_17.jpg`, `FullMoon2010.jpg`, `OSIRIS_Mars_true_color.jpg`, `Saturn_during_Equinox.jpg`, `Jupiter_and_its_shrunken_Great_Red_Spot.jpg` |
| `oslo` | `Oslo_S_aerial.jpg`, `Oslo_Opera_House.jpg`, `Oslofjord.jpg`, `Oslo_from_Holmenkollen.jpg` |
| `vaer_klart` | `Sky_with_clouds.jpg`, `Cumulus_clouds_in_fair_weather.jpeg` |
| `vaer_sky` | `Cloudy_Sky_Background.jpg`, `Clouds_over_the_Atlantic_Ocean.jpg` |
| `vaer_regn` | `Clouds_over_the_Atlantic_Ocean.jpg`, `Cloudy_Sky_Background.jpg` |
| `ruter` (bare i Ruter-visningen) | `SL18_tram_performing_test_run_at_Bjørvika.jpg`, `Oslo_tram_line_18_on_Grensen.JPG`, `Oslo_tram_line_19_and_18_at_St_Halvards_plass.jpg` |

- **Planeter:** ny planet hver dag, startindeks `floor(Date.now()/864e5) % liste.length` (Jorda, Månen, Jupiter, Mars, Saturn).
- **Vær nå:** velg nøkkel fra værkode (Open-Meteo `weather_code` eller MET `symbol_code`): 0–1 → `vaer_klart`, 2–50 → `vaer_sky`, 51+ → `vaer_regn`.
- **Lasting:** prøv hver fil med 9 s timeout, gå til neste ved feil. Når alle feiler, vis rolig gradient `linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)`, ikke en tegning.

## Bedre: last ned og server selv
1. Backend `backgrounds/fetch.py` laster ned alle filene over én gang til `/data/backgrounds/<nøkkel>/` (WebP 2000 px og 1080 px). Lagre fotograf/lisens i `credits.json`.
2. `GET /api/background?type=planet|oslo|vaer` → `{url, credit, theme_hint}`. Appen og nettsiden bruker bare denne, med lokal cache for offline.
3. Kreditering vises diskret i Innstillinger → Utseende → Bakgrunn (for eksempel «NASA / JPL · Wikimedia Commons»).

## Test
Velg Planeter, Oslo og Vær nå i både app og nettside. Toppen viser ekte foto i full bredde, tekst og profilbilde er lesbare, og ingen tegnet planet vises. I flymodus vises sist hentede bilde.
