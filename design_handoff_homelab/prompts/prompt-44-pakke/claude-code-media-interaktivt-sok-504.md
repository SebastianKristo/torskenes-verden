# Media: interaktivt søk gir «Fikk ikke hentet data · Feil 504»

Ønske 2026-10-21: «får feil med interaktiv search» (vedlegg `uploads/Screenshot 2026-10-21 at 14.08.18.png`: The Diplomat → interaktivt søk → «Fikk ikke hentet data · Feil 504 · Prøv igjen»).

## Årsak (sannsynlig)
504 = Gateway Timeout. Sonarr `GET /api/v3/release?episodeId=…` (og Radarr `?movieId=`) spør **alle indeksere** og svarer ofte først etter 30–120 s. Proxyen eller backend-kallet vårt gir opp før (nginx/Caddy standard 60 s, `fetch` i backend ofte 30 s). Sesongsøk (`seriesId`+`seasonNumber`) tar enda lengre tid.

## Retting
1. **Backend-proxy:** egen timeout for `/release`-kall: **180 s** (Caddy `reverse_proxy { transport http { read_timeout 180s } }`, nginx `proxy_read_timeout 180s`, Node `AbortSignal.timeout(180000)`). Andre kall beholder kort timeout.
2. **Ikke vent i ett kall fra nettleseren.** `POST /api/media/search {kind, id, season?, episode?}` → `{jobId}` med en gang. Backend kjører søket og strømmer status via SSE/WebSocket (`/api/media/search/{jobId}/events`): `indexer.start`, `indexer.done {name, count, ms}`, `indexer.fail {name, error}`, `done {releases}`.
3. **Søk per indekser via Prowlarr** (`/api/v1/search?query=…&indexerIds=…&categories=5000`) parallelt, så treff vises etter hvert som indekserne svarer. Sonarr-søket brukes når alle er ferdige (for score, avvisninger og «grab» med riktig episode-kobling).
4. **UI mens det søker:** ikke feilkort. Vis «Søker i 8 indeksere … 23 s» med en rad per indekser (✓ 41 treff · 2,1 s / ⟳ / ✕ tidsavbrudd) og resultatene som har kommet. **Avbryt**-knapp.
5. **Feil:** én indekser som feiler, stopper ikke resten («NZBgeek svarte ikke · 0 treff»). Vis feilkort bare når *alle* feiler. Da: «Ingen indeksere svarte. Sjekk Prowlarr → Helse» + **Prøv igjen** og **Åpne Prowlarr**.
6. **Automatisk nytt forsøk** én gang ved 502/503/504, med 2 s pause.
7. **Cache** resultatet i 10 min per episode/film, så tilbake → inn igjen ikke starter søket på nytt («Hentet for 2 min siden · Søk igjen»).
8. Logg `media.search jobId=… indexers=8 ok=7 fail=1 ms=…` i Docker-loggen.
