# Til Claude Code: Prompt 25 – start her

Les denne filen først. Designet i `design/` er fasit: åpne en `.dc.html` direkte i nettleseren. Der appen eller nettsiden avviker fra designet, er det appen som skal endres. **iOS og Android skal se helt like ut.**

## Oppgaver (i rekkefølge)
1. **AI-søk stopper etter 30 s** (Ollama satt til 60 s) → `claude-code-ai-timeout.md`
   - Fjern faste grenser i alle lag: klient, Gunicorn, proxy og httpx.
   - Strøm svaret fra Ollama, og bruk bakgrunnsjobb med fremdrift og Avbryt.
2. **Fanelinjen på Galaxy Fold / nettbrett** → `claude-code-fold-navbar.md`
   - Ikoner vises i dag som tekst («cre», «for», «squ»). Bruk ingen ligatur-fonter, og samme SVG-ikoner som på telefon.
   - Sidelinjen skal ha samme farge som telefonens fanelinje (`nav` + blur), og etiketter på én linje.
   - **Rød Hjem-knapp** øverst i sidelinjen når du ikke er på Hjem. Da skjules «‹ Hjem».
   - **Værsiden på Fold:** to kolonner, værkart på siden, fliser i 3 kolonner, detaljark som sidepanel.
3. **Fanelinje-stil** (Innstillinger → HOMELAB → Fanelinje-stil, og «Rediger fanelinjen» → STIL med stor forhåndsvisning). Valgene er Tekst / Bare ikoner / Ikoner + navn på valgt. Se `prompt-25.md`.
4. **Mer-menyen med ikoner** → `claude-code-mer-lik.md` (oppdatert): 40 pt boks med strekikon i palettfarger.
5. **Innstillinger: «Ta meg dit →» etter AI-søk.** Den åpner riktig underside, scroller til raden og fremhever den i ~3 s. Se `prompt-25.md`.
6. **Innlogging og onboarding på PC/web i Papir-tema** (fasit: `Homelab Papir Web.dc.html`, tweak `gate`). Se `prompt-25.md`.
   - Logg inn → tofaktor.
   - Onboarding i 4 steg: navn og server, brukernavn og passord, bakgrunn, oppsummering.
   - Erstatter det gamle designet fra `Homelab v2`.

## Filer i pakken
- `prompt-25.md`: brukerens ønsker ordrett, med hva som er gjort i designet
- `claude-code-*.md`: én fil per oppgave
- `design/`: alle designfiler, `support.js` og `assets/`

## Fra tidligere prompter (ta med hvis ikke gjort)
Prompt 24 (`prompt-24-pakke/`):
- Bursdager og widgets
- Samsung-widgets
- Ruter, Mer og Boliger like på iOS og Android
- Profiler
- App-ikon og -navn
- Søk og integrasjoner i Innstillinger
