# Chat-side (Ollama + Gemini/Groq) i mobil og web

Fasit: `Mobil Papir App.dc.html` (side `chat`, fullskjerm; Fold = fast sidepanel) og `Homelab Papir Web.dc.html` (fane «Chat»). Samme oppsett og samme data begge steder.

## Backend: bruk Open WebUI som motor
Kjør Open WebUI i Docker ved siden av Ollama og bruk API-et. Det gir historikk, mapper, RAG, nettsøk og modelladministrasjon uten at vi må bygge det selv. Vårt eget UI ligger oppå.
- Chat (strøm): `POST /api/chat/completions` (OpenAI-format, `stream: true`). Send `model`, `messages`, `temperature`, `top_p`, `num_ctx`, systemprompt som første melding.
- Historikk: `/api/v1/chats` (liste, hent, lagre, slett), `/api/v1/chats/{id}/pin`, mapper `/api/v1/folders`. Gir synk mellom mobil og web automatisk.
- Kunnskapsbase: `/api/v1/knowledge` + `/api/v1/files` (embedding: `nomic-embed-text`). Valgte dokumenter sendes som `files` i chat-kallet.
- Nettsøk: slå på SearXNG i Open WebUI og send `features: {web_search: true}`.
- Modeller: `GET /ollama/api/tags`, `POST /ollama/api/pull` (strøm fremdrift), `DELETE /ollama/api/delete`.
- Sky-modeller: legg Gemini og Groq inn som OpenAI-kompatible tilkoblinger i Open WebUI. Merk dem `sky` i vår modelliste.
- Bruk én servicekonto/token per bruker, lagret i Keychain/Keystore. Tidsgrenser fra `user_settings.ai_timeouts`.

## Funksjoner (alt finnes i designet)
- **Historikk** i skuff (☰) på telefon, fast sidepanel på Fold og web: søk (med ✕ til venstre), FESTET, MAPPER (åpne/lukke), I DAG, I GÅR, SISTE 7 DAGER, ELDRE. ⋯ på en samtale: gi nytt navn, fest, eksporter Markdown, del lenke, flytt til mappe / ny mappe, slett (to trykk).
- **Modellvelger** i toppen: LOKAL (grønn) / SKY (rød). Valgt per samtale; siste valg blir standard for nye.
- **Samtaleinnstillinger** (⚙): persona (Standard, Økonomi, Homelab, Norsklærer), systemprompt, temperatur 0–2, top P, kontekst 4k–32k, tema Papir/Nøytral.
- **Meldinger**: strømmes tegn for tegn, Stopp-knapp. Bruker: Rediger (lagrer og sender på nytt fra det punktet) og Kopier. Svar: Kopier, Nytt svar (siste), Les høyt (TTS nb-NO), og tok/s og tid. Brikker viser hva som ble brukt («Brukte Finans», «Brukte Husleiekontrakt…»).
- **Vedlegg** (+): bilde/kamera (bildemodell), fil, fra kunnskapsbasen.
- **Nettsøk** og **Mine data** som av/på-brikker i skrivefeltet.
- **Stemme**: mikrofon med lydbølge. Bruk Whisper (faster-whisper i Open WebUI) eller systemets talegjenkjenning (nb-NO).
- **Modeller**: installerte med Slett (bekreft), hent fra ollama.com med fremdrift, eller skriv modellnavn.
- **Tema**: Papir (appens farger og Newsreader) eller Nøytral (mørk, systemfont, som ChatGPT/Open WebUI).

## Mine data og personvern
- «Mine data» gir modellen et sammendrag fra Finans, Kalender og Huskeliste (via egne endepunkter, ikke rå tabeller). Bryter i Innstillinger → AI og tolkning → CHAT: «Chat kan lese mine data».
- **Spør før sky**: er modellen SKY og Mine data eller vedlegg er med, vises arket «Sende til Gemini 2.5 Flash?» med listen over hva som forlater serveren. Valg: Send, Send uten mine data, Bruk lokal modell, og «Ikke spør igjen i denne samtalen» (lagres på samtalen). Bryter: «Spør før sky-modeller får data».
- Lokale modeller: ingenting forlater hjemmeserveren (vises under skrivefeltet).

## Inngang
- Mobil: fane (velg i navbar-redigering for Hjem og Finans), rad «Chat» i Mer, og **✦ AI** til høyre i Google-søkefeltet på Hjem.
- Web: fane «Chat» og **✦ AI** i Google-søket på Dashboard. Teksten i feltet startes som ny chat.
