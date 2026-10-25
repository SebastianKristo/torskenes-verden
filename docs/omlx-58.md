# oMLX bak AI-gaten (prompt 58)

[oMLX](https://github.com/jundot/omlx) (Apache-2.0) er en MLX-server for Apple silicon med OpenAI-kompatibelt API. Den har tiered
KV-cache (RAM + SSD) med prefiks-deling, continuous batching, LRU-utkasting og minnevakt. I Homelab er den en **tredje backend i
AI-gaten** (`server/ai-gate.js`), ved siden av Ollama og Open WebUI. Den er ikke en egen klient. Køen, tidsgrensene, nye forsøk,
telemetrien og jobbloggen er de samme.

**Ollama er fortsatt standard.** Ingenting bytter motor før du velger oMLX for en oppgave i AI-kontroll. Gjør det først når eval har
vist at oMLX er like god og raskere.

## 1. Installere på Mac mini-en

Krav: macOS 15+, Apple silicon og Homebrew. Xcode trengs ikke. Uten egne Metal-kjerner går Qwen3-8B og Qwen2.5-VL med vanlig fart;
det er bare GLM/MiniMax/Qwen3.5 som trenger kjernene.

```bash
cd ~/git/torskenes-verden && git pull
tools/omlx/install.sh                       # eller: --model-dir /Volumes/AI/omlx · --memory-gb 10 · --no-vision
```

Skriptet gjør dette:

1. `brew tap jundot/omlx https://github.com/jundot/omlx` og `brew install jundot/omlx/omlx`. Feiler Homebrew (kjent feil 25.10.2026: spaCy «OverflowError: Python int too large to convert to C ssize_t» i etterkontrollen), bruker skriptet Mac-appen: last ned `oMLX-*.dmg` fra https://github.com/jundot/omlx/releases, dra den til Programmer, åpne den én gang (den lager `~/.omlx/bin/omlx`), slå av at appen starter serveren selv, og kjør `./install.sh` på nytt (eller `./install.sh --omlx-bin ~/.omlx/bin/omlx`). Nedlastingene og vakten bruker da et eget Python-venv i `~/Library/Application Support/omlx58/venv`.
2. Det stopper Homebrew-tjenesten `omlx`. Den lytter på port 8000, og den porten bruker Neutrino (Fermion).
3. Det laster ned `mlx-community/Qwen3-8B-4bit` (~4,6 GB) og `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` (~5,6 GB) til
   `~/.omlx/models/mlx-community/…`.
4. Det lager nøkkel og `~/Library/Application Support/omlx58/config.json` (600), og LaunchAgenten `com.local.omlx58`.
5. Agenten kjører vakten `guard.py`, som starter `omlx serve --host 127.0.0.1 --port 18040 --memory-guard-gb N
   --max-concurrent-requests 2 --paged-ssd-cache-dir ~/.omlx/cache --paged-ssd-cache-max-size 20GB`. Nøkkelen går i `OMLX_API_KEY`.
6. Vakten lytter på `10.69.1.173:8040` og slipper bare inn `10.69.1.39` med `Authorization: Bearer <nøkkel>`, sammenlignet i konstant
   tid. Rutene er `/health`, `/v1/models`, `/v1/chat/completions` og `/v1/embeddings`. Aldri via Cloudflare.

Logger: `~/Library/Logs/omlx58.log` (vakten: avsender, sti, status og tid, aldri nøkler eller innhold) og `~/.omlx/logs/server.log`
(oMLX). Admin-panelet til oMLX ligger på `http://127.0.0.1:18040/admin` og kan bare åpnes på Mac-en. Fjerne: `tools/omlx/uninstall.sh
[--purge] [--brew]`.

**Embeddings blir på Ollama** (`nomic-embed-text`). Vi har ikke sjekket noen MLX-variant av nomic-embed-text. Vektorer fra ulike
motorer kan uansett ikke blandes i én indeks, så et bytte ville krevd at Kunnskapsbasen og minnet ble bygd på nytt.

## 2. Minne (16 GB) og hvordan du bytter motor

- Minnevakten er satt til RAM − 7 GB, altså 9 GB på 16 GB. Det gir plass til Qwen3-8B 4-bit (~4,6 GB) med KV-cache. oMLX laster ut
  den modellen som er brukt minst nylig (LRU) når taket nås. Derfor ligger bare én av tekst- og bildemodellen inne om gangen.
- **Ollama og oMLX bør ikke holde en stor modell samtidig.** qwen3:8b i Ollama (~5,2 GB) og Qwen3-8B i oMLX (~4,6 GB), pluss KV og
  macOS, gir swap og trege svar. Slik bytter du:

```bash
ollama stop qwen3:8b                                        # Ollama laster ut modellen med en gang
launchctl kickstart -k gui/$(id -u)/com.local.omlx58        # oMLX starter på nytt med tomt minne
launchctl bootout gui/$(id -u)/com.local.omlx58             # stopp oMLX helt (tools/omlx/install.sh starter den igjen)
```

- Varig oppsett når oMLX er valgt for Glimt: sett `keep_alive 0` for qwen3:8b i AI-kontroll › Valg (per modell). Da laster Ollama den
  ut så snart køen er tom. Ollama har da bare Chat, embeddings og reserven.

## 3. Homelab-oppsett (admin)

1. **AI-kontroll › Modeller › «oMLX på Mac mini-en»**: legg inn adresse `http://10.69.1.173:8040` og nøkkelen. Lagre, og trykk Test.
   Test sender «Svar bare med ordet: ok» gjennom gaten. Kortet viser modellene oMLX har. Lastede modeller vises bare hvis oMLX oppgir
   det i `/v1/models`; ellers står det at det er ukjent. Tekst- og bildemodell (MLX-ID) kan endres her.
2. **AI-kontroll › Valg › «Motor per oppgave»**: Ollama · oMLX for Glimt (kalender og planlegger), AI-søk, brief, Finans · spør,
   Domener og Dokumenter (bilde, rc). Disse går gjennom `ai-run.run()`. Embeddings og Chat går alltid til Ollama, og Chat har sin egen
   modellvelger. Kategorisering og strekkoder går også til Ollama, fordi de kaller gaten direkte via `finans/ai.js`.
3. **«Bruk Ollama hvis oMLX ikke svarer»** er på som standard. Ved ingen kontakt, 5xx, tidsavbrudd under innlasting eller minnefeil går
   samme spørsmål til Ollama med Ollama-ruten for oppgaven. Svaret og jobben merkes «via Ollama: oMLX svarte ikke (…)». En 4xx-feil
   (feil nøkkel, ukjent modell) gir ingen reserve; den vises som feil, så du ser at oppsettet må rettes.
   - Samme innstilling gjelder **Open WebUI**: er Open WebUI nede (ingen kontakt eller 502/503/504) og Ollama-adressen satt, prøver
     gaten én gang direkte mot Ollama med samme modell, merket «via Ollama direkte (Open WebUI svarte ikke)». Det skjer ikke for
     embeddings eller innlasting, som allerede går til Ollama. Den reserven er bare av når Open WebUI er valgt eksplisitt
     (`ai_backend = openwebui`) **og** innstillingen er slått av.

API (bare admin): `GET/PUT /api/admin/omlx58/config`, `GET /api/admin/omlx58/health[?fresh=1]` og `POST /api/admin/omlx58/test`.
Nøkkelen lagres kryptert (`seal`), sendes aldri til nettleseren og maskeres i feilmeldinger. Bare adresser i huset godtas: privat
IPv4, localhost, `.local`/`.lan`/`.home.arpa`/`.internal` og enkle vertsnavn. Miljøvariabler er reserve: `OMLX_URL`, `OMLX_API_KEY`,
`OMLX_MODEL_TEXT`, `OMLX_MODEL_VISION`, `OMLX_FALLBACK=0` og `OMLX_TASKS=glimt,sok` (eller `all`).

## 4. Slik oversetter gaten til oMLX (`server/omlx58/backend.js`)

| Ollama | oMLX (`POST /v1/chat/completions`, SSE) |
|---|---|
| `options.num_predict` | `max_tokens` |
| `temperature`, `top_p`, `seed`, `stop` | direkte |
| `num_ctx` | sendes ikke. Konteksten styres i oMLX. Loggen varsler hvis prompten ser ut til å være lengre enn `max_context` fra `/v1/models` |
| `keep_alive` | sendes ikke. oMLX har LRU, TTL og pinning selv |
| `format` (JSON-skjema) | `response_format: {type:'json_schema', json_schema:{name:'plan', schema, strict:true}}` |
| `format: 'json'` | `response_format: {type:'json_object'}` |
| `think:false` | `chat_template_kwargs: {enable_thinking:false}` + `/no_think` i siste brukermelding (Qwen3). `<think>` fjernes |
| `tools` | OpenAI-`tools`, navn uten punktum: `calendar.create` → `calendar_create`. `tool_calls` fra deltaene samles og mappes tilbake |
| `images` | `content: [{type:'text'}, {type:'image_url', image_url:{url:'data:image/…;base64,…'}}]` |
| `/api/embed` | `POST /v1/embeddings` (brukes ikke som standard) |

oMLX har egen kø-instans i gaten (adressen sin). Den blokkerer derfor ikke Ollama-køen, og Ollama-køen blokkerer ikke den. Modell-ID:
oMLX oppgir mappenavnet. Ligger modellen i `mlx-community/…`, godtas ID-en både med og uten `mlx-community/` (sjekket mot `/v1/models`).

Prefiks-cache: systemprompten og verktøylista står først og er stabile. Dato og fakta kommer sist (planleggeren i `glimt45/` gjør
allerede dette). Da kan oMLX gjenbruke KV-blokkene mellom kall.

## 5. Sammenligne med eval

Eval kjører de samme casene, sjekkene og den samme frosne klokka mot begge motorene. Rapporten har motoren i tittelen og p50/p90 per
case og totalt for begge motorer.

```bash
# Ollama (som før). Stopp oMLX først, så Ollama har minnet alene:
launchctl bootout gui/$(id -u)/com.local.omlx58
npm run eval -- --backend ollama --routing standard

# oMLX. Ta Ollama-modellen ut av minnet og start oMLX:
ollama stop qwen3:8b
tools/omlx/install.sh --skip-models          # starter agenten igjen (beholder nøkkelen)
KEY=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/Library/Application Support/omlx58/config.json")))["key"])')
npm run eval -- --backend omlx --url http://127.0.0.1:18040 --key "$KEY" --ollama-url http://127.0.0.1:11434
```

- Med `--backend omlx` går oppgavene glimt, sok, brief, dom, fsok og rc til oMLX. Tekst er `mlx-community/Qwen3-8B-4bit`
  og bilde `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`. `--model` og `--vision-model` overstyrer MLX-ID-ene.
- Ollama-reserven er **av** i eval, så tallene er rene oMLX. `--omlx-fallback` slår den på.
- Disse delene bruker fortsatt Ollama: Chat (case 17–19), kvitteringenes tekststeg (`receipts48/engines/llm.js`, case 11) og
  embeddings. De går ikke gjennom rutingen i `ai-run.run()`. Uten `--ollama-url` får de status «env: trenger Ollama». Kjør
  `--case 01,02,03,04,05,06,07,08,09,10,12,13,14,15,16` for en ren oMLX-sammenligning.
- `/api/ps`-sjekken gjelder Ollama. Med oMLX ser eval etter lastede modeller i `/v1/models`, når oMLX oppgir det, og på
  `--ollama-url` sin `/api/ps`. Den advarer hvis Ollama holder en modell samtidig.
- Resultatet havner i `eval/results/<dato>-omlx-Qwen3-8B-4bit.{json,md}`. Sammenlign det med `…-ollama-qwen3_8b-*.md`: bestått
  (`x/3` per case), median, p50 og p90 per case, og p50/p90 totalt i oppsummeringen.

Riggen kan prøves uten Mac med en falsk oMLX: `node eval/lib/fake-omlx.mjs 18040 <nøkkel>` og så samme `npm run eval -- --backend
omlx …`. Det viser bare at riggen virker. Kvaliteten måles den ikke på.

## 6. Kjente begrensninger

- Planleggeren (`toolModeFor45`) bruker fortsatt JSON-skjema også for oMLX. Prompt 47 gjorde dette til standard for alle backends, så
  eval-tallene kan sammenlignes. Backenden støtter `tools` fullt ut, med navnemapping tur-retur og testet, så tools-modus kan slås på
  senere uten endringer i oMLX-delen.
- Støtten for `json_schema strict` varierer per modell i oMLX. Validering og nytt forsøk i planleggeren gjelder som for Ollama.
- Tre veier kaller fortsatt gaten med en Ollama-modell direkte og følger ikke motorvalget: kvitteringenes tekststeg, `finans/ai.js`
  (`textJson`/`extract`: kategorisering, strekkoder) og abonnement-skjermbilder. De bruker Ollama til de flyttes til `ai-run.run()`.
- Lisens: se `docs/lisenser-tredjepart.md` (oMLX Apache-2.0, Qwen Apache-2.0).
