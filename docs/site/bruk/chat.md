# Chat

Chat er en egen side for samtaler med språkmodeller: **Ollama** lokalt på hjemmeserveren, eller **Gemini** og **Groq** i sky. Historikken lagres på serveren din, per bruker, så samtalene følger deg mellom web og appene.

<span class="tv-tag">Ny i 4.20</span>

## Hvor finner jeg den?

| Hvor | Slik |
|---|---|
| **Web** | Fanen **Chat** i toppmenyen, eller **✦ AI** i Google-søket på Dashboard. Teksten i søkefeltet blir starten på en ny samtale. |
| **Appene** | Raden **Chat** under Mer, **✦ AI** i Google-søkefeltet på Hjem, eller som egen fane. Hold inne på fanelinjen for å legge den til. |

## Kom i gang

1. Sett opp minst én motor under **Innstillinger → Integrasjoner**: Ollama, Gemini eller Groq. Se [Integrasjoner](integrasjoner.md#ollama-lokalt-ingenting-forlater-huset).
2. Åpne Chat og velg modell i toppen. Lokale modeller er merket **LOKAL** (grønn), og sky-modeller **SKY** (rød).
3. Skriv, og svaret strømmes inn mens det skrives. **Stopp** avbryter.

Modellen velges per samtale, og siste valg blir standard for nye samtaler. Under **Innstillinger → AI → Chat** kan du sette en fast standardmodell.

## Det du kan gjøre

<div class="grid cards" markdown>

-   :material-history:{ .lg } **Historikk og mapper**

    ---

    Søk, **Festet**, mapper, og grupper for I dag, I går, Siste 7 dager og Eldre. Med **⋯** på en samtale kan du gi nytt navn, feste, **Eksporter Markdown**, **Del lenke**, flytte til mappe eller slette.

-   :material-tune-variant:{ .lg } **Samtaleinnstillinger**

    ---

    Persona (Standard, Økonomi, Homelab, Norsklærer), egen systemprompt, temperatur, top P og kontekstlengde. Tema **Papir** eller **Nøytral**.

-   :material-message-reply-text-outline:{ .lg } **Meldinger**

    ---

    Rediger en melding og send på nytt fra det punktet, kopier, **Nytt svar** på det siste, og **Les høyt**. Hvert svar viser tokens per sekund og tid.

-   :material-paperclip:{ .lg } **Vedlegg og verktøy**

    ---

    Legg ved bilde (krever en bildemodell), fil eller dokument fra kunnskapsbasen. Slå på **Nettsøk** og **Mine data** med brikkene i skrivefeltet.

</div>

## Mine data og personvern

**Mine data** gir modellen et sammendrag fra Finans, Kalender og Huskeliste. Den får ikke rå tabeller, bare et sammendrag som serveren lager. Brikker under svaret viser hva som ble brukt, for eksempel «Brukte Finans».

| Bryter i Innstillinger → AI → Chat | Hva den gjør |
|---|---|
| **Chat kan lese mine data** | Slår på «Mine data» i Chat. Av betyr at modellen aldri får dataene dine. |
| **Spør før sky-modeller får data** | Gemini og Groq må godkjennes per samtale før data eller vedlegg sendes. |

Velger du en sky-modell med Mine data eller vedlegg, får du spørsmålet «Sende til *modell*?» med en liste over hva som forlater serveren. Du kan velge **Send**, **Send uten mine data**, **Bruk lokal modell**, og krysse av for **Ikke spør igjen i denne samtalen**.

!!! tip "Helt lokalt"

    Med en Ollama-modell forlater ingenting hjemmeserveren. Det står også under skrivefeltet.

## Modeller

Under modellvelgeren ser du de installerte modellene. En administrator kan hente nye fra ollama.com med fremdriftslinje, skrive inn et modellnavn, eller slette en modell. Vanlige brukere kan bruke modellene, men ikke endre dem. Forslag til modeller står i [AI og tidsgrenser](ai-og-tidsgrenser.md#ollama-modeller).

## Open WebUI (valgfritt)

En administrator kan koble Chat til **Open WebUI** under **Innstillinger → AI → Open WebUI · serveroppsett** med adresse og API-nøkkel (lages i Open WebUI under Innstillinger → Konto → API-nøkler).

| | Uten Open WebUI | Med Open WebUI |
|---|---|---|
| Motorer | Ollama, Gemini og Groq direkte | Det Open WebUI har satt opp |
| Historikk | Lagres hos Homelab OS | Lagres fortsatt hos Homelab OS, per bruker |
| Kunnskapsbase | Filer du laster opp i Chat | Også dokumentene i Open WebUI |
| Nettsøk | – | Via Open WebUI (for eksempel SearXNG) |
| Tale til tekst | Nettleserens talegjenkjenning der den finnes | Whisper i Open WebUI |

Klientene snakker alltid bare med din server. Svarer ikke Open WebUI, går Chat direkte til motorene.

## API

Chat ligger under `/api/chat/*` og godtar app-token. Svaret strømmes med SSE:

```bash
curl -N https://os.example.no/api/chat/send \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"model":"llama3.2:3b","messages":[{"role":"user","content":"Hei! Hva kan du hjelpe meg med?"}]}'
# event: meta  data: {"chatId":"…"}
# event: delta data: {"text":"Hei"} …
# event: done  data: {"tokensPerSec":38.2,"ms":2140,"used":[]}
```

Er det en sky-modell og samtykke mangler, svarer serveren `409` med `needsConfirm: true` og listen over hva som ville blitt sendt. Se [API](../utvikling/api.md).
