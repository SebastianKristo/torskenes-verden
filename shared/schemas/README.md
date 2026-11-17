# API-kontrakten (`shared/schemas`)

JSON Schema (draft 2020-12) for svarene klientene (web, iOS, Android, widgets, klokka) bruker. Serveren er fasit for
reglene; klientene viser det serveren sender. Kontraktversjonen står i `GET /api/version` (`contract`), og `minClient`
der sier hvilken appversjon serveren fortsatt svarer riktig for (Q19).

| Fil | Hva |
|---|---|
| `common/error.schema.json` | Feil – alle svar med status 400–599 fra `/api/*` og `/finans/api/*` |
| `common/types.schema.json` | Felles typer i `$defs`: `date`, `month`, `timestamp`, `epochMs`, `ore`, `kroner`, `money`, `page`, `id`, `color`, `ok` |
| `api/*.schema.json` | Ett skjema per endepunkt. `x-endpoint` sier hvilket |
| `endpoints.json` | Endepunktene som har skjema, med innlogging. Kontrakttesten går gjennom denne |
| `moduler.json` / `moduler.schema.json` | Modullisten for alle plattformer (Fase 6). Serveren leverer den per bruker på `GET /api/moduler` (`api/moduler.schema.json`), se `docs/api.md` |
| `tilkoblinger.json` / `tilkoblinger.schema.json` | Én gruppering av integrasjonene (gruppen i `/api/integrations` og `/api/config`) |
| `receipt*.schema.json` | Kvitteringsformatet og OCR-formatet (prompt 48, brukt av server og apper) |

Testen `test/kontrakt-schemas.test.js` starter serveren med eksempeldata (`MOCK_DATA=1`, samme app som
`test/e2e/server.mjs`), henter hvert endepunkt i `endpoints.json` med økt og med app-token, og validerer svaret.
Validatoren er `test/lib/json-schema.mjs` (ingen avhengigheter, en delmengde av 2020-12; utvid den hvis et skjema trenger
mer). Kjør `npm test`.

## Konvensjoner

**Feil.** `{error, code}` + ev. egne felt. `error` er norsk tekst som kan vises. `code` er `SNAKE_CASE`.

| Status | `code` | Når |
|---|---|---|
| 400 | `BAD_REQUEST` (eller rutens egen) | Ugyldig kropp/parametre |
| 401 | `HOMELAB_AUTH` + `reason: none\|invalid` | Ikke innlogget, eller ukjent token. Appen logger ut |
| 401 | `TOKEN_EXPIRED` + `reason: expired` | App-tokenet er utløpt (180 dager uten bruk, Q23). Behandles som `HOMELAB_AUTH` |
| 401 | `LOGIN_FAILED` | Feil passord/kode ved innlogging (`/api/login`, `/finans/api/login` …) |
| 401 | `SESSION_REQUIRED` | Funksjonen krever nettleserøkt (gyldig app-token) |
| 403 | `FORBIDDEN` (eller rutens egen) | Innlogget, men ikke tilgang |
| 404 | `NOT_FOUND` | Ukjent sti eller ressurs – alltid JSON, aldri ren tekst |
| 429 | `RATE_LIMITED` | For mange forsøk |
| 500 | `INTERNAL_ERROR`, `error: 'Intern feil'` | Uventet feil. Aldri stack eller detaljer |
| 502/503/504 | `UPSTREAM_ERROR` / `UNAVAILABLE` / `UPSTREAM_TIMEOUT` | Tjenesten bak svarer ikke |

Mellomvaren `server/http/errors.js` sørger for formen i etterkant, så nye ruter trenger bare `c.json({error}, status)`.
Eldre koder med små bokstaver (`not_found`, `expired`, `bilde_mangler` …) sammenlignes av klientene i dag og beholdes til
klientene er flyttet (Fase 3–5). `LEGACY_CODES` i `errors.js` viser hva hver blir. Nye koder skal være `SNAKE_CASE`
(testen `test/http-errors.test.js` passer på det).

**Dato.** `YYYY-MM-DD`, alltid Oslo-datoen (Q20). Måned `YYYY-MM`. Heldagshendelser har `start`/`end` som dato
(`end` eksklusiv).

**Tidspunkt.** ISO 8601 med sone (`2026-11-15T09:30:00.000Z`). Nye felt heter `…At` (`expiresAt`, `generatedAt`).

**Penger.** Lagres alltid som heltall i øre. Nye felt sendes i øre med navnet `…Ore` (`amountOre`, `priceOre`), eller som
`money` = `{ore, kroner}`. `kroner` = `ore / 100`, bare til visning. Tall vises som `1 234,56` og minus som `−` (UI).

**Lister.** Lange lister pagineres med `{items, nextCursor}` (`page`); `nextCursor` er `null` på siste side, ellers sendes
den som `?cursor=`. Eldre lister er `{items}` eller en ren tabell.

**Felt legges til, ikke fjernes.** Et felt fjernes eller endrer betydning bare sammen med en høyere `minClient` i
`/api/version`. Skjemaene krever bare feltene klientene faktisk bruker (`required`), og tillater ekstra felt.

## Kjente avvik (dagens svar)

Disse er dokumentert, ikke rettet, fordi klientene leser dem slik i dag. De nye feltene ved siden av er de som skal brukes
fra Fase 3–5.

| Avvik | Hvor | Nytt felt ved siden av |
|---|---|---|
| `createdAt`/`updatedAt` er ms-epoch | `/api/tasks`, `/api/tracking`, `/api/family`, `/api/birthdays` (`created`) | `createdAtIso`/`updatedAtIso` i `/api/tasks` |
| `updatedAt` er ISO | `/api/rss`, `/api/widgets/calendar`, `/api/kalender`, `/api/brief` | – (allerede riktig) |
| `created`/`lastUsed`/`expires` er ms | `/finans/api/tokens` | `createdAt`/`lastUsedAt`/`expiresAt` (ISO) |
| `t` er ISO uten sone (lokal tid) | `/api/brief` | – (Fase 3) |
| Beløp er kroner som desimaltall (`amount: -1284.5`) | `/finans/api/*` (transaksjoner, oversikt, budsjett, abonnement) | `amountOre` (transaksjoner), `priceOre` (abonnement) |
| Gamle kvitteringer lagrer `amount REAL` i kroner | `/api/receipts` | – (åpent spørsmål i AUDIT A, «Spørsmål» 4) |
| `{ok:false, error}` med status 200 | 24 steder (bl.a. `finans/forslag-routes.js`) | – |
| Live-aktiviteter har norske feltnavn (`tittel`, `oppdatert`) | `/api/live/*` | – (appene leser de norske navnene) |
