# «Varsle om nye versjoner» under Varsler + nytt standard app-ikon

Ønske 2026-10-20: «den kan ligge under varsler. og bruk dette som standard ikon når man laster ned appen» (skjermbilder: `vedlegg/varsle-nye-versjoner.png`, `vedlegg/app-ikon-standard.png`)

## 1. Flytt bryteren
- **Fjern** «Varsle om nye versjoner» fra PROGRAMVARE i Innstillinger. Der står nå bare Nordlys OS-raden og «Automatiske oppdateringer».
- **Legg den** i Innstillinger → Varsler og haptikk → VARSLER, etter «Vis svaret i appen også»:
  - **Varsle om nye versjoner** · «Nordlys OS · banner på Hjem og push» · På (standard)
- Samme nøkkel som før (`upd_note`), så verdien beholdes.
- Fasit: `Mobil Papir App.dc.html` → `varslerGroups()`.

## 2. Standard app-ikon = «Papir-monogram» (H· på rødt med brettet hjørne)
- Ny standard i `icGet()`: `k:'b'` (før `a` «Huset med stativ»). Brukere som har valgt et ikon selv, beholder det.
- Ikonet:
  - rød `#b23a2a` bakgrunn
  - serif «H» i `#f3efe6` (første bokstav i appnavnet)
  - liten prikk oppe til høyre
  - brettet hjørne nede til høyre: lys trekant 16 % hvit + mørk trekant `#8e2b1e`
- **Ferdige filer** (`vedlegg/`):
  - `app-icon-1024.png` (App Store / Play-oppføring)
  - `app-icon-512.png` og `app-icon-192.png` (PWA-manifest, `purpose: "any"`)
  - `app-icon-maskable-512.png` (Android adaptivt, innhold i 80 % trygg sone, `purpose: "maskable"`)
  - `app-icon-180.png` (`apple-touch-icon`)
- **Bruk dem som standard:**
  - **PWA/web:** `manifest.webmanifest` → `icons` med filene over. `<link rel="apple-touch-icon" href="/icons/app-icon-180.png">`. `theme_color: "#b23a2a"`, `background_color: "#f3efe6"`.
  - **iOS:** `AppIcon` i Assets = 1024-versjonen. Alternative ikoner (Huset, Fire rom, mørk/tonet) via `setAlternateIconName`.
  - **Android:** adaptivt ikon:
    - forgrunn = H + prikk + brett (fra maskable)
    - bakgrunn = `#b23a2a`
    - monokrom = H-silhuett (Android 13 temaikoner)
  - Splash-skjerm: samme ikon sentrert på `#f3efe6`.
- Appnavnet styrer bokstaven. Bytter brukeren navn, genereres ikonet på nytt (web-favicon gjør det allerede i `icFav()`). Native-ikonet er låst til «H» frem til neste build, med mindre det er valgt som alternativt ikon.
