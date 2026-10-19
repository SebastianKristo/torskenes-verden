# AI og tidsgrenser

AI brukes til å lese kvitteringer, svare på ✦ AI-søk, lage sammendrag, velge kategorier, foreslå middager og lese strekkoder. Alt AI-oppsett er **serveroppsett**, så bare admin endrer det, men alle brukerne kan bruke motorene.

Innstillingene ligger i **FinansHub → Innstillinger → AI og tolkning**. Nøklene kan også legges inn under **Innstillinger → Integrasjoner → AI**.

## Motorene

| Motor | Hva den er god til | Koster | Oppsett |
|---|---|---|---|
| **Gemini** | Kvitteringer (bilder), søk, embeddings | Gratisnivå med kvote | [Integrasjoner → Gemini](integrasjoner.md#gemini-enklest) |
| **Groq** | Raske tekstsvar (AI-søk, kategorier), og bilder | Gratisnivå med kvote | [Integrasjoner → Groq](integrasjoner.md#groq-raskt-gratis-nivå) |
| **Ollama** | Alt lokalt. Ingenting forlater huset. | Gratis, men trenger maskinvare | [Integrasjoner → Ollama](integrasjoner.md#ollama-lokalt-ingenting-forlater-huset) |
| **Roboflow** | Beskjæring av kvitteringen og strekkoder | Gratisnivå | [Integrasjoner → Roboflow](integrasjoner.md#roboflow-valgfritt) |
| **Lokal OCR (Tesseract)** | Reserve når AI feiler. Leser butikk, dato og sum. | Gratis, kjører på serveren | Slås av og på i AI og tolkning |

## «Hvem gjør hva»

Velg motor per oppgave, med reserve:

| Oppgave | Standard |
|---|---|
| Les kvitteringer | Gemini |
| AI-søk | Groq |
| Kategorisering | Groq |
| Strekkoder | Roboflow |

**Eksempel: alt lokalt med Ollama.** Sett alle oppgavene til Ollama, og velg modeller under Ollama-modeller (`qwen2.5vl:7b` for kvitteringer, `qwen3:8b` for tekst og `nomic-embed-text` for embeddings). Sett «Ved tidsavbrudd» til *Bruk lokal OCR*, så går ingenting til skyen.

**Eksempel: raskt og gratis.** Kvitteringer med Gemini og to–tre reservenøkler, og AI-søk og kategorier med Groq. Ollama blir reserve når skyen svarer for sakte.

## Tidsgrenser

Under **AI og tolkning → Tidsgrenser** setter du en egen grense per motor:

| Motor | Standard | Mulige verdier |
|---|---|---|
| Gemini | 20 s | 5, 10, 15, 20, 30, 45, 60, 90, 120 s |
| Groq | 15 s | som over |
| Roboflow | 15 s | som over |
| Ollama | 45 s (eller `OLLAMA_TIMEOUT` fra `.env`) | som over |

- **Nye forsøk:** 0–3. Det ventes 1 s, 2 s og 4 s mellom forsøkene.
- **Ved tidsavbrudd:**
  - **Prøv neste motor:** neste Gemini-nøkkel, så Groq, så Ollama, så lokal OCR.
  - **Bruk lokal OCR:** les kvitteringen uten AI med en gang.
  - **Legg i kø og prøv senere:** kvitteringen prøves igjen senere.

Køen og søket viser hva som skjer, for eksempel «✦ Gemini svarte ikke innen 20 s · prøver Groq …».

!!! tip

    **Ollama på en Mac mini:** første kall etter oppstart må laste modellen inn i minnet, og det kan ta 10–30 s. Sett Ollama til 60 s eller mer. Etter det holder Ollama modellen lastet i 10 minutter, så neste søk går raskt.

## Jobber: lange AI-søk

Fra 4.17 stopper ikke AI-søket lenger etter 30 s. Søket venter så lenge tidsgrensen for motoren, i nettleseren, i appene og på serveren.

1. Tar svaret mer enn ca. 4 s, starter serveren en **jobb** og svarer med `202` og en `jobId`.
2. Klienten viser «✦ Ollama tenker … 34 s av 60 s», fremdriftslinje og **Avbryt**.
3. Svarer ikke motoren i tide, står det hvilken motor og hvilken grense, for eksempel «Ollama svarte ikke innen 60 s», og søket går videre til neste motor.

Detaljer:

- Hver bruker kan ha opptil 5 AI-søk som kjører samtidig.
- Jobbene ligger i minnet og ryddes 10 minutter etter at de er ferdige. Andre brukere får 404 på jobbene dine.
- Følg jobben med `GET /finans/api/jobs/:id` (polling) eller `GET /finans/api/jobs/:id/events` (SSE). Avbryt med `DELETE /finans/api/jobs/:id`. Se [API](../utvikling/api.md#ai-søk-som-jobb).

## Ollama-strømming

- Ollama strømmer svaret mens det skrives (`stream: true`).
- Tidsgrensen gjelder **tid uten nye ord**, ikke total tid. Et langt svar som kommer jevnt, blir altså ikke avbrutt. Første ord teller med, og det dekker også innlastingen av modellen.
- Et svar som aldri slutter, stoppes etter 10 minutter.
- Serveren lar selve HTTP-forespørselen vare opptil 10 minutter. Har du en egen reverse proxy, må tidsgrensen der være like lang, se [Installasjon](../oppsett/installasjon.md#egen-reverse-proxy-caddy-eller-nginx).

## Flere Gemini-nøkler

Legg inn reservenøkler i rekkefølge under AI og tolkning. Når en nøkkel svarer 429 (kvote brukt opp) eller er ugyldig, brukes neste med en gang. En brukt nøkkel hviler til kvoten nullstilles: ett minutt for minuttkvote, neste døgnskifte hos Google for dagskvote, og første dag i neste måned for månedskvote. Dette gjelder all bruk av Gemini.

## AI-loggen

**AI og tolkning → AI-logg** viser de siste AI-kallene med oppgave, motor, modell, tid, grense, status og feilmelding. Loggen er per bruker. Bruk den når noe er tregt, for å se hvilken motor som feiler.

## Ollama-modeller

Under **Ollama-modeller** henter serveren listen fra Ollama (`/api/tags`):

- Velg egen modell for **kvitteringer** (må lese bilder), **tekst** og **embeddings**.
- **Installer** laster ned en anbefalt modell, med fremdriftslinje. Modeller som er for store for 16 GB, er merket.
- Du kan installere hvilken som helst modell fra ollama.com/library ved navn, og slette installerte modeller.

Anbefalingene for en Mac mini M4 med 16 GB står i [Integrasjoner → Ollama](integrasjoner.md#ollama-lokalt-ingenting-forlater-huset).
