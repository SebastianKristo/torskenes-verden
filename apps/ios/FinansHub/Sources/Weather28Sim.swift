import SwiftUI
import UIKit

/* ---------------- Prompt 28: simuleringen bak WxFx28 (port av WxFx i Vaer.dc.html) ----------------
   All tilstand ligger her (klasse, ikke observert). Partikler lages i resize(), gradienter i configure()/sunGrads(),
   så en vanlig ramme bare flytter tall og tegner. Mål i punkter, tid i sekunder. */

struct WxStar28 { var x: Double; var y: Double; var r: Double; var a: Double; var s: Double; var o: Double; var g: Bool; var c: WxRGB28 }
struct WxDrop28 { var z: Int; var x: Double; var y: Double; var l: Double; var v: Double; var end: Double }
struct WxSplash28 { var x: Double; var y: Double; var r: Double; var a: Double }
struct WxGlass28 { var x: Double; var y: Double; var r: Double; var v: Double; var sl: Bool; var tr: [CGPoint] }
struct WxFlake28 { var z: Int; var bx: Double; var y: Double; var r: Double; var v: Double; var am: Double; var f: Double; var ph: Double }
struct WxCloud28 { var z: Double; var s: Int; var x: Double; var y: Double; var w: Double; var a: Double; var v: Double; var ph: Double }
struct WxFog28 { var z: Double; var y: Double; var w: Double; var hr: Double; var v: Double; var a: Double; var ph: Double; var x: Double }
struct WxMote28 { var dx: Double; var dy: Double; var r: Double; var a: Double; var s: Double; var o: Double }
struct WxRay28 { let a: Double; let l: Double; let w: Double; let s: Double; let o: Double; let al: Double }
struct WxShoot28 { var x: Double; var y: Double; var vx: Double; var vy: Double; var l: Double; var d: Double }
struct WxGhost28 { let f: Double; let r: Double; let grad: Gradient; let line: Color }

/// Solgradientene som avhenger av sunF (fargen blir varmere når sola står lavt).
struct WxSunGrads28 {
    let glow: Gradient
    let warmBand: Gradient
    let core: Gradient
    let ray: Gradient
    let disc: Gradient
}

final class WxSim28 {
    private(set) var cfg: WxFxCfg28? = nil
    private var W: Double = 0
    private var H: Double = 0
    private var m: Double = 0
    private var t0: Double = 0
    private var last: Double = 0
    private var px: Double = 0
    private var py: Double = 0
    private var tx: Double = 0
    private var ty: Double = 0
    private var sunF: Double = 0.5

    private var cloudCfg: WxCloudCfg28? = nil
    private var sprites: [UIImage] = []
    private var stars: [WxStar28] = []
    private var drops: [WxDrop28] = []
    private var spl: [WxSplash28] = []
    private var glass: [WxGlass28] = []
    private var flakes: [WxFlake28] = []
    private var clouds: [WxCloud28] = []
    private var fogs: [WxFog28] = []
    private var motes: [WxMote28] = []
    private var rays: [WxRay28] = []
    private var ghosts: [WxGhost28] = []
    private var shoot: WxShoot28? = nil
    private var bolt: [[CGPoint]] = []
    private var flash: Double = 0
    private var nextBolt: Double = 0
    private var nextShoot: Double = 0
    private var sunI: Double = 0
    private var sg: WxSunGrads28? = nil
    private var sgKey: Double = -1

    // Faste gradienter (lages én gang).
    private static let milky: Gradient = wxGrad28([(0, WxRGB28(170, 185, 230), 0.07), (1, WxRGB28(170, 185, 230), 0)])
    private static let shootG: Gradient = wxGrad28([(0, WxRGB28.white, 0.9), (1, WxRGB28.white, 0)])
    private static let moteG: Gradient = wxGrad28([(0, WxRGB28(255, 250, 235), 1), (1, WxRGB28(255, 250, 235), 0)])
    private static let glassHi: Gradient = wxGrad28([(0, WxRGB28.white, 0.55), (1, WxRGB28.white, 0)])
    private static let rainMist: Gradient = wxGrad28([(0, WxRGB28(170, 182, 198), 0), (1, WxRGB28(170, 182, 198), 0.14)])
    private static let snowGround: Gradient = wxGrad28([(0, WxRGB28(235, 240, 248), 0), (1, WxRGB28(235, 240, 248), 0.12)])
    private static let fogGround: Gradient = wxGrad28([(0, WxRGB28(190, 198, 208), 0), (1, WxRGB28(190, 198, 208), 0.2)])
    private var streak: Gradient = Gradient(colors: [])
    /// Enhetsbue for glassdråpens lyskant (bunnen av ellipsen).
    private static let unitArc: Path = {
        var p: Path = Path()
        p.addArc(center: .zero, radius: 1, startAngle: .radians(0.2), endAngle: .radians(Double.pi - 0.2), clockwise: false)
        return p
    }()

    /* ---------- Oppsett ---------- */

    private func configure(_ c: WxFxCfg28, _ now: Double) {
        cfg = c
        t0 = now
        last = now
        W = 0
        H = 0
        spl.removeAll(keepingCapacity: true)
        spl.reserveCapacity(50)
        shoot = nil
        bolt = []
        flash = 0
        nextBolt = now + wxR28(2.5, 6)
        nextShoot = now + wxR28(4, 9)
        cloudCfg = WxCloudCfg28.of(c.kind)
        if let cf = cloudCfg { sprites = WxSprites28.clouds(c.kind, cf) } else { sprites = [] }
        sunI = Self.sunIntensity(c)
        makeRays()
        makeGhosts()
        let sI: Double = sunI
        streak = wxGrad28([(0, WxRGB28(215, 232, 255), 0.32 * sI), (0.4, WxRGB28(200, 222, 255), 0.08 * sI), (1, WxRGB28(200, 222, 255), 0)])
        sg = nil
        sgKey = -1
    }

    private static func sunIntensity(_ c: WxFxCfg28) -> Double {
        if c.kind == "sun" { return 1 }
        if c.kind == "part" { return 0.95 }
        if c.day && c.kind == "clouds" { return 0.3 }
        if c.day && c.kind == "fog" { return 0.22 }
        return 0
    }

    private func makeRays() {
        var list: [WxRay28] = []
        for i in 0..<6 {
            list.append(WxRay28(a: Double(i) / 6.0 * 2 * Double.pi + 0.35, l: 1.15, w: 2.2, s: 0.3, o: Double(i), al: 0.9))
        }
        for _ in 0..<54 {
            list.append(WxRay28(a: wxR28(0, 2 * Double.pi), l: wxR28(0.18, 0.85), w: wxR28(0.5, 1.5), s: wxR28(0.2, 0.8), o: wxR28(0, 2 * Double.pi), al: wxR28(0.25, 0.7)))
        }
        rays = list
    }

    /// Svake sekskantede linse-refleksjoner (GH i designet).
    private func makeGhosts() {
        let I: Double = sunI
        let spec: [(Double, Double, WxRGB28, Double)] = [
            (0.32, 0.018, WxRGB28(190, 255, 220), 0.09), (0.58, 0.042, WxRGB28(170, 210, 255), 0.055),
            (0.78, 0.011, WxRGB28(255, 255, 255), 0.14), (1.12, 0.068, WxRGB28(205, 180, 255), 0.04),
            (1.4, 0.028, WxRGB28(255, 222, 170), 0.07), (1.72, 0.1, WxRGB28(160, 220, 255), 0.028),
        ]
        var list: [WxGhost28] = []
        for s in spec {
            let g: Gradient = wxGrad28([(0, s.2, s.3 * 0.5 * I), (0.8, s.2, s.3 * I), (1, s.2, s.3 * 0.3 * I)])
            list.append(WxGhost28(f: s.0, r: s.1, grad: g, line: s.2.color(s.3 * 0.9 * I)))
        }
        ghosts = list
    }

    private func newGlass(top: Bool) -> WxGlass28 {
        var tr: [CGPoint] = []
        tr.reserveCapacity(28)
        return WxGlass28(x: wxR28(0, W), y: top ? wxR28(-20, 0) : wxR28(0, H), r: wxR28(1.8, 5.2), v: 0, sl: false, tr: tr)
    }

    private func resetGlass(_ i: Int) {
        glass[i].x = wxR28(0, W)
        glass[i].y = wxR28(-20, 0)
        glass[i].r = wxR28(1.8, 5.2)
        glass[i].v = 0
        glass[i].sl = false
        glass[i].tr.removeAll(keepingCapacity: true)
    }

    /// Ny størrelse: lag partiklene for denne værtypen.
    private func resize(_ w: Double, _ h: Double) {
        W = w
        H = h
        m = Swift.min(w, h)
        guard let c = cfg else { return }
        let k: String = c.kind
        stars = (k == "stars" || k == "partn") ? makeStars() : []
        drops = k == "rain" ? makeDrops(c.heavy) : []
        glass = []
        if k == "rain" {
            for _ in 0..<(c.heavy ? 28 : 18) { glass.append(newGlass(top: false)) }
        }
        flakes = k == "snow" ? makeFlakes() : []
        clouds = makeClouds()
        fogs = k == "fog" ? makeFogs() : []
        motes = makeMotes()
    }

    private func makeStars() -> [WxStar28] {
        let n: Int = Int((W * H / 2200).rounded())
        var list: [WxStar28] = []
        list.reserveCapacity(n)
        for _ in 0..<n {
            let q: Double = Double.random(in: 0..<1)
            let col: WxRGB28 = q < 0.15 ? WxRGB28(200, 215, 255) : (q < 0.235 ? WxRGB28(255, 235, 205) : WxRGB28.white)
            let glint: Bool = Double.random(in: 0..<1) < 0.06
            list.append(WxStar28(x: wxR28(0, W), y: wxR28(0, H * 0.72), r: wxR28(0.35, 1.5), a: wxR28(0.3, 1), s: wxR28(0.4, 1.8), o: wxR28(0, 2 * Double.pi), g: glint, c: col))
        }
        return list
    }

    private func makeDrops(_ heavy: Bool) -> [WxDrop28] {
        let n: Int = heavy ? 320 : 180
        let lens: [Double] = [10, 18, 30]
        let vels: [Double] = [700, 1000, 1450]
        var list: [WxDrop28] = []
        list.reserveCapacity(n)
        for _ in 0..<n {
            let z: Int = Double.random(in: 0..<1) < 0.4 ? 0 : (Double.random(in: 0..<1) < 0.6 ? 1 : 2)
            let end: Double = z == 2 ? wxR28(0.82, 1) * H : H + 40
            list.append(WxDrop28(z: z, x: wxR28(-H * 0.2, W), y: wxR28(-H, H), l: lens[z] * wxR28(0.8, 1.2), v: vels[z] * wxR28(0.9, 1.1), end: end))
        }
        return list
    }

    private func makeFlakes() -> [WxFlake28] {
        let n: Int = Swift.max(90, Int((W * H / 3000).rounded()))
        let rs: [Double] = [1.3, 2.3, 3.8]
        let vs: [Double] = [18, 34, 62]
        let ams: [Double] = [6, 12, 22]
        var list: [WxFlake28] = []
        list.reserveCapacity(n + 7)
        for _ in 0..<n {
            let z: Int = Double.random(in: 0..<1) < 0.45 ? 0 : (Double.random(in: 0..<1) < 0.65 ? 1 : 2)
            list.append(WxFlake28(z: z, bx: wxR28(0, W), y: wxR28(-H, H), r: rs[z] * wxR28(0.8, 1.3), v: vs[z] * wxR28(0.8, 1.2), am: ams[z], f: wxR28(0.3, 0.8), ph: wxR28(0, 2 * Double.pi)))
        }
        // Store, uskarpe nærflak.
        for _ in 0..<7 {
            list.append(WxFlake28(z: 3, bx: wxR28(0, W), y: wxR28(-H, H), r: wxR28(7, 13), v: wxR28(80, 110), am: 30, f: wxR28(0.2, 0.4), ph: wxR28(0, 2 * Double.pi)))
        }
        return list
    }

    private func makeClouds() -> [WxCloud28] {
        guard let cf = cloudCfg, !sprites.isEmpty else { return [] }
        var list: [WxCloud28] = []
        for i in 0..<cf.n {
            let z: Double = (Double(i) + 0.5) / Double(cf.n)
            let w: Double = wxR28(cf.w.0, cf.w.1) * W * (0.6 + 0.5 * z)
            let a: Double = wxR28(cf.a.0, cf.a.1) * (0.6 + 0.4 * z)
            list.append(WxCloud28(z: z, s: i % sprites.count, x: wxR28(-0.3, 1) * W, y: wxR28(cf.y.0, cf.y.1) * H, w: w, a: a, v: 4 + 15 * z, ph: wxR28(0, 2 * Double.pi)))
        }
        return list
    }

    private func makeFogs() -> [WxFog28] {
        var list: [WxFog28] = []
        for i in 0..<9 {
            let z: Double = Double(i) / 8.0
            let dir: Double = i % 2 == 1 ? 1 : -1
            list.append(WxFog28(z: z, y: wxR28(0.1, 1.05) * H, w: wxR28(1.3, 2.2) * W, hr: wxR28(0.16, 0.28), v: (4 + 11 * z) * dir, a: 0.05 + 0.07 * z, ph: wxR28(0, 2 * Double.pi), x: wxR28(-1, 0.2) * W))
        }
        return list
    }

    private func makeMotes() -> [WxMote28] {
        var list: [WxMote28] = []
        for _ in 0..<16 {
            list.append(WxMote28(dx: wxR28(-0.6, 0.6), dy: wxR28(-0.1, 0.7), r: wxR28(1.5, 5), a: wxR28(0.1, 0.35), s: wxR28(0.2, 0.6), o: wxR28(0, 2 * Double.pi)))
        }
        return list
    }

    /* ---------- Ramme ---------- */

    func render(_ ctx: inout GraphicsContext, size: CGSize, now: Double, still: Bool, sunF sf: Double, cfg c: WxFxCfg28) {
        if cfg != c { configure(c, now) }
        let w: Double = Double(size.width)
        let h: Double = Double(size.height)
        if w < 1 || h < 1 { return }
        if abs(w - W) > 0.5 || abs(h - H) > 0.5 { resize(w, h) }
        sunF = sf
        let dt: Double = still ? 0 : Swift.min(0.05, Swift.max(0, now - last))
        last = now
        let t: Double = now - t0
        if !still, let p = WxMotion28.shared.tilt() {
            tx = Double(p.x)
            ty = Double(p.y)
        }
        let ease: Double = Swift.min(1, dt * 2.5)
        px += (tx - px) * ease
        py += (ty - py) * ease
        let k: String = c.kind
        if k == "stars" || k == "partn" { drawNight(&ctx, t: t, now: now, dt: dt, still: still) }
        if k == "sun" || k == "part" {
            drawSun(&ctx, t: t, full: true)
        } else if sunI > 0 {
            drawSun(&ctx, t: t, full: false)
        }
        drawClouds(&ctx, t: t, dt: dt)
        if k == "rain" {
            drawRain(&ctx, dt: dt)
            drawGlass(&ctx, dt: dt)
            if c.thunder && !still { drawThunder(&ctx, t: t, now: now, dt: dt) }
        }
        if k == "snow" { drawSnow(&ctx, t: t, dt: dt) }
        if k == "fog" { drawFog(&ctx, t: t, dt: dt) }
    }

    private var full: Path { Path(CGRect(x: 0, y: 0, width: W, height: H)) }

    private func circle(_ x: Double, _ y: Double, _ r: Double) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    /* ---------- Natt ---------- */

    private func drawNight(_ ctx: inout GraphicsContext, t: Double, now: Double, dt: Double, still: Bool) {
        var mw: GraphicsContext = ctx
        let R: Double = Swift.max(W, H) * 0.7
        mw.translateBy(x: W * 0.55 + px * 4, y: H * 0.25)
        mw.rotate(by: .radians(-0.6))
        mw.scaleBy(x: 1, y: 0.22)
        mw.fill(circle(0, 0, R), with: .radialGradient(Self.milky, center: .zero, startRadius: 0, endRadius: R))
        for s in stars { drawStar(&ctx, s, t: t) }
        if still { return }
        if shoot == nil && now > nextShoot {
            shoot = WxShoot28(x: wxR28(0.3, 1) * W, y: wxR28(0.03, 0.28) * H, vx: -wxR28(520, 800), vy: wxR28(160, 280), l: 0, d: wxR28(0.6, 1))
        }
        guard var sh = shoot else { return }
        sh.l += dt
        drawShoot(&ctx, sh)
        if sh.l / sh.d >= 1 {
            shoot = nil
            nextShoot = now + wxR28(6, 15)
        } else {
            shoot = sh
        }
    }

    private func drawStar(_ ctx: inout GraphicsContext, _ s: WxStar28, t: Double) {
        let tw: Double = 0.55 + 0.45 * sin(t * s.s + s.o)
        let x: Double = s.x + px * 3
        let y: Double = s.y + py * 2
        ctx.fill(circle(x, y, s.r), with: .color(s.c.color(s.a * tw)))
        if !s.g { return }
        let L: Double = s.r * 7 * tw
        var p: Path = Path()
        p.move(to: CGPoint(x: x - L, y: y))
        p.addLine(to: CGPoint(x: x + L, y: y))
        p.move(to: CGPoint(x: x, y: y - L))
        p.addLine(to: CGPoint(x: x, y: y + L))
        ctx.stroke(p, with: .color(s.c.color(s.a * tw * 0.45)), lineWidth: 0.6)
    }

    private func drawShoot(_ ctx: inout GraphicsContext, _ sh: WxShoot28) {
        let f: Double = sh.l / sh.d
        let x: Double = sh.x + sh.vx * sh.l
        let y: Double = sh.y + sh.vy * sh.l
        let n: Double = hypot(sh.vx, sh.vy)
        let tl: Double = 120
        let ex: Double = x - sh.vx / n * tl
        let ey: Double = y - sh.vy / n * tl
        let a: Double = sin(Double.pi * Swift.min(1, f))
        var p: Path = Path()
        p.move(to: CGPoint(x: x, y: y))
        p.addLine(to: CGPoint(x: ex, y: ey))
        var c: GraphicsContext = ctx
        c.opacity = Swift.max(0, a)
        let sh2: GraphicsContext.Shading = .linearGradient(Self.shootG, startPoint: CGPoint(x: x, y: y), endPoint: CGPoint(x: ex, y: ey))
        c.stroke(p, with: sh2, style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
    }

    /* ---------- Sol ---------- */

    private func sunGrads(_ sf: Double) -> WxSunGrads28 {
        if let g = sg, abs(sf - sgKey) < 0.003 { return g }
        let I: Double = sunI
        let el: Double = sin(Double.pi * sf)
        let warm: Double = pow(1 - el, 1.5)
        let c: WxRGB28 = WxRGB28(255, 250, 238).mix(WxRGB28(255, 188, 128), warm)
        let wb: Double = Swift.max(0, (warm - 0.35) / 0.65)
        let glow: Gradient = wxGrad28([(0, c, 0.42 * I), (0.12, c, 0.2 * I), (0.4, c, 0.06 * I), (1, c, 0)])
        let band: Gradient = wxGrad28([(0, WxRGB28(255, 140, 80), 0), (0.3, WxRGB28(255, 140, 80), 0.2 * wb * I), (1, WxRGB28(255, 110, 90), 0)])
        let core: Gradient = wxGrad28([(0, WxRGB28.white, 0.5 * I), (0.3, c, 0.18 * I), (1, c, 0)])
        let ray: Gradient = wxGrad28([(0, WxRGB28.white, 0.55), (0.12, c, 0.22), (0.5, c, 0.05), (1, c, 0)])
        let disc: Gradient = wxGrad28([(0, WxRGB28.white, I), (0.46, WxRGB28(255, 254, 248), I), (0.56, c, 0.5 * I), (1, c, 0)])
        let made: WxSunGrads28 = WxSunGrads28(glow: glow, warmBand: band, core: core, ray: ray, disc: disc)
        sg = made
        sgKey = sf
        return made
    }

    private func drawSun(_ ctx: inout GraphicsContext, t: Double, full fullSun: Bool) {
        let sf: Double = sunF
        let el: Double = sin(Double.pi * sf)
        let warm: Double = pow(1 - el, 1.5)
        let cx: Double = W * (0.2 + 0.6 * sf) + px * 6
        let cy: Double = H * (0.16 - 0.1 * el) + py * 4
        let g: WxSunGrads28 = sunGrads(sf)
        var c: GraphicsContext = ctx
        c.blendMode = .plusLighter
        let center: CGPoint = CGPoint(x: cx, y: cy)
        let R: Double = Swift.max(W, H) * 1.05
        c.fill(full, with: .radialGradient(g.glow, center: center, startRadius: 0, endRadius: R))
        if warm > 0.35 {
            c.fill(full, with: .linearGradient(g.warmBand, startPoint: CGPoint(x: 0, y: cy - H * 0.1), endPoint: CGPoint(x: 0, y: H * 0.8)))
        }
        if fullSun {
            c.fill(circle(cx, cy, m * 0.4), with: .radialGradient(g.core, center: center, startRadius: 0, endRadius: m * 0.4))
            drawRays(c, t: t, cx: cx, cy: cy, grad: g.ray)
            drawStreak(c, cx: cx, cy: cy)
            drawGhosts(&c, cx: cx, cy: cy)
            drawMotes(&c, t: t, cx: cx, cy: cy)
        }
        let rd: Double = m * 0.045 * (1 + 0.2 * warm) * 2.1
        c.fill(circle(cx, cy, rd), with: .radialGradient(g.disc, center: center, startRadius: 0, endRadius: rd))
    }

    /// Sakte roterende stråler.
    private func drawRays(_ base: GraphicsContext, t: Double, cx: Double, cy: Double, grad: Gradient) {
        var r: GraphicsContext = base
        r.translateBy(x: cx, y: cy)
        r.rotate(by: .radians(t * 0.008))
        let L: Double = m * 0.95
        let i0: Double = m * 0.035
        let shade: GraphicsContext.Shading = .radialGradient(grad, center: .zero, startRadius: 0, endRadius: L)
        for ray in rays {
            let len: Double = L * ray.l * (0.82 + 0.18 * sin(t * ray.s + ray.o))
            let al: Double = ray.al * sunI * (0.75 + 0.25 * sin(t * ray.s * 1.7 + ray.o))
            var p: Path = Path()
            p.move(to: CGPoint(x: cos(ray.a) * i0, y: sin(ray.a) * i0))
            p.addLine(to: CGPoint(x: cos(ray.a) * len, y: sin(ray.a) * len))
            r.opacity = Swift.max(0, al)
            r.stroke(p, with: shade, style: StrokeStyle(lineWidth: ray.w, lineCap: .round))
        }
    }

    /// Horisontal lysstripe gjennom sola.
    private func drawStreak(_ base: GraphicsContext, cx: Double, cy: Double) {
        var s: GraphicsContext = base
        let R: Double = W * 0.75
        s.translateBy(x: cx, y: cy)
        s.scaleBy(x: 1, y: 0.028)
        s.fill(circle(0, 0, R), with: .radialGradient(streak, center: .zero, startRadius: 0, endRadius: R))
    }

    private func drawGhosts(_ c: inout GraphicsContext, cx: Double, cy: Double) {
        let ax: Double = W * 0.5 - px * 22 - cx
        let ay: Double = H * 0.5 - py * 22 - cy
        for gh in ghosts {
            let x: Double = cx + ax * gh.f
            let y: Double = cy + ay * gh.f
            let rr: Double = m * gh.r
            var p: Path = Path()
            for j in 0..<6 {
                let an: Double = Double(j) / 6.0 * 2 * Double.pi + 0.5
                let pt: CGPoint = CGPoint(x: x + cos(an) * rr, y: y + sin(an) * rr)
                if j == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            p.closeSubpath()
            c.fill(p, with: .radialGradient(gh.grad, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: rr))
            c.stroke(p, with: .color(gh.line), lineWidth: 1)
        }
    }

    /// Lysstøv rundt sola.
    private func drawMotes(_ c: inout GraphicsContext, t: Double, cx: Double, cy: Double) {
        for i in motes.indices {
            motes[i].dy -= 0.004 / 60.0
            if motes[i].dy < -0.6 { motes[i].dy = 0.7 }
            let o: WxMote28 = motes[i]
            let x: Double = cx + o.dx * m + sin(t * o.s + o.o) * 10
            let y: Double = cy + o.dy * m + cos(t * o.s * 0.8 + o.o) * 8
            let d: Double = hypot(x - cx, y - cy) / (m * 0.7)
            let a: Double = o.a * sunI * Swift.max(0, 1 - d) * (0.6 + 0.4 * sin(t * o.s * 2 + o.o))
            if a <= 0 { continue }
            c.opacity = a
            let rr: Double = o.r * 2
            c.fill(circle(x, y, rr), with: .radialGradient(Self.moteG, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: rr))
        }
        c.opacity = 1
    }

    /* ---------- Skyer ---------- */

    private func drawClouds(_ ctx: inout GraphicsContext, t: Double, dt: Double) {
        if clouds.isEmpty { return }
        let base: GraphicsContext = ctx
        let imgs: [GraphicsContext.ResolvedImage] = sprites.map { (img: UIImage) -> GraphicsContext.ResolvedImage in base.resolve(Image(uiImage: img)) }
        for i in clouds.indices {
            clouds[i].x += clouds[i].v * dt
            if clouds[i].x > W { clouds[i].x = -clouds[i].w }
            let c: WxCloud28 = clouds[i]
            let hh: Double = c.w * 0.42 * (1 + 0.03 * sin(t * 0.2 + c.ph))
            let y: Double = c.y + sin(t * 0.12 + c.ph) * 4 + py * c.z * 8
            let x: Double = c.x + px * c.z * 16
            ctx.opacity = c.a
            ctx.draw(imgs[c.s], in: CGRect(x: x, y: y, width: c.w, height: hh))
        }
        ctx.opacity = 1
    }

    /* ---------- Regn ---------- */

    private static let rainLayers: [(Double, Color)] = [
        (0.7, WxRGB28(205, 218, 238).color(0.12)), (1, WxRGB28(212, 224, 242).color(0.2)), (1.5, WxRGB28(225, 234, 250).color(0.3)),
    ]

    private func drawRain(_ ctx: inout GraphicsContext, dt: Double) {
        let S: Double = 0.14
        for z in 0..<3 {
            var p: Path = Path()
            let ox: Double = px * Double(z + 1) * 4
            for i in drops.indices where drops[i].z == z {
                drops[i].y += drops[i].v * dt
                drops[i].x += drops[i].v * dt * S
                if drops[i].y > drops[i].end {
                    if z == 2 && spl.count < 50 { spl.append(WxSplash28(x: drops[i].x, y: drops[i].end, r: 1, a: 0.4)) }
                    drops[i].y = wxR28(-90, -10)
                    drops[i].x = wxR28(-H * S, W)
                }
                let d: WxDrop28 = drops[i]
                p.move(to: CGPoint(x: d.x + ox, y: d.y))
                p.addLine(to: CGPoint(x: d.x + ox - d.l * S, y: d.y - d.l))
            }
            let layer: (Double, Color) = Self.rainLayers[z]
            ctx.stroke(p, with: .color(layer.1), style: StrokeStyle(lineWidth: layer.0, lineCap: .round))
        }
        drawSplashes(&ctx, dt: dt)
        ctx.fill(full, with: .linearGradient(Self.rainMist, startPoint: CGPoint(x: 0, y: H * 0.6), endPoint: CGPoint(x: 0, y: H)))
    }

    private func drawSplashes(_ ctx: inout GraphicsContext, dt: Double) {
        var i: Int = spl.count - 1
        while i >= 0 {
            spl[i].r += dt * 36
            spl[i].a -= dt * 1.3
            if spl[i].a <= 0 {
                spl.remove(at: i)
            } else {
                let s: WxSplash28 = spl[i]
                let rect: CGRect = CGRect(x: s.x - s.r, y: s.y - s.r * 0.28, width: s.r * 2, height: s.r * 0.56)
                ctx.stroke(Path(ellipseIn: rect), with: .color(WxRGB28(225, 234, 248).color(s.a)), lineWidth: 1)
            }
            i -= 1
        }
    }

    /// Dråper på «glasset» som av og til glir ned og legger igjen et spor.
    private func drawGlass(_ ctx: inout GraphicsContext, dt: Double) {
        let dark: Color = WxRGB28(18, 26, 40).color(0.16)
        let trail: Color = Color.white.opacity(0.07)
        let rim: Color = Color.white.opacity(0.16)
        for i in glass.indices {
            if !glass[i].sl && Double.random(in: 0..<1) < dt * 0.06 { glass[i].sl = true }
            if glass[i].sl {
                glass[i].v = Swift.min(160, glass[i].v + dt * wxR28(40, 160))
                glass[i].y += glass[i].v * dt
                glass[i].x += wxR28(-0.4, 0.4)
                glass[i].tr.append(CGPoint(x: glass[i].x, y: glass[i].y))
                if glass[i].tr.count > 26 { glass[i].tr.removeFirst() }
                if glass[i].y > H + 10 {
                    resetGlass(i)
                    continue
                }
            }
            let g: WxGlass28 = glass[i]
            if g.tr.count > 1 {
                var p: Path = Path()
                p.addLines(g.tr)
                ctx.stroke(p, with: .color(trail), lineWidth: g.r * 0.7)
            }
            let body: CGRect = CGRect(x: g.x - g.r, y: g.y - g.r * 1.1, width: g.r * 2, height: g.r * 2.2)
            ctx.fill(Path(ellipseIn: body), with: .color(dark))
            let hx: Double = g.x - g.r * 0.3
            let hy: Double = g.y - g.r * 0.4
            let hr: Double = g.r * 0.6
            ctx.fill(circle(hx, hy, hr), with: .radialGradient(Self.glassHi, center: CGPoint(x: hx, y: hy), startRadius: 0, endRadius: hr))
            let tf: CGAffineTransform = CGAffineTransform(a: g.r, b: 0, c: 0, d: g.r * 1.1, tx: g.x, ty: g.y)
            ctx.stroke(Self.unitArc.applying(tf), with: .color(rim), lineWidth: 0.7)
        }
    }

    /* ---------- Torden ---------- */

    private func boltSeg(_ x0: Double, _ y0: Double, _ n: Int, _ dx: Double, _ yMax: Double) -> [CGPoint] {
        var x: Double = x0
        var y: Double = y0
        var pts: [CGPoint] = [CGPoint(x: x, y: y)]
        var i: Int = 0
        while i < n && y < yMax {
            y += wxR28(16, 34)
            x += wxR28(-20, 20) + dx
            pts.append(CGPoint(x: x, y: y))
            i += 1
        }
        return pts
    }

    /// Hovedlyn med to forgreninger.
    private func makeBolt() -> [[CGPoint]] {
        let main: [CGPoint] = boltSeg(wxR28(0.15, 0.85) * W, -10, 40, wxR28(-3, 3), H * wxR28(0.45, 0.7))
        var out: [[CGPoint]] = [main]
        if main.count > 4 {
            for _ in 0..<2 {
                let idx: Int = Swift.min(main.count - 1, Int(wxR28(2, Double(main.count - 2))))
                let s: CGPoint = main[idx]
                out.append(boltSeg(Double(s.x), Double(s.y), Int(wxR28(3, 7)), wxR28(-12, 12), H))
            }
        }
        return out
    }

    private func drawThunder(_ ctx: inout GraphicsContext, t: Double, now: Double, dt: Double) {
        if now > nextBolt {
            bolt = makeBolt()
            flash = 1
            nextBolt = now + wxR28(4.5, 11)
        }
        if flash <= 0 { return }
        flash -= dt * 2
        let fl: Double = flash > 0.55 ? (sin(t * 55) > 0 ? 1 : 0.35) : 1
        let a: Double = Swift.max(0, flash) * fl
        ctx.fill(full, with: .color(WxRGB28(215, 225, 255).color(a * 0.26)))
        if bolt.isEmpty { return }
        var b: GraphicsContext = ctx
        b.addFilter(.shadow(color: WxRGB28(190, 210, 255).color(0.95), radius: 8))
        for (i, pts) in bolt.enumerated() {
            var p: Path = Path()
            p.addLines(pts)
            let style: StrokeStyle = StrokeStyle(lineWidth: i == 0 ? 2.2 : 1, lineCap: .round, lineJoin: .round)
            b.stroke(p, with: .color(Color.white.opacity(a)), style: style)
        }
    }

    /* ---------- Snø ---------- */

    private static let snowAlpha: [Double] = [0.45, 0.7, 0.9, 0.28]
    private static let snowDrift: [Double] = [3, 6, 11, 18]

    private func drawSnow(_ ctx: inout GraphicsContext, t: Double, dt: Double) {
        let img: GraphicsContext.ResolvedImage = ctx.resolve(Image(uiImage: WxSprites28.flake))
        for i in flakes.indices {
            let z: Int = flakes[i].z
            flakes[i].y += flakes[i].v * dt
            flakes[i].bx += Self.snowDrift[z] * dt
            if flakes[i].y > H + 20 {
                flakes[i].y = -20
                flakes[i].bx = wxR28(0, W)
            }
            if flakes[i].bx > W + 30 { flakes[i].bx = -30 }
            let f: WxFlake28 = flakes[i]
            let x: Double = f.bx + sin(t * f.f + f.ph) * f.am + px * Double(f.z + 1) * 5
            let r: Double = f.r * 2
            ctx.opacity = Self.snowAlpha[z]
            ctx.draw(img, in: CGRect(x: x - r, y: f.y - r, width: r * 2, height: r * 2))
        }
        ctx.opacity = 1
        ctx.fill(full, with: .linearGradient(Self.snowGround, startPoint: CGPoint(x: 0, y: H * 0.75), endPoint: CGPoint(x: 0, y: H)))
    }

    /* ---------- Tåke ---------- */

    private func drawFog(_ ctx: inout GraphicsContext, t: Double, dt: Double) {
        let img: GraphicsContext.ResolvedImage = ctx.resolve(Image(uiImage: WxSprites28.band))
        for i in fogs.indices {
            fogs[i].x += fogs[i].v * dt
            if fogs[i].v > 0 && fogs[i].x > W { fogs[i].x = -fogs[i].w }
            if fogs[i].v < 0 && fogs[i].x < -fogs[i].w { fogs[i].x = W }
            let b: WxFog28 = fogs[i]
            let hh: Double = b.w * b.hr
            let y: Double = b.y + sin(t * 0.13 + b.ph) * 10 - hh / 2
            let ox: Double = px * b.z * 14
            let twin: Double = (b.v > 0 ? -b.w : b.w) * 0.98
            ctx.opacity = b.a
            ctx.draw(img, in: CGRect(x: b.x + ox, y: y, width: b.w, height: hh))
            ctx.draw(img, in: CGRect(x: b.x + ox + twin, y: y + 6, width: b.w, height: hh))
        }
        ctx.opacity = 1
        ctx.fill(full, with: .linearGradient(Self.fogGround, startPoint: CGPoint(x: 0, y: H * 0.35), endPoint: CGPoint(x: 0, y: H)))
    }
}
