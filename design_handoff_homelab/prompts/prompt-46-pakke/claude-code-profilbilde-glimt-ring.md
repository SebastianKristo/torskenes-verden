# Profilbilde: fargering i Glimt-fargene

Skjermbilde (referanse for stilen): `uploads/Screenshot 2026-10-23 at 14.05.24.png`
Fasit: `Mobil Papir App.dc.html` → profilknappen øverst til høyre på Hjem (`goSet`, begge hero-varianter).

## Utseende
- Ring: `conic-gradient(from 200deg, #b23a2a, #e8794a, #f2c14e, #3fbf9a, #4f8fd6, #7a5ad6, #b23a2a)` (samme farger som Glimt-ringen).
- Ytre størrelse 40 pt, ringtykkelse 2,5 pt, deretter et tynt mellomrom (1,5 pt i bakgrunnsfarge) og så profilbildet klippet til sirkel.
- Uten bilde: initial på papirbakgrunn inne i samme ring.

## Krav
- Alle lag klippes til sirkel (se `claude-code-profilbilde-firkant-artefakt-ipad-fold.md`), ingen firkantet skygge/blur.
- Samme ring på profilbildet i sidepanelet på iPad/Fold, i Innstillinger-toppen og på web.
- Valgfritt: ringen roterer sakte (12 s/omdreining) mens Glimt jobber (f.eks. henter brief). «Reduser bevegelse»: statisk.
- iOS: `AngularGradient` + `Circle().strokeBorder(…, lineWidth: 2.5)`. Android: `Brush.sweepGradient` i `Modifier.border(2.5.dp, brush, CircleShape)`.
