# Sikkerhet (prompt 51)

Innstillinger → **Sikkerhet** samler passkeys, nye enheter, innloggingsloggen, nøkler og (for admin) sperrer, logg-skanner og regler.

## Hva det gjør

- **Passordregelen er uendret.** Passordet hoppes bare over med en pålitelig enhet *og* en lokal adresse fra selve tilkoblingen
  eller Cloudflare. Nytt: `CF-Connecting-IP` godtas bare når tilkoblingen kommer fra lokalt nett/Docker (cloudflared). Er porten
  nådd rett fra internett, gjelder den ekte adressen – en klient kan ikke late som den er hjemme. Fra internett kreves alltid
  passord eller en passkey.
- **Passkeys (WebAuthn).** Logg inn med Face ID, Touch ID, Windows Hello eller sikkerhetsnøkkel. Passkeyen krever at enheten
  bekrefter deg, så den regnes som likeverdig med passord + kode. Passordet virker fortsatt som reserve. En passkey som ser kopiert
  ut (telleren går ikke fremover), avvises, og du får varsel.
- **Nye enheter må godkjennes.** Logger noen inn fra internett på en enhet kontoen ikke har brukt før, venter innloggingen til
  den godkjennes fra en kjent enhet (Innstillinger → Sikkerhet → «Godkjenn») eller av en administrator. Du og administratorene
  får varsel. Innlogging hjemme godkjenner enheten automatisk, og det samme gjør kontoens aller første enhet.
  Nettlesere og apper som var innlogget før oppdateringen, blir kjente enheter av seg selv.
- **Varsel ved nytt land.** Landet kommer fra Cloudflare (`CF-IPCountry`). Første land som sees, er utgangspunktet.
- **Innloggingslogg.** Tid, IP, land, enhet og måte (passord, kode, passkey, QR, app) for innlogginger, feil passord, sperrer,
  nye enheter og passkeys. Hver bruker ser sin egen; admin kan se alle. Passord og nøkler lagres aldri.
- **Sperrer.** Etter 5 feil fra samme IP sperres innloggingen i 1 min, så 2, 4, 8 … (maks 6 t). Etter 10 feil på samme konto
  sperres kontoen (maks 1 t) – men ikke fra hjemmenettet, så ingen på internett kan stenge deg ute hjemme. QR-koder og
  app-token-utveksling har egne sperrer. Admin ser og låser opp under **Sperrer**.
- **Nøkler og hemmeligheter.** Alder per nøkkel (API-nøkler, `SESSION_SECRET`, integrasjoner) – verdiene vises aldri. Etter
  180 dager (365 for `SESSION_SECRET`) får admin påminnelse. «Roter» lar deg lime inn en ny nøkkel der det går; nøkler fra `.env`
  viser fremgangsmåten.
- **Loggvakt og logg-skanner.** Kjente nøkler og app-tokens maskeres før serveren skriver dem til loggen. Skanneren sjekker
  serverens egen logg, logg-tabeller i databasene, loggfiler i data-mappen og Docker-loggene én gang i døgnet (og med «Skann nå»).

## Hva du må gjøre

1. Sett `PUBLIC_URL` i `.env` til den offentlige https-adressen (f.eks. `PUBLIC_URL=https://os.example.no`). Passkeys gjelder for
   den adressen. Uten den virker passkeys bare på `http://localhost`.
2. Start på nytt: `docker compose up -d os`.
3. Logg inn hjemme én gang på enhetene du bruker, og legg til en passkey i Innstillinger → Sikkerhet.
4. Har du nøkler som bør roteres, lag nye hos tjenesten, lim dem inn under «Roter», og slett de gamle hos tjenesten.

Valgfritt:

- `PASSKEY_ORIGINS=https://app.os.example.no` – flere opphav (underdomener av PUBLIC_URL) som får bruke passkeys.
- Slå av «Nye enheter må godkjennes» eller «Varsel ved nytt land» under Regler (bare admin) – anbefales ikke.

## Kommandoer

```sh
# Ny SESSION_SECRET (logger ut alle; lagrede nøkler i Innstillinger må legges inn på nytt hvis SECRET_KEY ikke er satt)
openssl rand -hex 32
docker compose up -d os

# Tester
node --test test/p51-sec.test.js
```
