# Vær: «Forhold» med egne visninger for nedbør og vind

Fasit: `Vaer.dc.html` → `isT/isR/isW`, timer (`hrs`) og dager (`days`). Data: MET (`precipitation_amount`, `wind_speed_of_gust`) med Open-Meteo som fallback (`hourly=precipitation,wind_gusts_10m`).

Bryteren ☁ / 💧 / 🌬 i «Forhold» bytter nå **både timeraden og dagslisten under**.

## ☁ Temperatur (som før)
Ikon, sjanse for nedbør, temperatur per time. Dagsliste med lav–høy-stolpe.

## 💧 Nedbør
- Undertittel: «Nedbør (mm) · Sjanse».
- **Timer**: avrundet søyle (30×62, radius 9) med stiplede linjer på 1/3 og 2/3. Fylt nedenfra med `#5ad1ff` (0–3 mm = 0–100 %). Under: mm (tom ved 0) og sjanse «0 %».
- **Dager**: 12 små søyler (hver = 2 timer, fylt etter mm, 0–4 mm = full). Søylene 06–18 er litt lysere (dagtid). I dag har søylen for nå hvit ramme. Så **total mm** (grå ved 0) og **💧 sjanse %** (dråpe vises ved ≥ 30 %, ellers dempet tekst).

## 🌬 Vind
- Undertittel: «Vind (m/s) · Kast».
- **Timer**: fart (stort tall) · «m/s» · «kast N». Under: sammenhengende linje for fart (`#3fd0e0`, 3 px) med område for kast (lys cyan), tegnet på tvers av timene.
- **Dager**: minigraf for døgnet (fart som linje, kast som område, 06–18 litt lysere). I dag har stiplet linje og en hvit prikk på nå (eget element over grafen, 8 px, så den ikke strekkes). Linjen har fast strektykkelse (non-scaling-stroke). Til høyre: **min–maks kast** «2–11 m/s».

## Generelt
- **Lik plassering i alle visninger:** tittel «Forhold ›» (20 px linje) og undertittel (17 px, én linje, «…» ved for lang tekst) har fast høyde. Timecellene er alltid 142 px høye, så kortet og linjene i det står på samme sted når man bytter.
- Undertitler: «Temperatur (°C)» · «Nedbør (mm) · Sjanse» · «Vind (m/s) · Kast».
- Samme kortstil (glass, radius 24). Bytte er umiddelbart og huskes per økt.
- Enhet: m/s (norsk standard). Kan byttes til km/t i innstillinger senere.
