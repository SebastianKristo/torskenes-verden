# Lisenser for tredjepartsmodeller

Homelab bruker modeller som kjører lokalt i huset. Tekst, bilder og lyd sendes ikke ut for å bli behandlet.
Den samme teksten vises på web under **Innstillinger → Konto → Om / Lisenser** (eller `#/om`). Appene får den i neste runde.

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
