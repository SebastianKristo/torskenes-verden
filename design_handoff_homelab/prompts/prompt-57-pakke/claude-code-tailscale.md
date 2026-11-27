# Tailscale i Homelab OS (torskenes-verden)

Design (Papir): `Tailscale Tailnet.dc.html`
- 1a: Nettverk → Tailnet (web 1440, klikkbar)
- 1b: Enhetsdetalj-popup
- 1c: Glimt-svar (nede / IP / offline)
- 2a: Mobil 390: liste (Mer → Tailnet), detaljark, Glimt

Plassering i appene (fasit):
- Web: `Homelab Papir Web.dc.html` → fanen Nettverk. Tailnet-seksjonen ligger øverst, over den eksisterende Nettverk-oversikten (Internett, klienter, ping). Popupen legger seg over hele siden.
- Mobil: `Homelab.dc.html` → Mer → **Tailnet** (undertekst «Tailscale · 12 av 16 enheter online»), rett før Media. Egen side med tittel «Tailnet». Trykk på en enhet folder ut detaljen i lista (felter, latens, oppetid, Ping nå / Kopier IP / Kopier SSH).

## Designtillegg (fra fasiten)
- Overskrift i fanen: overline i kursiv «Tailscale · LocalAPI · oppdatert nå» + tittel «Tailnet» (Newsreader).
- Stat-rad: 5 kolonner med 2 px strek over, mono-etikett i aksent, tall i Newsreader 38 px, undertekst dempet.
- Verktøylinje: søk (280 px) · filterpiller med antall (valgt = mørk pille) · til høyre segmentert «Grupper: Ingen / Tags / Eier».
- Gruppert visning: mono-overskrift «TAG:SERVER · 5» over hver gruppe.
- Brikker: hvit bakgrunn, 1 px kant, latens i mono til høyre før statusprikken. Offline: opacity .55, «sist sett 3 d». Mobil uten ping: «ukjent» dempet.
- Under gridet, to kort side om side: **Vedlikehold** (ikonbrikke + tittel + mono-detalj + handling til høyre) og **Trafikk i dag** (topp 5, stablet stolpe ned/opp: ned = blekk, opp = aksent).
- Popup 760 px: hode med ikon, navn, statusprikk og tilstand · faktarutenett i to kolonner · latens-sparkline 24 t med median/p95 · oppetidsstripe 30 d (30 felt: blekk = oppe, gul = delvis, aksent = nede) med 24 t / 7 d · tjenester som piller · knapper Ping nå (viser «Pinger …» → «Svar på 2 ms» / «Ingen svar»), Kopier IP, Kopier SSH-kommando, Åpne ↗ · SSH-kommandoen vist i mono til høyre.
- Grønn kun i statusprikker (også i tjenestepillene).
- Glimt: svar i Newsreader, deretter strukturert vedlegg (enhetsbrikker, IP-tabell med Kopier, eller oppetidsstripe), og «Kilde: Tailscale · lest 14:52».
- Mobil: 2×2 stat-rutenett, søk, horisontalt rullende filterpiller, liste-rader 60 px, maks 8 + «Vis alle N», Vedlikehold som én rad med antall. Detalj som bunnark med de viktigste feltene, sparkline, stripe, Ping nå (full bredde) + Kopier IP / Kopier SSH.

---

Lim inn alt under streken i Claude Code, åpnet i repoet SebastianKristo/torskenes-verden.

Legg til Tailscale som integrasjon i Homelab OS. Den skal gi en oversikt over tailnetet med statistikk på Nettverk-fanen (#/nettverk), et kort på Hjem, data til Glimt og push når noe går ned. Følg mønstrene som allerede finnes i repoet, og les dem før du skriver kode:

- server/integrations.js: cached() og getHealth()
- server/integrations-api.js og server/settings.js: konfigurasjon, test-knapp og hemmeligheter
- server/docker45.js og server/health42.js / server/health45.js: hvordan tjenestestatus hentes og vises
- server/realtime.js: sanntid til klientene
- server/notify.js: push via ntfy og APNs
- public/js/app.js: Nettverk-fanen
- server/fermion53/config.js: regelen om bare lokale adresser (100.64/10 er allerede godkjent)
- docs/homelab.md: dokumentasjonen

Hold deg til norsk tekst, eksisterende designtokens, begge temaene («Nåværende» og «Papir»), testene i test/ og stilen i DECISIONS.md.

## 1. Datakilde: to moduser, valgt automatisk

Lag server/tailscale.js.

**A. LocalAPI (foretrukket).** Hvis /var/run/tailscale/tailscaled.sock finnes, gjør du HTTP over unix-socket:

- GET /localapi/v0/status gir peers, Online, LastSeen, OS, HostName, DNSName, TailscaleIPs, CurAddr, Relay, RxBytes/TxBytes, ExitNode og KeyExpiry.
- POST /localapi/v0/ping?ip=…&type=disco gir latens, og om forbindelsen er direkte eller via DERP.

Header: Host: local-tailscaled.sock. Ingen nøkkel trengs.

I docker-compose.yml legges et kommentert eksempel med volum /var/run/tailscale:/var/run/tailscale:ro. Det forutsetter at tailscale kjører på verten eller i LXC-en.

**B. Tailscale API (reserve, eller for hele tailnetet fra en maskin uten tailscale).**

- GET https://api.tailscale.com/api/v2/tailnet/-/devices?fields=all
- Autentisering med OAuth-klient (devices:core:read) eller API-nøkkel, lagret som hemmelighet i innstillingene, aldri i klienten.
- Gir lastSeen, clientVersion, updateAvailable, keyExpiryDisabled, expires, tags, user og addresses.

Begge modusene normaliseres til samme modell:

```js
{ id, name, host, dns, ip, ipv6, os, kind, user, tags, online, lastSeen,
  self, exitNode, tunnel /* 'direkte' | 'derp:osl' | null */, latencyMs /* null = ukjent */,
  rx, tx, clientVersion, updateAvailable, keyExpiry, expiresInDays }
```

kind klassifiseres ut fra OS og vertsnavn:

| kind | Treff | Ikon (lucide) |
|---|---|---|
| server | linux, unraid, proxmox, truenas | server |
| desktop | windows, macOS på desktop | monitor |
| laptop | macbook | laptop |
| mobile | iOS, android | smartphone |
| tablet | iPadOS / ipad | tablet |
| iot | homeassistant, esp, shelly, pikvm | cpu |

Cache med cached('tailscale', 30_000, …).

Latens pinges i bakgrunnen hvert 3. minutt, bare for online-enheter som ikke er mobil.

Når en enhet går online eller offline, sendes tailscale.node via realtime.js.

## 2. Statistikk som lagres over tid

Lag en ny SQLite-tabell tailscale_samples(ts, device_id, online, latency_ms, tunnel, rx, tx). Den skrives hvert 5. minutt, og data eldre enn 90 dager slettes nattlig. Vis følgende:

- Oppetid per enhet: 24 t, 7 d og 30 d (andel prøver online).
- Latens: median og p95 per enhet siste 24 t, med sparkline.
- Direkte mot DERP: andel tid og hvilken relay.
- Trafikk: rx/tx per enhet (delta mellom prøver), toppliste og total per dag.
- Tailnet totalt: enheter, online nå, nye enheter siste 7 d og frakoblet over 30 d (kandidater for opprydding).
- Vedlikehold:
  - nøkler som utløper innen 14 dager
  - klienter med updateAvailable
  - avvikende klientversjon mot self
  - exit-node i bruk

## 3. Standardfunksjoner (alle har dem, så skal Homelab OS også ha dem)

- Enhetsliste med søk (navn og IP), filterpiller (Alle / Servere / Datamaskiner / Mobil / Offline, med antall), sortering (online først, deretter navn) og gruppering etter tags eller eier.
- Mobil og nettbrett skjules som standard bak filteret Mobil.
- Offline-enheter vises med opacity .55 og «sist sett 3 d» i stedet for latens.
- Ukjent latens står som «ukjent» i dempet farge, aldri «–».
- Enhetsdetalj i popup (samme popup-mønster som resten av dashboardet):
  - IPv4 og IPv6, MagicDNS, OS og klientversjon
  - tunnel og relay, latensgraf, oppetidsstripe for 30 d og trafikk
  - nøkkelutløp og tags
  - knappene Ping nå, Kopier IP, Kopier SSH-kommando (ssh root@<magicdns>) og Åpne (hvis enheten finnes som tjeneste i Nettverk-fanen)
- Kobling til eksisterende tjenester: tjenester i helsesjekken som har en 100.x-adresse eller et MagicDNS-navn, knyttes til enheten sin og vises samlet.
- Varsler via notify.js. Hvert varsel kan slås av og på per enhet:
  - en server er offline i mer enn 10 min
  - en nøkkel utløper om 7 dager
  - en ny enhet har dukket opp på tailnetet
  - en enhet har gått over til DERP i mer enn 1 t
- Hjem-flis «Tailnet»: online/totalt, en liten donut per type, «siste endring» og varsel-prikk ved problemer. Den følger flismønsteret, så den kan flyttes og skjules, med halv eller full bredde på mobil.
- Glimt-verktøy: «hvilke maskiner er nede?», «hva er IP-en til unraid?» og «hvor lenge har hytta vært offline?». Registrer det som et lese-verktøy på samme måte som de andre Glimt-integrasjonene. Bare lesing, ingen endringer.
- ⌘K-søk: enheter dukker opp i det felles søket.
- Innstillinger → Integrasjoner → Tailscale:
  - modus (auto / LocalAPI / API) og OAuth-klient eller API-nøkkel (hemmelighet)
  - pingintervall og hvilke varsler som er på
  - Test-knapp som bruker testByIdOrName
  - Bare admin har tilgang.
- Mobilappene (iOS og Android) bruker samme /api/tailscale/*. Lag endepunktene først. Hvis appene har et Nettverk- eller Mer-felt, legg til en enkel liste. Ellers lager du bare API-et og noterer det i docs/.

## 4. API (admin, requireAdmin)

- GET /api/tailscale/devices gir den normaliserte listen og counts (total, online, offline, per kind).
- GET /api/tailscale/devices/:id gir detalj og historikk (?range=24h|7d|30d).
- POST /api/tailscale/devices/:id/ping
- GET /api/tailscale/stats gir tall for hele tailnetet, vedlikeholdslister og toppliste for trafikk.
- GET /api/tailscale/test brukes av integrasjonstesten.

## 5. UI på Nettverk-fanen

Seksjonen «Tailnet» øverst i fanen:

- Stat-rad: online/total, median latens, andel direkte, trafikk i dag og antall vedlikeholdspunkter.
- Enhetsgrid: repeat(auto-fill,minmax(220px,1fr)), brikker på 52px med radius 999px, ikonsirkel på 32px, navn med ellipsis, IP i mono 11px og statusprikk. Grønn brukes bare til statusprikker.
- Vis-grense: maks 12 brikker, deretter «Vis alle N».
- Vedlikehold-kort: utløpende nøkler, oppdateringer og enheter som har vært frakoblet over 30 d.
- Lagring: filter, søk og åpen/lukket-tilstand lagres per bruker på serveren, slik som layouten.
- Oppdatering: sanntid via tailscale.node, uten polling i klienten.

## 6. Sikkerhet og krav

- Nøkkelen forlater aldri serveren og logges aldri.
- Bare admin har tilgang. Vanlige brukere ser ikke fanen.
- Ingen skrivende kall mot Tailscale. Ikke slett, autoriser eller endre ACL. Dette er bare en oversikt.
- Unix-socketen åpnes bare lesende. Feil gir en tydelig norsk melding, for eksempel «Fant ikke tailscaled.sock – mount /var/run/tailscale eller bruk API-nøkkel».

## 7. Tester og dokumentasjon

- Enhetstester i test/: normalisering fra begge kildene (lag fixtures fra ekte status- og devices-JSON, uten hemmeligheter), klassifisering av kind, oppetid og p95, og varselreglene. Testene kjører uten nett via no-net.mjs.
- Dokumentasjon:
  - nytt avsnitt i docs/homelab.md under Nettverk
  - docs/konfigurasjon.md med OAuth-scope og mount
  - oppføring i CHANGELOG.md
  - én linje i DECISIONS.md om valget LocalAPI først og API som reserve

Avslutning: Kjør npm test. Kjør også npm run test:visual hvis det finnes skjermbildetester for Nettverk-fanen.

Lever i små commits:

1. kilde og normalisering
2. lagring og statistikk
3. API
4. UI
5. varsler, Glimt og søk
6. dokumentasjon
