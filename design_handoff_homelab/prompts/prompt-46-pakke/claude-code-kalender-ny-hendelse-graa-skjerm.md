# Kalender: grå blank skjerm ved «+» (ny hendelse)

## Symptom
I Kalender-appen (mobil, sikkert i uke-visning, men også andre visninger) blir hele skjermen grå/blank når brukeren trykker «+» for ny hendelse. Ingen ark/dialog vises, appen må lukkes.

## Sannsynlige rotårsaker (sjekk i denne rekkefølgen)
1. **Modal-scrim rendres, men innholdet krasjer.** Grå skjerm = bakgrunnsdimming vises, men skjema-komponenten kaster under render. Se logg (Flutter: `Another exception was thrown` / React: error boundary, Swift: preview-crash). Typiske årsaker:
   - Startdato/-tid utledes fra valgt dag/tidsluke i uke-visning; i uke-visning er `selectedDate` ofte `null` eller en uke-range i stedet for en dato → `null`-dereferanse / ugyldig `DateTime`.
   - Standardkalender (Google, se instruks om default-kalender) er ikke lastet ennå → `calendars.first` på tom liste / `defaultCalendarId` peker på kalender som ikke finnes.
   - Glimt-forslag-feltet (nytt i prompt 46) initieres med tom modell-respons.
2. **Layout-feil i bunnark**: `showModalBottomSheet`/sheet med ubegrenset høyde inne i scroll (uke-grid) → `RenderBox was not laid out` gir grå skjerm i release-bygg (rød i debug).
3. **Navigasjon til feil rute**: «+» pusher en rute som ikke er registrert for alle visninger → tom side.

## Krav til fiks
- «+» skal åpne Ny hendelse fra **alle** visninger (dag, uke, måned, agenda, widget).
- Startverdier: hvis en tidsluke er valgt → bruk den. Ellers: valgt dag (uke-visning: første dag i synlig uke hvis i dag ikke er i uken, ellers i dag) kl. neste hele time, varighet 1 t.
- Kalender: standardkalender (Google default). Hvis kalenderlisten ikke er lastet: vis skjema med en lastetilstand i kalender-velgeren, ikke krasj.
- Legg en error boundary rundt skjemaet: ved feil vis «Kunne ikke åpne ny hendelse» + «Prøv igjen», og logg stacktrace. Aldri bare grå scrim.
- Scrim skal aldri vises uten innhold; lukk scrim hvis innholdet feiler.

## Test
- Trykk «+» i dag-, uke-, måned- og agenda-visning, både med og uten valgt tidsluke, før og etter at kalenderne er lastet (kald start, flymodus).
- Test i release-bygg (grå skjerm vises kun der).
- iOS, Android (inkl. Fold), web, Mac.
