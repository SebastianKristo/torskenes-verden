<p align="center">
  <img src="docs/assets/banner.svg" alt="Homelab OS – Dashboard, FinansHub og mobilapper" width="100%">
</p>

<p align="center">
  <a href="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/docker.yml"><img src="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/docker.yml/badge.svg" alt="Docker-image"></a>
  <a href="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/mobile.yml"><img src="https://github.com/SebastianKristo/torskenes-verden/actions/workflows/mobile.yml/badge.svg" alt="Mobilapper"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white" alt="Node 22+">
  <img src="https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/iOS-SwiftUI-F05138?logo=swift&logoColor=white" alt="SwiftUI">
  <img src="https://img.shields.io/badge/Android-Compose-3DDC84?logo=android&logoColor=white" alt="Jetpack Compose">
  <img src="https://img.shields.io/badge/spr%C3%A5k-norsk-BA0C2F" alt="Norsk">
  <a href="https://sebastiankristo.github.io/torskenes-verden/"><img src="https://img.shields.io/badge/dokumentasjon-les%20her-b23a2a?logo=materialformkdocs&logoColor=white" alt="Dokumentasjon"></a>
</p>

<p align="center">
  <b>Et selvhostet «operativsystem» for hjemmet.</b> Du får et dashboard for hverdagen, en komplett økonomiapp med AI-lesing av kvitteringer, og native apper for iPhone, Android og brettbare telefoner. Alt kjører på din egen server, og nøklene forlater den aldri.
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

- **Homelab-dashboardet** i nettleseren: avganger, vær, skoletimeplan, pakker, familie, huskeliste og mye mer.
- **FinansHub** på `/finans/`: regnskap, kvitteringer, budsjett, abonnementer, aksjer, Finn-handler og boliger.
- **Mobilapper** for iOS (SwiftUI) og Android (Jetpack Compose), og en PWA for alle andre.

Hver bruker har sine egne data. Bare Boliger deles, og bare med dem du inviterer. Alle tekster er på norsk.

## ✨ Funksjoner

<table>
<tr>
<td width="50%" valign="top">

### <img src="docs/assets/icons/dashboard.svg" width="26" align="top"> Hjem og dashboard
Avganger fra Entur i sanntid, vær fra MET/Yr, nyheter fra NRK, VG og E24, strøm fra Home Assistant og «Kommer ut» fra Sonarr og Radarr. Kortene kan flyttes og skjules. Velg mellom temaet «Nåværende» og **Papir** («Vindu og papir»), med bakgrunn fra været, NASA-planeter eller Oslo-foto.

</td>
<td width="50%" valign="top">

### <img src="docs/assets/icons/finans.svg" width="26" align="top"> FinansHub
Kontoer, transaksjoner, budsjett, faste utgifter og rapporter. Kvitteringer leses av AI (Gemini, Groq eller Ollama) eller lokal OCR, matches mot banken og venter på at du trykker **Bokfør**. Temaene er Lys hovedbok (standard), Mørk hovedbok, Glød og v2.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/studie.svg" width="26" align="top"> Kalender
Skoletimeplanen fra skolens iCal og Canvas, sammen med Bursdager og Google Kalender. Kortet «Nå» viser timen, rommet og læreren, og «Prøver og frister» har nedtelling. Visningene er Uke, Måned og Agenda, og det finnes widgets på iPhone, Android og Samsung.

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

### ✅ Huskeliste
Lister med forfall og hvem som gjør hva. Eieren kan dele en liste med utvalgte personer, endringer kommer i sanntid, og listene kan synkes begge veier med Home Assistant To-do.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/hjem.svg" width="26" align="top"> Boliger
Et dashboard per bolig med budsjett, prosjekter, avdrag, regninger og utgifter til godkjenning. Skann en kvittering rett inn i en bolig fra mobilen. Boliger er det eneste som deles mellom brukere.

</td>
<td valign="top">

### <img src="docs/assets/icons/ai.svg" width="26" align="top"> ✦ AI og tidsgrenser
Gemini med flere nøkler som reserve, Groq, Ollama lokalt og Roboflow. Under «Hvem gjør hva» velger du motor per oppgave. Hver motor har sin egen tidsgrense. Lange AI-søk kjøres som jobb med fremdrift og Avbryt, og Ollama strømmer svaret.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/sikkerhet.svg" width="26" align="top"> Brukere, profiler og 2FA
Rollene er admin og bruker, og alle har **sine egne data**, også andre admins. Innlogging skjer med brukernavn og TOTP-2FA. Profilene er Standard, Finans + Boliger og Boliger-profil. App-tokens har egne tilganger og utløp.

</td>
<td valign="top">

### <img src="docs/assets/icons/mobil.svg" width="26" align="top"> Mobilapper
Papir-design, likt på iOS og Android. Appene har kamera som åpner med én gang, opplastingskø, flere kontoer, biometrisk lås, widgets (også Samsung One UI) og sidelinje på Fold og iPad. På Android kan du bytte app-ikon og app-navn.

</td>
</tr>
<tr>
<td valign="top">

### <img src="docs/assets/icons/mat.svg" width="26" align="top"> Mat · <img src="docs/assets/icons/domene.svg" width="26" align="top"> Domener · <img src="docs/assets/icons/aksjer.svg" width="26" align="top"> Aksjer
Ukeplan med AI-forslag, faste retter og handleliste. Domenestatistikk fra Cloudflare med verdenskart og oppetid. Portefølje og utbytte fra Trading 212. Abonnementer samles i Subscription OS.

</td>
<td valign="top">

### <img src="docs/assets/icons/backup.svg" width="26" align="top"> Backup
Full backup som JSON, Excel eller CSV. Automatisk og kryptert backup (AES-256-GCM) til en SMB-share, med versjoner. En ny installasjon kan hentes rett fra backupen.

</td>
</tr>
</table>

## 📸 Skjermbilder

> Alle skjermbildene er tatt med `MOCK_DATA=1`, så alle tall, navn og pakker er eksempeldata.

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
- **Innstillinger → Integrasjoner:** nøkler for AI, Home Assistant, Entur, sporing og andre tjenester. Se [Integrasjoner](https://github.com/SebastianKristo/torskenes-verden/wiki/Integrasjoner).
- **Innstillinger → Kalendere:** skole-iCal, Canvas og Google Kalender.
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
| 🌐 **PWA** | – | Åpne `https://<din adresse>/finans/` i Safari eller Chrome og velg «Legg til på Hjem-skjerm». |

> [!WARNING]
> **Apple Health og sideloading:** sideloading-verktøy med gratis Apple-ID kan fjerne HealthKit fra signaturen. Feiler installasjonen, velg «Remove entitlements» i Sideloadly. Appen virker da som vanlig, men den får ikke spørre om tilgang til Apple Health. Under Innstillinger → App ser du hvorfor. Android bruker Health Connect og har ikke denne begrensningen.

Mer om widgets, Fold, app-ikon og Health Connect står i [Mobilapper](https://github.com/SebastianKristo/torskenes-verden/wiki/Mobilapper) og i [apps/README.md](apps/README.md).

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
| <img src="docs/assets/icons/mobil.svg" width="22"> | [Mobilapper](https://github.com/SebastianKristo/torskenes-verden/wiki/Mobilapper) | APK/IPA, app-token, widgets, Fold, Apple Health, Health Connect |
| <img src="docs/assets/icons/api.svg" width="22"> | [Integrasjoner](https://github.com/SebastianKristo/torskenes-verden/wiki/Integrasjoner) | Steg for steg for hver tjeneste |
| <img src="docs/assets/icons/finans.svg" width="22"> | [FinansHub](https://github.com/SebastianKristo/torskenes-verden/wiki/FinansHub) | Kontoer, import, kvitteringer, budsjett, Boliger, AI-søk |
| <img src="docs/assets/icons/studie.svg" width="22"> | [Kalender og Bursdager](https://github.com/SebastianKristo/torskenes-verden/wiki/Kalender-og-Bursdager) | Skole-iCal, Canvas, Google, widgets |
| <img src="docs/assets/icons/nettverk.svg" width="22"> | [Sporing](https://github.com/SebastianKristo/torskenes-verden/wiki/Sporing) · [Familie og kart](https://github.com/SebastianKristo/torskenes-verden/wiki/Familie-og-kart) | Pakker, soner, posisjon og helse |
| <img src="docs/assets/icons/ai.svg" width="22"> | [AI og tidsgrenser](https://github.com/SebastianKristo/torskenes-verden/wiki/AI-og-tidsgrenser) | Motorer, «Hvem gjør hva», jobber, Ollama |
| <img src="docs/assets/icons/api.svg" width="22"> | [API](https://github.com/SebastianKristo/torskenes-verden/wiki/API) | curl-eksempler med app-token, sanntid |
| <img src="docs/assets/icons/rom.svg" width="22"> | [Feilsøking](https://github.com/SebastianKristo/torskenes-verden/wiki/Feilsøking) | Vanlige feil og løsninger |

**Referanse i repoet:** [installasjon](docs/installasjon.md) · [konfigurasjon (alle miljøvariabler)](docs/konfigurasjon.md) · [homelab](docs/homelab.md) · [finanshub](docs/finanshub.md) · [sikkerhet](docs/sikkerhet.md) · [backup](docs/backup.md) · [api](docs/api.md) · [utvikling](docs/utvikling.md) · [apps](apps/README.md) · [beslutninger](DECISIONS.md) · [endringslogg](CHANGELOG.md)

## 🧱 Teknologi

```mermaid
flowchart LR
  subgraph Klienter
    B[Nettleser<br/>Homelab + FinansHub]
    P[PWA /finans/]
    I[iOS-app<br/>SwiftUI]
    A[Android-app<br/>Compose]
  end
  subgraph Server["Homelab-server (Docker / LXC)"]
    H[Hono på Node 22]
    D[(SQLite<br/>better-sqlite3)]
    F[/data: kvitteringer,<br/>logoer, bakgrunner/]
    W((WebSocket<br/>/api/ws))
  end
  subgraph Eksternt
    AI[Gemini · Groq · Ollama<br/>Roboflow]
    X[Entur · MET · iCal · Google<br/>HA · Sonarr/Radarr · T212<br/>Mybring · PostNord · Cloudflare]
    S[(SMB-share<br/>backup)]
  end
  B & P -- sesjonscookie --> H
  I & A -- Bearer fh_pat_… --> H
  H --- D & F & W
  H --> AI & X
  H -- smbclient --> S
  CF[Cloudflare Tunnel<br/>+ Access] -.-> H
```

- **Server:** Node 22, [Hono](https://hono.dev), better-sqlite3 og ws. Ingen byggesteg.
- **Nettleser:** vanilla ES-moduler. Temaene er Nåværende og Papir på Homelab, og fire temaer i FinansHub.
- **Mobil:** SwiftUI (iOS 17+, Liquid Glass på iOS 26) og Kotlin med Jetpack Compose (Material 3, Glance-widgets).
- **Drift:** Docker med PUID/PGID, Cloudflare Tunnel, Proxmox-skript, Unraid-mal og image på GHCR.

## 🗂️ Struktur

```
server/            Hono-app: innlogging, homelab-API, integrasjoner, Kalender, Sporing, Familie, Bursdager
server/finans/     FinansHub: database, API, AI, import, søk, aksjer, Boliger, backup
public/            Homelab-grensesnittet (app.html, js/, css/) og CV
public/finans/     FinansHub: desktop og mobil-PWA
apps/android/      Native Android-app (Kotlin, Compose)
apps/ios/          Native iOS-app (SwiftUI, XcodeGen)
deploy/            Proxmox-skript (install.sh, update.sh), Unraid-mal, Proton Mail Bridge
docs/              Dokumentasjon, skjermbilder, ikoner og wiki (docs/wiki)
test/              node --test
```

## 🛡️ Kort om sikkerhet

- Bare `/login`, `/cv` og statiske filer er offentlige. Resten krever innlogging eller et app-token.
- Passord hashes med scrypt. TOTP-hemmeligheter og API-nøkler lagres kryptert, og nøkler sendes aldri tilbake til nettleseren.
- Bruk Cloudflare Tunnel i stedet for portviderekobling. Detaljene står i [docs/sikkerhet.md](docs/sikkerhet.md).

---

<p align="center"><sub>Bygget med Node, SQLite og mye kaffe ☕</sub></p>
