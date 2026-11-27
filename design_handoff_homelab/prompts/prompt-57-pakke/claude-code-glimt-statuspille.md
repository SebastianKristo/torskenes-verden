# Fiks: «Glimt kontrollerer kvitteringen …» kolliderer med skann-knappen

## Problem
- Statuspillen nederst overlapper den røde skann-knappen (FAB) til høyre.
- Den bruker en generisk spinner i stedet for Glimt-logoen.
- Skjermbilder: `uploads/IMG_1581.PNG`, `uploads/Screenshot 2026-11-14 at 14.37.13.png`, `uploads/Screenshot 2026-11-14 at 14.37.22.png`.

## Ny plassering
- Flytt pillen **til toppen**, sentrert rett under statuslinjen / Dynamic Island (safe area top + 8 pt), over hero-bildet.
- Den skal aldri dele plass med FAB eller tab-baren. Gjelder alle steder denne typen Glimt-status vises (kvittering, skann, import).
- Inn: glir ned fra toppen + fade (0,25 s, spring). Ut: glir opp igjen.
- Bredde: tilpasser seg teksten, maks skjermbredde − 32 pt. Teksten avkortes med «…» på én linje.
- Trykk på pillen åpner kvitteringen som kontrolleres. Sveip opp skjuler den (jobben fortsetter).

## Utseende
- Samme mørke pille som i dag (bakgrunn #1A1916, hvit tekst, høyde 40 pt, radius full).
- **Venstre:** Glimt-logoen (regnbuering med rød stjerne), 22 pt, i stedet for spinneren.
  - Mens Glimt jobber: regnbueringen roterer sakte (1 omdreining / 1,6 s, lineær). Stjernen står stille.
  - Ferdig: rotasjonen stopper, teksten byttes til «Kvittering lagret ✓» i 1,5 s, så skjules pillen.
  - Feil: ringen stopper, teksten blir «Glimt fikk ikke lest kvitteringen», pillen blir stående til den trykkes eller sveipes bort.
- Respekter «Reduser bevegelse»: ingen rotasjon, bruk en svak puls (opasitet 0,6–1) på ringen.

## Plattform
- **iOS:** overlay i root-view (`.overlay(alignment: .top)`), ikke i den enkelte skjermen, så den overlever navigasjon.
- **Android:** samme, øverst i `Scaffold` over innholdet, under statuslinjen (`WindowInsets.statusBars`).
- Bruk samme Glimt-logo-asset som i varsler/QR-innlogging.

## Test
- Ta bilde av kvittering → pillen vises øverst med roterende Glimt-ring, ingen overlapp med FAB eller tab-bar.
- Bytt fane mens den jobber → pillen blir stående.
- Lang tekst / liten skjerm (iPhone SE) → én linje, avkortet.
- «Reduser bevegelse» på → puls i stedet for rotasjon.
