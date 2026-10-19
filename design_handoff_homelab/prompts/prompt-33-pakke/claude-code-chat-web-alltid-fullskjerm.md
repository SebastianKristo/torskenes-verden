# Web: Chat skal ALLTID være fullskjerm

Vedlegg: uploads/Screenshot 2026-10-19 at 18.38.28.png. Den ekte web-appen viser fortsatt Chat som kort under hero, med toppmenyen og skybildet over. Det er feil.

Fasit: `Homelab Papir Web.dc.html` → `chW` (alltid `full: true`).

## Krav
- Når man åpner **Chat** (fanen, `/chat`, AI-knappen, søk → «Spør AI»), legger chatten seg over hele vinduet: `position: fixed; inset: 0; z-index: 110`. Ingen radius, kant eller skygge.
- **Ikke vis** toppmeny (Dashboard … Kalender), hero (skybilde, «Ollama lokalt · Gemini · Groq», stor «Chat»), Vær-pillen eller profilbildet. Skjul dem, eller ikke render dem, når ruten er `chat`. `body` får `overflow: hidden`.
- Oppsett: venstre panel (samtaler, søk, Modeller, Kunnskapsbase, Tema) i full høyde og samtalen til høyre. Meldingskolonnen og skrivefeltet beholder maks 760 px bredde og er midtstilt.
- Øverst til høyre i samtalehodet: ⚙ samtaleinnstillinger og **✕ Lukk** (rund 40 px, mørk fylt). ✕ og Esc går tilbake til forrige side (Dashboard hvis det ikke finnes noen).
- **Fjern** valget «Vis i siden» og localStorage-nøkkelen `hl_chat_full`. Slett den hos brukere som har `'0'`, ellers står de fast i gammel visning.
- Samme mønster som Vær, Kalender, Rom og Finans i fullskjerm.

## Test
1. Gå til Dashboard → Chat. Skjermen skal bare vise chat, uten meny eller sky.
2. ✕ → tilbake til Dashboard.
3. Last inn `/chat` direkte, også med `hl_chat_full='0'` i localStorage: fortsatt fullskjerm.
4. Etter deploy: hard-refresh skal ikke være nødvendig (se `claude-code-web-cache-fiks.md`).
