# Glimt: intelligent, kontekstbevisst agent i hele appen

**Hele oppdraget står ordrett i `prompts/prompt-45.md` (seksjon «Oppdrag»). Les det først og følg det.** Dette dokumentet er arkitekturen og kravene oppsummert.

## Gjør først (ikke hopp over)
Kartlegg kjeden tekst → Ollama → intensjon → verktøyvalg → feltuttrekk → ruting → utførelse → lagring → svar. Skriv funn i `docs/glimt-dataflyt.md`, med konkret rotårsak til at tidligere rettelser ikke virket (separate prompts/parsere per modul, regex som overskriver modellen, hele setningen sendt som tittel osv.).

## Felles motor (én for hele appen)
`glimt/agent`: alle innganger (Hjem, Kalender, Gjøremål, Finans, Ruter, chat) bruker samme pipeline.
1. **Intensjon** (modell, strukturert JSON): `ask | search | create | update | delete | summarize | multi` + `module`.
2. **Kontekst**: dagens dato, tidssone (Europe/Oslo), språk, aktiv modul, sist viste/valgte element, kun nødvendig data.
3. **Plan**: verktøykall med typede argumenter (f.eks. `calendar.create{title,date,start,end?}`).
4. **Validering** (deterministisk): datoer/klokkeslett/beløp normaliseres med egen norsk parser (12.10, 12/10, «fredag», «neste uke», «klokka sju», 16h, kl 16, månedsskifte/årsskifte). Modellen tolker språket; koden validerer.
5. **Utfør** via eksisterende API-er (idempotensnøkkel per forespørsel → ingen duplikater).
6. **Kontroller** resultat fra datakilden før bekreftelse.
7. **Svar** kort og sant. Mangler noe: ett konkret oppfølgingsspørsmål.

## Verktøy
- Ett verktøyregister (navn, beskrivelse, JSON-skjema, modul, destruktiv ja/nei). Hjem får tilgang til alle.
- Bruk Ollama tool calling (`/api/chat` med `tools`) hvis valgt modell faktisk støtter det (test `qwen3:8b`; `gemma3` har svakere støtte). Ellers: `format: <JSON-skjema>` + validering + kontrollert ruting.
- Maks 2 modellkall for vanlige forespørsler. Liten kontekst. Fallback ved ugyldig JSON: ett nytt forsøk med feilmelding, så spør brukeren.

## Finans-søk
Filtre: forhandler (fuzzy/alias), beløp (eksakt ±1 kr / intervall), periode, kategori, transaksjonstekst, kvitteringsvarelinjer (OCR-indeks) + semantisk søk (embeddings) for omskrivinger («lader» ≈ «USB-C strømadapter»). Koble kvittering ↔ transaksjon på beløp+dato+forhandler. Flere treff → liste å velge fra. Ingen treff / ingen OCR → si det ærlig.

## Sikkerhet
Ingen gjetting ved uklart mål, bekreftelse før sletting/viktige endringer, aldri dikt data, skill forslag fra utførelse, logg verktøyvalg uten personopplysninger.

## Tester (automatiserte)
Alle eksemplene i tabellen i prompt-45 + månedsskifte, årsskifte, ugyldige datoer, tomme resultater, flere treff, verktøyfeil, gjentatte forespørsler – fra Hjem og fra modul. Test lagret/hentet data, ikke bare svartekst. Bruk mock av Ollama for determinisme + et lite sett mot ekte modell.

## Personlighet
Glimt er en god nordmann og monarkist, og en liten rakker og moroknarkist.
- Varm, kvikk, litt frekk på en snill måte. Korte svar, et glimt i øyet.
- Kan slenge inn små ting: «Lagt inn. Kongen ville vært stolt av den planleggingen.», «Melk i morgen etter skolen – notert. Ikke glem brunosten.», på 17. mai/kongens bursdag (21. feb) litt ekstra feiring.
- Humor aldri på bekostning av presisjon: bekreftelsen (hva som faktisk skjedde) kommer først, spøken etterpå, maks én kort spøk, og ingen spøk ved feil, sletting, økonomiproblemer eller alvorlige tema.
- Innstilling i AI-kontroll: **Personlighet** Av · Litt · Full rakker (standard Litt).

## Lever
Hva er implementert, hva er testet (testresultater), hva gjenstår.
