# NRK-nedlaster i Media

Media har en egen fane **NRK** (`#/media/nrk`). Lim inn en lenke fra tv.nrk.no eller radio.nrk.no, så lastes programmet ned og legges rett i mediebiblioteket:

| Lenke | Lagres som |
|---|---|
| Episode, sesong eller hel serie | `/data/media/tv/Serie/Season 01/Serie - S01E01 - Tittel.mkv` |
| Film eller enkeltprogram | `/data/media/movies/Tittel/Tittel.mkv` |
| Radio eller podkast | `/data/media/podcast/Serie/2026-11-13 - Tittel.m4a` |

Undertekstene legges inn i fila, og «Følg serien» laster ned nye episoder automatisk.

## Slik henger det sammen

```
Nettleser / app ──▶ Homelab OS  /api/media/nrk/*  (server/nrkdl.js, samme tilgang som Media)
                        │  Bearer-token (bare på serveren)
                        ▼
                    nrk-dl :8020 ──▶ gluetun-nrk ──WireGuard──▶ Proton VPN, Norge ──▶ NRK
```

Selve nedlasteren (`nrk-dl`, yt-dlp + ffmpeg) ligger i [skjold-proxmox-media](https://github.com/SebastianKristo/skjold-proxmox-media) under `apps/nrk-dl`, og settes opp med `bash scripts/ct/nrk.sh`. Den har sin egen VPN-tunnel med kill switch, og sjekker i tillegg at IP-en er norsk før hver jobb. Uten norsk IP står køen stille.

## Oppsett

Innstillinger → Integrasjoner → **NRK-nedlaster** (bare admin):

- **Adresse:** `http://<ip-til-arr-containeren>:8020`
- **API-token:** `NRK_API_TOKEN` fra `/opt/arr/.env` i arr-containeren

«Test tilkobling» sjekker at nedlasteren svarer og at VPN-en går ut i Norge. Tokenet sendes aldri til nettleseren eller appene. Miljøvariablene `NRK_DL_URL` og `NRK_DL_TOKEN` kan brukes i stedet.

## API

| Kall | Hva |
|---|---|
| `GET /api/media/nrk/status` | VPN (land, IP), yt-dlp-versjon, ledig plass |
| `GET /api/media/nrk/jobber` | køen og seriene du følger |
| `POST /api/media/nrk/jobber` | `{url, type: auto\|tv\|film\|radio, kvalitet: best\|1080\|720\|540, folg}` |
| `POST /api/media/nrk/jobber/:id/avbryt` · `/igjen` · `DELETE …/jobber/:id` | avbryt, prøv igjen, fjern |
| `POST /api/media/nrk/rydd` | fjern ferdige fra lista |
| `POST /api/media/nrk/folger` · `POST …/folger/:id/sjekk` · `DELETE …/folger/:id` | følg, sjekk nå, slutt å følge |

Bare lenker til `nrk.no` og `nrksuper.no` godtas, både her og i nrk-dl.
