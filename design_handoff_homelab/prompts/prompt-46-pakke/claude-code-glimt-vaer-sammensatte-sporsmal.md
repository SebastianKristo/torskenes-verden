# Oppfølgingsoppdrag for Glimt: Intelligent bruk av værdata og sammensatte spørsmål

Glimt har fortsatt problemer med å forstå og utføre enkelte naturlige forespørsler fra søkefeltet på hjemskjermen. Jeg ønsker at du undersøker og retter dette i den eksisterende applikasjonen.

## 1. Konkret problem

Jeg stilte Glimt følgende spørsmål fra søkefeltet på hjemskjermen:

«Hvordan er været i Oslo i dag og temperaturen i New York i morgen?»

Glimt klarte ikke å forstå eller besvare spørsmålet tilfredsstillende.

Dette burde være en relativt enkel oppgave. Applikasjonen har allerede tilgang til en værtjeneste, og Glimt burde kunne bruke den til å hente informasjon om været i Oslo i dag og temperaturen i New York i morgen.

Det er ikke nødvendig å innføre en ny værtjeneste eller en ny AI-modell dersom eksisterende funksjonalitet kan løse oppgaven.

**Problemet er at Glimt ikke alltid kobler brukerens naturlige spørsmål til de verktøyene og datakildene den allerede har tilgang til.**

Jeg ønsker at du finner rotårsaken og retter den på en måte som forbedrer Glimt generelt, ikke bare for akkurat dette spørsmålet.

## 2. Hva Glimt skal forstå

Når jeg spør:

«Hvordan er været i Oslo i dag og temperaturen i New York i morgen?»

skal Glimt identifisere at spørsmålet inneholder to separate forespørsler:

**Forespørsel 1**
- Sted: Oslo.
- Tidspunkt: I dag.
- Informasjon: Værforhold, inkludert temperatur og andre relevante tilgjengelige opplysninger.

**Forespørsel 2**
- Sted: New York.
- Tidspunkt: I morgen.
- Informasjon: Temperaturprognose.

Deretter skal Glimt hente de riktige dataene fra værtjenesten, kombinere resultatene og presentere et samlet svar på norsk.

Den skal ikke behandle hele setningen som én enkelt værforespørsel med ett sted og én dato.

Hvis værtjenesten støtter begge forespørslene, skal Glimt kunne utføre dem i samme brukerforespørsel. Den kan gjøre separate verktøykall eller bruke et eksisterende grensesnitt som støtter flere steder og datoer.

## 3. Undersøk den eksisterende værtjenesten

Før du endrer noe, undersøk den faktiske implementasjonen.

Finn ut:

- Hvilken værtjeneste eller værintegrasjon appen allerede bruker.
- Hvordan værtjenesten kalles fra applikasjonen.
- Hvilke parametere den støtter for sted, dato og prognoseperiode.
- Hvordan Glimt får tilgang til værtjenesten.
- Om det finnes en funksjon eller et verktøy for værdata som modellen ikke bruker riktig.
- Om verktøykall begrenses til ett sted eller én dato om gangen.
- Om datoer, tidssoner eller stedsnavn blir tolket feil.
- Om hjemskjermens søkefelt bruker en annen behandlingsflyt enn andre deler av appen.
- Om Glimt svarer direkte fra språkmodellen i stedet for å hente faktiske værdata.

Ikke anta at funksjonaliteten mangler før du har undersøkt den. Det kan være et problem med intensjonsgjenkjenning, verktøyruting, argumenter, svarbehandling eller selve integrasjonen.

## 4. Forbedre forståelsen av naturlige værspørsmål

Glimt skal kunne forstå ulike formuleringer av samme forespørsel.

Eksempler:

- «Hvordan er været i Oslo i dag?»
- «Hva blir temperaturen i New York i morgen?»
- «Blir det regn i Bergen på fredag?»
- «Sammenlign været i Oslo og Stockholm i morgen.»
- «Hvor varmt blir det i London neste uke?»
- «Hva er temperaturen i Oslo nå, og hvordan blir den i morgen?»
- «Hvordan er været i Oslo i dag og temperaturen i New York i morgen?»
- «Er det varmere i Oslo eller New York i morgen?»

Dette skal ikke løses ved å legge inn én spesialregel per setning.

Glimt skal forstå intensjonen, identifisere relevante parametere og bruke den eksisterende værtjenesten på riktig måte.

Støtt norsk naturlig språk, inkludert vanlige uttrykk som «i dag», «i morgen», «på fredag», «til helgen», «nå» og «neste uke».

Relative datoer skal beregnes ut fra riktig aktuell dato og relevant lokal tidssone. Vær spesielt oppmerksom på at Oslo og New York kan ha forskjellige lokale datoer og klokkeslett.

## 5. Håndter flere forespørsler i samme spørsmål

Dette er et generelt krav, ikke bare for vær.

Brukeren skal kunne kombinere flere relaterte spørsmål i én setning, for eksempel:

- «Hva er temperaturen i Oslo i dag, og i Bergen i morgen?»
- «Hvordan blir været i Oslo i morgen, og regner det i Stockholm på lørdag?»
- «Hva er temperaturen i Oslo og New York akkurat nå?»
- «Sammenlign været i tre byer i helgen.»

Glimt skal kunne identifisere hvert delspørsmål og hente data for alle nødvendige kombinasjoner av sted, tidspunkt og informasjonstype.

Hvis flere kall kan utføres uavhengig av hverandre, bør de utføres effektivt, gjerne parallelt dersom den eksisterende arkitekturen støtter det.

Hvis ett av kallene feiler, skal Glimt fortsatt presentere tilgjengelige resultater og forklare hvilken del som ikke kunne hentes.

## 6. Ikke forveksle nåværende vær med værprognoser

Glimt må bruke riktig type værdata.

- «Nå» krever aktuelle værdata.
- «I dag» krever relevante data for dagens vær.
- «I morgen» krever en prognose for morgendagen.
- «Neste uke» krever en prognose som dekker den etterspurte perioden.

Hvis brukeren spør etter temperaturen i morgen, skal Glimt ikke svare med dagens temperatur.

Hvis brukeren spør om været gjennom hele dagen, bør den bruke tilgjengelige prognoser for dagen og ikke bare hente ett tilfeldig tidspunkt.

Vær tydelig på hva temperaturen representerer, for eksempel aktuell temperatur, forventet maksimum, forventet minimum eller temperatur på et bestemt tidspunkt.

Ikke finn på temperaturer, værforhold eller prognoser dersom værtjenesten ikke returnerer dem.

## 7. Gjør hjemskjermens AI-søk mer robust

Hjemskjermen skal være en generell inngang til Glimt og applikasjonens funksjonalitet.

Undersøk om søkefeltet bruker en generell AI-flyt som faktisk kan velge mellom tilgjengelige verktøy, eller om det finnes begrensninger som gjør at enkelte forespørsler aldri når frem til værtjenesten.

Glimt skal kunne:

1. Identifisere hva brukeren ønsker.
2. Finne ut hvilke verktøy og datakilder som er relevante.
3. Dele opp forespørselen i nødvendige deloppgaver.
4. Konstruere gyldige verktøykall med riktige argumenter.
5. Hente faktiske resultater.
6. Kombinere resultatene til ett forståelig svar.

Denne mekanismen bør gjenbrukes for andre moduler i appen, deriblant finans, kalender, huskelister og kollektivtransport.

Ikke bygg en separat, hardkodet værassistent dersom problemet egentlig ligger i den generelle behandlingen av forespørsler.

## 8. Lokal AI og eksisterende arkitektur

Glimt kjører lokalt gjennom Ollama på en Mac mini M4 med 16 GB minne.

Behold den eksisterende modellen og arkitekturen med mindre du finner en konkret teknisk grunn til at de hindrer funksjonaliteten.

Undersøk først om problemet kan løses gjennom bedre verktøydefinisjoner, strukturert output, intensjonsgjenkjenning, datovalidering eller endringer i behandlingsflyten.

Ikke send forespørslene til en ekstern AI-tjeneste som en snarvei.

Ikke anta at modellen støtter alle typer tool calling. Kontroller den faktiske støtten i modellen og Ollama-oppsettet, og bruk en robust fallback hvis det er nødvendig.

## 9. Automatiserte tester

Lag tester som kontrollerer hele kjeden fra brukerens spørsmål til faktisk resultat.

Test minst følgende:

1. Vær i én by i dag.
2. Temperatur i én by i morgen.
3. To byer med samme dato.
4. To byer med forskjellige datoer.
5. Flere værrelaterte spørsmål i samme setning.
6. Relative datoer ved månedsskifte og årsskifte.
7. Steder i forskjellige tidssoner.
8. Ugyldig stedsnavn.
9. Manglende eller ufullstendige værdata.
10. Feil fra værtjenesten.
11. Spørsmål fra hjemskjermen som krever flere verktøykall.

Bruk mockede værresultater i automatiserte tester der det er hensiktsmessig, slik at resultatene er forutsigbare og ikke avhenger av været på testtidspunktet.

Kontroller at Glimt velger riktig verktøy, sender riktige steder og datoer, henter alle nødvendige resultater og formidler dem korrekt.

Det er ikke nok at modellen gir et svar som høres fornuftig ut. Test at de faktiske verktøyene blir brukt riktig.

## 10. Gjennomfør endringene

Arbeid direkte i det eksisterende prosjektet.

- Finn rotårsaken.
- Implementer en varig løsning.
- Gjenbruk eksisterende værtjeneste og funksjoner.
- Legg til relevante tester.
- Kjør testene og kontroller at eksisterende funksjonalitet ikke blir ødelagt.

Ikke stopp etter å ha skrevet en analyse eller foreslått en plan.

Hvis du ikke kan teste en del av systemet i tilgjengelig miljø, skal du tydelig opplyse om dette.

Avslutt med en kort rapport om rotårsaken, hvilke filer som ble endret, hvilke tester som ble kjørt, og hvilke begrensninger som eventuelt gjenstår.

## Sluttmål

Glimt skal fungere som en intelligent assistent som forstår hva jeg spør om, og som bruker funksjonaliteten den allerede har tilgang til.

Når jeg spør om været i Oslo i dag og temperaturen i New York i morgen, skal den ikke bli stående fast på spørsmålsformuleringen. Den skal identifisere begge delene, hente de faktiske værdataene og gi meg et samlet svar.

**Prioriter å rette den underliggende svakheten i forståelse og verktøybruk, slik at Glimt også blir bedre på nye spørsmål jeg ikke har gitt konkrete eksempler på.**
