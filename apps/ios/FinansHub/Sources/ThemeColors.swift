import SwiftUI

/* ---------------- Prompt 22: «Lys hovedbok» er standardtema for FinansHub-sidene ---------------- */
// Rekkefølge: brukerens lagrede valg fra serveren (layout.design), så lokal cache (fh_fin_design), så «lys».
// Det gamle «v2»-fallbacket er borte. Med «lys» (standard) tegnes Finans-fanene i Papir med tokens fra
// FinansHub v3 Temaer → THEMES.lys. Andre valg (v2, mork, glod …) beholder Papir-paletten som før.

extension PaperPalette {
    /// Lys hovedbok: papirtone #f4f1ea, kort #faf8f3, grønn aksent #1f4d3a.
    static let ledger = PaperPalette(dark: false, ink: Color(hex: "#1c1b19"), bg: Color(hex: "#f4f1ea"), card: Color(hex: "#faf8f3"), line: Color(hex: "#e2ddd2"),
                                     lab: Color(hex: "#1f4d3a"), mut: Color(hex: "#5c5850"), pos: Color(hex: "#2f7a4f"), nav: Color(hex: "#1c1b19"),
                                     navInk: DS.fixed(.navInk, stil: .papir, dark: false), navAct: Color(hex: "#f8f5ee"), navActInk: Color(hex: "#1c1b19"),
                                     onLab: Color(hex: "#f4f1ea"), pop: Color(hex: "#f4f1ea"), popSel: Color(hex: "#ece7dc"))
}

extension Store {
    private static let finDesignKey: String = "fh_fin_design"

    /// Valgt FinansHub-design (lys | mork | glod | v2). Mangler verdi: «lys».
    var finDesign22: String {
        let v: String = UserDefaults.standard.string(forKey: Store.finDesignKey) ?? ""
        return v.isEmpty ? "lys" : v
    }

    /// layout.design fra serveren (aldri overskrevet lokalt hvis serveren ikke sender noe).
    func applyPaper22(_ o: [String: Any]) {
        if let v = JS.str(o, "design"), ["lys", "mork", "glod", "v2"].contains(v) {
            UserDefaults.standard.set(v, forKey: Store.finDesignKey)
        }
    }

    /// Fanene som er FinansHub-sider i Papir.
    var paperOnFinance22: Bool {
        if newsOpen || dishSel != nil || paperClassic != nil || paperFin != nil { return false }
        return ["finans", "fliste", "finn", "fmer", "fsok", "ftx"].contains(paperTab)
    }

    /// Paletten for innholdet: Lys hovedbok på Finans-sidene når designet er «lys», ellers Papir-paletten.
    func finPalette22(_ p: PaperPalette) -> PaperPalette {
        // Prompt 50: Liquid Glass gjelder også Finans-sidene (ingen lys hovedbok over glasset).
        if p.glass { return p }
        if paperOnFinance22 && finDesign22 == "lys" { return PaperPalette.ledger }
        return p
    }
}

// ---- Tidligere Theme28.swift ----

/* ---------------- Prompt 28: farger fra aktivt tema (konto-farger) ---------------- */
// prompts/prompt-28-pakke/claude-code-konto-farger.md: primærknapper i Papir har aksent (lab) bak og onLab-tekst,
// aldri hvit tekst på lys rosa (glass med aksent-tint). Mørk-aksenten (#f08a76) kommer bare fra mørk palett.

/// Primærknapp: Papir → lab-bakgrunn, onLab-tekst, trykket brightness .92; deaktivert → line-bakgrunn og mut-tekst.
/// Uten Papir-palett (skjer ikke i appen lenger) → kortflate med aksent.
struct Primary28Style: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var radius: CGFloat = 22

    func makeBody(configuration: Configuration) -> some View {
        Primary28Body(label: configuration.label, pressed: configuration.isPressed, enabled: enabled, radius: radius)
    }
}

private struct Primary28Body<L: View>: View {
    let label: L
    let pressed: Bool
    let enabled: Bool
    let radius: CGFloat

    var body: some View {
        if let p = PaperSkin.palette {
            let shape: RoundedRectangle = RoundedRectangle(cornerRadius: Swift.min(radius, 22), style: .continuous)
            label
                .foregroundStyle(enabled ? p.onLab : p.mut)
                .background(enabled ? p.lab : p.line, in: shape)
                .brightness(pressed ? -0.08 : 0)
                .contentShape(shape)
        } else {
            label
                .foregroundStyle(Color.ink)
                .glass(radius, tint: .accent)
                .opacity(pressed ? 0.8 : (enabled ? 1 : 0.5))
        }
    }
}
