# Musikk i Media (yubal)

Media har en egen fane **Musikk** (`#/media/musikk`). Lim inn et album, en spilleliste eller en sang fra YouTube Music, se en forhåndsvisning, og legg det i køen. [yubal](https://github.com/guillevc/yubal) laster ned med metadata, omslag og sangtekster til musikkbiblioteket (`/music` = `/srv/musikk` på verten), som Navidrome, SUB/WAVE-radioene og Unraid leser.

```
Nettleser / app ──▶ Homelab OS  /api/media/yubal/*  (server/yubal.js, samme tilgang som Media)
                          │  adressen blir på serveren
                          ▼
                    yubal :8010 (arr-containeren, CT 106) ──▶ hoved-Gluetun (Proton VPN) ──▶ YouTube Music
```

yubal har ingen innlogging. Homelab-serveren er derfor eneste vei inn fra appene, og adressen sendes aldri til nettleseren. Ikke åpne port 8010 mot internett.

## Oppsett

Innstillinger → Integrasjoner → **Musikk (yubal)** (bare admin):

- **Adresse:** for eksempel `http://10.69.1.244:8010`. Miljøvariabelen `YUBAL_URL` kan brukes i stedet.

«Test tilkobling» kaller `/api/health` og viser når neste automatiske synk av spillelistene kjører.

**Format og kvalitet** er felles for hele containeren, ikke et valg per nedlasting. Endre under yubal i `/opt/arr/docker-compose.yml`:

- `YUBAL_AUDIO_FORMAT`: `m4a` (YouTube sin AAC uten omkoding, anbefalt), `mp3` (omkodet, litt dårligere) eller `opus` (minst)
- `YUBAL_AUDIO_QUALITY`: `0` = best … `10`

Deretter `cd /opt/arr && docker compose up -d --force-recreate`.

## Fanen

- **Last ned musikk:** lenkefelt → «Forhåndsvis» viser omslag, tittel, artist, år, type, antall spor og kildens kvalitet («Kilde: opus · 128 kbps»). Velg «Alle spor» eller «Bare de første N». For spillelister kan du slå på «Følg spillelisten», da følges lista og første synk starter med en gang.
- **Køen:** omslag, tittel – artist, status (Venter, Henter info, Laster ned, Importerer, Ferdig, Feilet, Avbrutt), fremdrift, «12 lastet ned · 1 feilet · 3 hoppet over», Manuell/Automatisk, Avbryt/Fjern og «Fjern ferdige».
- **Spillelister du følger:** neste automatiske sjekk, «Synk alle», og per liste av/på, «Synk nå» og «Slutt å følge». Trykk på en liste for å se sangene (én åpen om gangen): LASTET NED, FINNES ALT, FEILET eller IKKE SYNKET.

Siden oppdateres hvert 2. sekund mens noe står i køen, ellers hvert 10. sekund, og stopper når fanen ikke vises.

## API

| Rute | |
|---|---|
| `GET /api/media/yubal/status` | `{configured, format, scheduler}` |
| `GET /api/media/yubal/info?url=` | forhåndsvisning `{info: {title, artist, year, track_count, kind, thumbnail, audio_codec, audio_bitrate, url}}` |
| `GET` · `POST /api/media/yubal/jobs` | køen (nyeste først) · `{url, max_items?}` |
| `POST …/jobs/:id/cancel` · `DELETE …/jobs/:id` · `DELETE …/jobs` | avbryt, fjern, fjern ferdige |
| `GET` · `POST /api/media/yubal/subscriptions` | spillelister du følger · følg `{url, max_items?}` |
| `PATCH …/subscriptions/:id` `{enabled}` · `DELETE …/subscriptions/:id` | av/på, slutt å følge |
| `POST …/subscriptions/:id/sync` · `POST …/subscriptions/sync` | synk én eller alle |
| `GET …/subscriptions/:id/tracks` | `{tracks: [{title, artist, duration, status}], total, available, summary, message?}`, mellomlagret i 60 s |
| `GET /api/media/yubal/bilde?u=` | omslag fra YouTube sine bildeverter, mellomlagret i 24 timer |

Ikke satt opp: GET svarer `200 {configured: false, message}`. Bare lenker fra `music.youtube.com`, `youtube.com`, `www.youtube.com`, `m.youtube.com` og `youtu.be` godtas. `max_items` er et heltall 1–10000. Id-er er UUID-er. 409 «køen er full» kommer frem som norsk tekst.

### Sanger i en spilleliste

yubal har ikke et eget endepunkt for sangene i et abonnement. Serveren bygger lista fra siste jobb for abonnementet (`download_stats`) og `/api/info?url=<lista>`. Dagens yubal gir bare antall spor i `/api/info`, ikke selve sporlista, så da vises bare oppsummeringen fra siste synk og teksten «Sanglista er ikke tilgjengelig fra yubal». Gir yubal en sporliste (`tracks`), brukes den, med status per sang når yubal sender det.
