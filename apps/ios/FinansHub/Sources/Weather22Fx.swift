import SwiftUI

/* ---------------- Prompt 22: animert værbakgrunn (Vaer.dc.html → WxFx) ---------------- */
// Canvas + TimelineView, maks 30 bilder i sekundet. Står stille ved «Reduser bevegelse» og når appen ikke er aktiv.
// Partiklene er beregnet ut fra tiden (ingen tilstand), så de samme posisjonene kommer igjen etter hver runde.
// Solen er dempet: glorien skaleres etter korteste side (maks 560 pt) og er høyst ca. 60 % hvit i midten.

/// Hvilken animasjon værkoden gir: sun | part | stars | partn | clouds | rain | snow | fog.
func wxFxKind22(_ code: Int, night: Bool) -> String {
    if (code >= 71 && code <= 77) || code == 85 || code == 86 { return "snow" }
    if (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 { return "rain" }
    if code == 45 || code == 48 { return "fog" }
    if code == 3 { return "clouds" }
    if night { return code == 2 ? "partn" : "stars" }
    return code == 2 ? "part" : "sun"
}

/// Himmelen bak alt: samme gradienter som `sky` i designet.
struct WxSky22: View {
    let code: Int
    let night: Bool

    var body: some View {
        LinearGradient(stops: stops, startPoint: .top, endPoint: .bottom)
    }

    private var stops: [Gradient.Stop] {
        if night {
            return [Gradient.Stop(color: Color(hex: "#0b1730"), location: 0), Gradient.Stop(color: Color(hex: "#1c2d52"), location: 0.55), Gradient.Stop(color: Color(hex: "#2a3f6a"), location: 1)]
        }
        if code <= 2 {
            return [Gradient.Stop(color: Color(hex: "#3d6fa8"), location: 0), Gradient.Stop(color: Color(hex: "#2f6fb8"), location: 0.4),
                    Gradient.Stop(color: Color(hex: "#4a8ad0"), location: 0.75), Gradient.Stop(color: Color(hex: "#8ab6e4"), location: 1)]
        }
        if code == 3 {
            return [Gradient.Stop(color: Color(hex: "#4f6d8f"), location: 0), Gradient.Stop(color: Color(hex: "#6a87a6"), location: 0.55), Gradient.Stop(color: Color(hex: "#9bb0c5"), location: 1)]
        }
        let rain: Bool = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
        if rain {
            return [Gradient.Stop(color: Color(hex: "#3b4658"), location: 0), Gradient.Stop(color: Color(hex: "#323d4e"), location: 0.45), Gradient.Stop(color: Color(hex: "#2a3342"), location: 1)]
        }
        let snow: Bool = (code >= 71 && code <= 77) || code >= 85
        if snow {
            return [Gradient.Stop(color: Color(hex: "#5e6b7c"), location: 0), Gradient.Stop(color: Color(hex: "#7d8a9a"), location: 0.55), Gradient.Stop(color: Color(hex: "#a3aebb"), location: 1)]
        }
        return [Gradient.Stop(color: Color(hex: "#36485e"), location: 0), Gradient.Stop(color: Color(hex: "#4f627a"), location: 0.55), Gradient.Stop(color: Color(hex: "#74869b"), location: 1)]
    }
}

/// Partikkellaget over himmelen.
struct WxFx22: View {
    let kind: String
    let heavy: Bool
    let thunder: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var start: Date = Date()

    var body: some View {
        let paused: Bool = reduceMotion || phase != .active
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: paused)) { tl in
            Canvas { ctx, size in
                let t: Double = tl.date.timeIntervalSince(start)
                WxFxPainter22(kind: kind, heavy: heavy, thunder: thunder, t: t, size: size).paint(&ctx)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Tegner én ramme. Alle mål er i punkter; tiden t er sekunder siden visningen startet.
struct WxFxPainter22 {
    let kind: String
    let heavy: Bool
    let thunder: Bool
    let t: Double
    let size: CGSize

    /// Fast «tilfeldig» tall i [0, 1) for partikkel i og felt salt.
    private func rnd(_ i: Int, _ salt: Int) -> Double {
        let x: Double = sin(Double(i * 127 + salt * 311 + 17) * 12.9898) * 43758.5453
        return x - floor(x)
    }

    private func wrap(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        let span: Double = hi - lo
        if span <= 0 { return lo }
        var r: Double = (v - lo).truncatingRemainder(dividingBy: span)
        if r < 0 { r += span }
        return lo + r
    }

    func paint(_ ctx: inout GraphicsContext) {
        let W: Double = Double(size.width)
        let H: Double = Double(size.height)
        if W < 1 || H < 1 { return }
        if kind == "stars" || kind == "partn" { stars(&ctx, W, H) }
        if kind == "sun" || kind == "part" { sun(&ctx, W, H) }
        clouds(&ctx, W, H)
        if kind == "rain" { rain(&ctx, W, H) }
        if kind == "snow" { snow(&ctx, W, H) }
        if kind == "fog" { fog(&ctx, W, H) }
    }

    private func stars(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        let n: Int = Swift.min(400, Int((W * H / 2600).rounded()))
        for i in 0..<n {
            let x: Double = rnd(i, 1) * W
            let y: Double = rnd(i, 2) * H * 0.75
            let r: Double = 0.4 + rnd(i, 3) * 1.1
            let a: Double = 0.3 + rnd(i, 4) * 0.7
            let s: Double = 0.5 + rnd(i, 5) * 1.5
            let o: Double = rnd(i, 6) * 6.28
            let tw: Double = 0.55 + 0.45 * sin(t * s + o)
            let rect: CGRect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: rect), with: .color(Color.white.opacity(a * tw)))
        }
    }

    private func sun(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        let m: Double = Swift.min(W, H)
        let cx: Double = W * 0.72
        let cy: Double = -m * 0.02
        let R: Double = Swift.min(m * 0.95, 560)
        let c: CGPoint = CGPoint(x: cx, y: cy)
        // Dempet: midten er maks 0,6 hvit (designet: 0,9), resten som i designet.
        let g: Gradient = Gradient(stops: [
            Gradient.Stop(color: Color.white.opacity(0.6), location: 0),
            Gradient.Stop(color: Color(red: 1, green: 252.0 / 255.0, blue: 236.0 / 255.0).opacity(0.45), location: 0.07),
            Gradient.Stop(color: Color(red: 1, green: 245.0 / 255.0, blue: 220.0 / 255.0).opacity(0.14), location: 0.22),
            Gradient.Stop(color: Color.white.opacity(0.025), location: 0.55),
            Gradient.Stop(color: Color.white.opacity(0), location: 1),
        ])
        ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: H)), with: .radialGradient(g, center: c, startRadius: 0, endRadius: R))
        // Svak regnbuering.
        let hr: Double = m * 0.5
        let lw: Double = m * 0.03
        let rings: [(Color, Double)] = [
            (Color(red: 1, green: 120.0 / 255.0, blue: 120.0 / 255.0).opacity(0.045), 0),
            (Color(red: 1, green: 230.0 / 255.0, blue: 120.0 / 255.0).opacity(0.045), m * 0.03),
            (Color(red: 120.0 / 255.0, green: 220.0 / 255.0, blue: 1).opacity(0.05), m * 0.06),
        ]
        for ring in rings {
            let rr: Double = hr + ring.1
            let rect: CGRect = CGRect(x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2)
            ctx.stroke(Path(ellipseIn: rect), with: .color(ring.0), lineWidth: lw)
        }
        // Lysreflekser som glir litt fram og tilbake.
        let sh: Double = sin(t * 0.4) * 0.05
        let flares: [(Double, Double)] = [(0.2, 0.06), (0.3, 0.035), (0.38, 0.05)]
        for f in flares {
            let x: Double = cx + (W * 0.5 - cx) * (f.0 * 2.2) + sh * W
            let y: Double = cy + H * f.0
            let r: Double = W * f.1
            let fg: Gradient = Gradient(colors: [Color.white.opacity(0.08), Color.white.opacity(0)])
            let rect: CGRect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: rect), with: .radialGradient(fg, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: r))
        }
    }

    private func clouds(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        let many: Bool = kind == "clouds" || kind == "rain" || kind == "snow" || kind == "fog"
        let few: Bool = kind == "part" || kind == "partn"
        let n: Int = many ? 9 : (few ? 4 : 0)
        if n == 0 { return }
        let rgb: (Double, Double, Double)
        if kind == "rain" || kind == "snow" { rgb = (200, 210, 225) } else if kind == "partn" { rgb = (150, 165, 195) } else { rgb = (255, 255, 255) }
        let base: Color = Color(red: rgb.0 / 255.0, green: rgb.1 / 255.0, blue: rgb.2 / 255.0)
        for i in 0..<n {
            let w: Double = (0.45 + rnd(i, 11) * 0.45) * W
            let h: Double = (0.08 + rnd(i, 12) * 0.08) * H
            let yMax: Double = few ? 0.35 : 0.55
            let y0: Double = (0.02 + rnd(i, 13) * (yMax - 0.02)) * H
            let speed: Double = (0.04 + rnd(i, 14) * 0.1) * (i % 2 == 1 ? 1 : -0.6) * 60
            let x0: Double = (-0.2 + rnd(i, 15) * 1.3) * W
            let a: Double
            switch kind {
            case "fog": a = 0.18 + rnd(i, 16) * 0.12
            case "rain", "snow": a = 0.16 + rnd(i, 16) * 0.14
            case "part": a = 0.08 + rnd(i, 16) * 0.08
            default: a = 0.2 + rnd(i, 16) * 0.14
            }
            let cxp: Double = wrap(x0 + speed * t, -w * 1.1, W * 1.2)
            for j in 0..<5 {
                let x: Double = cxp + w * (Double(j) / 4)
                let y: Double = y0 + sin(Double(j) * 1.7) * h * 0.35
                let rr: Double = h * (1.1 + Double((j * 37) % 5) / 6)
                let g: Gradient = Gradient(colors: [base.opacity(a), base.opacity(0)])
                let rect: CGRect = CGRect(x: x - rr * 1.9, y: y - rr * 1.2, width: rr * 3.8, height: rr * 2.4)
                ctx.fill(Path(ellipseIn: rect), with: .radialGradient(g, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: rr * 1.6))
            }
        }
    }

    private func rain(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        let n: Int = heavy ? 220 : 120
        for i in 0..<n {
            let l: Double = 10 + rnd(i, 21) * 12
            let v: Double = (9 + rnd(i, 22) * 6) * 60
            let a: Double = 0.12 + rnd(i, 23) * 0.2
            let y0: Double = -H + rnd(i, 24) * H * 2
            let x0: Double = -40 + rnd(i, 25) * (W + 40)
            let y: Double = wrap(y0 + v * t, -60, H)
            let x: Double = wrap(x0 + (y + 60) * 0.12, -40, W)
            var p: Path = Path()
            p.move(to: CGPoint(x: x, y: y))
            p.addLine(to: CGPoint(x: x + l * 0.12, y: y + l))
            ctx.stroke(p, with: .color(Color(red: 220.0 / 255.0, green: 230.0 / 255.0, blue: 245.0 / 255.0).opacity(a)), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
        }
        if thunder && sin(t * 0.7) > 0.995 {
            ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: H)), with: .color(Color.white.opacity(0.25)))
        }
    }

    private func snow(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        for i in 0..<110 {
            let r: Double = 1 + rnd(i, 31) * 2.2
            let v: Double = (0.5 + rnd(i, 32)) * 60
            let d: Double = rnd(i, 33) * 6.28
            let y0: Double = -H + rnd(i, 34) * H * 2
            let x0: Double = rnd(i, 35) * W
            let y: Double = wrap(y0 + v * t, -5, H)
            let x: Double = wrap(x0 - cos(t + d) * 24, 0, W)
            let rect: CGRect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: rect), with: .color(Color.white.opacity(0.85)))
        }
    }

    private func fog(_ ctx: inout GraphicsContext, _ W: Double, _ H: Double) {
        let c: Color = Color(red: 220.0 / 255.0, green: 225.0 / 255.0, blue: 232.0 / 255.0)
        let g: Gradient = Gradient(colors: [c.opacity(0), c.opacity(0.35)])
        ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: H)), with: .linearGradient(g, startPoint: CGPoint(x: 0, y: H * 0.2), endPoint: CGPoint(x: 0, y: H)))
    }
}
