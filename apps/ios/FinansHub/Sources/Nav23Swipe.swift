import SwiftUI
import UIKit
import MapKit

/* ---------------- Prompt 23: sveip tilbake med forrige side bak ---------------- */

/// Ruteren i appen er tilstandsbasert (paperTab, module, paperFin …) og har ingen stabel med sider, så forrige side finnes
/// ikke i hierarkiet mens fingeren drar. Før lå det en svart flate bak siden. Nå tas et øyeblikksbilde av siden
/// (snapshotView, uten ny tegning) i det brukeren berører skjermen. Bildet legges i en liten historikk når ruten
/// skifter, og vises bak siden under sveipet med parallakse (−30 % → 0) og slør (10 % → 0). Scrollposisjonen
/// lagres sammen med bildet og settes tilbake når brukeren går tilbake. Siden de gikk tilbake fra glemmes.
struct EdgeSwipeBack: ViewModifier {
    @Environment(Store.self) private var store
    let enabled: Bool
    let action: () -> Void
    @State private var dx: CGFloat = 0
    @State private var width: CGFloat = 390
    @State private var behind: UIView? = nil
    @State private var covering: Bool = false
    @State private var crossed: Bool = false

    func body(content: Content) -> some View {
        let key: String = store.nav23Key
        let prog: CGFloat = Swift.min(1, dx / Swift.max(width, 1))
        return ZStack {
            backdrop.ignoresSafeArea().zIndex(0)
            if let v = behind {
                Nav23SnapshotHost(view: v)
                    .ignoresSafeArea()
                    .overlay { Color.black.opacity(covering ? 0 : 0.1 * Double(1 - prog)).ignoresSafeArea() }
                    .offset(x: covering ? 0 : -0.3 * width * (1 - prog))
                    .allowsHitTesting(false)
                    .zIndex(covering ? 2 : 0.5)
            }
            content
                .overlay(alignment: .leading) {
                    if dx > 0 { edgeShadow }
                }
                .offset(x: dx)
                .zIndex(1)
        }
        .background(EdgePanInstaller(enabled: enabled, key: key, onChange: changed, onEnd: ended))
        .onChange(of: key) { old, new in
            Nav23History.shared.didChange(from: old, to: new, root: !enabled)
        }
        .onAppear {
            Nav23History.shared.currentKey = key
            Nav23History.shared.settle(key)
        }
    }

    /// Papirfargen (aldri svart) når det ikke finnes noe bilde av forrige side.
    private var backdrop: Color {
        if store.paper { return PaperPalette.of(store.paperMode, system: paperSystemScheme(.active)).bg }
        return Color(hex: "#14130f")
    }

    /// Skygge på venstre kant av siden som dras (0 0 24 pt rgba(0,0,0,.25)).
    private var edgeShadow: some View {
        LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.25)], startPoint: .leading, endPoint: .trailing)
            .frame(width: 24)
            .offset(x: -24)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }

    private func changed(_ t: CGFloat, _ w: CGFloat) {
        width = w
        if behind == nil && t > 0 {
            behind = Nav23History.shared.previousSnapshot
            Nav23History.shared.swiping = true
        }
        dx = Swift.max(0, t)
        let over: Bool = dx > w * 0.5
        if over != crossed {
            crossed = over
            if over { Nav23History.lightTick() }
        }
    }

    private func ended(_ t: CGFloat, _ v: CGFloat, _ w: CGFloat) {
        let go: Bool = t > w * 0.5 || (v > 500 && t > 10)
        if go {
            if !crossed { Nav23History.lightTick() }
            withAnimation(.easeOut(duration: 0.25)) { dx = w }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(250))
                var tr = Transaction()
                tr.disablesAnimations = true
                withTransaction(tr) {
                    // Bildet av forrige side legges et øyeblikk over den ekte siden, så scrollposisjonen rekker å settes.
                    covering = behind != nil
                    action()
                    dx = 0
                }
                crossed = false
                try? await Task.sleep(for: .milliseconds(140))
                withTransaction(tr) {
                    covering = false
                    if dx == 0 { behind = nil }
                }
                Nav23History.shared.swiping = false
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { dx = 0 }
            crossed = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(320))
                if dx == 0 { behind = nil }
                Nav23History.shared.swiping = false
            }
        }
    }
}

extension View {
    func edgeSwipeBack(enabled: Bool, action: @escaping () -> Void) -> some View { modifier(EdgeSwipeBack(enabled: enabled, action: action)) }
}

/* ---------------- Historikk: bilder og scrollposisjon per rute ---------------- */

@MainActor
final class Nav23History {
    static let shared = Nav23History()

    struct Entry {
        let key: String
        let snap: UIView?
        let offset: CGPoint?
    }

    private(set) var stack: [Entry] = []
    private var pending: Entry? = nil
    weak var window: UIWindow?
    var currentKey: String = ""
    var swiping: Bool = false

    /// Bildet av siden som ligger under den som vises nå.
    var previousSnapshot: UIView? { stack.last?.snap }

    static func lightTick() {
        guard Haptics.shared.on, Haptics.shared.taps else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private var presenting: Bool { window?.rootViewController?.presentedViewController != nil }

    /// Kalles når en finger treffer skjermen: bildet og scrollposisjonen av siden slik den ser ut nå.
    func capture(key: String) {
        guard !swiping, !presenting, let w = window else { return }
        let snap: UIView? = w.snapshotView(afterScreenUpdates: false)
        let off: CGPoint? = Nav23History.mainScroll(in: w)?.contentOffset
        pending = Entry(key: key, snap: snap, offset: off)
    }

    /// Ruten skiftet. Finnes den nye ruten i historikken, gikk brukeren tilbake: posisjonen settes tilbake og alt over
    /// den glemmes. Ellers legges forrige side i historikken. Rotsider tømmer historikken.
    func didChange(from old: String, to new: String, root: Bool) {
        currentKey = new
        if let i = stack.lastIndex(where: { $0.key == new }) {
            let e: Entry = stack[i]
            stack.removeSubrange(i...)
            pending = nil
            if let off = e.offset { restore(off) }
            if root { stack.removeAll() }
            return
        }
        if root {
            stack.removeAll()
            pending = nil
            settle(new)
            return
        }
        let prev: Entry
        if let p = pending, p.key == old { prev = p } else { prev = Entry(key: old, snap: nil, offset: nil) }
        stack.append(prev)
        if stack.count > 10 { stack.removeFirst(stack.count - 10) }
        pending = nil
        settle(new)
    }

    /// Navigasjon uten berøring (dyplenker, varsler): bildet tas når den nye siden har lagt seg.
    func settle(_ key: String) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            guard self.currentKey == key, self.pending?.key != key else { return }
            self.capture(key: key)
        }
    }

    /// Setter scrollposisjonen tilbake på hovedlisten. Prøves noen ganger, fordi lister med lat innlasting
    /// kan være kortere første gang de tegnes.
    private func restore(_ off: CGPoint) {
        Task { @MainActor in
            let waits: [Int] = [20, 110, 300]
            for ms in waits {
                try? await Task.sleep(for: .milliseconds(ms))
                guard let w = self.window, let sv = Nav23History.mainScroll(in: w) else { continue }
                if sv.isDragging || sv.isTracking || sv.isDecelerating { return }
                let top: CGFloat = -sv.adjustedContentInset.top
                let maxY: CGFloat = Swift.max(top, sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom)
                let y: CGFloat = Swift.min(Swift.max(off.y, top), maxY)
                if abs(sv.contentOffset.y - y) > 0.5 { sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: y), animated: false) }
            }
        }
    }

    /// Den største synlige listen som kan scrolles loddrett (ikke karuseller og tekstfelt).
    static func mainScroll(in w: UIWindow) -> UIScrollView? {
        var best: UIScrollView? = nil
        var area: CGFloat = 0
        var queue: [UIView] = [w]
        while !queue.isEmpty {
            let v: UIView = queue.removeLast()
            if v.isHidden || v.alpha < 0.01 { continue }
            if let s = v as? UIScrollView, !(v is UITextView), s.contentSize.height > s.bounds.height + 1 {
                let a: CGFloat = s.bounds.width * s.bounds.height
                let fr: CGRect = s.convert(s.bounds, to: w)
                if a > area && fr.intersects(w.bounds) {
                    best = s
                    area = a
                }
            }
            queue.append(contentsOf: v.subviews)
        }
        return best
    }
}

/// Viser et øyeblikksbilde (UIView fra snapshotView) i SwiftUI.
struct Nav23SnapshotHost: UIViewRepresentable {
    let view: UIView

    func makeUIView(context: Context) -> UIView {
        let c = UIView()
        c.isUserInteractionEnabled = false
        c.clipsToBounds = true
        mount(c)
        return c
    }

    func updateUIView(_ c: UIView, context: Context) { mount(c) }

    private func mount(_ c: UIView) {
        if view.superview === c { return }
        for s in c.subviews { s.removeFromSuperview() }
        view.frame.origin = .zero
        c.addSubview(view)
    }
}

/* ---------------- Kantgesten (UIScreenEdgePanGestureRecognizer på vinduet) ---------------- */

/// Legger UIScreenEdgePanGestureRecognizer på vinduet og fjerner den igjen.
private struct EdgePanInstaller: UIViewRepresentable {
    let enabled: Bool
    let key: String
    let onChange: (CGFloat, CGFloat) -> Void
    let onEnd: (CGFloat, CGFloat, CGFloat) -> Void

    func makeCoordinator() -> EdgePanCoordinator { EdgePanCoordinator() }

    func makeUIView(context: Context) -> EdgePanHost {
        let v = EdgePanHost()
        v.coordinator = context.coordinator
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ v: EdgePanHost, context: Context) {
        context.coordinator.enabled = enabled
        context.coordinator.key = key
        context.coordinator.onChange = onChange
        context.coordinator.onEnd = onEnd
    }

    static func dismantleUIView(_ v: EdgePanHost, coordinator: EdgePanCoordinator) { coordinator.detach() }
}

final class EdgePanHost: UIView {
    weak var coordinator: EdgePanCoordinator?
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if let w = window { coordinator?.attach(to: w) } else { coordinator?.detach() }
    }
}

@MainActor
final class EdgePanCoordinator: NSObject, UIGestureRecognizerDelegate {
    var enabled: Bool = false
    var key: String = ""
    var onChange: ((CGFloat, CGFloat) -> Void)?
    var onEnd: ((CGFloat, CGFloat, CGFloat) -> Void)?
    private var pan: UIScreenEdgePanGestureRecognizer?
    private weak var win: UIWindow?

    func attach(to w: UIWindow) {
        Nav23History.shared.window = w
        if win === w, pan != nil { return }
        detach()
        let g = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handle(_:)))
        g.edges = .left
        g.delegate = self
        g.cancelsTouchesInView = true
        w.addGestureRecognizer(g)
        pan = g
        win = w
    }

    func detach() {
        if let g = pan { g.view?.removeGestureRecognizer(g) }
        pan = nil
    }

    /// Hver berøring i vinduet passerer her: bildet av siden tas før trykket rekker å bytte side.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        Nav23History.shared.capture(key: key)
        return true
    }

    /// Ikke på rotsider, ikke mens et ark ligger over appen, og ikke når bevegelsen er mer loddrett enn vannrett.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard enabled else { return false }
        if win?.rootViewController?.presentedViewController != nil { return false }
        if let p = g as? UIPanGestureRecognizer {
            let v: CGPoint = p.velocity(in: p.view)
            if abs(v.y) > abs(v.x) { return false }
        }
        return true
    }

    /// Kart og vannrette karuseller venter på kantgesten, så de ikke stjeler sveipet fra kanten.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
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

    @objc private func handle(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let v = g.view else { return }
        let w: CGFloat = v.bounds.width
        let t: CGFloat = g.translation(in: v).x
        switch g.state {
        case .began, .changed: onChange?(t, w)
        case .ended: onEnd?(t, g.velocity(in: v).x, w)
        case .cancelled, .failed: onEnd?(0, 0, w)
        default: break
        }
    }
}
