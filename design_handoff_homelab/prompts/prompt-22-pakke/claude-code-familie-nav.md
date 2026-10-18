# Til Claude Code: Familie – fanelinje med Kart · Soner · Helse, ingen skann-knapp

## Symptom (iOS-appen)
- Familie viser Kart / Soner / Helse som knapper under toppbildet, mens fanelinjen nederst viser Finans · Mat · Sporing · Mer.
- Den røde skann-knappen (FAB) ligger over listen på Familie. Den har ingen funksjon der og dekker innhold.

## Fasit (`design/Mobil Papir App.dc.html`, side `kart`, som Subscription OS)
1. **Fanelinjen nederst** byttes mens Familie er åpen: **Kart · Soner · Helse · Mer** (ikoner ◎ ◌ ♡ ⋯). Valgt fane er lys pille med ikon og tekst, de andre bare tekst. Samme stil som resten av appen.
2. **Knappene øverst** (Kart / Soner / Helse under toppbildet) fjernes. Innholdet starter rett under toppbildet.
3. **Skann-knappen (FAB) skjules** på Familie (alle tre faner). Handlinger på siden («+ Ny sone», «Vis alle», oppdater) ligger i kortene som før.
4. «‹ Hjem» øverst fører tilbake til Hjem, og fanelinjen bytter tilbake til hovedfanene.
5. Valgt Familie-fane huskes mens appen er åpen (`famTab`).

6. **Verktøyrad over kartet** (ikke under): «+ Ny sone» til venstre, «Vis alle» og ↻ til høyre.
7. **Profilbilder** på kartpins og i alle personlister (Familien, Helse). Reserve er initialer i personens farge.

## Implementasjon
- iOS: når `route == .familie`, bruk en egen `TabView`/egendefinert fanelinje med tre seksjoner, eller bytt innholdet i den eksisterende flytende linja. Skjul FAB med `.opacity(0)` + `allowsHitTesting(false)` eller fjern den fra hierarkiet.
- Android: samme med `NavigationBar` og egne `NavigationBarItem`. `FloatingActionButton` vises ikke på `familie/*`.
- Kartet: bruk Apple Maps/MapKit på iOS hvis det allerede er valgt (som i skjermbildet). Ellers Kartverket-fliser, se `claude-code-kart-fiks.md`.

## Test
Åpne Familie → fanelinjen viser Kart · Soner · Helse · Mer, ingen knapper under toppbildet, ingen rød skann-knapp. Bytt fane → riktig innhold. «‹ Hjem» → vanlig fanelinje og FAB tilbake.
