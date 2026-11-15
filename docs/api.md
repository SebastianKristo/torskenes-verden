# <img src="assets/icons/api.svg" width="32" align="top"> API

[← Til README](../README.md)

Alle svar er JSON og alle beløp er i kroner. Feil har formen `{ "error": "melding" }` med en passende HTTP-status.

## Autentisering

| Klient | Hvordan |
|---|---|
| Nettleser | Sesjonscookie fra `POST /api/auth/login` |
| Apper, skript, iOS-snarvei | `Authorization: Bearer fh_pat_…` |

Et token lages i **FinansHub → Innstillinger → Mobil og tilgang**, eller med innlogging fra en app:

```bash
curl -s https://os.dittdomene.no/finans/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"sebastian","password":"…","code":"123456","device":"Skript"}'
# → {"token":"fh_pat_…","user":{"username":"sebastian","role":"admin","name":"Sebastian"}}
# → 401 {"error":"…","needsTotp":true} hvis koden mangler
```

## Eksempler

**Last opp en kvittering** (iOS-snarvei: *Hent innhold fra URL*, metode POST, skjema med felt `file`):
```bash
curl -s https://os.dittdomene.no/finans/api/receipts \
  -H "Authorization: Bearer $TOKEN" -F file=@kvittering.jpg
```

**Månedens sammendrag** (Home Assistant `rest`-sensor, Excel Power Query):
```bash
curl -s https://os.dittdomene.no/finans/api/summary -H "Authorization: Bearer $TOKEN"
```

**Spør AI-søket:**
```bash
curl -s https://os.dittdomene.no/finans/api/search/ai -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"q":"hvor mye brukte jeg på strøm i september?"}'
# → {"answer":"…","hits":[{"type":"tx","txId":123,"description":"Fjordkraft","date":"2026-09-14","amount":-1284,"reason":"…"}]}
```

## Homelab (`/api`, sesjon)

| Metode | Sti | Beskrivelse |
|---|---|---|
| POST | `/api/auth/login` | `{username,password,remember}` → `{ok}` eller `{needsTotp,ticket}` |
| POST | `/api/auth/totp` | `{ticket,code,remember}` |
| POST | `/api/logout` | Logg ut og pause enheten |
| GET | `/api/me` | Innlogget bruker |
| GET / POST | `/api/users` | Liste over brukere, eller ny bruker (admin) |
| PATCH / DELETE | `/api/users/:id` | Endre rolle, passord, navn eller nullstille 2FA, eller slette (admin) |
| POST | `/api/auth/totp/setup` · `/verify` · `/disable` | Oppsett av 2FA |
| PUT | `/api/password` | Bytt passord |
| GET / DELETE | `/api/devices`, `/api/devices/:id` | Pålitelige enheter |
| GET / PUT | `/api/prefs`, `/api/ui` | Innstillinger per bruker (layout, topplinje, nyhetsbar, sidemeny) |
| GET / PUT | `/api/config` | Integrasjoner (admin). Hemmeligheter returneres aldri. |
| GET | `/api/state` | Alt dashboardet trenger ved oppstart |
| GET | `/api/ruter` · `/weather` · `/school` · `/trading` · `/energy` · `/health` · `/upcoming` · `/news` | Widgetdata, cachet på serveren |
| GET | `/api/space/tle` · `/space/apod` · `/space/gallery/:key` | Rom-fanen |
| CRUD | `/api/grades`, `/api/tests` | Studie |
| GET / PUT / DELETE | `/api/cv` | CV-en. Lesing er offentlig, endring krever admin. |
| GET | `/healthz` | `ok` |
| POST | `/api/dates/parse` | `{text, now?}` → `{date, time, end, allDay, rest, label, today, dateText, timeText, errors}`. Den felles datotolkeren (Q17). Sesjon eller app-token |
| GET | `/api/dates/holidays?year=` (eller `?from=&to=`) | `{from, to, items:[{date, name, type:'helligdag'\|'merkedag', fri}]}` (Q18) |

### Regler serveren eier (Fase 2)

Klientene viser det serveren sender og regner ikke selv (fasit i `shared/testvektorer/`):

- **Datoer:** `POST /api/dates/parse`. «I dag» er alltid Oslo-datoen (`today` i svaret).
- **Neste trekk** (`/finans/api/subscriptions`): send `cycle` (`weekly`, `biweekly`, `monthly`, `quarterly`, `halfyearly`, `yearly`, `biennial`), `chargeDay`/`billDay`, `billMonth` og gjerne `startDate` (et kjent trekk). Serveren regner `nextDate`. En `nextDate` fra klienten brukes bare som anker når trekkdag mangler, og erstattes hvis den ikke stemmer med syklusen. Eksplisitt manuell overstyring: `nextDateManual: true`. `GET /subscriptions` har `cycles[]`, og hvert abonnement har `monthly`, `yearly`, `perLabel` og `cycleName`.
- **Betalt siste 12 mnd** (`GET /subscriptions/log`): `summary.paid12m` og `summary.paid12mText`, med prøver som gikk over til betalt (Q21).
- **Prøveperioder:** tolkes på serveren (`POST /subscriptions/trials/parse`). Varselplanen står i `notifications[]` (`{key, dedupeKey, kind, at, title, body}`, `at` i UTC) på prøven og i `GET /api/widgets/trials`. Appene planlegger bare den kopien og dedupliserer mot push med `dedupeKey`.
- **Bolig «brukt»** (`GET /finans/api/folders/:id`): `spent`, `pending: {count, amount, text:'venter: X kr'}`, `months[].spent`/`.pending`, `kpi.spentByMonth[]`, `kpi.budgetLeft` (fra `spent`) og `kpi.over`. Poster til gjennomgang og kvitteringer som leses, er ikke «brukt» (Q21).
- **Helligdager og merkedager:** `GET /api/dates/holidays` og kalenderen «Helligdager» (`type` på hendelsen).

## Moduler (`GET /api/moduler`, sesjon eller app-token)

Én modulliste for web, iOS, Android og klokka (Fase 6, E-ia §4 og Q1–Q12). Kilden er
[`shared/schemas/moduler.json`](../shared/schemas/moduler.json), kontrakten er `shared/schemas/api/moduler.schema.json` og
eksempelet `shared/schemas/eksempler/moduler.json`. Klientene lager menyer, Mer, «Alle sider», fanelinje-redigering, søk og
titler fra lista i stedet for å ha egne lister.

`GET /api/moduler[?plattform=web|ios|android]` gir bare modulene brukeren har tilgang til: `adminOnly`-moduler bare for admin,
moduler med `tilgang` (Media, Bibel) bare når brukeren har den. Med `plattform` kommer bare modulene som finnes der. Brukerens
eget valg (rekkefølge, skjulte faner, egne navn) ligger i layouten (`/api/me/layout`), ikke her.

| Felt | Hva |
|---|---|
| `versjon` | Versjonen av lista. Øker når et felt endrer betydning |
| `grupper[]` | `{id, navn}` i fast rekkefølge: I dag, Hjemme, Tid, Ute, Økonomi, Fritid og læring, Verksted, Drift. Bare grupper med moduler |
| `toppmeny[]` | Modul-id-ene som står fast i toppmenyen på desktop (Q6). Resten ligger under «Alle sider ▾» |
| `bunnmeny[]` | Fanene i bunnmenyen på mobil (web), i tillegg til «Mer» |
| `moduler[].id` | Fast id, lik på alle plattformer (`oversikt`, `smarthjem`, `gjoremal`, `reise`, `okonomi` …). Innstillingssiden for modulen har samme id |
| `moduler[].navn` | Navnet i UI (Q1–Q12, se [ordlisten](ordliste.md)) |
| `moduler[].gruppe` | Id i `grupper` |
| `moduler[].ikon` | `{tegn, sf, material}`: tegn til web og reserve, SF Symbol (Apple) og Material Symbols-navn (Android) |
| `moduler[].plattformer[]` | `web`, `ios`, `android` |
| `moduler[].adminOnly` | Bare for admin |
| `moduler[].tilgang` | Valgfri: `media` eller `bibel` (egen tilgang) |
| `moduler[].type` | Valgfri: `ark` = åpnes som ark over siden (Brief, Nyheter). Ellers en side |
| `moduler[].rute` | Adressen på web (`#/…`, eller `/finans/` for Økonomi). `null` = finnes ikke på web |
| `moduler[].aliaser[]` | Gamle adresser som videresendes til `rute` (`#/dash` → `#/oversikt`, `#/huskeliste` → `#/gjoremal` …) |
| `moduler[].undersider[]` | `{id, navn, kort?, type, rute, aliaser?}`. `type`: `fane` (egen fane i modulen), `visning` (f.eks. Kalenderens År … Liste) eller `filter` (Kalenderens Familie, Bursdager, Skole). `kort` er navnet der plassen ikke strekker til |
| `innstillinger[]` | Sidene i Innstillinger i fast rekkefølge, `{id, navn, beskrivelse, adminOnly?, aliaser}`: Konto og sikkerhet, Utseende, Varsler, Husstand, Glimt og AI, Tilkoblinger, Moduler, Enheter og widgets, Server |

Integrasjonene grupperes én gang, i [`shared/schemas/tilkoblinger.json`](../shared/schemas/tilkoblinger.json) (O8):
`group` og `category` i `GET /api/integrations` og `category` i `GET /api/config` er gruppenavnet derfra (Smarthjem,
Kalender og e-post, Media, Økonomi, Reise og pakker, AI, Varsler, Nettverk, Generelt).

## FinansHub (`/finans/api`)

| Område | Endepunkter |
|---|---|
| Innlogging | `POST /login`, `POST /auth/token` (alias), `POST /auth/logout`, `GET /me` |
| Oversikt | `GET /bootstrap`, `GET /summary`, `GET /reports` |
| Transaksjoner | `GET/POST /transactions`, `PATCH/DELETE /transactions/:id`, `GET /transactions.csv` |
| Kvitteringer | `GET/POST /receipts` (flere filer), `GET /receipts/jobs`, `GET/PATCH/DELETE /receipts/:id`, `…/file`, `…/thumb`, `POST …/book`, `…/reject`, `…/reprocess` |
| Budsjett og faste | `PUT /budgets`, `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`, `POST /recurring/detect` |
| Kontoer og mål | `POST /accounts`, `PATCH/DELETE /accounts/:id`, `POST /goals`, `PATCH/DELETE /goals/:id` |
| Kategorier og regler | `POST /categories`, `PATCH/DELETE /categories/:id`, `POST /rules`, `PATCH/DELETE /rules/:id`, `POST /rules/apply` |
| Import | `POST /import` (forhåndsvisning, `?commit=1` lagrer), `POST /import/csv` |
| AI | `POST /search/ai`, `GET /search/suggestions`, `GET /health/ai` |
| Aksjer | `GET /stocks`, `POST /stocks/sync`, `PUT /stocks/config` |
| Abonnementer | `GET/POST /subscriptions`, `POST /subscriptions/receipts`, `PATCH/DELETE /subscriptions/:id` |
| Delte mapper | `GET/POST /folders`, `GET/PATCH/DELETE /folders/:id`, `…/members`, `…/entries`, `…/receipts`, `…/projects`, `…/installments/:iid/pay`, `…/bills` |
| Finn | `GET/POST /finn`, `PATCH/DELETE /finn/:id` |
| Tokens | `GET/POST /tokens`, `DELETE /tokens/:id` (`{name,scopes,expires:'30d'\|'90d'\|'1y'\|'never'}`) |
| Innstillinger | `PUT /settings`, `GET/PUT /prefs`, `GET /users` |
| Backup | `GET /backup`, `GET /backup/export?format=json\|xlsx\|csv`, `PUT /backup/smb`, `POST /backup/smb/test`, `POST /backup/run`, `GET /backup/list`, `POST /backup/stage`, `POST /backup/restore`, `POST /firstrun` |
| Diverse | `GET /logo/:domain` (offentlig), `GET /export.json`, `POST /demo`, `DELETE /all` |

## Hjem, Matplan og Domener (admin)

Godtar en sesjon eller et Bearer-token. Lesing krever `finance:read`, endring krever `finance:write`.

| Modul | Endepunkter |
|---|---|
| Hjem | `GET/PUT /home/api/property`, `GET/POST /home/api/inventory`, `PATCH/DELETE /home/api/inventory/:id` |
| Matplan | `GET /mat/api/week?start=`, `POST /mat/api/plan {scope,date}`, `PATCH /mat/api/day/:date`, `POST/DELETE /mat/api/meals`, `PUT /mat/api/cooks`, `PUT /mat/api/auto`, `POST /mat/api/hellofresh`, `POST /mat/api/shopping`, `POST /mat/api/shopping/:id/toggle`, `POST /mat/api/calendar/rotate` |
| Kalender | `GET /mat/calendar.ics?key=…` (ingen innlogging, bare nøkkelen) |
| Domener | `GET/POST /domains/api/domains`, `DELETE /domains/api/domains/:id`, `GET /domains/api/:name/analytics?range=1h\|24h\|today\|7d\|30d\|90d\|1y`, `GET /domains/api/:name/live` |
