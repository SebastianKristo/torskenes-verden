# Live Activities (iOS) + Live Updates (Android)

Fasit: `Live Activities.dc.html` (klikkbar demo + galleri). Følger Apples HIG for Live Activities.

## Aktiviteter
| Id | Tittel / undertittel | Kompakt høyre | Minimal | Knapper (App Intents) |
|---|---|---|---|---|
| Nedlastinger (NRK/Sonarr/Radarr) | Serie · SxEy · kilde · N i kø | «62 %» | ring = fremdrift | Pause / Fortsett |
| Backup | «Backup til NAS» · mappe · antall filer | «41 %» | ring | Pause / Fortsett |
| Spilles nå (Plex/Jellyfin) | Tittel · episode · person · enhet | posisjon «24:10» | ring = posisjon | Pause / Spill av, Stopp |
| Neste avtale (Kalender) | Tittel · klokkeslett · sted | «25 min» | ring = tid igjen av siste time | Vis rute, Utsett 5 min |
| Pakkesporing | Avsender · status · stopp unna | «4 stopp» / «Levert» | ring = steg | ingen |

Farger (aksent på mørk bakgrunn): nedlasting `#5ac8fa`, backup `#30d158`, spilles nå `#ffb340`, kalender `#ff6a4d`, pakke `#bf8cff`. Ikonflis bak symbol = aksent med 18 % opasitet.

## Visninger (ActivityKit / WidgetKit)
- **Låseskjerm / varsel-banner:** `activityBackgroundTint(Color(white:0.11).opacity(0.86))`, radius 24, padding 14×16. Rad: ikonflis 40 pt · tittel (17 semibold) + undertittel (13, sekundær) · verdi (22 semibold, aksent, `.monospacedDigit()`). Under: fremdriftslinje 6 pt (pakke: 4 segmenter), meta-rad, knapper 40 pt høye.
- **Dynamic Island kompakt:** leading = SF Symbol i aksent, trailing = én verdi i aksent. Ingen ekstra luft rundt kameraet.
- **Minimal:** fremdriftsring (`ProgressView(.circular)` med aksent) eller symbol. Brukes når to aktiviteter kjører.
- **Utvidet:** bredde = skjermbredde − 2×12 pt (aldri bredere enn skjermen). Leading = ikonflis 44 pt, center = tittel/undertittel, trailing = stor verdi (26 pt), bottom = linje + meta + knapper. Maks 160 pt høy.
- **StandBy:** samme låseskjerm-visning, systemet skalerer. Sørg for at verdien er stor (`.font(.system(size: 64, weight: .semibold))` i `isLuminanceReduced`-vennlig utgave) og at bakgrunnen er svart.
- Tidsverdier med `Text(timerInterval:)` / `ProgressView(timerInterval:)` så de tikker uten push.

## Oppdatering
- Push-to-start + oppdateringer via APNs (`apns-push-type: liveactivity`) fra serveren. Maks ~1 oppdatering per 5 s for nedlasting/backup; resten ved hendelse.
- Avslutt når ferdig (`.end(dismissalPolicy: .after(+15 min))`). Pakke: avslutt 30 min etter «Levert». Kalender: avslutt ved starttid.
- Innstillinger → Varsler → Live Activities: bryter per aktivitet.

## Android 16 Live Updates
- `Notification.ProgressStyle` med `setProgressTrackerIcon` (aksent-sirkel med symbol), segmenter for pakke.
- `setRequestPromotedOngoing(true)` + `setShortCriticalText("62 %")` → statuslinje-chip i aksentfarge.
- Handlinger som tekstknapper i aksentfarge (Pause, Stopp, Vis rute).
- Eldre Android: vanlig ongoing-varsel med progress.

## Ferdig når
- Alle fem aktivitetene kan startes fra serveren og vises i alle visningene over, både på iPhone og Android.
- Knappene virker uten å åpne appen.

## Fiks: utvidet Dynamic Island for NRK-nedlasting (2026-11-14)
Ønske: «feil med live actiivty på ios.» Vedlegg: `vedlegg/la-nrk-feil-1.png`, `vedlegg/la-nrk-feil-2.png`.

Feil som vises:
1. **Pause-knappen er kuttet nederst.** Innholdet er høyere enn 160 pt, og iOS klipper resten.
2. **Ikonflisen og tittelen står ikke på linje.** Flisen ligger høyt oppe i hjørnet, og tittelen starter lavere.
3. **«0 %» mens den komprimerer.** Prosenten gjelder nedlastingen, men teksten sier «Komprimerer». Tallet og teksten viser ikke samme fase.
4. **Meta-raden gjentar tittelen** («Komprimerer Dagsrevyen - I dag · Frykter spredni…»).
5. Bak øya stikker en annen visning (låseskjerm-banneret) fram til høyre («…an…»). Det skal bare være én visning om gangen.

Rett slik:
- **Høyde:** bottom-regionen skal bare ha linje (4 pt) + én meta-linje (13 pt, `lineLimit(1)`) + knapper i én rad, 34 pt høye. Mål: totalt ≤ 150 pt. Test med Dynamic Type XL.
- **Knapper:** `Button(intent:)` med `.buttonStyle(.borderedProminent)`, `.controlSize(.small)`, `.tint(.white.opacity(0.14))`, 34 pt. Ikon + tekst («⏸ Pause»). Hvis det er to knapper: side om side, aldri stablet.
- **Leading:** ikonflis 36 pt. Flisen og tittelen sentreres vertikalt mot hverandre (`HStack(alignment: .center)`). Tittelen går i center-regionen, ikke under flisen.
- **Faser** i `ContentState.phase`: `queued | downloading | muxing | done | failed`.
  - `downloading`: «62 %» + linje = fremdrift. Meta: «12,4 av 20 MB · 2 i kø».
  - `muxing` (komprimerer/setter sammen): ingen prosent. Trailing = `ProgressView()` (spinner) eller «Komprimerer». Linjen er ubestemt (`ProgressView(timerInterval:)` med estimert slutt, eller animert stripe). Meta: «Komprimerer · ca. 1 min».
  - `done`: «✓ Ferdig», knapp «Spill av». Avsluttes etter 15 min.
  - `failed`: rød «Feilet», knapp «Prøv igjen».
- **Tekst:** tittel = programnavn («Dagsrevyen»), undertittel = «NRK · I dag 19:00». Meta-raden gjentar aldri tittelen.
- **Låseskjerm-visningen** følger samme oppsett, men knappene får full bredde. Den vises ikke samtidig med utvidet øy.

Ferdig når: utvidet øy for NRK-nedlasting viser Pause-knappen helt i alle faser, med standard og XL tekststørrelse, på iPhone 15 Pro og 16 Pro Max.
