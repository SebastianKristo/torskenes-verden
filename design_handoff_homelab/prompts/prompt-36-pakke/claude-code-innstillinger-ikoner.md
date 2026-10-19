# Innstillinger (mobil + web): ikon på hver rad

Ønske 2026-10-19: «i innstillinger mobil og pc legg til ikoner og slik for de fleste ting som her i backup. gå igjennom innstillinger-menyene og legg til ikoner». Vedlegg: `uploads/Screenshot 2026-10-19 at 22.17.14.png` (Backup: STATUS / AUTOMATISK, rader uten ikon).

## Radmal
- **Ikonbrikke** til venstre i hver rad: 34 × 34 (mobil 30 × 30), radius 10, bakgrunn = sidens farge (samme som i sidemenyen) med 12 % opasitet, ikon 18 px i sidens farge, strek 2.
  - Lucide-ikoner (`lucide-react` / `lucide-react-native`), eller SF Symbols på iOS.
- Tekst (tittel + undertekst) flyttes 14 px til høyre for brikken. Skillelinjen starter under teksten, ikke under ikonet (iOS-stil).
- **Status-rader** (OK/Feil): brikken blir grønn (`#2f7d4f`) eller rød (`#b23a2a`) etter status.
- **Farlige handlinger** (Logg ut, Slett, Fjern, Tilbakestill): rød brikke og rød tittel.
- Rader med bare en verdi (Brukernavn, Rolle) får også ikon, så alt står på linje.
- Seksjonsoverskriftene (STATUS, AUTOMATISK …) beholdes uten ikon.

## Ikon per rad (Lucide-navn)
**Konto:** Navn `user` · Brukernavn `at-sign` · Rolle `shield` · Profilbilde `image` (viser miniatyr i stedet når satt) · Totrinnsbekreftelse `key-round` · Pålitelig enhet `laptop` · Pålitelige enheter `monitor-smartphone` · Passord `lock` · Økter `history` · Logg ut overalt `log-out` (rød)
**Utseende:** Tema `sun-moon` · Fargetema `palette` · Bakgrunn `image` · Tekststørrelse `type` · Språk `languages` · Reduser bevegelse `move` · App-ikon `app-window`
**Startside:** Widgets `layout-grid` · Rekkefølge `grip-vertical` · Kolonner `columns-3` · Nyhetslinje `newspaper` · Hilsen `hand`
**Domener:** Domene `globe` · Cloudflare-token `cloud` · Search Console `search` · Glimt-oppsummering `sparkles` · Varsler ved nedetid `activity`
**Varsler:** Push `bell` · E-post `mail` · Stille timer `moon` · Kalender `calendar` · Pakker `package` · Prøveperioder `timer` · Backup feiler `hard-drive` + `alert-triangle` (badge) · Oppdateringer `download`
**App:** Face ID / biometri `scan-face` · Haptikk `vibrate` · Widgets `smartphone` · Bakgrunnsoppdatering `refresh-cw` · Hurtigtaster `keyboard`
**Integrasjoner:** én brikke per tjeneste med **tjenestens logo** (Plex, Jellyfin, Sonarr, Radarr, Home Assistant, Proxmox, Trading 212, Ruter, Posten …) i hvit brikke med 1 px kant, ikke Lucide.
**Kalendere:** Google `logo` · iCal `link` · Home Assistant `logo` · Farge `circle` (fylt med kalenderfargen) · Skjul i menyen `eye-off`
**Backup (vedlegget):** Siste backup `check-circle-2` (grønn/rød etter status) · Ta backup nå `play` · Automatisk backup `calendar-clock` · Hvor ofte `repeat` · Behold `archive` · Varsle meg når backup feiler `bell-ring` · Mål/nettverksdisk `server` · Hva tas med `list-checks` · Gjenopprett `rotate-ccw` · Kryptering `lock-keyhole`
**AI / Glimt:** Modell `cpu` · Last ned modeller `download-cloud` · Tokens `coins` · API-nøkler `key` · Jobber `list-todo` · Stemme `audio-lines` · Brief `sunrise` · Figur `smile` · Personvern `shield-check`
**System / Nordlys OS:** Versjon `info` · Se etter oppdatering `search` · Automatiske oppdateringer `refresh-ccw` · Krev passord `lock` · Tidligere versjoner `history` · Logg `scroll-text` · Lagring `hard-drive` · Nettverk `network` · Start på nytt `power` (rød)
**Bunnen:** Lås skjermen `lock` · Logg ut `log-out` (rød)

## Øvrig
- Innstillingssøket viser samme ikon foran hvert treff.
- Ingen emoji. Alle ikoner er linjeikoner med samme strek.
- Dark mode: brikke = farge 18 %, ikon = lysere variant av fargen.
- Tilgjengelighet: ikonene er `aria-hidden`, og tittelen bærer teksten.
