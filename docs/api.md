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
