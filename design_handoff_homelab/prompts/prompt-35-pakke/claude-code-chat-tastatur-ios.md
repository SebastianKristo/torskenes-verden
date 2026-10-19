# iOS: skrivefeltet i Chat havner bak tastaturet

Fasit: `Mobil Papir App.dc.html` → `kbInit()` + `kbH` (bunnpadding på Chat). Feilen sees i den ekte appen på iPhone (Safari / hjemskjerm-app).

## Hvorfor
iOS endrer ikke `window.innerHeight` når tastaturet åpnes. Bare `visualViewport.height` krymper, og i tillegg panorerer iOS siden (`visualViewport.offsetTop` / `scrollY` > 0). Med fast app-høyde (100dvh, `overflow: hidden`) og skrivefeltet nederst blir feltet liggende bak tastaturet. Den gamle formelen `innerHeight − vv.height − vv.offsetTop` ga nesten 0 når iOS hadde panorert.

## Fiks
1. **Mål tastaturhøyden mot full høyde fra før tastaturet:** `base` = høyeste `visualViewport.height` / `innerHeight` sett mens ingen input har fokus. `kbH = typing ? base − vv.height : 0` (regnes bare når INPUT/TEXTAREA har fokus).
2. **Nullstill iOS-panoreringen:** når `kbH > 40` og `vv.offsetTop > 0` eller `scrollY > 0`, kjør `window.scrollTo(0, 0)`, så det faste oppsettet ligger der det skal.
3. **Løft skrivefeltet:** Chat-containeren får `padding-bottom: kbH + 8px`, så feltet ligger rett over tastaturet. Meldingslisten scrolles til bunnen.
4. **Mål på nytt flere ganger**, fordi tastaturet animeres: på `visualViewport` `resize` og `scroll`, og på `focusin` (0, 80, 320 og 650 ms) og `focusout` (120 ms).
5. **Meta viewport:** `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` (Android/Chrome endrer da størrelsen selv). Skriftstørrelse i input ≥ 16 px, ellers zoomer iOS inn.
6. **Native innpakning (Capacitor/WKWebView):** `Keyboard.resize = 'none'` + bruk `keyboardWillShow` → `info.keyboardHeight` som `kbH`. Eller `resize: 'body'` og drop JS-målingen. Swift/SwiftUI: `.ignoresSafeArea(.keyboard, edges: [])` er ikke nok i WebView, så bruk `keyboardLayoutGuide`.
7. **Trykk utenfor feltet** lukker tastaturet (`blur()`), og `kbH` går tilbake til 0.

## Test
iPhone, Safari og hjemskjerm-app: åpne Chat → trykk i feltet. Feltet skal ligge rett over tastaturet (også over QuickType og «Write with Siri»), og siste melding skal vises over feltet. Roter skjermen og lukk/åpne igjen.
