# Mer (mobil): nytt design med levende kort

Ønske 2026-10-21: «lag slik design for mer» (vedlegg `uploads/Screenshot 2026-10-21 at 11.38.49.png`)
Fasit: `Mer Ny.dc.html` (innhold fylt inn, ikke plassholdere som «[Hendelse]», «[n]», «[Navn]»).

## Oppsett
- Topp: «**Mer** *alle moduler*» (Newsreader 40 + kursiv 16) på toppbildet, søkefelt «Søk i moduler» som flyter over kanten.
- **HVERDAG OG FAMILIE** (mono-etikett): 2 × 2 rutenett av kort (150 pt høye, 22 pt hjørner). Hvert kort: farget ikonbrikke + navn øverst, **levende innhold** nederst:
  - **Kalender:** «Neste» · neste hendelse (Newsreader 22) · «I dag · 15:15».
  - **Gjøremål:** antall åpne (Newsreader 40) · «åpne for familien».
  - **Bursdager:** «Snart» · navn · «om 6 dager».
  - **Familie og kart:** avatarer (overlapper) · «2 av 3 hjemme».
- **VERKTØY:** ett kort med rader (62 pt): ikonbrikke, navn (Newsreader 18), **levende undertekst** (Chat: modeller · Media: «3 lastes ned · neste: Only Murders man» · Domener: «48 597 besøk siste døgn» · Subscription OS: «1 735 kr/mnd · 2 prøveperioder» · Bibel: «Dag 41 på rad · Salme 23» · Nyhetsleser: «12 nye saker»), «›».
- **Innstillinger** nederst som egen rad på `#e9e2d4`.

## Regler
- Aldri vis plassholdere. Mangler data: kort tekst («Ingen hendelser i dag», «Ingen bursdager de neste 30 dagene»).
- Wiggle-redigering som før: flytt kort mellom «Hverdag» og «Verktøy», skjul med «–». Rekkefølge lagres (`papir_mer`).
- Moduler som er slått av, vises ikke. **Søkefeltet «Søk i moduler»** står øverst i Mer også i appen (ikke bare i toppbildet), og filtrerer begge seksjonene på navn og undertekst mens man skriver.
- iPad/Fold: 4 kort i rad og verktøy i 2 kolonner (se `claude-code-stor-skjerm-alle-sider.md`).

## Bare kort (2026-10-21)
Ønske: «la meg også velge i mer om jeg bare vil ha slike kort» (vedlegg `uploads/Screenshot 2026-10-21 at 11.45.31.png`, `… 11.45.44.png`)
- Ved «VERKTØY» står en liten velger **Liste · Kort**. Kort: verktøyene vises som samme kort som Hverdag (2 kolonner, ikon + navn øverst, levende undertekst nederst, min. 120 pt). Liste: som før.
- Valget lagres (`papir_mer_view`) og synkes med profilen. Wiggle-redigering virker i begge.

## Store · Lave kort (2026-10-21)
Ønske: «jeg tenkte i hele at jeg kan velge at ingen store firkant kort vises å gjøre om de til lavere kort» (vedlegg `uploads/Screenshot 2026-10-21 at 11.47.01.png`)
- Ved «HVERDAG OG FAMILIE» (ved Rediger): velger **Store · Lave**. **Lave** (ønske: «jeg tenkte da at de øverste blir slik type kort og at alt blir i den menyen»): ingen firkantkort. Kalender, Gjøremål, Bursdager og Familie blir **rader i samme liste** som verktøyene (ikonbrikke, navn i Newsreader 18, levende undertekst «Neste: Tannlege · i dag 15:15», «10 åpne for familien», «Ingrid om 6 dager», «2 av 3 hjemme»), og overskriften blir «ALLE MODULER». Store: 2 × 2 kort som før.
- Lagres (`papir_mer_tsz`). Kombineres med Liste · Kort for verktøy.
- Ønske: «riktig men ikke vis» (vedlegg `… 11.50.24.png`, `… 11.50.32.png`): i **Lave** vises ikke velgeren Liste · Kort. Alt er liste da.
- Ønske: «fjern den» (vedlegg `… 11.51.54.png`): velgeren **Liste · Kort fjernes helt**. Verktøy er alltid liste. Bare Store · Lave er igjen.
- Ønske: «fjern legg til wiggle redigering» (vedlegg `… 11.52.18.png`): **«Rediger» fjernes**. Hold inne et kort/en rad (480 ms, lett vibrasjon) → alt vipper (wiggle ±1°), hvert element får «–» for å skjule, og «Ferdig» vises der Rediger stod. Trykk åpner ikke modulen mens man redigerer. «Vis N skjulte» nederst henter skjulte tilbake. Skjulte lagres (`papir_mer_hid`). Samme wiggle-oppførsel som Hjem (se `claude-code-wiggle-ios-virker-ikke.md`: ikke tekstmarkering, ikke kontekstmeny).
- Ønske: «legg den i wiggle redigering meny» (vedlegg `… 11.52.31.png`): **Store · Lave vises bare i wiggle-redigering**, ved siden av «Ferdig». Utenfor redigering er raden bare overskriften.
- Ønske: «når liste er valgt ikke vis teksten her» (vedlegg `… 11.55.17.png`, `… 11.55.26.png`): i **Lave** vises ingen overskrifter («HVERDAG OG FAMILIE», «ALLE MODULER»). Lista starter rett under søkefeltet. I wiggle-redigering vises bare raden med Store · Lave og Ferdig.
