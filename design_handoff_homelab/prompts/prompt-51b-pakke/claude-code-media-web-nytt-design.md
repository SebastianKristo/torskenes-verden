# Media på web: nytt design (4 sider)

Fasit: `Media Web.dc.html` (samlet, brukes i `Homelab Papir Web.dc.html`; «‹ Tilbake» lukker). Erstatter web-varianten av `Media.dc.html`; mobil er uendret. Enkeltsidene:
- `Media Web Oversikt.dc.html`: Spilles nå (mørkt kort), Tjenester (Sonarr, Radarr, qBittorrent, Prowlarr, Plex, Jellyfin med status, Prowlarr-varsel med «Se kilder»/«Oppdater»), 4 nøkkeltall, Klar til å se, Neste 7 dager.
- `Media Web Kalender.dc.html`: Uke 44 med dager, Uka i tall, Ikke overvåket.
- `Media Web Bibliotek.dc.html`: serier og filmer.
- Nedlastinger (nytt design, kun i `Media Web.dc.html`): toppkort Ned/Opp + fartsgraf siste 2 t (48 søyler) + Alt-hastighet/Pause alt/+ Magnet-lenke · filterfaner Alle/Laster ned/I kø/Ferdige/Står fast med antall · sortering Nyeste/Størst · én linje «Ingenting laster ned. Neste ventede …» med lenke til Kalender · ferdige gruppert I dag / I går / Tidligere denne uka (plakat, tittel, episode, kvalitet, størrelse, Deler · ratio, tidspunkt, ▶ Plex, ⋯) · avkrysning per rad gir mørk handlingslinje (Stopp deling, Slett med filer) · høyre: Lagring (Serier/Filmer/bare deling, «Rydd ferdige over 30 dager») og Kilder (proxy-varsel + Prowlarr-oppdatering, indeksere med ms, Test alle, + Indekser). Aktive nedlastinger vises som rader med fremdrift, fart og ETA øverst i lista. `Media Web Nedlastinger.dc.html` er den gamle versjonen.

## Felles
- Topp: «Media» (Newsreader 34) · fanepille Oversikt / Kalender / Bibliotek / Nedlastinger (aktiv = mørk) · Spør Glimt-felt med ⌘K · varselknapp.
- Bakgrunn `#F3F0E9`, kort `#FCFBF7` med kant `#E3DED3`, radius 18–24, Inter for tekst, Newsreader for titler, JetBrains Mono for tall/teknisk.
- Fanene er egne ruter: `/media`, `/media/kalender`, `/media/bibliotek`, `/media/nedlastinger`. Mus fram/tilbake skal fungere.
- Maks bredde 1360 px, flyter ned til én kolonne på smal skjerm.

## Behold fra dagens Media
- Felles servervelger (Hjemme/Hytta) for alle tjenester: legg den i topplinja ved varselknappen.
- Legg til serie/film, serieside med sesonger/episoder, interaktivt søk, last ned på nytt, slett episode, magnet-lenke, legg til indekser: åpnes fra Bibliotek/Nedlastinger som før.
- Glimt-forslag med Tab/↑↓/Esc i søkefeltet.
- Data: ekte verdier fra Sonarr/Radarr/qBittorrent/Prowlarr/Plex/Jellyfin; tallene i fasiten er eksempler.
- Mørkt tema: følg valgt tema som resten av web.
