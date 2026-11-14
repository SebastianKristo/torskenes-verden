# E – Informasjonsarkitektur og ordliste

Kartlagt fra kode (web, iOS, Android, Kalender, Watch/Wear) og med Playwright mot `test/e2e51/server.mjs` (port 4922, egen DATA_DIR `$S/audit-ia-data`, MOCK_DATA=1). 43 sider × 3 tema (Papir lys, Papir mørk, Nåværende/«glass») × 2 bredder (1440, 390) = **258 skjermbilder** i `$S/audit-E/` (navn `<tema>-<d|m>-<side>.png`), rådata i `$S/audit-E/results.json` og `analysis.txt`, skript i `crawl.mjs`/`analyze.py`. Ingen endringer i repoet.

## 1. Kort oppsummert

1. **Fire parallelle navigasjonsmodeller** for samme innhold: web-toppmeny (18 faner), web-mobil (4 faner + Mer), FinansHub-mobil på web (`/finans/` er også et komplett Homelab-skall med egne faner) og appene (Hjem-fanelinje + Finans-fanelinje + Mer). Hver har egne navn og ID-er.
2. **«Hjem» betyr tre ting**: Dashboard (mobilfane på web, iOS, Android), smarthjem-siden (`#/hjem` på web) og Finans-oversikten (intern ID `hjem` i `public/finans/js/mobile.js:83`).
3. **Toppmenyen på web er for lang**: på 1440 px ligger «Kalender» og «Skjold Lab» skjult under «Oslo ▾» og profilknappen (målt i alle sider, Papir lys og mørk). To moduler er dermed ikke nåbare fra menyen på desktop.
4. **Faste betalinger finnes fire steder** i FinansHub: Faste utgifter, Subscription OS (Abonnementer), Planlegging (faste trekk) og kategorien «Abonnementer».
5. **Integrasjoner grupperes på tre ulike måter**: `/api/integrations`, `/api/config` og iOS `Integrations26.swift` har ulike grupper (f.eks. Google Kalender under «Hjem»).
6. **Produktnavnet er uklart**: OS, Homelab, FinansHub, Nordlys OS og appnavnet fra Innstillinger brukes om hverandre.
7. Ingen JS-feil i noen av de 258 visningene (utover avbrutte eksterne kall, som er forventet i mocken). Bugs som ble funnet er layout, kontrast og 404 på `/finans/api/logo/*` og `/icons/app-icon-180.png`.

## 2. Dagens struktur

### 2.1 Navigasjonsflater per plattform

| Flate | Hvor (fil) | Innhold |
|---|---|---|
| Web toppmeny (desktop) | `public/app.html:68` | Dashboard, Vær, Chat, Studie, Rom, Økonomi (→ `/finans/`), Hjem, Mat, Sporing, Familie, Domener, Nettverk, Gjøremål, Bursdager, Kalender, Media, Kart, Skjold Lab (18). Gjengis i en annen rekkefølge enn HTML-en: Kart før Media, Domener/Nettverk etter Media (se skjermbilde `papir-d-hl-dash.png`) |
| Web bunnmeny (mobil) | `public/app.html:80` | **Hjem** (=Dashboard), Studie, Økonomi, Mer |
| Web «Mer» (mobil) | `public/js/net.js:31` | Tittel «Mer», kicker «Alle sider», men første overskrift er «Snarveier» (eksterne lenker), så Homelab-status, deretter 14 modulknapper + CV + Innstillinger |
| Web hash-ruter | `public/js/app.js:49` | 21 ruter: dash, studie, rom, hjem, matplan, sporing, familie, huskeliste, gjoremal (dublett), vaer, bursdager, kalender, chat, media, kart, familiekalender, mediakveld, skjold, domener, nettverk, mer (+ `okonomi` → `/finans/`) |
| Web profilmeny | `public/js/profile-menu.js:13` | Innstillinger, Språk, Søkebar, Nyhetslinje, Tilpass forside og meny, Rediger widgets, CV, Lås skjermen, Logg ut |
| Web Innstillinger | `public/js/settings65.js:12` | Generelt (Konto, Utseende, Varsler, App) · Husstand (Brukere og familie) · Glimt og AI (Glimt, AI; Faste oppgaver og Kvalitet som undersider) · Tilkoblinger (Integrasjoner, Kalender og gjøremål) · Moduler (Domener, Finans, Media, Nyheter, Ruter, Sporing, Studie, Vær, Skjold Lab) · Server (System, Backup, Logger) |
| FinansHub desktop sidemeny | `public/finans/js/desktop.js:27-31`, `modules.js:20` | Oversikt, Transaksjoner, Glimt, Filter, Kvitteringer, Budsjett, Faste utgifter, Kontoer, Aksjer, Rapporter, Subscription OS, Planlegging, Boliger, Finn-handler, Innstillinger (+ Import utenfor menyen) |
| FinansHub Innstillinger | `desktop.js:730` | Generelt, Utseende, Sidemeny, Boliger, Import, AI og tolkning, Aksjer · Trading 212, Kategorier, Regler, Varsler, Mobil og tilgang, Backup og data |
| FinansHub mobil (web) | `public/finans/js/mobile.js:82-83`, `mobile-p16.js:44` | Homelab-faner (Homelab, Finans, Sporing, Domener, Mat) **og** Finans-faner (Oversikt, Liste, Finn, Søk, Mer) + valgfri fanelinje med 24 mulige faner |
| iOS hovedapp («Homelab», target FinansHub) | `Store.swift:8,35,63`, `Paper16.swift:14` | Tre enumer: `Tab` (Oversikt, Liste, Finn, Budsjett, Søk, Mer), `Module` (13), `HlTab` (Homelab, Finans, Domener, Mat, Sporing) + `PaperTabItem.all` (24 valgbare faner) |
| iOS Mer | `More28.swift`, `More44Rows.swift` | ~37 rader, bl.a. «Familie og kart», «Kart» (Entur), «Hva skal vi se i kveld?», «Faste trekk», «Subscription OS» og «Abonnement» |
| iOS Innstillinger | `Paper17.swift:665` | Generelt · Brukere og familie · Glimt og AI · Tilkoblinger (Integrasjoner, **Kalendere**, **Gjøremål**) · Moduler · Server; Konto og **Sikkerhet** er egne rader |
| Android hovedapp | `AppViewModel.kt:42`, `Models16.kt:15` | `Screen`-enum (Homelab + Finans-skjermer + Mat/Domener/Sporing), samme 24 faner som iOS, men har **Media** som fane (iOS har ikke) |
| Android Innstillinger | `ui/Set67Ui.kt:50-80` | Generelt (Konto, Sikkerhet, API-tokens, Utseende, Varsler, App) · Husstand · Glimt og AI · Tilkoblinger (Integrasjoner, Kalender og gjøremål) · Moduler (Moduler, Finans, Media, Skjold Lab, Nyheter) · Server (System «Nordlys OS …», Backup, Logger) |
| Kalender iOS/Android/Mac | `KalHeader.swift:143`, `KalVm.kt:1077` | År, Mnd, Uke, 3 d, Dag, Liste (+ Agenda) |
| Kalender web | `kal39.js:234`, `kalender.js:55` | **To definisjoner** med ulik rekkefølge: Dag→År (kal39) og År→Dag (kalender.js); «3 dager»/«Måned» i stedet for «3 d»/«Mnd» |
| Watch (iOS) | `Watch51App.swift:38` | Overskriften er «FinansHub», mens visningsnavnet er «Homelab» (`project.yml:474`) |
| Wear (Android) | `wear/…/WearMain51.kt` | «Homelab»: Hent meg, Avganger, Handleliste, Media, Glimt |

### 2.2 Funksjon × plattform (navn og plassering)

| Funksjon | Web desktop | Web mobil | FinansHub web | iOS | Android |
|---|---|---|---|---|---|
| Startside | «Dashboard» (fane 1) | «Hjem» (bunnfane) | «‹ Hjem» tilbake | «Hjem» / «Homelab» | «Hjem» / «Homelab» |
| Smarthjem (HA) | «Hjem» (fane 7) | Mer → Hjem | – | (under Hjem-kort) | (under Hjem-kort) |
| Økonomi | «Økonomi» → `/finans/` | «Økonomi» | «FinansHub» / «Finans» | «Finans» | «Finans» |
| Transaksjoner | – | – | «Transaksjoner» (desktop) / «Liste» (mobil) | «Liste» (fane), «Transaksjoner» (Mer) | «Liste» |
| AI i økonomi | – | – | «Glimt» (desktop) / «Søk» (mobil) | «Søk» (`key: "ai"`) | «Søk» |
| Faste betalinger | – | – | «Faste utgifter» + «Planlegging» | «Faste trekk» / «Faste utgifter» (enum) | «Faste trekk» / «Faste utgifter» |
| Abonnementer | – | – | «Subscription OS» | «Subscription OS», «Abonnement», «Abonnementer» | «Subscription OS», «Abonnementer» |
| Finn.no | – | – | «Finn-handler» (desktop) / «Finn» (fane) | «Finn» | «Finn-handler» |
| Gjøremål | «Gjøremål» (`#/huskeliste` og `#/gjoremal`) | Mer → Gjøremål | – | «Gjøremål» | «Gjøremål» |
| Kollektiv | Kort på Dashboard, Kart, Innst. → «Ruter» | samme | – | «Avganger», «Kart» | «Avganger», «Kart» |
| Kart | «Kart» (Entur + soner) | Mer → Kart | – | «Kart» + «Familie og kart» | «Kart» + «Familie og kart» |
| Familiekalender | `#/familiekalender` (lenke fra Familie) | samme | – | «Familiekalender» | (via Familie) |
| Media «i kveld» | `#/mediakveld`, tittel «I kveld» | samme | – | «Hva skal vi se i kveld?» | «I kveld» |
| Nyheter | Ticker «SISTE NYTT», Innst. → Nyheter | samme | – | «Nyheter» og «Nyhetsleser» (to faner) | «Nyheter» og «Nyhetsleser» |
| Brief | Kort «Kveldsbrief · Glimt» | samme | – | «Now Brief» | «Now Brief» |
| Oppdatering | Innst. → System | samme | – | Innst. → Server | Innst. → System («Nordlys OS …») |
| Studie / Rom / Skjold Lab | Egne faner (Skjold skjult på 1440) | Mer | – | Mer (Studie, Skjold Lab); Rom finnes ikke (grep) | Mer (Studie, Skjold Lab); Rom finnes ikke (grep) |

## 3. Overlapp, feilplassering og navnekollisjoner

| # | Funn | Bevis | Konsekvens |
|---|---|---|---|
| O1 | «Hjem» = Dashboard, smarthjem og Finans-oversikt | `app.html:68` vs `:80`; `finans/js/mobile.js:83` (`home: ['hjem','Oversikt']`), `mobile-p16.js:45` (`hjem: ['hl','Hjem']`) | Brukeren trykker «Hjem» på mobil og havner på Dashboard, men «Hjem» i Mer er smarthjem |
| O2 | Faste betalinger fire steder | Faste utgifter (`desktop.js:27`), Subscription OS («Abonnementer og trekk», `mobile-mods.js:12`), Planlegging («Sparemål, faste trekk …», `modules.js:22`), kategori «Abonnementer» (`server/finans/db.js:328`) | Samme trekk kan vises og redigeres tre steder |
| O3 | Import to steder | Side `imp` (aldri i menyen, `desktop.js:30`) og Innstillinger → Import; `goto-import` sender til innstillinger (`desktop.js:1326`) | Uklart hvor import «bor» |
| O4 | «Widgets» betyr to ting | Profilmeny «Rediger widgets» = dashboard-kort; Innst. → App → Widgets = telefon-widgets (`widgets43.js:1`); Utseende-beskrivelsen nevner også «widgets» (`settings.js:99`) | To ulike ting under samme ord, og samme ord står i to seksjoner |
| O5 | Kalender-familien er spredt | Kalender, Familiekalender (egen rute), Bursdager (egen fane), Studie (timeplan), Innst. «Kalender og gjøremål» (web/Android) vs «Kalendere» + «Gjøremål» (iOS) | Tre-fire steder for «hva skjer når» |
| O6 | Gjøremål har to ruter og tre navn | `#/huskeliste` og `#/gjoremal` (`app.js:49`); «Lagrer i Huskeliste» (`tasks41.js:153`), «Huskeliste» i brief (`brief52.js:50`) | Huskeliste vs Gjøremål |
| O7 | Kollektivtrafikk uten eget hjem på web | Innst. → «Ruter» (`settings45.js:32`), apper: «Avganger»; web har ingen Avganger-side, bare kort og Kart | Merkenavnet Ruter brukes som funksjonsnavn |
| O8 | Integrasjoner viser oppsett som hører hjemme andre steder | Rader «Settes opp under AI → Oppgaver», «Settes opp under Kalender og gjøremål» (`papirmork-d-set-int.png`) | Integrasjoner er en blanding av egne og lenkede rader |
| O9 | Varselgrupper blander kategori og leveringsmåte | `settings-notify.js:13`: Pakker, «Finans og hjem», Familie, «Reise og vær», Bursdager, **Haptikk** | Haptikk er ikke en gruppe; Media, Glimt, System, Studie og Kalender mangler |
| O10 | Settings-søk har utdaterte stier | `settings-search.js`: «System → Mer → Kvalitet» (ligger under Glimt), «Konto → Innlogging → 2FA», «App → Topplinje → Faner», «Utseende → Kvitteringer» | Søketreffene viser en sti som ikke finnes |
| O11 | Media har dobbel lukking og skjult lenke | Mobil: både «‹ Tilbake» og «×» (`papir-m-hl-media.png`); «Hva skal vi se i kveld? ›» ligger under «‹ Tilbake» (overlapp 89×14 px, alle tema) | Lenken til `#/mediakveld` er vanskelig å treffe |
| O12 | Mobil «Mer» starter med eksterne lenker | `net.js:31`: «Snarveier» (NRK, VG, FINN …) før modulene | «Alle sider» viser ikke sidene først |
| O13 | FinansHub på mobil er et eget Homelab-skall | `mobile.js:82` HLTABS; `mobile-p16.js:44` 24 faner | To mobile web-apper med ulik meny for samme moduler |
| O14 | Ulike undersider-sett per plattform | Media: web 6 faner (`media70.js:174`), appene har Fortsett/NRK/Musikk/Serier/Filmer (grep, estimat); iOS mangler Media som fane, Android har den | Ulik funksjonsdekning |

### Datakategorier

| Kategori­sett | Kilde | Problem |
|---|---|---|
| FinansHub standardkategorier (12) | `server/finans/db.js:328` | «Bolig» og «Hjem» overlapper; «Abonnementer» kolliderer med Subscription OS; visningstekstene er andre enn navnene (`enrich.js:143`: «Mat og dagligvarer» → «Dagligvarer», «Abonnementer» → «Abonnement, fast trekk») |
| Skjold Lab | `server/skjold76/decode77.js:283` vs demo/API (`/api/skjold/categories`) | AI-standard: «Kabler», «Dioder og LED», «Skruer og bolter»; demodata: «Kabel», «Kabelsko», «LED», «Skruer» – ulikt tall og navn. «Moduler» brukes også som innstillingsgruppe |
| Integrasjoner | `/api/integrations` vs `/api/config` vs iOS `Integrations26.swift:60` | Tre gruppesett: (a) Media, Skole, Finans, E-post, Sporing, Varsler, Hjem, AI, Reise, Nettverk, Generelt; (b) Generelt, Skole, Hjem (inkl. Sporing og Bakgrunner), Media, Varsler, **Økonomi**, **Rom**, Nettverk, AI, Annet; (c) Smarthjem, Media, Transport og pakker, Økonomi, AI, Informasjon, Annet. Google Kalender ligger under «Hjem» |
| Media-faner (web) | `media70.js:174` | Oversikt, Kalender, Bibliotek, Nedlastinger, NRK, Musikk – «Kalender» kolliderer med hovedkalenderen; NRK/Musikk er kilder, ikke visninger |
| Innstillingsgrupper | web `settings65.js:12`, iOS `Paper17.swift:665`, Android `Set67Ui.kt:50` | Web: «Husstand»; iOS: gruppen heter «Brukere og familie». Sikkerhet er slått sammen med Konto på web (prompt 65), men egen rad på iOS og Android. iOS skiller Kalendere/Gjøremål, mens web/Android har dem samlet. Android har en rad «Moduler» inne i gruppen «Moduler». «AI» vs «AI og tolkning» (Finans) |
| Profilmeny vs Innstillinger | `profile-menu.js:13` | Søkebar og Nyhetslinje kan styres både fra menyen og fra Utseende |

## 4. Forslag til ny struktur (ikke implementert)

Prinsipp: **én modulliste med faste ID-er i `shared/schemas`** (id, navn, ikon, gruppe, plattformer), som web-meny, mobil Mer, fanelinje-redigering, settings-søk og iOS/Android leser. Det fjerner `TITLES`, `ROUTES`, `PaperTabItem.all`, `MAIN_TABS`, `TB`, `HLTABS` og `FINTABS` som separate kilder.

**Toppnivå (alle plattformer, samme rekkefølge):**

| Gruppe | Moduler (ID → navn) | Merknad |
|---|---|---|
| I dag | `start` → «Oversikt» (dagens Dashboard), `glimt` → «Glimt» (Chat + brief) | «Hjem» brukes ikke som navn på startsiden |
| Hjemme | `hjem` → «Smarthjem», `mat` → «Mat», `gjoremal` → «Gjøremål», `familie` → «Familie» (med Kart-fane for posisjon og soner) | `huskeliste` blir et alias |
| Tid | `kalender` → «Kalender» med filtrene Familie, Bursdager og Skole | Familiekalender og Bursdager blir visninger/filtre i stedet for egne ruter |
| Ute | `vaer` → «Vær», `reise` → «Reise» (avganger + kart), `sporing` → «Pakker» | Ett navn i stedet for Ruter/Avganger/Kart |
| Økonomi | `finans` → «Økonomi» med undersider: Oversikt, Transaksjoner, Budsjett, **Faste betalinger** (slår sammen Faste utgifter, Subscription OS og faste trekk i Planlegging), Sparing og planer, Kontoer og aksjer, Kvitteringer, Boliger, Finn, Rapporter | Én mobilmeny, ikke et eget Homelab-skall i `/finans/` |
| Fritid og læring | `media` → «Media», `studie` → «Studie», `rom` → «Rom» | Media-fanene: Nå, Bibliotek, Nedlastinger, Kilder (NRK, Musikk) |
| Verksted | `skjold` → «Skjold Lab» | |
| Drift | `domener` → «Domener», `nettverk` → «Nettverk» | Kan skjules for ikke-admin |

**Web desktop:** maks 7–8 faner i toppmenyen (brukeren velger), resten under «Alle sider ▾». Det løser at Kalender og Skjold Lab forsvinner på 1440.
**Mobil (web og app):** 4 faner + «Mer», der Mer viser modulene gruppert som over, med eksterne snarveier nederst.

**Innstillinger (lik på alle plattformer):** Konto og sikkerhet · Utseende (tema, lys/mørk, bakgrunn, forside-kort, fanelinje) · Varsler (grupper per modul; haptikk og lyd under «Levering») · Husstand · Glimt og AI · Tilkoblinger (**én** gruppering av integrasjoner, levert av serveren) · Moduler (én side per modul, samme ID som modulen) · Enheter og widgets (telefon-widgets, API-tokens, logg inn på annen enhet) · Server (System, Backup, Logger).

**Datakategorier:** Finans: slå sammen eller presiser Bolig/Hjem («Bolig» = faste boutgifter, «Hjem og interiør» = innkjøp) og la visningsnavn = lagret navn. Skjold: én kanonisk liste på serveren, med demodata som bruker den. Integrasjonsgrupper: én liste i `shared/schemas`.

## 5. Spørsmål til brukeren

1. Hva skal startsiden hete: «Oversikt», «Dashboard», «I dag» eller «Hjem»? Og skal smarthjem-siden da hete «Smarthjem»?
2. Hva skal produktet hete i UI: «Homelab», «OS», «Nordlys OS» eller det man setter selv? Er «Nordlys OS» et bevisst navn på serverprogramvaren?
3. Skal FinansHub fortsatt være en egen app/egen PWA (`/finans/`, eget manifest), eller en modul i Homelab? I dag er FinansHub-mobil et komplett Homelab-skall.
4. Skal Faste utgifter, Subscription OS og faste trekk i Planlegging bli én side («Faste betalinger»)? Skal «Subscription OS» beholdes som merkenavn?
5. Skal Familiekalender og Bursdager være egne sider eller filtre i Kalender?
6. Hvilke 6–8 moduler skal stå fast i toppmenyen på desktop?
7. «Now Brief», «Subscription OS», «Live Activities», «Backup», «Logger»: skal engelske/blandede navn beholdes eller fornorskes?
8. «Ruter» vs «Avganger» vs «Reise»: hva skal kollektivmodulen hete?
9. Skal Kart være egen modul eller en fane i Familie/Reise (i dag er det begge deler på iOS)?
10. Skal Nyheter og Nyhetsleser i appene være én modul?
11. Er Bolig og Hjem i FinansHub ment som to kategorier?
12. Skal Sikkerhet være egen side (iOS/Android) eller ligge i Konto (web)?

## 6. Ordliste (inkonsistente begreper)

Tall er treff i UI-strenger (strenger i anførselstegn i `.js/.swift/.kt`, grep-estimat; kommandoene ligger i vedlegget).

| Begrep i bruk | Hvor | Forslag |
|---|---|---|
| Dashboard / Hjem / Homelab / Oversikt (startside) | `app.html:68,80`; iOS `HlTab .hl "Homelab"`; Finans «Oversikt» | Én term (spørsmål 1) |
| OS / Homelab / Nordlys OS / FinansHub (produkt) | `app.html:10` `<title>OS`, manifest «OS – homelab»; logo «OS» i glass-tema og «Homelab» i Papir (`hltheme.js:29`); «Nordlys OS» web 15, iOS 5, Android 13; Watch «FinansHub» | Ett produktnavn + «Økonomi» for modulen |
| Gjøremål / Huskeliste | Gjøremål overalt i menyer; «Huskeliste» web 26, iOS 16, Android 12 (Glimt-tekster, brief) | «Gjøremål» |
| Faste utgifter / Faste trekk / Abonnement(er) / Subscription OS | se O2 | «Faste betalinger» + «Abonnementer» som filter |
| Finn / Finn-handler / FINN | Finans-fane «Finn», side «Finn-handler», snarvei «FINN» | «Finn-handler» (og «FINN» for merket) |
| Transaksjoner / Liste | desktop vs mobil/apper | «Transaksjoner» |
| Glimt / Søk / AI (i Finans) | desktop-side `ai` = «Glimt», mobil/apper = «Søk» | «Glimt» (ikonet kan være søk) |
| Ruter / Avganger / Min reise / Reise | Innst. «Ruter», apper «Avganger», brief «Min reise», integrasjonsgruppe «Reise» | Én term (spørsmål 8) |
| Nyheter / Nyhetsleser / Siste nytt / nyhetsbar / nyhetslinje / ticker | Profilmeny «Skjul nyhetslinje», Utseende «nyhetsbar» (`settings.js:99`), ticker «SISTE NYTT», apper har både «Nyheter» og «Nyhetsleser» | «Nyheter» (modul) og «Nyhetslinje» (stripen) |
| Totrinnsbekreftelse / Tofaktor (2FA) / 2FA | `settings.js:184` «Totrinnsbekreftelse», `settings-login.js:116` «Tofaktor (2FA)», `:146` «Tofaktor» | «Totrinnsbekreftelse (2FA)» |
| Backup / Sikkerhetskopi / Kopier | Backup web 63, iOS 24, Android 26; «Sikkerhetskopi» 1 (Android); «Kopier, gjenoppretting» (`settings.js:115`) | Velg én (spørsmål 7) |
| Widgets (forsidekort) / Widgets (telefon) | O4 | «Kort» på forsiden, «Widgets» for telefonen |
| Hva skal vi se i kveld? / I kveld | iOS vs web/Android | «I kveld» |
| Familie / Familie og kart | web vs apper | Følger beslutningen om Kart |
| Kalendere / Kalender og gjøremål | iOS vs web/Android | «Kalender og gjøremål» |
| Husstand / Brukere og familie (gruppenavn) | web/Android vs iOS | «Husstand» som gruppe |
| Måned / Mnd, 3 dager / 3 d | web vs apper | Fullt ord der det er plass, forkortelse bare på smale skjermer |
| Domener/Sporing vs Domener / Sporing | iOS `Paper16.swift:18` vs web `mobile-p16.js:45` | Mellomrom rundt skråstrek eller ikke, men likt overalt |
| api-nøkkel / API-nøkkel | «Mangler api-nøkkel» (Integrasjoner) vs «API-tokens» | «API-nøkkel» |
| «Mangler posten/bring: mybring api-nøkkel» | Integrasjoner → Sporing | «Mangler API-nøkkel for Mybring» |
| Laster … / Henter … | «Laster …» 90 + 4, «Henter været …»; ingen «...»-varianter funnet i UI-strenger | OK – behold «…» med mellomrom |
| Now Brief | 9/9/10 filer | Spørsmål 7 (f.eks. «Brief» eller «Dagsbrief») |

Feilstavinger: grep etter vanlige feil (forsatt, istedet, ihvertfall, igjenn, Vennligst, Epost/WiFi/Qr-kode/FaceID/HomeAssistant/Trading212/OpenWebUI) ga **0 treff** i UI-strenger. Problemet er inkonsekvens, ikke stavefeil. Mindre ting: «Appprofil» (Android/iOS; riktig, men tungt å lese – vurder «Appens profil»), «Subscription OS» og «Now Brief» er engelsk i et ellers norsk grensesnitt.

## 7. Bugs fra gjennomkjøringen (web, 1440/390 × Papir lys/Papir mørk/Nåværende)

Metode: `crawl.mjs` logger inn via API, setter tema per kontekst (overstyrer `GET /api/me/layout`), besøker 20 Homelab-ruter, 7 innstillingssider og 16 FinansHub-sider, venter 2,2 s og måler: `pageerror`/`console.error`, svar ≥ 400, `scrollWidth > innerWidth`, elementer utenfor visningen, klikkbare elementer som overlapper (unntatt `position:fixed`), tekstklipping og WCAG-kontrast (bladnoder med ensfarget bakgrunn).

| # | Alv. | Plattform | Funn | Repro / bevis |
|---|---|---|---|---|
| B1 | **Høy** | Web desktop, Papir lys og mørk | Toppmenyen er bredere enn plassen: «Kalender» ligger under «Oslo ▾» (65×30 px overlapp) og «Skjold Lab» under profilknappen (40×30). Modulene kan ikke nås fra menyen | 1440×900, alle `hl-*`-sider; `papir-d-hl-dash.png`, `papir-d-hl-studie.png` |
| B2 | Middels | Web alle | «Hva skal vi se i kveld? ›» på Media ligger under «‹ Tilbake» (85–89 px bred overlapp) | `#/media`, alle 6 kombinasjoner; `papir-m-hl-media.png` |
| B3 | Middels | Web Papir | Lav kontrast: oransje statusverdier i Integrasjoner («Mangler api-nøkkel», `#F3B54A` på `#FFFDF8`) **1,79:1**; SSL-datoer på Domener (`#F2B56B` på hvitt) **1,81:1** | `papir-d-set-int.png`, `papir-d-hl-domener.png` |
| B4 | Middels | Web Papir mørk | Glimt-pillen «Oppsummering» på Domener er lys i mørk modus; «GLIMT» 1,79:1 | `papirmork-d-hl-domener.png` |
| B5 | Middels | FinansHub mobil | Skann-knappen (FAB) dekker beløpskolonnen i «Siste transaksjoner» | `papir-m-fin-ov.png` |
| B6 | Lav | Web mobil, Papir | Ikonplassholdere i «Snarveier» (YR, CA, CH …) 2,35:1 | `papir-m-hl-mer.png` |
| B7 | Lav | Web Nåværende | Korttittel «Snarveier» på Dashboard 2,12:1; «Du har siste versjon» (hvit på `#B0A998`) 2,34:1; FinansHub Import «Lagre» (mørk tekst på mørkegrønn) 1,99:1 | `glass-d-hl-dash.png`, `glass-d-set-system.png`, `glass-d-fin-imp.png` |
| B8 | Lav | FinansHub (alle tema) | Ticker-fargene på Aksjer (AAPL, NVDA, EQNR, VWCE, MSFT) 1,6–2,4:1 på lys bakgrunn | `*-fin-aks.png` |
| B9 | Lav | Web/FinansHub | 404: `/finans/api/logo/<domene>` for alle logoer når nettet er stengt (forventet i mock, men gir støy i konsollen; serveren burde svare med reserve/204), og `/icons/app-icon-180.png` på FinansHub mobil (feil sti – Homelab bruker `/assets/icons/app-icon-180.png`, se `app.html:14`) | `fin-ov`, `fin-dir` mobil, alle tema |
| B10 | Lav | Web | Vanlig fanetittel følger ikke innstillinger: med Innstillinger åpen viser `<title>` siden bak («Nettverk · Homelab»). `#/mer` på desktop gir Nettverk (bevisst, `app.js:58`), men da er Mer-lenker til `#/mer` misvisende | `set-*`-resultater |
| B11 | Lav | Web Vær | «Henter været …» står fortsatt etter 2,2 s i mocken (Dashboard viser 5° for samme sted) | `papir-d-hl-vaer.png` – bør sjekkes mot ekte server |
| B12 | Lav | Web | Kalender viser en toast «Vi ryddet kalenderne: 6 → 4» uten at brukeren har gjort noe | `papir-m-hl-kalender.png` – spørsmål: er automatisk rydding ønsket? |
| B13 | Lav | Web | Tekstklipping med ellipsis uten tooltip: Sporing («AliExpress · USB-C-kabler»), Media-plakater, FinansHub Kvitteringer og Subscription OS | `analysis.txt` (CLIP) |

Ikke funnet: ingen JS-feil (`pageerror`) i noen av de 258 visningene, ingen horisontal scroll på 390 px, ingen elementer utenfor visningen.

Falske positiver som er sortert bort: overlapp mot den faste bunnmenyen og mot innholdet bak innstillingsmodalen; «hvit logo på papir» (logoen ligger over fotoet); avbrutte eksterne kall (fonter, kartfliser).

## 8. Sikkerhet i forbifarten

Ingenting nytt funnet i IA-arbeidet. Merk at `profile_menu.order` i lagret layout fortsatt inneholder «tema», som er fjernet (`profile-menu.js:11` renser det på klienten). Dette er gammel data på serveren, ikke en sikkerhetsfeil.
