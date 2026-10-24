# Drift (prompt 51)

Fire ting som holder øye med homelaben: helsedashbord med trendvarsel, selvreparasjon, spor for trege forespørsler og ntfy (selvhostet push). Alt utenom ntfy er bare for admin.

## Helsedashbord

**Hva det gjør:** Innstillinger › System › **Helse** viser alt på ett sted:

- **Containere** via Docker-proxyen (`homelab-docker`, bare lesing): status, helsesjekk, CPU og minne. Røde først.
- **Disk:** data-mappen, disken på AI-maskinen (Mac minien, når `AI_HOST_INFO_URL` er satt) og Proxmox-lagring (når API-et er satt opp). Ledig plass måles hvert 15. minutt, og trenden over 7 dager gir varsel som «Disken er full om 9 dager».
- **Ollama:** køen i AI-gaten og hvilke modeller som er lastet.
- **Mac-OCR** (Mac Vision-tjenesten) og **Mac mini** (svarer Ollama?).
- **Proxmox** (valgfritt) og **ntfy**.

Varsler (disk snart full, container nede, Ollama eller Mac-OCR svarer ikke) sendes til admin én gang per 12. time per varsel.

**Hva du gjør:** ingenting – dashbordet virker med en gang. Valgfritt:

- **Proxmox:** lag et API-token med lesetilgang og legg det inn under Helse › Proxmox › Sett opp:
  ```
  pveum user add homelab@pve
  pveum aclmod / -user homelab@pve -role PVEAuditor
  pveum user token add homelab@pve drift --privsep 0
  ```
  Adresse `https://<proxmox>:8006`, token-ID `homelab@pve!drift`, hemmeligheten er UUID-en kommandoen viser. Har Proxmox selvsignert sertifikat, lim inn innholdet av `/etc/pve/pve-root-ca.pem` som CA. Tokenet lagres kryptert og vises aldri igjen.
- **Mac minien:** `AI_HOST_INFO_URL` i `.env` (se `docs/konfigurasjon.md`) gir disken på AI-maskinen.

## Selvreparasjon

**Hva det gjør:** hvert minutt sjekkes containerne. Er en container *unhealthy* (Docker-helsesjekken) i to runder på rad, eller *død*, startes den på nytt via Docker-proxyen. Det er den eneste handlingen – proxyen er ikke utvidet. Homelab selv startes aldri på nytt herfra. Maks 3 omstarter per time per container (kan endres til 1–10). Etter 90 sekunder får admin beskjed om den ble frisk.

Feiler den gjentatte ganger (grensen er nådd, eller 3 omstarter på et døgn), lages et **issue-utkast** med hendelsene og de siste 60 logglinjene. Tokens, nøkler, passord og offentlige IP-er er maskert. Utkastet opprettes **aldri** automatisk.

**Hva du gjør:** System › Selvreparasjon › **Kopier** på utkastet, les gjennom, og lim det inn som et issue selv. **Forkast** fjerner det. Bryteren slår selvreparasjonen av. Containere uten helsesjekk (`healthcheck` i compose) blir bare startet på nytt hvis de er døde.

## Trege forespørsler

**Hva det gjør:** hver forespørsel til API-et måles med lette spenn: tid i databasen, hos AI-modellen (Ollama/Open WebUI) og i eksterne kall. Forespørsler over 800 ms havner i System › **Trege forespørsler** med en stolpe som viser hvor tiden gikk, og tabellen viser p50/p95 per rute. Bare i minnet (de siste 200), ingen spørrestrenger eller verdier lagres.

**Hva du gjør:** ingenting. Grensen endres med `OBS51_SLOW_MS=800` i `.env`; `OBS51_TRACE=0` slår sporene av.

## ntfy (selvhostet push)

**Hva det gjør:** varslene Homelab sender (pakker, Familie, Glimt, drift …) går også til ntfy-appen på telefonen, via din egen ntfy-server på hjemmenettet. Hver enhet får sitt eget hemmelige emne. «Hent meg» og kritiske driftsvarsler sendes med høyeste prioritet (også i stille timer for «Hent meg»).

**Hva du gjør (admin, én gang):**

```
cd /opt/homelab-os
docker compose --profile ntfy up -d ntfy
docker exec -it homelab-ntfy ntfy user add homelab                 # velg et passord
docker exec homelab-ntfy ntfy access homelab 'hl_*' write-only
docker exec homelab-ntfy ntfy access everyone 'hl_*' read-only      # emnene er hemmelige (128 bit), alt annet er stengt
docker exec homelab-ntfy ntfy token add homelab                     # kopier tokenet
```

I `.env`:

```
NTFY_URL=http://ntfy:80
NTFY_PUBLIC_URL=http://<LAN-IP>:2586
NTFY_TOKEN=<tokenet over>
NTFY_BIND=<LAN-IP>
```

Så `docker compose --profile ntfy up -d`. ntfy er bare på hjemmenettet – ikke legg den bak Cloudflare uten innlogging.

**Hva hver bruker gjør:** Innstillinger › Varsler › **ntfy** › Legg til enhet › Kopier adressen. I ntfy-appen: legg til serveren (`NTFY_PUBLIC_URL`) og abonner på emnet. Trykk **Test**.

### iOS og `upstream-base-url` (av som standard)

iPhone får bare umiddelbare ntfy-varsler fra en selvhostet server når den videresender en «vekk-opp» via ntfy.sh (Apple krever det). Det heter `upstream-base-url` og er **av**. Da kommer varslene når ntfy-appen henter dem selv (åpen app eller bakgrunnsoppdatering).

Slår du det på (`NTFY_UPSTREAM_BASE_URL: https://ntfy.sh` under `ntfy` i `docker-compose.yml`), sendes bare en poll-forespørsel med en hash av emnet til ntfy.sh – aldri tittel eller innhold. Telefonen henter selve varselet fra din server. Android trenger ikke dette.

## Kommandoer

```
docker compose --profile ntfy up -d          # start ntfy
docker logs homelab-ntfy                     # ntfy-loggen
node --test test/p51-obs.test.js             # testene for drift
```
