# API

Alt appene og nettsiden gjør, går gjennom et JSON-API som du også kan bruke selv: fra skript, iOS-snarveier, Home Assistant eller Excel. Alle beløp er i kroner. Feil har formen `{ "error": "melding" }` med en passende HTTP-status.

Den fullstendige listen over endepunkter står i [docs/api.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/api.md).

## Autentisering

| Klient | Hvordan |
|---|---|
| Nettleser | Sesjonscookie fra innloggingen |
| Apper, skript, snarveier | `Authorization: Bearer fh_pat_…` |

Et app-token gjelder **én bruker** og gir tilgang til den brukerens data. Tokenet gjelder både `/finans/api/*` og de fleste `/api/*`-endepunktene: Kalender, Sporing, Bursdager, Huskeliste, Familie, widgets og integrasjoner. Lesing krever tilgangen `finance:read`, og endring krever `finance:write`.

### Lag et token

**Fra nettsiden:** FinansHub → Innstillinger → **Mobil og tilgang → Nytt token**. Velg navn, tilganger og utløp (30 d, 90 d, 1 år eller aldri). Tokenet vises bare én gang.

**Med innlogging** (slik appene gjør det):

```bash
curl -s https://os.example.no/finans/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"sebastian","password":"ditt-passord","code":"123456","device":"Skript"}'
# → {"token":"fh_pat_…","user":{"username":"sebastian","role":"admin","name":"Sebastian"}}
# → 401 {"error":"…","needsTotp":true} hvis 2FA-koden mangler
```

I eksemplene under er tokenet lagret i en variabel:

```bash
export HL=https://os.example.no
export TOKEN=fh_pat_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## FinansHub

### Alt på én gang: bootstrap

```bash
curl -s $HL/finans/api/bootstrap -H "Authorization: Bearer $TOKEN" | jq 'keys'
```

Returnerer det appen trenger ved oppstart: kontoer, kategorier, budsjett, siste transaksjoner, innstillinger og mer.

### Månedens sammendrag

```bash
curl -s $HL/finans/api/summary -H "Authorization: Bearer $TOKEN"
```

Egner seg som `rest`-sensor i Home Assistant:

```yaml
# configuration.yaml
rest:
  - resource: https://os.example.no/finans/api/summary
    headers:
      Authorization: !secret homelab_token     # "Bearer fh_pat_…"
    scan_interval: 1800
    sensor:
      - name: "Brukt denne måneden"
        value_template: "{{ value_json.ut }}"
        unit_of_measurement: "kr"
```

Svaret har blant annet `inn`, `ut`, `left` (igjen av budsjettet), `balance`, `daysLeft` og `byCategory`. Velg måned med `?month=2026-09`.

### Last opp en kvittering

```bash
curl -s $HL/finans/api/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@kvittering.jpg
# Flere filer: -F file=@a.jpg -F file=@b.pdf
```

Svaret inneholder kvitteringen og `jobs` med én jobb per fil. Følg køen med:

```bash
curl -s $HL/finans/api/receipts/jobs -H "Authorization: Bearer $TOKEN"
```

Et token med bare `receipts:write` kan laste opp, men ikke lese noe annet. Det passer godt i en iOS-snarvei:

1. **Snarveier → Ny snarvei → Ta bilde** (eller Velg bilder).
2. **Hent innhold fra URL:** `https://os.example.no/finans/api/receipts`, metode **POST**, brødtekst **Skjema**, felt `file` = bildet.
3. Legg til header `Authorization` med verdien `Bearer fh_pat_…`.

### Bokfør en kvittering

```bash
curl -s -X POST $HL/finans/api/receipts/123/book -H "Authorization: Bearer $TOKEN"
curl -s -X POST $HL/finans/api/receipts/123/unbook -H "Authorization: Bearer $TOKEN"   # angre
```

### Ny transaksjon

```bash
curl -s $HL/finans/api/transactions \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"date":"2026-10-19","description":"Kiwi Majorstuen","amount":-249.90}'
```

### AI-søk som jobb

Uten noe ekstra venter kallet til svaret er klart:

```bash
curl -s $HL/finans/api/search/ai \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"q":"hvor mye brukte jeg på strøm i september?"}'
```

Med `Prefer: respond-async` (eller `?async=1`, eller `"async":true`) får du `202` og en jobb hvis svaret tar mer enn ca. 4 s:

```bash
curl -si $HL/finans/api/search/ai \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H 'Prefer: respond-async' \
  -d '{"q":"hva kjøpte jeg på Biltema i år?"}'
# HTTP/1.1 202  ·  Location: /finans/api/jobs/9f1c…  ·  {"jobId":"9f1c…", …}

curl -s  $HL/finans/api/jobs/9f1c…        -H "Authorization: Bearer $TOKEN"   # status (poll)
curl -sN $HL/finans/api/jobs/9f1c…/events -H "Authorization: Bearer $TOKEN"   # SSE, oppdateres hvert sekund
curl -s -X DELETE $HL/finans/api/jobs/9f1c… -H "Authorization: Bearer $TOKEN" # avbryt
```

Jobben har `status` (`running`, `done`, `error` eller `cancelled`), `text` (for eksempel «✦ Ollama tenker … 34 s av 60 s»), `elapsedS` og `limitS`, og `result` når den er ferdig.

## Kalender

```bash
# Hendelser i en periode (maks 400 dager). Uten from/to: rundt dagens dato.
curl -s "$HL/api/kalender?from=2026-10-19&to=2026-10-25" -H "Authorization: Bearer $TOKEN" \
  | jq '.events[] | {title, start, room, type}'

# Hent kalenderne på nytt nå
curl -s -X POST $HL/api/kalender/refresh -H "Authorization: Bearer $TOKEN"

# Kompakt svar for widgets: nå, neste time og neste prøve
curl -s $HL/api/widgets/calendar -H "Authorization: Bearer $TOKEN"
```

Svaret har `events`, `subjects` (fagfarger), `sources` og `now`. `type` er `time`, `prove`, `innl`, `skole`, `fri` eller `bursdag`.

## Sporing

```bash
# Alle pakker (archived=0: bare aktive, archived=1: bare Arkiv)
curl -s "$HL/api/tracking?archived=0" -H "Authorization: Bearer $TOKEN" | jq '.items[] | {name, carrierName, statusText}'

# Legg til en pakke (carrierOverride er valgfri: posten, bring, postnord, dhl, helthjem, ups, budbee, instabox, parcelsapp)
curl -s $HL/api/tracking \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"trackingNo":"CV704411234NO","name":"iPhone-deksel"}'

# Oppdater status for én pakke, eller alle
curl -s -X POST $HL/api/tracking/42/refresh -H "Authorization: Bearer $TOKEN"
curl -s -X POST $HL/api/tracking/refresh    -H "Authorization: Bearer $TOKEN"

# Bytt tjeneste («Spor via») eller arkiver
curl -s -X PATCH $HL/api/tracking/42 -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"carrierOverride":"parcelsapp"}'
```

## Bursdager

```bash
curl -s $HL/api/birthdays -H "Authorization: Bearer $TOKEN"

curl -s $HL/api/birthdays \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Emma","month":10,"day":21,"year":2012,"relation":"familie","saveTo":"local"}'
# relation: familie | venn | jobb | annet · saveTo: local | google | ha

curl -s -X PATCH  $HL/api/birthdays/7 -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"day":22}'
curl -s -X DELETE $HL/api/birthdays/7 -H "Authorization: Bearer $TOKEN"

curl -s $HL/api/widgets/birthdays -H "Authorization: Bearer $TOKEN"     # widget-svaret
```

## Huskeliste

```bash
curl -s $HL/api/tasks -H "Authorization: Bearer $TOKEN"
curl -s $HL/api/tasks -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Kjøp melk","due":"2026-10-20"}'
curl -s -X PATCH $HL/api/tasks/15 -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"done":true}'
```

## Integrasjoner

```bash
curl -s $HL/api/integrasjoner -H "Authorization: Bearer $TOKEN" | jq '.[] | {id, name, status}'
curl -s -X POST $HL/api/integrasjoner/mybring/test -H "Authorization: Bearer $TOKEN"
curl -s -X PUT  $HL/api/integrasjoner/plex -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"plex_url":"http://192.168.1.20:32400"}'
```

`/api/integrations` er det samme. Hemmelige verdier sendes aldri ut, bare `saved: true/false`. Vanlige brukere får 403 på serveroppsettet.

## Sanntid (WebSocket)

Huskeliste, Familie og Sporing sender endringer over én WebSocket på `/api/ws`. Nettleseren bruker sesjonscookien, og appene sender tokenet som `?token=`:

```bash
# npm i -g wscat
wscat -c "wss://os.example.no/api/ws?token=$TOKEN"
< {"type":"hello","user":"…","ts":1760860000000}
> ping
< {"type":"pong","ts":1760860001000}
< {"type":"tracking","action":"created","id":42,"ts":…}
```

| `type` | Når |
|---|---|
| `hello` | Rett etter tilkobling |
| `tasks` | En oppgave eller liste er endret |
| `family` | Posisjon, deling, sone eller farge er endret |
| `tracking` | En pakke er lagt til eller har ny status |
| `pong` | Svar på `ping` |

Meldingene går bare til dem som har tilgang til dataene. Serveren pinger hvert 30. sekund og kobler fra døde forbindelser.

!!! info

    Det finnes ingen utgående webhooks. Vil du reagere på endringer, for eksempel i Node-RED eller Home Assistant, kobler du deg til `/api/ws`, eller poller endepunktene over.

## Uten innlogging

| Sti | Hva |
|---|---|
| `GET /healthz` | `ok` når serveren kjører |
| `GET /finans/api/logo/:domain` | Logo for et domene |
| `GET /mat/calendar.ics?key=…` | Middagsplanen som iCal, med den hemmelige nøkkelen |
