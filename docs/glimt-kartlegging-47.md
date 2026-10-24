# GLIMT47 – Steg 0: kartlegging og plan

Kartlagt 24.10.2026 mot `main` (c9ee15b). Ingen kode i repoet er endret.
Alt som står under er kjørt mot koden eller lest i den, med fil:linje. Rådata ligger i
`/tmp/claude-0/-home-user-torskenes-verden/6c53e467-b7cb-52ea-b22e-99ea5cc7fd15/scratchpad/glimt47/`:

- `probe.mjs` kjører dagens motor i tre moduser: `local` (MOCK_DATA, ingen modell), `fake-llama` (rutene glimt og sok = llama3.2:3b) og `fake-qwen` (glimt = qwen3:8b, sok = llama3.2:3b). Den falske Ollama-en tar vare på hele request-body og svarer som en *flink* modell ville gjort (riktig verktøy). Da ser vi hva koden gjør med et godt modellsvar.
- `bodies-*.json` er hele request-bodyen som gikk til «modellen», `prompts-captured.txt` er de faktiske promptene i lesbar form, `result-*.json` og `summary.txt` viser plan, verktøy og svar per eksempel.
- `probe2.mjs` / `result-p2.json` dekker vær med kalender på OsloMet, Nina-varianter, Dune fra Hjem og fra Kalender, datoparseren og Media.
- Testserveren på port 4270 ble startet, kjørt mot og stoppet igjen (`server4270.log`).

---

## Kort fortalt

Glimt har allerede én motor (`server/glimt45/`) med register, validering, utførelse og kontroll. Problemet er hva som skjer *før* motoren:
1. **Regex bestemmer fortsatt hvem som får svare.** `LEGACY_FIRST` (`plan.js:154`) og «personal»-regexen (`engine.js:207–208`) avgjør om modellen får se spørsmålet i det hele tatt. Tre av de fire eksemplene kommer aldri til planleggeren. De går til `detectIntent` i `assist.js:230`, en regex-kjede fra prompt 32–41.
2. **Når regexen bommer, havner spørsmålet hos en modell uten data.** `toolLlm` (`assist.js:500–520`) sender spørsmålet til ruten `sok` (llama3.2:3b) med en systemprompt på 206 tegn: «maks to korte setninger», dato og alias-lista. Det følger ingen kalender, ingen verktøy og ingen abonnementer med.
3. **Verktøyene matcher for snevert eller for vidt.** `calendar.search` krever at *alle* ord treffer (AND) og bruker ikke aliaser. Den gamle `toolCalendarNext` holder seg med *ett* ord (OR), også ord som «oslo», og leter i sted-feltet.

Dette går ikke an å fikse i systemprompten, fordi modellen ikke blir spurt.

---

## 1. Funn per Steg 0-spørsmål

### 1.1 Hvilke modeller brukes til hva, og hvor er det konfigurert?

- **Ruting:** `kv(OWNER,'ai_routing')` holder `tasks:{id:{model,fallback}}`. Den redigeres i Innstillinger → AI-kontroll (`public/js/ai-control.js`) via `GET/PUT /api/ai/routing` (`server/ai-api.js:257/262`). Oppgavene står i `server/ai-run.js:44–55`. Aliasene `calendar`, `kalender`, `calendar-quick` og `calendar-glimt` peker til `glimt` (`ai-run.js:57`).
- **Tom modell = «auto»:** `resolveTask` (`ai-run.js:695–760`) velger da ruten, så reserven, så den gamle `ollamaTextModel`, og til slutt den *første installerte tekstmodellen som får plass i VRAM (8 GB)*. Med llama3.2:3b installert havner valget lett der.
- **Hvilken rute brukes av hvem:**

| Hvem | Rute | Fil:linje |
|---|---|---|
| Glimt-planleggeren («Glimt · forstår») | `glimt` | `glimt45/plan.js:46` |
| Fritt svar fra Hjem/Chat-søket når regexen ga `llm` (inkl. nettsøk-svar) | `sok` | `assist.js:507–512` |
| Klassifisering spørsmål/handling (300 ms) | `sok` | `assist.js:220` |
| Verktøyruter for Chat/Hjem («hos brukeren llama3.2:3b») | `sok` | `tool-router44.js:7` |
| Rask time (`/api/kalender/quick`, web `kal-quick.js`) og `appointment.create` | `glimt` | `calendar-quick.js:60–122` |
| Vitnemål (tekst → JSON) | `glimt` | `study44.js:185` |
| Vitnemål (bilde/striper) | `rc` (visjon) | `study44.js:182`, `study46.js:276` |
| Kvittering (bilde) | `rc` via `finans/ai.js` (gaten direkte) | `finans/ai.js:285` |
| Kategorisering | `kat`, standard `llama3.2:3b` | `ai-api.js:288`, `aihw38.js:100` |
| Chat | `chat` | `chat.js:343` |
| Embeddings | `kb` (forslag nomic-embed-text) | `ai-run.js:875`, `aihw38.js:100` |

- **llama3.2:3b** er standardforslaget for `kat` og står med `keep_alive '1h'` i `DEFAULT_MODEL_KEEP_ALIVE` (`ai-gate.js:57`). Den blir altså liggende lastet ved siden av qwen3:8b (15m) og konkurrerer om minnet på 16 GB. Hvis brukeren har satt `sok` = llama3.2:3b, er det llama som svarer på alle «uklare» Glimt-spørsmål (se 1.2).
- `toolModeFor45` (`plan.js:36–41`) gir tool calling for qwen3/qwen2.5/llama3.x/mistral …, JSON-skjema for gemma3 og for Open WebUI-veien.

### 1.2 Hvordan bygges prompten, og hva er med i hvert kall?

Logget med falsk Ollama (`prompts-captured.txt`). Tokens er anslått som tegn/3,5, siden norsk + JSON gir 3–3,5 tegn per token. `prompt_eval_count` fra ekte Ollama må måles på Mac mini-en.

**A) «Når er neste gang jeg skal til Nina?», faktisk vei: `sok` / llama3.2:3b, ingen data**
```
system: Svar på norsk i maks to korte setninger. Marker det viktigste med **…**
        Nå: lørdag 24. oktober 2026 kl. 10.21 (Europe/Oslo).
        Brukeren har lært Glimt disse navnene:
        - «nina» = frisør (tittel «Frisør · Nina»)
user:   Når er neste gang jeg skal til Nina?
```
242 tegn, ca. 70 tokens. Modellen får vite at Nina = frisør, men får ingen kalenderhendelser. Den *kan* ikke svare riktig.

**B) «Hva er det dyreste abonnementet jeg har?», faktisk vei: planleggeren (`glimt`)**
- system: 2 043 tegn, norsk regelliste med ett eksempel. Den starter med «I dag er lørdag 24. oktober 2026 (2026-10-24), tidssone Europe/Oslo». Klokkeslett er ikke med (`engine.js:187`).
- user: `Melding: Hva er det dyreste abonnementet jeg har? /no_think`
- tools: **alle 17 verktøy** med norske beskrivelser og JSON-skjema, 8 872 tegn.
- Totalt ca. 10 970 tegn, altså **ca. 3 100–3 600 tokens**.

**C) «Skal se Dune …» og D) værspørsmålet** når ingen modell (se 2.2 og 2.3). Hvis de hadde nådd planleggeren, ville prompten vært den samme som B med en annen `Melding:`, altså ca. 3 100–3 600 tokens. I JSON-modus (gemma3/Open WebUI) er systemprompten 4 679 tegn (ca. 1 340 tokens, verktøylista i tekst) pluss skjemaet i `format`.

**Dette er aldri med:** samtalehistorikk (bare «Sist vist: …» fra `ctxOf45`, 30 min, `tools.js:115`), profil (navn, by), minnefakta i planleggeren (aliasene går bare til `sok`, rask time og `parseQuick`) og AI-minnet fra Chat (`ai_memory43`, brukes bare i `chat.js:53`).

### 1.3 num_ctx, num_predict, temperature og think per kall – blir noe kuttet?

| Kall | num_ctx | num_predict | temperature | think | format/tools | Kilde |
|---|---|---|---|---|---|---|
| Planlegger (`glimt`) | **4096** | 320 | 0 | false + `/no_think` | 17 tools, eller `format: <schema>` | `plan.js:46`, `ai-run.js:569`, `ai-gate.js:377–380` |
| Fritt svar (`sok`) | 4096 (8192 med nettsøk) | 160 | 0,3 | false | – | `assist.js:511–512` |
| Klassifisering (`sok`) | 4096 | 12 | 0 | false | `format:'json'` | `assist.js:220` |
| Vitnemål tekst (`glimt`) | **4096** | 900 | rutens (0,7) | false | `format:'json'` | `study44.js:185` |
| Vitnemål stripe (`rc`) | 4096 | 700 | rutens | false | schema | `study46.js:276` |
| Kvittering (`rc`) | 4096 (`shortBody`) | ikke satt | 0,2 | false | schema | `finans/ai.js:285`, `ollama-opts.js:16` |
| Chat | 8192 (innstilling) | – | 0,7 | innstilling | – | `chat.js:180/343` |

- Alle korte kall får `num_ctx = min(params.numCtx, 4096)` (`ai-run.js:569`, `SHORT_NUM_CTX` i `ollama-opts.js:16`). Det er sendt eksplisitt, så Ollama-standarden brukes ikke, men taket er lavt.
- **Planleggeren ligger på grensen.** 3 100–3 600 prompt-tokens + 320 i svar mot 4096. Kommer det på few-shot-eksempler eller lengre verktøybeskrivelser, kutter Ollama i stillhet. Ingen kode måler dette før kallet. `tokIn` logges i `ai_runs` etterpå (`ai-run.js:810`), men ingen bruker tallet.
- **Vitnemål-tekst:** opptil 12 000 tegn OCR-tekst (`study44.js:218`, ca. 3 500–4 000 tokens) + prompt + 900 i svar mot 4096. Dette **kuttes** for lange dokumenter, og det er en sannsynlig årsak til at fag mangler (akseptansepunkt 5).
- think er alltid av på korte kall, og ingen sti slår det på ved ugyldig plan. Temperatur 0,7 (rutens standard) brukes til dokument-JSON.

### 1.4 Hvordan lagres «minne», og hvordan hentes det?

To lagre som ikke snakker sammen:
1. **`glimt_memory`** (`glimt-memory.js:27–38`): `kind 'alias'|'fact', match, type, title, note`. «Nina er frisøren min» gjenkjennes av `parseMemoryIntent` (`glimt-memory.js:176`). Den lagres som `{kind:'alias', match:'nina', type:'frisør', title:'Frisør · Nina'}`, og det er verifisert i proben: «Ok, jeg husker at **Nina** er frisøren din.» Det finnes ingen aliasliste, bare *én* type av 7 faste (`MEMORY_TYPES`, linje 41). Det er ingen embedding.
2. **`ai_memory43`** (fritekst fra Chat og Claude-import) med vektorer i `ai_memory45_vec` (`claude-memory46.js`). Den brukes bare av Chat, der hele minnet (maks 4 000 tegn) legges i systemprompten. Glimt bruker den ikke.

**Henting i dag:**
- `aliasPrompt` går inn i `sok`-systemprompten og i rask time-prompten (`assist.js:490–495`, `calendar-quick.js:71`).
- `toolCalendarNext` (`assist.js:354–372`) utvider **bare fra type til navn**: «neste frisørtime» finner «Nina klipp» (verifisert). Den andre veien, fra navn til type («Nina» → «frisør»), finnes ikke.
- `calendar.search` i motoren (`tools.js:375–386`) bruker ingen aliaser.

### 1.5 Hvordan er verktøyene definert, og hvor mange er eksponert?

- Registeret `TOOLS45` ligger i `tools.js:263–622`, pluss `tools46.js`. Hvert verktøy har navn, norsk beskrivelse, JSON-skjema, `module`, `destructive`, `validate`, `run` og `verify`. Navnene har punktum (`calendar.create`).
- **Alle 17 eksponeres i hvert planleggerkall** (`plan.js:119`, `ollamaTools45()` uten filter).
- `app.answer` er en sekkepost («vær, avganger, pakker, sol, … neste time hos X, ledig tid») som sender spørsmålet tilbake til regex-kjeden i `assist.js`. Planleggeren blir til og med bedt om å bruke den for «neste time hos …» (`plan.js:87`).
- `calendar.search` har parametrene `{query, past}`, altså én fritekst og ingen `terms[]`. Den matcher `terms.every(...)` mot tittel, sted og notat (`tools.js:382`).

### 1.6 Feil, tidsavbrudd og ugyldig JSON

- **Planleggeren** (`plan.js:113–136`): maks to kall. «does not support tools» gir JSON-modus. En feilmelding med «JSON» ved første forsøk gir et nytt forsøk. Andre feil gir `null`, og da brukes lokal plan. To ubrukelige svar gir «Jeg skjønte ikke helt …». `timeoutMs: 45 000`, `noRetry: true`.
- **Gaten** (`ai-gate.js`): én felles kø (`ollamaConcurrency: 1`, `ai-run.js:91`) med prioritet interaktiv/bakgrunn. Grensene er innlasting 90 s, første token 30 s og 30 s uten nye tokens. Forbigående feil (5xx, «unloaded», ECONNRESET) prøves på nytt, maks 2 ganger (`ai-gate.js:663–669`).
- **Motoren:** `validate` per verktøy gir enten et spørsmål eller en feil. `verify()` leser tilbake fra datakilden. Feilet verktøy gir «Fikk ikke …: <feil>» (`engine.js:321`).
- **Eldre stier:** mange `catch {}` (f.eks. `assist.js:361`, `glimt-memory.js:207`). `toolLlm` gir feilteksten med «Prøv igjen»-knapp. **Media-Glimt** sier «Fant ingenting» uten å skille mellom ingen treff og feil i oppslaget (`media43.js:901–905`, `.catch(() => [])`).

---

## 2. Rotårsaker

Kjørt på 2026-10-24 kl. 10:00 (fryst klokke i motoren).

### 2.1 «Når er neste gang jeg skal til Nina?»
Testdata: alias Nina = frisør, og hendelsen «Frisør» 3.11 kl. 14:00.
- `LEGACY_FIRST` matcher `når\s+er\s+neste` (`plan.js:154`). Lokal plan blir `app.answer`, og **modellen blir aldri spurt** (`engine.js:208`).
- `detectIntent` (`assist.js:244`) krever at `RE.nextWhat` (`time|avtale|frisør|…|hos`, `assist.js:148`) treffer. «gang … til Nina» treffer ikke, så resultatet blir `llm`.
- `toolLlm` sender spørsmålet til `sok` (llama3.2:3b) uten kalenderdata (prompt A over). I proben ble svaret «Jeg vet dessverre ikke det.»
- Selv om planleggeren hadde valgt `calendar.search {query:"Nina"}`, ville søket bommet. Det er AND-søk uten alias, og «Nina» står ikke i «Frisør» (`tools.js:382`).
- Gjengitt variant: «Når er neste frisørtime?» finner «Nina klipp», fordi typeordet frisør utvides til navnet. «Nina» i Kalender-modulen finner bare hendelser som har *ordet* Nina.

### 2.2 «Skal se Dune på Colosseum kino 17.12 17.30»
- Fra **Hjem:** ingen `CREATE_RE`, og `personal` er usann fordi teksten mangler «jeg/meg/legg …» (`engine.js:207`). Da går den til `llm`, og **ingen hendelse blir laget**. Modellen svarer bare prat.
- «**Jeg** skal se Dune …» blir `tasks.glimt`, altså **Huskeliste** («Glimt deler opp beskjeden i punkter i Huskeliste …»).
- «Legg til: Skal se Dune …» gir tittelen **«Legg Til: Skal Se Dune – Kino»**. Kolon-varianten slipper gjennom `restTitle`/`cleanEventTitle45`.
- **Kalender-modulen** og forhåndsvisningen fungerer: «Dune – Kino», Colosseum Kino, 2026-12-17 17:30. Men slutten er 18:30, standard 1 time uten «antatt» (`calendar46`/`DURATION`). Kino skal ha 3 timer eller filmens spilletid.
- **Hele setningen som tittel** kommer fra den gamle **rask time-veien** (`/api/kalender/quick`, brukt av web `kal-quick.js` og `appointment.create` i `assist.js`). Der godtar `fromOllama` modellens `tittel` ukritisk, opptil 120 tegn, og **datoen kommer fra modellen** (`calendar-quick.js:96–98`). Med llama3.2:3b på `glimt` gir det hele setningen.

### 2.3 Vær → kalendersvar (begge formuleringene)
Gjengitt nøyaktig: «TRE1400 Forelesning er **tirsdag 27. oktober kl. 14.30** (om 3 dager).»
1. `analyzeWeather46` kjenner ikke «neste time» som tid (`TIME_RE`, `weather46.js:19–23`). Leddet «været i Oslo neste time» får stedet «Oslo Neste Time» og tiden `null`.
2. **Feil i `weather46.js:104–105`:** når et ledd mangler tid og et senere ledd har tid, blir `ws = [null]`, og `if (w)` dropper forespørselen. Etterfyllingen i linje 111 blir død kode. Bare New York står igjen, så `isCompoundWeather46` returnerer false.
3. Uten «sammensatt vær» faller den til `LEGACY_FIRST` (vær, og «neste time»), deretter `app.answer` og så `detectIntent`. Der kommer **`calendar.next`-sjekken (linje 244) FØR vær-sjekken (linje 250)**. «neste» + «time» oppfyller `RE.next` og `RE.nextWhat`.
4. `toolCalendarNext` (`assist.js:355–364`) lager nøkkelord av hele setningen (hvordan, været, oslo, og, new, york, …) og godtar **hvilken som helst** hendelse der *ett* ord står i tittel **eller sted**. «oslo» treffer stedet «OsloMet P35», så den første kommende forelesningen blir svaret.
- Det skyldes ikke cache, gamle svar eller samtidighet. Det er feil ruting pluss et for løst kalendersøk. Idempotensnøkkelen (`engine.js:157`) er riktig per tekst.
- Hvis planleggeren *hadde* fått spørsmålet, ville `reconcile46` (`engine.js:262`) uansett ha byttet værkallene med den (feilaktige) lokale oppdelingen. Værverktøyet har heller ikke timeoppløsning («neste time»), bare `now` og dag.

### 2.4 «Hva er det dyreste abonnementet jeg har?»
- **Fungerer i dag** (fikset i prompt 46): `finance.subscriptions` normaliserer i kode (`subs46.js`). Verifisert: Adobe CC 2 999 kr/år blir 250 kr/mnd og rangeres øverst. Modellen formulerer ikke svaret, koden gjør det.
- Gjenstår: rangering etter **år** som standard (`basis:'yearly'`), mens oppdraget vil ha «Y kr/mnd (Z kr/år)» først. Ukepris (`× 52 / 12`) må testes. Svarteksten gjentar «518 kr per måned» to ganger. Planleggerkallet ligger like under taket på 4096 (se 1.3).

### 2.5 Vitnemål fra bilde
- Prompt 46 (`study46.js`) har allerede OCR først (pdftotext-bbox / Tesseract TSV i 300 dpi), tabellrekonstruksjon og visjon i striper (1600 px) som reserve.
- Det som mangler:
  - (a) Tekstmodellen `study44.js:185` får 12 000 tegn i `num_ctx` 4096 med `num_predict` 900 og temperatur 0,7. Det **kuttes**.
  - (b) Det finnes ingen fullstendighetssjekk av typen «antall OCR-rader som ser ut som fag-rader» mot antall i JSON, og ingen nytt forsøk på manglende rader.
  - (c) Visjon brukes som *alternativ* (bare når OCR ikke ga fag), ikke som korrektur.
  - (d) Apple Vision-OCR finnes ikke, bare Tesseract.
- **Kvittering:** visjonsmodellen leser bildet først, og OCR brukes bare som kontroll ved lav sikkerhet (`finans/ai.js:392`, `lowConfCheck` linje 500). Det er motsatt av ønsket rekkefølge. Ingen `num_predict` og `num_ctx` 4096 for bilde + varelinjer.

### 2.6 Nettsøk ignoreres («hvem er statsminister i England»)
- Faktaspørsmål uten «jeg/min» går forbi planleggeren (`engine.js:205–208`) til `toolLlm`. Det er `routeTools` (`tool-router44.js`, regel og deretter `sok`/llama3.2:3b på 5 s) som bestemmer om det søkes på nettet.
- Med treff legges de i **systemprompten etter** «maks to korte setninger». Regelen står på norsk (`web-search.js:204`), med `num_predict` 160. En liten modell veier treningsdataene tyngre enn regelen.
- Det finnes ingen kontroll av at navnet i svaret finnes i søkeresultatene. Kunne ikke verifiseres her (ingen modell, ingen nett). Må testes med mocket søkeresultat mot ekte modell.

### 2.7 «Last ned siste episode fra 9-1-1»
- Media-Glimt (`media43.js:897`) er ren regex: `(?:legg til|last ned|hent|finn)\s+(.+?)…$` gjør hele resten, «siste episode fra 9-1-1», til tittel.
- Den søker i **både Sonarr og Radarr** med den teksten (linje 901). Treffregelen er «tittel == tekst» eller «tittel *inneholder* tekst» (linje 904), altså feil retning, og den normaliserer ikke «9-1-1» og «911».
- Ingen modell, ingen bibliotek-først og ingen `utvalg`. Verifisert med mock (The Rookie finnes): «Last ned siste episode fra The Rookie» gir «Fant ingenting som heter «siste episode fra The Rookie»», mens «Last ned The Rookie» gir «finnes allerede».
- Media er heller ikke et verktøy i `TOOLS45`, så hovedmotoren kan ikke ta det.

---

## 3. Arkitekturen A–G: hva finnes og hva mangler

| Steg | Finnes i `server/glimt45/` (bygg videre) | Mangler |
|---|---|---|
| **A Kontekst** | `nowLineOf` (`engine.js:187`, dato og ukedag, ikke klokke), `osloNowLine` (`tool-router44.js`, med klokke), `ctxOf45` sist viste (30 min), `sanitizeCtx` (valgt/synlig) | Én `buildContext()` brukt i *alle* modellkall, profil (navn/by), relevante fakta, siste 4–6 meldinger |
| **B Minne** | `glimt_memory` (alias + fact), `parseMemoryIntent`/`learnFromAssist`, embeddings-infrastruktur (`ai-run.embed`, `ai_memory45_vec`, nomic-embed-text) | Aliaser per fakta, navn til type-utvidelse, henting per forespørsel (eksakt/fuzzy + embedding, maks 10), søketerm-utvidelse til verktøyene, felles bruk av `ai_memory43` |
| **C Planlegger** | `modelPlan45` med tools eller JSON-skjema, ett nytt forsøk, lokal reserve, `cleanModelPlan45`, `ask`, rå datotekst | Modellen må *alltid* få planlegge (fjerne `LEGACY_FIRST`/`personal`-porten), engelsk prompt med few-shots per intent, verktøyutvalg per intent, think som reserve, `num_ctx` 8192 |
| **D Normalisering** | `dates.js` (`whenOf45`, `parseDate45`, `parsePeriod45`, `parseAmount45`), riktige for 17.12 17.30, 3/2 kl 0815 → 2027-02-03 08:15, fredag kl 18, kl 1730 | «neste time», «om 2 timer», «etter jul» (verifisert: tolkes ikke). Værets egen parser (`whenOf46`) dupliserer og bør inn i `dates.js`. Tidsvindu per steds tidssone |
| **E Verktøy** | Registeret med validate/run/verify, `finance.subscriptions` og `finance.fixed` (normalisert), `finance.summary` (SQL), `weather.get` (parallelt), kalender med idempotens | `calendar.search` med `terms[]` (OR) og sted/deltakere, `calendar.next` (erstatter `toolCalendarNext`), vær med `next_hour`, media-verktøy (tittel + utvalg), tom retur med `searched` |
| **F Svar** | Kodemaler per verktøy (`sentence()`, `engine.js:53`). Bra: tall og datoer kommer fra koden | Svarsteg med modell bare for chat/nett/fritekst, engelsk grounding-prompt, kontekst fra A |
| **G Validering** | `verify()` les tilbake, tittelregler i `calendar.create`, studie: sum mot total og `check:true` | Generell tittelregel (> 60 tegn / lik meldingen → nytt forsøk) også i rask time, fullstendighetssjekk for dokument, sjekk av at tall i svaret finnes i verktøyresultatet |
| **Observabilitet** | `logChoice` (uten tekst), `ai_runs` med `tokIn/tokOut`, `GET /api/glimt/agent/log` | Trace per forespørsel (fakta, plan, normaliserte verdier, kall, tokens og trimming, tid per steg) og en side for å se den |

---

## 4. Implementasjonsplan (oppdragets rekkefølge)

Prinsipp: motoren beholdes og utvides. De gamle stiene blir verktøy bak motoren eller fjernes når testene viser at motoren dekker dem.

**0. Testsuite og baseline** (se 5) – `eval/`, `npm run eval`. Kjøres mot dagens kode først.

**1. Kontekstbygger + dato**
- Ny `glimt45/context.js`: `buildContext(user, text, {today, now, history})` gir «Nå: lørdag 24. oktober 2026 kl. 10:03 (Europe/Oslo)», profil, fakta og historikk.
- Brukes av `plan.js` (`systemPrompt45`), `assist.js` (`localSystem`) og svarsteget.
- Klokke-fryst testkrok finnes allerede (`_setClock45`). Utvid den med `nowMs`.

**2. Datoparser**
- `glimt45/dates.js`: `parseNorwegianDateTime(text, now, tz)` som felles inngang. Legg til «neste time», «om N timer/minutter», «i kveld/natt» som tidsvindu, «etter jul», «neste uke»-vindu, og «på fredag» = i dag hvis klokka ikke er passert.
- `weather46.js` bruker denne (fjern `TIME_RE`/`whenOf46`-duplikat) og retter null-tid-feilen (`weather46.js:104–111`).
- Enhetstester i `test/p47-dates.test.js`.

**3. Minne**
- Additiv migrering av `glimt_memory` (`glimt-memory.js`): kolonnene `aliases TEXT(JSON)`, `predicate`, `source`, `embed_model` og `vec BLOB`. Eksisterende rader blir `subject=match, object=type, aliases=[type + synonymer fra TYPE_WORDS]`.
- Ny `glimt45/memory47.js`: `recallFacts(user, text)` (eksakt/fuzzy navn og alias, deretter embedding topp 5 med terskel, maks 10) og `expandTerms(facts)` som gir søketermer.
- Læring: dagens `parseMemoryIntent` blir som den er, og får i tillegg «husk at …» som `fact`.
- Valgfritt: hent også fra `ai_memory43`.

**4. Planlegger med JSON-skjema**
- `plan.js`: ny engelsk systemprompt med few-shots (de fem eksemplene + 1–2 per intent) og skjemaet `{intent, steps:[{tool,args}], needs_clarification, clarification_question}`. Den mappes til dagens `{intent, calls, ask}`.
- `engine.js:200–218`: modellen planlegger **alltid** når den er tilgjengelig. `LEGACY_FIRST`/`personal` brukes bare uten modell, eller som «hint» i `reconcile46`. `reconcile46` skal ikke overstyre gyldige værkall.
- To-trinns verktøyutvalg: først intent (lite skjema, uten verktøy), så bare intentens verktøy. Ellers sendes et filtrert sett.
- `num_ctx` 8192, tokenmåling før kall (trim historikk/fakta, aldri systemprompten), think på som reserve ved ugyldig plan.
- `app.answer` deles opp i ekte verktøy, eller beholdes bare for avganger/pakker/sol.

**5. Verktøy-omskriving**
- **Kalender** (`tools.js`): `calendar.search {terms[], from, direction:'next'|'past', limit}` med OR over tittel, sted, notat og deltakere, og automatisk alias-utvidelse. Tom retur gir `{results:[], searched:{terms}}`.
- Fjern `calendar.next` fra `detectIntent` (eller flytt den etter vær), og stram inn `toolCalendarNext` (`assist.js:244, 354–364`) til den er erstattet.
- `calendar.create`: kino-varighet 3 t (eller spilletid) merket `endAssumed`, kolonfjerning i titler.
- `calendar-quick.js:92–106`: dato og tid fra `dates.js`, modellens tittel bare hvis den er ≤ 60 tegn og ≠ meldingen (samme regel som `wordsFromText46`). Alternativt: rask time går gjennom motorens `calendar.create`.
- **Abonnement** (`subs46.js`/`tools46.js`): `query_subscriptions(sort_by, order, limit)`-form, månedspris først, ukepris-test.
- **Vær** (`tools46.js`/`weather46.js`): `weather.get {location, time_range}` med `next_hour` (timeprognose), geokoding og stedets tidssone. Feil gir «værdata ikke tilgjengelig», aldri et annet verktøy.
- **Media** (`media43.js:848–906`): tolking til `{handling, type, tittel, utvalg, sesong, episode}` (modell med skjema, regex som reserve), normaliserte titler (9-1-1 = 911), bibliotek først, «episode/sesong» gir bare Sonarr, `siste_episode` → `EpisodeSearch`, valgknapper ved likhet. Registrer `media.request` i `TOOLS45` for Hjem.

**6. Svarformulering**
- `glimt45/answer47.js`: modellkall bare for `chat.answer`/nettsøk og andre fritekstsvar. Engelsk grounding-prompt med svar på norsk og kontekst fra steg 1.
- `num_ctx` 8192, `num_predict` 600, temperatur 0,3.
- Nettsøk: regelen fra oppdraget først i prompten, kilde påkrevd, og kontroll av at egennavn i svaret finnes i treffene (ellers nytt forsøk eller sitat fra treffet).
- Kodemalene beholdes for verktøysvar.

**7. Dokumentpipeline**
- `study44.js:185/218`: `numCtx` 16384, `numPredict` 4096, temperatur 0, chunking per side/bånd.
- `study46.js`: fullstendighetssjekk (regex-rader med karakter mot `emner.length`), nytt forsøk på manglende rader og flagg i svaret. Visjon som korrektur («ikke legg til fag som ikke finnes i OCR-teksten»).
- Valgfritt: Apple Vision-OCR via et lite Swift-CLI (`ocrmac`) når serveren kjører på macOS. Tesseract som reserve.
- Kvittering (`finans/ai.js:392`): OCR først, så tekst-JSON, med visjon som kontroll. Samme fullstendighetssjekk på varelinjer mot total.

**8. Kø og modellstyring**
- Én sentral steg-config `glimt45/params47.js` (planner, document, answer, brief) som tabellen i oppdraget beskriver. `ai-run.run` får `step:` og slår opp.
- Fjern `'llama3.2:3b': '1h'` fra `DEFAULT_MODEL_KEEP_ALIVE` (`ai-gate.js:57`). Bytt standardforslag for `kat`/`sok` til hovedmodellen.
- Visjon `keep_alive 0` (finnes), gaten serialiserer allerede (`ollamaConcurrency 1`). Bakgrunnsjobber settes bak interaktive (finnes, sjekk morgenbrief/nyheter).

**9. Observabilitet**
- Tabell `glimt47_trace` (per bruker, 7 dager) og `GET /api/glimt/agent/trace/:requestId` + en enkel side under Innstillinger → Glimt → Diagnostikk.
- Innhold: melding (kan skjules), fakta med grunn, plan-JSON, normaliserte verdier, kall (avkortet), `prompt_eval_count`/estimat og trimming per modellkall, svar, tid per steg og modell.

**10. oMLX** (se 7) – etter at stegene over virker på Ollama, så samme eval kan sammenligne.

Filer som endres (hovedsakelig): `server/glimt45/{engine,plan,tools,tools46,weather46,dates,subs46,calendar46}.js`, nye `context.js`, `memory47.js`, `answer47.js`, `params47.js`, `trace47.js`, `server/assist.js` (detectIntent/toolCalendarNext/toolLlm), `server/glimt-memory.js` (migrering), `server/calendar-quick.js`, `server/media43.js`, `server/study44.js`, `server/study46.js`, `server/finans/ai.js`, `server/ai-run.js` (steg-params, numCtx), `server/ai-gate.js` (oMLX-backend, keep_alive), `public/js/ai-control.js` (motorvalg), `package.json` (`eval`-script), `docs/glimt-dataflyt.md`.

---

## 5. Testsuite: `npm run eval`

- **Struktur:** `eval/cases/*.json` (de 14 punktene i oppdraget + vær→kalender 1–10 + media 1–9), `eval/fixtures/` (testkalender, abonnementer med måned/år/uke, transaksjoner for «mat denne måneden», minne, vitnemål-bilde med 15 fag, kvitteringsbilde) og `eval/run.mjs`.
- **Kjøring:** samme oppsett som `test/p45-glimt-ollama.test.js`. Midlertidig `DATA_DIR`, innlogging, fryst klokke via `_setClock45({today:'2026-10-24', nowMin:600})` + `nowMs`, så `POST /api/glimt/agent` per case. Sjekk **lagrede data** (kalenderrad, minnerad, verktøykall i `actions`/trace), ikke bare tekst.
- **Mocket uansett modus:** værtjeneste (`_setWeather46`), nettsøk, Sonarr (`media43-mock.js` utvidet med 9-1-1, 9-1-1: Nashville, Law & Order: SVU), stedssøk og film. Modellen er det eneste som er ekte.
- **Moduser** (`EVAL_BACKEND`):
  - `mock` (standard, CI): skriptet modell (som `probe.mjs`) + `lokal` (ingen modell). Deterministisk, 1 runde.
  - `ollama`: `OLLAMA_URL=http://localhost:11434`, `EVAL_MODEL=qwen3:8b` (setter `glimt`/`sok` i rutingen for kjøringen), 3 runder per case.
  - `omlx`: `OMLX_URL=http://localhost:8000`, `EVAL_MODEL=mlx-community/Qwen3-8B-4bit`.
- **Rapport:** tabell i terminalen (case, 3/3, median tid, prompt-tokens maks, trimmet ja/nei) + `eval/results/<dato>-<modell>.json` for før/etter-sammenligning. `npm run eval -- --compare a.json b.json`.
- **Scripts:** `"eval": "node eval/run.mjs"`, `"eval:ci": "EVAL_BACKEND=mock node eval/run.mjs"`. CI-varianten kan også legges som `test/p47-eval-mock.test.js`.
- **Brukeren kjører på Mac mini:** `git pull && npm ci && EVAL_BACKEND=ollama EVAL_MODEL=qwen3:8b npm run eval`. Bilde-casene krever `EVAL_VISION_MODEL=qwen2.5vl:7b` og tesseract (`brew install tesseract tesseract-lang`).

---

## 6. Modell og parametre for 16 GB (må verifiseres med eval)

- **Hovedmodell: `qwen3:8b` (Q4_K_M, ca. 5,2 GB)** for planlegger og svar.
  - Begrunnelse: verktøy og JSON-skjema virker i Ollama (`capabilities: tools, thinking`), og den kan tenke ved behov. Den har plass med `num_ctx` 8192 (KV ca. 1,2 GB, mindre med `OLLAMA_KV_CACHE_TYPE=q8_0`).
  - Alternativer å måle: `gemma3:12b` (8,1 GB, bedre norsk, men ingen tool calling i Ollama, bare JSON-modus) og `qwen2.5:7b`. `gemma4` (9,6 GB) blir trangt sammen med visjon.
- **`llama3.2:3b` ut** av sok, glimt, kat og ruting. Fjern 1 t keep_alive. Hvis den beholdes, bare til ting som ikke krever forståelse (kategorisering med kjent butikk er allerede regelbasert de fleste steder).
- **Visjon: `qwen2.5vl:7b`** (ca. 6 GB) bare ved behov, `keep_alive 0`. Den får **ikke** plass samtidig med qwen3:8b + KV + macOS, så gaten må laste ut (gjør det allerede per modell). Alternativ å måle: `qwen2.5vl:3b`.
- **Embedding: `nomic-embed-text`** (ca. 0,3 GB). Kan ligge lastet. Lagre `embed_model` per vektor.
- **Parametre per steg:** planlegger t=0, think av (på ved andre forsøk), 8192/512. Svar t=0,3, 8192/600. Dokument t=0, 16384/4096 (bare når visjon ikke er lastet). Brief t=0,4, 16384/1500.
- **Verifiser på Mac mini-en:**
  - (1) `ollama show qwen3:8b` har `tools`.
  - (2) `prompt_eval_count` for planleggeren med few-shots ligger under 6 000.
  - (3) Minnepress i Aktivitetsmonitor med qwen3:8b + 8192 (og 16384 ved dokument).
  - (4) Ollama-innstillinger: `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`.
  - (5) Tid for think-på mot think-av på planleggeren (eval-suksessrate avgjør).
  - (6) `ollama pull qwen3:8b nomic-embed-text qwen2.5vl:7b` og `ollama rm llama3.2:3b` når eval er grønn.

---

## 7. oMLX bak ai-gate

Gaten har allerede et backend-grensesnitt (`registerBackend(name, {chatStream})`, `ai-gate.js:465–470`) med `ollama` og `openwebui`. oMLX blir en tredje backend, ikke en egen klient:

1. **`registerBackend('omlx', …)`** i `ai-gate.js`, basert på `owuiBody`/Open WebUI-strømmen: `POST ${OMLX_URL}/v1/chat/completions`, SSE, `Authorization: Bearer ${OMLX_API_KEY}` når den er satt.
   - Mapping: `num_predict` → `max_tokens`, `temperature`/`top_p` direkte, `format` (skjema) → `response_format:{type:'json_schema', json_schema:{name:'plan', schema, strict:true}}`, `think:false` → `chat_template_kwargs:{enable_thinking:false}` + `/no_think` (Qwen3), og fjern `<think>` (finnes: `stripThink`).
   - `num_ctx` sendes ikke (MLX-kontekst settes i oMLX). Logg et varsel hvis promptestimatet overstiger oMLX-modellens `max_context` fra `/v1/models`.
   - Verktøy: `tools` i OpenAI-form. **Navn med punktum (`calendar.create`) må mappes til `calendar_create`**, fordi OpenAI-kompatible servere ofte krever `^[a-zA-Z0-9_-]+$`. Map tilbake ved `tool_calls`, og les `tool_calls` fra deltaene.
   - Bilder: `toOpenAiMessage` finnes. Embeddings: `/v1/embeddings` i `gateEmbed`.
2. **Valg av backend:** `backendConfig()` (`ai-gate.js:110`) utvides med `mode:'omlx'`. Innstillinger → Glimt → AI-motor (Ollama · oMLX, adresse, nøkkel, «Bruk Ollama hvis oMLX ikke svarer»). Env: `AI_PROVIDER`, `OMLX_URL`, `OMLX_API_KEY`, `OMLX_MODEL_*`.
3. **Modell-ID-er er ulike** (GGUF mot MLX). `resolveTask` (`ai-run.js:695`) må bruke inventaret til valgt backend (`/v1/models` for oMLX) og egne ruter per motor (`tasks.glimt.omlx = 'mlx-community/Qwen3-8B-4bit'`).
4. `toolModeFor45` (`plan.js:36–41`) gir `tools` for `omlx` (ikke bare JSON som for Open WebUI).
5. **Reserve:** ved `nocontact`/5xx fra oMLX prøver gaten Ollama-backenden med Ollama-ruten, og svaret merkes «via Ollama».
6. **Prefiks-cache:** hold systemprompt og verktøyliste stabile og først. Dato og fakta i *siste* systemblokk eller i brukermeldingen (samme rekkefølge er bra for Ollama også).
7. **Søk etter direkte kall** (`11434`, `/api/chat` utenfor gaten): `finans/ai.js` bruker gaten via `gateChat`, men har egen `ollamaReachable`. `finans/sub-screenshot.js`, `ai39.js`, `settings-ask30.js` m.fl. må gjennomgås.

---

## 8. Risikoer

- **Å fjerne regex-porten** gir flere modellkall og lengre svartid (qwen3:8b på M4: anslagsvis 1–3 s per planleggerkall varm, 10–20 s kald). Brukeren prioriterer riktighet, men morgenbrief og bakgrunnsjobber må ikke blokkere (prioritet i køen finnes).
- **Regressjoner i de deterministiske svarene** (avganger, pakker, sol, prøveperioder, gjøremål 37–42) når de flyttes bak planleggeren. Eval må dekke dem, og p45/p46-testene må fortsatt være grønne.
- **Tokenbudsjett:** few-shots + 17 verktøy + kontekst kan sprenge 8192 hvis verktøyene ikke filtreres per intent. Mål `prompt_eval_count` i hver eval-kjøring.
- **Minnet på 16 GB:** qwen3:8b + qwen2.5vl:7b samtidig går ikke. Dokumentsteg med 16384 kontekst krever at visjon er lastet ut.
- **Ikke-determinisme:** 3/3-målet kan være vanskelig for vitnemål og media-tolking. Bruk temperatur 0, skjema og kodevalidering.
- **Migrering av `glimt_memory`** må være additiv (eksisterende alias og «Glimt husker»-UI bruker formen i dag).
- **oMLX:** verktøynavn med punktum, ulik støtte for `json_schema strict` per modell, ingen `num_ctx`-kontroll, og ulike modell-ID-er. Embeddings fra ulike motorer kan ikke blandes (indeksen må bygges på nytt).
- **Ingen modell i dette miljøet:** alle modellsvar her er simulerte. Rotårsakene over gjelder *rutingen og koden* og er verifisert. Hvor godt planleggeren tolker, må måles på Mac mini-en med `npm run eval`.
