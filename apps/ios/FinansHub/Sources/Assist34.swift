import SwiftUI

/* ---------------- Prompt 34: tydelige Glimt-feil i svarboblen ----------------
   prompts/prompt-34-pakke/claude-code-glimt-virker-ikke.md punkt 6: AI-søk og Glimt viste ingenting eller «tenker» for alltid.
   Nå: «Glimt fikk ikke svar fra {modell}: {feil}» med **Prøv igjen** og **Åpne AI-kontroll** (selvtesten på Oversikt).
   Serveren (SERVER34) bytter selv til reservemodellen etter 20 s; feiler den også, kommer teksten i svaret eller som feil. */

struct Assist34ErrorFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }

    var body: some View {
        HStack(spacing: 8) {
            Assist34Pill(title: "Prøv igjen", strong: true) {
                Haptic34.light()
                let q: String = m.homeQ
                if q.isEmpty { m.closeHome(); return }
                Search32b.shared.askHome(q, store)
            }
            Assist34Pill(title: "Åpne AI-kontroll", strong: false) {
                m.closeHome()
                AiCtl34.shared.show("ov")
            }
            Spacer(minLength: 0)
        }
    }
}

struct Assist34Pill: View {
    let title: String
    let strong: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                .padding(.horizontal, 14).frame(height: 32)
                .background(Color.white.opacity(strong ? 0.22 : 0.1), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
