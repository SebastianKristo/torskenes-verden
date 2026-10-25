# iOS-plattform (prompt 51)

Widgets, Live Activities, Siri/Snarveier, Apple Watch, offline-modus og tilgjengelighet i FinansHub for iPhone og iPad.

## Widgets (nye)
Hold inne på Hjem-skjermen eller låseskjermen → **+** → FinansHub:

- **Planlegging · saldo** (liten, medium, låseskjerm): saldoen nå, laveste saldo de neste 30 dagene og prognosen som en strek. Data fra Planlegging (faste utgifter-kalenderen).
- **Sjekk inn** (liten, medium, låseskjerm): siste innsjekk («Sett av Ingrid») og knappene **Er framme**, **Hent meg** og **På vei hjem**. Knappene virker uten at du åpner appen.
- **Pakker · låseskjerm** (rektangel, rund, linje): hvor mange pakker som er på vei og klare for henting.
- **Avganger · live** (medium, stor, låseskjerm): nedtelling til de neste avgangene fra Hjem-stoppene. Bjelleknappen (**Følg**) viser «Bussen kommer om 3 min» på låseskjermen og i Dynamic Island.

## Live Activities
- **Buss**: start med bjelleknappen på avgangs-widgeten. Den teller ned av seg selv og forsvinner 2 min etter avgang. «Slutt å følge» fjerner den.
- **Pakker**: pakker som er ute for levering eller klare for henting vises automatisk (høyst to).
- **Nedlastinger**: nedlastinger i Media vises med samlet fremdrift og forsvinner når køen er tom eller satt på pause.
- **På vei hjem**: Vel fremme (som før).

Appen oppdaterer pakker og nedlastinger når den er åpen. Vil du ikke ha dem: Innstillinger på iPhone → FinansHub → Live Activities.

## Siri og Snarveier
Si for eksempel:
- «Sjekk inn i FinansHub» – sender «Er framme» til familien.
- «Hent meg med FinansHub» – «Hent meg» med høy prioritet.
- «Legg til på handlelisten i FinansHub» – Siri spør hva («melk»).
- «Hva er saldoen i FinansHub» – saldo nå og laveste de neste 30 dagene. Krever opplåst telefon.
- «Når går bussen i FinansHub» – de neste avgangene fra Hjem-stoppene.
- «På vei hjem i FinansHub» – starter Vel fremme.

Alle finnes også i Snarveier-appen under FinansHub.

## Apple Watch
Egen app, **FinansHub for Apple Watch**: Sjekk inn, Hent meg (med posisjonen din), Avganger, Handleliste og Glimt (snakk inn spørsmålet med diktering).

Innlogging: åpne appen på klokka → **Logg inn via iPhone**. iPhone viser «Logge inn på ny enhet?» – sjekk at tallet stemmer med klokka og godkjenn med Face ID. Klokka får sitt eget token (du kan logge den ut under Kontoer/enheter som andre enheter). Er FinansHub ikke åpen på iPhone, får du et varsel som åpner den.

Installering: klokke-appen er ikke med i FinansHub-.ipa-en (den bygges separat). Bygg og kjør `FinansHubWatch51` fra Xcode på en klokke som er paret med telefonen (krever egen Team ID for signering).

## Offline-modus
Uten nett lagres disse endringene i telefonen og sendes når nettet er tilbake: gjøremål (nye, endringer, sletting, deloppgaver), handlelisten, Sjekk inn og «Hent meg». Kvitteringer har egen kø som før.

- Du ser «Ingen nett. Lagret – sendes når du er på nett igjen.»
- Når nettet kommer tilbake: «2 endringer fra offline er sendt».
- Konflikt: siste endring vinner. Er det samme gjøremålet endret på en annen enhet i mellomtiden, får du et varsel. Er det slettet, forkastes endringen din (med varsel).

## Tilgjengelighet
- Systemtekst i appen følger nå **Dynamisk tekst** (Innstillinger → Tilgjengelighet → Skjerm og tekststørrelse). Store tall skaleres litt mindre, så kortene holder formen. Papir-fontene fulgte det allerede.
- Ikonknappene hadde allerede VoiceOver-etiketter (sjekket med skript); de nye widgetene, Live Activities og klokke-appen har etiketter og leses som én enhet.
- Kontrast: dempet tekst i lys Papir er mørkere (#6e685c, 4,8:1 mot bakgrunnen, WCAG AA).

## CI
Klokke-appen bygges med et eget steg (ikke med FinansHub):

```
xcodebuild -project FinansHub.xcodeproj -scheme FinansHubWatch51 -configuration Debug \
  -sdk watchsimulator -destination 'generic/platform=watchOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```
