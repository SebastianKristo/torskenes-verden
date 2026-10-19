# Søkefeltet (System-AI): svar i en boble under feltet, spør om været

Fasit: `Mobil Papir App.dc.html` → Hjem → søkefeltet → `hsAsk()`. Prøv: «blir det regn i dag?», «trenger jeg paraply?», «hvor varmt er det i morgen?».
Vedlegg: Apple Intelligence-svar i en mørk glassboble øverst på skjermen, med det viktigste uthevet i fet skrift.

## Oppførsel
- Med System-AI valgt og Enter: **ikke hopp til Chat**. Svaret vises i en **boble rett under søkefeltet** på Hjem.
  - Timer («time hos …») legges fortsatt rett i kalenderen (uendret).
- Boble: mørk glass `rgba(22,20,18,.78)` + `blur(30px) saturate(1.5)`, radius 26, innerkant 10 % hvit, skygge. Tekst 17 px, lys `#f6f2ea`. **Det viktigste i svaret er fet og hvit** (AI markerer med `**…**`).
  - Mens den tenker: animert AI-logo + «Tenker på «spørsmålet» …».
  - Bunn: kilde («✦ Open-Meteo · MET Norway» / «✦ System-AI») + glass-pille **Fortsett i Chat ›** (åpner ny samtale med spørsmålet).
  - Trykk på boblen eller et nytt søk lukker den.
- Plassholder: «Spør om været, eller skriv «time hos …»».

## Vær og «live»-spørsmål
- Gjenkjenn vær-intensjon (vær, regn, paraply, grader, temperatur, snø, vind, kaldt/varmt, i dag / i morgen). Hent fra samme kilde som Vær-modulen (MET/Yr for valgt sted, fallback Open-Meteo) og svar uten LLM:
  - «Trenger jeg paraply?» → «I dag er det 70 % sjanse for nedbør i Oslo. **Ta med paraply.** 5–9°.»
  - «Hvor varmt er det?» → «Det er **8° og lettskyet** i Oslo nå, vind 3 m/s. I dag 5–9°.»
  - «I morgen» → dagens prognose for i morgen.
- Andre verktøy på samme måte (rutet av System-AI før LLM): kalender («hva skjer i morgen?»), avganger («når går 45?»), pakker, finans («hva har jeg brukt på mat?»), huskeliste. Svaret er alltid én–to setninger + uthevet nøkkelinfo.
- Ellers: lokal modell (Ollama) med systemprompt «Svar på norsk i maks to korte setninger. Marker det viktigste med **…**». Timeout 12 s → «Fortsett i Chat».
- Backend: `POST /api/assist {q}` → `{text, bold, source, intent, chatContext}`.
