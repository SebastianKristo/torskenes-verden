# Hjem: slå av skanneknappen i fanelinjen (mobil)

Ønske 2026-10-20: «la meg scru av scan knappen i navbar i hjem fanen i mobil.»
Fasit: `Mobil Papir App.dc.html` → Innstillinger → Tilpass → Fanelinje (og Innstillinger → Utseende → Fanelinje).

- Ny rad øverst i FANELINJE: **Skanneknapp på Hjem** · «Vises på Hjem» / «Skjult på Hjem · vises i de andre fanene» · På/Av.
- Av: den røde flytende skanneknappen (og «+»-varianten i linjen når Skanneknapp = «I linjen») skjules **bare på Hjem**. Finans, Mat, Sporing, Huskeliste osv. beholder sin knapp.
- Fanelinjen tar da full bredde på Hjem (ingen tom plass til høyre); animer bredden 0,24 s når du bytter fane.
- Skanning er fortsatt mulig fra Hjem via søkefeltet («skann kvittering») og ved å holde inne Finans-fanen.
- Lagres per enhet (`papir_scan_home`), standard På. Gjelder iOS og Android.

## Også i «Rediger fanelinjen» (2026-10-20)
Ønske: «legg til toggle for å vise scanne ikonet på hjem i editroen her.» (skjermbilder: `vedlegg/rediger-fanelinje-1.png`, `-2.png`)
- I arket **Hjem · Fanelinje → Rediger fanelinjen**, under stilvalgene (Tekst / Bare ikoner / Ikoner + navn): rad med rødt skanne-ikon, **«Skanneknapp på Hjem»**, undertekst «Vises på Hjem» / «Skjult på Hjem · vises i de andre fanene», og bryter.
- Samme innstilling som i Innstillinger → Tilpass → Fanelinje (`papir_scan_home`). Endres den ett sted, oppdateres begge.
- Forhåndsvisningen over skjuler den røde «+»-knappen når bryteren er av.
