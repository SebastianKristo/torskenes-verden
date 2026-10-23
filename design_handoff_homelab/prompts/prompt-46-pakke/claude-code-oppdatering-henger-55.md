# Serveroppdatering henger på 55 %

Ønske 2026-10-23: «flere ganger når jeg prøver å oppdater servreren står den fast på 55% og jeg må restarte den fra proxmox og prøve på nytt»
Gjelder: Innstillinger → Server → System → «Oppdater nå» (se `claude-code-system-oppdatering-nordlys.md`, `claude-code-rull-tilbake-versjon.md`). Updater-containeren.

## Finn rotårsaken først
Stegene er: backup → last ned → **bygg** → start på nytt. 55 % ligger mest sannsynlig i **Bygger** eller overgangen til **Starter på nytt**. Undersøk, og skriv funnene i endringsloggen:
1. **Bygg på serveren:** Bygges image lokalt (`docker compose build` / `npm ci && build`) inne i VM/LXC? Sjekk `dmesg` / `journalctl -k` for **OOM-killer** under oppdatering, og diskplass (`df -h /var/lib/docker`). Lite RAM eller full disk gir prosesser som henger uten feil.
2. **Updater stopper seg selv:** Hvis updater-containeren er i samme compose-prosjekt og kjører `docker compose up -d`, kan den stoppe/erstatte seg selv midt i jobben. Da blir fremdriften stående for alltid.
3. **Ingen tidsavbrudd:** `docker pull`, `build` eller helsesjekk venter uten timeout (nettverk, registry, låst `apt`/`npm`).
4. **Låsfil / dobbel jobb:** En tidligere avbrutt jobb etterlater lås, og ny jobb venter på den.
5. **Web-klienten mister tilkoblingen** når serveren starter på nytt, og fortsetter å vise siste prosent selv om oppdateringen er ferdig eller feilet.
6. **LXC i Proxmox:** Docker i uprivilegert LXC uten `nesting=1,keyctl=1` kan henge på overlay/bygg.

## Løsning
- **Ikke bygg på serveren.** Bygg image i GitHub Actions, push til `ghcr.io`, og la oppdateringen bare gjøre `docker pull` + bytte container. Det fjerner det tyngste steget.
- **Updater kjører utenfor stacken:** egen container/prosjekt (`homelab-updater`, `restart: unless-stopped`), aldri en del av tjenestene den bytter ut. Den startes ikke på nytt av oppdateringen.
- **Tidsavbrudd per steg:** backup 5 min, pull 10 min, migrering 5 min, oppstart og helsesjekk 90 s. Ved tidsavbrudd: stopp, rull tilbake til forrige image (og backup ved behov), og vis feilen.
- **Watchdog:** fremdriften må bevege seg. Ingen ny logglinje eller ny prosent på 3 min → jobben merkes «Står fast», og brukeren får knappene under.
- **Status lagres på disk** (`/data/update/status.json`: steg, prosent, starttid, siste logglinje, feil). Klienten leser status med polling (hvert 2. s) og kobler til igjen automatisk etter omstart, slik at den aldri blir stående på en gammel prosent.
- **Lås med utløp:** låsfil med PID og tid. Er prosessen død eller låsen eldre enn 30 min, ryddes den automatisk.
- **Ressurssjekk før start:** minst 3 GB ledig disk og 1 GB ledig RAM. Hvis ikke: «Lite plass på serveren (1,2 GB ledig). Rydd gamle bilder?» med knappen **Rydd** (`docker image prune` for bilder eldre enn de 10 vi beholder).

## UI når den står fast
I heroen på System-siden, i stedet for en prosent som aldri endrer seg:
- «Oppdateringen står fast på **Bygger** (4 min uten fremgang)».
- Knapper: **Prøv igjen** (avbryter jobben og starter på nytt fra steget som feilet) · **Avbryt og gå tilbake til 4.21** · **Vis logg** (åpner Logger filtrert på `homelab-updater`).
- Glimt-linje med årsak når den er kjent: «Serveren gikk tom for minne under bygging.»
- Ingen omstart fra Proxmox skal være nødvendig.

## Test
- Simuler OOM under bygg, full disk, nettverksbrudd under pull, og helsesjekk som feiler → alle ender i «Står fast» eller automatisk tilbakerulling, aldri en evig prosent.
- Lukk nettleseren midt i og åpne igjen → riktig status vises.
- 5 oppdateringer på rad uten omstart av VM/LXC.
