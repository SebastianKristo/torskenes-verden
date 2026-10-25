# omlx – oMLX på Mac mini-en som motor bak AI-gaten (prompt 58)

[oMLX](https://github.com/jundot/omlx) (Apache-2.0) er en OpenAI-kompatibel MLX-server for Apple silicon (macOS 15+). Homelab bruker
den som en **tredje backend i AI-gaten** ved siden av Ollama og Open WebUI. Ollama er fortsatt standard. oMLX velges per oppgave i
AI-kontroll når eval har vist at den er bedre.

| Del | Adresse | Merknad |
|---|---|---|
| Vakt (`guard.py`) | `http://10.69.1.173:8040` | Bare `10.69.1.39` (Glimt-serveren) med `Authorization: Bearer <nøkkel>`, sammenlignet i konstant tid. Rutene er `/health`, `/v1/models`, `/v1/chat/completions` og `/v1/embeddings`. |
| oMLX (`omlx serve`) | `http://127.0.0.1:18040` | Bare på Mac-en, med API-nøkkel (`OMLX_API_KEY`). Admin-panelet ligger på `/admin`. |
| LaunchAgent | `com.local.omlx58` | Vakten starter `omlx serve` og blir startet på nytt av launchd. |
| Logg | `~/Library/Logs/omlx58.log` | Én linje per forespørsel, aldri nøkler eller innhold. oMLX logger selv til `~/.omlx/logs/server.log`. |

- Port **8000** (oMLX sin standard) brukes av Neutrino (Fermion) på Mac mini-en. Derfor stopper `install.sh` Homebrew-tjenesten `omlx`
  og kjører sin egen agent på 18040/8040.
- Tjenesten går **aldri** via Cloudflare eller internett. Serveren godtar bare adresser i huset (LAN/localhost).
- Modeller: `mlx-community/Qwen3-8B-4bit` (tekst, ~4,6 GB) og `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` (bilde, erstatter
  `qwen2.5vl:7b`, ~5,6 GB) i `~/.omlx/models/mlx-community/…`.
- Embeddings blir på Ollama (`nomic-embed-text`). Vi har ikke sjekket noen MLX-variant av den, og vektorer fra ulike motorer kan ikke
  blandes i samme indeks.

```bash
cd ~/git/torskenes-verden/tools/omlx
./install.sh                                  # brew-installasjon, modellene, nøkkel, vakt og LaunchAgent
./install.sh --model-dir /Volumes/AI/omlx     # modellene på den eksterne disken
./install.sh --memory-gb 10                   # minnevakt (standard RAM − 7 GB: 16 GB → 9 GB)
./install.sh --no-vision                      # bare Qwen3-8B
./install.sh --rotate-key                     # ny nøkkel – legg den inn i Homelab etterpå
./uninstall.sh [--purge] [--brew]
```

## Minne (16 GB): ikke samme modell i Ollama og oMLX samtidig

Har både qwen3:8b i Ollama (~5,2 GB) og Qwen3-8B i oMLX (~4,6 GB) lastet, pluss KV-cache og macOS, går Mac-en til swap. Bytt slik:

```bash
ollama stop qwen3:8b                                        # Ollama laster ut modellen med en gang
launchctl kickstart -k gui/$(id -u)/com.local.omlx58        # oMLX starter på nytt (tomt minne)
launchctl bootout gui/$(id -u)/com.local.omlx58             # stopp oMLX helt (./install.sh starter igjen)
```

I Homelab kan du sette `keep_alive 0` for qwen3:8b (AI-kontroll › Valg › «Hold modell lastet» per modell). Da laster Ollama den ut så
snart køen er tom.

## Test (fra Glimt-serveren)

```bash
KEY=…   # nøkkelen install.sh skrev ut
curl -sS -H "Authorization: Bearer $KEY" http://10.69.1.173:8040/health
curl -sS -H "Authorization: Bearer $KEY" http://10.69.1.173:8040/v1/models
curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"mlx-community/Qwen3-8B-4bit","messages":[{"role":"user","content":"Hva er hovedstaden i Norge? /no_think"}],"max_tokens":40,"chat_template_kwargs":{"enable_thinking":false}}' \
  http://10.69.1.173:8040/v1/chat/completions
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8040/health    # uten nøkkel: 401 · fra en annen maskin: 403
```

Full veiledning (Homelab-oppsett, motorvalg, eval-sammenligning, lisens): `docs/omlx-58.md`.
