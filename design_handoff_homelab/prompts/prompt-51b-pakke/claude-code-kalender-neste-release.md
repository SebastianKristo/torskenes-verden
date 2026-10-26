# Kalender: neste release – widgets for iOS, Android og One UI

Ta med alt i `claude-code-kalender-widgets-plattformer.md` i neste versjon av Kalender-appen. Fasit: `Kalender Widgets.dc.html`.
Versjon: øk minor (f.eks. 1.0.x → **1.1.0**), byggnummer +1. Gjelder iOS, Android og Mac samtidig.

## Innhold i releasen
**iOS / iPadOS (WidgetKit-extension `KalenderWidgets`)**
- Liten, Medium, Stor (måned + to neste, + via App Intent)
- Låseskjerm: inline, sirkulær, rektangulær
- StandBy/tonet modus (`.widgetAccentable()`)

**Android · Material You (Jetpack Glance, `KalenderWidgetReceiver`)**
- 2×2, 4×2, 4×3 agenda (skalerbar, `SizeMode.Responsive`), dynamiske farger

**Samsung · One UI**
- 2×2, 4×2, 4×4 måned med ‹ › og + (samme Glance-receiver; One UI-stil når `Build.MANUFACTURER == "samsung"`), følger One UI-gjennomsiktighet

**Mac** – eksisterende widgets får samme data/lenker (ingen nye størrelser).

## Oppgaver
1. iOS: legg til widget-extension i Xcode-prosjektet, App Group `group.no.kristo.kalender`, delt `EventStore` som leser samme database som appen. Tidslinje per hendelse-start/-slutt + midnatt.
2. Android: Glance-avhengighet, `GlanceAppWidget` per størrelse, `appwidget-provider`-XML med forhåndsvisning (`previewLayout` + `previewImage` for eldre launchere), `WorkManager` for oppdatering hvert 15. min + ved endring.
3. Dyplenker `kalender://dag/…`, `kalender://hendelse?id=…`, `kalender://ny` på alle plattformer.
4. Innstillinger i appen → **Widgets**: vis hvilke kalendere som tas med (standard alle), «Skjul fullførte i dag», og en knapp «Legg til widget» (`requestPinAppWidget` på Android; veiledning på iOS).
5. Sjekk at widgets vises i velgeren (se `claude-code-widgets-vises-ikke.md`): riktig `label`/`description`, ikon og forhåndsvisning.

## Test før publisering
- iPhone (iOS 17/18): alle størrelser, låseskjerm, StandBy, mørk modus, tonet ikonmodus.
- Pixel (Android 14/15): Material You med to ulike bakgrunner, skalering av agenda.
- Galaxy (One UI 6/7): 2×2/4×2/4×4, gjennomsiktighet 0/50/100 %, mørk modus, widgetstabel.
- Tom dag, mange hendelser, heldags + frist, bytte av dag ved midnatt, offline.
- Trykk på dato/hendelse/+ åpner riktig sted, også når appen er lukket.

## Utgivelsesnotater
**App Store / Google Play (norsk)**
> Nytt: widgets for hjemskjermen. Se dagens dato, uke og de neste avtalene i kalenderfargene dine. Velg mellom liten, medium og stor, eller månedsvisning. På iPhone finnes de også for låseskjermen, og på Samsung følger de One UI-stilen. Trykk på en avtale for å åpne den, eller på + for å legge til en ny.

**I appen («Nytt i 1.1», vises én gang etter oppdatering)**
- Tittel: «Kalender på hjemskjermen»
- Tekst: «Hold inne på hjemskjermen og legg til Kalender-widgeten.»
- Knapper: «Legg til widget» · «Senere»

## Distribusjon
Samme løp som før (`claude-code-kalender-oppdater-i-appen.md`): CI bygger, laster opp til `/api/apps/kalender/1.1.0/`, `latest` peker på 1.1.0, appen viser «Ny versjon» i Innstillinger → Oppdateringer.
