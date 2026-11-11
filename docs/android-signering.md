# Android: egen signeringsnøkkel

Android-appene (Homelab/FinansHub, Kalender og Wear) signeres i dag med en nøkkel som ligger i repoet
(`apps/android/signing/sideload.jks`, passordet står i byggefilene). Alle som har repoet kan dermed signere en
APK som telefonen godtar som en oppdatering av appen. Denne siden viser hvordan du bytter til din egen nøkkel.

Byggene leser nøkkelen fra miljøet. Når hemmelighetene under er lagt inn, bruker både «Mobilapper» og «Release»
dem automatisk. Uten dem brukes nøkkelen i repoet som før, og bygget skriver en advarsel.

## 1. Lag en ny nøkkel

Kjør dette på din egen maskin (krever Java, `keytool` følger med). Kommandoen spør om et passord – velg et langt
og tilfeldig, og lagre det i passordhvelvet ditt:

```bash
keytool -genkeypair -keystore homelab-release.jks -storetype PKCS12 \
  -alias homelab -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Homelab"
```

- Fila `homelab-release.jks` er nøkkelen. Ta en sikkerhetskopi (passordhvelv eller kryptert disk).
  **Mister du fila eller passordet, kan du aldri mer oppdatere appene uten å avinstallere dem.**
- Legg aldri fila i repoet.

## 2. Base64-kod nøkkelen

```bash
base64 -w0 homelab-release.jks > homelab-release.jks.b64     # Linux
base64 -i homelab-release.jks -o homelab-release.jks.b64     # macOS
```

Innholdet i `homelab-release.jks.b64` er én lang linje. Slett fila når steg 3 er gjort.

## 3. Legg inn de fire hemmelighetene i GitHub

GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret**:

| Navn | Verdi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | innholdet i `homelab-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | passordet du valgte i steg 1 |
| `ANDROID_KEY_ALIAS` | `homelab` |
| `ANDROID_KEY_PASSWORD` | samme passord som over (PKCS12 bruker ett passord) |

Alle fire må være satt. Mangler passord eller alias, stopper bygget med en tydelig feilmelding i stedet for å
signere med feil nøkkel.

## 4. Bygg og sjekk

Kjør **Actions → Mobilapper** (eller lag en ny utgivelse). I loggen for «Bygg APK» skal det stå
`Signering: egen nøkkel fra miljøet brukes for :app, :kalender og :wear.` Står det
`ADVARSEL (signering)`, er hemmelighetene ikke funnet.

## 5. Installer på nytt – én gang

Android nekter å installere en app over en annen som er signert med en annen nøkkel. Derfor, én gang etter byttet:

1. Avinstaller **Homelab**, **Kalender** og **Wear-appen** (klokka).
2. Installer de nye APK-ene og logg inn igjen.

Dataene dine ligger på serveren og er der fortsatt. Det som forsvinner, er det som bare ligger på telefonen:
innlogging, lokale innstillinger (tema, widgeter på hjemskjermen, varselvalg) og opplastinger som ventet i kø.

**Bytt alle tre appene samtidig.** «Logg inn med Homelab-appen» i Kalender virker bare når Kalender og Homelab er
signert med samme nøkkel – appene sammenligner signeringssertifikatene. En gammel Kalender sammen med en ny Homelab
(eller omvendt) må logge inn med brukernavn og passord.

Bruker du App Links (`ANDROID_CERT_SHA256` på serveren), må verdien oppdateres med det nye fingeravtrykket:

```bash
keytool -list -v -keystore homelab-release.jks -alias homelab | grep SHA256
```

## 6. Slett den gamle nøkkelen fra repoet

Når alle enhetene kjører apper signert med den nye nøkkelen, kan `apps/android/signing/sideload.jks` og
`sideload`-oppsettet i `apps/android/*/build.gradle.kts` fjernes. Bygg uten hemmeligheter (for eksempel lokalt) må da
få nøkkelen fra miljøet, se under.

Den gamle nøkkelen finnes fortsatt i git-historikken. Det er **byttet** til en ny nøkkel som gir sikkerheten –
ikke slettingen. Så lenge en enhet kjører en app signert med den gamle nøkkelen, kan den appen fortsatt
«oppdateres» av alle som har repoet.

## Bygge lokalt med egen nøkkel

```bash
export ANDROID_KEYSTORE_FILE=/sti/til/homelab-release.jks
export ANDROID_KEY_ALIAS=homelab
read -rs ANDROID_KEYSTORE_PASSWORD && export ANDROID_KEYSTORE_PASSWORD
export ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
cd apps/android && ./gradlew assembleRelease
```

`read -rs` leser passordet uten å vise det eller legge det i kommandohistorikken. I stedet for
`ANDROID_KEYSTORE_FILE` kan `ANDROID_KEYSTORE_BASE64` brukes (som i GitHub).
