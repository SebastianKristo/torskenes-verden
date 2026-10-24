# FinansHub iOS – prompt 51 (fase 1)

## Hva det gjør
- **Ny enhet må godkjennes.** Appen sender en fast, tilfeldig enhetsnøkkel (`X-Device-Key`, lagret i nøkkelringen for bare denne enheten) til serveren. Logger du inn fra internett på en enhet serveren ikke kjenner, viser appen «Venter på godkjenning» i stedet for å logge inn. Godkjenn fra en enhet som allerede er logget inn, eller logg inn hjemme på samme nett. Appen sjekker hvert 2,5 sekund og logger inn av seg selv når innloggingen er godkjent. «Avbryt» tar deg tilbake til innloggingen. Forespørselen utløper etter 15 minutter.
- **Godkjenne fra appen:** Innstillinger → Sikkerhet → «Nye enheter» viser enhetene som venter, med *Godkjenn* (krever Face ID, eller koden hvis Face ID mangler) og *Avvis*. Er appen åpen, får du også et varsel i appen («Ny enhet vil logge inn»). Er den lukket, kommer varselet fra serveren, og et trykk på det åpner Sikkerhet. Administratorer ser forespørsler fra alle brukerne.
- **Krasjrapporter:** Hvis appen krasjer, skrives en kort rapport til en fil. Rapporten sendes til serveren (`/api/crash`) neste gang appen starter. Den inneholder bare melding, stakk, appversjon, iOS-versjon og maskinvaremodell. Navn, tokens og det du har skrevet i felt er ikke med.
- **Feature flags:** Appen henter flaggene (`/api/flags`) ved oppstart, når den kommer i forgrunnen og hver time, og husker siste svar. Ukjente flagg er av. I koden: `Flags51.shared.on("navn")` eller `store.flags.on("navn")`.
- **«Nytt i denne versjonen»:** Første gang etter en serveroppdatering viser appen et kort med nyhetene. Når du lukker kortet, vises det ikke igjen for den versjonen (gjelder også på web).
- **ntfy:** Ikke på iOS. Varsler i bakgrunnen krever APNs.

## Hva du må gjøre
- Ingenting i appen. Serveren må ha SEC51 og QA51 (prompt 51, runde 1). Med en eldre server fungerer alt som før.
- Første gang appen logger inn fra internett etter oppdateringen, kan den be om godkjenning. Godkjenn den fra web (Innstillinger → Sikkerhet) eller fra en annen innlogget enhet, eller logg inn hjemme én gang.
- Krasjrapportene ser admin på web under Innstillinger › System › Kvalitet › Krasjrapporter, eller i GlitchTip.

## Filer
`apps/ios/FinansHub/Sources/FHDevice51.swift` (nøkler), `FHSec51.swift` (godkjenning, varsel og rot-verten), `FHQa51.swift` (flagg og «Nytt»), `FHCrash51.swift` (krasj).
