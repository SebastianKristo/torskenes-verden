# Kalender på Mac: samme widgets som iOS

Ønske 2026-10-20: «og for kalender på mac lag de samme widgets fra ios for mac.»
Fasit: `Kalender App Oversikt.dc.html` → **MAC · WIDGETS PÅ SKRIVEBORDET** (`Kalender App.dc.html`, `mode="desktop"`, `dimmed`).

## Widgets (WidgetKit, macOS 14+ skrivebord og Varslingssenter)
Samme design og data som iOS, delt kode i en felles widget-extension (`#if os(macOS)` bare for størrelser og farger):
- **Liten** (`.systemSmall`): ukedag, dato, UKE, neste hendelse (2 linjer) med fargestrek.
- **Medium** (`.systemMedium`): stor dato, måned, UKE + de tre neste hendelsene.
- **Stor** (`.systemLarge`): månedsrutenett med uke og prikker for dager med hendelser + to neste hendelser.
- **Ekstra stor** (`.systemExtraLarge`, bare Mac/iPad): venstre kolonne med dagens dato og tre neste, høyre månedsrutenett med neste hendelser.
- **App-ikon med dagens dato** i Dock (`NSApp.dockTile` med egen visning som oppdateres ved midnatt).

## Mac-detaljer
- **Monokrom/«accented» når apper er foran** (`widgetRenderingMode == .accented` / `.vibrant`): bruk `.widgetAccentable()` på dato og fargestreker, la bakgrunnen være `containerBackground(.fill.tertiary, for: .widget)`. Fasiten «apper foran» viser nedtonet versjon.
- Klikk åpner Kalender-appen på riktig sted (`widgetURL`: `kalender://dag/2026-10-20`, `kalender://hendelse?...`, `kalender://mnd/2026-10`), samme lenker som iOS.
- **Menylinje**: liten dato-ikon + «Neste: Tannlege 17:30» (`MenuBarExtra`), klikk viser dagens liste. Kan slås av i Innstillinger.
- Oppdatering: tidslinje per hendelse-start/-slutt + midnatt, og `WidgetCenter.shared.reloadAllTimelines()` ved endring i appen eller push fra Homelab.
- Interaktivitet (macOS 14): «Ny hendelse»-knapp i stor/ekstra stor via App Intent som åpner skrivefeltet.
- Delt data med iOS via App Group `group.no.kristo.kalender` (samme som innloggingen).
