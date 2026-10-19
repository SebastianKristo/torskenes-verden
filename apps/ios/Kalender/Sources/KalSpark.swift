import SwiftUI

/* ---------------- Prompt 33: Glimt-stjernen og orben (spark() og orb() i fasiten) ---------------- */
// aiSpin: konisk regnbuering som roterer (3,2 s rolig, 1 s raskt). aiPulse: stjernen pulser og vris 45°. aiTw: to gnister.
// glBreath: orben puster (3,6 s i ro, 1,1 s når den tenker). «Reduser bevegelse»: ingen rotasjon, bare rolig fade.

enum KalAnim {
    static let ring: [Color] = [Color(kalHex: "#b23a2a"), Color(kalHex: "#e8794a"), Color(kalHex: "#7a5ad6"), Color(kalHex: "#3fbf9a"), Color(kalHex: "#b23a2a")]
    static let glow: [Color] = [Color(kalHex: "#b23a2a"), Color(kalHex: "#e8794a"), Color(kalHex: "#f2c14e"), Color(kalHex: "#3fbf9a"), Color(kalHex: "#7a5ad6"), Color(kalHex: "#b23a2a")]
    static let starTop: Color = Color(kalHex: "#ffb38a")
    static let starBottom: Color = Color(kalHex: "#ff5a3c")
    static let peach: Color = Color(kalHex: "#ffd9c2")

    /// 0…1…0 over perioden.
    static func wave(_ t: Double, _ period: Double, offset: Double = 0) -> Double {
        if period <= 0 { return 0 }
        let x: Double = ((t + offset).truncatingRemainder(dividingBy: period)) / period
        return 0.5 - 0.5 * cos(x * 2 * Double.pi)
    }

    static func turn(_ t: Double, _ period: Double) -> Double {
        if period <= 0 { return 0 }
        return (t.truncatingRemainder(dividingBy: period) / period) * 360
    }
}

/// Den firespissede stjernen (viewBox 24×24).
struct KalStar: Shape {
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

/// Stjernen med ring (feltet nederst, kortene, svarene).
struct KalSpark: View {
    let size: CGFloat
    var fast: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { (ctx: TimelineViewDefaultContext) in
            KalSparkFrame(size: size, fast: fast, reduce: reduce, t: ctx.date.timeIntervalSinceReferenceDate)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct KalSparkFrame: View {
    let size: CGFloat
    let fast: Bool
    let reduce: Bool
    let t: Double

    var body: some View {
        ZStack {
            ring
            star
            if !reduce { sparks }
        }
        .frame(width: size, height: size)
    }

    private var ring: some View {
        let angle: Double = reduce ? 0 : KalAnim.turn(t, fast ? 1 : 3.2)
        let bw: CGFloat = Swift.max(2, size * 0.1)
        return Circle()
            .strokeBorder(AngularGradient(colors: KalAnim.ring, center: .center), lineWidth: bw)
            .rotationEffect(.degrees(angle))
    }

    private var star: some View {
        let w: Double = KalAnim.wave(t, reduce ? 3.2 : (fast ? 0.9 : 1.8))
        let scale: Double = reduce ? 0.92 + 0.06 * w : 0.78 + 0.3 * w
        let rot: Double = reduce ? 0 : 45 * w
        let grad: LinearGradient = LinearGradient(colors: [KalAnim.starTop, KalAnim.starBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
        return KalStar()
            .fill(grad)
            .frame(width: size * 0.58, height: size * 0.58)
            .scaleEffect(scale)
            .rotationEffect(.degrees(rot))
            .opacity(0.85 + 0.15 * w)
    }

    private var sparks: some View {
        let a: Double = KalAnim.wave(t, 1.4, offset: -0.2)
        let b: Double = KalAnim.wave(t, 1.4, offset: -0.8)
        return ZStack {
            Circle().fill(KalAnim.peach).frame(width: 4, height: 4)
                .scaleEffect(0.4 + 0.6 * a).opacity(a)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .offset(x: 1, y: -1)
            Circle().fill(KalAnim.peach).frame(width: 3, height: 3)
                .scaleEffect(0.4 + 0.6 * b).opacity(b)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .offset(x: -1, y: 0)
        }
        .frame(width: size, height: size)
    }
}

/// Orben i Glimt-panelet (42 i toppen, 92 i tom tilstand).
struct KalOrb: View {
    let size: CGFloat
    var thinking: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { (ctx: TimelineViewDefaultContext) in
            KalOrbFrame(size: size, thinking: thinking, reduce: reduce, t: ctx.date.timeIntervalSinceReferenceDate)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct KalOrbFrame: View {
    @Environment(\.kal) private var th
    let size: CGFloat
    let thinking: Bool
    let reduce: Bool
    let t: Double

    var body: some View {
        let breath: Double = KalAnim.wave(t, thinking ? 1.1 : 3.6)
        let scale: Double = reduce ? 1 : 0.92 + 0.14 * breath
        ZStack {
            glow
            ring
            Circle().fill(th.card).padding(size * 0.09)
            KalSparkFrame(size: size * 0.5, fast: thinking, reduce: reduce, t: t)
        }
        .frame(width: size, height: size)
        .scaleEffect(scale)
        .opacity(reduce ? 0.85 + 0.15 * breath : 1)
    }

    private var glow: some View {
        let angle: Double = reduce ? 0 : KalAnim.turn(t, thinking ? 1.4 : 7)
        return Circle()
            .fill(AngularGradient(colors: KalAnim.glow, center: .center))
            .frame(width: size * 1.24, height: size * 1.24)
            .blur(radius: size * 0.16)
            .opacity(thinking ? 0.85 : 0.55)
            .rotationEffect(.degrees(angle))
            .allowsHitTesting(false)
    }

    private var ring: some View {
        let angle: Double = reduce ? 0 : -KalAnim.turn(t, thinking ? 1 : 4.5)
        return Circle()
            .fill(AngularGradient(colors: KalAnim.ring, center: .center, startAngle: .degrees(90), endAngle: .degrees(450)))
            .rotationEffect(.degrees(angle))
    }
}

/// «Glimt tenker» med skimmer (glShim).
struct KalShimmer: View {
    @Environment(\.kal) private var th
    @Environment(\.accessibilityReduceMotion) private var reduce
    let text: String

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let x: Double = reduce ? 0.5 : (ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.4)) / 1.4
            let p: CGFloat = CGFloat(1.5 - 2 * x)
            Text(text)
                .font(KalFont.ui(14, .bold))
                .foregroundStyle(LinearGradient(stops: [
                    Gradient.Stop(color: th.mut, location: 0),
                    Gradient.Stop(color: th.mut, location: 0.35),
                    Gradient.Stop(color: Color(kalHex: "#b23a2a"), location: 0.5),
                    Gradient.Stop(color: th.mut, location: 0.65),
                    Gradient.Stop(color: th.mut, location: 1),
                ], startPoint: UnitPoint(x: p - 1, y: 0.5), endPoint: UnitPoint(x: p + 1, y: 0.5)))
        }
    }
}

/// Rød blinkende markør mens teksten strømmer inn.
struct KalCaret: View {
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let w: Double = reduce ? 1 : KalAnim.wave(ctx.date.timeIntervalSinceReferenceDate, 0.9)
            RoundedRectangle(cornerRadius: 2).fill(Color(kalHex: "#b23a2a"))
                .frame(width: 7, height: 15)
                .opacity(0.2 + 0.8 * w)
        }
        .frame(width: 7, height: 15)
    }
}
