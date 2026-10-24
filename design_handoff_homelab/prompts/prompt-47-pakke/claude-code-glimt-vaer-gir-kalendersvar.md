# Kritisk feil: Glimt svarer med kalenderdata på værspørsmål

Jeg har oppdaget enda en konkret feil i Glimt som jeg vil at du skal undersøke og rette i den eksisterende applikasjonen.

Du kjenner allerede prosjektet, arkitekturen, hjemskjermen, AI-integrasjonen og verktøyene som er tilgjengelige.

## 1. Feilen som faktisk oppstår

Jeg skrev følgende i søkefeltet på hjemskjermen:

«hvordan er været i oslo neste time og været i new york imorgen»

I stedet for å hente værdata svarte Glimt med følgende informasjon fra kalenderen:

«TRE1400 Forelesning er tirsdag 27. oktober kl. 14.30 (om 4 dager).»

Dette er åpenbart feil svar på spørsmålet mitt.

Glimt skal forstå at jeg spør om to værprognoser:

- Oslo: været den neste timen.
- New York: været i morgen.

Den skal hente informasjon fra den eksisterende værtjenesten og presentere et relevant svar om begge stedene.

Den skal ikke hente eller presentere kalenderavtaler som svar på dette spørsmålet.

## 2. Ikke anta at dette bare er en dårlig systemprompt

Jeg har allerede bedt deg flere ganger om å forbedre hvordan Glimt forstår naturlige spørsmål og bruker tilgjengelige verktøy. Likevel oppstår denne typen feil fortsatt.

Jeg ønsker derfor at du undersøker den faktiske årsaken i koden.

Følg forespørselen gjennom hele systemet:

1. Teksten som skrives i søkefeltet.
2. Eventuell klassifisering eller intensjonsgjenkjenning.
3. Valg av verktøy og funksjoner.
4. Kallene til Ollama-modellen.
5. Henting og behandling av resultater fra værtjenesten.
6. Eventuell henting av kalenderdata.
7. Sammenstilling av svaret.
8. Komponenten som viser svaret på hjemskjermen.

Finn ut hvordan kalenderinformasjon endte opp som svar på et værspørsmål.

Undersøk spesielt om systemet gjenbruker gamle verktøyresultater, viser et tidligere svar, velger feil funksjon, feiler over til kalenderverktøyet eller blander sammen data fra flere forespørsler.

Ikke konkluder med en årsak før du har funnet støtte for den i implementasjonen eller i tester.

## 3. Skill tydelig mellom intensjoner og verktøy

Glimt må kunne skille mellom blant annet:

- Vær og værprognoser.
- Kalender og avtaler.
- Huskelister og oppgaver.
- Finans og abonnementer.
- Kollektivtransport.
- Generelle spørsmål.

Når jeg spør om været, skal værtjenesten være den primære datakilden.

Når jeg spør om kalenderen, skal kalenderverktøyene brukes.

Når jeg kombinerer flere typer forespørsler, skal Glimt håndtere hver del med riktig verktøy.

Dette må fungere gjennom den eksisterende generelle AI-arkitekturen. Ikke hardkod bare eksemplet med Oslo og New York.

Hvis modellen velger feil verktøy, må du undersøke om verktøybeskrivelsene, systeminstruksjonene, strukturerte argumenter eller rutingen er utilstrekkelige.

Hvis riktig verktøy blir valgt, men kalenderdata likevel vises, må du undersøke resultatbehandlingen og grensesnittet.

## 4. Håndter flere steder og ulike tidspunkter

Forespørselen min inneholder to uavhengige værforespørsler. Glimt må forstå begge.

For eksempel:

«Hvordan er været i Oslo neste time og været i New York i morgen?»

Forventet behandling:

**Deloppgave 1**
- Verktøy: Værtjenesten.
- Sted: Oslo.
- Tid: Den neste timen.
- Resultat: Relevant timeprognose, inkludert temperatur og tilgjengelige værforhold.

**Deloppgave 2**
- Verktøy: Værtjenesten.
- Sted: New York.
- Tid: I morgen, beregnet med riktig dato og tidssone.
- Resultat: Relevant værprognose for morgendagen.

Glimt skal hente begge resultatene og presentere dem samlet på norsk.

Hvis værtjenesten krever separate kall for hvert sted eller tidspunkt, skal Glimt gjøre dette. Ikke begrens forespørselen til én by eller ett tidspunkt fordi modellen bare har identifisert deler av setningen.

## 5. Kontroller at svaret kommer fra riktig datakilde

Innfør tydelig kobling mellom brukerforespørselen, verktøykallene og resultatene.

For hver forespørsel bør systemet kunne identifisere:

- Hvilken intensjon som ble gjenkjent.
- Hvilke verktøy som ble valgt.
- Hvilke argumenter som ble sendt.
- Hvilke resultater verktøyene returnerte.
- Hvilke resultater som faktisk ble brukt i svaret.

Bruk dette til feilsøking og automatiserte tester. Unngå å logge unødvendige personopplysninger.

Et kalenderresultat skal ikke kunne bli presentert som et værresultat bare fordi det var tilgjengelig i konteksten eller ble returnert av et annet verktøy.

Hvis været ikke kan hentes, skal Glimt si at værdataene ikke var tilgjengelige. Den skal ikke fylle tomrommet med irrelevante kalenderavtaler eller finne på værinformasjon.

## 6. Undersøk kontekst, caching og samtidige forespørsler

Kontroller om problemet skyldes at tidligere eller irrelevante data blir brukt i neste svar.

Undersøk blant annet:

- Om verktøyresultater fra forskjellige forespørsler blandes sammen.
- Om caching bruker tilstrekkelig presise nøkler.
- Om flere samtidige forespørsler kan overskrive hverandres resultater.
- Om systemet gjenbruker kalenderkontekst ukritisk.
- Om tomme eller feilede værkall fører til at et annet verktøyresultat brukes som fallback.
- Om hjemskjermen viser en gammel respons etter at en ny forespørsel er sendt.

Rett den faktiske årsaken dersom en av disse mekanismene er problemet. Ikke fjern nyttig kontekst eller caching uten grunn.

## 7. Test den konkrete feilen og lignende tilfeller

Lag automatiserte tester som kontrollerer hele flyten, ikke bare språkmodellens tekst.

Test minst følgende:

1. «Hvordan er været i Oslo neste time og været i New York i morgen?»
2. «Hva er temperaturen i Oslo akkurat nå?»
3. «Hvordan blir været i New York i morgen?»
4. «Hva har jeg i kalenderen neste uke?»
5. «Hvordan blir været i Oslo i morgen, og hvilken avtale har jeg på fredag?»
6. Et værspørsmål umiddelbart etter et kalender spørsmål.
7. Et kalender spørsmål umiddelbart etter et værspørsmål.
8. En feil fra værtjenesten.
9. To samtidige forespørsler med ulike intensjoner.
10. Et værspørsmål når kalenderen inneholder mange avtaler.

Kontroller at:

- Værspørsmål faktisk bruker værtjenesten.
- Kalenderresultater ikke presenteres som værdata.
- Kalenderforespørsler fortsatt fungerer.
- Sammensatte forespørsler bruker riktige verktøy for hver del.
- Feil håndteres uten å finne på svar.
- Resultatene som vises, tilhører den aktuelle forespørselen.

Bruk mockede verktøyresultater der det er hensiktsmessig, slik at testene blir deterministiske.

## 8. Gjennomfør rettelsen

Arbeid direkte i det eksisterende prosjektet.

1. Finn rotårsaken til at værspørsmålet resulterte i et kalendersvar.
2. Implementer en varig rettelse i riktig del av systemet.
3. Legg til regresjonstester.
4. Kjør relevante tester.
5. Kontroller at eksisterende kalender-, vær- og hjemskjermfunksjonalitet fortsatt fungerer.

Behold den eksisterende lokale AI-løsningen via Ollama på Mac mini M4 med 16 GB minne. Ikke bytt modell eller innfør en ekstern AI-tjeneste som en snarvei før du har undersøkt problemet.

Ikke stopp etter å ha endret systemprompten eller foreslått en løsning. Implementer og test rettelsen dersom du har tilgang til prosjektet.

Avslutt med å forklare:
- Den dokumenterte rotårsaken.
- Hvilke filer og komponenter som ble endret.
- Hvordan feil ruting eller feil resultatbruk nå forhindres.
- Hvilke tester som ble kjørt og resultatene.
- Eventuelle begrensninger som gjenstår.

**Hovedmålet er at Glimt skal bruke riktig datakilde for riktig spørsmål, og aldri presentere irrelevante data som om de var svaret på brukerens forespørsel.**
