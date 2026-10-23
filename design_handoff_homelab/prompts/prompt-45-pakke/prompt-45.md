# Prompt 45

Startet 2026-10-23.

## Claude Code-filer
claude-code-ruter-anbefalt-antall.md, claude-code-mer-tittel-og-store-bokser.md, claude-code-media-tilbakeknapp.md, claude-code-vaer-min-posisjon-popup.md, claude-code-studie-vitnemal-analyse-original.md, claude-code-gjoremal-web-bakgrunn.md, claude-code-search-console-statistikk.md, claude-code-media-slett-uovervakede-episoder.md, claude-code-avspilling-statistikk-mobil.md, claude-code-media-mer-farger.md, claude-code-kalender-mac-fryser-widget.md, claude-code-innstillinger-samlet.md, claude-code-ai-import-claude-chatgpt-gemini.md, claude-code-glimt-intelligent-agent.md, claude-code-glimt-kun-systemvarsel.md, claude-code-fold-sok-over-tastatur.md, claude-code-fold-skann-i-navbar.md, claude-code-fold-hjemknapp-animasjon.md, claude-code-fold-wiggle-knapper-navbar.md, claude-code-fold-skannikon-og-sokefelt.md, claude-code-finans-mer-samme-design.md, claude-code-familie-fold-oppsett.md, claude-code-ipad-brettoppsett.md, claude-code-wiggle-android-dra.md, claude-code-gjoremal-fold-navbar-glimt.md, claude-code-gjoremal-uten-bakgrunn.md, claude-code-web-kalenderkort-ikon.md, claude-code-gjoremal-fold-nytt-design.md, claude-code-sonevarsler-ikon-bryter.md, claude-code-helse-ha-opprydding.md, claude-code-docker-logger-automatisk.md

## 2026-10-23

- I ruter anbefalt min reise, la meg velge hvor mang som skal vises feks 1 eller 2 eller 3
- I mer meny, la meg slette titel under søk «hverdag og familie», la meg også endre hvilke som skal være i de fire store boksene.
- I media blant annet bruk samme desing på tilbake knapp som i resten av systemet.
- I vær popup lag også en vær som viser væet der enheten som har vær åpen er.
- I studie på web, jeg lastet opp vitnemål men den klarte ikke å finne ut av karakter og slikt. Jeg vil også kunne se orgianl bildet eller filen.
- Gjøremål på web skal matche bakgrunnen nå er det en border rundt den og en den fyller ikke skjremn.
- Google search console gir heler ikke fra seg noe statistikk
- I media under feks sonar, jeg vil kunne alete ned eposidero som ikke er overvåket.
- Få lagt til avspilling statistikk siden i mobil også.
- I media på mobil og web gi den mer farger
- Calendar app for Mac fryser fortsatt, når jeg trykker på widget så fryser den ofte.
- Fjern innstligner fra media i web legg alle innslinger i alle faner i web og mobil i innstligner menyen.
- Som I gjøremål ikke vis synk med homasisatnt i gjøremål dette skal ligge i innnstlinger.
- Import av chat og memories fra claude funket ikke, jeg vil også kunne importere fra chat gpt og gemini,
- Oppdrag: Gjør Glimt til en intelligent, kontekstbevisst AI-assistent på tvers av hele appen (fullt oppdrag ordrett under)

### Oppdrag: Gjør Glimt til en intelligent, kontekstbevisst AI-assistent på tvers av hele appen

Jeg ønsker at du skal gjennomgå og forbedre hvordan AI-assistenten Glimt forstår, tolker og utfører forespørsler i hele applikasjonen.

1. Bakgrunn og eksisterende system
Du kjenner allerede prosjektet og arkitekturen. Appen er en alt-i-ett-applikasjon med blant annet:
* Daglig briefing
* Finans, transaksjoner og kvitteringer
* Kollektivtransport
* Huskelister og oppgaver
* Kalender og avtaler
* Hjemskjerm med AI-assistenten Glimt
* Andre eksisterende funksjoner og moduler i appen
Glimt er allerede koblet til en lokal AI som kjører gjennom Ollama på en Mac mini M4 med 16 GB minne.
Ikke bygg en ny app, bytt ut eksisterende arkitektur eller fjern funksjonalitet. Målet er å forbedre intelligensen, verktøybruken og handlingsutførelsen i det eksisterende systemet.

2. Problemet som må løses
Jeg har flere ganger bedt deg rette opp i at Glimt ikke bruker intelligensen sin riktig når jeg skriver naturlige forespørsler.
Glimt kan ofte forstå hva jeg mener, men den klarer ikke alltid å omsette forståelsen til korrekte handlinger. Dette skjer på hjemskjermen, i kalenderen, på huskelister, i finans og i andre deler av appen.
Jeg vil ikke at Glimt bare skal matche nøkkelord eller sende forespørselen videre til en enkel funksjon som prøver å gjette hva brukeren mener.
Glimt skal først forstå hensikten, tolke informasjonen, bruke konteksten og deretter velge riktig handling og verktøy.

Eksempel A: Opprette en kalenderavtale
Hvis jeg skriver:
«Legg til time 12.10 12:15 Kino se på dune»
skal Glimt forstå at dette er en forespørsel om å opprette en kalenderavtale.
Den skal tolke informasjonen slik:
* Dato: 12. oktober, med riktig år ut fra konteksten og appens datohåndtering.
* Starttid: 12:15.
* Tittel: «Kino – Dune».
* Handling: Opprett en kalenderavtale.
Den skal ikke bruke hele teksten som tittel, plassere datoen i feil felt eller overse klokkeslettet.
Dersom sluttidspunkt mangler, skal Glimt følge eksisterende regler for standardvarighet eller spørre hvis det er nødvendig. Den skal ikke finne på opplysninger som brukeren ikke har gitt.
Datoer må tolkes med hensyn til dagens dato, tidssone, språk og konvensjonene som allerede brukes i appen.

Eksempel B: Opprette en huskelisteoppgave
Hvis jeg skriver:
«Husk at jeg må kjøpe melk etter skolen i morgen»
skal Glimt forstå at dette er en oppgave eller påminnelse, ikke bare en tekst som skal lagres ordrett.
Den bør kunne utlede:
* Oppgavetittel: «Kjøpe melk».
* Tidspunkt eller frist: I morgen etter skolen, dersom appen støtter dette og tidspunktet kan fastsettes.
* Relevant liste eller kategori: Den som passer best ut fra eksisterende funksjonalitet.
* Påminnelse: Bare dersom det er relevant og støttet av appen.
Hvis «etter skolen» ikke kan omgjøres til et bestemt tidspunkt uten å gjette, skal Glimt bevare denne informasjonen eller spørre om tidspunktet.

Eksempel C: Finne kvitteringer og transaksjoner
Hvis jeg skriver:
«Finn kvitteringen for det jeg kjøpte på Elkjøp i forrige måned»
skal Glimt forstå at dette er et søk etter en kvittering, ikke bare et generelt søk etter ordet «Elkjøp».
Den skal bruke tilgjengelige data og søkefunksjoner til å undersøke relevante opplysninger, for eksempel:
* Butikk eller forhandler: Elkjøp.
* Tidsperiode: Forrige kalendermåned, beregnet fra dagens dato.
* Kvitteringer knyttet til aktuelle kjøp.
* Transaksjoner som kan hjelpe med å identifisere riktig kvittering.
Hvis jeg skriver:
«Hva kjøpte jeg for 849 kroner hos Clas Ohlson?»
skal Glimt kunne søke etter relevante beløp, forhandlernavn, datoer og kvitteringsinnhold dersom disse dataene finnes og er tilgjengelige.
Hvis jeg skriver:
«Finn alle kvitteringene der jeg kjøpte batterier»
skal den søke i kvitteringenes faktiske varelinjer eller indekserte innhold, dersom systemet støtter dette. Den skal ikke begrense søket til kvitteringer der ordet «batterier» finnes i filnavnet.
Hvis flere resultater passer, skal Glimt presentere dem og la meg velge. Hvis ingen resultater finnes, skal den forklare dette uten å finne på kjøp eller kvitteringer.

Eksempel D: Forespørsler fra hjemskjermen
Når jeg skriver en forespørsel på hjemskjermen, skal Glimt kunne forstå hvilken del av appen den gjelder og bruke riktig funksjonalitet.
Eksempler:
* «Legg til kino i kalenderen fredag klokka sju.»
* «Hva brukte jeg mest penger på forrige måned?»
* «Finn kvitteringen for den nye laderen.»
* «Minn meg på å bestille service på bilen neste uke.»
* «Hva har jeg på kalenderen i morgen?»
Disse forespørslene skal ikke behandles som vanlige spørsmål hvis de egentlig ber om en handling, et søk eller en oppsummering av data i appen.
Glimt skal kunne rute forespørselen til riktig modul, selv om jeg bruker hjemskjermen og ikke åpner den aktuelle modulen først.

3. Undersøk den underliggende årsaken før du endrer kode
Dette er viktig: Jeg har allerede bedt om forbedringer flere ganger, men problemet vedvarer.
Ikke gjør enda en overflatisk endring i systemprompten og anta at problemet er løst.
Undersøk den faktiske implementasjonen og følg hele kjeden fra brukerens tekst til resultatet:
1. Hvordan forespørselen sendes til Ollama.
2. Hvilken modell og hvilke instruksjoner som brukes.
3. Hvordan modellen tolker hensikten med forespørselen.
4. Hvordan verktøy og funksjoner velges.
5. Hvordan datoer, klokkeslett, titler, beløp og andre strukturerte felter utledes.
6. Hvordan forespørselen rutes mellom hjemskjermen og de ulike modulene.
7. Hvordan verktøyresultater og feilmeldinger behandles.
8. Hvordan handlinger lagres i de faktiske datakildene.
9. Hvordan resultatet presenteres for brukeren.
Finn ut hvor informasjon går tapt, hvor modellen ikke får tilgang til nødvendige verktøy, og hvor deterministisk kode overskriver eller feiltolker modellens resultat.
Undersøk også om ulike deler av appen bruker separate prompts, ulike parsere eller forskjellige handlingssystemer som gir inkonsekvent oppførsel.
Finn rotårsaken og rett den. Ikke bare legg til spesialregler for eksemplene ovenfor.

4. Innfør en robust forståelses- og handlingsflyt
Forbedre eksisterende arkitektur slik at Glimt, der det er hensiktsmessig, følger denne prosessen:
Steg 1 – Forstå intensjonen
Identifiser om brukeren ønsker å stille et spørsmål, søke etter informasjon, opprette noe, endre noe, finne eksisterende data, slette noe eller utføre flere handlinger.
Steg 2 – Hent relevant kontekst
Bruk riktig informasjon fra den aktuelle modulen, samt nødvendig felles kontekst som dato, tidssone og brukerens eksisterende data.
Ikke hent unødvendig mye data for hver forespørsel.
Steg 3 – Lag en strukturert plan
Oversett forespørselen til en tydelig intern representasjon av handlingen, med riktige felter og argumenter.
For eksempel skal en kalenderhandling ha separate felter for tittel, dato, starttid og eventuelt sluttid, i stedet for å sende hele brukerens setning direkte videre som en tittel.
Steg 4 – Valider resultatet
Kontroller at påkrevde felter finnes, at datoer er gyldige, at beløp og filtre gir mening, og at handlingen er støttet av den aktuelle modulen.
Bruk deterministisk parsing og validering der det gir bedre pålitelighet. La modellen håndtere naturlig språk og tvetydighet, fremfor å forsøke å løse alt med regex eller nøkkelord.
Steg 5 – Utfør riktig handling
Bruk eksisterende verktøy, API-er og tjenester i appen. Sørg for at verktøyene mottar riktig strukturert informasjon, og at handlinger faktisk utføres i riktig datakilde.
Steg 6 – Kontroller resultatet
Bekreft at handlingen lyktes før Glimt sier at noe er opprettet, endret eller funnet.
Steg 7 – Svar naturlig
Gi en kort og tydelig bekreftelse som beskriver hva som faktisk skjedde.
Hvis nødvendig informasjon mangler, still ett konkret oppfølgingsspørsmål. Ikke still spørsmål når informasjonen allerede kan utledes pålitelig.

5. Forbedre verktøybruk og funksjonskall
Undersøk om modellen kan velge mellom tilgjengelige funksjoner på en pålitelig måte.
Hvis Ollama-modellen støtter egnet tool calling, bør eksisterende verktøy integreres slik at modellen kan velge riktig funksjon og sende strukturerte argumenter.
Ikke anta at modellen automatisk støtter alle funksjonene du ønsker. Kontroller faktisk støtte i den valgte modellen og Ollama-oppsettet.
Hvis modellen ikke støtter dette godt nok, bruk en robust kombinasjon av intensjonsgjenkjenning, strukturert output, validering og kontrollert verktøyruting.
Det skal være mulig å utføre handlinger fra hjemskjermen uten at modellen trenger å ha en egen, separat implementasjon av hver funksjon.
Samtidig skal eksisterende modulspesifikke regler og datatilgang respekteres.

6. Gjør søk i finans intelligent
Finans er et område hvor Glimt må kunne forstå hva brukeren faktisk leter etter.
Undersøk hvilke data som allerede er tilgjengelige, og hvordan søket fungerer i dag.
Støtt naturlige søk basert på relevante kombinasjoner av:
* Forhandler og butikk.
* Beløp og beløpsintervaller.
* Datoer og tidsperioder.
* Beskrivelser og transaksjonstekst.
* Kvitteringsinnhold og varelinjer.
* Kategorier.
* Relaterte transaksjoner og kvitteringer.
Ikke bygg opp et falskt inntrykk av at Glimt kan søke i data den faktisk ikke har tilgang til.
Hvis varelinjer ikke er tilgjengelige eller OCR ikke er utført, skal dette håndteres ærlig. Undersøk om eksisterende indeksering kan forbedres før du introduserer nye, tunge tjenester.
Bruk strukturerte filtre når de passer, og semantisk søk når brukeren beskriver innhold med andre ord enn dem som står i datakilden.

7. Kontekst mellom moduler
Glimt skal ha en konsistent måte å forstå forespørsler på i hele appen.
Den samme intensjonen skal ikke tolkes helt forskjellig avhengig av om brukeren starter på hjemskjermen, kalenderen eller huskelisten.
Modulene kan ha forskjellige funksjoner, men de bør dele en felles forståelses- og handlingsmekanisme der dette er hensiktsmessig.
Hvis brukeren allerede befinner seg i kalenderen og skriver «flytt den til fredag», bør Glimt undersøke relevant kontekst og identifisere hvilken avtale «den» viser til. Hvis referansen ikke er entydig, skal den spørre i stedet for å endre feil avtale.

8. Sikkerhet og pålitelighet
Intelligens betyr ikke at Glimt skal gjette ukritisk.
* Ikke opprett dupliserte avtaler fordi en forespørsel behandles flere ganger.
* Ikke bekreft handlinger som ikke er gjennomført.
* Ikke endre eller slette data når målet er uklart.
* Be om bekreftelse før viktige eller destruktive handlinger når det er nødvendig.
* Ikke finn på kvitteringer, transaksjoner, avtaler eller andre data.
* Bevar eksisterende tilgangskontroll og personvern.
* Skill mellom å foreslå en handling og å faktisk utføre den.
* Loggfør relevante tekniske feil og verktøyvalg uten å eksponere unødvendige personopplysninger.

9. Test med reelle eksempler
Lag en testpakke som kontrollerer både forståelse, valg av verktøy, strukturerte argumenter og faktisk resultat.
Ta minst med følgende typer tester:
Forespørsel	Forventet oppførsel
«Legg til time 12.10 12:15 Kino se på dune»	Oppretter avtale med riktig dato, starttid og en ryddig tittel som «Kino – Dune»
«Legg til kino fredag klokka sju»	Tolker riktig fredag og klokkeslett, uten å finne på manglende informasjon
«Minn meg på å kjøpe melk i morgen»	Oppretter en passende oppgave eller påminnelse
«Hva har jeg i kalenderen neste uke?»	Henter faktiske avtaler for riktig periode
«Finn kvitteringen fra Elkjøp forrige måned»	Søker i riktige datakilder med riktig tidsfilter
«Hva kjøpte jeg for 849 kroner hos Clas Ohlson?»	Søker etter relevante beløp, forhandler og tilgjengelige kvitteringsdata
«Finn kvitteringer med batterier»	Søker i tilgjengelig varelinje- eller kvitteringsinnhold
«Flytt avtalen til fredag»	Bruker kontekst hvis avtalen er entydig, ellers spør den
«Hva brukte jeg mest penger på forrige måned?»	Beregner svaret fra faktiske transaksjoner
En tvetydig eller ufullstendig forespørsel	Stiller et konkret spørsmål i stedet for å gjette
Test også datoer rundt månedsskifter og årsskifter, norske datoformater, relative datoer, ugyldige datoer, tomme søkeresultater, flere treff, verktøyfeil og gjentatte forespørsler.
Test både fra hjemskjermen og fra relevante moduler.
Bruk automatiserte tester der det er mulig. Ikke test bare om modellen produserer en fornuftig tekst. Kontroller at de riktige dataene faktisk blir lagret, hentet eller endret.

10. Ressursbruk og lokal AI
Løsningen skal fortsatt fungere med lokal AI via Ollama på Mac mini M4 med 16 GB minne.
Ikke løs problemet ved å sende alle forespørsler til en stor ekstern modell eller ved å innføre kostbare eksterne AI-tjenester.
Prioriter:
* Effektiv bruk av den eksisterende modellen.
* Små og presise kontekstvinduer.
* Strukturert output.
* Deterministisk håndtering av datoer, tall og andre tydelige felter.
* Gjenbruk av eksisterende funksjoner og API-er.
* Minst mulig unødvendig antall modellkall.
* Fallback når modellen gir ugyldig eller ufullstendig output.
Ikke bytt modell eller endre viktige Ollama-innstillinger uten å undersøke konsekvensene først.

11. Gjennomføring
Arbeid direkte i det eksisterende prosjektet.
1. Kartlegg relevant kode og dokumenter dagens dataflyt.
2. Identifiser de konkrete rotårsakene til at tidligere rettelser ikke har fungert.
3. Lag en kort plan for den tekniske løsningen.
4. Implementer forbedringene i den eksisterende arkitekturen.
5. Legg til automatiserte tester for de viktigste brukerflytene.
6. Kjør relevante tester og kontroller eventuelle regresjoner.
7. Rett feil som avdekkes, og kontroller at eksisterende funksjonalitet fortsatt virker.
Ikke stopp etter å ha foreslått en plan eller skrevet en rapport. Gjennomfør endringene hvis du har tilgang til nødvendig kode og miljø.
Hvis noe ikke kan testes i det tilgjengelige miljøet, si tydelig hva som er implementert, hva som faktisk er testet, og hva som gjenstår.

12. Sluttmålet
Jeg ønsker at Glimt skal føles som en intelligent personlig assistent, ikke som et enkelt tekstfelt koblet til noen funksjoner.
Når jeg skriver naturlig, skal den:
* Forstå hva jeg mener, ikke bare ordene jeg bruker.
* Tolke datoer, klokkeslett, beløp og titler riktig.
* Finne frem til relevante data i appen.
* Velge riktige verktøy og moduler.
* Bruke konteksten når det er nyttig.
* Gjennomføre handlinger pålitelig.
* Spørre når noe faktisk er uklart.
* Bekrefte hva som skjedde uten å overdrive hva den har gjort.
Viktigste prioritet: Finn ut hvorfor Glimt ikke bruker forståelsen sin riktig i dag, selv etter tidligere rettelser. Løs problemet på systemnivå slik at forbedringene gjelder gjennomgående for hele appen, ikke bare for noen få forhåndsdefinerte setninger.
Begynn med å undersøke implementasjonen, og fortsett deretter med konkrete, testbare forbedringer. Gi også glimt litt personlighet, noe av den personligheten er at han er en god nordmann og en monarkist. Han skal også være en liten rakker og moroknarkist.

- Glimt svarte mens du var borte, det vil jeg kun ha som ynkelige varslinger fra appen når jeg ikke er appen, jeg vil ikke ha det når jeg feks åpner appen igjen, da vil jeg ikke at det skal stå glimt svarte mens du var borte.
- i fold versjonen av appen så når man bruker søkebar på hjem vil jeg at den skal gå over tastatutret når man skriver (skjermbilde: uploads/Screenshot 2026-10-23 at 09.28.49.png)
- legg også scane knappen i navbaren
- forbere animajsonen av den rød hjem knappen som forsvinner når mang går hjem fra feks finans side. akkurat nå er den litt treg og ikke veldig smooth
- wiggle redigerin i fold, + og check knappen øverts kolideerer i header til mobilen. kansje plaser  de i navbaren når det redigeres.
- gi fortsatt scan iconet på fold et scan ikon. og søkefeltet på fold lar meg ikke åpne det. (skjermbilde: uploads/Screenshot 2026-10-23 at 09.31.56.png)
- gi samme design fra mer menyen til mer menyen i finans.
- lag familie menyen bedre for fold, gi den et fold oppset med navbar på venstre side og et mer dynamisk design som passer for større skjerm,
- jeg så ikke dette nye designet for ipad når jeg lastet ned ios appne der. (skjermbilde: uploads/Screenshot 2026-10-23 at 09.38.59.png)
- wiggle mode på android åpner men lar meg ikke dra kort den eller opp.
- for familie på fold la den ta større bruk av skjeremn nå er det mye tom rom på hver side.
- gjørempål på fold, legg til navbar, fra hjem siden. på venstre side. legg også til glimt knapp på høyere side av søkebar (skjermbilde: uploads/Screenshot 2026-10-23 at 09.41.36.png)
- gi gjøremål fullskjerm ikke vis bakgrunn.
- ordene ikonet her fra hjem på web (skjermbilder: uploads/pasted-1792741454596-0.png, uploads/pasted-1792741468914-0.png)
- pass på at fold får det nye gjøremål designet.
- la meg srku av sone posisjons varsel, disse varslsene skal også ha ikon for vhilke sone det gjedler. dette ikoent skal være der istedet for finanshub logogen. vis eksmepel (skjermbilde: uploads/pasted-1792742428718-0.png)
- bare vis meg simulert varsling på ios homescreen
- riktig legg inn det i appen, la meg også slå av og på disse poisjonsvarslignne, indviduvuelt for personer.
- ordene opp i denne meyen, både med farger og top tekst. den viser også mange entitei og enheter som ikke har noe med mobil app å gjøre. lag også bedre valg meny her. (skjermbilde: uploads/Screenshot 2026-10-23 at 10.05.54.png)
- gjør at jeg slipper å legge den docker ct for å få logg over containere. legg til det i neste server oppdatering. (skjermbilde: uploads/Screenshot 2026-10-23 at 10.08.54.png)
