import SwiftUI

/* ---------------- Prompt 40: samme lukkeknapp (✕) overalt i Vær + glass-stripe bak statuslinja ----------------
   prompts/prompt-40-pakke/claude-code-vaer-lukk-x.md og claude-code-vaer-topp-tekst.md (fasit design/Vaer.dc.html og
   Yr mot Storm Design.dc.html 2a).
   – VaerCloseButton: 42 × 42 pt sirkel, rgba(255,255,255,.22) + blur(12), hvit ✕ 17 pt (strek 2,8, runde ender), «Lukk»,
     trykkflate 44 pt, lett haptikk. Over kart (lys bakgrunn): mørk glass rgba(10,20,35,.62). Brukes på hovedsiden, Yr mot Storm,
     kartet, Steder og alle detaljark (ingen egne varianter).
   – VaerDoneButton40: «Ferdig» som hvit pille (42 pt høy) mens man redigerer rekkefølgen i Yr mot Storm.
   – Vaer40TopGlass: tonet himmel rgba(34,58,92,.62 → 0) + blur(18) bak statuslinja og topplinja, fader ut nederst. */

/// Krysset tegnet som to streker (17 pt, strek 2,8, runde ender).
struct Vaer40Cross: Shape {
    func path(in r: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.move(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        return p
    }
}

/// Felles ✕ i Vær (hovedsiden, Yr mot Storm, kart, Steder og detaljark).
struct VaerCloseButton: View {
    /// true = over kart / lys bakgrunn (mørk glass for kontrast).
    var dark: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            Haptic30.light()
            action()
        } label: {
            ZStack {
                Circle().fill(.ultraThinMaterial)
                Circle().fill(dark ? Color(red: 10 / 255, green: 20 / 255, blue: 35 / 255).opacity(0.62) : Color.white.opacity(0.22))
                Vaer40Cross()
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
                    .frame(width: 12, height: 12)
            }
            .frame(width: 42, height: 42)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lukk")
    }
}

/// «Ferdig» mens kortene redigeres (hvit pille, 42 pt høy).
struct VaerDoneButton40: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptic30.light()
            action()
        } label: {
            Text("Ferdig").font(.dyn51(size: 15, weight: .bold))
                .foregroundStyle(Color(hex: "#22395a"))
                .padding(.horizontal, 18).frame(height: 42)
                .background(Color.white, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Glass-stripen bak statuslinja + topplinja i Vær-popupen. Usynlig helt øverst, tones inn med bynavnet.
struct Vaer40TopGlass: View {
    let visible: Bool

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            LinearGradient(colors: [Color(red: 34 / 255, green: 58 / 255, blue: 92 / 255).opacity(0.62),
                                    Color(red: 34 / 255, green: 58 / 255, blue: 92 / 255).opacity(0)],
                           startPoint: .top, endPoint: .bottom)
        }
        .mask(LinearGradient(stops: [.init(color: Color.black, location: 0), .init(color: Color.black, location: 0.7),
                                     .init(color: Color.black.opacity(0), location: 1)], startPoint: .top, endPoint: .bottom))
        .saturation(1.3)
        .ignoresSafeArea(edges: .top)
        .opacity(visible ? 1 : 0)
        .animation(.easeOut(duration: 0.2), value: visible)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
