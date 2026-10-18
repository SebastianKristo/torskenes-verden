# Prompt 19

Startet: 2026-10-18

- 2026-10-18: «gi meg protmen med engagn, ordene bakgrunn på nett og i app. vær skal vise været, planeter, planeter fra solsystemt jorda, månen, jupiter, mars. og bilder fra oslohttps://www.gettyimages.no/photos/oslo-drone»

---

## Prompt til Claude Code: Dynamiske bakgrunner (web + app)

Legg til en felles bakgrunnsfunksjon i Homelab/FinansHub, både web og mobilapp (iOS, Android, Fold). Brukeren velger bakgrunnstype i Innstillinger → Utseende → Bakgrunn.

### Bakgrunnstyper
1. **Vær** – bakgrunnen viser gjeldende vær på brukerens posisjon (fallback: Oslo).
   - Datakilde: MET Norway Locationforecast 2.0 (`api.met.no`, krever `User-Agent`-header). Hent hvert 30. min, cache lokalt.
   - Map `symbol_code` → bakgrunn: klart, delvis skyet, skyet, regn, snø, tåke, torden. Egen dag-/nattvariant (bruk `sunrise`-endepunktet).
   - Valgfri diskret animasjon (regn/snø-partikler), skru av ved «Reduser bevegelse» / batterisparing.
2. **Planeter** – roterende bilder av Jorda, Månen, Jupiter og Mars.
   - Bruk NASA-bilder (public domain): NASA Image and Video Library (`images-api.nasa.gov`) eller NASA Photojournal. Lagre kildekreditering.
   - Bruker kan velge én planet eller «Bytt automatisk» (daglig / hver time).
3. **Oslo** – bilder av Oslo fra drone/luften.
   - Referanse for stil: https://www.gettyimages.no/photos/oslo-drone
   - NB: Getty-bilder er lisensbelagt og kan ikke hentes/brukes uten kjøpt lisens. Bruk enten lisensierte Getty-bilder lastet opp manuelt, eller gratis kilder (Unsplash API med søk «Oslo aerial», Pexels). Vis fotografkreditering.
   - Støtt også egne opplastede bilder (mappe `backgrounds/oslo/`).

### Felles krav
- Én felles tjeneste `background_service` (backend) som returnerer `{type, image_url, credit, theme_hint: "light"|"dark"}`.
- Tekstlesbarhet: legg et halvtransparent lag (scrim) over bildet; bytt tekstfarge etter `theme_hint`. Kontrast min. 4.5:1.
- Papir-tema: bildet vises dempet/desaturert med papirtekstur over, så Papir-uttrykket beholdes.
- Bildene caches lokalt (offline-støtte), komprimeres til skjermstørrelse (WebP/AVIF på web, HEIC/WebP i app).
- Mobil: egen innstilling «Kun på Wi-Fi» for nedlasting av nye bilder.
- Valg synkroniseres mellom web og app via brukerprofil.
- Innstillingsmeny: forhåndsvisning av hver type, slider for uskarphet (0–20 px) og mørklegging (0–60 %).
