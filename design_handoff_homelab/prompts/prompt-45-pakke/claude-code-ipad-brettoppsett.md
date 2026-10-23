# iPad (iOS-appen) bruker ikke det nye brettoppsettet: rett det

Skjermbilde av ønsket resultat: `uploads/Screenshot 2026-10-23 at 09.38.59.png`.
Fasit: `Mobil Papir App.dc.html` med `wide` (vises som 1c Android brettbar i `FinansHub Mobil v2.dc.html`). Gjelder **iPad nøyaktig likt som Fold**.

## Feil
Når iOS-appen lastes ned på iPad, vises telefonoppsettet (eller et skalert telefonoppsett). Brettoppsettet er bare koblet til Android/Fold.

## Undersøk først
1. Er iPad aktivert som mål? `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad) i alle targets. Står det bare `1`, kjører appen i iPhone-kompatibilitetsmodus på iPad, og ingen bred layout vises.
2. Finnes `UISupportedInterfaceOrientations~ipad` (alle fire) og `UIRequiresFullScreen = NO` (for Split View/Stage Manager)?
3. Hvor bestemmes `wide`? Det må **ikke** være `Platform == android` eller en Fold-sjekk. Det skal være bredde/size class.

## Regel for brettoppsett (felles for alle plattformer)
- `wide = true` når **tilgjengelig vindusbredde ≥ 700 pt/dp**. iOS: `horizontalSizeClass == .regular`. Android: `WindowWidthSizeClass.Expanded/Medium ≥ 700dp`.
- Vurderes på nytt ved rotasjon, Split View, Slide Over og Stage Manager. Smalt vindu på iPad → telefonoppsett.
- Én felles kilde (`LayoutMode`), brukt av Hjem, Finans, Familie, Kalender, Gjøremål, Media osv. Ingen egne sjekker per skjerm.

## Hva iPad skal vise (som skjermbildet)
- Vertikal navbar til venstre: Hjem (aktiv, lys pille), Finans, Mat, Sporing, Søk, Mer. Rød **skann-knapp** nederst med skann-ikon.
- Venstre panel: Glimt-kort med bakgrunnsbilde, «Homelab» + S-knapp, dato, «God morgen, Sebastian», 7° + værlinje, Morgenbrief-kortet og **søkefeltet nederst (ekte tekstfelt)**.
- Høyre kolonne: fanene **Nå · I dag · Hjemme · Økonomi** + kortene (Oppdatering, Avganger, Huskeliste, Posisjon, Siste nytt).
- Alle Fold-endringer i prompt-45 gjelder også iPad: `claude-code-fold-sok-over-tastatur.md`, `claude-code-fold-skann-i-navbar.md`, `claude-code-fold-hjemknapp-animasjon.md`, `claude-code-fold-wiggle-knapper-navbar.md`, `claude-code-fold-skannikon-og-sokefelt.md`, `claude-code-familie-fold-oppsett.md`.

## SwiftUI
- `@Environment(\.horizontalSizeClass)` på rotnivå → `LayoutMode.wide/compact`, injiseres som environment.
- Wide: `HStack(spacing: 0) { SideRail(); GlimtPanel().frame(width: (w-152)/2); RightColumn() }`, med `safeAreaInset`, så ingenting havner under statuslinjen eller hjem-indikatoren.
- Tastatur: `.ignoresSafeArea(.keyboard)` på kolonnene, og søkefeltet med `keyboardLayoutGuide`, så bare søkefeltet løftes.

## Test
iPad mini, iPad Air 11", iPad Pro 13", stående og liggende, Split View ½ og ⅓, Stage Manager med vinduer i ulike størrelser. Bekreft med skjermbilder at oppsettet matcher skjermbildet over.
