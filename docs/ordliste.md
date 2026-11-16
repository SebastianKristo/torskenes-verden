# Ordliste

[← Til README](../README.md)

Begrepene som skal brukes i grensesnittet på web, iPhone, Mac, Android og klokka. Grunnlaget er kartleggingen i [E-ia.md §6](opprydding/detaljer/E-ia.md) med beslutningene i [BESLUTNINGER.md](opprydding/BESLUTNINGER.md) (Q1–Q12). Menyene, sidene og tekstene på alle plattformene bruker disse navnene.

Navnene på modulene, undersidene, gruppene og sidene i Innstillinger står i [`shared/schemas/moduler.json`](../shared/schemas/moduler.json), og gruppene i Tilkoblinger i [`shared/schemas/tilkoblinger.json`](../shared/schemas/tilkoblinger.json). Klientene henter dem fra serveren (`GET /api/moduler`, se [api.md](api.md)). Endres et navn, endres det der og her.

Når du finner et begrep som mangler eller brukes ulikt, legg det til her i samme endring som retter teksten. Navn brukeren selv har gitt en liste eller en fane, endres aldri.

## Produktet og modulene

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| **Homelab** (produktnavnet i UI: appnavn, titler, logo, klokka, widgetene og systemtekstene som Innstillinger → Homelab og Helse → Apper → Homelab) | OS, Nordlys OS, FinansHub | «Nordlys OS» bare om serverprogramvaren i dokumentasjon og teknisk tekst (Q2) |
| **Økonomi** (modulen, og widgeten med saldo) | FinansHub, Finans | «FinansHub» er et internt navn. Adressen `/finans/` beholdes (Q2, Q3) |
| **Oversikt** (startsiden, `#/oversikt`) | Dashboard, dashbordet, Hjem, Homelab (som sidenavn) | `#/dash` videresendes (Q1) |
| **Smarthjem** (`#/hjem`) | Hjem | «Hjem» brukes ikke som sidenavn. `#/smarthjem` virker også (Q1) |
| **Gjøremål** (`#/gjoremal`) | Huskeliste, huskelisten | `#/huskeliste` og `#/huske` videresendes (O6) |
| **Brief** | Now Brief, Dagsbrief | Brief åpnes som ark (`#/brief`) (Q7) |
| **Reise** (modulen) med fanene **Avganger** og **Kart** (`#/reise`, `#/reise/kart`) | Ruter, Min reise (som modulnavn), Kart (som egen modul) | «Ruter» bare om selskapet. `#/kart`, `#/avganger` og `#/ruter` videresendes (Q8, Q9) |
| **Kart** som fane i **Familie** (posisjoner og soner, `#/familie/kart`) | Kart (som egen modul), Familie og kart | Reise har sitt eget kart for avganger (Q9) |
| **Nyheter** (modulen og arket), **Nyhetslinje** (stripen øverst) | Nyhetsleser, Siste nytt, SISTE NYTT, nyhetsbar, ticker | Stripen har etiketten «NYHETER» (Q10) |
| **Bibel** i «Alle sider» og Mer (Fritid og læring) | – | Åpner siden i Økonomi (`/finans/#/bibel`, `#/bibel` videresendes) |
| **Glimt** | Søk, AI (som navn på Glimt, også i Økonomi) | Ikonet kan være et søkeikon |
| **Live Activities**, **Backup**, **Logger** | Sikkerhetskopi, Kopier | Beholdes (Q7) |

## Navigasjon

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Gruppene **I dag**, **Hjemme**, **Tid**, **Ute**, **Økonomi**, **Fritid og læring**, **Verksted**, **Drift** | – | Rekkefølgen i «Alle sider» og Mer (E-ia §4) |
| **Alle sider ▾** (menyen i toppmenyen på desktop) | Mer ▾ (som navn på den menyen), Flere sider | Viser alle modulene gruppert (Q6). Faner som ikke får plass i toppmenyen, ligger under «Mer ▾» |
| **Alle sider** (tittelen i Mer på mobil) | Snarveier (som tittel), Alle sider først etter snarveiene | Modulene først, eksterne snarveier nederst (O12) |
| **Snarveier** (eksterne lenker, nederst i Mer) | – | |
| **‹ Oversikt** (tilbake til startsiden), **‹ Økonomi** (tilbake til Økonomis Oversikt), **‹ Homelab** (fra Økonomi til Homelab-skallet) | ‹ Hjem, ‹ Finans | Q1, Q2, Q3 |
| **Oversikt-knapp** (valgfri knapp i fanelinja på mobil-web, Tilpass → Fanelinje) | Hjem-knapp | O1 |
| **Tilpass Oversikt** (profilmenyen: kortene på Oversikt) | Rediger widgets | O4 |
| **Utseende og faner** (profilmenyen: åpner Utseende) | Tilpass forside og meny | |
| **Kort** (på Oversikt), **Widgets** (på telefonen) | Widgets (om kort på Oversikt) | |
| Media-fanene **Nå**, **Kommer**, **Bibliotek**, **Nedlastinger**, **Kilder** (NRK og Musikk) | Oversikt (i Media), Kalender (i Media) | «Kommer» er det som kommer ut snart. `#/media/kalender` virker fortsatt |
| **I kveld** | Hva skal vi se i kveld? (som fanenavn) | |
| **Domener / Sporing** (mellomrom rundt skråstrek) | Domener/Sporing | Likt på alle plattformer |

## Kalender

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| **Kalender** med filtrene **Alle**, **Familie**, **Bursdager** og **Skole** | Familiekalender (som egen side) | `#/kalender/familie` og `#/kalender/bursdager`; `#/familiekalender` og `#/bursdager` videresendes. Bursdagsadministrasjonen er en visning under Kalender (Q5) |
| Kalendervisningene **År**, **Måned**, **Uke**, **3 dager**, **Dag**, **Liste** (i den rekkefølgen) | Dag → År (motsatt rekkefølge), Mnd, 3 d | Kort form **Mnd** og **3 d** bare der plassen ikke strekker til (smale skjermer, widgets, klokka) |
| **Hvem kjører?** (henting og bringing, under filteret Familie i Kalender) | Familiekalender | iOS: Mer og dyplenken `#/kalender/familie` (Q5) |
| **Helligdag** (offentlig høytidsdag, fri), **Merkedag** (Palmesøndag, Julaften, Nyttårsaften: ikke fri) | Offentlig høytidsdag (som type), Høytid | `type` i kalenderen og `/api/dates/holidays` (Q18) |

## Økonomi

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Økonomi-fanene **Oversikt**, **Transaksjoner**, **Budsjett**, **Faste betalinger** og **Mer** (web og appene) | Liste, Søk, Abonnementer (som fane) | Nøklene i `finNav` er `transaksjoner` og `faste`; `liste` og `abonnementer` er alias (Q3, Q4) |
| **Transaksjoner** | Liste | |
| **Faste betalinger** (siden), med filtrene **Abonnementer**, **Faste utgifter** og **Planlagte trekk** | Subscription OS | Alle funksjonene i den gamle visningen beholdes (Q4) |
| **Faste utgifter** (filter i Faste betalinger) | Faste trekk, Abonnementer og regninger | Husleie, forsikring og andre faste trekk som ikke er abonnementer |
| **Planlagte trekk** (filter i Faste betalinger) | Kalender (i Planlegging), Faste trekk | Trekkene de neste dagene med saldoprognose |
| **Sparing og planer** (side i Økonomi) | Planlegging | Sparemål, skatt, priser og abonnementsjeger |
| **Kontoer og aksjer** (side i Økonomi) | Kontoer, Aksjer (som egne sider i menyen) | Aksjer er en fane på siden |
| **Import** (Økonomi → Innstillinger → Import) | Import (som egen side i menyen) | Import har ett hjem (O3) |
| **Bolig** (faste boutgifter) og **Hjem og interiør** (innkjøp) | Hjem (som kategori i Økonomi) | Eksisterende data flyttes bare med «Flytt til nye kategorier» (Q11) |
| **Flytt til nye kategorier** (admin-handling i Økonomi → Innstillinger → Kategorier) | Migrering, Migrer (i UI) | Forhåndsvisning, bekreft, angre (Q11) |
| **Finn-handler** (funksjonen), **FINN** (merket) | Finn (som fanenavn) | |
| **Ukentlig**, **Hver 2. uke**, **Månedlig**, **Kvartalsvis**, **Halvårlig**, **Årlig**, **Hvert 2. år** | Annenhver uke, Kvartalvis, Halvårig (som syklusnavn) | Syklusnavnene serveren sender (`cycleName`, Q40) |
| **venter: 1 234 kr** (bolig) | Brukt (om poster som venter) | Poster til gjennomgang telles ikke som brukt (Q21) |

## Innstillinger

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| **Konto og sikkerhet** · **Utseende** · **Varsler** · **Husstand** · **Glimt og AI** · **Tilkoblinger** · **Moduler** · **Enheter og widgets** · **Server** | Konto (alene), Sikkerhet (egen side eller under Konto), Brukere og familie, Integrasjoner (som side), App (som side), Generelt (som gruppe) | Samme sider i samme rekkefølge på alle plattformer (E-ia §4, Q12) |
| **Enheter og widgets** (widgets på telefonen, API-tokens, logg inn på en annen enhet) | App, Mobilapper | O4. Navn og ikon på appen står under Utseende |
| **Kalender og gjøremål** (del av Tilkoblinger) | Kalendere | |
| **Helse** under **Husstand** | Helse (Familie) | Innstillinger → Husstand → Helse |
| **Levering** (Varsler: haptikk, lyd og volum) | Haptikk (som varselgruppe), Varsellyd (som egen gruppe) | O9. Varselgruppene heter som modulene: Sporing, Økonomi, Familie, Reise, Kalender, Media |
| Tilkoblinger-gruppene **Smarthjem**, **Kalender og e-post**, **Media**, **Økonomi**, **Reise og pakker**, **AI**, **Varsler**, **Nettverk**, **Generelt** | Hjem, Informasjon, Transport og pakker, Skole, Finans, Rom, Annet (som integrasjonsgruppe) | Én gruppering for `/api/integrations`, `/api/config` og appene (O8) |
| **Server → System** (oppdateringer) | Nordlys OS · oppdatering | «Nordlys OS» bare om serverprogramvaren i teknisk tekst (Q2) |
| **Appens profil** | Appprofil | Lettere å lese |
| **Totrinnsbekreftelse (2FA)** | Tofaktor, Tofaktor (2FA) | |
| **API-nøkkel** | api-nøkkel | |
| **Mangler API-nøkkel for Mybring** | Mangler posten/bring: mybring api-nøkkel | Samme mønster for andre tjenester |

## Skjold Lab

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Standardkategoriene **Motstander**, **Kondensatorer**, **Dioder og LED**, **Transistorer**, **IC-er**, **Mikrokontrollere**, **Sensorer**, **Moduler**, **Kontakter**, **Kabler**, **Skruer og bolter**, **Mutre og skiver**, **Avstandsstykker**, **Brytere**, **Sikringer**, **Verktøy**, **Diverse** | LED, Kabel, Kabelsko, Skruer (som standardkategori) | Standardlisten (`server/skjold/kategorier.js`). Brukerens egne kategorier endres ikke |

## Skrivemåte

- Norsk bokmål i all tekst i grensesnittet.
- Tall `1 234,56` (smalt mellomrom som tusenskille), minus `−`, dato `dd.mm.åååå`.
- **Laster …** med mellomrom før «…», ikke «Laster...» eller «Laster…».
- Ingen kjente stavefeil i UI-strengene (søket i E-ia §6 ga 0 treff). Retter du en, legg den til i tabellen.

## Avgjort i Fase 1

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Domener / Sporing (mellomrom rundt skråstrek) | Domener/Sporing | Likt på alle plattformer |
| Appens profil | Appprofil | Lettere å lese |

## Avgjort i Fase 6 (modullisten)

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Gruppene **I dag**, **Hjemme**, **Tid**, **Ute**, **Økonomi**, **Fritid og læring**, **Verksted**, **Drift** | – | Rekkefølgen i «Alle sider» og Mer (E-ia §4) |
| **Alle sider ▾** (menyen i toppmenyen på desktop) | Mer ▾ (på desktop), Flere sider | Viser alle modulene gruppert (Q6). «Mer» brukes bare om fanen i bunnmenyen på mobil |
| **Alle sider** (tittelen i Mer på mobil) | Snarveier (som tittel), Alle sider først etter snarveiene | Modulene først, eksterne snarveier nederst (O12) |
| **Snarveier** (eksterne lenker, nederst i Mer) | – | |
| **Smarthjem** (`#/hjem`) | Hjem | `#/smarthjem` virker også |
| **Oversikt** (`#/oversikt`) | Dashboard, dashbordet | `#/dash` videresendes |
| **Gjøremål** (`#/gjoremal`) | Huskeliste, huskelisten | `#/huskeliste` og `#/huske` videresendes (O6). Navnet på en liste brukeren selv har kalt «Huskeliste», endres ikke |
| **Reise** med fanene **Avganger** og **Kart** (`#/reise`, `#/reise/kart`) | Ruter (som modulnavn), Kart (som egen modul) | `#/kart`, `#/avganger` og `#/ruter` videresendes (Q8, Q9) |
| **Kart** (fane i Familie: posisjoner og soner, `#/familie/kart`) | Familie og kart | Q9 |
| **Kalender** med filtrene **Alle**, **Familie**, **Bursdager** og **Skole** | Familiekalender | `#/kalender/familie` og `#/kalender/bursdager`; `#/familiekalender` og `#/bursdager` videresendes (Q5) |
| Kalendervisningene **År**, **Måned**, **Uke**, **3 dager**, **Dag**, **Liste** (i den rekkefølgen) | Dag → År (motsatt rekkefølge) | Kort form **Mnd** og **3 d** bare der plassen ikke strekker til |
| Media-fanene **Nå**, **Kommer**, **Bibliotek**, **Nedlastinger**, **Kilder** (NRK og Musikk) | Oversikt (i Media), Kalender (i Media) | «Kommer» er det som kommer ut snart. `#/media/kalender` virker fortsatt |
| **Nyheter** (modulen og arket), **Nyhetslinje** (stripen) | Nyhetsleser, nyhetsbar, Siste nytt, SISTE NYTT, ticker | Stripen har etiketten «NYHETER» (Q10) |
| **Brief** | Now Brief | Q7 |
| **Tilpass Oversikt** (profilmenyen: kortene på Oversikt) | Rediger widgets | O4 |
| **Utseende og faner** (profilmenyen: åpner Utseende) | Tilpass forside og meny | |
| Innstillinger: **Konto og sikkerhet** · **Utseende** · **Varsler** · **Husstand** · **Glimt og AI** · **Tilkoblinger** · **Moduler** · **Enheter og widgets** · **Server** | Konto (alene), Brukere og familie, App (som side), Generelt (som gruppe) | Samme rekkefølge på alle plattformer (E-ia §4, Q12) |
| **Enheter og widgets** (widgets på telefonen, API-tokens, logg inn på en annen enhet) | App, Mobilapper | O4. Navn og ikon på appen står under Utseende |
| **Levering** (Varsler: haptikk, lyd og volum) | Haptikk (som varselgruppe), Varsellyd (som egen gruppe) | O9. Varselgruppene heter som modulene: Sporing, Økonomi, Familie, Reise, Kalender, Media |
| Tilkoblinger-gruppene **Smarthjem**, **Kalender og e-post**, **Media**, **Økonomi**, **Reise og pakker**, **AI**, **Varsler**, **Nettverk**, **Generelt** | Hjem, Informasjon, Transport og pakker, Skole, Finans, Rom, Annet (som integrasjonsgruppe) | Én gruppering for `/api/integrations`, `/api/config` og appene (O8) |
| **Server → System** (oppdateringer) | Nordlys OS · oppdatering | «Nordlys OS» bare om serverprogramvaren i teknisk tekst (Q2) |
| Skjold Lab-kategoriene **Motstander**, **Kondensatorer**, **Dioder og LED**, **Transistorer**, **IC-er**, **Mikrokontrollere**, **Sensorer**, **Moduler**, **Kontakter**, **Kabler**, **Skruer og bolter**, **Mutre og skiver**, **Avstandsstykker**, **Brytere**, **Sikringer**, **Verktøy**, **Diverse** | LED, Kabel, Kabelsko, Skruer (som standardkategori) | Standardlisten (`server/skjold/kategorier.js`). Brukerens egne kategorier endres ikke |
| **Helse (Husstand)** | Helse (Familie) | Innstillinger → Husstand → Helse |
| **Brief** og **Bibel** i «Alle sider» og Mer (gruppene I dag og Fritid og læring) | – | Brief åpnes som ark (`#/brief`). Bibel åpner siden i Økonomi (`/finans/#/bibel`, `#/bibel` videresendes) |

## Avgjort i Fase 6 (appene)

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Økonomi-fanene **Oversikt**, **Transaksjoner**, **Budsjett**, **Faste betalinger** og **Mer** (også i appene) | Liste, Søk, Abonnementer (som fane) | Nøklene i `finNav` er `transaksjoner` og `faste`; `liste` og `abonnementer` er alias (Q3, Q4) |
| **Glimt** (søket i Økonomi, i Mer) | Søk | |
| **Hvem kjører?** (henting og bringing, under filteret Familie i Kalender) | Familiekalender | iOS: Mer og dyplenken `#/kalender/familie` (Q5) |
| **‹ Økonomi** (tilbake til Økonomis Oversikt) og **‹ Oversikt** (tilbake til startsiden) | ‹ Finans, ‹ Hjem | Q1, Q2 |
| **Homelab** på klokka, i widgetene og i systemtekstene (Innstillinger → Homelab, Helse → Apper → Homelab) | FinansHub | Q2. Widgeten med saldo heter **Økonomi** |

## Avgjort i Fase 7 (stier i brukertekst)

Feilmeldinger, hint, hjelpetekster, Glimt-svar og varsler peker på sidene slik de heter i modullisten. `test/brukertekst-navn.test.js` stopper de gamle stiene og navnene i tekst (ikke i kommentarer, nøkler eller ruter), med bevisste unntak.

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| **Innstillinger → Konto og sikkerhet** (… → Profil, … → Server, … → Totrinnsbekreftelse (2FA)) | Innstillinger → Sikkerhet, → Innlogging, → Konto, → Kontoer og brukere | Kalender-appen har sin egen «Innstillinger → Sikkerhet», den beholdes |
| **Innstillinger → Tilkoblinger** (… → Media, … → Home Assistant, … → Reise og pakker …) | Innstillinger → Integrasjoner, Integrasjoner → Media | Siden «Integrasjoner» ligger under Tilkoblinger |
| **Innstillinger → Tilkoblinger → Kalender og gjøremål** | Innstillinger → Kalendere, Innstillinger → Gjøremål | På iPhone: Innstillinger → Tilkoblinger |
| **Innstillinger → Glimt og AI → AI** (modeller og nøkler), **… → Glimt**, **… → Faste oppgaver** | Innstillinger → AI, → AI-motor, → AI-kontroll, → Glimt, → Faste oppgaver | «AI og tolkning» er Økonomis egen side og beholdes |
| **Innstillinger → Enheter og widgets** (… → Widgets, … → Logg inn på annen enhet) | Innstillinger → App, → Enheter, → Widgets, → API-tokens | |
| **Innstillinger → Husstand** (… → Helse) | Innstillinger → Brukere, → Familie, → Helse, Brukere og familie | |
| **Innstillinger → Server → System** og **Server → Backup** | Innstillinger → System, → Oppdatering, → Backup | «Backup og data» er Økonomis egen side |
| **Innstillinger → Moduler → Reise / Nyheter / Media / Domener / Studie** | Innstillinger → Ruter, → Nyheter, → Media … | |
| **Avganger-kortet** (på Oversikt) | Ruter-kortet | Ruter er selskapet |
| **Økonomi-backup** (SMB-veiviseren) | FinansHub-backup | |
| **Homelab** (appen på telefonen, også i QR-innlogging) | Papir Finans | |
| **Økonomi → Faste betalinger** (der trekkene endres) | Finans → Abonnementer | Kalender og Kalender-appen |
