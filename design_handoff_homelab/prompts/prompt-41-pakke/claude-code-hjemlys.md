# Hjemlys (tidligere «Hjemme trygt»): Live Activities på iPhone og Live Updates på Android

Ønsker 2026-10-20: «er det mulig å bygge inn en sånn funkjson i familie» (+ skjema) og «for den hjemme trygt, funksjonen gi støtet for live action og live activitites på iphone og android. gi også funkjsonen et passende men stilig navn.»
Fasit: `Hjemme trygt Varianter.dc.html` → **2a** (iPhone), **2b** (Android/Samsung), og flyten i 1a–1c (ikke valgt ennå) + «Felles».

## Navn
**Hjemlys** – «Et lite lys som står på til du er hjemme.» Ikonet er en varm, glødende prikk (`#FFE7A3 → #F2A93B`). Grønn ring = på vei, rød = sen, gul glød = hjemme.

## Funksjonen (fra skjemaet)
- Tur-modus avsluttes **når jeg er fremme** (geofence 60 m rundt målet, eller hjemme-Wi-Fi når målet er hjemme). Målet kan være hjem eller et annet sted. Se også «Si fra» under.
- **Alle i husstanden** kan starte og motta, begge veier.
- Ved forsinkelse deles: **siste posisjon, ruten, batteri og dekning, siste opplåsing, hvem du var med (kalender)**. Ingenting deles før du er sen.
- Forløp: forventet tid fra Ruter/veibeskrivelse → oppdateres underveis → «Alt OK?» ved passert tid eller lang stillstand → svarer du ikke innen valgt ventetid (5/15/30 min) får familien varsel → hjemme = «Sebastian er hjemme 23:36», deling stopper.
- **Glimt foreslår** å starte (etter kino/fest i kalenderen, sent på kvelden, nattbuss), og kan foreslå at andre i familien starter.
- Finnes på iPhone, Android, web (Familie-kortet), klokke, Hjem-widget og låseskjerm.

## Si fra: Sjekket inn · Drar snart · Drar nå (2026-10-20)
Ønske: «hjemlys, er ikke bare til for tilbake fra ett sted, det kan også være at man fek skal på fest eller selskap og bare skal gi beskjed til de du skjernner at du sjekket inn eller skal dra snart eller drar nå, må ikke være fra et sted.»
Fasit: `Hjemme trygt Varianter.dc.html` → **3a** (si fra), **3b** (mottakere), **3c** (Live Activity / Live Update).
- Hjemlys-skjermen får tre knapper: **Sjekket inn** (jeg er fremme), **Drar snart** (15 min / 30 min / 1 t / ukjent), **Drar nå** (mål: Hjem / Annet sted / Ikke oppgi).
- **Sted er valgfritt.** Foreslås fra kalenderhendelsen som pågår («Bursdag hos Mari»), kan endres eller fjernes. Ingen geofence eller «fra»-sted kreves.
- **Mottakere velges fritt:** husstanden er forvalgt, pluss venner/kontakter («+ Venn»). Kontakter uten Papir får SMS-lenke til en enkel statusside (utløper etter 24 t). Siste valg huskes per hendelse.
- Kun beskjeden og stedet du valgte sendes. Posisjon deles ikke for Sjekket inn / Drar snart / Drar nå uten mål.
- **Drar snart:** Live Activity / Live Update med klokkeslett («Drar om ca. 30 min · 23:04»), knapper «+ 15 min» og «Drar nå». Ved tiden: lokalt varsel «Drar du nå?» (Ja / + 15 min). Ingen svar = ingen alarm.
- **Drar nå:** uten mål → én beskjed, ferdig. Med mål (Hjem eller annet sted) → vanlig Hjemlys-tur med ETA, fremdrift, «Alt OK?» og forsinkelsesregler. Målet trenger ikke være hjemme; avsluttes med geofence 60 m rundt målet eller «Jeg er fremme».
- **Sjekket inn:** kompakt Dynamic Island «Inne · 19:42» (gul), forsvinner etter 15 min. Android-brikke «● Inne 19:42».
- Mottakere: varsel «Sebastian sjekket inn · Bursdag hos Mari», «Sebastian drar om ca. 30 min», «Sebastian drar nå · hjem ca. 23:38» med «Følg hjem» / «Fint». Samme hendelser i Familie-tråden og på web (Familie-kortet).
- Glimt foreslår «Sjekk inn?» når du kommer til stedet i en kalenderhendelse, og «Si fra at du drar?» når hendelsen nærmer seg slutt.
- Server: `POST /api/hjemlys/status {kind: checked_in|leaving_soon|leaving_now, place?, leave_at?, destination?, recipients[]}` → `hjemlys_status`. `leaving_now` med `destination` oppretter `hjemlys_sessions`.
- Søk: «sjekk inn», «drar snart», «drar nå», «fest» leder hit.

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

## iPhone: start og velg personer + fiks av Live Activity (2026-10-20)
Ønske: «hjemme trygt. hvis meg siden på iphonene av hvordan man starter og velger personer og slikt. også litt feil med live action varslignen» (skjermbilder: `vedlegg/hjemlys-la-feil-1.png`, `vedlegg/hjemlys-la-feil-2.png`)
Fasit: `Hjemme trygt Varianter.dc.html` → **4a–4d**.

### Flyt
- **4a Start** (Familie → Hjemlys): fire valg i rutenett: *På vei hjem* (mørk, hovedvalg), *Sjekket inn*, *Drar snart*, *Drar nå*. Under: «AKTIVE I FAMILIEN» (andres pågående Hjemlys). Glimt-forslag nederst når kalenderen tilsier det. «Historikk» øverst til høyre.
- **4b Velg personer**: søk, filter *Husstanden / Siste brukt / Alle*. Seksjoner HUSSTANDEN, VENNER MED PAPIR (får varsel i appen), ANDRE KONTAKTER (får SMS med lenke, hentes fra Kontakter med tillatelse). Runde avkrysningsrundinger 24 pt, rader 52 pt. Nederst: avatarer for valgte, «2 valgt», «Husk valget» (standard på). Du selv vises aldri i lista.
- **4c Klar til start**: mål (Hjem som standard, «Endre»), rutevalg med tid (✓ på valgt), «Varsle hvis jeg ikke svarer på «Alt OK?»» 5/15/30 min, «Deles bare hvis du er sen» med brytere (posisjon og rute, batteri og dekning, hvem jeg var med). Knapp «Start · hjemme ca. 23:38» med lyset. Start → Live Activity med en gang.
- Sjekket inn / Drar snart / Drar nå hopper over 4c-delene som ikke gjelder (ingen rute uten mål).

### Feil i Live Activity (utvidet Dynamic Island)
1. **Knappene kuttes nederst.** Utvidet visning har maks ca. 160 pt høyde. Bruk `DynamicIslandExpandedRegion(.leading/.trailing/.center/.bottom)`: leading = lys + «Hjemlys»/mottakere, trailing = tid, bottom = fremdrift + etiketter + knapper. Knapper 34 pt, `.font(.system(size: 13, weight: .bold))`, 10 pt mellom rader, 14 pt bunnmarg. Ingen fast `.frame(height:)` på hele innholdet.
2. **Tiden mangler** («•••», «om…»). `ContentState.eta` må settes før `Activity.request` (beregn ETA først, eller bruk forventet tid fra ruten). Vis `Text(eta, style: .time)` og `Text(timerInterval: now...eta, countsDown: true)` i fast bredde (`.frame(minWidth: 64, alignment: .trailing)`, `.monospacedDigit()`). Mens ETA mangler: «Beregner» i stedet for prikker.
3. **Fremdrift 0 og generiske etiketter.** `progress` = tilbakelagt / total distanse langs ruten, oppdatert via push. Etiketter: startsted (f.eks. «Majorstuen»), nåværende etappe («Trikk 19 · Bogstadveien»), «Hjem». Aldri «Start» / «Kollektiv + gå».
4. **Du selv i «følger med».** Filtrer bort `currentUserId` fra mottakerne. Tekst: «Rune og Cybele følger med», ved 3+: «Rune, Cybele og 1 til».
5. **Gløden blir en firkant.** Ikke bruk bilde med glød eller `.shadow` som klippes av regionen. Bruk `Circle().fill(RadialGradient(...))` + `.shadow(color: .orange.opacity(0.6), radius: 6)` med `.padding(6)` så skyggen får plass, og `.compositingGroup()`.
- Samme rettelser for låseskjerm-varianten og StandBy. Android Live Update: samme tekster og ingen deg selv i mottakerlista.

## Lagt inn i appen: Familie → Hjemlys (2026-10-20)
Ønske: «legg inn det nye med hjemme trygy»
Fasit: `Familie.dc.html` (fanen **Hjemlys**) + `Mobil Papir App.dc.html` (Familie-fanelinjen: Kart · Soner · Helse · **Hjemlys**).
- Ny fane i Familie med hele flyten fra 4a–4c og 3a: **Start** (fire valg + aktive i familien + Glimt-forslag) → **Hvem får beskjed?** (søk, Husstanden / Siste brukt / Alle, seksjoner husstand / venner med Papir / andre kontakter via SMS, «Husk valget») → **Klar** (mål, rute, «Alt OK?»-ventetid 5/15/30, hva som deles hvis sen) → **Aktiv** (tid, fremdrift, følgere, «+ 10 min», «Jeg er hjemme», «Avslutt uten å si fra», forhåndsvisning av låseskjerm-Live Activity).
- Sjekket inn / Drar snart / Drar nå uten mål: valgfritt sted (forslag fra kalenderen) → «Sendt»-kort med beskjeden ordrett. Drar snart har «+ 15 min» og «Drar nå».
- Du selv er aldri i mottakerlista. Status lagres (`hjemlys_v1` lokalt, `hjemlys_sessions` / `hjemlys_status` på server) så en pågående tur overlever omstart.
- Web: samme fane i Familie på web. Mac: samme innhold i Familie-vinduet.

## Lagt inn: 1b, 1c og Felles (2026-10-20)
Ønske: «lag disse også» (1b Glimt foreslår, 1c Nattmodus, Felles: klokke, Hjem-widget og Hjemlys-raden).
Fasit: `Familie.dc.html` (Hjemlys-fanen) + `Mobil Papir App.dc.html` (Hjem → Posisjon-kortet). Native flater (klokke, widget, låseskjerm): `Hjemme trygt Varianter.dc.html` → Felles og 2a/2b.
- **1b Glimt foreslår:** varselkort øverst i Hjemlys «Kinoen er ferdig. Skal jeg si fra til Ingrid og Pål når du er hjemme?» med «Ja, start» (starter turen direkte med forslått rute og mottakere) og «Ikke nå». Samme tekst som push-varsel med handlingsknapper (iOS `UNNotificationCategory`, Android actions). Trigger: kalenderhendelse slutter etter kl. 21, eller du forlater et sted langt hjemmefra etter kl. 22.
- **Glimt følger med** under aktiv tur: samtale med Glimt (første melding «Startet HH:MM. … får beskjed når du er fremme, ca. HH:MM.»), hurtigknapper «+ 10 min», «Jeg er hjemme», «Avslutt», og fritekst. Glimt tolker: «går innom Kiwi først» → +10 min, «bussen er sen» → +15 min, «er hjemme» → avslutt. Svarer kort og bekrefter ny tid. Bruk samme AI-kjede som Chat, med reserve-tolkning lokalt.
- **1c Nattmodus:** bryter på aktiv tur, på av seg selv kl. 21–05. Mørkt kort med stor ring (220 pt, 12 pt strek) som teller ned `mm:ss` til forventet tid, grønn → rød når over tiden («+3 min · over tiden»). Oppdateres hvert sekund.
- **Kritisk varsel hos mottaker:** i «Aktive i familien» vises en forsinket person med rød prikk. Trykk åpner den røde skjermen: «KRITISK · BRYTER IKKE FORSTYRR», «Pål er 15 min forsinket», «Ventet hjemme 23:38. Svarte ikke på «Alt OK?».», fire fakta (siste posisjon, batteri og dekning, sist låst opp, var med), ruten, **Ring Pål** (stor hvit), **Åpne kart** (går til Kart med personen valgt), **Ring Emil** (den hen var med), og «Jeg har fått tak i Pål» (lukker varselet for alle mottakere).
- **Hjem-kortet Posisjon · Familie:** når du har aktiv Hjemlys blir tittelen «POSISJON · FAMILIE · HJEMLYS», og øverst kommer en rad med lyset, «Du · på vei hjem», etappe og følgere, tid og fremdrift. Trykk åpner Familie → Hjemlys. Andres aktive Hjemlys vises på samme måte for mottakere. Samme rad på web-dashboardets Familie-kort.
- **Klokke og widget:** se Felles i variantfilen. Apple Watch Smart Stack / Wear OS: ring + minutter + «Jeg er hjemme». Hjem-widget (liten/medium): hvem som er på vei og tid, «Start for meg»-knapp (App Intent).
