# Til Claude Code: Prompt 24 – start her

Les denne filen først. Designet i `design/` er fasit: åpne en `.dc.html` direkte i nettleseren. Der appen eller nettsiden avviker fra designet, er det appen som skal endres. **iOS og Android skal se helt like ut.** Ikke bruk Material- eller systemkomponenter som gir egne mål.

## Oppgaver (i rekkefølge)
1. **Bursdager (web, iOS og Android)** → `claude-code-bursdager.md`
   - Fasit: `Bursdager.dc.html`. I appen ligger den under Mer → Bursdager, på web som fanen Bursdager.
   - Innhold: «Neste bursdag», søk, liste per måned, og legg til / rediger / slett.
   - Google Kalender: OAuth, les og skriv årlige heldagshendelser, bursdager fra kontakter.
   - Home Assistant: import av `calendar.*` og synk to veier.
   - Widgets: Hjem-widget og telefon-widgets for iOS og Android.
2. **Samsung One UI-widgets i samme størrelse som Samsungs egne** → `claude-code-samsung-widgets.md`
   - Alle widgets i 2×2 skal være ≈ 134 × 155 dp med radius 20 dp, som Samsung Vær.
3. **Ruter-visningen lik på iOS og Android** → `claude-code-ruter-lik.md` (+ `claude-code-avgang-stopp.md`)
   - Ingen Ruter-logo og ingen fanelinje eller FAB.
   - Stopp-piller og filter.
   - Én liste i ett kort, med minutter i 24 pt.
4. **«Mer»-menyen lik på iOS og Android** → `claude-code-mer-lik.md`
5. **Fanelinje-ikoner** (18 pt boks, 16 pt glyf, sentrert og 1,5 pt ned, Android `includeFontPadding=false`) → `claude-code-familie-design.md`, avsnittet «Fanelinje – ikon ved siden av tekst»
6. **Familie: én person = én oppføring** selv med flere enheter → `claude-code-familie-design.md`, avsnittet «Én person = én oppføring»
7. **Kart: Apple Maps (MapKit) på iPhone og iPad, Kartverket på Android og web** → `claude-code-familie-design.md` og `claude-code-kart-fiks.md`
8. **Profiler (Innstillinger → Profil)**: Standard · Finans + Boliger · Boliger-profil (se `prompt-24.md`):
   - **Finans + Boliger** starter i Boliger.
   - Fanene er **Boliger** · Søk · Liste · Oversikt · Kvitteringer · Mer, og Hjem ligger under Mer.
   - Det er ingen tilbake-knapp på rotsidene, og profilbildet står alltid til høyre.
   - Toppbildet har en domene-pille som åpner Domener, og «‹ Boliger» går tilbake.
9. **Boliger nøyaktig lik på iOS og Android i begge profiler** → `claude-code-boliger-lik.md`
   - Toppbildet følger valgt bolig, for eksempel Strømstad-bildet. Bildet ligger i `design/assets/stromstad.png`.
   - Hold inne på en bolig for å redigere navn, adresse, budsjett, farge og bakgrunn, eller slette.
10. **Nyhetsleser-ikoner vises med en gang** (ikke CSS-maske, `<img>` / tintet bilde, forhåndslast) → se `prompt-24.md`
11. **Bytte app-ikon og app-navn (Android og iOS)** → `claude-code-app-ikon-navn.md`
    - Android: `activity-alias`. iOS: `setAlternateIconName`.
12. **Søk og ✦ AI-søk i Innstillinger, og alle integrasjoner under Integrasjoner** (fasit: `Mobil Papir App.dc.html` → Innstillinger), se `prompt-24.md`:
    - Integrasjonene: HA, Google Kalender, Gemini, Trading 212, Bank, IMAP, Entur, Mybring, PostNord, ParcelsApp, Cloudflare, Finn, MET, Kart og Ikoner.
    - Hver har status, redigering av felt rett under raden, test og fjern.
    - Hemmeligheter lagres kryptert i backend.
13. **Hjem: Pakker-widgeten skal alltid vises**: nye widgets legges til i lagret rekkefølge og skal ikke erstatte noe (se `prompt-24.md`).

## Filer i pakken
- `prompt-24.md`: brukerens ønsker ordrett, med hva som er gjort i designet
- `claude-code-*.md`: én fil per oppgave (pluss avhengigheter)
- `design/`: alle designfiler, `support.js` og `assets/`

## Fra tidligere prompter (ta med hvis ikke gjort)
Prompt 23: sveip tilbake, kvitteringer og aksjer, abonnementer, Finn-annonse, Nyhetsleser-ikoner, AI-tidsgrenser, scrollposisjon og HA-integrasjon. Prompt 22: Familie, vær, standardtema, Huskeliste og sporing. Filene ligger i `prompt-23-pakke/` og `prompt-22-pakke/`.
