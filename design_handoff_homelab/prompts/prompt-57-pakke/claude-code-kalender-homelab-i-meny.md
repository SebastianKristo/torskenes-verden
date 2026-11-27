# Kalender (mobil): flytt «‹ Homelab» inn i hamburgermenyen

Ønske 2026-11-14: «ikke vis gå tilbake til homealb i header. hjem det heller bak hamburger menyen. med de andre tignene der.»
Vedlegg: `uploads/Screenshot 2026-11-14 at 14.47.10.png`, `uploads/Screenshot 2026-11-14 at 14.47.27.png`

## Endring
- Fjern hele «‹ Homelab»-linja øverst i Kalender (og skillelinja under). Headeren starter rett under statuslinjen med ☰ · overline «NESTE 6 UKER» · tittel · søk.
- Gjelder alle visninger (År, Mnd, Uke, 3 d, Dag, Liste) og både iOS og Android.
- Kalender åpnet fra Homelab-appen fungerer som før, bare uten tilbake-linja.

## I hamburgermenyen
- Øverst i menyen, før de andre punktene, en rad: **Homelab** med ikon `house` (SF Symbol `house`, Material `home`) og en liten «‹» foran eller «Tilbake til appen» som undertekst.
- Samme radstil som de andre punktene i menyen (høyde, ikonbrikke, skrift). Tynn skillelinje under raden, så kommer resten (kalendere, visninger, innstillinger) som i dag.
- Trykk: lukk menyen, og gå tilbake til Homelab med samme animasjon som «‹ Homelab» brukte (pop / slide ut til høyre).
- Raden vises bare når Kalender er åpnet fra Homelab. Er Kalender åpnet direkte (egen app, widget, varsel), skjul raden.

## Annet
- iOS: kant-sveip fra venstre (interactive pop) må fortsatt fungere for å gå tilbake til Homelab.
- Android: systemets tilbake-gest/-knapp går tilbake til Homelab som før (lukker menyen først hvis den er åpen).
- Fjern ekstra topp-padding som var satt av til tilbake-linja.

## Test
- Åpne Kalender fra Homelab → ingen «‹ Homelab» i headeren.
- ☰ → «Homelab» øverst → trykk → tilbake i Homelab der du var.
- Kant-sveip (iOS) / tilbake-gest (Android) → tilbake til Homelab.
- Åpne Kalender fra en widget → raden finnes ikke i menyen.
