# Glimt – dataflyt og rotårsaker (prompt 45)

Kartlagt i koden før endringene. Kjeden: tekst → Ollama → intensjon → verktøyvalg → feltuttrekk → ruting → utførelse → lagring → svar.

## Slik var kjeden

| Inngang | Rute | Forståelse | Utførelse |
|---|---|---|---|
| Hjem-søk, Chat | `POST /api/assist` (`server/assist.js`) | `detectIntent()` – en lang `if`-kjede med regex (`NAV`, `RE.*`, `parseQuick`, `isHuskeMessage41` …) **før** noen modell | Én funksjon per intensjon (`toolCalendarDay`, `toolFinance`, `toolAppointment` …). Bare `intent:'llm'` kom til modellen, og da som vanlig prat |
| Kalender-appen | `POST /api/assist {source:'calendar'}` → `calendarAnswer()` (`server/kalender33.js`) | Egen regex-kjede (`/ledig|…/`, `/oppsummer|hva skjer|…/`, `/neste|når er/`) | `createFromText()` = `parseQuick` + `extrasOf`, **ingen modell** |
| Rask time | `POST /api/kalender/quick` (`server/calendar-quick.js`) | Ollama med egen prompt (JSON) → `fromOllama()` → reserve `parseQuick` | Bakgrunnskø, svar via sanntid |
| «Beskriv med Glimt» | `POST /api/kalender/describe` (`server/calendar-glimt.js`) | Lokal tolker først, Ollama som reserve, egen prompt | Fyller skjema |
| Kalender-søk | `POST /api/kalender/glimt/search` (`server/kalender41.js`) | Egen prompt `{"answer","ids"}` | – |
| Gjøremål | `POST /api/tasks/glimt` (`tasks-glimt37/40/41/42.js`) | Fire lag: lokal tolker (37), «forstår setninger» (40), bakgrunnsjobb (41), JSON-kontrakt (42) – hver med egen prompt | `insertTask` |
| Finans | `POST /finans/api/search/ask` (`finans/search42.js`) | `parseQuery42` (regex) → SQL/FTS → LLM bare for teksten | – |
| `POST /api/glimt` | `server/ai-api.js` | Egen prompt («maks to korte setninger») | – |
| Alle | `server/kal44.js` `assistLocalMw44` | Legger `parseQuick(text)` på **alle** `/api/assist`-svar med dato/tid, også spørsmål | – |
| Modellkall | `server/ai-run.js` `run()` → `server/ai-gate.js` | `format:'json'`/skjema, ingen `tools` | – |

Altså: minst **8 ulike prompts og 6 ulike parsere/handlingssystemer** for samme slags forespørsel, avhengig av hvor brukeren skrev den.

## Konkrete rotårsaker (kjørt mot koden, i dag = 23.10.2026)

1. **Regex overstyrer modellen – og modellen får aldri se handlingene.** `detectIntent()` avgjør alt før modellen. Bare det som ikke treffer noen regel går til modellen, og da som prat uten verktøy. Derfor hjalp ingen endring i systemprompten: forespørslene som feilet kom aldri dit.
2. **«Finn kvitteringen fra Elkjøp forrige måned» → `nav` («Åpner Kvitteringer»).** `NAV_PREFIX` matcher «finn …» og `NAV`-lista matcher «kvittering» – før finans-verktøyet. Det samme for «Finn kvitteringer med batterier» og «Finn kvitteringen for den nye laderen». Søket ble aldri gjort.
3. **«Flytt avtalen til fredag» → `appointment.create`** med tittelen «Flytt avtalen til» (parseQuick: `isAppointment` fordi teksten inneholder «avtale», og «fredag» gir dato). Det fantes ingen «endre/flytt»-handling, og ingen kontekst for «den».
4. **«Minn meg på å bestille service på bilen neste uke» → `appointment.create`** med tittel «Minn meg på å bestille service på bilen» (hele setningen). «Minn meg på å kjøpe melk i morgen» → `llm` (prat). Påminnelser hadde ingen sti til Gjøremål fra Hjem utenom «husk …».
5. **«Legg til kino fredag klokka sju»** → heldagsavtale: `parseQuick` kjenner ikke tallord («sju») og «klokka sju» → ingen tid. Tittelen «Kino i kalenderen» for varianten med «i kalenderen».
6. **«Legg til time 12.10 12:15 Kino se på dune»** → tittel «Kino se dune» (`restTitle44` fjerner «på» som om det var et datoord). Ingen regel lager «Kino – Dune».
7. **«Hva har jeg i kalenderen neste uke?» → `calendar.day`**: `toolCalendarDay` leser én dag (mandag), ikke uka.
8. **«Hva brukte jeg mest penger på forrige måned?» → `finance.spent`**: gir totalsum og største enkeltkjøp, ikke det brukeren spurte om (mest per kategori). `toolFinance` kjenner bare «forrige måned», «i år», «denne uka», «i dag» – «i september» ga denne måneden.
9. **«Hva kjøpte jeg for 849 kroner hos Clas Ohlson?» → `llm`**: verken beløp eller butikk ble brukt; modellen fikk spørsmålet uten data og kunne bare gjette.
10. **Bekreftet før datakilden hadde bekreftet.** `toolAppointment` svarte «Legger til … i kalenderen» mens jobben bare var lagt i kø (`startQuickJob`), med tittelen fra `parseQuick` – også når Ollama senere valgte en annen tittel, eller jobben feilet.
11. **Duplikater ved gjentak.** Ingen idempotensnøkkel. `resume()` i både `assist.js` og `calendar-quick.js` kjører jobber som sto som `running` på nytt etter omstart → samme avtale kunne lages to ganger. Ingen sjekk mot eksisterende hendelse.
12. **`local` på spørsmål.** `assistLocalMw44` la `parseQuick`-felter på svaret til «hva skjer 29.10?» – klienter som brukte `local` kunne vise en «ny avtale» for et spørsmål.
13. **Datoregler var spredt og ulike**: `parseQuick` (dd.mm → neste år), `parseDay` (prompt 35), `parsePeriod42` (finans), `extrasOf` (kalender33), `trial-parse`. Samme tekst kunne få ulik dato i Hjem, Kalender og Finans.
14. **Ingen verktøybruk i modellen.** `ai-run.run()` sendte aldri `tools`, og gaten (`ai-gate.js`) mistet `tool_calls` når den siste NDJSON-biten (done) kom uten dem.
15. **Feil ble svelget.** Flere `catch {}` gjorde at «fant ingenting» og «verktøyet feilet» så like ut for brukeren.

## Løsningen (server/glimt45/)

Én motor for alle innganger: `POST /api/glimt/agent`, og `/api/assist` (Hjem, Chat, Kalender) går internt gjennom den samme motoren.

1. **Forstå** (`plan.js`): modellen (lokal Ollama via `ai-run` → `ai-gate`, aldri sky) får meldingen, dato/tidssone/modul og sist viste elementer, og velger verktøy med strukturerte argumenter. `qwen3`, `qwen2.5`, `llama3.1+`, `mistral` … bruker **Ollama tool calling** (`/api/chat` med `tools`); `gemma3` og modeller uten verktøystøtte (eller Open WebUI-veien) bruker **`format: <JSON-skjema>`**. Får Ollama 400 «does not support tools», huskes det og JSON-modus brukes. Ugyldig JSON → ett nytt forsøk med feilmeldingen → lokal plan. Maks to modellkall. Uten modell (nede / `MOCK_DATA`) brukes den lokale planleggeren – samme planform og samme validering.
2. **Kontekst** (`tools.js` `ctxOf45`): sist viste/lagde elementer per bruker i 30 min, `context.selectedId`/`visibleIds` fra klienten.
3. **Plan**: `{intent, module, calls:[{tool, args}], ask?}` mot ett register (`TOOLS45`: navn, beskrivelse, JSON-skjema, modul, destruktiv).
4. **Validering** (`dates.js` + `validate()` per verktøy): brukerens tekst er fasit for dato/tid/beløp – egen norsk parser (12.10, 12/10, «fredag», «neste uke», «klokka sju», «halv åtte», 16h, kl 16, 1600, intervaller, månedsskifte/årsskifte, ugyldige datoer). Modellens felt brukes bare når teksten ikke sier noe selv. Tittel er aldri hele setningen. Mangler noe → ett konkret spørsmål.
5. **Utfør** via eksisterende funksjoner (`createEvent`, `updateEvent`, `deleteEvent`, `insertTask`, `search_items`/`fh_*`), med idempotensnøkkel per forespørsel (`glimt45_requests`) og sjekk mot eksisterende avtale/oppgave.
6. **Kontroller**: hver skrivende handling leses tilbake fra datakilden (`verify()`) før svaret sier at den er gjort.
7. **Svar**: kort tekst laget av koden fra det som faktisk skjedde; flere treff → liste å velge fra; ingen treff/ingen OCR → sagt ærlig. Sletting krever bekreftelse (`confirm.token`). Personlighet (Av · Litt · Full rakker) legges til etter bekreftelsen, maks én spøk, aldri ved feil, sletting, økonomi eller alvorlige tema.

Vær, avganger, pakker, sol, «hvor er», prøveperioder, «Glimt husker», fag og ledig tid går fortsatt til de eksisterende svarene (de var deterministiske og riktige), men nå via motoren (`app.answer`), så det er én inngang.

Logg: `GET /api/glimt/agent/log` og serverloggen `[glimt45] modul=… intent=… verktøy=…:done motor=…` – uten tekst, titler eller beløp.

## Tester

- `test/p45-glimt.test.js`: alle eksemplene i prompt 45 (mock-modell i JSON- og tool-modus + lokal plan), månedsskifte, årsskifte, skuddår, ugyldige datoer, tomme resultater, flere treff, verktøyfeil, manglende bekreftelse fra datakilden, gjentatte forespørsler, kontekst («flytt den»), bekreftelse ved sletting, per-bruker-data, personlighet og logg uten personopplysninger. Sjekker lagrede data, ikke bare tekst.
- `test/p45-glimt-ollama.test.js`: hele veien `ai-run` → `ai-gate` → falsk Ollama (NDJSON) uten `MOCK_DATA`: `tools` sendes for qwen3, `tool_calls` kommer gjennom gaten, gemma3 får JSON-skjema.
- Ikke testet mot ekte modell i dette miljøet (ingen Ollama). Se «Gjenstår».

## Gjenstår / manuelt

- Kjør mot ekte `qwen3:8b` på Mac mini: `POST /api/glimt/agent` med eksemplene, og se `GET /api/glimt/agent/tools` (`toolMode`). Er svaret tregt, kan `glimt`-ruten i AI-kontroll settes til `qwen3:8b` (verktøystøtte) i stedet for `gemma3`.
- Semantisk søk i kvitteringer bruker eksisterende embeddings bare når en lokal embedding-modell er valgt (Finans → AI). Uten den brukes synonymer (lader ≈ adapter/USB-C …).
- `/api/tasks/glimt` (Gjøremål-funksjonene fra prompt 37–42: del opp, matplan, slå sammen …) og `/finans/api/search/ask` er uendret; klientene bruker `/api/glimt/agent` for Glimt-feltene.
