# Homelab – arbeidsinstruks

Gjelder alltid, for alle endringer i repoet. Erstatter `design_handoff_homelab/CLAUDE.md`. Bakgrunnen står i [docs/opprydding/AUDIT.md](docs/opprydding/AUDIT.md) og beslutningene i [docs/opprydding/BESLUTNINGER.md](docs/opprydding/BESLUTNINGER.md).

## Prosjektet

Homelab er et personlig dashboard for husstanden: Oversikt, Kalender, Økonomi, Media, Familie, Mat, Gjøremål, Skjold Lab og mer. Én server, én SQLite-database og flere tynne klienter.

| Del | Hvor | Teknikk |
|---|---|---|
| Server | `server/` | Node 22 + Hono, SQLite (better-sqlite3, `data/homelab.db`). Én mappe per domene (`server/<domene>/index.js` med `mount<Domene>(app)`), og `server/index.js` monterer dem. Økonomi-API-et ligger i `server/finans/` (`/finans/api/*`). Felles: `server/http/` (feilform, komprimering, eldre aliaser), `server/jobs/` (planleggeren for bakgrunnsjobber), `server/ai/` (AI-gaten) |
| Web/PWA | `public/` | Vanilla ES-moduler uten byggesteg, rutene lastes ved behov. CSS i `public/css/{tokens,base,layout,papir-mork}.css`, `components/` og `pages/`. Økonomi i `public/finans/` (egen service worker, `/finans/` er adressen) |
| iOS, Mac, widgets, Watch | `apps/ios/` | SwiftUI. Prosjektet genereres med XcodeGen fra `apps/ios/project.yml` (ingen `.pbxproj` i repoet). Enhetstestene ligger i `apps/ios/HomelabTests/` |
| Android | `apps/android/` | Jetpack Compose, modulene `app`, `kalender` og `wear`, pluss `felles` (ren Kotlin: modulliste, dyplenker, serveradresse, med JUnit) og `felles-android` (kryptert lagring) |
| Kontrakt og felles data | `shared/` | `shared/schemas` (API-kontrakten og modullisten), `shared/design` (designtokens), `shared/testvektorer` (felles fasit for regler) |
| Drift | `Dockerfile`, `docker-compose.yml`, `deploy/` | Docker bak Cloudflare Tunnel. Proxmox- og Unraid-oppsett i `deploy/` |
| Dokumentasjon | `docs/`, `README.md`, `DECISIONS.md` | Norsk. `docs/sikkerhet.md` og `docs/utvikling.md` er de viktigste |

**Strukturen** (AUDIT §11) er gjennomført, og er regelen for ny kode:
- Server: én mappe per domene, `server/<domene>/` (f.eks. `server/media/{library,downloads,playback,images}.js`), aldri nummererte lag som `media43/44/45/50.js`.
- Web-CSS: `public/css/{tokens,base,layout,components,pages}`, der `tokens.css` er generert. En ny side får én fil i `public/css/pages/`.
- Én fil per skjerm eller komponent på alle plattformer, med beskrivende navn.
- Noen få filer har fortsatt et nummer i navnet, ofte fordi navnet står i et manifest eller et lagringsnavn. Får du grunn til å endre en av dem, gi den et beskrivende navn hvis det er trygt.

**Modullisten** `shared/schemas/moduler.json` er kilden til modulene: id, navn, ikon, gruppe, plattformer, tilgang, undersider og gamle ruter. Serveren sender den per bruker på `GET /api/moduler` (`server/moduler/`), og menyene, fanelinja, Mer, titlene, Innstillinger-sidene og dyplenkene på web (`public/js/moduler.js`), iOS (`ModulListe.swift`, `Dyplenker.swift`) og Android (`:felles`, `Dyplenker.kt`) bygges fra den. En ny modul eller et nytt navn legges inn der, ikke i en håndskrevet liste i en klient. Gamle adresser beholdes som alias i lista.

## Arbeidsregler

- **Ikke fjern funksjoner. Spør først.**
- **Aldri nye filer med versjons- eller promptnummer i navnet.** Endre den eksisterende fila. Slå sammen `X`, `X41` og `X89` til `X` (eller et bedre navn), og slett de gamle.
- **Små steg som kan gjennomgås.** Én commit per logisk endring, med en melding som forklarer *hvorfor*.
- **Egen gren per fase** (`opprydding/fase-N`).
- **Testene skal være grønne etter hvert steg.** Mangler testen, skriv den først. Se [Tester](#tester).
- **Visuell regresjon:** ta skjermbilder før og etter (lyst og mørkt, mobil og desktop) når noe kan se annerledes ut.
- **Ikke gjett.** Noter spørsmålet og spør.
- **Norsk språk i UI.** Rett skrivefeil og inkonsekvente begreper, og før dem i [ordlisten](docs/ordliste.md).

## Design

- **Bruk tokens, aldri hex.** Fargene, skriftstørrelsene, radiene og avstandene kommer fra `shared/design/tokens.json`. `npm run tokens` genererer CSS, Swift og Kotlin fra den, og `npm run tokens:check` feiler når den genererte koden ikke stemmer med kilden. Generert kode redigeres aldri for hånd. Se [docs/designsystem.md](docs/designsystem.md).
- Tema er **stil** (Papir, Glass) × **modus** (lys, mørk). Glass har bare mørk modus foreløpig (Q13). Økonomi følger Homelab-modusen (Q15).
- **Ingen `!important`** uten en kommentar som begrunner den.
- **Ingen nye temasystemer.** Utvid tokensettet i stedet.
- Systemstandard (Apple HIG og Material 3) når det ikke finnes en god grunn til å avvike.

## Logikk hører hjemme på serveren

- Appene og web er **tynne klienter** mot kontrakten i `shared/schemas`.
- Forretningsregler bor på serveren: datotolking, neste trekkdato og abonnement, budsjett og «brukt», kategorier, helligdager, prøveperioder, bursdager. Klienten viser det serveren sender (`label`, `nextDate`, `monthly`, `daysLeft` …) og regner ikke selv.
- «I dag» er alltid Oslo-datoen (Q20). Ikke bruk `toISOString().slice(0, 10)` eller `toLocaleDateString()` uten `timeZone: 'Europe/Oslo'`.
- **Unntak** bare for det som må virke uten nett: widgets, klokka, lokale varsler (serveren lager planen), OCR på enheten, geofence og normalisering av serveradressen. Da skal regelen ha felles testvektorer i `shared/testvektorer/` som både serveren og appen kjører.
- `shared/testvektorer/` har `datoer.json` (Q17), `abonnement.json`, `idag.json`, `proveperioder.json` og `serveradresse.json`. `test/testvektorer.test.js` kjører dem mot serveren, `HomelabTests` mot iOS og JUnit i `:felles` og `:kalender` mot Android. Et avvik merkes todo i stedet for å feile, så en ny vektor kan legges inn før koden rettes.

## Sikkerhet og personvern (faste regler)

Detaljer i [docs/sikkerhet.md](docs/sikkerhet.md). Disse brytes aldri:

- **Pålitelig enhet:** passordet hoppes bare over med gyldig enhetscookie **og** lokal klientadresse (10/8, 172.16/12, 192.168/16). Adressen leses fra tilkoblingen eller `CF-Connecting-IP` bak Cloudflare, **aldri** fra en header klienten kan sette (`X-Forwarded-For`).
- Fra internett kreves alltid passord (og 2FA når det er på).
- **Alt er per bruker**, unntatt Boliger og Matplan.
- Serverinfrastruktur, AI-nøkler og backup er bare for admin.
- Serveren sender aldri repo, branch, sha eller kommandoer til updateren.
- Ollama (port 11434) eksponeres aldri.
- Docker-proxyen utvides ikke. Containeren får aldri selve Docker-socketen.
- API-nøkler logges aldri og sendes aldri til frontend. Medienøkler blir på serveren.
- Alle AI-kall går via `server/ai/gate.js` / `server/ai/run.js`.
- **Finansdata forlater aldri huset.**
- QR-innlogging bærer aldri token.
- Ikke omgå 403 eller bot-blokkering med falske nettleser-headere.
- På iOS ligger tokens i Nøkkelringen (`ThisDeviceOnly`), aldri i `UserDefaults`.
- Ingen signeringsnøkler eller hemmeligheter i repoet. Android-nøkkelen ligger bare i GitHub-hemmelighetene.
- Ingen modell-identifikatorer i kode, kommentarer eller commit-meldinger.
- RSS, artikler og iCal hentes bare fra offentlige adresser, med mindre en admin har godkjent verten.

## Navn og ordliste

- Navnene i UI er bestemt i [BESLUTNINGER.md](docs/opprydding/BESLUTNINGER.md) Q1–Q12: **Homelab** (produktet), **Økonomi** (modulen, internt «FinansHub»), **Oversikt** (startsiden), **Smarthjem**, **Faste betalinger**, **Reise**, **Nyheter**, **Brief**, **Konto og sikkerhet**.
- [docs/ordliste.md](docs/ordliste.md) har kolonnene «Bruk» og «Ikke bruk». Nye begreper føres inn der.
- Tall `1 234,56`, minus `−`, dato `dd.mm.åååå`. Beløp lagres i øre (heltall).

## Tester

| Kommando | Hva |
|---|---|
| `npm test` | Alle enhetstester (`node --test`, uten nett). Skal ha 0 feil |
| `npm run test:e2e` | Ende-til-ende mot testserveren (`test/e2e/`) |
| `npm run a11y` | Tilgjengelighet (axe) |
| `npm run test:visual` | Skjermbilder mot fasit (lyst/mørkt, mobil/desktop) |
| `npm run tokens:check` | Generert designkode stemmer med `shared/design/tokens.json` |
| `npm run test:perf` | Ytelsesmåling (samme metode som auditen) |
| iOS | CI-jobben «Mobilapper» (`.github/workflows/mobile.yml`) bygger fra `apps/ios/project.yml` og kjører `HomelabTests` (XCTest) i simulatoren. Lokalt: `xcodegen` i `apps/ios/`, så Xcode |
| Android | CI «Mobilapper» kjører `:felles:test` og `:kalender:testDebugUnitTest` (JUnit) og bygger APK-ene. Lokalt: `cd apps/android && ./gradlew :felles:test assembleDebug` |

- `MOCK_DATA=1 npm run dev` gir eksempeldata for alle integrasjoner, uten nett.
- Tester som trenger «i dag», skal sette klokka selv (se `test/lib/day-clock.mjs`) og regne i Oslo-tid.
- iOS og Android har enhetstester (Q25): `HomelabTests` (fasitene, kontrakteksemplene i `shared/schemas/eksempler` og modullisten) og JUnit i `:felles` og `:kalender`. De kjører `shared/testvektorer/` i CI. Ny logikk i en app som må virke uten nett, får en test der.
- `test/dokumentasjon-lenker.test.js` feiler når dokumentasjonen peker på en fil som ikke finnes. Flytter du en fil, rett lenkene.

## Release

- **Versjonen** er den øverste `## [x.y.z]` i `CHANGELOG.md`. Serveren leser den derfra.
- **Docker-imaget** bygges og publiseres ved push til `main` (`.github/workflows/docker.yml`).
- **Mobilappene:** push en tag (`vX.Y.Z`) eller kjør **Actions → Release** med `version`-input (`.github/workflows/release.yml`). APK og IPA legges i en GitHub Release.
- Android krever hemmelighetene `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` og `ANDROID_KEY_PASSWORD`. Uten dem stopper releasen før noe bygges. Se [docs/android-signering.md](docs/android-signering.md).
- iOS-signering er valgfri (`IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_TEAM_ID`). Uten dem lages en usignert IPA.
- **TestFlight:** Actions → **TestFlight** (eller tag `v*`) laster opp Homelab og Kalender med `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` og `IOS_TEAM_ID`. Se [docs/testflight.md](docs/testflight.md).

**CHANGELOG-formatet** (nyeste øverst, norsk, skrevet for brukeren):

```markdown
## [4.73.1] – 14.11.2026 · Kort tittel på det viktigste
- **Område:** hva som er nytt eller rettet, sett fra brukeren. Plattform i parentes når det ikke gjelder alle.
  - Underpunkt ved behov.
```

## Prompt-innsamling

- Når brukeren skriver «ny promt» eller «nytt promt», start en ny prompt-fil. Alt brukeren skriver etter det legges til ordrett i den aktive fila (som punkter med dato), i tillegg til at ønsket bygges.
- Fortsett i samme fil til brukeren skriver «nytt promt» igjen. Da lukkes fila og en ny startes.
- Arkivet ligger i `design_handoff_homelab/prompts/` (`prompt-NN.md` og `prompt-NN-pakke/`). Det er et dokumentarkiv over bestillinger, ikke kode, så nummerne i navnet er tillatt der (og bare der). Ny bestilling = ny `prompt-NN.md` med neste nummer.
