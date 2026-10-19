# Boliger: åpne kvittering til godkjenning, del med brukere, rediger utgifter

Fasit: `Boliger.dc.html` (vises i `Mobil Papir App.dc.html` og web).

## 1. Trykk inn på kvittering til godkjenning
- I «TIL GJENNOMGANG» er hele toppraden på kortet (miniatyr · butikk · forslag · beløp · ›) trykkbar og åpner detaljarket for utgiften. Også mens AI leser.
- Kategori-chips og «Detaljer»/«Godkjenn» virker som før. Trykk på chips skal ikke åpne arket.

## 2. Del bolig med andre brukere (uten å kunne brukernavnet)
- Tilgang-fanen: kortet heter **Del boligen**.
- **BRUKERE I HOMELAB**: rutenett med alle brukere i systemet som ikke har tilgang ennå: avatar (initial + farge), navn, relasjon (Familie/Mamma/Venn). Trykk for å velge flere, haken vises øverst til høyre.
- **ROLLE**: Eier · Kan laste opp · Kan se (som før).
- Knappen: «Del med Ingrid og Pål» / «Del med 3 personer». Uten valg: e-postfelt «Eller e-post til noen utenfor Homelab» → «Send invitasjon».
- Har alle tilgang: «Alle brukerne har allerede tilgang.»
- API: `GET /api/users?exclude=home:<id>` (navn, avatar, farge, relasjon. Aldri e-post/brukernavn til andre). `POST /api/homes/<id>/members {userIds[], role}`. Mottaker får push «Sebastian delte Hytta med deg».

## 3. Rediger utgifter
- Detaljarket (trykk på en utgift i Oversikt, Utgifter eller Til gjennomgang):
  - **Butikk/beskrivelse**: redigerbart felt i tittelen (serif 26 px, stiplet understrek).
  - **Beløp**: stort felt (34 px) med «kr», desimal med komma.
  - **Dato**: datovelger.
  - Kategori, Del likt, kvittering og Slett som før.
- Endringer lagres fortløpende (debounce 400 ms). `PATCH /api/homes/<id>/expenses/<eid> {merchant, amount, date, category}`. Logg «endret av» i historikken.
- Lukk-knappen øverst er nå felles **Ferdig**-pille (se `claude-code-felles-knapper-ark.md`). Bunnknapp «Godkjenn»/«Lagre» uendret.
