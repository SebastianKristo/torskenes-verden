# Chat: «✦ Auto» – Glimt velger beste modell, og det er standard

Ønske 2026-10-20: «få glimt til å finne ut best ai til å bruke i chat og at den setter den beste modeellen som stadnard i chat.»
Fasit: `Mobil Papir App.dc.html` og `Homelab Papir Web.dc.html` → Chat → modellvelger (`chPick`).

## Standard
- Ny modell øverst i velgeren: **✦ Auto** (merke «AUTO», lilla) · «Glimt velger beste modell for hver melding · lokalt når dine data er med».
- **Auto er standard** for nye samtaler. Eksisterende brukere flyttes til Auto én gang (`autoMig`). Velger du en fast modell, gjelder den for den samtalen.
- Samtaler som står på Auto viser «✦ Auto» i toppen. Hvert svar viser hvilken modell som faktisk ble brukt og hvorfor, f.eks. «✦ Kode · Qwen 3 · 42 tok/s · 3,1 s».

## Slik velger Glimt (per melding, raskt og uten ekstra AI-kall)
1. Bilde/kvittering vedlagt eller nevnt → **Qwen 2.5 VL** (lokalt), ellers Gemma 3.
2. PDF/Word vedlagt, sky tillatt og ingen egne data → **Gemini 2.5 Flash** (lange dokumenter).
3. Kode, Docker, Proxmox, Home Assistant, feilmeldinger → **Qwen 3** (eller DeepSeek R1).
4. «Regn ut, hvorfor, forklar, sammenlign, planlegg, budsjett» eller lang melding → **DeepSeek R1** (tenker først).
5. Veldig lang tekst, sky tillatt, ingen egne data → **Gemini 2.5 Flash**.
6. Ellers → **Llama 3.1 8B** lokalt (raskest). Med «Mine data» på holdes alt lokalt.
- Bare installerte modeller (`ollama list`) og sky-motorer med gyldig nøkkel brukes. Svarer ikke valgt modell innen 8 s: neste beste, og det vises i svaret.
- Regler for sky gjelder fortsatt («Spør før sky-modeller får data»).

## Lærer over tid (server)
- Lagre per svar: modell, oppgavetype, tid til første token, tok/s, om brukeren trykket «Prøv igjen» / byttet modell / ga 👍/👎.
- Ukentlig: Glimt justerer rangeringen per oppgavetype (samme som «La Glimt velge» i AI Kontroll, `claude-code-ai-glimt-anbefaler-modeller.md`). Innstillinger → AI og tolkning → Chat viser «Glimt bruker nå: Qwen 3 til kode (raskest og færrest omforsøk)».
