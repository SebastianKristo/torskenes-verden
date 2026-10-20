# Bursdager: Glimt leder jenka-tog med trompet og konfetti

Ønske 2026-10-20: «i bursdager, kansje la glimt komme sammen med et jenka tog av andre figurer i siden og spilelr trompet og konfetti når noen har bursdag.»
Fasit: `Bursdager.dc.html` (`partyEl`) + `glimt-figurer.js`. Tweak «feiring»: Automatisk / Vis nå / Av.

## Når
- Vises når minst én person har bursdag **i dag** (samme som «BURSDAG I DAG» i toppkortet). Ellers ingenting.
- Kort rett under toppkortet, 128 pt høyt, kortbakgrunn, 22 pt hjørner.

## Innhold
- Overskrift «Hurra for Emma!» (flere: «Hurra for Emma og Pål!»), Newsreader 20, og «JENKA MED GLIMT» i rød mono til høyre.
- **Jenka-tog** langs bunnen: Stjerne, Gris, Ugle, Boble, Spire (Glimt-figurene, 40 pt) etter hverandre, alle med svart/gul festhatt, og **Glimt først** (50 pt) med festhatt og gul **trompet**. Toget går fra venstre til høyre over kortet på 11 s og starter på nytt.
- Hver figur hopper i takt (0,42 s opp/ned med vipp ±6°), litt forskjøvet bakover i rekka så det ser ut som jenka.
- Trompeten vugger (0,5 s) og sender ut noter ♪ ♫ i appfargene som flyter opp og forsvinner.
- **Konfetti** (30 biter, runde og firkantede, appfargene) faller kontinuerlig og roterer.
- Trykk på kortet starter animasjonen på nytt.

## Detaljer
- Figurene hentes fra `GlimtFigMake` med `noJul` (festhatt i stedet for julelue). Julemodus: behold festhatt.
- Lyd: kort trompetfanfare (1,2 s) **bare** første gang kortet vises den dagen, og bare hvis lyd er på i appen. Ingen lyd i stille modus.
- Redusert bevegelse: toget står stille midt i kortet, ingen konfetti, figurene vinker én gang.
- Samme kort på Hjem-widgeten «Bursdager» når det er bursdag i dag (iOS/Android: statisk versjon med Glimt og trompet + konfetti-bakgrunn), og på web/Mac.
- Ytelse: bruk `transform`/`opacity` (Core Animation / Compose `graphicsLayer`), pause når kortet er utenfor skjermen.

## Uten fanelinje og skanneknapp (2026-10-20)
Ønske: «fjern navbar og scan fra bursdag siden.»
- Bursdager-siden (mobil) viser **ingen fanelinje og ingen flytende skanneknapp**, som Bibel og Huskeliste. Tilbake med «‹ Hjem» øverst og sveip fra venstre kant.
- Bunnmargen på siden reduseres tilsvarende (ingen 110 pt luft til fanelinjen), men behold `safe-area-inset-bottom`.

## Samlet i toppkortet (2026-10-20)
Ønske: «kombiner disse to.» (skjermbilde: `vedlegg/bursdag-kombiner.png`)
- Ikke eget kort lenger. Feiringen ligger **inne i det røde toppkortet** («BURSDAG I DAG»): konfetti faller over hele kortet bak teksten, og jenka-toget går langs bunnen av kortet.
- Kortet får 78 pt bunnmarg når feiringen vises, så «Deretter: …»-linjen ikke dekkes. Svak mørk gradient i bunnen (0 → 14 % svart) så figurene skiller seg fra rødt.
- Konfettifarger tilpasset rød bakgrunn: gul, hvit, mint, lyseblå, fersken, lilla.
- Tekst og tall ligger over animasjonen (z-indeks). Trykk på kortet gjør det samme som før (åpner personen).
- Overskriften «Hurra for …» og «JENKA MED GLIMT» fjernes; toppkortet sier allerede «BURSDAG I DAG» og navnet.
