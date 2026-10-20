# Slett gamle design: FinansHub v2 (mørk/oransje), Liquid Glass og Material You

Ønske 2026-10-20: «fjern dette designet fra finans slett det gamle desinget her. samme med liqud glass og material you design i mobil appene.» (vedlegg `uploads/Screenshot 2026-10-20 at 20.45.06.png`: kortet «Nåværende (FinansHub v2) · Dagens mørke design med oransje aksent»).
Fasit: `FinansHub v3 Temaer.dc.html` (`themeCards` uten v2-kortet), `Mobil Papir App.dc.html` (Innstillinger → Tema og onboarding uten «Klassisk»), `Homelab Papir Web.dc.html` (profilmenyen uten «Bytt til nåværende tema»).

## Finans (web)
- Fjern kortet **«Nåværende (FinansHub v2)»** fra Innstillinger → Utseende. Bare Papir-temaene står igjen.
- **Slett koden** for det gamle mørke/oransje FinansHub v2-designet: komponenter, stiler, ruter og `fh_design = 'v2'`-grenen. Ikke bare skjul det.
- Migrering: står `fh_design` (lokalt eller i profilen) på `v2`, sett den til standard Papir-tema ved neste innlasting.

## Mobilappene (iOS og Android)
- Fjern **«Klassisk (Liquid Glass / Material You)»** fra Innstillinger → Tema og fra temavalget i onboarding. Bare **Papir · lys** og **Papir · mørk** (+ System) står igjen.
- **Slett** det gamle klassiske designet: Liquid Glass-skjermene på iOS (gamle SwiftUI-views med `.glassEffect`/materials for hele appen) og Material You-skjermene på Android (gamle Compose-skjermer med dynamiske farger for hele appen), med ruter, feature-flagg og `papir_mode = 'Klassisk'` / `onExit`-byttet.
- Migrering: brukere som står på Klassisk, flyttes til Papir · lys (eller mørk hvis systemet er mørkt). Ingen dialog.
- **Ikke** fjern plattformens egne ting som fortsatt brukes: iOS-widgets/WidgetKit, Android-widgets (Glance, dynamiske farger der de allerede er i Papir-widgetene), app-ikon-varianter (Mørk/Tonet på iOS, Material You-ikon på Android), og systemets tab-bar-materiale.

## Homelab web
- Fjern «Bytt til nåværende tema» fra profilmenyen.

## Opprydding
- Fjern ubrukte assets, fonter og oversettelser som bare ble brukt av de gamle designene.
- Test at appene starter rett i Papir, også for brukere som hadde valgt det gamle designet, og at ingen skjerm peker til en slettet rute.
