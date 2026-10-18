# Til Claude Code: Prompt 23 – start her

Les denne filen først. Designet i `design/` er fasit: åpne en `.dc.html` direkte i nettleseren. Der appen eller nettsiden avviker fra designet, er det appen som skal endres.

## Oppgaver (i rekkefølge)
1. **Sveip tilbake på iOS med forhåndsvisning** → `claude-code-sveip-tilbake.md`
   Forrige side skal ligge synlig bak med parallakse. Aldri svart. Android: Predictive Back.
2. **Kvitteringer i Papir + Aksjer nøyaktig kopi** → `claude-code-aksjer-kvitt.md`
   Ta bilde / Bilder / Filer, KØ, Til gjennomgang (rediger, godkjenn, analyser på nytt, slett) og Bokført med angre. Aksjer uten skann-knapp. «Mer» på Finans-undersider åpner Finans → Mer.
3. **Abonnementer (Subscription OS) nøyaktig kopi** → `claude-code-abonnement.md`
   Første kort overlapper toppbildet, ingen dobbel tittel, hold inne og dra for å endre rekkefølgen på kortene, «Endre abonnement»-arket i Papir-farger.
4. **Finn-annonse i appen og på web** (fasit: `Mobil Papir App.dc.html` → Finans → Finn, og `FinansHub v3 Temaer.dc.html` → Finn-handler)
   Trykk på en handel åpner annonsen i appen, ikke på finn.no:
   - bildekarusell
   - tittel og pris
   - Fiks ferdig-steg
   - «Om annonsen» og beskrivelse
   - e-poster fra Proton Mail
   - meldinger med motparten
   Lagre annonsedata og bilder lokalt når handelen opprettes.
5. **Ikoner på fanene i Nyhetsleser** (fasit: `Nyhetsleser.dc.html`)
   Ikon ved hver fane. «✦ La AI velge» eller velg selv i en ikonvelger med søk i Iconify (over 200 åpne sett: Lucide, Material, Phosphor, Tabler, Font Awesome, Heroicons, Fluent …). Cache SVG-ene i backend.
6. **Tidsgrenser for AI-motorer** (fasit: Innstillinger → AI og tolkning → Tidsgrenser)
   - Grense per motor: Gemini 20 s, Groq 15 s, Roboflow 15 s, Ollama 45 s. Kan endres fra 5 til 120 s.
   - Nye forsøk: 0–3.
   - Ved tidsavbrudd: neste motor, lokal OCR eller kø.
   - Backend: `httpx.Timeout` og eksponentiell ventetid. Køen viser hvilken motor som svarte for sent.
7. **Scrollposisjonen huskes**
   Går du inn i en underside (f.eks. Innstillinger → Utseende) og tilbake, kommer du tilbake til samme sted i listen. Nye undersider åpner øverst.
8. **Innstillinger → Integrasjoner → Home Assistant**
   Tilkobling, og «Synk med Home Assistant» (lister ↔ `todo.*`, Synk nå). Samme lagring som i Huskeliste, se `claude-code-huske-ha.md`.

## Filer i pakken
- `prompt-23.md`: brukerens ønsker ordrett, med hva som er gjort i designet
- `claude-code-*.md`: én fil per oppgave (pluss avhengigheter fra tidligere prompter)
- `design/`: alle designfiler + `support.js`

## Fra tidligere prompter (ta med hvis ikke gjort)
Prompt 22: Familie (nøyaktig design), værsiden, standardtema «Lys hovedbok», Huskeliste og HA-synk, sporing og logoer. Prompt 21: avganger, bakgrunnsbilder, Hjem-widgets. Filene ligger i `prompt-22-pakke/` og `prompt-21-pakke/`.
