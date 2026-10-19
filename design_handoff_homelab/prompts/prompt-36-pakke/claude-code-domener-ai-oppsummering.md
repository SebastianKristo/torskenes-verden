# Domener: AI-oppsummering fra Glimt (mobil + web)

Fasit: `Homelab Domener Papir.dc.html` (brukes både av `Mobil Papir App.dc.html` og `Homelab Papir Web.dc.html`). Metoder: `sumFacts()`, `sumRun()`, `sumLocal()`, `sumVals()`.

## Plassering
- Kort øverst i Domener, under domene- og periodevalget, før statistikken. Vises i Oversikt (mobil: fanen «Oversikt»).
- Gjelder valgt domene, eller **Alle domener** samlet.

## Kortet
- Topp: Glimt-merket (30 px, ringen spinner sakte, og raskt mens den jobber) · «GLIMT · OPPSUMMERING» (Plex Mono, rød) · metalinje · knappen **↻ Lag ny** (pille, 36 px).
- Metalinje: «Daglig · i dag kl. 07:00 · kristo.no» eller «Laget nå kl. 14:32 · Alle domener». Mens den jobber: «Glimt leser statistikken …» og skimmer-linjer.
- Overskrift (18 px, 600): det viktigste. Varsler først (sertifikat < 30 dager, fornyelse < 45 dager), ellers «Rolig døgn …» / «Mer trafikk enn vanlig …».
- 3–4 punkter med farget prikk: grønn = positivt, oransje = nedgang, rød = sikkerhet/varsel, teal = info, grå = nøytral.
  Eksempel: trafikk + endring fra døgnet før · cache + median svartid · blokkerte trusler · neste sertifikat/frist.

## Når den lages
- **Daglig kl. 07:00** (server-cron) for hvert domene + «Alle». Lagres og vises hele dagen. Valgfritt push: «Glimt · Domener: Sertifikatet for x går ut om 12 dager» bare hvis det er noe å gjøre.
- **Manuelt:** «Lag ny» lager en ny oppsummering med en gang (siste 24 t) og erstatter dagens.
- Bytter man domene og det ikke finnes oppsummering for i dag, lages den automatisk.

## AI
- Input til modellen: tall per domene siste 24 t (forespørsler, besøkende, endring %, trusler, cache %, median ms, sertifikat-dager, fornyelse-dager), fra Cloudflare GraphQL Analytics + WHOIS/TLS-sjekk.
- Prompt: «Du er Glimt … Svar KUN med JSON {head, pts:[{t, tone: pos|neg|info|warn}]} med 3–4 punkter.»
- Fallback uten AI eller ved feil: regelbasert tekst (`sumLocal`), samme format.
- Cache: `domain_summary(domain|*, date, created_at, manual, head, points jsonb, model)`.


---
## Oppdatering 2026-10-19: oppsummeringen er skjult bak en knapp med dansende Glimt
Fasit: `Homelab Domener Papir.dc.html` → `sumVals()` (`closed`/`opened`/`dancer`), keyframes `gDance`/`gHop`/`gSumIn`. Figuren kommer fra `glimt-figurer.js` (`F('glimt', 32, 'idle')`, eller valgt figur fra Glimt-innstillingene).
- **Lukket (standard):**
  - Kortet vises ikke. På plassen står en mørk pilleknapp sentrert: `GLIMT  Vis oppsummering av siste døgn` (46 px høy, `#1b1a17`, tekst `#f3efe6`, «GLIMT» i IBM Plex Mono `#e8a593`).
  - **Glimt-figuren (32 px) danser rundt knappen.** Den går rundt utsiden av pillen (topp → høyre → bunn → venstre, 10 s, `ease-in-out`, litt pause i svingene) og hopper/vipper hele tiden (`translateY(-7px)` + ±10°, 0,55 s alternate).
  - Figuren dekker aldri teksten (går 22–24 px utenfor kanten) og har `pointer-events: none`.
  - «Reduser bevegelse»: figuren står stille ved venstre kant og vinker sakte.
- **Åpnet:**
  - Trykk på knappen åpner kortet med `gSumIn` (0,32 s: fade + 6 px ned + 0,98 → 1).
  - Kortet er som før (GLIMT · OPPSUMMERING, overskrift, punkter, «Lag ny»), og har i tillegg en rund **⌃-knapp** (Skjul) som lukker igjen.
  - Er dagens oppsummering ikke laget, startes den ved åpning (skjelett mens Glimt leser).
- Dagens daglige oppsummering lages fortsatt i bakgrunnen kl. 07, så åpning er umiddelbar.
- Åpen/lukket huskes **ikke** mellom besøk. Standard er alltid lukket.
- Gjelder web og mobil (samme modul).


## Oppdatering 2026-10-19 (2): Glimt-knappen ved siden av domene-baren (web)
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.50.05.png`. Den sentrerte knappen med dansende figur er fjernet på web. Knappen sitter nå i samme rad som domene-pillene. Tre varianter (prop `glimtStyle`), standard er **ved siden**:
1. **Ved siden** (standard): mørk pille (50 px, `#1b1a17`) rett til høyre for baren.
   - Til venstre en rund **orb** (38 px, `#f3efe6`) med Glimt-figuren (26 px, vugger) og en **roterende regnbuering** (conic-gradient, maske, 6 s).
   - Tekst «GLIMT» (Plex Mono, `#e8a593`) over «Oppsummering».
   - Oransje prikk når dagens automatiske oppsummering er ny.
2. **I baren:** et eget segment **inni** domene-baren etter en tynn skillelinje.
   - Pille med gradient-kant (regnbue, 1,5 px), figur 22 px i en liten sirkel + «Oppsummering».
   - Hover gir lilla glød.
3. **På kanten:** Glimt-figuren (34 px, «snakker») **sitter oppå** høyre kant av domene-baren og hopper lett.
   - Ved siden av baren står en hvit **snakkeboble** med hale mot figuren: «Dagens oppsummering er klar ›».
   - Trykk åpner.
- Alle varianter åpner oppsummeringskortet (som før, med ⌃ for å skjule).
- På **mobil** beholdes knappen med dansende figur under toppen.
- Bryter raden (smalt vindu), legger knappen seg på neste linje, venstrejustert.
- «Reduser bevegelse»: ingen rotasjon eller hopping.
