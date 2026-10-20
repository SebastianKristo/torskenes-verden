# iPhone · Bibel-siden: feil i toppen og mellomrom mellom kort

Ønske 2026-10-20: «feil med toppen og mellomrom» (skjermbilde: `vedlegg/bibel-mellomrom-feil.png`)

## Feil i skjermbildet
1. **Toppen:** rekke-kortet («1 dag på rad») starter oppe i hero-bildet. Det dekker nedre del av hero, og fotokreditten («Skyet · 6° · Free Nature Stock …») ligger klistret mot kanten av kortet. Kortets øvre hjørner ser avkuttet/flate ut.
2. **Mellom kort:** «Dagens vers»-kortet ligger oppå/inntil rekke-kortet uten mellomrom. Det ser ut som et negativt marg eller overlapp.
3. **Bunnen:** leseplan-knappene og den røde skann-knappen (FAB) ligger under tab-baren og dekker «Kopier»-raden.

## Fiks
- **Hero:** innholdet starter **under** hero, ikke oppå. Fjern negativ `margin-top` / `translateY` på første kort. Avstand fra bunnen av hero til første kort: **16 pt**. Fotokreditten ligger inne i hero, 12 pt fra hero-bunnen, høyrejustert, én linje med «…».
- Hvis kortet skal overlappe hero med vilje: maks 24 pt overlapp, flytt fotokreditten opp så den ikke kolliderer, og hold alle fire hjørnene på kortet runde (radius 24).
- **Mellomrom:** en `VStack(spacing: 14)` (eller `gap: 14px` på web) mellom alle kort på siden: rekke → dagens vers → «LESEPLAN» → leseplan-kort → statistikk → lagrede vers → påminnelse. Ingen kort skal ha negativ marg eller `zIndex`-overlapp.
- **Bunn:** `padding-bottom` = tab-bar-høyde + safe area + 16 pt, så siste innhold kan scrolles fritt over tab-baren. FAB-en skal ikke dekke knapperader. Legg ekstra luft under knappene eller flytt FAB-en over tab-baren med 12 pt avstand.
- Fasit for rekkefølge og avstander: `Bibelvers.dc.html` (`isPage`-visningen bruker `gap:14px`).

## Oppdatering 2026-10-20 (2): «det skulle ikke være noe nav bar eller scan i bibel side»
Skjermbilde: `vedlegg/bibel-navbar-scan.png` – fanelinjen og den røde Skann-knappen vises fortsatt på Bibel.
- Fasit i designet nå: `Mobil Papir App.dc.html` → `navVis` er `hidden`, og `fab.on`/`fab.inD` er av når `page === 'bibel'`. Bunnpadding blir som i Innstillinger (`safe area + 28 px`).
- I appen: samme regel som for Innstillinger/Kalender/Nordlys. Bruk én liste `HIDE_CHROME = ['innst','kalender','nordlys','chat','huske','bibel']` som styrer både fanelinje og Skann-knapp, så de ikke kan komme ut av sync.
- iOS: `.toolbar(.hidden, for: .tabBar)` + skjul FAB-overlay. Android: skjul `NavigationBar` og `FloatingActionButton` når ruten er `bibel`.

## Oppdatering 2026-10-20: «fjern scan og navbar fra bibel side»
- Bibel-siden viser **ikke** tab-baren (Finans / Mat / Sporing / Søk / Mer) og **ikke** den røde skann-knappen (FAB).
- SwiftUI: `.toolbar(.hidden, for: .tabBar)` på Bibel-siden, og skjul FAB-en når ruten er Bibel. Web: skjul bunnmeny og FAB når `route === 'bibel'`.
- Tilbake skjer med «‹ Mer» oppe til venstre og sveip fra venstre kant.
- `padding-bottom` blir da bare safe area + 24 pt. Punktet om FAB og tab-bar under «Bunn» over gjelder ikke lenger.

## Test
iPhone 15/16 (393 pt bredde) og iPhone SE: hero, fotokreditt og første kort overlapper ikke. Det er 14 pt mellom alle kort. Scroll til bunnen: alt innhold kan nås over tab-baren og FAB-en.
