# Prompt 27

Startet 2026-10-18.

## Ønsker

- 2026-10-19: «gjør planet bilde litt mindre» (vedlegg: hero på Dashboard med jordkloden)
  - `Homelab Papir Web.dc.html`: med bakgrunnen «Planeter» vises bildet som ~62 % av bredden (ikke `cover`), sentrert på svart bakgrunn, så hele kloden synes. Andre bakgrunner er uendret.
- 2026-10-19: «når jeg feks i finans skal søke etter enkel ting som butikk navn eller noe vis søkeresulatt litt som google, hvis jar har skrevet bloms gi mulige treff fra fatkiste ting i finans som blomsterlandet.»
  - `Mobil Papir App.dc.html` (Finans → Søk): forslag dukker opp under søkefeltet mens du skriver (som Google). Opptil 6 treff fra butikker, kategorier og varelinjer i ekte transaksjoner, f.eks. «bloms» → **Blomsterlandet Ski**.
  - Delen du har skrevet står i vanlig vekt, resten i fet. Under navnet: type (Butikk / Kategori / Vare), antall kjøp og sum.
  - Treff på starten av navnet rangeres først, så starten av et ord, så inni ordet, så skrivefeil (1 tegn feil fra 4 tegn, f.eks. «blosm»). Butikker går foran kategorier og varer ved lik score.
  - Trykk på et forslag søker på det. ↖ fyller inn navnet uten å søke. Enter lukker forslagene og viser treff.
  - Se `claude-code-finans-sokeforslag.md`.
- 2026-10-19: «og hvordan er ollama til å finne logoer, jeg har en kittering fra blomsterlandet som den ikke fant logog til og hjalp ikke p prøve ai for å finne heller»
  - Svar: Ollama har ikke internett og finner på URL-er. AI skal bare rydde butikknavnet, og koden henter logoen (Brreg → domene → apple-touch-icon/favicon → logo-tjeneste → klipp fra kvitteringen med bildemodell → velg manuelt).
  - Se `claude-code-logo-oppslag.md`.
- 2026-10-19: «hvis ollama skanner hvitteringen og så tar gemini og får beskjed om å finne logoen til butikken. gemini har derfor ikke lesetilgang til noe i kvitteringen uten om butikk navnet.»
  - `Mobil Papir App.dc.html` → Innstillinger → AI og tolkning: ny gruppe **PERSONVERN OG LOGOER** med «Les kvitteringer lokalt» (Ollama, på), «Finn logo med Gemini» (bare butikknavnet, på) og «Sjekk logoen før den lagres» (på).
  - `claude-code-logo-oppslag.md` oppdatert: Ollama leser hele kvitteringen lokalt, Gemini får bare butikknavnet og foreslår domene med Google Search, koden henter og sjekker logoen.
- 2026-10-19: «når jeg har et søkefelt åpent hvor som helst og jeg har skrevet noe i det hvis en x som kan fjeren alt jeg har skrevet i venster i søke boksen»
  - Alle søkefelt: når det står tekst i feltet, byttes forstørrelsesglasset til venstre ut med en **✕** (26 px sirkel, 36 px trykkflate). Trykk tømmer feltet, lukker forslag og treff, og tastaturet blir stående (fokus beholdes).
  - Gjelder: `Mobil Papir App.dc.html` (Finans → Søk, Finans → Liste, Innstillinger, Avganger → Mine stopp; høyre-× i Innstillinger er fjernet), `Boliger.dc.html`, `Bursdager.dc.html`, `Vaer.dc.html` (finn sted), `Nyhetsleser.dc.html` (ikonsøk), `Matplan.dc.html`, `Homelab Papir Web.dc.html` (Google-søket på Dashboard, ✕ etter «Google»).
  - Se `claude-code-tom-sok.md`.
- 2026-10-19: «er deg også mulig å bygge inn en side i appen for ollama en side som ligner på ollama og chat gpt appen, med historikk og alt sånt med samm funkjsoner som open webui.»
  - Svar i skjema: fane og Mer (valgfritt i navbar-redigering) · iPhone, Android, Fold og web · tema Papir og Nøytral · alle Open WebUI-funksjoner unntatt sammenligning · Ollama + Gemini/Groq merket lokal/sky · kan lese mine data med bryter · bygges rett inn i appene · historikk synkes · ingen privat modus · spør før data sendes til sky.
  - «legg da også til et ai tegn på øyere side i googl search bar på hjem. som bruker denne»
  - `Mobil Papir App.dc.html`: ny side **Chat** (fullskjerm, Fold med fast sidepanel), rad i Mer, valgbar fane, ✦ AI i Google-feltet på Hjem, gruppe CHAT i Innstillinger → AI og tolkning.
  - `Homelab Papir Web.dc.html`: fane **Chat** og ✦ AI i Google-søket på Dashboard.
  - Se `claude-code-chat.md`.
- 2026-10-19: «Nyhetsleser, gi meg litt mer info om artikkel i nyhetsleser når jeg åpner den. Kansje legg ved et bilde i nyhetsleser ved sida hver annonse.»
  - `Nyhetsleser.dc.html`: bilde ved hver sak, og saken åpnes i appen med stort bilde, ✦ AI-sammendrag, hovedpunkter, «Les hele saken» og «Mer om …». Se `claude-code-nyheter-artikkel.md`.
- 2026-10-19: «I hjem la meg redigere hvilke stopp som vises på ruter kortet på hjem lag også ruter widgets for iOS androdi og samsung.»
  - `Mobil Papir App.dc.html`: «Velg stopp» på Avganger-kortet (opptil 3 stopp, 1–4 avganger). `Widgets.dc.html`: ny rad 2a–2c med Ruter-widgets. Se `claude-code-ruter-hjem.md`.
- 2026-10-19: «Fjern widgets fra bunnen av kalender.»
- 2026-10-19: «Kalender vister ingen timer selvom neste time er om 1 time. Den viser bare neste eksamen om 2 måneder. Lag en fullverdig kalender gi den egen navnar og full høyde uten bakgrunnen på toppen. Akkurat nå er kalenes mer en flott ide men ikke så funksjonen og rask å bruke som feks google kalender eller apple kalender.»
  - `Kalender.dc.html` bygget på nytt (gammel: `Kalender v1.dc.html`): NESTE/NÅ-stripe, Dag/3 dager/Uke/Måned/Liste med egen fanelinje, fullskjerm på mobil, ny/rediger hendelse, søk, kalenderfilter, sveip og hurtigtaster. Widgetene nederst er fjernet. Se `claude-code-kalender-v2.md` (RRULE-feilen).
- 2026-10-19: «Gi dashboard både fult engelsk og norsk støtte, dett kan man velge i onboarding eller i innstlinger.»
  - `Homelab Papir Web.dc.html` + `i18n.js`: språkvalg i onboarding steg 1 og i profilmenyen. Se `claude-code-sprak.md`.
- 2026-10-19: «For ny abonnoomeneter, jeg bør kune ta skjerbilde og så ollama finne ut av hva aboonomenter er plan navn pris trekkdato.»
  - `Subscription OS.dc.html`: «Fra skjermbilde» i Legg til-menyen. Se `claude-code-abo-skjermbilde.md`.

## Tilhørende filer

- `claude-code-finans-sokeforslag.md`
- `claude-code-logo-oppslag.md`
- `claude-code-tom-sok.md`
- `claude-code-chat.md`
- `claude-code-nyheter-artikkel.md`
- `claude-code-ruter-hjem.md`
- `claude-code-kalender-v2.md`
- `claude-code-sprak.md`
- `claude-code-abo-skjermbilde.md`
