# Chat: «Mine data» er på som standard

Ønske 2026-10-20: «ha som standard i chat at den får lov til åbruke mine data, jeg må ikke skru det på i innsltinger.»
Fasit: `Mobil Papir App.dc.html` og `Homelab Papir Web.dc.html` → Chat.

- Innstillingen **Innstillinger → AI og tolkning → «La Chat lese mine data»** er **på** som standard (`ch_data = true` når verdien mangler). Ingen må slå den på.
- «Mine data»-brikken i skrivefeltet er **på** i hver nye samtale (Finans, Kalender, Huskeliste sendes med som kontekst). Du kan slå den av per samtale. Valget huskes for samtalen, ikke globalt.
- Slås innstillingen av, er brikken av og viser «Slått av i Innstillinger → AI og tolkning» ved trykk (som i dag).
- Lokale modeller (Ollama) får dataene uten spørsmål. Sky-modeller (Gemini, Groq) spør fortsatt én gang per samtale hvis «Spør før sky-modeller får data» er på. Den kan slås av i samme meny.
- Migrering: brukere som aldri har rørt innstillingen settes til på. Har noen slått den av med vilje, beholdes av.
- Samme på iOS, Android, web og Mac.
