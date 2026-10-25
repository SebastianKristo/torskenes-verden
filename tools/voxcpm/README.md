# voxcpm – VoxCPM2 på Mac mini-en (prompt 57)

Tekst til tale på **norsk** med VoxCPM2 fra OpenBMB (`openbmb/VoxCPM2`, Apache-2.0 for kode og vekter): ferdige stemmer,
egne stemmer fra en beskrivelse («Voice Design») og **klonede stemmer** fra et kort opptak. Glimt-serveren bruker den som motoren
`voxcpm` i `POST /api/tts` (Glimt og nyhetsleseren) og for `/api/voices57`.

| | |
|---|---|
| Adresse | `http://10.69.1.173:8030` (bare LAN-adressen, aldri 0.0.0.0, aldri Cloudflare) |
| Tillatt fra | `10.69.1.39` (Glimt-serveren) – og bare med `Authorization: Bearer <nøkkel>` (konstant-tid-sammenligning) |
| LaunchAgent | `com.local.voxcpm` · logg `~/Library/Logs/voxcpm.log` (aldri nøkler, tekst, lyd eller hasher) |
| Standardmotor | **gguf**: `voxcpm2-cli` fra llama.cpp-omni med Metal, BaseLM **Q8_0** + Acoustic F16 |
| Filer | `~/Library/Application Support/voxcpm/` (venv, `config.json` 600, `voxcpm_service.py`, `llama.cpp-omni/`, `models/`, `refs/`) |

## Minne og fart (16 GB, qwen3:8b skal kunne ligge lastet)

| Motor | Minne | Fart | Når |
|---|---|---|---|
| `gguf` Q8_0 (standard) | ~3 GB **bare mens en forespørsel lages**, ~0 ellers (CLI-et laster per forespørsel) | RTF ~1,8 på M4 Pro (oppgitt av OpenBMB) + noen sekunder lasting per forespørsel | Anbefalt på 16 GB |
| `gguf` F16 (`--quant f16`) | ~5 GB under syntese | litt tregere | Hvis Q8_0 høres dårligere ut |
| `torch` (`--engine torch`) | ~6–8 GB mens lastet; lastes ut etter `--idle-min` (standard 10 min) | raskere når varm | Fra 24 GB, eller når Ollama ikke brukes |

Glimt-serveren cacher ferdig lyd i 30 dager (per bruker og stemme), så samme tekst lages bare én gang.

```bash
cd ~/git/torskenes-verden/tools/voxcpm
./install.sh                                    # alt i ett: venv, ffmpeg, llama.cpp-omni (bygges), GGUF Q8_0 (lastes ned nå), LaunchAgent
./install.sh --quant f16                        # GGUF F16
./install.sh --engine torch [--device mps]      # pip voxcpm + PyTorch, openbmb/VoxCPM2 (~5 GB)
./install.sh --idle-min 5                       # last ut etter 5 min (torch; gguf slipper alltid)
./install.sh --cache-dir /Volumes/AI/voxcpm     # modellene på den eksterne disken
./install.sh --omni-dir ~/src/llama.cpp-omni    # bruk et eksisterende bygg
./install.sh --rotate-key                       # ny nøkkel – legg den inn i Homelab etterpå
./install.sh --refresh-model                    # last ned modellen og bygg på nytt
./uninstall.sh [--purge]
```

Krever Python 3.10–3.12 (`brew install python@3.12`), Xcode Command Line Tools og cmake (gguf), og ffmpeg (mp3; installeres med brew).
Tjenesten kjører etterpå med `HF_HUB_OFFLINE=1` (ingen nett).

## API

```
GET    /health              → {status:'ok'|'error', service:'voxcpm', model:'VoxCPM2', engine:'gguf'|'torch', quant, device, loaded,
                               idle_unload_min, memory:{peak_rss_mb, model_estimate_mb}, refs, ffmpeg, version}
POST   /v1/audio/speech     {input, voice?:{kind:'design', prompt}|{kind:'clone', ref_sha, ref_text?}|null, language?,
                             response_format:'mp3'|'wav'|'opus', speed?(0.5–2)} → lyd (X-AI-Generated: VoxCPM2)
                             404 {error:{code:'ref_missing'}} når referansen ikke er lastet opp
PUT    /v1/refs/<sha256>    body = PCM-WAV; sha256 av innholdet må stemme → 201 (ny) / 200
HEAD   /v1/refs/<sha256>    → 200 / 404
DELETE /v1/refs/<sha256>    → 204 / 404
```
- Voice Design: beskrivelsen legges i parentes først i teksten (`(En rolig mannsstemme)Tekst`), slik VoxCPM2 vil ha det.
- Kloning: `ref_text` (nøyaktig transkripsjon) gir «ultimate cloning» (`--prompt-wav` + `--prompt-text` + `-r`); uten den bare `-r`.
- Teksten deles i setninger (biter på ≤ 220 tegn for torch, ≤ 600 for gguf fordi CLI-et laster modellen per kall) og settes sammen med
  en kort pause. Svaret sendes samlet (ikke strømmet).
- mp3/opus lages med ffmpeg (med kommentaren «KI-generert tale (VoxCPM2)»); uten ffmpeg sendes WAV.
- Én syntese om gangen (maks 3 i kø, ellers 503 `busy`). Maks 4000 tegn, maks 25 MB body.
- Referansene ligger i `refs/<sha256>.wav` – bare innholds-hash, aldri navn eller bruker. Glimt sletter dem når stemmen slettes.

## Test

Fra Glimt-serveren (10.69.1.39):
```bash
K=<nøkkelen fra install.sh>
curl -sS -H "Authorization: Bearer $K" http://10.69.1.173:8030/health
curl -sS -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -o hei.mp3 \
  -d '{"input":"Hei, dette er VoxCPM på Mac minien.","voice":{"kind":"design","prompt":"En rolig, varm kvinnestemme"},"response_format":"mp3"}' \
  http://10.69.1.173:8030/v1/audio/speech
SHA=$(shasum -a 256 meg.wav | cut -d' ' -f1)       # 16 kHz mono WAV, 5–60 s
curl -sS -X PUT -H "Authorization: Bearer $K" --data-binary @meg.wav http://10.69.1.173:8030/v1/refs/$SHA
curl -sS -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -o klon.mp3 \
  -d "{\"input\":\"Nå snakker jeg med klonet stemme.\",\"voice\":{\"kind\":\"clone\",\"ref_sha\":\"$SHA\"}}" http://10.69.1.173:8030/v1/audio/speech
curl -sS -X DELETE -H "Authorization: Bearer $K" http://10.69.1.173:8030/v1/refs/$SHA
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8030/health      # uten nøkkel: 401
```
Fra Mac-en selv: 403 (Mac-en står ikke på tillatelseslista – riktig).

Enhetstester (Linux eller Mac, bare standardbiblioteket): `python3 -m unittest -v tools/voxcpm/test_voxcpm.py`
(testmotoren lager en sinustone; ekte VoxCPM2 kjøres ikke i testene).

**Kloning:** bare egen stemme eller med samtykke. Aldri for å utgi seg for andre, svindel eller desinformasjon (VoxCPM-vilkårene).

Full veiledning: `docs/voxcpm-57.md`.
