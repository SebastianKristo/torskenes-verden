# LFM-visjonsmodeller for kvitteringer (prompt 72)

LFM3-VL-2B og LFM2.5-VL-3B (Liquid AI) kan velges som motorer i kvitteringskjeden. De er **av som standard**. Standarden er
fortsatt Apple Vision OCR (Mac-OCR) + qwen3:8b, og qwen2.5vl i steg V. Bytt bare der evalen viser at LFM faktisk er bedre.

| Motor | Modell | Hva den gjør |
|---|---|---|
| `lfm3vl` | LFM3-VL-2B | Leser bildet rett til kvitteringsformatet (samme schema og validering som steg V). Tenker ikke: `think:false` til Ollama, `enable_thinking:false` til oMLX. Innstillinger: temperature 0.1, top_k 50, repetition_penalty 1.1. |
| `lfm25layout` | LFM2.5-VL-3B | Dokumentlayout (`image_index=<n> <label> [xmin, ymin, xmax, ymax]` + innhold, tabeller som OTSL) → rader i lesefølge → qwen3:8b. Innstillinger: temperature 0.1, repetition_penalty 1.05. |

Motorene kan brukes tre steder (Innstillinger → AI → Kvitteringer → «LFM-motorer (test)», bare admin):

- **Steg V** (ingen OCR svarer): «Visjonsmotor» = qwen2.5vl (standard), LFM3-VL-2B eller LFM2.5-VL-3B layout.
- **Ekstra totalkontroll** i `crossCheck51`: en LFM-modell leser totalen på nytt. Avvik sender kvitteringen til gjennomgang. Kontrollen
  kan bare gjøre kvitteringen mer usikker, aldri sikrere.
- **Steg L** (layout + Mac-OCR): layouten fra LFM2.5-VL ordner Apple Vision-linjene i kolonner og rader før qwen3:8b. Består ikke L,
  kjøres C som før. Hoppes over når Mac-OCR har beskåret bildet, fordi koordinatene da ikke passer.

Alle kall går gjennom `ai-run` og `ai-gate` (kø, tidsgrenser, jobbloggen) til **Ollama på Mac mini-en** (10.69.1.173:11434, eksponeres
aldri) eller **oMLX** (`server/omlx58`, bak vakten på :8040). Bildene forlater aldri huset. Et modellnavn som peker ut, for eksempel en
sky-modell eller en Ollama-modell med `:cloud`, avvises i innstillingene og stoppes av `cloud-guard52` hvis det likevel kommer fram.

## 1. Hent modellene

Navnene under er standardene i `server/receipts48/lfm72.js`. **Sjekk at navnet stemmer på Hugging Face** (<https://huggingface.co/LiquidAI>)
før du henter. `./install.sh --check` gjør det for deg.

### Ollama (standard)

```sh
cd tools/lfm72
./install.sh --check          # finnes navnene på Hugging Face?
./install.sh                  # ollama pull hf.co/LiquidAI/LFM3-VL-2B-GGUF og hf.co/LiquidAI/LFM2.5-VL-3B-GGUF
ollama show hf.co/LiquidAI/LFM3-VL-2B-GGUF   # «vision» skal stå under Capabilities
```

Sjekkliste:

- [ ] `hf.co/LiquidAI/LFM3-VL-2B-GGUF` finnes. Sjekk at navnet stemmer på Hugging Face, også kvantiseringen, f.eks. `:Q4_K_M`.
- [ ] `hf.co/LiquidAI/LFM2.5-VL-3B-GGUF` finnes. Sjekk at navnet stemmer på Hugging Face.
- [ ] Repoet har en `mmproj`-fil, så Ollama får bildestøtte. `ollama show` skal vise `vision`. Mangler den, kan Ollama-versjonen være
      for gammel for LFM-VL-arkitekturen. Bruk oMLX eller llama.cpp i stedet.
- [ ] Tenking er av. Kjør én kvittering med `node eval/receipts72.mjs --combos V-lfm3 --dir …`. Ser du «tenkte likevel» i loggen, støtter
      ikke Ollama-malen `think:false`. Svaret virker likevel, fordi `<think>` alltid fjernes før JSON leses, men det tar lengre tid.
      Prøv en nyere Ollama, eller oMLX, som sender `enable_thinking:false` til malen.
- [ ] Har modellen et annet navn (f.eks. i Ollama-biblioteket)? Skriv det inn under AI → Kvitteringer → LFM3-VL-2B / LFM2.5-VL-3B, eller
      bruk `--lfm3` / `--lfm25` i evalen.

### oMLX / MLX

```sh
tools/omlx/install.sh            # først, hvis oMLX ikke er satt opp (prompt 58)
cd tools/lfm72
./install.sh --omlx --check
./install.sh --omlx              # snapshot_download til ~/.omlx/models/mlx-community/…  (--model-dir for den eksterne disken)
launchctl kickstart -k gui/$(id -u)/com.local.omlx58
```

- [ ] `mlx-community/LFM3-VL-2B-4bit` og `mlx-community/LFM2.5-VL-3B-4bit` finnes. Sjekk at navnet stemmer på Hugging Face. LiquidAI
      legger noen ganger ut egne MLX-versjoner (`LiquidAI/…-MLX-…`), og da brukes de i stedet.
- [ ] oMLX/mlx-vlm støtter LFM-VL-arkitekturen i versjonen du har. Hvis ikke, kan du oppgradere med `tools/omlx/install.sh --upgrade`.
- [ ] Modellene står i `/v1/models` (AI → Tjenester → oMLX).

16 GB: Ollama og oMLX bør ikke holde en modell samtidig. Se `tools/omlx/install.sh` for hvordan du bytter.

## 2. Kjør evalen på Mac-en

Kvitteringene og fasiten ligger **lokalt på Mac-en, aldri i repoet**: en mappe med bilder og `<navn>.json` ved siden av hvert bilde.

```json
{ "butikk": "REMA 1000", "avdeling": "REMA 1000 Grünerløkka", "dato": "2026-10-22", "total": 333.58,
  "linjer": [ { "navn": "TINE Lettmelk 1L", "belop": 22.90 }, { "navn": "Bærepose", "belop": 2.00 } ] }
```

`merchant`/`date`/`total`/`items:[{description, amount}]` går også, og `aliaser` er andre navn på butikken.

```sh
cd ~/torskenes-verden
npm run eval:receipts72 -- --dry                                  # riggsjekk uten modeller (falsk Ollama og Mac-OCR)
npm run eval:receipts72                                           # de syntetiske eksemplene i eval/fixtures/receipts72
npm run eval:receipts72 -- --dir ~/Kvitteringer/eval --runs 3     # dine egne (Ollama på localhost, Mac-OCR-nøkkelen leses fra
                                                                  # ~/Library/Application Support/vision-ocr/config.json)
npm run eval:receipts72 -- --dir ~/Kvitteringer/eval --combos V-qwen,V-lfm3,V-lfm25
# Nøkkelen via miljøvariabel (ikke --omlx-key), så den ikke havner i skallhistorikken eller prosesslista:
OMLX_API_KEY="$(jq -r .key ~/Library/Application\ Support/omlx58/config.json)" \
  npm run eval:receipts72 -- --dir ~/Kvitteringer/eval --lfm-backend omlx --omlx http://127.0.0.1:18040
```

Kombinasjonene er:

- `C`: dagens kjede.
- `V-qwen`, `V-lfm3` og `V-lfm25`: steg V med hver motor.
- `CL`: C med steg L.
- `X-lfm3`: crossCheck med LFM3-VL-2B. Den skal godta riktig total og flagge en feil total, fasit + 10 kr.

Per kvittering måles total, dato, butikk (normalisert, etter `resolveMerchant51`) og varelinjer (presisjon og dekning: navnet omtrent likt og
beløpet eksakt). Evalen måler også om valideringen besto, tid (p50/p90) og lastetid for modellen. Lastetiden kommer fra Ollamas
`load_duration` og står for seg, med én oppvarming per kombinasjon.

Miljøfeil telles ikke som modellfeil. Det gjelder modell som ikke er hentet, Mac-OCR uten nøkkel og motor som ikke kan nås. Evalen varsler
også hvis `/api/ps` viser andre modeller i Ollama-minnet.

Rapporten havner i `eval/results/<dato>-receipts72-<motor>.md` og `.json`, og `eval/results/` er i .gitignore. Den har én tabell per motor.
**Rapporten har ikke kvitteringsinnhold**: kvitteringene vises som hash av filnavnet, og bare tall og ja/nei er med. Den kan deles.

## 3. Bytte motor

Slå på motoren under AI → Kvitteringer → «LFM-motorer (test)» bare der evalen viser at den er bedre enn dagens kjede, både på riktighet
og tid. Du kan for eksempel bruke LFM3 i V, som bare brukes når ingen OCR svarer, men beholde C som standard.

## Hva må sjekkes

- **Modellnavn:** se sjekklistene over. Standardene er gjetninger ut fra Liquid AIs navngivning, og ingenting er hentet herfra.
- **Lisens:** «LFM Open License». Les den på modellsiden før bruk. Sjekk:
  - om den tillater bruk i et privat hjemmeoppsett,
  - om den har en inntekts- eller omsetningsgrense for kommersiell bruk,
  - hvilke krav den stiller til navngiving og videreformidling,
  - og om det finnes begrensninger for bruksområder.
- **Lisens, filer:** ikke legg modellfiler i repoet. `install.sh` laster bare ned til Ollama eller modellmappen til oMLX.
- **Norsk:** LFM-modellene er små og hovedsakelig trent på engelsk og noen store språk. Sjekk følgende i evalen på egne kvitteringer:
  - Æ, ø og å i varenavn.
  - Komma som desimalskille. Schemaet krever punktum, men modellen må lese «29,90» riktig.
  - Datoformatet DD.MM.ÅÅÅÅ.
  - Norske totalord (TOTALT, Å BETALE, SUM).
- **Layoutprompten:** `LAYOUT_PROMPT72` i `lfm72.js` er skrevet ut fra dokumentasjonen. Sjekk ordlyden mot modellkortet til LFM2.5-VL-3B.
  Layoutmodusen kan være trent på en bestemt formulering.
