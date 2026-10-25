import SwiftUI

/* ---------------- Prompt 52: sideanimasjon (pgAnim / pgIn) ---------------- */
// Fasit: Homelab.dc.html → pgAnim/pgIn. Når en side åpnes, glir innholdet inn 18 pt fra høyre med fade (260 ms);
// tilbake gir 12 pt fra venstre (220 ms). Myk utkurve, ingen animasjon med «Reduser bevegelse».
// Retningen: Haptic34.back() (alle tilbake-knapper og kantsveipet, Nav34.swift) merker «tilbake» rett før navigeringen.
// Ingen .id()/transition: visningene beholder tilstanden (scroll, felt); bare forskyvning og gjennomsiktighet animeres.

enum Pg52 {
    nonisolated(unsafe) private static var backAt: Date = .distantPast

    /// Kalles av Haptic34.back() (også når haptikk er av).
    nonisolated static func markBack() { backAt = Date() }

    /// true når siste sidebytte var «tilbake» (innen 0,8 s etter merket – kantsveipet navigerer ~250 ms senere).
    nonisolated static var isBack: Bool { Date().timeIntervalSince(backAt) < 0.8 }

    /// Nøkkelen for siden som vises i skallet (PaperShell.content).
    @MainActor static func key(_ s: Store) -> String {
        if s.newsOpen { return "news" }
        if let d = s.dishSel { return "dish:" + d }
        if let t = s.paperFin { return "fin:" + String(describing: t) }
        if let m = s.paperClassic { return "cl:" + String(describing: m) }
        if s.ruter24Full { return "avg" }
        if s.fam50Full { return "fam" }
        if s.full27 { return "f27:" + s.paperTab }
        return "pg:" + s.paperTab + (s.paperTxId.map { ":\($0)" } ?? "")
    }
}

struct Pg52Enter: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// iPad/brett har egne overganger (PaperPage.wide46) – ingen ekstra glid der.
    @Environment(\.paperWide) private var wide
    let key: String
    @State private var dx: CGFloat = 0
    @State private var op: Double = 1

    func body(content: Content) -> some View {
        content
            .offset(x: dx)
            .opacity(op)
            .onChange(of: key) { (_: String, _: String) in
                guard !reduce && !wide else { return }
                let back: Bool = Pg52.isBack
                var t: Transaction = Transaction()
                t.disablesAnimations = true
                withTransaction(t) {
                    dx = back ? -12 : 18
                    op = 0
                }
                let dur: Double = back ? 0.22 : 0.26
                DispatchQueue.main.async {
                    withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: dur)) {
                        dx = 0
                        op = 1
                    }
                }
            }
    }
}

extension View {
    /// Prompt 52: inngangsanimasjon når `key` (siden) byttes.
    func pg52Enter(_ key: String) -> some View { modifier(Pg52Enter(key: key)) }
}
