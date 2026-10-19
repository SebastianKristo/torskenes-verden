# FEIL: appen krasjer på iOS når et kort flyttes i wiggle-modus + Sporing-widget med «bare når det er pakker»

Ønske 2026-10-19: «wiggle mode på iOS funker ikke, når jeg prøver å flytte et kort så krasjer appen, og legg til valg for sporing på hjem, la meg redigere det i wiggle mode, legg til vises bare når det er en pakke eller pakker å spore.»
Fasit: `Mobil Papir App.dc.html` → `edVals()` (`down/move/up`, `save(o,h,live)`, `h2o`, `h2Menu`).

## A. Krasj ved flytting (iOS)
Sannsynlige årsaker (prototypen hadde de samme svakhetene):
1. **Bytte-storm:** `pointermove` byttet rekkefølge for hvert move-event over et annet kort. Hver gang ble det skrevet til localStorage/disk, kjørt haptikk og rendret hele Hjem på nytt. Kortene som flyttes under fingeren, gir nye treff, så det blir en evig løkke. Det gir minne- og CPU-topp i WKWebView, og prosessen drepes (`WebContent` jetsam), som ser ut som en krasj. Native SwiftUI: `onMove` + `withAnimation` i `DragGesture.onChanged` uten throttling har samme effekt.
2. **Haptikk per event:** `UIImpactFeedbackGenerator` opprettet på nytt for hvert move.
3. **`elementFromPoint` under transform/scale** på kortet som dras kan returnere kortet selv eller `null` → `.closest` på `null`.
4. **ScrollView + drag samtidig:** `touch-action` var ikke `none`, så scroll og drag kjempet om samme berøring (`UIScrollView` + gesture conflict).

**Fiks:**
- Bytt bare når pekeren er innenfor **midtre 30 %** av mål-kortet, og **maks én gang per 140 ms** (`_edSw`).
- Under dra: oppdater bare state (`save(..., live=true)`). **Ingen** disk-skriving og ingen sterk haptikk. Lagre én gang ved slipp (`up` → `_edDirty`). Lett haptikk (4 ms) per bytte.
- `try/catch` rundt `elementFromPoint`. Ignorer skjulte og ukjente kort.
- I redigeringsmodus: `touch-action:none` på kortene og `setPointerCapture`. Scroll bare via auto-scroll når fingeren er nær topp/bunn (40 px, maks 12 px/frame).
- **Native (SwiftUI):** bruk `.draggable`/`.dropDestination` eller en egen `DragGesture` med `@GestureState`. Oppdater rekkefølgen bare når midtpunktet krysses, gjenbruk én `UIImpactFeedbackGenerator` (`prepare()` ved start), og lagre ved slutt. Aldri `List.onMove` inne i `ScrollView`.
- Legg inn crash-logging (Sentry/Crashlytics + `os_log` for `WebContent terminated`). Ved `webViewWebContentProcessDidTerminate`: last inn på nytt med lagret layout.
- Test: dra et kort fra topp til bunn og tilbake 10 ganger, raskt og sakte. Hold over et kort i 5 s (skal ikke bytte frem og tilbake). Bruk iPhone SE og 15 Pro.

## B. Sporing på Hjem: redigerbar i wiggle-modus
- Pakker-widgeten (`h2`) får **Rediger widget** midt på kortet i wiggle-modus (som de andre). Det åpner et lite panel:
  - **Vis bare når det er pakker** (bryter, **på** som standard). Status under: «2 pakker på vei nå» / «Ingen pakker nå · widgeten er skjult».
  - **Pakker som vises:** 1 / 2 / 3.
  - **Ferdig**.
- **Med «vis bare når det er pakker» på og 0 aktive pakker** (status 1–3: registrert, på vei, klar for henting): widgeten skjules helt på Hjem utenfor redigeringsmodus, uten tomt felt. I wiggle-modus vises den dempet (gråtone, 65 %) med merket «Skjult når ingen pakker», så man kan endre den.
- Kommer en ny pakke, dukker widgeten opp igjen på sin plass i rekkefølgen, med en myk inn-animasjon.
- Lagring: `papir_wopt.h2 = {auto, n}` (per bruker og enhet, synkes med layout).
