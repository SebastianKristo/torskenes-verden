# Boliger på web: ny side etter design 1b «Kontobok»

Fasit: `Boliger Web v2.dc.html` → **1b Kontobok** (vedlegg `uploads/Screenshot 2026-10-20 at 18.50.04.png`). Erstatter dagens Boliger-side i FinansHub web (bildekort med tekst oppå bildet, små faner og runde ikonknapper).
Målgruppe: hele familien, også to brukere i 60- og 70-årene. Derfor: stor tekst, ord på alle knapper, ingen tekst oppå bilder, én måned om gangen.

## Grunnregler (gjelder hele siden)
- Grunntekst **18 px** (Manrope), undertekst minst 15–16 px. Tall i IBM Plex Mono 600. Overskrift Newsreader 500, 52 px.
- Knapper minst **52 px** høye, med tekst. Ingen knapper med bare ikon.
- Kontrast minst 4.5:1. Dempet tekst `#4f4b44` / `#5e5a52`, aldri lysere.
- Datoer skrives «14. okt» og måneder med fullt navn. Ingen forkortelser som «snitt», «inkl.», «stk.».
- Fokusring synlig (3 px `#1b1a17`, offset 2 px). Hele siden kan brukes med tastatur.
- Respekter nettleserens zoom (rem/em), og layouten skal tåle 200 % zoom uten horisontal scroll.

## Oppsett
To kolonner: **sidepanel 300 px** + innhold (`grid-template-columns: 300px minmax(0,1fr)`).

### Sidepanel «BOLIGENE»
- Bakgrunn `#ebe4d6`, linje til høyre `#d6cdbb`.
- En rad per bolig (min. 72 px): miniatyr 48 × 48 (radius 12) med boligens bilde, eller farge + forbokstav i Newsreader. Navn (19 px, 700) og «3 420 kr i okt» under.
- Valgt bolig: mørk rad (`#1b1a17`, hvit tekst). Andre: transparent, hover `#e2dacb`.
- **+ Legg til bolig** (stiplet kant, 60 px).
- Nederst: «Alle boligene i år» + sum (Plex Mono 22 px).
- Høyreklikk / ⋯ på en rad → **Rediger bolig** (navn, adresse, budsjett, farge, bilde) og **Slett** (bekreftelse). Samme skjema som i dag (`he.*`).
- Smal skjerm (< 900 px): panelet blir en nedtrekksliste øverst («Bolig: Strømstad ▾») i full bredde.

### Innhold
1. **Topp:** brødsmule «Boliger › Strømstad», navn (52 px) og «Hytte · Strandvägen 12, Strömstad». Til høyre: **+ Legg til utgift** (grønn `#2f6b4a`, 58 px).
   - «Legg til utgift» åpner en meny med fire store valg: **Ta bilde av kvittering** · **Last opp fil** (bilde/PDF) · **Send fra e-post** (viser boligens adresse, f.eks. `stromstad@…`, med «Kopier») · **Skriv inn selv**. Det er de samme funksjonene som Skann / Last opp / Fra e-post / Ny utgift i dag.
2. **Faner** som ord med strek under (19 px): **Utgifter** · **Regninger** (rødt tall når noe forfaller innen 14 dager) · **Prosjekter** · **Hvem har tilgang**. Valgt fane: 800 og 4 px strek. Fanen lagres i URL (`?fane=regninger`).
3. **Måned:** **‹ September** · «Oktober 2026» (Newsreader 32) · **November ›**. Knappen fram er grå og deaktivert når man står i inneværende måned. Klikk på månedsnavnet åpner en enkel månedsvelger (12 store knapper + år).
4. **Tre tall:** Brukt i oktober · Igjen av budsjettet (grønn; rød og «Over budsjett med X kr» hvis over) · Hittil i år. Uten budsjett: midterste kort viser «Sett budsjett» som knapp.
5. **Tabell** (radhøyde ≥ 68 px, annenhver rad `#faf6ee`):
   - Kolonner: Dato · Hva (forhandler + beskrivelse · hvem som la inn) · Kategori · Beløp (høyrejustert) · Kvittering (**Vis ›** eller «Mangler»).
   - Logo for forhandleren foran navnet når den finnes (logobiblioteket).
   - Klikk på raden åpner utgiften (kvittering, beløp, kategori, rediger, flytt til annen bolig, slett).
   - «Mangler» er en knapp: **Legg ved** (velg fil / ta bilde).
   - Siste rad: **Sum oktober** med tykk linje over.
   - Tom måned: «Ingen utgifter i oktober.» + knappen **+ Legg til utgift**.
6. **Til gjennomgang** (kvitteringer Glimt har lest, men som ikke er godkjent): egen boks over tabellen med gul kant, «2 kvitteringer venter på deg», og per rad **Godkjenn** / **Endre**. Samme logikk som `rv.*` i dag.
7. Under tabellen: **Skriv ut måneden** (utskriftsvennlig A4 med tabell og sum) og **Last ned som Excel** (`.xlsx`, én fane per måned eller valgt måned).

## De andre fanene (samme stil)
- **Regninger:** tabell Forfaller · Hva · Beløp · Status. Forfalte og de som forfaller innen 7 dager står øverst med rød tekst («Forfaller fredag 31. oktober»). Knapp **Merk som betalt** per rad (52 px). Betalte står nederst, dempet.
- **Prosjekter:** én rad per prosjekt: navn, «4 300 av 15 000 kr» med tydelig fremdriftslinje (12 px), status (Planlagt / Pågår / Ferdig). Klikk åpner prosjektet med utgiftene som hører til. **+ Nytt prosjekt**.
- **Hvem har tilgang:** liste med navn (ikke bare forbokstav), rolle i klartekst («Kan se og legge inn», «Kan bare se», «Eier»), og **Inviter en person** (e-post eller lenke). Endre rolle med en vanlig nedtrekksliste.

## Data
Uendret backend. Bruk eksisterende endepunkter for boliger, utgifter, regninger, prosjekter og deling. Nytt felt: `month` i URL (`?mnd=2026-10`). Summer regnes på serveren per måned og år.

## Bevar fra dagens side
Glimt-søket i toppen, varselklokke, profilbilde, mørkt tema (samme tokens `--b-*`), lagt-til-toast med Angre, kvitteringslesing og «Les på nytt».

## Test
- Bruk siden med bare tastatur, og med nettleserzoom 150 % og 200 %.
- Bytt bolig, bla til forrige måned og tilbake, legg til utgift med bilde, godkjenn en kvittering, merk regning som betalt, skriv ut og last ned Excel.
- Smal skjerm (iPad stående, 834 px): nedtrekk for bolig, tabellen blir kort-liste (dato + hva over, beløp til høyre).


## Oppdatering 2026-10-20 (fasit: `Boliger Web.dc.html`)
- **Budsjett er fjernet** fra Boliger: ingen «Igjen av budsjettet»-kort og ikke noe budsjettfelt i «Rediger bolig». Tallkortene er «Brukt i <måned>» og «Hittil i år».
- **Boliglista til venstre er fjernet** i en åpnet bolig. Bare «‹ Alle boligene» vises.
- I FinansHub ligger «‹ Alle boligene», «Rediger bolig» og «+ Legg til utgift» i sidetoppen ved tittelen. Boliger har ingen egen bakgrunn eller ramme der, og «Dette må gjøres» vises ikke.
- Ny fane **Kategorier** etter Regninger: fordeling per kategori (måned / hele året, søyler), og «Alle kategorier» der man kan legge til egne kategorier og fjerne dem. Gjelder alle boligene. «+ Ny kategori» finnes også i utgiftsskjemaet.
- **Regninger er fjernet** fra Boliger: ingen Regninger-fane, ingen «Neste regning»-rad på boligkortene og ingen regninger i «Dette må gjøres» (bare kvitteringer til gjennomgang). Fanene er Utgifter · Kategorier · Prosjekter · Hvem har tilgang.
- **Prosjekter er fjernet.** Boliger brukes til å laste opp og kategorisere kvitteringer og utgifter. Fanene er Utgifter · Kategorier · Hvem har tilgang.
- **Opplastingsfelt øverst i Utgifter:** «Last opp kvitteringer», stort slipp-felt (dra og slipp bilder/PDF, eller **Velg filer**, flere om gangen). Hver fil legges i «kvitteringer venter på deg». Glimt leser butikk, dato, beløp og kategori i bakgrunnen (samme kvitteringsleser som Finans). Mangler beløp, står det «Sjekk beløp» i rødt, og Godkjenn åpner skjemaet i stedet. Gjetter kategori fra butikk/tekst.
- **Prosjekter er tilbake, men som samlemapper:** et prosjekt (f.eks. «Male terrassen», «Ny brygge») samler kjøp og regninger som hører til samme ting. Fane-rekkefølge: Utgifter · Kategorier · Prosjekter · Hvem har tilgang.
  - Liste: navn, status (Planlagt/Pågår/Ferdig), «N kjøp» og sum. Budsjett er valgfritt, og når det finnes, vises en søyle.
  - Inne i prosjektet: «‹ Alle prosjekter», **Endre prosjekt**, **+ Legg til kjøp** (åpner utgiftsskjemaet med prosjektet valgt), lista over kjøp (Fjern = kobler fra), og «Legg til en utgift du allerede har registrert» (de 8 siste ukoblede utgiftene med **Legg til**).
  - Utgiftsskjemaet har «Hører til prosjekt»-chips (Ingen + boligens prosjekter). Summen regnes fra koblede utgifter (`expense.project_id`), og det er ikke noe manuelt «brukt så langt»-felt.
  - Sletter man et prosjekt, kobles utgiftene fra, men de slettes ikke.
- **Glimt i prosjekter:** inne i et prosjekt er det et felt «✦ Spør Glimt» med forslag («Legg til alle kjøp relatert til basseng», «Finn kvitteringer fra Biltema», «Legg til alt med kategori Vedlikehold»).
  - Glimt tolker beskjeden, søker i boligens utgifter og kvitteringer (butikk, beskrivelse, kategori og tekst fra kvitteringslesingen), og utvider med beslektede ord (basseng → pool, klor, pH, bassengduk, bassengpumpe).
  - Svaret: «Glimt fant 3 kjøp om «basseng» … til sammen 9 169 kr» med en avkrysningsliste (alle valgt). **Legg til N valgte i <prosjekt>** kobler dem, med Angre.
  - Backend: `/api/glimt` med verktøy `boliger.search_expenses(home_id, query, terms[])` og `boliger.link_to_project(ids[], project_id)`. Lokal søkeordtolkning først, og LLM (Ollama, så Gemini) når det er usikkert eller teksten er fri («alt vi kjøpte til bassenget i sommer» → også datofilter jun–aug).
  - Glimt skal aldri koble uten at brukeren bekrefter.
- **Nytt design på prosjektlista** (fasit `Boliger Web.dc.html` → Prosjekter): overskrift «Prosjekter» med «2 prosjekter · 1 289 kr samlet». Rutenett med prosjektkort (`minmax(300px,1fr)`).
  - Hvert kort har en fargestripe øverst, en fargebrikke med forbokstav, navn, status, stor sum (Newsreader 34), «1 kjøp · sist 14. okt», valgfri budsjettsøyle, de 3 siste kjøpene (butikk · beskrivelse + beløp) og «Åpne prosjektet ›».
  - Siste rute: stiplet «+ Nytt prosjekt» med forklaring.
  - «Kvitteringer venter»-boksen vises bare i Utgifter-fanen.
- **Kategorier = hva som ble kjøpt** (ikke type kostnad): Blomster, Møbler, Mat og drikke, Maling, Verktøy, Byggevarer, Lys og elektrisk, Rengjøring, Interiør, Hage, Strøm, Avgifter og Annet. Gamle kategorier (Vedlikehold, Diverse, Kommunale avgifter …) migreres ved å kjøre kvitteringsteksten gjennom Glimt.
  - **Glimt lager kategorier selv:** når en opplastet kvittering ikke passer i noen eksisterende kategori, foreslår Glimt et kort og konkret navn (1–3 ord, norsk, f.eks. «Basseng», «Ved og brensel», «Grill»). Det opprettes automatisk og merkes «✦» (`category.created_by = glimt`). Toast: «Glimt laget kategorien «Basseng»».
  - Regel i prompten: gjenbruk en eksisterende kategori hvis den passer (send med lista). Lag bare ny når ingen passer, og aldri synonymer av eksisterende.
  - Fjerner man en kategori, flyttes utgiftene til «Annet».
- **Nytt design på «kvitteringer venter»** (Utgifter-fanen): overskrift «✦ Glimt har lest 1 kvittering» + «Sjekk butikk, beløp og kategori, og godkjenn.» («Godkjenn alle» når det er flere). Ett kort per kvittering: en liten papirkvittering til venstre (miniatyr av bildet når det finnes), butikk (21 px) og dato · beskrivelse · filnavn, beløp stort til høyre (rødt «Sjekk beløp» hvis det mangler).
  - **Kategori-chips** direkte på kortet: Glimts forslag er valgt, pluss 3 alternativer (Glimts nest beste + mest brukte). Trykk endrer kategorien uten å åpne skjemaet.
  - Knapper: **✓ Godkjenn** (grønn) / **Skriv inn beløp** når beløp mangler, og **Endre detaljer**.
- **Mindre størrelser i FinansHub:** alt i Boliger skaleres ned til ca. 80 % (grunntekst ~15 px, knapper ~44 px, overskrift ~36 px), så det passer med resten av FinansHub. Opplastingsfeltet er én kompakt rad (ikon 44 px, padding 14/18).
- **Åpne en kategori:** trykk på en rad i «Kategorier i oktober» eller en chip i «Alle kategorier» → kategorisiden: «‹ Alle kategorier», valg Måned / Året / Alt, et kort med fargebrikke, navn, «3 kjøp i oktober 2026 · Strømstad» og sum, lista over kjøpene (dato, butikk, beskrivelse · hvem · kvittering, beløp; trykk = rediger), og «+ Legg til utgift i <kategori>».
- **Opplastingsfeltet i Utgifter er fjernet.** Opplasting skjer via «+ Legg til utgift» (Ta bilde / Last opp fil / Send fra e-post / Skriv inn selv). Last opp fil tar flere filer, og hver blir lagt i «Glimt har lest …» til godkjenning.
- **Full bredde i FinansHub:** Boliger har ingen egen maks-bredde når den er inne i FinansHub, og fyller hele innholdsflaten (samme kanter som FinansHub-toppen).
- **Se originalen:** overalt der en utgift eller kvittering vises (Glimt-kortene: trykk på papirminiatyren eller «Vis original»; tabellen: «Vis ›» i Kvittering-kolonnen; kategorisiden: «Kvittering ›»; utgiftsskjemaet: «Vis») åpnes en visning.
  - Til venstre: originalbildet (zoombart, `object-fit:contain`) eller PDF-en (innebygd viser / «Åpne PDF ↗»).
  - Til høyre: det Glimt leste (butikk, dato, beløp, kategori, bolig, fil), og knappene **Endre** og **Last ned**.
  - Originalfilen lagres alltid ved opplasting (`/api/boliger/kvitteringer/{id}/fil`, med miniatyr 200 px for kortene) og slettes aldri når utgiften endres.
- **Kvitterings-/utgiftspanel (som transaksjonsdetaljene i Finans):** trykk på en utgift eller «Endre detaljer» → panel fra høyre (maks 520 px).
  - Topp: logo (logobiblioteket, ellers farget forbokstav), butikk, «14. oktober 2026 · Strømstad», stort beløp («−1 289,00 kr»), «✓ Kvittering: fil · Vis original».
  - Felt: Butikk, Beløp, Hva ble kjøpt.
  - **✦ AI-beskrivelse:** Glimts oppsummering og varelinjene fra kvitteringen (navn + beløp, rabatt som minus).
  - **✦ Analyser på nytt med Glimt:** sender originalen til kvitteringsleseren igjen (Ollama, så Gemini). Oppdaterer butikk, beløp, varelinjer, beskrivelse og foreslått kategori (lager ny kategori hvis ingen passer). Felt brukeren har endret manuelt, overskrives ikke.
  - Deretter Kategori-chips (+ Ny kategori), Dato, Kvittering Ja/Nei, Bolig, Prosjekt, **Lagre** (eller «✓ Godkjenn og lagre» for kvitteringer til gjennomgang) og Slett.
- **Kategorier-fanen, mer informativ:** måned-navigasjon + Måned/Hele året.
  - Fire nøkkeltall: Brukt i perioden (▲/▼ mot forrige), Største kategori (beløp og %), Kategorier brukt (antall kjøp), Uten kvittering.
  - **Fordeling:** en stablet stolpe med alle kategorier (klikkbar) og forklaring med prosent.
  - **Kategorikort** (rutenett): fargebrikke, navn (✦ hvis laget av Glimt), «3 kjøp · 38 % av totalen», beløp, endring mot forrige periode (rød opp / grønn ned / «Ny»), minigraf over de siste 6 månedene (12 i årsvisning), og «Sist: Biltema · 14. okt». Trykk åpner kategorien.
  - Nederst: «Ikke brukt i oktober» som chips (✦ / × for egne) + «Legg til kategori».
- Glimt-overskriftene i Boliger («Glimt har lest 1 kvittering», «Spør Glimt» i prosjekter) bruker **Glimt-orben**: en konisk fargering (#b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6) som roterer sakte (4 s, 1,1 s når Glimt jobber), kremfarget innside og en rød ✦ i midten. Samme ikon som Glimt-knappene ellers på web. Ingen svart ✦-sirkel og ingen figur med ansikt.
- **Se originalen:** i kvitteringsvisningen er det en grønn knapp **Se originalen ⤢**. Trykk på forhåndsvisningen gjør det samme. Den åpner originalen i fullskjerm på mørk bakgrunn: bildet med `contain`, zoom med pinch/hjul, PDF i innebygd viser, **Åpne i ny fane ↗** og **Lukk** (Esc). Den tekniske kvitteringen viser alle varelinjene.
- **«Analyser på nytt med Glimt»-knappen:** stor pille (min. 64 px) med Glimt-gradient som kant (rød → oransje → gul → grønn → lilla), Glimt-orben (40 px) til venstre, tittel «Analyser på nytt med Glimt» + undertekst «Leser originalen igjen · butikk, beløp, varelinjer og kategori», og ↻ til høyre. Mens Glimt jobber: orben roterer raskt, tittelen er «Glimt leser kvitteringen …», og knappen er deaktivert. AI-boksen heter «Glimt leste kvitteringen» med liten orb.
- **«Vis original kvittering»** i utgiftspanelet er et stort kort (min. 68 px, lys grønn, `#eaf3ec`): kvitteringsminiatyr (det ekte bildet når det finnes), tittel, undertekst («Kvittering fra 9. okt · Strömstad Energi» / filnavn), og ⤢. Åpner kvitteringsvisningen.
- **Se etter år:** Utgifter har en Måned / År-velger over navigasjonen. År viser alle utgiftene i året, «‹ 2025 · 2026 · 2027 ›», «Brukt i 2026» og «Sum 2026». Excel-eksport følger valgt periode.
- **Flere år:** tredje valg «Flere år» viser kortet «År for år»: de siste 5 årene med sum, antall kjøp, søyle, største kategori og endring mot året før (rød opp / grønn ned). Trykk på et år åpner År-visningen for det året. Lista under viser alle utgiftene.
- **Endring 2026-10-20 («ikke vis den, start heller med bokser med hvert sitt årstall og kostnad det året»):** fjern Måned/År/Flere år-velgeren og «År for år»-kortet. Utgifter starter med en rad årsbokser (de siste 5 årene, eldst til venstre): årstall, sum det året og antall kjøp («Hittil i år» for i år). Valgt år er mørkt, og lista under viser det året. I år er valgt som standard.
- **Flere årstall:** årsboksene er en vannrett rad som kan scrolles (scroll-snap), med pilene ‹ › på hver side. Viser 5 om gangen og starter med i år helt til høyre. Lista går tilbake til det første året med utgifter i boligen (minst 12 år i demoen).
- Årsboksene står **over fanene** (Utgifter · Kategorier · Prosjekter · Hvem har tilgang), rett under boligens tittel, og vises når Utgifter er valgt.
- Årsrekken viser ingen scrollestrek (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`). Man blar med pilene, sveip eller hjul.
- Årsboksene vises over fanene på **alle** fanene i en bolig (Utgifter, Kategorier, Prosjekter, Hvem har tilgang). Valgt år gjelder for Utgifter-lista. Kategorier og Prosjekter skal også summere for valgt år.
- Fjern «Fordeling»-kortet (stablet stolpe + prosenter) øverst i Kategorier (ønske 2026-10-20: «fjern denne.»). Kategorikortene står igjen.
- Fjern knappen «Rediger bolig» fra boligens topp (ønske 2026-10-20: «denne ligger allerede i boliger valgmenyen»). Redigering skjer fra boligkortets meny. Toppen har: ‹ Alle boligene · Søk med Glimt · + Legg til utgift.
- **Alle kategorier som kort** (ønske 2026-10-20: «få alle kategorier til å dukke opp på denne måten»): Kategorier-fanen viser alle kategoriene som kort, også de som ikke er brukt i perioden. Brukte står først (sortert på beløp). Ubrukte har «0 kr · 0 kjøp», grå søyler og «Sist: Biltema · 3. mar» eller «Ikke brukt ennå». Chip-lista «Ikke brukt i …» fjernes. Boksen under heter «Ny kategori» og har bare feltet + «Legg til kategori». Egne/✦-kategorier slettes fra kategorisiden (åpne kortet → Slett kategori).
