# Til Claude Code: Sveip tilbake på iOS med forhåndsvisning av forrige side

## Symptom
Sveip fra venstre kant på iOS for å gå tilbake: den nåværende siden glir til høyre, men bak den er det **svart** til animasjonen er ferdig og forrige side lastes. Brukeren vil se **forrige side bak**, som i vanlige iOS-apper (skjermopptak \`ScreenRecording_10-18-2026 18-56-54_1.MP4\`).

## Slik skal det oppføre seg (iOS-standard)
1. Fingeren starter innenfor 0–24 pt fra venstre kant og drar mot høyre.
2. **Nåværende side** følger fingeren 1:1, med skygge på venstre kant (\`0 0 24pt rgba(0,0,0,.25)\`).
3. **Forrige side ligger allerede ferdig tegnet bak**, med parallakse: starter forskjøvet −30 % og glir mot 0 i takt med fingeren. Et mørkt slør over den går fra 10 % til 0 % opasitet.
4. Slipp:
   - Mer enn 50 % av bredden, eller fart over 500 pt/s → fullfør tilbake (0,25 s, ease-out).
   - Ellers → sprett tilbake.
5. Toppbildet og fanelinjen nederst flyttes med den siden de tilhører. Fanelinjen bytter ikke før overgangen er fullført.
6. Haptikk (\`.light\`) når terskelen passeres.
7. Virker på alle undersider: Finans → Kvitteringer, Sporing → pakke, Familie, Vær, Innstillinger → underside osv. Ikke på rotsider (Hjem og hovedfanene).
8. Avbryt hvis bevegelsen er mer loddrett enn vannrett (scrolling skal virke). Kart og vannrette karuseller fanger ikke kantsveipet.

## Årsak til svart bakgrunn (typisk)
- Ruteren **bytter ut** innholdet i stedet for å ha en stabel. Forrige side finnes ikke i hierarkiet under animasjonen.
- Eller \`navigationBarHidden(true)\` / egen overgang har slått av \`interactivePopGestureRecognizer\`, og en egen gest er laget som bare flytter én visning over en svart \`window\`-bakgrunn.

## Fiks per stack
**SwiftUI (native):**
- Bruk \`NavigationStack\` med \`path\`. Undersider pushes, så forrige side ligger i stabelen og iOS gir forhåndsvisningen gratis.
- Skjult navigasjonslinje slår av gesten. Slå den på igjen:
\`\`\`swift
extension UINavigationController: UIGestureRecognizerDelegate {
  override open func viewDidLoad() { super.viewDidLoad(); interactivePopGestureRecognizer?.delegate = self }
  public func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool { viewControllers.count > 1 }
}
\`\`\`
- Sett \`.background(Color("bg"))\` på hver side, ikke på \`window\`, så det aldri blir svart.

**Capacitor / WebView (hvis appen er web):**
- Hold de siste 2–3 sidene **montert** i en stabel (\`<Stack>\` med \`position:absolute\`). Skjul ikke-aktive med \`visibility\`, ikke \`display:none\`, så de er ferdig tegnet.
- Egen kantgest: \`pointerdown\` med \`clientX < 24\` → sett \`transform: translateX(dx)\` på toppsiden og \`translateX(-30% + dx*0.3)\` + slør på siden under. \`will-change: transform\`, \`touch-action: pan-y\` på innholdet.
- Slå av WebViews egen \`allowsBackForwardNavigationGestures\`, så de ikke kolliderer, eller bruk den og sørg for at historikken er SPA-ruter med bevart DOM (\`bfcache\`).
- Bakgrunnsfarge \`--bg\` på \`html\`, \`body\` og hver side.

**Android:**
- Predictive Back (Android 14+): \`android:enableOnBackInvokedCallback="true"\` + \`PredictiveBackHandler\` i Compose. Forrige destinasjon vises bak med skalering 0,9 → 1. Samme terskler.

## Test
Åpne Hjem → Finans → Kvitteringer. Sveip sakte fra venstre kant: Finans-siden er synlig bak og glir inn med parallakse, aldri svart. Slipp halvveis → sprett tilbake. Sveip raskt → tilbake til Finans. Gjenta på Vær (animert bakgrunn) og Familie (kart). Kartet skal ikke stjele gesten fra kanten.
