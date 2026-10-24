# iOS: tilbake-sveip skal alltid virke

Ønske 2026-10-24: «få ordnet back swipe på ios appen, den skal alltid funke» (med henvisning til Apples `interactivePopGestureRecognizer` og `interactiveContentPopGestureRecognizer`).

Merk: `interactiveContentPopGestureRecognizer` (sveip fra hvor som helst i innholdet, ikke bare kanten) kom i **iOS 26** (ikke 19.4/20). På eldre iOS gjelder bare kant-sveipet `interactivePopGestureRecognizer`.

## 1. Finn hvorfor den ikke virker i dag
Sjekk alle disse i koden og noter hvilke som gjelder:
- **Egen side-navigasjon:** appen bytter side med egen tilstand (`page`/`hist`) i stedet for `NavigationStack`/`UINavigationController`. Da finnes ingen systemgest i det hele tatt. Dette er den mest sannsynlige årsaken.
- `.navigationBarBackButtonHidden(true)` eller egen tilbake-knapp. Det slår av gesten (UIKit setter `interactivePopGestureRecognizer.delegate` slik at den avviser).
- `.toolbar(.hidden, for: .navigationBar)` / `navigationBarHidden` med egen header.
- `fullScreenCover`/`sheet` brukt som «side». De kan ikke poppes med sveip.
- `DragGesture`/`.highPriorityGesture` på rot-view, horisontale `ScrollView`/`TabView(.page)`/karuseller eller kart som tar pan-gesten fra venstre kant.
- WKWebView-innhold (web-del av appen): `allowsBackForwardNavigationGestures` er av.

## 2. Fiks
**Navigasjon:** all push-navigasjon (Hjem → modul → underside, Innstillinger → underside, Media → serie, osv.) går gjennom `NavigationStack(path:)` med `navigationDestination`. Den egne `hist`-stakken mappes 1:1 til `path`. Ark og overlays som er egentlige sider, gjøres om til push.

**Egen header uten å miste gesten:** behold egen «‹ Tilbake»-knapp, men re-aktiver gesten:
```swift
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
  override open func viewDidLoad() {
    super.viewDidLoad()
    interactivePopGestureRecognizer?.delegate = self
    if #available(iOS 26, *) { interactiveContentPopGestureRecognizer?.delegate = self }
  }
  public func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool { viewControllers.count > 1 }
  public func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
    // Tilbake-gesten vinner over horisontale scroll/karuseller når den starter fra venstre kant
    g == interactivePopGestureRecognizer
  }
}
```
- `viewControllers.count > 1` stopper gesten på rot-skjermen, så appen ikke fryser.
- Fullbredde-sveip (iOS 26): la den være på, men gi den lavere prioritet enn horisontale kontroller midt på skjermen (kart, karuseller, sveip-for-å-slette, slidere). Kant-sveipet skal alltid vinne.

**Konflikter:** fjern `DragGesture` på rot. Horisontale scroll-flater får `.simultaneousGesture` eller `require(toFail:)` mot `interactivePopGestureRecognizer`. Kart (MapKit): la kant-sveipet slå gjennom på de første ca. 20 pt.

**Ulagret innhold:** der en side har ulagret skjema (ny hendelse, rediger utgift), bruk `.interactiveDismissDisabled`-lignende logikk: avbryt sveipet og vis «Forkast endringer?», ikke bare blokker gesten stille.

**Web-innhold:** `webView.allowsBackForwardNavigationGestures = true`.

**Chat, Kalender, Kart, Vær** (fullskjerm-overlays i dag): skal også kunne lukkes med kant-sveip tilbake til forrige side.

## 3. Test (UI-test + manuelt, iOS 17, 18 og 26)
- Kant-sveip tilbake fra hver underside i Innstillinger, Finans, Media, Boliger, Kalender, Chat og Kart.
- iOS 26: sveip fra midten av innholdet virker på vanlige sider, men ikke når du drar i kart, karusell eller slider.
- Rot-skjermen: sveip gjør ingenting og appen fryser ikke.
- Sveip halvveis og slipp: siden glir tilbake uten feil tilstand.
- iPad og Mac (Catalyst/Designed for iPad): tilbake med sveip på styreflate.
