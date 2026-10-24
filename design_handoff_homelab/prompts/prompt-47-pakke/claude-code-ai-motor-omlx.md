# Glimt og all AI: støtte for oMLX i tillegg til Ollama

Ønske 2026-10-24: «legg til sttøtte for at glimt og alt med ai kjører på https://omlx.ai/ istedet for ollama»

## Om oMLX
- macOS-app med inferensserver bygget på MLX for Apple Silicon (M1+, macOS 15+, minst 16 GB). Kjører på Mac mini M4 16 GB.
- API: OpenAI-kompatibelt `/v1/chat/completions` (+ `/v1/models`, `/v1/embeddings`), og Anthropic-kompatibelt `/v1/messages`. Standardport `localhost:8000`.
- Støtter verktøykall (JSON, Qwen, Gemma m.fl.), visjonsmodeller (VLM), embedding- og reranker-modeller lastet samtidig, continuous batching og KV-cache lagret på SSD. Den lagrede cachen gir mye raskere svar når systemprompt og verktøyliste er like fra gang til gang.
- Modeller: MLX-format fra Hugging Face (leser `~/.cache/huggingface/hub` og LM Studio-mappen). **Ollama-modeller (GGUF) kan ikke gjenbrukes.** MLX-varianter må lastes ned (f.eks. `mlx-community/Qwen3-8B-4bit`).
- Kilde: https://omlx.ai · https://github.com/jundot/omlx

## Arkitektur: én AI-leverandør bak et grensesnitt
Ingen moduler skal kalle Ollama direkte. Lag `ai/provider.ts` (server):
```ts
interface AiProvider {
  id: "ollama" | "omlx";
  chat(req: { model; messages; tools?; responseFormat?: JsonSchema; stream?; signal? }): AsyncIterable<Delta> | Promise<ChatResult>;
  embed(texts: string[], model?): Promise<number[][]>;
  vision(req: { model; image: Buffer; prompt; responseFormat? }): Promise<ChatResult>;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<{ ok: boolean; latencyMs: number; version?: string }>;
}
```
- `OllamaProvider`: dagens kode flyttes hit uendret (`/api/chat`, `format`, `/api/embeddings`).
- `OmlxProvider`: OpenAI-format mot `${OMLX_URL}/v1`:
  - Verktøy: `tools: [{type:"function", function:{name, description, parameters}}]`, les `tool_calls`.
  - Strukturert svar: `response_format: {type:"json_schema", json_schema:{name, schema, strict:true}}`. Støtter modellen det ikke, legg skjemaet i systemprompten og valider med samme validator som i dag (ett nytt forsøk, så feilmelding).
  - Reasoning-modeller: fjern `<think>`-innhold før parsing (oMLX håndterer dette for de fleste, men dobbeltsjekk).
  - Bilder (kvitteringer, Glimt-skjermbilder): `content: [{type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}]` mot en VLM.
  - Streaming: SSE `data:`-linjer → samme `Delta`-type som Ollama-strømmen.
  - API-nøkkel (hvis satt i oMLX): `Authorization: Bearer ${OMLX_API_KEY}`.
- Alle brukere skal bytte til grensesnittet: Glimt (søk, sammendrag, tolking), Chat, Nyhetsleser-sammendrag, kvittering-OCR-tolking (`/api/finans/kvitteringer/ocr`), Huskeliste, Media-tolking (`claude-code-glimt-media-tittel-og-utvalg.md`), Claude-minne-import, embeddings/søk. Søk etter `11434`, `ollama` og `/api/chat` i hele kodebasen og fjern alle direkte kall.

## Innstillinger → Glimt → AI-motor
- Valg: **Ollama** · **oMLX**. Standard: Ollama (uendret oppførsel til brukeren bytter).
- Felt per motor: adresse (Ollama `http://localhost:11434`, oMLX `http://localhost:8000`), API-nøkkel (bare oMLX, valgfri).
- Modellvalg per oppgave, hentet fra `listModels()`: **Samtale/verktøy**, **Rask tolking** (intent/ruting), **Bilde** (VLM), **Embedding**. Modeller som ikke passer til oppgaven, vises ikke.
- Statuslinje: «oMLX svarer · 42 ms · 3 modeller lastet» / rød «oMLX svarer ikke». Knapp «Test» kjører et kort verktøykall og et JSON-skjema-kall og viser om begge lykkes.
- **Reserve:** bryter «Bruk Ollama hvis oMLX ikke svarer» (på som standard). Svar fra reserven merkes diskret «via Ollama» i Glimt.
- Lagres på serveren (gjelder alle klienter), env-overstyring: `AI_PROVIDER`, `OMLX_URL`, `OMLX_API_KEY`, `OMLX_MODEL_CHAT`, `OMLX_MODEL_FAST`, `OMLX_MODEL_VISION`, `OMLX_MODEL_EMBED`.

## Embeddings
Vektorer fra ulike modeller kan ikke blandes. Lagre `embedModel` på hver indeks. Ved bytte av embedding-modell: vis «Søkeindeksen må bygges på nytt (ca. N min)» og bygg den på nytt i bakgrunnen. Behold den gamle indeksen til den nye er ferdig.

## Ytelse på 16 GB
- Anbefalte startmodeller (MLX 4-bit): samtale/verktøy ca. 7–8B, rask tolking ca. 1,5–3B, VLM ca. 3–7B, og en liten embedding-modell. Til sammen skal de holde seg under ca. 10 GB, så macOS og serveren har plass.
- Hold systemprompt og verktøyliste stabile og først i meldingen, så oMLX sin prefiks-cache treffer. Sett dynamisk innhold (dato, brukerens spørsmål) sist.
- Skru ned parallellitet i Glimt hvis minnepresset blir høyt (les `/v1/models` / dashboard-metrikk).

## Test
- Samme testsett for begge motorer: Glimt-ruting (vær/kalender/media, se `claude-code-glimt-vaer-gir-kalendersvar.md`), JSON-skjema (kvittering), verktøykall, streaming i Chat, bilde (kvittering), embeddings-søk.
- Stopp oMLX midt i et Glimt-svar → reserven tar over, eller du får en tydelig feilmelding hvis reserven er av.
- Bytt motor i Innstillinger uten omstart av serveren.
- Mål svartid (første token) for et typisk Glimt-spørsmål på begge, og logg den i Innstillinger → Glimt → Diagnostikk.
