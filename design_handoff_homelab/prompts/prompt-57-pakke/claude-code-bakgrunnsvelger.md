# Bakgrunnsvelgeren (Hjem, mobil)

Ønske (2026-11-27): «ordene denne dropdwon menyen, gjør den bedre og pener og at den går ut av profil der den blir aktivert fra»
Vedlegg: `uploads/Screenshot 2026-11-27 at 17.57.39.png`.
Fasit: `Homelab.dc.html`. Trykk på «Vær nå ▾» øverst på Hjem.

## Plassering og animasjon
- Menyen henger rett under knappen «Vær nå ▾» (ikke over hilsenen). En liten pil peker opp mot knappen.
- Den åpner fra knappen: `transform-origin` = midt på knappen, skala .6→1, opasitet 0→1, 260 ms, `cubic-bezier(.2,.9,.25,1.12)`. Den lukkes motsatt vei.
- Bredde `min(320, skjerm − 32)`, radius 24, padding 12, skygge `0 24px 50px -12px rgba(0,0,0,.5)`.

## Innhold
- Overskrift: «BAKGRUNN» (mono, 10,5, sperret) til venstre og «Oppdateres automatisk» til høyre.
- **Rutenett 2×2** med store forhåndsvisninger (78 pt høye, radius 14). Navn under (13,5 fet) og én til to linjer forklaring.
  Rekkefølge: **Vær nå**, **Planeter**, **Oslo**, **Gradient** (automatiske først). «Nåværende» heter nå «Gradient».
- Valgt: dobbel ring (pop-farge + blekk) rundt bildet og grønt ✓-merke øverst til høyre. Hvis bildet ikke lastet: rødt «!».
- Skillelinje, deretter to rader: «Eget bilde» (stiplet +) og «Google Photos-album» (som før, med lenkeskjemaet).
- Lukkes ved trykk utenfor eller når du velger noe.

Ferdig når: menyen vokser ut fra «Vær nå ▾», står rett under den, og viser de fire bakgrunnene som bilderuter.
