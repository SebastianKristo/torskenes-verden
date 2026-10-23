# Familie: nye ikoner for Soner og Helse

Fasit: `Mobil Papir App.dc.html` → `TSV` (ved `const tabs=tabDef.map`). Fanelinjen i Familie bruker nå SVG-ikoner for disse to i stedet for tegnene «◌» og «♡».

## Ikoner (24×24, strek 1,8, runde ender, `currentColor`)
- **Soner:** posisjonsnål som står inne i en sone-ring (ellipse under nålen).
  `M12 15s-3.5-3-3.5-6a3.5 3.5 0 0 1 7 0c0 3-3.5 6-3.5 6zM12 9h.01M5.5 14.2C3.9 14.9 3 15.9 3 17c0 2.2 4 4 9 4s9-1.8 9-4c0-1.1-.9-2.1-2.5-2.8`
- **Helse:** hjerte med pulslinje.
  `M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7.5 12.5h2.4l1.3-2.6 1.8 5 1.3-2.4h2.2`

## Bruk
- Fanelinje på mobil, sidemeny på iPad og Fold, og fanelinje-redigereren (Innstillinger → Fanelinje → Familie).
- Samme størrelse (18 pt) og farge som de andre faneikonene. Aktiv/inaktiv farge følger fanen.
- iOS: legg som SF Symbol-lignende egendefinert symbol (`.svg` i Assets, template rendering). Android: `ImageVector`/vector drawable med `tint`.
- Kart og Vel fremme beholder dagens ikoner.
