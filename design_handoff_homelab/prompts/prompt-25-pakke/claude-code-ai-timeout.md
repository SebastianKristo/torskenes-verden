# Til Claude Code: AI-søk i Finans stopper etter ~30 s selv om Ollama har 60 s

## Feil
Finans → Søk med ✦ AI, med Ollama som motor: søket avbrytes med «brukte for lang tid» etter omtrent **30 sekunder**, selv om Innstillinger → AI og tolkning → Tidsgrenser har **Ollama = 60 s**. Innstillingen brukes altså ikke av alle lagene. Et lag har sin egen faste grense på 30 s.

## Finn og fjern alle faste grenser (sjekk hver av disse)
1. **Klient (web, iOS, Android):** `fetch`/`URLSession`/`OkHttp` til `/api/finans/sok`.
   - Fast `AbortController`-timeout, `URLRequest.timeoutInterval` eller `OkHttp.readTimeout`. OkHttp har 10 s som standard, og mange setter 30 s.
   - Klienten skal bruke **motorens grense × (forsøk + 1) + 10 s**, lest fra `GET /api/ai/settings`.
2. **Gunicorn/Uvicorn:** Gunicorn har `--timeout 30` som standard, som dreper workeren etter 30 s. Dette er den mest sannsynlige årsaken.
   - Sett `timeout = 0` eller `max(alle motorgrenser) × 4`, eller bruk Uvicorn-workers med `--timeout-keep-alive`.
   - Langvarige kall flyttes til bakgrunnsjobb (se punkt 6).
3. **Reverse proxy (Nginx/Caddy/Traefik):** `proxy_read_timeout`, `proxy_send_timeout`, `send_timeout` (Nginx har 60 s som standard). Sett dem til 180 s for `/api/ai/` og `/api/finans/sok`.
   - Cloudflare-tunnel/proxy kutter etter 100 s. Bruk strømming eller jobb for alt som kan ta lengre tid.
4. **Backend → Ollama:**
   - `httpx.AsyncClient(timeout=httpx.Timeout(connect=5, read=GRENSE, write=10, pool=5))`. Les `GRENSE` fra innstillingene **ved hvert kall**, ikke ved oppstart.
   - Bruk `"stream": true` mot `/api/generate` / `/api/chat`, så tidsgrensen gjelder tid uten nye tokens, ikke total tid.
   - `keep_alive: "10m"` slik at modellen ikke lastes på nytt (første lasting kan ta 20–40 s).
5. **Felles klient-wrapper:** sjekk om det finnes en `ai_call(..., timeout=30)` med fast standardverdi. Fjern standardverdien og krev `engine` → slå opp grensen.
6. **Lange søk:** `POST /api/finans/sok` returnerer `202 {job_id}` hvis det tar mer enn 5 s. Klienten følger med via SSE (`/api/jobs/:id/events`) eller poller hvert sekund. UI viser «✦ Ollama tenker … 34 s av 60 s» med fremdriftslinje og **Avbryt**.

## Når grensen faktisk nås
- Feilmeldingen skal si hvilken motor og hvilken grense: «Ollama svarte ikke innen 60 s». Ikke en generell tekst.
- Gå så til neste motor i rekkefølgen (Gemini → Groq …) eller vanlig søk, som beskrevet i Tidsgrenser i prompt 23.
- Logg `engine, limit_s, elapsed_s, layer` (klient / proxy / worker / ollama), så det er tydelig hvilket lag som kuttet.

## Test
- Sett Ollama = 60 s og kjør et søk med en modell som bruker ~45 s: søket skal fullføre.
- Sett Ollama = 20 s: søket skal stoppe ved ~20 s med teksten «Ollama svarte ikke innen 20 s» og gå videre til neste motor.
- Gjør begge testene på web, iOS, Android, lokalt nett og via Cloudflare.
