# Kvitterings-eval (`make eval-receipts`)

Måler kvitteringskjeden fra prompt 48 på ekte og syntetiske norske kvitteringer. Hver kvittering kjøres gjennom **hver vei
for seg** via serverens egen kjede (`server/receipts48/chain.js` → `runChain48`, samme validering, samme modellkall via
AI-gaten, samme Mac-OCR- og Tesseract-klient som i produksjon). Bare det ene steget er slått på i innstillingene per vei.

| Vei | Hva | Kilde |
|---|---|---|
| A | `device_parse` (tolket på iPhone) | `<navn>.device_parse.json` (finnes bare for dagligvare-kvitteringen) |
| B | device-OCR + lokal modell | lagret OCR fra telefonen: `<navn>.device_ocr.json` |
| C | Mac-OCR (Apple Vision) + lokal modell | ekte tjeneste: `MAC_OCR_URL` / `MAC_OCR_KEY` |
| T | Tesseract (tsv) + lokal modell | `tesseract` på maskinen evalen kjører på |
| D | Gemini | bare når `GEMINI_API_KEY` er satt **og** `--sperre av` |
| kjede | hele kjeden med alt på (bilde + device-OCR) | som appen med begge bryterne på |

Rapporten viser per vei og per felt: **butikk, dato, total, antall varelinjer**, om svaret besto kontrollen i koden, og
**tid** (median og maks). Etterpå kjøres **reserveløsningene** eksplisitt (på den første kvitteringen):

1. Mac-OCR av (tjenesten svarer ikke) → C `unavailable`, Tesseract prøves.
2. Ugyldig `device_parse` (feil total, dato i fremtiden) → A `failed`, kjeden går videre.
3. Gemini av fordi «Finansdata forlater aldri huset» er på → D hoppes over og **ingen** kall går ut, selv med nøkkel.
4. Gemini uten nøkkel (sperren av) → D hoppes over.
5. Lokal modell nede → modellstegene hoppes over videre (ingen ny ventetid per steg).

Nettet er bevoktet: bare Ollama, Mac-OCR og (når tillatt) Gemini slipper gjennom. Alt annet blokkeres og står i rapporten.
Hver kvittering kjøres i en egen prosess med fersk `DATA_DIR`. Produksjonsbasen leses ikke.

Klokka settes til fasitens `today` (de syntetiske: lørdag 24. oktober 2026, som Glimt-evalen), så datokontrollen (ikke i
fremtiden, ikke eldre enn 2 år) gir samme svar hver gang. Egne kvitteringer uten `today` bruker dagens dato.

Utfall: exit 0 = riggen virket og reservetestene besto (veiene er en måling, ikke en port). 1 = riggfeil, en reservetest
feilet eller et kall ut av huset ble blokkert. 3 = fikk ikke kontakt med Ollama.
Resultat: `tests/receipts/results/<dato>-<modell>.json` og `.md` (i `.gitignore`).

## Filer

```
tests/receipts/
  run.mjs              kjører alt og skriver rapporten (make eval-receipts / npm run eval:receipts)
  worker.mjs           én kvittering, alle veier + reservetestene
  lib/net.mjs          bevoktet nett
  lib/mock.mjs         mock-modus: regelbasert «modell», falsk Mac-OCR, Tesseract og Gemini
  lib/compare.mjs      sammenligning med fasit per felt
  gen-fixtures.py      lager de syntetiske kvitteringene (make receipts-fixtures, krever Pillow)
  fixtures/            syntetiske: dagligvare med pant og rabatt, restaurant med tips, bensinstasjon, lang kvittering
                       (<navn>.jpg, <navn>.json = fasit, <navn>.device_ocr.json = lagret device-OCR)
  real/                dine egne ekte kvitteringer (i .gitignore, se real/README.md)
```

## Kjøre

```sh
make eval-receipts-mock                                   # CI: falsk modell/Mac/Tesseract/Gemini, ingen nett (~2 s)
make eval-receipts                                        # ekte: Ollama på localhost:11434, qwen3:8b
make eval-receipts OLLAMA=http://10.69.1.173:11434 MODEL=qwen3:8b
make eval-receipts ARGS="--only ekte"                     # bare dine egne kvitteringer
make eval-receipts ARGS="--case lang --runs 3 --routes C,T"
npm run eval:receipts -- --help                           # alle valg
```

Mock-modus måler ikke kvalitet. Den viser at riggen, kjeden, valideringen og reserveløsningene virker.

---

## Kjøre på Mac mini-en (10.69.1.173)

Forutsetninger på Mac mini-en: repoet i `~/torskenes-verden`, Node 22+, Ollama med `qwen3:8b`, og Xcode Command Line Tools.

### Hvorfor IP-lista må endres et øyeblikk

Mac-OCR-tjenesten slipper bare inn **10.69.1.39** (Glimt-serveren) i tillegg til nøkkelen. Når evalen kjører *på* Mac
mini-en og kaller `http://10.69.1.173:8765`, er avsenderen Mac-en selv (**10.69.1.173**), og tjenesten svarer 403.
Det ryddigste er å legge Mac-ens egen adresse til **mens evalen kjører**, og så sette lista tilbake:

- `install.sh` beholder nøkkel, adresse og port, og bytter bare tillatelseslista når du gir `--allow` (den skriver ny
  `config.json` og starter tjenesten på nytt). Bygget er inkrementelt, så det tar sekunder.
- Det åpner ikke for noen andre maskiner i nettet: tjenesten lytter fortsatt bare på LAN-adressen, krever fortsatt
  nøkkelen, og det er bare Mac-en selv som har avsenderadressen 10.69.1.173.
- Evalen leser nøkkelen selv fra `~/Library/Application Support/vision-ocr/config.json` (600), så den trenger ikke stå i
  skallhistorikken.

Alternativet er å kjøre evalen fra Glimt-serveren (10.69.1.39) med en checkout av repoet der, `MAC_OCR_KEY` satt og
`OLLAMA=` pekende på Ollama. `tests/` er ikke med i Docker-imaget, så det må være en vanlig checkout på verten, og dine
egne kvitteringer må kopieres dit.

### 1) Bygg og installer Mac-OCR-tjenesten

På Mac mini-en (Terminal, som brukeren som er logget inn på skrivebordet, ikke sudo):

```sh
xcode-select -p >/dev/null 2>&1 || xcode-select --install     # bare hvis Command Line Tools mangler
cd ~/torskenes-verden && git pull
cd tools/vision-ocr
./install.sh --test                       # swift test + swift build -c release, installerer, lytter på 10.69.1.173:8765, tillater 10.69.1.39
```

Skriptet skriver ut adressen og nøkkelen. «Test fra Mac: HTTP 403» er riktig: Mac-en selv er ikke på lista.
Er macOS-brannmuren på, skriver skriptet ut to `sudo …socketfilterfw`-kommandoer. Kjør dem.

Test fra Glimt-serveren (10.69.1.39). Lim inn nøkkelen fra utskriften i stedet for `<NØKKEL>`:

```sh
ssh <bruker>@10.69.1.39
read -rs KEY                                                                  # lim inn <NØKKEL>, Enter (vises ikke)
curl -sS -H "Authorization: Bearer $KEY" http://10.69.1.173:8765/health      # {"ok":true,...,"languages":[...]}
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8765/health     # 401 (uten nøkkel)
curl -sS -H "Authorization: Bearer $KEY" -F "image=@kvittering.jpg" http://10.69.1.173:8765/ocr | head -c 600
# Fra Glimt-containeren (har node, ikke nødvendigvis curl):
docker exec -e KEY="$KEY" <glimt-container> node -e "fetch('http://10.69.1.173:8765/health',{headers:{authorization:'Bearer '+process.env.KEY}}).then(r=>r.text()).then(console.log)"
```

Legg så adressen og nøkkelen inn i Homelab › Innstillinger › AI › Mac-OCR (`http://10.69.1.173:8765` og nøkkelen), og
trykk «Test».

### 2) Legg inn egne ekte kvitteringer

```sh
cd ~/torskenes-verden
cp ~/Downloads/IMG_1234.HEIC tests/receipts/real/rema-2026-10-20.heic
cat > tests/receipts/real/rema-2026-10-20.json <<'EOF'
{ "merchant": "REMA 1000", "date": "2026-10-20", "total": 412.30, "items_count": 14 }
EOF
git check-ignore -v tests/receipts/real/rema-2026-10-20.heic     # skal vise at fila er ignorert
```

Én `.json` per bilde, samme navn. Se `real/README.md` for feltene (`merchant_aliases`, `today`, valgfri `device_ocr`).

### 3) Kjør evalen mot ekte Mac-OCR og ekte Ollama

```sh
cd ~/torskenes-verden
npm ci                                              # første gang (better-sqlite3 bygges for macOS)
ollama pull qwen3:8b                                # hvis den mangler
brew install tesseract tesseract-lang imagemagick   # valgfritt: uten Tesseract viser vei T «unavailable»

make eval-receipts-mock                             # rigg-sjekk uten nett

./tools/vision-ocr/install.sh --allow 10.69.1.39,10.69.1.173    # midlertidig: Mac-en selv får bruke tjenesten
make eval-receipts                                               # alle kvitteringer, alle veier, reservetestene
./tools/vision-ocr/install.sh --allow 10.69.1.39                 # tilbake til bare Glimt-serveren

plutil -extract allow json -o - "$HOME/Library/Application Support/vision-ocr/config.json"   # skal vise ["10.69.1.39"]
```

Kjører Ollama et annet sted: `make eval-receipts OLLAMA=http://<vert>:11434`. Linjen «Mac-OCR … ok (versjon …)» øverst
i utskriften bekrefter at evalen når tjenesten. Står det 403 der, er Mac-ens adresse ikke på lista ennå.

Gemini (vei D) er av med mindre du ber om det. Bildene sendes da til Google, så bruk bare de syntetiske:

```sh
read -rs GEMINI_API_KEY && export GEMINI_API_KEY
make eval-receipts ARGS="--sperre av --only syntetiske --routes D"
```
