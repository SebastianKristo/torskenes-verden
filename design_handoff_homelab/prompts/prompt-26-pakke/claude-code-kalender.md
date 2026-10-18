# Til Claude Code: Kalender med skoletimeplan (web, iOS, Android)

Fasit: `design/Kalender.dc.html` (`variant="mobile"` under Mer → Kalender, `variant="web"` som fanen Kalender). Papir-tokens og samme utseende på iOS og Android.

## Data
- **Skolens timeplan:** iCal-URL (Innstillinger → Kalendere → Skole, felt `cal_ics`). Hentes i backend hver time (`GET /api/kalender?from=&to=`), og gjentakelser utvides.
  - Fag fra `SUMMARY`, rom fra `LOCATION`, lærer fra `DESCRIPTION`/`ORGANIZER`.
- **Prøver og frister:** hendelser med «prøve», «heldag», «muntlig», «innlevering» eller «frist» i tittelen (eller kategori) får type `prove` / `innl`. Canvas-kalender (iCal) kan legges til som egen kilde.
- **Planleggingsdag / fri:** heldagshendelser med «fri» eller «planleggingsdag» skjuler timene den dagen.
- **Bursdager:** fra `birthdays` (Bursdager-modulen). **Google Kalender** (valgfritt) vises som «Skole»/«Familie».
- **Fagfarger:** fast palett per fag, valgfritt i Innstillinger. Prøver vises alltid i `lab`-rød.

## Visninger (som designet)
1. **Nå-kort:** NÅ (time, rom, lærer, min igjen og fremdrift), ellers NESTE TIME eller NESTE SKOLEDAG, og neste prøve. Oppdateres hvert minutt.
2. **Prøver og frister:** kommende, med nedtelling (rød ≤ 7 dager).
3. **Uke:** Man–Fre, 08–16, timehøyde 48 pt (web 58).
   - Blokker: fargestripe og 15 % fagfarge, prøver i hel rød.
   - Rad for hele dagen, nå-linje og ISO-ukenummer.
   - Helg → neste uke.
   - Sveip til venstre/høyre bytter uke.
4. **Måned:** 7 × 6 med prikker. Trykk på en dag viser listen under. Sveip bytter måned.
5. **Agenda:** 21 dager fremover, gruppert per dag. Tomme dager hoppes over.
6. **Detaljkort:** rom, lærer, fag, merknad, påminnelse og MazeMap-lenke.
   - Standard påminnelse er dagen før for prøver og frister, og ingen for timer.
   - Påminnelser er lokale varsler (iOS `UNCalendarNotificationTrigger`, Android `AlarmManager`/WorkManager).
7. **Filter:** Timeplan, Prøver og frister, Bursdager, Skole. Lagres per bruker.

## Widgets: iOS, Android og Samsung, tre størrelser
Fasit: seksjonen «WIDGETS PÅ TELEFONEN» i `Kalender.dc.html`.

| | Liten | Medium | Stor |
|---|---|---|---|
| **iOS (WidgetKit)** | `systemSmall` 158 × 158 pt, radius 24 | `systemMedium` 338 × 158 | `systemLarge` 338 × 354 |
| **Android (Glance, Material You)** | 2 × 2 (≈ 170 × 170 dp), radius 28 | 4 × 2 (≈ 350 × 170) | 4 × 4 (≈ 350 × 350) |
| **Samsung One UI** | 2 × 2 = **134 × 155 dp**, radius 20 (som Samsung Vær, se `claude-code-samsung-widgets.md`) | 4 × 2 ≈ 296 × 155 | 4 × 4 ≈ 296 × 330 |

**Innhold:**
- **Liten:** «NÅ», «NESTE TIME» eller ukedag (rød), klokkeslett stort (slutt hvis NÅ, start ellers), fargestripe, fag, rom og lærer, og «34 min igjen» eller «om 1 t 5 min».
- **Medium:** venstre del som liten. Høyre del har «I dag · mandag 19. okt» og de tre neste timene (tid, fargestripe, kortnavn, rom).
- **Stor:** «I dag · mandag 19. oktober · 4 timer», alle dagens timer (passerte er dempet til 45 %), skillelinje, og «PRØVER OG FRISTER» med de to neste og nedtelling (rød ≤ 7 dager).
- Etter siste time viser alle størrelser neste skoledag.
- Samme tidsrutenett som appen, og fagfarger fra Kalender.

**Oppdatering:**
- iOS: timeline med én oppføring ved start og slutt av hver time, pluss midnatt.
- Android og Samsung: `WorkManager` ved samme tidspunkter. Eksakte alarmer brukes ikke, så oppdateringen kan komme ± 1 min.
- Data deles via App Group / DataStore. Trykk åpner `homelab://kalender`, og trykk på en time åpner detaljkortet.
- Mørk modus: iOS `containerBackground` mørk, Android dynamiske farger mørk, Samsung mørk flate `#1c1c1e`.
- **Hjem i appen (valgfritt):** samme innhold som medium.

## Test
- Mandag 08:30: NÅ viser Matematikk R2 med fremdrift.
- Søndag: NESTE SKOLEDAG mandag, og uke-visningen viser neste uke.
- 30.10 (planleggingsdag): ingen timer.
- 22.10 (torsdag): Prøve i engelsk erstatter engelsktimen 10:00. Foreldremøte 18:00 vises i hele dagen-raden. Hendelser utenfor 08–16 skal ikke falle utenfor rutenettet. Prøver og frister sorteres etter dato.
- iPhone og Android skal se like ut, lyst og mørkt tema.
