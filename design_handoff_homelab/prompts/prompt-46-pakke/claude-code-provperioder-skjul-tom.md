# Skjul «Prøveperioder» når det ikke finnes aktive (mobilappen)

Fasit: `Mobil Papir App.dc.html` (`trwD`, Hjem-kortet h11) og `Subscription OS.dc.html` (`trVals().on`).

## Krav
- **Hjem:** kortet «PRØVEPERIODER» vises bare når det finnes minst én aktiv prøveperiode (ikke avsluttet, sluttdato i dag eller senere). Ingen «INGEN»-tilstand og ingen tom plass.
- **Subscription OS → Abonnementer (mobil):** seksjonen med prøveperioder skjules på samme måte. Den vises igjen mens man legger til en ny.
- I **wiggle-/redigeringsmodus** på Hjem vises kortet fortsatt (så det kan flyttes eller skjules), med teksten «Vises når du har en aktiv prøveperiode».
- Kortet dukker opp av seg selv når en prøveperiode legges til (manuelt, via Glimt «minn meg på å avslutte …», e-post eller import).
- Legge til prøveperiode må fortsatt være mulig uten kortet: via «+»/«Legg til» i Subscription OS og via Glimt.
- Ingen demo-data i produksjon: tom liste = skjult.
- Loggen i Historikk (se `claude-code-subscription-logg.md`) viser fortsatt tidligere prøveperioder.
