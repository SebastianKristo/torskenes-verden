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
