import SwiftUI
import UIKit

/* ---------------- Prompt 42: scroll over sveipbare kort på Hjem ---------------- */
// claude-code-bibelvers-scroll-fiks.md: «Dagens bibelvers», briefen og «Min reise» kan sveipes bort mot høyre, men et loddrett
// drag som starter på kortet skal alltid scrolle Hjem. På iOS 18 tar en SwiftUI-DragGesture på et kort inne i en ScrollView
// bevegelsen selv om den er lagt på med simultaneousGesture. Derfor brukes en UIKit-pan på iOS 18+: den starter bare når
// farten er vannrett og mot høyre (|vx| > |vy| × 1,15), og kan gjenkjennes samtidig med ScrollView-pannen.
// iOS 17: DragGesture med retningslås som før (der slipper scrollen gjennom).
//
// 4.39.1: Hjem kunne ikke scrolles i det hele tatt (trykk virket). Pannen lå før som UIGestureRecognizerRepresentable via
// `.gesture(...)`. SwiftUI legger slike gjenkjennere på den felles vertsvisningen (ikke på kortet) og behandler dem som
// eksklusive gester i SwiftUI-gestgrafen, og vår egen `delegate` overstyrte SwiftUIs. Resultat: én slik pan på et Hjem-kort
// (brief, bibelvers, Min reise) gjaldt hele siden, og ScrollView-pannen fikk aldri starte. Nå legges en vanlig
// UIPanGestureRecognizer direkte på den nærmeste UIScrollView-en via en usynlig hjelpevisning bak kortet, og den tar bare imot
// berøringer som starter innenfor kortet. Ingen SwiftUI-gest, ingen eksklusivitet: loddrett drag går alltid til scrollen.

extension View {
    /// Vannrett sveip: `changed` får forflytningen, `ended` farten (pt/s) når fingeren slippes eller gesten avbrytes.
    @ViewBuilder func hSwipe42<G: Gesture>(_ fallback: G, changed: @escaping (CGSize) -> Void, ended: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self.background(HPan42Host(changed: changed, ended: ended))
        } else {
            self.simultaneousGesture(fallback)
        }
    }
}

/// Usynlig visning bak kortet. Den tar ingen trykk selv; den legger pannen på ScrollView-en den ligger i.
struct HPan42Host: UIViewRepresentable {
    let changed: (CGSize) -> Void
    let ended: (CGFloat) -> Void

    func makeCoordinator() -> HPan42Coordinator { HPan42Coordinator() }

    func makeUIView(context: Context) -> HPan42Anchor {
        let v: HPan42Anchor = HPan42Anchor()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        v.coordinator = context.coordinator
        context.coordinator.anchor = v
        context.coordinator.changed = changed
        context.coordinator.ended = ended
        return v
    }

    func updateUIView(_ v: HPan42Anchor, context: Context) {
        context.coordinator.changed = changed
        context.coordinator.ended = ended
    }

    static func dismantleUIView(_ v: HPan42Anchor, coordinator: HPan42Coordinator) { coordinator.detach() }
}

final class HPan42Anchor: UIView {
    weak var coordinator: HPan42Coordinator?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { coordinator?.attach() } else { coordinator?.detach() }
    }
}

@MainActor
final class HPan42Coordinator: NSObject, UIGestureRecognizerDelegate {
    var changed: ((CGSize) -> Void)?
    var ended: ((CGFloat) -> Void)?
    weak var anchor: UIView?
    private var pan: UIPanGestureRecognizer?

    /// Nærmeste UIScrollView over kortet (Hjem-listen), ellers vinduet.
    private func target() -> UIView? {
        guard let a = anchor else { return nil }
        var v: UIView? = a.superview
        while let cur = v {
            if cur is UIScrollView && !(cur is UITextView) { return cur }
            v = cur.superview
        }
        return a.window
    }

    func attach() {
        guard let t = target() else { return }
        if let g = pan, g.view === t { return }
        detach()
        let g: UIPanGestureRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handle(_:)))
        g.delegate = self
        g.maximumNumberOfTouches = 1
        g.cancelsTouchesInView = false
        t.addGestureRecognizer(g)
        pan = g
    }

    func detach() {
        if let g = pan { g.view?.removeGestureRecognizer(g) }
        pan = nil
    }

    /// Bare berøringer som starter på selve kortet.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let a = anchor, a.window != nil else { return false }
        let pt: CGPoint = touch.location(in: a)
        return a.bounds.contains(pt)
    }

    /// Starter bare ved vannrett drag mot høyre; loddrett drag går videre til ScrollView.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard let p = g as? UIPanGestureRecognizer else { return false }
        let v: CGPoint = p.velocity(in: nil)
        return v.x > 0 && abs(v.x) > abs(v.y) * 1.15
    }

    /// Aldri eksklusiv: scroll, holdet (wiggle) og trykk på kortet virker som før.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    @objc private func handle(_ g: UIPanGestureRecognizer) {
        let t: CGPoint = g.translation(in: nil)
        switch g.state {
        case .began, .changed:
            changed?(CGSize(width: t.x, height: t.y))
        case .ended, .cancelled, .failed:
            ended?(g.velocity(in: nil).x)
        default:
            break
        }
    }
}
