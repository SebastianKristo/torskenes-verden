# Chat: svar med kort for vær, kalender m.m.

Fasit: `Mobil Papir App.dc.html` → `chToolRun()` + `chCardVals()`. Prøv i Chat: «hvordan er været?», «blir det regn i morgen?», «hva skjer i dag?», «hva har jeg i morgen?».
Vedlegg: Apple Intelligence svarer «It's currently clear and 8°C.» med et blått vær-kort under.

## Oppførsel
- Før LLM: System-AI ruter spørsmålet til et verktøy (vær, kalender, avganger, pakker, finans, huskeliste). Svaret er **én kort setning + et kort** under. Verktøy-chip øverst («Vær», «Kalender»). Status: «Verktøy · 0,6 s».
- Kortet er trykkbart og åpner modulen (Vær-fullskjerm, Kalender på riktig dag).

## Vær-kort
- Maks 420 px, radius 22. Bakgrunn etter vær: klart/lettskyet = blå `#134a86 → #4b7fb5 → #8eaed0`, regn/overskyet = grå `#4b5868 → #8c97a6`, natt = `#0e1a33 → #2b3a5c`.
- Venstre: «Oslo ➤» (valgt sted, pil = posisjon), temperatur 44 px tynn. Høyre: værsymbol, beskrivelse, «H:9° L:5°».
- Under (samme kort, lys stripe): 6 timer: «Nå 8° ☀️ · 17 · 18 …». «I morgen» viser hver 3. time.
- Tekst over: «Det er klart og 8 °C i Oslo.» + «Ta med paraply» hvis ≥ 50 % nedbør.
- Data: samme kilde som Vær-modulen (MET/Yr for valgt sted).

## Kalender-kort
- Topp: lite kalenderikon (rød stripe med ukedag «MAN», dato) · «I dag» / «I morgen» · «19. oktober · 2 hendelser» · ›.
- Liste: farget strek (kalenderfarge) · tid (mono, «Hele» for heldag) · tittel.
- Tekst over: «I dag har du 2 ting i kalenderen. Første er Hente pakke kl. 16:30.» Tom: «I dag er kalenderen tom.»
- Data: `GET /api/calendar?date=…` (alle synlige kalendere).

## Andre kort (samme mønster)
- Avganger: linjenummer-merker + minutter. Pakker: status + fremdrift. Finans: sum + 3 største poster. Huskeliste: avkryssbare punkter direkte i kortet.
- Kort lagres i meldingen (`card: {k, …}`) så de vises igjen i historikken. «Kopier» kopierer bare teksten.
