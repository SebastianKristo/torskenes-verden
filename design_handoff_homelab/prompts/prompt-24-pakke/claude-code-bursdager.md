# Til Claude Code: Bursdager (web + iOS + Android) med Google Kalender og Home Assistant

Fasit: `design/Bursdager.dc.html`. Appen bruker `variant="mobile"` under Mer → Bursdager, og nettsiden `variant="web"` som fanen «Bursdager». Papir-tokens som resten av appen, og samme utseende på iOS og Android.

## Skjerm
1. **Neste bursdag** (rødt kort): navn, «Fyller 41 · lørdag 2. november», dager igjen (stort tall) og «Deretter: …» med de to neste. Flere på samme dag: «Ingrid og Rune». Er det i dag: «BURSDAG I DAG».
2. **Søk** og **«+ Legg til»**.
3. **Ny / rediger bursdag:** navn, dag, måned, år (valgfritt, gir alder), Hvem (Familie · Venn · Jobb · Annet, som gir avatarfarge), påminnelse (samme dag · 1 dag før · 1 uke før · ingen) og **Lagre i** (Google Kalender / Home Assistant / Bare her).
4. **Liste:** «NESTE 30 DAGER», deretter én gruppe per måned i rullerende rekkefølge. Hver rad viser:
   - avatar (Familie-profilbilde hvis det finnes)
   - navn, og under «2. nov · fyller 41 · Familie»
   - «om 15 d», i rødt når det er 7 dager eller mindre
   - kildemerke: GOOGLE, HOME ASSISTANT eller LOKAL

   Trykk på raden utvider den: full dato, fødselsår, påminnelse, «Åpne i Google Kalender», Rediger og Slett (to trykk).
5. **Kalendere:**
   - **Google:** Logg inn med Google, velg kalender, «Skriv nye bursdager til Google», «Hent bursdager fra Google-kontakter», Synk nå og Logg ut.
   - **Home Assistant:** velg `calendar.*`, Importer og «Synk to veier».

## Google Kalender
- OAuth 2.0 med PKCE. Web: Google Identity Services. iOS: GoogleSignIn. Android: Credential Manager + AuthorizationClient.
- Scope: `https://www.googleapis.com/auth/calendar.events`, pluss `calendar.readonly` for kalenderlisten.
- Refresh-token lagres kryptert i backend (`user_integrations`), aldri i klienten.
- **Les:** `GET /calendar/v3/calendars/{id}/events?singleEvents=true&timeMin=nå&timeMax=+13 mnd&eventTypes=birthday&eventTypes=default`.
  - Bursdager fra kontakter har `eventType=birthday` (`birthdayProperties`), eller ligger i kalenderen `addressbook#contacts@group.v.calendar.google.com`.
  - Navnet tolkes fra `summary` («Ingrids bursdag» → «Ingrid»).
- **Skriv:** heldagshendelse:
```json
{"summary":"Ingrid – bursdag","start":{"date":"2026-11-02"},"end":{"date":"2026-11-03"},
 "recurrence":["RRULE:FREQ=YEARLY"],"reminders":{"useDefault":false,"overrides":[{"method":"popup","minutes":1440}]},
 "extendedProperties":{"private":{"homelab_id":"…","birth_year":"1985"}}}
```
  Rediger og slett via samme `eventId`.
- **Synk:** inkrementelt med `syncToken` hvert 15. minutt og ved pull-to-refresh. Bruk `events.watch` (webhook) hvis backend kan nås fra internett.

## Home Assistant
- Kalenderliste: `GET /api/calendars`. Les: `GET /api/calendars/{entity_id}?start=…&end=…`.
- Skriv (to veier): `calendar.create_event` `{entity_id, summary, start_date, end_date, rrule}`. Lokal kalender støtter `rrule`. For andre kalendere: lag årets og neste års hendelse.
- Slå sammen duplikater mot Google (samme navn og dato).

## Data og varsler
- `birthdays(id, user_id, name, month, day, year?, relation, reminder_days, source, google_event_id?, ha_uid?, person_id?)`. Kobles til en Familie-person når navnet matcher.
- Push-varsel kl. 09:00, N dager før. Ny varselkategori «Bursdager» i Innstillinger → Varsler.
- Valgfritt: Hjem-widget og telefon-widget «Bursdag snart».

## Widgets
- **Hjem i appen:** widget «BURSDAGER · NESTE» med de tre neste (avatar, navn, «2. nov · fyller 41», «om 15 d» i rødt når det er 7 dager eller mindre) og «alle ›». Den kan flyttes og skjules som de andre Hjem-widgetene (hold inne og dra).
- **iOS (WidgetKit):**
  - `systemSmall`: «NESTE BURSDAG», dager igjen stort, navn og «Fyller 41 · 2. nov».
  - `systemMedium`: de tre neste.
  - `accessoryRectangular` (låseskjerm): neste navn og dager.
  - Timeline oppdateres ved midnatt og når data endres (`WidgetCenter.reloadAllTimelines()`). Data deles via App Group. Trykk har dyplenke `homelab://bursdager`.
- **Android (Glance AppWidget):** Material You-farger (dynamiske), header «Bursdager» med + (åpner «Ny bursdag»), og de tre neste som piller. Oppdateres med `WorkManager` daglig kl. 00:05 og ved endring.
- Fasit for utseende: seksjonen «WIDGETS PÅ TELEFONEN» i `Bursdager.dc.html`.

## Test
- Logg inn med Google: bursdager fra kalender og kontakter vises med merket GOOGLE.
- Legg til «Henrik 19. okt 1988» med «Lagre i Google»: blir en årlig heldagshendelse i Google Kalender.
- Importer fra HA: bursdagene vises med HOME ASSISTANT, uten duplikater.
- Slett i appen: hendelsen slettes også i kilden.
