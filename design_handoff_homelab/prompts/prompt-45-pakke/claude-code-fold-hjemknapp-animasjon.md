# Fold/iPad: jevnere animasjon på den røde Hjem-knappen

Fasit: `Mobil Papir App.dc.html` med `wide`.

Problem: den røde Hjem-knappen øverst i navbaren forsvant brått og tregt når man gikk hjem (f.eks. fra Finans), fordi den ble fjernet samtidig med at hele Hjem-siden ble tegnet.

## Ny oppførsel
- **Ut (trykk på Hjem):** knappen krymper (scale 1 → 0,55) og tones ut (200 ms, `cubic-bezier(.4,0,.2,1)`), mens høyden kollapser, slik at fanene under glir jevnt opp. Lett haptikk ved trykk.
- Sidebyttet starter etter ca. 190 ms, når animasjonen er nesten ferdig, slik at tegningen av Hjem ikke hakker animasjonen.
- **Inn (når man forlater Hjem):** knappen vokser inn (scale 0,6 → 1, opacity 0 → 1, høyde 0 → full) på 320 ms med en lett fjæring (`cubic-bezier(.2,.9,.25,1.15)`).
- Animer bare transform, opacity og høyde. Ingen layout-tunge egenskaper.
- Doble trykk ignoreres mens animasjonen pågår.

## Native
- Android (Compose): `AnimatedVisibility` med `scaleIn/scaleOut + fadeIn/fadeOut + expandVertically/shrinkVertically`. Navigér etter `exit`-animasjonen eller med `LaunchedEffect`-forsinkelse.
- iOS/iPadOS (SwiftUI): `.transition(.scale(scale: 0.55).combined(with: .opacity))` med `.spring(response: 0.32, dampingFraction: 0.78)`.
- Respekter «Reduser bevegelse»: da brukes bare uttoning.
