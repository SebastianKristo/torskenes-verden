# Alle widgets i appene + Widgets-side i Innstillinger

Ønske 2026-10-21: «legg til alle widgtes i appene.» (vedlegg `uploads/Screenshot 2026-10-21 at 11.03.53.png`: Media-widgetene for iOS, Android og Samsung)
Fasit: `Widget Galleri.dc.html` (`platform="ios" | "android"`, `samsung`), åpnes fra `Mobil Papir App.dc.html` → Innstillinger → App → **Widgets** («Media, Avganger, Kalender og 3 til»). Design per widget: `Media Widgets.dc.html`, `Widgets.dc.html` (Avganger), `Prøveperiode Widgets.dc.html`, `Kalender App.dc.html` `mode="home"|"lock"`.

## 1. Registrer ALLE widgets
**iOS – én `WidgetBundle`** (vanligste grunn til at en widget ikke vises i galleriet er at den mangler her):
```swift
@main struct PapirWidgets: WidgetBundle {
  var body: some Widget {
    MediaWidget()          // .systemSmall, .systemMedium, .systemLarge
    MediaLockWidget()      // .accessoryRectangular, .accessoryCircular, .accessoryInline
    DeparturesWidget(); DeparturesLockWidget()
    CalendarWidget(); CalendarLockWidget()
    TrialWidget(); TrialLockWidget()
    ParcelsWidget()
    BriefWidget(); BriefLockWidget()
  }
}
```
Media: `PauseAllIntent` / `ResumeAllIntent` (AppIntents) for knappen i stor widget. App Group `group.no.kristo.papir` → `media.json`.

**Android – én `AppWidgetProvider`/Glance-receiver per widget** i `AndroidManifest.xml`, hver med `appwidget-provider`-XML (`minWidth/minHeight`, `targetCellWidth/Height`, `resizeMode`, `previewLayout` + `previewImage`, `widgetCategory="home_screen"`, `description`):
- `MediaSmallReceiver` 2×2 · `MediaMediumReceiver` 4×2 (Pause alt) · `MediaLargeReceiver` 4×3 (Kommer denne uka)
- `DeparturesReceiver`, `CalendarReceiver`, `TrialReceiver`, `ParcelsReceiver`, `BriefReceiver`
Samsung: samme receivere; stilen byttes i Glance når `Build.MANUFACTURER == "samsung"` (hvit, 26 dp, blå linjer). Samsung-preview krever `previewLayout` (ellers blank i One UI-galleriet).

## 2. Widgets-siden i appen
- Tekst øverst (forskjellig på iOS og Android), filterchips: Alle · Media · Avganger · Kalender · Prøveperioder · Pakker · Glimt-brief.
- Per app en rad med alle størrelser som kort: forhåndsvisning på bakgrunn (iOS blågrå, Android Material You, Samsung blå), navn + størrelse (iOS: Liten/Medium/Stor/Låseskjerm, Android: 2 × 2 / 4 × 2 / 4 × 4).
- **Android:** «Legg til på startskjermen» → `AppWidgetManager.requestPinAppWidget(provider, extras, successCallback)` → systemdialogen «Legg til på startskjermen?» → «✓ Lagt til». Sjekk `isRequestPinAppWidgetSupported` først; ellers vis stegene.
- **iOS:** «Slik legger du til» → ark med 3 steg (hold inne → + → søk «Homelab» → velg størrelse → Legg til widget). Låseskjerm: Tilpass → Låseskjerm → feltet under klokka.
- «✓ Lagt til»: les `AppWidgetManager.getAppWidgetIds(provider)` (Android) / `WidgetCenter.shared.getCurrentConfigurations` (iOS) ved åpning, så status stemmer.

## 3. Data til alle widgets
Appen skriver JSON per widget til App Group / DataStore ved oppstart og når data endres, og ber om ny tidslinje (`WidgetCenter.reloadTimelines(ofKind:)` / `GlanceAppWidget.update`). Push fra webhooks (Media, Sporing) → oppdater med en gang.

## Test
- iOS: alle 11 vises i widgetgalleriet under «Homelab» med forhåndsvisning (ikke tomme). Låseskjerm: Media, Avganger, Kalender, Prøveperioder, Glimt.
- Android (Pixel og Samsung): alle vises i galleriet med preview. «Legg til på startskjermen» fra Widgets-siden legger den inn.
