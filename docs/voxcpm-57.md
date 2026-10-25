# Lokale stemmer, kloning og stemmevalg – VoxCPM2 (prompt 57)

Glimt og nyhetsleseren kan lese opp med **VoxCPM2** fra OpenBMB (Apache-2.0, kode og vekter) som kjører lokalt på Mac mini-en.
Du kan velge en ferdig norsk stemme, lage en stemme fra en beskrivelse, eller **klone din egen stemme** fra et kort opptak.
Tekst og opptak forlater aldri huset. Sky-motorene (OpenAI, ElevenLabs, Azure) virker som før og er reserve.

## Hva det gjør

- **Glimt-innstillinger › Stemmer**: velg motor og stemme for Glimt, og en egen stemme for nyhetsleseren («Les opp»).
  Lytt før du velger. VoxCPM-stemmene heter `vx-…` (ferdige) og `vxu-…` (dine egne).
- **Ferdige stemmer**: Nora (rolig, varm kvinnestemme), Henrik (tydelig mannsstemme), Lys (glad og lett), Nyhetsoppleser (nøytral, profesjonell).
- **Lag stemme fra beskrivelse**: f.eks. «En rolig mannsstemme, middels tempo». VoxCPM2 lager stemmen fra teksten (Voice Design).
- **Klon en stemme**: ta opp 10–30 s (en foreslått norsk lesetekst vises) eller last opp en fil (5–60 s). Du må krysse av for
  «Dette er min egen stemme, eller jeg har samtykke fra personen» – tidspunktet lagres. Ikke klon offentlige personer eller andre uten
  samtykke (det er også forbudt i VoxCPM-vilkårene: ikke for å utgi seg for andre, svindel eller desinformasjon).
- Stemmene er **private per bruker**. Admin ser bare antall. Slett når som helst – opptaket, transkripsjonen, ferdig lyd i cachen og
  kopien på Mac mini-en slettes.
- Avspilt lyd merkes «KI-stemme» (headeren `X-TTS-AI: 1`), og mp3-filene fra Mac-en har en kommentar om at de er KI-generert.

## Når Mac mini-en ikke svarer

`POST /api/tts` prøver i rekkefølge: VoxCPM (når en VoxCPM-stemme er valgt, eller motoren er «VoxCPM2») → sky-motoren du har valgt →
første sky-motor som er satt opp → nettleserens stemme (503 `fallback:'browser'`, som før). Ved reserve brukes nærmeste sky-stemme
(Henrik → Henrik, Lys → Lys, ellers Nora), og svaret har `X-TTS-Fallback: voxcpm`. Har du valgt nettleserstemmen, brukes aldri sky.
Helsesjekken går hvert minutt i bakgrunnen (maks 1,5 s), så ingen forespørsel venter på en Mac som er nede.

## Installere på Mac mini-en

```bash
cd ~/git/torskenes-verden && git pull
cd tools/voxcpm
./install.sh
```

Skriptet (fungerer med macOS sin bash 3.2):
1. Finner Python 3.10–3.12 (`brew install python@3.12` hvis den mangler), lager venv i `~/Library/Application Support/voxcpm/venv`.
2. Installerer ffmpeg med Homebrew hvis den mangler (mp3 til Glimt).
3. **Standard (gguf)**: kloner og bygger `voxcpm2-cli` fra llama.cpp-omni (cmake, Metal), og laster ned VoxCPM2 GGUF
   (BaseLM **Q8_0** + Acoustic F16) fra `DennisHuang648/VoxCPM2-GGUF`. Prøvekjører CLI-et.
   **Alternativ (`--engine torch`)**: `pip install voxcpm` (PyTorch, MPS) og `openbmb/VoxCPM2` (~5 GB).
4. Lager nøkkel og `config.json` (600), LaunchAgent `com.local.voxcpm` (logg `~/Library/Logs/voxcpm.log`), og skriver ut adressen og nøkkelen.

Valget av standard: på 16 GB skal qwen3:8b kunne ligge lastet i Ollama. GGUF Q8_0 bruker ~3 GB og bare mens en forespørsel lages
(CLI-et laster modellen per forespørsel og slipper alt etterpå). PyTorch bruker ~6–8 GB mens den er lastet; den lastes ut etter
`--idle-min` minutter uten bruk (standard 10). GGUF er tregere (RTF ~1,8 på M4 Pro ifølge OpenBMB, pluss lasting), men Glimt-serveren
cacher lyden i 30 dager, så samme tekst lages bare én gang.

## Koble til i Homelab

**AI-kontroll › VoxCPM (Mac mini)** (bare admin): adresse `http://10.69.1.173:8030` og nøkkelen fra `install.sh`. Adressen må være i
huset (LAN), nøkkelen lagres kryptert og vises aldri igjen. «Test» lager en kort setning med Nora.
Miljø-reserve: `VOXCPM_URL`, `VOXCPM_KEY`.

## API (server)

```
GET    /api/voices57                     → {voices:[{id, name, kind:'builtin'|'design'|'clone', desc?, createdAt, lang?, prompt?, seconds?, hasTranscript?, consentAt?}],
                                            engineReady, configured, selected:{voice, newsVoice}, consentText, sampleText, limits}
POST   /api/voices57                     {name, kind:'design', prompt}                                       → 201 {voice}
POST   /api/voices57  (multipart)        name, kind=clone, file, transcript?, consent=true                   → 201 {voice}
                                          400 consent_required | name_required | file_required | bad_audio | too_short | too_long | too_many · 413 too_large
POST   /api/voices57/:id/preview         {text?} → lyd · 503 {fallback:'browser'} når Mac-en ikke svarer · 404
DELETE /api/voices57/:id                 → {ok, macDeleted}

POST   /api/tts                          {text, character?, voice?, rate?, lang?, purpose?:'glimt'|'news'} → lyd
                                          X-TTS-Engine: voxcpm|openai|elevenlabs|azure|mock · X-TTS-Voice · X-TTS-Cache · X-TTS-AI: 1 · X-TTS-Fallback?
GET/PUT /api/glimt/settings              tts.engine += 'voxcpm' · tts.voice = nora|henrik|lys|vx-…|vxu-… · tts.newsVoice = null|stemme

GET    /api/admin/voxcpm57/health[?fresh=1] → {voxcpm:{configured, ok, status, url, ms, checkedAt, error, model, engine, quant, device, loaded, memoryMb, idleUnloadMin, version},
                                               voices:{users, clones, designs}}
GET/PUT /api/admin/voxcpm57/config       {url?, key?} → {url, keySet}
POST   /api/admin/voxcpm57/test          → {ok, ms, bytes, engine, contentType, error?}
```

Mac-tjenestens API står i `tools/voxcpm/README.md`.

## Lagring

- `DATA_DIR/voices57/<bruker-id>/<id>.json` – navn, type, beskrivelse eller (for kloner) sha256, lengde, transkripsjon, samtykke og tidspunkt.
- `DATA_DIR/voices57/<bruker-id>/<id>.wav` – referanseopptaket, 16 kHz mono (konvertert med ffmpeg på serveren).
- `DATA_DIR/voices57/<bruker-id>/cache/` – ferdig lyd per stemme (30 dager), slettes sammen med stemmen.
- Mac mini-en: `~/Library/Application Support/voxcpm/refs/<sha256>.wav` – bare innholds-hash, aldri navn eller bruker.
  Serveren laster opp referansen ved første bruk (eller når Mac-en har ryddet), og sletter den når stemmen slettes.
- Slettes en bruker, slettes stemmemappa og referansene på Mac-en.

## Feilsøking

- Status «Kan ikke nås»: sjekk `launchctl print gui/$(id -u)/com.local.voxcpm` og `tail -f ~/Library/Logs/voxcpm.log` på Mac-en.
- «Mac mini-en avviste avsenderen»: Glimt-serverens adresse står ikke i `allow` (installer med `--allow <ip>`).
- «VoxCPM er ikke klar»: `voxcpm2-cli` eller GGUF-filene mangler, eller voxcpm/torch er ikke installert – kjør `./install.sh` igjen.
- Treg første setning: forventet med GGUF (modellen lastes per forespørsel). Bytt til `--engine torch` hvis du har minne nok.
