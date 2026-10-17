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

/// Appen bruker ikke NavigationStack, så tilbakegesten er en egen kantgest: start innenfor 24 pt fra venstre kant
/// og dra mot høyre. Etter 90 pt kommer et haptisk tikk, og når du slipper går appen tilbake (samme vei som ‹-pilen).
struct EdgeSwipeBack: ViewModifier {
    let enabled: Bool
    let action: () -> Void
    @State private var dx: CGFloat = 0
    @State private var active = false
    @State private var armed = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .leading) {
                if active && dx > 6 {
                    Image(systemName: "chevron.left").font(.system(size: 17, weight: .bold)).foregroundStyle(armed ? Color.ink : .white)
                        .frame(width: 44, height: 44)
                        .background(armed ? Color.accent : Color.white.opacity(0.2), in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.3), lineWidth: 1))
                        .offset(x: Swift.min(dx, 130) * 0.55 - 34)
                        .opacity(Double(Swift.min(1, dx / 70)))
                        .allowsHitTesting(false)
                        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: armed)
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 10, coordinateSpace: .global)
                    .onChanged { v in
                        guard enabled else { return }
                        if !active {
                            guard v.startLocation.x < 24, v.translation.width > 0, abs(v.translation.width) > abs(v.translation.height) * 1.2 else { return }
                            active = true
                        }
                        dx = Swift.max(0, v.translation.width)
                        let now = dx >= 90
                        if now != armed {
                            armed = now
                            if now { Haptics.shared.tick() }
                        }
                    }
                    .onEnded { _ in
                        let go = active && armed
                        active = false; armed = false; dx = 0
                        if go { action() }
                    }
            )
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
