# Underdog Saluki 27B på Mac minien

[Underdog Saluki 27B 1.0](https://huggingface.co/ConwayResearch/Underdog-Saluki-27B-1.0) er Qwen3.8-27B komprimert til 7,9 GB (IQ2), tunet for verktøykall. Apache 2.0. Tekstmodell; bildestøtten er et eget tillegg som ikke brukes her (qwen2.5vl leser bilder som før).

## Passer den på 16 GB?
- Vektene er 7,9 GB, pluss ca. 1 GB kontekst med `OLLAMA_KV_CACHE_TYPE=q8_0` og 8192 tokens. Det går, men den bruker mesteparten av minnet: den kan ikke ligge lastet samtidig med qwen2.5vl (6 GB) eller qwen3:8b (5,2 GB). AI-gaten kjører én modell om gangen per Ollama, så modellene byttes ut, men hvert bytte tar noen sekunder.
- Den er større enn qwen3:8b og derfor tregere per token (anslag ~10–15 token/s mot ~25–30 på M4). Bruk den der kvalitet på verktøykall betyr mer enn fart.
- Krever en nyere Ollama (Qwen3.8-arkitekturen). Underdog oppgir Ollama 0.40.4 på Apple silicon.

## Installer (på Mac minien)
```sh
brew upgrade ollama          # eller oppdater Ollama-appen
pip install -U huggingface_hub
hf download ConwayResearch/Underdog-Saluki-27B-1.0 Underdog-Saluki-27B-1.0-IQ2-mix.gguf --local-dir ~/models/saluki
cat > ~/models/saluki/Modelfile <<'EOF'
FROM ./Underdog-Saluki-27B-1.0-IQ2-mix.gguf
PARAMETER num_ctx 8192
EOF
cd ~/models/saluki && ollama create saluki:27b -f Modelfile
ollama run saluki:27b "Si hei på norsk." --think=false
```
Navnet `saluki:27b` gjenkjennes av Homelab som tenkemodell (tenking slås av der Glimt trenger raske svar).

## Bruk i Homelab
- Modellen dukker opp av seg selv i Chat → Velg modell og i AI-kontroll → Hvem gjør hva, når den er installert.
- **Ikke gjør den til standard for Glimt før eval er kjørt.** Sammenlign mot qwen3:8b:
  ```sh
  npm run eval                         # dagens modell
  npm run eval -- --model saluki:27b   # Saluki på alle tekstruter
  ```
  Bytt bare hvis Saluki består flere caser uten at svartiden blir for lang.
- Kvitteringer bruker fortsatt OCR + qwen3:8b (rader) og qwen2.5vl som kontroll; Saluki er ikke tatt inn der.
