# Kalender v2: fullverdig kalender

Fasit: `Kalender.dc.html` (gammel versjon: `Kalender v1.dc.html`). Mobil åpner den i fullskjerm uten toppbilde og uten appens fanelinje; web viser den under en lav toppstripe.

## Feilen: timer vises ikke
Bare prøvene vises fordi timeplanen i skolens iCal ligger som **gjentakende hendelser (RRULE)**. Bruk `icalendar` + `recurring_ical_events` (Python) og ekspander `RRULE`, `EXDATE`, `RDATE` og `RECURRENCE-ID` for perioden som vises. Bruk `Europe/Oslo` (VTIMEZONE) og sammenlign i lokal tid, ikke UTC. Test: «neste time om 1 time» skal vises i NESTE-stripen.

## Oppsett
- Topp: måned + år (trykk = minikalender og kalenderfilter), søk, I dag (ikon med dato). Web: ‹ › og Dag/3 dager/Uke/Måned/Liste + «+ Ny hendelse».
- **NESTE / NÅ-stripe** øverst: neste time eller hendelse med «om 58 min» / «25 min igjen».
- **Egen fanelinje** (mobil): Dag · 3 dager · Uke · Måned · Liste, og rund + til høyre.
- **Dag/3 dager/Uke:** 00–24 med rutenett, ruller til nå ved åpning, rød nålinje, «HELE»-rad for heldags og frister, overlappende hendelser side om side. Trykk på tom plass = ny hendelse på den halvtimen.
- **Måned:** 6 uker, hendelser som brikker, timer samlet som «4 timer». Trykk dag = dagsvisning.
- **Liste:** 45 dager fremover gruppert per dag.
- **Sveip** venstre/høyre bytter periode. Web-hurtigtaster: ← → · T · D · W · M · L · N · / · Esc.
- **Ny/rediger:** tittel, hele dagen, dato, fra/til (native velgere), sted, kalender (Privat/Familie = Google), gjenta (ingen/dag/uke/måned), varsel. Skrives til Google Calendar API.
- **Detaljer:** sted, lærer, kalender, merknad, varsel, Vis rom på kart, Kopier til Privat; egne hendelser kan redigeres/slettes. Skolens hendelser er skrivebeskyttet.
- **Kalendere:** Timeplan, Prøver og frister, Skole (iCal), Privat, Familie (Google), Bursdager. Av/på i minikalenderen (mobil) og sidepanelet (web).
- Widgetene nederst på siden er fjernet. Hjem-widgeten (`mode="widget"`) er uendret.
