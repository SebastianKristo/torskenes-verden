# Ordliste

[← Til README](../README.md)

Begrepene som skal brukes i grensesnittet på web, iPhone, Mac, Android og klokka. Grunnlaget er kartleggingen i [E-ia.md §6](opprydding/detaljer/E-ia.md) med beslutningene i [BESLUTNINGER.md](opprydding/BESLUTNINGER.md) (Q1–Q12) brukt. Navnene brukes i ny tekst fra Fase 1. Menyer og sider får de nye navnene i Fase 6.

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

## Skrivemåte

- Norsk bokmål i all tekst i grensesnittet.
- Tall `1 234,56` (smalt mellomrom som tusenskille), minus `−`, dato `dd.mm.åååå`.
- Ingen kjente stavefeil i UI-strengene (søket i E-ia §6 ga 0 treff). Retter du en, legg den til i tabellen.

## Avgjort i Fase 1

| Bruk | Ikke bruk | Merknad |
|---|---|---|
| Domener / Sporing (mellomrom rundt skråstrek) | Domener/Sporing | Likt på alle plattformer |
| Appens profil | Appprofil | Lettere å lese |
