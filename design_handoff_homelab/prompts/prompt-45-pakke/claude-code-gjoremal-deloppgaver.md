# Gjøremål: deloppgaver rett i lista

Ønske 2026-10-21: «la meg legge til gjøremål i en gjøremål» (vedlegg `uploads/Screenshot 2026-10-21 at 13.44.42.png`)
Fasit: `Huskeliste.dc.html`.

- Hver oppgave i lista har en knapp **↳+** (Legg til deloppgave) ved ✕. Trykk → et felt «Ny deloppgave …» åpnes rett under oppgaven med tastaturet oppe. Enter / «Legg til» legger den til, og feltet blir stående for neste.
- Deloppgavene vises **innrykket under oppgaven** (38 pt) med egen avkrysningsboks i listens farge, tekst og ✕. Avkrysset: gjennomstreket og dempet.
- Metalinja viser fremdrift «2/3». Deloppgaver kan også endres i detaljarket (Deloppgaver) som før.
- Alle deloppgaver krysset av → spør «Fullfør «X» også?» (Fullfør / Ikke nå). Fullføres hovedoppgaven, krysses resten av.
- Glimt: «husk å pakke til hytta: sovepose, hodelykt, mat» → én oppgave med tre deloppgaver.
- Synk: deloppgaver lagres som `subs:[{id,n,done}]` på oppgaven. Home Assistant To-do har ikke underpunkter, så de sendes som beskrivelse («☐ sovepose»).
- Native: `DisclosureGroup`/egen rad i `List` (SwiftUI), `LazyColumn`-rader med innrykk (Compose). Sveip på deloppgave = slett.

- Web (2026-10-21): samme ↳+ og innrykkede deloppgaver i web-lista.
