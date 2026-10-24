# Oppdrag: Gjør Glimt faktisk forståelsesfull

Du har bygget Glimt, min selvhostede AI-assistent. Den kjører lokale modeller via Ollama og/eller oMLX (og kan gå via Open WebUI) på en Mac mini M4 med 16 GB minne. Den har verktøy for blant annet Finans, Kalender, Huskeliste, Nettsøk, kvitteringsskanning, nyhetssammendrag/morgenbrief og bildeanalyse.

**Problemet:** Glimt forstår for ofte ikke hva jeg mener, selv når den har dataene. Dette er ikke primært et modellproblem som løses med større hardware – jeg skal IKKE kjøpe ny maskin. Det er et arkitekturproblem: for mye ansvar er lagt på en liten modell (7–8B) som skal tolke, huske, regne, sortere, parse datoer og formulere svar i ett og samme kall. Små modeller er gode til å *velge* og *trekke ut*, men dårlige til å *regne, sortere, huske og resonnere over lange lister*. Glimt må bygges om slik at koden gjør det koden er god til, og modellen bare gjør det modellen er god til.

Les hele dette dokumentet før du endrer noe. Start med å kartlegge eksisterende kode (se steg 0), og lag så en plan som du viser meg før du gjør store endringer.

---

## Konkrete feil som SKAL fikses (akseptansekriterier)

Hver av disse skal bli en automatisk test (se «Testsuite»). Dagens dato i testene skal være fryst, f.eks. 2026-10-24 10:00 Europe/Oslo.

### 1. «Når er neste gang jeg skal til Nina?»
- **Hva skjer nå:** Glimt skjønner det ikke, selv om den «vet» at Nina er frisøren min.
- **Sannsynlig årsak:** Kunnskapen om at Nina = frisør blir ikke hentet inn i konteksten for dette spørsmålet, og/eller kalendersøket gjør et bokstavelig tekstsøk på «Nina» mens hendelsen heter «Frisør» (eller omvendt). I tillegg brukes trolig `llama3.2:3b` til kalender, som er for svak til denne typen tolkning.
- **Forventet:** Glimt slår opp i minnet at Nina er frisøren min, søker i kalenderen etter fremtidige hendelser som matcher *enten* «Nina» *eller* «frisør» (og andre aliaser), og svarer f.eks. «Neste frisørtime hos Nina er tirsdag 3. november kl. 14:00.» Finnes ingen: «Jeg finner ingen kommende avtale hos Nina (frisør) i kalenderen.»

### 2. «Skal se Dune på Colosseum kino 17.12 17.30»
- **Hva skjer nå:** Hele setningen havner som tittel på hendelsen.
- **Forventet:** En kalenderhendelse med
  - tittel: `Dune` (eller «Kino: Dune»)
  - sted: `Colosseum kino`
  - start: `2026-12-17T17:30` Europe/Oslo
  - slutt: standardvarighet for kino (f.eks. 3 timer), merket som antatt
- Glimt bekrefter kort hva den opprettet: «Lagt inn: Dune, Colosseum kino, torsdag 17. desember kl. 17:30.»
- Datoparsing skal gjøres **deterministisk i kode**, ikke av modellen (se «Datoer og tid»). «17.12» uten år = neste forekomst fremover i tid.

### 3. «Hvordan er været i Oslo neste time og i New York i morgen?»
- **Hva skjer nå:** Den skjønner det ikke.
- **Årsak:** Spørsmålet inneholder to deloppgaver med hvert sitt sted og hver sin tid. Ett verktøykall med én fritekstparameter håndterer ikke det.
- **Forventet:** Planleggingssteget bryter det ned i to kall: `weather(location="Oslo", time_range=neste time)` og `weather(location="New York", time_range=i morgen, i New Yorks tidssone)`. Svaret dekker begge, kort og konkret (temperatur, nedbør, vind).
- Værverktøyet skal geokode stedsnavn selv (f.eks. Open-Meteo geocoding eller Nominatim) og hente prognose (MET Norway Locationforecast med korrekt `User-Agent`, eller Open-Meteo). Tidsoppløsning («neste time», «i morgen») beregnes i kode, relativt til stedets tidssone.

### 4. «Hva er det dyreste abonnementet jeg har?»
- **Hva skjer nå:** Glimt har (eller skal ha) tilgang til dataene, men svarer feil.
- **Årsak:** Modellen får trolig en lang liste med transaksjoner/abonnementer og skal selv finne maks. Små modeller sorterer og regner upålitelig. Det kan også være blanding av måneds- og årspriser.
- **Forventet:** Et verktøy som `query_subscriptions(sort_by="monthly_cost", order="desc", limit=5)` der **koden** normaliserer alle priser til månedspris (årspris / 12, ukepris × 52 / 12), sorterer og returnerer topp-N. Modellen bare formulerer svaret: «Det dyreste abonnementet ditt er X til Y kr/mnd (Z kr/år).» Nevner gjerne nummer to og tre.
- **Generell regel:** ALL aggregering (sum, snitt, maks, min, telling, sortering, filtrering på dato/beløp/kategori) skjer i kode/SQL. Modellen skal aldri telle eller sammenligne tall i en liste.

### 5. Lese vitnemål fra bilde
- **Hva skjer nå:** Den finner noen fag, men ikke alle.
- **Sannsynlige årsaker:** (a) bildet skaleres ned så tekstrader blir uleselige, (b) visjonsmodellen (`qwen2.5vl:7b`) «oppsummerer» i stedet for å transkribere, (c) output kuttes av for lav `num_predict`/`num_ctx`, (d) ingen kontroll av fullstendighet.
- **Forventet pipeline for dokumenter (vitnemål, kvitteringer, fakturaer):**
  1. **OCR først, i kode.** Bruk Apples Vision-rammeverk (f.eks. via `ocrmac`/pyobjc, eller et lite Swift-CLI) eller Tesseract med norsk språkpakke. Dette gir all tekst med posisjon, deterministisk og raskt.
  2. **Ved store eller tette dokumenter:** del bildet i overlappende fliser (f.eks. 2–4 horisontale bånd med 10 % overlapp) og kjør OCR/visjon per flis i full oppløsning. Dedupliser rader i overlappen.
  3. **Strukturering:** gi OCR-teksten (gjerne sortert rad for rad) til tekstmodellen med et strengt JSON-schema, f.eks. `{ "fag": [{ "navn": str, "karakter": str|null, "type": "standpunkt"|"eksamen"|null }] }`.
  4. **Visjonsmodellen brukes som kontroll/supplement**, ikke som eneste kilde: f.eks. «Her er OCR-teksten. Se på bildet og rett åpenbare OCR-feil. Ikke legg til fag som ikke finnes i OCR-teksten.»
  5. **Fullstendighetssjekk i kode:** tell linjer i OCR-teksten som ser ut som fag-rader (har en karakter 1–6 eller lignende mønster) og sammenlign med antall fag i JSON. Avvik → nytt forsøk på de manglende radene, og flagg det i svaret («Fant 14 fag, 1 rad var uleselig: …»).
  6. Samme pipeline brukes for kvitteringsskanning.

### 6. Tidligere kjent feil: nettsøk ignoreres
Spørsmålet «hvem er statsminister i England» ga et utdatert svar selv om nettsøk ble kalt. Dette skal også dekkes: modellen skal bygge svaret på søkeresultatene, ikke treningskunnskap (se «Grounding»).

---

## Steg 0: Kartlegg før du endrer

Før noe kode endres, finn ut og skriv en kort oppsummering til meg:
1. Hvilke modeller brukes til hvilke oppgaver, og hvor er det konfigurert?
2. Hvordan bygges systemprompten? Hva kommer med i hvert kall (dato, minne, historikk, verktøybeskrivelser)? Logg et faktisk eksempel på hele prompten som sendes for spørsmål 1–4 over, inkludert antall tokens.
3. Hvilke `num_ctx`, `num_predict`, `temperature` og `think` sendes per kall? Blir noe av prompten kuttet bort? (Ollama kutter stille fra starten hvis prompten er lengre enn `num_ctx`.)
4. Hvordan lagres «minne» i dag (f.eks. at Nina er frisøren)? Hvordan hentes det inn i et kall?
5. Hvordan er verktøyene definert (navn, beskrivelser, parametre)? Hvor mange er eksponert samtidig?
6. Hvordan håndteres feil, tidsavbrudd og ugyldig JSON?

---

## Ny arkitektur: pipeline i steg, ikke ett stort kall

Hver brukerforespørsel går gjennom disse stegene. Hvert steg er en egen funksjon som kan testes alene, og som logges.

### Steg A – Kontekstbygger (kode, ingen modell)
Bygg en kompakt kontekstblokk som legges inn i **alle** modellkall:
- Nåværende dato, ukedag, klokkeslett og tidssone (Europe/Oslo), f.eks. «Nå: lørdag 24. oktober 2026 kl. 10:03 (Europe/Oslo)».
- Kort fast profil: hvem brukeren er (navn, by, språk).
- **Relevante minnefakta** for akkurat denne forespørselen (se Steg B), ikke hele minnet.
- De siste 4–6 meldingene i samtalen, eller et kort sammendrag av eldre historikk.

### Steg B – Minnehenting (kode + embedding)
Bygg (eller rydd opp i) et ordentlig fakta-minne:
- Tabell `memory_facts`: `id, subject, predicate, object, aliases[], created_at, source`. Eksempel: `("Nina", "er", "frisøren min", aliases=["frisør", "hårklipp", "klipp"])`.
- Tabell/kolonne med embedding per fakta (bruk `nomic-embed-text` eller tilsvarende liten embedding-modell i Ollama).
- **Henting per forespørsel:**
  1. Eksakt/fuzzy match på egennavn og aliaser i brukerens melding (kode, raskt, pålitelig).
  2. Embedding-søk, topp 5, med en terskel.
  3. Slå sammen og dedupliser, maks ca. 10 fakta inn i konteksten.
- **Spørringsutvidelse:** når et fakta matcher, legg til aliasene som søketermer for verktøy. «Nina» → søketermer `["Nina", "frisør", "hårklipp"]`.
- **Læring:** når jeg sier noe som «Nina er frisøren min» eller «husk at …», skal Glimt lagre et fakta og bekrefte kort. Ikke lagre gjetninger.

### Steg C – Planlegger / intent (modell, strukturert output)
Ett kall som returnerer **kun JSON** etter et schema (bruk Ollamas `format` med JSON-schema; valider med Pydantic/Zod; ved ugyldig JSON: ett nytt forsøk med feilmeldingen, deretter fallback). Eksempel-schema:

```json
{
  "intent": "calendar_query | calendar_create | weather | finance_query | todo | web_search | document_extract | chat | memory_save",
  "steps": [
    { "tool": "calendar_search", "args": { "terms": ["Nina", "frisør"], "from": "now", "direction": "next", "limit": 1 } }
  ],
  "needs_clarification": false,
  "clarification_question": null
}
```

Regler for planleggeren:
- Den skal **kun** velge verktøy og trekke ut parametre, ikke svare brukeren.
- Den skal kunne returnere **flere steg** (værspørsmålet = to steg).
- Datoer og tider returneres som **råtekst fra brukeren** («17.12 17.30», «i morgen», «neste time»). Koden tolker dem (Steg D).
- Bare de verktøyene som er relevante for intent eksponeres i utførelsen. Ikke kall Finans, Kalender og Huskeliste på et spørsmål om britisk politikk.
- Inkluder **few-shot-eksempler** i planleggerprompten: 1–2 per intent, inkludert eksakt de fem eksemplene øverst i dette dokumentet. Små modeller lærer formatet mye bedre av eksempler enn av beskrivelser.
- Er forespørselen genuint tvetydig, sett `needs_clarification: true` med ett kort oppfølgingsspørsmål i stedet for å gjette.

### Steg D – Normalisering (kode, ingen modell)
- **Datoer og tid:** én sentral funksjon `parse_norwegian_datetime(text, now, tz)` som håndterer bl.a. `17.12`, `17/12`, `17. desember`, `17.12.26`, `17.30`, `17:30`, `kl 1730`, `i dag`, `i morgen`, `i overmorgen`, `på fredag`, `neste fredag`, `om 2 timer`, `neste time`, `i kveld`, `neste uke`, `etter jul`. Regler: dato uten år = neste forekomst fremover; ukedag = neste forekomst (hvis i dag, bruk i dag hvis klokkeslettet ikke er passert). Skriv grundige enhetstester. Bruk gjerne et etablert bibliotek som base, men norske uttrykk må testes eksplisitt.
- **Steder:** geokoding og tidssone i værverktøyet.
- **Beløp:** «1 299,-», «1299 kr», «kr 1.299,00» → tall.

### Steg E – Verktøyutførelse (kode)
Prinsipper for alle verktøy:
- **Smale, presise verktøy** med tydelige navn og korte beskrivelser. Heller `calendar_search` + `calendar_create` enn ett `calendar(action, text)`.
- **Verktøyene gjør jobben.** Filtrering, sortering, aggregering og prisnormalisering skjer i verktøyet. Returner ferdige svar-data, ikke rådata.
- **Kompakt, strukturert retur:** JSON med bare feltene modellen trenger, maks topp-N rader. Aldri dump hele tabeller inn i konteksten.
- **Tom retur er et svar:** returner `{"results": [], "searched": {...}}` slik at modellen kan si tydelig at ingenting ble funnet, og hva det ble søkt etter.
- Kalendersøk skal matche på tittel, beskrivelse, sted og deltakere, case-insensitivt, med alle søketermer fra minneutvidelsen (OR).
- Kalenderopprettelse tar strukturerte felt (`title, location, start, end, all_day, notes`), aldri hele brukerens setning som tittel. Tittelen skal være kort og beskrivende.

### Steg F – Svarformulering (modell)
Eget kall med: konteksten fra Steg A, brukerens spørsmål og verktøyresultatene. Systemprompten skal inneholde disse reglene (se «Grounding»):
- Svar på norsk, kort og direkte. Svar på det som ble spurt om først.
- Bruk **kun** informasjon fra verktøyresultatene og konteksten for fakta om brukeren og om verden nå.
- Finner du ikke svaret i dataene, si det og si hva du søkte etter. Ikke gjett.
- Skriv datoer naturlig («tirsdag 3. november kl. 14:00»), ikke ISO.
- Ved handlinger (opprettet/endret noe): bekreft kort hva som ble gjort, med de faktiske verdiene.

### Steg G – Validering og selvsjekk (kode, valgfritt modell)
- For handlinger: sammenlign det som ble lagret med det som ble ekstrahert. Er tittelen > 60 tegn eller lik hele brukerens melding, er noe feil → nytt forsøk.
- For dokumentekstraksjon: fullstendighetssjekken fra punkt 5.
- For tallsvar: tallet i svaret må finnes i verktøyresultatet.

---

## Grounding og systemprompter

- Skriv systemprompter på **engelsk** (små modeller følger engelske instruksjoner mer presist) med eksplisitt instruks om å svare på **norsk**. Few-shot-eksemplene kan være på norsk, siden det er brukerens språk.
- Hold systemprompter **korte og konkrete**. Lange prompter med mange regler fortynner oppmerksomheten til små modeller. Bedre: en kort regelliste + gode eksempler.
- Ved nettsøk: «The search results below are newer than your training data. When they conflict with what you believe, the search results are correct. Base your answer on them and name the source briefly.»
- Dagens dato skal alltid være med. Uten den tror modellen det er treningsåret.

---

## Modellbruk og Ollama-parametre

Maskinen har 16 GB. To modeller som konkurrerer om minnet gir utlasting, tidsavbrudd og treghet. Derfor:
- **Én hovedmodell** for planlegging og svar (forslag: `qwen3:8b`, som støtter verktøy/JSON og thinking). Test også alternativer, men velg basert på testsuiten, ikke magefølelse. Sjekk at valgt modell faktisk støtter tool calling / strukturert output.
- **Visjonsmodell** (`qwen2.5vl:7b` eller tilsvarende) lastes bare ved behov, med kort `keep_alive`, og hovedmodellen lastes inn igjen etterpå.
- **Slutt å bruke `llama3.2:3b`** til tolkning (kalender, kategorisering med fritekst, ruting). Den er for svak. Den kan brukes til helt trivielle ting som ikke krever forståelse, eller fjernes.
- **Embedding-modell** (`nomic-embed-text`) for minnet. Den er liten (~300 MB).
- Én global **kø per Ollama-instans** (maks 1 samtidig forespørsel), med prioritet: interaktive spørsmål foran bakgrunnsjobber (morgenbrief, nyhetssammendrag). Ingen automatiske retries som stabler seg opp.

Parametre per kall (gjør dem konfigurerbare per steg i én sentral config):
| Steg | temperature | think | num_ctx | num_predict |
|---|---|---|---|---|
| Planlegger (JSON) | 0–0.1 | av som standard, på som fallback ved ugyldig/tvetydig plan | 8192 | 512 |
| Dokumentstrukturering | 0 | av | 16384 | 4096 |
| Svarformulering | 0.3 | av | 8192 | 600 |
| Morgenbrief/sammendrag | 0.4 | av | 16384 | 1500 |

- **Aldri** stol på Ollamas standard `num_ctx`. Send det eksplisitt i hvert kall.
- **Mål prompt-lengden** før kallet (tokens via `prompt_eval_count` i svaret eller en tokenizer-estimat). Er den nær `num_ctx`: trim historikk og verktøyresultater, ikke systemprompten.
- Hastighet er ikke viktig for meg. Rett svar er viktigere enn raskt svar. Hvis thinking gir bedre planer i testsuiten, bruk det, men med en tokengrense/tidsavbrudd så det ikke kan henge i flere minutter.
- Støtt både Ollama (`/api/chat`) og oMLX/Open WebUI (OpenAI-kompatibelt `/v1/chat/completions`) bak **én felles klient** med samme parametre, så valg av backend ikke endrer oppførselen. Map `num_ctx`/`think`/`format` riktig for hver backend.

---

## Observabilitet

For hver forespørsel, lagre en trace jeg kan se i en enkel side eller loggfil:
- brukerens melding
- hentede minnefakta (og hvorfor de matchet)
- planleggerens JSON
- normaliserte verdier (tolkede datoer, steder)
- hvert verktøykall med argumenter og resultat (avkortet)
- endelig prompt-lengde i tokens per modellkall, og om noe ble trimmet
- endelig svar, tid per steg, modell brukt

Da kan jeg se om en feil skyldes minnet, planleggeren, verktøyet eller svarformuleringen.

---

## Testsuite (obligatorisk)

Lag en testsuite som kjører mot den faktiske modellen (ikke mocket), med fryst dato og testdata (testkalender, testabonnementer, testminne, testbilde av et vitnemål). Minimum:

1. «Når er neste gang jeg skal til Nina?» med minnefakta «Nina er frisøren min» og en kalenderhendelse «Frisør» 3. november → riktig dato.
2. Samme, men hendelsen heter «Nina klipp» → riktig.
3. Samme, ingen kommende hendelse → sier tydelig at den ikke fant noe.
4. «Skal se Dune på Colosseum kino 17.12 17.30» → tittel «Dune», sted «Colosseum kino», start 2026-12-17 17:30.
5. «Middag hos mamma på fredag kl 18» → riktig fredag, tittel ikke hele setningen.
6. «Tannlege 3/2 kl 0815» → 2027-02-03 08:15.
7. «Hvordan er været i Oslo neste time og i New York i morgen?» → to værkall, riktige tidsvinduer og tidssoner, begge dekket i svaret.
8. «Hva er det dyreste abonnementet jeg har?» med blanding av måneds- og årspriser → riktig svar etter normalisering.
9. «Hvor mye har jeg brukt på mat denne måneden?» → summen kommer fra koden og matcher testdata.
10. Vitnemål-bilde med f.eks. 15 fag → alle 15 fag med riktige karakterer.
11. Kvitteringsbilde → riktig butikk, dato, totalbeløp og varelinjer.
12. «Hvem er statsminister i Storbritannia?» med mocket søkeresultat → svaret bygger på søkeresultatet.
13. «Nina er frisøren min» → lagrer minnefakta; neste spørsmål om Nina bruker det.
14. «Hva er hovedstaden i Frankrike?» → svarer direkte uten unødvendige verktøykall.

Kjør hver test 3 ganger (modellene er ikke deterministiske) og rapporter suksessrate. Målet er 3/3 på alle. Lag et enkelt kommando som kjører suiten, f.eks. `npm run eval` / `make eval`, så jeg kan kjøre den etter hver endring og ved modellbytte.

---

## Arbeidsmåte

1. Steg 0 (kartlegging) → vis meg funnene og planen.
2. Bygg testsuiten først, kjør den mot dagens kode og vis meg baseline-resultatet.
3. Implementer i denne rekkefølgen, og kjør testsuiten etter hvert steg: kontekstbygger + dato → datoparser → minne → planlegger med JSON-schema → verktøy-omskriving (kalender, abonnement/finans, vær) → svarformulering → dokumentpipeline → kø og modellstyring → observabilitet.
4. Ikke bytt ut ting som fungerer bare for å bytte. Behold eksisterende datamodeller der det går, og skriv migrering der det må endres.
5. Til slutt: vis meg testresultatet før/etter, hvilke modeller og parametre som ble valgt og hvorfor, og hva jeg må gjøre manuelt på Mac mini-en (Ollama-innstillinger, nye modeller å laste ned).
