# Claude Code – prompt 27: start her

Les `prompt-27.md` først (ønskene ordrett). Designfasit ligger i `design/`. Åpne `.dc.html`-filene i nettleseren for å se og prøve.

## Oppgaver (i rekkefølge)
1. **Kalender v2 + RRULE-feilen** → `claude-code-kalender-v2.md`
   - Ekspander gjentakende timer fra skolens iCal (RRULE/EXDATE, Europe/Oslo). Det er grunnen til at bare prøvene vises.
   - Fullskjerm-kalender med egen fanelinje (Dag · 3 dager · Uke · Måned · Liste), NESTE/NÅ-stripe, ny/rediger hendelse. Widgetene nederst er fjernet.
2. **Chat (Ollama + Gemini/Groq)** → `claude-code-chat.md`
   - Open WebUI som motor (API), eget UI i mobil og web. Historikk synkes. Spør før data sendes til sky.
3. **Søkeforslag i Finans** → `claude-code-finans-sokeforslag.md`
4. **✕ til venstre i alle søkefelt** → `claude-code-tom-sok.md`
5. **Logo-oppslag** (Ollama lokalt, Gemini bare butikknavn) → `claude-code-logo-oppslag.md`
6. **Nyhetsleser: bilder og artikkelvisning** → `claude-code-nyheter-artikkel.md`
7. **Ruter på Hjem: velg stopp + widgets** → `claude-code-ruter-hjem.md`
8. **Nytt abonnement fra skjermbilde** → `claude-code-abo-skjermbilde.md`
9. **Norsk/engelsk på web-dashboardet** → `claude-code-sprak.md`
10. **Planet-bakgrunn mindre** (web, Dashboard): «Planeter» vises ~62 % bredde på svart, ikke `cover`.

## Design-filer
- `design/Mobil Papir App.dc.html` – Chat, Finans-søk, ✕ i søk, Ruter på Hjem, AI-innstillinger (Personvern og logoer, Chat), Kalender i fullskjerm
- `design/Homelab Papir Web.dc.html` + `design/i18n.js` – Chat-fane, ✦ AI i Google-søk, språkvalg, planet, Kalender
- `design/Kalender.dc.html` (ny) og `design/Kalender v1.dc.html` (gammel, til sammenligning)
- `design/Nyhetsleser.dc.html`, `design/Subscription OS.dc.html`, `design/Widgets.dc.html`
- `design/Boliger.dc.html`, `design/Bursdager.dc.html`, `design/Vaer.dc.html`, `design/Matplan.dc.html` – ✕ i søkefelt
- `design/support.js` – trengs for å åpne filene lokalt
