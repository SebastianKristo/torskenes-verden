# iOS: felt under fanelinjen (Kalender og andre fullskjermsider)

Vedlegg: Kalender på iPhone. Under den flytende fanelinjen er det en ensfarget stripe (≈ 34 px, høyden på hjemindikatoren). Rutenettet stopper over den, med en tynn kant.

## Årsak
App-roten (og Kalender-laget, `position:absolute; inset:0`) er bare så høy som `100%` / `100vh` av layout-viewporten. I iOS hjemskjerm-app / WKWebView med `viewport-fit=cover` dekker det **ikke** området til hjemindikatoren nederst. Det som vises der, er `body`-bakgrunnen.
I designfilen (Mobil Papir App.dc.html) fyller Kalender-laget hele rammen (målt: scroll-området går helt til bunnen), så feilen ligger i hvordan den ekte appen setter høyden.

## Fiks
1. `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`
2. App-skallet:
   ```css
   html, body { margin:0; height:100%; background: var(--bg); overscroll-behavior: none; }
   #app { position: fixed; inset: 0; /* dekker også safe areas */ overflow: hidden; }
   ```
   (Alternativ: `height: 100lvh`. **Ikke** `100vh` eller `100svh`.)
3. Fullskjermsider (Kalender, Chat, Vær, Nordlys) legges som `position:absolute; inset:0` i `#app`, aldri med `bottom: env(safe-area-inset-bottom)`. Innholdet scroller helt ned til kanten **bak** fanelinjen.
   - Scroll-containeren: `padding-bottom: calc(env(safe-area-inset-bottom) + 80px)`, så siste time kan scrolles fram over fanelinjen.
   - Fanelinjen: `bottom: calc(env(safe-area-inset-bottom) + 8px)`.
4. `body`-bakgrunnen skal være samme farge som siden (`--bg`), så det aldri blir synlig skille ved bounce eller rotasjon.
5. Capacitor/WKWebView: `contentInsetAdjustmentBehavior = .never` og `scrollView.contentInset = .zero`, ellers legger iOS til egen bunninnrykk.

## Test
iPhone med hjemindikator (Face ID), hjemskjerm-app og Safari: Kalender → Dag/Uke → rutenettet og timelinjene går helt ned til skjermkanten bak fanelinjen. Ingen ensfarget stripe under.
