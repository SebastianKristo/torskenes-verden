# App-ikon · Homelab

Merket er et tak over tre stigende søyler: hjemmet, serveren og økonomien. Se `design/App-ikon.dc.html` for alle varianter.

## iOS 18+ / iOS 26 (Tilpass, Mørk, Tonet og Klar)
- Bygg ikonet i **Icon Composer** (`AppIcon.icon`) med lagene: bakgrunn (oransje gradient #FF9A5C → #EE5A1E) og glyph (tak + 3 søyler).
  - **Standard:** `ios-light.svg`.
  - **Mørk:** `ios-dark.svg`, mørk bakgrunn og oransje glyph.
  - **Tonet:** `ios-tinted.svg`, gråtone på svart. Systemet farger den. Søylene er litt mørkere enn taket, så formen leses også i tonet modus.
  - **Klar (Liquid Glass, iOS 26):** `ios-clear-glyph.svg`, hvit glyph uten bakgrunn. Systemet legger på glass.
- Uten Icon Composer: `Assets.xcassets/AppIcon.appiconset` med én 1024 × 1024 per utseende (`appearances: luminosity = dark / tinted`).
- Glyph-en holder seg innenfor ca. 62 % av flaten, slik at ingenting kuttes av hjørnemasken.

## Android 8+ adaptivt ikon og Material You (13+)
- `ic_launcher.xml` i `res/mipmap-anydpi-v26/`.
- `android-background.svg` → `drawable/ic_launcher_background` (108 × 108 dp).
- `android-foreground.svg` → `drawable/ic_launcher_foreground`. Glyph-en ligger innenfor sikker sone på 66 dp, så den tåler sirkel, squircle, avrundet firkant og dråpe.
- `android-monochrome.svg` → `drawable/ic_launcher_monochrome`. Brukes når «Tematiske ikoner» er på, og systemet farger den med Material You-fargene fra bakgrunnsbildet.
- Konverter SVG til VectorDrawable med Android Studio → *New → Vector Asset*.
- PWA/Capacitor: `manifest.webmanifest` med `icons` (192, 512, `purpose: "maskable"`) og `"purpose": "monochrome"` for den monokrome varianten.
