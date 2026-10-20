import SwiftUI

/* ---------------- Prompt 35: Glimt-familien – 13 figurer som SwiftUI-vektor ----------------
   Fasit: design/glimt-figurer.js (fig(id, størrelse, humør)) + keyframes i Glimt Figurer.dc.html (gfBob, gfSq, gfBlink, gfTalk,
   gfSpin, gfTw, gfZ, gfWave, gfHop, gfLeaf, gfGlow, gfOrb, gfOrbR, gfSway, gfDrip). prompts/prompt-35-pakke/claude-code-glimt-figurer.md.
   Hver figur er en ZStack med absolutt plasserte deler (samme mål som CSS: andeler av størrelsen S), og animasjonene regnes ut
   fra t (sekunder). t kommer fra TimelineView i appen; i widgetene er figuren stillestående (still = true, idle-positur).
   Humør: idle (svever og blunker), glad (^^-øyne, smil og hopp), talk (munnen beveger seg), sover (lukkede øyne og «z»).
   Delt mellom appen og widgetene (Shared). */

enum Glimt35Mood: String {
    case idle, glad, talk, sover

    static func from(_ s: String) -> Glimt35Mood {
        switch s.lowercased() {
        case "glad", "happy", "done": return .glad
        case "talk", "snakker": return .talk
        case "sov", "sover", "sleep": return .sover
        default: return .idle
        }
    }
}

/* ---------- Farger og hjelpere ---------- */

enum G35 {
    static func c(_ v: UInt32, _ a: Double = 1) -> Color { Brief34C.rgb(v, a) }

    static let ink: Color = c(0x1b1a17)
    static let cream: Color = c(0xfffdf8)
    static let cheek: Color = c(0xe8794a, 0.38)
    static let red: Color = c(0xb23a2a)
    static let rn: [Color] = [c(0xb23a2a), c(0xe8794a), c(0xf2c14e), c(0x3fbf9a), c(0x7a5ad6), c(0xb23a2a)]
    static let ps: [Color] = [c(0xf4a6a0), c(0xf7c9a0), c(0xf6e3a1), c(0xa8e0c8), c(0xc3b4ef), c(0xf4a6a0)]

    /// CSS conic-gradient(from 0deg, …): starter klokka 12 og går med klokka.
    static func conic(_ colors: [Color]) -> AngularGradient {
        AngularGradient(colors: colors, center: .center, startAngle: .degrees(-90), endAngle: .degrees(270))
    }

    /// CSS linear-gradient(<deg>, …): 180 = ovenfra og ned, 160 = litt mot høyre.
    static func lin(_ deg: Double, _ colors: [Color]) -> LinearGradient {
        let r: Double = deg * Double.pi / 180
        let vx: Double = sin(r) / 2
        let vy: Double = -cos(r) / 2
        return LinearGradient(colors: colors, startPoint: UnitPoint(x: 0.5 - vx, y: 0.5 - vy), endPoint: UnitPoint(x: 0.5 + vx, y: 0.5 + vy))
    }
}

/// Tid og animasjonskurver. still = ingen bevegelse (widgets og «Reduser bevegelse»).
struct G35T {
    let t: Double
    let still: Bool

    /// 0 → 1 → 0 over perioden (myk, som ease-in-out mellom to keyframes).
    func osc(_ period: Double, _ delay: Double = 0) -> Double {
        if still { return 0.5 }
        let x: Double = (t - delay) / period
        return (1 - cos(x * 2 * Double.pi)) / 2
    }

    /// 0 … 1 gjennom perioden.
    func phase(_ period: Double, _ delay: Double = 0) -> Double {
        let x: Double = (t - delay) / period
        return x - floor(x)
    }

    /// Mellom a (0 % / 100 %) og b (50 %).
    func between(_ a: Double, _ b: Double, _ period: Double, _ delay: Double = 0) -> Double {
        a + (b - a) * osc(period, delay)
    }

    /// gfSpin / gfOrb: grader.
    func spin(_ period: Double) -> Double {
        if still { return 0 }
        return phase(period) * 360
    }

    /// gfTw: opasitet .25 → 1, skala .6 → 1,1.
    func twOpacity(_ period: Double, _ delay: Double) -> Double {
        if still { return 1 }
        return 0.25 + 0.75 * osc(period, delay)
    }

    func twScale(_ period: Double, _ delay: Double) -> CGFloat {
        if still { return 1 }
        return CGFloat(0.6 + 0.5 * osc(period, delay))
    }

    /// gfBlink: 0–93 % åpen, 96 % lukket (.1), 100 % åpen.
    func blink(_ period: Double) -> CGFloat {
        if still { return 1 }
        let p: Double = phase(period)
        if p < 0.93 { return 1 }
        if p < 0.96 { return CGFloat(1 - 0.9 * (p - 0.93) / 0.03) }
        return CGFloat(0.1 + 0.9 * (p - 0.96) / 0.04)
    }

    /// gfTalk: scaleY .4 ↔ 1 (0,3 s).
    var talk: CGFloat {
        if still { return 1 }
        return CGFloat(0.4 + 0.6 * osc(0.3))
    }
}

/* ---------- Former ---------- */

/// CSS border-radius med elliptiske hjørner som andeler av bredde (h) og høyde (v). Skaleres ned som i CSS når summen > 100 %.
struct G35Round: Shape {
    var h: [CGFloat]
    var v: [CGFloat]

    /// Samme andel horisontalt og vertikalt (tl, tr, br, bl).
    init(_ tl: CGFloat, _ tr: CGFloat, _ br: CGFloat, _ bl: CGFloat) {
        h = [tl, tr, br, bl]
        v = [tl, tr, br, bl]
    }

    init(h: [CGFloat], v: [CGFloat]) {
        self.h = h
        self.v = v
    }

    func path(in r: CGRect) -> Path {
        let w: CGFloat = r.width
        let hh: CGFloat = r.height
        var f: CGFloat = 1
        let sums: [CGFloat] = [h[0] + h[1], h[3] + h[2], v[0] + v[3], v[1] + v[2]]
        for s in sums where s > 1 { f = Swift.min(f, 1 / s) }
        let tl: CGSize = CGSize(width: h[0] * f * w, height: v[0] * f * hh)
        let tr: CGSize = CGSize(width: h[1] * f * w, height: v[1] * f * hh)
        let br: CGSize = CGSize(width: h[2] * f * w, height: v[2] * f * hh)
        let bl: CGSize = CGSize(width: h[3] * f * w, height: v[3] * f * hh)
        let k: CGFloat = 0.5523
        var p: Path = Path()
        p.move(to: CGPoint(x: r.minX + tl.width, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - tr.width, y: r.minY))
        p.addCurve(to: CGPoint(x: r.maxX, y: r.minY + tr.height),
                   control1: CGPoint(x: r.maxX - tr.width + k * tr.width, y: r.minY),
                   control2: CGPoint(x: r.maxX, y: r.minY + tr.height - k * tr.height))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - br.height))
        p.addCurve(to: CGPoint(x: r.maxX - br.width, y: r.maxY),
                   control1: CGPoint(x: r.maxX, y: r.maxY - br.height + k * br.height),
                   control2: CGPoint(x: r.maxX - br.width + k * br.width, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + bl.width, y: r.maxY))
        p.addCurve(to: CGPoint(x: r.minX, y: r.maxY - bl.height),
                   control1: CGPoint(x: r.minX + bl.width - k * bl.width, y: r.maxY),
                   control2: CGPoint(x: r.minX, y: r.maxY - bl.height + k * bl.height))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + tl.height))
        p.addCurve(to: CGPoint(x: r.minX + tl.width, y: r.minY),
                   control1: CGPoint(x: r.minX, y: r.minY + tl.height - k * tl.height),
                   control2: CGPoint(x: r.minX + tl.width - k * tl.width, y: r.minY))
        p.closeSubpath()
        return p
    }
}

/// Mangekant med punkter som andeler (clip-path: polygon(…), og CSS-trekantene til Ugle).
struct G35Poly: Shape {
    let pts: [CGPoint]

    func path(in r: CGRect) -> Path {
        var p: Path = Path()
        guard let first = pts.first else { return p }
        p.move(to: CGPoint(x: r.minX + first.x * r.width, y: r.minY + first.y * r.height))
        for q in pts.dropFirst() {
            p.addLine(to: CGPoint(x: r.minX + q.x * r.width, y: r.minY + q.y * r.height))
        }
        p.closeSubpath()
        return p
    }

    /// polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)
    static let star: G35Poly = G35Poly(pts: [
        CGPoint(x: 0.5, y: 0), CGPoint(x: 0.61, y: 0.35), CGPoint(x: 0.98, y: 0.35), CGPoint(x: 0.68, y: 0.57), CGPoint(x: 0.79, y: 0.91),
        CGPoint(x: 0.5, y: 0.7), CGPoint(x: 0.21, y: 0.91), CGPoint(x: 0.32, y: 0.57), CGPoint(x: 0.02, y: 0.35), CGPoint(x: 0.39, y: 0.35),
    ])
}

/// Gnisten: M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z (24-rute).
struct G35SparkShape: Shape {
    func path(in r: CGRect) -> Path {
        let k: CGFloat = r.width / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
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

/// Øvre (glad ^) eller nedre (sover ‿) halvdel av en ellipse, som CSS border-top / border-bottom med 50 % radius.
struct G35HalfArc: Shape {
    let up: Bool

    func path(in r: CGRect) -> Path {
        var p: Path = Path()
        let c: CGPoint = CGPoint(x: r.midX, y: up ? r.maxY : r.minY)
        let rx: CGFloat = r.width / 2
        let ry: CGFloat = r.height
        let k: CGFloat = 0.5523
        let s: CGFloat = up ? -1 : 1
        p.move(to: CGPoint(x: c.x - rx, y: c.y))
        p.addCurve(to: CGPoint(x: c.x, y: c.y + s * ry), control1: CGPoint(x: c.x - rx, y: c.y + s * ry * k), control2: CGPoint(x: c.x - rx * k, y: c.y + s * ry))
        p.addCurve(to: CGPoint(x: c.x + rx, y: c.y), control1: CGPoint(x: c.x + rx * k, y: c.y + s * ry), control2: CGPoint(x: c.x + rx, y: c.y + s * ry * k))
        return p
    }
}

/// Rolig munn: border-bottom på en boks med avrundede nedre hjørner (en flat U).
struct G35Smile: Shape {
    func path(in r: CGRect) -> Path {
        let rr: CGFloat = Swift.min(r.height, r.width / 2)
        let k: CGFloat = 0.5523
        var p: Path = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY - rr))
        p.addCurve(to: CGPoint(x: r.minX + rr, y: r.maxY), control1: CGPoint(x: r.minX, y: r.maxY - rr + rr * k), control2: CGPoint(x: r.minX + rr - rr * k, y: r.maxY))
        p.addLine(to: CGPoint(x: r.maxX - rr, y: r.maxY))
        p.addCurve(to: CGPoint(x: r.maxX, y: r.maxY - rr), control1: CGPoint(x: r.maxX - rr + rr * k, y: r.maxY), control2: CGPoint(x: r.maxX, y: r.maxY - rr + rr * k))
        return p
    }
}

/// Indre skygge (CSS box-shadow: inset dx dy 0 farge): delen av formen som ikke dekkes av formen forskjøvet.
struct G35Inset<S: Shape>: View {
    let shape: S
    let color: Color
    let dx: CGFloat
    let dy: CGFloat

    var body: some View {
        shape.fill(color)
            .mask {
                ZStack {
                    shape.fill(Color.black)
                    shape.fill(Color.black).offset(x: dx, y: dy).blendMode(.destinationOut)
                }
                .compositingGroup()
            }
    }
}

/// Farget kant på deler av en ellipse (CSS border-top/right/bottom/left på border-radius: 50 %).
/// Andelene går med klokka fra klokka 3 (SwiftUI-ellipsens start). Topp = .625–.875, høyre = .875–1,125, bunn = .125–.375, venstre = .375–.625.
struct G35Edge: View {
    let from: CGFloat
    let to: CGFloat
    let color: Color
    let lw: CGFloat

    var body: some View {
        ZStack {
            if to > 1 {
                Ellipse().inset(by: lw / 2).trim(from: from, to: 1).stroke(color, lineWidth: lw)
                Ellipse().inset(by: lw / 2).trim(from: 0, to: to - 1).stroke(color, lineWidth: lw)
            } else {
                Ellipse().inset(by: lw / 2).trim(from: from, to: to).stroke(color, lineWidth: lw)
            }
        }
    }
}

extension View {
    /// Absolutt plassering i en ZStack(alignment: .topLeading): left, top, width, height.
    func g35(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> some View {
        self.frame(width: w, height: h, alignment: .topLeading).offset(x: x, y: y)
    }

    /// Som g35, med rotasjon rundt et ankerpunkt (transform-origin).
    func g35r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ deg: Double, _ anchor: UnitPoint = .center) -> some View {
        self.frame(width: w, height: h, alignment: .topLeading).rotationEffect(.degrees(deg), anchor: anchor).offset(x: x, y: y)
    }
}

/* ---------- Felles deler ---------- */

/// gfTw-gnist (fireuddet stjerne) som blinker.
struct G35Spark: View {
    let x: CGFloat
    let y: CGFloat
    let sz: CGFloat
    let color: Color
    var delay: Double = 0
    var period: Double = 1.8
    let a: G35T

    var body: some View {
        G35SparkShape().fill(color)
            .frame(width: sz, height: sz)
            .scaleEffect(a.twScale(period, delay))
            .opacity(a.twOpacity(period, delay))
            .offset(x: x, y: y)
    }
}

/// Regnbueringen (mask: ring med tykkelse t), roterer.
struct G35RingV: View {
    let x: CGFloat
    let y: CGFloat
    let d: CGFloat
    let thick: CGFloat
    let colors: [Color]
    let angle: Double

    var body: some View {
        Circle()
            .strokeBorder(G35.conic(colors), lineWidth: thick)
            .frame(width: d, height: d)
            .rotationEffect(.degrees(angle))
            .offset(x: x, y: y)
    }
}

/// gfGlow: uskarp glorie som «puster» (opasitet .55–.9, skala .96–1,06).
struct G35Glow: View {
    let x: CGFloat
    let y: CGFloat
    let d: CGFloat
    let blur: CGFloat
    let period: Double
    let a: G35T

    var body: some View {
        let k: Double = a.osc(period)
        Circle().fill(G35.conic(G35.rn))
            .frame(width: d, height: d)
            .blur(radius: blur)
            .scaleEffect(CGFloat(0.96 + 0.1 * k))
            .opacity(0.55 + 0.35 * k)
            .offset(x: x, y: y)
    }
}

/// «z» som flyter opp når figuren sover (gfZ 2,4 s, to stk. forskjøvet 1,2 s).
struct G35Zz: View {
    let S: CGFloat
    let W: CGFloat
    let color: Color
    let a: G35T

    var body: some View {
        ZStack(alignment: .topLeading) {
            zed(0)
            zed(1)
        }
    }

    private func zed(_ i: Int) -> some View {
        let p: Double = a.still ? (i == 0 ? 0.35 : 0.75) : a.phase(2.4, Double(i) * 1.2)
        let op: Double = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7
        let fs: CGFloat = S * 0.14
        let x: CGFloat = W + S * 0.05 - fs * 0.6
        return Text("z")
            .font(.custom("Manrope-ExtraBold", size: fs))
            .foregroundStyle(color)
            .fixedSize()
            .scaleEffect(CGFloat(0.6 + 0.5 * p))
            .opacity(Swift.max(0, op))
            .offset(x: x + CGFloat(14 * p), y: S * 0.02 - CGFloat(26 * p))
    }
}

/// Valg for fjeset (o i face()).
struct G35FaceOpt {
    var ey: CGFloat = 0.4
    var gap: CGFloat = 0.27
    var ew: CGFloat = 0.09
    var eh: CGFloat = 0.13
    var my: CGFloat = 0.6
    var cx: CGFloat = 0.14
    var cy: CGFloat = 0.54
}

/// face(S, humør, blekk, kinn, o): øyne, kinn og munn i en boks w × h (prosentene gjelder boksen, målene gjelder sf).
struct G35Face: View {
    let w: CGFloat
    let h: CGFloat
    let sf: CGFloat
    let mood: Glimt35Mood
    let ink: Color
    let cheek: Color
    var o: G35FaceOpt = G35FaceOpt()
    var mouth: Bool = true
    let a: G35T

    var body: some View {
        ZStack(alignment: .topLeading) {
            G35Eye(w: w, h: h, sf: sf, mood: mood, ink: ink, o: o, left: true, a: a)
            G35Eye(w: w, h: h, sf: sf, mood: mood, ink: ink, o: o, left: false, a: a)
            Ellipse().fill(cheek).g35(o.cx * w, o.cy * h, sf * 0.12, sf * 0.07)
            Ellipse().fill(cheek).g35(w - o.cx * w - sf * 0.12, o.cy * h, sf * 0.12, sf * 0.07)
            if mouth { G35Mouth(w: w, h: h, sf: sf, mood: mood, ink: ink, my: o.my, a: a) }
        }
        .frame(width: w, height: h, alignment: .topLeading)
    }
}

struct G35Eye: View {
    let w: CGFloat
    let h: CGFloat
    let sf: CGFloat
    let mood: Glimt35Mood
    let ink: Color
    let o: G35FaceOpt
    let left: Bool
    let a: G35T

    var body: some View {
        let ew: CGFloat = sf * o.ew
        let eh: CGFloat = sf * o.eh
        if mood == .glad {
            let ww: CGFloat = ew * 1.5
            let bw: CGFloat = sf * 0.035
            G35HalfArc(up: true).inset(bw / 2).stroke(ink, style: StrokeStyle(lineWidth: bw, lineCap: .round))
                .g35(xPos(ww), o.ey * h, ww, ew * 0.9)
        } else if mood == .sover {
            let ww: CGFloat = ew * 1.5
            let bw: CGFloat = sf * 0.03
            G35HalfArc(up: false).inset(bw / 2).stroke(ink, style: StrokeStyle(lineWidth: bw, lineCap: .round))
                .g35(xPos(ww), o.ey * h + eh * 0.4, ww, ew * 0.8)
        } else {
            ZStack(alignment: .topLeading) {
                Capsule().fill(ink).frame(width: ew, height: eh)
                Circle().fill(Color.white).g35(ew * 0.18, eh * 0.14, ew * 0.38, ew * 0.38)
            }
            .frame(width: ew, height: eh, alignment: .topLeading)
            .scaleEffect(x: 1, y: a.blink(4.2), anchor: .center)
            .offset(x: xPos(ew), y: o.ey * h)
        }
    }

    private func xPos(_ ww: CGFloat) -> CGFloat {
        left ? o.gap * w : w - o.gap * w - ww
    }
}

extension G35HalfArc {
    func inset(_ d: CGFloat) -> some Shape { G35Inset2(base: self, d: d) }
}

extension G35Smile {
    func inset(_ d: CGFloat) -> some Shape { G35Inset2(base: self, d: d) }
}

/// Krymper en åpen sti med d på alle kanter (så streken ligger innenfor boksen, som en CSS-kant).
struct G35Inset2<B: Shape>: Shape {
    let base: B
    let d: CGFloat

    func path(in r: CGRect) -> Path {
        base.path(in: r.insetBy(dx: Swift.min(d, r.width / 2), dy: Swift.min(d, r.height / 2)))
    }
}

struct G35Mouth: View {
    let w: CGFloat
    let h: CGFloat
    let sf: CGFloat
    let mood: Glimt35Mood
    let ink: Color
    let my: CGFloat
    let a: G35T

    var body: some View {
        let y: CGFloat = my * h
        switch mood {
        case .talk:
            G35Round(0.45, 0.45, 0.45, 0.45).fill(G35.red)
                .frame(width: sf * 0.16, height: sf * 0.12)
                .scaleEffect(x: 1, y: a.talk, anchor: UnitPoint(x: 0.5, y: 0.3))
                .offset(x: w / 2 - sf * 0.08, y: y)
        case .sover:
            Circle().fill(ink).opacity(0.6).g35(w / 2 - sf * 0.035, y, sf * 0.07, sf * 0.07)
        case .glad:
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: sf * 0.1, bottomTrailingRadius: sf * 0.1, topTrailingRadius: 0)
                .fill(G35.red)
                .g35(w / 2 - sf * 0.1, y, sf * 0.2, sf * 0.1)
        case .idle:
            let bw: CGFloat = sf * 0.03
            G35Smile().inset(bw / 2).stroke(ink, style: StrokeStyle(lineWidth: bw, lineCap: .round))
                .g35(w / 2 - sf * 0.07, y, sf * 0.14, sf * 0.06)
        }
    }
}

/// wrap(): svev (gfBob 2,6 s), hopp med squash & stretch når glad (gfHop 1 s), pust når den sover (gfSq 3,6 s).
struct G35Wrap: ViewModifier {
    let S: CGFloat
    let hf: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    func body(content: Content) -> some View {
        let m: (CGFloat, CGFloat, CGFloat) = motion
        content
            .frame(width: S, height: S * hf, alignment: .topLeading)
            .scaleEffect(x: m.1, y: m.2, anchor: .bottom)
            .offset(y: m.0)
    }

    /// (dy, sx, sy)
    private var motion: (CGFloat, CGFloat, CGFloat) {
        if a.still { return (0, 1, 1) }
        let px: CGFloat = Swift.min(1, S / 60)
        switch mood {
        case .glad:
            return G35Wrap.hop(a.phase(1.0), px)
        case .sover:
            let k: CGFloat = CGFloat(a.osc(3.6))
            return (0, 1 + 0.04 * k, 1 - 0.04 * k)
        default:
            return (CGFloat(-6 * a.osc(2.6)) * px, 1, 1)
        }
    }

    /// gfHop: 0 % (0,1,1) · 30 % (0,1.08,.9) · 55 % (−16,.95,1.06) · 80 % (0,1.04,.96) · 100 % (0,1,1).
    static func hop(_ p: Double, _ px: CGFloat) -> (CGFloat, CGFloat, CGFloat) {
        let keys: [(Double, Double, Double, Double)] = [(0, 0, 1, 1), (0.3, 0, 1.08, 0.9), (0.55, -16, 0.95, 1.06), (0.8, 0, 1.04, 0.96), (1, 0, 1, 1)]
        var i: Int = 0
        while i < keys.count - 2 && p > keys[i + 1].0 { i += 1 }
        let k0: (Double, Double, Double, Double) = keys[i]
        let k1: (Double, Double, Double, Double) = keys[i + 1]
        let span: Double = Swift.max(0.0001, k1.0 - k0.0)
        let u0: Double = Swift.min(1, Swift.max(0, (p - k0.0) / span))
        let u: Double = u0 * u0 * (3 - 2 * u0)
        let dy: Double = k0.1 + (k1.1 - k0.1) * u
        let sx: Double = k0.2 + (k1.2 - k0.2) * u
        let sy: Double = k0.3 + (k1.3 - k0.3) * u
        return (CGFloat(dy) * px, CGFloat(sx), CGFloat(sy))
    }
}

/* ---------- Figuren ---------- */

/// fig(id, størrelse, humør). t = sekunder (TimelineView), still = stillestående (widgets / «Reduser bevegelse»).
struct Glimt35Fig: View {
    let id: String
    let size: CGFloat
    var mood: Glimt35Mood = .idle
    var t: Double = 0
    var still: Bool = false
    /// Prompt 40: ingen julepynt (figurvelgeren). Samme som `.glimt40NoJul()` rundt figuren.
    var noJul: Bool = false

    var body: some View {
        let a: G35T = G35T(t: t, still: still)
        let hf: CGFloat = Glimt35Fig.heightFactor(id)
        // Prompt 40: figurbiblioteket legger selv på juleantrekket når julemodus er aktiv (Glimt40Jul.swift).
        figure(a)
            .frame(width: size, height: size * hf, alignment: .topLeading)
            .overlay(alignment: .topLeading) {
                if !noJul { Glimt40DressAuto(S: size, H: size * hf, t: t, still: still) }
            }
            .modifier(G35Wrap(S: size, hf: hf, mood: mood, a: a))
            .accessibilityLabel(Glimt35Char.get(id).name)
    }

    @ViewBuilder private func figure(_ a: G35T) -> some View {
        switch id {
        case "halo": G35Halo(S: size, mood: mood, a: a)
        case "boble": G35Boble(S: size, mood: mood, a: a)
        case "antenne": G35Antenne(S: size, mood: mood, a: a)
        case "bane": G35Bane(S: size, mood: mood, a: a)
        case "pastell": G35Pastell(S: size, mood: mood, a: a)
        case "natt": G35Natt(S: size, mood: mood, a: a)
        case "sky": G35Sky(S: size, mood: mood, a: a)
        case "stjerne": G35Stjerne(S: size, mood: mood, a: a)
        case "drape": G35Drape(S: size, mood: mood, a: a)
        case "ugle": G35Ugle(S: size, mood: mood, a: a)
        case "gris": G35Gris(S: size, mood: mood, a: a)
        case "spire": G35Spire(S: size, mood: mood, a: a)
        default: G35Glimt(S: size, mood: mood, a: a)
        }
    }

    /// Høyden på rammen (wrap(S, mood, kids, h)) som andel av størrelsen.
    static func heightFactor(_ id: String) -> CGFloat {
        switch id {
        case "drape", "spire": return 1
        case "ugle", "gris": return 1.04
        default: return 1.1
        }
    }
}

/// Glimt: krem fjes i regnbuering (6 s / 1,4 s når den snakker) og oransje gnist over hodet.
struct G35Glimt: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 1.4 : 6
        let th: CGFloat = Swift.max(2.5, S * 0.07)
        ZStack(alignment: .topLeading) {
            G35Spark(x: S * 0.4, y: -S * 0.04, sz: S * 0.2, color: G35.c(0xff7a52), a: a)
            G35RingV(x: 0, y: S * 0.12, d: S, thick: th, colors: G35.rn, angle: a.spin(sp))
            ZStack(alignment: .topLeading) {
                Circle().fill(G35.cream).frame(width: S * 0.84, height: S * 0.84)
                G35Face(w: S * 0.84, h: S * 0.84, sf: S * 0.84, mood: mood, ink: G35.ink, cheek: G35.cheek, a: a)
            }
            .g35(S * 0.08, S * 0.2, S * 0.84, S * 0.84)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x7a5ad6), a: a) }
        }
    }
}

/// 2a Halo: tykk ring (11 %), uskarp glorie som puster og tre gnister.
struct G35Halo: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 1.4 : 6
        ZStack(alignment: .topLeading) {
            G35Glow(x: -S * 0.08, y: S * 0.04, d: S * 1.16, blur: S * 0.09, period: 3.2, a: a)
            G35RingV(x: 0, y: S * 0.12, d: S, thick: S * 0.11, colors: G35.rn, angle: a.spin(sp))
            ZStack(alignment: .topLeading) {
                Circle().fill(G35.cream).frame(width: S * 0.78, height: S * 0.78)
                G35Face(w: S * 0.78, h: S * 0.78, sf: S * 0.78, mood: mood, ink: G35.ink, cheek: G35.cheek, a: a)
            }
            .g35(S * 0.11, S * 0.23, S * 0.78, S * 0.78)
            G35Spark(x: -S * 0.06, y: S * 0.1, sz: S * 0.14, color: G35.c(0xf2c14e), delay: 0, a: a)
            G35Spark(x: S * 0.86, y: S * 0.02, sz: S * 0.18, color: G35.c(0xff7a52), delay: 0.6, a: a)
            G35Spark(x: S * 0.9, y: S * 0.8, sz: S * 0.12, color: G35.c(0x7a5ad6), delay: 1.1, a: a)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x7a5ad6), a: a) }
        }
    }
}

/// 2b Boble: glasskule, regnbuen roterer bak en krem kjerne (52 %), glanspunkt og lilla skygge.
struct G35Boble: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 2 : 9
        // radial-gradient(circle at 50% 55%, krem 0 52 %, …): 52 % av avstanden til lengste hjørne (0,743 S).
        let core: CGFloat = S * 0.386
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                Circle().fill(G35.conic(G35.rn)).frame(width: S, height: S)
                Circle().fill(G35.c(0xfffdf8, 0.96)).g35(S * 0.5 - core, S * 0.55 - core, core * 2, core * 2)
            }
            .frame(width: S, height: S, alignment: .topLeading)
            .rotationEffect(.degrees(a.spin(sp)))
            .shadow(color: G35.c(0x7a5ad6, 0.25), radius: S * 0.06, x: 0, y: S * 0.06)
            .offset(y: S * 0.1)
            G35BobleGloss(S: S).g35(0, S * 0.1, S, S)
            G35Face(w: S * 0.6, h: S * 0.6, sf: S * 0.6, mood: mood, ink: G35.ink, cheek: G35.cheek, a: a)
                .g35(S * 0.2, S * 0.3, S * 0.6, S * 0.6)
            Circle().fill(Color.white.opacity(0.9)).g35(S * 0.74, S * 0.2, S * 0.08, S * 0.08)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x7a5ad6), a: a) }
        }
    }
}

struct G35BobleGloss: View {
    let S: CGFloat

    var body: some View {
        let hi: RadialGradient = RadialGradient(stops: [
            .init(color: Color.white.opacity(0.95), location: 0),
            .init(color: Color.white.opacity(0.95), location: 0.333),
            .init(color: Color.white.opacity(0), location: 1),
        ], center: UnitPoint(x: 0.3, y: 0.24), startRadius: 0, endRadius: S * 0.186)
        let rim: RadialGradient = RadialGradient(stops: [
            .init(color: Color.clear, location: 0),
            .init(color: Color.clear, location: 0.816),
            .init(color: Color.white.opacity(0.35), location: 0.921),
            .init(color: Color.clear, location: 1),
        ], center: .center, startRadius: 0, endRadius: S * 0.537)
        ZStack {
            Circle().fill(rim)
            Circle().fill(hi)
        }
        .frame(width: S, height: S)
        .clipShape(Circle())
    }
}

/// 2c Antenne: originalringen (7,5 %), antenne med oransje stjerne som vipper og to armer (venstre vinker).
struct G35Antenne: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 1.4 : 6
        let waving: Bool = mood == .glad || mood == .talk
        let wave: Double = waving ? a.between(-12, 30, 1.2) : 0
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: S * 0.02).fill(G35.ink).frame(width: S * 0.03, height: S * 0.24)
                G35Spark(x: -S * 0.08, y: -S * 0.1, sz: S * 0.2, color: G35.c(0xff7a52), a: a)
            }
            .g35r(S * 0.485, -S * 0.08, S * 0.03, S * 0.24, a.between(-8, 8, 1.8), .bottom)
            RoundedRectangle(cornerRadius: S * 0.05).fill(G35.ink)
                .g35r(-S * 0.08, S * 0.6, S * 0.2, S * 0.09, wave, UnitPoint(x: 0.9, y: 0.5))
            RoundedRectangle(cornerRadius: S * 0.05).fill(G35.ink)
                .g35r(S * 0.88, S * 0.64, S * 0.2, S * 0.09, 14)
            G35RingV(x: 0, y: S * 0.14, d: S, thick: S * 0.075, colors: G35.rn, angle: a.spin(sp))
            ZStack(alignment: .topLeading) {
                Circle().fill(G35.cream).frame(width: S * 0.84, height: S * 0.84)
                G35Face(w: S * 0.84, h: S * 0.84, sf: S * 0.84, mood: mood, ink: G35.ink, cheek: G35.cheek, a: a)
            }
            .g35(S * 0.08, S * 0.22, S * 0.84, S * 0.84)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x7a5ad6), a: a) }
        }
    }
}

/// 2d Bane: krem kule og to elliptiske baner som går hver sin vei (4 s / 5,5 s, raskere når den snakker).
struct G35Bane: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let talk: Bool = mood == .talk
        ZStack(alignment: .topLeading) {
            ZStack {
                G35Edge(from: 0.625, to: 0.875, color: G35.c(0xe8794a), lw: S * 0.035)
                G35Edge(from: 0.875, to: 1.125, color: G35.c(0xf2c14e), lw: S * 0.035)
            }
            .g35r(-S * 0.12, S * 0.32, S * 1.24, S * 0.6, a.still ? -18 : a.spin(talk ? 1.2 : 4))
            ZStack {
                Circle().fill(G35.lin(160, [G35.c(0xfffdf8), G35.c(0xf1ece2)]))
                G35Inset(shape: Circle(), color: G35.c(0x1b1a17, 0.06), dx: 0, dy: -S * 0.05)
            }
            .g35(S * 0.06, S * 0.16, S * 0.88, S * 0.88)
            G35Face(w: S * 0.88, h: S * 0.88, sf: S * 0.88, mood: mood, ink: G35.ink, cheek: G35.cheek, a: a)
                .g35(S * 0.06, S * 0.16, S * 0.88, S * 0.88)
            ZStack {
                G35Edge(from: 0.125, to: 0.375, color: G35.c(0x3fbf9a), lw: S * 0.03)
                G35Edge(from: 0.375, to: 0.625, color: G35.c(0x7a5ad6), lw: S * 0.03)
            }
            .g35r(-S * 0.06, S * 0.2, S * 1.12, S * 0.8, a.still ? 24 : -a.spin(talk ? 1.6 : 5.5))
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x2b5d8a), a: a) }
        }
    }
}

/// 2e Pastell: tykk pastellring, større øyne, rosa kinn, oransje hårlokk og rosa gnist.
struct G35Pastell: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 1.8 : 8
        let fo: G35FaceOpt = G35FaceOpt(ew: 0.11, eh: 0.14, cx: 0.1, cy: 0.56)
        let face: RadialGradient = RadialGradient(colors: [G35.c(0xfffdf8), G35.c(0xfbf3ea)], center: UnitPoint(x: 0.5, y: 0.4), startRadius: 0, endRadius: S * 0.46)
        ZStack(alignment: .topLeading) {
            ZStack {
                G35Edge(from: 0.625, to: 1.125, color: G35.c(0xe8794a), lw: S * 0.035)
            }
            .g35r(S * 0.42, S * 0.02, S * 0.2, S * 0.18, -30)
            G35RingV(x: 0, y: S * 0.12, d: S, thick: S * 0.12, colors: G35.ps, angle: a.spin(sp))
            ZStack(alignment: .topLeading) {
                Circle().fill(face).frame(width: S * 0.76, height: S * 0.76)
                G35Face(w: S * 0.76, h: S * 0.76, sf: S * 0.76, mood: mood, ink: G35.c(0x3d2a2a), cheek: G35.c(0xf48c8c, 0.55), o: fo, a: a)
            }
            .g35(S * 0.12, S * 0.24, S * 0.76, S * 0.76)
            G35Spark(x: S * 0.84, y: S * 0.12, sz: S * 0.12, color: G35.c(0xf4a6a0), delay: 0.3, a: a)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0xc3b4ef), a: a) }
        }
    }
}

/// 2f Natt: mørkt fjes med lysende kremgule øyne og munn, regnbuering og svak glorie.
struct G35Natt: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let sp: Double = mood == .talk ? 1.4 : 6
        let face: RadialGradient = RadialGradient(colors: [G35.c(0x2a2a3a), G35.c(0x141420)], center: UnitPoint(x: 0.5, y: 0.35), startRadius: 0, endRadius: S * 0.55)
        ZStack(alignment: .topLeading) {
            G35Glow(x: -S * 0.06, y: S * 0.06, d: S * 1.12, blur: S * 0.08, period: 3.6, a: a)
            G35RingV(x: 0, y: S * 0.12, d: S, thick: S * 0.07, colors: G35.rn, angle: a.spin(sp))
            ZStack(alignment: .topLeading) {
                Circle().fill(face).frame(width: S * 0.84, height: S * 0.84)
                G35Face(w: S * 0.84, h: S * 0.84, sf: S * 0.84, mood: mood, ink: G35.c(0xffe7a8), cheek: G35.c(0xe8794a, 0.35), a: a)
            }
            .g35(S * 0.08, S * 0.2, S * 0.84, S * 0.84)
            G35Spark(x: S * 0.8, y: S * 0.04, sz: S * 0.14, color: G35.c(0xffe7a8), delay: 0.4, a: a)
            G35Spark(x: S * 0.02, y: S * 0.2, sz: S * 0.1, color: G35.c(0xc3b4ef), delay: 1, a: a)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0xffe7a8), a: a) }
        }
    }
}

/// Sky: hvit skybolle av tre sirkler, blågrå øyne og rosa kinn. Små regndråper drypper fra bunnen.
struct G35Sky: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let fo: G35FaceOpt = G35FaceOpt(ey: 0.34, my: 0.6, cy: 0.52)
        ZStack(alignment: .topLeading) {
            ZStack {
                Capsule().fill(Color.white)
                G35Inset(shape: Capsule(), color: G35.c(0x2b5d8a, 0.12), dx: 0, dy: -S * 0.05)
            }
            .g35(S * 0.04, S * 0.38, S * 0.92, S * 0.5)
            Circle().fill(Color.white).g35(S * 0.14, S * 0.2, S * 0.42, S * 0.42)
            Circle().fill(Color.white).g35(S * 0.4, S * 0.1, S * 0.48, S * 0.48)
            G35Face(w: S * 0.76, h: S * 0.5, sf: S * 0.76, mood: mood, ink: G35.c(0x2b4a66), cheek: G35.c(0xf29a8a, 0.45), o: fo, a: a)
                .g35(S * 0.12, S * 0.3, S * 0.76, S * 0.5)
            if mood == .talk || mood == .idle {
                G35Drip(S: S, i: 0, a: a)
                G35Drip(S: S, i: 1, a: a)
                G35Drip(S: S, i: 2, a: a)
            }
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x2b5d8a), a: a) }
        }
    }
}

/// gfDrip 1,6 s ease-in, forskjøvet .45 s.
struct G35Drip: View {
    let S: CGFloat
    let i: Int
    let a: G35T

    var body: some View {
        let p: Double = a.still ? 0.3 + 0.2 * Double(i) : a.phase(1.6, Double(i) * 0.45)
        let op: Double = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8
        let dy: CGFloat = CGFloat(18 * p * p) * Swift.min(1, S / 60)
        G35Round(h: [0.5, 0.5, 0.5, 0.5], v: [0.6, 0.6, 0.4, 0.4]).fill(G35.c(0x7fb2e0))
            .frame(width: S * 0.05, height: S * 0.09)
            .opacity(Swift.max(0, op))
            .offset(x: S * (0.3 + CGFloat(i) * 0.18), y: S * 0.9 + dy)
    }
}

/// Stjerne: femtakket stjerne (#ffb38a → #ff6a3c) med glans, fjes midt på og en liten gul stjerne som glitrer.
struct G35Stjerne: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let fo: G35FaceOpt = G35FaceOpt(ey: 0.26, gap: 0.18, my: 0.62, cx: 0, cy: 0.5)
        let gloss: RadialGradient = RadialGradient(stops: [
            .init(color: Color.white.opacity(0.45), location: 0),
            .init(color: Color.clear, location: 1),
        ], center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: S * 0.3)
        ZStack(alignment: .topLeading) {
            G35Poly.star.fill(G35.lin(160, [G35.c(0xffb38a), G35.c(0xff6a3c)]))
                .shadow(color: G35.c(0xb23a2a, 0.25), radius: 0, x: 0, y: 4)
                .g35(S * 0.02, S * 0.04, S * 0.96, S * 0.96)
            G35Poly.star.fill(gloss).g35(S * 0.06, S * 0.08, S * 0.88, S * 0.88)
            G35Face(w: S * 0.5, h: S * 0.5, sf: S * 0.5, mood: mood, ink: G35.c(0x5a1a0c), cheek: Color.white.opacity(0.45), o: fo, a: a)
                .g35(S * 0.25, S * 0.28, S * 0.5, S * 0.5)
            G35Poly.star.fill(G35.c(0xf2c14e))
                .frame(width: S * 0.12, height: S * 0.12)
                .scaleEffect(a.twScale(1.6, 0))
                .opacity(a.twOpacity(1.6, 0))
                .offset(x: S * 0.86, y: S * 0.12)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0xb23a2a), a: a) }
        }
    }
}

/// Dråpe: vanndråpe (radius 50 % 0 50 % 50 %, rotert −45°) i blå gradient med glans.
struct G35Drape: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let d: CGFloat = S * 0.72
        let r: CGFloat = d * 0.5
        let shape: UnevenRoundedRectangle = UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: r, bottomTrailingRadius: r, topTrailingRadius: 0)
        let fo: G35FaceOpt = G35FaceOpt(ey: 0.38, my: 0.64, cy: 0.56)
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                shape.fill(G35.lin(200, [G35.c(0x9fd0f2), G35.c(0x4f8fd0)])).frame(width: d, height: d)
                G35Inset(shape: shape, color: G35.c(0x1b3c6e, 0.2), dx: -S * 0.04, dy: -S * 0.04).frame(width: d, height: d)
                Ellipse().fill(Color.white.opacity(0.55)).g35r(d * 0.16, d * 0.34, d * 0.16, d * 0.26, 45)
            }
            .g35r(S * 0.14, S * 0.12, d, d, -45)
            G35Face(w: S * 0.64, h: S * 0.54, sf: S * 0.64, mood: mood, ink: G35.c(0x163150), cheek: G35.c(0xffaaaa, 0.5), o: fo, a: a)
                .g35(S * 0.18, S * 0.3, S * 0.64, S * 0.54)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x2b5d8a), a: a) }
        }
    }
}

/// Ugle: brun kropp med ørefjær, krem bryst med flekker, store øyne med gul ring, gult nebb og vinger som vifter.
struct G35Ugle: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    private static let br: Color = G35.c(0x8a5a3b)
    private static let bl: Color = G35.c(0xb07a52)

    var body: some View {
        let waving: Bool = mood == .glad || mood == .talk
        let wing: Double = waving ? a.between(-12, 30, 1.4) : 0
        ZStack(alignment: .topLeading) {
            G35Poly(pts: [CGPoint(x: 0.625, y: 0), CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 1)]).fill(G35Ugle.br)
                .g35r(S * 0.14, S * 0.02, S * 0.16, S * 0.2, -12)
            G35Poly(pts: [CGPoint(x: 0.375, y: 0), CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 1)]).fill(G35Ugle.br)
                .g35r(S * 0.7, S * 0.02, S * 0.16, S * 0.2, 12)
            G35Round(0.48, 0.48, 0.44, 0.44).fill(G35.lin(180, [G35Ugle.bl, G35Ugle.br]))
                .g35(S * 0.1, S * 0.12, S * 0.8, S * 0.88)
            G35UgleBelly(S: S).g35(S * 0.28, S * 0.56, S * 0.44, S * 0.4)
            G35UgleEye(S: S, mood: mood, a: a).g35(S * 0.16, S * 0.24, S * 0.32, S * 0.32)
            G35UgleEye(S: S, mood: mood, a: a).g35(S * 0.52, S * 0.24, S * 0.32, S * 0.32)
            G35Poly(pts: [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 0.5, y: 1)]).fill(G35.c(0xe8a23a))
                .frame(width: S * 0.1, height: S * 0.09)
                .scaleEffect(x: 1, y: mood == .talk ? a.talk : 1, anchor: .top)
                .offset(x: S * 0.45, y: S * 0.5)
            G35Round(0.6, 0.2, 0.6, 0.6).fill(G35Ugle.br)
                .g35r(S * 0.02, S * 0.5, S * 0.16, S * 0.3, wing, UnitPoint(x: 0.9, y: 0.1))
            G35Round(0.2, 0.6, 0.6, 0.6).fill(G35Ugle.br)
                .g35(S * 0.82, S * 0.5, S * 0.16, S * 0.3)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x7a5ad6), a: a) }
        }
    }
}

/// Krem bryst med tre flekker (#d9b994).
struct G35UgleBelly: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.44
        let h: CGFloat = S * 0.4
        let dot: CGFloat = S * 0.03
        let spot: Color = G35.c(0xd9b994)
        ZStack(alignment: .topLeading) {
            Ellipse().fill(G35.c(0xf1dcc0)).frame(width: w, height: h)
            Circle().fill(spot).g35(w * 0.3 - dot, h * 0.3 - dot, dot * 2, dot * 2)
            Circle().fill(spot).g35(w * 0.7 - dot, h * 0.45 - dot, dot * 2, dot * 2)
            Circle().fill(spot).g35(w * 0.45 - dot, h * 0.7 - dot, dot * 2, dot * 2)
        }
        .frame(width: w, height: h, alignment: .topLeading)
        .clipShape(Ellipse())
    }
}

struct G35UgleEye: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let d: CGFloat = S * 0.32
        let bw: CGFloat = S * 0.035
        ZStack(alignment: .topLeading) {
            Circle().inset(by: -S * 0.0125).stroke(G35.c(0xf2c14e), lineWidth: S * 0.025).frame(width: d, height: d)
            Circle().fill(G35.cream).frame(width: d, height: d)
            if mood == .glad || mood == .sover {
                G35HalfArc(up: mood == .glad).inset(bw / 2).stroke(G35.ink, style: StrokeStyle(lineWidth: bw, lineCap: .round))
                    .g35(d * 0.22, d * 0.44, d * 0.56, d * 0.22)
            } else {
                ZStack(alignment: .topLeading) {
                    Circle().fill(G35.ink).frame(width: d * 0.44, height: d * 0.44)
                    Circle().fill(Color.white).g35(d * 0.44 * 0.2, d * 0.44 * 0.16, d * 0.44 * 0.32, d * 0.44 * 0.32)
                }
                .frame(width: d * 0.44, height: d * 0.44, alignment: .topLeading)
                .scaleEffect(x: 1, y: a.blink(4.6), anchor: .center)
                .offset(x: d * 0.28, y: d * 0.28)
            }
        }
        .frame(width: d, height: d, alignment: .topLeading)
    }
}

/// Gris: rosa sparegris med ører, sparebøsse-spalte, tryne med nesebor, krøllete hale, små bein og kr-mynt når den er glad.
struct G35Gris: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    private static let pk: Color = G35.c(0xf6b3c1)
    private static let pd: Color = G35.c(0xe98aa0)

    var body: some View {
        let tail: Double = mood == .glad ? a.between(-12, 30, 0.6) : a.between(-8, 10, 2.4)
        let fo: G35FaceOpt = G35FaceOpt(ey: 0.26, my: 0.78, cx: 0.04, cy: 0.48)
        let body2: G35Round = G35Round(h: [0.5, 0.5, 0.46, 0.46], v: [0.54, 0.54, 0.46, 0.46])
        ZStack(alignment: .topLeading) {
            G35Round(0.2, 0.8, 0.3, 0.7).fill(G35Gris.pd).g35r(S * 0.12, S * 0.12, S * 0.22, S * 0.22, -20)
            G35Round(0.8, 0.2, 0.7, 0.3).fill(G35Gris.pd).g35r(S * 0.66, S * 0.12, S * 0.22, S * 0.22, 20)
            G35Edge(from: 0.625, to: 1.125, color: G35Gris.pd, lw: S * 0.03)
                .g35r(S * 0.88, S * 0.5, S * 0.16, S * 0.16, tail, UnitPoint(x: 0, y: 0.5))
            ZStack {
                body2.fill(G35.lin(180, [G35Gris.pk, G35Gris.pd]))
                G35Inset(shape: body2, color: G35.c(0xa03c5a, 0.18), dx: 0, dy: -S * 0.06)
            }
            .g35(S * 0.06, S * 0.2, S * 0.88, S * 0.78)
            RoundedRectangle(cornerRadius: S * 0.02).fill(G35.c(0x78283c, 0.35)).g35(S * 0.42, S * 0.2, S * 0.16, S * 0.03)
            G35Face(w: S * 0.72, h: S * 0.6, sf: S * 0.72, mood: mood, ink: G35.c(0x4a1a28), cheek: G35.c(0xe95a78, 0.45), o: fo, mouth: false, a: a)
                .g35(S * 0.14, S * 0.28, S * 0.72, S * 0.6)
            G35Snout(S: S, mood: mood, a: a)
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: S * 0.04, bottomTrailingRadius: S * 0.04, topTrailingRadius: 0)
                .fill(G35Gris.pd).g35(S * 0.22, S * 0.92, S * 0.14, S * 0.1)
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: S * 0.04, bottomTrailingRadius: S * 0.04, topTrailingRadius: 0)
                .fill(G35Gris.pd).g35(S * 0.64, S * 0.92, S * 0.14, S * 0.1)
            if mood == .glad { G35Coin(S: S, a: a) }
            if mood == .sover { G35Zz(S: S, W: S, color: G35Gris.pd, a: a) }
        }
    }
}

struct G35Snout: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let w: CGFloat = S * 0.32
        let h: CGFloat = S * 0.22
        let hole: Color = G35.c(0xa8475f)
        ZStack(alignment: .topLeading) {
            Ellipse().fill(G35.c(0xf39aae)).frame(width: w, height: h)
            G35Inset(shape: Ellipse(), color: G35.c(0xa03c5a, 0.2), dx: 0, dy: -S * 0.02).frame(width: w, height: h)
            Ellipse().fill(hole).g35(w * 0.26, h * 0.36, w * 0.14, h * 0.3)
            Ellipse().fill(hole).g35(w * 0.6, h * 0.36, w * 0.14, h * 0.3)
        }
        .frame(width: w, height: h, alignment: .topLeading)
        .scaleEffect(x: 1, y: mood == .talk ? a.talk : 1, anchor: .center)
        .offset(x: S * 0.34, y: S * 0.56)
    }
}

/// Gul kr-mynt som glitrer ved siden av Gris (glad).
struct G35Coin: View {
    let S: CGFloat
    let a: G35T

    var body: some View {
        let d: CGFloat = S * 0.18
        ZStack {
            Circle().fill(G35.c(0xf2c14e))
            G35Inset(shape: Circle(), color: G35.c(0xc99a2e), dx: 0, dy: -S * 0.02)
            Text("kr").font(.custom("Manrope-ExtraBold", size: S * 0.08)).foregroundStyle(G35.c(0x8a6a1a)).fixedSize()
        }
        .frame(width: d, height: d)
        .scaleEffect(a.twScale(1.2, 0))
        .opacity(a.twOpacity(1.2, 0))
        .offset(x: -S * 0.06, y: S * 0.06)
    }
}

/// Spire: grønn bolle med stilk og to blader som vifter (2 s).
struct G35Spire: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let fo: G35FaceOpt = G35FaceOpt(ey: 0.34, my: 0.58, cy: 0.5)
        let body2: G35Round = G35Round(h: [0.5, 0.5, 0.46, 0.46], v: [0.58, 0.58, 0.42, 0.42])
        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: S * 0.04).fill(G35.c(0x3f8a4f)).frame(width: S * 0.08, height: S * 0.24)
                G35Round(0, 1, 0, 1).fill(G35.c(0x6fc28f)).g35(S * 0.04, -S * 0.02, S * 0.24, S * 0.14)
                G35Round(1, 0, 1, 0).fill(G35.c(0x4fa86a)).g35(-S * 0.16, S * 0.04, S * 0.2, S * 0.12)
            }
            .g35r(S * 0.46, 0, S * 0.08, S * 0.24, a.between(-8, 10, 2), .bottom)
            ZStack {
                body2.fill(G35.lin(180, [G35.c(0x9fd8a8), G35.c(0x5fae74)]))
                G35Inset(shape: body2, color: G35.c(0x1f5a32, 0.18), dx: 0, dy: -S * 0.06)
            }
            .g35(S * 0.06, S * 0.2, S * 0.88, S * 0.76)
            G35Face(w: S * 0.76, h: S * 0.6, sf: S * 0.76, mood: mood, ink: G35.c(0x173a22), cheek: G35.c(0xffaa96, 0.55), o: fo, a: a)
                .g35(S * 0.12, S * 0.3, S * 0.76, S * 0.6)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0x2f7a4f), a: a) }
        }
    }
}
