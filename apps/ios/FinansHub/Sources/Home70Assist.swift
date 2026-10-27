import SwiftUI
import UIKit

/* ---------------- Prompt 70 (IOSHOME70): scrolle på Hjem mens Glimt svarer ----------------
 Spesifikasjon: prompt-51b-pakke/claude-code-hjem-scroll-mens-ai.md. Fasit: Homelab.dc.html (svarkortet under søkefeltet).
 – Ingen fullskjerm-lag (Assist38Catcher viser bare pillen under). Kortet ligger i innholdet og scroller med siden.
 – Trykk utenfor lukker (ikke scroll): SpatialTapGesture som .simultaneousGesture på Hjem-innholdet. Et trykk feiler av seg
   selv når fingeren flytter seg, så scroll lukker aldri. Lukker bare når trykket er utenfor søkefeltet og kortet, og
   svaret er ferdig. Mens Glimt tenker lukkes kortet bare med ✕.
 – Sveip opp / dra ned gjøres fra grepet nederst i kortet (Assist38Swipe).
 – Svaret strømmer videre selv om kortet er scrollet ut av syne. Blir det ferdig da: lett haptikk og pillen «Glimt svarte ↑»
   nederst over fanelinjen, som scroller opp til søkefeltet (Drag37.scrollTick → PaperPage). */

@MainActor
@Observable
final class Assist70 {
    static let shared = Assist70()

    /// Pillen «Glimt svarte ↑».
    var pill: Bool = false

    /// Søkefeltet med kortet under (globalt). Endres ved scroll, så det observeres ikke.
    @ObservationIgnored var searchRect: CGRect = .zero
    /// Den synlige flaten (globalt), satt av pillens lag over PaperShell.
    @ObservationIgnored var viewport: CGRect = .zero
    @ObservationIgnored private var hideTask: Task<Void, Never>? = nil

    /// Trykk et sted på Hjem (globale koordinater).
    func tapped(_ pt: CGPoint) {
        let a: Assist31 = Assist31.shared
        guard a.homeAnswer != nil, !a.homeBusy else { return }
        if searchRect.insetBy(dx: -4, dy: -4).contains(pt) { return }
        if Assist38.shared.rect.contains(pt) { return }
        Assist38.close()
    }

    /// Svaret ble ferdig (homeBusy true → false med svar). Er kortet ute av syne: haptikk og pillen.
    func answered() {
        guard Assist31.shared.homeAnswer != nil else { return }
        if visible() { return }
        Haptic34.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { pill = true }
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { self.hide() }
        }
    }

    func hide() {
        hideTask?.cancel()
        hideTask = nil
        if pill { withAnimation(.easeOut(duration: 0.2)) { pill = false } }
    }

    /// Scroller opp til søkefeltet (kortet ligger rett under).
    func scrollUp() {
        Haptics.shared.tap()
        let d: Drag37 = Drag37.shared
        d.scrollTarget = "h1"
        d.scrollTop = true
        d.scrollTick += 1
        hide()
    }

    private func visible() -> Bool {
        let r: CGRect = Assist38.shared.rect
        guard r.height > 0 else { return false }
        let vp: CGRect = viewport.height > 0 ? viewport : CGRect(x: 0, y: 0, width: 400, height: 800)
        return r.maxY > vp.minY + 90 && r.minY < vp.maxY - 140
    }
}

/// Trykk utenfor søkefeltet og svarkortet lukker et ferdig svar. Samtidig gest, så kort og knapper virker som før
/// og ScrollView scroller (et trykk er aldri en drag-gest).
struct Assist70Tap: ViewModifier {
    func body(content: Content) -> some View {
        content
            .contentShape(Rectangle())
            .simultaneousGesture(
                SpatialTapGesture(count: 1, coordinateSpace: .global)
                    .onEnded { (v: SpatialTapGesture.Value) in Assist70.shared.tapped(v.location) }
            )
    }
}

/// Måler søkefeltet (med kortet) globalt, og melder fra når Glimt er ferdig.
struct Assist70Track: ViewModifier {
    @MainActor private var a: Assist31 { Assist31.shared }

    func body(content: Content) -> some View {
        content
            .background {
                GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { Assist70.shared.searchRect = g.frame(in: .global) }
                        .onChange(of: g.frame(in: .global)) { (_: CGRect, r: CGRect) in Assist70.shared.searchRect = r }
                }
            }
            .onChange(of: a.homeBusy) { (was: Bool, now: Bool) in
                if was && !now { Assist70.shared.answered() }
            }
            .onChange(of: a.homeOpen) { (_: Bool, open: Bool) in
                if !open { Assist70.shared.hide() }
            }
    }
}

extension View {
    func assist70Tap() -> some View { modifier(Assist70Tap()) }
    func assist70Track() -> some View { modifier(Assist70Track()) }
}

/// «Glimt svarte ↑» nederst over fanelinjen. Ligger over PaperShell (via Assist38Catcher), uten lag over resten.
struct Assist70Pill: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Assist70 { Assist70.shared }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            Color.clear
                .allowsHitTesting(false)
                .onAppear { Assist70.shared.viewport = g.frame(in: .global) }
                .onChange(of: g.size) { (_: CGSize, _: CGSize) in Assist70.shared.viewport = g.frame(in: .global) }
        }
        .allowsHitTesting(false)
        .overlay(alignment: .bottom) {
            if m.pill && store.paperTab == "hjem" {
                pillButton
                    .padding(.bottom, 62 + 22)
                    // Prompt 71: «Reduser bevegelse» gir bare fade.
                    .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private var pillButton: some View {
        Button { m.scrollUp() } label: {
            HStack(spacing: 8) {
                Glimt31Mark(size: 18, state: .done, dark: true)
                Text("Glimt svarte ↑").font(PF.ui(13.5, .bold)).foregroundStyle(Color(hex: "#f6f2ea")).lineLimit(1)
            }
            .padding(.leading, 10).padding(.trailing, 16)
            .frame(height: 40)
            .background(Color(hex: "#161412").opacity(0.9), in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.35), radius: 14, y: 8)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Glimt svarte. Vis svaret")
    }
}
