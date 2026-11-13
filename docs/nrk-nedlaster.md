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

## Fanen

På web brukes hele bredden: «Last ned fra NRK» og «Serier du følger» til venstre, «Køen» til høyre og «Bibliotek» under. På mobil ligger kortene under hverandre i rekkefølgen Last ned → Køen → Serier → Bibliotek.

- **Last ned fra NRK:** lenkefelt, type (Finn ut selv, Serie, Film, Radio), kvalitet, «Følg serien» og «Komprimer (H.265, ca. halv størrelse)». Avkrysningsboksen starter på serverens standard og vises bare når nrk-dl støtter komprimering. VPN-merket er grønt («VPN · NO · ip») eller rødt («VPN stoppet · køen venter»).
- **Køen:** fremdrift, fart og tid igjen. Under komprimering vises «H.265 · crf …» i stedet for fart, og ferdige jobber viser hvor mye plass som ble spart. Når VPN-en ikke er norsk, står køen stille med et rødt banner.
- **Serier du følger:** sist sjekket, «Sjekk nå» og «Slutt å følge».
- **Bibliotek:** plakater for serier, filmer og podkaster som er lastet ned. Trykk på en plakat for sesonger og episoder, «Last ned N som mangler» og «Åpne på NRK».

Køen oppdateres hvert 2. sekund mens noe lastes ned, ellers hvert 10. sekund, og stopper når fanen ikke vises.

Biblioteket og nedlasting av enkeltepisoder krever at nrk-dl har endepunktene `/api/bibliotek` og `/api/serie`. Mangler de, viser kortet «Biblioteket krever en nyere versjon av nrk-dl.», og resten av fanen virker som før.

I appene fyller dyplenken `homelab://media/nrk?url=<nrk-lenke>` ut lenkefeltet i NRK-fanen. Ingenting lastes ned før du trykker «Last ned».

## API

Alt krever innlogging og tilgang til Media. Feil kommer som `{error: "norsk tekst"}`.

| Kall | Hva |
|---|---|
| `GET /api/media/nrk/status` | `{configured, vpn: {ok, ip, land}, komprimer: {standard, crf, preset} \| null, mapper, tall, ledig, bibliotek}`. `bibliotek` er `false` når nrk-dl mangler bibliotek-endepunktene |
| `GET /api/media/nrk/jobber` | køen og seriene du følger. Ferdige jobber kan ha `spart` (bytes) |
| `POST /api/media/nrk/jobber` | `{url, type: auto\|tv\|film\|radio, kvalitet: best\|1080\|720\|540, folg, komprimer?, episoder?}`. `komprimer` (boolean) sendes bare når valget avviker fra standarden. `episoder` er høyst 200 NRK-lenker. 409 betyr at lenken alt ligger i køen |
| `POST /api/media/nrk/jobber/:id/avbryt` · `/igjen` · `DELETE …/jobber/:id` | avbryt, prøv igjen, fjern |
| `POST /api/media/nrk/rydd` | fjern ferdige fra lista |
| `POST /api/media/nrk/folger` · `POST …/folger/:id/sjekk` · `DELETE …/folger/:id` | følg (`{url, type, kvalitet, tittel?, komprimer?}`), sjekk nå, slutt å følge |
| `GET /api/media/nrk/bibliotek` | `{configured, tilgjengelig, elementer}` |
| `GET /api/media/nrk/serie?url=…` | `{configured, tilgjengelig, element}` for én serie, også episoder som ikke er lastet ned. Elementet ligger i tillegg flatt på toppnivå |
| `GET /api/media/nrk/bilde?u=…` | plakaten. Bare `https` fra nrk.no og nrksuper.no, bare bilder, mellomlagres i 24 timer |

Et element i biblioteket:

```
{id, tittel, type: "tv"|"film"|"radio", url, bilde, meta, beskrivelse,
 sesonger: [{nr, episoder: [{nr, tittel, varighet, varighetTekst, url, fil, status}]}]}
```

- `bilde` er en ferdig adresse til bildeproxyen, eller `null`.
- `varighet` er hele sekunder (heltall) eller `null`. `varighetTekst` er den samme varigheten som tekst, for eksempel «42 min».
- `status` er `lastet`, `laster`, `ko` eller `mangler`.
- `beskrivelse` er tom når nrk-dl ikke har en.
- For podkaster er `nr` på sesongen året. En film har alltid én sesong med én episode.

Bare lenker til `nrk.no` og `nrksuper.no` godtas, både her og i nrk-dl. Id-er er 12 hex-tegn.
