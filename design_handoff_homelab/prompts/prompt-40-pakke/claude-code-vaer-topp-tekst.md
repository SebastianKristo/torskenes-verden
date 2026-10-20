# Vær og Yr mot Storm: tekst som kuttes og feil i toppen

Ønske 2026-10-20: «tekst kommer ikke helt fram og feil i toppen» (vedlegg: `vedlegg/vaer-topp-tekst-kuttet.png`, `vedlegg/yr-mot-storm-topp.png`, fasit for toppkortet: `vedlegg/yr-mot-storm-fasit-topp.png`).
Fasit: `Vaer.dc.html` og `Yr mot Storm Design.dc.html` (2a).

## Vær (popup)
### Toppen
- Når man scroller, går kortene under statuslinja. «I dag» og tallene havner oppå klokka.
- Fiks: en **glass-stripe** bak statuslinja + topplinja (by og ✕): tonet himmelfarge `rgba(34,58,92,.62 → 0)` + `blur(18px) saturate(1.3)`, fader ut nederst (mask). Den tones inn samtidig med bynavnet når man har scrollet (samme opasitet), og er usynlig helt øverst.
- Scroll-innholdet får `padding-top` = safe area + topplinje, så første kort aldri starter bak klokka.
- ✕-knappen ligger alltid i topplinja, aldri oppå et kort.

### Tekst som kuttes
- **Glimt · ukas vær:** personlighetsvelgeren (Sky / Ugle / Spire) får **egen rad under tittelen**, full bredde, tre like brede knapper (32 pt høye), uten «…». Tittelen «GLIMT · UKAS VÆR» står alene på raden over.
- **Tre nøkkeltall** (TEMP / NEDBØR / SOL): undertekstene får gå over **to linjer** (`line-height 1.3`) i stedet for å kuttes («mot forrige uke», «forrige: 7,6 mm»). Selve tallet står på én linje.
- Generelt i Vær: ingen `lineLimit(1)` + `truncationMode` på forklarende tekst. Bare titler og tall kan kuttes.

## Yr mot Storm
### Toppen
- Det er ca. 110 pt tom luft over «Yr mot Storm». Tittelen skal starte rett under statuslinja: safe area + 12 pt (som i fasiten, 58 px fra toppen av skjermen i designet).
- «Ferdig» står på linje med tittelen, høyre side.

### Fortegn og etiketter
- Pillen i midten av toppkortet viste «-3°» mens lista viste «+3°» for samme dag. Nå: **ingen fortegn**, bare forskjellen: «Δ 3°». Er de like: «likt». Hvem som er varmest vises med fargen/siden (blå = Yr, oransje = Storm).
- I lista vises avviket som «3°» over søylen, i fargen til den som er høyest. Avrundes til 0 → ingen etikett (aldri «−0°»).
- Kolonneoverskriften viste «YR ← Yr   Storm → STORM» (dobbelt). Nå: «YR · ← Yr varmere · Storm varmere → · STORM». For nedbør og vind: «← Yr mer» / «Storm mer →».
