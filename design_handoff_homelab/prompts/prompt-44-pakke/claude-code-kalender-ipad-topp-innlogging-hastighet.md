# Kalender (iPad + mobil): toppfelt, innlogging, utlogging og hastighet

Ønske 2026-10-21: «i kalender for ipad når sidebar er åpen ser du uke og måned blir krympet vekk og ikke lesbart. og åpne homelab igjen for innlogging funker ikke alltid. og jeg blir ofte logget ut av kalender automatisk. både for mobil og ipad så tar det ofte litt tid for innholdet i kalender å komme inn, det bør være der med en gang kalenderen åpnes.»
Vedlegg: `uploads/Skjermbilde 2026-10-21 kl. 13.33.08.png` (iPad, sidepanel åpent, tittelen blir «UKE… 19…»).

## 1. Toppfeltet krymper tittelen (iPad med sidepanel)
**Feil:** tittelen har `flex-shrink` og deler plass med periodeknappene, «I dag», visningsvelgeren (6 valg), søk, Glimt og «+ Ny hendelse». Med sidepanel (~520 pt) blir det for trangt.
**Regel:** tittelen krymper aldri (`layoutPriority(1)` / `fixedSize()`, Compose `Modifier.wrapContentWidth()`). Plass hentes fra knappene, i denne rekkefølgen etter tilgjengelig bredde i innholdsfeltet:
| Bredde | Endring |
|---|---|
| ≥ 1500 pt | Som i dag |
| < 1500 | «Glimt» blir bare orb-ikon (44 × 44). «+ Ny hendelse» blir «+ Ny» |
| < 1280 | Visningsvelgeren blir kompakt: «Å · M · U · 3 · D · L» → bruk heller **meny-knapp** med valgt visning («Uke ▾») som åpner listen |
| < 1060 | «+ Ny» blir rød rund «+» (44). «I dag» blir kalender-ikon med dagens tall |
| < 900 | Tittelen flyttes til **egen rad** over verktøylinjen |
- Tittelen: to linjer, aldri avkortet: øverst «UKE 43» (mono, rød), under «19.–25. oktober» (Newsreader 28). Måned: «OKTOBER» / «2026». Dag: «ONSDAG» / «21. oktober».
- Mål på faktisk bredde (`GeometryReader` / `BoxWithConstraints`), ikke enhetstype. Gjelder også Fold, Split View og Stage Manager.
- Test: iPad 11" og 13" i liggende og stående, med og uten sidepanel. Ingen tekst skal få «…».

## 2. «Åpne Homelab for å logge inn» virker ikke alltid
Sannsynlige årsaker: lenken tilbake treffer appen før den er klar (kald start), appen er allerede åpen og lenken går tapt, eller `state` ikke stemmer.
- **iOS:** bruk `ASWebAuthenticationSession` med `callbackURLScheme` (eller universal link `https://homelab…/auth/kalender`). Håndter både `onOpenURL` (SwiftUI) og `scene(_:openURLContexts:)` + `scene(_:willConnectTo:options:)` for kald start. Lagre ventende URL og behandle den når innloggingsskjermen er montert.
- **Android:** `launchMode="singleTask"`, håndter `onCreate(intent)` og `onNewIntent`. App Links med `autoVerify`. Bruk Custom Tabs + PKCE.
- `state` + PKCE lagres i Keychain/DataStore, ikke i minnet (overlever at appen drepes mens Homelab er åpen).
- Hvis det ikke kommer svar innen 20 s etter at man er tilbake i appen: vis «Fikk ikke svar fra Homelab» med **Prøv igjen** og **Logg inn med passord**.
- Logg hvert steg (`auth.handoff.start/return/ok/fail` + årsak) til Docker-loggen.

## 3. Blir logget ut automatisk
Sannsynlige årsaker: to samtidige token-fornyelser der den andre gjør den første ugyldig (rotasjon), eller utlogging ved nettverksfeil.
- **Én fornyelse om gangen:** felles `actor`/mutex (iOS) og `Mutex` (Kotlin). Andre kall venter på samme resultat.
- **Logg bare ut** når serveren svarer `invalid_grant` på fornyelse. Aldri ved timeout, 5xx, ingen nett eller 401 før fornyelse er forsøkt.
- Refresh-token: 90 dager, **glidende** (fornyes ved bruk). Tilgangstoken 15 min, fornyes 2 min før utløp og når appen kommer i forgrunnen.
- Lagring: Keychain med `kSecAttrAccessibleAfterFirstUnlock` i **delt App Group** (widget og app bruker samme token). Android: EncryptedSharedPreferences/DataStore + Keystore. Ikke slett ved app-oppdatering.
- Server: tillat at forrige refresh-token brukes én gang til innen 60 s (grace) for å tåle kappløp.

## 4. Innholdet bruker tid på å komme
**Regel:** kalenderen viser alltid lagret innhold **med en gang** (første bilde), og oppdaterer i bakgrunnen.
- Lokal database (SwiftData/Core Data, Room) med hendelser for −3 til +12 måneder. Les synkront ved oppstart og tegn første bilde av den.
- Bakgrunnssynk etter visning: Google `syncToken`, CalDAV `ctag`/`sync-collection`, Homelab `ETag`/`If-None-Match`. Bare endringer hentes.
- Mens den synker: liten «Oppdaterer…» ved tittelen, aldri tom kalender eller spinner over rutenettet.
- Forhåndslast: iOS `BGAppRefreshTask` (hver ~30 min) og Android `WorkManager`. Widgeten leser samme database.
- Vær og Glimt-tekst lastes etter hendelsene og må ikke blokkere visningen.
- Mål: første bilde < 300 ms fra trykk på ikonet. Logg `cal.firstFrame` og `cal.syncDone` i ms.
