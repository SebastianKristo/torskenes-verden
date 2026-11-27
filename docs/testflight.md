# TestFlight (iPhone og Mac)

Workflowen **TestFlight** (`.github/workflows/testflight.yml`) bygger appene, signerer dem og laster dem opp til
App Store Connect. Derfra installeres de med TestFlight-appen på iPhone, iPad og Mac, uten sideloading og uten at signaturen
må fornyes hver 7. dag.

| App | Target | Bundle-id | Widgets |
|---|---|---|---|
| **Homelab** | `FinansHub` | `no.kristo.finanshub` | `FinansHubWidgets` (`no.kristo.finanshub.widgets`), og klokka `HomelabWatch` (`no.kristo.finanshub.watchkitapp`) inni appen |
| **Kalender** | `Kalender` | `no.kristo.kalender` | `KalenderWidgets` (`no.kristo.kalender.widgets`) |
| **Kalender for Mac** | `KalenderMac` | `no.kristo.kalender.mac` | `KalenderMacWidgets` (`no.kristo.kalender.mac.widgets`) |

Den usignerte IPA-en og DMG-en i Releases (`release.yml`) lages som før.

Signeringen gjøres av Xcode selv (automatisk signering) med en App Store Connect API-nøkkel. Xcode lager sertifikatet og
profilene under bygget, så du trenger ingen `.p12`-fil eller profiler i GitHub. Du trenger et betalt medlemskap i
Apple Developer Program.

## 1. Apple Developer

Logg inn på [developer.apple.com/account](https://developer.apple.com/account).

1. **Team ID:** under Membership details. Ti tegn, f.eks. `AB12CD34EF`. Dette blir `IOS_TEAM_ID`.
2. **App Group:** Certificates, IDs & Profiles → Identifiers → **+** → App Groups. Identifier
   `group.no.kristo.finanshub`. Gruppen deles av begge appene og widgetene (innlogging, widgetdata og Nøkkelringen).
3. **App ID-er:** Identifiers → **+** → App IDs → App, med «Explicit» bundle-id. Lag sju:

   | Bundle-id | Capabilities |
   |---|---|
   | `no.kristo.finanshub` | **App Groups** (velg `group.no.kristo.finanshub`), **HealthKit** (kryss også av for «Background Delivery» hvis valget finnes), **Push Notifications** (Live Activities og varsler) |
   | `no.kristo.finanshub.widgets` | **App Groups** (`group.no.kristo.finanshub`) |
   | `no.kristo.finanshub.watchkitapp` (plattform watchOS) | ingen |
   | `no.kristo.kalender` | **App Groups** (`group.no.kristo.finanshub`) |
   | `no.kristo.kalender.widgets` | **App Groups** (`group.no.kristo.finanshub`) |
   | `no.kristo.kalender.mac` (plattform macOS) | **App Groups** (`<Team-ID>.group.no.kristo.kalender`) |
   | `no.kristo.kalender.mac.widgets` (plattform macOS) | **App Groups** (samme) |

   Xcode kan registrere App ID-ene selv første gang, men App Group-tilknytningen er sikrest å gjøre for hånd.
   Rettighetene appene får, står i `apps/ios/project.yml` (`entitlements`). Push, Communication Notifications, delt
   Nøkkelring (`keychain-access-groups`) og Associated Domains er **ikke** slått på. Appene virker uten dem (se
   kommentarene i `project.yml`), og de ville brukket de usignerte byggene for AltStore og SideStore.

### Push (Live Activities)

TestFlight-bygget av Homelab har push (`aps-environment`). Det legges bare inn i TestFlight-jobben, så de usignerte byggene og sideloading er som før. For at serveren skal kunne starte og oppdatere Live Activities:

1. developer.apple.com → **Keys** → «+» → kryss av **Apple Push Notifications service (APNs)** → last ned nøkkelen (`.p8`, kan bare lastes ned én gang) og noter **Key ID**.
2. Homelab → Innstillinger → Tilkoblinger → **APNs**: Team-ID, Nøkkel-ID, nøkkelen og **Miljø: produksjon** (`apns_env`). TestFlight og App Store bruker produksjon; bygg fra Xcode bruker sandbox.

Nøkkelen ligger bare på serveren, ikke i GitHub og ikke i appen.

### Apple Watch

Klokka (`HomelabWatch`) er et eget target i `project.yml`. App Store krever at en klokke-app med følgeapp ligger inne i
iPhone-appen, så TestFlight-jobben bygger den inn i Homelab-appen (`Watch/FinansHubWatch.app`) før `xcodegen`, og sjekker
at den er med i arkivet. Den kommer med i den samme TestFlight-builden som Homelab; det trengs ingen egen app i App Store
Connect. Installer Homelab fra TestFlight på iPhone, så kan klokka installeres fra Watch-appen (eller automatisk). Klokka
kan også kjøre uten iPhone (`WKRunsIndependentlyOfCompanionApp`). De usignerte byggene legger den ikke i appen, som før.

### Kalender for Mac

TestFlight-bygget av Mac-appen er litt annerledes enn DMG-en i Releases, fordi App Store krever det:

- De midlertidige unntakene i sandkassen (`/Applications` og `/Volumes`) er fjernet. Dem trenger bare appens egen oppdaterer.
- Appens egen oppdaterer er av (`KAL_APP_STORE=YES` → `KalAppStore`). Oppdateringer kommer fra TestFlight, og Innstillinger → Oppdateringer sier det.
- App Group-en for skrivebords-widgetene (`<Team-ID>.group.no.kristo.kalender`) er slått på, så widgetene får data.

DMG-en i Releases er uendret og oppdaterer seg selv som før. Ha bare én av dem installert.

## 2. App Store Connect

Logg inn på [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

1. **Appene:** Apper → **+** → Ny app, plattform iOS. Lag én for hver:
   - Navn «Homelab» (eller et ledig navn), bundle-id `no.kristo.finanshub`, SKU f.eks. `homelab`.
   - Navn «Kalender» (eller et ledig navn), bundle-id `no.kristo.kalender`, SKU f.eks. `kalender`.
   - **Mac:** Ny app med plattform **macOS**, navn f.eks. «Kalender for Mac», bundle-id `no.kristo.kalender.mac`, SKU f.eks. `kalender-mac`. Den har en annen bundle-id enn iPhone-appen og blir derfor en egen app.

   Navnet i App Store Connect må være unikt i hele App Store. Navnet på hjemskjermen kommer fra appen og er uendret.
2. **API-nøkkel:** Brukere og tilgang → Integrasjoner → App Store Connect API → Teamnøkler → **+**.
   Gi den navnet «GitHub TestFlight» og rollen **Admin**. Admin trengs for at Xcode skal kunne lage
   distribusjonssertifikatet og profilene (rollen App Manager er ikke nok til det).
   - **Issuer ID** står øverst på siden. Dette blir `ASC_ISSUER_ID`.
   - **Key ID** står i listen. Dette blir `ASC_KEY_ID`.
   - Last ned `AuthKey_<Key ID>.p8`. Den kan bare lastes ned én gang. Ikke legg den i repoet.

## 3. Hemmelighetene i GitHub

Repoet → Settings → Secrets and variables → Actions → New repository secret:

| Hemmelighet | Verdi |
|---|---|
| `ASC_KEY_ID` | Key ID fra steg 2 |
| `ASC_ISSUER_ID` | Issuer ID fra steg 2 |
| `ASC_KEY_P8_BASE64` | Innholdet i `.p8`-fila, base64-kodet (under) |
| `IOS_TEAM_ID` | Team ID fra steg 1 |

Kod nøkkelen på din egen Mac og lim inn resultatet:

```bash
base64 -i AuthKey_ABC123DEFG.p8 | pbcopy     # Linux: base64 -w0 AuthKey_ABC123DEFG.p8
```

Slett den lokale `.p8`-fila etterpå, eller legg den et trygt sted. `IOS_TEAM_ID` brukes også av den valgfrie signerte
IPA-en i `release.yml`.

I workflowen skrives nøkkelen til `$RUNNER_TEMP`, med tilgang bare for eieren, og slettes i et eget steg som alltid kjører
(også når bygget feiler). Verdiene skrives aldri til loggen.

## 4. Kjør jobben

- **Manuelt:** Actions → **TestFlight** → Run workflow, og velg `alle`, `homelab`, `kalender` eller `kalender-mac`.
- **Ved release:** push en tag `vX.Y.Z`. Da kjører både Release og TestFlight (alle tre appene), hver for seg.

Mangler en av hemmelighetene, hopper workflowen over opplastingen med «Mangler TestFlight-hemmeligheter» og er grønn.

**Versjonen** (`MARKETING_VERSION`) er den øverste `## [x.y.z]` i `CHANGELOG.md`. Oppdater CHANGELOG før du kjører.
**Build-nummeret** (`CURRENT_PROJECT_VERSION`) er kjøringens nummer og forsøk, f.eks. `57.1`, så det øker alltid.

Etter opplastingen behandler Apple builden (vanligvis 5–30 minutter). Den vises da under appen → TestFlight.
Appene svarer «Nei» på spørsmålet om kryptering (`ITSAppUsesNonExemptEncryption = NO` i `project.yml`), fordi de bare
bruker vanlig HTTPS. Da trengs ingen eksportdokumentasjon.

## 5. Testere

- **Interne testere** (opptil 100, må være brukere i App Store Connect-teamet): appen → TestFlight → Intern testing → **+**
  for å lage en gruppe og legge til personer. Nye builds blir tilgjengelige med en gang de er behandlet, uten gjennomgang.
- **Eksterne testere** (opptil 10 000, hvem som helst med e-postadresse eller en offentlig lenke): appen → TestFlight →
  Ekstern testing → **+**. Den første builden i hver versjon må gjennom Apples beta-gjennomgang (vanligvis under ett døgn).
  Fyll ut «Testinformasjon» (beskrivelse, kontakt-e-post og en demokonto hvis gjennomgangen trenger innlogging). Husk at
  appene trenger en Homelab-server for å vise noe.
- Testerne installerer **TestFlight** fra App Store og åpner invitasjonen. En TestFlight-build virker i 90 dager.

## Feilsøking

| Melding i loggen | Årsak |
|---|---|
| `Mangler TestFlight-hemmeligheter` | En eller flere av de fire hemmelighetene er ikke satt |
| `ASC_KEY_P8_BASE64 er ikke en base64-kodet .p8-nøkkel` | Feil innhold i hemmeligheten. Kod fila på nytt (steg 3) |
| `No profiles for 'no.kristo…' were found` / `Provisioning profile … doesn't include the … entitlement` | App ID-en mangler, eller App Group/HealthKit er ikke slått på (steg 1) |
| `Cloud signing permission error` / `not authorized` | API-nøkkelen har ikke Admin-rollen (steg 2) |
| `The bundle version must be higher than the previously uploaded version` | En build med høyere nummer er lastet opp fra et annet sted. Kjør jobben på nytt (nummeret øker) |
| `No suitable application records were found` | Appen er ikke opprettet i App Store Connect (steg 2) |

Hver kjøring kan lage et nytt utviklersertifikat i teamet. Blir det mange under Certificates, kan de gamle trekkes tilbake
uten at TestFlight-builds slutter å virke.
