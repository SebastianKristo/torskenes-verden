import SwiftUI
import UIKit

/* ---------------- Prompt 32: skrivefeltet i Chat over tastaturet (claude-code-chat-tastatur-ios.md) ---------------- */
// Årsak: Chat lå på at SwiftUI selv løfter innholdet når tastaturet kommer. Den automatiske tastatur-unnvikelsen
// må gå gjennom hele kjeden EdgeSwipeBack (ZStack med .offset) → RootView (ZStack) → PhoneShell → PaperShell
// (GeometryReader-rot som selv leser tastaturet som safeAreaInsets.bottom for å flytte fanelinja) → Chat27Page.
// I den kjeden ble tastatur-innrykket brukt opp av PaperShell sin GeometryReader og kom ikke fram til skriveboksen
// (verken i VStack-en (prompt 28) eller i .safeAreaInset (prompt 30)), så feltet ble liggende bak tastaturet.
// Fiks (som keyboardLayoutGuide): Chat ignorerer tastatur-regionen helt og løfter skriveboksen selv med den målte
// overlappen mellom tastaturets sluttramme (keyboardWillChangeFrame) og Chat-flatens egen ramme på skjermen.
// Da blir resultatet det samme uansett hva foreldrene gjør med safe area.

@MainActor
@Observable
final class Kb32b {
    static let shared = Kb32b()

    /// Tastaturets ramme i skjermkoordinater (.zero = skjult).
    var frame: CGRect = .zero
    /// Økes hver gang tastaturet har lagt seg (for å scrolle til siste melding).
    var settleTick: Int = 0

    private var started: Bool = false

    func start() {
        if started { return }
        started = true
        let nc: NotificationCenter = NotificationCenter.default
        nc.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { (n: Notification) in
            MainActor.assumeIsolated { Kb32b.shared.apply(n, hiding: false) }
        }
        nc.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { (n: Notification) in
            MainActor.assumeIsolated { Kb32b.shared.apply(n, hiding: true) }
        }
        nc.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { (n: Notification) in
            MainActor.assumeIsolated { Kb32b.shared.apply(n, hiding: false, animated: false) }
        }
        nc.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated {
                Kb32b.shared.frame = .zero
                Kb32b.shared.settleTick += 1
            }
        }
    }

    private func apply(_ n: Notification, hiding: Bool, animated: Bool = true) {
        let info: [AnyHashable: Any] = n.userInfo ?? [:]
        let raw: CGRect = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
        let dur: Double = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        // Skjermkoordinater → vinduets (samme som .global i SwiftUI; viktig i Stage Manager / delt skjerm på iPad).
        var end: CGRect = raw
        var screenH: CGFloat = Kb32b.screenHeight
        if let w = Kb32b.keyWindow {
            end = w.convert(raw, from: w.screen.coordinateSpace)
            screenH = w.bounds.height
        }
        // Flytende/delt tastatur på iPad (ikke festet nederst) dekker ikke skriveboksen: ingen løft.
        let docked: Bool = end.height > 0 && end.maxY >= screenH - 1
        let next: CGRect = (hiding || !docked) ? .zero : end
        if next == frame { return }
        if animated && dur > 0 {
            withAnimation(.easeOut(duration: dur)) { frame = next }
        } else {
            frame = next
        }
        settleTick += 1
    }

    static var keyWindow: UIWindow? {
        let scene: UIWindowScene? = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
    }

    static var screenHeight: CGFloat {
        let scene: UIWindowScene? = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.screen.bounds.height ?? 844
    }

    /// Hvor mye av en flate (bunn = maxY i vinduet) tastaturet dekker.
    func overlap(maxY: CGFloat) -> CGFloat {
        if frame.height <= 0 { return 0 }
        return Swift.max(0, maxY - frame.minY)
    }
}

/// Måler flatens bunn i vinduet og løfter innholdet (skriveboksen) like mye som tastaturet dekker.
/// Brukes sammen med .ignoresSafeArea(.keyboard), så SwiftUI ikke løfter i tillegg.
struct Kb32bLift: ViewModifier {
    @MainActor private var kb: Kb32b { Kb32b.shared }
    let gap: CGFloat
    @State private var maxY: CGFloat = 0

    func body(content: Content) -> some View {
        let lift: CGFloat = kb.overlap(maxY: maxY)
        return content
            .padding(.bottom, lift > 0 ? lift + gap : 0)
            .background(
                GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { maxY = g.frame(in: .global).maxY }
                        .onChange(of: g.frame(in: .global).maxY) { (_: CGFloat, v: CGFloat) in maxY = v }
                }
            )
            .onAppear { kb.start() }
    }
}

extension View {
    /// Prompt 32: legg skriveboksen rett over tastaturet (gap pt luft).
    func keyboardLift32b(gap: CGFloat = 0) -> some View { modifier(Kb32bLift(gap: gap)) }
}
