# Kalender for Mac: «Ser etter oppdateringer på 172.18.0.3 …» henger

Ønske 2026-10-23: «for mac funker ikke» (skjermbilde `uploads/Screenshot 2026-10-23 at 12.14.49.png`: Programvareoppdatering · Kalender 4.38.0 (41) · macOS · «Ser etter oppdateringer på 172.18.0.3 …»).
Gjelder `claude-code-kalender-oppdater-i-appen.md` og `Kalender Oppdatering.dc.html`.

## Feil
`172.18.0.3` er **Docker-nettverkets interne adresse** til containeren. Den finnes bare inne i Docker på serveren, og Mac-en kan aldri nå den. Serveren bygger oppdaterings-URL-en fra sin egen IP (`req.socket.localAddress` / `os.networkInterfaces()` / `HOST`) i stedet for den adressen brukeren faktisk bruker. Appen venter uten tidsavbrudd, og blir stående.

## Rett
- **Serveren:** bygg aldri URL-er fra container-IP. Bruk i denne rekkefølgen:
  1. `PUBLIC_URL` fra `.env` (f.eks. `https://home.kristo.no`).
  2. `X-Forwarded-Proto` + `X-Forwarded-Host` fra proxyen/tunnelen (stol bare på disse bak egen proxy).
  3. `Host`-headeren i forespørselen.
  Gjelder appcast/manifest (`/api/apps/calendar/mac/appcast.xml` eller tilsvarende), nedlastings-URL-er, og alle lenker i e-post og varsler.
- **Mac-appen:** sjekk oppdateringer mot **samme serveradresse som appen er logget inn med** (Innstillinger → Server), ikke en adresse serveren sender tilbake. Relative URL-er i manifestet løses mot den. Får appen en adresse i `172.16.0.0/12`, `10.0.0.0/8` eller `127.0.0.0/8` som ikke svarer, forkastes den og serveradressen brukes.
- **Tidsavbrudd:** 15 s per forsøk. Etterpå: «Fikk ikke kontakt med serveren (home.kristo.no). Prøv igjen» + «Vis detaljer» (URL, feilkode). Ingen evig «Ser etter …».
- **Sparkle (hvis det brukes):** `SUFeedURL` settes fra serveradressen i kjøretid (`feedURLString(for:)` i delegaten), ikke hardkodet i `Info.plist`. Signering: `SUPublicEDKey` i appen, og `sign_update` på hver `.dmg`/`.zip` i CI.
- **Visning:** vis domenet («Ser etter oppdateringer på home.kristo.no …»), aldri en intern IP.
- Gjelder også iPad/iPhone (TestFlight-lenke) og Android (APK-oppdatering), om de bruker samme manifest.

## Test
- Mac hjemme på Wi-Fi, Mac på mobildeling (utenfor hjemmenettet) → begge finner oppdateringen og installerer.
- Server bak Cloudflare-tunnel → manifestet inneholder bare `https://home.kristo.no/...`.
- Slå av serveren → feilmelding etter 15 s, ikke heng.
