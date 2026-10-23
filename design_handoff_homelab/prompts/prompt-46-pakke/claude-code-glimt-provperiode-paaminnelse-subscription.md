# Oppfølgingsoppdrag for Glimt: Koble påminnelser om gratis prøveperioder til Subscription Manager

Jeg ønsker å forbedre hvordan Glimt håndterer påminnelser om å avslutte abonnementer og gratis prøveperioder.

Du kjenner allerede prosjektet, arkitekturen og funksjonaliteten. Ikke bygg en ny app eller erstatt eksisterende systemer. Undersøk den eksisterende implementasjonen og gjør nødvendige endringer direkte i prosjektet.

## 1. Problemet

Jeg har en Subscription Manager i appen. Den har blant annet en liste over abonnementer med gratis prøveperioder som jeg må avslutte før prøveperioden utløper og betalingen starter.

Når jeg bruker søkefeltet på hjemskjermen og skriver noe som:

«Minn meg på å avslutte Spotify 15.10»

gjør Glimt dette riktig på ett område: Den oppretter en påminnelse i huskelisten.

Men den gjør ikke det viktigste i tillegg: **Spotify blir ikke registrert eller oppdatert i Subscription Manager som et abonnement jeg må avslutte før det begynner å koste penger.**

Det er denne sammenhengen jeg ønsker at du skal rette.

## 2. Forventet oppførsel

Når jeg skriver:

«Minn meg på å avslutte Spotify 15.10»

skal Glimt forstå at dette sannsynligvis handler om et abonnement jeg ønsker å avslutte før en betalingsperiode starter.

Den skal:

1. Opprette påminnelsen i den eksisterende huskelisten, slik den gjør i dag.
2. Finne Spotify i Subscription Manager, dersom abonnementet allerede finnes der.
3. Registrere eller oppdatere riktig abonnement med datoen jeg må avslutte det, slik at det vises i listen over abonnementer som må avsluttes før gratisperioden utløper.
4. Bevare eksisterende informasjon om abonnementet, for eksempel pris, prøveperiode, betalingsintervall og andre relevante felter.
5. Bekrefte hva som faktisk ble gjort.

Begge deler skal fungere. Jeg ønsker ikke at den eksisterende påminnelsen i huskelisten skal forsvinne.

## 3. Bruk riktig data i Subscription Manager

Undersøk hvordan Subscription Manager fungerer i dagens kode.

Finn ut:

- Hvordan abonnementer lagres.
- Hvordan gratis prøveperioder representeres.
- Hvilke felter som bestemmer om et abonnement vises i listen over prøveperioder som må avsluttes.
- Hvordan sluttdato, avbestillingsfrist og eventuell første betalingsdato håndteres.
- Om det allerede finnes funksjoner for å opprette eller oppdatere abonnementer.
- Hvordan Subscription Manager og huskelisten lagrer data.
- Om Glimt har tilgang til funksjonene som kreves for å oppdatere begge områdene.

Ikke opprett en separat, parallell abonnementsliste dersom appen allerede har en eksisterende datamodell.

Bruk de eksisterende tjenestene og datakildene. Hvis nødvendig funksjonalitet mangler, utvid den eksisterende implementasjonen på en ryddig måte.

**Det er ikke tilstrekkelig å legge til en vanlig huskelisteoppgave med ordet «Spotify». Abonnementet må registreres eller oppdateres i Subscription Manager på en måte som gjør at det faktisk vises i riktig liste.**

## 4. Ikke lag duplikater

Hvis Spotify allerede finnes i Subscription Manager, skal Glimt oppdatere det eksisterende abonnementet fremfor å opprette et nytt.

Hvis det ikke finnes, skal Glimt følge appens eksisterende regler for opprettelse av abonnementer og prøveperioder.

Hvis den mangler nødvendig informasjon for å opprette et korrekt abonnement, skal den spørre om det som mangler, i stedet for å finne på priser, betalingsdatoer eller prøveperioder.

Hvis det er uklart hvilket Spotify-abonnement jeg mener, skal den bruke eksisterende kontekst der det er mulig, og ellers stille et kort oppfølgingsspørsmål.

## 5. Skill mellom påminnelsesdato, sluttdato og betalingsdato

Vær nøye med hvordan datoene brukes.

Hvis jeg skriver:

«Minn meg på å avslutte Spotify 15.10»

er 15. oktober først og fremst datoen jeg oppgir for avslutningspåminnelsen. Den kan også være datoen abonnementet må avsluttes innen, dersom dette passer med datamodellen.

Den skal ikke automatisk anta at 15. oktober er datoen den gratis prøveperioden utløper eller dagen betalingen starter, med mindre dette er oppgitt eller allerede kjent fra abonnementets data.

Hvis Subscription Manager skiller mellom disse datoene, skal informasjonen lagres i de riktige feltene.

Datoen skal tolkes med riktig år basert på dagens dato og appens eksisterende datoregler.

## 6. Forstå tilsvarende formuleringer

Dette skal ikke være en spesialregel som bare fungerer for Spotify.

Glimt skal kunne forstå naturlige forespørsler som:

- «Minn meg på å avslutte Netflix før prøveperioden går ut.»
- «Jeg må kansellere Disney+ 15.10.»
- «Husk å si opp abonnementet mitt på Spotify før jeg blir belastet.»
- «Legg inn en påminnelse om å avslutte Audible neste fredag.»
- «Jeg har en gratis prøveperiode på en tjeneste som må avsluttes før den begynner å koste penger.»

Når forespørselen gjelder et abonnement som skal avsluttes, skal Glimt forstå at Subscription Manager er relevant, i tillegg til huskelisten dersom brukeren ber om en påminnelse.

Ikke oppdater Subscription Manager for enhver oppgave som inneholder ordet «abonnement». Det må være en reell sammenheng mellom forespørselen og et abonnement som skal avsluttes eller følges opp.

## 7. Gjør handlingene konsistente

Glimt skal behandle dette som én samlet brukerintensjon med to relevante oppdateringer:

- En påminnelse i huskelisten.
- En registrering eller oppdatering i Subscription Manager.

Undersøk hvordan dette kan gjennomføres pålitelig i den eksisterende arkitekturen.

Hvis én handling lykkes og den andre feiler, skal Glimt håndtere dette tydelig. Den skal ikke hevde at begge deler er fullført hvis bare én oppdatering ble lagret.

Unngå dupliserte påminnelser og dupliserte abonnementer hvis samme forespørsel behandles flere ganger.

## 8. Test hele brukerflyten

Legg til automatiserte tester som verifiserer den faktiske lagringen og visningen.

Test minst:

1. Et nytt abonnement som ikke finnes i Subscription Manager.
2. Et eksisterende abonnement som allerede er registrert.
3. Opprettelse av både huskelistepåminnelse og abonnementsoppføring.
4. Oppdatering av eksisterende sluttdato eller avslutningsfrist.
5. Korrekt visning i listen over gratis prøveperioder som må avsluttes.
6. At pris og andre eksisterende abonnementsopplysninger ikke overskrives feilaktig.
7. At manglende informasjon håndteres uten oppdiktede verdier.
8. At gjentatte forespørsler ikke skaper duplikater.
9. At feil i én av oppdateringene håndteres og rapporteres korrekt.
10. At datoer med og uten angitt år tolkes riktig.

Kontroller at abonnementet faktisk vises i Subscription Manager etter handlingen. Det er ikke nok å kontrollere at Glimt bare har opprettet en huskelisteoppgave.

## 9. Gjennomføring

Undersøk eksisterende kode, identifiser rotårsaken, implementer løsningen og kjør relevante tester.

Behold den nåværende arkitekturen og den lokale AI-løsningen via Ollama. Ikke bygg en ny Subscription Manager eller flytt data til et nytt system uten at det er teknisk nødvendig.

Ikke stopp ved å endre systemprompten. Hvis problemet skyldes manglende verktøy, feil ruting eller at data ikke blir lagret i riktig modul, skal dette rettes i selve implementasjonen.

Avslutt med en kort rapport som forklarer:

- Hvorfor Glimt bare oppdaterte huskelisten tidligere.
- Hvilke filer og funksjoner du endret.
- Hvordan oppdateringene til begge modulene nå gjennomføres.
- Resultatet av testene.
- Eventuelle begrensninger som fortsatt gjenstår.

**Sluttmålet:** Når jeg ber Glimt om å minne meg på å avslutte et abonnement før jeg blir belastet, skal den både opprette den vanlige påminnelsen og sørge for at abonnementet er registrert riktig i Subscription Manager, slik at jeg kan følge opp gratisperioden fra abonnementsoversikten.

---

## Tillegg fra designet (Papir-prototypen)

- Prøveperiodelisten i prototypen lagres i `papir_trials` (`{id, n, start, end, p, done}`), se `Subscription OS.dc.html` → `trList()` / `trSv()`.
- Når Glimt registrerer eller oppdaterer en prøveperiode, skal den også skrive en `trial_start`-hendelse i den nye loggen (se `claude-code-subscription-logg.md`), og `trial_cancelled` eller `trial_converted` når perioden er over.
