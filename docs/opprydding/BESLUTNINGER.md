# Opprydding – beslutninger

14.11.2026: Brukeren godkjente planen i [AUDIT.md](AUDIT.md) og ba om at spørsmålene i §12 avgjøres uten å vente på svar. Svarene står her, med begrunnelse. Ingen av dem fjerner en funksjon brukeren har i dag. Der noe slås sammen, finnes det samme etterpå på et nytt sted, og gamle lenker videresendes. Brukeren kan overstyre hver beslutning. Si fra, så endres den før den aktuelle fasen.

Grunnregler for beslutningene:
- **Ingen funksjon forsvinner.** Sammenslåing betyr samme funksjon på ett sted, med videresending fra det gamle.
- **Flertallets oppførsel vinner** når implementasjoner er uenige, så færrest mulig ser en endring.
- **Systemstandard** (Apple HIG og Material 3) når det ikke finnes en god grunn til å avvike.

## Navn og struktur (gjennomføres i Fase 6, navnene brukes allerede fra Fase 1)

| # | Spørsmål | Beslutning | Begrunnelse |
|---|---|---|---|
| Q1 | Navn på startsiden | **«Oversikt».** Smarthjem-siden heter **«Smarthjem»**. «Hjem» brukes ikke som sidenavn | «Hjem» betyr tre ting i dag |
| Q2 | Produktnavn i UI | **«Homelab»** overalt i UI (appnavn, titler, logo). «Nordlys OS» brukes bare om serverprogramvaren i dokumentasjon og teknisk tekst. Økonomimodulen heter **«Økonomi»** i UI, og «FinansHub» blir et internt navn | Appene heter allerede Homelab på hjemskjermen |
| Q3 | FinansHub egen app eller modul | **Modul i Homelab.** `/finans/` beholdes som adresse, og PWA-snarveien virker fortsatt. Mobil-web bruker samme skall og navigasjon som resten (ikke et eget Homelab-skall) | Fire navigasjonsmodeller blir én. Lenker og snarveier virker som før |
| Q4 | Faste betalinger | **Én side, «Faste betalinger»**, med filtrene Abonnementer, Faste utgifter og Planlagte trekk. Navnet «Subscription OS» utgår, men alle funksjonene i den visningen beholdes | Samme data vises fire steder i dag |
| Q5 | Familiekalender og Bursdager | **Filtre i Kalender** (Familie, Bursdager, Skole). Bursdagsadministrasjon (legg til, rediger, påminnelser) blir en egen visning under Kalender. Gamle ruter videresendes | Samme hendelser vises tre steder |
| Q6 | Faste faner i toppmenyen på desktop | **Oversikt, Kalender, Økonomi, Media, Familie, Mat, Gjøremål, Skjold Lab** + «Alle sider ▾». Brukeren kan bytte rekkefølge og hvilke som vises (som i dag) | Løser at moduler ikke kan nås på 1440 px |
| Q7 | Engelske navn | «Now Brief» → **«Brief»**. «Subscription OS» → del av «Faste betalinger». **«Live Activities»** og **«Backup»** beholdes (systembegrep og vanlig norsk bruk). «Logger» beholdes | Kortest mulig vei til konsekvente navn |
| Q8 | Kollektivmodulen | **«Reise»**. Avganger er en visning i Reise | Dekker avganger, kart og reiseplan |
| Q9 | Kart | **Fane i Familie** (posisjoner og soner). Reise har sitt eget kart for avganger | Følger hva kartet viser |
| Q10 | Nyheter og Nyhetsleser | **Én modul, «Nyheter».** Stripen øverst heter «Nyhetslinje» | – |
| Q11 | «Bolig» og «Hjem» i Økonomi | To kategorier: **«Bolig»** (faste boutgifter) og **«Hjem og interiør»** (innkjøp). Ingen data endres uten en migrering som godkjennes i Fase 6 | Navnene skal ikke kunne forveksles |
| Q12 | Sikkerhet | **«Konto og sikkerhet»** som én side på alle plattformer | Lik plassering overalt |

## Design (Fase 1 og 3–5)

| # | Spørsmål | Beslutning | Begrunnelse |
|---|---|---|---|
| Q13 | Mørkt glass («cur») | **Beholdes som egen stil.** Tokens får **stil** (Papir, Glass) × **modus** (lys, mørk). Glass har bare mørk modus i dag og får ikke lys ennå | Det er en funksjon. Å fjerne den ville bryte regelen |
| Q14 | Lyse Familie-, Kalender- og Media-sider i glass | **Feil.** Alle sider følger valgt stil og modus | Målt som fargefeil (B-F2) |
| Q15 | FinansHubs egne temaer | Økonomi **følger Homelab-modusen og -stilen** (`mork` = Papir mørk, `glod` = Glass). Homelab-valget vinner alltid; det gamle FinansHub-valget brukes bare når Homelab-modusen er ukjent, og det endrer aldri Homelab-temaet | Mørk modus skal ikke måtte velges to steder (B-F1) |
| Q16 | Dynamic color og iOS-stil | Android: **dynamic color forblir av** (fast designspråk). iOS: tvunget mørk systemstil **fjernes**, og systemstilen følger appens modus. Kun stående iPhone **beholdes** (iPad og Mac roterer fritt) | Lyse temaer skal ikke få mørke systemflater |

## Logikk (Fase 2)

| # | Spørsmål | Beslutning | Begrunnelse |
|---|---|---|---|
| Q17 | «mandag» på en mandag, «neste fredag» på en mandag | «mandag» = **i dag** hvis klokkeslettet ikke har passert, ellers om 7 dager. «neste fredag» = **førstkommende fredag** (om 4 dager). «fredag neste uke» = om 11 dager | Flertallet (Glimt, web og iOS) gjør slik i dag |
| Q18 | Merkedager i Kalender | **Ja**, serveren leverer helligdager og merkedager (Palmesøndag, Julaften, Nyttårsaften …) med type, og klientene viser dem | Appene viser dem allerede når serveren ikke svarer |
| Q19 | 404-reserver for eldre servere | **Fjernes i Fase 2**, når server og apper kommer i samme release. Appene viser «Oppdater serveren» hvis serveren er for gammel (versjonssjekk mot `/api/version`) | 242 reserver gir to sannheter |
| Q20 | Tidssone | **Oslo-tid** for husstandsdata (kalender, frister, trekk, bursdager). Klokkeslett på reise vises i Oslo-tid med lokal tid i parentes der det betyr noe | Husstanden er i Oslo. Serveren regner i Oslo |
| Q21 | «Betalt siste 12 mnd» og bolig «brukt» | Prøver som er gått over til betalt **tas med**. Bolig-poster som venter eller er AI-forslag **telles ikke** i «brukt», men vises som en egen linje («venter: X kr») | Bare bekreftede beløp er «brukt» |

## Sikkerhet og drift

| # | Spørsmål | Beslutning | Begrunnelse |
|---|---|---|---|
| Q22 | Posten/Bring/PostNord med innebygde app-verdier | **Beholdes** (funksjon). Verdiene flyttes fra koden til én konfigurasjonsfil i Fase 2, med dagens verdier som standard, så de kan byttes uten kodeendring. Risikoen står i `docs/sikkerhet.md` | Sporingen er i bruk |
| Q23 | Utløp for app-tokens | **Ja: 180 dager glidende.** Utløpet forlenges ved bruk, så aktive apper merker ingenting. Tilbakekalling som i dag | Glemte enheter skal ikke ha evig tilgang |
| Q24 | Android-signeringsnøkkel | **Ny nøkkel**, bare i GitHub-hemmeligheter. Den gamle fjernes fra repoet (Fase 0b). **Historikken skrives ikke om**, fordi den gamle nøkkelen blir verdiløs når telefonene har appene med ny signatur. Krever én reinstallasjon | Omskriving av historikken krever force-push på main og nye kloner, og gir lite når nøkkelen byttes |
| Q25 | XCTest, JUnit og emulator i CI | **Ja**, legges til i Fase 4 og 5 | Trengs for «test først» på mobil, baseline-profiler og Macrobenchmark |

## Opprydding som kunne fjerne noe

| # | Spørsmål | Beslutning |
|---|---|---|
| Q26 | FinansHubs gamle kalender på iOS (5 165 linjer) | Fjernes i Fase 4 **bare** hvis alt den kan, finnes i den innebygde Kalenderen. Mangler noe, flyttes det dit først |
| Q27 | Kalender som egen app og inne i Homelab | **Begge beholdes.** De deler kode (én kalendermodul brukt av begge mål) |
| Q28 | macOS 14 for Mac-appen | **Ja.** Mac-appen kan bruke `@Observable` og dele kode med iOS-Kalender |
| Q29 | Eldre API-aliaser | **Beholdes**, men samles i én alias-tabell som logger bruk. Aliaser uten bruk på 60 dager tas opp igjen før de fjernes |
| Q30 | Gammel `receipts`-tabell | Data flyttes til Økonomi-kvitteringer i Fase 2. `/api/receipts` beholdes som alias |
| Q31 | Samsung- og låseskjerm-widgeter | **Beholdes**, men genereres fra én definisjon per widget |
| Q32 | Kvitteringstolking på enheten (iOS) | **Beholdes** som reserve uten nett. Serveren er førstevalg |
| Q33 | Fanelinje som kan tilpasses per seksjon (iOS) | **Tilpasningen beholdes**, men bygges på systemets `TabView` (maks 5 faner, resten under «Mer»). Fanelinja skifter ikke innhold per seksjon |
| Q34 | Automatisk rydding av kalendere | **Ikke uten handling.** Vises som forslag («Slå sammen 6 → 4?») med Angre |
| Q35 | Onboarding som blokkerer dype lenker | **Nei.** Dype lenker åpnes direkte, og onboardingen vises som et kort som kan fullføres senere |

## Tillegg fra Fase 1 (testvektorer)

| # | Spørsmål | Beslutning |
|---|---|---|
| Q36 | «fredag om to uker» | Fredag i uka to uker frem (fra mandag 16.11 = 04.12) |
| Q37 | Klokkeslett uten dato som har passert | I morgen (som Glimt i dag) |
| Q38 | «halv tre» | 14:30 på dagtid (som i dag) |
| Q39 | Lokal adresse for serveradresse-valg | 10/8, 172.16/12, 192.168/16, 100.64/10 (Tailscale), 169.254/16, `localhost`, `.local`, `.lan`, `.home.arpa`, `.internal` og navn uten punktum. **«Pålitelig enhet» (passord hoppes over) bruker fortsatt den strengere regelen** fra tilkoblingen (`auth.js isLan`), uendret |
| Q40 | Abonnementssykluser | Kvartalsvis, halvårlig, ukentlig og hver 2. uke legges til på serveren i Fase 2 (i tillegg til månedlig, årlig og annethvert år). Trekkdagen glir ikke (31.1 → 28.2 → 31.3) |
| Q41 | Prompt-arkivet | `design_handoff_homelab/prompts/prompt-NN.md` er et dokumentarkiv og får beholde nummer i navnet. Navneregelen gjelder kode |
