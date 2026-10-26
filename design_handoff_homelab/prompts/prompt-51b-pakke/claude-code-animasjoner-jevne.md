# Animasjoner: jevne på mobil og PC (ingen hakking)

Animasjonene i designfilene er riktige (bevegelse, varighet, kurver). I appene og på web hakker de og går ujevnt. Målet er stabile 60/120 fps. Ikke endre utseendet, bare hvordan de kjøres.

Gjelder bl.a.: Glimt-orben (roterende fargering, pusting), AI-kortet/svarboblen i Hjem, ark som glir opp/ned, wiggle-modus og flytting av widgets, skimmer på lasteskjermer (Chat Laster Web), fade/overganger mellom visninger, mikrofon-bølgeformen.

## 1. Felles regler (alle plattformer)
- Animer **bare transform og opacity** (translate, scale, rotate, alpha). Aldri width/height/top/left/margin/padding, border-radius, box-shadow, filter/blur eller bakgrunnsfarge per bilde.
- Skygge og blur: tegn én gang, animer opacity på et ferdig lag i stedet.
- Ingen state-oppdatering per bilde som tegner hele skjermen på nytt. Animasjonsverdien skal leses så lavt i treet som mulig.
- Én klokke per animasjon. Ikke `setInterval`/`Timer` som oppdaterer state; bruk plattformens animasjonsmotor.
- Start tunge ting (nettverk, JSON-parsing, bildedekoding, databasekall) **før** eller **etter** en overgang, ikke midt i den. Utsett til animasjonen er ferdig.
- Kurver: bruk samme fjær/ease som i designet (ark: fjær ~ respons 0,35 s, demping 0,85; fade 150–200 ms ease-out; wiggle ±1,5° 0,25 s).
- Respekter «Reduser bevegelse»: bytt bevegelse med kort fade.

## 2. iOS / iPadOS (SwiftUI)
- Glimt-orb og skimmer: `TimelineView(.animation)` + `Canvas`, eller `rotationEffect`/`opacity` med `.repeatForever`. Ikke `Timer.publish` som endrer `@State`.
- Legg animerte lag i egne små `View`-structer så foreldrevisningen ikke re-evalueres hvert bilde.
- Tunge effekter (blur, materials, skygger på mange fliser): `.compositingGroup()` / `.drawingGroup()` på orben og bølgeformen. Ikke `.blur()` med animert radius.
- Ark: bruk `.sheet`/`.presentationDetents` eller `matchedGeometryEffect` med `.spring(response: 0.35, dampingFraction: 0.85)`. Unngå `GeometryReader` som endrer layout under draget.
- Wiggle: `rotationEffect` med fast fase per flis, ikke ny `id` per bilde (som tvinger ny visning).
- Lister: `LazyVStack`, stabile `id`-er, ingen `AnyView` i rader.
- Test på ProMotion: `CADisableMinimumFrameDurationOnPhone = YES` i Info.plist for 120 Hz.

## 3. Android / One UI (Jetpack Compose)
- Les animerte verdier i **draw-/layout-fasen**: `Modifier.graphicsLayer { rotationZ = r.value; alpha = a.value }` og `Modifier.offset { IntOffset(...) }` (lambda-versjonen). Ikke `Modifier.rotate(r.value)` / `.alpha(a.value)` / `.offset(x.dp)` som rekomponerer hvert bilde.
- Uendelige animasjoner: `rememberInfiniteTransition()`; orb-ring med `drawBehind`/`Canvas` + `graphicsLayer`.
- Stabile `key` i `LazyColumn`/egen widget-rad (samme som i `claude-code-wiggle-flytt-android.md`), og `Modifier.animateItem()` for flytting.
- Merk dataklasser som `@Immutable`/`@Stable`; unngå lambdaer og lister som lages på nytt hver rekomposisjon (`remember`).
- Ark: `ModalBottomSheet`/`AnchoredDraggable`, ikke egen `animateDpAsState` på høyde.
- Slå på **Baseline Profiles** (`androidx.profileinstaller` + `baselineprofile`-modul) for hjemskjerm, Chat og ark. Det fjerner mesteparten av hakkingen første gangen en skjerm åpnes.
- Release-bygg med R8. Debug-bygg hakker alltid og skal ikke brukes til å vurdere jevnhet.
- Hvis skjermen er en WebView: `setLayerType(LAYER_TYPE_HARDWARE)`, og følg web-reglene under.
- One UI/Samsung: sjekk med «Animasjonsskala 1x» og høy oppdateringsfrekvens på; test 120 Hz.

## 4. Web / PC (Homelab Web, Chat, Innstillinger)
- CSS-animasjoner/transitions på `transform`/`opacity`, eller Web Animations API. Ikke animasjon via React-state + `requestAnimationFrame` som re-rendrer komponenter.
- Skimmer: én `linear-gradient` på et pseudo-element som flyttes med `transform: translateX`, ikke animert `background-position`.
- Glimt-orb: roter et ferdig lag (`transform: rotate`), ikke animert `conic-gradient`-vinkel / `@property` per bilde. Pusting = `scale`.
- `will-change: transform` bare på elementer som faktisk animeres, og bare mens de animeres. Fjern etterpå.
- `contain: layout paint` på kort/fliser som animeres, så resten av siden ikke må tegnes på nytt.
- `backdrop-filter: blur()` er dyrt: ikke animer det, og bruk det på få, små flater. Ved åpning av ark: fade inn et ferdig blur-lag.
- Ikke les layout (`getBoundingClientRect`, `offsetHeight`) i samme bilde som du skriver stil; batch lesing før skriving (FLIP for flytting av widgets).
- Lister med mange rader: virtualisering; skjul rader utenfor skjermen (`content-visibility: auto`).
- `@media (prefers-reduced-motion: reduce)`: korte fades.

## 5. Måling (gjør før og etter)
- iOS: Instruments → Animation Hitches. Mål: hitch ratio < 5 ms/s.
- Android: Profiler → Janky frames / `adb shell dumpsys gfxinfo <pakke>`; Macrobenchmark `FrameTimingMetric` for Hjem, Chat-åpning, ark, wiggle. Mål: P90 frame < 16 ms (8 ms på 120 Hz).
- Web: Chrome DevTools → Performance, «Rendering → Frame rendering stats». Ingen lange oppgaver > 50 ms under en animasjon; ingen «Layout»/«Recalculate style» per bilde.
- Test på svakeste enhet vi har (eldre Android), ikke bare emulator/Mac.

## Ferdig når
- Orb, skimmer, ark, wiggle, flytting og AI-kortet går jevnt i release-bygg på iPhone, Android/One UI og i Chrome/Safari på PC.
- Ingen synlige hopp når data kommer inn under en overgang.
