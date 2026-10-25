# Fermion Research på Mac mini-en (prompt 53)

To valgfrie, lokale modeller fra Fermion Research som kjører på Mac mini-en (ikke i Docker, ikke i Ollama):

| | Neutrino-1 8B | Phonon-2.5 |
|---|---|---|
| Hva | Tekstmodell (Qwen3-8B, ternær/sub-2-bit) | Tale→tekst med ordtider |
| Lisens | Apache-2.0 | CC-BY-4.0 (avledet av NVIDIA parakeet-tdt-0.6b-v3) |
| Størrelse | ~3,9 GB på disk (~6,5 GB under første nedlasting) | ~160 MB |
| Adresse | `http://10.69.1.173:8000` | `http://10.69.1.173:8010` |
| LaunchAgent | `com.local.fermion-neutrino` | `com.local.fermion-phonon` |
| I Homelab | Valgfri modell `neutrino:8b` i Chat. Aldri standard. | ASR-backend for `POST /api/voice53/transcribe` (DAL53) |
| Flagg (QA51) | `fermion_neutrino53` (på) | `fermion_phonon53` (på) |

Ingen av dem er standard. Bruk dem side om side med qwen3:8b og la eval/erfaring avgjøre.

## Sikkerhet

- `fermion serve` lytter bare på `127.0.0.1` på Mac-en. Foran står en liten vakt (`tools/fermion/guard.py`) på Mac-ens
  LAN-adresse som slipper inn **bare** avsendere på tillatelseslista (standard `10.69.1.39` = Glimt-serveren) **og** med riktig
  nøkkel (`Authorization: Bearer …`), og bare de faste rutene (`/health`, `/v1/models`, `/v1/chat/completions`,
  `/v1/completions` for Neutrino; `/v1/audio/transcriptions` for Phonon). Samme prinsipp som `tools/vision-ocr/`.
- Aldri eksponert via Cloudflare eller internett. Homelab godtar bare adresser i huset (privat IP, `.local`/`.lan`).
- Nøkkelen lagres kryptert i Homelab, sendes aldri til nettleseren og logges aldri. Vakten logger aldri nøkler, tekst eller lyd.
- Alt som modellene gjør, skjer på Mac-en i huset. Bare modellvektene lastes ned (fra Hugging Face, første gang).

## Språk (viktig)

- **Phonon støtter ikke norsk.** Phonon-2 og Phonon-2.5 English er bare engelsk. Phonon-2.5 er 25 språk – samme liste som
  parakeet-tdt-0.6b-v3: bg, hr, cs, da, nl, en, et, fi, fr, de, el, hu, it, lv, lt, mt, pl, pt, ro, sk, sl, es, sv, ru, uk.
  Dansk og svensk er med, norsk (nb/nn) er ikke. Phonon gjenkjenner språket selv og ignorerer `language`, så Homelab sjekker
  språket: ber du om norsk, svarer `/api/voice53/transcribe` 422 i stedet for å gi feil tekst.
  (Lista er fra grunnmodellens modellkort; modellkortet for Phonon-2.5 kunne ikke leses herfra – sjekk
  <https://huggingface.co/FermionResearch/Phonon-2.5> og si fra hvis den avviker.)
- Neutrino-1 8B er Qwen3-8B kvantisert til under 2 bit. Qwen3 kan norsk, men kvaliteten på norsk etter kvantiseringen er ikke
  målt. Sammenlign med qwen3:8b på dine egne spørsmål før du bruker den mer.

## Installer på Mac mini-en

Krever macOS på Apple silicon og Python 3.10+ (`brew install python@3.12` – macOS sin python3 er 3.9).

```bash
cd ~/git/torskenes-verden && git pull
cd tools/fermion
./install.sh                                    # begge tjenestene, standard adresser
./install.sh --cache-dir /Volumes/AI/fermion    # anbefalt: modellene på den eksterne disken (som Ollama)
```

Skriptet lager venv i `~/Library/Application Support/fermion/venv`, installerer `fermion-research[mlx]==0.2.15` (fast versjon),
lager nøkkel og `config.json` (600), skriver LaunchAgentene og skriver ut adressene, nøkkelen og `curl`-tester. Første start laster
ned modellene: følg med i `tail -f ~/Library/Logs/fermion-neutrino.log`. Til den er ferdig svarer `/health` 503 «starting», og
Homelab viser den ikke i modellvalget (stille reserve – alt annet virker som før).

Andre valg:

```bash
./install.sh --only neutrino            # bare Neutrino (neutrino | phonon | begge)
./install.sh --phonon-model phonon-2    # engelsk Phonon-2 i stedet for Phonon-2.5
./install.sh --session-ctx 8192         # mer kontekst for Neutrino (mer minne, se under)
./install.sh --allow 10.69.1.39 --ip 10.69.1.173
./install.sh --rotate-key               # ny nøkkel – legg den inn i Homelab etterpå
./uninstall.sh                          # stopp og fjern agentene (beholder venv og nøkkel); --purge sletter alt
```

### Minne

Mac mini M4 har 16 GB delt minne, og Ollama bruker det samme. Neutrino bruker ~3,9 GB + KV-cache (~0,6 GB ved 4096 med fp16, ~1,2 GB ved 8192;
standard her er `--session-ctx 4096`). qwen3:8b (5,2 GB) og Neutrino får plass samtidig, men ikke sammen med qwen2.5vl:7b.
Homelab sender Neutrino-kallene i **samme kø** som Ollama (AI-gaten), så de to modellene aldri regner samtidig. Blir Mac-en
treg, stopp Neutrino: `launchctl bootout gui/$(id -u)/com.local.fermion-neutrino`.

## Legg inn i Homelab (admin)

Enten i `.env` på Glimt-serveren (start containeren på nytt etterpå):

```bash
FERMION_NEUTRINO_URL=http://10.69.1.173:8000
FERMION_NEUTRINO_KEY=<nøkkelen fra install.sh>
FERMION_PHONON_URL=http://10.69.1.173:8010
FERMION_PHONON_KEY=<samme nøkkel>
```

eller via API-et (lagres kryptert og vinner over `.env`), med en admin-økt eller et admin-token:

```bash
curl -sS -X PUT https://<homelab>/api/admin/fermion53/config -H 'Content-Type: application/json' -b 'hl_sid=…' \
  -d '{"neutrinoUrl":"http://10.69.1.173:8000","neutrinoKey":"NØKKEL","phononUrl":"http://10.69.1.173:8010","phononKey":"NØKKEL"}'
curl -sS https://<homelab>/api/admin/fermion53/health?fresh=1 -b 'hl_sid=…'      # {"neutrino":{"ok":true,…},"phonon":{…}}
curl -sS -X POST https://<homelab>/api/admin/fermion53/test -H 'Content-Type: application/json' -b 'hl_sid=…' -d '{"service":"neutrino"}'
```

Når Neutrino svarer, står **Neutrino-1 8B · Mac mini** i modellvelgeren i Chat, og AI-kontroll › Modeller viser
«MAC MINI · FERMION» med status. Slå av med flaggene `fermion_neutrino53` / `fermion_phonon53` (Admin › Flagg).

## Test fra Glimt-serveren

```bash
curl -sS -H "Authorization: Bearer NØKKEL" http://10.69.1.173:8000/health
curl -sS -H "Authorization: Bearer NØKKEL" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hva er hovedstaden i Norge?"}],"max_tokens":40}' http://10.69.1.173:8000/v1/chat/completions
curl -sS -H "Authorization: Bearer NØKKEL" -F file=@opptak.wav -F response_format=verbose_json \
  -F 'timestamp_granularities[]=word' http://10.69.1.173:8010/v1/audio/transcriptions
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8000/health     # uten nøkkel: 401
```

Fra Mac-en selv får du 403 (Mac-en står ikke på tillatelseslista) – det er riktig.

## Feilsøking

| Ser du | Gjør |
|---|---|
| `status: starting` | Modellen lastes ned eller inn. Se `~/Library/Logs/fermion-*.log`. |
| `status: auth` | Feil nøkkel, eller Glimt-serveren sender fra en annen IP enn tillatelseslista (`./install.sh --allow …`). |
| `status: down` | Agenten kjører ikke: `launchctl print gui/$(id -u)/com.local.fermion-neutrino \| head -30`, start på nytt med `launchctl kickstart -k gui/$(id -u)/com.local.fermion-neutrino`. |
| Brannmuren på Mac-en | `install.sh` skriver ut `socketfilterfw`-kommandoene for venv-ens Python. |

## Begrensninger og åpne punkter

- AI-kontroll viser Neutrino, men den kan ikke velges i rutingen for oppgaver (Glimt, søk, brief …): `server/ai-run.js` kjenner
  bare Ollama og skymodeller, og den fila skal ikke endres i denne runden. Neutrino brukes derfor bare i Chat foreløpig.
- Neutrino leser ikke bilder. Bilder i en samtale med Neutrino avvises med en forklaring (velg en bildemodell).
- Ikke testet på ekte maskinvare i denne runden: `fermion serve`, modellvektene (Hugging Face var blokkert), MLX og
  `install.sh`/launchd. Vakten (`guard.py`) og Homelab-delen er testet mot en falsk `fermion serve` (`test/p53-fermion.test.js`).
