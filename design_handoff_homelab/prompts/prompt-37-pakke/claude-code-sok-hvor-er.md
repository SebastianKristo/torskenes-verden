# Søk/Glimt: «Hvor er Ingrid?» svarer med posisjon

Ønske 2026-10-19: «la meg spørre om ting som hvor er den personen. ta da posisjonen og si hvor den er.» Vedlegg: `uploads/Screenshot 2026-10-19 at 23.54.19.png` (søkefeltet på Hjem).
Fasit: `Mobil Papir App.dc.html` → `whereIs()` (kalles først i `hsAsk`, før navigasjon «hvor er → Familie»).

- **Gjenkjenner:**
  - «hvor er Ingrid», «kor er Pål», «hvor befinner/holder seg Kari»
  - «er Pål på skolen / hjemme / på jobb»
  - «posisjonen til Ingrid»
  - «where is …»
  - «hvor er jeg» gir egen posisjon.
- **Svar** i søkekortet: «**Ingrid** er **på vei til fots ved Bislett** (Bislett, Oslo, 1,2 km fra deg). Oppdatert 2 min siden · batteri 61 %.» Kilde: «Familie · posisjon». Kortet har **Vis på kart ›** (åpner Familie med personen valgt).
- **Data** (ekte app): siste posisjon fra Familie-modulen (`/api/family/locations`). Bruk:
  - **sone** hvis personen er i en kjent sone (Hjem, Skole, Jobb, Mormor …)
  - ellers **omvendt geokoding** (strøk + by, Kartverket/Nominatim)
  - aktivitet fra Health/Health Connect (går, sykler, i bil)
  - avstand fra deg, alder på posisjonen og batteri
- **Personvern:** svar bare om personer som deler posisjon med deg (samme regler som Familie-kartet). Ellers: «Pål deler ikke posisjon med deg.» Er posisjonen eldre enn 1 t: «Sist sett for 3 t siden ved …».
- Ukjent navn: «Jeg finner ikke X i Familie. Personer med deling: Ingrid, Pål og Kari.»
- Gjelder også Glimt-chat, Glimt Brief («Pål er på skolen») og Homelab-web-søket. Ved push-svar (appen i bakgrunnen) sendes svaret som varsel.
