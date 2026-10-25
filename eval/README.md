# Glimt eval (`npm run eval`)

Testsuiten fra oppdraget «Gjør Glimt faktisk forståelsesfull» (prompt 47). Den kjører Glimt slik appen faktisk gjør det,
mot den **ekte modellen**, og sjekker hva som ble **planlagt, kalt og lagret**, ikke bare svarteksten.

- Klokka er fryst på **lørdag 24. oktober 2026 kl. 10:00 (Europe/Oslo)**.
- Hver kjøring får en **fersk DATA_DIR** (midlertidig mappe) med seedet testdata, og mappen slettes etterpå.
- **Eksterne data er mocket**: vær og geokoding (Open-Meteo, MET, Kartverket), nettsøk (DuckDuckGo, Brave, SearXNG,
  Open WebUI-søk), Sonarr og Nominatim. Andre verter blokkeres og logges.
- **Modellen er ekte** og går gjennom appens egen kjede (`ai-run` → `ai-gate` → Ollama/Open WebUI) med samme ruting
  som i produksjon. Eval kaller aldri Ollama direkte.
- Hver case kjøres N ganger (standard 3). Rapporten viser suksessrate, median tid, modeller og en kort grunn ved feil.

`eval/` ligger utenfor `test/`, så `npm test` kjører den ikke. Den er med i Docker-imaget, så den kan kjøres i containeren.

## Kjøre

```sh
npm run eval                                        # Ollama på $OLLAMA_URL eller http://localhost:11434, 3 kjøringer
npm run eval -- --url http://192.168.1.50:11434     # en annen Ollama
npm run eval -- --backend openwebui --url http://192.168.1.30:8080 --key sk-… [--ollama-url http://…:11434]
npm run eval -- --backend mock --runs 1             # falsk modell, uten nett: viser bare at riggen virker
npm run eval -- --case 01,07,vaer --runs 5          # bare noen caser
npm run eval -- --model qwen3:8b                    # alle tekstruter (glimt, sok, chat, brief, fsok, kat) = qwen3:8b
npm run eval -- --help
```

### Rutingen (hvilken modell gjør hva)

| `--routing` | Hva |
|---|---|
| `prod-db` | Leser `ai_routing` og eierens personlige valg fra produksjonsbasen (`$DATA_DIR/homelab.db`, skrivebeskyttet). Dette er standard når fila finnes, f.eks. i containeren. Eval skriver aldri til produksjonsbasen. |
| `standard` | Standard ellers. Alle tekstruter (`glimt`, `sok`, `chat`, `brief`, `fsok`, `kat`, `dom`) = qwen3:8b, `rc` og `bar` = qwen2.5vl:7b, `kb` = nomic-embed-text. (Prompt 55: llama3.2:3b er tatt ut – den ga modellbytter mot qwen3:8b med `OLLAMA_MAX_LOADED_MODELS=1`.) |
| `auto` | Appens standard med tomme ruter, så appen velger selv. |
| `fil.json` | JSON med `{tasks:{…}}`. Det er verdien av `ai_routing`, se under. |

`--model` og `--vision-model` overstyrer på toppen av dette. Effektiv ruting står i resultatfila (`meta.routing.effective`).

### oMLX (prompt 58)

```sh
npm run eval -- --backend omlx --url http://127.0.0.1:18040 --key <nøkkel> --ollama-url http://127.0.0.1:11434
node eval/lib/fake-omlx.mjs 18040 <nøkkel>          # falsk oMLX (bare riggsjekk, uten Mac)
```

- Med `--backend omlx` går oppgavene `glimt`, `sok`, `brief`, `dom`, `fsok` og `rc` til oMLX. Tekst er `mlx-community/Qwen3-8B-4bit`
  og bilde `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`. `--model` og `--vision-model` overstyrer.
- Ollama-reserven er av, så tallene er rene oMLX. `--omlx-fallback` slår den på.
- Chat, embeddings og kvitteringenes tekststeg bruker fortsatt Ollama (`--ollama-url`). Uten den får de status «env».
- Rapporten har motoren i tittelen og p50/p90 per case og totalt. Det gjelder alle motorer, så Ollama- og oMLX-filene kan
  sammenlignes direkte. Se `docs/omlx-58.md`.

## Casene

| # | Case | Sjekker (lagret data og struktur) |
|---|---|---|
| 01 | «Når er neste gang jeg skal til Nina?» (minne Nina = frisør, hendelse «Frisør» 3.11 kl. 14) | Svaret har 3. november og 14:00, og kalenderen er uendret |
| 02 | Samme, hendelsen heter «Nina klipp» | Samme |
| 03 | Samme, bare en gammel frisørtime | Sier tydelig at den ikke fant noe, og nevner ingen dato |
| 04 | «Skal se Dune på Colosseum kino 17.12 17.30» | Én ny hendelse med tittel Dune (evt. «Dune – Kino»), sted Colosseum kino og start 2026-12-17 17:30 |
| 05 | «Middag hos mamma på fredag kl 18» | Hendelse 2026-10-30 18:00, og tittelen er ikke hele setningen |
| 06 | «Tannlege 3/2 kl 0815» | Hendelse 2027-02-03 08:15 |
| 07 | «Hvordan er været i Oslo neste time og i New York i morgen?» | To `weather.get` (Oslo i dag/neste time, New York 25.10), prognose hentet for begge, tallene fra prognosen i svaret, ingen kalenderdata |
| 08 | «Hva er det dyreste abonnementet jeg har?» | Aftenposten (89 kr/uke = 385,67 kr/mnd) nevnes først, før Adobe (3 588 kr/år) |
| 09 | «Hvor mye har jeg brukt på mat denne måneden?» | `finance.summary` gir total 2 191,10, og svaret har summen |
| 10 | Vitnemål-bilde (`fixtures/vitnemal.png`) | Alle 15 fag med riktig karakter i det lagrede dokumentet, ingen oppdiktede fag |
| 11 | Kvitteringsbilde (`fixtures/kvittering.png`) | Lagret kvittering har REMA 1000, 2026-10-22, 333,58 og alle 7 varelinjer |
| 12 | «Hvem er statsminister i Storbritannia?» | Nettsøket ble kalt, og svaret nevner det mockede (oppdiktede) navnet Eleanor Whitcombe, ingen navn fra treningsdata |
| 13 | «Nina er frisøren min» og så Nina-spørsmålet | Rad i `glimt_memory`, og neste svar gir 3. november 14:00 |
| 14 | «Hva er hovedstaden i Frankrike?» | Paris, og ingen datakall, nettsøk eller vær |
| 15 | «Last ned siste episode fra 9-1-1» (Media) | Sonarr `EpisodeSearch` for S09E06 (id 9106), eller en handling som peker på den. Riktig serie, ikke Lone Star/Nashville |
| 16 | «hvordan er været i oslo neste time og været i new york imorgen» | Som 07. Skal **ikke** gi kalendersvar («TRE1400 Forelesning …») |

Hjem-spørsmål går til `POST /api/glimt/agent` (module `home`), akkurat som søkefeltet på Hjem. Ber motoren om bekreftelse,
bekrefter eval automatisk, som når brukeren trykker Ja. Det står i tracen (`confirmed`). Media-casen gjør som
`public/js/media43.js`: agenten (module `media`) først, så `/api/media/glimt` hvis svaret er ren prat. Bildene går gjennom
`POST /api/study/documents` og `POST /finans/api/receipts`.

Bakgrunnsjobber som lagrer etter at svaret er sendt (rask time, Huskeliste), rekker å bli ferdige før sjekken. Eval venter
til ingen modellkall er i gang og det har vært stille i 1,5 s. Den ventetiden er trukket fra tiden i rapporten.

## Resultater og trace

- Terminalen viser en tabell med case, `2/3`, median tid, modell(er), største `prompt_eval_count` og første feilgrunn.
- `eval/results/<dato>-<backend>-<modell>.json` har alt, også en **trace per kjøring**: meldingen, svaret, motor og intent,
  planlagte og utførte verktøy med argumenter og resultat, hvert modellkall og eksterne kall, og seedet og lagret data før/etter.
  - For hvert modellkall: modell, `num_ctx`, `num_predict`, temperatur, think, verktøy og format, tegn og anslåtte tokens,
    `prompt_eval_count`/`eval_count` fra Ollama, tool_calls og innhold.
  - De eksterne kallene er geokoding, prognoser, søk og Sonarr.
  - `tokens.nearCtx` teller kall der prompt + `num_predict` ≥ `num_ctx`, altså kall der Ollama kan ha kuttet.
- `eval/results/<…>.md` er samme rapport i lesbar form. `eval/results/` er i `.gitignore`.
- Prompt 55: hvert modellkall har også `loadMs`, `promptMs`, `genMs` og `totalMs` fra Ollama, og rapporten viser kallene per kjøring
  (`qwen3:8b 3.1 s → qwen2.5vl:7b 12.4 s [lasting 6.2 s]`) og antall modellbytter. Glimt-tracen (`trace47`) har `timing`
  (køtid, lastetid, kald modell, tenketegn) og `errKind` for planleggeren.

### Miljøfeil (`env`)

Mangler miljøet noe en case trenger, og kjøringen faktisk traff det, får kjøringen status **`env`** med grunn (f.eks. «ingen OCR
(Mac-OCR-nøkkel mangler · Tesseract ikke installert)» eller «modell ikke installert: qwen2.5vl:7b»). Den står på egen linje i
oppsummeringen og telles ikke som modellfeil (`summary.modelFailures` / `summary.envFailures` i JSON-fila).

Eval har ingen Mac-OCR med mindre du kobler den på: `EVAL_MAC_OCR_URL=http://<mac>:8765 EVAL_MAC_OCR_KEY=… npm run eval`. Uten OCR
leser appen kvitteringer med visjonsmodellen (samme schema og validering, merket «lest med visjonsmodell (ingen OCR)», maks middels
sikkerhet) og vitnemål med visjonsmodellen i striper.

Exit-kode 0 betyr at riggen virket, uansett hvor mange caser som feilet. Det er en måling, ikke en port. Exit-kode 1 betyr
riggfeil (worker krasjet eller tidsavbrudd), og 3 betyr at modellen ikke svarte på `/api/tags`.

## Testdata (`fixtures/`)

`calendar.json`, `memory.json`, `subscriptions.json`, `transactions.json`, `weather.json`, `search.json`, `sonarr.json`,
`vitnemal.json` + `vitnemal.png` og `kvittering.json` + `kvittering.png`. Bildene er ferdig laget. De lages på nytt fra
JSON-fasiten med `python3 eval/fixtures/make-images.py`, som krever Pillow.

## Mekanikk

- `run.mjs` starter én `worker.mjs`-prosess per kjøring. Den får et minimalt miljø uten produksjonsnøkler og uten produksjonens
  DATA_DIR.
- `worker.mjs` gjør dette:
  1. Setter `DATA_DIR` til en tmp-mappe og `NODE_ENV=test`, så appen ikke lytter på en port eller starter bakgrunnsjobber.
  2. Fjerner `MOCK_DATA`, fordi den ville slått av modellen i `ai-run`/`plan`/`assist` og lagt inn demodata.
  3. Fryser klokka.
  4. Installerer nett-mockene (`lib/net.mjs`) og importerer `server/index.js` i prosessen.
  5. Logger inn, seeder testdata via appens egne API-er (abonnementene rett i tabellen, fordi ukepris ikke kan legges inn
     via API-et) og kjører casen.
- **Klokka:** `lib/clock.mjs` bytter `Date` i eval-prosessen. Den starter på 2026-10-24 10:00 og går videre i sanntid, så
  tidsgrensene virker. Motoren får i tillegg sin eksisterende testkrok `_setClock45({today, nowMin})`. Produksjonskoden er
  ikke endret. SQLite `datetime('now')` følger ikke den fryste klokka, men Glimt-stiene som testes bruker den ikke.
- `lib/fake-model.mjs` brukes bare med `--backend mock`. Den svarer som en «flink» modell for disse meldingene, og leser ikke
  bilder.

## Mac mini (baseline mot ekte modell)

```sh
xcode-select --install                   # én gang, hvis better-sqlite3 må kompileres
brew install node@22 gh tesseract tesseract-lang
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
gh auth login                            # GitHub.com → HTTPS → logg inn i nettleseren
gh repo clone SebastianKristo/torskenes-verden ~/git/torskenes-verden
cd ~/git/torskenes-verden
npm ci
ollama pull qwen3:8b && ollama pull qwen2.5vl:7b && ollama pull nomic-embed-text   # prompt 55: llama3.2:3b trengs ikke
npm run eval -- --backend ollama --url http://localhost:11434
```

Tesseract er med fordi imaget i produksjon har det (`tesseract-ocr-nor`). Uten Tesseract leser appen vitnemålet med
visjonsmodellen i striper, og da måler du en annen vei enn i produksjon.

Uten produksjonsbase på Macen brukes `--routing standard`. Slik henter du den ekte rutingen fra serveren og bruker den:

```sh
# på serveren (LXC-en med Docker):
docker exec homelab-os node -e 'const D=require("better-sqlite3");const d=new D("/data/homelab.db",{readonly:true});console.log(d.prepare("SELECT value FROM kv WHERE user=? AND key=?").pluck().get("owner","ai_routing"))' > /tmp/routing.json
# på Macen:
scp <server>:/tmp/routing.json ~/git/torskenes-verden/routing.json
npm run eval -- --routing routing.json
```

Fila tar ikke med personlige valg per bruker (glimt, sok, chat og brief kan være overstyrt per bruker). Kjøring i containeren
tar med begge.

## I Docker-containeren (alternativ)

Imaget har `eval/` med (Dockerfile: `COPY eval ./eval`), så det må bygges på nytt én gang:

```sh
cd /opt/homelab-os && git pull && docker compose up -d --build os
docker exec homelab-os npm run eval -- --url http://<mac-mini-ip>:11434 --out /data/eval-results
```

Containeren må nå Ollama på Macen. Ollama lytter bare på localhost som standard, så kjør
`launchctl setenv OLLAMA_HOST 0.0.0.0` og start Ollama på nytt. I containeren leses rutingen fra `/data/homelab.db` (`--routing prod-db`), skrivebeskyttet. Testdataene havner i `/tmp` og
slettes, og produksjonsdataene røres ikke. Med `--out /data/eval-results` havner resultatene i `./data/eval-results` på verten.
