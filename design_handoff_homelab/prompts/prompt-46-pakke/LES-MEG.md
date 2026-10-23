# Prompt 46 – pakke til Claude Code

Les `prompt-46.md` først (42 ønsker, ordrett). Hver `claude-code-*.md` er én oppgave. Fasit-design ligger i `design/` (åpne `.dc.html` direkte i nettleser; `support.js` må ligge ved siden av).

## Start her (felles motor)
- `claude-code-glimt-intelligent-agent.md` – felles Glimt-motor (fra prompt 45, gjelder alle Glimt-oppgaver under).
- `claude-code-glimt-finn-og-bruk-data-abonnementer.md` – Glimt skal bruke eksisterende data (abonnementer, finans).
- `claude-code-glimt-vaer-sammensatte-sporsmal.md` – flere delspørsmål i én setning (vær).
- `claude-code-glimt-provperiode-paaminnelse-subscription.md` – «minn meg på å avslutte …» → huskeliste + Subscription OS.

## Feil
- `claude-code-oppdatering-henger-55.md` – serveroppdatering stopper på 55 %.
- `claude-code-claude-import-minne-markdown.md` – Claude-import av minne-eksport (.md).
- `claude-code-media-mobil-utlogget-2.md` – Media sier «Utlogget» på mobil.
- `claude-code-mac-oppdatering-intern-ip.md` – Mac-oppdatering bruker intern Docker-IP.
- `claude-code-chat-nettsok-av.md` – Chat bruker nettet selv om nettsøk er av.
- `claude-code-glimt-kalender-standardkalender.md` – Glimt i Kalender skal bruke standardkalenderen.
- `claude-code-kalender-ny-hendelse-graa-skjerm.md` – grå skjerm ved «+».
- `claude-code-studie-vitnemal-lesing-2.md` – vitnemål leses ikke.
- `claude-code-finans-web-kvittering-over-panel.md` – original kvittering under sidepanelet (web).
- `claude-code-profilbilde-firkant-artefakt-ipad-fold.md` – firkant rundt profilbildet.
- `claude-code-sporing-posten-postnord-fiks.md` – Posten/Bring og PostNord (bygget på ha-parcel-integrations).

## Glimt-forbedringer
- `claude-code-kalender-rask-time-glimt.md` – «Dune på Colosseum kino 17.12 kl 17:30».
- `claude-code-gjoremal-glimt-norsk.md` – bedre norsk i Gjøremål.

## Hjem, navigasjon og iPad/Fold
- `claude-code-hjem-overgang-smooth-ipad-fold.md`, `claude-code-hjem-sok-og-snarveier-separat.md`, `claude-code-profilbilde-glimt-ring.md`, `claude-code-bakgrunn-google-photos-album.md`, `claude-code-mer-tittel-fjern-mellomrom.md`, `claude-code-qr-innlogging-finans-kalender.md`.

## Moduler
- Kart (ny): `claude-code-kart-side.md` → `design/Kart.dc.html`, lagt inn i `Mobil Papir App` (Mer → Kart, `tkart`), `Mer Ny` og `Homelab Papir Web`.
- Vær: `claude-code-vaer-min-posisjon.md`, `claude-code-vaer-modusvelger-liquid-glass.md`, `claude-code-vaer-glimt-uka-ipad-fold.md` → `design/Vaer.dc.html`.
- Nyheter: `claude-code-nyheter-tilbake-haptikk.md`, `claude-code-nyheter-innstillinger-flytt.md`, `claude-code-nyheter-sammendrag-per-kategori.md`, `claude-code-nyheter-kilder-favicon-dropdown.md`, `claude-code-nyheter-egne-kategorier-for-deg.md` → `design/Nyhetsleser.dc.html`.
- Subscription OS: `claude-code-subscription-logg.md`, `claude-code-provperioder-skjul-tom.md` → `design/Subscription OS.dc.html`.
- Bibel: `claude-code-bibel-side-ipad-fold.md` → `design/Bibelvers.dc.html`.
- Familie: `claude-code-familie-ikoner-soner-helse.md`.
- Gjøremål: `claude-code-gjoremal-fullfor-lukker.md` → `design/Huskeliste.dc.html`.
- Ruter: `claude-code-ruter-innstillinger-i-wiggle.md`.

## Åpent
- Ønske 19 («knapp under Glimt-sammendrag i nyheter … medengagn») er ikke avklart, og ingen oppgave er laget. Spør brukeren før du bygger.

## Regler
- Lokal AI via Ollama på Mac mini M4 (16 GB). Ikke bytt til sky-AI som snarvei.
- Alle Entur-, Posten-, PostNord- og Google-kall går via vår server-proxy (CORS, nøkler).
- Rapporter rotårsak, endrede filer og testresultater per oppgave.
