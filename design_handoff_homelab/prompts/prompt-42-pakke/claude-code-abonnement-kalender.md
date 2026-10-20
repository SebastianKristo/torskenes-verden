# Abonnementer: trekkdatoer som egen kalender (også i Kalender-appen)

Fasit: `Kalender App.dc.html` → kalenderen `{k:'ab', n:'Abonnementer', c:'#3d7f8a', src:'Finans'}` og `SUBS` / `AB` i `events()`. Kilde: `Subscription OS.dc.html` (Finans → Abonnementer).

## Hva
- Alle abonnementer i Subscription OS får sine **trekkdatoer** som hendelser i en egen kalender: **Abonnementer** (teal `#3d7f8a`, mørk tekst `#2a5c64`, lys `#8fcdd6`). Kilde-merke «Finans».
- Synes i Kalender-appen (iOS/Android/iPad), Kalender på web og Mac, widgets og Homelab-kalenderen. Den kan slås av/på, få ny farge og skjules fra menyen som de andre.

## Hendelsene
- **Heldagshendelse** på trekkdatoen. Tittel: «Netflix · 149 kr». Med varierende beløp (strøm o.l.): «Strøm (Tibber) · ca. 1 486 kr» (snitt for de 3 siste) eller «· varierer».
- Felt: `kind:'trekk'`, `subId`, `amount`, `currency`, `account` («Trekkes fra Felles konto»), `logo` (fra logobiblioteket).
- **Prøveperiode-slutt:** egen hendelse «Viaplay: prøveperioden slutter · 199 kr fra i morgen», `kind:'trial'` (aldri forvekslet med skoleprøver, se Glimt-fiksen). Rødt merke **PRØVE**.
- **Fornyelse årlig:** «Microsoft 365 fornyes · 1 099 kr» med merke **ÅRLIG**.
- Genereres fra intervall og neste trekk: 12 måneder fram, oppdateres når abonnementet endres, settes på pause eller sies opp (fremtidige hendelser fjernes, og det står «Sagt opp 20. okt» på den siste).
- Helg/helligdag: vis på den faktiske trekkdagen hvis banken flytter den (første virkedag etter), ellers avtaledato.

## Visning i Kalender
- Måned: chip med logo (12 px) + navn. Mange trekk samme dag: «3 trekk · 627 kr».
- Liste/agenda: rad med logo, navn, beløp høyrejustert (Plex Mono), merke **TREKK**.
- Detaljarket: logo, beløp, konto, intervall («Hver måned den 22.»), neste trekk, og knappene **Åpne i Finans ›** (`finans://abonnement/{subId}`) og **Si opp …** (lenke til tjenestens oppsigelsesside hvis kjent).
- Ikke redigerbare i Kalender (kommer fra Finans). Endring skjer i Subscription OS. Arket sier «Endres i Finans → Abonnementer».

## Varsler
- Standard: av for vanlige trekk. På for prøveperioder (2 dager og 1 dag før) og årlige fornyelser (7 dager før).
- Kalender → Innstillinger → Varsler: ny rad **Abonnementer** (Av / Dagen før / Prøveperioder og årlige).

## Glimt
- «Hva trekkes denne uka?», «Når trekkes Netflix?», «Hvor mye går ut i abonnementer i november?» bruker kalenderen (`calendar.search cal='ab'`) og Finans-data. Hurtigvei uten LLM (se `claude-code-finans-glimt-abonnement.md`).
- Oppsummering av uka nevner trekk: «… og 3 trekk på til sammen 627 kr.»

## Backend
- Ingen kopi i Google. Kalenderen er virtuell (`source: 'finans'`) og bygges fra `subscriptions` + `finans_recurring` i `GET /api/calendars/events?cal=ab&start&end`.
- iCal-feed (valgfritt): `https://home.kristo.no/ical/abonnementer.ics?token=…`, så den kan legges til i Apple/Google Kalender.
- Endring i Subscription OS → push `calendar.changed` → Kalender-appen og widgets oppdateres (`WidgetCenter.reloadAllTimelines`).

## Subscription OS
- Hver rad / detaljside får **Vis i kalender ›**, som åpner Kalender på neste trekkdato.
- Innstillinger i Subscription OS: **Vis trekk i Kalender** (på som standard) og hvilken farge.

## Test
- Netflix (22.), Spotify (3.), Viaplay prøveperiode og et årlig abonnement vises riktig de neste 3 månedene i Måned, Liste og widget.
- Si opp et abonnement: fremtidige hendelser forsvinner innen få sekunder på alle enheter.
- Slå av kalenderen i sidemenyen: trekkene skjules, men Glimt kan fortsatt svare.
