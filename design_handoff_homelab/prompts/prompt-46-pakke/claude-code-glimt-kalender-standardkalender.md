# Kalender: Glimt avviser avtaler med «kalenderen må være Privat eller Familie»

Ønske 2026-10-23: «når jeg prøver å legge til med glimt i kalender får jeg melding at kaleneren må være privat eller familie, det må vere en feil. dem skal som deafult legge i deafult kalender som nå er vel google»
Henger sammen med `claude-code-glimt-intelligent-agent.md` (felles motor og validering).

## Feil
Valideringen for `calendar.create` har en hardkodet liste med lovlige kalendere (`"Privat" | "Familie"`) fra før Google/iCloud/CalDAV ble koblet til. Brukerens standardkalender er nå en Google-kalender, og den er ikke med i listen. Da avviser valideringen avtalen, selv om alt annet er riktig.

## Rett
- **Ingen hardkodet liste.** Lovlige kalendere = de brukeren faktisk har koblet til og kan skrive til (`GET /api/calendar/calendars?writable=1`). Både lokale (Privat, Familie) og eksterne (Google, iCloud, CalDAV).
- **Standard:** Sier ikke brukeren noe om kalender, bruk **standardkalenderen** fra Innstillinger → Kalender → Standardkalender (nå Google). Er ingen valgt: første skrivbare Google-kalender, ellers Privat.
- **Modellen velger ikke kalender** med mindre brukeren nevner den («i familiekalenderen», «på jobb-kalenderen»). Da matches navnet fuzzy mot listen (Familie, familie@…, «Familie (Google)»). Ingen treff → spør: «Hvilken kalender? Privat · Familie · Google» med knapper.
- Feltet heter `calendarId` (id fra listen), ikke et fritt navn. Valideringen sjekker at id-en finnes i listen.
- **Feilmeldinger** skal stemme: skrivebeskyttet kalender → «Kan ikke legge til i “Helligdager”, den er skrivebeskyttet. Legge i Google i stedet?».
- Bekreftelsen viser hvilken kalender det havnet i: «Lagt inn i Google · fre 24. okt 19:00 · Kino».

## Test
- «Legg til kino fredag kl 19» → havner i standardkalenderen (Google), ingen feilmelding.
- «… i familiekalenderen» → Familie.
- Standardkalender endret til iCloud → ny avtale havner i iCloud.
- Google frakoblet → faller tilbake til Privat og sier det.
- Fra Hjem, fra Kalender og fra Glimt-chat: samme resultat.
