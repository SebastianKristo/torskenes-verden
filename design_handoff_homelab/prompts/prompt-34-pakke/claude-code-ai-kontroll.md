# AI-kontroll: full kontroll over modeller, nedlasting, jobber, tokens, API og valg

Fasit: `AI Kontroll.dc.html` (props `variant` web|mobile, `scope` alle|chat|finans, `theme` papir|mork|finans, `tab`, `onClose`). Alle visninger: `AI Kontroll Oversikt.dc.html`.
Én komponent brukes overalt, og data deles (`ai_ctl_v1` i prototypen; i appen `/api/ai/*` på serveren, synket web ↔ mobil).

## Hvor den åpnes
- **Innstillinger (web):** `Innstillinger Web.dc.html` → AI («Modeller, jobber, forbruk og nøkler») viser panelet inne i innstillingene.
- **Innstillinger (mobil):** `Mobil Papir App.dc.html` → Innstillinger → APP → **AI og modeller** åpner panelet i fullskjerm, med **Ferdig**-pillen.
- **Chat (web og mobil):**
  - Sidepanelet **Modeller** åpner panelet på fanen Modeller. Det gamle Modeller-arket brukes ikke lenger.
  - **Samtaleinnstillinger** har en ny rad **Full AI-kontroll ›** nederst, som åpner fanen Valg.
- **Finans (web):** `FinansHub v2.dc.html` → Innstillinger → AI. Det gamle rotete oppsettet (4 leverandørkort, 8 løse felt, «Hvem gjør hva», glidebryter og testknapp) er **erstattet** av panelet med `scope="finans"` og `theme="finans"` (mørk FinansHub-stil). Varsel-bryterne (budsjett 80/100 % osv.) blir værende under Varsler. Bruk samme komponent i Finans på mobil.

## Faner
Med scope alle/chat: Oversikt · Modeller · Valg · Jobber · Forbruk · API og nøkler. Med scope finans: AI-valg · Tilkoblinger · Jobber · Forbruk (bare finansoppgaver).
Web: sidemeny til venstre (220 px) og innhold til høyre. Mobil: fanepiller som kan scrolles, og innhold i én kolonne.

1. **Oversikt:**
   - 4 kort: Kjører nå, Lastet i VRAM, Tokens 30 d, Sky-kostnad. Trykk går til riktig fane.
   - Hjemmeserver: GPU-navn og stolper for VRAM i bruk, modeller på disk og sky-budsjett.
   - Leverandørliste: status, nøkkel-hale og svartid.
2. **Modeller:**
   - **Installert lokalt:** id, størrelse, kvantisering, kontekst, type, om den er lastet i VRAM og når den sist ble brukt.
     - Handlinger: **Last inn / Last ut** (`POST /api/generate {keep_alive:0}`), **Bruk som standard** (Chat) og **Slett** (bekreft, `DELETE /api/delete`).
   - **Laster ned:** fremdrift med stripet stolpe, GB av GB, MB/s og **Avbryt**. Kjører i bakgrunnen og varsler når den er ferdig (`POST /api/pull` stream).
   - **Last ned fra Ollama:** søk i biblioteket eller skriv et modellnavn → Enter / «Last ned».
     - Filtre: Tekst, Bilde, Resonnering, Embeddings.
     - Hver modell merkes **PASSER** (≤ 15 GB VRAM), **DELVIS CPU** eller **FOR STOR**, regnet ut fra GPU-en.
   - **Sky-modeller:** av/på per modell. Bare de som er på kan velges i Valg.
3. **Valg (ruting):**
   - Per oppgave velges **modell** og **reserve**: Chat, AI-søk, Glimt · kalender, Kvitteringer (bilde), Kategorisering, Finans · spør, Strekkoder, Domener · oppsummering, Kunnskapsbase (embeddings).
   - Nedtrekkslistene viser lokale og sky-modeller.
   - Regler:
     - **Lokalt først**
     - **Finansdata forlater aldri huset**: varsler i rødt/oransje hvis en finansoppgave peker på sky
     - **Vis tenking**
   - Parametre: Hold modell lastet (keep_alive 5 min / 30 min / Alltid / Aldri), Kontekst (8k/32k/128k), Temperatur, Samtidige jobber (1–4).
   - Finans har i tillegg **Minste sikkerhet før «Sjekk»** (70–95 %) og samtidige kvitteringer.
4. **Jobber:**
   - Grupper: Kjører (spinner og fremdrift), I kø (stiplet ring, evt. planlagt tid) og Siste (✓ / ! med tid, tokens, kostnad og feiltekst).
   - Knapper: **Avbryt**, **Prøv igjen**, **Pause kø**, **Tøm historikk**.
   - Køen respekterer «Samtidige jobber». Kilder: chat, kvitteringer, kategorisering, kunnskapsbase-indeksering, domener-oppsummering og AI-søk.
5. **Forbruk:**
   - Periode: I dag / 7 / 30 dager.
   - Kort: tokens (inn/ut), sky-kostnad (Gemini/Groq), andel lokalt og snitt svartid.
   - Stolpediagram per dag (lokalt grønt, sky aksent).
   - **Per funksjon:** kroner, tokens, modell og antall.
   - **Budsjett for sky-AI:** glidebryter 0–500 kr/mnd med fremdrift og prognose. **Stopp sky-AI ved grensen** bytter til lokale modeller, og **Varsle ved 80 %**.
6. **API og nøkler:**
   - Kort per leverandør: Ollama (adresse), Gemini, Groq, OpenRouter (valgfri) og Roboflow (nøkkel + modell). Hvert kort har status, **Test** (svartid) og lenke til nøkkelsiden. Nøkkelfelt har **Vis/Skjul**.
   - **Glimt-API for egne skript:** liste over personlige nøkler (`hl_••••`), **+ Ny nøkkel** (vises én gang) og **Trekk tilbake**.
   - Nøkler lagres kryptert på serveren, og klienten får bare de siste 4 tegnene.

## Backend
- `GET /api/ai/status` → server/GPU/VRAM/disk, leverandørstatus.
- `GET /api/ai/models` (Ollama `/api/tags` + `/api/ps`), `POST /api/ai/models/pull` (SSE-fremdrift), `POST /api/ai/models/{id}/load|unload`, `DELETE /api/ai/models/{id}`.
- `GET /api/ai/library?q=` (cache av ollama.com/library med størrelser).
- `GET/PUT /api/ai/routing`: oppgave → {modell, reserve}, regler og parametre. Alle AI-kall i appen går gjennom én ruter som leser dette.
- `GET /api/ai/jobs` (SSE), `POST /api/ai/jobs/{id}/cancel|retry`, `POST /api/ai/queue/pause`.
- `GET /api/ai/usage?days=`: tokens og kostnad per leverandør, funksjon og dag. Budsjettsjekk før hvert sky-kall.
- `PUT /api/ai/keys/{provider}`, `POST /api/ai/keys/{provider}/test`, `POST/DELETE /api/ai/tokens`.

## Stil
- Papir: `#f3efe6` / kort `#fffdf8` / felt `#ece6da` / aksent `#b23a2a` / OK `#2f7a4f`. Mørk og Finans har egne tokens (`THEMES` i fila).
- Felles **Ferdig**-pille, brytere 44 × 26 og pille-segmenter som ellers i appen.
- Haptikk ved alle valg. Toast nederst («qwen3:14b er lastet ned»).
