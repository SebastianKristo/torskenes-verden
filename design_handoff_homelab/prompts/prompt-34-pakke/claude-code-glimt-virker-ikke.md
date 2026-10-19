# FEIL: Glimt står som «Tilkoblet», men AI-søk, Glimt og chat svarer ikke

Kom etter AI-kontroll-endringen (`claude-code-ai-kontroll.md`). **Feilsøk i denne rekkefølgen og fiks alt som stemmer.** Ny selvtest i designet: `AI Kontroll.dc.html` → Oversikt → **Kjør selvtest**.

## 1. «Tilkoblet» lyver
Status regnes nå ut fra at `GET /api/tags` (Ollama) / en nøkkel finnes svarer. Det betyr ikke at generering virker.
**Fiks:** status = resultat av en ekte **mini-generering** (`"Svar bare: ok"`, `num_predict: 3`, timeout 15 s) per oppgave-rute, cachet i 5 min. Vis tre tilstander:
- **Svarer**: grønn, med svartid.
- **Nås, men genererer ikke**: oransje, med feiltekst fra serveren.
- **Ikke tilkoblet**: grå.

## 2. Ruteren peker på modeller som ikke finnes
Standardrutene i AI-kontroll bruker `gemma4:latest`, `qwen2.5vl:7b`, `llama3.2:3b`, `nomic-embed-text`, `llama-3.3-70b-versatile` og `gemini-2.5-flash`. Finnes ikke modellen på serveren, svarer Ollama `404 model not found`, og klienten svelger feilen.
**Fiks:**
- Ved oppstart og ved endring: valider hver rute mot `/api/tags` + aktive sky-modeller. Ugyldig rute → bruk **reserve**, ellers **første installerte tekstmodell**. Logg en advarsel og vis den i Valg («Modellen finnes ikke · bytt»).
- **Migrering:** gamle innstillinger (`ollamaModel`, `geminiModel`, `groqModel`, `provider`, `rRc`, `rSok`, `rKat`, `rBar` fra Finans, og `model` i chat) skal mappes inn i `routing` **én gang**. De må ikke ignoreres. Sannsynlig årsak: de nye rutene ble opprettet med standardverdier og overstyrte brukerens fungerende modeller.

## 3. AI-søk / Glimt kaller feil endepunkt eller modell-id
- Alle AI-kall skal gå gjennom **én** funksjon: `ai.run(task, {prompt, images?, tools?})` → ruter → leverandør. Søk etter direkte kall til Ollama/Gemini/Groq i klienten og fjern dem.
- Modell-id for sky må sendes uten prefiks: `gemini-2.5-flash`, ikke `gemini/gemini-2.5-flash`. For Groq: `llama-3.3-70b-versatile`, `qwen/qwen3-32b`.
- Ollama: bruk `/api/chat` med `stream:false` (eller håndter NDJSON-stream riktig). Sett `keep_alive` fra innstillingen (`"30m"`, `-1` for alltid, `0` for aldri). Ugyldig verdi (f.eks. `"alltid"` som streng) gir 400.
- Kontekst: `options.num_ctx` som tall (`8192`/`32768`/`131072`), ikke `"32k"`. Temperatur som tall.

## 4. Budsjett / «Stopp sky-AI ved grensen»
Hvis forbruket regnes feil (f.eks. 0 kr budsjett eller NaN), blokkeres alle sky-kall og man faller til en lokal modell som ikke finnes. **Fiks:** budsjett 0 = ingen grense. Ved blokkering skal man få en tydelig melding i svaret («Sky-budsjettet er brukt opp, bruker gemma4 lokalt»), ikke et tomt svar.

## 5. «Finansdata forlater aldri huset»
Er denne på, blir Finans · spør / AI-søk med finansdata tvunget til lokale modeller. Finnes ingen lokal tekstmodell, feiler alt stille. **Fiks:** vis feilen i svaret og i selvtesten med lenke til Valg.

## 6. Klienten skjuler feil
AI-søk og Glimt viser i dag ingenting eller «tenker» for alltid. **Fiks:**
- Timeout 20 s → bytt til reserve-modell.
- Feiler den også: vis «Glimt fikk ikke svar fra {modell}: {feil}» med **Prøv igjen** og **Åpne AI-kontroll**. Logg i Jobber med status «Feilet» og feilteksten.

## 7. Selvtest (ny, i AI-kontroll → Oversikt)
`POST /api/ai/selftest` kjører mini-prompt gjennom hver rute: Chat, AI-søk, Glimt · kalender, Kvitteringer (bilde: send et 1×1-bilde), Kategorisering, Finans · spør, Strekkoder, Domener og Kunnskapsbase (embed «test»). Resultatet strømmes (SSE):
```json
{"task":"sok","model":"llama-3.3-70b-versatile","ok":false,"ms":0,"error":"401 invalid api key","fix":"api"}
```
UI: liste med spinner → ✓ / ! per funksjon, feiltekst og knapp («Bytt modell» → Valg, «Legg inn» → API og nøkler). Kjør selvtesten automatisk etter at ruter eller nøkler er endret, og vis et varsel hvis noe feiler.

## Akseptkriterier
- [ ] Selvtest viser grønt for alle ruter på hjemmeserveren.
- [ ] AI-søk «har jeg et musikkabonnement» svarer innen 3 s.
- [ ] Glimt i Kalender svarer «Når er neste frisørtime?».
- [ ] Sletter jeg standardmodellen, bytter ruteren til reserven automatisk og sier fra.
- [ ] Ugyldig Groq-nøkkel gir en tydelig feil, ikke et tomt svar.
