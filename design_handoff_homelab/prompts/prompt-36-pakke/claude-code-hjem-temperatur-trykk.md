# Hjem (web og app): trykk på temperaturen

Ønske 2026-10-19: «åpne vær når man trykker på temperatur, legg inn lang trykk hold trykk for å åpne yr». Vedlegg: `uploads/Screenshot 2026-10-19 at 21.53.56.png` (temperaturen «6° Klart · 21:53 ›» nede til høyre i toppbildet).
Fasit: `Homelab Papir Web.dc.html` → `wxTap`.

- **Kort trykk/klikk** åpner **Vær-siden** i appen (`page:'vaer'`, fullskjerm). Åpner ikke lenger yr.no.
- **Hold inne ≥ 550 ms** åpner **yr.no** for valgt sted (ny fane på web, in-app-nettleser eller Yr-appen i native).
  - Mens man holder, krymper temperaturen til 0,94 (0,18 s).
  - Lett haptikk når yr åpnes. Klikket etterpå ignoreres.
- Høyreklikk og iOS-«callout» er av på elementet.
- Lenken (`href` til yr) beholdes for tilgjengelighet. Cmd/ctrl-klikk åpner yr i ny fane.
- Tooltip på web: «Trykk: Vær · Hold inne: åpne Yr».
- Gjelder også temperaturen på Hjem i mobilappen og widgeten på hjemskjermen. I widgeten åpner trykk Vær, og Yr ligger i hurtigmenyen.
