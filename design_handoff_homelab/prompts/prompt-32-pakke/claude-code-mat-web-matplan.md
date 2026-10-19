# Web: Mat bruker den nye Mat-modulen (Matplan 2a)

Fasit: `Homelab Papir Web.dc.html` → `isMat` laster nå `Matplan.dc.html` (`embedded=true`). Det er samme modul som er valgt design for Mat (variant **2a** i `Mat Varianter.dc.html`). Det gamle innebygde Mat-oppsettet på web (lime «I dag»-kort, uke-liste, mapper) er fjernet.

- Web skal vise **nøyaktig samme Mat** som Matplan: toppen «UKE 42 · 12.–18. OKT», «Ny plan hver søndag», «Abonner i kalender», «✦ Ny ukeplan med AI», ukeplan, mapper, oppskrifter, skann/importer fra lenke, handleliste osv.
- Fargene i modulen beholdes: mørk varm grunn `#15140F`, kort `#1D1C16`, kanter `#2E2C24`, Geist / Instrument Serif. Kortet ligger i papirsiden under hero, med radius 28.
- Tittelen «Mat» inni modulen skjules (`embedded`), fordi web-siden har egen hero-tittel.
- Én kilde: web og app henter samme data (`hl_matplan` / `/api/mat`). Ikke lag egen web-variant. Endringer i Matplan skal vises begge steder.
