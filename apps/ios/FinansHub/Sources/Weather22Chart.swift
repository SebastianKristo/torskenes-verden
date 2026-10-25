import SwiftUI

/* ---------------- Prompt 22: grafene i detaljarkene (SVG-ene i Vaer.dc.html, tegnet i Canvas) ---------------- */
// Alle koordinater er i designets viewBox (f.eks. 336 × 182) og skaleres til bredden.

struct WxBar22 {
    var x: CGFloat
    var y: CGFloat
    var w: CGFloat
    var h: CGFloat
    var color: Color
}

struct WxTick22 {
    var pos: CGFloat
    var text: String
}

struct WxMark22 {
    var x: CGFloat
    var y: CGFloat
    var text: String
}

struct WxChartSpec22 {
    var vbW: CGFloat = 336
    var vbH: CGFloat = 182
    /// Vannrette linjer (pos = y) med etikett til høyre.
    var grid: [WxTick22] = []
    var gridX0: CGFloat = 0
    var gridX1: CGFloat = 300
    var gridLabelX: CGFloat = 306
    var gridLabelSize: CGFloat = 11
    var gridColor: Color = Color(hex: "#2c3038")
    var bars: [WxBar22] = []
    /// Hovedlinjen (nil = hull).
    var line: [CGPoint?] = []
    var lineColor: Color = Color(hex: "#5ec8f2")
    var lineWidth: CGFloat = 3
    /// Stiplet del før nå (Forhold-arket).
    var past: [CGPoint] = []
    var pastDash: [CGFloat] = [6, 5]
    /// Stiplet sammenligningslinje (faktisk, dagen før, vindkast).
    var line2: [CGPoint?] = []
    var line2Color: Color = Color(hex: "#9aa0aa")
    /// Ekstra heltrukket linje (Pent i Yr mot Pent).
    var extra: [CGPoint?] = []
    var extraColor: Color = Color(hex: "#ff8a3d")
    /// Fyll under linjen ned til denne y-verdien.
    var areaBottom: CGFloat? = nil
    var areaPoints: [CGPoint] = []
    var areaGradient: Bool = false
    var nowX: CGFloat? = nil
    var nowY: CGFloat? = nil
    var nowTop: CGFloat = 8
    var nowBottom: CGFloat = 158
    var nowColor: Color = Color.white.opacity(0.35)
    var nowDash: [CGFloat] = []
    var marks: [WxMark22] = []
    var xTicks: [WxTick22] = []
    var xTickY: CGFloat = 176
}

struct WxChart22: View {
    let spec: WxChartSpec22

    var body: some View {
        Canvas { ctx, size in
            WxChartPainter22(spec: spec, s: size.width / spec.vbW).paint(&ctx)
        }
        .aspectRatio(spec.vbW / spec.vbH, contentMode: .fit)
        .frame(maxWidth: .infinity)
    }
}

struct WxChartPainter22 {
    let spec: WxChartSpec22
    let s: CGFloat

    private func pt(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * s, y: p.y * s) }

    private func label(_ ctx: inout GraphicsContext, _ text: String, x: CGFloat, baseline: CGFloat, size: CGFloat, color: Color, center: Bool) {
        let t: Text = Text(text).font(.dyn51(size: size * s, weight: .bold)).foregroundColor(color)
        let at: CGPoint = CGPoint(x: x * s, y: (baseline - size * 0.36) * s)
        ctx.draw(t, at: at, anchor: center ? .center : .leading)
    }

    private func path(_ pts: [CGPoint?]) -> Path {
        var p: Path = Path()
        var open: Bool = false
        for q in pts {
            guard let q else { open = false; continue }
            if open { p.addLine(to: pt(q)) } else { p.move(to: pt(q)); open = true }
        }
        return p
    }

    func paint(_ ctx: inout GraphicsContext) {
        for g in spec.grid {
            var l: Path = Path()
            l.move(to: CGPoint(x: spec.gridX0 * s, y: g.pos * s))
            l.addLine(to: CGPoint(x: spec.gridX1 * s, y: g.pos * s))
            ctx.stroke(l, with: .color(spec.gridColor), lineWidth: 1)
            label(&ctx, g.text, x: spec.gridLabelX, baseline: g.pos + 4, size: spec.gridLabelSize, color: Color(hex: "#9aa0aa"), center: false)
        }
        for b in spec.bars {
            let r: CGRect = CGRect(x: b.x * s, y: b.y * s, width: b.w * s, height: b.h * s)
            ctx.fill(Path(roundedRect: r, cornerRadius: Swift.min(2 * s, r.height / 2)), with: .color(b.color))
        }
        if let bottom = spec.areaBottom, spec.areaPoints.count > 1 {
            var a: Path = Path()
            a.move(to: pt(spec.areaPoints[0]))
            for q in spec.areaPoints.dropFirst() { a.addLine(to: pt(q)) }
            let lastX: CGFloat = spec.areaPoints[spec.areaPoints.count - 1].x
            let firstX: CGFloat = spec.areaPoints[0].x
            a.addLine(to: CGPoint(x: lastX * s, y: bottom * s))
            a.addLine(to: CGPoint(x: firstX * s, y: bottom * s))
            a.closeSubpath()
            if spec.areaGradient {
                let g: Gradient = Gradient(colors: [Color(hex: "#5ec8d8").opacity(0.55), Color(hex: "#2b6ea8").opacity(0.35)])
                ctx.fill(a, with: .linearGradient(g, startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: 0, y: bottom * s)))
            } else {
                ctx.fill(a, with: .color(Color(red: 94.0 / 255.0, green: 200.0 / 255.0, blue: 242.0 / 255.0).opacity(0.14)))
            }
        }
        if !spec.line2.isEmpty {
            ctx.stroke(path(spec.line2), with: .color(spec.line2Color), style: StrokeStyle(lineWidth: 2 * s, lineCap: .round, dash: [4 * s, 4 * s]))
        }
        if spec.past.count > 1 {
            let opt: [CGPoint?] = spec.past.map { Optional($0) }
            ctx.stroke(path(opt), with: .color(spec.lineColor), style: StrokeStyle(lineWidth: spec.lineWidth * s, lineCap: .round, dash: spec.pastDash.map { $0 * s }))
        }
        if !spec.line.isEmpty {
            ctx.stroke(path(spec.line), with: .color(spec.lineColor), style: StrokeStyle(lineWidth: spec.lineWidth * s, lineCap: .round, lineJoin: .round))
        }
        if !spec.extra.isEmpty {
            ctx.stroke(path(spec.extra), with: .color(spec.extraColor), style: StrokeStyle(lineWidth: spec.lineWidth * s, lineCap: .round, lineJoin: .round))
        }
        if let nx = spec.nowX {
            var l: Path = Path()
            l.move(to: CGPoint(x: nx * s, y: spec.nowTop * s))
            l.addLine(to: CGPoint(x: nx * s, y: spec.nowBottom * s))
            ctx.stroke(l, with: .color(spec.nowColor), style: StrokeStyle(lineWidth: 1, dash: spec.nowDash.map { $0 * s }))
            if let ny = spec.nowY { dot(&ctx, nx, ny) }
        }
        for m in spec.marks {
            dot(&ctx, m.x, m.y)
            label(&ctx, m.text, x: m.x, baseline: m.y - 10, size: 12, color: Color(hex: "#c7ccd4"), center: true)
        }
        for x in spec.xTicks {
            label(&ctx, x.text, x: x.pos, baseline: spec.xTickY, size: 12, color: Color(hex: "#9aa0aa"), center: false)
        }
    }

    /// Hvit prikk (r 4,5–5) med mørk kant.
    private func dot(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat) {
        let r: CGFloat = 5 * s
        let rect: CGRect = CGRect(x: x * s - r, y: y * s - r, width: r * 2, height: r * 2)
        ctx.fill(Path(ellipseIn: rect), with: .color(.white))
        ctx.stroke(Path(ellipseIn: rect), with: .color(Color(hex: "#17191e")), lineWidth: 2.5 * s)
    }
}
