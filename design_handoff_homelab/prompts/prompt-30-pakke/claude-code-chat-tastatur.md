# Chat: skriveboksen skal ligge over tastaturet (iOS)

Fasit: `Mobil Papir App.dc.html` → Chat → `kbInit()`.
Vedlegg: tastaturet dekker skriveboksen helt, bare meldingene vises.

## Årsak
iOS Safari/WKWebView krymper ikke layout-viewporten når tastaturet åpnes. Elementer med `position: fixed; bottom: 0` eller en flex-kolonne med `height: 100vh` havner bak tastaturet.

## Løsning
1. Lytt på `window.visualViewport` (`resize` + `scroll`). Tastaturhøyde = `innerHeight − visualViewport.height − visualViewport.offsetTop`.
2. Når den er > 40 px: gi composer-containeren `padding-bottom: tastatur + 8px` (animert 250 ms). Meldingslisten krymper tilsvarende (flex:1), og composeren sitter rett over tastaturet. Ingen safe-area-padding mens tastaturet er oppe.
3. `window.scrollTo(0,0)` når tastaturet åpnes, så iOS ikke skyver hele siden opp. Scroll meldingene til bunnen.
4. Skjul bunnmenyen (tab-baren) mens tastaturet er oppe.
5. Bruk `height: 100dvh` (ikke `100vh`) på app-roten. Sett `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">` (Android/Chrome krymper da selv).
6. Skriftstørrelse i textarea ≥ 16 px (ellers zoomer iOS).

### Native
- SwiftUI: la composeren ligge i `.safeAreaInset(edge: .bottom)`. Ikke bruk `.ignoresSafeArea(.keyboard)` på chat-skjermen.
- Capacitor: `Keyboard.setResizeMode({mode: 'native'})`, eller bruk `keyboardWillShow` med `info.keyboardHeight` til samme padding.

Trykk i meldingslisten lukker tastaturet (som før).
