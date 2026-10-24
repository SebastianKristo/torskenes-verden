# Kvalitet (prompt 51)

Fire ting som gjør det tryggere å endre Nordlys OS: feature flags, krasjrapporter, «Nytt i denne versjonen» og ende-til-ende-tester.

## Feature flags

**Hva det gjør:** nye funksjoner kan slås på for én bruker eller én enhet før alle får dem. Nye flagg er alltid **av** som standard. Har en enhet en egen innstilling, gjelder den. Ellers gjelder brukerens innstilling, og til slutt standarden.

**Hva du gjør:** Innstillinger › System › Kvalitet › **Feature flags** (bare admin). Der kan du lage et flagg, slå det på eller av for alle, og overstyre det for en bruker eller en enhet. Enhetene dukker opp i listen første gang appen eller nettleseren har hentet flaggene.

Appene og web henter flaggene med `GET /api/flags`. Appene sender `X-Device-Id`, og gjerne `X-Device-Name` og `X-Client-Platform`. Web bruker enhetscookien. Innebygde flagg:

| Flagg | Styrer |
|---|---|
| `crash_breadcrumbs51` | Krasjrapporter tar med de siste 20 rutene og klikkene, uten tekst fra felt. |
| `glimt_proactive51` | Proaktiv Glimt (fase 3). |

## Krasjrapporter (GlitchTip)

**Hva det gjør:** feil i web, PWA, appene og serveren sendes til serveren (`POST /api/crash`, maks 64 KB). Før noe lagres, vaskes tokens, nøkler, passord, cookies og e-postadresser bort, og spørring og fragment fjernes fra URL-er. Samme feil innen en time telles opp i stedet for å lagres på nytt.

Rapportene lagres alltid lokalt (maks 2000). Når GlitchTip er satt opp, videresendes de dit. Det skjer bare til en vert i huset. Var GlitchTip nede, sendes rapportene på nytt hvert 10. minutt.

**Se rapportene:** Innstillinger › System › Kvalitet › **Krasjrapporter** (bare admin), eller i GlitchTip.

**Slå på GlitchTip (valgfritt, bruker omtrent 1 GB RAM med Postgres):**

```bash
cd /opt/homelab-os
# 1) Hemmeligheter i .env (aldri i repoet)
echo "GLITCHTIP_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "GLITCHTIP_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "GLITCHTIP_BIND=192.168.1.10" >> .env               # LAN-IP-en til LXC-en, eller la stå 127.0.0.1
echo "GLITCHTIP_PUBLIC_URL=http://192.168.1.10:8010" >> .env
# 2) Start
docker compose --profile glitchtip up -d
# 3) Første bruker (registrering er av)
docker compose exec glitchtip ./manage.py createsuperuser
```

Gå deretter til `http://<LAN-IP>:8010`. Logg inn, lag en organisasjon og et prosjekt («Nordlys»), og kopier DSN-en under Settings › Client Keys. Bytt ut vertsnavnet med `glitchtip:8000`:

```bash
echo "GLITCHTIP_DSN=http://<nøkkel>@glitchtip:8000/1" >> .env
docker compose up -d os
```

GlitchTip skal aldri legges bak Cloudflare uten innlogging. Ligger GlitchTip utenfor huset, må du sette `GLITCHTIP_ALLOW_EXTERNAL=1`. Da forlater krasjrapportene huset.

## Nytt i denne versjonen

**Hva det gjør:** etter en oppdatering viser web et kort med punktene fra siste seksjon i `CHANGELOG.md`, én gang per bruker. «Ok» eller Esc markerer kortet som sett. Du finner det igjen under Innstillinger › System › Kvalitet. Appene bruker `GET /api/whatsnew` og `POST /api/whatsnew/seen`.

## Ende-til-ende-tester

Playwright med Chromium kjører mot en mock-server (`MOCK_DATA=1`, tom datamappe, port 4605, ingen kall ut). Flytene som testes:

- **Innlogging:** feil passord, riktig passord, og krasjrapport fra innloggingssiden.
- **Kvittering:** skann fra nettleseren, rett, bokfør, og se den i FinansHub.
- **Sjekk inn:** forespørsel og svar «👍 Alt bra» i nettleseren.
- **Oppdatering:** System, request.json med bare en id, fremdrift, og «Nytt i» etter ny versjon.
- **Feature flags:** panelet i Innstillinger.

```bash
npm run test:e2e                 # ikke en del av npm test
E2E_PORT=4700 npm run test:e2e   # annen port
```

Playwright er ikke en avhengighet i prosjektet. Testene bruker en global installasjon (`npm i -g playwright && npx playwright install chromium`) eller `PLAYWRIGHT_MODULE=/sti/til/playwright`. Mangler Playwright, hoppes testene over. Mock-serveren kan også startes alene: `node test/e2e51/server.mjs`.
