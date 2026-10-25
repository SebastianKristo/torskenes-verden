# Søk, onboarding, tema og offline (prompt 51)

## Felles søk
- **Web:** trykk **⌘K** (Mac) eller **Ctrl+K** (Windows/Linux), eller **/** når du ikke skriver i et felt. Sider som selv bruker ⌘K
  (Kalender → Glimt, Gjøremål, Innstillinger, FinansHub) beholder snarveien sin der.
- **PWA / mobil:** dra ned øverst på en side (når den er rullet helt opp), eller åpne `#/sok51`.
- Søker i gjøremål og handleliste, lister, familiekalenderen, kvitteringer, varelinjer og transaksjoner (Glimt-søkedatabasen med
  stemming og synonymer – «tomater» finner «CHERRYTOMAT»), steder, folk, pakker, Studie, chatter, bursdager og sidene i appen.
- Hvert treff har dyp lenke og handlinger: **↵** = første handling (åpne / fullfør / kjøpt), **⌥↵** = neste, piltastene velger, **Esc** lukker.
  Skriver du noe som ikke finnes, foreslås «Ny oppgave» og «Legg … i handlelisten».
- Har du valgt en lokal Ollama-embeddingmodell (Innstillinger → AI), brukes den også (hybrid FTS5 + vektor). Ingenting sendes ut av huset.

## Nytt familiemedlem (onboarding)
1. Admin: `POST /api/onboard51/invites {name, share}` (fra appene eller web) gir en QR-kode og en lenke `https://<server>/join/<id>.<kode>`.
2. Den nye personen skanner QR-en med Papir-appen eller åpner lenken: navn og brukernavn → passord → hva som deles (posisjon, helse, kalender) → ferdig.
- Koden kan brukes én gang, varer 48 timer (1–168), kan trekkes tilbake, og står aldri som et token i QR-en. Nye kontoer er alltid vanlige brukere.
- Helse deles bare sammen med posisjon (Familie har én delingsbryter). Alt kan endres senere i Innstillinger.

## Tema per bruker
- Valget følger deg på alle enheter (`/api/me/theme51`): **Lys**, **Mørk**, **Følg systemet** eller **Automatisk** – etter soloppgang/solnedgang
  der du er (posisjonen fra Familie, ellers Oslo) eller etter faste klokkeslett.
- Bytt i søkepaletten («tema») eller i Innstillinger → Utseende (lys/mørk/system synkes automatisk).

## Offline (web/PWA)
- Uten nett lagres disse endringene i nettleseren (IndexedDB) og sendes når nettet er tilbake: gjøremål og handleliste (også notater og
  deloppgaver), kvittering-opplasting (bildet lagres i køen), Sjekk inn og familiekalenderen.
- Regelen er **siste skriving vinner**. Har noen andre endret det samme mens du var uten nett, får du et varsel om at endringen din overskrev deres.
- Gjøremål, familiekalenderen og profilen kan også leses uten nett (siste kopi).

## Tilgjengelighet og visuelle tester
```bash
npm run a11y                          # kontrast og andre regler, lys og mørk, 1440/390 – feiler bare på NYE brudd
npm run a11y -- --update-baseline     # godta dagens brudd som grunnlinje (test/a11y51/baseline.json)
npm run test:visual                   # skjermbilder mot test/visual51/ref/ (terskel 1 %), rapport i test/visual51/out/report.html
npm run test:visual -- --update       # lagre nye referanser etter en villet designendring
```
Begge trenger Playwright med Chromium (`npm i -g playwright && npx playwright install chromium`, eller `PLAYWRIGHT_MODULE`). Uten den hoppes de over.
