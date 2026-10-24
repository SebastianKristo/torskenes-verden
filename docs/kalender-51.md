# Kalender-appene – prompt 51 (iPhone/iPad, Mac og Android)

## Hva er nytt

**Ny enhet må godkjennes.** Logger du inn med brukernavn og passord fra internett på en enhet kontoen ikke kjenner, gir serveren ikke noe token med en gang. Kalender viser da «Venter på godkjenning».
- Godkjenn fra en enhet som allerede er logget inn: Kalender eller Homelab-appen (Innstillinger → Sikkerhet) eller Homelab på web.
- Kalender sjekker hvert 2,5. sekund og logger inn av seg selv når innloggingen er godkjent. Forespørselen utløper etter 15 minutter. «Avbryt» tar deg tilbake til startskjermen.
- Du blir aldri låst ute. På hjemmenettet, på kontoens første enhet, med «Logg inn med Homelab-appen», med «Fortsett som …» og med QR-kode trengs ingen godkjenning.
- Hver installasjon har en fast, tilfeldig enhetsnøkkel. Den ligger i Nøkkelringen på iPhone/iPad, i appens egen mappe på Mac og i kryptert lagring (Keystore) på Android. Etter at enheten er godkjent én gang, husker serveren den.

**Innstillinger → Sikkerhet.** Her står enheter som venter på godkjenning, med knappene **Godkjenn** og **Avvis**.
- Før en godkjenning går gjennom, må du bekrefte med Face ID, Touch ID eller fingeravtrykk. Enhetskoden eller PIN virker som reserve.
- Mens appen er åpen, kommer det et varsel når en ny enhet venter: «Ny enhet vil logge inn». Trykk på varselet for å åpne Innstillinger.
- Raden «Nytt i denne versjonen» viser endringene i siste oppdatering.

**Krasjrapporter.** Krasjer appen, lagres en kort rapport på enheten: feiltype, melding og stakk. Rapporten sendes til serveren (`/api/crash`) neste gang appen starter. Den inneholder aldri persondata, tokens eller innholdet i felter. Administrator ser rapportene under System.

**Feature flags.** Appen henter flaggene (`/api/flags`) når den starter, når den kommer i forgrunnen og én gang i timen. Nye funksjoner kan dermed slås på per bruker eller per enhet fra admin-siden.

**«Nytt i denne versjonen».** Første gang du åpner appen etter en oppdatering av Homelab, vises et kort med nyhetene. Trykk «Fint», så vises kortet ikke igjen.

## Hva du må gjøre
- Ingenting for å komme i gang. Er serveren ikke oppdatert til prompt 51, fungerer innloggingen som før.
- Godkjenn nye enheter fra en enhet du allerede er logget inn på. Avvis innlogginger du ikke kjenner igjen, og bytt passord.
- Varsler for nye enheter krever at varsler er slått på for Kalender. På Android ligger de i kanalen «Sikkerhet».
- Vil du fjerne en enhet slik at den må godkjennes på nytt, gjør du det i Homelab → Innstillinger → Sikkerhet → Enheter.

## For utviklere
- iOS og Mac: `apps/ios/SharedKal/Core/KalSec51Core.swift` inneholder logikken, `Kalender/Sources/KalSec51.swift` og `KalenderMac/Sources/MacSec51.swift` visningene.
- Android: `apps/android/kalender/.../Kal51.kt` inneholder logikken, `ui/Kal51Ui.kt` visningene.
- Bruk flagg i koden:
  - iOS/Mac: `KalFlags51.on("navn")`
  - Android: `Kal51Flags.on(ctx, "navn")`
