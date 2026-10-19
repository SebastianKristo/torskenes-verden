# Søkemotor-menyen: vis riktige logoer

Fasit: `Mobil Papir App.dc.html` → Hjem → trykk på ikonet til venstre i søkefeltet → «SØK MED».
Vedlegg: appen viser rød hake for System-AI og røde SF Symbols «G»/«D» i sirkel i stedet for logoene.

## Riktig
Hver rad: **logo (20–22 px) · navn + undertekst · hake til høyre** når valgt. Haken erstatter aldri logoen.
- **System-AI**: ✦ hvit på `lab`-sirkel (appens egen AI-merke).
- **Google**: den ekte firefargede «G» (rød #EA4335, blå #4285F4, gul #FBBC05, grønn #34A853) på transparent bakgrunn. Ikke en bokstav i sirkel.
- **DuckDuckGo**: den ekte anda (oransje sirkel #DE5833 med hvit/gul and).
- Samme logo vises i selve søkefeltet til venstre (18 px) for valgt motor.

## Implementasjon
- Legg logoene som assets i appen (SVG/PDF i Assets.xcassets / vector drawable): `search-google.svg`, `search-duckduckgo.svg`. Ikke bruk SF Symbols eller `Image(systemName:)`, og ikke farg dem med tint.
- `Image("search-google").renderingMode(.original)` (iOS) så fargene beholdes.
- Undertekster: «Svarer i Chat og legger til timer» / «Åpner google.com» / «Åpner duckduckgo.com».
- Hake: `checkmark` i `lab`-farge, høyrestilt, 16 px.
