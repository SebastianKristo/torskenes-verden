# Oppfølgingsoppdrag: Gjør Glimt bedre til å finne og bruke eksisterende data

Glimt har blitt bedre etter de siste endringene, men den har fortsatt problemer med å forstå og besvare spørsmål som burde være enkle å løse ved å bruke data som allerede finnes i appen.

Jeg vil at du skal undersøke og rette dette problemet i den eksisterende implementasjonen. Ikke bygg en ny app, og ikke gjør bare enda en liten justering av systemprompten.

## 1. Konkret eksempel på problemet

Jeg spurte Glimt fra hjemskjermen:

«Hva er det dyreste abonnementet jeg har?»

Dette burde være en enkel oppgave. Appen har allerede en finansmodul, og Glimt burde kunne undersøke hvilke abonnementer jeg har registrert, sammenligne kostnadene og fortelle meg hvilket som er dyrest.

Glimt bør kunne forstå at spørsmålet innebærer følgende:

1. Finne tilgjengelige abonnementer i appens data.
2. Identifisere kostnaden for hvert abonnement.
3. Normalisere kostnadene til en sammenlignbar periode.
4. Finne abonnementet med høyest kostnad.
5. Presentere navnet, prisen og relevant betalingsperiode.

Hvis jeg for eksempel har disse abonnementene:

- Netflix: 149 kr per måned.
- Spotify: 119 kr per måned.
- En tjeneste som koster 1 200 kr per år.

Da skal Glimt kunne sammenligne dem korrekt. Den årlige betalingen tilsvarer 100 kr per måned, og Netflix er derfor dyrest per måned i dette eksemplet.

Tallene er kun illustrasjoner. Glimt skal bruke mine faktiske data, ikke disse eksempelverdiene.

Hvis jeg spør «Hvilket abonnement betaler jeg mest for i året?», skal den sammenligne årlige kostnader. Hvis jeg spør «Hva er det dyreste abonnementet jeg har?», skal den normalt sammenligne total kostnad per år, og gjerne vise månedsbeløpet også.

## 2. Problemet er større enn abonnementer

Dette eksemplet illustrerer en generell svakhet: Glimt klarer ikke alltid å koble naturlige spørsmål til dataene, funksjonene og beregningene som allerede finnes i appen.

Jeg vil at Glimt skal kunne besvare spørsmål som:

- «Hva er det dyreste abonnementet mitt?»
- «Hvor mye betaler jeg totalt for abonnementer hver måned?»
- «Hvilke abonnementer har blitt dyrere?»
- «Hvilke abonnementer bruker jeg mest penger på i året?»
- «Hva er de fem største faste utgiftene mine?»
- «Hvor mye bruker jeg på strøm sammenlignet med forrige måned?»
- «Hva var mitt dyreste kjøp forrige måned?»
- «Hva bruker jeg mest penger på?»
- «Finn den dyreste kvitteringen jeg har.»
- «Hvilke faste betalinger har jeg denne måneden?»

Dette er eksempler på spørsmål Glimt bør kunne forstå og løse ved å hente riktige data og utføre nødvendige beregninger.

Du skal ikke hardkode svarene på disse spørsmålene. Du skal forbedre systemet slik at det kan løse lignende spørsmål som ikke er spesifisert på forhånd.

## 3. Undersøk hva Glimt faktisk har tilgang til

Gå gjennom den eksisterende koden og finn ut:

- Hvor abonnementene lagres.
- Om abonnementene finnes som egne objekter, finansposter, gjentakende transaksjoner eller en kombinasjon.
- Hvilke funksjoner som allerede kan hente abonnementer og finansdata.
- Om Glimt faktisk har tilgang til disse funksjonene fra hjemskjermen.
- Om den kan hente komplette datasett eller bare begrensede sammendrag.
- Om kostnader, betalingsintervaller og fornyelsesdatoer er tilgjengelige.
- Om verktøyresultatene blir sendt tilbake til modellen på en måte den kan forstå og bruke.
- Om Glimt svarer fra modellens generelle kunnskap i stedet for å undersøke appens faktiske data.

Finn den konkrete rotårsaken til at den ikke løser slike spørsmål.

Ikke anta at abonnementene mangler bare fordi Glimt ikke finner dem. Kontroller først om de finnes i datakilden, og om det er et problem med verktøytilgang, søk, datamodell, ruting eller tolkning.

## 4. Glimt må forstå hensikten, ikke bare ordene

Spørsmålet «Hva er det dyreste abonnementet jeg har?» inneholder ikke nødvendigvis ord som «finans», «liste», «hent abonnementer» eller «sorter etter pris».

Likevel skal Glimt forstå at den må undersøke abonnementene og sammenligne dem.

Den skal kunne gjøre dette selv om spørsmålet formuleres på andre måter, for eksempel:

- «Hvilket av abonnementene mine koster mest?»
- «Hva bruker jeg mest på abonnementer?»
- «Hva er den største årlige abonnementskostnaden min?»
- «Hvilket abonnement er dyrest hvis vi regner per måned?»

Dette krever ikke en egen spesialregel for hver formulering. Det krever at Glimt forstår hensikten og velger riktig fremgangsmåte.

## 5. Gjør data tilgjengelige for AI-en på riktig måte

Hvis abonnementene allerede finnes i appen, skal Glimt kunne hente dem gjennom eksisterende tjenester, API-er eller verktøy.

Hvis nødvendig funksjonalitet mangler, skal du utvide den eksisterende implementasjonen på en ryddig måte.

Vurder om det er hensiktsmessig å tilby gjenbrukbare verktøy for å:

- Hente abonnementer.
- Hente faste utgifter.
- Søke i transaksjoner.
- Søke i kvitteringer.
- Filtrere data etter dato og kategori.
- Beregne summer og sammenligne kostnader.
- Sortere og rangere resultater.

Ikke gi modellen tilgang til ubegrensede datamengder hvis et presist verktøy kan returnere riktig informasjon. Men ikke begrens dataene så mye at den mister abonnementer eller relevante resultater.

Bruk deterministisk kode til sortering, summering og normalisering av kostnader der dette gir mer pålitelige svar enn å be modellen regne selv.

## 6. Sammenlign kostnader korrekt

Abonnementer kan ha forskjellige betalingsintervaller:

- Ukentlig.
- Månedlig.
- Kvartalsvis.
- Halvårlig.
- Årlig.
- Andre intervaller eller uregelmessige betalinger.

Glimt skal ikke sammenligne bare det oppgitte beløpet. Den må ta hensyn til betalingsintervallet.

Som utgangspunkt:

- Månedskostnad = sammenlignbar kostnad per måned.
- Årskostnad = forventet kostnad over 12 måneder.
- Manglende eller ukjent intervall = ikke gjett; opplys at sammenligningen er usikker.

Håndter også prøveperioder, gratisabonnementer, delte abonnementer og varierende priser dersom disse opplysningene finnes i datakilden.

Skill mellom registrerte abonnementer og betalinger som bare ser ut til å være gjentakende transaksjoner. Ikke presenter en antatt abonnementstjeneste som et bekreftet abonnement uten tilstrekkelig grunnlag.

## 7. Forventet svar fra Glimt

Når jeg spør «Hva er det dyreste abonnementet jeg har?», ønsker jeg et konkret svar som dette:

«Det dyreste abonnementet ditt er [navn], som koster [beløp] per [betalingsperiode]. Det tilsvarer omtrent [beløp] per måned og [beløp] per år.»

Vis gjerne andre abonnementer i en kort rangert liste dersom det er nyttig.

Alle tall skal komme fra faktiske data, og beregningene skal være riktige. Hvis det finnes flere mulige tolkninger av «dyrest», kan Glimt kort forklare om den har rangert etter måneds- eller årskostnad.

Hvis dataene ikke er tilgjengelige, skal Glimt si konkret hva den ikke får tilgang til. Den skal ikke late som om den har søkt gjennom alle abonnementene.

## 8. Hjemskjermen skal være like intelligent som modulene

Hjemskjermen er den viktigste inngangen til Glimt.

Når jeg spør et spørsmål der, skal den kunne finne ut hvilken modul eller datakilde som er relevant, hente nødvendig informasjon og besvare spørsmålet.

Jeg skal ikke måtte åpne finansmodulen først, skrive «søk i abonnementer», eller kjenne de interne navnene på funksjonene i appen.

Sørg for at hjemskjermen og modulene bruker en felles og robust måte å forstå forespørsler på, samtidig som de respekterer modulenes eksisterende tilgangskontroll og funksjoner.

## 9. Test før du sier at det er fikset

Lag automatiserte tester som kontrollerer både verktøybruk og faktiske resultater.

Test minst følgende:

1. Finn det dyreste månedlige abonnementet.
2. Finn det dyreste abonnementet målt i årlig kostnad.
3. Sammenlign et månedlig abonnement med et årlig abonnement.
4. Beregn samlet måneds- og årskostnad.
5. Håndter abonnementer med manglende pris eller betalingsintervall.
6. Håndter tomme lister og utilgjengelige datakilder.
7. Kontroller at samme spørsmål fungerer fra hjemskjermen.
8. Kontroller at resultatene er basert på de faktiske abonnementene i testdataene.
9. Test flere naturlige formuleringer av samme spørsmål.

Test at Glimt faktisk henter dataene og velger riktig resultat. Det er ikke nok at modellen formulerer et svar som høres riktig ut.

## 10. Gjennomføring

Undersøk implementasjonen først. Finn rotårsaken, implementer en varig løsning og kjør testene.

Behold den eksisterende arkitekturen og den lokale AI-løsningen via Ollama på Mac mini M4 med 16 GB minne. Ikke innfør en ekstern AI-tjeneste bare for å løse dette problemet.

Ikke stopp etter å ha foreslått løsninger eller endret systemprompten. Gjør de nødvendige kodeendringene hvis du har tilgang til prosjektet.

Til slutt skal du rapportere:

- Hva som faktisk var årsaken til problemet.
- Hvilke filer og komponenter du endret.
- Hvordan Glimt nå finner og sammenligner abonnementene.
- Hvilke tester som ble kjørt, og resultatene av dem.
- Eventuelle begrensninger som fortsatt finnes.

**Målet er at Glimt skal kunne svare intelligent på spørsmål om informasjon som allerede finnes i appen, uten at jeg må fortelle den hvilken modul den skal bruke eller hvordan den skal utføre søket.**
