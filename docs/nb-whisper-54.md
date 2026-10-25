# Tale til tekst på norsk og engelsk – NB-Whisper (prompt 54)

Homelab gjør tale om til tekst lokalt i huset. Norsk (bokmål og nynorsk) går til **NB-Whisper** fra Nasjonalbiblioteket
(`NbAiLab/nb-whisper-*`, Apache-2.0) på Mac mini-en. Engelsk går til **Voz** på serveren, så **Phonon** på Mac mini-en, og
NB-Whisper er siste reserve. Lyden forlater aldri huset og lagres ikke.

## Hva det gjør

- **Glimt-chatten** og **Glimt-søket** (søkefeltet på dashboardet) har en mikrofonknapp. Hold inne for å snakke og slipp for å sende,
  eller trykk én gang for å starte og én gang til for å stoppe (Esc avbryter, maks 60 s). Teksten havner i feltet, og en liten
  merkelapp viser motoren og språket, f.eks. «NB-Whisper (Mac mini) · norsk (bokmål)».
- Første gang forklarer Homelab hva mikrofonen brukes til før nettleseren spør om lov.
- Mikrofonen virker bare over **https** (eller localhost). Over http på hjemmenettet sier knappen det i stedet for å feile.
- **Språket oppdages automatisk** (NB-Whisper ser på de første 30 sekundene). Språket i profilen er bare et hint som brukes når
  deteksjonen er usikker. Bokmål er standard; velg `nn` for nynorsk.
- **AI-kontroll › Modeller › Tale til tekst** viser status for motorene. Admin legger inn adressen og nøkkelen til NB-Whisper der, og kan teste.

Rutingen i `POST /api/voice53/transcribe`:

| Språk | Motorer i rekkefølge |
|---|---|
| `no` / `nb` / `nn` | NB-Whisper (bokmål = `no`, nynorsk = `nn`) |
| `en` | Voz (server) → Phonon (Mac mini) → NB-Whisper (`language=en`) |
| annet valgt språk (`sv`, `da` …) | Phonon / Voz → NB-Whisper |
| `auto` / mangler | Deteksjon med NB-Whisper. Norsk og engelsk som over. Andre Whisper-språk → NB-Whisper først. Ukjent språk → tydelig feil (422). |

Clear (støyfjerning fra Desert Ant Labs) kjøres før alle motorene når den er klar. Feiler en motor, prøves neste uten at du merker
det. Svar på norsk med ordet «norsk» og 422 kommer bare når ingen norsk motor er satt opp. Er NB-Whisper satt opp, men nede, er svaret 503.
Flagget `whisper_nb54` (Flagg-siden) er PÅ som standard. Slår du det av, brukes ikke NB-Whisper.

## Installere på Mac mini-en

```bash
cd ~/git/torskenes-verden && git pull
cd tools/nb-whisper
./install.sh
```

Skriptet gjør alt i én omgang:
1. Lager venv i `~/Library/Application Support/nb-whisper/venv` og installerer `mlx==0.32.4` og `mlx-whisper==0.4.3` (Metal). Torch installeres ikke.
2. Velger modell: **medium** på 16 GB (qwen3:8b skal kunne ligge lastet i Ollama samtidig), **large** fra 24 GB. Overstyr med `--model`.
3. Henter modellen fra Hugging Face **nå**: ferdige MLX-vekter hvis de finnes. Ellers konverteres `NbAiLab/nb-whisper-<størrelse>`
   til MLX på Mac-en (`prepare.py`). Går ingen av delene, brukes whisper.cpp med Metal (`ggml-model.bin`, `brew install whisper-cpp`).
4. Lager nøkkel og `config.json` (600), og starter LaunchAgenten `com.local.nb-whisper` på `http://10.69.1.173:8020`.
   Den slipper bare inn Glimt-serveren (`10.69.1.39`) med nøkkelen og kjører uten nett (`HF_HUB_OFFLINE=1`). Den eksponeres aldri via Cloudflare.
5. Skriver ut adressen, nøkkelen og curl-tester.

Vanlige valg:

```bash
./install.sh --model large                      # bedre, ~3 GB i minnet (anbefalt bare med 24 GB+)
./install.sh --model medium                     # standard på 16 GB, ~1,5 GB i minnet
./install.sh --engine cpp                       # whisper.cpp i stedet for MLX
./install.sh --cache-dir /Volumes/AI/nb-whisper # modellen på den eksterne disken
./install.sh --ip 10.69.1.173 --allow 10.69.1.39
./install.sh --rotate-key                       # ny nøkkel (oppdater Homelab etterpå)
./install.sh --refresh-model                    # hent og klargjør modellen på nytt
./uninstall.sh            # fjern agenten (behold venv, nøkkel og modell)
./uninstall.sh --purge    # fjern alt
tail -f ~/Library/Logs/nb-whisper.log
```

Valg av modell: large er mest nøyaktig, men på en Mac mini med 16 GB som også har qwen3:8b (~6 GB) lastet, gir medium best totalopplevelse.
`small` finnes for svært trangt minne. Bytt når som helst med `./install.sh --model <størrelse>`. Nøkkelen og adressen beholdes.

## Koble til Homelab (admin)

AI-kontroll › Modeller › **Tale til tekst** → lim inn adressen (`http://10.69.1.173:8020`) og nøkkelen → **Lagre** → **Test**.
Eller i miljøet på serveren (`.env`): `NBWHISPER_URL=http://10.69.1.173:8020` og `NBWHISPER_KEY=…`. Det som lagres i AI-kontroll, vinner.
Bare adresser i huset godtas. Nøkkelen lagres kryptert og vises aldri igjen.

```bash
# Fra Glimt-serveren:
K=<nøkkelen>
curl -sS -H "Authorization: Bearer $K" http://10.69.1.173:8020/health
curl -sS -H "Authorization: Bearer $K" -F file=@opptak.wav -F language=nb -F response_format=verbose_json \
  -F 'timestamp_granularities[]=word' http://10.69.1.173:8020/v1/audio/transcriptions
curl -sS -H "Authorization: Bearer $K" -F file=@opptak.wav http://10.69.1.173:8020/v1/audio/detect
```

## API (for appene)

```
POST /api/voice53/transcribe   multipart: file (+ language?: 'auto'|'no'|'nb'|'nn'|'en'|…, hint?: 'nb'|'en', backend?, enhance?)
  → { text, words:[{text,start,end}], language:'no'|'en'|…, variant?:'nb'|'nn', language_label, detected?:{language, probability, source, engine},
      engine:'nbwhisper'|'voz'|'phonon', engine_label, backend, fallback?, enhanced, duration, ms }
GET  /api/voice53/backends     → { backends:[{id, label, engine_label, languages, available, configured}], norwegian, detect, norwegian_engine }
GET  /api/admin/whisper54/health · GET/PUT /api/admin/whisper54/config {url?, key?} · POST /api/admin/whisper54/test   (bare admin)
```

## Lisens

NB-Whisper © Nasjonalbiblioteket (NbAiLab), Apache-2.0 – står i «Om / Lisenser» og `docs/lisenser-tredjepart.md`.
