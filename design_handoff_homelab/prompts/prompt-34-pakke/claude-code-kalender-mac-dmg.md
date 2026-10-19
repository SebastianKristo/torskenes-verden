# Kalender for Mac (.dmg)

Fasit (design): `Kalender Mac.dc.html`: skrivebord med app-vindu, menylinje-kalender, Dock-ikon, DMG-installasjonsvindu og varsel. Innholdet i vinduet er **samme web-kalender** (`Kalender.dc.html`, `variant="web"`, `full`), så Mac og web ser like ut.
Se også `claude-code-kalender-app.md` (iOS/Android-appen, Glimt, mørkt tema) og `claude-code-kalender-web-ai-sok.md`.

## Teknisk valg
**SwiftUI multiplatform-target** i samme Xcode-prosjekt som iOS-appen «Kalender» (deler modeller, sync, Glimt-klient, App Group og WidgetKit). Vinduet bruker samme layout som web: sidemeny med minikalender og kalendere, toppverktøylinje med visninger og hovedvisning.
- Alternativ hvis web-koden skal gjenbrukes 1:1: **Tauri 2** (Rust + WebView, ~10 MB) som laster web-kalenderen (`/kalender?app=mac`) med native meny, varsler og menylinje via plugins. Bruk det bare hvis SwiftUI-varianten tar for lang tid. Widgets krever uansett en WidgetKit-utvidelse i Swift.

## App
- **Vindu:** min. 980 × 640, husker størrelse og posisjon. Unified titlebar i papirfarge (`#ece6da`). Støtter fullskjerm og Split View. Flere vinduer: ⌘N = nytt vindu.
- **Meny** (norsk):
  - Kalender: Om, Innstillinger ⌘,, Avslutt.
  - Arkiv: Ny hendelse ⌘N, Ny kalender, Importer .ics.
  - Rediger.
  - Vis: Dag ⌘1, 3 dager ⌘2, Uke ⌘3, Måned ⌘4, År ⌘5, Liste ⌘6, I dag ⌘T, Søk ⌘F, Spør Glimt ⌘K, Vis/skjul sidemeny ⌥⌘S, Ukenummer.
  - Gå: Forrige ⌘←, Neste ⌘→, Gå til dato ⇧⌘T.
  - Vindu og Hjelp.
- **Tastatur:** samme snarveier som web (D, 3, W, M, L, T, piler). Ingen snarveier når fokus er i et felt eller søket er åpent.
- **Menylinje-kalender (MenuBarExtra):** ikon med dagens dato og neste hendelse («Tannlege 15:15»). Klikk åpner et panel (340 px) med:
  - dato og ukenummer
  - minimåned
  - dagens og morgendagens hendelser
  - Glimt-felt med rød +
  - «Åpne Kalender ⌘0» og «Innstillinger …»
  
  Kan slås av i Innstillinger. Valg: vis bare ikon / dato / neste hendelse.
- **Dock-ikon** viser dagens dato (oppdateres ved midnatt med `NSApp.dockTile`) og antall hendelser i dag som badge (valgfritt).
- **Varsler:** `UNUserNotificationCenter` med handlingene «Utsett 10 min» og «Vis vei» (åpner Kart). Samme regler som mobil.
- **Widgets (macOS 14+):** de samme WidgetKit-widgetene som iOS (liten, medium, stor) på skrivebordet og i Varslingssenter. Ingen ekstra arbeid utover å legge macOS til target.
- **Glimt:** samme panel og animasjoner som i iOS-appen (⌘K). Svar mens appen er skjult gir varsel.
- **Mørkt tema:** følger systemet, eller valg i Innstillinger (System / Lys / Mørk).
- **Start ved innlogging** (`SMAppService.mainApp`), valgfritt. Kjører videre i menylinjen når vinduet lukkes.
- **Synk:** samme konto og backend som web og iOS. Endringer vises live (WebSocket/SSE).
- **Auto-oppdatering:** Sparkle 2 med appcast på `https://homelab.kristo.no/kalender/appcast.xml`, eller oppdatering via Homelab Nordlys-oppdateringer.

## Bygg og DMG
1. Xcode → target «Kalender (macOS)». Bundle id `no.kristo.kalender`. Deployment macOS 13. Arkitektur: Universal (arm64 + x86_64).
2. **Signering:** Developer ID Application, Hardened Runtime på. Entitlements: App Sandbox, network client, calendars (hvis EventKit-import), user-selected files (read-only, for .ics), app groups (`group.no.kristo.papir`).
3. **Arkiver** → Distribute App → Developer ID → eksporter `Kalender.app`.
4. **DMG** med [create-dmg](https://github.com/create-dmg/create-dmg):
```bash
create-dmg \
  --volname "Kalender" --volicon "Kalender.icns" \
  --background "dmg-bakgrunn.png" --window-size 640 420 \
  --icon-size 120 --icon "Kalender.app" 170 210 \
  --app-drop-link 470 210 --hide-extension "Kalender.app" \
  "Kalender-1.0.dmg" "build/Kalender.app"
```
   Bakgrunn `dmg-bakgrunn.png` (640 × 420 @1x og @2x): papirfarge `#f3efe6`, tittel «Dra Kalender til Programmer» (Newsreader 30) og en stiplet rød pil mellom ikonene, som i designet.
5. **Notarisering:** `xcrun notarytool submit Kalender-1.0.dmg --keychain-profile "kristo" --wait` og så `xcrun stapler staple Kalender-1.0.dmg`.
6. **CI** (GitHub Actions, macos-14): bygg → signer → create-dmg → notariser → last opp til Releases og appcast.
7. Last ned-knapp på web: Innstillinger → Apper → «Kalender for Mac (.dmg)», med versjon og størrelse.

## App-ikon
Krem (`#fffdf8`) squircle. Rød topp med ukedag (IBM Plex Mono, «TIR») og dato i Newsreader. Lag `.icns` (16–1024). Dock-ikonet tegnes dynamisk med dagens dato, og det statiske ikonet viser «19».

## Test
- Installer fra DMG på en ren Mac. Første oppstart skal gå uten Gatekeeper-advarsel.
- Menylinje-panelet åpner raskt og viser riktige hendelser. Glimt-feltet legger inn «frisør 14.30 25.10».
- Endring på iPhone vises i Mac-appen innen 5 sekunder. Widgets oppdateres.
- Mørk modus, fullskjerm og flere vinduer fungerer.
