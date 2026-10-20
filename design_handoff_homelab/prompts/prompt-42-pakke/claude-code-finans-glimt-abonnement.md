# FEIL: Finans Glimt-søk henger på «Ollama tenker … 0 s» («har jeg noen abonnementer»)

Vedlegg: `uploads/Screenshot 2026-10-20 at 18.44.38.png` (FinansHub web → Oversikt → Glimt-søk).
Hva som skjer: kortet viser «Ollama tenker … 0 s», telleren står på 0, fremdriftslinjen står fast (nesten full, med en mørk bit til høyre) og det kommer aldri noe svar. Bare **Avbryt** fungerer.

## 1. Spørsmålet skal ikke vente på Ollama
«Har jeg noen abonnementer» er et kjent spørsmål. Det skal besvares **lokalt fra data** på under 1 s, og Ollama brukes bare til å formulere svaret (valgfritt).
- Legg til intensjonen **abonnement** i felles `parseIntent()` (samme som Kalender/Homelab-søket):
  - Ord: abonnement/abonnementer/abo/subscription/faste trekk/faste utgifter/månedlige/trekk hver måned/strømmetjenester/prøveperiode.
  - Varianter: «har jeg noen …», «hvilke … har jeg», «hva betaler jeg hver måned», «hvor mye bruker jeg på abonnementer».
- Kilde, i rekkefølge:
  1. **Subscription OS / prøveperioder** (registrerte abonnementer med pris, intervall, neste trekk, prøveperiode-slutt).
  2. **Gjentakende transaksjoner** (`GET /api/finans/gjentakende`): samme forhandler, lignende beløp (±15 %), intervall 7/30/90/365 d ±4 d, minst 2 forekomster de siste 13 månedene.
- Svar (eksempel): «Du har 7 aktive abonnementer, til sammen 1 284 kr i måneden. Dyrest: Anthropic: Claude 240 kr, Viaplay 199 kr, Spotify 129 kr. Neste trekk: Netflix 22. okt.» + liste med rader (logo, navn, beløp/mnd, neste trekk) og knappen **Åpne abonnementer ›**.
- Prøveperioder som snart går ut vises øverst med merke **PRØVE · slutter 26. okt**.
- Ingen treff: «Jeg finner ingen faste trekk de siste 13 månedene.» Aldri hengende spinner.

## 2. Telleren og fremdriftslinjen må faktisk gå
Telleren står på «0 s». Enten startes ikke intervallet, eller så er `elapsed` regnet fra et tidspunkt som blir nullstilt ved hver render.
- Lagre `startedAt = Date.now()` **én gang** når forespørselen sendes (i state/ref, ikke i render). Vis `Math.floor((now − startedAt)/1000)` og oppdater hvert 250 ms (`setInterval` som ryddes ved svar, feil, Avbryt og unmount).
- Tekst: «Ollama tenker … 12 s av 60 s» (grensen fra `GET /api/ai/settings`, se `claude-code-ai-timeout.md`).
- Fremdriftslinje = `elapsed / grense`, med `transition: width .25s linear`. Ingen fast bredde, og ikke en ubestemt animasjon som ser ut som den står.
- Ved strømming (`stream: true`): bytt til «Glimt skriver …» ved første token og vis teksten fortløpende.

## 3. Aldri heng uten svar
Sannsynlig årsak til at det står fast: forespørselen kom aldri fram (feil URL / CORS / 401 etter at server-adressen ble flyttet til Innstillinger), eller `202 {job_id}` ble returnert uten at klienten begynte å følge jobben.
- Håndter alle utfall: `200` (svar), `202` (følg jobben via SSE `/api/jobs/:id/events`, eller poll hvert sekund), `4xx/5xx` og nettverksfeil.
- **Vakthund på klienten:** ingen hendelse (token, status eller heartbeat) på 10 s → vis «Får ikke kontakt med Ollama (http://…:11434). Prøv igjen · Bruk Gemini». Når grensen nås → «Ollama svarte ikke innen 60 s» og gå videre til neste motor, ellers vanlig søk.
- Serveren sender heartbeat hvert 2. s mens jobben kjører (`event: ping`).
- Logg `intent, engine, status, elapsed_s, layer` for hvert søk.

## 4. Småfeil i samme bilde
- Søkefeltet kutter teksten («har jeg noen abc»). Feltet skal være minst 280 px når det har fokus, og vise slutten av teksten (scroll til slutt) eller ellipsis bare når feltet ikke har fokus.
- Forslagschips «Sist jeg var på Anthropic: Claude s»: bruk rensket forhandlernavn (`merchant_display`, f.eks. «Anthropic»), ikke rå transaksjonstekst kuttet på antall tegn. Kutt med ellipsis i CSS, ikke i strengen.
- Legg til forslaget **«Har jeg noen abonnementer?»** blant forslagene.

## 5. Oppdatering 2026-10-20: det funker, men tar veldig lang tid
Svaret kommer nå, men etter lang ventetid. Det betyr at spørsmålet fortsatt går **gjennom Ollama** i stedet for den lokale hurtigveien i punkt 1, og/eller at modellen lastes på nytt hver gang.
Mål: **første svar < 1 s** for kjente spørsmål og **< 5 s** for fritekst.

1. **Hurtigvei før LLM:** `parseIntent()` kjøres i klienten/backend **før** noe sendes til Ollama. Treffer den (abonnement, sist jeg var på X, største utgift, sum i måned, kvitteringer med Y), bygges svaret direkte fra SQL og vises med en gang. Logg `path: 'fast' | 'llm'` og sjekk at «har jeg noen abonnementer» gir `fast`.
2. **Vis data først, tekst etterpå:** listen (abonnementer, sum, neste trekk) vises straks. Ollama kan formulere en setning i bakgrunnen og legge den over listen når den er klar, men brukeren venter aldri på den.
3. **Hvis LLM trengs:**
   - `keep_alive: "30m"` og **forvarm** modellen når søkefeltet får fokus (`POST /api/generate` med tom prompt). Kald lasting tar ofte 20–40 s, og det er sannsynligvis det meste av ventetiden.
   - Bruk en liten, rask modell til tolkning/ruting (f.eks. `qwen2.5:3b` / `llama3.2:3b`), og den store bare til lange svar.
   - Send **kort kontekst**: bare aggregerte tall og de relevante radene (maks ~60 linjer), ikke hele transaksjonslista. `num_ctx` 4096, `num_predict` 200.
   - `stream: true`, så tekst vises fra første token.
   - Verktøykall (`finans.subscriptions`, `finans.search`, `finans.sum`) i stedet for at modellen leser rådata.
4. **Cache:**
   - Gjentakende transaksjoner/abonnementer regnes ut i bakgrunnen (nattlig + ved ny import) og lagres i `finans_recurring`. Spørsmålet leser bare tabellen.
   - Svar på samme spørsmål caches i 10 min (nøkkel = normalisert spørsmål + siste import-tid).
5. **Fallback på tid:** brukes LLM og ingen token er kommet etter 6 s, vis hurtigsvaret (vanlig søk) og la Ollama fortsette i bakgrunnen. Etter 15 s → spør Gemini parallelt (hvis på) og vis det som kommer først.
6. **Mål og logg** `t_intent, t_sql, t_first_token, t_total, model, cold_load` per søk, og vis det i AI Kontroll → Logg, så det er lett å se hvor tiden går.

## Test
- Mål tid: «har jeg noen abonnementer» < 1 s (path `fast`), også første gang etter omstart.
- Fritekst («hva brukte jeg mest på i sommer?») < 5 s til første tekst med varm modell.
- «har jeg noen abonnementer», «hvilke abonnementer har jeg?», «hva betaler jeg hver måned», «hvor mye bruker jeg på strømmetjenester»: svar under 1 s, uten Ollama.
- Stopp Ollama: kortet viser feilmeldingen etter 10 s og tilbyr neste motor. Det henger ikke.
- Treg modell (~30 s): telleren teller opp, linjen fylles jevnt og svaret kommer.
- Web, iOS, Android, lokalt nett og eksternt.
