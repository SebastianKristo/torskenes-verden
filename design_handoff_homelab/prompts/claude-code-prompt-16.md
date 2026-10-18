# Claude Code – oppgaver fra prompt 16

Implementer endringene under i appen. Designfilene i dette prosjektet er fasit for utseende og oppførsel. Les dem før du koder:
- `Mobil Papir App.dc.html` – mobilappen (Papir-design)
- `Homelab v2.dc.html` – webversjonen
- `Aksjer Mobil.dc.html`, `Boliger.dc.html`, `Familie.dc.html`, `Vaer.dc.html` – egne moduler som brukes i mobilappen
- `prompts/prompt-16.md` – brukerens ordrette ønsker

## Generelt (mobil)
1. Alle menyer bruker Papir-designet, også Innstillinger og undersidene.
2. Nye sider åpner alltid helt øverst. Rull til toppen ved hvert sidebytte, også for undermenyer i Innstillinger, kvittering, Avganger, Vær og Nyhetsleser.
3. Søkefeltet har Google-ikon.
4. Fanelinjen kan redigeres. Hold inne på fanelinjen, eller gå via Innstillinger, for å fjerne faner, endre navn og bytte ikon. Det skal bare vises én fanelinje.
5. Trykk på profilbildet åpner Innstillinger → Profil, med mindre menyen er en hamburgermeny.
6. Innstillinger: ikonene har litt forskjellige farger. Velg fargetema fra ferdige kombinasjoner, med dagens farger som standard. Bakgrunnsvelgeren («Oslo ▾») flyttes hit.
7. Bakgrunnsbildene Planet, Oslo og Vær skal lastes på mobil som på web.

## AI
8. Rett feilen som gjør at AI ikke virker.
9. Legg til API-nøkler for flere AI-leverandører: Groq (console.groq.com/keys) og Roboflow.

## Finans
10. Vis profilbilde og @brukernavn. Ikke vis fullt navn i toppfeltet eller brukerchipen.
11. Aksjer: full mobilversjon av aksjedelen fra web. Under Finans → Mer.
    - Fjern teksten «Portefølje» og tannhjulet. Innstillingene for aksjer ligger under Innstillinger.
    - Verdikortet ligger delvis oppe i toppbildet, som på Sporing. Det skal ikke kuttes.
    - Nøkkeltallene vises i hel lengde, uten «…».
12. Boliger: eget valg i Finans, for en bruker som stort sett bare bruker Finans og Domener. Gi Boliger en avansert, brukervenlig og lekker meny, både på web og spesielt på mobil, med opplasting av kvitteringer og oversikt.

## Abonnementer (mobil)
13. Fanelinjen viser Hjem, Innsikt og Historikk i stedet for faner øverst. Pluss-knappen er en rød sirkel i fanelinjen. Rett fargen på «Gå igjennom».

## Sporing
14. Standardikoner for DHL, Posten, PostNord og Helthjem.
15. På Fold-skjermer er pakkekortet like høyt som Avganger-kortet.

## Vær
16. Legg til, fjern og søk etter andre steder. Hent værdata fra MET/yr.no (api.met.no, med User-Agent).

## Avganger (Ruter)
17. Trykk på Avganger åpner en side i nyhetsleser-stil med flere avganger og detaljer, og et Ruter-bilde øverst.
18. Stoppknappene skal ikke kuttes.
19. Legg til andre stopp ved å søke i Ruter/Entur. Hold inne for å redigere, endre rekkefølge og fjerne stopp. Stopp brukeren legger til, viser ekte sanntid fra Entur.

## Familie og kart (ny modul)
20. Sporing av alle som har appen, på et ekte kart (OpenStreetMap):
    - Sanntidsposisjon, spor og fart.
    - Sensorer fra mobilen: batteri, lading, aktivitet, fart og GPS-nøyaktighet.
    - Hendelser og varsler når noen kommer til eller forlater en sone.
21. Soner: lag en sone ved å trykke på kartet, og sett navn, radius og farge. Varsel per person.
22. Personvern: hver person kan pause eller slå av deling, og velge nøyaktig eller omtrentlig posisjon. De andre ser at delingen er pauset.
23. Helse: hent data fra Apple Health (HealthKit) og Health Connect (Android) i den native appen på telefonen. Send et sammendrag til serveren hvert 15. minutt, bare det brukeren har valgt å dele: skritt, hvilepuls, puls, søvn, aktive kalorier og siste 7 dager.
    - Dette krever native tilgang og samtykke på hver telefon. Webversjonen kan ikke lese helsedata direkte.

## Ferdig når
- Alle punktene virker på mobil (iPhone, Android og Fold) og web, i lyst og mørkt tema.
- Ingen feil i konsollen. Ingen tekst kuttes.
