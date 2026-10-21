# Chat (mobil): send-knappen når feltet er tomt

Ønske 2026-10-21: «i chat på mobil når ingen melding kom med en annen farge på send knappen» (vedlegg `uploads/Screenshot 2026-10-21 at 11.25.39.png`, `… 11.25.53.png`)
Fasit: `Mobil Papir App.dc.html` → Chat → skrivefeltet (`ch.sendBg / sendFg / sendSh`).

- I dag: tom melding gir en grå sirkel med nesten usynlig pil (svart knapp med 35 % opasitet). Det ser ut som en feil.
- **Tom:** lys knapp: bakgrunn `line` blandet med `card` (70/30), pil i `mut` (godt synlig), tynn innvendig kant 1,5 pt `line`. Ingen opasitet på hele knappen. Ikke trykkbar (`disabled`, aria-disabled).
- **Tekst skrevet:** `ink` bakgrunn, `bg` pil som før. Bytt med 150 ms overgang.
- Mørkt tema/nøytral: samme regel med temaets farger.
- Gjelder iOS, Android og web-chat.

## Knappen faller ut (2026-10-21)
Ønske: «nå faller knappen litt ut» (vedlegg `uploads/Screenshot 2026-10-21 at 11.27.07.png`)
- Raden under skrivefeltet: 4 pt luft til høyre og 2 pt under, så send-knappen og den tynne kanten står helt inne i kortet.
- Mikrofon og Send er 38 pt (samme som + og pillene), på linje.
- «Nettsøk» og «Mine data» kan krympe (`flex: 0 1 auto; min-width: 0`) på smale skjermer i stedet for å skyve knappene ut. Raden brytes aldri ut over kanten.
