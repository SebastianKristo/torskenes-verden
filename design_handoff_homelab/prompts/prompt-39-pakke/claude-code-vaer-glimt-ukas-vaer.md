# Vær · «Glimt · ukas vær» med personligheter + størrelsesfiks i Yr mot Storm

Ønske 2026-10-20: «kanskje legg til i bunnen av vær popupen glimt vær personligheter som har en sammendrag av ukas vær og sammenligning av forrige uke og noe mer som er passende. og størrelsene er feil i yr vs storm» (skjermbilde: `vedlegg/yr-storm-storrelser.png`)

## 1. Glimt · ukas vær (nederst i Vær)
Fasit: `Vaer.dc.html` → `wkVals()` + kortet over «Data: Open-Meteo».
- **Data:** Open-Meteo `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,weather_code,wind_speed_10m_max&past_days=7&forecast_days=7`. Forrige uke = indeks 0–6, denne uka = 7–13. Cache per sted i 3 t.
- **Personligheter** (Glimt-figurer fra `glimt-figurer.js`). Valget lagres i `vaer_glimt_p`, synkes med kontoen.
  - **Sky · den rolige:** kort fortelling. «Uka blir litt varmere enn forrige uke, og våtere. Snittet ligger rundt 8°. Regn torsdag og lørdag, og fredag ser finest ut.»
  - **Ugle · tallknuseren:** tall og sammenligning. Snitt ± mot forrige uke, mm mot mm, soltimer mot soltimer, regndager av 7.
  - **Spire · ut og lek:** praktisk. Beste dag ute, paraply-dager og klestips.
- **Alltid under teksten:**
  - tre ruter: TEMP ± mot forrige uke · NEDBØR mm (forrige) · SOL t (forrige)
  - tre rader: Beste dag ute · Paraply · Klær
- **Beste dag** = maks av `tmax − 1,5·mm − 0,4·vind + 0,3·soltimer`.
- **Klær** etter snitt-maks: < 3° vinterjakke, < 8° varm jakke, < 13° lett jakke, < 18° genser, ellers T-skjorte.
- Med Glimt-LLM tilgjengelig: send tallene + valgt personlighet og be om 2–3 setninger i den stemmen. Den lokale teksten over er reserve.

## 2. Størrelser i Yr mot Storm (2a)
**Feil:** kortene hadde ulik bredde (hero smalere enn Glimt-kortet, listen smal), og overskriften «← Yr / Storm →» ble presset sammen til «← YrStorm →».

**Årsak:** innpakningen rundt hvert redigerbare kort var `display:flex` i **rad**-retning, så innholdet fikk bare sin naturlige bredde.

**Fiks:** innpakningen er `flex-direction: column` (`align-items: stretch`), så alle kort fyller full bredde. Gjelder alle redigerbare kort (wiggle-modus) i appen. Sjekk at ingen innpakning endrer bredden på kortet den pakker inn.
