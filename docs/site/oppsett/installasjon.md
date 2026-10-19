# Installasjon

Homelab OS er én Node-tjeneste med en SQLite-database i `data/`. Den anbefalte måten å kjøre den på er **Docker Compose**, enten rett på en Linux-maskin eller i en Proxmox-LXC.

## Krav

| | Minimum | Anbefalt |
|---|---|---|
| CPU / RAM | 1 kjerne, 512 MB | 2 kjerner, 1 GB |
| Disk | 2 GB | 8 GB eller mer (kvitteringsbilder) |
| Programvare | Docker med Compose v2 | Docker 24+ |
| AI (valgfritt) | En Gemini-nøkkel | Ollama på en maskin med GPU eller Apple Silicon, se [AI og tidsgrenser](../bruk/ai-og-tidsgrenser.md) |

## Velg installasjonsmåte

Alle tre gir samme app. Docker Compose passer på en vanlig Linux-maskin, Proxmox-skriptet lager en ferdig LXC, og Unraid bruker det ferdige imaget fra GitHub.

=== ":fontawesome-brands-docker: Docker Compose"

    ```bash
    # 1. Hent koden
    git clone https://github.com/SebastianKristo/torskenes-verden.git /opt/homelab-os
    cd /opt/homelab-os

    # 2. Lag .env fra malen, med en ny sesjonshemmelighet
    cp .env.example .env
    sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env

    # 3. Start (velg én)
    docker compose up -d --build                     # bare appen
    docker compose --profile tunnel up -d --build    # appen + Cloudflare Tunnel

    # 4. Sjekk
    docker compose ps
    curl http://localhost:3000/healthz               # → ok
    docker compose logs -f os                        # Ctrl+C for å avslutte
    ```

    `docker-compose.yml` har tre tjenester:

    | Tjeneste | Profil | Hva |
    |---|---|---|
    | `os` | – (alltid) | Selve appen. `./data` monteres som `/data`. |
    | `cloudflared` | `tunnel` | Cloudflare Tunnel med `CLOUDFLARE_TUNNEL_TOKEN` |
    | `protonmail-bridge` | `mail` | Proton Mail Bridge for kvitteringer på e-post, se [Integrasjoner](../bruk/integrasjoner.md#imap-og-proton-mail-bridge) |

=== ":simple-proxmox: Proxmox"

    Proxmox-skriptet lager alt for deg. Kjør på **Proxmox-verten** som root, i *pve → Shell*, ikke inne i en container:

    ```bash
    bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/install.sh)"
    ```

    Skriptet lager en uprivilegert Debian 12-LXC med navnet `homelab-os`, installerer Docker, legger koden i `/opt/homelab-os`, spør om passord og eventuelt tunnel-token, og starter tjenesten. Valgene kan overstyres foran kommandoen:

    ```bash
    CTID=150 STORAGE=local-zfs IP=192.168.1.60/24 GW=192.168.1.1 \
      bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/install.sh)"
    ```

    Alle variablene (`CTID`, `CT_HOSTNAME`, `STORAGE`, `DISK`, `RAM`, `CORES`, `IP`, `GW`, `BRIDGE`, `PORT`, `BRANCH`) står i [docs/installasjon.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/installasjon.md#proxmox-automatisk-lxc).

    Etterpå: `pct enter <ctid>`, så `nano /opt/homelab-os/.env` og `cd /opt/homelab-os && docker compose up -d`.

=== ":material-server: Unraid"

    1. Kopier [`deploy/unraid/homelab-os.xml`](https://github.com/SebastianKristo/torskenes-verden/blob/main/deploy/unraid/homelab-os.xml) til `/boot/config/plugins/dockerMan/templates-user/`.
    2. Gå til **Docker → Add Container** og velg malen `homelab-os`.
    3. Fyll inn `SESSION_SECRET`. La `APP_PASSWORD_HASH` stå tom for oppsett i nettleseren.

    Imaget er `ghcr.io/sebastiankristo/torskenes-verden`, og data havner i `/mnt/user/appdata/homelab-os`.

## .env

Bare grunnoppsettet **må** stå i `.env`. Nesten alt annet legges inn i **Innstillinger → Integrasjoner** etter første innlogging, og verdiene der overstyrer `.env`.

| Variabel | Må settes | Eksempel | Forklaring |
|---|:-:|---|---|
| `SESSION_SECRET` | ✅ | `openssl rand -hex 32` | Minst 32 tegn. Brukes til sesjoner og som grunnlag for krypteringsnøkler. |
| `APP_PASSWORD_HASH` | | tom | Tom gir førstegangsoppsett i nettleseren. Eller lag en hash med `scripts/hash-password.js`, se under. |
| `USER_NAME` | | `Sebastian` | Visningsnavn for eieren når `APP_PASSWORD_HASH` brukes. Brukernavnet blir `sebastian`. |
| `COOKIE_SECURE` | | `true` | Sett `false` **bare** når du bruker `http://` uten TLS. Ellers kastes du ut rett etter innlogging. |
| `BIND_ADDR` | | `127.0.0.1` | `0.0.0.0` gjør appen synlig på LAN. |
| `HOST_PORT` | | `3000` | Porten på verten. |
| `PUID` / `PGID` | | `1000` / `1000` | Eier av `data/`. Unraid bruker `99` / `100`. |
| `CLOUDFLARE_TUNNEL_TOKEN` | | `eyJhIjoi…` | Token for `cloudflared` (profil `tunnel`). |
| `TOTP_ENC_KEY` / `SECRET_KEY` | | 64 hex-tegn | Valgfrie. Uten dem avledes nøklene fra `SESSION_SECRET`. |
| `MOCK_DATA` | | `1` | Eksempeldata uten eksterne kall. Bare for testing. |

!!! warning "Viktig"

    Bytter du `SESSION_SECRET` uten å ha satt `TOTP_ENC_KEY` og `SECRET_KEY`, kan ikke lagrede 2FA-hemmeligheter og nøkler leses lenger. Sett dem eksplisitt hvis du vil kunne rotere sesjonshemmeligheten, og ta vare på dem sammen med backupen.

**Eier-konto fra `.env` i stedet for oppsett i nettleseren:**

```bash
docker compose run --rm --entrypoint node os scripts/hash-password.js 'et-langt-passord'
# → APP_PASSWORD_HASH=scrypt:…   (lim hele linja inn i .env)
```

Hashen bruker `:` som skilletegn, så den kan limes rett inn uten anførselstegn.

Alle miljøvariablene står i [docs/konfigurasjon.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/konfigurasjon.md).

## Porter og nettverk

| Situasjon | `.env` | Adresse |
|---|---|---|
| Bare på serveren selv (eller bak tunnel) | standard (`BIND_ADDR=127.0.0.1`) | `http://localhost:3000` |
| Fra LAN med http | `BIND_ADDR=0.0.0.0`, `COOKIE_SECURE=false` | `http://192.168.1.60:3000` |
| Annen port på verten | `HOST_PORT=8080` | `http://192.168.1.60:8080` |
| Fra internett | Cloudflare Tunnel eller reverse proxy med https | `https://os.example.no` |

Inne i containeren lytter appen alltid på port `3000`.

!!! warning

    **Ikke bruk portviderekobling i ruteren.** Bak Docker kan trafikk utenfra se ut som en `172.x`-adresse og bli regnet som lokal, og da kan «pålitelig enhet» slippe noen inn uten passord. Bruk Cloudflare Tunnel.

## Cloudflare Tunnel (anbefalt)

Med en tunnel trenger du ingen åpne porter.

1. Gå til **Cloudflare Zero Trust → Networks → Tunnels → Create tunnel** og velg **Cloudflared**.
2. Kopier tokenet fra installasjonskommandoen (teksten etter `--token`). Lim det inn i `.env`:
    ```bash
    CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
    ```
3. Under **Public Hostname**: legg til `os.example.no` med tjeneste **HTTP** og URL `os:3000`. `os` er navnet på tjenesten i compose.
4. Start: `docker compose --profile tunnel up -d --build`.
5. Åpne `https://os.example.no`. La `COOKIE_SECURE=true` stå.

**Cloudflare Access (valgfritt, men anbefalt):**

1. **Access → Applications → Add an application → Self-hosted**, med domenet `os.example.no`.
2. Lag en policy **Allow** for e-postadressene til familien.
3. Lag en policy **Bypass** for stiene som skal være åpne:
    - `/cv*` og `/assets/*` hvis CV-en skal være offentlig.
    - Appene snakker med `/finans/api/*`, `/api/*` og `/tiles/*` med sitt eget token. Gi dem **Bypass**, eller bruk et service token. Ellers stopper Access appene før de når innloggingen.

Bak Cloudflare leses klientens IP fra `CF-Connecting-IP`, aldri fra `X-Forwarded-For`.

## Egen reverse proxy (Caddy eller Nginx)

Bruker du egen proxy i stedet for tunnel, husk tre ting:

- **WebSocket** på `/api/ws` (sanntid for huskeliste, familie og sporing).
- **Lange forespørsler:** AI-søk og Ollama kan bruke over ett minutt, og jobbstatus strømmes med SSE. Sett tidsgrensen til minst 5 minutter, og slå av buffering.
- **`X-Forwarded-Proto` og `X-Forwarded-Host`** må sendes videre. Google Kalender bygger omdirigeringsadressen ut fra dem.

=== "Caddy"

    `Caddyfile`. Caddy ordner https selv.

    ```caddy
    os.example.no {
        reverse_proxy 127.0.0.1:3000 {
            flush_interval -1
            transport http {
                read_timeout 10m
            }
        }
    }
    ```

=== "Nginx"

    ```nginx
    server {
        listen 443 ssl http2;
        server_name os.example.no;
        # ssl_certificate … / ssl_certificate_key …

        client_max_body_size 50m;          # MAX_UPLOAD_MB er 40 som standard

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 600s;
            proxy_buffering off;
        }
    }
    ```

!!! info

    «Pålitelig enhet på lokalt nett» ser bare på IP-en til tilkoblingen, eller `CF-Connecting-IP`. Står proxyen på samme maskin, ser alle forespørsler lokale ut. Slå da av «Husk denne enheten på lokalt nett» ved innlogging, eller bruk Cloudflare Tunnel.

## Førstegangsoppsett i nettleseren

Når det ikke finnes noen brukere og `APP_PASSWORD_HASH` er tom, viser `/login` et oppsett i fire steg i stedet for innlogging:

1. **Navnet ditt.** Du blir hovedadmin.
2. **Navnet på serveren**, for eksempel «Homelab». Det vises i menyen og i appene.
3. **Brukernavn og passord.** Brukernavnet har 2–32 tegn (a–z, 0–9, `.`, `-`, `_`), og passordet minst 8 tegn.
4. **Bakgrunn:** Oslo, Vær, Planeter eller Ingen.

Etterpå er du logget inn med Papir-design. Oppsettet virker bare én gang. Når den første brukeren finnes, svarer `/api/setup` med 409.

**FinansHub første gang:** når du åpner `/finans/` med tom database, velger du mellom **Start tom**, **Hent fra SMB-share**, **Last opp backupfil** og **Eksempeldata**.

## Sjekkliste etter installasjon

- [ ] `curl http://localhost:3000/healthz` svarer `ok`
- [ ] Innstillinger → Konto: slå på **2FA** og lagre gjenopprettingskodene
- [ ] Innstillinger → Integrasjoner: AI, vær (MET), Entur og det andre du bruker, se [Integrasjoner](../bruk/integrasjoner.md)
- [ ] Innstillinger → Kalendere: skole-iCal og Google Kalender, se [Kalender og Bursdager](../bruk/kalender-og-bursdager.md)
- [ ] Innstillinger → Brukere: legg til familien, se [Brukere og personvern](brukere-og-personvern.md)
- [ ] FinansHub → Innstillinger → Backup og data: sett opp **automatisk backup**, se [Oppdatering og backup](oppdatering-og-backup.md)
- [ ] Installer appene, se [Mobilapper](mobilapper.md)
