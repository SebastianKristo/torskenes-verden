# Ordliste

[← Til README](../README.md)

Begrepene som skal brukes i grensesnittet på web, iPhone, Mac, Android og klokka. Grunnlaget er kartleggingen i [E-ia.md §6](opprydding/detaljer/E-ia.md) med beslutningene i [BESLUTNINGER.md](opprydding/BESLUTNINGER.md) (Q1–Q12) brukt. Navnene brukes i ny tekst fra Fase 1. Menyer og sider har de nye navnene fra Fase 6.

Navnene på modulene, undersidene, gruppene og sidene i Innstillinger står i [`shared/schemas/moduler.json`](../shared/schemas/moduler.json), og gruppene i Tilkoblinger i [`shared/schemas/tilkoblinger.json`](../shared/schemas/tilkoblinger.json). Klientene henter dem fra serveren (`GET /api/moduler`, se [api.md](api.md)). Endres et navn, endres det der og her.

Når du finner et begrep som mangler eller brukes ulikt, legg det til her i samme endring som retter teksten.

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| **Homelab** (produktnavnet i UI: appnavn, titler, logo) | OS, Nordlys OS, FinansHub | «Nordlys OS» bare om serverprogramvaren i dokumentasjon og teknisk tekst (Q2) |
| **Økonomi** (modulen) | FinansHub | «FinansHub» er et internt navn. Adressen `/finans/` beholdes (Q2, Q3) |
| **Oversikt** (startsiden) | Dashboard, Hjem, Homelab (som sidenavn) | Q1 |
| **Smarthjem** | Hjem | «Hjem» brukes ikke som sidenavn (Q1) |
| **Faste betalinger** (siden), med filtrene **Abonnementer**, **Faste utgifter** og **Planlagte trekk** | Subscription OS | Alle funksjonene i den gamle visningen beholdes (Q4) |
| **Kalender** med filtrene **Familie**, **Bursdager** og **Skole** | Familiekalender (som egen side) | Bursdagsadministrasjonen er en visning under Kalender (Q5) |
| **Brief** | Now Brief, Dagsbrief | Q7 |
| **Live Activities**, **Backup**, **Logger** | Sikkerhetskopi, Kopier | Beholdes (Q7) |
| **Reise** (modulen), **Avganger** (visning i Reise) | Ruter, Min reise (som modulnavn) | «Ruter» bare om selskapet (Q8) |
| **Kart** som fane i **Familie** | Kart (som egen modul), Familie og kart | Reise har sitt eget kart for avganger (Q9) |
| **Nyheter** (modulen), **Nyhetslinje** (stripen øverst) | Nyhetsleser, Siste nytt, nyhetsbar, ticker | Q10 |
| **Bolig** (faste boutgifter) og **Hjem og interiør** (innkjøp) | Hjem (som kategori i Økonomi) | Data endres bare med en godkjent migrering i Fase 6 (Q11) |
| **Konto og sikkerhet** (én side) | Sikkerhet (egen side), Sikkerhet under Konto | Lik plassering på alle plattformer (Q12) |
| **Gjøremål** | Huskeliste | |
| **Transaksjoner** | Liste | |
| **Glimt** | Søk, AI (som navn på Glimt i Økonomi) | Ikonet kan være et søkeikon |
| **Finn-handler** (funksjonen), **FINN** (merket) | Finn (som fanenavn) | |
| **Totrinnsbekreftelse (2FA)** | Tofaktor, Tofaktor (2FA) | |
| **Kort** (på Oversikt), **Widgets** (på telefonen) | Widgets (om kort på Oversikt) | |
| **I kveld** | Hva skal vi se i kveld? | |
| **Kalender og gjøremål** (gruppe i Innstillinger) | Kalendere | |
| **Husstand** (gruppe i Innstillinger) | Brukere og familie | |
| **API-nøkkel** | api-nøkkel | |
| **Mangler API-nøkkel for Mybring** | Mangler posten/bring: mybring api-nøkkel | Samme mønster for andre tjenester |
| **Måned**, **3 dager** | Mnd, 3 d | Forkortelsen bare der plassen ikke strekker til (smale skjermer, widgets, klokka) |
| **Laster …** (mellomrom før …) | Laster..., Laster… | |
| **Helligdag** (offentlig høytidsdag, fri), **Merkedag** (Palmesøndag, Julaften, Nyttårsaften: ikke fri) | Offentlig høytidsdag (som type), Høytid | `type` i kalenderen og `/api/dates/holidays` (Q18) |
| **Ukentlig**, **Hver 2. uke**, **Månedlig**, **Kvartalsvis**, **Halvårlig**, **Årlig**, **Hvert 2. år** | Annenhver uke, Kvartalvis, Halvårig (som syklusnavn) | Syklusnavnene serveren sender (`cycleName`, Q40) |
| **venter: 1 234 kr** (bolig) | Brukt (om poster som venter) | Poster til gjennomgang telles ikke som brukt (Q21) |
| **Faste utgifter** (filter i Faste betalinger) | Faste trekk, Abonnementer og regninger | Husleie, forsikring og andre faste trekk som ikke er abonnementer (Fase 6) |
| **Planlagte trekk** (filter i Faste betalinger) | Kalender (i Planlegging), Faste trekk | Trekkene de neste dagene med saldoprognose (Fase 6) |
| **Sparing og planer** (side i Økonomi) | Planlegging | Sparemål, skatt, priser og abonnementsjeger (Fase 6) |
| **Kontoer og aksjer** (side i Økonomi) | Kontoer, Aksjer (som egne sider i menyen) | Aksjer er en fane på siden (Fase 6) |
| **Import** (Økonomi → Innstillinger → Import) | Import (som egen side i menyen) | Import har ett hjem (O3) |
| **‹ Homelab** (veien tilbake fra Økonomi) | ‹ Hjem, ‹ Finans | Går til Homelab-skallet (Q1, Q3) |
| **Flytt til nye kategorier** (admin-handling i Økonomi → Innstillinger → Kategorier) | Migrering, Migrer (i UI) | Forhåndsvisning, bekreft, angre (Q11) |

## Skrivemåte

- Norsk bokmål i all tekst i grensesnittet.
- Tall `1 234,56` (smalt mellomrom som tusenskille), minus `−`, dato `dd.mm.åååå`.
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
