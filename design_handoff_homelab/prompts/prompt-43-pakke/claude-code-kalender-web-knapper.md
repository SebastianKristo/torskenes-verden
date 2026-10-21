# Kalender web + Mac: «+ Ny hendelse» i rødt og Glimt-orben på «Skriv time»

Ønske 2026-10-21: «gi ny hendelse rød farge og glimt ikonet ved skriv time. dette er for web og mac app.» (vedlegg `uploads/Screenshot 2026-10-21 at 11.20.22.png`, `… 11.20.45.png`)
Fasit: `Kalender.dc.html` (`variant="web"`, topplinja). Mac-appen bruker samme web-kalender (`Kalender Mac.dc.html`), så det gjelder begge.

- **+ Ny hendelse:** bakgrunn `lab` (`#b23a2a`, mørkt tema `#cf5540`), hvit tekst, ingen kant, 40 px høy, 16 px sidepolstring. Hover: 8 % mørkere. Ikke svart.
- **Skriv time:** bytt «✦» med **Glimt-orben** (samme som i «GLIMT · DAGEN DIN»: konisk fargering #b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6, kremfarget innside med rød firetakket stjerne), 20 px, 8 px luft til teksten. Lys pille (`card`, kant `line`) som før. Orben roterer sakte (4 s), raskere mens Glimt tolker teksten.
- Mac: samme i vinduets topplinje. Menylinje-menyen har allerede rød «+».
