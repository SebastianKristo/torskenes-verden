# Til Claude Code: Samsung One UI-widgets, samme størrelse som Samsungs egne

## Mål (fra skjermbilde av Galaxy-hjemskjerm, 4×5-rutenett)
Samsungs **Vær-widget (2×2)** er referansen for **alle** våre Samsung-widgets:
| | Samsung Vær (fasit) | Vår «Skann» i dag |
|---|---|---|
| Bredde | **≈ 134 dp** (2 kolonner minus ~17 dp marg på hver side) | ≈ 148 dp (for bred, nesten kant til kant) |
| Høyde | **≈ 155 dp** (2 rader) | ≈ 155 dp |
| Forhold B/H | **0,865** | 0,96 |
| Hjørneradius | **≈ 20 dp** (~14 % av bredden) | ≈ 24 dp |
| Innvendig padding | **≈ 12 dp** venstre/bunn | ≈ 12 dp |

(Målt i skjermbildet: Vær 260 × 300 px, Skann 288 × 300 px, skala ≈ 1,94 px/dp.)

## Krav
1. **Lag egne Samsung-varianter** av alle widgets (Skann, Huskeliste, Bursdager, Sporing, Avganger, Finans/Saldo): `AppWidgetProviderInfo` med
```xml
android:targetCellWidth="2" android:targetCellHeight="2"
android:minWidth="134dp" android:minHeight="155dp"
android:maxResizeWidth="134dp" android:maxResizeHeight="155dp"   <!-- låst 2×2 som Samsung -->
android:resizeMode="none" android:widgetCategory="home_screen"
```
   Tilby i tillegg 4×2 (≈ 296 × 155 dp) der det gir mening (Huskeliste, Avganger).
2. **Ikke fyll hele cellen:** bruk `android:padding` / `GlanceModifier.padding` slik at det synlige kortet blir 134 × 155 dp og flukter med Samsungs widgets i samme rad og kolonne. Ytre marg skal være lik Vær-widgeten.
3. **Radius 20 dp** (`system_app_widget_background_radius` på One UI 6+, ellers fast 20 dp). Innvendig padding 12 dp, tekst venstrejustert, innhold forankret nederst som i Vær.
4. **Typografi:** systemfont (SamsungOne). Stort tall 30 sp bold, linje 2 14 sp bold, linje 3 12 sp semibold med 85 % opasitet.
5. **Farger:** følg One UI-tema (`@android:color/system_accent1_*` / Material You) som standard. Valgfritt «Papir»-farger (rød `#b23a2a`, hvit `#ffffff`) i widgetinnstillinger.
6. **Oppdag Samsung:** `Build.MANUFACTURER == "samsung"` → registrer Samsung-providerne (`android:enabled` via `PackageManager.setComponentEnabledSetting`). Andre Android-telefoner beholder dagens Material You-widgets.

## Utseende (fasit: seksjonen «WIDGETS PÅ TELEFONEN»)
- **Bursdager 2×2** (`design/Bursdager.dc.html`): rød flate, gaveikon øverst til høyre i en rund 40 dp-flate, nederst «15 dager», navn og «Fyller 41 · 2. nov».
- **Huskeliste 2×2** (`design/Huskeliste.dc.html`): hvit flate, «Huskeliste · N», tre oppgaver med fargede ringer og pillen «+ Ny oppgave» nederst.
- **Skann 2×2:** som i dag (Kamera / Fra filer-piller), men i riktig størrelse 134 × 155 dp.

## Test
Galaxy S23/S24 (One UI 6/7), rutenett 4×5 og 4×6: legg Samsung Vær 2×2 og våre widgets side om side. Bredde, høyde, radius og avstand til kant skal være like (±2 dp), og widgetene skal ligge på samme rutenettlinjer.
