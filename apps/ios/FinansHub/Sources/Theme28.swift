import SwiftUI

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
