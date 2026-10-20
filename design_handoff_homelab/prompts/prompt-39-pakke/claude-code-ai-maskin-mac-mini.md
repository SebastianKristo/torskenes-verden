# AI-maskinen: Mac mini M4 · 16 GB · 2 TB ekstern disk

Info fra brukeren 2026-10-20: «PC-en som brukes for AI/Ollama er Mac mini M4, 16 GB minne, 2 TB ekstern HDD.»
Fasit: `AI Kontroll.dc.html` → `R.hw` + modellbiblioteket (`fit`).

## Visning (AI-kontroll → Oversikt og Modeller)
- Maskinkortet: **«Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk»**. Hentes fra Ollama-verten (`system_profiler` / `sysctl hw.memsize` + `ollama ps`), ikke hardkodet.
- Bar 1: **Minne til modeller (GPU)** «x / 10,7 GB».
  - Apple Silicon gir GPU-en ca. ⅔ av samlet minne som standard (≈ 10,7 GB av 16 GB). Resten trengs til macOS og serveren.
  - Gul over 9,5 GB.
  - Kan økes med `sudo sysctl iogpu.wired_limit_mb=12288`. Det vises som et avansert valg med advarsel.
- Bar 2: **Modeller på ekstern disk** «x / 2 000 GB».
- Modellbiblioteket merker hver modell:
  - **PASSER** ≤ 8 GB
  - **TRANGT** ≤ 10,5 GB (bare én om gangen)
  - **FOR STOR** > 10,5 GB
  - Det gir for eksempel: qwen2.5vl:7b PASSER · gemma4/gemma3:12b TRANGT · gemma3:27b, mistral-small3.2 og llama3.3:70b FOR STOR (bruk sky).

## Anbefalte innstillinger for denne maskinen
- **Én stor modell lastet om gangen.** `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`. «Samtidige kvitteringer» standard **1** (maks 2 med 7B).
- **Modellvalg (Finans/Glimt):**
  - Kvitteringer: `qwen2.5vl:7b` (6 GB)
  - Kategorisering: `llama3.2:3b` (2 GB, kan ligge lastet sammen med 7B)
  - Chat/Glimt/Finans-spør: `gemma3:12b` eller `qwen3:8b` (Q4_K_M), sky som reserve
  - Embeddings: `nomic-embed-text`
- **Kontekst:** standard 8k (32k gir mye mer KV-cache). `OLLAMA_KV_CACHE_TYPE=q8_0` + `OLLAMA_FLASH_ATTENTION=1` sparer minne.
- **Ekstern disk (HDD):**
  - `OLLAMA_MODELS=/Volumes/<disk>/ollama` for lagring.
  - En HDD gir trege lastetider (5–20 s for 6–10 GB). Bruk derfor **keep_alive 30 min** som standard for modellene som brukes mest, og «Hold lastet: Alltid» for kvitteringsmodellen hvis minnet tillater det.
  - Er det en SSD-kabinett, ok. Anbefal ellers å legge de 1–2 mest brukte modellene på intern SSD (`~/.ollama/models`) og resten eksternt (symlink).
  - Advarsel i UI hvis disken ikke er montert: «Ekstern disk mangler · Ollama finner ikke modellene».
- **Ruting:** når minnet er fullt eller en jobb venter > 20 s, brukes reserve (sky) for ikke-finans-oppgaver. Finans holdes lokalt hvis «Finansdata forlater aldri huset» er på, og står da i kø.
- **Tidsavbrudd:** første kall etter at modellen er lastet ut kan ta lang tid (lasting fra HDD). Gi 60 s første gang og 30 s ellers, og vis «Laster modellen fra disk …» i UI.
- Mac-en skal ikke sove: `sudo pmset -a sleep 0 disksleep 0` (ellers spinner HDD-en ned).
