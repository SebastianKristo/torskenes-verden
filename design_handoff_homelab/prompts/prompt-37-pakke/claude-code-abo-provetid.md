# Subscription OS: vis gratis prøveperioder

Ønske 2026-10-20: «vis gratis prøveperioder i abonnementer.»
Fasit: `Subscription OS.dc.html` (mobil) → kortet **GRATIS PRØVEPERIODER** øverst på Oversikt (`trVals()`, `trList()`). Data deles med Hjem-widgeten og påminnelsene via `papir_trials` (samme format), og oppdateres live (storage-event).

- **Kortet** (øverst, før AI-sparing):
  - Tittel «GRATIS PRØVEPERIODER · 3» (oransje mono) + **+ Legg til**.
  - Én rad per aktiv prøve, sortert etter færrest dager igjen:
    - logo (favicon/merkevare), navn og «Slutter fre 24. okt · deretter 149 kr/mnd»
    - **stort tall** med dager igjen: rød ≤ 2, gul ≤ 7
    - fremdriftslinje
    - **Avslutt nå ↗** (åpner tjenestens oppsigelsesside og markerer prøven som avsluttet)
    - **Behold · legg til** (gjør prøven til et vanlig abonnement med pris og trekkdato = sluttdato)
    - «Varsel tor 23. okt» (dagen før)
- **+ Legg til:** tjeneste, sluttdato, pris etterpå → **Legg til · påminn dagen før** (lager varsel kl. 09:00 dagen før + morgenen samme dag).
- **Tom:** «Ingen aktive prøveperioder. Legg til en, så minner Glimt deg på å avslutte i tide.»
- Prøver vises også i abonnementskalenderen (stiplet ramme på sluttdatoen) og i totalen som «+149 kr/mnd hvis du beholder».
- **Web:** samme kort i høyre kolonne på Oversikt (over AI-sparing). Tabellen får egen gruppe «Prøveperioder» øverst.
- Glimt: «Påminn meg om å avslutte Viaplay-prøven» (Hjem-søk) havner her. AI-oppdaget prøve fra e-post/skjermbilde («gratis i 14 dager») blir foreslått med **Legg til**.
- Behold/avslutt lagres i historikken (`res: 'beholdt'|'avsluttet'`). AI-sparing teller avsluttede prøver som «spart».


## Wiggle-redigering på Oversikt (som Hjem og Mer)
Fasit: `Subscription OS.dc.html` → `soVals()` (`a`, `d`, `hide_*`, `add`, `hid`), keyframes `soWigA/B`.
- **Hold inne et kort i 450 ms** for å starte. Kortene **vugger** (±0,6°, 0,6 s, annenhver retning) og får en stiplet ramme.
  - Kortene: Gratis prøveperioder, AI-sparing, Neste trekk, Sjekk og Kommende trekk.
- **−** oppe til venstre på hvert kort **skjuler** det.
- **Verktøylinje** (sticky øverst, som Hjem):
  - **＋**, med rødt tall for skjulte kort. Åpner arket «Legg til kort» med skjulte kort og grønn ＋ for å vise dem igjen.
  - «Dra for å flytte · − for å skjule» · **Tilbakestill** (rekkefølge + skjulte) · **Ferdig**.
- Flytting har samme krasjfiks som Hjem: bytt bare i midtre 30 % av målet, maks hver 140 ms, lagre ved slipp (se `claude-code-wiggle-krasj-ios.md`).
- Lagring: `sub_home_order`, `sub_home_hid` (per bruker).

## Delte abonnementer (f.eks. Starlink)
Ønske 2026-10-20: «la folk også dele abonnementer, som Starlink er et felles abonnement.»
Fasit: `esh` (redigeringsarket) og `mv()` (rader). Starlink (1 200 kr/mnd) er lagt til som eksempel, delt med Ingrid og Pål.
- **Redigeringsarket** har seksjonen **Del med husstanden**:
  - Husstandens brukere som chips med avatar. Du selv er alltid med.
  - Når abonnementet er delt: **Del likt** / **Jeg betaler**.
  - Hint: «Hver betaler 400 kr/mnd. Alle ser abonnementet, trekkdato og varsler. Bare din del teller i ditt budsjett.»
- **Rader** viser små avatarer etter navnet og en grønn linje: «Delt · din del 400 kr/mnd».
- **Totaler og budsjett** bruker **din del** (lik deling = pris / antall; «jeg betaler» = hele beløpet hos betaleren, 0 hos de andre).
- **Data:**
  - `subscription_members {sub_id, user_id}` og `split: equal|payer`, `payer_id`.
  - Alle medlemmer ser abonnementet i sin liste, kalender og varsler. Bare eier og betaler kan endre pris og si opp. Medlemmer kan forlate abonnementet.
- **Varsler:** «Starlink trekkes i morgen · din del 400 kr». **Vipps-forespørsel** (valgfritt): betaleren kan sende «Be om andel» til de andre.
- Andres private abonnementer vises aldri.
