# Hjemlys (tidligere «Hjemme trygt»): Live Activities på iPhone og Live Updates på Android

Ønsker 2026-10-20: «er det mulig å bygge inn en sånn funkjson i familie» (+ skjema) og «for den hjemme trygt, funksjonen gi støtet for live action og live activitites på iphone og android. gi også funkjsonen et passende men stilig navn.»
Fasit: `Hjemme trygt Varianter.dc.html` → **2a** (iPhone), **2b** (Android/Samsung), og flyten i 1a–1c (ikke valgt ennå) + «Felles».

## Navn
**Hjemlys** – «Et lite lys som står på til du er hjemme.» Ikonet er en varm, glødende prikk (`#FFE7A3 → #F2A93B`). Grønn ring = på vei, rød = sen, gul glød = hjemme.

## Funksjonen (fra skjemaet)
- Avsluttes **når jeg er hjemme** (geofence 60 m rundt hjemmeadressen, eller hjemme-Wi-Fi). Ingen andre mål.
- **Alle i husstanden** kan starte og motta, begge veier.
- Ved forsinkelse deles: **siste posisjon, ruten, batteri og dekning, siste opplåsing, hvem du var med (kalender)**. Ingenting deles før du er sen.
- Forløp: forventet tid fra Ruter/veibeskrivelse → oppdateres underveis → «Alt OK?» ved passert tid eller lang stillstand → svarer du ikke innen valgt ventetid (5/15/30 min) får familien varsel → hjemme = «Sebastian er hjemme 23:36», deling stopper.
- **Glimt foreslår** å starte (etter kino/fest i kalenderen, sent på kvelden, nattbuss), og kan foreslå at andre i familien starter.
- Finnes på iPhone, Android, web (Familie-kortet), klokke, Hjem-widget og låseskjerm.

## iPhone · Live Activity (ActivityKit, iOS 17+)
- Startes når Hjemlys starter (også fra Glimt-varselet via App Intent). `ActivityAttributes`: mål, mottakere. `ContentState`: `eta`, `progress`, `leg` (gå/trikk 19/…), `state` (`onTheWay|late|home`), `lateMinutes`.
- **Dynamic Island:**
  - Kompakt: glødende prikk + «Hjem» til venstre, «8 min» (grønn) til høyre.
  - Minimal: ring med fremdrift rundt prikken.
  - Utvidet: «Hjemlys», mottakere, tid (stor), fremdriftslinje med start/etappe/hjem, knapper «+ 10 min» og «Jeg er hjemme» (App Intents, virker uten å åpne appen).
- **Låseskjerm/varselsenter:** samme innhold i et kort. Knappene virker uten å låse opp.
- **Tilstander:** sen → rød («15 min over · familien har fått beskjed», knapper «Alt OK» / «+ 15 min»), hjemme → gul glød «Hjemme 23:36 ✓», avsluttes (`.end(dismissalPolicy: .after(5 min))`).
- **StandBy** og **Apple Watch Smart Stack** bruker samme Live Activity automatisk; lag egne `supplementalActivityFamilies([.small])`-oppsett.
- Oppdateres lokalt fra posisjon når appen kjører i bakgrunnen, og via **push (APNs liveactivity-token)** fra serveren når ruten eller tiden endres.
- Mottakere kan starte «Følg Sebastian hjem» som egen Live Activity (push-to-start, iOS 17.2+).
- Kritisk varsel ved forsinkelse krever Apple-tillatelse (Critical Alerts entitlement). Uten den: tidsfølsomt varsel (`.timeSensitive`).

## Android · Live Update (Android 16+) med reserve
- **Android 16:** «promoted ongoing notification» med `Notification.ProgressStyle`: segmenter per etappe (gå · trikk 19 · gå), punkt for hvor du er, «8 min» som `shortCriticalText` → vises som **brikke i statuslinja** og øverst i varselskuffen. Knapper «+ 10 min» og «Jeg er hjemme».
- **Android 12–15:** vanlig pågående varsel (`setOngoing`, `setProgress`, `CATEGORY_NAVIGATION`) med samme tekst og knapper.
- **Samsung (One UI 7+):** samme varsel vises i **Now Bar** på låseskjermen (ring + «Hjem om 8 min» + «Hjemme»). Bruk Samsungs Live Notification/Now Bar-støtte der den finnes; ellers faller det tilbake til det pågående varselet.
- **Wear OS / Galaxy Watch:** `OngoingActivity` med ring, minutter og «Hjemme»-knapp.
- Tilstandsfarger på brikken: grønn (på vei), rød «! 15 min over», gul «✓ Hjemme».
- Mottakere: eget pågående varsel «Følg Sebastian hjem» og egen **varselkanal med høy viktighet** for «sen» (kan overstyre Ikke forstyrr hvis brukeren tillater det).
- Foreground service type `location` mens Hjemlys er aktivt; stoppes når du er hjemme.

## Server
- `POST /api/hjemlys/start {eta, mode, recipients}` → `hjemlys_sessions` (`user_id, eta, state, wait_min, started_at, ended_at`).
- `PATCH …/{id}` for ny tid og posisjon (maks hvert 30. s / 50 m). Push til mottakere og til Live Activity-/Live Update-tokens.
- Jobb hvert minutt: passert `eta + wait_min` uten svar → `state=late`, send varsel med delingsdataene. Hjemme (geofence/Wi-Fi) → `state=home`, varsel «er hjemme», slett posisjonshistorikk for økta etter 24 t.
- Kalender: hvem du var med = deltakere i hendelsen som slutter rett før start.

## Personvern
- Ingenting deles før du er sen. Etter 24 t slettes ruten. Alle i husstanden ser hvem som har Hjemlys aktivt, men ikke posisjonen før det haster.
