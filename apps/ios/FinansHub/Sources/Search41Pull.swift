import SwiftUI
import UIKit

/* ---------------- Prompt 41: dra svar-pillen på Hjem ned for å åpne den i Chat ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-sok-pille-dra-til-chat.md. Fasit: Mobil Papir App.dc.html → Hjem → søk med Glimt.
   – Opp = lukk (som før, Assist38Swipe). Ned = åpne i Chat: pillen strekker seg (bunnmarg +0,65 × dra, flyttes 0,35 × dra), håndtaket
     blir bredere (34 → 80 pt), «Dra ned for å åpne i Chat» → ved 70 pt «Slipp for å åpne i Chat», lett haptikk ved terskelen begge
     veier, motstand (0,4) etter 70 pt. Slipp før 70 pt: fjærer tilbake (0,25 s).
   – Slipp etter 70 pt: pillen vokser fra sin egen ramme til fullskjerm på 0,4 s (hjørner 26 → 0, mørk glass → appens bakgrunn), med
     Glimt-tittel, spørsmålet som din boble og «skriver»-prikker; så byttes det til ekte Chat. Ferdig svar brukes (ikke spør på nytt).
     «Fortsett i Chat ›» bruker samme animasjon. Redusert bevegelse: 0,2 s krysstoning. */

@MainActor
@Observable
final class Pull41 {
    static let shared = Pull41()

    /// Hvor langt pillen er dratt ned (pt, etter motstand).
    var pull: CGFloat = 0
    var over: Bool = false
    /// Overgangen til Chat: rammen den starter fra (globalt) og fremdrift 0…1.
    var from: CGRect = .zero
    var opening: Bool = false
    var grown: Bool = false
    var question: String = ""

    static let threshold: CGFloat = 70

    func changed(_ t: CGFloat) {
        let v: CGFloat = t <= Pull41.threshold ? t : Pull41.threshold + (t - Pull41.threshold) * 0.4
        pull = Swift.max(0, v)
        let o: Bool = pull >= Pull41.threshold
        if o != over {
            over = o
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    func cancel() {
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.25)) {
            pull = 0
            over = false
        }
    }

    /// Slipp etter terskelen (eller «Fortsett i Chat ›»).
    func open(_ store: Store, reduce: Bool) {
        let a: Assist31 = Assist31.shared
        let q: String = a.homeQ
        let answer: String = a.homeBusy ? "" : (a.homeAnswer?.text ?? "")
        question = q
        from = Assist38.shared.rect
        opening = true
        grown = false
        pull = 0
        over = false
        let d: Double = reduce ? 0.2 : 0.4
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 16_000_000)
            withAnimation(reduce ? .easeOut(duration: 0.2) : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.4)) { self.grown = true }
            try? await Task.sleep(nanoseconds: UInt64(d * 1_000_000_000))
            a.closeHome()
            Assist38.shared.rect = .zero
            store.openChat41(q, answer: answer)
            try? await Task.sleep(nanoseconds: 180_000_000)
            withAnimation(.easeOut(duration: 0.15)) { self.opening = false }
            self.grown = false
        }
    }
}

extension Store {
    /// Prompt 41: åpner Chat med spørsmålet. Er svaret fra pillen ferdig, legges det inn som første svar (ikke spør på nytt).
    func openChat41(_ q: String, answer: String) {
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { openChat(); return }
        if answer.isEmpty {
            openChat(prompt: t)
            return
        }
        let s: ChatStore27 = ChatStore27.shared
        s.newChat()
        var a: ChatMsg27 = ChatMsg27(role: "assistant", content: answer)
        a.model = "Glimt"
        s.msgs = [ChatMsg27(role: "user", content: t), a]
        s.title = String(t.prefix(48))
        paperGo("chat")
    }
}

/// Teksten under innholdet og det bredere håndtaket mens pillen dras ned.
struct Pull41Hint: View {
    @MainActor private var m: Pull41 { Pull41.shared }

    var body: some View {
        VStack(spacing: 6) {
            if m.pull > 4 {
                Text(m.over ? "Slipp for å åpne i Chat" : "Dra ned for å åpne i Chat")
                    .font(PF.ui(12.5, .semibold)).foregroundStyle(Color.white.opacity(Double(Swift.min(1, m.pull / 40)) * (m.over ? 0.95 : 0.7)))
                    .transition(.opacity)
            }
            Capsule().fill(Color.white.opacity(m.over ? 0.6 : 0.25))
                .frame(width: 34 + Swift.min(46, m.pull / Pull41.threshold * 46), height: 4)
        }
        .padding(.bottom, 5)
        .allowsHitTesting(false)
    }
}

/// Fullskjerm-overgangen: vokser fra pillens ramme (hjørner 26 → 0) med Glimt-tittel, spørsmålet og «skriver»-prikker.
struct Pull41Overlay: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Pull41 { Pull41.shared }

    var body: some View {
        if m.opening {
            GeometryReader { (g: GeometryProxy) in
                let o: CGRect = g.frame(in: .global)
                let start: CGRect = m.from.width > 0 ? m.from.offsetBy(dx: -o.minX, dy: -o.minY) : CGRect(x: 16, y: 120, width: g.size.width - 32, height: 120)
                let r: CGRect = m.grown ? CGRect(origin: .zero, size: g.size) : start
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: m.grown ? 0 : 26, style: .continuous)
                        .fill(m.grown ? p.bg : Color(hex: "#161412").opacity(0.92))
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 8) {
                            Glimt31Mark(size: 22, state: .thinking, dark: p.dark)
                            Text("Glimt").font(PF.ui(16, .bold)).foregroundStyle(p.ink)
                        }
                        HStack {
                            Spacer(minLength: 40)
                            Text(m.question).font(PF.ui(15)).foregroundStyle(p.bg)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(p.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        Glimt31Dots(color: p.mut)
                    }
                    .padding(.horizontal, 20).padding(.top, g.safeAreaInsets.top + 60)
                    .opacity(m.grown ? 1 : 0)
                    .animation(.easeOut(duration: 0.2).delay(0.12), value: m.grown)
                }
                .frame(width: r.width, height: r.height)
                .position(x: r.midX, y: r.midY)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .transition(.opacity)
        }
    }
}
