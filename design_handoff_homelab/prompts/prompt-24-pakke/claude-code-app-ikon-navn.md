# Til Claude Code: Bytte app-ikon og app-navn på Android (og iOS)

Fasit: `design/Mobil Papir App.dc.html` → Innstillinger → gruppen med appnavnet («HOMELAB»):
- **Navn på appen** → «Endre ›»: tekstfelt (maks 20 tegn), forhåndsvisning av ikon og navn slik det ser ut på hjemskjermen, Lagre og Tilbakestill. Navnet brukes også i toppen på Hjem.
- **App-ikon** → «Endre ›»: plattform (iOS / Android), variant (Lys / Mørk / Tonet), og ikonene Papir (kvittering) og Bokstav. Valgt ikon har kant.

Feil i dag: på Android skjer det ingenting når du velger nytt ikon, og navnet kan ikke endres.

## Android: ikon og navn via `activity-alias`
Android kan ikke bytte ikon eller navn under kjøring. Det må gjøres med på forhånd definerte aliaser som slås av og på.

1. I `AndroidManifest.xml`: hovedaktiviteten **uten** `LAUNCHER`-intent. Legg inn ett `<activity-alias>` per ikon (og per tema-variant):
```xml
<activity-alias android:name=".Icon_Papir" android:targetActivity=".MainActivity"
    android:icon="@mipmap/ic_papir" android:roundIcon="@mipmap/ic_papir_round"
    android:label="@string/app_name" android:enabled="true" android:exported="true">
  <intent-filter><action android:name="android.intent.action.MAIN"/>
    <category android:name="android.intent.category.LAUNCHER"/></intent-filter>
</activity-alias>
<activity-alias android:name=".Icon_Bokstav" … android:enabled="false"> … </activity-alias>
```
2. Bytt med:
```kotlin
fun setIcon(ctx: Context, alias: String) {
  val pm = ctx.packageManager
  ALL_ALIASES.forEach { a ->
    pm.setComponentEnabledSetting(ComponentName(ctx, "${ctx.packageName}.$a"),
      if (a == alias) COMPONENT_ENABLED_STATE_ENABLED else COMPONENT_ENABLED_STATE_DISABLED,
      PackageManager.DONT_KILL_APP)
  }
}
```
   - Slå på det nye aliaset **før** det gamle slås av, ellers forsvinner appen fra skuffen.
   - Vis «Ikonet byttes. Det kan ta noen sekunder før hjemskjermen oppdateres.» Samsung One UI kan bruke opptil 10 sekunder. Snarveier på hjemskjermen kan bli fjernet, og brukeren må legge dem til på nytt (si fra om det).
3. **Adaptive ikoner** (`mipmap-anydpi-v26/ic_*.xml`): forgrunn og bakgrunn som vektor, pluss `<monochrome>` for tematiske ikoner (Android 13+). Varianten «Tonet» bruker monochrome.
4. **App-navn:** `android:label` per alias. Et helt fritt navn er ikke mulig på Android. Løsning:
   - Ferdige navn som aliaser: «Homelab», «Hjem», «Familie», «Finans», «Papir».
   - Et fritt navn vises **inne i appen** (toppen på Hjem, widgets og varsler). Ved fritt navn vises teksten: «Navnet under ikonet på hjemskjermen kan bare være et av de ferdige navnene på Android.»
   - Alternativ: «Legg til snarvei med eget navn» via `ShortcutManager.requestPinShortcut` (støtter fri etikett og eget ikon).
5. Lagre valget i `user_settings.app_icon` / `app_name` og bruk det på nytt ved oppstart.

## iOS
- Ikon: `UIApplication.shared.setAlternateIconName("Bokstav")`. Ikonene legges i `Assets.xcassets` som alternative app-ikoner (`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`). iOS viser selv en systemmelding.
- Navn: `CFBundleDisplayName` kan ikke endres under kjøring. Fritt navn brukes i appen, og «Legg til på Hjem-skjerm» via Snarveier-appen gir eget navn.

## Test
- Android (Pixel 8, Galaxy S24): bytt Papir → Bokstav → Papir. Ikonet i appskuffen og på hjemskjermen skal byttes innen 10 sekunder, og appen skal ikke forsvinne. Velg navnet «Hjem» og sjekk at etiketten under ikonet endres.
- iOS: bytt ikon og bekreft systemmeldingen.
