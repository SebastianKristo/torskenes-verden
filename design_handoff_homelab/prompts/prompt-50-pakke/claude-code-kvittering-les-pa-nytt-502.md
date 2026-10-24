# Kvittering: «Glimt leser kvitteringen på nytt» gir Feil 502

## Symptom
Arket «✦ Glimt leser kvitteringen på nytt» viser «Feil 502 (HTTP 502)» med en gang eller etter en stund. «Prøv igjen» gir samme feil.

502 betyr at proxyen (Caddy/Traefik/nginx foran API-et) ikke fikk gyldig svar fra backend. Feilen ligger altså mellom proxy → API → modell, ikke i appen.

## Diagnose, trinn for trinn (kjør og noter resultat)
1. **Hvilket endepunkt kalles?** Finn kallet bak «Les på nytt» (søk etter `reread`/`reprocess`/`les-paa-nytt` i app og API). Noter URL og metode.
2. **Kall API-et direkte, forbi proxyen**, med samme kvittering-ID:
   `curl -sS -m 300 -X POST http://<api-host>:<port>/<endepunkt> -H 'Authorization: …' -w '\n%{http_code} %{time_total}s\n'`
   - Svarer direkte, men 502 via proxy → **timeout i proxy** (se Fiks A).
   - Krasjer/timeout også direkte → se trinn 3.
3. **API-logg** (`docker logs <api> --since 10m`): se etter OOM, `Killed`, stacktrace, «connection refused» mot modellen.
4. **Originalbildet**: finnes filen på disk/objektlager for denne kvitteringen? Størrelse? (Full oppløsning kan være 5–15 MB / 4000+ px.)
5. **Modellen** (Ollama/Gemini/annen): `curl http://<ollama>:11434/api/tags` og at visjonsmodellen er lastet. Sjekk `docker logs ollama` for OOM / «model failed to load» når bildet sendes.
6. Sjekk om **vanlig første lesing** av ny kvittering fungerer. Hvis ja, men «på nytt» feiler → full-oppløsningsbildet er forskjellen (Fiks B).

## Sannsynlige årsaker og fiks
**A. Proxy-timeout** (vanligst). Lesing av full oppløsning tar lengre tid enn proxyens standard (ofte 30–60 s).
- Caddy: `reverse_proxy api:8000 { transport http { read_timeout 300s write_timeout 300s } }`
- nginx: `proxy_read_timeout 300s; proxy_send_timeout 300s; client_max_body_size 25m;`
- Traefik: `respondingTimeouts.readTimeout=300s` på entrypoint.

**B. Bildet er for stort for modellen / minnet.**
- Før sending: nedskaler til lengste side 2048 px, JPEG kvalitet 85, roter etter EXIF. Behold originalen på disk uendret.
- Hvis tekst blir for liten: del lange kvitteringer i 2–3 overlappende biter og slå sammen linjene.

**C. Synkront kall som blokkerer.** Gjør «les på nytt» til en jobb:
- `POST /kvitteringer/{id}/les-paa-nytt` → `202 {jobId}` med en gang.
- `GET /jobber/{jobId}` → `{status: venter|leser|ferdig|feil, resultat?, feil?}`; appen poller hvert 1,5 s (eller SSE).
- Ingen HTTP-forespørsel holdes åpen i mer enn noen sekunder, så proxy-timeout kan ikke treffe.

**D. Modellen er nede / ikke lastet.** Gi tydelig feil fra API (503 med `{kode:"modell_utilgjengelig"}`) i stedet for at proxyen gir 502.

## Feilmelding i appen
Erstatt «Feil 502 (HTTP 502)» med en forklaring brukeren kan handle på. Behold arket, knappene «Lukk» og «Prøv igjen».
- 502/504/timeout: «Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.» + sekundærknapp «Les mindre versjon» (sender nedskalert bilde).
- 503 modell_utilgjengelig: «Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.»
- 404 bilde mangler: «Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.»
- Annet: «Noe gikk galt (kode X).» Logg full respons til konsoll/Sentry.
- Mens jobben går: vis fremdrift «Leser … 12 s» så det ikke ser hengt ut.

## Test
- Les på nytt en stor kvittering (>8 MB, lang) → ferdig uten 502, endringer vises, lagres kun ved «Bruk endringene».
- Stopp modell-containeren → riktig melding, ingen 502.
- Gjelder både iOS, Android og web (Boliger/FinansHub «Les på nytt»).
