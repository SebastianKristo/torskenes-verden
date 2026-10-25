import SwiftUI
import UIKit

/* ---------------- Prompt 31: Glimt – AI-agenten i Nordlys OS (merket og animasjonen) ---------------- */
// Fasit: design/Glimt AI.dc.html (mark(), fire tilstander) og Mobil Papir App.dc.html (aiSpark).
// prompts/prompt-31-pakke/claude-code-glimt-ai.md + claude-code-ai-animasjon.md.
// Ring: AngularGradient #b23a2a → #e8794a → #7a5ad6 → #3fbf9a (strek ≈ 6 % av størrelsen), roterer.
// Stjerne: 4-spisset glimt i gradient #ffb38a → #ff5a3c som puster/pulserer. To små glimt tindrer forskjøvet (0,2 s og 0,8 s).
// Over 60 pt: myk glød bak. Ferdig: grønn ring som stopper og en hake som spretter inn (.4 → 1.12 → 1, 450 ms).
// «Reduser bevegelse»: bare langsom puls, ingen rotasjon.

enum Glimt31State: Equatable {
    /// Rolig: ringen roterer sakte (6 s), stjernen puster (3,2 s).
    case ready
    /// Ringen spinner raskt (1,4 s), stjernen pulserer og vris 45° (1,2 s).
    case thinking
    /// Roligere mens svaret skrives (2,6 s / 2 s).
    case answering
    /// Grønn ring, hake.
    case done
}

enum Glimt31 {
    static let name: String = "Glimt"
    static let ringColors: [Color] = [Color(hex: "#b23a2a"), Color(hex: "#e8794a"), Color(hex: "#7a5ad6"), Color(hex: "#3fbf9a"), Color(hex: "#b23a2a")]
    static let green: Color = Color(hex: "#3fbf9a")
    static let starTop: Color = Color(hex: "#ffb38a")
    static let starBottom: Color = Color(hex: "#ff5a3c")
    static let peach: Color = Color(hex: "#ffd9c2")

    static func spinPeriod(_ s: Glimt31State) -> Double {
        switch s {
        case .ready: return 6
        case .thinking: return 1.4
        case .answering: return 2.6
        case .done: return 0
        }
    }

    static func pulsePeriod(_ s: Glimt31State) -> Double {
        switch s {
        case .ready: return 3.2
        case .thinking: return 1.2
        case .answering: return 2
        case .done: return 0
        }
    }

    /// 0…1…0 over perioden (myk sinus).
    static func wave(_ t: Double, _ period: Double, offset: Double = 0) -> Double {
        if period <= 0 { return 0 }
        let x: Double = ((t + offset).truncatingRemainder(dividingBy: period)) / period
        return 0.5 - 0.5 * cos(x * 2 * Double.pi)
    }
}

/// Den firespissede stjernen (samme bane som i fasiten, viewBox 24×24).
struct Glimt31Star: Shape {
    func path(in rect: CGRect) -> Path {
        let s: CGFloat = Swift.min(rect.width, rect.height) / 24
        let ox: CGFloat = rect.midX - 12 * s
        let oy: CGFloat = rect.midY - 12 * s
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
        var p: Path = Path()
        p.move(to: pt(12, 1.5))
        p.addCurve(to: pt(21.5, 11), control1: pt(12.6, 6.4), control2: pt(16.6, 10.4))
        p.addLine(to: pt(21.5, 13))
        p.addCurve(to: pt(12, 22.5), control1: pt(16.6, 13.6), control2: pt(12.6, 17.6))
        p.addCurve(to: pt(2.5, 13), control1: pt(11.4, 17.6), control2: pt(7.4, 13.6))
        p.addLine(to: pt(2.5, 11))
        p.addCurve(to: pt(12, 1.5), control1: pt(7.4, 10.4), control2: pt(11.4, 6.4))
        p.closeSubpath()
        return p
    }
}

/// Glimt-merket i valgfri størrelse og tilstand. Toast 24, søkefelt 26, Chat 22, boble 28, stort (System/tom Chat) 64+.
struct Glimt31Mark: View {
    let size: CGFloat
    var state: Glimt31State = .ready
    /// Mørk bakgrunn: det store glimtet er hvitt med glød.
    var dark: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: state == .done)) { (ctx: TimelineViewDefaultContext) in
            let t: Double = ctx.date.timeIntervalSinceReferenceDate
            Glimt31Frame(size: size, state: state, dark: dark, reduce: reduce, t: t)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Én ramme av animasjonen (ren funksjon av tiden t).
struct Glimt31Frame: View {
    let size: CGFloat
    let state: Glimt31State
    let dark: Bool
    let reduce: Bool
    let t: Double

    var body: some View {
        let done: Bool = state == .done
        let bw: CGFloat = Swift.max(2.2, size * 0.06)
        ZStack {
            if size > 60 { glow }
            ring(bw)
            if done {
                Glimt31Check(size: size)
            } else {
                star
                twinkles
            }
        }
        .frame(width: size, height: size)
    }

    private var spinAngle: Double {
        if reduce || state == .done { return 0 }
        let per: Double = Glimt31.spinPeriod(state)
        return (t.truncatingRemainder(dividingBy: per) / per) * 360
    }

    @ViewBuilder private func ring(_ bw: CGFloat) -> some View {
        if state == .done {
            Circle().strokeBorder(Glimt31.green, lineWidth: bw)
        } else {
            Circle()
                .strokeBorder(AngularGradient(colors: Glimt31.ringColors, center: .center), lineWidth: bw)
                .rotationEffect(.degrees(spinAngle))
        }
    }

    private var star: some View {
        let per: Double = reduce ? 3.2 : Glimt31.pulsePeriod(state)
        let w: Double = Glimt31.wave(t, per)
        let breath: Bool = state == .ready || reduce
        let scale: Double = breath ? 0.92 + 0.08 * w : 0.8 + 0.26 * w
        let rot: Double = breath ? 0 : 45 * w
        let grad: LinearGradient = LinearGradient(colors: [Glimt31.starTop, Glimt31.starBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
        return Glimt31Star()
            .fill(grad)
            .frame(width: size * 0.58, height: size * 0.58)
            .scaleEffect(scale)
            .rotationEffect(.degrees(rot))
            .opacity(breath ? 1 : 0.85 + 0.15 * w)
    }

    @ViewBuilder private var twinkles: some View {
        if !reduce {
            let a: Double = Glimt31.wave(t, 1.4, offset: -0.2)
            let b: Double = Glimt31.wave(t, 1.4, offset: -0.8)
            let big: CGFloat = Swift.max(3, size * 0.16)
            let small: CGFloat = Swift.max(2.5, size * 0.1)
            ZStack {
                Circle().fill(dark ? Color.white : Glimt31.peach)
                    .frame(width: big, height: big)
                    .shadow(color: dark ? Color.white.opacity(0.8) : Color.clear, radius: size * 0.05)
                    .scaleEffect(0.3 + 0.7 * a)
                    .opacity(a)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: size * 0.02, y: -size * 0.02)
                Circle().fill(Glimt31.peach)
                    .frame(width: small, height: small)
                    .scaleEffect(0.3 + 0.7 * b)
                    .opacity(b)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .offset(x: -size * 0.04, y: -size * 0.02)
            }
            .frame(width: size, height: size)
        }
    }

    private var glow: some View {
        let per: Double = state == .thinking ? 1.6 : 4
        let w: Double = reduce ? 0.5 : Glimt31.wave(t, per)
        let colors: [Color] = state == .done
            ? [Glimt31.green.opacity(0.45), Color.clear]
            : [Color(hex: "#e8794a").opacity(0.4), Color(hex: "#7a5ad6").opacity(0.18), Color.clear]
        return Circle()
            .fill(RadialGradient(colors: colors, center: .center, startRadius: 0, endRadius: size * 0.85))
            .frame(width: size * 1.7, height: size * 1.7)
            .scaleEffect(0.9 + 0.2 * w)
            .opacity(0.35 + 0.35 * w)
            .allowsHitTesting(false)
    }
}

/// Haken som spretter inn når Glimt er ferdig.
struct Glimt31Check: View {
    let size: CGFloat
    @State private var shown: Bool = false

    var body: some View {
        Image(systemName: "checkmark")
            .font(.dyn51(size: size * 0.4, weight: .heavy))
            .foregroundStyle(Glimt31.green)
            .scaleEffect(shown ? 1 : 0.4)
            .opacity(shown ? 1 : 0)
            .onAppear {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) { shown = true }
            }
    }
}

/// Tre hoppende prikker (toast mens Glimt jobber).
struct Glimt31Dots: View {
    var color: Color = Color(hex: "#f3efe6")
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let t: Double = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { (i: Int) in
                    Glimt31Dot(color: color, t: t, i: i, reduce: reduce)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

struct Glimt31Dot: View {
    let color: Color
    let t: Double
    let i: Int
    let reduce: Bool

    var body: some View {
        // gDot: 0–80–100 % rolig, topp ved 40 %.
        let per: Double = 1.2
        let x: Double = ((t - Double(i) * 0.15).truncatingRemainder(dividingBy: per) + per).truncatingRemainder(dividingBy: per) / per
        let k: Double = x < 0.8 ? Swift.max(0, 1 - abs(x - 0.4) / 0.4) : 0
        let up: Double = reduce ? 0 : k
        return Circle().fill(color)
            .frame(width: 4, height: 4)
            .opacity(0.25 + 0.75 * up)
            .offset(y: CGFloat(-3 * up))
    }
}

/// «✦ Glimt»-ikonet i en lab-sirkel (søkemotor-menyen), statisk.
struct Glimt31Badge: View {
    @Environment(\.paper) private var p
    var size: CGFloat = 20

    var body: some View {
        Text("✦").font(PF.ui(size * 0.55, .bold)).foregroundStyle(p.onLab)
            .frame(width: size, height: size)
            .background(p.lab, in: Circle())
    }
}
