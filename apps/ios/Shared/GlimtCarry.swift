import SwiftUI

/* ---------------- Prompt 44: lue, skjerf og gave følger figuren når den beveger seg ----------------
   Fasit: prompts/prompt-44-pakke/glimt-figurer.js → dress() og claude-code-glimt-pynt-folger-figuren.md.
   Feilen: figuren svevde/hoppet (gfBob 2,6 s, gfHop 1 s, gfSq 3,6 s) på sitt eget element, mens pynten (julelue, skjerf,
   gave, 17. mai-sløyfe, flagg, prestedrakt, snekker- og Sherlock-drakt, bursdagslue) lå utenfor og stod stille.
   Rettingen: bevegelsen ligger på én felles beholder med både figuren og pynten. Inni en drakt bærer drakten figuren
   (`glimt44Carried`), og figuren selv beveger seg ikke (som `animation: none` i fasiten). Flagget vaier fortsatt selv. */

struct Glimt44CarriedKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    /// Figuren ligger i en beholder (drakt) som står for svev/hopp. Figuren tegnes da uten egen bevegelse.
    var glimt44Carried: Bool {
        get { self[Glimt44CarriedKey.self] }
        set { self[Glimt44CarriedKey.self] = newValue }
    }
}

extension View {
    /// Figuren inni bæres av beholderen (drakten beveger alt likt).
    func glimt44Carried(_ on: Bool = true) -> some View { environment(\.glimt44Carried, on) }
}
