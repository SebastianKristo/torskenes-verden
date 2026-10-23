# Vær: modusvelger (Temperatur / Nedbør / Vind) med Liquid Glass og dra-sveip

Skjermbilde: `uploads/Screenshot 2026-10-23 at 13.40.24.png`
Fasit: `Vaer.dc.html` → `seg` og `modes` (velgeren ved «Forhold ›» over timeprognosen, både mobil og bred visning).

## Oppførsel
- Den valgte markøren er én «glassdråpe» som ligger bak ikonene. Den glir mellom valgene i stedet for at bakgrunnen hopper.
- **Trykk** på et ikon: dråpen glir dit med fjær (ca. 420 ms, liten overshoot).
- **Dra/sveip** på velgeren: dråpen følger fingeren 1:1. Mens man drar, strekkes den litt i bredden og klemmes i høyden etter fart (liquid-effekt), og ikonet under fingeren forstørres 12 %. Haptisk tikk hver gang den passerer et nytt valg. Når man slipper, smetter den til nærmeste valg og modus byttes.
- Ingen klikk utløses etter et drag.

## Utseende (Liquid Glass)
- Spor: `rgba(0,0,0,.18)`, helt rund, 3 pt innvendig marg.
- Dråpe: lys gradient (34 % → 16 % hvit), bakgrunnsuskarphet 8 pt + metning 180 %, innvendig høylys øverst, tynn lys kant og myk skygge.
- iOS 26: bruk systemets `.glassEffect(.regular.interactive())` på markøren og `GlassEffectContainer` + `matchedGeometryEffect` for overgangen. Eldre iOS: `.ultraThinMaterial` + høylys. Android: `Modifier.graphicsLayer` med `RenderEffect`-blur (API 31+), ellers halvgjennomsiktig hvit.
- Fjær: iOS `spring(response: 0.38, dampingFraction: 0.72)`, Android `spring(dampingRatio = 0.7, stiffness = 500)`.
- «Reduser bevegelse»: ingen strekk/forstørring, kort glid (150 ms).
- Gjelder iOS, Android/Fold, iPad, web og Mac.
