import SwiftUI
import UIKit

/* ---------------- Prompt 38: lukke AI-svarboblen på Hjem uten å treffe kortet under ----------------
   claude-code-hjem-ai-svar-lukk.md, fasit Mobil Papir App.dc.html → hs.ans* / hs.sw*.
   - Trykk i selve boblen lukker den ikke lenger (tekst kan leses i ro).
   - ✕ oppe til høyre (30 pt, glass) lukker.
   - Sveip opp på boblen (> 40 pt) lukker med glid og fade; under terskelen spretter den tilbake. Håndtak nederst.
   - Trykk utenfor lukker via et usynlig lag over hele appen med et hull der boblen er. Laget fanger trykket, så kortet
     under (f.eks. Vær) ikke åpnes. Å begynne å dra/scrolle utenfor lukker også. Lett haptikk ved lukking. */

@MainActor
@Observable
final class Assist38 {
    static let shared = Assist38()

    /// Boblens ramme i globale koordinater (hullet i laget).
    var rect: CGRect = .zero

    static func close() {
        Haptic34.light()
        withAnimation(.easeOut(duration: 0.18)) { Assist31.shared.closeHome() }
        Assist38.shared.rect = .zero
    }
}

/// Hele flaten minus hullet (even-odd), så trykk i hullet går rett til boblen.
struct Hole38: Shape {
    var hole: CGRect

    func path(in r: CGRect) -> Path {
        var p: Path = Path(r)
        if hole.width > 0 && hole.height > 0 {
            p.addRoundedRect(in: hole, cornerSize: CGSize(width: 26, height: 26), style: .continuous)
        }
        return p
    }
}

/// Det usynlige laget. Legges over PaperShell (Paper.swift).
struct Assist38Catcher: View {
    @Environment(Store.self) private var store
    @MainActor private var a: Assist31 { Assist31.shared }
    @MainActor private var m: Assist38 { Assist38.shared }

    var body: some View {
        if a.homeOpen && store.paperTab == "hjem" && m.rect.width > 0 {
            GeometryReader { (g: GeometryProxy) in
                let o: CGRect = g.frame(in: .global)
                let hole: CGRect = m.rect.offsetBy(dx: -o.minX, dy: -o.minY)
                Color.white.opacity(0.001)
                    .contentShape(Hole38(hole: hole), eoFill: true)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { (_: DragGesture.Value) in
                                if Assist31.shared.homeOpen { Assist38.close() }
                            }
                    )
            }
            .ignoresSafeArea()
            .accessibilityHidden(true)
        }
    }
}

/// ✕ (30 pt, glass) oppe til høyre i boblen.
struct Assist38CloseButton: View {
    var body: some View {
        Button { Assist38.close() } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.white.opacity(0.85))
                .frame(width: 30, height: 30)
                .background(Color.white.opacity(0.14), in: Circle())
                .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lukk svaret")
    }
}

/// Sveip opp for å lukke, og rammen til hullet i laget.
struct Assist38Swipe: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var dy: CGFloat = 0

    func body(content: Content) -> some View {
        // Prompt 41: ned = åpne i Chat (Search41Pull.swift): pillen flyttes 0,35 × dra og strekker seg (bunnmargen i Assist31Bubble).
        let down: CGFloat = Pull41.shared.pull * 0.35
        content
            .background {
                GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { Assist38.shared.rect = g.frame(in: .global) }
                        .onChange(of: g.frame(in: .global)) { (_: CGRect, r: CGRect) in Assist38.shared.rect = r }
                }
            }
            .offset(y: dy + down)
            .opacity(Double(1 + Swift.max(-1, dy / 160)))
            .gesture(
                DragGesture(minimumDistance: 12)
                    .onChanged { (v: DragGesture.Value) in
                        let t: CGFloat = v.translation.height
                        if t < 0 {
                            dy = t
                            if Pull41.shared.pull > 0 { Pull41.shared.changed(0) }
                        } else {
                            dy = 0
                            var tr: Transaction = Transaction()
                            tr.disablesAnimations = true
                            withTransaction(tr) { Pull41.shared.changed(t) }
                        }
                    }
                    .onEnded { (v: DragGesture.Value) in
                        if Pull41.shared.over {
                            Pull41.shared.open(store, reduce: reduce)
                            dy = 0
                            return
                        }
                        if Pull41.shared.pull > 0 { Pull41.shared.cancel() }
                        if v.translation.height < -40 {
                            withAnimation(.easeOut(duration: 0.18)) { dy = -140 }
                            Task { @MainActor in
                                try? await Task.sleep(nanoseconds: 160_000_000)
                                Assist38.close()
                                dy = 0
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { dy = 0 }
                        }
                    }
            )
            .onDisappear { Assist38.shared.rect = .zero }
    }
}

extension View {
    func assist38Swipe() -> some View { modifier(Assist38Swipe()) }
}
