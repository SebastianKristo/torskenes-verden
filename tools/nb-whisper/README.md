# nb-whisper – NB-Whisper på Mac mini-en (prompt 54)

Tale til tekst på **norsk (bokmål og nynorsk) og engelsk** med NB-Whisper fra Nasjonalbiblioteket
(`NbAiLab/nb-whisper-*`, Apache-2.0). Kjører lokalt på Mac mini-en med MLX (Apple silicon, Metal), eller whisper.cpp med
Metal hvis MLX-sporet ikke går. Glimt-serveren bruker den for `POST /api/voice53/transcribe` (norsk og språkdeteksjon).

| | |
|---|---|
| Adresse | `http://10.69.1.173:8020` (bare LAN-adressen, aldri 0.0.0.0, aldri Cloudflare) |
| Tillatt fra | `10.69.1.39` (Glimt-serveren) – og bare med `Authorization: Bearer <nøkkel>` (konstant-tid-sammenligning) |
| LaunchAgent | `com.local.nb-whisper` · logg `~/Library/Logs/nb-whisper.log` (aldri nøkler, lyd eller tekst) |
| Modell | auto: **medium** på 16 GB (qwen3:8b skal kunne ligge lastet), **large** fra 24 GB. `--model` overstyrer. |
| Filer | `~/Library/Application Support/nb-whisper/` (venv, `config.json` 600, `nbwhisper.py`, `models/`) |

```bash
cd ~/torskenes-verden/tools/nb-whisper
./install.sh                                    # alt i ett: venv, mlx-whisper, modellen (lastes ned nå), LaunchAgent
./install.sh --model large                      # large (~3 GB i minnet) · medium (~1,5 GB) · small
./install.sh --engine cpp                       # whisper.cpp (brew install whisper-cpp) i stedet for MLX
./install.sh --cache-dir /Volumes/AI/nb-whisper # modellen på den eksterne disken
./install.sh --rotate-key                       # ny nøkkel – legg den inn i Homelab etterpå
./install.sh --refresh-model                    # last ned og klargjør modellen på nytt
./uninstall.sh [--purge]
```

Slik hentes modellen (`prepare.py`): ferdige MLX-vekter hvis de finnes på Hugging Face → ellers konvertering av
`NbAiLab/nb-whisper-<størrelse>` (`model.safetensors`) til MLX på Mac-en → ellers `ggml-model.bin` til whisper.cpp.
Tjenesten kjører etterpå med `HF_HUB_OFFLINE=1` (ingen nett).

## API (OpenAI-kompatibelt)

```
GET  /health                    → {status:'ok'|'starting'|'error', model:'nb-whisper-medium', engine:'mlx'|'cpp', languages:['no','nn','en'], version}
GET  /v1/models
POST /v1/audio/transcriptions   multipart: file, language (no|nb|nn|en|…|auto), response_format (json|text|verbose_json),
                                timestamp_granularities[]=word, prompt, temperature
     verbose_json → {task, language, duration, text, segments:[{id,start,end,text}], words:[{word,start,end}], model, engine}
POST /v1/audio/detect           multipart: file (første 30 s brukes) → {language, probability, languages:[{language,probability}], duration}
```
`nb` → `no` (bokmål), `nn` → nynorsk. Maks 100 MB. WAV leses direkte; andre formater krever `brew install ffmpeg`.
Én transkripsjon om gangen (maks 3 i kø, ellers 503 `busy`).

## Test

Fra Glimt-serveren (10.69.1.39):
```bash
K=<nøkkelen fra install.sh>
curl -sS -H "Authorization: Bearer $K" http://10.69.1.173:8020/health
curl -sS -H "Authorization: Bearer $K" -F file=@opptak.wav -F language=nb -F response_format=verbose_json \
  -F 'timestamp_granularities[]=word' http://10.69.1.173:8020/v1/audio/transcriptions
curl -sS -H "Authorization: Bearer $K" -F file=@opptak.wav http://10.69.1.173:8020/v1/audio/detect
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8020/health      # uten nøkkel: 401
```
Fra Mac-en selv: 403 (Mac-en står ikke på tillatelseslista – riktig).

Enhetstester (Linux eller Mac): `python3 -m unittest -v tools/nb-whisper/test_nbwhisper.py`
(MLX-testen kjører når `mlx` og `mlx_whisper` er installert; den konverterer en liten modell med tilfeldige vekter).

Full veiledning: `docs/nb-whisper-54.md`.
