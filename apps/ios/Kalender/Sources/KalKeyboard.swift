import SwiftUI
import UIKit

/* ---------------- Prompt 37: Kalender på iPhone – tastaturet (kart: KalEventMap.swift, fagfarger: KalSubjectColors.swift) ---------------- */
// • KalKb37: tastaturhøyden (Ny hendelse går helt ned bak tastaturet med padding = tastatur + 16).
// • KalKeyboard37.dismiss(): lukker tastaturet før et hendelsesark åpnes (søk, liste, kort, Glimt-kort).
// • KalGlimtMap37: minikart (120 pt, radius 14) med adresse i glass-etikett under Glimt-kortet. Trykk → veibeskrivelse.
// • KalDetailMap37: kart (170 pt, radius 16), full adresse, «Åpne i Kart» og «Veibeskrivelse ›» i hendelsesarket.
// • KalFagPick37 / KalFagSettings37: «Farge for MEK1300» i arket og Innstillinger → Studie → Fag.

@MainActor
@Observable
final class KalKb37 {
    static let shared: KalKb37 = KalKb37()

    /// Høyden på tastaturet (0 når det er skjult).
    var height: CGFloat = 0
    private var installed: Bool = false

    func install() {
        if installed { return }
        installed = true
        let nc: NotificationCenter = NotificationCenter.default
        _ = nc.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { (n: Notification) in
            let r: CGRect = KalKb37.endFrame(n)
            Task { @MainActor in KalKb37.shared.update(r) }
        }
        _ = nc.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { (_: Notification) in
            Task { @MainActor in KalKb37.shared.height = 0 }
        }
    }

    nonisolated static func endFrame(_ n: Notification) -> CGRect {
        guard let v = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue else { return CGRect.zero }
        return v.cgRectValue
    }

    /// Den delen av tastaturet som dekker skjermen (0 når det er skjult eller flytende).
    func update(_ r: CGRect) {
        let screenH: CGFloat = KalKeyboard37.screenHeight
        let h: CGFloat = Swift.max(0, screenH - r.minY)
        let v: CGFloat = h > 40 && r.height > 40 ? h : 0
        if abs(v - height) > 1 { height = v }
    }
}

enum KalKeyboard37 {
    /// blurKb() i fasiten.
    @MainActor static func dismiss() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// Vinduets bakgrunn i arkets farge mens Ny hendelse er åpen (nil = standard).
    /// Prompt 47 (rotårsaken til «blank skjerm ved + andre gang»): løkka satte fargen på ALLE vinduene i scenen – også
    /// tastaturets egne vinduer (UITextEffectsWindow / UIRemoteKeyboardWindow), som dekker hele skjermen over appen og
    /// ellers er gjennomsiktige. De finnes først etter at tastaturet har vært oppe én gang; andre gang (eller etter at
    /// Glimt-feltet hadde vært i bruk, f.eks. ved app-bytte fra Homelab) ble hele skjermen dekket av en ugjennomsiktig flate i
    /// arkets farge (#211f1b i mørk modus), med tastaturet oppå og skjemaet usynlig under. Nå: bare appens egne vinduer.
    @MainActor static func windowBg(_ c: UIColor?) {
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for w in ws.windows where appWindow47(w) {
                if w.backgroundColor != c { w.backgroundColor = c }
            }
        }
    }

    /// Prompt 47: vakt – et vindu over appen (tastatur o.l.) med ugjennomsiktig bakgrunn dekker hele skjermen. Fjern fargen og logg.
    @MainActor static func clearCovers47() {
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for w in ws.windows where !appWindow47(w) {
                guard let c = w.backgroundColor else { continue }
                if c.cgColor.alpha > 0.01 {
                    w.backgroundColor = nil
                    KalLog44.send("cal.new47.cover", ["win": String(describing: type(of: w))])
                }
            }
        }
    }

    /// Appens innholdsvindu (ikke tastatur-, tekst-effekt- eller systemvinduer over appen).
    @MainActor static func appWindow47(_ w: UIWindow) -> Bool {
        if w.windowLevel != UIWindow.Level.normal { return false }
        let name: String = String(describing: type(of: w))
        if name.contains("Keyboard") || name.contains("TextEffects") || name.hasPrefix("_") { return false }
        return true
    }

    @MainActor static var screenHeight: CGFloat {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { (s: UIScene) -> UIWindowScene? in s as? UIWindowScene }
        if let sc = scenes.first { return sc.screen.bounds.height }
        return 844
    }

    /// Hjemstrek-området nederst (34 pt på iPhone med Face ID, 0 med hjemknapp).
    @MainActor static var safeBottom: CGFloat {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { (s: UIScene) -> UIWindowScene? in s as? UIWindowScene }
        for sc in scenes {
            for w in sc.windows where w.isKeyWindow { return w.safeAreaInsets.bottom }
        }
        return scenes.first?.windows.first?.safeAreaInsets.bottom ?? 0
    }
}
