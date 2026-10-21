import SwiftUI
import UIKit

/* ---------------- Prompt 42: scroll over sveipbare kort på Hjem ---------------- */
// claude-code-bibelvers-scroll-fiks.md: «Dagens bibelvers», briefen og «Min reise» kan sveipes bort mot høyre, men et loddrett
// drag som starter på kortet skal alltid scrolle Hjem. På iOS 18 tar en SwiftUI-DragGesture på et kort inne i en ScrollView
// bevegelsen selv om den er lagt på med simultaneousGesture. Derfor brukes en UIKit-pan på iOS 18+: den starter bare når
// farten er vannrett og mot høyre (|vx| > |vy| × 1,15), og kan gjenkjennes samtidig med ScrollView-pannen.
// iOS 17: DragGesture med retningslås som før (der slipper scrollen gjennom).

extension View {
    /// Vannrett sveip: `changed` får forflytningen, `ended` farten (pt/s) når fingeren slippes eller gesten avbrytes.
    @ViewBuilder func hSwipe42<G: Gesture>(_ fallback: G, changed: @escaping (CGSize) -> Void, ended: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.gesture(HPan42(changed: changed, ended: ended))
        } else {
            self.simultaneousGesture(fallback)
        }
    }
}

@available(iOS 18.0, *)
struct HPan42: UIGestureRecognizerRepresentable {
    let changed: (CGSize) -> Void
    let ended: (CGFloat) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> HPan42Delegate { HPan42Delegate() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let g: UIPanGestureRecognizer = UIPanGestureRecognizer()
        g.delegate = context.coordinator
        g.maximumNumberOfTouches = 1
        g.cancelsTouchesInView = false
        return g
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let t: CGPoint = recognizer.translation(in: recognizer.view)
        switch recognizer.state {
        case .began, .changed:
            changed(CGSize(width: t.x, height: t.y))
        case .ended, .cancelled, .failed:
            ended(recognizer.velocity(in: recognizer.view).x)
        default:
            break
        }
    }
}

/// Starter bare ved vannrett drag mot høyre; loddrett drag går videre til ScrollView.
final class HPan42Delegate: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard let p = g as? UIPanGestureRecognizer else { return true }
        let v: CGPoint = p.velocity(in: p.view)
        return v.x > 0 && abs(v.x) > abs(v.y) * 1.15
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        other.view is UIScrollView
    }
}
