import SwiftUI
import UIKit
import MapKit

/* ---------------- Prompt 50: tilbake-sveip skal alltid virke (claude-code-ios-tilbake-sveip.md) ----------------
 Årsakene er skrevet ned i docs/ios-tilbake-sveip-50.md. Kort:
 – Appen har ingen UINavigationController (tilstandsbasert ruter), så systemgesten finnes ikke. Kantsveipet er appens egen
   UIScreenEdgePanGestureRecognizer på vinduet (Nav23Swipe.swift). Den var bare slått på for en håndplukket liste med sider
   (paperCanSwipeBack), så mange sider med synlig «‹ …»-knapp (Finans, Mat, Familie, Domener, Innstillinger fra Mer,
   Avganger …) kunne ikke sveipes tilbake. Nå: sveipet virker på alle sider som har en tilbakeknapp (nav50CanSwipe).
 – Fullskjerm-sidene (Media, Studie, Nyheter-artikkel, Vær, System, AI-kontroll, Logger …) brukte en SwiftUI-DragGesture
   (EdgeSwipeClose30) som tapte mot ScrollView, vannrette fanerader og lister. Nå: samme UIKit-kantgest som hovedsiden,
   lagt på fullskjermens egen rotvisning (ikke på en scroll-flate), og den vinner over pan-gester som starter i kanten.
 – Kantgesten krevde bare at kart og vannrette scroll-flater ventet. Sveip-handlinger i lister, egne pan-gester og
   SwiftUI-drag kunne ta sveipet fra kanten. Nå venter alle pan-/drag-gester på kantgesten (Nav50Edge.waits). */

extension Store {
    /// Kantsveipet er på når siden har en tilbakeknapp: undersidene fra før (paperCanSwipeBack), fullskjerm-sidene
    /// Avganger, Kalender og Chat, og alle andre sider der toppbildet viser «‹ …». Aldri på Hjem (roten).
    var nav50CanSwipe: Bool {
        if paperCanSwipeBack { return true }
        if ruter24Full || full27 { return true }
        if paperTab == "hjem" || paperTab.isEmpty { return false }
        if prof24IsRoot { return false }
        let wide: Bool = Layout45.shared.wide
        // Samme regel som pila i toppbildet (PaperHero.topRow): ingen pil, ingen sveip.
        if wide && prof24UpLabel == "Hjem" { return false }
        if nav42HideUp(wide: wide) { return false }
        return true
    }

    /// Det kantsveipet gjør: lukker det som er åpent på siden (paperBack), ellers samme som pila øverst (paperUp).
    func nav50SwipeBack() {
        if paperCanSwipeBack { paperBack() } else { paperUp() }
    }
}

/* ---------- Felles regel: hvilke gester venter på kantgesten ---------- */

enum Nav50Edge {
    /// Kantgesten vinner over pan-gester som starter i kanten: scroll-flater, kart, karuseller, sveip-handlinger i lister,
    /// egne UIPanGestureRecognizer (f.eks. HPan42) og SwiftUI-drag. Andre kantgester (vår egen) venter ikke.
    @MainActor static func waits(_ other: UIGestureRecognizer) -> Bool {
        if other is UIScreenEdgePanGestureRecognizer { return false }
        if other is UIPanGestureRecognizer { return true }
        let name: String = String(describing: type(of: other))
        if name.contains("Pan") || name.contains("Drag") { return true }
        var v: UIView? = other.view
        var depth: Int = 0
        while let cur = v, depth < 12 {
            if cur is MKMapView { return true }
            if let s = cur as? UIScrollView, s.contentSize.width > s.bounds.width + 1 { return true }
            v = cur.superview
            depth += 1
        }
        return false
    }

    /// Terskel som fasiten (swInit): min(110 pt, 28 % av bredden), eller et raskt sveip.
    nonisolated static func shouldClose(_ t: CGFloat, _ v: CGFloat, _ w: CGFloat) -> Bool {
        t > Swift.min(110, w * 0.28) || (v > 500 && t > 10)
    }
}

/* ---------- Fullskjerm (fullScreenCover): kantsveip lukker siden ---------- */

/// Erstatter SwiftUI-draget i EdgeSwipeClose30. Siden følger fingeren og lukkes etter terskelen (260 ms, lett haptikk).
struct EdgeClose50: ViewModifier {
    let enabled: Bool
    let close: () -> Void
    @State private var dx: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .offset(x: dx)
            .shadow(color: Color.black.opacity(dx > 0 ? 0.25 : 0), radius: 16, x: -6, y: 0)
            .background(EdgeClose50Installer(enabled: enabled, onChange: changed, onEnd: ended).frame(width: 0, height: 0))
    }

    private func changed(_ t: CGFloat) {
        dx = Swift.max(0, t)
    }

    private func ended(_ t: CGFloat, _ v: CGFloat, _ w: CGFloat) {
        if Nav50Edge.shouldClose(t, v, w) {
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.26)) { dx = w }
            Haptic30.light()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
                close()
                var tr: Transaction = Transaction()
                tr.disablesAnimations = true
                withTransaction(tr) { dx = 0 }
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { dx = 0 }
        }
    }
}

/// Legger kantgesten på rotvisningen til kontrolleren som viser fullskjermen (ikke på en scroll-flate).
private struct EdgeClose50Installer: UIViewRepresentable {
    let enabled: Bool
    let onChange: (CGFloat) -> Void
    let onEnd: (CGFloat, CGFloat, CGFloat) -> Void

    func makeCoordinator() -> EdgeClose50Coordinator { EdgeClose50Coordinator() }

    func makeUIView(context: Context) -> EdgeClose50Host {
        let v: EdgeClose50Host = EdgeClose50Host()
        v.coordinator = context.coordinator
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ v: EdgeClose50Host, context: Context) {
        context.coordinator.enabled = enabled
        context.coordinator.onChange = onChange
        context.coordinator.onEnd = onEnd
    }

    static func dismantleUIView(_ v: EdgeClose50Host, coordinator: EdgeClose50Coordinator) { coordinator.detach() }
}

final class EdgeClose50Host: UIView {
    weak var coordinator: EdgeClose50Coordinator?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { coordinator?.detach(); return }
        // Kontrolleren er først koblet på etter denne runden.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window != nil else { return }
            self.coordinator?.attach(from: self)
        }
    }
}

@MainActor
final class EdgeClose50Coordinator: NSObject, UIGestureRecognizerDelegate {
    var enabled: Bool = true
    var onChange: ((CGFloat) -> Void)?
    var onEnd: ((CGFloat, CGFloat, CGFloat) -> Void)?
    private var pan: UIScreenEdgePanGestureRecognizer?
    private weak var owner: UIViewController?

    /// Kontrolleren øverst i kjeden fra visningen (den som er presentert som fullskjerm).
    private static func controller(of v: UIView) -> UIViewController? {
        var r: UIResponder? = v
        while let x = r {
            if let vc = x as? UIViewController {
                var top: UIViewController = vc
                while let p = top.parent { top = p }
                return top
            }
            r = x.next
        }
        return nil
    }

    func attach(from v: UIView) {
        guard let vc = EdgeClose50Coordinator.controller(of: v), let root = vc.view else { return }
        if owner === vc, pan != nil { return }
        detach()
        let g: UIScreenEdgePanGestureRecognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handle(_:)))
        g.edges = .left
        g.delegate = self
        g.cancelsTouchesInView = true
        root.addGestureRecognizer(g)
        pan = g
        owner = vc
    }

    func detach() {
        if let g = pan { g.view?.removeGestureRecognizer(g) }
        pan = nil
        owner = nil
    }

    /// Ikke når et ark eller en ny fullskjerm ligger over denne, og ikke når bevegelsen er mer loddrett enn vannrett.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard enabled else { return false }
        if owner?.presentedViewController != nil { return false }
        if let p = g as? UIPanGestureRecognizer {
            let v: CGPoint = p.velocity(in: p.view)
            if abs(v.y) > abs(v.x) { return false }
        }
        return true
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        Nav50Edge.waits(other)
    }

    @objc private func handle(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let v = g.view else { return }
        let w: CGFloat = v.bounds.width
        let t: CGFloat = g.translation(in: v).x
        switch g.state {
        case .began, .changed: onChange?(t)
        case .ended: onEnd?(t, g.velocity(in: v).x, w)
        case .cancelled, .failed: onEnd?(0, 0, w)
        default: break
        }
    }
}
