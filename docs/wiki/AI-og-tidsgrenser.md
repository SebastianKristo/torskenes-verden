# AI og tidsgrenser

AI driver assistenten Glimt, leser kvitteringer, svarer på ✦ AI-søk, lager sammendrag, velger kategorier, foreslår middager og gjør tale om til tekst. Alt AI-oppsett er **serveroppsett**, så bare admin endrer det, men alle brukerne kan bruke motorene.

Innstillingene ligger under **Innstillinger → AI**, med fanene Oversikt, Modeller, Oppgaver, Kvitteringer, Tjenester, Jobber og Forbruk. **Tjenester** samler adresse, nøkkel og test for hver tjeneste i én rad. FinansHub har en kortere utgave under Innstillinger (AI-valg, Tilkoblinger, Jobber og Forbruk).

> [!IMPORTANT]
> **Lokalt først.** Glimt og kvitteringslesingen bruker bare modeller i huset. Gemini og Groq er valgfrie sky-motorer til annet, og Ollama skal aldri eksponeres mot internett. Nøklene blir på serveren.

## Motorene

| Motor | Hva den gjør | Hvor den kjører | Oppsett |
|---|---|---|---|
| **Ollama** | Standard for alt: Glimt, tolkning av kvitteringer, søk, kategorier og bilder | En maskin i huset | [Integrasjoner → Ollama](Integrasjoner#ollama-lokalt-ingenting-forlater-huset) |
| **oMLX** (valgfritt) | MLX-modeller som alternativ til Ollama, valgt per oppgave og med Ollama som reserve | En Mac i huset | [docs/omlx-58.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/omlx-58.md) |
| **Open WebUI** (valgfritt) | Kan være mellomledd for AI-kallene. Ollama direkte er alternativet. | I huset | AI → Tjenester |
| **Mac-OCR (Apple Vision)** | Leser teksten på kvitteringer | En Mac i huset | [tools/vision-ocr](https://github.com/SebastianKristo/torskenes-verden/blob/main/tools/vision-ocr/README.md) |
| **Lokal OCR (Tesseract)** | Leser teksten på kvitteringer når Mac-OCR ikke er satt opp eller ikke svarer | På serveren | Følger med Docker-imaget |
| **NB-Whisper, Voz og Phonon** | Tale til tekst | I huset | [Tale til tekst](#tale-til-tekst-og-opplesning) |
| **VoxCPM** (valgfritt) | Egne stemmer til opplesning | En Mac i huset | [docs/voxcpm-57.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/voxcpm-57.md) |
| **Gemini** (valgfritt, sky) | Tekstoppgaver du velger selv, og logo-oppslag der bare butikknavnet sendes. **Aldri kvitteringer.** | Google | [Integrasjoner → Gemini](Integrasjoner#gemini-valgfritt) |
| **Groq** (valgfritt, sky) | Raske tekstsvar. **Aldri kvitteringer.** | Groq | [Integrasjoner → Groq](Integrasjoner#groq-raskt-gratis-nivå) |
| **Roboflow** (valgfritt, sky) | Strekkoder | Roboflow | [Integrasjoner → Roboflow](Integrasjoner#roboflow-valgfritt) |

## Oppgaver: hvilken modell gjør hva

Under **AI → Oppgaver** velger du modell per oppgave, med reserve. Etter en oppdatering setter serveren selv de modellene som har gjort det best i testene:

| Oppgave | Standard |
|---|---|
| All tekst: Glimt, Chat, søk, kategorier og tolkning av kvitteringer | `qwen3:8b` |
| Bilder | `qwen2.5vl:7b` |

Egne valg røres ikke. Finnes ikke modellen du har valgt på Ollama-serveren, brukes reserven, og du får en advarsel.

**«Finansdata forlater aldri huset»** ligger under AI → Oppgaver (Valg). Når den er på, sendes ingenting med finansdata ut av huset. Det gjelder Gemini, Groq, Roboflow, Brønnøysund, logo- og favicon-oppslag, finanssøk og bankimport.

## Kvitteringer leses bare lokalt

Gemini og andre sky-tjenester er tatt helt ut av kvitteringslesingen, også som reserve. Serveren prøver stegene i rekkefølge, og hvert steg kan slås av under **AI → Kvitteringer**:

1. **Tolkning fra telefonen**, hvis appen har lest kvitteringen selv og resultatet består kontrollen.
2. **Teksten fra telefonen** (OCR i appen), tolket av den lokale tekstmodellen.
3. **Mac-OCR** med Apple Vision, tolket av den lokale tekstmodellen.
4. **Tesseract** på serveren, når Mac-OCR er av eller ikke svarer.
5. **Bildemodellen**, bare når ingen OCR er tilgjengelig. Resultatet merkes med middels sikkerhet.

Lesing og tolkning på telefonen er av som standard. Alt kontrolleres på serveren: sum, total, dato, org.nr. og mva. Butikknavnet hentes fra org.nr. i en lokal kopi av Enhetsregisteret. Du får et skjema du kan rette før lagring, med usikre felt markert, og «Rådata» viser OCR-radene.

Admin kan også prøve LFM-modellene fra Liquid AI under AI → Kvitteringer → «LFM-motorer (test)». De er av som standard og kjører bare lokalt.

## Glimt

Glimt er assistenten i søkefeltet på Hjem, i Chat og i Kalender. Alle inngangene bruker samme motor:

1. **Forstå:** den lokale modellen får meldingen, datoen og det du sist så på, og velger verktøy med strukturerte argumenter. Tekstmønstre brukes bare som hint og som hurtigvei for helt entydige kommandoer.
2. **Kontroller:** teksten din er fasit for dato, tid og beløp. Mangler noe, stiller Glimt ett konkret spørsmål i stedet for å gjette.
3. **Utfør og les tilbake:** hver endring leses tilbake fra datakilden før Glimt sier at den er gjort. Sletting krever bekreftelse.
4. **Svar:** svaret bygges av det som faktisk skjedde, og strømmer mens det skrives, med statuslinje og Stopp.

Glimt bruker bare lokale modeller. Den går aldri til skyen.

- **Samtaler:** oppfølgere som «og i Bergen?» og «flytt den til 11» virker. Er Glimt usikker, får du knapper å velge mellom.
- **Glimt husker:** et minne du ser og sletter fra. Nattlige forslag lagres først når du sier ja, og motstridende fakta spør Glimt om.
- **Glimt lærer:** oppskrifter fra svar som var riktige, og rettelser som «nei, jeg mente …». Tommel opp og ned hjelper.
- **Faste oppgaver:** «Send meg strømprisene hver morgen kl. 7». Glimt bekrefter alltid hvordan oppgaven er forstått før den lagres.
- **Now Brief:** dagen i kort. Under Innstillinger → Glimt → «Innhold i briefen» velger du kortene og rekkefølgen.
- **Nettsøk:** Open WebUI-søk, SearXNG, Brave eller DuckDuckGo, med kilde i svaret.
- **Kvalitet:** en nattlig test og en ukerapport under Innstillinger → Glimt → Kvalitet.

Alt om Glimt ligger under **Innstillinger → Glimt**.

## Tale til tekst og opplesning

Mikrofonen i Glimt-søket og i Chat finnes på web, iPhone, iPad og Android. Trykk eller hold for å snakke. Opptaket sendes til serveren, som gjør det om til tekst i huset. Lyden lagres ikke.

| Språk | Motorer i rekkefølge |
|---|---|
| Norsk (bokmål og nynorsk) | NB-Whisper fra Nasjonalbiblioteket |
| Engelsk | Voz på serveren, så Phonon, så NB-Whisper |
| Ikke valgt | Språket oppdages av seg selv |

- Telefonens egen talegjenkjenning er reserve.
- På web virker mikrofonen bare over https eller localhost.
- NB-Whisper installeres på en Mac med `tools/nb-whisper/install.sh`, se [docs/nb-whisper-54.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/nb-whisper-54.md). Adressen og nøkkelen legges inn under AI → Tjenester.
- **Opplesning:** «Les opp» i Nyheter og «Les høyt» i Chat kan bruke egne stemmer fra VoxCPM. Kloning av din egen stemme krever samtykke, er privat og kan slettes.

## Lokale tjenester på en Mac

Disse er valgfrie og installeres med skript fra `tools/` i repoet. Hver tjeneste krever en hemmelig nøkkel, adressen må være i huset, og ingen av dem skal eksponeres mot internett.

| Tjeneste | Skript | Brukes til |
|---|---|---|
| Mac-OCR | `tools/vision-ocr/install.sh` | Tekst fra kvitteringer med Apple Vision |
| NB-Whisper | `tools/nb-whisper/install.sh` | Tale til tekst på norsk |
| VoxCPM | `tools/voxcpm/install.sh` | Egne stemmer |
| oMLX | `tools/omlx/install.sh` | MLX-modeller som alternativ til Ollama |

Docker-imaget har i tillegg noen små modeller som kjører på serveren. De sorterer bilder (kvittering, dokument eller foto), retter rotasjon, fjerner personopplysninger før tekst sendes til en sky-modell, og lager emner til Nyheter. Admin forhåndslaster dem under Innstillinger → System → Lokale modeller. Lisenser står under «Om / Lisenser» og i [docs/lisenser-tredjepart.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/lisenser-tredjepart.md).

## Tidsgrenser

FinansHub har en egen grense per motor for sine AI-oppgaver:

| Motor | Standard | Mulige verdier |
|---|---|---|
| Gemini | 20 s | 5, 10, 15, 20, 30, 45, 60, 90, 120 s |
| Groq | 15 s | som over |
| Roboflow | 15 s | som over |
| Ollama | 45 s (eller `OLLAMA_TIMEOUT` fra `.env`) | som over |

- **Nye forsøk:** 0–3. Det ventes 1 s, 2 s og 4 s mellom forsøkene.
- **Ved tidsavbrudd:**
  - **Prøv neste motor:** gjelder søk og andre tekstoppgaver. Kvitteringer går aldri til en sky-motor.
  - **Bruk lokal OCR:** les kvitteringen uten AI med en gang.
  - **Legg i kø og prøv senere:** kvitteringen prøves igjen senere.

Køen og søket viser hva som skjer, for eksempel «✦ Ollama tenker … 34 s av 60 s».

**Én kø for alle AI-kall:** forespørslene går én om gangen, gruppert per modell, så jobber ikke blir avbrutt når Ollama bytter modell. Lastetid, genereringstid og årsak står under AI → Jobber.

> [!TIP]
> **Ollama på en Mac mini:** første kall etter oppstart må laste modellen inn i minnet, og det kan ta 10–30 s. Sett Ollama til 60 s eller mer. Etter det holder Ollama modellen lastet i 10 minutter, så neste søk går raskt.

## Jobber: lange AI-søk

Fra 4.17 stopper ikke AI-søket lenger etter 30 s. Søket venter så lenge tidsgrensen for motoren, i nettleseren, i appene og på serveren.

1. Tar svaret mer enn ca. 4 s, starter serveren en **jobb** og svarer med `202` og en `jobId`.
2. Klienten viser «✦ Ollama tenker … 34 s av 60 s», fremdriftslinje og **Avbryt**.
3. Svarer ikke motoren i tide, står det hvilken motor og hvilken grense, for eksempel «Ollama svarte ikke innen 60 s», og søket går videre til neste motor.

Detaljer:
- Hver bruker kan ha opptil 5 AI-søk som kjører samtidig.
- Jobbene ligger i minnet og ryddes 10 minutter etter at de er ferdige. Andre brukere får 404 på jobbene dine.
- Følg jobben med `GET /finans/api/jobs/:id` (polling) eller `GET /finans/api/jobs/:id/events` (SSE). Avbryt med `DELETE /finans/api/jobs/:id`. Se [API](API#ai-søk-som-jobb).

## Ollama-strømming

- Ollama strømmer svaret mens det skrives (`stream: true`).
- Tidsgrensen gjelder **tid uten nye ord**, ikke total tid. Et langt svar som kommer jevnt, blir altså ikke avbrutt. Første ord teller med, og det dekker også innlastingen av modellen.
- Et svar som aldri slutter, stoppes etter 10 minutter.
- Serveren lar selve HTTP-forespørselen vare opptil 10 minutter. Har du en egen reverse proxy, må tidsgrensen der være like lang, se [Installasjon](Installasjon#egen-reverse-proxy-caddy-eller-nginx).

## Flere Gemini-nøkler

Gemini er valgfritt og brukes ikke til kvitteringer. Bruker du det til annet, kan du legge inn reservenøkler i rekkefølge. Når en nøkkel svarer 429 (kvote brukt opp) eller er ugyldig, brukes neste med en gang. En brukt nøkkel hviler til kvoten nullstilles: ett minutt for minuttkvote, neste døgnskifte hos Google for dagskvote, og første dag i neste måned for månedskvote. Dette gjelder all bruk av Gemini.

## AI-loggen

**AI-loggen** (AI → Jobber, og AI-logg i FinansHub) viser de siste AI-kallene med oppgave, motor, modell, tid, grense, status og feilmelding. Loggen er per bruker. Bruk den når noe er tregt, for å se hvilken motor som feiler.

## Ollama-modeller

Under **AI → Modeller** henter serveren listen fra Ollama (`/api/tags`):

- Velg modell per oppgave under AI → Oppgaver.
- **Installer** laster ned en anbefalt modell, med fremdriftslinje. Modeller som er for store for 16 GB, er merket.
- Du kan installere hvilken som helst modell fra ollama.com/library ved navn, og slette installerte modeller.

Anbefalingene for en Mac mini M4 med 16 GB står i [Integrasjoner → Ollama](Integrasjoner#ollama-lokalt-ingenting-forlater-huset).
