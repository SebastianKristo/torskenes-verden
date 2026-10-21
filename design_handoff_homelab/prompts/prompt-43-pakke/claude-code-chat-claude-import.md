# Chat: importer minne og samtaler fra Claude

Ønske 2026-10-21: «Legg inn I chat fra ai instlinger at chat kan importere ai memory og chats fra claude. Jeg exportrer fra claude la chat i innstligne importere det,»
Fasit: `Claude Import.dc.html`, lagt inn som fanen **Importer** i `AI Kontroll.dc.html` (AI-innstillingene som åpnes fra Chat, web og mobil).

## Steg 1: forklaring + fil
- Kort med logo: «Importer fra Claude · Samtaler havner i Chat i mappen «Claude». Minnet brukes av Chat og Glimt.»
- **Slik eksporterer du fra Claude** (nummerert):
  1. claude.ai → Innstillinger → Personvern → Eksporter data (mobil: profil → Innstillinger → Personvern).
  2. E-post med lenke, gyldig 24 timer. Last ned ZIP-fila.
  3. Slipp den her. Leser `conversations.json`, `projects.json` og minnet hvis det ligger med. Alt lagres på hjemmeserveren.
  4. Minne: Claude → Innstillinger → Minne → Vis og rediger → kopier teksten og lim inn hvis den ikke er i ZIP-fila.
- Slippsone (dra og slipp eller trykk) for `.zip` eller `conversations.json`. Feilmeldinger: «Fila er ikke en gyldig ZIP», «Fant ikke conversations.json i eksporten».
- Tekstfelt **Minne (valgfritt)**, ett punkt per linje. Knapper: «Importer bare minnet», «Prøv med en eksempel-eksport».
- Mens fila leses: ekte steg med tid («✓ Pakket ut 4 filer 38 ms · ✓ Fant 128 samtaler 52 ms»).

## Steg 2: forhåndsvisning
- Tall: samtaler · meldinger · prosjekter · minnepunkter. «Fra 20. jan. 2026 til 12. okt. 2026 · prosjekter: Homelab, Studie».
- **Samtaler**: søk i titler, Alle/Ingen, liste med avkryssing (tittel, dato, antall meldinger). «Importert før» på dem som finnes (samme `uuid`), de er ikke valgt. Viser 60 om gangen.
- **Minne**: punktene med avkryssing.
- Brytere: Importer samtaler · Importer minne · Hopp over det som er importert før.
- **Importer 128 samtaler og 14 minnepunkter**.

## Import
- Fremdrift (antall / totalt). Backend: `POST /api/chat/import/claude` (multipart ZIP) → parses på serveren, ikke i nettleseren, for store eksporter. Klienten kan pakke ut små filer selv.
- Hver samtale → Chat-samtale i mappen **Claude**: `id = "cl_" + uuid`, tittel = `name`, `up` = `updated_at`, meldinger `human` → bruker, `assistant` → svar. Tekst fra `text` eller `content[].type == "text"`. Vedlegg/artefakter lagres som tekst-vedlegg der de finnes. Samtalen kan fortsettes med valgfri modell (Auto).
- Minne → `/api/ai/memory` med `src: "Claude"`, uten duplikater (sammenlign tekst uten store/små bokstaver). Vises i Chat → ⚙ → Minne der hvert punkt kan redigeres eller slettes.
- Søkeindeks (embeddings med `bge-m3`) bygges i bakgrunnen som AI-jobb, så Glimt kan finne gamle samtaler.

## Ferdig
- «✓ 128 samtaler og 14 minnepunkter importert». «Samtalene ligger i mappen «Claude» i Chat. Minnet ligger under Chat → ⚙ → Minne. 3 var importert før og ble hoppet over.»
- Knapper: **Åpne Chat**, Importer mer, **Angre importen** (fjerner akkurat de som ble lagt til).

## Personvern
- ZIP-fila slettes fra serveren når importen er ferdig. Bare samtalene og minnet blir liggende. Ingenting sendes til skyen.
