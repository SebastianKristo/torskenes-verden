# Fold og iPad: eget oppsett for alle sider og menyer

Ønske 2026-10-21: «kom opp med nytt design for fold og ipad her, gjør det egentlig med alle sider og menyer, kom opp med oppsett som passer de skjermene.» (vedlegg `uploads/Screenshot 2026-10-21 at 11.27.36.png`: Gjøremål på iPad som strukket mobilside)
Fasit: `Stor Skjerm Oppsett.dc.html` → **1a** Gjøremål (fullt tegnet, iPad 1180 × 820) og **1b** regler for alle andre sider. Hjem på Fold: `claude-code-hjem-fold-ipad-oppsett.md` (1c). Kalender: `claude-code-kalender-oppsett-stor-skjerm.md`.

## Når
Bredde ≥ 600 pt/dp og bredde ≥ 0,9 × høyde (iPad liggende/stående, Fold utbrettet). Halvbrettet Fold: øvre/nedre halvdel i stedet for kolonner. Under 600: mobiloppsettet.

## Felles skall
- **Sidelinje 84 pt** til venstre (mørk `ink`): Hjem · Finans · Gjøremål · Kalender · Chat · Mer (følger valgt fanelinje). Ingen fanelinje nederst. Valgt: lys brikke.
- Toppbildet blir **ikke** et bredt banner. Tittel og undertittel står øverst i første kolonne.
- Ark (sheets) blir **sentrerte vinduer** (maks 560 pt), ikke fulle bunnark.
- Skrivefelt og flytende knapper hører til **sin kolonne**, ikke hele skjermen.
- Kolonner skilles med 1 pt `line`. Høyre kolonne har `#efe9de` (litt mørkere papir).

## 1a Gjøremål
- **Kolonne 1 (250):** «To-do for hele familien» / **Gjøremål**, LISTER (Alle, egne lister i valgt rekkefølge, Laget med Glimt, Arkivert) med antall, **+ Ny liste sist**.
- **Kolonne 2 (fleks):** når-filter (I dag · I morgen · Neste uke · Uten dato) og person-avatarer til høyre. Seksjoner med rød/svart mono-overskrift og 2 pt strek. Rader 52 pt med avkryssing, tittel, frist, avatarer. Valgt rad markert. Skrivefelt «Ny oppgave i «Mine» …» + rød ✦ nederst i kolonnen.
- **Kolonne 3 (320):** «GLIMT · 3 FORSLAG» (slå sammen, forfalt, påminn ved butikken) som kort, og **valgt oppgave** med detaljer (liste, frist, påminnelse, «Laget med Glimt»). Redigering skjer her, ikke i nytt ark.

## 1c Gjøremål på Fold (ønske 2026-10-21: «hva med fold»)
Fasit: `Stor Skjerm Oppsett.dc.html` → 1c (Galaxy Z Fold utbrettet 904 × 760 + halvbrettet).
- Fold er nesten kvadratisk og smalere enn iPad → **2 kolonner**: sidelinje **72**, lister **210**, oppgaver resten.
- **Glimt-forslag** blir en sidelengs stripe med kort (230 bredde) øverst i oppgavene, ikke egen kolonne.
- **Valgt oppgave** åpnes som panel fra høyre (300, 22 pt hjørner, skygge) over lista. Lukk med ✕ eller sveip til høyre. «Ferdig» nederst.
- **Halvbrettet (bordmodus):** lister (som piller) + «GLIMT · 3 forslag ›» over hengselen, oppgaver og skrivefelt under.
- **Stående Fold** (bredde < 0,9 × høyde): lister blir pillerad øverst, ellers som mobil men bredere spalte (maks 720).
- Samme regel på de andre sidene på Fold: tredje kolonne (detalj) blir et panel fra høyre i stedet for fast kolonne. Mer/menyer: 3 kolonner.

## 1b Andre sider
- **Hjem:** 1c (Glimt-kort venstre, faner høyre).
- **Finans:** saldokort + faste trekk (venstre) · Liste med månedstopper (midten) · valgt transaksjon/kategori + Glimt (høyre).
- **Kalender:** mini + kalendere · måned · dagen.
- **Chat:** samtaler/mapper alltid synlig (280) · samtalen.
- **Media:** faner + plakatvegg 6 kolonner · valgt serie/film i høyre kolonne (360).
- **Familie:** personer/soner · kart · valgt person.
- **Mat:** uke (venstre) · dagens middag/oppskrift (høyre).
- **Mer og menyer:** rutenett 4 kolonner (Fold 3), wiggle som før.
- **Innstillinger:** meny (280, `ink`) · innhold. Nivå 2 åpnes i høyre kolonne.

## Implementasjon
- iOS: `NavigationSplitView` (2 eller 3 kolonner) + egen sidelinje (`TabView` med `.sidebarAdaptable` på iPadOS 18, eller egen `VStack`). Android: `NavigationSuiteScaffold` (rail) + `ListDetailPaneScaffold` / `SupportingPaneScaffold`.
- Samme datamodeller som mobil. Ingen egne «iPad-sider», bare oppsett.

## Test
iPad 11"/13" liggende og stående, Galaxy Z Fold utbrettet/halvbrettet/sammenbrettet, Split View 1/2 og 1/3 (faller tilbake til mobil under 600).
