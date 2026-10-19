# Bidra

## Kjør lokalt

Du trenger Node 22 eller nyere. Med `MOCK_DATA=1` får alle integrasjonene eksempeldata, FinansHub får demo-økonomi, og alt virker uten nett.

```bash
git clone https://github.com/SebastianKristo/torskenes-verden.git
cd torskenes-verden
npm install
cp .env.example .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/; s/^COOKIE_SECURE=.*/COOKIE_SECURE=false/" .env
MOCK_DATA=1 npm run dev     # http://localhost:3000, starter på nytt ved endringer
```

```bash
npm test                    # node --test "test/**/*.test.js"
```

Mobilappene bygges med Android Studio og Xcode (XcodeGen). Se [apps/README.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/apps/README.md).

## Konvensjoner

- **Språk:** all tekst i grensesnittet er norsk bokmål.
- **Formater:** tall skrives `1 234,56`, minus `−` og dato `dd.mm.åååå`.
- **Beløp** lagres i øre (heltall) i FinansHub.
- **Hemmeligheter** forlater aldri serveren. Nye nøkler legges i `SCHEMA` (homelab) eller som `secret()` (FinansHub).
- **Integrasjoner:** en ny integrasjon skal ha en mock i `mock.js` og en forklaring i kortet når den ikke er satt opp.
- **Per bruker:** nye tabeller får `user_id`, og ruter filtrerer alltid på innlogget bruker.

## CI

| Workflow | Når | Hva |
|---|---|---|
| `docker.yml` | Push til `main` og tagger | Bygger og publiserer `ghcr.io/sebastiankristo/torskenes-verden` |
| `mobile.yml` | Endringer i `apps/` | Android-APK, og iOS-simulator og usignert `.ipa` |
| `release.yml` | Tag `v*` | APK og IPA i en GitHub Release |
| `wiki.yml` | Endringer i `docs/wiki/` | Publiserer GitHub-wikien |
| `docs.yml` | Endringer i `docs/` eller `mkdocs.yml` | Bygger og publiserer denne siden til GitHub Pages |
| `logos.yml` · `backgrounds.yml` | Månedlig eller manuelt | Henter logobiblioteket og bakgrunnsfotoene |

## Dokumentasjonen

Det finnes to brukerrettede kopier, og begge bygges fra repoet:

| | Kilde | Publiseres til |
|---|---|---|
| **Denne siden** | `docs/site/` og `mkdocs.yml` | `https://sebastiankristo.github.io/torskenes-verden/` |
| **GitHub-wikien** | `docs/wiki/` | `https://github.com/SebastianKristo/torskenes-verden/wiki` |

Endrer du en veiledning, oppdater begge. Teknisk referanse (alle miljøvariabler, API-listen) ligger i `docs/*.md`.

Slik ser du siden lokalt:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install mkdocs-material==9.7.7
mkdocs serve                 # http://127.0.0.1:8000, laster på nytt ved endringer
mkdocs build --strict        # samme sjekk som i CI: døde lenker og ankre stopper bygget
```

!!! tip "Skjermbilder"

    Bildene i `docs/images/` er tatt med Playwright mot en server med `MOCK_DATA=1`, i 1440×900 for desktop og i iPhone-, Pixel- og Pixel Fold-størrelse for mobil, og lagret som WebP. Bildene denne siden bruker, ligger som kopier i `docs/site/assets/`.

## Rapporter en feil

Opprett en [issue](https://github.com/SebastianKristo/torskenes-verden/issues) med versjon, hva du gjorde, og utdrag fra `docker compose logs os`. Fjern nøkler og adresser først.
