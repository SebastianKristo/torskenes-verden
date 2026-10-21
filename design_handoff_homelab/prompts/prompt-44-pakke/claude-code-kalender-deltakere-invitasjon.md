# Kalender (web + app): del hendelse med brukere og med andre på e-post

Ønske 2026-10-21: «la i kalender både web og app la meg dele hendelse med fremmede med vanlig epost fra kalender, sendt fra min epost. la meg også legge til andre brukere gi liste over brukere.»
Fasit: `Kalender App.dc.html` (arket Ny / Rediger hendelse) og `Kalender.dc.html` (detaljpanelet).

## UI: seksjon «DELTAKERE» (under Varsel)
- **Brukere i appen** som avatar-piller (Ingrid, Petter, Kari … fra familien/brukerlisten). Trykk = velg/fjern (✓).
- **E-post-felt** «E-post til andre» + **Legg til** (Enter virker). Gyldig e-post sjekkes. Hver ekstern vises som rad: avatar med forbokstav, adresse, status (**Ikke sendt / Invitert / Ja / Kanskje / Nei**), ✕.
- Forklaring: «Brukere i appen får hendelsen i sin kalender. Andre får en vanlig e-post med invitasjon (.ics) sendt fra sebastian@kristo.no …».
- **App:** invitasjonen sendes når du trykker Legg til / Lagre. Toast: «La til «Kino» · … · invitasjon sendt til 3».
- **Web:** rød knapp **Send invitasjon (N)** i detaljpanelet → «✓ Sendt · send på nytt».

## Sending
- **Brukere i appen:** hendelsen legges i deres kalender (`attendees[].userId`), push «Sebastian inviterte deg: Kino · lør 18:00» med Ja / Nei.
- **Eksterne:** ekte e-post **fra brukerens egen adresse**:
  - Google-konto koblet: Gmail API `users.messages.send` (scope `gmail.send`), eller Google Calendar `events.insert` med `attendees` og `sendUpdates=all` (Google sender da fra brukerens adresse).
  - Ellers SMTP fra Innstillinger → E-post (host, port, bruker, app-passord), `From: Sebastian <sebastian@kristo.no>`.
  - Innhold: tekst og HTML + vedlegg `invite.ics` (`METHOD:REQUEST`, `ORGANIZER:mailto:sebastian@kristo.no`, `ATTENDEE;RSVP=TRUE`, UID = hendelses-id). Svar (`METHOD:REPLY`) leses fra innboksen og oppdaterer status.
  - Endring eller sletting sender oppdatert .ics (`SEQUENCE`+1, `METHOD:CANCEL` ved sletting).
- **Brukerliste:** `GET /api/users` (navn, farge, e-post). Vis bare brukere i samme husstand/organisasjon.
- Logg hver sending (til, status, feil) i Docker-loggen.
