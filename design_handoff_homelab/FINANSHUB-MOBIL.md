# FinansHub mobilapper – omfang

- iOS-appen (Liquid Glass) og Android-appen (Material 3 Expressive, med støtte for brettbare telefoner) er **kun FinansHub-klienter**.
- De henter data bare fra FinansHub-backend (`/finans/api/*`, se FinansHub README – API-oversikt). Ingen kall til resten av homelab-siden (dashboard, Ruter, vær, HA, Sonarr/Radarr, studie, satellitter).
- Egen innlogging/token med scope begrenset til finans (f.eks. `finance:read`, `receipts:write`).
- Skjermer: Hjem, Transaksjoner, Budsjett, Skann/Bekreft kvittering, Meg (innstillinger fra FinansHub → Innstillinger).
- Design: `design/FinansHub Mobil.dc.html` (1a iOS, 1b Android, 1c brettbar). Desktop: `design/FinansHub v2.dc.html`.
- Brettbar: bytt til to-panel + navigasjonsrail ved ≥ 600 dp (WindowSizeClass), bruk Jetpack WindowManager for hengselposisjon.
