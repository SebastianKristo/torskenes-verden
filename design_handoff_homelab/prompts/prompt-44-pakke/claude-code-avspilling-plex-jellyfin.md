# Avspilling (Plex + Jellyfin) og «Logg inn med Plex»

Ønske 2026-10-21: «for å legge til plex legg til login with plex, lag også en plex side og jellyfin side med historikk, en side som https://tautulli.com/»
Fasit: `Avspilling.dc.html` (klikkbar). Ny side i sidemenyen (web) og under Mer (mobil), og en fane «Avspilling» i Media.

## Logg inn med Plex (Integrasjoner + siden)
- Knapp **Logg inn med Plex** (Plex-gul). PIN-flyt, ingen passord hos oss:
  1. `POST https://plex.tv/api/v2/pins?strong=true` med `X-Plex-Client-Identifier` (fast UUID per installasjon), `X-Plex-Product: Homelab` → `{id, code}`.
  2. Åpne `https://app.plex.tv/auth#?clientID=…&code=…&forwardUrl=<vår callback>&context[device][product]=Homelab` i nytt vindu / ASWebAuthenticationSession / Custom Tab.
  3. Poll `GET https://plex.tv/api/v2/pins/{id}` hvert 2. s (maks 5 min) til `authToken` finnes. Vis «Venter på godkjenning … kode K7QX».
  4. `GET https://plex.tv/api/v2/resources?includeHttps=1` → velg server (liste hvis flere), lagre `accessToken` + beste tilkobling (lokal først). Token kryptert på serveren.
- Integrasjoner → Plex: status, server, «Bytt server», «Logg ut av Plex». Jellyfin: URL + API-nøkkel (eller Quick Connect).

## Siden «Avspilling»
Toppen: tittel, **Plex · Jellyfin** (prikk = tilkoblet), faner **Spilles nå · Historikk · Statistikk · Biblioteker**, serverlinje i mono (versjon, antall strømmer).
- **Spilles nå:** KPI-kort (strømmer nå, båndbredde, sett denne uka, brukere). Kort per strøm: plakat 2:3, status-brikke (**Direkte avspilling** grønn / **Omkoder** rød), enhet, tittel, episode, tekniske brikker (4K, HDR10, EAC3 5.1, 24 Mbit/s, 1080p → 720p, CPU 38 %), fremdrift (buffer + posisjon i Plex-gul / Jellyfin-lilla), bruker med avatar, «58 min». Oppdateres live (Plex `/status/sessions` + WebSocket `/:/websockets/notifications`, Jellyfin `/Sessions`).
- **Historikk:** søk (tittel, bruker, enhet), filter per bruker (avatar-piller), tabell: Når · plakat · Tittel + episode · Bruker · Enhet · Varighet · Sett (stolpe + %, grønn ≥ 90 %). Data: Plex `/status/sessions/history/all` (+ egen lagring av sesjoner, så historikken ikke forsvinner), Jellyfin Playback Reporting-plugin eller egen logging fra `/Sessions`.
- **Statistikk:** 7 dager / 30 dager / 12 mnd. Stolpediagram «avspillinger per dag», lister: mest sette serier, mest aktive brukere (timer), plattformer (%).
- **Biblioteker:** kort per bibliotek med antall, størrelse på disk, spilletid og «sist lagt til».
- Egen database-tabell `plays(id, server, user, item, started, stopped, duration, percent, device, platform, transcode)` som fylles fra sesjonene hvert 10. s.
- Varsler (valgfritt): «Petter begynte å se Wicked på Chromecast», «Omkoding på grunn av undertekster».

- Ønske 2026-10-21: «legg avspilling menyen ved siden prowlarr» (vedlegg `uploads/Screenshot 2026-10-21 at 14.19.21.png`): **Avspilling** er en egen fane i Media etter Prowlarr (Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr · Avspilling). Innholdet er det samme som siden, uten egen tittel. Servervelgeren skjules i denne fanen (Plex/Jellyfin velges inne i fanen).
