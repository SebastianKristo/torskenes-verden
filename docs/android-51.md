# FinansHub Android (prompt 51)

Fem nye ting i Android-appen. De bruker server-API-ene fra prompt 51 (sikkerhet, kvalitet og drift).

## 1. Ny enhet må godkjennes

**Hva det gjør:** appen sender en fast, tilfeldig enhetsnøkkel når du logger inn. Nøkkelen ligger kryptert på telefonen. Logger du inn fra internett på en telefon kontoen ikke har sett før, viser appen **«Venter på godkjenning»** i stedet for å logge inn. Skjermen fortsetter av seg selv når innloggingen er godkjent, og **Avbryt** går tilbake. Appen viser aldri tokenet eller pollnøkkelen.

**Hva du gjør:** åpne Homelab på en enhet som allerede er logget inn, og godkjenn innloggingen der. Du kan trykke på varselet «Ny enhet vil logge inn», eller gå til **Innstillinger › Sikkerhet › Enheter som venter**. Du kan også logge inn hjemme på det lokale nettet, for der trengs ingen godkjenning.

- **Godkjenn** krever fingeravtrykk, ansikt eller PIN. Har telefonen ingen skjermlås, må du godkjenne fra web.
- **Avvis** krever ingen bekreftelse. Kjenner du ikke igjen enheten, bør du også bytte passord.
- Under **Mine enheter** kan du fjerne en enhet. Den må da godkjennes på nytt neste gang den logger inn fra internett.

## 2. Krasjrapporter

**Hva det gjør:** krasjer appen, skrives en rapport til en fil på telefonen. Rapporten sendes til `POST /api/crash` neste gang appen åpnes. Den inneholder bare unntaksklassen, en vasket melding og stacken. Den har aldri med token, beløp, feltinnhold eller e-post: sitater, tall og e-postadresser fjernes før rapporten lagres. Admin ser rapportene på serveren, og i GlitchTip når det er satt opp.

**Hva du gjør:** ingenting.

## 3. Feature flags

**Hva det gjør:** appen henter flaggene (`GET /api/flags`) når den starter, når den kommer i forgrunnen og hver time. Den sender med en fast installasjons-id (`X-Device-Id`). Flaggene lagres på telefonen, så de virker også uten nett. I koden brukes `Flags51.on("navn")`, og et ukjent flagg regnes som av.

**Hva du gjør:** flaggene settes av admin på web under Innstillinger › System › Kvalitet › **Feature flags**. Hver telefon dukker opp der under enheter.

## 4. «Nytt i denne versjonen»

**Hva det gjør:** første gang du åpner appen etter at serveren er oppdatert, vises et kort med nyhetene fra CHANGELOG. **Fint** lukker kortet og markerer versjonen som sett for deg på alle enheter.

## 5. Varsler via ntfy (hjemmeserver)

**Hva det gjør:** varslene kommer med en gang i stedet for hvert 15. minutt. Appen holder en tilkobling mot din egen ntfy-server i en bakgrunnstjeneste, med et lite, varig varsel som du kan skjule i systemets varselinnstillinger. Meldingene vises som vanlige varsler i egne kanaler. «Hent meg» kommer i kanalen **Sjekk inn · Hent meg (haster)**. Brytes forbindelsen, kobler appen til på nytt. Ventetiden øker fra 2 sekunder til maks 5 minutter, og appen prøver straks igjen når nettet er tilbake. Med strømsparing på holdes ingen tilkobling åpen. Da hentes nye varsler hvert 15. minutt. Det samme varselet vises ikke to ganger.

**Hva du gjør:**

1. Admin setter opp ntfy på serveren (se `docs/drift-51.md`). `NTFY_PUBLIC_URL` må være https, eller ligge på hjemmeserveren (`http://10.69.1.39:<port>`), fordi appen bare tillater klartekst dit.
2. Slå på **Innstillinger › Varsler › ntfy › Varsler via ntfy (hjemmeserver)**. Telefonen får da sitt eget hemmelige emne.
3. Trykk **Test**.

Slår du bryteren av, stoppes tjenesten og emnet slettes. ntfy virker bare på hjemmenettet (eller via VPN). Utenfor hjemmenettet kommer varslene som før.

## Kommandoer

```
cd apps/android && ./gradlew assembleDebug      # bygg
adb logcat | grep -i ntfy                        # se ntfy-tjenesten
```
