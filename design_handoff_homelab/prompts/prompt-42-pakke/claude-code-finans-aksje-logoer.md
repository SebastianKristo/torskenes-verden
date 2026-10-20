# Finans web → Aksjer: vis logo for aksjer og fond

Vedlegg: `uploads/Screenshot 2026-10-20 at 18.46.11.png`. Posisjonslista viser i dag bare en farget brikke med tickeren («VUAG», «VHYL») og rå instrument-id («VUAGl_EQ», «VHYLl_EQ»).

## Ønsket
- Hver posisjon viser **ekte logo** i den runde brikken (48 × 48, radius 14, samme plass som i dag). Logoen ligger på hvit/kremfarget flate (`#fffdf8`, 1 px `--line`) med 8 px innvendig luft, så mørke og transparente logoer synes. I mørkt tema: flate `#f3efe6`.
- **ETF-er og fond** får **utstederens** logo (Vanguard, iShares/BlackRock, Xtrackers/DWS, SPDR, Amundi, Invesco, DNB, KLP, Storebrand, Nordnet, Handelsbanken, ODIN, Holberg, Skagen, Alfred Berg).
  - Liten tickermerkelapp nede til høyre på brikken (IBM Plex Mono 700, 8,5 px, f.eks. «VUAG»), så to Vanguard-fond kan skilles.
- **Enkeltaksjer** får selskapets logo (Equinor, DNB, Apple, Nvidia …).
- Fallback: dagens monogram-brikke (tickerens første 3–4 tegn, farget tint). Ikke globus- eller tomt ikon.
- Samme logo brukes overalt der aksjen vises: Aksjer-lista, detaljsiden, transaksjoner (kjøp/salg/utbytte), Glimt-svar, Oversikt-kort og widgets.

## Undertittel
Erstatt rå id («VUAGl_EQ») med lesbar tekst: **«VUAG · London · USD»** (ticker · børs · valuta). Børs fra suffiks/metadata (`l` = London, `d` = Xetra, `_US_EQ` = USA, `.OL` = Oslo).
- Trading 212-format `TICKER` + børsbokstav + `_EQ`: `VUAGl_EQ` → `VUAG`, London.
- Rå id kan vises i detaljsiden under «Instrument».

## Oppslag av logo (backend, caches permanent)
Bruk `ISIN` som nøkkel. Hent den fra meglerens instrument-API (Trading 212 `/equity/metadata/instruments`, Nordnet), ellers OpenFIGI (`POST /v3/mapping` med ticker + børs).
I rekkefølge:
1. **Internt logobibliotek** (`backend/logos/registry.json`, se `claude-code-logobibliotek.md`). Legg til en `aksjer`-seksjon med utstedere og de vanligste selskapene på Oslo Børs og i USA, med `isin_prefix`/`issuer`-felt.
2. **Etter ISIN:** `https://assets.parqet.com/logos/isin/{ISIN}?format=png&size=128`.
3. **Etter ticker (USA):** `https://financialmodelingprep.com/image-stock/{TICKER}.png`.
4. **Etter domene:** finn selskapets/utstederens nettside (metadata, Wikidata `P856`) og bruk logokjeden i logobiblioteket (apple-touch-icon → manifest → favicon 128).
5. Ingen treff → monogram. Lagre bomtreff som `{fail: tidspunkt}` og prøv igjen etter 7 dager.
- ETF: avgjør utsteder fra navnet («Vanguard», «iShares» …) eller ISIN-utsteder, og bruk utstederens logo.
- Lagre som `/data/logos/aksjer/{ISIN}.png` (128 px, PNG, transparent hvis mulig). Endepunkt `GET /api/finans/aksjer/logo/{ISIN}` med `Cache-Control: max-age=2592000`.
- Avvis bilder under 32 px og generiske ikoner (hash-sjekk, samme som logobiblioteket).

## Visning (web)
- `<img loading="lazy" decoding="async">` med `object-fit: contain`. Vis monogrammet til bildet er lastet (ingen hopp eller blink), og tone inn logoen på 0,15 s.
- `alt` = selskaps- eller fondsnavn.
- Gjelder også iOS/Android-appen (samme endepunkt, `AsyncImage` / Coil med disk-cache).

## Test
- VUAG og VHYL viser Vanguard-logo med hver sin tickermerkelapp. Undertittel «VUAG · London · USD».
- Equinor, DNB, Apple og Nvidia viser selskapslogo.
- Et ukjent småselskap viser monogram, og ingen feil i konsollen.
- Mørkt tema: logoene står på lys flate og er lesbare.
