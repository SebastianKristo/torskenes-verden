# Nyheter: haptisk feedback på tilbake-knappen

## Ønske
Når man er inne i en nyhetssak og trykker tilbake-knappen, skal det gis haptisk feedback, likt resten av systemet.

## Krav
- iOS: `UIImpactFeedbackGenerator(style: .light)` (SwiftUI: `.sensoryFeedback(.impact(weight: .light), trigger:)`). Kall `prepare()` når saken åpnes.
- Android: `performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)` (Compose: `LocalHapticFeedback.current.performHapticFeedback(HapticFeedbackType.TextHandleMove)` / `CONFIRM` på API 30+).
- Haptikken skal gis ved trykk på knappen, ikke etter at navigasjonen er ferdig.
- Gjelder også sveip-tilbake (iOS edge swipe / Android predictive back) når gesten fullføres. Ingen haptikk hvis gesten avbrytes.
- Bruk den felles haptikk-hjelperen i appen hvis den finnes (samme som andre tilbake-knapper), ikke en egen implementasjon.
- Respekter systeminnstillingen for haptikk av/på. Ingen haptikk på web/Mac.
- Gjelder på mobil, iPad og Fold.
