# <img src="assets/icons/docker.svg" width="32" align="top"> Installasjon

[← Til README](../README.md)

Homelab OS er én Node-tjeneste med en SQLite-database i `data/`. Du kan kjøre den rett med Node, i Docker, som en ferdig Proxmox-LXC eller på Unraid.

- [Krav](#krav)
- [Lokalt (utvikling)](#lokalt-utvikling)
- [Proxmox: automatisk LXC](#proxmox-automatisk-lxc)
- [Docker Compose](#docker-compose)
- [Cloudflare Tunnel og Access](#cloudflare-tunnel-og-access)
- [Unraid](#unraid)
- [Første oppstart](#første-oppstart)
- [Oppdatering](#oppdatering)
- [Feilsøking](#feilsøking)

## Krav

| | Minimum | Anbefalt |
|---|---|---|
| CPU / RAM | 1 kjerne, 512 MB | 2 kjerner, 1 GB |
| Disk | 2 GB | 8 GB eller mer (kvitteringsbilder) |
| Node | 22 | 22 LTS |
| AI (valgfritt) | Gemini-nøkkel | Ollama med `qwen2.5vl:7b` på en maskin med GPU |

## Lokalt (utvikling)

```bash
npm install
cp .env.example .env
npm run hash-password -- 'velg-et-godt-passord'   # skriver APP_PASSWORD_HASH=…, lim inn i .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "COOKIE_SECURE=false" >> .env                 # kun uten HTTPS
MOCK_DATA=1 npm run dev                            # eksempeldata, ingen nøkler nødvendig
```

`npm run dev` starter på nytt når filer endres. Uten `MOCK_DATA=1` brukes ekte integrasjoner, og et kort uten oppsett viser hva som mangler.

## Proxmox: automatisk LXC

Kjør på **Proxmox-verten** som root, i *pve → Shell*, ikke inne i en container:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/install.sh)"
```

Skriptet gjør dette:
1. finner ledig CT-ID og lagring (`pvesm`), og laster ned en Debian 12-mal
2. lager en **uprivilegert** LXC med nesting (kreves av Docker)
3. installerer Docker og legger koden i `/opt/homelab-os`
4. spør om passord og eventuelt et Cloudflare Tunnel-token
5. skriver `.env` med ny `SESSION_SECRET` og starter tjenesten

Valgene kan overstyres med miljøvariabler foran kommandoen:

| Variabel | Standard | Betydning |
|---|---|---|
| `CTID` | neste ledige | Container-ID |
| `CT_HOSTNAME` | `homelab-os` | Navn på containeren (oppdateringsskriptet leter etter dette) |
| `STORAGE` | finnes automatisk | Lagring for rotdisken, f.eks. `local-zfs` |
| `TEMPLATE_STORAGE` | finnes automatisk | Lagring for malen |
| `DISK` / `RAM` / `CORES` | `8` / `1024` / `2` | Diskstørrelse (GB), minne (MB) og kjerner |
| `IP` / `GW` | `dhcp` / – | Fast adresse, f.eks. `IP=192.168.1.60/24 GW=192.168.1.1` |
| `BRIDGE` | `vmbr0` | Nettverksbro |
| `PORT` | `3000` | Port på LAN |
| `BRANCH` / `REPO` | `main` / dette repoet | Kilde for koden |
| `GITHUB_TOKEN` | – | Bare hvis repoet er privat |

Eksempel:
```bash
CTID=150 STORAGE=local-zfs IP=192.168.1.60/24 GW=192.168.1.1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/install.sh)"
```

Etterpå: `pct enter <ctid>` → `nano /opt/homelab-os/.env` → `docker compose up -d`.

## Docker Compose

```bash
git clone https://github.com/SebastianKristo/torskenes-verden.git /opt/homelab-os && cd /opt/homelab-os
cp .env.example .env    # fyll ut, se konfigurasjon.md
docker compose run --rm --entrypoint node os scripts/hash-password.js 'passord'   # lim inn i .env
docker compose up -d --build                     # bare appen, på 127.0.0.1:3000
docker compose --profile tunnel up -d --build    # med Cloudflare Tunnel
```

| Variabel i `.env` | Standard | Betydning |
|---|---|---|
| `BIND_ADDR` | `127.0.0.1` | Sett til `0.0.0.0` for å nå appen fra LAN |
| `HOST_PORT` | `3000` | Port på verten |
| `PUID` / `PGID` | `1000` / `1000` | Eier av `data/` (Unraid: `99` / `100`) |

Imaget inneholder `smbclient` for backup til SMB-share. Data ligger i `./data`, som monteres som `/data` i containeren.

## Cloudflare Tunnel og Access

Anbefalt oppsett er **ingen åpne porter**:

1. Cloudflare Zero Trust → **Networks → Tunnels → Create tunnel**. Kopier tokenet til `CLOUDFLARE_TUNNEL_TOKEN`.
2. Legg til en *public hostname*, for eksempel `os.dittdomene.no` → `http://os:3000`.
3. Start med `docker compose --profile tunnel up -d`.
4. Anbefalt: **Access → Applications**. Lag en app for `os.dittdomene.no` med en policy for e-posten din, og en *bypass*-policy for `/cv*` og `/assets/*` slik at CV-en er offentlig. Mobilappene trenger også en *bypass* (eller service token) for `/finans/api/*`, ellers stopper Access dem før de når innloggingen.

> [!WARNING]
> Ikke bruk portviderekobling i ruteren. Bak Docker kan trafikk utenfra se ut som en 172.x-adresse og bli regnet som lokal, og da gjelder «pålitelig enhet» feilaktig.

## Unraid

1. Kopier [`deploy/unraid/homelab-os.xml`](../deploy/unraid/homelab-os.xml) til `/boot/config/plugins/dockerMan/templates-user/`.
2. **Docker → Add Container** → velg malen `homelab-os`.
3. Lag passord-hashen og lim den inn i `APP_PASSWORD_HASH`:
   ```bash
   docker run --rm ghcr.io/sebastiankristo/torskenes-verden node scripts/hash-password.js 'passord'
   ```

Imaget `ghcr.io/sebastiankristo/torskenes-verden` bygges av [`.github/workflows/docker.yml`](../.github/workflows/docker.yml) ved hver push til `main`. Data havner i `/mnt/user/appdata/homelab-os`.

## Første oppstart

- **Innlogging:** brukernavnet er `USER_NAME` med små bokstaver (standard `sebastian`), og passordet er det du hashet. Eieren blir admin automatisk.
- **Tom FinansHub:** første gang du åpner `/finans/` med tom database, får du velge mellom å starte tomt, hente fra en SMB-share, laste opp en backupfil eller laste inn eksempeldata. Se [backup.md](backup.md).
- **Etter innlogging:** gå til **Innstillinger → Integrasjoner** for nøkler og **Innstillinger → Innlogging** for 2FA og flere brukere.

## Oppdatering

| Oppsett | Kommando |
|---|---|
| Proxmox | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"` (på verten, `CTID=<id>` foran om navnet er endret) |
| Docker | `git pull && docker compose --profile tunnel up -d --build` |
| Unraid | *Check for updates* på containeren |

Oppdateringsskriptet for Proxmox laster ned koden som en tarball (ingen git eller innlogging), bygger imaget på nytt og rører ikke `.env` eller `data/`. Databasen migreres automatisk ved oppstart.

## Feilsøking

| Symptom | Årsak og løsning |
|---|---|
| Innlogging «virker», men du kastes ut igjen | Du bruker `http://` uten `COOKIE_SECURE=false`. |
| `storage 'local-lvm' does not exist` | Gammelt skript. Kjør det nye, som finner lagringen selv, eller sett `STORAGE=`. |
| `curl: (22) … 404` | Feil branch eller privat repo. Sjekk URL-en eller sett `GITHUB_TOKEN`. |
| Ber om brukernavn/passord for git | Gammelt oppdateringsskript. Det nye bruker ikke git. |
| Ser ingen endringer etter oppdatering | Hard reload (Ctrl+Shift+R). Service workeren i FinansHub henter alltid nytt fra nettet først. |
| Android-appen får ikke kontakt | Skriv `http://` foran lokal adresse, sjekk port, og at telefonen er på samme nett. Se [apps/README.md](../apps/README.md). |
| Glemt passord eller mistet 2FA | `docker compose exec -u 1000 os npm run reset-password -- sebastian` (bruk din PUID) setter nytt passord og slår av 2FA. |
| Helsesjekk | `curl http://localhost:3000/healthz` skal svare `ok`. |
