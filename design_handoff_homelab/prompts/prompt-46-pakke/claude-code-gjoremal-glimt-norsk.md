# Gjøremål: Glimt ødelegger norsken når den lager oppgaver

Ønske 2026-10-23: «i gjøremål funekr ai ganske bra men norsken er litt feil. kansje bruk en annen modell som skjønner norsk bedre. den gjorde helt fine setninger gramtaisk feil etter ai gitt over de»
Gjelder `Huskeliste.dc.html` → `gRun`/`gSmart`/`gFromAI` (`claude-code-huskeliste-glimt-forstar.md`) og Glimt-motoren.

## Rotårsak (sannsynlig)
Modellen får lov til å **skrive om** teksten til oppgavetitler. Små modeller (8–12B) skriver dårligere norsk enn brukeren, så riktige setninger blir gale (feil bøying, svenske/danske ord, engelsk ordstilling). Problemet er at teksten genereres på nytt, og ikke først og fremst hvilken modell som brukes.

## Rett 1: ikke skriv om, plukk ut (viktigst)
- Modellen returnerer **tegnposisjoner** i brukerens tekst, ikke ny tekst: `{items:[{start, end, due?, list?, who?}]}`. Koden klipper ut titlene fra originalteksten.
- Lov å fjerne bare fyllord i starten (`husk å`, `jeg må`, `vi må`, `minn meg på å`, `at jeg skal`) og dato/tid-uttrykk. Første bokstav gjøres stor. Ellers ordrett.
- Deling i flere oppgaver skjer på `,`/`og`/linjeskift, ut fra posisjonene modellen gir.
- **Validering:** hver tittel må finnes ordrett (minus fjernede fyllord) i originalen. Hvis ikke → bruk originalteksten for den delen.
- Glimts egne svar («Lagt inn 3 oppgaver i Handel») er faste maler i koden, ikke generert tekst.

## Rett 2: modell for norsk (test før bytte)
Ikke bytt modell uten å måle. Lag et lite testsett (30 ekte setninger fra brukeren) og sammenlign på Mac mini M4 16 GB:
- Nåværende (`qwen3:8b` / `gemma3:12b`).
- `gemma3:12b` (generelt bedre på nordiske språk enn Qwen).
- En norsk-tilpasset modell, f.eks. **NorMistral-7B-instruct** (LTG/UiO) eller en **NorwAI**-modell som GGUF via Ollama, hvis den finnes i en versjon som passer i minnet.
Mål: andel titler uten grammatikkfeil, riktig oppdeling, riktig dato, tid per svar og minnebruk. Velg den beste for **tekst-ut-oppgaver** (svar i chat, oppsummeringer), og behold rett 1 uansett for gjøremål.
- Valget gjøres i AI-kontroll → Modeller → «Norsk tekst», så det kan endres uten ny versjon.
- Systemprompt på norsk bokmål med 3 korte eksempler. Ingen engelske instrukser i samme prompt.

## Test
- «Husk å kjøpe melk, brød og egg i morgen» → «Kjøpe melk», «Brød», «Egg» (eller «Kjøpe melk, brød og egg» om brukeren vil ha én), frist i morgen, ingen omskriving.
- «Ringe tannlegen og bestille time til Pål» → ordrett «Ringe tannlegen og bestille time til Pål».
- 30 setninger fra brukerens egne gjøremål → 0 nye grammatikkfeil.
