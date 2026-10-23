# Media (mobil) sier fortsatt «Utlogget», selv om du er logget inn (andre gang)

Ønske 2026-10-23: «får meldingen i media på mobil at utlogget, selvom jeg er logget inn og det funker på web»
Første rettelse: `claude-code-media-mobil-ikke-innlogget.md` (2026-10-21). **Den løste det ikke.** Ikke gjør samme endring igjen. Finn hvor det faktisk går galt.

## Meldingen er nå «Utlogget», ikke «Ikke satt opp»
Etter forrige rettelse skiller appen mellom «Ikke satt opp», «Svarer ikke» og «Utlogget fra Homelab». At det står **Utlogget**, betyr at Media-kallet får **401/403 fra Homelab-backend**, eller at appen *tror* den har fått det. Resten av appen (Hjem, Kalender, Innstillinger) virker, så innloggingen er gyldig.

## Undersøk (i denne rekkefølgen, logg funn)
1. **Logg hvert Media-kall fra mobilen:** URL, statuskode, om `Authorization`-header er med, og token-alder. Sammenlign med samme kall fra web.
2. **Egen HTTP-klient i Media:** Bruker Media-modulen en egen `fetch`/`axios`/`URLSession`-instans uten auth-interceptoren som resten av appen har? Da sendes ingen token → 401. Rett: én felles API-klient for hele appen.
3. **Web bruker cookie, mobil bruker token:** `/api/media/*` kan ligge bak en middleware som bare godtar **session-cookie** (virker på web) og ikke `Bearer`-token (mobil). Sjekk at alle `/api/media/*`-ruter bruker samme auth-middleware som `/api/calendar/*`.
4. **Proxy/strøm-ruter:** Postere og bilder (`/api/media/poster/...`) lastes med `<Image source={{uri}}>`. Da sendes ofte ikke headers, så serveren svarer 401, og appen tolker én feilet poster som «Utlogget». Rett: send header i bildekall (`headers` på Image / `AsyncImage` med egen loader), eller bruk kortlivede signerte URL-er (`?sig=…&exp=…`). En bildefeil skal aldri sette Media-status til utlogget.
5. **Feil tolkning:** Media setter «Utlogget» ved *hvilken som helst* 401, også når den kommer fra Sonarr/Radarr (feil API-nøkkel på backend) og ikke fra Homelab-innloggingen. Backend må skille: `401 {code:"HOMELAB_AUTH"}` = utlogget av Homelab; `502 {code:"UPSTREAM_AUTH", service:"sonarr"}` = Sonarr avviser nøkkelen. Appen viser «Utlogget» bare ved `HOMELAB_AUTH`.
6. **Utløpt token uten fornyelse:** Fornyer resten av appen token automatisk ved 401, men ikke Media? Gjør fornyelsen felles i API-klienten: ved 401, forny én gang og prøv på nytt, før noe vises.
7. **Ekstern adresse:** På 4G går mobilen via Cloudflare-tunnel/ekstern domene. Sjekk at tunnelen eller Cloudflare Access ikke stripper `Authorization`-headeren eller krever egen Access-cookie for `/api/media`.
8. **Server-dropdown:** Er valgt server «Hytta» uten innlogging på mobil (lagret lokalt fra før)? Status skal hentes per valgt server, og tom/ugyldig verdi skal falle tilbake til «Hjemme».

## Retting (minstekrav)
- Én felles API-klient med token + automatisk fornyelse for **alle** moduler, Media inkludert.
- Samme auth-middleware for alle `/api/*`-ruter, som godtar både cookie og Bearer.
- Bilder og postere via signerte URL-er eller med header. Bildefeil påvirker ikke innloggingsstatus.
- «Utlogget» bare ved `HOMELAB_AUTH`. Ellers vises riktig melding per tjeneste: «Sonarr avviser API-nøkkelen», «Radarr svarer ikke».
- Trykk på meldingen → «Vis detaljer» med statuskode, tjeneste og tidspunkt (hjelper feilsøking).

## Test (må gjøres på ekte mobil, ikke bare simulator)
iOS og Android, Wi-Fi hjemme og 4G (ekstern), kald start, etter 1 time i bakgrunnen, og etter at token er utløpt. Media skal vise innhold i alle tilfeller der web virker. Legg ved logg fra ett kall før og etter rettelsen.
