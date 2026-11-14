# Live Activities (iOS) og Live Updates (Android)

Prompt 89 (SRV89). Serveren lager de løpende aktivitetene for låseskjermen, Dynamic Island og Android 16 Live Updates. Appene
henter dem med `GET /api/live/aktiviteter`, og iPhone kan i tillegg få dem som push fra Apple (APNs). Koden ligger i
`server/live89.js` (API og push-jobben) og `server/apns.js` (APNs-senderen). Fasiten for utseendet er `Live Activities.dc.html`
i designpakken.

## API

Alt er per bruker (innlogging med økt eller app-token). Feil er alltid `{error: "norsk tekst"}`.

| Kall | Svar |
|---|---|
| `GET /api/live/aktiviteter` | `{aktiviteter: [Akt], oppdatert: ISO}` |
| `POST /api/live/handling {id, handling, platform?}` | `{ok, aktivitet?}` · rute: `{ok, url}` · utsett: `{ok, aktivitet: null, skjultTil}` |
| `GET /api/live/innstillinger` | `{nedlasting, backup, spiller, avtale, pakke}` (bool, standard true; backup alltid false for ikke-admin) |
| `PUT /api/live/innstillinger` | samme form inn og ut (bare bool-felt leses) |
| `POST /api/live/tokens {platform, kind, token, aktivitetId?, type?}` | `{ok}` |
| `DELETE /api/live/tokens {token}` | `{ok}` (bare egne tokens) |

`Akt = {id, type, tittel, undertittel, verdi, progress, segmenter, meta, start, slutt, status, handlinger, url}`

- `id` er stabil og følger `^[a-z0-9:_-]{1,80}$`, `type` er `nedlasting`, `backup`, `spiller`, `avtale` eller `pakke`.
- `progress` er 0–1 eller `null`. `segmenter` er `{antall, ferdig}` bare for pakke, ellers `null`.
- `start` og `slutt` er ISO eller `null`. Når begge er satt, tikker tiden i appen (`Text(timerInterval:)` / `ProgressView(timerInterval:)`).
- `status` er `aktiv`, `pause` eller `ferdig`. Knappene står i `handlinger` (`{id, tittel}`), og appen viser bare dem som står der.

Feilkoder for `POST /api/live/handling`: 400 ugyldig id eller ukjent handling, 404 ukjent id eller id brukeren ikke ser,
409 handlingen passer ikke nå (f.eks. pause på noe som allerede er pauset), 429 for mange (10 per 10 s per bruker, med
`Retry-After`), 502 når tjenesten bak svarer med feil.

## Hva hver type fyller inn

| Type | id | tittel | undertittel | verdi | progress | meta | start / slutt | handlinger | url |
|---|---|---|---|---|---|---|---|---|---|
| nedlasting (qBittorrent, med Sonarr/Radarr-koblingen) | `nedlasting:qb:<hash>` | serie- eller filmtittel | `S01E03 · Sonarr · 2 i kø` (kilde Sonarr/Radarr/qBittorrent) | `62 %` / `Ferdig` | fremdrift | `12,3 MB/s · 5 min` (qBittorrent-status) | lagt til / nå + ETA | Pause eller Fortsett | `homelab://media/ned` |
| nedlasting (NRK) | `nedlasting:nrk:<jobb-id>` | jobbens tittel | `3 av 8 · NRK · 1 i kø` | `62 %` / `Ferdig` | fremdrift | meldingen fra nrk-dl | opprettet / nå + ETA | Pause (avbryt) eller Fortsett (igjen) | `homelab://media/ned` |
| backup (systembackup) | `backup:sys:<jobb-id>` | `Backup til NAS` (eller `Backup`) | `smb-mappe · Hele systemet · 3 moduler` | `41 %` / `Ferdig` / `Feilet` | fremdrift | `Pakker filene …` / `Kontrollerer …` | startet / null | ingen | `homelab://innstillinger/backup` |
| backup (restic) | `backup:restic:<kjøring>` | `Backup (restic)` | målene, f.eks. `Lokal disk · NAS` | `1/2` (mål ferdig) / `Ferdig` | mål ferdig / alle | målet som kjører | startet / null | ingen | `homelab://innstillinger/backup` |
| spiller (Plex/Jellyfin) | `spiller:<økt>` | tittel | `S06E03 · Dead Drop · Petter · Apple TV` | posisjon `24:10` | posisjon / lengde | `12 min igjen` | ved avspilling: nå − posisjon / start + lengde; pauset: null | Pause eller Spill av (`fortsett`), Stopp | `homelab://media/avspilling` |
| avtale (kalender, starter innen 60 min) | `avtale:<hash av hendelses-id>` | hendelsens tittel | `14:30 · Bogstadveien 27` | `25 min` | tid gått av siste time | `Starter 14:30 · sted` | starttid − 60 min / starttid | Vis rute (`rute`, bare med sted), Utsett 5 min | `homelab://kalender?id=<hendelses-id>` |
| pakke (ute for levering, eller levert siste 30 min) | `pakke:<id>` | avsender (butikk) | `Ute for levering · Posten` (+ `4 stopp unna` når hendelsen sier det) | `4 stopp` / `På vei` / `Levert` | ferdig / 4 | siste hendelse | null / null | ingen | `homelab://sporing/<id>` |

Regler for hvem som ser hva:

- Nedlastinger og Spilles nå krever Media-tilgang (som Media i dag). Spilles nå viser bare egne økter (koblingen admin har satt
  under mediekontrollen), og alle økter for admin. Knappene vises bare når brukeren kan styre avspilleren.
- Backup ser bare administratorer. Backupen kan ikke pauses i dag (verken systembackupen eller restic har pause), så den har
  ingen knapper.
- Avtale og pakke er brukerens egne. Bare den neste avtalen vises, og bare typene brukeren har slått på.
- Høyst 3 torrenter og 2 NRK-jobber vises. Torrenter og NRK-jobber pauset herfra beholder plassen (6 t). Ferdige nedlastinger og
  backuper vises som `ferdig` i 15 min.

Handlingene: `pause`/`fortsett` på torrent (qBittorrent stop/start), NRK-jobb (avbryt/igjen i nrk-dl) og spiller
(mediekontrollen i `medctl51.js`, med samme eierskapssjekk). `stopp` stopper avspillingen. `utsett` skjuler avtalen i 5 min
(lagres per bruker, `kv live89_utsatt`), så kommer den tilbake hvis den fortsatt starter innen en time. `rute` gjør ingenting
på serveren og svarer med kart-lenken (Apple Kart, eller Google Maps med `platform: "android"`).

## Push til iPhone (APNs)

Oppsett (bare admin): Innstillinger → Integrasjoner → «Apple Push (Live Activities)»: team-id, nøkkel-id, .p8-nøkkelen,
bundle-id (standard `no.kristo.finanshub`) og miljø (`produksjon` eller `sandbox`). Nøkkelen lagres kryptert, logges aldri og
sendes aldri ut igjen. «Test tilkobling» sender til et ugyldig token: svarer Apple `BadDeviceToken`, er nøkkelen godtatt.
Uten fullstendig oppsett sendes ingen push, og appene poller i stedet.

Appen registrerer tokens med `POST /api/live/tokens`:

- `kind: "pushtostart"` (iOS 17.2+): serveren starter nye aktiviteter med `event: "start"`.
- `kind: "liveactivity"` med `aktivitetId` (og gjerne `type`): oppdateringer og `end` for den aktiviteten.
- `kind: "fcm"` lagres, men brukes ikke (ingen Firebase). Android poller `GET /api/live/aktiviteter` fra en
  forgrunnstjeneste/arbeider mens noe er aktivt.

Jobben går hvert 5. s (bare når APNs er satt opp og noen har iOS-tokens). Hver push er `apns-push-type: liveactivity` med
topic `<bundle>.push-type.liveactivity` og JWT (ES256, `kid` = nøkkel-id, `iss` = team-id, fornyes hvert 40. min).

- Ny aktivitet → `start` til alle push-to-start-tokens, med `attributes-type: "Plat51Attributes"`,
  `attributes: {kind: type, key: id, color: aksent, id, type}` og et `alert`.
- Endring → `update` (prioritet 5 for nedlasting/backup, maks hvert 5. s; prioritet 10 for resten, ved endring). Tid som tikker
  i appen (spiller, avtale) gir ikke push hvert sekund.
- Ferdig → `end` med `dismissal-date` nå + 15 min (pakke + 30 min). Forsvinner en aktivitet (avtalen har startet, bryteren er
  slått av, avspillingen er stoppet) → `end` (avtale med dismissal ved starttid, ellers + 15 min).
- Tokens Apple avviser (410, `BadDeviceToken`, `Unregistered`) slettes.

`content-state` har feltene fra `Plat51Attributes.ContentState` (`title`, `sub`, `endAt` (Unix s, 0 = ingen), `progress`
(−1 = ingen), `state` (`active`/`stalled`/`done`), `value`) og i tillegg alle Akt-feltene flatt (`id`, `type`, `tittel`,
`undertittel`, `verdi`, `segmenter`, `meta`, `start`, `slutt`, `startAt` (Unix s), `status`, `handlinger`, `url`).
Merk: `progress` er −1 i stedet for `null` her, fordi feltet er felles.

Farger (aksent): nedlasting `#5ac8fa`, backup `#30d158`, spiller `#ffb340`, avtale `#ff6a4d`, pakke `#bf8cff`.

## Innstillinger på web

Innstillinger → Varsler → Live Activities har én bryter per type (backup bare for administratorer). Samme verdier som appene
bruker under Innstillinger → Varsler.

## Test

`test/p89-live.test.js`: tilgang per bruker, admin-backup, handlinger (torrent, NRK, spiller, avtale), rate limit, tokens,
JWT-formatet og signaturen mot en lokal HTTP/2-mock, struping, `end`, sletting av utløpte tokens, og at nøkkelen og JWT-en
aldri står i svar eller logg.
