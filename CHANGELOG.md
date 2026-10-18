# Endringslogg

Alle merkbare endringer i Homelab OS, FinansHub og mobilappene. Nyeste øverst. Versjonene med APK og IPA ligger under [Releases](https://github.com/SebastianKristo/torskenes-verden/releases).

## [4.10.2] – 18.10.2026
- **Flere Gemini-nøkler som reserve.** I FinansHub → Innstillinger → AI og tolkning legger du inn reservenøkler i rekkefølge.
  - Når en nøkkel svarer at kvoten er brukt opp (429), eller at den er ugyldig, brukes neste nøkkel med en gang.
  - Nøkkelen som er brukt opp, hviler til kvoten nullstilles: 1 minutt for minuttkvote, neste døgnskifte hos Google for dagskvote, og første dag i neste måned for månedskvote eller fakturering.
  - Hver nøkkel viser status (Aktiv, eller «Brukt opp til …»), og har knappene Test, Prøv igjen, ▲ (flytt opp) og Fjern. Bare de fire siste tegnene vises.
  - Gjelder all bruk av Gemini: kvitteringer, AI-søk, embeddings, Mat og sammendrag.

## [4.10.1] – 18.10.2026
- **Lokal OCR leser butikk og dato bedre:**
  - Kjente kjeder (REMA 1000, KIWI, Coop, MENY, Circle K, Elkjøp og mange flere) gjenkjennes hvor som helst på kvitteringen.
  - Ellers brukes linja over adressen, og gateadressen hoppes over. Navnet slås opp i Enhetsregisteret ut fra org.nr.
  - Datoen leses med vanlige OCR-feil (O/0, l/1) og med månedsnavn som «18. okt». Datoer som «best før», garanti og retur ignoreres.
  - Datoer fram i tid eller eldre enn fem år avvises.
- **Lokal OCR på tidligere kvitteringer:**
  - Hver kvittering har knappen «Les med lokal OCR», som viser resultatet side om side med det forrige før du velger.
  - Køen har «Les N som AI ikke klarte, med lokal OCR», som leser alle med feil eller manglende butikk eller beløp.
  - Finnes på web og i PWA-en (`POST /finans/api/receipts/:id/reanalyze {engine:'tesseract'}` og `POST /finans/api/receipts/ocr`).

## [4.10.0] – 18.10.2026 · prompt 16–17
- **Papir på alle skjermer i appene.** Innstillinger er gruppert som i designet: profil, Konto, Finans, appnavn og App, med Logg ut nederst.
- **Navn og ikon på appen:** velg et eget navn, for eksempel «Torskenes Verden», og et av tre nye ikoner (Hus, Monogram eller Fire rom).
  - iPhone: standard, mørk og tonet variant.
  - Android: Material You-ikon med monokromt lag.
  - Web: favicon og ikon på hjemskjermen.
- **Huskeliste (ny):** lister, forfall og hvem som skal gjøre hva. Lista deles i familien, oppdateres i sanntid og har widgets på iOS og Android.
- **Sanntid** via WebSocket for huskeliste, sporing og familie.
- **Familie:** fanene Kart, Soner og Helse, personkort med enhet og veibeskrivelse, og «Spill av lyd». Sonene sjekkes på telefonen.
- **Sporing:**
  - Velg flere og arkiver eller slett dem.
  - Ny fane Arkiv.
  - Ekte logoer i riktig størrelse.
  - ParcelsApp som reserve, med 3 oppslag i måneden. Oppslagene brukes bare når du selv ber om status.
- **Varsler samlet i Innstillinger:** stille timer, fem lyder eller din egen, volum, grupper og «Test varsel».
- **Vær:** «Yr mot Storm» sammenligner Yr med ECMWF i en graf og en 7-dagerstabell.
- **AI:**
  - AI-søket viser tydelig hvorfor det feiler.
  - Logg over alle AI-kall.
  - «Hvem gjør hva» lar deg velge motor per oppgave, med reserve.
  - Roboflow kan beskjære kvitteringer.
  - Strekkoder leses på serveren med zbar.
- **Lokal OCR-reserve (Tesseract):** kvitteringer leses uten AI når AI feiler. Kan slås av og på. Docker-imaget blir større.
- **Boliger:** nytt design på web med budsjett, farge, utgifter til gjennomgang med godkjenning, historikk og tilgang. Skann rett inn i en bolig fra mobilen.
- **Skanneknappen:** trykk åpner kameraet. Hold inne gir valg mellom Kvittering, Oppskrift, Bilder og Fil.
- **Mobil:** dra ned for å oppdatere, og innholdet scroller bak den røde +-knappen.
- **Homelab web:**
  - Kortene flytter seg først når du holder inne i 280 ms, så du kan markere, kopiere og lime inn tekst.
  - Menyer og nedtrekkslister lukker seg ikke lenger med en gang.
  - Søk i innstillinger tar imot skriving.
- **Nøkler i Integrasjoner lagres kryptert.**

### Gjenstår
- **Varsler for en bolig:** valget lagres, men ingen varsler bruker det ennå.
- **iOS:** godkjenning og budsjett i Boliger er ikke tatt i bruk, og strekkoder leses fortsatt med VisionKit.
- **Android:** sonene sjekkes av appen selv, ikke av Android sin innebygde sonevakt (geofencing).
- **Oslo-bilder fra Getty Images** kan ikke brukes uten lisens.

## [4.9.0] – 18.10.2026 · prompt 16
- **AI virker igjen.** Fire feil er rettet:
  - Standardmodellen var en Gemini-modell som er gått ut (`gemini-2.5-flash`). Nå brukes den nyeste flash-modellen, med automatisk bytte hvis en modell forsvinner.
  - AI-søket gikk ut på tid fordi den nye modellen tenker før den svarer.
  - Kallene ventet lenge når Ollama ikke svarte.
  - Feilene ble skjult. Nå vises den egentlige årsaken.
- **Nye AI-leverandører:** Groq (tekst og bilder) og en Roboflow-nøkkel, begge med testknapp.
- **Familie og kart (ny modul)** på web, PWA, iOS og Android:
  - Posisjon i sanntid med spor, fart og sensorer (batteri, lading, aktivitet og nøyaktighet).
  - Soner med varsel når noen kommer eller går, per person.
  - Personvern: pause, av, eller omtrentlig posisjon. Serveren håndhever valget.
  - Helse fra Apple Health og Health Connect. Bare det du velger deles.
- **Avganger:** egen side med flere avganger, plattform, sanntid og avvik. Du kan søke opp stopp i Entur og holde inne for å endre rekkefølge eller fjerne stopp.
- **Vær:** data fra MET (yr.no), og du kan søke opp, legge til og fjerne steder.
- **Papir på mobil:**
  - Innstillinger i Papir, med profil, bakgrunnsvelger og ikonfarger.
  - Redigerbar fanelinje: navn, ikon, rekkefølge, fjerne og legge til.
  - Sider åpner alltid øverst, og søkefeltet har Google-ikon.
  - Finans viser profilbilde og @brukernavn i stedet for fullt navn.
  - Aksjer og Boliger har fått fulle mobilsider.
  - Abonnementer har Hjem, Innsikt og Historikk i fanelinja.
- **Boliger på web:** ny meny med faner, kommende forfall, prosjekter med budsjett og dra-og-slipp av kvitteringer.

### Gjenstår
- **HealthKit ved sideloading:** jeg vet ikke om det godtas med gratis Apple-ID. Feiler installasjonen, fjern HealthKit-entitlementen i Sideloadly («Remove entitlements»).
- **Kart på iOS:** iOS bruker Apple Maps, ikke OpenStreetMap.
- **Undersider i Innstillinger:** de avanserte undersidene i iOS- og Android-appen har ikke fått Papir-layout.
- **Automatisk fjerde fane:** valget lagres som Domener på serveren og blir derfor ikke synket mellom enheter.

## [4.8.0] – 18.10.2026 · prompt 15
- **Tilpass hver side (Papir):** hold inne et kort, så vugger det dempet. Hvert kort får ▲, ▼ og − (skjul), og «Ferdig» står øverst. Det gjelder Hjem, Finans, Mat og Sporing, og valgene lagres per side og bruker.
- **Fanelinja:**
  - Flytende skanneknapp med Søk-fane. Du kan velge «I linjen» i stedet.
  - På Sporing blir knappen «Ny sending».
  - Fjerde fane er Domener, eller Sporing automatisk når pakker er på vei.
  - Finans-fanelinja kan tilpasses (opptil 4 faner + Mer).
- **Fold og iPad:** fanelinja blir en skinne til venstre, med bildet bak. Hjem får to kolonner, og Finn får flere kort i bredden.
- **Værapp i appene:** trykk på temperaturen. Du får timer, 7 dager, vind, måne, sol, UV og flere fliser, og et «Forhold»-ark med grafer. Dataene kommer fra Open-Meteo via serveren (`/api/weather/full`).
- **Finans:**
  - Banner for kvitteringer til gjennomgang.
  - 15 siste transaksjoner.
  - Detaljside med kvitteringen som papirlapp, endring av kategori og bankutskrift.
  - Søk med ✦ AI og Mer som rutenett.
  - Subscription OS på mobil.
  - Finn får en rad for «På vei».
- **Domener på mobil:** nytt toppkort med domenekort og perioder, og ett kort per domene i stedet for tabell. Tilbake går alltid til Hjem.
- **Hilsen etter tid på døgnet overalt** (God morgen / formiddag / ettermiddag / kveld / natt), på to linjer som krymper i stedet for å brytes.
- **Samsung-widgets:** navnet står under widgeten, og du kan slå det av og på under «Rediger widget».

### Gjenstår
- **Strekkodeskanning i «Ny sending»:**
  - iOS: virker med VisionKit.
  - Android: ikke bygget.
  - PWA: bare i nettlesere med BarcodeDetector.
- **PWA:** headerbildet scroller bort i stedet for at innholdet klippes under det. Rekkefølgen i Sporing er nullstilt én gang.
- **iOS:** arkene for å redigere abonnementer har fortsatt mørk stil.

## [4.7.1] – 18.10.2026
- **iOS Papir:** fanelinja står nå nederst, 12 pt over safe area i stedet for å flyte høyt over bunnen. Fotovinduet går helt opp under statuslinja, og innholdet i det tilpasser seg høyden på statuslinja.

## [4.7.0] – 18.10.2026 · prompt 14
- **Papir på mobil (PWA, iOS, Android):**
  - Hjem-fanen vises bare på Hjem. Finans har egen fanelinje (Oversikt, Liste, Finn, Mer, +), og Domener har sin (Oversikt, Publikum, Ytelse, Infra).
  - +-knappen: trykk for valg, hold inne for opplasting.
  - Finn som rutenett med bilder, netto i år, filtre og redigering av handler.
  - Sporing med faner, varsler og kilder, og omorganisering med langt trykk.
  - Fanelinja er senket og jevnt fordelt, og bakgrunnsvelgeren er egen.
  - Papir-innlogging med onboarding i 3 steg, og rettede farger i mørk Papir.
- **Bakgrunner** lagres på serveren (`/api/bg`) i stedet for å hente bildene fra Wikimedia. Oslo og Vær nå er illustrasjoner. Planeter er dagens NASA-bilde når serveren har nett.
- **Transportørlogoer** (PostNord, Posten, Bring, DHL, Helthjem, UPS, GLS, Instabox, Budbee) og **Ruter-farger** per linje.
- **Homelab Papir Web fullført:**
  - Flytende layout, egen bakgrunnsvelger og profilmeny.
  - Alle sider i avisstil, Rom med Starlink-kart og NASA-gallerier, og Domener med all statistikken.
  - Økonomi åpner FinansHub direkte.
- **FinansHub web:**
  - Finn-handler i nytt design (2a), og ny detaljvisning med lesbare overskrifter.
  - Innholdet starter ved sidemenyen, og Import er fjernet fra sidemenyen.
  - AI-knappen har fått riktig form.
  - Abonnementer kan redigeres og legges til med fakturadag og -måned, og med logo fra opplasting eller ✦ AI.
- **Nye installasjoner** får Papir som standard på web og mobil. Eksisterende valg beholdes.

### Gjenstår
- **iOS:** Domener i Papir bruker fortsatt den mørke klassiske visningen, og transportørlogoene vises som initialer.
- **Testing:** bevegelsene (hold inne og langt trykk) er bare testet i nettleseren, ikke på en telefon.

## [4.6.1] – 18.10.2026
- **Android-oppdatering uten å avinstallere:** APK-en signeres nå med en fast nøkkel (i stedet for en ny debug-nøkkel for hvert bygg), så nye versjoner installeres rett over den forrige. Fra 4.6.0 eller eldre må du avinstallere én siste gang.

## [4.6.0] – 18.10.2026 · prompt 13
- **FinansHub-temaer:** velg Nåværende (v2), Lys hovedbok, Mørk hovedbok eller Glød under Innstillinger → Utseende, og sidemenyen kan kollapses til bare ikoner. Valget lagres per bruker.
- **Homelab «Vindu og papir»:** nytt valgfritt tema med fotovindu (Oslo, Vær nå, Planeter, eget bilde), papir og avisspalter på dashbord, innlogging, innstillinger og Rom.
- **Nyhetsleser (RSS/Atom):** NRK, VG, E24, Aftenposten og Tek.no som standard, egne kilder, kategorifaner, ✦ AI-sammendrag og ✦ AI-kategorisering. Åpnes fra «SISTE NYTT ›» på web og fra Siste nytt i appene.
- **Mat (tidligere Matplan):** nytt design 2a, mapper, skanning av oppskrifter (bilde/PDF → AI), import fra nettside (JSON-LD, microdata eller AI, med forhåndsvisning) og lenker og filer per rett.
- **Mobil «Papir»:** nytt felles design for PWA, iOS og Android (lys/mørk), med fanene Hjem, Finans, Mat, Sporing, Mer og +Skann. Velg Klassisk eller Papir under Utseende → Mobildesign. Nyheter, Ruter og Yr åpnes i appene sine.
- **Finn-import fra e-post:** e-poster kobles til annonser du allerede har importert fra lenke, annonsen hentes fra finn.no etterpå, og du kan importere alle e-postene i Proton Mail-mappen **FINN**.
- Media i appene godtar app-token.

### Gjenstår
- iOS: Papir gjelder bare iPhone, og de klassiske sidene beholder mørk stil inne i lys Papir. Mer-siden mangler Media.
- Ruter- og Yr-lenkene er ikke testet mot appene på en telefon.

## [4.5.1] – 18.10.2026
- **iOS-widgets viste bare «Logg inn»:** den usignerte IPA-en manglet App Group i signaturen, så widgetene fikk ikke tilgang til innloggingen. IPA-en ad hoc-signeres nå med entitlements, og appen finner gruppen selv når AltStore/SideStore gir den nytt navn. Widgetene kan også hente fra lokal adresse.
- Ny **Innstillinger → Widgets** på iOS som viser om widgetene er koblet til appen, med «Oppdater widgetene nå».

## [4.5.0] – 18.10.2026 · prompt 12
- **Widgets:** iOS WidgetKit (Vær, Pakker, Budsjett, Finans, Neste trekk, Aksjer, Domener, Matplan, Finn, Boliger, Skann i liten/middels/stor) og Android Glance – 11 i Material You-stil og 11 i Samsung One UI-stil (4×1 søk, klokke + vær, FinansHub 4×4 m.m.). Data fra nye `GET /api/mobile/widgets` hvert 15. minutt, trykk åpner riktig side (`finanshub://`).
- **Import:** maler for DNB-kontoutskrift (Excel) og kortutskrift, kolonner via synonymer, og AI som finner formatet på ukjente filer og lagrer det som mal. Beløp som `11,616.00` og `1 234,50` tolkes riktig. Alt samlet i Innstillinger → Import, også Finn.no: .eml/.mbox, hent alle Finn-e-poster fra Proton Mail og lim inn annonselenker.
- **Skanning:** bilder med feil eller tom filtype (HEIC fra Filer, enkelte Android-gallerier) ble avvist – nå leses typen fra filen. Feil fra hver AI-motor vises med årsak, køen stopper ikke, og hvert steg logges. Ny **«✦ Analyser på nytt med Gemini»** med resultatene side om side (web, PWA, iOS, Android).
- **Søk:** Google-forslag og ny ✦ AI-modus på Homelab med feilmelding med årsak. Gemini-embeddings byttet til `gemini-embedding-001`.
- **Media:** eget kort med historikk (plakater, bruker, sesong/episode) fra Plex og Jellyfin.
- **Sporing:** leverte pakker vises ikke lenger som «registrert» (flere statuskoder, Finn-steg og e-postemner flytter status), transportørlogoer, og omorganisering med hold-inne på iOS.
- **Mobil:** enklere klokke/vær-kort, hilsen på to linjer, like høye kort i karusellen, kompakt Ruter-kort, ikonknapper og lavere Live-kort i Domener, Matplan følger appens tema i full høyde, «Netto i år» i designfarger. Domener på iOS feilet på dager uten måling – rettet.
- **iOS:** fargebakgrunnen virker, tilbake-sveip uten ikon. **Android:** «Samme overalt» eller «Egen farge per side» under Utseende → Sider, og HEIC-bilder konverteres alltid til JPEG.
- **Værkortet på web:** uten yr.no-lenker og nowcast-linje, tettere chips.

### Gjenstår
- Widgets bruker App Group på iOS, som krever signering; sideloadet IPA kan vise «Logg inn i FinansHub-appen» i widgetene.
- Tilbake-sveipet på iOS viser en dempet flate bak, ikke selve forrige side (appen bruker ikke NavigationStack).
- Ekte push-varsler.

## [4.4.0] – 18.10.2026 · prompt 11
- **Sporing:** ny Homelab-fane (web og mobil) for pakker fra Posten/Bring, PostNord, DHL, UPS og 17TRACK som reserve. Sporingsnumre hentes automatisk fra e-post og Finn-handler (Fiks ferdig), med filtre, tidslinje, arkiv og varselbrytere. Nøkler under Innstillinger → Integrasjoner → Sporing.
- **Dashboard:** Værmelding og Pakker i karusell nederst til høyre. Været hentes fra MET (Locationforecast, Nowcast og Sunrise), med kompakt kort og «Mer vær ▾».
- **Mobil:** karusell med klokke/vær og pakker på Homelab-hjem, Sporing-fane, nytt Aksjer-design som følger appens tema (med kursserie per aksje), nytt Subscription OS (Hjem/Innsikt/Historikk), haptikk-innstillinger, varselbrytere for sporing og sveip fra kanten for å gå tilbake på iOS.
- **Subscription OS på web:** fanene Oversikt og Kalender, AI-sparing, årsgraf per kategori, sorterbar tabell med «Lite brukt» og «Pris økt», helse 0–100, og «+ Legg til abonnement» (selv, fra kvittering eller fra transaksjoner).
- **Trading 212** ligger i FinansHub → Innstillinger → «Aksjer · Trading 212».
- **Søk:** korte søk (1–2 ord) bruker vanlig søk først, med «✦ Spør AI likevel».

### Gjenstår
- Ekte push-varsler fra serveren (i dag lokale varsler når appen er åpen).
- Transportør-API-ene og «Åpne hos …»-lenkene må testes mot ekte tjenester med egne nøkler.
- Haptikk virker ikke i nettleseren på iPhone (bare i appene og Android).

## [4.3.0] – 17.10.2026 · prompt 10
- **Matplan** ligger bare i Homelab (fjernet fra FinansHub), med API også på `/api/matplan`. **«Alltid på» Ma–Sø:** en rett kan være fast på flere ukedager (én fast rett per dag, valgfri kokk), og verken AI eller «Lag ny for uka» endrer faste dager. Ukekostnaden regnes mot «Mat og dagligvarer» på serveren.
- **FinansHub-sidemeny:** Oversikt, Transaksjoner, AI-søk, Kvitteringer, Budsjett, Faste utgifter, Kontoer, Aksjer, Rapporter, Subscription OS, Boliger, Finn-handler, Import, Innstillinger. Lagrede oppsett migreres.
- **Innstillinger → Boliger:** ny bolig, sletting i to steg, «Deling · N» med roller, oppsett av boligsiden (rekkefølge og vis/skjul per bruker) og kategorier for boliger med underkategorier. Boligsiden har ikke lenger Rediger/Del-knapper.
- **Boligkategorier med underkategorier** (Hage og uteområde › Blomster, Håndverker › Elektriker …). AI velger kategori etter skanning, opplasting eller kobling av transaksjon, og kan lage nye ✦-kategorier når det er slått på. **«Legg i bolig»** velger hvilken bolig utgiften havner i.
- **Finn-handler:** detaljside per handel med annonsen (✦ hentet fra finn.no med bilder lagret lokalt, eller lastet opp som PDF/skjermbilde), original kvittering, e-poster i handelen (koblet automatisk fra Proton Mail på Finn-kode, ordre- eller sporingsnummer) og egne bilder. Steg Betalt → Sendt → Mottatt → Godkjent / Solgt → Sendt → Levert → Utbetalt.
- **Finn-fane på mobil (design 2a)** i stedet for Budsjett, på web og i appene. Budsjett ligger øverst under Mer og kan slås på igjen.
- **Nytt app-ikon:** tak over tre søyler. iOS med lys, mørk og tonet variant; Android adaptivt ikon med monokrom lag (Material You «Tematiske ikoner»); nye PWA-ikoner med `maskable` og `monochrome`.
- **Trading 212:** dashbordet og FinansHub bruker samme nøkkel, og nøkkel, secret og miljø hentes alltid fra samme kilde.
- **E-post:** Bridge-imaget har libfido2, åpnede e-poster hentes når «Lest»-mappen finnes, Finn-e-poster i kvitteringsmappen går til Finn-handler, og «Kjør nå» viser feil.

### Gjenstår
- Icon Composer-ikon (`.icon`) med «Klar» Liquid Glass-variant – krever Xcode 26 i alle CI-jobber.
- Automatiske tester for boligkategorier og oppsett av boligsiden.
- Deling av boliger på mobil ligger fortsatt på boligsiden, ikke i mobilinnstillingene.
- Push-varsler.

## [4.2.0] – 17.10.2026 · prompt 09
- **Søk:** vanlig søk i butikker, bankstekst, kategorier, notater og varelinjer (med bøying), som reserve når AI-søk ikke svarer. «Sist jeg var på X», «kvitteringer med tomater», måneder, «over 500 kr», «største utgift», «til gjennomgang». Hvert treff viser hvorfor det traff, med «Prøv også» og «Flere forslag».
- **iPhone:** systemets fanelinje med drabar Liquid Glass-markør, Skann og tannhjul som runde glassknapper i samme rad, tilbakepil og profilbilde på samme rad.
- **Mobil:** Domener med alt fra PC (domenekort, verdenskart, 90 dagers oppetid, DNS, administrer domener). Ny Matplan med lyst «matapp»-design og mørk modus. Designstil iOS/Material per enhet, Material You i OKLCH, valgfri startside, redigerbar navigasjonslinje.
- Kartdata for Domener godtar app-token.

## [4.1.0] – 17.10.2026 · prompt 08
- **Innstillinger** bygget om: profil og søk i sidemenyen, gruppene Generelt, Tilkoblinger og Sikkerhet, ekte logoer for integrasjoner, «Lås skjermen» og «Logg ut».
- **Plex og Jellyfin:** Media-kort på dashbordet (spilles nå, nylig lagt til) med innstillinger og tilkoblingstest.
- **Trading 212:** riktig Basic-header med nøkkel og secret, rensing av limte verdier, Live/Demo lagres med nøkkelen, egne feilmeldinger og «Test tilkobling».
- **Kvitteringer fra Proton Mail** via Bridge (IMAP, STARTTLS med pinnet sertifikat, duplikatsjekk, flytting til «Lest»). Finn-e-poster går til Finn-handler.
- Snarveier med ekte logoer, Norgeskart under Starlink på Rom, Matplan-bakgrunn på alle faner unntatt Dashboard, fikset helsesjekk mot selvsignerte sertifikater.

## [4.0.0] – 17.10.2026 · prompt 05–07
- **Brukere og tofaktor:** flere brukere (admin/bruker), innlogging med brukernavn, TOTP med gjenopprettingskoder, pålitelige enheter per bruker, førstegangsoppsett av ny server, profilbilde.
- **FinansHub:** Aksjer (Trading 212), ✦ AI-søk, Subscription OS med 2-årig trekk, Boliger (tidligere Delte mapper) med prosjekter, avdrag og regninger, backup til JSON/Excel/CSV og kryptert SMB-share, redigerbar sidemeny, original bankrad og kvittering.
- **Homelab:** Google-søk med historikk, flyttbar topplinje, redigerbare faner, Domener med verdenskart, nytt Matplan-design, tilkoblingstester, innstillinger med grupperte lister.
- **Mobil:** Homelab som startside med redigerbar forside, Mer med alle funksjoner, redigering av transaksjoner, flere kontoer, biometrisk lås, Material You og lys/mørk modus.
- **Release:** APK og IPA bygges i GitHub Actions og legges i Releases.

## Tidligere (prompt 01–04)
- Homelab-dashboard med Ruter, vær, skolekalender, Trading 212, energi, Sonarr/Radarr, nyhetslinje, Starlink og NASA, og offentlig CV.
- FinansHub med AI-lesing av kvitteringer (Ollama/Gemini), bankimport, budsjett, faste utgifter, rapporter, logoer og ✦-sammendrag, Finn-handler og import.
- PWA og native apper for iOS og Android.
- Drift: Docker, Cloudflare Tunnel, Proxmox-skript, Unraid-mal og image på GHCR.
