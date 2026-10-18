# Til Claude Code: Kvitteringer (Papir) og Aksjer, nøyaktig kopi på iOS og Android

Fasit: `design/Mobil Papir App.dc.html` → side `kvitt` og side `aksjer` (Aksjer-siden importerer `design/Aksjer Mobil.dc.html`). iOS og Android skal være **piksel-like**, med samme tokens, fonter og radier som i `claude-code-familie-design.md`.

## Kvitteringer
1. **«Ta bilde av kvittering»**: stort kort, rødt kamera-ikon i 52 px sirkel, undertekst «Bakkamera · ✦ Gemini leser beløp og butikk». Åpner kamera direkte (iOS `VNDocumentCameraViewController` med automatisk beskjæring, Android ML Kit Document Scanner).
2. **Bilder** og **Filer**: to like kort i rad. Bilder = fotobibliotek (flervalg). Filer = PDF/bilde fra Filer-appen.
3. **KØ** (bare når noe er i køen): filnavn, status («✦ Leser … 42 %» / «Venter på nett · sendes automatisk» / «Klar · trykk for å bekrefte»), fremdriftslinje og «✦ Analyser på nytt». Offline-kø og tidsgrenser som før (`papir_ai_to`).
4. **TIL GJENNOMGANG · N**: rad med butikklogo (logobiblioteket), navn, «dato · motor · sikkerhet %» og beløp i Plex Mono. Trykk utvider raden: navn, beløp, kategori-chips og knappene **✓ Godkjenn og bokfør**, **✦ På nytt** og **🗑**.
5. **BOKFØRT · N**: samme rad med kategori, og ↺ for å sende tilbake til gjennomgang.
6. Skillelinjer **bare mellom** rader (se `claude-code-kvittering-strek.md`).
7. FAB (skann) beholdes på Kvitteringer.

## Aksjer
- Bygg siden **nøyaktig** som `Aksjer Mobil.dc.html`, i denne rekkefølgen:
  - Verdikort med «Live»-merke, stor verdi i Plex Mono, dagsendring-chip, graf (område + linje) og periodevelger 1D · 1U · 1M · 3M · 1Å · Alt.
  - Synk-linje («Live-konto · synket … · lesetilgang» + ↻ tid).
  - 2×2 nøkkelkort: Porteføljeverdi, Avkastning totalt, I dag, Ledig kontanter.
  - Filter-piller Alle · Aksjer · ETF · Kontanter.
  - «Største posisjoner»: vannrett karusell med fargede kort og Kjøp/Selg.
  - «Alle posisjoner»: liste med sparkline og prosent-chip, og «Transaksjoner ›».
- **Ingen skann-knapp (FAB) på Aksjer.**
- Data: Trading 212 API (lesetilgang), som før.

## Navigasjon: «Mer» følger modulen
- Når en Finans-underside er åpen (Aksjer, Kvitteringer, Budsjett, Faste, Kontoer, Boliger, Rapporter, Import, Transaksjon …), viser fanelinjen Finans-fanene, og **«Mer» åpner Finans → Mer** (flisene: Budsjett, Kvitteringer, Faste utgifter, Kontoer, Aksjer …). Den skal ikke åpne appens globale «Mer».
- «Mer» er markert (lys pille) mens en Finans-underside som ikke har egen fane er åpen.
- Det samme for Domener (Oversikt · Publikum · Ytelse · Infra) og Familie (Kart · Soner · Helse · Mer → global Mer, siden Familie ikke har egen Mer).
- Implementasjon: fanelinjen leser `currentModule` fra ruten (`finans/*` → Finans-faner, `mer`-handling = `finans/mer`). iOS: én `NavigationStack` per modul. Android: nested `navigation(route="finans")` med egen `mer`-destinasjon.

## Test
Kvitteringer: ta bilde → dukker opp i KØ → «Klar» → trykk → åpnes i Til gjennomgang → godkjenn → flyttes til Bokført. Aksjer → trykk «Mer» → Finans-Mer åpnes (ikke global Mer). Aksjer: legg skjermbilder av iPhone og Pixel ved siden av designet (390 px). Like layouter og ingen FAB.
