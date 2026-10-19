# Widgets vises ikke på iPhone eller Android (Prøveperioder + Kalender)

Problem: Prøveperiode-widgetene (og de nye Kalender-widgetene) dukker ikke opp i widgetgalleriet på iOS eller Android.
Design: `Prøveperiode Widgets.dc.html` (se `claude-code-proveperiode-widgets.md`) og `Kalender App.dc.html` `mode="home"|"lock"` (se `claude-code-kalender-app.md`). Begge vises i `Kalender App Oversikt.dc.html`.

## 0. Avklar først
- **PWA / hjemskjerm-snarvei fra Safari/Chrome kan ikke ha widgets.** Widgets krever en native app med widget-utvidelse (iOS) eller AppWidgetProvider (Android). Er appen en ren PWA, må den pakkes inn med Capacitor (anbefalt, gjenbruker web-koden) og få native widget-mål. Det samme gjelder Kalender-appen.
- Er appen allerede native/Capacitor: gå gjennom sjekklistene under.

## 1. iOS (WidgetKit)
1. Xcode → File → New → Target → **Widget Extension**: `PapirWidgets` (Include Live Activity: nei). Deployment target ≥ iOS 17 (interaktive knapper).
2. **Én `@main WidgetBundle`** som lister ALLE widgets:
```swift
@main struct PapirWidgets: WidgetBundle {
  var body: some Widget { TrialWidget(); TrialLockWidget(); CalendarWidget(); CalendarLockWidget() }
}
```
   Vanlig feil: widgeten er laget, men ikke lagt til i bundlen. Da vises den aldri.
3. Hver widget: unik `kind`, `.configurationDisplayName("Prøveperioder")`, `.description(...)`, `.supportedFamilies([.systemSmall,.systemMedium,.accessoryCircular,.accessoryRectangular,.accessoryInline])`, `.contentMarginsDisabled()` og `.containerBackground(for: .widget){ Color("Papir") }` (uten containerBackground vises widgeten som tom/feilmelding på iOS 17+).
4. **App Group** på BÅDE app og widget: `group.no.kristo.papir`. Appen skriver `trials.json` / `calendar.json` til `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)` (eller `UserDefaults(suiteName:)`). Widgeten leser derfra. Uten App Group får widgeten ingen data, og `placeholder` vises for alltid.
5. Capacitor: lag en liten plugin `WidgetBridge.save(key, json)` som skriver til App Group og kaller `WidgetCenter.shared.reloadAllTimelines()`. Kall den når prøver eller hendelser endres og ved oppstart.
6. Signering: samme Team. Widget-target har egen bundle id `no.kristo.papir.widgets` med prefiks fra appen. Embed i appen (Build Phases → Embed Foundation Extensions).
7. `TimelineProvider`: `placeholder`, `getSnapshot` (brukes i galleriet, må returnere raskt med eksempeldata) og `getTimeline` med `.after(nextMidnight)` / neste hendelsesstart.
8. Test: slett appen → Product → Clean Build Folder → kjør på enhet → hold inne på Hjem → **+** → søk «Papir»/«Kalender». Kjør widget-skjemaet i Xcode for å se feil i konsollen.
9. Interaktive knapper (✓ Avsluttet): `Button(intent: MarkTrialDoneIntent(id:))`, AppIntent i en fil som er med i begge targets.

## 2. Android (Jetpack Glance)
1. Modul/avhengighet: `androidx.glance:glance-appwidget:1.1+` og `glance-material3`.
2. **Receiver i AndroidManifest** (vanligste feilen er at den mangler eller har `exported=false`):
```xml
<receiver android:name=".widgets.TrialWidgetReceiver" android:exported="true" android:label="Prøveperioder">
  <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE"/></intent-filter>
  <meta-data android:name="android.appwidget.provider" android:resource="@xml/trial_widget_info"/>
</receiver>
```
   Egen receiver for `CalendarWidgetReceiver` (+ `calendar_widget_info`).
3. `res/xml/trial_widget_info.xml`: `minWidth/minHeight`, `targetCellWidth="2" targetCellHeight="2"`, `resizeMode="horizontal|vertical"`, `widgetCategory="home_screen|keyguard"`, `previewLayout` / `previewImage` og `description`. Mangler den eller `initialLayout`, filtrerer noen launchere (Samsung One UI) bort widgeten.
4. `class TrialWidget : GlanceAppWidget()` med `SizeMode.Responsive(setOf(2x2, 4x2))` og `GlanceTheme` (dynamiske farger). Data via `DataStore` / `SharedPreferences` som appen skriver til. Capacitor-plugin `WidgetBridge.save()` → `TrialWidget().updateAll(context)`.
5. Oppdatering: `updatePeriodMillis` er min. 30 min. Bruk i tillegg `WorkManager` ved midnatt og `updateAll` når data endres.
6. **Samsung:** widgetgalleriet viser bare apper med minst én gyldig provider. Etter installasjon kan det kreve omstart av One UI Home (Innstillinger → Apper → One UI Home → Tving avslutning). Støtt gjennomsiktighet (`android:widgetFeatures="reconfigurable|configuration_optional"`).
7. Test: `adb shell dumpsys appwidget | grep -i papir` skal liste providerne. Hold inne på Hjem → Widgets → «Papir» / «Kalender».

## 3. Felles
- Begge plattformer: widgeten skal vise **eksempeldata i galleriet** (Viaplay 2 dager · Storytel 9 · HBO Max 23) og ekte data etter oppsett.
- Tom tilstand: «Ingen aktive prøver · + Legg til».
- Trykk / deep link: `papir://abonnement/prove/{id}`, `kalender://dag/2026-10-21`, `kalender://hendelse/{id}`.
- Kalender-appen er en egen app: egne widget-mål, men samme App Group / samme backend, så Homelab og Kalender deler data.
- Legg inn en «Widgets»-rad i Innstillinger → «Slik legger du til widget» med korte steg per plattform (iOS / Samsung / Android).

## Akseptkriterier
- [ ] iPhone: «Prøveperioder» (liten, medium, låseskjerm sirkulær og rektangulær) og «Kalender» (liten, medium, stor, låseskjerm) finnes i galleriet.
- [ ] Android og Samsung: «Prøveperioder» (2×2, 4×2) og «Kalender» (2×2, 4×3) finnes i galleriet.
- [ ] Endring i appen vises i widgeten innen 5 sekunder.
- [ ] «✓ Avsluttet» i widgeten markerer prøven som ferdig uten å åpne appen.
