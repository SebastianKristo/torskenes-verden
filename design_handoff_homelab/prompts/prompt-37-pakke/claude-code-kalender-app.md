# Kalender: egen app for iOS og Android

Fasit: `Kalender App.dc.html` (props `platform` ios|android, `mode` app|home|lock, `view` ar|mnd|uke|3d|dag|liste|sok, `demo`). Oversikt over alle skjermer, widgets og låseskjerm: `Kalender App Oversikt.dc.html`.

## App
- **Helt egen app** med navn **Kalender** og eget ikon: krembakgrunn, rød topp med ukedag («TIR») og dato i Newsreader. Ikonet viser **dagens dato** (iOS: alternative ikoner / Android: adaptive ikon oppdateres daglig).
- Deler data med Homelab: samme konto, samme kalendere, hendelser, bursdager og studiefrister. Endringer synkes begge veier i sanntid. Prototypen bruker `localStorage 'kalapp_v1'` + `kalapp-sync`-event mellom instanser.
- Stil: Papir (`#f3efe6` bakgrunn, `#1b1a17` blekk, `#b23a2a` aksent, Newsreader / Manrope / IBM Plex Mono). Ingen navbar; én skjerm med toppfelt, visning og skrivefelt.

## Toppfelt
- Liten rød linje (år / uke / ukedag) og stor tittel (måned, datoområde, dato). **Trykk på tittelen** zoomer ut (Dag → Uke → Mnd → År).
- Venstre: **☰** åpner sidemenyen Kalendere. Høyre: ‹ › (forrige/neste periode), **I dag** (bare når man ikke ser i dag), og søk.
- **Rød +** (ny hendelse) står nederst til høyre for Glimt-feltet: 50 × 50 px, rund på iOS (radius 25) og squircle på Android (radius 16), med rød skygge.
- Visningsvelger (pille): **År · Mnd · Uke · 3 d · Dag · Liste**.
- **Sveip** venstre/høyre bytter periode. Lett haptikk ved alle bytter.

## Visninger
- **Måned:** ukenummer-kolonne (U), lørdag–søndag med rød søndag, i dag markert med rød sirkel og svak rødtone. Opptil 3 (iOS) / 4 (Android) hendelseschips per dag og «+N». Lite vær-ikon for dagene med prognose. Trykk på en dag åpner **Dag**.
- **Uke / 3 dager / Dag:** tidslinje 00–24 (44/52/62 px per time) som starter ved nå −2 t eller 07:30. Kolonnehode med ukedag, dato og vær (ikon + maks). Rad for heldagshendelser. Overlappende hendelser deles i spor. Rød nå-linje. Blokker i kalenderfarge (tint) med tittel og tid.
- **År:** 12 minimåneder (3×4). I dag i rødt, søndager i rødt. Trykk åpner måneden.
- **Liste (agenda):** neste 6 uker. Dagshode som blir stående (I dag / I morgen / ukedag + dato + vær), ukeskille «UKE 43». Rader med tid, fargestripe, tittel, sted · kalender og merker **FRIST** / **BURSDAG** / **FORTS.**
- **Søk:** fullskjerm med felt og «Avbryt»-pille, kalenderfiltre som chips og treff gruppert per dag (kommende først, så tidligere).

## Hendelse (ark)
Tittel (Newsreader 28), kalender, «Når», «Sted», «Vær» for dagen og «Lagt til av Glimt «…»» hvis den kom fra AI. **Varsel**-chips: Ingen · 10 min · 30 min · 1 t · 1 dag. «Slett hendelse». **Ferdig**-pille øverst til høyre (felles knappestil).

## Kalendere (sidemeny fra venstre)
- Åpnes med ☰ eller ved å **sveipe inn fra venstre kant** (de første 28 px). Lukkes med sveip mot venstre, trykk på bakteppet eller **Ferdig**.
- Panel: 86 % bredde (maks 340 px), `#fffdf8`, radius 0 28 28 0, glir inn med `translateX` på 0,3 s (cubic-bezier(.2,.8,.2,1)), og bakteppet tones inn. Haptikk ved åpning og lukking.
- **Sidemeny, ark og bakteppe dekker hele skjermen, også statuslinjen.** Statuslinjen dempes sammen med resten (samme `rgba(27,26,23,.32)`), og sidemenyen går helt til toppen (innhold starter under Dynamic Island: padding-top 62 / 46 px). Ingen lys stripe øverst. iOS: presenter over hele vinduet (`.ignoresSafeArea()`), statuslinjen holdes mørk.
- Personlig (rød), Jobb (blå), Studie (grønn, frister), Familie (oker), Helse (petrol), Bursdager (lilla). Hver kan slås av/på, med antall de neste 30 dagene.
- Visning: Ukenummer av/på, Vær av/på (Oslo, MET / Open-Meteo, 16 dager).
- Standardvarsel for nye hendelser.

## Ny hendelse (rød + ved Glimt-feltet)
- Ark nederfra: **Avbryt** (kantpille), «Ny hendelse», **Legg til** (mørk pille, grå til tittel er fylt ut).
- Felt: Tittel (Newsreader 24, fokus automatisk), Sted, **Hele dagen**-bryter, Dato (dato-velger), Fra – til (tid). Endrer man starttid, flyttes slutt med samme varighet.
- Startverdier: dagen man ser på (i dag i Måned/År/Liste), neste halvtime og 1 time, Personlig og standardvarselet.
- Kalender-chips og Varsel-chips. Tips nederst: «skriv heller i feltet nederst … så fyller Glimt ut alt».
- Legg til → toast med **Angre**, og visningen hopper til datoen.

## Rask ny hendelse med Glimt (AI)
- Felt nederst: «Ny hendelse … «frisør 14.30 25.10»». Forhåndsvisning **mens man skriver** («GLIMT FORSTÅR»): tittel, dag, tid, varsel og kalender. Enter / pil legger til. Toast «Glimt la til …» med **Angre**. Tastaturet lukkes.
- Lokal tolkning først (funker uten nett): klokkeslett `14.30`, `14:30`, `kl 9`, `14.30–15.15` · dato `25.10`, `25.10.27`, `25. okt`, `i dag / i morgen / overmorgen / i kveld`, `fredag`, `neste fredag` · varighet `i 2 timer` / `i 45 min` · varsel `varsle 30 min før` / `påminn meg 1 dag før` · kalender gjettes fra ord (lege/tannlege/trening → Helse, frist/eksamen/forelesning → Studie, møte → Jobb, mormor/hytta → Familie, bursdag → Bursdager). Tittel renses for «legg til», «time hos» osv.
- `14.30 25.09`: tall med minutter > 12 eller kolon = tid, dag > 23 = dato. To tvetydige tall gir først tid, så dato.
- Uten dato: i dag, eller i morgen hvis tiden har passert. Uten tid: heldagshendelse.
- Lim inn en melding (SMS/e-post): sendes til Glimt (LLM) for å hente tittel, tid og sted når den lokale tolkningen ikke er sikker. Kjører i bakgrunnen og varsler når hendelsen er lagt til.
- Også fra delingsark (Del → Kalender), Siri/App Intents («Legg til i Kalender …») og Android-snarvei.

## Varsler
- Lokale varsler (iOS UNUserNotificationCenter / Android AlarmManager + NotificationChannel «Hendelser») etter `rem`. Tekst: «Nina frisør · om 1 t · 14:30–15:30 · Frisør Nina, Grünerløkka». Handlinger: **Utsett 10 min**, **Vis vei**.
- Bursdager varsles kl. 09:00 samme dag. Studiefrister varsles 3 dager og 1 dag før.

## Widgets
Alle størrelsene vises i `Kalender App Oversikt.dc.html` → «WIDGETS OG LÅSESKJERM». Trykk på en hendelse i en widget → `kalender://hendelse?id=…`. Trykk på dato/måned → `kalender://dag/…`.
- **iOS (WidgetKit):**
  - Medium: dato, ukedag, vær og 3 neste hendelser.
  - Stor: måned med ukenummer, prikker og 2 neste.
  - Liten: dato og neste hendelse.
  - Låseskjerm: rektangulær (neste hendelse med tid og sted), sirkulær (ukedag + dato) og inline over klokken (dato · neste hendelse).
- **Android / Samsung (Glance):**
  - 2×2: dato, uke og vær.
  - 2×2 mørk: «NESTE».
  - 4×3: «I dag og i morgen», med +-knapp som åpner skrivefeltet.
  - Låseskjerm: stor stablet klokke, dato · vær og neste hendelse.
  - Fungerer i Samsung One UI.
- Widgets oppdateres ved endringer (push / WidgetCenter.reloadAllTimelines) og hvert 15. minutt. Trykk åpner riktig dag eller hendelse.

## Plattform
- iOS: Dynamic Island-sikker topp, hjemindikator, skrivefelt med radius 25.
- Android: statuslinje med kamerahull, gestlinje, radius 28 / sendeknapp med squircle 14. Material-haptikk.
- Tilgjengelighet: alle knapper har aria-label. Minst 44 px treffflate på kontroller. Teksten skalerer med Dynamic Type / fontScale.

## Åpne fra Homelab (deep link)
Fasit: `Mobil Papir App.dc.html` → `goKal(o)` / `kalLink` · `Kalender.dc.html` (widget) → `onOpen({date, view, t, s, e})` · `Kalender App.dc.html` → prop `link` + `applyLink()`.
- Alt som har med kalender å gjøre i Homelab-appen åpner **Kalender-appen** på riktig sted. Den gamle Kalender-siden i Homelab brukes ikke lenger.
  - **Trykk på en time/hendelse** i Kalender-widgeten på Hjem → `kalender://hendelse?date=2026-10-21&t=IN2010&s=10:15&e=12:00`. Kalender åpner **Dag** for datoen med hendelsesarket oppe.
  - **Trykk på resten av widgeten** → `kalender://dag/2026-10-21`.
  - Kalenderfanen i navbaren → `kalender://` (i dag).
  - «Åpne kalender» i Chat/Glimt-svar → `kalender://liste`.
  - Varsler og widgets i Kalender-appen bruker de samme lenkene.
- Matching: på `id` hvis den finnes (anbefalt: send hendelses-id). Ellers på dato + tittel + starttid. Finner den ikke noe, viser arket data fra lenken.
- iOS: `UIApplication.shared.open(URL(string:"kalender://…"))`. Er Kalender ikke installert: åpne App Store-siden, eller fall tilbake til Kalender i Homelab. Universal Links: `https://kalender.kristo.no/d/2026-10-21`.
- Android: `Intent(ACTION_VIEW, Uri.parse("kalender://…"))` med `<intent-filter>` (scheme `kalender`, `autoVerify` for https). Fallback: Play Store.
- I Kalender-appen: iOS viser **◀ Homelab** øverst til venstre (systemets tilbake-til-app). Prototypen har den som `backLabel`/`onBack`. Overgangen er en skaler/fade-animasjon (0,38 s).

## iPhone-demo
`Kalender iPhone.dc.html`: en iPhone (titanramme, sideknapper, Dynamic Island) med iOS-hjemskjermen og Kalender-widgetene.
- Trykk på **ikonet** → appen åpner i Måned. Trykk på **medium** → Dag i dag. Trykk på **stor** → Måned. Trykk på **liten** → neste hendelse åpen.
- Appen zoomer ut fra elementet man trykket på (0,42 s, cubic-bezier(.2,.8,.2,1)). Hjemskjermen skaleres til 0,92 og tones ut.
- Trykk på hjemstreken nederst → tilbake til hjemskjermen.
- Widget-trykk bruker de samme deep-lenkene som i «Åpne fra Homelab».

## Glimt i Kalender (AI-assistent)
Fasit: `Kalender App.dc.html` → `ask()`, `glSend()`, `spark()`, `orb()` · demo i Oversikt («Glimt · spør kalenderen» / «finn ledig tid»).
- **Ett felt for alt** nederst: «Spør Glimt eller skriv en hendelse …».
  - Spørsmål (slutter på «?» eller starter med hva/når/hvem/hvor/finn/oppsummer/har jeg …) gir kortet **SPØR GLIMT · «…» Enter ›**, og Enter åpner Glimt-panelet med svaret.
  - Ellers vises hendelsesforhåndsvisningen («GLIMT FORSTÅR») som før.
- **Forslag:** når feltet får fokus og er tomt, vises «Hva skjer i morgen?», «Når er neste frisørtime?», «Finn ledig tid fredag» og «Oppsummer uka».
- **Glimt-panelet** er et ark nederfra (82 %, glir opp på 0,34 s):
  - Topp: animert orb, «Glimt», «KALENDER-ASSISTENT · LOKALT + GEMINI» og **Ferdig**-pillen.
  - Tom tilstand: stor orb, «Hva lurer du på?» og forslag.
  - Brukermeldinger: mørke bobler til høyre.
  - Glimt-svar: **tenker-fase** med skimrende «Glimt tenker» og steg som hukes av («Leser i morgen i kalenderen ✓ · Finner hull på minst 45 min ✓ · Foreslår tider»). Etter det **strømmes teksten** ord for ord med rød markør, og så kommer **hendelseskort** (åpner arket) og **ledige tider** (grønne +chips → «Ny hendelse» ferdig utfylt). Ved opprettelse vises **Angre**.
  - Haptikk når svaret er ferdig.
- **Hva Glimt forstår** (lokalt, raskt; send til LLM med verktøykall når det er usikkert):
  - Neste X: «Når er neste frisørtime?» → «Neste frisør er torsdag 21. oktober kl. 14:30, Frisør Nina, Grünerløkka. Det er om 2 dager. Du får varsel 1 t før.» + kort.
  - Oppsummer dag/uke: antall hendelser, første og siste, vær, frister, bursdager.
  - Ledig tid: hull ≥ 45 min mellom 08–21 på valgt dag.
  - Bursdager, frister/eksamen, vær («Blir det regn i morgen?»).
  - Opprett: «legg til tannlege fredag kl 9» eller en innlimt melding → legges inn med en gang og kan angres.
- **Animasjoner** (samme uttrykk som i Homelab): `aiSpin` (konisk regnbuering), `aiPulse` (stjernen pulser), `aiTw` (gnister), `glBreath` (orben puster: 3,6 s i ro, 1,1 s når den tenker), `glShim` (skimmer på «Glimt tenker»), `glIn` (meldinger glir inn), `glUp` (panelet). Stjernen i feltet spinner raskere når det står noe der. Respekter «Reduser bevegelse»: kun fade.
- **Glimt · dagen din** øverst i Liste: kort oppsummering («Du har 2 igjen i dag. Neste er Tannlege kl. 15:15. Skyet, 4–9°. Frist: …»). Trykk åpner Glimt.
- **Backend:** samme Glimt-agent som i Homelab (`/api/glimt`), med verktøy `calendar.search`, `calendar.free_slots`, `calendar.create`, `calendar.update` og `weather.daily`. Spørsmål stilt mens appen er i bakgrunnen gir varsel med svaret (som i Homelab).

## Mørkt tema
Fasit: `Kalender App.dc.html` → `THM.dark` · prop `theme` (system | light | dark) · sidemenyen → **UTSEENDE: System · Lys · Mørk** (lagres i `kalapp_th`). «System» følger `prefers-color-scheme` / iOS-utseende / Android `UI_MODE_NIGHT` og bytter live.
- Alle farger er tokens (CSS-variabler på roten): `--bg --ink --card --chip --line --line2 --mut --mut2 --ink2 --acc --glass --dim`.
- Mørk: bg `#161513` · kort `#211f1b` · chip `#2b2824` · linjer `#3b3731` / `#2e2b26` · tekst `#efe9de` · dempet `#a49d91` / `#7a746a` · aksent `#ec7a64` (rødt lysnet for kontrast) · bakteppe `rgba(0,0,0,.55)`.
- **Inverterte knapper:** mørke piller (Ferdig, I dag, Legg til, valgt chip) blir lyse med mørk tekst i mørkt tema (`background: var(--ink); color: var(--bg)`).
- **Kalenderfarger:** samme fargeprikker, men teksten i chips og blokker bruker lyse varianter: Personlig `#f29a8a`, Jobb `#9cc2ee`, Studie `#8fd4a8`, Familie `#ecbb74`, Helse `#8fcdd6`, Bursdager `#d6a8e6`. Søndag og i dag-tekst bruker `#ec7a64`.
- Statuslinje og hjemstrek følger `--ink` (lys i mørkt). Widgets og låseskjermvarsel får mørke kort (`--card` / `--glass`).
- iOS: `overrideUserInterfaceStyle` fra valget. Widgets følger systemet (`@Environment(\.colorScheme)`). Android: `AppCompatDelegate.setDefaultNightMode`, og Glance bruker `GlanceTheme` dag/natt.
- Vises i Oversikt → «MØRKT TEMA».

## FEIL: «I dag»-knappen viser bare «…»
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.18.03.png` og `… 21.18.13.png`. I den ekte appen er knappen en rund 34 × 34-sirkel med teksten avkortet til «…».
- **Fiks:** «I dag» er en **pille** og ikke en ikonknapp. Den har `flex: none; white-space: nowrap; min-width: max-content; height: 34px; padding: 0 13px; border-radius: 17px`, mørk `#1b1a17` med lys tekst «I dag» (Manrope 700, 12,5 px). Ikke gi den fast `width`, og ikke bruk samme komponent som ikonknappene.
- **Plassering:** helt til venstre i knapperaden, før ‹ ›. Rekkefølge: **I dag · ‹ · › · søk**. Den vises bare når man ikke ser dagens periode.
- Tittelen («September») har `min-width: 0` + ellipsis og skal gi plass, ikke knappene (`flex: none` på knappegruppen).
- Trykk → hopp til i dag i gjeldende visning, med lett haptikk.

## FEIL: tastaturet dekker skrivefeltet, og toppen kolliderer med statuslinjen
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.18.46.png`. Når Glimt-feltet får fokus: (1) feltet og den røde + havner delvis bak tastaturet, (2) iOS skyver hele siden opp, så «2026 / September», pilene og knappene havner oppå klokka, Dynamic Island og batteriet.
Fasit: `Kalender App.dc.html` → `componentDidMount` (`visualViewport`), `kbH` / `kbPad`. Samme teknikk som `claude-code-chat-tastatur-ios.md`.

1. **Ikke la iOS panorere siden.**
   - Appen har fast høyde (`100dvh`, `overflow: hidden` på `html`, `body` og roten), og bare innholdsområdene scroller.
   - Ved fokus: `window.scrollTo(0,0)` hvis `visualViewport.offsetTop > 0` eller `scrollY > 0`, og så på nytt etter 90, 330 og 650 ms (tastaturet animeres).
   - Native: Capacitor `Keyboard.resize = 'none'` + `scrollAssist: false`, ellers WKWebView `scrollView.isScrollEnabled = false` på roten.
2. **Løft skrivefeltet med tastaturhøyden:**
   - `kbH = (høyde før tastatur) − visualViewport.height`. Native: `keyboardWillShow → info.keyboardHeight`.
   - Skrivefeltet (med forslag-chips og rød +) får `margin-bottom: kbH − hjemstrek-plass` med samme kurve som tastaturet (0,22 s, `cubic-bezier(.2,.8,.2,1)`). Bunnpaddingen for hjemstreken fjernes mens tastaturet er oppe.
   - Feltet skal ligge rett over QuickType-linjen.
3. **Toppen respekterer safe area:** `padding-top: env(safe-area-inset-top)` på toppfeltet. Statuslinjen og Dynamic Island skal aldri dekkes, selv om noe scroller. I native skal toppfeltet ikke ligge i scroll-området.
4. **Forslag-chips** («Hva skjer i morgen?» …) ligger mellom innholdet og feltet og flyttes opp sammen med feltet.
5. Lukk tastaturet ved trykk utenfor feltet, ved sveip ned på innholdet og etter «Legg til»/send. Da går `kbH` tilbake til 0.
6. Test: iPhone 15/16 Pro (Dynamic Island) og SE (hjemknapp), Safari og hjemskjerm-app, med og uten QuickType.

## Kalendere: farger, skjule, iCal og Home Assistant
Fasit: `Kalender App.dc.html` → sidemenyen «Kalendere» (`calRows`, `ac`, `calApply()`, `localStorage kalapp_cals` = `{col, hidMenu, added[]}`).
- **Farge:** trykk på prikken ved en kalender → rad med 12 farger (`#b23a2a #e8794a #a8661a #c9a227 #2f7a4f #3d7f8a #2b5d8a #5b4fc4 #8a3fa0 #c2477a #6b665c #1b1a17`). Valgt farge har ring. Tekstfarger regnes ut automatisk (mørk `tx` = 28 % mot svart, lys `lt` = 45 % mot hvit for mørkt tema).
- **Vis/skjul i kalenderen:** bryteren som før (hendelsene skjules midlertidig).
- **Rediger** (øverst til høyre i «MINE KALENDERE»): hver rad får **Skjul fra menyen** / **Vis i menyen**, og × for kalendere man har lagt til selv. Skjulte kalendere forsvinner fra lista og fra visningene. «Vis skjulte (N)» under lista.
- **+ Legg til kalender** → panel med tre faner:
  - **iCal-lenke:** URL (`webcal://` / `https://…ics`), navn (gjettes fra domenet) og farge → **Abonner**. Serveren henter lenken hver time (ETag / If-Modified-Since), lagrer kopi og viser «Abonnement»-merke.
  - **Home Assistant:** lister alle `calendar.*`-entiteter fra HA (`GET /api/calendars` med langtids-token fra Integrasjoner). Velg flere → **Legg til N kalendere**, med farger fordelt automatisk. Hendelser via `GET /api/calendars/{entity}?start&end`, merke «HA». Skriving tilbake (`calendar.create_event`) der entiteten støtter det.
  - **Konto:** Google Kalender, iCloud (app-spesifikt passord, CalDAV) og Outlook / Microsoft 365. Etter innlogging velger man **flere** kalendere fra kontoen.
- Alt synkes til profilen (`PUT /api/calendars/settings`) og gjelder også i Homelab, på web og i widgets.

## Homelab: velg flere kalendere
Fasit: `Bursdager.dc.html` (Innstillinger → Kalendere i Homelab-appen) → `g.cals`.
- «Kalendere som hentes (velg flere)» med teller «3 valgt». Chips: Bursdager, Familie, Kontakter (bursdager), Personlig, Jobb, Skole · Timeplan, Helligdager i Norge. Hver chip slås av/på (✓), og minst én må være valgt.
- Data: `g.cals: string[]` (behold `g.cal` = første for bakoverkompatibilitet). Alle valgte hentes, slås sammen og vises med kalenderens farge.

## Innstillinger nederst i sidemenyen
Fasit: `Kalender App.dc.html` → sidemenyen slutter med raden **⚙ Innstillinger** («Visning, utseende, varsler og Glimt»), plassert helt nederst (spacer over). Trykk åpner en fullskjermside som glir inn fra høyre (0,28 s), med **Ferdig**.
Visning, Utseende og Standardvarsel er **flyttet** hit fra sidemenyen. Sidemenyen inneholder nå bare kalenderne.
- **GENERELT** (segmenter):
  - **Uken starter:** Mandag / Søndag
  - **Åpne i:** Måned / Uke / 3 dager / Dag / Liste
  - **Standard varighet:** 30 min / 1 t / 1,5 t / 2 t (brukes av rød +)
  - **Tidslinje starter:** Nå / 06 / 08
- **VISNING:** Ukenummer, Vær.
- **UTSEENDE:** System / Lys / Mørk.
- **STANDARDVARSEL FOR NYE HENDELSER:** Ingen · 10 min · 30 min · 1 t · 1 dag.
- **VARSLER:**
  - Bursdager (kl. 09)
  - Studiefrister (3 d / 1 d)
  - Glimt-brief
  - Reisetid («dra nå», basert på sted og Entur/kart, av som standard)
- **GLIMT OG KONTO:**
  - **Glimt** åpner Glimt-innstillingene (samme som Homelab → Innstillinger → Glimt)
  - **Kontoer og synk** åpner «Legg til kalender → Konto»
  - **Widgets** (hjelp)
  - **Om Kalender**
- Bunn: «Kalender 1.0 · synket med Homelab nå».
- Alle valg lagres i profilen og synkes. «Uken starter» må også gjelde måned, år, uke, ukenummer-kolonnen og widgets.

## FEIL: Glimt svarer for i dag når man spør om i morgen
Årsak: spørsmålet ble ikke renset for tegnsetting. «Hva skjer i morgen**?**» matchet ikke `/ i morgen /` (krever mellomrom etter), og dagen falt tilbake til i dag.
Fiks (`ask()` i `Kalender App.dc.html`):
- Normaliser først: små bokstaver, fjern `? ! . , : ; « » "`, slå sammen mellomrom og pad med mellomrom.
- Dag-ord:
  - **overmorgen / overimorgen** → +2
  - **i morgen / imorgen / i morra / imorgo / tomorrow** → +1
  - **i dag / idag / i kveld / i natt / today / tonight** → 0
  - **i går** → −1
  - Ukedag («fredag», «neste fredag») og dato («25.10», «25. okt») som før.
- Svaret skal alltid nevne dagen eksplisitt («I morgen har du 3 hendelser …»), så det er tydelig hvilken dag som er lest.
- Gjelder også Glimt i Homelab-søket og chat. Lag én felles `parseDay()` og bruk den overalt.
- Test: «hva skjer i morgen?», «Hva skjer imorgen», «i morgen?», «hva har jeg på fredag», «what's on tomorrow».

## Zoom mellom visningene (År → Måned → 3 dager → Dag)
Fasit: `Kalender App.dc.html` → `zoomTo()`, `zoomStep()`, keyframes `kzIn` / `kzOut`, pinch i `ts/tmv/te`, `zWheel`.
- **Zoom inn:**
  - Trykk på en måned i **År** → **Måned**.
  - Trykk på en dag i **Måned** → **3 dager** som starter den dagen (tidligere Dag).
  - Spre to fingre (pinch ut > 1,22×): År → Måned → (Uke) → 3 dager → Dag.
  - Mac/trackpad: ctrl + hjul / pinch.
- **Zoom ut:** klyp sammen (< 0,82×), eller trykk på tittelen: Dag → 3 dager → Måned → År.
- **Animasjon:**
  - Inn: den nye visningen vokser fra **punktet man trykket eller klypte** (`transform-origin` = trykkpunkt), `scale(.55) → 1` + fade, 0,38 s `cubic-bezier(.2,.8,.2,1)`.
  - Ut: `scale(1.6) → 1`.
  - Fanene i visningsvelgeren bruker samme animasjon (retning etter rekkefølge).
  - Lett haptikk ved hvert nivå.
- Native: iOS `matchedGeometryEffect` på dagcellen → kolonnene i 3-dagersvisningen (ekte «zoom inn i dagen»). Android: `SharedTransitionLayout`. «Reduser bevegelse» betyr bare fade.

## Ukenummer tydeligere (oppdatert: enda tydeligere)
- **Nå:** IBM Plex Mono **800**, farge `--ink` (full tekstfarge). I Måned: tallet 12,5 px **uten bakgrunn** (ingen brikke), kolonnen 26 px bred. «U43» og «UKE 43» er 800 og 12–12,5 px.
- Tidligere versjon:
Ukenummer var for svakt (IBM Plex Mono 600, 9,5 px, `--mut2`). Nå:
- Måned: kolonnen `U` + tallene i **IBM Plex Mono 700, 11,5 px** (overskrift «U» 10,5 px), farge `--ink2` (`#3d3a33` lys / `#d6cfc2` mørk).
- Uke, 3 dager og Dag: «U43» øverst til venstre, 700, 11 px, `--ink2`.
- Liste: «UKE 43»-skillene, 700, 11 px, `--ink2`.
- Tittelens «UKE 43 · 2026» beholder rød aksent.

### Oppdatert zoom-kjede: År → Måned → **Uke** → 3 dager → Dag
- Trykk på en dag i **Måned** → **Uke** (uka med dagen), og den vokser fra dagen.
- Trykk på en dag (kolonnehodet) i **Uke** → **3 dager** fra den dagen. I 3 dager → **Dag**.
- Pinch og tittel-trykk følger samme kjede begge veier (Dag → 3 dager → Uke → Måned → År).

## Widgets: ukenummer
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.28.33.png` (liten iOS-widget uten uke).
- **Liten:** «UKE 43» rett til høyre for datoen (baseline-justert). IBM Plex Mono 800, 11,5 px, `--ink2`.
- **Medium:** «UKE 43» under måned og år i datokolonnen.
- **Stor:** har allerede «UKE 43» oppe til høyre. Android 2×2 viser «oktober 2026 · uke 43».
- Låseskjerm-rektangulær: «Man 19. okt · U43» i første linje, hvis det er plass.
- Ukenummer etter ISO 8601 (mandag-start). Følger innstillingen «Uken starter».


## FEIL 2026-10-19: «Neste prøve på skolen» gir Viaplay-prøveperioden
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.16.49.png`. Glimt svarer «Neste prøve skol er mandag 26. oktober …» med kortet «Viaplay-prøven slutter». Det samme skjer for «universitetet».
**Årsak:** generisk søk. Ordene strippes («skolen» → «skol»), og hvert ord som substring i tittelen gir treff. «prøve» matcher «Viaplay-**prøve**n», og skole-ordet ble brukt som søkeord i stedet for kontekst. Svaret gjentar også de strippede ordene («prøve skol»).
**Fiks** (fasit: `Kalender App.dc.html` → `ask()`, blokken før «neste»):
1. **Intensjon før tekstsøk:**
   - **Skoleprøve:** prøve/prøva/prøven/prøver/eksamen/test/quiz/midtveis/tentamen/heldagsprøve.
   - **Prøveperiode:** prøveperiode/prøvetid/gratisperiode/abonnement/trial eller et tjenestenavn. Går til Subscription OS / prøveperioder, ikke kalendersøk.
   - **Skolekontekst:** skole/skolen/universitet/uni/UiO/NTNU/OsloMet/høgskole/studie/klassen/fag. Avgrenser til **Studie-kalenderen** (`cal='s'` + timeplan-integrasjonen) og er **ikke** et søkeord.
2. Skoleprøve: velg hendelser i Studie med `kind:'prove'|'eksamen'` eller en tittel som matcher `/prøve|eksamen|test|quiz|midtveis|tentamen/i`. **Ekskluder** alltid prøveperiode-hendelser (`kind:'trial'` eller «-prøven slutter»).
3. **Svartekst** bygges fra hendelsen, ikke fra de strippede ordene: «Neste prøve på skolen er prøve i Fysikk 2 mandag 26. okt kl. 08:30, Rom B-204. Det er om 7 dager. Etter det: Eksamen IN2010 …». Kort for opptil 3 treff.
4. Ingen treff: «Jeg finner ingen prøver eller eksamener i Studie-kalenderen. Neste frist er …» (og ingen tilfeldig hendelse).
5. Prøveperiode-hendelser får `kind:'trial'` når de opprettes fra Subscription OS, så de aldri forveksles.
6. Generelt søk: `stop`-listen inneholder skole-ordene. Ikke strip «-en/-et» før matching. Bruk heller ordstamme-lister og krev at **alle** termer matcher (ikke `some`).
7. Gjelder også Homelab-søket og chat (felles `parseIntent()`).


## Glimt-arket: skrivefeltet kuttes i hjørnet (iPhone)
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.15.58.png`, `23.17.40.png`. «Spør Glimt …»-feltet og send-knappen går inn i skjermens hjørnerunding nederst.
- Bunnen av arket: **30 px + (safe-area − 20)** på iOS (≈ 44 px på iPhone med hjemstrek), 22 px på Android. 6 px når tastaturet er oppe (feltet ligger da rett over tastaturet).
- Sidemarg 12 → **16 px**, så den runde send-knappen ikke treffer hjørnekurven.
- Native: `.safeAreaInset(edge: .bottom)` + `.padding(.horizontal, 16)` / Compose `WindowInsets.navigationBars` + 16.dp.


## FEIL: grå farge rundt tastaturet i «Ny hendelse»
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.18.24.png`, `23.19.14.png`. Arket slutter der tastaturet starter. I de runde hjørnene på iOS-tastaturet (og under det) synes den grå dimmingen (`--dim`) i stedet for arkets kremfarge, og kalender-chipsene kuttes nederst.
**Fiks** (fasit: `Kalender App.dc.html` → arket `ns`, `nsPb`/`nsMax`):
1. **Arket går helt til bunnen av skjermen, bak tastaturet.** Det krymper ikke. I stedet får det `padding-bottom = tastaturhøyde + 16 px`, så innholdet kan scrolles over tastaturet. Under tastaturet har arket da samme farge (`--card`).
2. Sikkerhet: en ekstra flate i arkets farge under arket (`box-shadow: 0 260px 0 0 var(--card)`, eller et 260 px `::after`), så det aldri skinner dim igjennom under tastaturets avrundede hjørner eller under animasjonen.
3. `max-height` med tastatur: `100% − 40 px` (arket kan bli nesten fullhøyde). Ellers 90 %. Uten tastatur: `padding-bottom` 34 px (iOS) / 20 px.
4. Native:
   - iOS: sett `window.backgroundColor` og `WKWebView.scrollView.backgroundColor` til arkets farge mens arket er åpent, og `keyboardAppearance` `.light`/`.dark` etter tema.
   - Capacitor: `Keyboard.setResizeMode({mode:'none'})` + bruk `keyboardWillShow`-høyden som padding.
5. Mørkt tema: samme. Tastaturet blir mørkt (`color-scheme: dark`), og flaten bak er `--card` mørk.


## Studie: egen farge per fag
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.19.28.png`. Alle forelesningene (MEK1300, ELI1300, TRE1400) har samme grønne Studie-farge.
Fasit: `Kalender App.dc.html` → `fagKey()`, `CC()`, paletten `FAGP`.
- **Fag-nøkkel** for hendelser i Studie-kalenderen (og timeplan-integrasjonen):
  1. Emnekode i tittelen `/\b[A-ZÆØÅ]{2,5}\s?\d{3,4}\b/` (MEK1300, IN2010, TRE 1400 → TRE1400).
  2. Ellers første ord etter «Frist: / Prøve · / Eksamen / Forelesning / Øving / Lab / Seminar» («Fysikk», «Matematikk», «Norsk»).
- **Palett** med 8 farger som skiller seg tydelig fra hverandre, i samme stil som kalenderfargene, hver med `c`/`tx`/`lt` (lys og mørk tekst):
  - grønn `#2f7a4f`, blå `#2b5d8a`, rav `#a8661a`, lilla `#8a3fa0`, teal `#3d7f8a`, rosa `#c2477a`, indigo `#5b4fc4`, oliven `#7a8a2a`.
- **Tildeling:** nye fag får neste ledige farge. Lagres per bruker på serveren (`study_subject_colors {key, color}`), så det blir likt på alle enheter og ikke endrer seg.
- **Overstyring:**
  - Innstillinger → Kalendere → Studie → **Fag** viser en liste over fag med fargeprikk. Trykk gir fargevelger (samme swatches som kalenderne).
  - Hold inne en hendelse → «Farge for MEK1300».
- **Brukes overalt** der hendelsen vises: uke/3 d/dag-blokker, måned-chips, liste, detaljer, Glimt-kort, widgets og Homelab «I dag på skolen» og skolekalender.
- Studie-kalenderen beholder sin egen farge i sidemenyen og filteret. Bare hendelsene får fag-farge.
- Frister og prøver får samme fag-farge, med sterkere fyll (frist: 38 % i stedet for 22 %) og ikon.


## Søk: lukk tastaturet når en hendelse åpnes
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.20.15.png`. Søk «Nina» → trykk på et treff → detaljarket åpnes, men tastaturet blir stående og dekker halve arket.
- Når et treff åpnes (søk, liste, kort, Glimt-kort): **`blur()` aktivt felt før arket åpnes**. Fasit: `blurKb()` i `Kalender App.dc.html`, kalt fra `open()` og `cardV.go`.
- Søketeksten og treffene beholdes. Lukker man detaljarket, er man tilbake i søket uten tastatur. Trykk i feltet viser det igjen.
- Scroll i treff-listen lukker også tastaturet (`keyboardDismissMode = .onDrag` / `onScroll → blur`).
- Native: iOS `UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder)…)` eller `@FocusState = false`. Android `LocalFocusManager.clearFocus()` + `keyboardController.hide()`.


## Glimt legger til hendelse: adresse + kart
Ønske 2026-10-19: «når Glimt legger til hendelse, om det er fra Homelab-appen eller i Kalender med Glimt, legg ved adresse og et kart med adressen.»
Fasit: `Kalender App.dc.html` → `geoFor()`, `mapOf()`, detaljarket (`dt.map`) og Glimt-kortene (`mm.cards` → `c.hasMap`).

### Finne adressen
1. Står det et sted i teksten («hos Nina frisør», «på Majorstuen legesenter», «Hoffsveien 4»), slås det opp i rekkefølge:
   - **egne steder/kontakter** (Familie-soner, tidligere hendelser med samme tittel/sted)
   - **Google Places / Apple MapKit Search** (nærmest brukerens posisjon)
   - **Nominatim/Kartverket** som fallback
2. Fra innlimt SMS/e-post fra legekontor/frisør: ta adressen fra meldingen hvis den står der (regex for gateadresse + postnr).
3. Lagre på hendelsen: `loc` (navn), `address` (full adresse), `lat`, `lon`, `placeId`. Geokoding caches per adresse.
4. Er stedet usikkert (flere treff), velges det nærmeste. Glimt skriver «Fant Frisør Nina på Grünerløkka. Riktig?» med **Endre**.

### Visning
- **Glimt-svaret** (Kalender-arket og Homelab-søket/pillen): under hendelseskortet et **minikart** (120 px, radius 14, ikke interaktivt) med pin og en glass-etikett nederst med adressen. Trykk åpner veibeskrivelse.
  - I Homelab-pillen («✓ Lagt til»): adressen i undertittelen og et lite kart når pillen utvides.
- **Detaljarket** (alle hendelser med sted): under «Sted» et kart (170 px, radius 16) med pin, full adresse under, og knappene **Åpne i Kart** (Apple Maps på iOS / Google Maps på Android) + **Veibeskrivelse ›** (mørk).
- Kartet: native `MKMapView` / Google Maps Lite Mode (statisk). Web: MapLibre/OSM-tiles eller statisk kartbilde (`/api/maps/static?lat&lon&z=16`, cachet). Mørkt tema: mørk kartstil.
- Uten treff på adressen: bare tekst, og intet kart.
- **Reisetid** (valgfritt, anbefalt): «≈ 18 min med T-bane», og varsel justeres («Dra nå for å rekke 14:30»).
- Geokoding-cache: lagre treff permanent. Lagre bomtreff som `{fail: tidspunkt}` og prøv igjen etter 1 t (aldri permanent `false`). Prøv i rekkefølge: stedet → «…, Oslo» (brukerens by) → delen etter komma + by → uten første ledd.
- Etiketten bygges fra adressedeler: «Gate husnr, bydel/by» (Hoffsveien 4, Sofienlund), ikke rå `display_name`. Ellers brukes det brukeren skrev.
