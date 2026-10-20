# Kalender: eget bursdagsdesign på bursdagshendelser

Ønske 2026-10-20: «i kalender for bursdag henderlser vis en egen bursdag design på den.» (skjermbilde: `vedlegg/kalender-bursdag-for.png`)
Fasit: `Kalender App.dc.html` → hendelsesarket (`R.dt.bd`).

## Når
Hendelser i kalenderen **Bursdager**, eller med «bursdag» i tittelen. Navnet hentes fra tittelen («Patryk Mis har bursdag», «Emmas bursdag») og kobles til personen i Bursdager (`birthday_people`) for bilde og fødselsår.

## Arket
- I stedet for den vanlige tittelen: et **bursdagskort** i kalenderens farge (lilla for Bursdager), 22 pt hjørner, med statisk konfetti (16 biter, gul/hvit/mint/lyseblå/fersken).
- Venstre: avatar 64 pt (bilde fra Bursdager, ellers initialer) med hvit ring og liten festhatt. Midten: «BURSDAG» / «BURSDAG I DAG» (mono), navnet (Newsreader 30), «Fyller 21 · lørdag 14. november» (alder bare når år er kjent). Høyre: **25** + «dager igjen» / «I dag» / «2 dager siden».
- Tre knapper i kortet: **Gratuler** (hvit; åpner Meldinger/SMS med «Gratulerer med dagen, Patryk!», eller WhatsApp hvis det er valgt i Bursdager), **Gaveidé** (legger «Kjøp gave til Patryk før 14. november» i Huskeliste via Glimt, toast), **Bursdager ›** (åpner personen i Homelab → Bursdager).
- Under kortet som før: Når (hele dagen), påminnelse, «Slett hendelse». For hendelser fra Google: «Slett» fjerner bare i Kalender-visningen, med tekst om at bursdagen fortsatt ligger i Google Kontakter.
- På bursdagsdagen: samme jenka-tog med Glimt og trompet langs bunnen av kortet som i Bursdager (`claude-code-bursdag-jenka-glimt.md`).
- Også i liste-, dag- og ukevisning: bursdager vises med liten kake-/hatt-ikon og navnet uten «har bursdag».
