# Android: signeringsnøkkel

Android-appene (Homelab/FinansHub, Kalender og Wear) ble tidligere signert med en nøkkel som lå i repoet
(`apps/android/signing/sideload.jks`, med passordet i byggefilene). **Den nøkkelen er fjernet.** Alle som hadde repoet,
kunne signere en APK som telefonen godtok som en oppdatering av appene.

Nå finnes det ingen nøkkel i repoet. Byggene leser nøkkelen fra miljøet (`ANDROID_KEYSTORE_*`):

| Bygg | Med hemmelighetene | Uten |
|---|---|---|
| **Release** (tag `v*` / Actions → Release, `assembleRelease`) | Alle tre appene signeres med din nøkkel | **Ingen release.** Arbeidsflyten stopper i første jobb, før Android og iOS bygges, og `assembleRelease` stopper med en feilmelding som peker hit |
| **Mobilapper** (push til `main`, `assembleDebug`) | Signeres med din nøkkel | Signeres med Androids standard debug-nøkkel. Bygget er grønt, men loggen advarer: APK-en kan ikke installeres over en tidligere installert versjon |
| **Lokalt** (`./gradlew assembleDebug`) | Signeres med din nøkkel | Standard debug-nøkkel på maskinen (`~/.android/debug.keystore`), med samme advarsel |

## Det du må gjøre før neste release

1. Lag en ny nøkkel (steg 1).
2. Legg inn de fire hemmelighetene i GitHub (steg 2).
3. Lag releasen, og avinstaller appene én gang på hver enhet før du installerer de nye (steg 4).

## 1. Lag en ny nøkkel

Enklest med skriptet (krever Java, `keytool` følger med). Kjør det på din egen maskin:

```bash
scripts/android-nokkel.sh            # lager ~/homelab-android-nokkel/homelab-release.jks
```

Skriptet spør om et passord (vises ikke, minst 12 tegn), lager en PKCS12-nøkkel med RSA 4096, base64-koder den og skriver
ut de fire hemmelighetene du skal legge inn. Passordet skrives aldri til logg eller fil, og skriptet nekter å legge
nøkkelen inne i repoet.

Vil du gjøre det for hånd, er det det samme som:

```bash
keytool -genkeypair -keystore homelab-release.jks -storetype PKCS12 \
  -alias homelab -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Homelab"
base64 -w0 homelab-release.jks > homelab-release.jks.b64     # Linux
base64 -i homelab-release.jks -o homelab-release.jks.b64     # macOS
```

- Fila `homelab-release.jks` er nøkkelen. Ta en sikkerhetskopi av den og passordet (passordhvelv eller kryptert disk).
  **Mister du fila eller passordet, kan du aldri mer oppdatere appene uten å avinstallere dem.**
- Legg aldri fila i repoet. Slett `homelab-release.jks.b64` når steg 2 er gjort.

## 2. Legg inn de fire hemmelighetene i GitHub

GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret**:

| Navn | Verdi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | innholdet i `homelab-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | passordet du valgte i steg 1 |
| `ANDROID_KEY_ALIAS` | `homelab` |
| `ANDROID_KEY_PASSWORD` | samme passord som over (PKCS12 bruker ett passord) |

Eller med GitHub CLI (`gh secret set` spør etter verdien, så passordet havner ikke i kommandohistorikken):

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < ~/homelab-android-nokkel/homelab-release.jks.b64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body homelab
gh secret set ANDROID_KEY_PASSWORD
```

Alle fire må være satt. Mangler passord eller alias, stopper bygget med en tydelig feilmelding i stedet for å
signere med feil nøkkel.

## 3. Bygg og sjekk

Kjør **Actions → Mobilapper** (eller lag en ny utgivelse). I loggen for «Bygg APK» skal det stå
`Signering: egen nøkkel fra miljøet brukes for :app, :kalender og :wear.` Står det
`ADVARSEL (signering)`, er hemmelighetene ikke funnet.

## 4. Avinstaller og installer på nytt – én gang

Signaturen endres, og Android nekter å installere en app over en annen som er signert med en annen nøkkel. Derfor,
én gang etter byttet:

1. Avinstaller **Homelab**, **Kalender** og **Wear-appen** (klokka).
2. Installer de nye APK-ene og logg inn igjen.

Dataene dine ligger på serveren og er der fortsatt. Det som forsvinner, er det som bare ligger på telefonen:
innlogging, lokale innstillinger (tema, widgeter på hjemskjermen, varselvalg) og opplastinger som ventet i kø.

**Bytt alle tre appene samtidig.** «Logg inn med Homelab-appen» i Kalender virker bare når Kalender og Homelab er
signert med samme nøkkel – appene sammenligner signeringssertifikatene. En gammel Kalender sammen med en ny Homelab
(eller omvendt) må logge inn med brukernavn og passord.

Bruker du App Links (`ANDROID_CERT_SHA256` på serveren), må verdien oppdateres med det nye fingeravtrykket (skriptet
skriver det ut, eller):

```bash
keytool -list -v -keystore homelab-release.jks -alias homelab | grep SHA256
```

## Den gamle nøkkelen i git-historikken

Den gamle nøkkelen finnes fortsatt i git-historikken. Det er **byttet** til en ny nøkkel som gir sikkerheten –
ikke slettingen. Så lenge en enhet kjører en app signert med den gamle nøkkelen, kan den appen fortsatt
«oppdateres» av alle som har repoet. Når alle enhetene har fått de nye appene (steg 4), er den gamle nøkkelen verdiløs.

## Bygge lokalt

Uten nøkkel: `./gradlew assembleDebug` virker og signerer med standard debug-nøkkel på maskinen. En slik APK kan ikke
installeres over en app signert med release-nøkkelen (avinstaller først). `assembleRelease` stopper.

Med egen nøkkel:

```bash
export ANDROID_KEYSTORE_FILE=/sti/til/homelab-release.jks
export ANDROID_KEY_ALIAS=homelab
read -rs ANDROID_KEYSTORE_PASSWORD && export ANDROID_KEYSTORE_PASSWORD
export ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
cd apps/android && ./gradlew assembleRelease
```

`read -rs` leser passordet uten å vise det eller legge det i kommandohistorikken. I stedet for
`ANDROID_KEYSTORE_FILE` kan `ANDROID_KEYSTORE_BASE64` brukes (som i GitHub).
