# Lisenser for tredjepartsmodeller

Homelab bruker modeller som kjører lokalt i huset. Tekst, bilder og lyd sendes ikke ut for å bli behandlet.
Den samme teksten vises på web under **Innstillinger → Konto → Om / Lisenser** (eller `#/om`). iOS- og Android-appen har den under Om appen (Innstillinger).

## Desert Ant Labs

**Inneholder modeller fra Desert Ant Labs (license.desertant.com)**

| Modell | Pakke (npm) | Brukes til |
| --- | --- | --- |
| Eye | `@desert-ant-labs/eye` 4.1.0 | Bildetype (kvittering, dokument, skjermbilde, foto) og rotasjon før OCR |
| Redact | `@desert-ant-labs/redact` 4.1.0 | Personopplysninger byttes med plassholdere før tekst går til en sky-modell eller et nettsøk |
| Gist | `@desert-ant-labs/gist` 4.1.0 | Emner på nyhetssaker |
| Tongue | `@desert-ant-labs/tongue` 4.1.0 | Språket i meldingen til Glimt |
| Emo | `@desert-ant-labs/emo` 4.1.0 | Emoji-forslag for gjøremål, kalender og huskeliste |
| Moderator | `@desert-ant-labs/moderator` 4.1.0 | Upassende bilder skjules for barnekontoer |
| Clear | `@desert-ant-labs/clear` 4.1.0 | Renser lyd før tale til tekst |
| Voz | `@desert-ant-labs/voz` 4.1.0 | Tale til tekst med ordtider |

Lisens: **Desert Ant Labs Source-Available License 1.0** – <https://license.desertant.com/1.0>
(maskinlesbar: <https://license.desertant.com/1.0.txt>, kreditering: <https://license.desertant.com/attribution>).

Kort fortalt: gratis under 100 000 aktive enheter per plattform per modell (over det kreves en kommersiell lisens,
licensing@desertant.com). Modellene kan bygges inn i appen. Modellene, svarene deres og loggene skal **ikke** brukes til å
trene en konkurrerende modell. Desert Ant Labs skal krediteres i appen. Copyright © 2026 Desert Ant Labs B.V.

Kjøretidspakker: `koffi` (MIT) for den native kjernen og `onnxruntime-node` (MIT, Microsoft) for Voz.

## Fermion Research

| Modell | Lisens | Brukes til |
| --- | --- | --- |
| Phonon-2 / Phonon-2.5 | CC-BY-4.0 (<https://creativecommons.org/licenses/by/4.0/>) | Tale til tekst på Mac mini-en |
| Neutrino-1 8B (bygger på Qwen3-8B) | Apache-2.0 (<https://www.apache.org/licenses/LICENSE-2.0>) | Valgfri tekstmotor på Mac mini-en |

Kreditering: «Phonon © Fermion Research, CC-BY-4.0» og «Neutrino-1 © Fermion Research, Apache-2.0» (Qwen3 © Alibaba Cloud, Apache-2.0).
Phonon-2-familien er avledet av NVIDIAs parakeet-tdt-0.6b-v3 (CC-BY-4.0); endringene står i NOTICE-fila i hvert vekt-repo på
Hugging Face (`FermionResearch/Phonon-2`, `FermionResearch/Phonon-2.5`). Kjøretiden på Mac mini-en er `fermion-research`
(PyPI, Apache-2.0), installert med `tools/fermion/install.sh`. Vektene lastes ned på Mac mini-en, aldri i Docker-imaget eller repoet.
Detaljer om oppsettet: `docs/fermion-53.md`.

## NB-Whisper (Nasjonalbiblioteket)

| Modell | Lisens | Brukes til |
| --- | --- | --- |
| NB-Whisper (`NbAiLab/nb-whisper-large` / `-medium` / `-small`) | Apache-2.0 (<https://www.apache.org/licenses/LICENSE-2.0>) | Tale til tekst på norsk (bokmål og nynorsk) og engelsk, og språkdeteksjon, på Mac mini-en |

Kreditering: «NB-Whisper © Nasjonalbiblioteket (NbAiLab), Apache-2.0». NB-Whisper er finjustert fra OpenAI Whisper (MIT).
Kjøretiden på Mac mini-en er `mlx` og `mlx-whisper` (Apple, MIT) eller whisper.cpp (`whisper-cpp` fra Homebrew, MIT), installert med
`tools/nb-whisper/install.sh`. Vektene lastes ned fra Hugging Face på Mac mini-en ved installasjon (eventuelt konvertert til MLX der),
aldri i Docker-imaget eller repoet. Detaljer: `docs/nb-whisper-54.md`.

## VoxCPM2 (OpenBMB)

| Modell | Lisens | Brukes til |
| --- | --- | --- |
| VoxCPM2 (`openbmb/VoxCPM2`, og GGUF-konverteringen `DennisHuang648/VoxCPM2-GGUF`) | Apache-2.0 (<https://www.apache.org/licenses/LICENSE-2.0>), både kode og vekter | Tekst til tale på norsk med ferdige stemmer, egne stemmer fra beskrivelse og klonede stemmer, på Mac mini-en (Glimt og nyhetsleseren) |

Kreditering: «VoxCPM2 © OpenBMB, Apache-2.0» (<https://github.com/OpenBMB/VoxCPM>).
Kjøretiden på Mac mini-en er `voxcpm2-cli` fra llama.cpp-omni (<https://github.com/tc-mb/llama.cpp-omni>, bygger på llama.cpp, MIT) – standard –
eller pip-pakken `voxcpm` (Apache-2.0) med PyTorch (BSD-3-Clause). Installert med `tools/voxcpm/install.sh`; vektene lastes ned fra
Hugging Face på Mac mini-en, aldri i Docker-imaget eller repoet. Bruksvilkår fra OpenBMB: kloning skal ikke brukes til å utgi seg for andre,
svindel eller desinformasjon, og KI-generert lyd bør merkes (Glimt viser «KI-stemme», og mp3-filene har en kommentar om det).
Detaljer: `docs/voxcpm-57.md`.

## oMLX og MLX-modellene (prompt 58)

| Programvare / modell | Lisens | Brukes til |
| --- | --- | --- |
| oMLX (`jundot/omlx`, Homebrew-tap `jundot/omlx`) | Apache-2.0 (<https://www.apache.org/licenses/LICENSE-2.0>) | Valgfri MLX-motor (OpenAI-kompatibel) bak AI-gaten på Mac mini-en |
| MLX, mlx-lm, mlx-vlm (Apple / Blaizzy) | MIT | Kjøretiden oMLX bygger på |
| `mlx-community/Qwen3-8B-4bit` (Qwen3-8B, Alibaba Cloud) | Apache-2.0 | Tekstmodell i oMLX (samme modell som `qwen3:8b` i Ollama) |
| `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` (Qwen2.5-VL-7B-Instruct, Alibaba Cloud) | Apache-2.0 | Bildemodell i oMLX (erstatter `qwen2.5vl:7b` når oMLX er valgt) |

Kreditering: «oMLX © jundot, Apache-2.0» og «Qwen3 / Qwen2.5-VL © Alibaba Cloud, Apache-2.0». oMLX installeres med
`tools/omlx/install.sh` fra Homebrew, og vektene lastes ned fra Hugging Face på Mac mini-en. Ingenting av dette ligger i Docker-imaget
eller i repoet. Detaljer: `docs/omlx-58.md`.
