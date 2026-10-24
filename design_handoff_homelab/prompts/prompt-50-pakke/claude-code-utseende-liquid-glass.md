# Utseende: ny profil «Liquid Glass» (med fliser på Hjem)

Fasit: `Mobil Papir App.dc.html` → Innstillinger → Utseende → TEMA, og fargesettet i `_rv0()` (`s.mode==='Glass'`). Stilmal: FinansHub Mobil v2 (iOS 26 Liquid Glass) i det andre prosjektet.

## Valg
TEMA har nå tre rader: Papir · lys, Papir · mørk og **Liquid Glass** («Mørkt glass, fargeskyer og fliser på Hjem»). Valget lagres i `papir_mode = 'Glass'` og slår samtidig på `papir_home_tiles = '1'`.

## Farger i Glass
- bakgrunn `#07070A`, tekst `#fff`, dempet `rgba(255,255,255,.66)`, linjer `rgba(255,255,255,.16)`
- kort `rgba(255,255,255,.09)` + `backdrop-filter: blur(30px) saturate(180%)` + `1px solid rgba(255,255,255,.18)` + `inset 0 1px 0 rgba(255,255,255,.25)`
- aksent/etiketter `#FF8A4C`, positiv `#5fd18b`
- tre fargeskyer bak alt innhold (absolute, pointer-events:none): oransje `#FF7A3D` 300px blur 90 opacity .5, blå `#4D6BFF` 260px blur 90 opacity .42 og brent oransje `#C24E17` 220px blur 80 opacity .38
- fanelinjen er glass med samme blur, og aktiv fane er hvit med mørk tekst

## Fliser (Hjem) styres av CSS-variabler
`--tAv/--tAvI` (Avgang), `--tMat/--tMatI/--tMatL` (Middag), `--tFam/--tFamI/--tFamL` (Familie), `--tBd` (kant) og `--tBf` (blur).
- Lys: som i dag (svart, sand, grønn).
- Mørk: #0f0e0c, oklch(.32 .05 60) og oklch(.31 .04 150) med lys tekst.
- Glass: Avgang `rgba(255,255,255,.07)`, Middag `rgba(255,122,61,.18)` med etikett #FFB08A, Familie `rgba(77,107,255,.18)` med etikett #AFC0FF. Alle har glasskant og blur.
- Finans- og Domener-flisene bruker `--card`, så de blir glass automatisk.

## Native
- iOS 26: bruk ekte `.glassEffect()` / `UIGlassEffect` på kort, fliser og fanelinje når Glass er valgt. Eldre iOS bruker `.ultraThinMaterial`.
- Android: `RenderEffect.createBlurEffect` (API 31+). Eldre enheter får en ren gjennomsiktig flate uten blur.
- Hero-bildet beholdes. Under heroen går bakgrunnen over i #07070A med fargeskyene.
