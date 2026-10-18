import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Haptikk (Innstillinger → App → Haptikk) ---------------- */

/// Haptisk tilbakemelding: hovedbryter, styrke og egne brytere per type. Lagres på enheten.
/// Generatorene i UIKit følger selv «Systemhaptikk» i iOS-innstillingene (av der = ingen vibrasjon her heller).
@Observable
final class Haptics {
    static let shared = Haptics()

    var on = UserDefaults.standard.object(forKey: "fh_haptics") as? Bool ?? true { didSet { UserDefaults.standard.set(on, forKey: "fh_haptics") } }
    /// light | medium | heavy
    var strength = UserDefaults.standard.string(forKey: "fh_haptic_strength") ?? "medium" { didSet { UserDefaults.standard.set(strength, forKey: "fh_haptic_strength") } }
    /// Trykk på knapper og faner.
    var taps = UserDefaults.standard.object(forKey: "fh_haptic_tap") as? Bool ?? true { didSet { UserDefaults.standard.set(taps, forKey: "fh_haptic_tap") } }
    /// Fullført handling.
    var done = UserDefaults.standard.object(forKey: "fh_haptic_done") as? Bool ?? true { didSet { UserDefaults.standard.set(done, forKey: "fh_haptic_done") } }
    /// Feil og advarsler.
    var errors = UserDefaults.standard.object(forKey: "fh_haptic_error") as? Bool ?? true { didSet { UserDefaults.standard.set(errors, forKey: "fh_haptic_error") } }
    /// Pakke-varsler (Sporing).
    var packages = UserDefaults.standard.object(forKey: "fh_haptic_pkg") as? Bool ?? true { didSet { UserDefaults.standard.set(packages, forKey: "fh_haptic_pkg") } }

    private var style: UIImpactFeedbackGenerator.FeedbackStyle { strength == "light" ? .light : strength == "heavy" ? .heavy : .medium }

    /// Trykk på en knapp.
    func tap() {
        guard on, taps else { return }
        let s = style
        Haptics.main { UIImpactFeedbackGenerator(style: s).impactOccurred() }
    }
    /// Fanebytte, chips og valg.
    func select() {
        guard on, taps else { return }
        Haptics.main { UISelectionFeedbackGenerator().selectionChanged() }
    }
    /// Tikket når sveip-tilbake passerer 90 pt.
    func tick() { select() }
    func success() {
        guard on, done else { return }
        Haptics.main { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    }
    func error() {
        guard on, errors else { return }
        Haptics.main { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    }
    func warning() {
        guard on, errors else { return }
        Haptics.main { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    }
    /// Ny pakkestatus (klar for henting, levert …).
    func package() {
        guard on, packages else { return }
        Haptics.main { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    }
    /// Testknappen: trykk, valg og fullført etter hverandre (uavhengig av typebryterne, men ikke av hovedbryteren).
    func test() {
        guard on else { return }
        let s = style
        Haptics.main { UIImpactFeedbackGenerator(style: s).impactOccurred() }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(260))
            UISelectionFeedbackGenerator().selectionChanged()
            try? await Task.sleep(for: .milliseconds(260))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private static func main(_ f: @escaping @MainActor () -> Void) {
        if Thread.isMainThread { MainActor.assumeIsolated { f() } } else { Task { @MainActor in f() } }
    }
}

/* ---------------- Sveip fra venstre kant = tilbake ---------------- */

/// Systemets interaktive tilbakesveip: samme UIScreenEdgePanGestureRecognizer som UINavigationController bruker,
/// lagt på vinduet. Siden følger fingeren fra venstre kant, bakgrunnen dempes, og slipper du etter ca. 35 %
/// av bredden eller med fart, går appen tilbake (samme vei som ‹-pilen). Ingen pil eller ikon under sveipet.
struct EdgeSwipeBack: ViewModifier {
    let enabled: Bool
    let action: () -> Void
    @State private var dx: CGFloat = 0
    @State private var width: CGFloat = 390

    func body(content: Content) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
                .offset(x: dx)
                .shadow(color: .black.opacity(dx > 0 ? 0.35 : 0), radius: 12, x: -4, y: 0)
            if dx > 0 {
                Color.black.opacity(0.25 * Double(1 - Swift.min(1, dx / Swift.max(width, 1)))).ignoresSafeArea().allowsHitTesting(false)
                    .mask(alignment: .leading) { Rectangle().frame(width: dx) }
            }
        }
        .background(EdgePanInstaller(enabled: enabled, onChange: changed, onEnd: ended))
    }

    private func changed(_ t: CGFloat, _ w: CGFloat) {
        width = w
        dx = Swift.max(0, t)
    }

    private func ended(_ t: CGFloat, _ v: CGFloat, _ w: CGFloat) {
        let go = t > w * 0.35 || (v > 700 && t > 20)
        if go {
            Haptics.shared.tick()
            withAnimation(.easeOut(duration: 0.2)) { dx = w }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                action()
                var tr = Transaction()
                tr.disablesAnimations = true
                withTransaction(tr) { dx = 0 }
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { dx = 0 }
        }
    }
}

/// Legger UIScreenEdgePanGestureRecognizer på vinduet og fjerner den igjen.
private struct EdgePanInstaller: UIViewRepresentable {
    let enabled: Bool
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

final class EdgePanCoordinator: NSObject, UIGestureRecognizerDelegate {
    var enabled = false
    var onChange: ((CGFloat, CGFloat) -> Void)?
    var onEnd: ((CGFloat, CGFloat, CGFloat) -> Void)?
    private var pan: UIScreenEdgePanGestureRecognizer?
    private weak var win: UIWindow?

    func attach(to w: UIWindow) {
        if win === w, pan != nil { return }
        detach()
        let g = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handle(_:)))
        g.edges = .left
        g.delegate = self
        w.addGestureRecognizer(g)
        pan = g
        win = w
    }

    func detach() {
        if let g = pan { g.view?.removeGestureRecognizer(g) }
        pan = nil
    }

    /// Ikke mens et ark (sheet) eller fullskjerm ligger over appen.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard enabled else { return false }
        return win?.rootViewController?.presentedViewController == nil
    }

    @objc private func handle(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let v = g.view else { return }
        let w = v.bounds.width
        let t = g.translation(in: v).x
        switch g.state {
        case .began, .changed: onChange?(t, w)
        case .ended: onEnd?(t, g.velocity(in: v).x, w)
        case .cancelled, .failed: onEnd?(0, 0, w)
        default: break
        }
    }
}

extension View {
    func edgeSwipeBack(enabled: Bool, action: @escaping () -> Void) -> some View { modifier(EdgeSwipeBack(enabled: enabled, action: action)) }
}

/* ---------------- Lokale varsler ---------------- */

/// Viser varsler også mens appen er åpen (ellers kommer de bare i bakgrunnen).
final class NotifyDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotifyDelegate()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}

enum LocalNotify {
    /// Ber om lov første gang (ingen dialog hvis brukeren allerede har svart).
    static func ask() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    static func post(_ title: String, _ body: String, id: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil)) { _ in }
    }
}
