# «Starter opp»-siden blinker ved vanlig oppdatering av siden

Ønske 2026-10-20: «når jeg trykker oppdater får jeg denne i et sekund får snekker glimt starter» (vedlegg: `vedlegg/nordlys-starter-blink.png`).
Gjelder: `Nordlys Starter.dc.html` / `claude-code-nordlys-oppstartsside.md` (prompt 39).

## Feil
Ved vanlig **oppdatering av siden** (⌘R / F5 / dra ned i appen) vises «STARTER OPP · NordlysOS 4.29 · Serveren starter på nytt etter oppdateringen. Glimt sover litt …» i ca. 1 sekund, før den vanlige Glimt-startskjermen. Serveren er ikke restartet. Siden skal bare vises etter en ekte oppdatering eller når serveren faktisk er nede.

## Sannsynlige årsaker
1. **Første helsesjekk tolkes som «nede».** Når siden lastes, er det ennå ikke noe svar fra `/api/health` (eller WebSocket er ikke åpen), og «ingen svar» → oppstartssiden.
2. **WebSocket-lukking ved unload.** Når man trykker oppdater, lukkes WebSocket i `beforeunload`. Lytteren tolker det som tapt kontakt og viser siden før den nye siden har lastet.
3. **Oppstartssiden ligger i den statiske HTML-en** (eller service worker-cachen) og vises til JS bestemmer seg.

## Fiks
- **Vis den bare når en av disse er sann:**
  1. Flagget `hl_updating` er satt (settes av «Oppdater nå» i `sessionStorage` + på serveren, fjernes når `ready`).
  2. Serveren svarer `503` med `X-Homelab-State: starting` (eller `/api/health` → `{ready:false}`).
  3. **To helsesjekker på rad** (minst 3 s) feiler etter at appen allerede var lastet og koblet til.
- **Ignorer tapt kontakt under lasting og unload:** sett `unloading=true` i `pagehide`/`beforeunload`; ikke reager på WebSocket `close` da. De første 5 s etter at siden er lastet regnes ikke som «mistet kontakt».
- **Initial HTML viser vanlig Glimt-startskjerm** (den lyse Papir-splashen), aldri oppstartssiden. Oppstartssiden serveres bare av proxyen ved ekte `502/503` (`handle_errors`), og service worker skal **ikke** cache `/starting.html` som fallback for vanlige navigasjoner.
- **Forsinkelse:** selv når kriteriene slår til, vent 1,5 s før oppstartssiden vises (unngår blink ved korte hikke). Kommer serveren tilbake innen da, vises ingenting.
- Versjonsnummeret på siden hentes fra oppdateringen som pågår, ikke hardkodet.

## Test
- Trykk ⌘R / F5 og dra-ned-oppdater i appen 10 ganger: bare vanlig Glimt-startskjerm, aldri «Starter opp».
- «Oppdater nå» i Innstillinger: oppstartssiden vises gjennom hele restarten og laster appen når `ready`.
- Stopp backend-containeren mens appen er åpen: oppstartssiden kommer etter ~3 s.
