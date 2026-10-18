# Endringslogg

Alle merkbare endringer i Homelab OS, FinansHub og mobilappene. Nyeste øverst. Versjonene med APK og IPA ligger under [Releases](https://github.com/SebastianKristo/torskenes-verden/releases).

## [4.19.0] – 18.10.2026 · prompt 26
- **Kalender (ny):** skoletimeplanen på web og i appene, under Mer → Kalender.
  - Nå-kort med time, rom og lærer, minutter igjen og fremdriftslinje.
  - «Prøver og frister» med nedtelling.
  - Visningene Uke, Måned og Agenda, med filter, detaljkort, påminnelse og MazeMap-lenke.
  - Data fra skolens iCal og Canvas, i tillegg til Bursdager og Google Kalender. Gjentakende timer, flyttede timer og planleggingsdager håndteres. En prøve erstatter timen den overlapper.
  - Hold inne et kort for å flytte (▲ ▼) eller skjule (−) det.
  - Widgets i tre størrelser på iPhone, Android (Material You) og Samsung (One UI). De oppdateres når hver time starter og slutter. Det finnes også en Kalender-widget på Hjem.
- **Innstillinger → Kalendere:** Google Kalender, Home Assistant, skole-iCal og Canvas er samlet her. Bursdager-siden har en lenke hit.
- **Integrasjoner i appene som på web:**
  - Listen er gruppert, og hver integrasjon har farget merke, navn, beskrivelse og status.
  - Hver integrasjon har en egen side med oppsett, «Slik gjør du», Test og Fjern.
- **Sporing:** velg tjenesten selv: Auto, Posten, Bring, PostNord, DHL, Helthjem, UPS, Budbee, Instabox eller ParcelsApp. Valget gjøres for nye pakker, eller med hold inne → «Spor via». E-post endrer ikke valget.
- **Finans-fanelinjen:** hold inne for å endre navn, ikon og rekkefølge, eller legge til og fjerne faner. Det fungerer som på Hjem.
- **Trykk på aktiv fane** går til fanens rot, for eksempel fra Bursdager tilbake til Mer. Et nytt trykk scroller til toppen.

## [4.18.0] – 18.10.2026 · alt individuelt per bruker
- **Hver bruker har sine egne data, også andre admins.** Bare Boliger deles, og bare med dem du inviterer.
  - **FinansHub:** eget regnskap for hver bruker. Gjelder kontoer, transaksjoner, kvitteringer, budsjett, faste utgifter, abonnementer, Finn, AI-søk og -logg, e-postimport, Trading 212, innstillinger og backup av egne data.
  - **Egne integrasjoner:** Plex/Jellyfin, Sonarr/Radarr, kalender, Trading 212, e-post (IMAP), Mybring/PostNord/ParcelsApp og Finn. Integrasjoner viser «Dine integrasjoner» og «Server (administrator)».
  - **Sporing, Mat og Hjem** er per bruker. Varsler og sanntid går bare til den som eier dataene.
  - **Serveroppsett** kan bare admin endre: AI-motorer, nøkler, Home Assistant, Cloudflare/Domener, Entur, kart og SMB-backup. Andre ser «Settes opp av administrator». Alle kan likevel bruke AI-motorene.
  - **Eksisterende data** tilhører eieren av serveren. Ingenting er slettet. Andre brukere starter med tomt regnskap.
- **PostNord uten nøkkel:** sporingslenke til postnord.no/pakkesporing, og status hentes fra PostNords offentlige sporing. Det er ikke et offisielt API. Reserven er ParcelsApp.
- **AI-tidsgrense på serveren:** serverdelen av 30 s-rettelsen er nå med. Ollama-svaret strømmer inn mens det skrives, og AI-søk kjøres som jobb.
- **Ta backup før du oppdaterer serveren.** Databasen bygges om for per-bruker-data.

## [4.17.0] – 18.10.2026 · prompt 25
- **AI-søket stopper ikke lenger etter 30 s.** Søket venter så lenge tidsgrensen du har satt for motoren, også i Android-appen, iOS-appen og på serveren. Har du satt Ollama til 60 s, venter søket opptil 60 s.
  - Ollama strømmer svaret og holder modellen lastet i 10 minutter, så den ikke må lastes på nytt mellom hvert søk.
  - Lange søk kjøres som jobb, med «✦ Ollama tenker … 34 s av 60 s», fremdriftslinje og Avbryt.
  - Svarer ikke motoren i tide, står det hvilken motor og hvilken grense, for eksempel «Ollama svarte ikke innen 60 s», og søket går videre til neste motor.
- **Galaxy Fold og iPad:**
  - Ikonene i sidelinjen vises som ikoner igjen, ikke som teksten «cre», «for» og «squ».
  - Sidelinjen har samme farge som fanelinjen på telefonen.
  - En rød Hjem-knapp ligger øverst når du ikke er på Hjem.
  - Værsiden bruker to kolonner, med værkart rett på siden og detaljark i et sidepanel.
- **Fanelinje-stil:** velg mellom «Tekst», «Bare ikoner» og «Ikoner + navn på valgt», under Innstillinger eller «Rediger fanelinjen», med forhåndsvisning.
- **Mer** har ikoner ved hver rad.
- **«Ta meg dit →»** etter AI-søk i Innstillinger åpner riktig side og markerer innstillingen.
- **Innlogging og oppsett på web** i Papir-design: tofaktor, og oppsett i fire steg.
- **Apple Health på iOS:** viser hvorfor appen ikke får spørre om tilgang. Vanligste grunn er at sideloading-verktøyet har fjernet HealthKit fra profilen.
- **Google Kalender:**
  - «Test tilkobling» virker på web.
  - Etter innlogging via en offentlig adresse kommer du tilbake til adressen du startet fra.

## [4.16.0] – 18.10.2026 · prompt 24
- **Bursdager (ny):** finnes på web, i appene og i PWA.
  - Viser neste bursdag, søk, en liste per måned med alder og dager igjen, og legg til, rediger og slett.
  - Kobles til Google Kalender (innlogging, egen kalender, bursdager fra kontakter) og Home Assistant (import og synk begge veier).
  - Påminnelse kl. 09:00.
  - Widgets: på Hjem, på iOS (liten, medium og låseskjerm) og på Android (Material You).
- **Samsung-widgets:** egne widgets for Samsung-telefoner i samme størrelse som Samsungs Vær-widget (134 × 155 dp, radius 20). Gjelder Skann, Huskeliste, Bursdager, Sporing, Avganger og Saldo.
- **Lik layout på iOS og Android:** Ruter-visningen og Mer-menyen er bygd likt etter designet.
  - Ruter har ingen fanelinje eller logo.
  - Fanelinje-ikonene har riktig størrelse og høyde.
- **Familie:**
  - Én person vises én gang, selv med flere telefoner («· 2 enheter»). Du velger selv hvilken enhet posisjonen skal komme fra.
  - Helsedata telles ikke dobbelt.
  - iPhone og iPad bruker Apple Maps igjen.
- **Profiler** under Innstillinger → Profil: Standard, Finans + Boliger og Boliger-profil.
  - «Finans + Boliger» åpner rett i Boliger, og Hjem ligger under Mer.
  - Boliger viser domene-statistikk øverst.
- **Boliger:**
  - Toppbildet følger valgt bolig, og Strømstad-bildet følger med som valg.
  - Hold inne på en bolig for å redigere navn, adresse, budsjett, farge og bakgrunn.
- **Innstillinger:**
  - Søk og ✦ AI-søk.
  - Alle integrasjoner er samlet under Integrasjoner, med status, redigering og test. Hemmelige verdier lagres kryptert på serveren.
- **App-ikon og app-navn kan byttes på Android** (activity-alias). Navnet vises også inne i appen.
- **Pakker-widgeten vises alltid på Hjem.** Nye widgets legges til uten å fjerne noe.
- **Nyhetsleser:** ikonene vises med en gang.

## [4.15.0] – 18.10.2026 · prompt 23
- **Sveip tilbake viser forrige side:** når du sveiper fra venstre kant, ligger forrige side bak med parallakse og slør. Den er aldri svart. Android bruker Predictive Back, og PWA har samme gest.
- **Scrollposisjonen huskes:** går du inn i en underside og tilbake, havner du der du var. Nye undersider åpner øverst.
- **«Mer» følger modulen:** på Aksjer, Kvitteringer og de andre Finans-undersidene åpner «Mer» Finans → Mer.
- **Kvitteringer i Papir:**
  - «Ta bilde av kvittering» bruker dokumentskanneren på iOS. «Bilder» og «Filer» ligger rett under.
  - KØ viser status, for eksempel «Gemini svarte ikke innen 20 s · prøver Groq».
  - Under «Til gjennomgang» kan du redigere, godkjenne, analysere på nytt og slette.
  - «Bokført» har ↺ for å angre.
- **Aksjer:** nøyaktig kopi av designet, uten skann-knapp.
- **Abonnementer:**
  - Nøyaktig kopi av designet: første kort ligger opp i toppbildet, og tittelen står ikke lenger to ganger.
  - Hold inne og dra for å endre rekkefølgen på kortene.
  - «Endre abonnement» har fått Papir-farger.
- **Finn-annonsen åpnes i appen og på web:**
  - Viser bildekarusell, pris, Fiks ferdig, «Om annonsen», beskrivelse, e-poster fra Proton og meldinger.
  - Annonsen og bildene lagres lokalt, så de kan vises selv om annonsen er fjernet fra Finn.
- **Ikoner på fanene i Nyhetsleser:** la AI velge, eller søk i over 200 åpne ikonbiblioteker via Iconify. Ikonene caches på serveren.
- **Tidsgrenser for AI:** egen grense per motor (Gemini 20 s, Groq 15 s, Roboflow 15 s, Ollama 45 s), 0–3 nye forsøk, og valget om å prøve neste motor, bruke lokal OCR eller legge kvitteringen i kø.
- **Innstillinger → App → Integrasjoner:** Home Assistant med tilkobling og synk av Huskeliste.

## [4.14.0] – 18.10.2026 · prompt 22
- **Familie har fått nytt design**, likt på iOS, Android og web:
  - Fanelinje nederst med Kart · Soner · Helse · Mer, uten skann-knapp. Verktøyraden ligger over kartet.
  - Kartet bruker Kartverket topo. Hver sone har ikon og farge, og personene vises med profilbilde, fart og spor.
  - Soner kan nå få ett av 13 ikoner og en hvilken som helst farge.
  - Du kan sette et eget bilde på hver person. Bildet er bare synlig for deg.
- **Ny værside**:
  - Egen systemfont på værsiden.
  - Kartknapp nede til venstre åpner Windy med nedbør, temperatur, vind og skyer.
  - ☰ nede til høyre åpner Steder. Hold inne og dra for å endre rekkefølgen, og sveip mot høyre for å slette.
  - Animert bakgrunn etter været, med stjerner, dempet sol, skyer, regn, snø, tåke og lyn.
  - Kortet «Yr og Pent» sammenligner Yr med Pent (StormGeo-modell). Pent vises i oransje i timeraden.
  - Alle kort har detaljark med 7-dagers velger og graf: UV, føles som, nedbør, sikt, luftfuktighet, lufttrykk, vind, sol og måne.
- **Lys hovedbok er standardtema** i FinansHub for nye brukere og enheter. Det gamle designet heter nå «Nåværende (FinansHub v2)» under Utseende. Brukere som har valgt tema selv, beholder valget.
- **Huskeliste:**
  - «Ny oppgave …» ligger fast over fanelinjen, og knappen er nå «+».
  - Valgte chips er fylt.
  - Synk med Home Assistant To-do går begge veier, både lister og oppgaver. Bare admin kan koble listene.
- **Sporing:**
  - Status hentes fra Mybring og PostNord, med ParcelsApp som reserve. Den sjekkes straks pakken er funnet og deretter jevnlig.
  - Pakker som allerede er levert, går rett til Arkiv.
  - Siste hendelse, tidslinje og feilmelding vises.
  - Logoene til fraktselskapene er kontrollert manuelt. Posten får ikke lenger feil logo.
  - Legg inn Mybring- og PostNord-nøkler under Integrasjoner → Sporing.
- **Google-«G»** i søket bruker de offisielle banene.

## [4.13.0] – 18.10.2026 · brukerskille og prompt 21
- **Android krasjet ved oppstart:** appen krasjet hver gang den ble åpnet, sannsynligvis siden 4.11.0. Oppstartskoden brukte deler av appen som ikke var klare ennå. Dette er rettet.
- **Brukerskille:** hver bruker ser bare sine egne data. Unntakene er det som deles i FinansHub (Boliger og Delte mapper) og det du selv velger å dele.
  - **Admin-data:** Trading 212, skolekalenderen, Plex/Jellyfin og Integrasjoner vises bare for admin. Vanlige brukere ser ikke adresser, nøkler eller URL-er.
  - **Huskeliste:** hver liste har en eier. Eieren kan dele listen med utvalgte personer («Del liste»), og den du deler med kan forlate listen. Sanntidsoppdateringer går bare til dem som har tilgang.
  - **Familie:** deling er av som standard. Alle må slå på deling av posisjon på nytt etter oppdateringen.
    - Du ser bare dem som deler med deg.
    - Helse vises aldri når delingen er av.
    - Soner er dine egne til du slår på «Del med familien», og bare eieren kan endre dem.
  - **Boliger:** kvitteringer en bruker laster opp til en bolig, vises ikke for admin hvis admin ikke er medlem av boligen. Bare admin kan endre bolig-kategorier.
  - **Filer:** en fil kan bare hentes av den som eier den, og av admin.
  - **Brukerliste:** vanlige brukere ser bare navn og bilde av andre, ikke brukernavn eller rolle.
  - **Web og PWA:** ved utlogging og bytte av bruker tømmes cachene. Opplastingskøen for kvitteringer er nå per bruker.
  - **iOS og Android:**
    - Widgetene, opplastingskøen og innstillingene for familie og helse lagres per konto.
    - Posisjon og helse sendes bare for kontoen som har slått på deling.
- **Bakgrunner med ekte foto** (prompt 21): Oslo, Vær nå og Planeter er fotografier fra Wikimedia Commons og NASA, ikke tegninger. Planeter viser nå Jorda, Månen, Jupiter, Mars og Saturn. Fotoene følger med i serveren, og kildene er kreditert.
- **Kart:** Kartverket topo er standard. CARTO viste «API KEY REQUIRED».
- **Familie i appene:** fanelinjen nederst viser Kart, Soner, Helse og Mer.
- **Avganger:** trykk på en avgang for å se holdeplassene på turen, med plattform, forsinkelse og «Åpne i Ruter ›».
- **Pakker:** pakkekortet viser butikkens logo med et lite merke for fraktselskapet. Tittelen er varen eller butikken, ikke sporingsnummeret, og antallet vises som «+N pakker ›».
- **Hjem-widgets:** hold inne for å flytte dem. Siden åpnes ikke lenger ved et langt trykk, og et trykk mens du redigerer gjør ingenting. Finans-flisene kan dras på samme måte, og redigeringslinjen er en hvit pille.
- **Kvitteringer:** streken over køen er borte.
- **Finans-flisene:** fargene er justert.
- **Logoer:** flere alias, blant annet Tv2, Squarespace og «Claue». Admin kan velge domene for en logo selv.

## [4.12.0] – 18.10.2026 · prompt 20
- **Logobibliotek:** 368 norske butikker, kjeder og tjenester, sortert i 15 kategorier, følger med i serveren. 343 av dem har ferdig nedlastet logo, så logoene vises uten oppslag på nett.
  - Banktekster som `VIPPS*KIWI 123`, `KLARNA*KOMPLETT.NO`, `IZ *RUTER` og `ELKJOP STORO` gjenkjennes.
  - Coop Extra, Coop Obs, Coop Prix og Coop Mega har hver sin farge.
  - Logoene oppdateres hver måned med workflowen «Logoer».
  - Nye endepunkter: `/finans/api/logos/registry`, `/finans/api/logos/file/:id` og `/finans/api/logos/match`.
- **Kartet virker igjen:**
  - Kartflisene går gjennom serveren (`/tiles/...`) med cache i 30 dager. Det gamle oppsettet ga «403 Access blocked» fra OpenStreetMap på web.
  - Kartet bruker CARTO i lyst og mørkt tema og en lys sepiavariant i Papir. Kartverket topo er også valgbart.
  - MapTiler og Stadia kan legges inn under Integrasjoner → Kart.
- **Android:** kartet krasjet ikke lenger når Kart eller Familie åpnes.
  - Feil i kartvisningen, i bakgrunnstjenesten for posisjon og ved Health Connect-kall på hovedtråden ga krasj. Alle tre er rettet.
  - Hvis kartet likevel feiler, vises «Kartet kunne ikke lastes» med «Prøv igjen».
- **Helse og posisjon:**
  - Ny meny under Innstillinger → App, med hovedbryter, «Be om tilgang», bryter per datatype og valg for posisjonsdeling.
  - Onboardingen spør om Apple Health (iOS) eller Health Connect (Android). Etter det står appen under Helse → Apper.
  - Når hovedbryteren slås av, slettes helsedataene dine på serveren.
- **Posisjonskortet på Hjem** har nytt design på web, i PWA, på iOS og på Android:
  - «Du» står først og bare én gang.
  - Hver person har egen farge, to bokstaver og en statusprikk.
  - Kortet viser sonen, «Går · Bislett», strøket (via Nominatim) eller «Sist sett 14:32». Aldri «Ukjent sted».
- **Finans-flisene** har hver sin farge. Hold inne for å endre rekkefølge. Rekkefølgen synkes mellom enhetene.
- **Andre endringer:**
  - Papir-lasteskjerm når Økonomi åpnes fra Hjem på web.
  - Ikonene i bunnmenyen er sentrert mot teksten.
  - Google-«G» i søkefeltet.
  - «+ Stopp» i Ruter er lesbar over bildet.

## [4.11.0] – 18.10.2026 · prompt 18–19
- **Dynamiske bakgrunner (prompt 19), på web og i appene.** Velg i Innstillinger → Utseende → Bakgrunn:
  - **Vær:** bakgrunnen følger været der du er, med Oslo som reserve. Værdata kommer fra MET, med egen variant for dag og natt og diskret regn og snø.
  - **Planeter:** NASA-bilder av Jorda, Månen, Jupiter og Mars. Velg én, eller bytt automatisk daglig eller hver time.
  - **Oslo:** luftfoto fra Unsplash eller Pexels med kreditering av fotografen, eller egne bilder som admin laster opp. Getty krever kjøpt lisens og brukes ikke.
  - **Eget bilde** eller **Ingen**.
  - Forhåndsvisning av hver type, uskarphet 0–20 px, mørklegging 0–60 % og bryter for animasjon. I appene finnes også «Kun på Wi-Fi».
  - Teksten blir mørk eller lys etter bildet. I Papir dempes bildet og får papirtekstur.
  - Bildene caches og skaleres til skjermen som WebP. Valgene synkes mellom web og app.
  - Partiklene slås av ved «Reduser bevegelse», Low Power Mode eller batterisparing.
  - Nøkler for Unsplash og Pexels legges inn under Integrasjoner → Bakgrunner. Nytt API: `GET /api/background`, `/api/background/previews` og `/api/background/oslo`.
- **Prompt 18:**
  - Riktige farger i lyst tema på Backup og Kontoer.
  - Logoer for butikker, fraktselskaper og abonnementer.
  - Papir-design på Kvitteringer, Legg til abonnement og Innstillinger.
  - Ikoner ved hvert punkt i Finans-innstillingene.
- **Opplastingskø for kvitteringer:** kvitteringer som ikke kommer fram fordi du mangler nett, legges i «Venter på opplasting» og sendes automatisk når nettet er tilbake.
- **Brukernavn kan endres** i Innstillinger → Konto. Admin kan for eksempel bytte fra «benjamin» til «sebastian». Passord, data og app-tokener beholdes.
- **iOS:** logo-visningen er delt opp, så den bygger på Xcode 16.

## [4.10.3] – 18.10.2026
- **Ollama-modeller i Innstillinger → AI og tolkning.** Modellene hentes fra Ollama (`/api/tags`), og du kan velge egne modeller til tre oppgaver:
  - kvitteringer, som krever en modell som leser bilder
  - tekst: AI-søk, sammendrag og kategorier
  - søk med vektorer (embeddings)
- **Anbefalte modeller for Mac mini M4 med 16 GB:**
  - qwen2.5vl:7b, gemma3:12b, qwen3:8b og nomic-embed-text, med flere i listen.
  - **«Installer»** laster ned modellen i Ollama med fremdriftslinje.
  - Modeller som er for store for 16 GB, merkes.
- **Andre modeller:** du kan installere en hvilken som helst modell fra ollama.com/library ved navn, og slette installerte modeller.

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
