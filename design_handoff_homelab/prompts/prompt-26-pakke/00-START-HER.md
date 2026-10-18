# Til Claude Code: Prompt 26 – start her

Les denne filen først. Designet i `design/` er fasit: åpne en `.dc.html` direkte i nettleseren. Der appen eller nettsiden avviker fra designet, er det appen som skal endres. **iOS og Android skal se helt like ut.**

## Oppgaver (i rekkefølge)
1. **Kalender med skoletimeplan (ny modul)** → `claude-code-kalender.md`. Fasit: `Kalender.dc.html`. I appen ligger den under Mer → Kalender, og på web som fanen Kalender.
   - Nå-kort, Prøver og frister, Uke / Måned / Agenda, filter og detaljkort med påminnelse og MazeMap.
   - Hold inne et kort for å flytte (▲ ▼) eller skjule (−) det. Kortene skal fylle hele bredden på mobil.
   - Widgets for iOS, Android og Samsung i tre størrelser, og en **Kalender-widget på Hjem** (`mode="widget"`).
   - Data fra skolens iCal, Canvas, Bursdager og Google.
2. **Kalenderoppsett flyttet til Innstillinger → Kalendere.** Google Kalender og Home Assistant er ikke lenger på Bursdager-siden. Der finnes bare en lenkerad. Se `prompt-26.md`.
3. **Integrasjoner i Innstillinger som på web.**
   - Listen er gruppert, med farget merke, navn, beskrivelse og grønn eller rød status.
   - Hver integrasjon har en egen side med OPPSETT (felt som redigeres rett under raden), SLIK GJØR DU, Test og Fjern.
   - Se `prompt-26.md`.
4. **Sporing: overstyr tjenesten.** Ved ny pakke velger du Auto (gjenkjent) eller en bestemt tjeneste: Posten, Bring, PostNord, DHL, Helthjem, UPS, Budbee, Instabox eller ParcelsApp. For en eksisterende pakke: hold inne → SPOR VIA. Lagres som `packages.carrier_override`. Se `prompt-26.md` og `claude-code-sporing-status.md`.
5. **Rediger Finans-fanelinjen.** Hold inne på fanelinjen i Finans for samme editor som på Hjem: navn, ikon, rekkefølge, legg til og fjern, stil. Se `prompt-26.md`.
6. **Trykk på aktiv fane går til fanens rot.** For eksempel går Mer på Bursdager tilbake til Mer-menyen, og et nytt trykk scroller til toppen. → `claude-code-mer-fane.md`

## Filer i pakken
- `prompt-26.md`: brukerens ønsker ordrett, med hva som er gjort i designet
- `claude-code-*.md`: én fil per oppgave
- `design/`: alle designfiler, `support.js` og `assets/`

## Fra tidligere prompter (ta med hvis ikke gjort)
Prompt 25 (`prompt-25-pakke/`):
- AI-tidsgrense på 30 s
- Fold: sidelinje og vær
- Fanelinje-stil
- Mer med ikoner
- «Ta meg dit»
- Innlogging og onboarding på web

Prompt 24 (`prompt-24-pakke/`).
