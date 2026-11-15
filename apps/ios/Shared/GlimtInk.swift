import SwiftUI

/* ---------------- Prompt 52: Glimt-figuren «Blekksprut» (blekk) ----------------
   Fasit: design/glimt-figurer.js → fig('blekk', S, humør) og prompts/prompt-52-pakke/claude-code-glimt-blekksprut.md.
   Kroppen er Runes bilde uten ansikt (asset Glimt52Blekk = assets/glimt-blekk-base.png, 600 × 536, gjennomsiktig).
   Ansiktet tegnes oppå med Canvas i samme koordinater som SVG-en (viewBox 0 0 600 536), så det kan endre humør:
   Rolig (øyelokk-ringer, blanke pupiller som blunker, lite smil), Glad (smileøyne, stort smil, rosa kinn, én stor gledeståre
   under venstre øye), Snakker (pupiller, munnen går, kinn), Sover (lukkede øyne, liten rund munn, zz).
   Bildet ligger i både appens og widgetenes asset-katalog (Shared brukes av begge). */

struct G35Blekk: View {
    let S: CGFloat
    let mood: Glimt35Mood
    let a: G35T

    var body: some View {
        let bw: CGFloat = S * 1.16
        let bh: CGFloat = bw * 536 / 600
        ZStack(alignment: .topLeading) {
            Image("Glimt52Blekk")
                .resizable()
                .interpolation(.high)
                .frame(width: bw, height: bh)
                .shadow(color: Color(red: 80 / 255, green: 20 / 255, blue: 30 / 255).opacity(0.25), radius: S * 0.05, y: S * 0.03)
                .accessibilityHidden(true)
            G35BlekkFace(mood: mood, blink: a.blink(4.2), talk: a.talk, drip: a.still ? 0 : a.phase(2.6))
                .frame(width: bw, height: bh)
            if mood == .sover { G35Zz(S: S, W: S, color: G35.c(0xb3303f), a: a) }
        }
        .offset(x: -S * 0.08, y: S * 0.04)
        .frame(width: S, height: S * 1.04, alignment: .topLeading)
    }
}

/// Ansiktet som Canvas i 600 × 536-koordinater.
struct G35BlekkFace: View {
    let mood: Glimt35Mood
    let blink: CGFloat
    let talk: CGFloat
    /// 0 … 1 for gledeståren (gfDrip 2,6 s).
    let drip: Double

    var body: some View {
        Canvas { (ctx: inout GraphicsContext, size: CGSize) in
            let k: CGFloat = size.width / 600
            ctx.scaleBy(x: k, y: k)
            if mood == .glad || mood == .talk { G35BlekkFace.cheeks(&ctx) }
            G35BlekkFace.ring(&ctx, cx: 222, cy: 222, deg: -6)
            G35BlekkFace.ring(&ctx, cx: 332, cy: 214, deg: 6)
            G35BlekkFace.pupil(&ctx, cx: 224, cy: 228, mood: mood, blink: blink)
            G35BlekkFace.pupil(&ctx, cx: 330, cy: 220, mood: mood, blink: blink)
            G35BlekkFace.mouth(&ctx, mood: mood, talk: talk)
            if mood == .glad { G35BlekkFace.tear(&ctx, drip: drip) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    nonisolated static func col(_ hex: UInt32, _ a: Double = 1) -> Color {
        Color(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255).opacity(a)
    }

    nonisolated static func ell(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> CGRect {
        CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2)
    }

    /// Radial gradient med sentrum og radius som andeler av rammen (som SVG radialGradient cx/cy/r i objectBoundingBox).
    nonisolated static func radial(_ r: CGRect, cx: CGFloat, cy: CGFloat, rad: CGFloat, _ stops: [Gradient.Stop]) -> GraphicsContext.Shading {
        let c: CGPoint = CGPoint(x: r.minX + r.width * cx, y: r.minY + r.height * cy)
        return .radialGradient(Gradient(stops: stops), center: c, startRadius: 0, endRadius: Swift.max(r.width, r.height) * rad)
    }

    nonisolated static func cheeks(_ ctx: inout GraphicsContext) {
        ctx.drawLayer { (l: inout GraphicsContext) in
            l.addFilter(.blur(radius: 6))
            l.fill(Path(ellipseIn: ell(170, 300, 30, 16)), with: .color(col(0xff8f9f, 0.45)))
            l.fill(Path(ellipseIn: ell(392, 290, 30, 16)), with: .color(col(0xff8f9f, 0.45)))
        }
    }

    /// Øyelokk-ringen: skygge, ytre ring (lys → mørk rød), indre flate og høylys-bue.
    nonisolated static func ring(_ ctx: inout GraphicsContext, cx: CGFloat, cy: CGFloat, deg: Double) {
        var g: GraphicsContext = ctx
        g.translateBy(x: cx, y: cy)
        g.rotate(by: .degrees(deg))
        g.translateBy(x: -cx, y: -cy)
        g.drawLayer { (l: inout GraphicsContext) in
            l.addFilter(.blur(radius: 6))
            l.fill(Path(ellipseIn: ell(cx + 2, cy + 6, 47, 58)), with: .color(col(0x6e1c2a, 0.28)))
        }
        let outer: CGRect = ell(cx, cy, 47, 58)
        g.fill(Path(ellipseIn: outer), with: radial(outer, cx: 0.42, cy: 0.30, rad: 0.75,
                                                     [Gradient.Stop(color: col(0xe58c98), location: 0), Gradient.Stop(color: col(0xb04656), location: 1)]))
        let inner: CGRect = ell(cx, cy + 3, 37, 47)
        g.fill(Path(ellipseIn: inner), with: radial(inner, cx: 0.5, cy: 0.4, rad: 0.7,
                                                     [Gradient.Stop(color: col(0xc4596a), location: 0), Gradient.Stop(color: col(0xa63d4d), location: 1)]))
        var arc: Path = Path()
        arc.move(to: CGPoint(x: cx - 36, y: cy - 30))
        arc.addQuadCurve(to: CGPoint(x: cx + 36, y: cy - 30), control: CGPoint(x: cx, y: cy - 66))
        g.drawLayer { (l: inout GraphicsContext) in
            l.addFilter(.blur(radius: 2))
            l.stroke(arc, with: .color(col(0xf3b3bc, 0.55)), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }
    }

    nonisolated static func pupil(_ ctx: inout GraphicsContext, cx: CGFloat, cy: CGFloat, mood: Glimt35Mood, blink: CGFloat) {
        let ink: Color = col(0x120a0c)
        switch mood {
        case .glad:
            var p: Path = Path()
            p.move(to: CGPoint(x: cx - 22, y: cy + 6))
            p.addQuadCurve(to: CGPoint(x: cx + 22, y: cy + 6), control: CGPoint(x: cx, y: cy - 26))
            ctx.stroke(p, with: .color(ink), style: StrokeStyle(lineWidth: 9, lineCap: .round))
        case .sover:
            var p: Path = Path()
            p.move(to: CGPoint(x: cx - 22, y: cy))
            p.addQuadCurve(to: CGPoint(x: cx + 22, y: cy), control: CGPoint(x: cx, y: cy + 20))
            ctx.stroke(p, with: .color(ink), style: StrokeStyle(lineWidth: 8, lineCap: .round))
        default:
            // Blunk (gfBlink 4,2 s): skaler i høyden rundt midten av pupillen.
            var g: GraphicsContext = ctx
            let my: CGFloat = cy + 2
            g.translateBy(x: 0, y: my)
            g.scaleBy(x: 1, y: Swift.max(0.08, blink))
            g.translateBy(x: 0, y: -my)
            let r: CGRect = ell(cx, cy + 2, 25, 35)
            g.fill(Path(ellipseIn: r), with: radial(r, cx: 0.45, cy: 0.70, rad: 0.6,
                                                     [Gradient.Stop(color: col(0x555555), location: 0), Gradient.Stop(color: col(0x121212), location: 0.6),
                                                      Gradient.Stop(color: col(0x000000), location: 1)]))
            g.fill(Path(ellipseIn: ell(cx - 4, cy - 16, 11, 7)), with: .color(Color.white.opacity(0.95)))
            g.fill(Path(ellipseIn: ell(cx + 6, cy + 22, 7, 3.5)), with: .color(Color.white.opacity(0.18)))
        }
    }

    nonisolated static func mouth(_ ctx: inout GraphicsContext, mood: Glimt35Mood, talk: CGFloat) {
        let mg: Gradient = Gradient(stops: [Gradient.Stop(color: col(0x3a0a12), location: 0), Gradient.Stop(color: col(0x6a1a28), location: 1)])
        switch mood {
        case .talk:
            // gfTalk: munnen åpner og lukker seg fra overkanten.
            let r: CGRect = ell(288, 338, 17, 14)
            var g: GraphicsContext = ctx
            g.translateBy(x: 0, y: r.minY)
            g.scaleBy(x: 1, y: talk)
            g.translateBy(x: 0, y: -r.minY)
            g.fill(Path(ellipseIn: r), with: .linearGradient(mg, startPoint: CGPoint(x: r.midX, y: r.minY), endPoint: CGPoint(x: r.midX, y: r.maxY)))
        case .glad:
            var p: Path = Path()
            p.move(to: CGPoint(x: 250, y: 322))
            p.addQuadCurve(to: CGPoint(x: 326, y: 322), control: CGPoint(x: 288, y: 372))
            p.addQuadCurve(to: CGPoint(x: 250, y: 322), control: CGPoint(x: 288, y: 336))
            p.closeSubpath()
            ctx.fill(p, with: .linearGradient(mg, startPoint: CGPoint(x: 288, y: 322), endPoint: CGPoint(x: 288, y: 350)))
            ctx.fill(Path(ellipseIn: ell(288, 346, 14, 7)), with: .color(col(0xe2707e)))
        case .sover:
            ctx.fill(Path(ellipseIn: ell(288, 336, 8, 7)), with: .color(col(0x4a0f18, 0.75)))
        default:
            var p: Path = Path()
            p.move(to: CGPoint(x: 262, y: 328))
            p.addQuadCurve(to: CGPoint(x: 314, y: 328), control: CGPoint(x: 288, y: 350))
            ctx.stroke(p, with: .color(col(0x4f1220)), style: StrokeStyle(lineWidth: 6, lineCap: .round))
        }
    }

    /// Én stor gledeståre under venstre øye, som renner litt ned og tones ut (gfDrip).
    nonisolated static func tear(_ ctx: inout GraphicsContext, drip: Double) {
        var g: GraphicsContext = ctx
        let dy: CGFloat = CGFloat(drip) * 14
        g.translateBy(x: 0, y: dy)
        g.opacity = drip > 0.8 ? Swift.max(0, 1 - (drip - 0.8) / 0.2) : 1
        var p: Path = Path()
        p.move(to: CGPoint(x: 192, y: 268))
        p.addCurve(to: CGPoint(x: 166, y: 322), control1: CGPoint(x: 182, y: 290), control2: CGPoint(x: 166, y: 304))
        p.addQuadCurve(to: CGPoint(x: 192, y: 348), control: CGPoint(x: 166, y: 348))
        p.addQuadCurve(to: CGPoint(x: 218, y: 322), control: CGPoint(x: 218, y: 348))
        p.addCurve(to: CGPoint(x: 192, y: 268), control1: CGPoint(x: 218, y: 304), control2: CGPoint(x: 202, y: 290))
        p.closeSubpath()
        let wg: Gradient = Gradient(stops: [Gradient.Stop(color: col(0xc9efff), location: 0), Gradient.Stop(color: col(0x5cc0f4), location: 0.55),
                                            Gradient.Stop(color: col(0x2a86d6), location: 1)])
        g.fill(p, with: .linearGradient(wg, startPoint: CGPoint(x: 192, y: 268), endPoint: CGPoint(x: 192, y: 348)))
        var h: GraphicsContext = g
        h.translateBy(x: 183, y: 316)
        h.rotate(by: .degrees(18))
        h.fill(Path(ellipseIn: CGRect(x: -6, y: -11, width: 12, height: 22)), with: .color(Color.white.opacity(0.85)))
    }
}
