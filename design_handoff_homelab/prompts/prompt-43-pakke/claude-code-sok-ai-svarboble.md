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


## Dra ned på pillen → Chat med meldingen (2026-10-21)
Ønske: «og slike ai meldinger jeg vil også kunnne sveipe ned på pillen for å åpne chatten med meldingen.» (vedlegg `uploads/Screenshot 2026-10-21 at 10.55.54.png`)
Fasit: `Mobil Papir App.dc.html` → `hs.swD/swM/swU` + `chFromAns()`.
- Dra svarboblen (eller den lille pillen nederst) **ned**: den følger fingeren med motstand etter 70 pt, lett haptikk når grensen nås, og teksten «Slipp for å åpne i Chat» vises. Slipp etter 70 pt → boblen vokser til fullskjerm og Chat åpnes.
- **Samtalen åpnes med meldingen**: ny samtale med spørsmålet og **det samme svaret** som i boblen (inkl. fet tekst og kilde, f.eks. «Kilde: MET Norway»). Ingen ny AI-forespørsel, ikke spør på nytt. Fortsett å skrive under.
- Er svaret ikke ferdig ennå (boblen tenker), sendes spørsmålet til Chat som før.
- «Fortsett i Chat ›» gjør det samme.
- Dra **opp** lukker boblen som før. Under 70 pt ned → spretter tilbake.
- iOS: `DragGesture` på boblen, `matchedGeometryEffect` til Chat. Android: `Modifier.draggable(Orientation.Vertical)` + delt element-overgang.
