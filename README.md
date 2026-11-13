<p align="center">
  <img src="docs/assets/banner.svg" alt="Homelab OS – Dashboard, FinansHub og mobilapper" width="100%">
</p>

<p align="center">
  <a href="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/docker.yml"><img src="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/docker.yml/badge.svg" alt="Docker-image"></a>
  <a href="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/mobile.yml"><img src="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/mobile.yml/badge.svg" alt="Mobilapper"></a>
  <a href="https://github.com/SebastianKristo/torskenes-verden/releases"><img src="https://img.shields.io/github/v/release/SebastianKristo/torskenes-verden?label=siste%20versjon&color=b23a2a" alt="Siste versjon på GitHub Releases"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white" alt="Node 22+">
  <img src="https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/iOS-SwiftUI-F05138?logo=swift&logoColor=white" alt="SwiftUI">
  <img src="https://img.shields.io/badge/Android-Compose-3DDC84?logo=android&logoColor=white" alt="Jetpack Compose">
  <img src="https://img.shields.io/badge/spr%C3%A5k-norsk-BA0C2F" alt="Norsk">
  <a href="https://sebastiankristo.github.io/torskenes-verden/"><img src="https://img.shields.io/badge/dokumentasjon-les%20her-b23a2a?logo=materialformkdocs&logoColor=white" alt="Dokumentasjon"></a>
</p>

<p align="center">
  <b>Et selvhostet «operativsystem» for hjemmet.</b> Du får et dashboard for hverdagen, assistenten Glimt som kjører på lokale modeller, en komplett økonomiapp der kvitteringene leses i huset, Media, sorteringssystemet Skjold Lab, og native apper for iPhone, Android, klokke og brettbare telefoner. Alt kjører på din egen server, og nøklene forlater den aldri.
</p>

<p align="center">
  <a href="#-kom-i-gang-på-5-minutter">Kom i gang</a> ·
  <a href="#-funksjoner">Funksjoner</a> ·
  <a href="#-skjermbilder">Skjermbilder</a> ·
  <a href="#-mobilappene">Mobilapper</a> ·
  <a href="#-oppdatering-og-backup">Oppdatering</a> ·
  <a href="https://sebastiankristo.github.io/torskenes-verden/"><b>Dokumentasjon</b></a> ·
  <a href="https://github.com/SebastianKristo/torskenes-verden/wiki">Wiki</a>
</p>

<p align="center">
  <img src="docs/images/hero.webp" alt="Homelab-dashboardet i Papir-design og tre telefoner: Hjem, Kalender og Finans" width="100%">
</p>

---

## 🏠 Hva er dette?

Homelab OS er én Node-tjeneste (Hono og SQLite) som du kjører i Docker på en Proxmox-LXC, en NAS eller en hvilken som helst Linux-maskin. Den gir deg:

- **Homelab-dashboardet** i nettleseren: avganger, vær, skoletimeplan, pakker, familie, gjøremål og mye mer.
- **Glimt**, assistenten i søkefeltet og i Chat. Den svarer ut fra dine egne data og kjører på en lokal modell.
- **FinansHub** på `/finans/`: regnskap, kvitteringer, budsjett, abonnementer, aksjer, Finn-handler og boliger.
- **Media** og **Skjold Lab**: Sonarr, Radarr, Prowlarr og qBittorrent på én side, og en sorteringsdatabase for deler der en LED lyser over riktig skuff.
- **Mobilapper** for iOS (SwiftUI) og Android (Jetpack Compose), med Apple Watch og Wear OS, og en PWA for alle andre. På hjemskjermen heter appen «Homelab».

Hver bruker har sine egne data. Bare Boliger og Matplan er delt: Boliger med dem du inviterer, og matplanen er felles for husstanden. Alle tekster er på norsk.

## ✨ Funksjoner

<table>
<tr>
<td width="50%" valign="top">

### <img src="docs/assets/icons/dashboard.svg" width="26" align="top"> Hjem og dashboard
Avganger fra Entur i sanntid, vær fra MET/Yr, nyheter fra NRK, VG og E24, strøm fra Home Assistant og «Kommer ut» fra Sonarr og Radarr. Hjem er fliser som kan flyttes og skjules, og på mobil velger du halv eller full bredde. Felles søk åpnes med ⌘K, Ctrl+K eller «/». Velg mellom temaet «Nåværende» og **Papir** («Vindu og papir»), med bakgrunn fra været, NASA-planeter eller Oslo-foto.

</td>
<td width="50%" valign="top">

### <img src="docs/assets/icons/finans.svg" width="26" align="top"> FinansHub
Kontoer, transaksjoner, budsjett, faste utgifter og rapporter. Kvitteringer leses bare lokalt: teksten hentes med OCR på telefonen, Apple Vision på en Mac eller Tesseract på serveren, og tolkes av en lokal modell. Sky-tjenester brukes ikke til kvitteringer. Kvitteringen matches mot banken og venter på at du trykker **Bokfør**. Temaene er Lys hovedbok (standard), Mørk hovedbok, Glød og v2.

</td>
</tr>
<tr>
<td valign="top">

### ✦ Glimt og Now Brief
Skriv eller snakk i søkefeltet på Hjem eller i Chat: «legg inn tannlege fredag kl 10», «hvor mye brukte jeg på strøm i september?», «hvor er M3-skruene?». Glimt forstår oppfølgere som «flytt den til 11», ber om bekreftelse før noe slettes, og setter opp faste oppgaver i vanlig språk. Minnet «Glimt husker» kan du se og slette fra, og nye forslag lagres først når du sier ja. **Now Brief** samler dagen i kort du selv velger og sorterer.

</td>
<td valign="top">

### 🎬 Media
Sonarr, Radarr, Prowlarr og qBittorrent på én side, med Oversikt, Kalender, Bibliotek og Nedlastinger. Legg til serier og filmer, bruk interaktivt søk i indekserne, og følg nedlastingene med pause og kø. Avspillinger i Plex og Jellyfin styres fra web, apper, klokke og Android Auto: spill av, pause, spoling, neste og volum. Admin setter opp tjenestene, og nøklene blir på serveren. Fanen **NRK** er en NRK-nedlaster: lim inn en lenke fra tv.nrk.no eller radio.nrk.no, følg serier, komprimer til H.265 og bla i biblioteket med sesonger og episoder. Se [NRK-nedlaster](docs/nrk-nedlaster.md).

</td>
</tr>
<tr>
<td valign="top">

### 🗄️ Skjold Lab
En personlig sorteringsdatabase for deler. Sett opp skap med rader og skuffer, legg inn deler med bilder, antall, tags og varsel om lavt lager, og søk: «10k» finner «10 kΩ», og svaret viser skap, rad og skuff. **✦ Foreslå** kjenner igjen delen fra et bilde med en lokal modell. Med en LED-stripe og WLED på en ESP32 lyser LED-en over skuffen der delen ligger. I tillegg: plukkliste, produkter med stykkliste og utsjekking, QR-etiketter og CSV. 3D-printfilene til skapet ligger på releasen [«skjoldlab3d»](https://github.com/SebastianKristo/torskenes-verden/releases/tag/skjoldlab3d). Se [3D-modellen](tools/skjoldlab3d/README.md) og [LED-oppsettet](tools/skjoldlab-led/README.md).

</td>
<td valign="top">

### 🎙️ Tale til tekst og opplesning
Mikrofonen i Glimt-søket og Chat sender opptaket til serveren, som gjør det om til tekst på en maskin i huset: norsk med NB-Whisper fra Nasjonalbiblioteket, engelsk med Voz eller Phonon. Språket oppdages av seg selv, og telefonens egen talegjenkjenning er reserve. Opplesning kan bruke egne stemmer fra VoxCPM. Tjenestene er valgfrie og settes opp under AI → Tjenester.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/studie.svg" width="26" align="top"> Kalender
Skoletimeplanen fra skolens iCal og Canvas, sammen med Bursdager og Google Kalender. Kortet «Nå» viser timen, rommet og læreren, og «Prøver og frister» har nedtelling. Visningene er Uke, Måned og Agenda, og det finnes widgets på iPhone, Android og Samsung. Kalender er også en egen app for iPhone, Android og Mac, og på iPhone er den bygget inn i Homelab-appen.

</td>
<td valign="top">

### 🎂 Bursdager
Neste bursdag, alder og dager igjen, med påminnelse kl. 09:00. Synkes med Google Kalender (også bursdager fra kontakter) og Home Assistant. Det finnes widgets på Hjem, iOS og Android.

</td>
</tr>
<tr>
<td valign="top">

### 📍 Familie og kart
Posisjon i sanntid med spor, fart og batteri. Soner med ikon og farge gir varsel når noen kommer eller går, og helsedata kan hentes fra Apple Health eller Health Connect. **Deling er av som standard.** Du ser bare dem som deler med deg.

</td>
<td valign="top">

### 📦 Sporing
Pakker fra Posten/Bring, PostNord, DHL, UPS, Helthjem, Budbee, Instabox og flere. Sporingsnumre hentes automatisk fra e-post og Finn. Status kommer fra Mybring, PostNord og ParcelsApp, og du kan selv velge tjeneste med «Spor via».

</td>
</tr>
<tr>
<td valign="top">

### 🌦️ Vær
Egen værside med timer, 7 dager, vind, UV, sol og måne, og detaljark med grafer. «Yr og Pent» sammenligner Yr med en StormGeo-modell, og kartknappen åpner Windy. Bakgrunnen er animert etter været.

</td>
<td valign="top">

### ✅ Gjøremål
Lister med forfall og hvem som gjør hva (het tidligere Huskeliste). Eieren kan dele en liste med utvalgte personer, endringer kommer i sanntid, og listene kan synkes begge veier med Home Assistant To-do.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/hjem.svg" width="26" align="top"> Boliger
Et dashboard per bolig med budsjett, prosjekter, avdrag, regninger og utgifter til godkjenning. Skann en kvittering rett inn i en bolig fra mobilen. En bolig deles bare med dem du inviterer.

</td>
<td valign="top">

### <img src="docs/assets/icons/ai.svg" width="26" align="top"> ✦ AI og tidsgrenser
Lokalt først: Ollama på en maskin i huset, med oMLX som valgfritt alternativ. På AI-siden velger du modell per oppgave, tester tjenestene og ser jobber og forbruk. Gemini og Groq er valgfrie sky-motorer, men aldri for kvitteringer, og med «Finansdata forlater aldri huset» sendes ingen finansdata ut. Alle kall går gjennom én kø med tidsgrenser. Lange AI-søk kjøres som jobb med fremdrift og Avbryt, og svarene strømmer.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/sikkerhet.svg" width="26" align="top"> Brukere, profiler og 2FA
Rollene er admin og bruker, og alle har **sine egne data**, også andre admins. Innlogging skjer med brukernavn og TOTP-2FA. Profilene er Standard, Finans + Boliger og Boliger-profil. App-tokens har egne tilganger og utløp.

</td>
<td valign="top">

### <img src="docs/assets/icons/mobil.svg" width="26" align="top"> Mobilapper
Papir-design, likt på iOS og Android. På hjemskjermen heter appen «Homelab». Appene har kamera som åpner med én gang, opplastingskø, flere kontoer, biometrisk lås, widgets (også Samsung One UI) og sidelinje på Fold og iPad. I tillegg kommer Apple Watch, Wear OS og Android Auto. På Android kan du bytte app-ikon og app-navn.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/mat.svg" width="26" align="top"> Mat · <img src="docs/assets/icons/domene.svg" width="26" align="top"> Domener · <img src="docs/assets/icons/aksjer.svg" width="26" align="top"> Aksjer
Ukeplan med AI-forslag, faste retter og handleliste. Matplanen er felles for husstanden. Domenestatistikk fra Cloudflare med verdenskart og oppetid. Portefølje og utbytte fra Trading 212. Abonnementer samles i Subscription OS.

</td>
<td valign="top">

### <img src="docs/assets/icons/backup.svg" width="26" align="top"> Backup
Full backup som JSON, Excel eller CSV. Automatisk og kryptert backup (AES-256-GCM) til en SMB-share, med versjoner. Systembackup med restic til lokal disk og NAS, der gjenopprettingen testes automatisk. En ny installasjon kan hentes rett fra backupen.

</td>
</tr>
</table>

## 📸 Skjermbilder

> Alle skjermbildene er tatt med `MOCK_DATA=1`, så alle tall, navn og pakker er eksempeldata. Bildene er ikke oppdatert siden oktober 2026, og Glimt, Media og Skjold Lab har ikke skjermbilder her ennå.

<details open>
<summary><b>Desktop (1440 × 900)</b></summary>
<br>

| Homelab-dashboardet (Papir) | FinansHub (Lys hovedbok) |
|---|---|
| <img src="docs/images/homelab-dashboard.webp" alt="Homelab-dashboardet i Papir-design"> | <img src="docs/images/finanshub-oversikt.webp" alt="FinansHub-oversikten i Lys hovedbok"> |
| **Kalender** | **Familie og kart** |
| <img src="docs/images/homelab-kalender.webp" alt="Kalender med skoletimeplan, prøver og frister"> | <img src="docs/images/homelab-familie.webp" alt="Familie med kart, soner og personkort"> |
| **Innstillinger → Integrasjoner** | **Innlogging** |
| <img src="docs/images/homelab-integrasjoner.webp" alt="Innstillinger → Integrasjoner"> | <img src="docs/images/innloggingsside.webp" alt="Innloggingssiden i Papir-design"> |
| **Sporing** | **Bursdager** |
| <img src="docs/images/homelab-sporing.webp" alt="Sporing av pakker"> | <img src="docs/images/homelab-bursdager.webp" alt="Bursdager med widgets"> |
| **Kvitteringer** | **Boliger** |
| <img src="docs/images/finanshub-kvitteringer.webp" alt="Kvitteringer med kø og gjennomgang"> | <img src="docs/images/finanshub-boliger.webp" alt="Boliger med budsjett og utgifter"> |

</details>

<details open>
<summary><b>Mobil (PWA i Papir-design, 390 × 844)</b></summary>
<br>

| Hjem | Finans | Kalender | Bursdager |
|:-:|:-:|:-:|:-:|
| <img src="docs/images/mobil-hjem.webp" width="200" alt="Hjem"> | <img src="docs/images/mobil-finans.webp" width="200" alt="Finans"> | <img src="docs/images/mobil-kalender.webp" width="200" alt="Kalender"> | <img src="docs/images/mobil-bursdager.webp" width="200" alt="Bursdager"> |
| **Sporing** | **Vær** | **Familie** | **Integrasjoner** |
| <img src="docs/images/mobil-sporing.webp" width="200" alt="Sporing"> | <img src="docs/images/mobil-vaer.webp" width="200" alt="Vær"> | <img src="docs/images/mobil-familie.webp" width="200" alt="Familie"> | <img src="docs/images/mobil-integrasjoner.webp" width="200" alt="Innstillinger → Integrasjoner"> |

**Galaxy Fold og iPad:** fanelinjen blir en sidelinje til venstre.

<img src="docs/images/brettbar-kalender.webp" alt="Kalender på Galaxy Fold med sidelinje">

</details>

## 🚀 Kom i gang på 5 minutter

Du trenger en Linux-maskin med Docker og Docker Compose. Se [Installasjon](https://github.com/SebastianKristo/torskenes-verden/wiki/Installasjon) i wikien for Proxmox, Unraid og Cloudflare Tunnel.

**1. Hent koden og lag `.env`**

```bash
git clone https://github.com/SebastianKristo/torskenes-verden.git /opt/homelab-os
cd /opt/homelab-os
cp .env.example .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
```

`.env.example` inneholder eksempelverdier for integrasjonene. De kan stå som de er, eller tømmes. Alt kan endres senere i Innstillinger → Integrasjoner.

**2. Velg hvordan serveren skal nås.** Endre `.env`, enten med en editor eller med kommandoene under:

```bash
# A) Bare fra LAN med http (uten Cloudflare Tunnel):
echo "BIND_ADDR=0.0.0.0" >> .env
sed -i "s/^COOKIE_SECURE=.*/COOKIE_SECURE=false/" .env

# B) Med Cloudflare Tunnel (https): la COOKIE_SECURE=true stå, og lim inn tokenet:
sed -i "s/^CLOUDFLARE_TUNNEL_TOKEN=.*/CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi.../" .env
```

**3. Start**

```bash
docker compose up -d --build                     # bare appen, port 3000
docker compose --profile tunnel up -d --build    # med Cloudflare Tunnel
```

Sjekk at den svarer: `curl http://localhost:3000/healthz` skal gi `ok`.

**4. Førstegangsoppsett i nettleseren.** Åpne `http://<serverens-ip>:3000`, eller domenet ditt. Når `APP_PASSWORD_HASH` er tom og det ikke finnes noen brukere, får du et oppsett i fire steg: navnet ditt, navnet på serveren, brukernavn og passord (minst 8 tegn), og bakgrunn. Du blir hovedadmin.

> [!TIP]
> Vil du heller lage eier-kontoen fra `.env`, kjør
> `docker compose run --rm --entrypoint node os scripts/hash-password.js 'passord'` og lim linja inn i `.env` før første start.
> Brukernavnet blir `USER_NAME` med små bokstaver.

**5. Etter innlogging:**
- **Innstillinger → Integrasjoner:** Home Assistant, Entur, sporing, Media og andre tjenester. Se [Integrasjoner](https://github.com/SebastianKristo/torskenes-verden/wiki/Integrasjoner).
- **Innstillinger → AI → Tjenester:** adressen til Ollama og de andre AI-tjenestene. Se [AI og tidsgrenser](https://github.com/SebastianKristo/torskenes-verden/wiki/AI-og-tidsgrenser).
- **Innstillinger → Kalender og gjøremål:** skole-iCal, Canvas og Google Kalender.
- **Innstillinger → Konto / Brukere:** slå på 2FA og legg til familien.
- **`/finans/`:** første gang velger du Start tom, Hent fra SMB-share, Last opp backupfil eller Eksempeldata.

**6. Logg inn i appene.** Skriv inn serveradressen, for eksempel `https://os.example.no` eller `http://192.168.1.60:3000`, og deretter brukernavn, passord og eventuell 2FA-kode. Appen bytter innloggingen mot et eget app-token (`fh_pat_…`), og passordet lagres ikke.

**Bare prøve lokalt?** Ingen nøkler trengs:

```bash
npm install
cp .env.example .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/; s/^COOKIE_SECURE=.*/COOKIE_SECURE=false/" .env
MOCK_DATA=1 npm run dev        # http://localhost:3000, eksempeldata
```

## 📱 Mobilappene

| Plattform | Fil | Slik installerer du |
|---|---|---|
| <img src="docs/assets/icons/mobil.svg" width="20"> **Android** | `FinansHub-<versjon>.apk` | Last ned fra [Releases](https://github.com/SebastianKristo/torskenes-verden/releases), tillat «Installer ukjente apper» for nettleseren eller filbehandleren, og åpne filen. Nye versjoner installeres over den gamle. |
| <img src="docs/assets/icons/mobil.svg" width="20"> **iPhone / iPad** | `FinansHub-<versjon>-unsigned.ipa` | Åpne filen i [AltStore](https://altstore.io), [SideStore](https://sidestore.io) eller [Sideloadly](https://sideloadly.io) med din Apple-ID. Med gratis Apple-ID må signaturen fornyes hver 7. dag. AltStore og SideStore gjør det automatisk. |
| 📅 **Kalender-appen** | `Kalender-<versjon>.apk`, `Kalender-<versjon>-unsigned.ipa`, `Kalender-<versjon>.dmg` | Egen app for Android, iPhone og Mac. Installeres som appene over. På iPhone trenger du den ikke, se «Kalender i appen» under. |
| ⌚ **Wear OS** | `HomelabWear-<versjon>.apk` | Egen APK for klokka: Sjekk inn, Hent meg, avganger, handleliste, Glimt med tale og mediekontroll. |
| ⌚ **Apple Watch** | – | Klokkeappen ligger ikke i IPA-en. Den bygges og kjøres fra Xcode, se [apps/README.md](apps/README.md). |
| 🌐 **PWA** | – | Åpne `https://<din adresse>/finans/` i Safari eller Chrome og velg «Legg til på Hjem-skjerm». |

Siste versjon ligger alltid under [Releases](https://github.com/SebastianKristo/torskenes-verden/releases). Filene heter fortsatt `FinansHub-…`, men på hjemskjermen heter appen **Homelab**.

> [!TIP]
> **Kalender i appen (iPhone):** Homelab-appen har hele Kalender-appen inni seg. Det er nyttig når du sideloader med SideStore og gratis Apple-ID, som bare har plass til tre apper. Bryteren ligger under Innstillinger → «Kalender i appen» og er på fra start. Siri-snarveier og oppdatering i bakgrunnen finnes bare i den frittstående Kalender-appen.

> [!WARNING]
> **Apple Health og sideloading:** sideloading-verktøy med gratis Apple-ID kan fjerne HealthKit fra signaturen. Feiler installasjonen, velg «Remove entitlements» i Sideloadly. Appen virker da som vanlig, men den får ikke spørre om tilgang til Apple Health. Under Innstillinger → App ser du hvorfor. Android bruker Health Connect og har ikke denne begrensningen.

Mer om widgets, Fold, klokkene, app-ikon og Health Connect står i [Mobilapper](https://github.com/SebastianKristo/torskenes-verden/wiki/Mobilapper) og i [apps/README.md](apps/README.md).

## 🔄 Oppdatering og backup

> [!IMPORTANT]
> **Ta backup før oppdatering.** Databasen migreres automatisk ved oppstart, og noen versjoner (for eksempel 4.18) bygger den om. Gå til **FinansHub → Innstillinger → Backup og data → Ta backup nå** eller **Full backup (.json)**, eller kopier `data/`.

| Oppsett | Backup først | Oppdater |
|---|---|---|
| **Docker Compose** | `docker compose stop && tar czf ~/homelab-data-$(date +%F).tgz data .env && docker compose start` | `git pull && docker compose up -d --build` (legg til `--profile tunnel` hvis du bruker tunnel) |
| **Proxmox (LXC)** | `pct snapshot <ctid> for-oppdatering` | Kjør på verten: `bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"` |
| **Unraid** | Kopier `/mnt/user/appdata/homelab-os` | *Check for updates* på containeren |

[`deploy/proxmox/update.sh`](deploy/proxmox/update.sh) finner containeren `homelab-os` selv. Er navnet endret, sett `CTID=<id>` foran kommandoen. Skriptet laster ned koden som en tarball, bygger på nytt og rører ikke `.env` eller `data/`.

Gjenoppretting, SMB-backup og migreringer står i [Oppdatering og backup](https://github.com/SebastianKristo/torskenes-verden/wiki/Oppdatering-og-backup).

## 📚 Dokumentasjon

**[Dokumentasjonssiden](https://sebastiankristo.github.io/torskenes-verden/)** samler alt under med søk, faner og mørkt tema.

**Wikien** har guider med eksempler:

| | Side | Innhold |
|---|---|---|
| <img src="docs/assets/icons/docker.svg" width="22"> | [Installasjon](https://github.com/SebastianKristo/torskenes-verden/wiki/Installasjon) | Docker, `.env`, porter, reverse proxy, Cloudflare Tunnel, førstegangsoppsett |
| <img src="docs/assets/icons/backup.svg" width="22"> | [Oppdatering og backup](https://github.com/SebastianKristo/torskenes-verden/wiki/Oppdatering-og-backup) | `update.sh`, backup, gjenoppretting, migreringer |
| <img src="docs/assets/icons/sikkerhet.svg" width="22"> | [Brukere og personvern](https://github.com/SebastianKristo/torskenes-verden/wiki/Brukere-og-personvern) | Roller, egne data per bruker, hva som deles |
| <img src="docs/assets/icons/mobil.svg" width="22"> | [Mobilapper](https://github.com/SebastianKristo/torskenes-verden/wiki/Mobilapper) | APK/IPA, app-token, widgets, Fold, Kalender i appen, Apple Watch, Wear OS, Apple Health, Health Connect |
| <img src="docs/assets/icons/api.svg" width="22"> | [Integrasjoner](https://github.com/SebastianKristo/torskenes-verden/wiki/Integrasjoner) | Steg for steg for hver tjeneste, også Media og WLED til Skjold Lab |
| <img src="docs/assets/icons/finans.svg" width="22"> | [FinansHub](https://github.com/SebastianKristo/torskenes-verden/wiki/FinansHub) | Kontoer, import, kvitteringer, budsjett, Boliger, AI-søk |
| <img src="docs/assets/icons/studie.svg" width="22"> | [Kalender og Bursdager](https://github.com/SebastianKristo/torskenes-verden/wiki/Kalender-og-Bursdager) | Skole-iCal, Canvas, Google, widgets |
| <img src="docs/assets/icons/nettverk.svg" width="22"> | [Sporing](https://github.com/SebastianKristo/torskenes-verden/wiki/Sporing) · [Familie og kart](https://github.com/SebastianKristo/torskenes-verden/wiki/Familie-og-kart) | Pakker, soner, posisjon og helse |
| <img src="docs/assets/icons/ai.svg" width="22"> | [AI og tidsgrenser](https://github.com/SebastianKristo/torskenes-verden/wiki/AI-og-tidsgrenser) | Lokale modeller, Glimt, kvitteringer, tale til tekst, tidsgrenser og jobber |
| <img src="docs/assets/icons/api.svg" width="22"> | [API](https://github.com/SebastianKristo/torskenes-verden/wiki/API) | curl-eksempler med app-token, sanntid |
| <img src="docs/assets/icons/rom.svg" width="22"> | [Feilsøking](https://github.com/SebastianKristo/torskenes-verden/wiki/Feilsøking) | Vanlige feil og løsninger |

**Referanse i repoet:** [installasjon](docs/installasjon.md) · [konfigurasjon (alle miljøvariabler)](docs/konfigurasjon.md) · [homelab](docs/homelab.md) · [finanshub](docs/finanshub.md) · [sikkerhet](docs/sikkerhet.md) · [backup](docs/backup.md) · [api](docs/api.md) · [utvikling](docs/utvikling.md) · [apps](apps/README.md) · [beslutninger](DECISIONS.md) · [endringslogg](CHANGELOG.md)

**Skjold Lab og lokale tjenester:** [3D-modellen](tools/skjoldlab3d/README.md) · [LED over skuffen](tools/skjoldlab-led/README.md) · [mediekontroll](docs/mediekontroll-51.md) · [tale til tekst](docs/nb-whisper-54.md) · [egne stemmer](docs/voxcpm-57.md) · [oMLX](docs/omlx-58.md) · [Mac-OCR](tools/vision-ocr/README.md)

## 🧱 Teknologi

```mermaid
flowchart LR
  subgraph Klienter
    B[Nettleser<br/>Homelab + FinansHub]
    P[PWA /finans/]
    I[iOS-app og Apple Watch<br/>SwiftUI]
    A[Android-app og Wear OS<br/>Compose]
  end
  subgraph Server["Homelab-server (Docker / LXC)"]
    H[Hono på Node 22]
    D[(SQLite<br/>better-sqlite3)]
    F[/data: kvitteringer,<br/>logoer, bakgrunner/]
    W((WebSocket<br/>/api/ws))
  end
  subgraph Huset["I huset, valgfritt"]
    L[Ollama · oMLX · Mac-OCR<br/>NB-Whisper · VoxCPM]
    M[Sonarr · Radarr · Prowlarr<br/>qBittorrent · Plex · Jellyfin]
    E[WLED på ESP32<br/>LED i Skjold Lab]
    HA[Home Assistant]
  end
  subgraph Eksternt
    AI[Gemini · Groq<br/>valgfritt, aldri kvitteringer]
    X[Entur · MET · iCal · Google<br/>T212 · Mybring · PostNord<br/>Cloudflare]
    S[(SMB-share<br/>backup)]
  end
  B & P -- sesjonscookie --> H
  I & A -- Bearer fh_pat_… --> H
  H --- D & F & W
  H --> L & M & E & HA
  H --> AI & X
  H -- smbclient --> S
  CF[Cloudflare Tunnel<br/>+ Access] -.-> H
```

- **Server:** Node 22, [Hono](https://hono.dev), better-sqlite3 og ws. Ingen byggesteg.
- **Nettleser:** vanilla ES-moduler. Temaene er Nåværende og Papir på Homelab, og fire temaer i FinansHub.
- **Mobil:** SwiftUI (iOS 17+, Liquid Glass på iOS 26) og Kotlin med Jetpack Compose (Material 3, Glance-widgets). Egne mål for Apple Watch, Wear OS, Android Auto og Kalender for Mac.
- **Lokal AI:** Ollama, og valgfritt oMLX, Mac-OCR (Apple Vision), NB-Whisper og VoxCPM på en Mac i huset. Serveren er den eneste som snakker med dem.
- **Drift:** Docker med PUID/PGID, Cloudflare Tunnel, Proxmox-skript, Unraid-mal og image på GHCR.

## 🗂️ Struktur

```
server/            Hono-app: innlogging, homelab-API, integrasjoner, Glimt, Kalender, Media, Skjold Lab, Sporing, Familie
server/finans/     FinansHub: database, API, AI, import, søk, aksjer, Boliger, backup
public/            Homelab-grensesnittet (app.html, js/, css/) og CV
public/finans/     FinansHub: desktop og mobil-PWA
apps/android/      Native Android-app (Kotlin, Compose), Kalender-appen og Wear OS
apps/ios/          Native iOS-app (SwiftUI, XcodeGen), Kalender for iPhone og Mac, Apple Watch
tools/             Tjenestene på Mac-en (OCR, NB-Whisper, VoxCPM, oMLX) og Skjold Lab (3D-modell, LED)
deploy/            Proxmox-skript (install.sh, update.sh), Unraid-mal, Proton Mail Bridge
docs/              Dokumentasjon, skjermbilder, ikoner og wiki (docs/wiki)
test/              node --test
```

## 🛡️ Kort om sikkerhet

- Bare `/login`, `/cv` og statiske filer er offentlige. Resten krever innlogging eller et app-token.
- **Fra internett kreves alltid passord**, og 2FA når det er slått på. En pålitelig enhet slipper passordet bare på hjemmenettet.
- **Alt er per bruker**, også for administratorer. Unntakene er Boliger, som deles med dem du inviterer, og Matplan, som er felles for husstanden. Ellers deles noe bare når du selv slår det på, for eksempel posisjon i Familie eller en gjøremålsliste.
- **Nøklene blir på serveren.** Passord hashes med scrypt, TOTP-hemmeligheter og API-nøkler lagres kryptert, og nøkler sendes aldri tilbake til nettleseren eller appene.
- **Ollama eksponeres aldri mot internett.** Det gjelder også de andre lokale AI-tjenestene og WLED-kontrolleren til Skjold Lab. Bare serveren snakker med dem, på hjemmenettet.
- Kvitteringer leses bare lokalt, og med «Finansdata forlater aldri huset» sendes ingen finansdata ut av huset.
- Bruk Cloudflare Tunnel i stedet for portviderekobling. Detaljene står i [docs/sikkerhet.md](docs/sikkerhet.md).

---

<p align="center"><sub>Bygget med Node, SQLite og mye kaffe ☕</sub></p>
